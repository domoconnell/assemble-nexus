import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { tenancy, tenancy_invoice } from "@/db/schema/entities/tenancy.js";
import { psp_intent } from "@/db/schema/entities/psp_intent.js";
import { listActiveVenues } from "@/db/queries/venue.js";
import { getStripeSettings } from "@/db/queries/settings.js";
import { finaliseTicketOrder } from "@/lib/ticketing/finalize.js";
import { finaliseBookingDeposit, finaliseBookingBalance } from "@/lib/booking/finalize.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver. Stripe POSTs events here (we register the URL
 * in the Stripe Dashboard). We verify the request really came from
 * Stripe using HMAC-SHA256 against the stored webhook signing secret,
 * then act on the event types we care about:
 *
 *   payment_intent.succeeded
 *     - Bacs charges take 3-5 business days to settle. When they do,
 *       Stripe fires this event with the PI's metadata still attached.
 *       We use `metadata.tenancy_invoice_id` to find the right invoice
 *       and flip its status to `paid` (with the cleared timestamp).
 *
 *   payment_intent.payment_failed
 *     - Same metadata path: we surface the failure reason on the
 *       tenancy_invoice notes so the admin sees why it didn't clear.
 *
 * Multi-venue: each venue stores its own webhook signing secret in
 * Settings → Payments. We try every venue's secret in turn; first one
 * that verifies wins. With 1-2 venues this is trivially cheap.
 *
 * Idempotency: Stripe retries on non-2xx and may re-deliver after
 * timeouts. Our handlers are no-ops if the invoice is already paid /
 * already marked failed, so re-delivery is safe.
 */
export async function POST(request) {
	const sigHeader = request.headers.get("stripe-signature");
	if (!sigHeader) {
		return new Response("Missing Stripe-Signature header", { status: 400 });
	}

	// Stripe signature verification requires the EXACT raw bytes - we
	// can't parse JSON first and re-serialise.
	const rawBody = await request.text();

	const verified = await verifyAgainstAnyVenueSecret(rawBody, sigHeader);
	if (!verified) {
		return new Response("Bad signature", { status: 400 });
	}

	let event;
	try {
		event = JSON.parse(rawBody);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	try {
		switch (event.type) {
			case "payment_intent.succeeded":
				await handlePaymentIntentSucceeded(event);
				break;
			case "payment_intent.payment_failed":
				await handlePaymentIntentFailed(event);
				break;
			case "checkout.session.completed":
				await handleCheckoutSessionCompleted(event);
				break;
			case "mandate.updated":
				await handleMandateUpdated(event);
				break;
			// Other event types are accepted (200) but ignored - that way
			// we don't have to enumerate the full set in Stripe's UI to
			// avoid retries.
			default:
				break;
		}
	} catch (err) {
		console.error("[stripe-webhook]", event.type, err);
		return new Response("Handler error", { status: 500 });
	}

	return Response.json({ received: true });
}

async function verifyAgainstAnyVenueSecret(rawBody, signatureHeader) {
	const venues = await listActiveVenues();
	for (const v of venues) {
		const settings = await getStripeSettings(v.id);
		const secret = settings?.webhook_signing_secret;
		if (!secret) continue;
		if (verifyStripeSignature(rawBody, signatureHeader, secret)) return true;
	}
	return false;
}

/**
 * Verify a Stripe webhook signature header per
 * https://docs.stripe.com/webhooks#verify-manually. Header looks like:
 *   t=1614354155,v1=abc123…,v1=def456…
 * We compute HMAC-SHA256(`${t}.${rawBody}`, secret) and compare against
 * the v1 hashes in constant time. Also rejects timestamps older than
 * 5 minutes to mitigate replay attacks.
 */
function verifyStripeSignature(rawBody, header, secret) {
	const parts = header.split(",").reduce((acc, kv) => {
		const [k, v] = kv.trim().split("=");
		if (!acc[k]) acc[k] = [];
		acc[k].push(v);
		return acc;
	}, {});
	const timestamp = Number(parts.t?.[0]);
	const signatures = parts.v1 ?? [];
	if (!timestamp || signatures.length === 0) return false;

	const ageSec = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
	if (ageSec > 5 * 60) return false; // 5-minute tolerance

	const expected = crypto
		.createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`, "utf8")
		.digest("hex");

	const expectedBuf = Buffer.from(expected, "utf8");
	return signatures.some((s) => {
		const got = Buffer.from(s, "utf8");
		return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf);
	});
}

async function handlePaymentIntentSucceeded(event) {
	const pi = event?.data?.object;
	if (!pi) return;

	// Tenancy invoices: identified by metadata.tenancy_invoice_id on the
	// payment intent we created when issuing the Bacs charge. Flip
	// status to paid using the event's settlement timestamp.
	const tenancyInvoiceId = pi.metadata?.tenancy_invoice_id;
	if (tenancyInvoiceId) {
		const [inv] = await db
			.select()
			.from(tenancy_invoice)
			.where(eq(tenancy_invoice.id, tenancyInvoiceId))
			.limit(1);
		if (inv && inv.status !== "paid") {
			const paid_at = event.created ? new Date(event.created * 1000) : new Date();
			await db
				.update(tenancy_invoice)
				.set({ status: "paid", paid_at })
				.where(eq(tenancy_invoice.id, inv.id));
		}
		return;
	}

	// Card payments for ticket orders / booking deposits / balances:
	// look up the psp_intent row by the Stripe id and dispatch to the
	// matching finalise helper. All idempotent - finalisers no-op if
	// the underlying entity is already in its terminal state.
	const [row] = await db
		.select()
		.from(psp_intent)
		.where(and(eq(psp_intent.provider, "stripe"), eq(psp_intent.external_id, pi.id)))
		.limit(1);
	if (!row) return;

	// Mark the psp_intent as succeeded so other code paths reading the
	// row see the right state without having to consult Stripe.
	if (row.status !== "succeeded") {
		await db
			.update(psp_intent)
			.set({ status: "succeeded" })
			.where(eq(psp_intent.id, row.id));
	}

	if (row.ticket_order_id) {
		try {
			await finaliseTicketOrder(row.ticket_order_id, { paymentRef: pi.id });
		} catch (err) {
			console.error("[stripe-webhook] finaliseTicketOrder", err);
			throw err;
		}
		return;
	}
	if (row.booking_id) {
		const kind = row.metadata?.kind ?? "deposit";
		try {
			if (kind === "balance") {
				await finaliseBookingBalance(row.booking_id, {
					paymentRef: pi.id,
					amountPaidCents: row.amount_cents,
				});
			} else {
				await finaliseBookingDeposit(row.booking_id, {
					paymentRef: pi.id,
					amountPaidCents: row.amount_cents,
				});
			}
		} catch (err) {
			console.error("[stripe-webhook] finaliseBooking", err);
			throw err;
		}
	}
}

async function handlePaymentIntentFailed(event) {
	const pi = event?.data?.object;
	if (!pi) return;
	const invoiceId = pi.metadata?.tenancy_invoice_id;
	if (!invoiceId) return;

	const [inv] = await db
		.select()
		.from(tenancy_invoice)
		.where(eq(tenancy_invoice.id, invoiceId))
		.limit(1);
	if (!inv) return;

	const reason =
		pi.last_payment_error?.message ||
		pi.last_payment_error?.code ||
		"Stripe reported a payment failure";
	const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
	const note = `[${stamp}] Bacs charge failed: ${reason}`;
	const merged = inv.notes ? `${inv.notes}\n${note}` : note;

	await db
		.update(tenancy_invoice)
		.set({ notes: merged })
		.where(eq(tenancy_invoice.id, inv.id));
}

/**
 * Tenant-completed Stripe Checkout (`mode: setup`) for a Direct Debit
 * mandate. The synchronous /done page already handles this when the
 * browser redirects through it, but a closed tab leaves the mandate
 * unsaved on our side - this webhook is the belt to that braces.
 *
 * Idempotent: if the tenancy already has a mandate saved we skip.
 * We look up the venue's Stripe key (per-venue) and expand the setup_intent
 * server-side to read the resulting payment_method + customer.
 */
async function handleCheckoutSessionCompleted(event) {
	const session = event?.data?.object;
	if (!session) return;
	if (session.mode !== "setup") return; // only DD-mandate setup sessions
	const tenancyId = session.metadata?.tenancy_id;
	if (!tenancyId) return;

	const [t] = await db
		.select()
		.from(tenancy)
		.where(eq(tenancy.id, tenancyId))
		.limit(1);
	if (!t) return;
	if (t.direct_debit_ready_at && t.direct_debit_mandate_id) return; // already saved

	// Pull the setup_intent to get the resulting PaymentMethod id and the
	// customer id, both of which we need to charge later.
	const stripeSettings = await getStripeSettings(t.venue_id);
	const secretKey = stripeSettings?.secret_key;
	if (!secretKey) {
		console.error("[stripe-webhook] checkout.session.completed: no secret key for venue", t.venue_id);
		return;
	}

	const setupIntentId =
		typeof session.setup_intent === "string"
			? session.setup_intent
			: session.setup_intent?.id;
	if (!setupIntentId) return;

	const siRes = await fetch(
		`https://api.stripe.com/v1/setup_intents/${encodeURIComponent(setupIntentId)}`,
		{
			headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
			cache: "no-store",
		},
	);
	if (!siRes.ok) return;
	const setupIntent = await siRes.json().catch(() => null);
	if (!setupIntent || setupIntent.status !== "succeeded") return;

	const paymentMethodId = setupIntent.payment_method;
	const customerId = session.customer || setupIntent.customer;
	if (!paymentMethodId || !customerId) return;

	await db
		.update(tenancy)
		.set({
			stripe_customer_id: customerId,
			direct_debit_mandate_id: paymentMethodId,
			direct_debit_ready_at: new Date(),
		})
		.where(eq(tenancy.id, t.id));
}

/**
 * Stripe surfaces mandate state changes (e.g. tenant cancels the
 * Direct Debit at their bank, account closed, etc.) as `mandate.updated`
 * events. When the mandate moves to `inactive`, clear the tenancy's
 * saved mandate so the invoicer won't try to charge a dead mandate -
 * the admin can re-prompt for setup from the UI.
 *
 * Stripe's Mandate object links back to a PaymentMethod, which is what
 * we store in `tenancy.direct_debit_mandate_id`. So we match by that.
 */
async function handleMandateUpdated(event) {
	const mandate = event?.data?.object;
	if (!mandate) return;
	if (mandate.status !== "inactive") return; // active / pending - nothing to do

	const paymentMethodId = mandate.payment_method;
	if (!paymentMethodId) return;

	const [t] = await db
		.select()
		.from(tenancy)
		.where(eq(tenancy.direct_debit_mandate_id, paymentMethodId))
		.limit(1);
	if (!t) return;

	await db
		.update(tenancy)
		.set({
			direct_debit_mandate_id: null,
			stripe_customer_id: null,
			direct_debit_ready_at: null,
		})
		.where(eq(tenancy.id, t.id));
}

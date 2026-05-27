import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { tenancy_invoice } from "@/db/schema/entities/tenancy.js";
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

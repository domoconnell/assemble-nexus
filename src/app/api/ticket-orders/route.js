import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { json } from "@/utils/auth/auth-guard.js";
import { db } from "@/db/index.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { ticket_order_line } from "@/db/schema/entities/ticket_order_line.js";
import { customer as customerTable } from "@/db/schema/entities/customer.js";
import { user as userTable } from "@/db/schema/entities/user.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role as roleTable } from "@/db/schema/entities/role.js";
import { quoteTicketOrder } from "@/lib/ticketing/pricing.js";
import { generateOrderReference } from "@/lib/ticketing/codes.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getActivePsp } from "@/lib/psp/index.js";
import { getServerSession } from "@/utils/auth/server-guard.js";
import { startAutoSession, findUserByEmail } from "@/utils/auth/auto-session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddonSchema = z.object({
	addon_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const TicketEntrySchema = z.object({
	ticket_type_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1).max(500),
	addons: z.array(AddonSchema).optional().default([]),
});

const NewBuyerSchema = z.object({
	first_name: z.string().min(1).max(120),
	last_name: z.string().min(1).max(120),
	email: z.string().email().max(254),
	phone: z.string().max(80).optional().nullable(),
});

const IdentitySchema = z.discriminatedUnion("mode", [
	z.object({ mode: z.literal("session") }),
	z.object({ mode: z.literal("new_user"), new_user: NewBuyerSchema }),
]);

const BodySchema = z.object({
	event_id: z.string().uuid(),
	cart: z.object({
		tickets: z.array(TicketEntrySchema).min(1).max(40),
	}),
	codes: z.array(z.string().max(80)).optional().default([]),
	customer_covers_fee: z.coerce.boolean().optional().default(false),
	identity: IdentitySchema,
});

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "Invalid JSON" });
	}
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return json(400, { error: "Invalid request", issues: parsed.error.issues });
	}

	const venue = await requireCurrentVenue();

	// Re-price server-side. Client values are advisory only.
	const quote = await quoteTicketOrder({
		eventId: parsed.data.event_id,
		cart: parsed.data.cart,
		codes: parsed.data.codes,
		customerCoversFeeOptIn: parsed.data.customer_covers_fee,
	});
	if (quote?.error) return json(400, { error: quote.error });
	if (quote.occupancy?.over_capacity) {
		return json(409, {
			error: "This event no longer has enough places left.",
			occupancy: quote.occupancy,
		});
	}
	if ((quote.customer_total_cents ?? quote.total_cents) <= 0) {
		return json(400, { error: "Total must be greater than zero." });
	}

	// Resolve the buyer's user + customer row from the identity payload.
	// Two modes:
	//  - session: trust the existing session; reject if absent (dialog enforces this).
	//  - new_user: brand-new account; reject if email already exists (dialog
	//    would have routed them through magic-link instead). We create the
	//    user, generate a session, and return the cookie so the next page
	//    request is authenticated.
	let setCookieHeaders = [];
	let buyerUser = null;
	let buyerDetails = null;

	if (parsed.data.identity.mode === "session") {
		const session = await getServerSession();
		if (!session?.user) {
			return json(401, { error: "Sign in to complete your purchase." });
		}
		buyerUser = session.user;
		buyerDetails = {
			first_name: session.user.first_name ?? "",
			last_name: session.user.last_name ?? "",
			email: session.user.email,
			phone: session.user.mobile_number ?? null,
		};
	} else {
		// new_user mode
		const nu = parsed.data.identity.new_user;
		const existing = await findUserByEmail(nu.email);
		if (existing) {
			return json(409, {
				error:
					"An account already exists for that email - sign in with the magic link instead.",
			});
		}
		const [createdUser] = await db
			.insert(userTable)
			.values({
				first_name: nu.first_name.trim(),
				last_name: nu.last_name.trim(),
				email: nu.email.trim().toLowerCase(),
				mobile_number: nullify(nu.phone),
			})
			.returning();
		buyerUser = createdUser;
		buyerDetails = {
			first_name: nu.first_name,
			last_name: nu.last_name,
			email: nu.email.trim().toLowerCase(),
			phone: nu.phone ?? null,
		};
		// Assign the delegate role so future role-gated pages work.
		const [delegateRole] = await db
			.select({ id: roleTable.id })
			.from(roleTable)
			.where(eq(roleTable.key, "delegate"))
			.limit(1);
		if (delegateRole) {
			await db
				.insert(user_role)
				.values({ user_id: createdUser.id, role_id: delegateRole.id })
				.onConflictDoNothing();
		}
		const ua = request.headers.get("user-agent") ?? null;
		const ipAddress =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
		const session = await startAutoSession({
			userId: createdUser.id,
			ipAddress,
			userAgent: ua,
		});
		setCookieHeaders = session.setCookieHeaders;
	}

	// Reuse a customer row for this user if one already exists; otherwise create.
	let cust = null;
	if (buyerUser?.id) {
		const rows = await db
			.select()
			.from(customerTable)
			.where(
				and(
					eq(customerTable.user_id, buyerUser.id),
					isNull(customerTable.deletedAt),
				),
			)
			.limit(1);
		cust = rows[0] ?? null;
	}

	if (!cust) {
		[cust] = await db
			.insert(customerTable)
			.values({
				first_name: buyerDetails.first_name,
				last_name: buyerDetails.last_name,
				email: buyerDetails.email,
				phone: nullify(buyerDetails.phone),
				user_id: buyerUser?.id ?? null,
			})
			.returning();
	}

	// Create the order - retry on reference collision.
	let createdOrder = null;
	for (let attempt = 0; attempt < 5 && !createdOrder; attempt++) {
		const reference = generateOrderReference();
		try {
			[createdOrder] = await db
				.insert(ticket_order)
				.values({
					reference,
					event_id: parsed.data.event_id,
					customer_id: cust.id,
					status: "pending",
					subtotal_cents: quote.subtotal_cents,
					discount_cents: quote.discount_cents,
					vat_cents: quote.vat_cents,
					total_cents: quote.customer_total_cents ?? quote.total_cents,
					booking_fee_cents: quote.booking_fee?.cents ?? 0,
					booking_fee_borne_by: quote.booking_fee?.borne_by ?? "organiser",
					organiser_net_cents: quote.organiser_receives_cents ?? 0,
					stripe_fee_estimate_cents: quote.stripe_fee?.estimate_cents ?? 0,
				})
				.returning();
		} catch (err) {
			if (err?.code === "23505" || /duplicate/i.test(err?.message || "")) continue;
			throw err;
		}
	}
	if (!createdOrder) {
		return json(500, { error: "Could not generate a unique reference. Please try again." });
	}

	// Persist the line breakdown. Two passes so addon lines can point at their
	// parent ticket-line via parent_line_id.
	const lineIdByCartIndex = new Map();

	// Pass 1: ticket lines (standalone, post-bundle remainder)
	for (const line of quote.lines.filter((l) => l.kind === "ticket")) {
		const [row] = await db
			.insert(ticket_order_line)
			.values({
				ticket_order_id: createdOrder.id,
				kind: "ticket",
				ticket_type_id: line.ticket_type_id,
				name_snapshot: line.name_snapshot,
				quantity: line.quantity,
				unit_price_cents: line.unit_price_cents,
				vat_rate_x100_snapshot: line.vat_rate_x100_snapshot,
				vat_inclusive_snapshot: line.vat_inclusive_snapshot,
				vat_cents: line.vat_cents,
				line_total_cents: line.line_total_cents,
			})
			.returning();
		if (line.cart_index != null) lineIdByCartIndex.set(line.cart_index, row.id);
	}

	// Pass 2: addon lines (link to parent ticket via parent_line_id)
	for (const line of quote.lines.filter((l) => l.kind === "addon")) {
		const parentId = lineIdByCartIndex.get(line.parent_cart_index) ?? null;
		await db.insert(ticket_order_line).values({
			ticket_order_id: createdOrder.id,
			kind: "addon",
			addon_id: line.addon_id,
			parent_line_id: parentId,
			name_snapshot: line.name_snapshot,
			quantity: line.quantity,
			unit_price_cents: line.unit_price_cents,
			vat_rate_x100_snapshot: line.vat_rate_x100_snapshot,
			vat_inclusive_snapshot: line.vat_inclusive_snapshot,
			vat_cents: line.vat_cents,
			line_total_cents: line.line_total_cents,
		});
	}

	// Pass 3: bundle lines + zero-priced ticket children so finalize generates
	// tickets uniformly from kind="ticket" rows.
	for (const line of quote.lines.filter((l) => l.kind === "bundle")) {
		const [bundleRow] = await db
			.insert(ticket_order_line)
			.values({
				ticket_order_id: createdOrder.id,
				kind: "bundle",
				bundle_id: line.bundle_id,
				name_snapshot: line.name_snapshot,
				quantity: 1,
				unit_price_cents: line.unit_price_cents,
				vat_rate_x100_snapshot: line.vat_rate_x100_snapshot,
				vat_inclusive_snapshot: line.vat_inclusive_snapshot,
				vat_cents: line.vat_cents,
				line_total_cents: line.line_total_cents,
			})
			.returning();
		for (const item of line.items ?? []) {
			await db.insert(ticket_order_line).values({
				ticket_order_id: createdOrder.id,
				kind: "ticket",
				ticket_type_id: item.ticket_type_id,
				parent_line_id: bundleRow.id,
				quantity: item.quantity,
				unit_price_cents: 0,
				vat_rate_x100_snapshot: 0,
				vat_inclusive_snapshot: false,
				vat_cents: 0,
				line_total_cents: 0,
			});
		}
	}

	// Pass 4: discount lines (negative totals)
	for (const line of quote.lines.filter((l) => l.kind === "discount")) {
		await db.insert(ticket_order_line).values({
			ticket_order_id: createdOrder.id,
			kind: "discount",
			discount_id: line.discount_id,
			name_snapshot: line.name_snapshot,
			quantity: 1,
			unit_price_cents: line.unit_price_cents,
			vat_rate_x100_snapshot: 0,
			vat_inclusive_snapshot: false,
			vat_cents: 0,
			line_total_cents: line.line_total_cents,
		});
	}

	// Create a payment intent on the active PSP.
	const psp = await getActivePsp(venue.id);
	const intent = await psp.createPaymentIntent({
		amount_cents: quote.customer_total_cents ?? quote.total_cents,
		currency: "gbp",
		metadata: { ticket_order_id: createdOrder.id, reference: createdOrder.reference },
		ticket_order_id: createdOrder.id,
	});

	const response = json(201, {
		reference: createdOrder.reference,
		intent,
		provider: psp.key,
		publishable_key: psp.publishableKey ?? null,
	});
	for (const cookie of setCookieHeaders) {
		response.headers.append("Set-Cookie", cookie);
	}
	return response;
}

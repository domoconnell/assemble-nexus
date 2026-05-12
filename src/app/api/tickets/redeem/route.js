import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";
import { ticket } from "@/db/schema/entities/ticket.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { ticket_order_line } from "@/db/schema/entities/ticket_order_line.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const BodySchema = z.object({
	checkin_code: z.string().min(4).max(32),
	ticket_code: z.string().min(4).max(128),
});

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { status: "invalid", error: "Invalid JSON" });
	}
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return json(400, { status: "invalid", error: "Invalid request" });
	}

	const checkinCode = parsed.data.checkin_code.trim().toLowerCase();
	const ticketCode = parsed.data.ticket_code.trim();

	const [ev] = await db
		.select({ id: event.id, title: event.title })
		.from(event)
		.where(eq(event.checkin_code, checkinCode))
		.limit(1);
	if (!ev) return json(404, { status: "invalid", error: "Unknown check-in link" });

	const [row] = await db
		.select({
			ticket_id: ticket.id,
			ticket_status: ticket.status,
			ticket_used_at: ticket.used_at,
			holder_name: ticket.holder_name,
			ticket_type_label: ticket_order_line.name_snapshot,
			order_status: ticket_order.status,
			order_event_id: ticket_order.event_id,
			order_reference: ticket_order.reference,
		})
		.from(ticket)
		.innerJoin(ticket_order_line, eq(ticket_order_line.id, ticket.ticket_order_line_id))
		.innerJoin(ticket_order, eq(ticket_order.id, ticket_order_line.ticket_order_id))
		.where(eq(ticket.code, ticketCode))
		.limit(1);

	if (!row) {
		return json(404, { status: "invalid", error: "Ticket not found" });
	}
	if (row.order_event_id !== ev.id) {
		return json(409, { status: "wrong_event", error: "Ticket is for a different event" });
	}
	if (row.order_status !== "paid" && row.order_status !== "partially_refunded") {
		return json(409, {
			status: row.order_status === "refunded" ? "refunded" : "unpaid",
			error: `Order is ${row.order_status}`,
		});
	}
	if (row.ticket_status === "refunded" || row.ticket_status === "void") {
		return json(409, {
			status: "refunded",
			error: `Ticket is ${row.ticket_status}`,
		});
	}
	if (row.ticket_status === "used") {
		return json(200, {
			status: "already_used",
			ticket: {
				code: ticketCode,
				holder_name: row.holder_name,
				ticket_type: row.ticket_type_label,
				used_at: row.ticket_used_at,
				order_reference: row.order_reference,
			},
		});
	}

	const usedAt = new Date();
	await db
		.update(ticket)
		.set({ status: "used", used_at: usedAt })
		.where(eq(ticket.id, row.ticket_id));

	return json(200, {
		status: "ok",
		ticket: {
			code: ticketCode,
			holder_name: row.holder_name,
			ticket_type: row.ticket_type_label,
			used_at: usedAt.toISOString(),
			order_reference: row.order_reference,
		},
	});
}

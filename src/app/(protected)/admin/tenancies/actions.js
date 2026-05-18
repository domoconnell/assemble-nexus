"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import {
	insertTenancy,
	updateTenancy,
	softDeleteTenancy,
	cancelSession,
	uncancelSession,
} from "@/db/queries/tenancies.js";

const WeekdaySchema = z.enum(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);
const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreateSchema = z
	.object({
		kind: z.enum(["private_rental", "scheduled_recurring"]),
		customer_id: z.string().uuid(),
		room_id: z.string().uuid(),
		label: z.string().max(200).optional().nullable(),
		starts_on: YmdSchema,
		ends_on: YmdSchema.optional().nullable().or(z.literal("")),
		invoice_day_of_month: z.coerce.number().int().min(1).max(28).default(1),
		monthly_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
		per_session_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
		schedule_rule: z
			.object({
				by_weekday: z.array(WeekdaySchema).min(1),
				time_start: TimeSchema,
				time_end: TimeSchema,
			})
			.optional()
			.nullable(),
		notes: z.string().max(2000).optional().nullable(),
	})
	.refine(
		(d) =>
			d.kind === "private_rental"
				? d.monthly_rate_cents != null && d.monthly_rate_cents > 0
				: true,
		{ message: "Private rentals need a monthly rate.", path: ["monthly_rate_cents"] },
	)
	.refine(
		(d) =>
			d.kind === "scheduled_recurring"
				? d.schedule_rule && d.per_session_rate_cents != null
				: true,
		{ message: "Recurring tenancies need a schedule and a per-session rate.", path: ["schedule_rule"] },
	);

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
	return requireCurrentVenue();
}

export async function createTenancyAction(input) {
	const venue = await gate();
	const parsed = CreateSchema.parse(input);
	const row = await insertTenancy({
		venue_id: venue.id,
		customer_id: parsed.customer_id,
		room_id: parsed.room_id,
		kind: parsed.kind,
		status: "active",
		label: parsed.label?.trim() || null,
		starts_on: parsed.starts_on,
		ends_on: parsed.ends_on?.trim() || null,
		invoice_day_of_month: parsed.invoice_day_of_month,
		monthly_rate_cents: parsed.kind === "private_rental" ? parsed.monthly_rate_cents : null,
		per_session_rate_cents:
			parsed.kind === "scheduled_recurring" ? parsed.per_session_rate_cents : null,
		schedule_rule:
			parsed.kind === "scheduled_recurring" ? parsed.schedule_rule : null,
		notes: parsed.notes?.trim() || null,
	});
	revalidatePath("/admin/tenancies");
	return { id: row.id };
}

const UpdateSchema = z.object({
	id: z.string().uuid(),
	label: z.string().max(200).optional().nullable(),
	ends_on: YmdSchema.optional().nullable().or(z.literal("")),
	invoice_day_of_month: z.coerce.number().int().min(1).max(28).optional(),
	monthly_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
	per_session_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
	schedule_rule: z
		.object({
			by_weekday: z.array(WeekdaySchema).min(1),
			time_start: TimeSchema,
			time_end: TimeSchema,
		})
		.optional()
		.nullable(),
	notes: z.string().max(2000).optional().nullable(),
	status: z.enum(["active", "paused", "ended"]).optional(),
});

export async function updateTenancyAction(input) {
	await gate();
	const parsed = UpdateSchema.parse(input);
	const { id, ...rest } = parsed;
	const patch = { ...rest };
	if ("ends_on" in patch) patch.ends_on = patch.ends_on?.trim() || null;
	if ("label" in patch) patch.label = patch.label?.trim() || null;
	if ("notes" in patch) patch.notes = patch.notes?.trim() || null;
	const row = await updateTenancy(id, patch);
	revalidatePath("/admin/tenancies");
	revalidatePath(`/admin/tenancies/${id}`);
	return row;
}

export async function deleteTenancyAction(id) {
	await gate();
	await softDeleteTenancy(id);
	revalidatePath("/admin/tenancies");
	return { ok: true };
}

export async function cancelSessionAction({ session_id, reason }) {
	await gate();
	const row = await cancelSession(session_id, reason);
	if (row?.tenancy_id) revalidatePath(`/admin/tenancies/${row.tenancy_id}`);
	return { ok: true };
}

export async function uncancelSessionAction(session_id) {
	await gate();
	const row = await uncancelSession(session_id);
	if (row?.tenancy_id) revalidatePath(`/admin/tenancies/${row.tenancy_id}`);
	return { ok: true };
}

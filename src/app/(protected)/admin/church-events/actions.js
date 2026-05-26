"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/db/index.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const WeekdaySchema = z.enum(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);
const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const AdhocSchema = z.object({
	kind: z.literal("adhoc"),
	reason: z.string().min(1).max(200),
	notes: z.string().max(2000).optional().nullable(),
	is_public: z.boolean().optional().default(false),
	room_ids: z.array(z.string().uuid()).default([]),
	starts_at: z.string().min(1),
	ends_at: z.string().min(1),
});

const WeeklySchema = z.object({
	kind: z.literal("weekly"),
	reason: z.string().min(1).max(200),
	notes: z.string().max(2000).optional().nullable(),
	is_public: z.boolean().optional().default(false),
	room_ids: z.array(z.string().uuid()).default([]),
	by_weekday: z.array(WeekdaySchema).min(1),
	time_start: TimeSchema,
	time_end: TimeSchema,
	starts_on: YmdSchema,
	ends_on: YmdSchema.optional().nullable().or(z.literal("")),
});

const RunSchema = z.object({
	kind: z.literal("run"),
	reason: z.string().min(1).max(200),
	notes: z.string().max(2000).optional().nullable(),
	is_public: z.boolean().optional().default(false),
	room_ids: z.array(z.string().uuid()).default([]),
	weekday: WeekdaySchema,
	time_start: TimeSchema,
	time_end: TimeSchema,
	starts_on: YmdSchema,
	weeks: z.coerce.number().int().min(1).max(104),
});

async function gate() {
	const session = await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	return { session, venue };
}

async function linkRooms(blockoutId, roomIds) {
	if (!roomIds || roomIds.length === 0) return;
	await db
		.insert(room_blockout_room)
		.values(roomIds.map((id) => ({ blockout_id: blockoutId, room_id: id })));
}

export async function createChurchEventAction(input) {
	const { session, venue } = await gate();

	if (input.kind === "adhoc") {
		const p = AdhocSchema.parse(input);
		const [row] = await db
			.insert(room_blockout)
			.values({
				venue_id: venue.id,
				kind: "church",
				starts_at: new Date(p.starts_at),
				ends_at: new Date(p.ends_at),
				reason: p.reason.trim(),
				notes: p.notes?.trim() || null,
				is_public: !!p.is_public,
				series_id: null,
				recurrence_rule: null,
				created_by_user_id: session.user.id,
			})
			.returning({ id: room_blockout.id });
		await linkRooms(row.id, p.room_ids);
		revalidatePath("/admin/church-events");
		return { id: row.id };
	}

	if (input.kind === "weekly") {
		const p = WeeklySchema.parse(input);
		const series_id = randomUUID();
		// Definition row uses the first natural occurrence as its starts_at/ends_at
		// so it's a real, scheduled blockout. Cron will top up future ones.
		const startsOn = new Date(`${p.starts_on}T00:00:00Z`);
		const [sh, sm] = p.time_start.split(":").map(Number);
		const [eh, em] = p.time_end.split(":").map(Number);
		const WEEKDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
		const targetSet = new Set(p.by_weekday.map((w) => WEEKDAY_INDEX[w]));
		const cursor = new Date(startsOn);
		while (!targetSet.has(cursor.getUTCDay())) {
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		const starts = new Date(cursor); starts.setUTCHours(sh, sm, 0, 0);
		const ends = new Date(cursor); ends.setUTCHours(eh, em, 0, 0);
		const [row] = await db
			.insert(room_blockout)
			.values({
				venue_id: venue.id,
				kind: "church",
				starts_at: starts,
				ends_at: ends,
				reason: p.reason.trim(),
				notes: p.notes?.trim() || null,
				is_public: !!p.is_public,
				series_id,
				recurrence_rule: {
					kind: "weekly",
					by_weekday: p.by_weekday,
					time_start: p.time_start,
					time_end: p.time_end,
					starts_on: p.starts_on,
					ends_on: p.ends_on?.trim() || null,
				},
				created_by_user_id: session.user.id,
			})
			.returning({ id: room_blockout.id });
		await linkRooms(row.id, p.room_ids);
		revalidatePath("/admin/church-events");
		return { id: row.id, series_id };
	}

	if (input.kind === "run") {
		const p = RunSchema.parse(input);
		const series_id = randomUUID();
		const startsOn = new Date(`${p.starts_on}T00:00:00Z`);
		const [sh, sm] = p.time_start.split(":").map(Number);
		const [eh, em] = p.time_end.split(":").map(Number);
		const WEEKDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
		const target = WEEKDAY_INDEX[p.weekday];
		const cursor = new Date(startsOn);
		while (cursor.getUTCDay() !== target) cursor.setUTCDate(cursor.getUTCDate() + 1);
		const starts = new Date(cursor); starts.setUTCHours(sh, sm, 0, 0);
		const ends = new Date(cursor); ends.setUTCHours(eh, em, 0, 0);
		const [row] = await db
			.insert(room_blockout)
			.values({
				venue_id: venue.id,
				kind: "church",
				starts_at: starts,
				ends_at: ends,
				reason: p.reason.trim(),
				notes: p.notes?.trim() || null,
				is_public: !!p.is_public,
				series_id,
				recurrence_rule: {
					kind: "run",
					weekday: p.weekday,
					time_start: p.time_start,
					time_end: p.time_end,
					starts_on: p.starts_on,
					weeks: p.weeks,
				},
				created_by_user_id: session.user.id,
			})
			.returning({ id: room_blockout.id });
		await linkRooms(row.id, p.room_ids);
		revalidatePath("/admin/church-events");
		return { id: row.id, series_id };
	}

	throw new Error("Unknown church-event kind");
}

const UpdateAdhocSchema = AdhocSchema.extend({ id: z.string().uuid() });
const UpdateWeeklySchema = WeeklySchema.extend({ id: z.string().uuid() });
const UpdateRunSchema = RunSchema.extend({ id: z.string().uuid() });

/**
 * Edit an existing church event. For adhoc rows it's a plain field
 * update. For weekly / run series we:
 *   - update the definition row's metadata + recurrence_rule
 *   - replace the linked rooms
 *   - hard-delete any future occurrences that were materialised from
 *     the old rule, then re-materialise from the new one
 *
 * Past occurrences are left alone so the historical record is preserved.
 */
export async function updateChurchEventAction(input) {
	const { venue } = await gate();

	if (input.kind === "adhoc") {
		const p = UpdateAdhocSchema.parse(input);
		const existing = await db
			.select()
			.from(room_blockout)
			.where(
				and(
					eq(room_blockout.id, p.id),
					eq(room_blockout.venue_id, venue.id),
					eq(room_blockout.kind, "church"),
					isNull(room_blockout.deletedAt),
				),
			)
			.limit(1);
		if (existing.length === 0) throw new Error("Church event not found.");
		await db
			.update(room_blockout)
			.set({
				starts_at: new Date(p.starts_at),
				ends_at: new Date(p.ends_at),
				reason: p.reason.trim(),
				notes: p.notes?.trim() || null,
				is_public: !!p.is_public,
			})
			.where(eq(room_blockout.id, p.id));
		await db.delete(room_blockout_room).where(eq(room_blockout_room.blockout_id, p.id));
		await linkRooms(p.id, p.room_ids);
		revalidatePath("/admin/church-events");
		return { id: p.id };
	}

	const isWeekly = input.kind === "weekly";
	const p = isWeekly ? UpdateWeeklySchema.parse(input) : UpdateRunSchema.parse(input);

	const [definition] = await db
		.select()
		.from(room_blockout)
		.where(
			and(
				eq(room_blockout.id, p.id),
				eq(room_blockout.venue_id, venue.id),
				eq(room_blockout.kind, "church"),
				isNotNull(room_blockout.recurrence_rule),
				isNotNull(room_blockout.series_id),
				isNull(room_blockout.deletedAt),
			),
		)
		.limit(1);
	if (!definition) throw new Error("Series definition not found.");

	// Build the new recurrence_rule payload first - if it matches the
	// stored rule + the room set hasn't changed, we can skip the
	// re-materialise step entirely.
	const newRule = isWeekly
		? {
				kind: "weekly",
				by_weekday: p.by_weekday,
				time_start: p.time_start,
				time_end: p.time_end,
				starts_on: p.starts_on,
				ends_on: p.ends_on?.trim() || null,
			}
		: {
				kind: "run",
				weekday: p.weekday,
				time_start: p.time_start,
				time_end: p.time_end,
				starts_on: p.starts_on,
				weeks: p.weeks,
			};
	const ruleChanged =
		JSON.stringify(definition.recurrence_rule) !== JSON.stringify(newRule);

	await db
		.update(room_blockout)
		.set({
			reason: p.reason.trim(),
			notes: p.notes?.trim() || null,
			is_public: !!p.is_public,
			recurrence_rule: newRule,
		})
		.where(eq(room_blockout.id, definition.id));

	// Refresh room links on the definition row.
	await db.delete(room_blockout_room).where(eq(room_blockout_room.blockout_id, definition.id));
	await linkRooms(definition.id, p.room_ids);

	if (ruleChanged) {
		// Hard-delete future occurrences from the OLD rule. We keep past
		// rows (their starts_at < now) as a record.
		const now = new Date();
		const futureRows = await db
			.select({ id: room_blockout.id })
			.from(room_blockout)
			.where(
				and(
					eq(room_blockout.series_id, definition.series_id),
					ne(room_blockout.id, definition.id),
					gt(room_blockout.starts_at, now),
					isNull(room_blockout.deletedAt),
				),
			);
		for (const r of futureRows) {
			await db
				.delete(room_blockout_room)
				.where(eq(room_blockout_room.blockout_id, r.id));
			await db.delete(room_blockout).where(eq(room_blockout.id, r.id));
		}
	}

	// Propagate the (possibly unchanged) reason / notes / public flag
	// onto remaining future occurrences for consistency, and refresh
	// their room links to mirror the definition's set.
	const remainingFuture = await db
		.select({ id: room_blockout.id })
		.from(room_blockout)
		.where(
			and(
				eq(room_blockout.series_id, definition.series_id),
				ne(room_blockout.id, definition.id),
				gt(room_blockout.starts_at, new Date()),
				isNull(room_blockout.deletedAt),
			),
		);
	if (remainingFuture.length > 0) {
		await db
			.update(room_blockout)
			.set({
				reason: p.reason.trim(),
				notes: p.notes?.trim() || null,
				is_public: !!p.is_public,
			})
			.where(
				and(
					eq(room_blockout.series_id, definition.series_id),
					gt(room_blockout.starts_at, new Date()),
					ne(room_blockout.id, definition.id),
				),
			);
		for (const r of remainingFuture) {
			await db
				.delete(room_blockout_room)
				.where(eq(room_blockout_room.blockout_id, r.id));
			if (p.room_ids?.length > 0) {
				await db
					.insert(room_blockout_room)
					.values(p.room_ids.map((id) => ({ blockout_id: r.id, room_id: id })));
			}
		}
	}

	// Top up to the full window with the new rule.
	revalidatePath("/admin/church-events");
	revalidatePath(`/admin/church-events/${definition.id}`);
	return { id: definition.id, series_id: definition.series_id };
}

export async function deleteChurchEventAction(id) {
	const { venue } = await gate();
	await db
		.update(room_blockout)
		.set({ deletedAt: new Date() })
		.where(and(eq(room_blockout.id, id), eq(room_blockout.venue_id, venue.id)));
	revalidatePath("/admin/church-events");
	return { ok: true };
}

export async function deleteChurchEventSeriesAction(seriesId) {
	const { venue } = await gate();
	await db
		.update(room_blockout)
		.set({ deletedAt: new Date() })
		.where(and(eq(room_blockout.series_id, seriesId), eq(room_blockout.venue_id, venue.id)));
	revalidatePath("/admin/church-events");
	return { ok: true };
}

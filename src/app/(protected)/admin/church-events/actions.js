"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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

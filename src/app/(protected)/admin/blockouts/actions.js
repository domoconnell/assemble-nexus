"use server";

import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { db } from "@/db/index.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { expandPattern } from "@/lib/booking/recurrence.js";

async function gate() {
	return requireServerSession();
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

const PatternSchema = z
	.object({
		kind: z.enum(["weekly", "monthly_day", "monthly_weekday"]),
		interval: z.coerce.number().int().min(1).max(12).default(1),
		day_of_month: z.coerce.number().int().min(1).max(31).optional().nullable(),
		weekday: z.coerce.number().int().min(0).max(6).optional().nullable(),
		position: z.coerce.number().int().refine((n) => [1, 2, 3, 4, -1].includes(n)).optional().nullable(),
		count: z.coerce.number().int().min(2).max(156).optional().nullable(),
		until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
	})
	.refine((d) => d.count || d.until_date, {
		message: "Provide count or until_date",
	});

const BlockoutSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	// Empty array means "all rooms (venue-wide)".
	room_ids: z.array(z.string().uuid()).optional().default([]),
	starts_at: z.string().min(1),
	ends_at: z.string().min(1),
	reason: z.string().min(1).max(120),
	notes: z.string().max(1000).optional().nullable(),
	is_public: z.coerce.boolean().optional().default(false),
	// New blockout: optional pattern → generates a series starting at this row.
	// Existing blockout (with id): if pattern is set + apply_to_series=true,
	// we soft-delete future occurrences in the series and regenerate.
	recurrence: PatternSchema.optional().nullable(),
	apply_to_series: z.coerce.boolean().optional().default(false),
});

function parseDate(s) {
	const d = new Date(s);
	if (Number.isNaN(d.valueOf())) throw new Error(`Invalid date: ${s}`);
	return d;
}

async function insertBlockoutWithRooms({
	venueId,
	createdBy,
	startsAt,
	endsAt,
	reason,
	notes,
	isPublic,
	roomIds,
	seriesId,
}) {
	const [inserted] = await db
		.insert(room_blockout)
		.values({
			venue_id: venueId,
			starts_at: startsAt,
			ends_at: endsAt,
			reason,
			notes: notes ?? null,
			is_public: !!isPublic,
			series_id: seriesId ?? null,
			created_by_user_id: createdBy ?? null,
		})
		.returning({ id: room_blockout.id });
	if (roomIds.length) {
		await db.insert(room_blockout_room).values(
			roomIds.map((room_id) => ({ blockout_id: inserted.id, room_id })),
		);
	}
	return inserted.id;
}

async function deleteFutureSeriesOccurrences({ venueId, seriesId, fromDate, exceptBlockoutId }) {
	if (!seriesId) return;
	const conds = [
		eq(room_blockout.venue_id, venueId),
		eq(room_blockout.series_id, seriesId),
		gte(room_blockout.starts_at, fromDate),
	];
	const rows = await db
		.select({ id: room_blockout.id })
		.from(room_blockout)
		.where(and(...conds));
	const idsToDelete = rows.map((r) => r.id).filter((id) => id !== exceptBlockoutId);
	if (idsToDelete.length === 0) return;
	for (const id of idsToDelete) {
		await db
			.update(room_blockout)
			.set({ deletedAt: new Date() })
			.where(eq(room_blockout.id, id));
	}
}

async function generateSeriesAfter({
	venueId,
	createdBy,
	templateStart,
	templateEnd,
	reason,
	notes,
	isPublic,
	roomIds,
	seriesId,
	pattern,
}) {
	const occurrences = expandPattern({
		templateStart,
		templateEnd,
		pattern: {
			kind: pattern.kind,
			interval: pattern.interval,
			day_of_month: pattern.day_of_month,
			weekday: pattern.weekday,
			position: pattern.position,
			count: pattern.count,
			until_date: pattern.until_date,
		},
	});
	for (const occ of occurrences) {
		await insertBlockoutWithRooms({
			venueId,
			createdBy,
			startsAt: occ.starts_at,
			endsAt: occ.ends_at,
			reason,
			notes,
			isPublic,
			roomIds,
			seriesId,
		});
	}
	return occurrences.length;
}

export async function saveBlockoutAction(input) {
	const session = await gate();
	const venue = await requireCurrentVenue();
	const parsed = BlockoutSchema.parse({
		...input,
		notes: nullify(input.notes),
	});

	const startsAt = parseDate(parsed.starts_at);
	const endsAt = parseDate(parsed.ends_at);
	if (endsAt <= startsAt) {
		throw new Error("End must be after start.");
	}

	const createdBy = session?.user?.id ?? null;

	if (parsed.id) {
		// Find the existing row so we can preserve / reuse its series_id.
		const [existing] = await db
			.select()
			.from(room_blockout)
			.where(and(eq(room_blockout.id, parsed.id), eq(room_blockout.venue_id, venue.id)))
			.limit(1);
		if (!existing) throw new Error("Blockout not found");

		const seriesId = existing.series_id ?? (parsed.recurrence ? crypto.randomUUID() : null);

		// Update this row.
		await db
			.update(room_blockout)
			.set({
				starts_at: startsAt,
				ends_at: endsAt,
				reason: parsed.reason,
				notes: parsed.notes ?? null,
				is_public: !!parsed.is_public,
				series_id: parsed.recurrence ? seriesId : null,
			})
			.where(eq(room_blockout.id, parsed.id));
		await db.delete(room_blockout_room).where(eq(room_blockout_room.blockout_id, parsed.id));
		if (parsed.room_ids.length) {
			await db.insert(room_blockout_room).values(
				parsed.room_ids.map((room_id) => ({ blockout_id: parsed.id, room_id })),
			);
		}

		// If recurrence is set AND admin opted to apply to series, regenerate
		// future occurrences using THIS row as the new template.
		let regenerated = 0;
		if (parsed.recurrence && parsed.apply_to_series) {
			await deleteFutureSeriesOccurrences({
				venueId: venue.id,
				seriesId,
				fromDate: startsAt,
				exceptBlockoutId: parsed.id,
			});
			regenerated = await generateSeriesAfter({
				venueId: venue.id,
				createdBy,
				templateStart: startsAt,
				templateEnd: endsAt,
				reason: parsed.reason,
				notes: parsed.notes,
				isPublic: parsed.is_public,
				roomIds: parsed.room_ids,
				seriesId,
				pattern: parsed.recurrence,
			});
		} else if (!parsed.recurrence && existing.series_id) {
			// Recurrence removed - leave the row standalone, do not touch siblings.
			await db
				.update(room_blockout)
				.set({ series_id: null })
				.where(eq(room_blockout.id, parsed.id));
		}

		revalidatePath("/admin/blockouts");
		return { ok: true, updated: 1, regenerated };
	}

	// Insert path.
	if (parsed.recurrence) {
		const seriesId = crypto.randomUUID();
		const templateId = await insertBlockoutWithRooms({
			venueId: venue.id,
			createdBy,
			startsAt,
			endsAt,
			reason: parsed.reason,
			notes: parsed.notes,
			isPublic: parsed.is_public,
			roomIds: parsed.room_ids,
			seriesId,
		});
		const generated = await generateSeriesAfter({
			venueId: venue.id,
			createdBy,
			templateStart: startsAt,
			templateEnd: endsAt,
			reason: parsed.reason,
			notes: parsed.notes,
			isPublic: parsed.is_public,
			roomIds: parsed.room_ids,
			seriesId,
			pattern: parsed.recurrence,
		});
		revalidatePath("/admin/blockouts");
		return { ok: true, added: 1 + generated, series_id: seriesId };
	}

	await insertBlockoutWithRooms({
		venueId: venue.id,
		createdBy,
		startsAt,
		endsAt,
		reason: parsed.reason,
		notes: parsed.notes,
		isPublic: parsed.is_public,
		roomIds: parsed.room_ids,
		seriesId: null,
	});
	revalidatePath("/admin/blockouts");
	return { ok: true, added: 1 };
}

export async function deleteBlockoutAction(id) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.update(room_blockout)
		.set({ deletedAt: new Date() })
		.where(and(eq(room_blockout.id, id), eq(room_blockout.venue_id, venue.id)));
	revalidatePath("/admin/blockouts");
	return { ok: true };
}

export async function deleteBlockoutSeriesAction(seriesId) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.update(room_blockout)
		.set({ deletedAt: new Date() })
		.where(and(eq(room_blockout.series_id, seriesId), eq(room_blockout.venue_id, venue.id)));
	revalidatePath("/admin/blockouts");
	return { ok: true };
}

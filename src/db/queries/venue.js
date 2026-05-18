import { and, eq, isNull, asc } from "drizzle-orm";
import { db } from "@/db/index.js";
import { venue } from "@/db/schema/entities/venue.js";

export async function getCurrentVenue() {
    const [v] = await db
        .select()
        .from(venue)
        .where(and(eq(venue.is_active, true), isNull(venue.deletedAt)))
        .orderBy(asc(venue.createdAt))
        .limit(1);
    return v ?? null;
}

export async function requireCurrentVenue() {
    const v = await getCurrentVenue();
    if (!v) throw new Error("No active venue configured");
    return v;
}

/**
 * Every active, non-deleted venue. Used by crons that have no session
 * context and must iterate the whole tenant set.
 */
export async function listActiveVenues() {
    return db
        .select()
        .from(venue)
        .where(and(eq(venue.is_active, true), isNull(venue.deletedAt)))
        .orderBy(asc(venue.createdAt));
}

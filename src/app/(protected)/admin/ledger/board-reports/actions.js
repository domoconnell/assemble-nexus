"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { dispatchBoardPack } from "@/lib/board-pack/dispatch.js";

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
	return requireCurrentVenue();
}

/**
 * Trigger a board-pack send for a specific month to every admin/staff
 * user with `monthly-board-pack` ticked on /admin/users. Used by the
 * "Send now" / "Resend" button. Passes `force: true` so months already
 * in history can be re-sent (the cron's idempotency guard would
 * otherwise short-circuit).
 */
const SendNowSchema = z.object({ ym: z.string().regex(/^\d{4}-\d{2}$/) });

export async function sendBoardPackNowAction(input) {
	const venue = await gate();
	const { ym } = SendNowSchema.parse(input);
	const result = await dispatchBoardPack({ venue, ym, force: true });
	revalidatePath("/admin/ledger/board-reports");
	return result;
}

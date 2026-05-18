"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBoardReportRecipients, saveSetting } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const AddSchema = z.object({
	email: z.string().email().max(200),
	name: z.string().max(200).optional().nullable(),
});

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
	return requireCurrentVenue();
}

export async function addBoardReportRecipientAction(input) {
	const venue = await gate();
	const parsed = AddSchema.parse(input);
	const current = (await getBoardReportRecipients(venue.id)) ?? { recipients: [] };
	const email = parsed.email.trim().toLowerCase();
	if (current.recipients.some((r) => r.email.toLowerCase() === email)) {
		throw new Error("That email is already on the list.");
	}
	const next = {
		recipients: [
			...current.recipients,
			{ email, name: parsed.name?.trim() || null },
		],
	};
	await saveSetting(venue.id, "board_report_recipients", next);
	revalidatePath("/admin/ledger/board-reports");
	return next;
}

export async function removeBoardReportRecipientAction(email) {
	const venue = await gate();
	const target = String(email || "").trim().toLowerCase();
	const current = (await getBoardReportRecipients(venue.id)) ?? { recipients: [] };
	const next = {
		recipients: current.recipients.filter((r) => r.email.toLowerCase() !== target),
	};
	await saveSetting(venue.id, "board_report_recipients", next);
	revalidatePath("/admin/ledger/board-reports");
	return next;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSetting } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const Schema = z.object({
	counterparty_name: z.string().max(200).default(""),
	sort_code: z.string().max(20).default(""),
	account_number: z.string().max(40).default(""),
});

export async function saveChurchTransferSettingsAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = Schema.parse(input);
	const venue = await requireCurrentVenue();
	const value = {
		counterparty_name: parsed.counterparty_name.trim(),
		sort_code: parsed.sort_code.trim(),
		account_number: parsed.account_number.trim(),
	};
	await saveSetting(venue.id, "church_transfer", value);
	revalidatePath("/admin/settings/church-transfer");
	revalidatePath("/admin/ledger/overview");
	return value;
}

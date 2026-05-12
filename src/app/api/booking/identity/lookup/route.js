import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { json } from "@/utils/auth/auth-guard.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
	email: z.string().email().max(254),
});

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "Invalid JSON" });
	}
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) return json(400, { error: "Invalid email" });

	const lowered = parsed.data.email.trim().toLowerCase();
	const [u] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, lowered))
		.limit(1);

	return json(200, { exists: !!u });
}

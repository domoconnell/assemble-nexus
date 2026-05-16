import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role } from "@/db/schema/entities/role.js";

/**
 * Find an existing user by email, or create a new one with the supplied details.
 * Optionally grants the user a role. Idempotent - calling with an existing email
 * just attaches the role if missing.
 *
 * Returns the user row.
 */
export async function findOrCreateUserForCustomer({
	email,
	first_name,
	last_name,
	phone,
	roleKey = null,
}) {
	const lowered = String(email || "").trim().toLowerCase();
	if (!lowered) throw new Error("email required to link a customer to a user");

	let [u] = await db.select().from(user).where(eq(user.email, lowered)).limit(1);

	if (!u) {
		[u] = await db
			.insert(user)
			.values({
				first_name: first_name?.trim() || "",
				last_name: last_name?.trim() || "",
				email: lowered,
				mobile_number: phone || null,
			})
			.returning();
	}

	if (roleKey) {
		const [r] = await db.select().from(role).where(eq(role.key, roleKey)).limit(1);
		if (r) {
			await db
				.insert(user_role)
				.values({ user_id: u.id, role_id: r.id })
				.onConflictDoNothing();
		}
	}

	return u;
}

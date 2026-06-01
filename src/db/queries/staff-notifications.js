import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role } from "@/db/schema/entities/role.js";
import { isSubscribed } from "@/utils/email/subscriptions.js";

const STAFF_ROLE_KEYS = ["admin", "staff"];

/**
 * Return every staff user (role = admin / staff) that has NOT opted out
 * of the given notification template. Defaults to opt-in: a user with
 * `email_subscriptions = {}` will still appear here.
 *
 * Each row is `{ id, email, first_name, last_name }` so callers can do
 * a name-personalised send without a second lookup.
 */
export async function listStaffUsersSubscribedTo(templateKey) {
	const rows = await db
		.selectDistinct({
			id: user.id,
			email: user.email,
			first_name: user.first_name,
			last_name: user.last_name,
			email_subscriptions: user.email_subscriptions,
		})
		.from(user)
		.innerJoin(user_role, eq(user_role.user_id, user.id))
		.innerJoin(role, eq(role.id, user_role.role_id))
		.where(and(inArray(role.key, STAFF_ROLE_KEYS), isNull(user.deletedAt)));
	return rows
		.filter((r) => isSubscribed(r, templateKey))
		.map((r) => ({
			id: r.id,
			email: r.email,
			first_name: r.first_name,
			last_name: r.last_name,
		}));
}

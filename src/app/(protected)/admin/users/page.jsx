import { and, asc, isNull, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role } from "@/db/schema/entities/role.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { STAFF_NOTIFICATION_TYPES } from "@/utils/email/subscriptions.js";
import UsersAdminClient from "./_components/users-admin-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Users - Nexus" };

export default async function UsersPage() {
	await requireServerSession({ redirectTo: "/auth/login" });

	// Only users who hold the `admin` role appear here. Hirers, delegates,
	// and other roles are managed elsewhere (or implicitly, by signing in
	// to their own portal). Promoting an existing user to admin attaches
	// the role without disturbing whatever other roles they already have.
	const rows = await db
		.select({
			id: user.id,
			first_name: user.first_name,
			last_name: user.last_name,
			email: user.email,
			email_verified: user.emailVerified,
			email_subscriptions: user.email_subscriptions,
			createdAt: user.createdAt,
		})
		.from(user)
		.innerJoin(user_role, eq(user_role.user_id, user.id))
		.innerJoin(role, eq(role.id, user_role.role_id))
		.where(and(eq(role.key, "admin"), isNull(user.deletedAt)))
		.orderBy(asc(user.last_name), asc(user.first_name));

	const admins = rows.map((r) => ({
		id: r.id,
		first_name: r.first_name,
		last_name: r.last_name,
		email: r.email,
		email_verified: !!r.email_verified,
		email_subscriptions: r.email_subscriptions ?? {},
		createdAt: r.createdAt,
	}));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Users</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Admin users for this venue. Each can opt in or out of staff
					notifications below. Adding an admin by an email that already
					exists (e.g. someone who signed in as a hirer) just attaches the
					admin role to their existing record - no duplicates.
				</p>
			</div>

			<UsersAdminClient admins={admins} types={STAFF_NOTIFICATION_TYPES} />
		</div>
	);
}

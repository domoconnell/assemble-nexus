import { redirect } from "next/navigation";
import { getServerSession } from "@/utils/auth/server-guard.js";
import { getUserAccess, hasAnyRole } from "@/utils/auth/rbac.js";

export const dynamic = "force-dynamic";

const ADMIN_ROLE_KEYS = ["admin", "staff"];

/**
 * Single auth gate for every page under /admin/*. The parent
 * `(protected)/layout.jsx` already ensures a session exists; this layer
 * additionally requires the user to hold an `admin` or `staff` role.
 *
 * Non-authorised users (delegates, hirers, anyone with no roles) get
 * bounced to `/`. The existing per-page `requireServerSession` calls
 * remain redundant-but-harmless; over time they can be deleted in
 * favour of this single check.
 */
export default async function AdminLayout({ children }) {
	const session = await getServerSession();
	if (!session?.user) {
		redirect("/auth/login?callbackURL=/admin");
	}
	const access = await getUserAccess(session.user.id);
	if (!hasAnyRole(access, ADMIN_ROLE_KEYS)) {
		redirect("/");
	}
	return children;
}

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/utils/auth/auth.js";
import { getUserAccess, hasAnyRole } from "@/utils/auth/rbac.js";
import { AuthProvider } from "@/nexus/context/auth-context";
import ApplicationLayout from "@/nexus/layout/application_layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Role check sits here at the protected-layout level (not in
// admin/layout.jsx) so non-admin users get a clean 307 *before* the
// heavy ApplicationLayout client shell starts streaming. Streaming
// the ApplicationLayout first leaves the user staring at the
// loading spinner while the deeper redirect tries (and fails) to
// reach them.
const ADMIN_ROLE_KEYS = ["admin", "staff"];

export default async function ProtectedLayout({ children }) {
    const h = await headers();

    const session = await auth.api.getSession({
        headers: h,
    });

    if (!session?.user) {
        redirect("/auth/login?callbackURL=/admin");
    }

    const access = await getUserAccess(session.user.id);
    if (!hasAnyRole(access, ADMIN_ROLE_KEYS)) {
        redirect("/");
    }

    return (
        <AuthProvider initialSession={session}>
            <ApplicationLayout>{children}</ApplicationLayout>
        </AuthProvider>
    );
}
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/utils/auth/auth.js";
import { getUserAccess, hasAnyRole, hasAnyPermission } from "@/utils/auth/rbac.js";

export async function getServerSession() {
    const h = await headers();
    return auth.api.getSession({ headers: h });
}

export async function requireServerSession({ redirectTo = "/auth/login" } = {}) {
    const session = await getServerSession();
    if (!session?.user) redirect(redirectTo);
    return session;
}

export async function requireServerRole(roleKeys, { redirectTo = "/auth/login", forbiddenRedirectTo = "/" } = {}) {
    const session = await requireServerSession({ redirectTo });
    const access = await getUserAccess(session.user.id);
    if (!hasAnyRole(access, roleKeys)) redirect(forbiddenRedirectTo);
    return { session, access };
}

export async function requireServerPermission(permKeys, { redirectTo = "/auth/login", forbiddenRedirectTo = "/" } = {}) {
    const session = await requireServerSession({ redirectTo });
    const access = await getUserAccess(session.user.id);
    if (!hasAnyPermission(access, permKeys)) redirect(forbiddenRedirectTo);
    return { session, access };
}

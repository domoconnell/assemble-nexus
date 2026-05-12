import { auth } from "@/utils/auth/auth.js";
import { getUserAccess, hasAnyRole, hasAnyPermission } from "@/utils/auth/rbac.js";

export function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function getUserLevel(session) {
    return Number(session?.user?.level ?? 0);
}

/**
 * Gatekeeper for API route handlers.
 *
 *   const gate = await requireAuth(request, { role: "admin" });
 *   if (!gate.ok) return gate.response;
 *   const { user, access } = gate;
 *
 * Options:
 *   - minLevel:   numeric `user.level` minimum (deprecated — prefer role/permission)
 *   - role:       string or string[] of role keys (any-of)
 *   - permission: string or string[] of permission keys (any-of)
 *
 * `access` is only loaded if `role` or `permission` is checked.
 */
export async function requireAuth(request, options = {}) {
    const {
        minLevel = null,
        role = null,
        permission = null,
    } = options;

    let session = null;

    try {
        session = await auth.api.getSession({ headers: request.headers });
    } catch (err) {
        return { ok: false, response: json(401, { error: "Unauthorised" }) };
    }

    if (!session) {
        return { ok: false, response: json(401, { error: "Unauthorised" }) };
    }

    const user = session.user ?? null;
    const level = getUserLevel(session);

    if (minLevel != null && level < minLevel) {
        return { ok: false, response: json(403, { error: "Forbidden" }) };
    }

    let access = null;
    if (role != null || permission != null) {
        access = await getUserAccess(user?.id);
        if (role != null && !hasAnyRole(access, role)) {
            return { ok: false, response: json(403, { error: "Forbidden" }) };
        }
        if (permission != null && !hasAnyPermission(access, permission)) {
            return { ok: false, response: json(403, { error: "Forbidden" }) };
        }
    }

    return { ok: true, session, user, level, access };
}
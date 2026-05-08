import { auth } from "@/utils/auth/auth.js";

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
 * - Accepts cookie session OR bearer token (if bearer plugin enabled)
 * - Optionally enforces a minimum access level
 * - Returns { ok, session, user, level } on success
 * - Returns { ok:false, response } on failure (ready to `return`)
 *
 * Usage:
 *   const gate = await requireAuth(request, { minLevel: 3 });
 *   if (!gate.ok) return gate.response;
 *   const { user } = gate;
 */
export async function requireAuth(request, options = {}) {
    const {
        minLevel = null,
        // future: allowReportToken = false,
        // future: scopes = [],
    } = options;

    let session = null;

    try {
        // Better Auth reads auth from headers:
        // - cookies for browser sessions
        // - Authorization: Bearer ... for programmatic access (if enabled)
        session = await auth.api.getSession({ headers: request.headers });
    } catch (err) {
        // If Better Auth throws for any reason, treat as unauth
        return {
            ok: false,
            response: json(401, { error: "Unauthorised" }),
        };
    }

    if (!session) {
        return {
            ok: false,
            response: json(401, { error: "Unauthorised" }),
        };
    }

    const user = session.user ?? null;
    const level = getUserLevel(session);

    if (minLevel != null && level < minLevel) {
        return {
            ok: false,
            response: json(403, { error: "Forbidden" }),
        };
    }

    return {
        ok: true,
        session,
        user,
        level,
    };
}
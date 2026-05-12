import { NextResponse } from "next/server";

// Routes that require a session cookie before they even reach Next's
// rendering. `/my-events` and `/my-tickets` are NOT here — those pages
// render their own in-page magic-link form when no session exists.
const PROTECTED_PREFIXES = ["/admin"];
const LOGIN_PATH = "/auth/login";
// Only the login page bounces authenticated users away. /auth/post-login
// itself routes by role, and other /auth/* paths (verify, callback) must
// pass through so better-auth can finish its handshake.
const REDIRECT_AWAY_PATHS = new Set(["/auth/login"]);

// Better-auth adds the `__Secure-` cookie-name prefix when running over HTTPS
// (production). Without checking both names the proxy can't see the session
// in prod and admin pages bounce-loop through /auth/login.
const COOKIE_PREFIX = process.env.APP_SHORT_NAME || "app";
const SESSION_COOKIE_NAMES = [
    `${COOKIE_PREFIX}.session_token`,
    `__Secure-${COOKIE_PREFIX}.session_token`,
];

// Canonical host derived from BASE_URL — every request is rewritten to this
// host + https. Apex (`assembly-rooms.com`) bounces to `www.assembly-rooms.com`,
// http bounces to https. Dev (localhost) is skipped.
const CANONICAL_URL = (() => {
    try {
        return new URL(process.env.BASE_URL || "");
    } catch {
        return null;
    }
})();

export function proxy(req) {
    if (CANONICAL_URL && CANONICAL_URL.hostname !== "localhost") {
        const host = req.headers.get("host") || "";
        const proto = req.headers.get("x-forwarded-proto") || "https";
        // Skip on internal/loopback requests — Next's image optimizer fetches
        // local files via HTTP and the request arrives with host=localhost:PORT,
        // no x-forwarded-* headers. Redirecting it to the public URL breaks the
        // optimizer's fetch.
        const isInternal =
            host.startsWith("localhost") ||
            host.startsWith("127.") ||
            host.startsWith("[::1]") ||
            !req.headers.get("x-forwarded-proto");
        if (!isInternal) {
            const wrongHost = host !== CANONICAL_URL.host;
            const wrongProto = proto !== CANONICAL_URL.protocol.replace(":", "");
            if (wrongHost || wrongProto) {
                const target = new URL(req.nextUrl.pathname + req.nextUrl.search, CANONICAL_URL);
                return NextResponse.redirect(target, 308);
            }
        }
    }

    const { pathname, searchParams } = req.nextUrl;
    const hasSessionCookie = SESSION_COOKIE_NAMES.some(
        (name) => !!req.cookies.get(name)?.value,
    );
    const isProtected = PROTECTED_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
    );

    if (isProtected && !hasSessionCookie) {
        const url = req.nextUrl.clone();
        url.pathname = LOGIN_PATH;
        url.search = "";
        url.searchParams.set(
            "callbackURL",
            pathname + (searchParams.toString() ? `?${searchParams}` : ""),
        );
        return NextResponse.redirect(url);
    }

    if (REDIRECT_AWAY_PATHS.has(pathname) && hasSessionCookie) {
        const url = req.nextUrl.clone();
        url.pathname = "/auth/post-login";
        url.search = "";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};

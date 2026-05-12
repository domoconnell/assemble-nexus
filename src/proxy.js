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

const SESSION_COOKIE_NAME = (process.env.APP_SHORT_NAME || "better-auth") + ".session_token";

export function proxy(req) {
    const { pathname, searchParams } = req.nextUrl;
    const hasSessionCookie = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;
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
    matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api).*)"],
};

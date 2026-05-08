import { NextResponse } from "next/server";

const AUTH_PREFIX = "/auth";
const LOGIN_PATH = "/auth/login";

const SESSION_COOKIE_NAME = (process.env.APP_SHORT_NAME || "better-auth") + ".session_token";

const PUBLIC_FILE = /\.(.*)$/;

export function proxy(req) {
    const { pathname, searchParams } = req.nextUrl;

    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        PUBLIC_FILE.test(pathname)
    ) {
        return NextResponse.next();
    }

    if (pathname.startsWith("/api")) {
        return NextResponse.next();
    }

    const isAuthRoute = pathname.startsWith(AUTH_PREFIX);
    const hasSessionCookie = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!hasSessionCookie && !isAuthRoute) {
        const url = req.nextUrl.clone();
        url.pathname = LOGIN_PATH;

        url.searchParams.set(
            "next",
            pathname + (searchParams.toString() ? `?${searchParams}` : ""),
        );

        return NextResponse.redirect(url);
    }

    if (hasSessionCookie && isAuthRoute) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
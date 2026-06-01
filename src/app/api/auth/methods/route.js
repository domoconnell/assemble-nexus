import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema/entities/user";
import { account, passkey } from "@/db/schema/auth_schema";
import { eq, and } from "drizzle-orm";

const MIN_RESPONSE_TIME = 1000;

// Per-IP in-memory rate limit: 10 lookups per 60s window. Stops bulk
// email-enumeration scans. Single-instance scope is acceptable here -
// the cost of a leak is bounded by the timing-equalised handler.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;
const ipBuckets = globalThis.__methodsRateBuckets ?? new Map();
globalThis.__methodsRateBuckets = ipBuckets;

function clientIp(request) {
    const fwd = request.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return request.headers.get("x-real-ip") || "unknown";
}

function checkRate(ip) {
    const now = Date.now();
    const bucket = ipBuckets.get(ip) ?? [];
    const fresh = bucket.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length >= RATE_MAX) {
        ipBuckets.set(ip, fresh);
        return false;
    }
    fresh.push(now);
    ipBuckets.set(ip, fresh);
    return true;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseEmail(email) {
    return String(email || "").trim().toLowerCase();
}

export async function GET(request) {
    const start = Date.now();

    if (!checkRate(clientIp(request))) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429 },
        );
    }

    const { searchParams } = new URL(request.url);
    const email = normaliseEmail(searchParams.get("email"));

    if (!email || !email.includes("@")) {
        return NextResponse.json(
            { error: "Invalid email" },
            { status: 400 },
        );
    }

    const [u] = await db
        .select({
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            level: user.level,
        })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

    if (!u) {
        const elapsed = Date.now() - start;
        if (elapsed < MIN_RESPONSE_TIME) {
            await sleep(MIN_RESPONSE_TIME - elapsed);
        }

        return NextResponse.json({
            user: false,
        });
    }

    const [credentialRow] = await db
        .select({ id: account.id })
        .from(account)
        .where(
            and(
                eq(account.userId, u.id),
                eq(account.providerId, "credential"),
            ),
        )
        .limit(1);

    const hasPassword = !!credentialRow;

    const [passkeyRow] = await db
        .select({ id: passkey.id })
        .from(passkey)
        .where(eq(passkey.userId, u.id))
        .limit(1);

    const hasPasskey = !!passkeyRow;

    const methods = {
        magicLink: true,
        password: hasPassword,
        passkey: hasPasskey,
    };

    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_TIME) {
        await sleep(MIN_RESPONSE_TIME - elapsed);
    }

    return NextResponse.json({
        user: true,
        methods
    });
}
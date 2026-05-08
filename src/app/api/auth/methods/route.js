import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema/entities/user";
import { account, passkey } from "@/db/schema/auth_schema";
import { eq, and } from "drizzle-orm";

const MIN_RESPONSE_TIME = 1000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isCompanyEmail(email) {
    return false;
}

export async function GET(request) {
    const start = Date.now();

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
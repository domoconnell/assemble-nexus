import { NextResponse } from "next/server";
import { auth } from "@/utils/auth/auth.js";
import { db } from "@/db";
import { account } from "@/db/schema/auth_schema";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

const SESSION_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const created = new Date(session.session.createdAt).getTime();
    if (Date.now() - created > SESSION_MAX_AGE_MS) {
        return NextResponse.json(
            { error: "Session too old. Please log in again first." },
            { status: 403 },
        );
    }

    const { newPassword } = await request.json();
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return NextResponse.json(
            { error: "Password must be at least 8 characters." },
            { status: 400 },
        );
    }

    const userId = session.user.id;

    // Check if user already has a credential account
    const [existing] = await db
        .select({ id: account.id })
        .from(account)
        .where(
            and(
                eq(account.userId, userId),
                eq(account.providerId, "credential"),
            ),
        )
        .limit(1);

    if (existing) {
        // Update existing password (server-side, no currentPassword needed)
        const hashedPassword = await hashPassword(newPassword);
        await db
            .update(account)
            .set({ password: hashedPassword })
            .where(eq(account.id, existing.id));
    } else {
        // Set new password via Better Auth's setPassword
        await auth.api.setPassword({
            body: { newPassword },
            headers: request.headers,
        });
    }

    return NextResponse.json({ status: true });
}

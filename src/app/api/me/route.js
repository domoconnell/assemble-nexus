import { auth } from "@/utils/auth/auth";
import { db } from "@/db";
import { user } from "@/db/schema/entities/user";
import { eq } from "drizzle-orm";

export async function GET(req) {
    const session = await auth.api.getSession({
        headers: Object.fromEntries(req.headers),
    });

    if (!session?.user) {
        return new Response(null, { status: 401 });
    }

    const [profile] = await db
        .select({
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            first_name: user.first_name,
            last_name: user.last_name,
            mobile_number: user.mobile_number,
            level: user.level,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);

    return Response.json(profile);
}

export async function PATCH(req) {
    const session = await auth.api.getSession({
        headers: Object.fromEntries(req.headers),
    });

    if (!session?.user) {
        return new Response(null, { status: 401 });
    }

    const { first_name, last_name, mobile_number } = await req.json();

    await db
        .update(user)
        .set({
            ...(first_name !== undefined && { first_name }),
            ...(last_name !== undefined && { last_name }),
            ...(mobile_number !== undefined && { mobile_number }),
        })
        .where(eq(user.id, session.user.id));

    return new Response(null, { status: 204 });
}

import { requireAuth, json } from "@/utils/auth/auth-guard";
import { db } from "@/db";
import { user } from "@/db/schema/entities/user";
import { isNull, asc } from "drizzle-orm";

export async function GET(req) {
    const gate = await requireAuth(req);
    if (!gate.ok) return gate.response;

    const users = await db
        .select({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
        })
        .from(user)
        .where(isNull(user.deletedAt))
        .orderBy(asc(user.first_name), asc(user.last_name));

    return json(200, users);
}

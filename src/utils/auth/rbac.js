import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/index.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role } from "@/db/schema/entities/role.js";
import { role_permission } from "@/db/schema/entities/role_permission.js";
import { permission } from "@/db/schema/entities/permission.js";

export async function getUserAccess(userId) {
    if (!userId) return { roles: [], permissions: [] };

    const roleRows = await db
        .select({ id: role.id, key: role.key })
        .from(user_role)
        .innerJoin(role, eq(user_role.role_id, role.id))
        .where(eq(user_role.user_id, userId));

    const roleIds = roleRows.map((r) => r.id);
    let permKeys = [];
    if (roleIds.length) {
        const permRows = await db
            .selectDistinct({ key: permission.key })
            .from(role_permission)
            .innerJoin(permission, eq(role_permission.permission_id, permission.id))
            .where(inArray(role_permission.role_id, roleIds));
        permKeys = permRows.map((p) => p.key);
    }

    return {
        roles: roleRows.map((r) => r.key),
        permissions: permKeys,
    };
}

function asArray(v) {
    if (v == null) return null;
    return Array.isArray(v) ? v : [v];
}

export function hasAnyRole(access, roleKeys) {
    const keys = asArray(roleKeys);
    if (!keys) return true;
    return keys.some((k) => access.roles.includes(k));
}

export function hasAnyPermission(access, permKeys) {
    const keys = asArray(permKeys);
    if (!keys) return true;
    return keys.some((k) => access.permissions.includes(k));
}

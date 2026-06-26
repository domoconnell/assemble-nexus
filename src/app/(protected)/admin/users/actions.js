"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { role } from "@/db/schema/entities/role.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { staffNotificationKeys } from "@/utils/email/subscriptions.js";
import { auth } from "@/utils/auth/auth.js";

const ADMIN_ROLE_KEY = "admin";

async function gate() {
	return requireServerSession({ redirectTo: "/auth/login" });
}

async function findRole(key) {
	const [row] = await db.select().from(role).where(eq(role.key, key)).limit(1);
	return row ?? null;
}

const UpdateSubsSchema = z.object({
	user_id: z.string().uuid(),
	subscriptions: z.record(z.string(), z.boolean()),
});

/**
 * Persist a user's per-template subscription map. Only keys defined in
 * the staff-notification catalog are kept - junk keys from the client
 * (or stale ones from removed templates) get filtered out so the row
 * doesn't accumulate noise.
 */
export async function updateUserEmailSubscriptionsAction(input) {
	await gate();
	const parsed = UpdateSubsSchema.parse(input);
	const allowed = new Set(staffNotificationKeys());
	const clean = {};
	for (const [k, v] of Object.entries(parsed.subscriptions)) {
		if (allowed.has(k)) clean[k] = !!v;
	}
	await db
		.update(user)
		.set({ email_subscriptions: clean })
		.where(eq(user.id, parsed.user_id));
	revalidatePath("/admin/users");
	revalidatePath("/admin/ledger/board-reports");
	return { ok: true };
}

const AddAdminSchema = z.object({
	email: z.string().email().max(254),
	first_name: z.string().min(1).max(80),
	last_name: z.string().max(80).optional().nullable(),
	send_welcome: z.boolean().optional().default(true),
});

/**
 * Promote (or create) a user to the admin role.
 *
 * 1. If a user already exists for `email` we just attach the admin role
 *    (idempotent - PK on (user_id, role_id) prevents duplicates).
 * 2. Otherwise we create a fresh user row, attach the admin role, and
 *    send a magic-link email so they can pick a password / sign in.
 *
 * Existing users keep their other roles; this is additive.
 */
export async function addAdminAction(input) {
	await gate();
	const parsed = AddAdminSchema.parse(input);
	const email = parsed.email.trim().toLowerCase();

	const adminRole = await findRole(ADMIN_ROLE_KEY);
	if (!adminRole) {
		throw new Error("The 'admin' role isn't seeded in this venue. Run `npm run db:seed` or contact support.");
	}

	let existing;
	const found = await db.select().from(user).where(eq(user.email, email)).limit(1);
	existing = found[0];
	let isNew = false;

	if (!existing) {
		const [inserted] = await db
			.insert(user)
			.values({
				email,
				first_name: parsed.first_name.trim(),
				last_name: (parsed.last_name ?? "").trim(),
				emailVerified: false,
				level: 1,
			})
			.returning();
		existing = inserted;
		isNew = true;
	}

	const [link] = await db
		.select()
		.from(user_role)
		.where(and(eq(user_role.user_id, existing.id), eq(user_role.role_id, adminRole.id)))
		.limit(1);
	if (!link) {
		await db.insert(user_role).values({
			user_id: existing.id,
			role_id: adminRole.id,
		});
	}

	let welcomeError = null;
	if (parsed.send_welcome) {
		try {
			// Trigger the existing magic-link flow - signInMagicLink generates
			// a one-time link and pipes it through the configured
			// `sendMagicLink` handler in auth.js (which renders the
			// `magic-link` SendGrid template).
			// Better Auth requires `headers` on every internal API call;
			// we forward the incoming request headers so the audit/rate
			// limit context is preserved.
			await auth.api.signInMagicLink({
				body: { email, callbackURL: "/admin/users" },
				headers: await headers(),
			});
		} catch (err) {
			welcomeError = err?.message || "Magic link send failed.";
			console.error("[admin add] magic-link send failed", err);
		}
	}

	revalidatePath("/admin/users");
	return {
		ok: true,
		user_id: existing.id,
		created: isNew,
		role_attached: !link,
		welcome_error: welcomeError,
	};
}

const RemoveAdminSchema = z.object({
	user_id: z.string().uuid(),
});

/**
 * Detach the admin role from a user. The user record stays - they
 * remain a delegate / hirer / whatever other roles they had.
 */
export async function removeAdminRoleAction(input) {
	await gate();
	const parsed = RemoveAdminSchema.parse(input);
	const adminRole = await findRole(ADMIN_ROLE_KEY);
	if (!adminRole) throw new Error("Admin role not found.");
	await db
		.delete(user_role)
		.where(and(eq(user_role.user_id, parsed.user_id), eq(user_role.role_id, adminRole.id)));
	revalidatePath("/admin/users");
	revalidatePath("/admin/ledger/board-reports");
	return { ok: true };
}

/**
 * Re-send a magic-link welcome to an existing admin. Useful when they
 * lost the original link or you want to nudge them through setup.
 */
export async function resendWelcomeAction(input) {
	await gate();
	const parsed = z.object({ email: z.string().email() }).parse(input);
	await auth.api.signInMagicLink({
		body: { email: parsed.email, callbackURL: "/admin/users" },
		headers: await headers(),
	});
	return { ok: true };
}

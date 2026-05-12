import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db/index.js";
import { bearer, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { sendTemplate } from "@/utils/email/email.service.js";
import * as authSchema from "@/db/schema/auth_schema.js";
import { user } from "@/db/schema/entities/user.js";
import { eq } from "drizzle-orm";

const isProd = process.env.NODE_ENV === "production";

export const auth = betterAuth({
    trustedOrigins: ["http://localhost:3000"],
    advanced: {
        cookiePrefix: process.env.APP_SHORT_NAME || "app",
    },
    user: {
        additionalFields: {
            level: {
                type: "number",
                required: true,
                defaultValue: 1,
                fieldName: "level",
            },
        },
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
    },
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            ...authSchema,
            user
        }
    }),
    plugins: [
        magicLink({
            disableSignUp: true,
            expiresIn: 15 * 60,
            sendMagicLink: async ({ email, url }) => {
                const [u] = await db
                    .select({
                        first_name: user.first_name,
                        last_name: user.last_name,
                    })
                    .from(user)
                    .where(eq(user.email, email))
                    .limit(1);

                await sendTemplate("magic-link", email, {
                    magicLink: url,
                    firstName: u?.first_name ?? "",
                    lastName: u?.last_name ?? "",
                });
            },
        }),
        passkey({
            rpID: isProd ? "nexus.app" : "localhost",
            rpName: "Nexus",
            origin: isProd ? "https://nexus.app" : "http://localhost:3000",

            authenticatorSelection: {
                authenticatorAttachment: "platform",
                userVerification: "preferred",
                residentKey: "preferred",
            },
            advanced: { webAuthnChallengeCookie: "nexus-passkey" },
        }),
        bearer(),
    ],
});
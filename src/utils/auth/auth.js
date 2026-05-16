import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db/index.js";
import { bearer, magicLink, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { sendTemplate } from "@/utils/email/email.service.js";
import * as authSchema from "@/db/schema/auth_schema.js";
import { user } from "@/db/schema/entities/user.js";
import { eq } from "drizzle-orm";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const baseUrlParsed = new URL(baseUrl);

export const auth = betterAuth({
    trustedOrigins: [baseUrlParsed.origin],
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
        // 6-digit OTP via email. Used by the booking + ticket-checkout flows
        // where the user is on mobile and clicking a magic link in an email
        // app's in-app browser would land the session cookie in the wrong
        // browser. OTP keeps the whole flow in the original tab.
        emailOTP({
            otpLength: 6,
            expiresIn: 10 * 60,
            sendVerificationOTP: async ({ email, otp, type }) => {
                if (type !== "sign-in") return;
                const [u] = await db
                    .select({
                        first_name: user.first_name,
                        last_name: user.last_name,
                    })
                    .from(user)
                    .where(eq(user.email, email))
                    .limit(1);

                // Log so engineers can copy the code while the SendGrid
                // template is being set up. safeSend silently no-ops when
                // the template ID is null.
                console.log(`[auth-otp] ${email} → ${otp}`);
                await sendTemplate("auth-otp", email, {
                    code: otp,
                    expires_in_minutes: 10,
                    firstName: u?.first_name ?? "",
                    lastName: u?.last_name ?? "",
                });
            },
        }),
        passkey({
            rpID: baseUrlParsed.hostname,
            rpName: "Nexus",
            origin: baseUrlParsed.origin,

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
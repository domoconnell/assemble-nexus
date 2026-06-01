import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db/index.js";
import { bearer, magicLink, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { sendTemplate } from "@/utils/email/email.service.js";
import * as authSchema from "@/db/schema/auth_schema.js";
import { user } from "@/db/schema/entities/user.js";
import { eq } from "drizzle-orm";
import { getCurrentVenue } from "@/db/queries/venue.js";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const baseUrlParsed = new URL(baseUrl);

export const auth = betterAuth({
    trustedOrigins: [baseUrlParsed.origin],
    advanced: {
        cookiePrefix: process.env.APP_SHORT_NAME || "app",
    },
    // Rate-limit auth endpoints. Plugin-level overrides on magic-link
    // (60s/5) and email-otp (60s/3) still apply. Memory-store is fine
    // for a single-dyno deploy; switch to `storage: "secondary-storage"`
    // with a Redis backend when we go multi-dyno.
    rateLimit: {
        enabled: true,
        window: 60,
        max: 30,
        // Tighter ceilings on the highest-risk endpoints than the plugin
        // defaults provide.
        customRules: {
            "/sign-in/magic-link": { window: 300, max: 5 },
            "/email-otp/send-verification-otp": { window: 300, max: 5 },
            "/magic-link/verify": { window: 60, max: 10 },
            "/sign-in/email": { window: 300, max: 10 },
        },
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
        // First sign-in is gated on the user clicking the verification
        // link sent to their address. The `emailVerification` config
        // below handles the send + sign-in-on-verify behaviour.
        requireEmailVerification: true,
    },
    emailVerification: {
        // Fire the verification email automatically on signup so we never
        // end up with a user who can't log in because no email was sent.
        sendOnSignUp: true,
        // After the user clicks the link we sign them in immediately and
        // bounce them on to the app. Skips an extra "now please sign in"
        // step.
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
            const venue = await getCurrentVenue();
            await sendTemplate("email-verification", user.email, {
                venue_name: venue?.name ?? "",
                verify_url: url,
                first_name: user.first_name ?? "",
                last_name: user.last_name ?? "",
            });
        },
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
                const venue = await getCurrentVenue();

                await sendTemplate("magic-link", email, {
                    venue_name: venue?.name ?? "",
                    magic_link: url,
                    first_name: u?.first_name ?? "",
                    last_name: u?.last_name ?? "",
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

                const venue = await getCurrentVenue();
                await sendTemplate("auth-otp", email, {
                    venue_name: venue?.name ?? "",
                    code: otp,
                    expires_in_minutes: 10,
                    first_name: u?.first_name ?? "",
                    last_name: u?.last_name ?? "",
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
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db/index.js";
import { bearer, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { sendEmail } from "@/services/sendgrid.service.js";
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
            sendMagicLink: async ({ email, url /*, token*/ }) => {

                console.log("Sending magic link to:", email, "->", url);

                const sendgridApiKey = process.env.SENDGRID_API_KEY;
                if (!sendgridApiKey) throw new Error("SENDGRID_API_KEY is not defined");


                const [u] = await db
                    .select({
                        first_name: user.first_name,
                        last_name: user.last_name,
                    })
                    .from(user)
                    .where(eq(user.email, email))
                    .limit(1);

                console.log("send magic link to user:", u);

                const dynamicTemplateData = {
                    magicLink: url,
                    firstName: u?.first_name ?? "",
                    lastName: u?.last_name ?? "",
                }
                console.log("dynamicTemplateData:", dynamicTemplateData);
                const msg = {
                    to: email,
                    from: "dom@webworks.marketing",
                    templateId: "d-af2103969dd34e3193dcca2dcf94d153",
                    dynamicTemplateData,
                    hideWarnings: true,
                };
                try {
                    await sendEmail(msg);
                } catch (err) {
                    throw new Error(err.message);
                }
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
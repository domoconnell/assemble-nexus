import sgMail from "@sendgrid/mail";
import { resolveEmailTemplateId } from "./templates.js";

let _sgConfigured = false;
function configureSendgrid() {
    if (_sgConfigured) return;
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error("SENDGRID_API_KEY is not set");
    sgMail.setApiKey(apiKey);
    _sgConfigured = true;
}

function resolveFromAddress() {
    const from = process.env.SENDGRID_FROM_EMAIL;
    if (!from) throw new Error("SENDGRID_FROM_EMAIL is not set");
    return from;
}

export async function sendTemplate(templateKey, to, dynamicData = {}, options = {}) {
    configureSendgrid();

    const msg = {
        to,
        from: options.from || resolveFromAddress(),
        templateId: resolveEmailTemplateId(templateKey),
        dynamicTemplateData: dynamicData,
        hideWarnings: true,
        ...(options.attachments ? { attachments: options.attachments } : {}),
    };

    try {
        await sgMail.send(msg);
    } catch (err) {
        const message = err?.response?.body?.errors?.[0]?.message || err?.message || "Failed to send email";
        throw new Error(message);
    }
}

export async function sendRaw({ to, subject, text, html, from, attachments }) {
    configureSendgrid();
    const msg = {
        to,
        from: from || resolveFromAddress(),
        subject,
        text,
        html,
        hideWarnings: true,
        ...(attachments ? { attachments } : {}),
    };
    await sgMail.send(msg);
}

// GET  /api/settings/email         — email provider status + sender identity
// POST /api/settings/email?action=test — send a test email through the active provider
//
// Provider credentials (API keys, SMTP host/user) are deployment env vars and
// are never echoed back — only whether they are present.
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { getEmailProvider, resolveFromAddress } from "@/lib/email";

const testSchema = z.object({ to: z.string().email() });

// Which env vars each provider needs (presence check only, values never read here).
function missingEnvFor(provider: string): string[] {
  const need: Record<string, string[]> = {
    console: [],
    resend: ["RESEND_API_KEY"],
    smtp: ["SMTP_HOST"],
    sendgrid: ["SENDGRID_API_KEY"],
    mailgun: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
    ses: ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  };
  return (need[provider] || []).filter((k) => !process.env[k]);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const { organization } = await requireAuth(req);
      const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
      const missing = missingEnvFor(provider);
      const [sent, failed, pending] = await Promise.all([
        prisma.emailLog.count({ where: { organizationId: organization.id, status: { in: ["SENT", "DELIVERED"] } } }),
        prisma.emailLog.count({ where: { organizationId: organization.id, status: { in: ["FAILED", "BOUNCED"] } } }),
        prisma.emailLog.count({
          where: { organizationId: organization.id, status: { in: ["PENDING", "QUEUED", "SENDING", "RETRYING"] } },
        }),
      ]);
      return res.status(200).json({
        provider,
        configured: missing.length === 0,
        missing,
        envFrom: {
          address: process.env.EMAIL_FROM || null,
          name: process.env.EMAIL_FROM_NAME || null,
        },
        orgFrom: {
          address: organization.emailFromAddress,
          name: organization.emailFromName,
        },
        // What the From header resolves to for this organization right now.
        effectiveFrom: resolveFromAddress(organization.emailFromAddress || undefined),
        stats: { sent, failed, pending },
      });
    }

    if (req.method === "POST" && req.query.action === "test") {
      const me = await requireRole(req, "EDITOR");
      const parsed = testSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "A valid recipient email is required" });

      const provider = getEmailProvider();
      const org = me.organization;
      const from = org.emailFromAddress
        ? org.emailFromName
          ? `${org.emailFromName} <${org.emailFromAddress}>`
          : org.emailFromAddress
        : undefined;

      try {
        const result = await provider.send({
          to: parsed.data.to,
          subject: "AutoCert test email",
          html: [
            "<p>Hello,</p>",
            "<p>This is a test email from <strong>AutoCert</strong> — your provider is working.</p>",
            `<p>Sent by organization: <strong>${org.name}</strong></p>`,
            "<p>Certificate regards,<br/>AutoCert</p>",
          ].join(""),
          text: "This is a test email from AutoCert — your provider is working.",
          from,
        });
        return res.status(200).json({
          ok: true,
          provider: result.provider,
          messageId: result.messageId,
          note:
            result.provider === "console"
              ? "EMAIL_PROVIDER=console — the email was written to the server log instead of being sent."
              : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Send failed";
        return res.status(502).json({ error: message });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/settings/email]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

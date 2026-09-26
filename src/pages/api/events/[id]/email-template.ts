// GET/PUT /api/events/:id/email-template — editable subject/body with variables
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { user, organization } = await requireAuth(req);
    const { id } = req.query as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, organizationId: organization.id },
      include: { emailTemplate: true },
    });
    if (!event) throw new ApiError(404, "Event not found");

    if (req.method === "GET") {
      return res.status(200).json({
        emailTemplate:
          event.emailTemplate || {
            subject: "Your {{CERTIFICATE_TYPE}} – {{EVENT_NAME}}",
            body: `Dear {{Name}},\n\nThank you for participating in {{EVENT_NAME}}.\n\nPlease find your certificate attached.\n\nCertificate ID: {{CERTIFICATE_ID}}\nVerify online: {{VERIFICATION_URL}}\n\nRegards,\n{{ORGANIZATION}}`,
          },
      });
    }

    if (req.method === "PUT") {
      await requireRole(req, "EDITOR");
      const { subject, body } = req.body as { subject?: string; body?: string };
      if (!subject || !body) throw new ApiError(400, "Subject and body are required");
      const saved = await prisma.emailTemplate.upsert({
        where: { eventId: event.id },
        create: { organizationId: organization.id, eventId: event.id, subject, body },
        update: { subject, body },
      });
      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "email_template.updated",
        entityType: "Event",
        entityId: event.id,
        req,
      });
      return res.status(200).json({ emailTemplate: saved });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/email-template]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

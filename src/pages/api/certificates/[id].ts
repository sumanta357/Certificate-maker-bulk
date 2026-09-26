// GET /api/certificates/:id — certificate + participant detail
// POST /api/certificates/:id — { action: resend | regenerate | revoke | unrevoke }
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string };
    const { user, organization } = await requireAuth(req);

    const participant = await prisma.participant.findFirst({
      where: {
        AND: [
          { certificateId: id },
          { organizationId: organization.id },
        ],
      },
      include: { certificate: true, event: { include: { emailTemplate: true } } },
    });
    if (!participant || !participant.certificate) throw new ApiError(404, "Certificate not found");

    if (req.method === "GET") {
      return res.status(200).json({
        certificate: {
          ...participant.certificate,
          participant: { id: participant.id, name: participant.name, email: participant.email },
          eventName: participant.event.name,
        },
      });
    }

    if (req.method === "POST") {
      const { action, reason } = req.body as { action?: string; reason?: string };

      if (action === "revoke") {
        await requireRole(req, "ADMIN");
        await prisma.certificate.update({
          where: { id: participant.certificate.id },
          data: { revokedAt: new Date(), revokeReason: reason || "Revoked by administrator" },
        });
        await prisma.participant.update({
          where: { id: participant.id },
          data: { status: "REVOKED", statusMessage: "Certificate revoked" },
        });
        await audit({
          organizationId: organization.id,
          userId: user.id,
          action: "certificate.revoked",
          entityType: "Certificate",
          entityId: participant.certificate.certificateId,
          metadata: { reason },
          req,
        });
        return res.status(200).json({ ok: true });
      }

      if (action === "unrevoke") {
        await requireRole(req, "ADMIN");
        await prisma.certificate.update({
          where: { id: participant.certificate.id },
          data: { revokedAt: null, revokeReason: null },
        });
        await prisma.participant.update({
          where: { id: participant.id },
          data: { status: "SENT", statusMessage: null },
        });
        return res.status(200).json({ ok: true });
      }

      if (action === "resend") {
        await requireRole(req, "EDITOR");
        if (!participant.email) throw new ApiError(400, "Participant has no email address");
        const event = participant.event;
        const emailJob = await prisma.emailJob.create({
          data: {
            organizationId: organization.id,
            eventId: event.id,
            status: "QUEUED",
            total: 1,
            createdById: user.id,
          },
        });
        await prisma.emailLog.create({
          data: {
            organizationId: organization.id,
            emailJobId: emailJob.id,
            participantId: participant.id,
            certificateId: participant.certificateId,
            to: participant.email,
            subject: event.emailTemplate?.subject || "Your certificate",
            status: "PENDING",
          },
        });
        await enqueue("send-emails", { emailJobId: emailJob.id });
        await audit({
          organizationId: organization.id,
          userId: user.id,
          action: "certificate.resent",
          entityType: "Certificate",
          entityId: participant.certificateId || "",
          req,
        });
        return res.status(202).json({ ok: true, emailJobId: emailJob.id });
      }

      if (action === "regenerate") {
        await requireRole(req, "EDITOR");
        await prisma.certificate.delete({ where: { id: participant.certificate.id } });
        await prisma.participant.update({
          where: { id: participant.id },
          data: { certificateId: null, status: "PENDING", error: null },
        });
        await enqueue("generate-certificates", {
          eventId: participant.eventId,
          organizationId: organization.id,
          participantIds: [participant.id],
          triggeredBy: user.id,
        });
        return res.status(202).json({ ok: true });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/certificates/:id]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

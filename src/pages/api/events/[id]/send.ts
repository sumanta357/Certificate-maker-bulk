// POST /api/events/:id/send — queue the email batch (test mode or real)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user, organization } = await requireRole(req, "EDITOR");
    const { id } = req.query as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, organizationId: organization.id },
      include: { emailTemplate: true },
    });
    if (!event) throw new ApiError(404, "Event not found");

    const { testMode, testEmail, participantIds } = req.body as {
      testMode?: boolean;
      testEmail?: string;
      participantIds?: string[];
    };

    if (testMode) {
      if (!testEmail) throw new ApiError(400, "testEmail is required in test mode");
      // One representative participant with a generated certificate.
      const sample = await prisma.participant.findFirst({
        where: {
          eventId: event.id,
          certificateId: { not: null },
          ...(participantIds?.length ? { id: { in: participantIds } } : {}),
        },
        include: { certificate: true },
      });
      if (!sample) throw new ApiError(400, "Generate certificates first — nothing to preview");

      const emailJob = await prisma.emailJob.create({
        data: {
          organizationId: organization.id,
          eventId: event.id,
          status: "QUEUED",
          total: 1,
          testMode: true,
          testEmail,
          createdById: user.id,
        },
      });
      await prisma.emailLog.create({
        data: {
          organizationId: organization.id,
          emailJobId: emailJob.id,
          participantId: sample.id,
          certificateId: sample.certificateId,
          to: sample.email || testEmail,
          subject: event.emailTemplate?.subject || "Certificate",
          status: "PENDING",
        },
      });

      await enqueue("send-emails", { emailJobId: emailJob.id });
      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "email.test_sent",
        entityType: "Event",
        entityId: event.id,
        metadata: { testEmail },
        req,
      });
      return res.status(202).json({ queued: 1, testMode: true, emailJobId: emailJob.id });
    }

    // Real batch: only participants with generated certs and valid emails.
    const targets = await prisma.participant.findMany({
      where: {
        eventId: event.id,
        certificateId: { not: null },
        ...(participantIds?.length ? { id: { in: participantIds } } : {}),
      },
      include: { certificate: { select: { certificateId: true } } },
    });
    const valid = targets.filter((p) => p.email);
    if (!valid.length) throw new ApiError(400, "No generated certificates with valid recipient emails");

    const emailJob = await prisma.emailJob.create({
      data: {
        organizationId: organization.id,
        eventId: event.id,
        status: "QUEUED",
        total: valid.length,
        testMode: false,
        createdById: user.id,
      },
    });
    await prisma.emailLog.createMany({
      data: valid.map((p) => ({
        organizationId: organization.id,
        emailJobId: emailJob.id,
        participantId: p.id,
        certificateId: p.certificate?.certificateId,
        to: p.email!,
        subject: event.emailTemplate?.subject || "Certificate",
        status: "PENDING",
      })),
    });

    await enqueue("send-emails", { emailJobId: emailJob.id });

    await audit({
      organizationId: organization.id,
      userId: user.id,
      action: "email.batch_queued",
      entityType: "Event",
      entityId: event.id,
      metadata: { count: valid.length },
      req,
    });

    return res.status(202).json({ queued: valid.length, emailJobId: emailJob.id });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events/:id/send]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/events/:id/generate — queue certificate generation for the event
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
    const event = await prisma.event.findFirst({ where: { id, organizationId: organization.id } });
    if (!event) throw new ApiError(404, "Event not found");
    if (!event.templateId) throw new ApiError(400, "Select a certificate template first");

    const { participantIds, mode } = req.body as {
      participantIds?: string[];
      mode?: "skip" | "regenerate" | "replace";
    };

    // If regenerating, clear existing certificate rows for selected participants.
    if (mode === "regenerate" && participantIds?.length) {
      const certs = await prisma.certificate.findMany({
        where: { participantId: { in: participantIds }, organizationId: organization.id },
      });
      if (certs.length) {
        await prisma.certificate.deleteMany({
          where: { id: { in: certs.map((c) => c.id) } },
        });
        await prisma.participant.updateMany({
          where: { id: { in: certs.map((c) => c.participantId) } },
          data: { certificateId: null, status: "PENDING", error: null },
        });
      }
    }

    const pendingCount = await prisma.participant.count({
      where: {
        eventId: event.id,
        organizationId: organization.id,
        status: "PENDING",
        certificateId: null,
        ...(participantIds?.length ? { id: { in: participantIds } } : {}),
      },
    });
    if (!pendingCount) throw new ApiError(400, "No pending participants to generate");

    await prisma.participant.updateMany({
      where: {
        eventId: event.id,
        status: "PENDING",
        certificateId: null,
        ...(participantIds?.length ? { id: { in: participantIds } } : {}),
      },
      data: { status: "QUEUED" },
    });

    await enqueue("generate-certificates", {
      eventId: event.id,
      organizationId: organization.id,
      triggeredBy: user.id,
    });

    await audit({
      organizationId: organization.id,
      userId: user.id,
      action: "certificates.generate_queued",
      entityType: "Event",
      entityId: event.id,
      metadata: { count: pendingCount },
      req,
    });

    return res.status(202).json({ queued: pendingCount });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events/:id/generate]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

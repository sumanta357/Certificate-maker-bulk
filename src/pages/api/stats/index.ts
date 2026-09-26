// GET /api/stats — dashboard statistics for the organization
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { organization } = await requireAuth(req);
    const orgId = organization.id;

    const [totalEvents, totalParticipants, generated, sent, pending, failed, verified, revoked] =
      await Promise.all([
        prisma.event.count({ where: { organizationId: orgId } }),
        prisma.participant.count({ where: { organizationId: orgId } }),
        prisma.participant.count({ where: { organizationId: orgId, status: { in: ["GENERATED", "QUEUED", "SENDING", "SENT"] } } }),
        prisma.participant.count({ where: { organizationId: orgId, status: "SENT" } }),
        prisma.participant.count({ where: { organizationId: orgId, status: { in: ["PENDING", "QUEUED", "GENERATING"] } } }),
        prisma.participant.count({ where: { organizationId: orgId, status: "FAILED" } }),
        prisma.verification.count({ where: { organizationId: orgId, result: "VALID" } }),
        prisma.certificate.count({ where: { organizationId: orgId, revokedAt: { not: null } } }),
      ]);

    const recentEvents = await prisma.event.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { participants: true } } },
    });

    const recentAudit = await prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } } },
    });

    return res.status(200).json({
      stats: { totalEvents, totalParticipants, generated, sent, pending, failed, verified, revoked },
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        name: e.name,
        participants: e._count.participants,
        updatedAt: e.updatedAt,
      })),
      recentAudit,
    });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/stats]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

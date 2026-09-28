// GET /api/admin/overview — platform-wide statistics for the super admin console.
// Guarded by SUPER_ADMIN: this is the only surface that crosses organization
// boundaries (multi-tenant break-glass view).
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireRole, ApiError } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireRole(req, "SUPER_ADMIN");

    const [
      organizations,
      users,
      activeUsers,
      events,
      participants,
      generated,
      sent,
      failed,
      verifications,
      revoked,
      orgsWithCounts,
      participantsByOrg,
      sentByOrg,
      recentAudit,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.event.count(),
      prisma.participant.count(),
      prisma.participant.count({ where: { status: { in: ["GENERATED", "QUEUED", "SENDING", "SENT"] } } }),
      prisma.participant.count({ where: { status: "SENT" } }),
      prisma.participant.count({ where: { status: "FAILED" } }),
      prisma.verification.count({ where: { result: "VALID" } }),
      prisma.certificate.count({ where: { revokedAt: { not: null } } }),
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { users: true, events: true } },
        },
      }),
      prisma.participant.groupBy({ by: ["organizationId"], _count: { _all: true } }),
      prisma.participant.groupBy({
        by: ["organizationId"],
        where: { status: "SENT" },
        _count: { _all: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          user: { select: { name: true, email: true } },
          organization: { select: { name: true } },
        },
      }),
    ]);

    const partsMap = new Map(participantsByOrg.map((r) => [r.organizationId, r._count._all]));
    const sentMap = new Map(sentByOrg.map((r) => [r.organizationId, r._count._all]));

    const orgs = orgsWithCounts.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      users: o._count.users,
      events: o._count.events,
      participants: partsMap.get(o.id) ?? 0,
      sent: sentMap.get(o.id) ?? 0,
    }));

    return res.status(200).json({
      totals: {
        organizations,
        users,
        activeUsers,
        events,
        participants,
        generated,
        sent,
        failed,
        verifications,
        revoked,
      },
      orgs,
      recentAudit,
    });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/admin/overview]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

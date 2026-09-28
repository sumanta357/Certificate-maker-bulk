// GET   /api/admin/organizations/:id — full drill-down of one organization
//         (settings, users, data stats, recent events / email jobs / audit)
// PATCH /api/admin/organizations/:id — manage the organization's settings,
//         including its per-org email sender identity.
// Both require SUPER_ADMIN.
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { optionalEmail } from "@/lib/utils";

const patchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  website: z.string().max(300).nullable().optional(),
  contactEmail: optionalEmail,
  address: z.string().max(500).nullable().optional(),
  emailSignature: z.string().max(2000).nullable().optional(),
  idPrefix: z.string().max(16).optional(),
  emailFromAddress: optionalEmail,
  emailFromName: z.string().max(120).nullable().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await requireRole(req, "SUPER_ADMIN");
    const { id } = req.query as { id: string };

    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) throw new ApiError(404, "Organization not found");

    if (req.method === "GET") {
      const [users, recentEvents, statusGroups, certs, revoked, verifications, recentEmailJobs, recentAudit] =
        await Promise.all([
          prisma.user.findMany({
            where: { organizationId: id },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
          }),
          prisma.event.findMany({
            where: { organizationId: id },
            orderBy: { updatedAt: "desc" },
            take: 10,
            include: { _count: { select: { participants: true } } },
          }),
          prisma.participant.groupBy({
            by: ["status"],
            where: { organizationId: id },
            _count: { _all: true },
          }),
          prisma.certificate.count({ where: { organizationId: id } }),
          prisma.certificate.count({ where: { organizationId: id, revokedAt: { not: null } } }),
          prisma.verification.count({ where: { organizationId: id, result: "VALID" } }),
          prisma.emailJob.findMany({
            where: { organizationId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { event: { select: { name: true } } },
          }),
          prisma.auditLog.findMany({
            where: { organizationId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { user: { select: { name: true, email: true } } },
          }),
        ]);

      const statusCounts: Record<string, number> = {};
      let participants = 0;
      for (const g of statusGroups) {
        statusCounts[g.status] = g._count._all;
        participants += g._count._all;
      }

      return res.status(200).json({
        organization: org,
        users,
        stats: {
          events: await prisma.event.count({ where: { organizationId: id } }),
          participants,
          statusCounts,
          generated: participants - (statusCounts.PENDING ?? 0),
          sent: statusCounts.SENT ?? 0,
          failed: statusCounts.FAILED ?? 0,
          certificates: certs,
          revoked,
          verifications,
        },
        recentEvents: recentEvents.map((e) => ({
          id: e.id,
          name: e.name,
          certificateType: e.certificateType,
          participants: e._count.participants,
          updatedAt: e.updatedAt,
        })),
        recentEmailJobs: recentEmailJobs.map((j) => ({
          id: j.id,
          eventName: j.event.name,
          status: j.status,
          total: j.total,
          sent: j.sent,
          failed: j.failed,
          testMode: j.testMode,
          createdAt: j.createdAt,
        })),
        recentAudit,
      });
    }

    if (req.method === "PATCH") {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
      const updated = await prisma.organization.update({ where: { id }, data: parsed.data });
      await audit({
        organizationId: id,
        userId: me.user.id,
        action: "admin.organization_updated",
        entityType: "Organization",
        entityId: id,
        req,
      });
      return res.status(200).json({ organization: updated });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/admin/organizations/:id]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

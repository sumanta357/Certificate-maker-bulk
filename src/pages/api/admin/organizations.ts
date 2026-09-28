// GET /api/admin/organizations — list every organization with usage counts.
// Requires SUPER_ADMIN.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireRole, ApiError } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireRole(req, "SUPER_ADMIN");

    const search = ((req.query.search as string) || "").trim().toLowerCase();

    const [orgs, participantsByOrg, sentByOrg, certsByOrg] = await Promise.all([
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          website: true,
          contactEmail: true,
          idPrefix: true,
          emailFromAddress: true,
          emailFromName: true,
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
      prisma.certificate.groupBy({ by: ["organizationId"], _count: { _all: true } }),
    ]);

    const map = (rows: { organizationId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.organizationId, r._count._all]));
    const parts = map(participantsByOrg);
    const sent = map(sentByOrg);
    const certs = map(certsByOrg);

    let rows = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      website: o.website,
      contactEmail: o.contactEmail,
      idPrefix: o.idPrefix,
      emailFromAddress: o.emailFromAddress,
      emailFromName: o.emailFromName,
      createdAt: o.createdAt,
      users: o._count.users,
      events: o._count.events,
      participants: parts.get(o.id) ?? 0,
      sent: sent.get(o.id) ?? 0,
      certificates: certs.get(o.id) ?? 0,
    }));

    if (search) rows = rows.filter((o) => o.name.toLowerCase().includes(search) || o.slug.includes(search));

    return res.status(200).json({ organizations: rows });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/admin/organizations]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

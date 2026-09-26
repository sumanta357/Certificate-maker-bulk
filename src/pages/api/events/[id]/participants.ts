// GET /api/events/:id/participants — search/filter/sort/paginate
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { organization } = await requireAuth(req);
    const { id } = req.query as { id: string };
    const event = await prisma.event.findFirst({ where: { id, organizationId: organization.id } });
    if (!event) throw new ApiError(404, "Event not found");

    const url = req.query;
    const q = typeof url.q === "string" ? url.q.trim() : "";
    const status = typeof url.status === "string" && url.status !== "ALL" ? url.status : undefined;
    const page = Math.max(1, Number(url.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(url.pageSize) || 25));
    const sortBy = (typeof url.sortBy === "string" ? url.sortBy : "createdAt") as string;
    const sortDir = url.sortDir === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = { eventId: event.id };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { certificateId: { contains: q } },
      ];
    }
    if (status) where.status = status;
    if (url.importId) where.importId = url.importId;

    const orderBy: Record<string, "asc" | "desc"> = /[a-zA-Z]/.test(sortBy) && ["name", "email", "status", "createdAt", "rowNumber"].includes(sortBy)
      ? { [sortBy]: sortDir }
      : { createdAt: "desc" };

    const [items, total] = await Promise.all([
      prisma.participant.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { certificate: { select: { pdfKey: true, revokedAt: true } } },
      }),
      prisma.participant.count({ where }),
    ]);

    // Safe computed stats (avoid raw SQL injection concerns):
    const statusCounts: Record<string, number> = {};
    const all = await prisma.participant.findMany({
      where: { eventId: event.id },
      select: { status: true },
    });
    for (const p of all) statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;

    const itemsSanitized = items.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      certificateId: p.certificateId,
      status: p.status,
      error: p.error,
      statusMessage: p.statusMessage,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      data: JSON.parse(String(p.data || "{}")),
      hasPdf: !!p.certificate?.pdfKey,
      revoked: !!p.certificate?.revokedAt,
    }));

    return res.status(200).json({ participants: itemsSanitized, total, page, pageSize, statusCounts });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/participants]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

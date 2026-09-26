// GET/PATCH/DELETE /api/events/:id
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { optionalEmail } from "@/lib/utils";

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  organizationDisplay: z.string().max(200).nullable().optional(),
  eventDate: z.string().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  organizer: z.string().max(160).nullable().optional(),
  certificateType: z.string().max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  contactEmail: optionalEmail,
  idPrefix: z.string().max(16).optional(),
  testMode: z.boolean().optional(),
  testEmail: optionalEmail,
  templateId: z.string().nullable().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string };
    const { user, organization } = await requireAuth(req);

    const event = await prisma.event.findFirst({
      where: { id, organizationId: organization.id },
      include: { template: { include: { activeVersion: { select: { id: true, version: true } } } }, _count: { select: { participants: true } } },
    });
    if (!event) throw new ApiError(404, "Event not found");

    if (req.method === "GET") return res.status(200).json({ event });

    if (req.method === "PATCH") {
      requireRole(req, "EDITOR");
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const d = parsed.data;
      const updated = await prisma.event.update({
        where: { id: event.id },
        data: {
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.organizationDisplay !== undefined ? { organizationDisplay: d.organizationDisplay } : {}),
          ...(d.eventDate !== undefined ? { eventDate: d.eventDate ? new Date(d.eventDate) : null } : {}),
          ...(d.location !== undefined ? { location: d.location } : {}),
          ...(d.organizer !== undefined ? { organizer: d.organizer } : {}),
          ...(d.certificateType !== undefined ? { certificateType: d.certificateType } : {}),
          ...(d.description !== undefined ? { description: d.description as string | null } : {}),
          ...(d.website !== undefined ? { website: d.website } : {}),
          ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail } : {}),
          ...(d.idPrefix !== undefined ? { idPrefix: d.idPrefix } : {}),
          ...(d.testMode !== undefined ? { testMode: d.testMode } : {}),
          ...(d.testEmail !== undefined ? { testEmail: d.testEmail } : {}),
          ...(d.templateId !== undefined ? { templateId: d.templateId } : {}),
          updatedAt: new Date(),
        },
      });
      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "event.updated",
        entityType: "Event",
        entityId: event.id,
        req,
      });
      return res.status(200).json({ event: updated });
    }

    if (req.method === "DELETE") {
      await requireRole(req, "ADMIN");
      await prisma.event.delete({ where: { id: event.id } });
      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "event.deleted",
        entityType: "Event",
        entityId: event.id,
        req,
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events/:id]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

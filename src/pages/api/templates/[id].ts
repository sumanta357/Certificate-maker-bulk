// GET/PATCH/DELETE /api/templates/:id
// PATCH saves a NEW version when the design changes (versioning requirement).
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string };
    const { user, organization } = await requireAuth(req);
    const template = await prisma.template.findFirst({
      where: { id, organizationId: organization.id },
      include: { activeVersion: true },
    });
    if (!template) throw new ApiError(404, "Template not found");

    if (req.method === "GET") {
      const versions = await prisma.templateVersion.findMany({
        where: { templateId: template.id },
        orderBy: { version: "desc" },
        select: { id: true, version: true, note: true, createdAt: true },
      });
      return res.status(200).json({ template, versions });
    }

    if (req.method === "PATCH") {
      await requireRole(req, "EDITOR");
      const { name, description, isFavorite, design, designBaseVersionId, note } = req.body as {
        name?: string;
        description?: string;
        isFavorite?: boolean;
        design?: unknown;
        designBaseVersionId?: string;
        note?: string;
      };

      // Design update → new immutable version.
      if (design !== undefined) {
        const designStr = typeof design === "string" ? design : JSON.stringify(design);
        const baseId = designBaseVersionId || template.activeVersionId;
        const base = baseId
          ? await prisma.templateVersion.findFirst({ where: { id: baseId, templateId: template.id } })
          : null;
        const changed = !base || String(base.design) !== designStr;
        if (changed) {
          const latest = await prisma.templateVersion.findFirst({
            where: { templateId: template.id },
            orderBy: { version: "desc" },
          });
          const nextVersion = (latest?.version || 0) + 1;
          const v = await prisma.templateVersion.create({
            data: {
              templateId: template.id,
              version: nextVersion,
              design: designStr,
              note: note || `Edited from v${base?.version ?? 1}`,
            },
          });
          await prisma.template.update({ where: { id: template.id }, data: { activeVersionId: v.id } });
        }
      }

      const updated = await prisma.template.update({
        where: { id: template.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(isFavorite !== undefined ? { isFavorite } : {}),
        },
      });

      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "template.updated",
        entityType: "Template",
        entityId: template.id,
        metadata: { name: updated.name, designChanged: design !== undefined },
        req,
      });
      return res.status(200).json({ template: updated });
    }

    if (req.method === "DELETE") {
      await requireRole(req, "ADMIN");
      if (template.isBuiltIn) throw new ApiError(400, "Starter templates cannot be deleted; duplicate it instead");
      const inUse = await prisma.event.count({ where: { templateId: template.id } });
      if (inUse > 0) throw new ApiError(409, `Template is used by ${inUse} event(s) — detach it first`);
      await prisma.template.delete({ where: { id: template.id } });
      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "template.deleted",
        entityType: "Template",
        entityId: template.id,
        req,
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/templates/:id]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

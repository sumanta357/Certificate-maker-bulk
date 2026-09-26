// GET /api/templates — list organization templates (+ built-ins seeded on first call)
// POST /api/templates — create template from starter key or blank design
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { STARTER_TEMPLATES } from "@/lib/templates";
import { defaultDesign } from "@/lib/design";

async function ensureStarters(organizationId: string) {
  const existing = await prisma.template.count({ where: { organizationId, isBuiltIn: true } });
  if (existing >= STARTER_TEMPLATES.length) return;

  for (const starter of STARTER_TEMPLATES) {
    const exists = await prisma.template.findFirst({
      where: { organizationId, isBuiltIn: true, name: starter.name },
    });
    if (exists) continue;
    const design = starter.design();
    const tpl = await prisma.template.create({
      data: {
        organizationId,
        name: starter.name,
        description: starter.description,
        isBuiltIn: true,
      },
    });
    const version = await prisma.templateVersion.create({
      data: { templateId: tpl.id, version: 1, design: JSON.stringify(design), note: "Starter template" },
    });
    await prisma.template.update({ where: { id: tpl.id }, data: { activeVersionId: version.id } });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { user, organization } = await requireAuth(req);

    if (req.method === "GET") {
      await ensureStarters(organization.id);
      const templates = await prisma.template.findMany({
        where: { organizationId: organization.id },
        orderBy: [{ isBuiltIn: "desc" }, { updatedAt: "desc" }],
        include: {
          activeVersion: { select: { id: true, version: true, createdAt: true } },
          _count: { select: { versions: true } },
        },
      });
      return res.status(200).json({ templates });
    }

    if (req.method === "POST") {
      await requireRole(req, "EDITOR");
      const { name, description, starterKey, design, makeCopyOf } = req.body as {
        name?: string;
        description?: string;
        starterKey?: string;
        design?: unknown;
        makeCopyOf?: string;
      };

      let designJson: string;
      let desc = description || "";
      if (starterKey) {
        const starter = STARTER_TEMPLATES.find((s) => s.key === starterKey);
        if (!starter) throw new ApiError(400, "Unknown starter template");
        designJson = JSON.stringify(starter.design());
        desc = starter.description;
      } else if (makeCopyOf) {
        const src = await prisma.template.findFirst({
          where: { id: makeCopyOf, organizationId: organization.id },
          include: { activeVersion: true },
        });
        if (!src) throw new ApiError(404, "Source template not found");
        designJson = String(src.activeVersion?.design || JSON.stringify(defaultDesign()));
      } else if (design) {
        designJson = JSON.stringify(design);
      } else {
        designJson = JSON.stringify(defaultDesign());
      }

      const tpl = await prisma.template.create({
        data: {
          organizationId: organization.id,
          name: name || "Untitled template",
          description: desc,
          isBuiltIn: false,
        },
      });
      const version = await prisma.templateVersion.create({
        data: { templateId: tpl.id, version: 1, design: designJson, note: "Initial version" },
      });
      await prisma.template.update({ where: { id: tpl.id }, data: { activeVersionId: version.id } });

      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "template.created",
        entityType: "Template",
        entityId: tpl.id,
        metadata: { name: tpl.name },
        req,
      });

      return res.status(201).json({ template: { ...tpl, activeVersionId: version.id } });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/templates]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// GET/PATCH /api/settings — organization branding + profile + password change
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, hashPassword, verifyPassword, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { optionalEmail } from "@/lib/utils";

const orgSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  website: z.string().max(300).nullable().optional(),
  contactEmail: optionalEmail,
  address: z.string().max(500).nullable().optional(),
  emailSignature: z.string().max(2000).nullable().optional(),
  idPrefix: z.string().max(16).optional(),
  logoAssetId: z.string().nullable().optional(),
  // Per-organization sender identity (used as the From: header for
  // certificate emails). Must be a valid address; the sending domain has to
  // be verified on the deployment's email provider or delivery will fail.
  emailFromAddress: optionalEmail,
  emailFromName: z.string().max(120).nullable().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { user, organization } = await requireAuth(req);

    if (req.method === "GET") {
      const users = await prisma.user.findMany({
        where: { organizationId: organization.id },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      return res.status(200).json({ organization, users, me: { id: user.id, role: user.role } });
    }

    if (req.method === "PATCH") {
      const section = (req.query.section as string) || "organization";

      if (section === "organization") {
        await requireRole(req, "ADMIN");
        const parsed = orgSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
        const updated = await prisma.organization.update({
          where: { id: organization.id },
          data: parsed.data,
        });
        await audit({
          organizationId: organization.id,
          userId: user.id,
          action: "settings.updated",
          req,
        });
        return res.status(200).json({ organization: updated });
      }

      if (section === "password") {
        const { currentPassword, newPassword } = req.body as {
          currentPassword?: string;
          newPassword?: string;
        };
        if (!currentPassword || !newPassword || newPassword.length < 8) {
          return res.status(400).json({ error: "Current and new password (min 8 chars) required" });
        }
        const ok = await verifyPassword(currentPassword, user.passwordHash);
        if (!ok) return res.status(400).json({ error: "Current password is incorrect" });
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(newPassword) },
        });
        await audit({ organizationId: organization.id, userId: user.id, action: "password.changed", req });
        return res.status(200).json({ ok: true });
      }

      if (section === "user") {
        await requireRole(req, "ADMIN");
        const { userId, role, isActive } = req.body as {
          userId?: string;
          role?: string;
          isActive?: boolean;
        };
        if (!userId) return res.status(400).json({ error: "userId required" });
        if (userId === user.id && isActive === false) {
          return res.status(400).json({ error: "You cannot deactivate your own account" });
        }
        const target = await prisma.user.findFirst({ where: { id: userId, organizationId: organization.id } });
        if (!target) return res.status(404).json({ error: "User not found" });
        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            ...(role ? { role: role as never } : {}),
            ...(isActive !== undefined ? { isActive } : {}),
          },
        });
        await audit({
          organizationId: organization.id,
          userId: user.id,
          action: "user.updated",
          entityType: "User",
          entityId: userId,
          req,
        });
        return res.status(200).json({ user: { id: updated.id, role: updated.role, isActive: updated.isActive } });
      }

      return res.status(400).json({ error: "Unknown section" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/settings]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

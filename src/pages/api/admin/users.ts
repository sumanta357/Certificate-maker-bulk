// GET    /api/admin/users            — list every user across organizations
// PATCH  /api/admin/users            — change a user's role / active state
// DELETE /api/admin/users?id=        — delete a user
// All methods require SUPER_ADMIN.
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
});

async function assertNotLastSuperAdmin(targetId: string, action: "demote" | "deactivate" | "delete") {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, "User not found");
  if (target.role !== "SUPER_ADMIN") return target;
  const others = await prisma.user.count({
    where: { role: "SUPER_ADMIN", isActive: true, id: { not: targetId } },
  });
  if (others === 0) {
    throw new ApiError(400, `Cannot ${action} the last active Super Admin — promote another user first`);
  }
  return target;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await requireRole(req, "SUPER_ADMIN");

    if (req.method === "GET") {
      const search = ((req.query.search as string) || "").trim().toLowerCase();
      const users = await prisma.user.findMany({
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      });
      const filtered = search
        ? users.filter(
            (u) =>
              u.email.toLowerCase().includes(search) ||
              (u.name || "").toLowerCase().includes(search) ||
              u.organization.name.toLowerCase().includes(search)
          )
        : users;
      return res.status(200).json({ users: filtered });
    }

    if (req.method === "PATCH") {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
      const { userId, role, isActive } = parsed.data;

      if (userId === me.user.id) {
        if (isActive === false) return res.status(400).json({ error: "You cannot deactivate your own account" });
        if (role && role !== "SUPER_ADMIN") {
          return res.status(400).json({ error: "You cannot change your own role" });
        }
      }
      if (role && role !== "SUPER_ADMIN") await assertNotLastSuperAdmin(userId, "demote");
      if (isActive === false) await assertNotLastSuperAdmin(userId, "deactivate");

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) return res.status(404).json({ error: "User not found" });

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(role ? { role: role as never } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        select: { id: true, role: true, isActive: true },
      });

      await audit({
        organizationId: target.organizationId,
        userId: me.user.id,
        action: "admin.user_updated",
        entityType: "User",
        entityId: userId,
        metadata: { role, isActive },
        req,
      });
      return res.status(200).json({ user: updated });
    }

    if (req.method === "DELETE") {
      const userId = (req.query.id as string) || (req.body as { userId?: string } | undefined)?.userId;
      if (!userId) return res.status(400).json({ error: "id required" });
      if (userId === me.user.id) return res.status(400).json({ error: "You cannot delete your own account" });

      const target = await assertNotLastSuperAdmin(userId, "delete");
      // Sessions and reset tokens cascade; audit logs detach (SetNull).
      await prisma.user.delete({ where: { id: userId } });
      await audit({
        organizationId: target.organizationId,
        userId: me.user.id,
        action: "admin.user_deleted",
        entityType: "User",
        entityId: userId,
        metadata: { email: target.email },
        req,
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/admin/users]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

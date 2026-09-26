// POST /api/auth/forgot-password — issues a reset token (emailed in prod)
// POST /api/auth/reset-password — consumes the token and sets a new password
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueResetToken, consumeResetToken, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(10), password: z.string().min(8).max(200) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST" && req.query.action === "forgot") {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Valid email required" });
    const email = parsed.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return ok to avoid account enumeration.
    if (user) {
      const token = await issueResetToken(user.id);
      console.log(`[auth] password reset requested for ${email}. Reset link: /auth/reset?token=${token}`);
      await audit({ organizationId: user.organizationId, userId: user.id, action: "auth.reset_requested", req });
    }
    return res.status(200).json({ ok: true, message: "If that account exists, a reset link has been generated." });
  }

  if (req.method === "POST" && req.query.action === "reset") {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Token and new password (min 8 chars) required" });
    const userId = await consumeResetToken(parsed.data.token);
    if (!userId) return res.status(400).json({ error: "Invalid or expired reset token" });
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });
    await prisma.session.deleteMany({ where: { userId } }); // force re-login everywhere
    await audit({ userId, action: "auth.reset_completed", req });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

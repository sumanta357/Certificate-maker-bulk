// POST /api/auth/login
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { verifyPassword, buildSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
// A bcrypt hash of a random string — used to equalize timing when user is missing.
const DUMMY_HASH = "$2a$12$Xu9kVvQ3pG5jT8Yw1Zc0eO9fWq2bN7mD4hJ6lS8rT0uE1vW3xY5z6";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Email and password are required" });

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const ok = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      await audit({ action: "auth.login_failed", metadata: { email } });
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!user.isActive) return res.status(403).json({ error: "Account is disabled" });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.create({
      data: { token: hashToken(token), userId: user.id, expiresAt },
    });

    res.setHeader("Set-Cookie", buildSessionCookie(req, token, expiresAt));

    await audit({
      organizationId: user.organizationId,
      userId: user.id,
      action: "auth.login",
      req,
    });

    return res
      .status(200)
      .json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

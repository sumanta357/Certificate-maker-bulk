// POST /api/auth/register
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, buildSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  organizationName: z.string().min(2).max(160).optional(),
});

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }
    const { name, email, password, organizationName } = parsed.data;
    const emailNorm = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    // Every registration creates its own organization (strict tenant isolation).
    const orgName = organizationName?.trim() || `${name}'s Organization`;
    const org = await prisma.organization.create({
      data: {
        name: orgName,
        slug: `${slugify(orgName)}-${Date.now().toString(36)}`,
        idPrefix: "AC",
      },
    });

    const isFirstUser = (await prisma.user.count()) === 0;
    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        name,
        passwordHash: await hashPassword(password),
        role: isFirstUser ? "SUPER_ADMIN" : "ADMIN",
        organizationId: org.id,
      },
    });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.create({
      data: { token: hashToken(token), userId: user.id, expiresAt },
    });

    res.setHeader("Set-Cookie", buildSessionCookie(req, token, expiresAt));

    await audit({
      organizationId: org.id,
      userId: user.id,
      action: "auth.register",
      entityType: "User",
      entityId: user.id,
      metadata: { email: emailNorm },
      req,
    });

    return res
      .status(201)
      .json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[auth/register]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

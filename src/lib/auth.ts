import { prisma } from "./db";
import { env } from "./env";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import type { NextApiRequest, NextApiResponse } from "next";
import type { User, Organization } from "@prisma/client";

const SESSION_COOKIE = "autocert_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// ── Password hashing ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: env.isProd,
      sameSite: "lax" as const,
      path: "/",
      expires: expiresAt,
    },
  };
}

// Build a raw Set-Cookie header for the session cookie.
// Over HTTPS (including embedded previews served in an iframe on a different
// site) the cookie must be `SameSite=None; Secure` to be sent by browsers;
// `Partitioned` (CHIPS) scopes it to this embedded context. Plain local dev
// keeps `SameSite=Lax` (browsers reject `SameSite=None` without `Secure`).
function isSecureRequest(req: NextApiRequest): boolean {
  // The app's configured public URL is the authoritative signal: when it is
  // https (managed preview, hosted deploys), cookies must be SameSite=None.
  if (env.appUrl.startsWith("https://")) return true;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  // Behind the managed preview proxy, Host is rewritten to localhost and
  // x-forwarded-proto may be absent — browser Origin/Referer tell us the truth.
  const origin = (req.headers.origin as string | undefined) || (req.headers.referer as string | undefined);
  if (origin?.startsWith("https://")) return true;
  const fwdHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  if (fwdHost) return !fwdHost.split(":")[0].match(/^(localhost|127\.0\.0\.1|\[::1\])$/);
  const host = (req.headers.host || "").split(":")[0].toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return Boolean((req.socket as { encrypted?: boolean } | undefined)?.encrypted);
  }
  // Non-local host without any proxy hints: TLS terminates upstream.
  return true;
}

export function buildSessionCookie(req: NextApiRequest, token: string, expiresAt: Date): string {
  const sameSite = isSecureRequest(req) ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax";
  return `autocert_session=${token}; Path=/; HttpOnly; ${sameSite}; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie(req: NextApiRequest): string {
  const sameSite = isSecureRequest(req) ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax";
  return `autocert_session=; Path=/; HttpOnly; ${sameSite}; Max-Age=0`;
}

export type AuthContext = { user: User; organization: Organization };

export async function getSession(req: NextApiRequest): Promise<AuthContext | null> {
  const cookies = req.cookies || {};
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const session = await prisma.session.findUnique({
    where: { token: hashToken(raw) },
    include: {
      user: { include: { organization: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;
  return { user: session.user, organization: session.user.organization };
}

export async function destroySession(req: NextApiRequest): Promise<void> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return;
  await prisma.session
    .delete({ where: { token: hashToken(raw) } })
    .catch(() => {});
}

// ── Roles ───────────────────────────────────────────────────────────────────

export type Role = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER";

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function hasRole(userRole: string, minimum: Role): boolean {
  return (ROLE_RANK[userRole as Role] ?? -1) >= ROLE_RANK[minimum];
}

// ── API guards ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

export async function requireAuth(req: NextApiRequest): Promise<AuthContext> {
  const ctx = await getSession(req);
  if (!ctx) throw new ApiError(401, "Authentication required");
  return ctx;
}

export async function requireRole(req: NextApiRequest, minimum: Role): Promise<AuthContext> {
  const ctx = await requireAuth(req);
  if (!hasRole(ctx.user.role, minimum)) {
    throw new ApiError(403, "Insufficient permissions for this action");
  }
  return ctx;
}

// ── Password reset tokens ───────────────────────────────────────────────────

export async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
    },
  });
  return token;
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return null;
  await prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  return rec.userId;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ── Registration guard: first user bootstraps their own organization ───────

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

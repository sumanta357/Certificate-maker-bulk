import { prisma } from "./db";
import type { NextApiRequest } from "next";

// Audit log for important actions. Never throws — logging must not break flows.
export async function audit(opts: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  req?: NextApiRequest;
}): Promise<void> {
  try {
    let ip: string | undefined;
    let ua: string | undefined;
    if (opts.req) {
      ip =
        (opts.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        opts.req.socket?.remoteAddress ||
        undefined;
      ua = (opts.req.headers["user-agent"] as string) || undefined;
    }
    await prisma.auditLog.create({
      data: {
        organizationId: opts.organizationId ?? undefined,
        userId: opts.userId ?? undefined,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
      },
    });
    void ip;
    void ua;
  } catch (err) {
    console.error("[audit] failed to record", err);
  }
}

export async function listAudit(
  organizationId: string,
  opts: { page?: number; pageSize?: number; action?: string } = {}
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = opts.action ? { organizationId, action: opts.action } : { organizationId };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

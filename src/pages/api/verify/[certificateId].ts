// GET /api/verify/:certificateId — PUBLIC verification endpoint (rate-limited)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

// Simple in-memory rate limit: 30 requests/min per IP.
// The map must be pruned: without it, every unique IP adds a permanent entry
// and the map grows without bound under public traffic.
const hits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ENTRIES = 10_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || rec.resetAt < now) {
    // Opportunistic prune + hard cap to bound memory.
    if (hits.size >= RATE_LIMIT_MAX_ENTRIES) {
      for (const [k, v] of hits) {
        if (v.resetAt < now) hits.delete(k);
        if (hits.size < RATE_LIMIT_MAX_ENTRIES / 2) break;
      }
      if (hits.size >= RATE_LIMIT_MAX_ENTRIES) hits.clear();
    }
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many requests" });

  try {
    const { certificateId } = req.query as { certificateId: string };
    const participant = await prisma.participant.findUnique({
      where: { certificateId },
      include: {
        certificate: { include: { template: { select: { name: true } } } },
        event: { include: { organization: { select: { name: true } } } },
      },
    });

    if (!participant || !participant.certificate) {
      await prisma.verification
        .create({
          data: {
            organizationId: participant?.organizationId || "unknown",
            certificateId,
            result: "NOT_FOUND",
            ipHash: createHash("sha256").update(ip).digest("hex"),
            userAgent: (req.headers["user-agent"] as string) || null,
          },
        })
        .catch(() => {});
      return res.status(404).json({
        status: "NOT_FOUND",
        message: "No certificate exists with this ID.",
      });
    }

    const revoked = !!participant.certificate.revokedAt;
    await prisma.verification
      .create({
        data: {
          organizationId: participant.organizationId,
          certificateId: participant.certificate.id,
          result: revoked ? "REVOKED" : "VALID",
          ipHash: createHash("sha256").update(ip).digest("hex"),
          userAgent: (req.headers["user-agent"] as string) || null,
        },
      })
      .catch(() => {});

    // Public response: NO participant email, NO private data.
    return res.status(200).json({
      status: revoked ? "REVOKED" : "VALID",
      certificateId,
      name: participant.name,
      organization: participant.event.organizationDisplay || participant.event.organization.name,
      eventName: participant.event.name,
      issueDate: participant.certificate.issuedAt,
      certificateType: participant.event.certificateType,
      revokedAt: participant.certificate.revokedAt,
      revokeReason: participant.certificate.revokeReason,
    });
  } catch (err) {
    console.error("[api/verify]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

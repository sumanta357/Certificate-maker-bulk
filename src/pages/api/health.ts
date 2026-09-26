// GET /api/health — liveness/readiness probe for Render (and any orchestrator).
// Public by design (no sensitive data): reports process liveness and that the
// database accepts queries. Does not touch storage or email providers.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let database = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch {
    database = "down";
  }

  const ok = database === "up";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    database,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

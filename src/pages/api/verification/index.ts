// GET /api/verification — recent verification records for the organization
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { organization } = await requireAuth(req);
    const records = await prisma.verification.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.status(200).json({ records });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/verification]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

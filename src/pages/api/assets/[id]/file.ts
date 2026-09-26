// GET /api/assets/:id/file — serve the image (auth required, tenant-checked)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { organization } = await requireAuth(req);
    const { id } = req.query as { id: string };
    const asset = await prisma.asset.findFirst({ where: { id, organizationId: organization.id } });
    if (!asset) throw new ApiError(404, "Asset not found");

    const storage = getStorage();
    const buf = await storage.get(asset.storageKey);
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.status(200).send(buf);
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/assets/:id/file]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

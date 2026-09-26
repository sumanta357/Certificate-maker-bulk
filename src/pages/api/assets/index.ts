// GET /api/assets — list organization assets
// POST /api/assets — upload a PNG/JPG/SVG image (base64 data URL in JSON body)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml"];

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { user, organization } = await requireAuth(req);

    if (req.method === "GET") {
      const assets = await prisma.asset.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return res.status(200).json({ assets });
    }

    if (req.method === "POST") {
      await requireRole(req, "EDITOR");
      const { name, dataUrl } = req.body as { name?: string; dataUrl?: string };
      if (!dataUrl || !dataUrl.startsWith("data:")) {
        throw new ApiError(400, "dataUrl (base64 data URL) is required");
      }
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new ApiError(400, "Invalid data URL");
      const mimeType = m[1];
      if (!ALLOWED.includes(mimeType)) {
        throw new ApiError(400, `Unsupported image type ${mimeType}. Use PNG, JPG or SVG.`);
      }
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > MAX_IMAGE_BYTES) throw new ApiError(413, "Image too large (max 4 MB)");

      const safeName = (name || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const ext = mimeType === "image/svg+xml" ? "svg" : mimeType === "image/jpeg" ? "jpg" : "png";
      const key = `assets/${organization.id}/${Date.now().toString(36)}-${safeName}.${ext}`;

      const storage = getStorage();
      await storage.put(key, buf, mimeType);

      const asset = await prisma.asset.create({
        data: {
          organizationId: organization.id,
          name: safeName,
          kind: "image",
          mimeType,
          size: buf.length,
          storageKey: key,
        },
      });

      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "asset.uploaded",
        entityType: "Asset",
        entityId: asset.id,
        metadata: { name: safeName, size: buf.length },
        req,
      });

      return res.status(201).json({ asset: { id: asset.id, name: asset.name, mimeType: asset.mimeType } });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/assets]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

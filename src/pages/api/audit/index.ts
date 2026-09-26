// GET /api/audit — paginated audit log for the organization
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth, ApiError } from "@/lib/auth";
import { listAudit } from "@/lib/audit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { organization } = await requireAuth(req);
    const page = Number(req.query.page) || 1;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const result = await listAudit(organization.id, { page, action, pageSize: 30 });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/audit]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// GET /api/auth/me — current session user
import type { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const ctx = await getSession(req);
  if (!ctx) return res.status(401).json({ error: "Not authenticated" });
  res.status(200).json({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      organization: {
        id: ctx.organization.id,
        name: ctx.organization.name,
        idPrefix: ctx.organization.idPrefix,
        emailSignature: ctx.organization.emailSignature,
      },
    },
  });
}

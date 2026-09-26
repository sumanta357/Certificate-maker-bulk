// POST /api/auth/logout
import type { NextApiRequest, NextApiResponse } from "next";
import { destroySession, clearSessionCookie } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  await destroySession(req);
  res.setHeader("Set-Cookie", clearSessionCookie(req));
  res.status(200).json({ ok: true });
}

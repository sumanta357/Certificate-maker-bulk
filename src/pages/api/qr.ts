// GET /api/qr?url=...&fg=...&bg=... — QR PNG for canvas <img>/useImage
//
// Auth policy: the certificate canvas/editor renders this URL inside <img>
// tags, where fetch credentials/headers cannot be attached. So the endpoint
// requires EITHER an authenticated session OR that the encoded `url` points
// at this app's own public verification page (the only URL AutoCert itself
// ever encodes). Anything else is rejected, so the endpoint cannot be used as
// a general-purpose QR service or a content-injection vector.
import type { NextApiRequest, NextApiResponse } from "next";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";

const HEX = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = (req.query.url as string) || "";
  if (!url || url.length > 2048) return res.status(400).json({ error: "Invalid url" });

  const fg = HEX.test(req.query.fg as string) ? (req.query.fg as string) : "#000000";
  const bg = HEX.test(req.query.bg as string) ? (req.query.bg as string) : "#ffffff";

  let allowed = false;
  const session = await getSession(req).catch(() => null);
  if (session) {
    allowed = true;
  } else {
    try {
      const parsed = new URL(url);
      const base = new URL(env.appUrl);
      // Only this app's verification pages may be encoded without a session.
      allowed =
        parsed.origin === base.origin &&
        (parsed.pathname === "/verify" || parsed.pathname.startsWith("/verify/"));
      // In dev the configured APP_URL may differ from the request origin
      // (e.g. localhost:3000 vs a tunneled origin); accept same-origin too.
      if (!allowed && req.headers.origin) {
        try {
          allowed = parsed.origin === new URL(req.headers.origin as string).origin;
        } catch {}
      }
      if (!allowed && !env.appUrl.startsWith("https://")) {
        try {
          const o = new URL(req.headers.referer || `http://${req.headers.host || ""}`);
          allowed = parsed.origin === o.origin;
        } catch {}
      }
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    return res.status(403).json({ error: "Only verification URLs from this app can be encoded." });
  }

  try {
    const png = await QRCode.toBuffer(url, {
      width: 512,
      margin: 1,
      color: { dark: fg, light: bg },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(png);
  } catch {
    res.status(500).end();
  }
}

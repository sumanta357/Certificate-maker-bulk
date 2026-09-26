// Route-handler wrapper: uniform auth errors, ApiError mapping, audit hook.
import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "./auth";

export type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;

export function withHandler(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      console.error("[api] unhandled error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

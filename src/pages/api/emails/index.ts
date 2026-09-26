// GET /api/emails — list email jobs for the organization
// POST /api/emails?action=retry — requeue failed logs of a job
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { enqueue } from "@/lib/queue";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { organization, user } = await requireAuth(req);

    if (req.method === "GET") {
      const jobs = await prisma.emailJob.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { event: { select: { name: true } } },
      });
      return res.status(200).json({
        jobs: jobs.map((j) => ({
          id: j.id,
          status: j.status,
          total: j.total,
          sent: j.sent,
          failed: j.failed,
          testMode: j.testMode,
          testEmail: j.testEmail,
          createdAt: j.createdAt,
          eventName: j.event.name,
        })),
      });
    }

    if (req.method === "POST" && req.query.action === "retry") {
      await requireRole(req, "EDITOR");
      const { emailJobId } = req.body as { emailJobId?: string };
      if (!emailJobId) throw new ApiError(400, "emailJobId required");
      const job = await prisma.emailJob.findFirst({
        where: { id: emailJobId, organizationId: organization.id },
      });
      if (!job) throw new ApiError(404, "Email job not found");

      const failedLogs = await prisma.emailLog.findMany({
        where: { emailJobId: job.id, status: { in: ["FAILED", "RETRYING"] } },
      });
      if (failedLogs.length) {
        await prisma.emailLog.updateMany({
          where: { id: { in: failedLogs.map((l) => l.id) } },
          data: { status: "PENDING", nextRetryAt: null, error: null },
        });
      }
      await enqueue("send-emails", { emailJobId: job.id });
      return res.status(202).json({ queued: failedLogs.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/emails]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

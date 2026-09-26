// GET /api/events/:id/download?mode=zip|errors&status=...&ids=...
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import JSZip from "jszip";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { organization } = await requireAuth(req);
    const { id } = req.query as { id: string };
    const event = await prisma.event.findFirst({ where: { id, organizationId: organization.id } });
    if (!event) throw new ApiError(404, "Event not found");

    const mode = (req.query.mode as string) || "zip";
    const statusFilter = (req.query.status as string) || undefined;
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean) : undefined;

    if (mode === "errors") {
      const failed = await prisma.participant.findMany({
        where: { eventId: event.id, status: { in: ["FAILED"] } },
        include: { certificate: true },
      });
      const rows = [
        ["Name", "Email", "Certificate ID", "Error", "Status"].join(","),
        ...failed.map((p) =>
          [
            JSON.stringify(p.name || ""),
            JSON.stringify(p.email || ""),
            JSON.stringify(p.certificateId || ""),
            JSON.stringify((p.error || p.statusMessage || "Unknown error").replace(/"/g, "'")),
            "Failed",
          ].join(",")
        ),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="failed-records-${event.slug}.csv"`);
      return res.status(200).send(rows.join("\n"));
    }

    // ZIP mode
    const where: Record<string, unknown> = { eventId: event.id, certificateId: { not: null } };
    if (ids?.length) where.id = { in: ids };
    else if (statusFilter && statusFilter !== "ALL") where.status = statusFilter;

    const participants = await prisma.participant.findMany({
      where,
      include: { certificate: true },
    });
    const withPdf = participants.filter((p) => p.certificate?.pdfKey);
    if (!withPdf.length) throw new ApiError(400, "No generated certificates to download");

    const storage = getStorage();
    const zip = new JSZip();
    for (const p of withPdf) {
      try {
        const pdf = await storage.get(p.certificate!.pdfKey!);
        const safeName = (p.name || "certificate").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "certificate";
        const fname = `${p.certificateId} - ${safeName.replace(/\s+/g, "-")}.pdf`;
        zip.file(fname, pdf);
      } catch {
        // skip unreadable file, continue batch
      }
    }
    // Include a manifest
    zip.file(
      "manifest.csv",
      ["Certificate ID,Name,Email,Status", ...withPdf.map((p) => `${p.certificateId},${JSON.stringify(p.name)},${p.email || ""},${p.status}`)].join("\n")
    );

    const buf = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="certificates-${event.slug}.zip"`);
    return res.status(200).send(buf);
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events/:id/download]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

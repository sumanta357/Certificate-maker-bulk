// GET /api/certificates/:id/pdf — stream the stored PDF (auth required)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { organization } = await requireAuth(req);
    const { id } = req.query as { id: string };

    const participant = await prisma.participant.findFirst({
      where: { certificateId: id, organizationId: organization.id },
      include: { certificate: true },
    });
    if (!participant?.certificate?.pdfKey) throw new ApiError(404, "Certificate PDF not found");

    const storage = getStorage();
    const pdf = await storage.get(participant.certificate.pdfKey);
    const safeName = (participant.name || "certificate").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "certificate";
    const filename = `Certificate-${safeName.replace(/\s+/g, "-")}-${participant.certificateId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader(
      "Content-Disposition",
      req.query.download === "1" ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`
    );
    res.status(200).send(pdf);
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/certificates/:id/pdf]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

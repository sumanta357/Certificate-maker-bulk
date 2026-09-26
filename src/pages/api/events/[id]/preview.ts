// GET /api/events/:id/preview?participant=<id>&templateVersion=<id>
// Renders the certificate exactly as the PDF will (same geometry), returning PNG data.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { buildVariableMap, type VariableContext } from "@/lib/variables";
import { env } from "@/lib/env";
import type { CertificateDesign } from "@/lib/design";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { organization } = await requireAuth(req);
    const { id } = req.query as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, organizationId: organization.id },
      include: { organization: true },
    });
    if (!event) throw new ApiError(404, "Event not found");

    const templateId = (req.query.templateId as string) || event.templateId;
    if (!templateId) throw new ApiError(400, "No template selected");

    const template = await prisma.template.findFirst({
      where: { id: templateId, organizationId: organization.id },
      include: { activeVersion: true },
    });
    if (!template?.activeVersion) throw new ApiError(400, "Template has no saved design");

    const design = JSON.parse(String(template.activeVersion.design)) as CertificateDesign;

    const participantId = req.query.participant as string | undefined;
    let participant = null;
    if (participantId) {
      participant = await prisma.participant.findFirst({
        where: { id: participantId, eventId: event.id, organizationId: organization.id },
      });
    }
    if (!participant) {
      participant = await prisma.participant.findFirst({ where: { eventId: event.id } });
    }

    const data: Record<string, unknown> = participant ? JSON.parse(String(participant.data || "{}")) : {};
    const varCtx: VariableContext = {
      participant: data,
      certificateId: participant?.certificateId || "AC-2026-000000 (preview)",
      issueDate: new Date(),
      event: {
        name: event.name,
        organization: event.organization.name,
        organizationDisplay: event.organizationDisplay,
        eventDate: event.eventDate,
        organizer: event.organizer,
        location: event.location,
        certificateType: event.certificateType,
        website: event.website,
      },
      verificationUrl: `${env.appUrl}/verify/${participant?.certificateId || "preview"}`,
    };

    const map = buildVariableMap(varCtx);

    // Client-side rendering fallback data: return design + map; the browser
    // Konva canvas renders it (identical geometry to the PDF renderer).
    return res.status(200).json({
      design,
      map,
      participant: participant ? { id: participant.id, name: participant.name } : null,
      warnings: [],
    });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events/:id/preview]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

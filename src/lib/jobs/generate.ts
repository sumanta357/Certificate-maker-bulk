// Background job: generate personalized PDF certificates for an event.
// Per-participant isolation: one failure never stops the batch.
import { prisma } from "../db";
import { getStorage } from "../storage";
import { renderCertificatePdf } from "../pdf";
import { buildVariableMap, type VariableContext } from "../variables";
import type { CertificateDesign } from "../design";
import { env } from "../env";

export async function handleGenerateCertificates(payload: {
  eventId: string;
  organizationId: string;
  participantIds?: string[];
  triggeredBy?: string;
}): Promise<{ generated: number; failed: number; skipped: number }> {
  const event = await prisma.event.findUnique({
    where: { id: payload.eventId },
    include: { organization: true },
  });
  if (!event) throw new Error(`Event ${payload.eventId} not found`);

  const templateVersion = event.templateId
    ? await prisma.template.findUnique({
        where: { id: event.templateId },
        include: { activeVersion: true },
      }).then((t) => t?.activeVersion ?? null)
    : null;

  if (!templateVersion) {
    throw new Error("Event has no template selected. Choose a template before generating.");
  }

  const design = JSON.parse(String(templateVersion.design)) as CertificateDesign;

  const participants = await prisma.participant.findMany({
    where: {
      eventId: payload.eventId,
      organizationId: payload.organizationId,
      // Duplicate protection: participants that already have a live certificate
      // are skipped unless explicitly listed (regenerate flow).
      ...(payload.participantIds?.length
        ? { id: { in: payload.participantIds } }
        : { certificateId: null, status: { in: ["PENDING", "QUEUED", "FAILED", "GENERATING"] } }),
    },
  });

  const storage = getStorage();
  let generated = 0;
  let failed = 0;
  const skipped = participants.filter((p) => p.certificateId).length;

  for (const participant of participants) {
    try {
      await prisma.participant.update({
        where: { id: participant.id },
        data: { status: "GENERATING", error: null, statusMessage: null },
      });

      // Allocate a unique certificate ID (atomic increment on the event row).
      const certId = await allocateCertificateId(event.id, event.idPrefix || event.organization.idPrefix);

      const varCtx: VariableContext = {
        participant: safeParse(String(participant.data)),
        certificateId: certId,
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
        verificationUrl: `${env.appUrl}/verify/${certId}`,
      };

      const pdf = await renderCertificatePdf({
        design,
        variableCtx: varCtx,
        verificationUrl: `${env.appUrl}/verify/${certId}`,
      });

      const pdfKey = `certificates/${event.id}/${participant.id}.pdf`;
      await storage.put(pdfKey, pdf, "application/pdf");

      await prisma.certificate.create({
        data: {
          organizationId: payload.organizationId,
          participantId: participant.id,
          certificateId: certId,
          templateId: event.templateId!,
          templateVersionId: templateVersion.id,
          designSnapshot: JSON.stringify(design),
          pdfKey,
          pdfSize: pdf.length,
          issuedAt: new Date(),
        },
      });

      await prisma.participant.update({
        where: { id: participant.id },
        data: {
          certificateId: certId,
          status: "GENERATED",
          statusMessage: null,
        },
      });
      generated += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error(`[generate] participant ${participant.id} failed:`, message);
      await prisma.participant
        .update({
          where: { id: participant.id },
          data: { status: "FAILED", error: message, statusMessage: message },
        })
        .catch(() => {});
    }
  }

  await prisma.event.update({ where: { id: event.id }, data: { updatedAt: new Date() } });
  return { generated, failed, skipped };
}

function safeParse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Sequential counter per event: PREFIX-YEAR-000001
async function allocateCertificateId(eventId: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const event = await tx.event.update({
          where: { id: eventId },
          data: { lastSeq: { increment: 1 } },
          select: { lastSeq: true },
        });
        const id = `${prefix || "AC"}-${year}-${String(event.lastSeq).padStart(6, "0")}`;
        const existing = await tx.participant.findUnique({ where: { certificateId: id } });
        if (existing) throw new Error(`Certificate ID ${id} already exists`);
        return id;
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        continue; // retry increments the counter again
      }
      throw err;
    }
  }
  throw new Error("Unable to allocate a unique certificate ID after multiple attempts");
}

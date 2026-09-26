// Background job: send personalized certificate emails.
// Each recipient gets ONLY their own certificate. Failures are isolated and
// retried with exponential backoff; the batch continues.
import { prisma } from "../db";
import { getStorage } from "../storage";
import { getEmailProvider } from "../email";
import { buildVariableMap, resolveVariables, type VariableContext } from "../variables";
import { escapeHtml } from "../utils";
import { env } from "../env";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 5_000, 20_000, 60_000]; // attempt index → delay before retry

export async function handleSendEmails(payload: {
  emailJobId: string;
}): Promise<{ sent: number; failed: number }> {
  const job = await prisma.emailJob.findUnique({ where: { id: payload.emailJobId } });
  if (!job) throw new Error(`EmailJob ${payload.emailJobId} not found`);

  const event = await prisma.event.findUnique({
    where: { id: job.eventId },
    include: { organization: true, emailTemplate: true },
  });
  if (!event) throw new Error(`Event ${job.eventId} not found`);

  const logs = await prisma.emailLog.findMany({
    where: { emailJobId: job.id, status: { in: ["PENDING", "RETRYING" as never] } },
    orderBy: { createdAt: "asc" },
  });

  const provider = getEmailProvider();
  const storage = getStorage();
  let sent = 0;
  let failed = 0;

  await prisma.emailJob.update({ where: { id: job.id }, data: { status: "SENDING" } });

  for (const log of logs) {
    try {
      const participant = log.participantId
        ? await prisma.participant.findUnique({
            where: { id: log.participantId },
            include: { certificate: true },
          })
        : null;

      if (!participant?.certificate?.pdfKey) {
        await prisma.emailLog.update({
          where: { id: log.id },
          data: { status: "FAILED", error: "No generated certificate for this participant" },
        });
        await prisma.emailJob.update({ where: { id: job.id }, data: { failed: { increment: 1 } } });
        failed += 1;
        continue;
      }

      const pdf = await storage.get(participant.certificate.pdfKey);
      const certId = participant.certificate.certificateId;
      const verifyUrl = `${env.appUrl}/verify/${certId}`;

      const varCtx: VariableContext = {
        participant: safeParse(String(participant.data)),
        certificateId: certId,
        issueDate: participant.certificate.issuedAt,
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
        verificationUrl: verifyUrl,
      };
      const map = buildVariableMap(varCtx);

      const tpl = event.emailTemplate;
      const subject = resolveVariables(
        tpl?.subject || "Your {{CERTIFICATE_TYPE}} – {{EVENT_NAME}}",
        map
      );
      const bodyText = resolveVariables(
        tpl?.body ||
          `Dear {{Name}},\n\nPlease find your certificate for {{EVENT_NAME}} attached.\n\nCertificate ID: {{CERTIFICATE_ID}}\nVerify: {{VERIFICATION_URL}}\n\nRegards,\n{{ORGANIZATION}}`,
        map
      );
      const html = textToHtml(bodyText, event.organization.emailSignature || event.organization.emailSignature);

      const to = job.testMode && job.testEmail ? job.testEmail : log.to;
      const subjectFinal = job.testMode ? `[TEST] ${subject}` : subject;
      const safeName = (participant.name || "certificate").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "certificate";
      const filename = `Certificate-${safeName.replace(/\s+/g, "-")}-${certId}.pdf`;

      // Sender identity: the organization's GUI-configured address wins,
      // falling back to the deployment-wide EMAIL_FROM/EMAIL_FROM_NAME.
      const org = event.organization;
      const orgFrom = org.emailFromAddress
        ? org.emailFromName
          ? `${org.emailFromName} <${org.emailFromAddress}>`
          : org.emailFromAddress
        : undefined;

      await provider.send({
        to,
        from: orgFrom,
        subject: subjectFinal,
        html,
        text: bodyText,
        attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
        replyTo: event.contactEmail || event.organization.contactEmail || undefined,
      });

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          provider: provider.name,
          error: null,
          attempts: { increment: 1 },
        },
      });
      if (participant.certificateId) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { status: "SENT", error: null, statusMessage: null },
        });
      }
      await prisma.emailJob.update({ where: { id: job.id }, data: { sent: { increment: 1 } } });
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      const attempts = log.attempts + 1;
      const willRetry = attempts < MAX_ATTEMPTS;
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: willRetry ? "RETRYING" : "FAILED",
          error: message.slice(0, 500),
          attempts,
          nextRetryAt: willRetry ? new Date(Date.now() + (BACKOFF_MS[attempts] || 60_000)) : null,
        },
      });
      if (!willRetry && log.participantId) {
        await prisma.participant.update({
          where: { id: log.participantId },
          data: { status: "FAILED", error: `Email: ${message.slice(0, 300)}`, statusMessage: "Email delivery failed" },
        }).catch(() => {});
      }
      await prisma.emailJob.update({ where: { id: job.id }, data: { failed: { increment: 1 } } });
      failed += 1;
    }
  }

  const remaining = await prisma.emailLog.count({
    where: { emailJobId: job.id, status: { in: ["PENDING", "RETRYING" as never] } },
  });
  if (remaining > 0) {
    await prisma.emailJob.update({ where: { id: job.id }, data: { status: "QUEUED" } });
  } else {
    // Final status must reflect the outcome, not just "nothing pending":
    // all-sent → SENT, some failed → PARTIAL (a non-enum value is persisted as
    // a plain string on SQLite; on PostgreSQL add a PARTIAL EmailStatus value),
    // all failed → FAILED.
    const failedCount = await prisma.emailLog.count({
      where: { emailJobId: job.id, status: "FAILED" },
    });
    const finalStatus = failedCount === 0 ? "SENT" : failedCount >= job.total ? "FAILED" : "PARTIAL";
    await prisma.emailJob.update({
      where: { id: job.id },
      // Normalize `failed` to unique failed recipients (the per-attempt
      // counter above also counts retries).
      data: { status: finalStatus as never, failed: failedCount },
    });
  }
  return { sent, failed };
}

// Retries due emails (called by worker loop or cron endpoint).
export async function retryDueEmails(): Promise<number> {
  const due = await prisma.emailLog.findMany({
    where: { status: "RETRYING", nextRetryAt: { lte: new Date() } },
    take: 100,
  });
  if (!due.length) return 0;
  await prisma.emailLog.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { status: "PENDING" },
  });
  const jobIds = [...new Set(due.map((d) => d.emailJobId).filter((x): x is string => !!x))];
  for (const jobId of jobIds) {
    const { enqueue } = await import("../queue");
    await enqueue("send-emails", { emailJobId: jobId });
  }
  return due.length;
}

function safeParse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function textToHtml(text: string, signature?: string | null): string {
  const esc = escapeHtml(text)
    .replace(/\{\{/g, "{{")
    .replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#1f2937;line-height:1.6">
<div style="max-width:560px;margin:0 auto;padding:24px">
${esc}
${signature ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/><div style="color:#6b7280;font-size:13px">${escapeHtml(signature).replace(/\n/g, "<br/>")}</div>` : ""}
</div></body></html>`;
}

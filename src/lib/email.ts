// Email provider abstraction with per-provider implementations.
import nodemailer, { type Transporter } from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  replyTo?: string;
  /** Per-organization sender override: "Name <addr>" or just "addr".
   *  Falls back to EMAIL_FROM_NAME / EMAIL_FROM env vars when absent. */
  from?: string;
}

export interface SendEmailResult {
  messageId?: string;
  provider: string;
}

export interface EmailProvider {
  name: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

// ── Console provider (development default): logs and reports success ───────

export class ConsoleEmailProvider implements EmailProvider {
  name = "console";
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    console.log(
      `[email:console] from=${resolveFromAddress(input.from)} to=${input.to} subject="${input.subject}" attachments=${input.attachments?.length ?? 0}`
    );
    return {
      provider: this.name,
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

// Resolve the effective From identity: per-org override, else env defaults.
export function resolveFromAddress(orgFrom?: string): string {
  if (orgFrom && orgFrom.trim()) return orgFrom.trim();
  const name = process.env.EMAIL_FROM_NAME || "AutoCert";
  const addr = process.env.EMAIL_FROM;
  return addr ? `${name} <${addr}>` : addr || "";
}

// Parse "Name <addr>" or "addr" into SendGrid's {email, name} shape.
function parseFrom(from?: string): { email: string; name?: string } | null {
  if (!from) return null;
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, ""), email: m[2] };
  return { email: from.trim() };
}

// ── SMTP (nodemailer) ───────────────────────────────────────────────────────

export class SmtpEmailProvider implements EmailProvider {
  name = "smtp";
  private transporter: Transporter | null = null;

  private getTransporter() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: (process.env.SMTP_SECURE || "false") === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 15000,
        socketTimeout: 20000,
      });
    }
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const info = await this.getTransporter().sendMail({
      from: resolveFromAddress(input.from),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
      replyTo: input.replyTo,
    });
    return { provider: this.name, messageId: info.messageId };
  }
}

// ── Resend ──────────────────────────────────────────────────────────────────

export class ResendEmailProvider implements EmailProvider {
  name = "resend";
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: resolveFromAddress(input.from),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return { provider: this.name, messageId: data?.id };
  }
}

// ── SendGrid ────────────────────────────────────────────────────────────────

export class SendGridEmailProvider implements EmailProvider {
  name = "sendgrid";
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured");
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME || "AutoCert", ...(parseFrom(input.from) || {}) },
        subject: input.subject,
        content: [
          { type: "text/html", value: input.html },
          { type: "text/plain", value: input.text },
        ],
        attachments: input.attachments?.map((a) => ({
          content: a.content.toString("base64"),
          filename: a.filename,
          type: a.contentType,
        })),
      }),
    });
    if (!res.ok) throw new Error(`SendGrid failed: ${res.status} ${await res.text()}`);
    return { provider: this.name, messageId: res.headers.get("x-message-id") ?? undefined };
  }
}

// ── Mailgun ─────────────────────────────────────────────────────────────────

export class MailgunEmailProvider implements EmailProvider {
  name = "mailgun";
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    if (!apiKey || !domain) throw new Error("MAILGUN_API_KEY / MAILGUN_DOMAIN are not configured");

    const form = new FormData();
    form.append("from", resolveFromAddress(input.from));
    form.append("to", input.to);
    form.append("subject", input.subject);
    form.append("html", input.html);
    form.append("text", input.text);
    for (const a of input.attachments || []) {
      form.append(
        "attachment",
        new Blob([new Uint8Array(a.content)], { type: a.contentType || "application/pdf" }),
        a.filename
      );
    }

    const base = process.env.MAILGUN_EU === "true" ? "api.eu.mailgun.net" : "api.mailgun.net";
    const res = await fetch(`https://${base}/v3/${domain}/messages`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Mailgun failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { id?: string };
    return { provider: this.name, messageId: json.id };
  }
}

// ── Amazon SES (v1 SendRawEmail via SigV4) ──────────────────────────────────

export class SesEmailProvider implements EmailProvider {
  name = "ses";
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const { sesSendRawEmail } = await import("./ses");
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error("AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not configured");
    }
    const messageId = await sesSendRawEmail({
      region,
      accessKeyId,
      secretAccessKey,
      from: resolveFromAddress(input.from),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });
    return { provider: this.name, messageId };
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function getEmailProvider(): EmailProvider {
  const name = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  switch (name) {
    case "smtp":
      return new SmtpEmailProvider();
    case "resend":
      return new ResendEmailProvider();
    case "sendgrid":
      return new SendGridEmailProvider();
    case "mailgun":
      return new MailgunEmailProvider();
    case "ses":
      return new SesEmailProvider();
    default:
      return new ConsoleEmailProvider();
  }
}

export function emailProviderLabel(): string {
  return getEmailProvider().name;
}

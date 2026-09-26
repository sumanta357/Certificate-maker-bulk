// Amazon SES SendRawEmail (SigV4) with MIME multipart message construction.
import { createHmac, createHash } from "crypto";
import type { SendEmailInput } from "./email";

type SesInput = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: SendEmailInput["attachments"];
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function buildMime(msg: SesInput): Buffer {
  const boundary = `autocert-${Date.now().toString(36)}`;
  const altBoundary = `autocert-alt-${Date.now().toString(36)}`;
  const parts: Buffer[] = [];

  const push = (s: string) => parts.push(Buffer.from(s, "utf8"));

  push(`From: ${msg.from}\r\n`);
  push(`To: ${msg.to}\r\n`);
  push(`Subject: ${msg.subject}\r\n`);
  push("MIME-Version: 1.0\r\n");
  push(`Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`);

  push(`--${boundary}\r\n`);
  push(`Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`);

  push(`--${altBoundary}\r\n`);
  push('Content-Type: text/plain; charset=UTF-8\r\n\r\n');
  push(msg.text + "\r\n\r\n");

  push(`--${altBoundary}\r\n`);
  push('Content-Type: text/html; charset=UTF-8\r\n\r\n');
  push(msg.html + "\r\n\r\n");
  push(`--${altBoundary}--\r\n`);

  for (const a of msg.attachments || []) {
    push(`--${boundary}\r\n`);
    push(`Content-Type: ${a.contentType || "application/pdf"}; name="${a.filename}"\r\n`);
    push("Content-Transfer-Encoding: base64\r\n");
    push(`Content-Disposition: attachment; filename="${a.filename}"\r\n\r\n`);
    const b64 = Buffer.from(a.content).toString("base64").replace(/(.{76})/g, "$1\r\n");
    push(b64 + "\r\n\r\n");
  }

  push(`--${boundary}--\r\n`);
  return Buffer.concat(parts);
}

export async function sesSendRawEmail(msg: SesInput): Promise<string> {
  const raw = buildMime(msg);
  const params = new URLSearchParams({
    Action: "SendRawEmail",
    Version: "2010-12-01",
    "RawMessage.Data": raw.toString("base64"),
  });

  const host = `email.${msg.region}.amazonaws.com`;
  const url = `https://${host}/`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(params.toString());
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    host,
    "x-amz-date": amzDate,
  };
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    Object.keys(headers)
      .map((h) => `${h}:${headers[h]}\n`)
      .join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${msg.region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${msg.secretAccessKey}`, dateStamp), msg.region), "ses"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${msg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, { method: "POST", headers, body: params.toString() });
  if (!res.ok) throw new Error(`SES error ${res.status}: ${await res.text()}`);
  const text = await res.text();
  const m = text.match(/<MessageId>([^<]+)<\/MessageId>/);
  return m ? m[1] : "ses-accepted";
}

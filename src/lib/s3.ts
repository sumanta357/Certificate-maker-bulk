// Minimal AWS SigV4 signer for S3-compatible object storage (S3, R2, Supabase).
// Avoids the heavy aws-sdk dependency; supports PUT/GET/DELETE/HEAD on objects.
import { createHash, createHmac } from "crypto";

export type S3FetchOptions = {
  method: "PUT" | "GET" | "DELETE" | "HEAD";
  url: string;
  headers?: Record<string, string>;
  body?: Buffer | Uint8Array;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function s3Fetch(opts: S3FetchOptions): Promise<Response> {
  const url = new URL(opts.url);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = opts.service || "s3";
  const region = opts.region || "auto";

  const payloadHash = sha256Hex(opts.body ? Buffer.from(opts.body) : "");

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(opts.headers || {}),
  };

  // Canonical request
  const signedHeaders = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(";");

  const canonicalHeaders = Object.keys(headers)
    .map((h) => `${h.toLowerCase()}:${String(headers[h]).trim()}\n`)
    .sort()
    .join("");

  const canonicalRequest = [
    opts.method,
    url.pathname,
    url.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = [dateStamp, region, service, "aws4_request"].join("/");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${opts.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method: opts.method,
    headers,
    body: opts.body as BodyInit | undefined,
  });
}

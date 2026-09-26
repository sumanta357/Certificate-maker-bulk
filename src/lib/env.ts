// Central typed access to environment configuration.
export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get authSecret() {
    return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "autocert-dev-secret";
  },
  get appUrl() {
    const raw = process.env.APP_URL ?? "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  },
  get queueMode(): "inprocess" | "redis" {
    return (process.env.QUEUE_MODE as "inprocess" | "redis") || "inprocess";
  },
  get redisUrl() {
    return process.env.REDIS_URL || "";
  },
  get storageDriver(): "local" | "s3" | "r2" | "supabase" {
    const d = process.env.STORAGE_DRIVER || "local";
    return d === "s3" || d === "r2" || d === "supabase" ? (d as "s3" | "r2" | "supabase") : "local";
  },
  get emailProvider(): "console" | "smtp" | "resend" | "sendgrid" | "mailgun" | "ses" {
    const p = process.env.EMAIL_PROVIDER || "console";
    const valid = ["console", "smtp", "resend", "sendgrid", "mailgun", "ses"];
    return (valid.includes(p) ? p : "console") as "console" | "smtp" | "resend" | "sendgrid" | "mailgun" | "ses";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || "certificates@localhost";
  },
  get emailFromName() {
    return process.env.EMAIL_FROM_NAME || "AutoCert";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};

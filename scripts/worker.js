// AutoCert background worker (Redis/BullMQ mode).
// Run with: bun run worker  (or: node scripts/worker.js)
// Requires QUEUE_MODE=redis and REDIS_URL.
require("dotenv").config?.() || null;

let prisma;
try {
  const { PrismaClient } = require("@prisma/client");
  prisma = new PrismaClient();
} catch (err) {
  console.error("[worker] Prisma client missing. Run: bun run postinstall:prisma", err);
  process.exit(1);
}

// The actual job handlers live in the compiled Next app. For the standard
// deployment (QUEUE_MODE=inprocess) the Next server processes jobs inline and
// this worker is not needed. For Redis mode the server enqueues jobs and this
// process drains them using the same handlers.
async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("[worker] REDIS_URL is not set.");
    process.exit(1);
  }
  const { Queue, Worker } = require("bullmq");
  const IORedis = require("ioredis");
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  // Handlers are loaded from the shared lib via tsx so the worker can run TS.
  require("tsx/cjs");
  const { registerWorkers } = require("../src/lib/jobs/register.ts");
  await registerWorkers({ Queue, Worker, connection, prisma });
  console.log("[worker] AutoCert worker started (redis mode).");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});

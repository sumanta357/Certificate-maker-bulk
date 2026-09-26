// Job queue abstraction.
// - QUEUE_MODE=inprocess (default): jobs run in the Next.js server process via a
//   simple sequential in-memory queue (zero-config dev; survives per-request).
// - QUEUE_MODE=redis: BullMQ backed by REDIS_URL, drained by `bun run worker`.
import { prisma } from "./db";

export type JobName = "generate-certificates" | "send-emails";

export interface Queue {
  add(name: JobName, payload: Record<string, unknown>): Promise<void>;
}

// ── In-process sequential queue ─────────────────────────────────────────────

type InProcessJob = { name: JobName; payload: Record<string, unknown> };

const globalForQueue = globalThis as unknown as {
  __autocert_queue: InProcessJob[];
  __autocert_draining: boolean;
};

function queueState() {
  globalForQueue.__autocert_queue ??= [];
  globalForQueue.__autocert_draining ??= false;
  return globalForQueue;
}

export function enqueueInProcess(job: InProcessJob): void {
  const q = queueState();
  q.__autocert_queue.push(job);
  setImmediate(() => void drainInProcess());
}

export async function drainInProcess(): Promise<void> {
  const q = queueState();
  if (q.__autocert_draining) return;
  q.__autocert_draining = true;
  try {
    while (q.__autocert_queue.length) {
      const job = q.__autocert_queue.shift()!;
      try {
        await runJob(job.name, job.payload);
      } catch (err) {
        console.error(`[queue] job ${job.name} failed`, err);
      }
    }
  } finally {
    // Reset the flag so later enqueues can drain again (a stuck `true` here
    // permanently blocks every job queued after the first drain).
    q.__autocert_draining = false;
  }
}

// ── Redis/BullMQ mode ───────────────────────────────────────────────────────

export function isRedisConfigured(): boolean {
  return (process.env.QUEUE_MODE || "inprocess") === "redis" && !!process.env.REDIS_URL;
}

export async function enqueue(name: JobName, payload: Record<string, unknown>): Promise<void> {
  if (isRedisConfigured()) {
    const { default: IORedis } = await import("ioredis");
    const { Queue } = await import("bullmq");
    const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    const queue = new Queue("autocert", { connection });
    await queue.add(name, payload);
    await connection.quit();
    return;
  }
  enqueueInProcess({ name, payload });
}

// ── Handler registry (shared between in-process queue and BullMQ worker) ──

const handlers = new Map<JobName, (payload: any) => Promise<void>>();

export function registerHandler(name: JobName, fn: (payload: any) => Promise<void>): void {
  handlers.set(name, fn);
}

export function ensureHandlersRegistered(): void {
  if (handlers.size === 0) {
    // Static imports (webpack-safe); the job modules do not import this file.
    registerHandler(
      "generate-certificates",
      async (p) => void (await jobsGenerate.handleGenerateCertificates(p as never))
    );
    registerHandler(
      "send-emails",
      async (p) => void (await jobsSend.handleSendEmails(p as never))
    );
  }
}

import * as jobsGenerate from "./jobs/generate";
import * as jobsSend from "./jobs/send";

// ── In-process retry sweep ──────────────────────────────────────────────────
// Emails that failed with backoff (RETRYING + nextRetryAt in the past) must be
// re-enqueued even when nothing else touches the queue. In Redis mode the
// worker owns retries; in the default inprocess mode we run a light interval.
const globalForSweep = globalThis as unknown as { __autocert_retry_sweep?: boolean };
function ensureRetrySweep(): void {
  if (isRedisConfigured()) return;
  if (globalForSweep.__autocert_retry_sweep) return;
  globalForSweep.__autocert_retry_sweep = true;
  const timer = setInterval(() => {
    jobsSend
      .retryDueEmails()
      .catch((err) => console.error("[queue] retry sweep failed", err));
  }, 60_000);
  // Never keep the process alive just for the sweep.
  (timer as unknown as { unref?: () => void }).unref?.();
}
ensureRetrySweep();

async function runJob(name: JobName, payload: Record<string, unknown>): Promise<void> {
  await runJobNow(name, payload);
}

export async function runJobNow(name: JobName, payload: Record<string, unknown>): Promise<void> {
  ensureHandlersRegistered();
  const fn = handlers.get(name);
  if (!fn) throw new Error(`No handler registered for job ${name}`);
  await fn(payload);
}

// ── DB-backed job bookkeeping helpers ───────────────────────────────────────

export async function markEventProcessing(eventId: string): Promise<void> {
  await prisma.event.update({ where: { id: eventId }, data: { updatedAt: new Date() } }).catch(() => {});
}

// BullMQ worker registration (Redis mode) — shares the same handlers as the
// in-process queue so both modes behave identically.
export async function registerWorkers(opts: {
  Queue: unknown;
  Worker: new (name: string, processor: any, opts?: unknown) => {
    on(event: string, fn: (...args: unknown[]) => void): void;
  };
  connection: unknown;
  prisma: unknown;
}): Promise<void> {
  void opts.Queue;
  void opts.prisma;
  const { Worker } = await import("bullmq");
  const IORedis = (await import("ioredis")).default;
  const { ensureHandlersRegistered, runJobNow } = await import("./queue-bridge");

  ensureHandlersRegistered();

  const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

  new Worker(
    "autocert",
    async (job: { name: string; data: Record<string, unknown> }) => {
      await runJobNow(job.name as "generate-certificates" | "send-emails", job.data);
    },
    { connection }
  );
}

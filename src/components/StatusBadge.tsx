import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  QUEUED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  GENERATING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  GENERATED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  SENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PARTIAL: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  RETRYING: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  REVOKED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  VALID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  NOT_FOUND: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("badge", STYLES[status] || "bg-muted text-muted-foreground", className)}>
      {status.toLowerCase()}
    </span>
  );
}

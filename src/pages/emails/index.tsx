"use client";
import { useCallback, useEffect, useState } from "react";
import { MailCheck, RefreshCw, RotateCcw } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/utils";

type JobRow = {
  id: string; status: string; total: number; sent: number; failed: number;
  testMode: boolean; testEmail: string | null; createdAt: string;
  eventName?: string;
};

export default function EmailsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/emails");
    if (res.ok) setJobs((await res.json()).jobs || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function retryFailed(jobId: string) {
    await fetch(`/api/emails?action=retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailJobId: jobId }),
    });
    void load();
  }

  return (
    <DashboardShell title="Email Delivery">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Per-recipient delivery with automatic exponential-backoff retries.</p>
        <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !jobs.length ? (
        <div className="card grid place-items-center gap-2 p-16 text-center">
          <MailCheck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No email batches yet. Generate certificates, then send from the event workspace.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">When</th><th className="th">Event</th><th className="th">Status</th>
                <th className="th">Total</th><th className="th">Sent</th><th className="th">Failed</th>
                <th className="th">Mode</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-muted/30">
                  <td className="td whitespace-nowrap text-sm">{formatDateTime(j.createdAt)}</td>
                  <td className="td">{j.eventName || "—"}</td>
                  <td className="td"><StatusBadge status={j.status} /></td>
                  <td className="td tabular-nums">{j.total}</td>
                  <td className="td tabular-nums text-emerald-600">{j.sent}</td>
                  <td className="td tabular-nums text-destructive">{j.failed}</td>
                  <td className="td">{j.testMode ? <span className="badge bg-amber-100 text-amber-800">TEST → {j.testEmail}</span> : "live"}</td>
                  <td className="td">
                    {j.failed > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => retryFailed(j.id)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Retry failed
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}

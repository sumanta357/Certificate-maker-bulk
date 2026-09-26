"use client";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/utils";

type VRow = { id: string; result: string; certificateId: string; createdAt: string; ipHash: string | null };

export default function VerificationPage() {
  const [rows, setRows] = useState<VRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/verification")
      .then(async (r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => setRows(d.records || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell title="Verification Records">
      <p className="mb-4 text-sm text-muted-foreground">
        Every public lookup is recorded (result + hashed IP). Emails are never exposed.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <div className="card grid place-items-center gap-2 p-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No verification lookups yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="w-full">
            <thead>
              <tr><th className="th">When</th><th className="th">Certificate</th><th className="th">Result</th><th className="th">IP (hashed)</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="td whitespace-nowrap text-sm">{formatDateTime(r.createdAt)}</td>
                  <td className="td font-mono text-xs">{r.certificateId}</td>
                  <td className="td"><StatusBadge status={r.result} /></td>
                  <td className="td font-mono text-xs text-muted-foreground">{r.ipHash?.slice(0, 12) || "—"}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}

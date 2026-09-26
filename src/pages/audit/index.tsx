"use client";
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { formatDateTime } from "@/lib/utils";

type Row = {
  id: string; action: string; entityType: string | null; entityId: string | null;
  createdAt: string; user?: { name?: string | null; email: string } | null; metadata: string | null;
};

export default function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit?page=${page}`)
      .then(async (r) => (r.ok ? r.json() : { items: [], total: 0 }))
      .then((d) => {
        setRows(
          (d.items || []).map((i: any) => ({
            id: i.id,
            action: i.action,
            entityType: i.entityType,
            entityId: i.entityId,
            createdAt: i.createdAt,
            user: i.user,
            metadata: i.metadata,
          }))
        );
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <DashboardShell title="Audit Log">
      <p className="mb-4 text-sm text-muted-foreground">
        Immutable record of important actions: logins, imports, template edits, generation, sends, revocations.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <div className="card grid place-items-center gap-2 p-16 text-center">
          <ScrollText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No audit entries yet.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr><th className="th">When</th><th className="th">Action</th><th className="th">User</th><th className="th">Entity</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="td whitespace-nowrap text-sm">{formatDateTime(r.createdAt)}</td>
                    <td className="td font-medium">{r.action}</td>
                    <td className="td text-sm text-muted-foreground">{r.user?.name || r.user?.email || "system"}</td>
                    <td className="td text-xs text-muted-foreground">
                      {r.entityType ? `${r.entityType} ${r.entityId?.slice(0, 10)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} entries</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

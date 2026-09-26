"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Award } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";

type Row = {
  id: string; name: string; email: string | null; certificateId: string | null;
  status: string; revoked: boolean; eventId: string; eventName: string;
};

export default function CertificatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventId, setEventId] = useState("ALL");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events").then(async (r) => (r.ok ? r.json() : { events: [] })).then((d) => setEvents(d.events || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    if (eventId === "ALL") {
      // Aggregate from all events
      const all: Row[] = [];
      for (const ev of events) {
        const res = await fetch(`/api/events/${ev.id}/participants?pageSize=100&q=${encodeURIComponent(q)}&status=${status}`);
        if (res.ok) {
          const d = await res.json();
          for (const p of d.participants || []) {
            all.push({ ...p, eventId: ev.id, eventName: ev.name });
          }
        }
      }
      setRows(all);
    } else {
      const res = await fetch(`/api/events/${eventId}/participants?pageSize=100&q=${encodeURIComponent(q)}&status=${status}`);
      if (res.ok) {
        const d = await res.json();
        setRows((d.participants || []).map((p: any) => ({ ...p, eventId, eventName: events.find((e) => e.id === eventId)?.name || "" })));
      }
    }
    setLoading(false);
  }, [events, eventId, q, status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <DashboardShell title="Certificates">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-56" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="ALL">All events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input className="input w-56" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {["PENDING", "GENERATED", "QUEUED", "SENT", "FAILED", "REVOKED"].map((s) => <option key={s}>{s}</option>)}
        </select>
        {eventId !== "ALL" && (
          <a className="btn btn-secondary btn-sm" href={`/api/events/${eventId}/download?mode=zip`}>
            <Download className="h-3.5 w-3.5" /> Download ZIP
          </a>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <div className="card grid place-items-center gap-2 p-16 text-center">
          <Award className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No certificates found. Generate them from an event workspace.</p>
          <Link href="/events" className="btn btn-primary btn-sm mt-2">Go to events</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="w-full">
            <thead>
              <tr><th className="th">Certificate ID</th><th className="th">Name</th><th className="th">Event</th><th className="th">Status</th><th className="th">PDF</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="td font-mono text-xs">{r.certificateId || "—"}</td>
                  <td className="td font-medium">{r.name}</td>
                  <td className="td">
                    <Link href={`/events/${r.eventId}`} className="text-sm text-primary hover:underline">{r.eventName}</Link>
                  </td>
                  <td className="td"><StatusBadge status={r.revoked ? "REVOKED" : r.status} /></td>
                  <td className="td">
                    {r.certificateId && (
                      <a className="btn btn-ghost btn-sm" href={`/api/certificates/${r.certificateId}/pdf`} target="_blank" rel="noreferrer">View</a>
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

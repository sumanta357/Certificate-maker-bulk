"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/utils";

type EventRow = {
  id: string;
  name: string;
  certificateType: string;
  eventDate: string | null;
  testMode: boolean;
  stats: { participants: number; generated: number; sent: number; failed: number };
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then(async (r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell title="Events">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Each event has its own participants, templates, certificates and email history.
        </p>
        <Link href="/events/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New event</Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      ) : !events.length ? (
        <div className="card grid place-items-center gap-3 p-16 text-center">
          <p className="font-display text-lg font-semibold">No events yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first event, upload a CSV, design a certificate and let AutoCert do the rest.
          </p>
          <Link href="/events/new" className="btn btn-primary mt-2"><Plus className="h-4 w-4" /> Create event</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Event</th>
                <th className="th">Type</th>
                <th className="th">Date</th>
                <th className="th">Participants</th>
                <th className="th">Generated</th>
                <th className="th">Sent</th>
                <th className="th">Failed</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-muted/40">
                  <td className="td">
                    <Link href={`/events/${e.id}`} className="font-medium hover:text-primary">
                      {e.name} {e.testMode && <span className="badge ml-1 bg-amber-100 text-amber-800">test</span>}
                    </Link>
                  </td>
                  <td className="td text-muted-foreground">{e.certificateType}</td>
                  <td className="td text-muted-foreground">{formatDate(e.eventDate)}</td>
                  <td className="td tabular-nums">{e.stats.participants}</td>
                  <td className="td tabular-nums">{e.stats.generated}</td>
                  <td className="td tabular-nums">{e.stats.sent}</td>
                  <td className="td tabular-nums">{e.stats.failed > 0 ? <span className="text-destructive">{e.stats.failed}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}

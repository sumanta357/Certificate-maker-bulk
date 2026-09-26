"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Users, Award, MailCheck, Hourglass, AlertTriangle, BadgeCheck, Ban, ArrowRight, Plus } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { formatDateTime } from "@/lib/utils";

type Stats = {
  stats: { totalEvents: number; totalParticipants: number; generated: number; sent: number; pending: number; failed: number; verified: number; revoked: number };
  recentEvents: { id: string; name: string; participants: number; updatedAt: string }[];
  recentAudit: { id: string; action: string; createdAt: string; user?: { name?: string | null; email: string } | null }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then(async (r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  const cards = [
    { label: "Events", value: data?.stats.totalEvents, icon: CalendarDays, href: "/events" },
    { label: "Participants", value: data?.stats.totalParticipants, icon: Users, href: "/events" },
    { label: "Generated", value: data?.stats.generated, icon: Award, href: "/certificates" },
    { label: "Sent", value: data?.stats.sent, icon: MailCheck, href: "/emails" },
    { label: "Pending", value: data?.stats.pending, icon: Hourglass, href: "/events" },
    { label: "Failed", value: data?.stats.failed, icon: AlertTriangle, href: "/emails" },
    { label: "Verified", value: data?.stats.verified, icon: BadgeCheck, href: "/verification" },
    { label: "Revoked", value: data?.stats.revoked, icon: Ban, href: "/certificates" },
  ];

  return (
    <DashboardShell title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{c.value ?? "—"}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Recent events</h2>
            <Link href="/events" className="flex items-center gap-1 text-sm text-primary hover:underline">
              All events <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {!data?.recentEvents.length ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">No events yet.</p>
              <Link href="/events/new" className="btn btn-primary btn-sm mt-4"><Plus className="h-3.5 w-3.5" /> Create your first event</Link>
            </div>
          ) : (
            <ul className="divide-y">
              {data.recentEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50">
                    <span className="truncate text-sm font-medium">{e.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">{e.participants} participants</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Activity</h2>
          </div>
          {!data?.recentAudit.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {data.recentAudit.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="truncate">
                    <span className="font-medium">{a.action}</span>
                    {a.user ? <span className="text-muted-foreground"> · {a.user.name || a.user.email}</span> : null}
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

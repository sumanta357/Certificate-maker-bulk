"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity, Building2, Eye, EyeOff, RefreshCw, Search, ShieldHalf, Trash2, Users2,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { formatDateTime } from "@/lib/utils";

const ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"] as const;
type TabKey = "overview" | "users" | "orgs";

type Overview = {
  totals: {
    organizations: number; users: number; activeUsers: number; events: number;
    participants: number; generated: number; sent: number; failed: number;
    verifications: number; revoked: number;
  };
  orgs: { id: string; name: string; users: number; events: number; participants: number; sent: number; createdAt: string }[];
  recentAudit: {
    id: string; action: string; createdAt: string;
    user: { name: string | null; email: string } | null;
    organization: { name: string } | null;
  }[];
};

type AdminUser = {
  id: string; name: string | null; email: string; role: string; isActive: boolean;
  createdAt: string; organization: { id: string; name: string };
};

type OrgRow = {
  id: string; name: string; slug: string; users: number; events: number;
  participants: number; sent: number; certificates: number; createdAt: string;
};

type OrgDetail = {
  organization: {
    id: string; name: string; slug: string; website: string | null;
    contactEmail: string | null; idPrefix: string;
    emailFromAddress: string | null; emailFromName: string | null;
  };
  users: { id: string; name: string | null; email: string; role: string; isActive: boolean; createdAt: string }[];
  stats: {
    events: number; participants: number; generated: number; sent: number;
    failed: number; certificates: number; revoked: number; verifications: number;
    statusCounts: Record<string, number>;
  };
  recentEvents: { id: string; name: string; participants: number; updatedAt: string }[];
  recentEmailJobs: { id: string; eventName: string; status: string; total: number; sent: number; failed: number; createdAt: string }[];
  recentAudit: { id: string; action: string; createdAt: string; user: { name: string | null; email: string } | null }[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value ?? "—"}</p>
    </div>
  );
}

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    SUPER_ADMIN: "bg-primary/15 text-primary",
    ADMIN: "bg-accent text-accent-foreground",
    EDITOR: "bg-muted text-muted-foreground",
    VIEWER: "bg-muted text-muted-foreground",
  };
  return <span className={`badge ${styles[role] || "bg-muted text-muted-foreground"}`}>{role.replace("_", " ").toLowerCase()}</span>;
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 5000);
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      const err = e as Error & { status?: number };
      if (err.status === 403) setDenied(true);
      notify(err.message || "Something went wrong");
    },
    [notify]
  );

  const loadOverview = useCallback(() => {
    api<Overview>("/api/admin/overview").then(setOverview).catch(fail);
  }, [fail]);

  const loadUsers = useCallback(() => {
    api<{ users: AdminUser[] }>("/api/admin/users").then((d) => setUsers(d.users)).catch(fail);
  }, [fail]);

  const loadOrgs = useCallback(() => {
    api<{ organizations: OrgRow[] }>("/api/admin/organizations").then((d) => setOrgs(d.organizations)).catch(fail);
  }, [fail]);

  const loadDetail = useCallback(
    (id: string) => {
      setDetailId(id);
      setDetail(null);
      api<OrgDetail>(`/api/admin/organizations/${id}`).then(setDetail).catch(fail);
    },
    [fail]
  );

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (tab === "users" && !users.length) loadUsers();
    if (tab === "orgs" && !orgs.length) loadOrgs();
  }, [tab, users.length, orgs.length, loadUsers, loadOrgs]);

  async function patchUser(userId: string, patch: { role?: string; isActive?: boolean }) {
    try {
      await api("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      setUsers((us) => us.map((u) => (u.id === userId ? { ...u, ...patch } : u)));
      if (detail) {
        setDetail({ ...detail, users: detail.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)) });
      }
      notify("User updated");
    } catch (e) {
      fail(e);
      loadUsers();
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!window.confirm(`Delete ${u.email}? Their sessions end immediately. This cannot be undone.`)) return;
    try {
      await api(`/api/admin/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
      setUsers((us) => us.filter((x) => x.id !== u.id));
      if (detail) setDetail({ ...detail, users: detail.users.filter((x) => x.id !== u.id) });
      notify("User deleted");
    } catch (e) {
      fail(e);
    }
  }

  async function saveOrgSettings(form: OrgDetail["organization"]) {
    setBusy(true);
    try {
      await api(`/api/admin/organizations/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          website: form.website,
          contactEmail: form.contactEmail,
          idPrefix: form.idPrefix,
          emailFromAddress: form.emailFromAddress,
          emailFromName: form.emailFromName,
        }),
      });
      notify("Organization saved");
      loadOrgs();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (denied) {
    return (
      <DashboardShell title="Admin">
        <div className="card mx-auto max-w-lg p-10 text-center">
          <ShieldHalf className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Super Admin access required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The master admin console is restricted to the platform Super Admin account.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q) || u.organization.name.toLowerCase().includes(q);
  });
  const filteredOrgs = orgs.filter((o) => !orgSearch.trim() || o.name.toLowerCase().includes(orgSearch.trim().toLowerCase()));

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: `Users (${users.length || "…"})` },
    { key: "orgs", label: `Organizations (${orgs.length || "…"})` },
  ];

  return (
    <DashboardShell title="Admin Console">
      {msg && <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">{msg}</div>}

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Organizations" value={overview?.totals.organizations} />
            <Stat label="Users" value={overview?.totals.users} />
            <Stat label="Events" value={overview?.totals.events} />
            <Stat label="Participants" value={overview?.totals.participants} />
            <Stat label="Certificates" value={overview?.totals.generated} />
            <Stat label="Emails sent" value={overview?.totals.sent} />
            <Stat label="Emails failed" value={overview?.totals.failed} />
            <Stat label="Verifications" value={overview?.totals.verifications} />
            <Stat label="Revoked" value={overview?.totals.revoked} />
            <Stat label="Active users" value={overview?.totals.activeUsers} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4" /> All organizations</h2>
                <button className="btn btn-ghost btn-sm" onClick={loadOverview}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
              </div>
              <div className="table-wrap m-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="th">Organization</th><th className="th">Users</th><th className="th">Events</th><th className="th">Participants</th><th className="th">Sent</th></tr></thead>
                  <tbody>
                    {overview?.orgs.map((o) => (
                      <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="td font-medium">{o.name}</td>
                        <td className="td tabular-nums">{o.users}</td>
                        <td className="td tabular-nums">{o.events}</td>
                        <td className="td tabular-nums">{o.participants}</td>
                        <td className="td tabular-nums">{o.sent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" /> Platform activity</h2></div>
              <ul className="divide-y">
                {overview?.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="truncate">
                      <span className="font-medium">{a.action}</span>
                      <span className="text-muted-foreground"> · {a.user?.name || a.user?.email || "system"}</span>
                      {a.organization ? <span className="text-muted-foreground"> · {a.organization.name}</span> : null}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
                {!overview?.recentAudit.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</li>}
              </ul>
            </section>
          </div>
        </div>
      )}

      {/* ── Users ────────────────────────────────────────────────────────── */}
      {tab === "users" && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold"><Users2 className="h-4 w-4" /> All users</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-64 pl-9" placeholder="Search name, email, org…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap m-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="th">User</th><th className="th">Organization</th><th className="th">Role</th>
                  <th className="th">Status</th><th className="th">Joined</th><th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="td">
                      <p className="font-medium">{u.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="td">{u.organization.name}</td>
                    <td className="td">
                      <select
                        className="input h-8 w-36 text-xs"
                        value={u.role}
                        onChange={(e) => patchUser(u.id, { role: e.target.value })}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="td">
                      <span className={`badge ${u.isActive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}`}>
                        {u.isActive ? "active" : "disabled"}
                      </span>
                    </td>
                    <td className="td text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button className="btn btn-ghost btn-sm !h-8 !px-2" title={u.isActive ? "Deactivate" : "Activate"} onClick={() => patchUser(u.id, { isActive: !u.isActive })}>
                          {u.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button className="btn btn-ghost btn-sm !h-8 !px-2 text-destructive" title="Delete user" onClick={() => deleteUser(u)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length && (
                  <tr><td colSpan={6} className="td py-8 text-center text-muted-foreground">No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-4 text-xs text-muted-foreground">
            Roles: viewers read, editors import/design/send, admins manage their organization, super admins manage the whole platform.
          </p>
        </section>
      )}

      {/* ── Organizations ────────────────────────────────────────────────── */}
      {tab === "orgs" && (
        <div className="space-y-6">
          {detail && (
            <section className="card">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="font-semibold">{detail.organization.name}</h2>
                  <p className="text-xs text-muted-foreground">/{detail.organization.slug} · ID prefix {detail.organization.idPrefix}</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setDetail(null); setDetailId(null); }}>Close</button>
              </div>

              {!detail ? null : (
                <div className="space-y-6 p-5">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat label="Events" value={detail.stats.events} />
                    <Stat label="Participants" value={detail.stats.participants} />
                    <Stat label="Emails sent" value={detail.stats.sent} />
                    <Stat label="Emails failed" value={detail.stats.failed} />
                    <Stat label="Certificates" value={detail.stats.certificates} />
                    <Stat label="Verifications" value={detail.stats.verifications} />
                    <Stat label="Revoked" value={detail.stats.revoked} />
                    <Stat label="Team members" value={detail.users.length} />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Org settings + email sender identity */}
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-semibold">Organization &amp; email settings</h3>
                      <div className="mt-3 space-y-3">
                        <label className="block">
                          <span className="label">Name</span>
                          <input className="input mt-1" value={detail.organization.name}
                            onChange={(e) => setDetail({ ...detail, organization: { ...detail.organization, name: e.target.value } })} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="label">Contact email</span>
                            <input className="input mt-1" type="email" value={detail.organization.contactEmail || ""}
                              onChange={(e) => setDetail({ ...detail, organization: { ...detail.organization, contactEmail: e.target.value } })} />
                          </label>
                          <label className="block">
                            <span className="label">ID prefix</span>
                            <input className="input mt-1" maxLength={16} value={detail.organization.idPrefix}
                              onChange={(e) => setDetail({ ...detail, organization: { ...detail.organization, idPrefix: e.target.value.toUpperCase() } })} />
                          </label>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-medium">Sender identity (per-organization)</p>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="label">From name</span>
                              <input className="input mt-1" value={detail.organization.emailFromName || ""}
                                onChange={(e) => setDetail({ ...detail, organization: { ...detail.organization, emailFromName: e.target.value } })} />
                            </label>
                            <label className="block">
                              <span className="label">From address</span>
                              <input className="input mt-1" type="email" value={detail.organization.emailFromAddress || ""}
                                onChange={(e) => setDetail({ ...detail, organization: { ...detail.organization, emailFromAddress: e.target.value } })} />
                            </label>
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveOrgSettings(detail.organization)}>
                          {busy ? "Saving…" : "Save organization"}
                        </button>
                      </div>
                    </div>

                    {/* Team of this org */}
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-semibold">Team</h3>
                      <ul className="mt-3 space-y-2">
                        {detail.users.map((u) => (
                          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <select className="input h-8 w-32 text-xs" value={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })}>
                                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <span className={`badge ${u.isActive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}`}>
                                {u.isActive ? "active" : "disabled"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Recent events */}
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-semibold">Recent events</h3>
                      <ul className="mt-3 divide-y">
                        {detail.recentEvents.map((e) => (
                          <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                            <span className="truncate">{e.name}</span>
                            <span className="ml-3 shrink-0 text-xs text-muted-foreground">{e.participants} participants</span>
                          </li>
                        ))}
                        {!detail.recentEvents.length && <li className="py-4 text-sm text-muted-foreground">No events.</li>}
                      </ul>
                    </div>

                    {/* Email jobs + audit */}
                    <div className="rounded-xl border p-4">
                      <h3 className="text-sm font-semibold">Recent email jobs</h3>
                      <ul className="mt-3 divide-y">
                        {detail.recentEmailJobs.map((j) => (
                          <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                            <span className="truncate">{j.eventName}</span>
                            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                              {j.status} · {j.sent}/{j.total}{j.failed ? ` · ${j.failed} failed` : ""}
                            </span>
                          </li>
                        ))}
                        {!detail.recentEmailJobs.length && <li className="py-4 text-sm text-muted-foreground">No email jobs yet.</li>}
                      </ul>
                      <h3 className="mt-4 text-sm font-semibold">Recent activity</h3>
                      <ul className="mt-2 divide-y">
                        {detail.recentAudit.map((a) => (
                          <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                            <span className="truncate">{a.action}<span className="text-muted-foreground"> · {a.user?.email || "system"}</span></span>
                            <span className="ml-3 shrink-0 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                          </li>
                        ))}
                        {!detail.recentAudit.length && <li className="py-4 text-sm text-muted-foreground">No activity.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4" /> Organizations</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input className="input w-56 pl-9" placeholder="Search organizations…" value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} />
              </div>
            </div>
            <div className="table-wrap m-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="th">Organization</th><th className="th">Users</th><th className="th">Events</th>
                    <th className="th">Participants</th><th className="th">Sent</th><th className="th">Certificates</th>
                    <th className="th text-right">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map((o) => (
                    <tr key={o.id} className={`border-b last:border-0 hover:bg-muted/40 ${detailId === o.id ? "bg-primary/5" : ""}`}>
                      <td className="td font-medium">{o.name}</td>
                      <td className="td tabular-nums">{o.users}</td>
                      <td className="td tabular-nums">{o.events}</td>
                      <td className="td tabular-nums">{o.participants}</td>
                      <td className="td tabular-nums">{o.sent}</td>
                      <td className="td tabular-nums">{o.certificates}</td>
                      <td className="td text-right">
                        <button className="btn btn-secondary btn-sm" onClick={() => loadDetail(o.id)}>
                          <Eye className="h-3.5 w-3.5" /> View data
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredOrgs.length && <tr><td colSpan={7} className="td py-8 text-center text-muted-foreground">No organizations.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}

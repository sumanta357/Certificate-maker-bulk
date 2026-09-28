"use client";
import { useEffect, useState } from "react";
import { Building2, KeyRound, Mail, Send, Users2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";

type Org = {
  id: string; name: string; website: string | null; contactEmail: string | null;
  address: string | null; emailSignature: string | null; idPrefix: string;
  emailFromAddress: string | null; emailFromName: string | null;
};
type TeamUser = { id: string; name: string | null; email: string; role: string; isActive: boolean };
type EmailCfg = {
  provider: string;
  configured: boolean;
  missing: string[];
  envFrom: { address: string | null; name: string | null };
  orgFrom: { address: string | null; name: string | null };
  effectiveFrom: string;
  stats: { sent: number; failed: number; pending: number };
};

const ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"];

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [msg, setMsg] = useState("");

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [emailCfg, setEmailCfg] = useState<EmailCfg | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<{ busy: boolean; result?: string; error?: string }>({ busy: false });

  useEffect(() => {
    fetch("/api/settings/email")
      .then(async (r) => (r.ok ? r.json() : null))
      .then(setEmailCfg)
      .catch(() => {});
  }, []);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTestState({ busy: true });
    try {
      const res = await fetch("/api/settings/email?action=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setTestState({ busy: false, error: d.error || "Test send failed" });
      else {
        setTestState({ busy: false, result: d.note || `Sent via ${d.provider}${d.messageId ? ` (${d.messageId})` : ""}` });
        fetch("/api/settings/email").then(async (r) => (r.ok ? r.json() : null)).then(setEmailCfg).catch(() => {});
      }
    } catch {
      setTestState({ busy: false, error: "Test send failed" });
    }
  }

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setOrg(d.organization);
        setUsers(d.users);
        setMe(d.me);
      })
      .catch(() => {});
  }, []);

  const canManage = me?.role === "ADMIN" || me?.role === "SUPER_ADMIN";

  async function saveOrg() {
    if (!org) return;
    const res = await fetch("/api/settings?section=organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: org.name,
        website: org.website,
        contactEmail: org.contactEmail,
        address: org.address,
        emailSignature: org.emailSignature,
        idPrefix: org.idPrefix,
        emailFromAddress: org.emailFromAddress,
        emailFromName: org.emailFromName,
      }),
    });
    setMsg(res.ok ? "Organization settings saved." : "Save failed — check permissions.");
    setTimeout(() => setMsg(""), 4000);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings?section=password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pwForm),
    });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Password updated." : d.error || "Password change failed.");
    if (res.ok) setPwForm({ currentPassword: "", newPassword: "" });
    setTimeout(() => setMsg(""), 4000);
  }

  async function updateUser(userId: string, patch: { role?: string; isActive?: boolean }) {
    const res = await fetch("/api/settings?section=user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    if (res.ok) {
      setUsers((us) => us.map((u) => (u.id === userId ? { ...u, ...patch } as TeamUser : u)));
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "Update failed");
      setTimeout(() => setMsg(""), 4000);
    }
  }

  return (
    <DashboardShell title="Settings">
      {msg && <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" /> Organization</h2>
          {org && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="label">Organization name</span>
                <input className="input mt-1" value={org.name} disabled={!canManage} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Website</span>
                  <input className="input mt-1" value={org.website || ""} disabled={!canManage} onChange={(e) => setOrg({ ...org, website: e.target.value })} />
                </label>
                <label className="block">
                  <span className="label">Contact email</span>
                  <input className="input mt-1" value={org.contactEmail || ""} disabled={!canManage} onChange={(e) => setOrg({ ...org, contactEmail: e.target.value })} />
                </label>
              </div>
              <label className="block">
                <span className="label">Address</span>
                <input className="input mt-1" value={org.address || ""} disabled={!canManage} onChange={(e) => setOrg({ ...org, address: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Default email signature</span>
                <textarea className="input mt-1 h-20 py-2" value={org.emailSignature || ""} disabled={!canManage} onChange={(e) => setOrg({ ...org, emailSignature: e.target.value })} />
              </label>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">Sender identity for certificate emails</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Emails are sent “From” this address. The domain must be verified on the
                  deployment’s email provider (Resend, SendGrid, …) or delivery will fail.
                  Leave blank to use the platform default (EMAIL_FROM).
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">From name</span>
                    <input
                      className="input mt-1"
                      placeholder="Insilicofusion Certificates"
                      value={org.emailFromName || ""}
                      disabled={!canManage}
                      maxLength={120}
                      onChange={(e) => setOrg({ ...org, emailFromName: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="label">From address</span>
                    <input
                      type="email"
                      className="input mt-1"
                      placeholder="certificates@yourdomain.com"
                      value={org.emailFromAddress || ""}
                      disabled={!canManage}
                      onChange={(e) => setOrg({ ...org, emailFromAddress: e.target.value })}
                    />
                  </label>
                </div>
              </div>
              <label className="block max-w-[180px]">
                <span className="label">Certificate ID prefix</span>
                <input className="input mt-1" value={org.idPrefix} disabled={!canManage} maxLength={16} onChange={(e) => setOrg({ ...org, idPrefix: e.target.value.toUpperCase() })} />
              </label>
              {canManage && <button className="btn btn-primary w-fit" onClick={saveOrg}>Save organization</button>}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-primary" /> Email delivery</h2>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge bg-primary/15 text-primary">{emailCfg?.provider || "…"}</span>
                {emailCfg && (
                  <span
                    className={`badge ${
                      emailCfg.provider === "console"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : emailCfg.configured
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {emailCfg.provider === "console"
                      ? "log-only — not sending"
                      : emailCfg.configured
                        ? "live"
                        : "missing credentials"}
                  </span>
                )}
                {emailCfg && (
                  <span className="text-xs text-muted-foreground">
                    {emailCfg.stats.sent} sent · {emailCfg.stats.failed} failed · {emailCfg.stats.pending} in progress
                  </span>
                )}
              </div>

              {emailCfg && emailCfg.provider === "console" && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                  <code className="font-mono">EMAIL_PROVIDER=console</code> only writes emails to the server
                  log — nothing reaches an inbox. To send real email, set{" "}
                  <code className="font-mono">EMAIL_PROVIDER=resend</code> and{" "}
                  <code className="font-mono">RESEND_API_KEY</code> (Render → Environment → Save; in this
                  preview, Settings → Environment), then reload this page.
                </div>
              )}

              {emailCfg && !emailCfg.configured && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                  Set these environment variables on your host (e.g. Render → Environment → Save):
                  <code className="mx-1 font-mono">{emailCfg.missing.join(", ")}</code>
                  {emailCfg.provider === "resend" && (
                    <>
                      — create a free API key in Resend → API Keys, and set the verified sender via{" "}
                      <code className="mx-1 font-mono">EMAIL_FROM</code>.
                    </>
                  )}
                </div>
              )}

              {emailCfg && emailCfg.configured && emailCfg.provider !== "console" && !emailCfg.effectiveFrom && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                  No sender address resolved — set <code className="mx-1 font-mono">EMAIL_FROM</code> (and{" "}
                  <code className="font-mono">EMAIL_FROM_NAME</code>) or a From address in Sender identity.
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Effective sender: <span className="font-medium text-foreground">{emailCfg?.effectiveFrom || "(platform default)"}</span>
                {" "}— set per-organization in the Sender identity box, or platform-wide via EMAIL_FROM / EMAIL_FROM_NAME env vars.
                Provider credentials are server-side env vars only and are never shown in the UI.
              </p>

              <form onSubmit={sendTest} className="flex flex-wrap items-end gap-2">
                <label className="block flex-1 min-w-[200px]">
                  <span className="label">Send a test email to</span>
                  <input
                    type="email"
                    required
                    className="input mt-1"
                    placeholder="you@example.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                </label>
                <button className="btn btn-secondary" disabled={testState.busy}>
                  <Send className="h-3.5 w-3.5" /> {testState.busy ? "Sending…" : "Test send"}
                </button>
              </form>
              {testState.result && <p className="text-xs text-emerald-600 dark:text-emerald-400">{testState.result}</p>}
              {testState.error && <p className="text-xs text-destructive">{testState.error}</p>}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Change password</h2>
            <form onSubmit={changePassword} className="mt-4 space-y-3">
              <label className="block">
                <span className="label">Current password</span>
                <input type="password" className="input mt-1" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
              </label>
              <label className="block">
                <span className="label">New password (min 8)</span>
                <input type="password" className="input mt-1" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} required minLength={8} />
              </label>
              <button className="btn btn-secondary">Update password</button>
            </form>
          </section>

          <section className="card p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Users2 className="h-4 w-4 text-primary" /> Team</h2>
            <div className="mt-4 space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  {canManage && u.id !== me?.id ? (
                    <div className="flex items-center gap-2">
                      <select className="input h-8 w-32 text-xs" value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}>
                        {ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                        title={u.isActive ? "Deactivate" : "Activate"}
                      >
                        {u.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ) : (
                    <span className="badge bg-muted text-muted-foreground">{u.role.replace("_", " ").toLowerCase()}</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Roles: viewers can read, editors can import/design/send, admins manage settings and users.
            </p>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}

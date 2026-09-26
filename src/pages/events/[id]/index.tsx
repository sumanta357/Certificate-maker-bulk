"use client";
// Event workspace: the full UPLOAD → MAP → TEMPLATE → PREVIEW → GENERATE → SEND flow.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Upload, FileText, Palette, Eye, Zap, MailCheck, Users, Settings2, Download, RefreshCw,
  AlertTriangle, CheckCircle2, ChevronDown, Send, FlaskConical, Loader2, Search,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { CertificateCanvas } from "@/components/CertificateCanvasClient";
import { cn, formatDateTime } from "@/lib/utils";
import type { CertificateDesign } from "@/lib/design";

type EventData = {
  event: {
    id: string; name: string; certificateType: string; organizationDisplay: string | null;
    eventDate: string | null; location: string | null; organizer: string | null;
    description: string | null; idPrefix: string | null; testMode: boolean; testEmail: string | null;
    templateId: string | null;
    template?: { id: string; name: string } | null;
  };
};

type Participant = {
  id: string; name: string; email: string | null; certificateId: string | null;
  status: string; error: string | null; hasPdf: boolean; revoked: boolean;
};

type TemplateRow = { id: string; name: string; isBuiltIn: boolean; activeVersion?: { version: number } | null };

const TABS = [
  { key: "overview", label: "Overview", icon: Settings2 },
  { key: "participants", label: "Participants", icon: Users },
  { key: "import", label: "Import CSV", icon: Upload },
  { key: "template", label: "Template", icon: Palette },
  { key: "preview", label: "Preview", icon: Eye },
  { key: "send", label: "Generate & Send", icon: MailCheck },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function EventWorkspace() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";

  const [tab, setTab] = useState<TabKey>("overview");
  const [event, setEvent] = useState<EventData["event"] | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [previewPid, setPreviewPid] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ design: CertificateDesign; map: Record<string, string>; participant: { id: string; name: string } | null } | null>(null);
  const [sendingConfirm, setSendingConfirm] = useState<null | { count: number; invalid: number }>(null);
  const [testEmail, setTestEmail] = useState("");
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  const notify = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const loadEvent = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/events/${id}`);
    if (res.ok) setEvent((await res.json()).event);
  }, [id]);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/templates");
    if (res.ok) setTemplates((await res.json()).templates || []);
  }, []);

  const loadParticipants = useCallback(async () => {
    if (!id) return;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    const res = await fetch(`/api/events/${id}/participants?${params}`);
    if (res.ok) {
      const d = await res.json();
      setParticipants(d.participants || []);
      setStatusCounts(d.statusCounts || {});
      setTotal(d.total || 0);
    }
  }, [id, page, q, statusFilter]);

  useEffect(() => { void loadEvent(); }, [loadEvent]);
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);
  useEffect(() => { void loadParticipants(); }, [loadParticipants]);

  // ── CSV upload + mapping wizard ────────────────────────────────────────────

  const [csvState, setCsvState] = useState<{
    step: "idle" | "mapped" | "done";
    columns?: string[];
    rows?: number;
    detected?: { name?: string; email?: string; institution?: string };
    issues?: { rowNumber: number; errors: string[]; warnings: string[] }[];
    result?: { created: number; skipped: number; updated: number };
    fileName?: string;
    csvText?: string;
  }>({ step: "idle" });
  const [mapping, setMapping] = useState<{ name: string; email: string }>({ name: "", email: "" });
  const [dupMode, setDupMode] = useState<"skip" | "regenerate" | "replace">("skip");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFilePicked(file: File) {
    const text = await file.text();
    // Client-side parse for mapping UI
    const lines = text.trim().split(/\r?\n/);
    const cols = lines[0]?.split(",").map((c) => c.trim().replace(/^"|"$/g, "")) || [];
    const guessed = guessMapping(cols);
    setCsvState({ step: "mapped", columns: cols, rows: Math.max(0, lines.length - 1), fileName: file.name, csvText: text });
    setMapping({ name: guessed.name || "", email: guessed.email || "" });
  }

  function guessMapping(cols: string[]): { name?: string; email?: string } {
    const find = (hints: string[]) =>
      cols.find((c) => hints.some((h) => c.toLowerCase().replace(/[^a-z]/g, "") === h)) ||
      cols.find((c) => hints.some((h) => c.toLowerCase().includes(h)));
    return {
      name: find(["name", "fullname", "participantname", "studentname"]) || cols[0],
      email: find(["email", "emailaddress", "mail"]),
    };
  }

  async function confirmImport() {
    if (!csvState.csvText) return;
    setBusyFlag("import");
    try {
      const res = await fetch(`/api/events/${id}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: csvState.fileName,
          csvText: csvState.csvText,
          mapping: { name: mapping.name || undefined, email: mapping.email || undefined },
          duplicateMode: dupMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("err", data.error || "Import failed");
        return;
      }
      setCsvState((s) => ({ ...s, step: "done", result: data.participants, issues: data.issues, rows: data.import.rows }));
      notify("ok", `Imported ${data.participants.created} participants (${data.participants.skipped} skipped)`);
      void loadParticipants();
      void loadEvent();
    } finally {
      setBusyFlag(null);
    }
  }

  // ── Template selection & preview ───────────────────────────────────────────

  const [previewTemplateId, setPreviewTemplateId] = useState<string>("");

  useEffect(() => {
    if (event?.templateId) setPreviewTemplateId(event.templateId);
    else if (templates.length && !previewTemplateId) setPreviewTemplateId(templates[0].id);
  }, [event, templates, previewTemplateId]);

  const loadPreview = useCallback(async () => {
    if (!id || !previewTemplateId) return;
    const params = new URLSearchParams({ templateId: previewTemplateId });
    if (previewPid) params.set("participant", previewPid);
    const res = await fetch(`/api/events/${id}/preview?${params}`);
    if (res.ok) setPreview(await res.json());
  }, [id, previewTemplateId, previewPid]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  async function saveTemplateChoice() {
    setBusyFlag("template");
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: previewTemplateId || null }),
      });
      if (res.ok) {
        notify("ok", "Template selected for this event");
        void loadEvent();
      } else notify("err", "Could not save template choice");
    } finally {
      setBusyFlag(null);
    }
  }

  // ── Generate & send ────────────────────────────────────────────────────────

  async function generate(mode: "skip" | "regenerate" = "skip", participantIds?: string[]) {
    setBusyFlag("generate");
    try {
      const res = await fetch(`/api/events/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, participantIds }),
      });
      const data = await res.json();
      if (res.ok) notify("ok", `Generation started for ${data.queued} participants`);
      else notify("err", data.error || "Generation failed to start");
      setTimeout(() => void loadParticipants(), 1500);
    } finally {
      setBusyFlag(null);
    }
  }

  async function sendBatch() {
    if (!sendingConfirm) return;
    setBusyFlag("send");
    try {
      const res = await fetch(`/api/events/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) notify("ok", `Email batch queued for ${data.queued} recipients`);
      else notify("err", data.error || "Could not queue emails");
      setSendingConfirm(null);
    } finally {
      setBusyFlag(null);
    }
  }

  async function sendTest() {
    setBusyFlag("test");
    try {
      const res = await fetch(`/api/events/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMode: true, testEmail }),
      });
      const data = await res.json();
      if (res.ok) notify("ok", `Test certificate queued to ${testEmail}`);
      else notify("err", data.error || "Test send failed");
    } finally {
      setBusyFlag(null);
    }
  }

  async function participantAction(pid: string, action: string) {
    const cert = participants.find((p) => p.id === pid)?.certificateId;
    if (!cert) return;
    if (action === "revoke" && !confirm("Revoke this certificate? Verification will show REVOKED.")) return;
    setBusyFlag(`p-${pid}`);
    try {
      if (action === "download") {
        window.open(`/api/certificates/${cert}/pdf?download=1`, "_blank");
        return;
      }
      const res = await fetch(`/api/certificates/${cert}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        notify("ok", `Action "${action}" completed`);
        void loadParticipants();
      } else {
        const d = await res.json().catch(() => ({}));
        notify("err", d.error || `Action failed`);
      }
    } finally {
      setBusyFlag(null);
    }
  }

  const pendingCount = statusCounts["PENDING"] || 0;
  const generatedCount = (statusCounts["GENERATED"] || 0) + (statusCounts["SENT"] || 0) + (statusCounts["QUEUED"] || 0) + (statusCounts["SENDING"] || 0);
  const failedCount = statusCounts["FAILED"] || 0;
  const withEmail = participants.filter((p) => p.email).length;

  if (!event) {
    return (
      <DashboardShell title="Event">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={event.name}>
      {/* Toast */}
      {toast && (
        <div className={cn("fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg", toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-destructive text-white")}>
          {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={cn("btn btn-sm justify-start gap-2", tab === t.key ? "btn-primary" : "btn-ghost")}
            onClick={() => setTab(t.key)}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <h2 className="font-display text-xl font-bold">{event.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{event.certificateType}</p>
            {event.description && <p className="mt-3 text-sm">{event.description}</p>}
            <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="label">Organization</dt><dd>{event.organizationDisplay || "—"}</dd></div>
              <div><dt className="label">Event date</dt><dd>{event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "—"}</dd></div>
              <div><dt className="label">Location</dt><dd>{event.location || "—"}</dd></div>
              <div><dt className="label">Organizer</dt><dd>{event.organizer || "—"}</dd></div>
              <div><dt className="label">ID prefix</dt><dd className="font-mono text-xs">{event.idPrefix}-2026-XXXXXX</dd></div>
              <div><dt className="label">Test mode</dt><dd>{event.testMode ? "On" : "Off"}</dd></div>
            </dl>
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold">Pipeline status</h3>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="Participants" value={statusCounts["PENDING"] ? String(statusCounts["PENDING"]) : "0"} />
                <Row label="Generated" value={String(generatedCount)} />
                <Row label="Failed" value={String(failedCount)} />
              </div>
              <Link href={`/events/${id}`} className="btn btn-secondary btn-sm mt-4 w-full" onClick={() => setTab("participants")}>View participants</Link>
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold">Event settings</h3>
              <p className="mt-1 text-xs text-muted-foreground">Edit date, organizer, prefix, test mode.</p>
              <EventSettings eventId={id} event={event} onSaved={loadEvent} />
            </div>
          </div>
        </div>
      )}

      {/* ── Participants tab ── */}
      {tab === "participants" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className="input w-64 pl-8" placeholder="Search name, email, ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <select className="input w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="ALL">All statuses</option>
              {Object.keys(statusCounts).map((s) => <option key={s} value={s}>{s} ({statusCounts[s]})</option>)}
            </select>
            <div className="flex-1" />
            <a className="btn btn-secondary btn-sm" href={`/api/events/${id}/download?mode=zip`}><Download className="h-3.5 w-3.5" /> ZIP all</a>
            <a className="btn btn-secondary btn-sm" href={`/api/events/${id}/download?mode=errors`}><Download className="h-3.5 w-3.5" /> Error report</a>
          </div>

          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th><th className="th">Email</th><th className="th">Certificate ID</th>
                  <th className="th">Status</th><th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-muted-foreground">{p.email || "—"}</td>
                    <td className="td font-mono text-xs">{p.certificateId || "—"}</td>
                    <td className="td">
                      <StatusBadge status={p.status} />
                      {p.error && <p className="mt-0.5 max-w-48 truncate text-xs text-destructive" title={p.error}>{p.error}</p>}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {p.certificateId && (
                          <>
                            <button className="btn btn-ghost btn-sm" title="View PDF" onClick={() => window.open(`/api/certificates/${p.certificateId}/pdf`, "_blank")}>View</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => participantAction(p.id, "download")}><Download className="h-3.5 w-3.5" /></button>
                            <button className="btn btn-ghost btn-sm" title="Resend" onClick={() => participantAction(p.id, "resend")}><Send className="h-3.5 w-3.5" /></button>
                            <button className="btn btn-ghost btn-sm" title="Regenerate" onClick={() => participantAction(p.id, "regenerate")}><RefreshCw className="h-3.5 w-3.5" /></button>
                            {!p.revoked ? (
                              <button className="btn btn-ghost btn-sm text-destructive" title="Revoke" onClick={() => participantAction(p.id, "revoke")}>Revoke</button>
                            ) : (
                              <button className="btn btn-ghost btn-sm" title="Restore" onClick={() => participantAction(p.id, "unrevoke")}>Restore</button>
                            )}
                          </>
                        )}
                        {!p.certificateId && (
                          <button className="btn btn-ghost btn-sm" onClick={() => generate("skip", [p.id])}>Generate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!participants.length && (
                  <tr><td colSpan={5} className="td py-10 text-center text-muted-foreground">No participants match. Import a CSV to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} participants · page {page} of {Math.max(1, Math.ceil(total / 25))}</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import tab ── */}
      {tab === "import" && (
        <div className="max-w-3xl space-y-6">
          <div
            className={cn("card grid place-items-center gap-3 border-2 border-dashed p-12 text-center transition-colors", "hover:border-primary/60")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) await onFilePicked(f);
            }}
          >
            <Upload className="h-10 w-10 text-primary" />
            <p className="font-medium">Drop your CSV here, or</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFilePicked(f); e.target.value = ""; }} />
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Choose file</button>
            <p className="text-xs text-muted-foreground">Any columns — names, emails and institutions are auto-detected. Max 5 MB.</p>
          </div>

          {csvState.step !== "idle" && csvState.columns && (
            <div className="card space-y-4 p-6">
              <h3 className="font-semibold">Detected fields</h3>
              <p className="text-sm text-muted-foreground">
                {csvState.rows} rows · {csvState.columns.length} columns · file: {csvState.fileName}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Name column *</span>
                  <select className="input mt-1" value={mapping.name} onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value }))}>
                    <option value="">— none —</option>
                    {csvState.columns.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Email column</span>
                  <select className="input mt-1" value={mapping.email} onChange={(e) => setMapping((m) => ({ ...m, email: e.target.value }))}>
                    <option value="">— none —</option>
                    {csvState.columns.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-1">
                {csvState.columns.map((c) => <span key={c} className="badge bg-muted text-muted-foreground">{`{{${c}}}`}</span>)}
              </div>
              <label className="block">
                <span className="label">If a participant already exists</span>
                <select className="input mt-1" value={dupMode} onChange={(e) => setDupMode(e.target.value as "skip" | "regenerate" | "replace")}>
                  <option value="skip">Skip (default)</option>
                  <option value="regenerate">Regenerate certificate</option>
                  <option value="replace">Replace data &amp; reset status</option>
                </select>
              </label>
              <button className="btn btn-primary w-fit" onClick={confirmImport} disabled={busyFlag === "import" || !mapping.name}>
                {busyFlag === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Import participants
              </button>
            </div>
          )}

          {csvState.step === "done" && csvState.result && (
            <div className="card space-y-2 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-emerald-600"><CheckCircle2 className="h-5 w-5" /> Import complete</h3>
              <p className="text-sm">
                Created <b>{csvState.result.created}</b> · skipped <b>{csvState.result.skipped}</b> · updated <b>{csvState.result.updated}</b>
              </p>
              {!!csvState.issues?.length && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-amber-600">{csvState.issues.length} row issue(s) — review</summary>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                    {csvState.issues.map((i) => (
                      <li key={i.rowNumber}>
                        <b>Row {i.rowNumber}</b>: {[...i.errors, ...i.warnings].join("; ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button className="btn btn-secondary btn-sm mt-2 w-fit" onClick={() => setTab("participants")}>Go to participants</button>
            </div>
          )}
        </div>
      )}

      {/* ── Template tab ── */}
      {tab === "template" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Choose the certificate design for this event.</p>
            <div className="flex gap-2">
              <Link href="/templates" className="btn btn-secondary btn-sm">Manage templates</Link>
              <button className="btn btn-primary btn-sm" onClick={saveTemplateChoice} disabled={busyFlag === "template" || !previewTemplateId}>Save selection</button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((t) => (
              <button
                key={t.id}
                className={cn("card overflow-hidden text-left transition-all", previewTemplateId === t.id && "ring-2 ring-primary")}
                onClick={() => setPreviewTemplateId(t.id)}
              >
                <div className="aspect-[1.414/1] bg-muted">
                  <TemplateThumb templateId={t.id} active={previewTemplateId === t.id} />
                </div>
                <div className="border-t px-3 py-2">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.isBuiltIn ? "Starter" : "Custom"} · v{t.activeVersion?.version ?? 1}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Preview tab ── */}
      {tab === "preview" && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="card overflow-hidden">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Preview as participant</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Select a person to populate variables.</p>
            </div>
            <select className="input m-3 w-[calc(100%-1.5rem)]" value={previewPid || ""} onChange={(e) => setPreviewPid(e.target.value || null)}>
              <option value="">First participant</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {preview?.participant && (
              <p className="px-4 pb-3 text-xs text-muted-foreground">Showing: <b>{preview.participant.name}</b></p>
            )}
          </div>
          <div>
            {preview ? (
              <div className="cert-canvas-wrap overflow-auto rounded-xl border p-6">
                <div className="mx-auto w-fit shadow-xl">
                  <CertificateCanvas design={preview.design} variables={preview.map} verificationUrl="https://example.org/verify/preview" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading preview…</p>
            )}
          </div>
        </div>
      )}

      {/* ── Generate & Send tab ── */}
      {tab === "send" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card space-y-4 p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Zap className="h-5 w-5 text-primary" /> 1 · Generate certificates</h2>
            <p className="text-sm text-muted-foreground">
              PDFs are rendered in the background with unique IDs and QR codes. {pendingCount} participant(s) pending,
              {generatedCount} already generated.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => generate("skip")} disabled={busyFlag === "generate" || !pendingCount}>
                {busyFlag === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Generate {pendingCount || ""}
              </button>
              <button className="btn btn-secondary" onClick={() => generate("regenerate")} disabled={busyFlag === "generate"}>Regenerate all</button>
            </div>
            {!event.templateId && (
              <p className="flex items-center gap-1.5 text-sm text-amber-600"><AlertTriangle className="h-4 w-4" /> Select a template first (Template tab).</p>
            )}
          </div>

          <div className="card space-y-4 p-6">
            <h2 className="flex items-center gap-2 font-semibold"><MailCheck className="h-5 w-5 text-primary" /> 2 · Send emails</h2>
            <div className="space-y-1.5 text-sm">
              <p>Recipients: <b>{generatedCount}</b> generated · {failedCount} failed</p>
              <p className="text-muted-foreground">Each participant receives only their own certificate.</p>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4 text-primary" /> Test first (recommended)</p>
              <div className="flex gap-2">
                <input type="email" className="input flex-1" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                <button className="btn btn-secondary" onClick={sendTest} disabled={!testEmail || busyFlag === "test"}>
                  {busyFlag === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
                </button>
              </div>
            </div>
            <button
              className="btn btn-primary w-fit"
              disabled={busyFlag === "send" || !generatedCount}
              onClick={() => setSendingConfirm({ count: generatedCount, invalid: 0 })}
            >
              <MailCheck className="h-4 w-4" /> Send to all recipients…
            </button>
          </div>

          {sendingConfirm && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setSendingConfirm(null)}>
              <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-display text-lg font-bold">Send certificates?</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  You are about to email <b>{sendingConfirm.count}</b> certificate(s). This cannot be undone —
                  but failed sends can be retried individually.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button className="btn btn-secondary" onClick={() => setSendingConfirm(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={sendBatch} disabled={busyFlag === "send"}>
                    {busyFlag === "send" ? "Queueing…" : `Send ${sendingConfirm.count} certificates`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <b className="tabular-nums">{value}</b>
    </div>
  );
}

function TemplateThumb({ templateId, active }: { templateId: string; active: boolean }) {
  const [data, setData] = useState<{ design: CertificateDesign; map: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/events/${window.location.pathname.split("/")[2]}/preview?templateId=${templateId}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData({ design: d.design, map: d.map }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [templateId, active]);
  if (!data) return <div className="grid h-full place-items-center text-xs text-muted-foreground">Click to preview</div>;
  return (
    <div className="pointer-events-none h-full w-full" style={{ transform: "scale(0.32)", transformOrigin: "top left", width: "1123px", height: "794px" }}>
      <CertificateCanvas design={data.design} variables={data.map} verificationUrl="preview" />
    </div>
  );
}

function EventSettings({ eventId, event, onSaved }: { eventId: string; event: EventData["event"]; onSaved: () => void }) {
  const [form, setForm] = useState({
    eventDate: event.eventDate ? event.eventDate.slice(0, 10) : "",
    location: event.location || "",
    organizer: event.organizer || "",
    idPrefix: event.idPrefix || "",
    testMode: event.testMode,
    testEmail: event.testEmail || "",
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, eventDate: form.eventDate || null, testEmail: form.testEmail || null }),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <label className="block">
        <span className="label">Event date</span>
        <input type="date" className="input mt-0.5" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} />
      </label>
      <label className="block">
        <span className="label">ID prefix</span>
        <input className="input mt-0.5" value={form.idPrefix} maxLength={16} onChange={(e) => setForm((f) => ({ ...f, idPrefix: e.target.value.toUpperCase() }))} />
      </label>
      <button className="btn btn-secondary btn-sm w-full" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    </div>
  );
}

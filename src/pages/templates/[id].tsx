"use client";
// Template editor page: wraps the visual editor + version history.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { DashboardShell } from "@/components/DashboardShell";
import { CertificateEditor } from "@/components/editor/CertificateEditorClient";
import { History, RotateCcw } from "lucide-react";
import type { CertificateDesign } from "@/lib/design";

type Version = { id: string; version: number; note: string | null; createdAt: string };

export default function TemplateEditorPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";

  const [design, setDesign] = useState<CertificateDesign | null>(null);
  const [name, setName] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/templates/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDesign(JSON.parse(String(data.template.activeVersion?.design || "{}")));
    setName(data.template.name);
    setVersions(data.versions || []);
    setActiveVersionId(data.template.activeVersionId);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (d: CertificateDesign) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: d, note: "Editor save" }),
      });
      if (res.ok) {
        const data = await res.json();
        setDirty(false);
        await load();
        return;
      }
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [id, load]);

  async function restore(v: Version) {
    if (!confirm(`Restore version ${v.version} as the active design?`)) return;
    const res = await fetch(`/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designBaseVersionId: v.id, note: `Restored v${v.version}` }),
    });
    if (res.ok) void load();
  }

  if (!design) {
    return (
      <DashboardShell title="Template">
        <p className="text-sm text-muted-foreground">Loading editor…</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={`Editing: ${name}`}>
      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <input
              className="input max-w-sm font-semibold"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              onBlur={async () => {
                await fetch(`/api/templates/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name }),
                });
              }}
            />
            <span className="text-xs text-muted-foreground">
              Every save creates a new version — generated certificates keep their original design.
            </span>
          </div>
          <CertificateEditor
            design={design}
            variables={sampleMap()}
            verificationUrl="https://yourdomain.com/verify/AC-2026-000001"
            onSave={save}
            saving={saving}
          />
        </div>

        <aside className="card h-fit p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> Versions</h2>
          <div className="mt-3 space-y-1.5">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${v.id === activeVersionId ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">Version {v.version}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.note || "—"}</p>
                </div>
                {v.id !== activeVersionId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => restore(v)} title="Restore this version">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </DashboardShell>
  );
}

function sampleMap(): Record<string, string> {
  return {
    Name: "Alexandra Johnson-Whitfield",
    University: "International Institute of Advanced Studies",
    CERTIFICATE_ID: "AC-2026-000001",
    ISSUE_DATE: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    EVENT_NAME: "Advanced Research Methodology Workshop",
    EVENT_DATE: "September 5, 2026",
    ORGANIZATION: "Your Organization",
    ORGANIZER: "Program Director",
    LOCATION: "Main Auditorium",
    CERTIFICATE_TYPE: "Certificate of Participation",
  };
}

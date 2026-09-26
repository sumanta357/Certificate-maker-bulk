"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Plus, Copy, Pencil, Trash2, Star, StarOff, Eye } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { CertificateCanvas } from "@/components/CertificateCanvasClient";
import { cn } from "@/lib/utils";
import type { CertificateDesign } from "@/lib/design";

type TemplateRow = {
  id: string; name: string; description: string | null; isBuiltIn: boolean;
  isFavorite: boolean; activeVersion?: { version: number } | null; _count?: { versions: number };
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ design: CertificateDesign; map: Record<string, string> } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    if (res.ok) setTemplates((await res.json()).templates || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(starterKey?: string) {
    const name = starterKey
      ? prompt("Name for the new template:", "My template")
      : prompt("Name for the blank template:", "Untitled template");
    if (!name) return;
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(starterKey ? { starterKey, name } : { name }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/templates/${data.template.id}`);
    else alert(data.error || "Could not create template");
  }

  async function duplicate(t: TemplateRow) {
    const name = prompt("Name for the duplicate:", `${t.name} copy`);
    if (!name) return;
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ makeCopyOf: t.id, name }),
    });
    if (res.ok) void load();
    else alert("Could not duplicate");
  }

  async function toggleFavorite(t: TemplateRow) {
    await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !t.isFavorite }),
    });
    void load();
  }

  async function remove(t: TemplateRow) {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    if (res.ok) void load();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Could not delete");
    }
  }

  async function openPreview(t: TemplateRow) {
    const res = await fetch(`/api/templates/${t.id}`);
    if (res.ok) {
      const d = await res.json();
      setPreview({
        design: JSON.parse(String(d.template.activeVersion?.design || "{}")),
        map: sampleMap(),
      });
    }
  }

  return (
    <DashboardShell title="Template Library">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Starter templates are fully editable. Duplicate one to customize without changing the original.
        </p>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => create()}> <Plus className="h-4 w-4" /> Blank template</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading templates…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <div key={t.id} className={cn("card overflow-hidden", t.isFavorite && "ring-1 ring-primary/40")}>
              <button className="block aspect-[1.414/1] w-full bg-muted" onClick={() => openPreview(t)} title="Preview">
                <TemplateCardThumb onVisible={() => openPreviewLazy(t, setPreview)} name={t.name} />
              </button>
              <div className="space-y-2 border-t p-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.isBuiltIn ? "Starter" : "Custom"} · v{t.activeVersion?.version ?? 1}
                    </p>
                  </div>
                  <button className="btn btn-ghost btn-sm h-7 w-7 !px-0" onClick={() => toggleFavorite(t)} title="Favorite">
                    {t.isFavorite ? <Star className="h-3.5 w-3.5 text-primary" /> : <StarOff className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Link href={`/templates/${t.id}`} className="btn btn-secondary btn-sm"><Pencil className="h-3 w-3" /> Edit</Link>
                  <button className="btn btn-secondary btn-sm" onClick={() => duplicate(t)}><Copy className="h-3 w-3" /> Duplicate</button>
                  {!t.isBuiltIn && (
                    <button className="btn btn-ghost btn-sm text-destructive" onClick={() => remove(t)}><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div className="cert-canvas-wrap max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-fit shadow-xl">
              <CertificateCanvas design={preview.design} variables={preview.map} verificationUrl="https://example.org/verify/preview" />
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-secondary btn-sm" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function openPreviewLazy(
  t: TemplateRow,
  setPreview: (p: { design: CertificateDesign; map: Record<string, string> } | null) => void
) {
  fetch(`/api/templates/${t.id}`)
    .then(async (r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d) setPreview({ design: JSON.parse(String(d.template.activeVersion?.design || "{}")), map: sampleMap() });
    })
    .catch(() => {});
}

function sampleMap(): Record<string, string> {
  return {
    Name: "Alexandra Johnson-Whitfield-McAllister",
    University: "International Institute of Advanced Multidisciplinary Studies",
    CERTIFICATE_ID: "AC-2026-000042",
    ISSUE_DATE: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    EVENT_NAME: "Advanced Research Methodology Workshop",
    EVENT_DATE: "September 5, 2026",
    ORGANIZATION: "Your Organization",
    ORGANIZER: "Program Director",
    LOCATION: "Main Auditorium",
    CERTIFICATE_TYPE: "Certificate of Participation",
    Email: "participant@example.com",
  };
}

function TemplateCardThumb({ onVisible, name }: { onVisible: () => void; name: string }) {
  return (
    <span className="grid h-full w-full place-items-center text-xs text-muted-foreground" onClick={onVisible} title={`Preview ${name}`}>
      <Eye className="h-4 w-4" />
    </span>
  );
}

"use client";
// Visual certificate editor (Canva-style): drag, resize, rotate, layer order,
// lock/hide, duplicate, copy/paste, undo/redo, alignment, zoom, snap-to-grid.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Text, Rect, Ellipse, Line, Image as KImage, Transformer } from "react-konva";
import useImage from "use-image";
import {
  Type, ImageIcon, Shapes, QrCode, Copy, Trash2, Lock, Unlock, Eye, EyeOff,
  ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Undo2, Redo2, ZoomIn, ZoomOut,
  AlignCenterHorizontal, AlignCenterVertical, Save, X, GripVertical, Magnet,
} from "lucide-react";
import type { CertificateDesign, DesignObject, TextObject } from "@/lib/design";
import { FONTS, newId } from "@/lib/design";
import { resolveVariables } from "@/lib/variables";
import { cn } from "@/lib/utils";

// ── Small helpers ───────────────────────────────────────────────────────────

function uid() {
  return newId();
}

function cloneDesign(d: CertificateDesign): CertificateDesign {
  return JSON.parse(JSON.stringify(d));
}

// ── Assets picker ───────────────────────────────────────────────────────────

type Asset = { id: string; name: string; mimeType: string };

function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const load = useCallback(async () => {
    const res = await fetch("/api/assets");
    if (res.ok) setAssets((await res.json()).assets || []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { assets, reload: load };
}

function AssetPicker({ onPick }: { onPick: (assetId: string) => void }) {
  const { assets, reload } = useAssets();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      if (res.ok) {
        await reload();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Upload failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <button className="btn btn-secondary btn-sm w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : "Upload logo / seal / signature"}
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        {assets.map((a) => (
          <button
            key={a.id}
            className="group relative aspect-square rounded border bg-muted/40 hover:ring-2 hover:ring-primary overflow-hidden"
            title={a.name}
            onClick={() => onPick(a.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${a.id}/file`} alt={a.name} className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
      {!assets.length && <p className="text-xs text-muted-foreground">No assets yet — upload a logo or signature.</p>}
    </div>
  );
}

// ── Property inspector ──────────────────────────────────────────────────────

function NumField({ label, value, onChange, step = 1, min, max }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        className="input mt-0.5"
        value={Number.isFinite(value) ? value : 0}
        step={step} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ColorField({ label, value, onChange, allowEmpty }: {
  label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        <input type="color" className="h-8 w-9 cursor-pointer rounded border" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />
        {allowEmpty && (
          <button
            className="btn btn-ghost btn-sm"
            title="No fill"
            onClick={() => onChange("")}
          >none</button>
        )}
        <input className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  );
}

function Inspector({ obj, update }: { obj: DesignObject | null; update: (patch: Partial<DesignObject>) => void }) {
  if (!obj) {
    return <p className="text-xs text-muted-foreground">Select an element on the canvas to edit its properties.</p>;
  }
  const set = (patch: Record<string, unknown>) => update(patch as Partial<DesignObject>);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={obj.x} onChange={(v) => set({ x: v })} />
        <NumField label="Y" value={obj.y} onChange={(v) => set({ y: v })} />
        <NumField label="Width" value={obj.width} onChange={(v) => set({ width: Math.max(4, v) })} />
        <NumField label="Height" value={obj.height} onChange={(v) => set({ height: Math.max(4, v) })} />
        <NumField label="Rotation°" value={obj.rotation} onChange={(v) => set({ rotation: v })} />
        <NumField label="Opacity" value={obj.opacity ?? 1} onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v)) })} step={0.1} min={0} max={1} />
      </div>

      {obj.type === "text" && (
        <>
          <label className="block">
            <span className="label">Text (use {`{{Variable}}`} syntax)</span>
            <textarea
              className="input mt-0.5 h-20 py-1.5"
              value={obj.text}
              onChange={(e) => set({ text: e.target.value })}
            />
          </label>
          <div>
            <span className="label">Font</span>
            <select className="input mt-0.5" value={obj.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
              {FONTS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Font size" value={obj.fontSize} onChange={(v) => set({ fontSize: Math.max(6, v) })} />
            <div>
              <span className="label">Style</span>
              <div className="mt-0.5 flex gap-1">
                <button className={cn("btn btn-secondary btn-sm", obj.fontWeight === "bold" && "!bg-primary/15")} onClick={() => set({ fontWeight: obj.fontWeight === "bold" ? "normal" : "bold" })}><b>B</b></button>
                <button className={cn("btn btn-secondary btn-sm italic", obj.italic && "!bg-primary/15")} onClick={() => set({ italic: !obj.italic })}><i>I</i></button>
                <button className={cn("btn btn-secondary btn-sm underline", obj.underline && "!bg-primary/15")} onClick={() => set({ underline: !obj.underline })}><u>U</u></button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="label">Align</span>
              <select className="input mt-0.5" value={obj.align} onChange={(e) => set({ align: e.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <ColorField label="Color" value={obj.color} onChange={(v) => set({ color: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Line height ×" value={obj.lineHeight} onChange={(v) => set({ lineHeight: Math.max(0.8, v) })} step={0.1} />
            <NumField label="Letter spacing" value={obj.letterSpacing} onChange={(v) => set({ letterSpacing: v })} />
          </div>
          <div className="rounded-lg border p-2.5 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={!!obj.autoFit} onChange={(e) => set({ autoFit: e.target.checked })} />
              Auto-fit long names (shrink to fit)
            </label>
            {obj.autoFit && (
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Min size" value={obj.minFontSize} onChange={(v) => set({ minFontSize: Math.max(6, v) })} />
                <NumField label="Max size" value={obj.maxFontSize} onChange={(v) => set({ maxFontSize: Math.max(8, v) })} />
              </div>
            )}
          </div>
        </>
      )}

      {obj.type === "shape" && (
        <>
          <div>
            <span className="label">Shape</span>
            <select className="input mt-0.5" value={obj.shape} onChange={(e) => set({ shape: e.target.value })}>
              <option value="rect">Rectangle</option>
              <option value="roundRect">Rounded rectangle</option>
              <option value="ellipse">Circle / ellipse</option>
              <option value="line">Line</option>
            </select>
          </div>
          <ColorField label="Fill" value={obj.fill} onChange={(v) => set({ fill: v })} allowEmpty />
          <ColorField label="Stroke" value={obj.stroke} onChange={(v) => set({ stroke: v })} allowEmpty />
          <NumField label="Stroke width" value={obj.strokeWidth} onChange={(v) => set({ strokeWidth: Math.max(0, v) })} step={0.5} />
          {obj.shape === "roundRect" && <NumField label="Corner radius" value={obj.cornerRadius || 0} onChange={(v) => set({ cornerRadius: Math.max(0, v) })} />}
        </>
      )}

      {obj.type === "image" && (
        <p className="text-xs text-muted-foreground">
          Replace the image from the Assets panel (select the image element, then click an asset).
        </p>
      )}

      {obj.type === "qr" && (
        <>
          <ColorField label="QR color" value={obj.fgColor} onChange={(v) => set({ fgColor: v })} />
          <ColorField label="Background" value={obj.bgColor} onChange={(v) => set({ bgColor: v })} />
          <p className="text-xs text-muted-foreground">
            Encodes the certificate verification URL automatically: <code className="text-[10px]">{`{APP_URL}/verify/{CERTIFICATE_ID}`}</code>
          </p>
        </>
      )}
    </div>
  );
}

// ── The editor ──────────────────────────────────────────────────────────────

export function CertificateEditor({
  design: initialDesign,
  variables,
  verificationUrl,
  onSave,
  onImageDrop,
  saving,
}: {
  design: CertificateDesign;
  variables: Record<string, string>;
  verificationUrl?: string;
  onSave?: (design: CertificateDesign) => Promise<void> | void;
  onImageDrop?: (file: File, x: number, y: number) => void;
  saving?: boolean;
}) {
  const [design, setDesign] = useState<CertificateDesign>(initialDesign);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  void showGuides; void setShowGuides;
  const [history, setHistory] = useState<CertificateDesign[]>([initialDesign]);
  const [hIndex, setHIndex] = useState(0);
  const clipboard = useRef<DesignObject | null>(null);
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDesign(initialDesign);
    setHistory([initialDesign]);
    setHIndex(0);
    setSelectedId(null);
  }, [initialDesign]);

  const selected = design.objects.find((o) => o.id === selectedId) || null;

  const pushHistory = useCallback((next: CertificateDesign) => {
    setHistory((h) => {
      const cut = h.slice(0, hIndex + 1);
      cut.push(next);
      return cut.slice(-50);
    });
    setHIndex((i) => Math.min(i + 1, 49));
  }, [hIndex]);

  const commit = useCallback((next: CertificateDesign) => {
    pushHistory(next);
    setDesign(next);
  }, [pushHistory]);

  const update = useCallback((patch: Partial<DesignObject>) => {
    if (!selectedId) return;
    setDesign((d) => ({
      ...d,
      objects: d.objects.map((o) => (o.id === selectedId ? ({ ...o, ...patch } as DesignObject) : o)),
    }));
  }, [selectedId]);

  // Commit object moves (drag/transform end) to history
  const commitObject = useCallback((id: string, patch: Partial<DesignObject>) => {
    setDesign((d) => {
      const next = { ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, ...patch } as DesignObject : o)) };
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  function addText(preset: Partial<TextObject> = {}) {
    const obj: TextObject = {
      id: uid(), type: "text", text: "Double-click to edit",
      x: design.page.width * 0.2, y: design.page.height * 0.4,
      width: design.page.width * 0.6, height: 44,
      rotation: 0, opacity: 1,
      fontSize: 24, fontFamily: "Helvetica", fontWeight: "normal", italic: false, underline: false,
      align: "center", color: "#1f2937", lineHeight: 1.3, letterSpacing: 0,
      autoFit: true, minFontSize: 14, maxFontSize: 42,
      locked: false, visible: true,
      ...preset,
    };
    commit({ ...design, objects: [...design.objects, obj] });
    setSelectedId(obj.id);
  }

  function addShape(shape: "rect" | "ellipse" | "line" | "roundRect") {
    const obj = {
      id: uid(), type: "shape" as const, shape,
      x: design.page.width * 0.25, y: design.page.height * 0.35,
      width: 240, height: shape === "line" ? 6 : 150,
      fill: "", stroke: "#2563eb", strokeWidth: 2,
      rotation: 0, opacity: 1, locked: false, visible: true,
      cornerRadius: shape === "roundRect" ? 12 : undefined,
    };
    commit({ ...design, objects: [...design.objects, obj] as DesignObject[] });
    setSelectedId(obj.id);
  }

  function addQR() {
    const obj = {
      id: uid(), type: "qr" as const,
      x: design.page.width - 140, y: design.page.height - 180,
      width: 92, height: 92,
      fgColor: "#111827", bgColor: "#ffffff",
      rotation: 0, opacity: 1, locked: false, visible: true,
    };
    commit({ ...design, objects: [...design.objects, obj] as DesignObject[] });
    setSelectedId(obj.id);
  }

  function addImageObj(assetId: string) {
    // If an image element is selected, replace its asset; else create new.
    const sel = design.objects.find((o) => o.id === selectedId && o.type === "image") as any;
    if (sel) {
      commit({ ...design, objects: design.objects.map((o) => (o.id === sel.id ? { ...o, assetId } : o)) });
      return;
    }
    const obj = {
      id: uid(), type: "image" as const,
      x: design.page.width * 0.42, y: 60, width: 120, height: 120,
      assetId, fit: "contain" as const,
      rotation: 0, opacity: 1, locked: false, visible: true,
    };
    commit({ ...design, objects: [...design.objects, obj] as DesignObject[] });
    setSelectedId(obj.id);
  }

  function removeSelected() {
    if (!selected || selected.locked) return;
    commit({ ...design, objects: design.objects.filter((o) => o.id !== selected.id) });
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = { ...JSON.parse(JSON.stringify(selected)), id: uid(), x: selected.x + 20, y: selected.y + 20 };
    commit({ ...design, objects: [...design.objects, copy] });
    setSelectedId(copy.id);
  }

  function reorder(dir: "up" | "down" | "front" | "back") {
    if (!selected) return;
    const objs = [...design.objects];
    const i = objs.findIndex((o) => o.id === selected.id);
    const [item] = objs.splice(i, 1);
    if (dir === "up") objs.splice(Math.min(objs.length, i + 1), 0, item);
    if (dir === "down") objs.splice(Math.max(0, i - 1), 0, item);
    if (dir === "front") objs.push(item);
    if (dir === "back") objs.unshift(item);
    commit({ ...design, objects: objs });
  }

  function toggleLock() { if (selected) update({ locked: !selected.locked }); }
  function toggleVisible() { if (selected) update({ visible: selected.visible === false }); }

  function centerH() { if (selected) commitObject(selected.id, { x: (design.page.width - selected.width) / 2 }); }
  function centerV() { if (selected) commitObject(selected.id, { y: (design.page.height - selected.height) / 2 }); }

  const undo = useCallback(() => {
    setHIndex((i) => {
      const ni = Math.max(0, i - 1);
      setDesign(history[ni]);
      return ni;
    });
  }, [history]);

  const redo = useCallback(() => {
    setHIndex((i) => {
      const ni = Math.min(history.length - 1, i + 1);
      setDesign(history[ni]);
      return ni;
    });
  }, [history]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); }
      else if (mod && e.key.toLowerCase() === "c" && selectedId) { clipboard.current = selected; }
      else if (mod && e.key.toLowerCase() === "v" && clipboard.current) {
        const copy = { ...JSON.parse(JSON.stringify(clipboard.current)), id: uid(), x: clipboard.current.x + 20, y: clipboard.current.y + 20 };
        commit({ ...design, objects: [...design.objects, copy] });
        setSelectedId(copy.id);
      }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); }
      else if (e.key === "Escape") setSelectedId(null);
      else if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        setDesign((d) => ({
          ...d,
          objects: d.objects.map((o) => {
            if (o.id !== selectedId) return o;
            if (e.key === "ArrowUp") return { ...o, y: o.y - step };
            if (e.key === "ArrowDown") return { ...o, y: o.y + step };
            if (e.key === "ArrowLeft") return { ...o, x: o.x - step };
            return { ...o, x: o.x + step };
          }),
        }));
        void step;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, design, selectedId, selected, commit]);

  // ── Transformer wiring ────────────────────────────────────────────────────

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = stage.findOne(`#${selectedId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId, design]);

  function onTransformEnd() {
    if (!selectedId) return;
    const node = stageRef.current?.findOne(`#${selectedId}`);
    if (!node) return;
    const obj = design.objects.find((o) => o.id === selectedId);
    if (!obj) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    commitObject(selectedId, {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.max(8, Math.round(obj.width * sx)),
      height: Math.max(4, Math.round(obj.height * sy)),
      rotation: Math.round(node.rotation()),
    });
    node.scaleX(1); node.scaleY(1);
  }

  function snapVal(v: number, page: number): number {
    if (!snap) return v;
    const center = (page - (selected?.width ?? 0)) / 2;
    if (Math.abs(v - center) < 6) return Math.round(center);
    const margin = 32;
    if (Math.abs(v - margin) < 6) return margin;
    if (Math.abs(v + (selected?.width ?? 0) - (page - margin)) < 6) return page - margin - (selected?.width ?? 0);
    return Math.round(v);
}

  // ── Renderable Konva nodes for the editor stage ───────────────────────────

  const EditorNodes = useMemo(() => {
    return design.objects.map((obj) => {
      const common = {
        id: obj.id,
        x: obj.x, y: obj.y,
        width: obj.width, height: obj.height,
        rotation: obj.rotation,
        opacity: obj.visible === false ? 0.25 : obj.opacity ?? 1,
        draggable: !obj.locked,
        onClick: () => setSelectedId(obj.id),
        onTap: () => setSelectedId(obj.id),
        onMouseDown: (e: any) => {
          if (e.evt.button === 0 && !obj.locked) setSelectedId(obj.id);
        },
        onDragEnd: (e: any) => {
          const x = snapVal(e.target.x(), design.page.width);
          const y = snapVal(e.target.y(), design.page.height);
          commitObject(obj.id, { x, y });
        },
        onTransformEnd: onTransformEnd,
      };
      if (obj.type === "text") {
        const resolved = resolveVariables(obj.text, variables);
        const family = obj.fontFamily === "Helvetica" ? "Arial" : obj.fontFamily === "Times-Roman" ? "Georgia" : obj.fontFamily;
        return (
          <Text
            key={obj.id}
            {...common}
            text={resolved}
            align={obj.align}
            fontSize={obj.fontSize}
            fontFamily={family}
            fontStyle={`${obj.italic ? "italic " : ""}${obj.fontWeight === "bold" ? "bold" : "normal"}`}
            textDecoration={obj.underline ? "underline" : ""}
            fill={obj.color}
            lineHeight={obj.lineHeight || 1.3}
            letterSpacing={obj.letterSpacing || 0}
            onDblClick={() => {
              const t = prompt("Edit text (variables allowed):", obj.text);
              if (t !== null) commitObject(obj.id, { text: t });
            }}
          />
        );
      }
      if (obj.type === "shape") {
        if (obj.shape === "ellipse") {
          return (
            <Ellipse
              key={obj.id}
              {...common}
              offsetX={-obj.width / 2}
              offsetY={-obj.height / 2}
              radiusX={obj.width / 2}
              radiusY={obj.height / 2}
              fill={obj.fill || undefined}
              stroke={obj.stroke || undefined}
              strokeWidth={obj.strokeWidth}
            />
          );
        }
        if (obj.shape === "line") {
          return (
            <Line
              key={obj.id}
              {...common}
              points={[0, obj.height / 2, obj.width, obj.height / 2]}
              stroke={obj.stroke || "#000"}
              strokeWidth={obj.strokeWidth}
            />
          );
        }
        return (
          <Rect
            key={obj.id}
            {...common}
            fill={obj.fill || "rgba(0,0,0,0.02)"}
            stroke={obj.stroke || undefined}
            strokeWidth={obj.strokeWidth}
            cornerRadius={obj.shape === "roundRect" ? obj.cornerRadius || 0 : 0}
          />
        );
      }
      if (obj.type === "image") return <EditableImage key={obj.id} obj={obj} {...common} />;
      if (obj.type === "qr") return <EditableQR key={obj.id} obj={obj} url={verificationUrl} {...common} />;
      return null;
    });
  }, [design, variables, verificationUrl, selectedId, snap, commitObject, onTransformEnd]);

  // ── Page-size switching ───────────────────────────────────────────────────

  function setPage(size: keyof typeof PAGE_PRESETS_LOCAL | "custom", w?: number, h?: number) {
    const preset = PAGE_PRESETS_LOCAL[size];
    commit({
      ...design,
      page: { width: preset ? preset.width : w || design.page.width, height: preset ? preset.height : h || design.page.height },
    });
  }

  // ── Toolbar JSX ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden rounded-xl border bg-card">
      {/* Left: elements + layers */}
      <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto editor-scroll border-r p-3 md:flex">
        <p className="label mb-2">Add elements</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn btn-secondary btn-sm" onClick={() => addText()}><Type className="h-3.5 w-3.5" /> Text</button>
          <button className="btn btn-secondary btn-sm" onClick={() => addText({ text: "{{Name}}", fontSize: 40, fontWeight: "bold", autoFit: true, minFontSize: 20, maxFontSize: 40 })}><Type className="h-3.5 w-3.5" /> Name</button>
          <button className="btn btn-secondary btn-sm" onClick={addQR}><QrCode className="h-3.5 w-3.5" /> QR code</button>
          <button className="btn btn-secondary btn-sm" onClick={() => addShape("rect")}><Shapes className="h-3.5 w-3.5" /> Shape</button>
        </div>
        <div className="mt-3">
          <p className="label mb-1.5">Assets</p>
          <AssetPicker onPick={addImageObj} />
        </div>
        <div className="mt-4 border-t pt-3">
          <p className="label mb-1.5">Variables</p>
          <div className="flex flex-wrap gap-1">
            {Object.keys(variables).filter((k) => !k.includes("_") || k === k.toUpperCase()).slice(0, 24).map((k) => (
              <button
                key={k}
                className="badge bg-primary/10 text-primary hover:bg-primary/20"
                onClick={() => addText({ text: `{{${k}}}`, fontSize: 24, fontWeight: "bold" })}
                title={`Insert {{${k}}} as dynamic text`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 border-t pt-3">
          <p className="label mb-1.5">Layers</p>
          <div className="space-y-1">
            {[...design.objects].reverse().map((o) => (
              <div
                key={o.id}
                className={cn(
                  "group flex items-center gap-1 rounded px-1.5 py-1 text-xs cursor-pointer",
                  selectedId === o.id ? "bg-primary/15" : "hover:bg-muted"
                )}
                onClick={() => setSelectedId(o.id)}
              >
                <GripVertical className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 truncate">
                  {o.type === "text" ? o.text.replace(/\{\{/g, "").replace(/\}\}/g, "").slice(0, 16) || "Text" : o.type}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setDesign((d) => ({ ...d, objects: d.objects.map((x) => x.id === o.id ? { ...x, visible: x.visible === false } : x) })); }} title="Show/hide">
                  {o.visible === false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setDesign((d) => ({ ...d, objects: d.objects.map((x) => x.id === o.id ? { ...x, locked: !x.locked } : x) })); }} title="Lock/unlock">
                  {o.locked ? <Lock className="h-3 w-3 text-primary" /> : <Unlock className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Center: canvas */}
      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
          <button className="btn btn-ghost btn-sm" onClick={undo} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={redo} title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} title="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <span className="text-xs tabular-nums text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} title="Zoom in"><ZoomIn className="h-4 w-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button className={cn("btn btn-ghost btn-sm", snap && "text-primary")} onClick={() => setSnap(!snap)} title="Snap to margins/center"><Magnet className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={centerH} disabled={!selected} title="Center horizontally"><AlignCenterHorizontal className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={centerV} disabled={!selected} title="Center vertically"><AlignCenterVertical className="h-4 w-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button className="btn btn-ghost btn-sm" onClick={duplicateSelected} disabled={!selected} title="Duplicate (Ctrl+D)"><Copy className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={removeSelected} disabled={!selected} title="Delete"><Trash2 className="h-4 w-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button className="btn btn-ghost btn-sm" onClick={() => reorder("up")} disabled={!selected} title="Bring forward"><ArrowUp className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => reorder("down")} disabled={!selected} title="Send backward"><ArrowDown className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => reorder("front")} disabled={!selected} title="Bring to front"><ChevronsUp className="h-4 w-4" /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => reorder("back")} disabled={!selected} title="Send to back"><ChevronsDown className="h-4 w-4" /></button>
          <div className="flex-1" />
          <select
            className="input h-8 w-40 text-xs"
            value={`${design.page.width}x${design.page.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              if (w && h) setPage("custom", w, h);
            }}
          >
            {Object.entries(PAGE_PRESETS_LOCAL).map(([k, v]) => (
              <option key={k} value={`${v.width}x${v.height}`}>{v.label}</option>
            ))}
            <option value={`${design.page.width}x${design.page.height}`}>Custom ({design.page.width}×{design.page.height})</option>
          </select>
          {onSave && (
            <button className="btn btn-primary btn-sm" onClick={() => void onSave(design)} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto editor-scroll cert-canvas-wrap p-8" onDragOver={(e) => e.preventDefault()}>
          <div style={{ width: design.page.width * zoom, margin: "0 auto" }}>
            <div
              className="shadow-xl"
              style={{ width: design.page.width * zoom, height: design.page.height * zoom, position: "relative" }}
            >
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", position: "absolute", inset: 0 }}>
                <Stage
                  ref={stageRef}
                  width={design.page.width}
                  height={design.page.height}
                  onMouseDown={(e) => {
                    if (e.target === e.target.getStage()) setSelectedId(null);
                  }}
                  onTouchStart={(e) => {
                    if (e.target === e.target.getStage()) setSelectedId(null);
                  }}
                >
                  <Layer>
                    <Rect x={0} y={0} width={design.page.width} height={design.page.height} fill={design.background} listening={false} />
                    {design.backgroundImageAssetId && <EditableImage obj={{ id: "bg", type: "image", x: 0, y: 0, width: design.page.width, height: design.page.height, assetId: design.backgroundImageAssetId, fit: "fill", rotation: 0, opacity: 1, visible: true } as any} />}
                    {EditorNodes}
                    <Transformer
                      ref={trRef}
                      rotateEnabled
                      borderStroke="#2563eb"
                      anchorStroke="#2563eb"
                      anchorFill="#ffffff"
                      anchorSize={8}
                      keepRatio={false}
                      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]}
                      boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
                    />
                  </Layer>
                </Stage>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: inspector */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto editor-scroll border-l p-3 lg:block">
        <p className="label mb-2">Properties</p>
        <Inspector obj={selected} update={update} />
        {selected && !selected.locked && (
          <button className="btn btn-danger btn-sm mt-4 w-full" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" /> Delete element</button>
        )}
      </aside>
    </div>
  );
}

// ── Editable image / QR nodes ───────────────────────────────────────────────

function EditableImage({ obj, ...common }: { obj: any } & Record<string, unknown>) {
  const src = obj.assetId?.startsWith?.("data:") ? obj.assetId : obj.assetId ? `/api/assets/${obj.assetId}/file` : "";
  const [img] = useImage(src || "");
  if (!img) {
    return (
      <Rect
        {...(common as any)}
        fill="rgba(99,102,241,0.12)"
        stroke="#6366f1"
        strokeWidth={1}
        dash={[6, 4]}
      />
    );
  }
  return <KImage {...(common as any)} image={img} />;
}

function EditableQR({ obj, url, ...common }: { obj: any; url?: string } & Record<string, unknown>) {
  const [img] = useImage(`/api/qr?url=${encodeURIComponent(url || "about:blank")}&fg=${encodeURIComponent(obj.fgColor)}&bg=${encodeURIComponent(obj.bgColor)}`);
  if (!img) return null;
  return <KImage {...(common as any)} image={img} />;
}

import { PAGE_PRESETS } from "@/lib/design";
const PAGE_PRESETS_LOCAL = PAGE_PRESETS;

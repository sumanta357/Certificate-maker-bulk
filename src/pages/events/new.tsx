"use client";
import { useState } from "react";
import { useRouter } from "next/router";
import { DashboardShell } from "@/components/DashboardShell";

const CERT_TYPES = [
  "Certificate of Participation",
  "Certificate of Completion",
  "Certificate of Achievement",
  "Certificate of Appreciation",
  "Certificate of Attendance",
  "Training Certificate",
  "Internship Certificate",
  "Workshop Certificate",
  "Conference Certificate",
  "Custom",
];

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    organizationDisplay: "",
    eventDate: "",
    location: "",
    organizer: "",
    certificateType: CERT_TYPES[0],
    description: "",
    website: "",
    contactEmail: "",
    idPrefix: "",
    testMode: false,
    testEmail: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          eventDate: form.eventDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create event");
        return;
      }
      router.push(`/events/${data.event.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="Create event">
      <form onSubmit={submit} className="max-w-2xl space-y-6">
        <div className="card space-y-4 p-6">
          <label className="block">
            <span className="label">Event name *</span>
            <input className="input mt-1" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="e.g. AI/ML Drug Discovery Workshop" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Organization display name</span>
              <input className="input mt-1" value={form.organizationDisplay} onChange={(e) => set("organizationDisplay", e.target.value)} placeholder="Shown on certificates" />
            </label>
            <label className="block">
              <span className="label">Event date</span>
              <input type="date" className="input mt-1" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Location</span>
              <input className="input mt-1" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City / venue / Online" />
            </label>
            <label className="block">
              <span className="label">Organizer</span>
              <input className="input mt-1" value={form.organizer} onChange={(e) => set("organizer", e.target.value)} placeholder="Name or role shown on certificates" />
            </label>
          </div>
          <label className="block">
            <span className="label">Certificate type</span>
            <select className="input mt-1" value={form.certificateType} onChange={(e) => set("certificateType", e.target.value)}>
              {CERT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Description</span>
            <textarea className="input mt-1 h-20 py-2" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Website</span>
              <input className="input mt-1" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            </label>
            <label className="block">
              <span className="label">Contact email</span>
              <input type="email" className="input mt-1" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="Reply-to for certificate emails" />
            </label>
          </div>
        </div>

        <div className="card space-y-4 p-6">
          <h2 className="font-semibold">Certificates &amp; delivery</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Certificate ID prefix</span>
              <input className="input mt-1" value={form.idPrefix} onChange={(e) => set("idPrefix", e.target.value.toUpperCase())} maxLength={16} placeholder="AC" />
              <span className="mt-1 block text-xs text-muted-foreground">IDs look like PREFIX-2026-000001</span>
            </label>
            <label className="block">
              <span className="label">Test mode</span>
              <label className="mt-1.5 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.testMode} onChange={(e) => set("testMode", e.target.checked)} />
                Send only to the test address
              </label>
            </label>
            {form.testMode && (
              <label className="block">
                <span className="label">Test email</span>
                <input type="email" className="input mt-1" value={form.testEmail} onChange={(e) => set("testEmail", e.target.value)} />
              </label>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create event"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </DashboardShell>
  );
}

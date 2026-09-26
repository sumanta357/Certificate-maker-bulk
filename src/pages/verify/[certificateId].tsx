"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ShieldCheck } from "lucide-react";
import { VerifyResultCard, type VerifyResult } from "@/components/VerifyResultCard";

export default function VerifyCertificatePage() {
  const router = useRouter();
  const certificateId = typeof router.query.certificateId === "string" ? router.query.certificateId : "";
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!certificateId) return;
    let cancelled = false;
    setBusy(true);
    setResult(null);
    fetch(`/api/verify/${encodeURIComponent(certificateId)}`)
      .then(async (r) => (r.ok || r.status === 404 ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setResult({ status: "NOT_FOUND", message: "Verification lookup failed. Please try again." });
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground">A</span>
            AutoCert
          </Link>
          <Link href="/verify" className="btn btn-ghost btn-sm">Verify another</Link>
        </div>
      </header>

      <main className="container max-w-lg py-16">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">Certificate verification</h1>
          {certificateId && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">{certificateId}</p>
          )}
        </div>

        <div className="mt-8">
          {busy && (
            <div className="card p-8 text-center text-sm text-muted-foreground">Checking certificate…</div>
          )}
          {!busy && result && <VerifyResultCard result={result} />}
        </div>
      </main>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ShieldCheck } from "lucide-react";
import { VerifyResultCard, type VerifyResult } from "@/components/VerifyResultCard";

export default function VerifyPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (certId: string) => {
    if (!certId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(certId.trim())}`);
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const qid = typeof router.query.id === "string" ? router.query.id : "";
    if (qid) {
      setId(qid);
      void lookup(qid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.id]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground">A</span>
            AutoCert
          </Link>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
        </div>
      </header>

      <main className="container max-w-lg py-16">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">Verify a certificate</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the ID printed on the certificate (or scan its QR code).
          </p>
        </div>

        <form
          className="mt-8 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(id);
          }}
        >
          <input className="input" placeholder="AC-2026-000001" value={id} onChange={(e) => setId(e.target.value)} required />
          <button className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
        </form>

        {result && (
          <div className="mt-8">
            <VerifyResultCard result={result} />
          </div>
        )}
      </main>
    </div>
  );
}

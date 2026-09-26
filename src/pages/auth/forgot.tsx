import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "./login";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/password?action=forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll generate a secure reset link">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If that account exists, a reset link has been generated. In development the link is printed
            to the server logs.
          </p>
          <Link href="/auth/login" className="btn btn-secondary w-full">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="label">Email</span>
            <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Working…" : "Request reset"}</button>
          <Link href="/auth/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

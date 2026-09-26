import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AuthShell } from "./login";

export default function ResetPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/password?action=reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/auth/login"), 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Minimum 8 characters">
      {done ? (
        <p className="text-sm text-emerald-600">Password updated — redirecting to sign in…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="label">New password</span>
            <input type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || !token}>{busy ? "Saving…" : "Set password"}</button>
          <Link href="/auth/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AuthShell } from "./login";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, organizationName: organizationName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your workspace" subtitle="Start issuing certificates in minutes">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">Your name</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Organization name</span>
          <input className="input mt-1" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Optional — used for branding" />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block">
          <span className="label">Password (min 8 characters)</span>
          <input type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account? <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

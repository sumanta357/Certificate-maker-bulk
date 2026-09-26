import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      const returnTo = typeof router.query.returnTo === "string" ? router.query.returnTo : "/dashboard";
      router.push(returnTo.startsWith("/") ? returnTo : "/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your AutoCert workspace"
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">Email</span>
          <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href="/auth/forgot" className="text-muted-foreground hover:text-foreground">Forgot password?</Link>
        <Link href="/auth/register" className="text-primary hover:underline">Create account</Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 flex items-center gap-2 font-bold text-lg">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground">A</span>
            AutoCert
          </Link>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(var(--primary)/0.18),transparent_65%)]" />
        <div className="absolute right-16 top-1/2 w-80 -translate-y-1/2 rotate-2 rounded-xl border-8 border-double border-primary/50 bg-[#fffdf5] p-7 shadow-2xl">
          <div className="text-center font-display text-xl tracking-[0.3em] text-[#9a7b2d]">CERTIFICATE</div>
          <div className="mt-4 text-center text-xs text-[#8a7a55]">presented to</div>
          <div className="mt-1 text-center font-display text-2xl font-bold text-[#3f3420]">Your Participant</div>
          <div className="mt-3 flex items-end justify-between">
            <div className="h-px w-20 bg-[#8a7a55]/60" />
            <div className="grid h-12 w-12 grid-cols-4 gap-0.5 bg-white p-1 shadow">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className={(i * 7) % 3 === 0 ? "bg-[#3f3420]" : "bg-white"} />
              ))}
            </div>
            <div className="h-px w-20 bg-[#8a7a55]/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

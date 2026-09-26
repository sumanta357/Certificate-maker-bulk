import Link from "next/link";
import {
  ArrowRight, Upload, Palette, Mail, ShieldCheck, QrCode, Zap, Globe, Layers, BarChart3,
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-black">A</span>
            AutoCert
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#workflow" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#verify" className="hover:text-foreground">Verify</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn btn-ghost btn-sm">Sign in</Link>
            <Link href="/auth/register" className="btn btn-primary btn-sm">Get started <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_60%)]" />
        <div className="container grid gap-12 py-20 md:grid-cols-2 md:py-28">
          <div className="flex flex-col justify-center animate-fade-in">
            <span className="badge w-fit bg-primary/10 text-primary mb-4">Certificate automation platform</span>
            <h1 className="font-display text-4xl leading-tight md:text-6xl font-extrabold tracking-tight">
              Upload a CSV. Design once.<br />
              <span className="text-primary">Every certificate</span> delivered.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              AutoCert turns a participant list into personalized, QR-verifiable PDF certificates —
              generated, branded, and emailed automatically. For workshops, conferences, courses,
              trainings and any event worth remembering.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth/register" className="btn btn-primary">Create free account <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/auth/login" className="btn btn-secondary">Sign in</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Multi-tenant &amp; private</span>
              <span className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5 text-primary" /> QR verification built-in</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Background generation</span>
            </div>
          </div>

          {/* Mini certificate mock */}
          <div className="relative hidden md:block">
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)/0.15),transparent_70%)]" />
            <div className="rotate-1 rounded-xl border-8 border-double border-primary/50 bg-[#fffdf5] p-8 shadow-2xl">
              <div className="text-center font-display text-2xl tracking-[0.3em] text-[#9a7b2d]">CERTIFICATE</div>
              <div className="mt-1 text-center text-xs tracking-[0.35em] text-[#b99a4a]">OF PARTICIPATION</div>
              <div className="mx-auto mt-5 h-px w-40 bg-primary/40" />
              <p className="mt-6 text-center text-xs text-[#8a7a55]">proudly presented to</p>
              <p className="mt-1 text-center font-display text-3xl font-bold text-[#3f3420]">Rahul Sharma</p>
              <p className="mt-1 text-center text-sm text-[#6b7280]">ABC University</p>
              <p className="mt-4 text-center text-xs text-[#8a7a55]">for participation in the AI/ML Drug Discovery Workshop</p>
              <div className="mt-8 flex items-end justify-between text-[10px] text-[#8a7a55]">
                <div>
                  <div className="h-px w-24 bg-[#8a7a55]/60" />
                  <p className="mt-1">05 September 2026</p>
                </div>
                <div className="grid h-16 w-16 grid-cols-4 gap-0.5 bg-white p-1 shadow">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={((i * 7) % 3 === 0 ? "bg-[#3f3420]" : "bg-white")} />
                  ))}
                </div>
                <div>
                  <div className="h-px w-24 bg-[#8a7a55]/60" />
                  <p className="mt-1">AC-2026-000001</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-y bg-card/50 py-20">
        <div className="container">
          <h2 className="text-center font-display text-3xl font-bold">From spreadsheet to inboxes in six steps</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: Upload, t: "Upload CSV", d: "Any columns — fields are auto-detected." },
              { icon: Layers, t: "Map fields", d: "Confirm name/email mapping, fix issues." },
              { icon: Palette, t: "Design", d: "Pick a starter or craft your own in the visual editor." },
              { icon: QrCode, t: "Preview", d: "See real participants rendered live." },
              { icon: Zap, t: "Generate", d: "PDFs built in the background, unique IDs and QR codes." },
              { icon: Mail, t: "Send & track", d: "Personal emails, retries, delivery status." },
            ].map((s, i) => (
              <div key={s.t} className="card relative p-5">
                <span className="absolute -top-3 left-4 badge bg-primary text-primary-foreground">Step {i + 1}</span>
                <s.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="container">
          <h2 className="text-center font-display text-3xl font-bold">Everything a certificate program needs</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Palette, t: "Canva-style editor", d: "Drag, resize, rotate, layer, lock — with auto-fit so long names never overflow." },
              { icon: Layers, t: "10 starter templates", d: "Classic academic to modern minimal. Duplicate, edit, version, favorite." },
              { icon: QrCode, t: "Public verification", d: "Every certificate carries a QR code to a live VALID / REVOKED page." },
              { icon: Mail, t: "Any email provider", d: "SMTP, Resend, SendGrid, Mailgun or SES — your keys, your sender reputation." },
              { icon: BarChart3, t: "Delivery tracking", d: "Sent, failed, retried — per participant, with a downloadable error report." },
              { icon: Globe, t: "Your storage", d: "Local for dev; S3, R2 or Supabase in production. Files stay private." },
              { icon: ShieldCheck, t: "Multi-tenant", d: "Strict organization isolation at the database and API layer." },
              { icon: Zap, t: "Background jobs", d: "Close the browser — generation and sending continue server-side." },
              { icon: Upload, t: "Any CSV shape", d: "Every column becomes a dynamic {{variable}} you can drop into designs." },
            ].map((f) => (
              <div key={f.t} className="card p-6 transition-shadow hover:shadow-md">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10"><f.icon className="h-5 w-5 text-primary" /></div>
                <h3 className="mt-4 font-semibold">{f.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verify strip */}
      <section id="verify" className="border-y bg-card/50 py-16">
        <div className="container flex flex-col items-center gap-4 text-center">
          <QrCode className="h-10 w-10 text-primary" />
          <h2 className="font-display text-2xl font-bold">Received a certificate?</h2>
          <p className="max-w-md text-muted-foreground">Type the ID to confirm it is authentic.</p>
          <form action="/verify" method="get" className="mt-2 flex w-full max-w-md gap-2">
            <input name="id" placeholder="AC-2026-000001" className="input" required />
            <button className="btn btn-primary" type="submit">Verify</button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} AutoCert — automated certificates for every event.</p>
          <p className="text-xs">Bring your own email provider · Your data, your storage</p>
        </div>
      </footer>
    </div>
  );
}

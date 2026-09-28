"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard, CalendarDays, Users, Palette, Award, Mail, ShieldCheck, Settings, ScrollText, LogOut,
  ShieldHalf,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

export type Me = {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  organization: { id: string; name: string; idPrefix: string };
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/templates", label: "Templates", icon: Palette },
  { href: "/certificates", label: "Certificates", icon: Award },
  { href: "/emails", label: "Emails", icon: Mail },
  { href: "/verification", label: "Verification", icon: ShieldCheck },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Shown only to the platform Super Admin (cross-organization master console).
const ADMIN_NAV = { href: "/admin", label: "Admin", icon: ShieldHalf };

export function DashboardShell({ children, title }: { children: ReactNode; title: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          const returnTo = router.asPath;
          router.replace(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data) setMe(data.user);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/auth/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (!checked) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!me) return null;

  const nav = me.role === "SUPER_ADMIN" ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
        <Link href="/" className="flex h-16 items-center gap-2 border-b px-5 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground">A</span>
          AutoCert
        </Link>
        <div className="border-b px-5 py-3">
          <p className="truncate text-sm font-semibold">{me.organization.name}</p>
          <p className="truncate text-xs text-muted-foreground">{me.email}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = router.pathname === item.href || router.pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="badge bg-muted text-muted-foreground">{me.role.replace("_", " ").toLowerCase()}</span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button className="btn btn-ghost btn-sm h-9 w-9 !px-0" onClick={signOut} title="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3 overflow-x-auto md:hidden">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
                <item.icon className="h-5 w-5" />
              </Link>
            ))}
          </div>
          <h1 className="hidden truncate font-display text-xl font-bold md:block">{title}</h1>
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

// Client-only wrapper for the visual certificate editor.
// Konva's Node entry requires the optional native `canvas` package, which is
// unavailable (and unnecessary — the editor renders in the browser), so the
// component must never be evaluated during server-side rendering.
import dynamic from "next/dynamic";

export const CertificateEditor = dynamic(
  () => import("./CertificateEditor").then((m) => m.CertificateEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[600px] place-items-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        Loading editor…
      </div>
    ),
  }
);

// Client-only wrapper for the Konva certificate canvas.
// Konva's Node entry requires the optional native `canvas` package, which is
// unavailable (and unnecessary — the canvas renders in the browser), so the
// component must never be evaluated during server-side rendering.
import dynamic from "next/dynamic";

export const CertificateCanvas = dynamic(
  () => import("./CertificateCanvas").then((m) => m.CertificateCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-64 place-items-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        Loading canvas…
      </div>
    ),
  }
);

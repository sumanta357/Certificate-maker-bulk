import { BadgeCheck, Ban, HelpCircle } from "lucide-react";

export type VerifyResult = {
  status: "VALID" | "REVOKED" | "NOT_FOUND";
  certificateId?: string;
  name?: string;
  organization?: string;
  eventName?: string;
  issueDate?: string;
  certificateType?: string;
  message?: string;
};

export function VerifyResultCard({ result }: { result: VerifyResult }) {
  return (
    <div className="card overflow-hidden animate-fade-in">
      {result.status === "VALID" && (
        <>
          <div className="flex items-center gap-3 bg-emerald-50 px-5 py-4 dark:bg-emerald-950/40">
            <BadgeCheck className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Certificate VALID</p>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Authenticity confirmed</p>
            </div>
          </div>
          <dl className="space-y-2.5 px-5 py-5 text-sm">
            <Row label="Certificate ID" value={result.certificateId} mono />
            <Row label="Name" value={result.name} />
            <Row label="Organization" value={result.organization} />
            <Row label="Event" value={result.eventName} />
            <Row label="Type" value={result.certificateType} />
            <Row
              label="Issue date"
              value={
                result.issueDate
                  ? new Date(result.issueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                  : undefined
              }
            />
          </dl>
        </>
      )}
      {result.status === "REVOKED" && (
        <>
          <div className="flex items-center gap-3 bg-red-50 px-5 py-4 dark:bg-red-950/40">
            <Ban className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">CERTIFICATE REVOKED</p>
              <p className="text-xs text-destructive/80">This certificate is no longer valid</p>
            </div>
          </div>
          <dl className="space-y-2.5 px-5 py-5 text-sm">
            <Row label="Certificate ID" value={result.certificateId} mono />
            <Row label="Name" value={result.name} />
            <Row label="Event" value={result.eventName} />
          </dl>
        </>
      )}
      {result.status === "NOT_FOUND" && (
        <div className="p-8 text-center">
          <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">Certificate not found</p>
          <p className="mt-1 text-sm text-muted-foreground">{result.message || "Check the ID and try again."}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

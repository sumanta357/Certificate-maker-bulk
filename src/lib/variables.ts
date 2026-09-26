// Multi-tenant variable substitution for certificates and emails.
// Every CSV column becomes {{Column}}; system variables are always available.

export const SYSTEM_VARIABLES = [
  "CERTIFICATE_ID",
  "ISSUE_DATE",
  "EVENT_NAME",
  "EVENT_DATE",
  "ORGANIZATION",
  "ORGANIZER",
  "LOCATION",
  "CERTIFICATE_TYPE",
  "WEBSITE",
  "VERIFICATION_URL",
] as const;

export const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_ ]+?)\s*\}\}/g;

export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_PATTERN);
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  return [...out];
}

export type VariableContext = {
  participant: Record<string, unknown>; // CSV columns (original header names)
  certificateId?: string;
  issueDate?: Date | string;
  event: {
    name: string;
    organization?: string | null;
    organizationDisplay?: string | null;
    eventDate?: Date | string | null;
    organizer?: string | null;
    location?: string | null;
    certificateType?: string | null;
    website?: string | null;
  };
  verificationUrl?: string;
};

function fmtDate(d?: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function buildVariableMap(ctx: VariableContext): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.participant || {})) {
    if (v === null || v === undefined) continue;
    map[k] = String(v);
    // Also allow case/space-insensitive lookup: "Full Name" → {{fullname}}, {{Full_Name}}
    const norm = k.trim().toLowerCase().replace(/\s+/g, "_");
    if (!(norm in map)) map[norm] = String(v);
  }
  const issue = fmtDate(ctx.issueDate ?? new Date());
  map["CERTIFICATE_ID"] = ctx.certificateId ?? "";
  map["ISSUE_DATE"] = issue;
  map["EVENT_NAME"] = ctx.event.name ?? "";
  map["ORGANIZATION"] = ctx.event.organizationDisplay || ctx.event.organization || "";
  map["EVENT_DATE"] = fmtDate(ctx.event.eventDate);
  map["ORGANIZER"] = ctx.event.organizer ?? "";
  map["LOCATION"] = ctx.event.location ?? "";
  map["CERTIFICATE_TYPE"] = ctx.event.certificateType ?? "Certificate";
  map["WEBSITE"] = ctx.event.website ?? "";
  map["VERIFICATION_URL"] = ctx.verificationUrl ?? "";
  return map;
}

export function resolveVariables(text: string, map: Record<string, string>): string {
  return text.replace(new RegExp(VARIABLE_PATTERN), (full, name: string) => {
    const key = String(name).trim();
    if (key in map) return map[key];
    const norm = key.toLowerCase().replace(/\s+/g, "_");
    if (norm in map) return map[norm];
    return full; // unresolved variables remain visible for validation
  });
}

export function findUnresolved(text: string, map: Record<string, string>): string[] {
  const unresolved: string[] = [];
  const re = new RegExp(VARIABLE_PATTERN);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].trim();
    if (!(key in map) && !(key.toLowerCase().replace(/\s+/g, "_") in map)) {
      if (!unresolved.includes(m[0])) unresolved.push(m[0]);
    }
  }
  return unresolved;
}

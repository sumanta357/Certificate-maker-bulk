// CSV parsing, field auto-detection, validation, and duplicate checks.
import Papa from "papaparse";
import { prisma } from "./db";

export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

export type ParsedCsv = {
  columns: string[];
  rows: string[][];
};

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length && !result.data.length) {
    throw new Error(result.errors[0]?.message || "Unable to parse CSV");
  }
  const data = result.data as string[][];
  if (!data.length) return { columns: [], rows: [] };
  const [headerRow, ...rows] = data;
  const columns = headerRow.map((h, i) => (h && h.trim()) || `Column ${i + 1}`);
  return { columns, rows };
}

// ── Field auto-detection ────────────────────────────────────────────────────

const NAME_HINTS = [
  "name",
  "full name",
  "fullname",
  "participant name",
  "student name",
  "candidate name",
  "attendee name",
  "delegate name",
  "employee name",
  "recipient",
  "participant",
  "student",
];
const EMAIL_HINTS = ["email", "e-mail", "email address", "emailid", "email id", "mail", "contact email"];
const INSTITUTION_HINTS = [
  "university",
  "college",
  "institution",
  "institute",
  "organization",
  "organisation",
  "school",
  "company",
  "employer",
];

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectFields(columns: string[]): { name?: string; email?: string; institution?: string } {
  const detected: { name?: string; email?: string; institution?: string } = {};

  const score = (col: string, hints: string[], exactBonus = 0): number => {
    const n = normalizeHeader(col);
    let best = 0;
    for (const hint of hints) {
      if (n === hint) best = Math.max(best, 100 + exactBonus);
      else if (n.includes(hint)) best = Math.max(best, 60 + hint.length);
    }
    return best;
  };

  let bestName = { col: "", s: 0 };
  for (const c of columns) {
    const s = score(c, NAME_HINTS, 10);
    if (s > bestName.s) bestName = { col: c, s };
  }
  let bestEmail = { col: "", s: 0 };
  for (const c of columns) {
    const s = score(c, EMAIL_HINTS, 10);
    if (s > bestEmail.s) bestEmail = { col: c, s };
  }
  let bestInst = { col: "", s: 0 };
  for (const c of columns) {
    const s = score(c, INSTITUTION_HINTS, 5);
    if (s > bestInst.s) bestInst = { col: c, s };
  }

  if (bestName.s >= 60) detected.name = bestName.col;
  if (bestEmail.s >= 60) detected.email = bestEmail.col;
  if (bestInst.s >= 60) detected.institution = bestInst.col;
  return detected;
}

// ── Row validation ──────────────────────────────────────────────────────────

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type RowIssue = {
  rowNumber: number; // 1-based, excluding header
  errors: string[];
  warnings: string[];
};

export function validateRows(
  rows: string[][],
  columns: string[],
  mapping: { name?: string; email?: string }
): { issues: RowIssue[]; validCount: number } {
  const nameIdx = mapping.name !== undefined ? columns.indexOf(mapping.name) : -1;
  const emailIdx = mapping.email !== undefined ? columns.indexOf(mapping.email) : -1;
  const seenEmails = new Map<string, number>();
  const seenNames = new Map<string, number>();
  const issues: RowIssue[] = [];
  let valid = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = nameIdx >= 0 ? (row[nameIdx] || "").trim() : "";
    const email = emailIdx >= 0 ? (row[emailIdx] || "").trim().toLowerCase() : "";

    if (nameIdx >= 0 && !name) errors.push("Empty name");
    if (emailIdx >= 0 && !email) errors.push("Empty email");
    if (email && !EMAIL_RE.test(email)) errors.push(`Invalid email: ${email}`);

    if (email && EMAIL_RE.test(email)) {
      if (seenEmails.has(email)) {
        warnings.push(`Duplicate email with row ${seenEmails.get(email)}`);
      } else seenEmails.set(email, rowNumber);
    } else if (name && nameIdx >= 0) {
      if (seenNames.has(name)) {
        warnings.push(`Duplicate name with row ${seenNames.get(name)}`);
      } else seenNames.set(name, rowNumber);
    }

    // Extra spaces / stray quotes
    if (nameIdx >= 0 && /^".*"$/.test((row[nameIdx] || "").trim())) {
      warnings.push("Name appears quoted");
    }

    if (errors.length) issues.push({ rowNumber, errors, warnings });
    else {
      if (warnings.length) issues.push({ rowNumber, errors: [], warnings });
      valid += 1;
    }
  });

  return { issues, validCount: valid };
}

// ── Duplicate protection ────────────────────────────────────────────────────

export type DuplicateMode = "skip" | "regenerate" | "replace";

export async function upsertParticipants(
  opts: {
    organizationId: string;
    eventId: string;
    importId: string;
    rows: string[][];
    columns: string[];
    mapping: { name?: string; email?: string };
    duplicateMode: DuplicateMode;
  }
): Promise<{ created: number; skipped: number; updated: number }> {
  const nameIdx = opts.mapping.name !== undefined ? opts.columns.indexOf(opts.mapping.name) : -1;
  const emailIdx = opts.mapping.email !== undefined ? opts.columns.indexOf(opts.mapping.email) : -1;

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (let i = 0; i < opts.rows.length; i++) {
    const row = opts.rows[i];
    const data: Record<string, string> = {};
    opts.columns.forEach((col: string, idx: number) => {
      data[col] = (row[idx] ?? "").toString();
    });
    const name = nameIdx >= 0 ? (row[nameIdx] || "").trim() : `Participant ${i + 1}`;
    const email = emailIdx >= 0 ? (row[emailIdx] || "").trim().toLowerCase() : null;
    if (!name && !email) {
      skipped += 1;
      continue;
    }

    const found = email
      ? await prisma.participant.findUnique({
          where: { eventId_email: { eventId: opts.eventId, email } },
          select: { id: true },
        })
      : null;
    let existingId: string | null = found?.id ?? null;
    if (!existingId && !email && name) {
      // Rows without an email cannot match on the DB unique key (SQLite and
      // Postgres treat every NULL as distinct), so re-imports would always
      // create duplicates. Fall back to a normalized name match per event.
      const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
      const candidates = await prisma.participant.findMany({
        where: { eventId: opts.eventId, email: null },
        select: { id: true, name: true },
      });
      existingId =
        candidates.find((c) => c.name.toLowerCase().replace(/\s+/g, " ").trim() === normalized)?.id ??
        null;
    }

    if (existingId) {
      if (opts.duplicateMode === "skip") {
        skipped += 1;
        continue;
      }
      // "regenerate" and "replace" both refresh identity data; replace resets status
      await prisma.participant.update({
        where: { id: existingId },
        data: {
          name,
          data: JSON.stringify(data),
          importId: opts.importId,
          ...(opts.duplicateMode === "replace"
            ? { status: "PENDING", error: null, certificateId: null }
            : {}),
        },
      });
      updated += 1;
      continue;
    }

    try {
      await prisma.participant.create({
        data: {
          organizationId: opts.organizationId,
          eventId: opts.eventId,
          importId: opts.importId,
          name,
          email,
          data: JSON.stringify(data),
          rowNumber: i + 1,
        },
      });
      created += 1;
    } catch {
      skipped += 1; // unique constraint race
    }
  }

  return { created, skipped, updated };
}

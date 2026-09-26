// POST /api/events/:id/upload — CSV upload with auto-detection and validation
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/db";
import { requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  parseCsv,
  detectFields,
  validateRows,
  upsertParticipants,
  MAX_CSV_BYTES,
  type DuplicateMode,
} from "@/lib/csv";
import { getStorage } from "@/lib/storage";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user, organization } = await requireRole(req, "EDITOR");
    const { id } = req.query as { id: string };
    const event = await prisma.event.findFirst({ where: { id, organizationId: organization.id } });
    if (!event) throw new ApiError(404, "Event not found");

    const { fileName, csvText, mapping, duplicateMode } = req.body as {
      fileName?: string;
      csvText?: string;
      mapping?: { name?: string; email?: string };
      duplicateMode?: DuplicateMode;
    };
    if (!csvText || typeof csvText !== "string") throw new ApiError(400, "csvText is required");
    if (csvText.length > MAX_CSV_BYTES) throw new ApiError(413, "CSV file too large (max 5 MB)");

    // Parse
    const { columns, rows } = parseCsv(csvText);
    if (!columns.length || !rows.length) {
      throw new ApiError(400, "CSV appears to be empty or missing a header row");
    }

    // Auto-detect (manual mapping overrides)
    const auto = detectFields(columns);
    const effectiveMapping = {
      name: mapping?.name || auto.name,
      email: mapping?.email || auto.email,
    };
    if (!effectiveMapping.name) {
      throw new ApiError(400, "Could not detect a name column — set the mapping manually");
    }

    // Validate
    const { issues, validCount } = validateRows(rows, columns, effectiveMapping);
    const invalidRows = rows.length - validCount;

    // Persist import record
    const import_ = await prisma.cSVImport.create({
      data: {
        organizationId: organization.id,
        eventId: event.id,
        uploadedById: user.id,
        fileName: fileName || "upload.csv",
        columns: JSON.stringify({ columns, mapping: effectiveMapping }),
        rows: rows.length,
        validRows: validCount,
        invalidRows,
        warnings: JSON.stringify(issues.slice(0, 200)),
      },
    });

    // Store the raw CSV (audit/history)
    const storage = getStorage();
    await storage.put(`imports/${event.id}/${import_.id}.csv`, Buffer.from(csvText, "utf8"), "text/csv");
    await prisma.cSVImport.update({
      where: { id: import_.id },
      data: { storageKey: `imports/${event.id}/${import_.id}.csv` },
    });

    // Persist participants with duplicate protection
    const result = await upsertParticipants({
      organizationId: organization.id,
      eventId: event.id,
      importId: import_.id,
      rows,
      columns,
      mapping: effectiveMapping,
      duplicateMode: duplicateMode || "skip",
    });

    await audit({
      organizationId: organization.id,
      userId: user.id,
      action: "csv.uploaded",
      entityType: "CSVImport",
      entityId: import_.id,
      metadata: { fileName: fileName || "upload.csv", rows: rows.length, created: result.created },
      req,
    });

    return res.status(201).json({
      import: {
        id: import_.id,
        fileName: import_.fileName,
        rows: import_.rows,
        validRows: import_.validRows,
        invalidRows: import_.invalidRows,
      },
      columns,
      detected: effectiveMapping,
      issues: issues.slice(0, 100),
      participants: result,
    });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events/:id/upload]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

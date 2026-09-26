// PDF renderer: draws the exact saved design JSON via PDFKit.
// Design coordinates are CSS pixels (96/inch); PDF points are 72/inch, so we
// scale by 0.75. The browser canvas preview uses the same geometry, so
// preview == PDF.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "./db";
import { getStorage } from "./storage";
import type { CertificateDesign, DesignObject, ImageObject, ShapeObject, TextObject } from "./design";
import { pdfFontName } from "./design";
import { resolveVariables, buildVariableMap, type VariableContext } from "./variables";

const PX_TO_PT = 0.75;

function hexToRgb(hex: string): [number, number, number] | null {
  if (!hex) return null;
  const m = hex.replace("#", "");
  if (m.length === 3) {
    return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
  }
  if (m.length === 6) {
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }
  return null;
}

function setFill(doc: PDFKit.PDFDocument, color: string) {
  const rgb = hexToRgb(color);
  if (rgb) doc.fillColor(`#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`);
  else doc.fillColor("black");
}

function setStroke(doc: PDFKit.PDFDocument, color: string) {
  const rgb = hexToRgb(color);
  if (rgb) doc.strokeColor(`#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`);
  else doc.strokeColor("black");
}

async function loadImageBuffer(assetId: string): Promise<Buffer | null> {
  if (!assetId) return null;
  if (assetId.startsWith("data:")) {
    const b64 = assetId.slice(assetId.indexOf(",") + 1);
    return Buffer.from(b64, "base64");
  }
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return null;
  const storage = getStorage();
  return storage.get(asset.storageKey);
}

// Measure text width in design px using PDFKit AFM metrics (exact).
function measureText(
  doc: PDFKit.PDFDocument,
  fontName: string,
  size: number,
  text: string
): number {
  const w = doc.font(fontName).widthOfString(text);
  return (w / size) * size; // widthOfString already at current font size
}

function fitFontSize(
  doc: PDFKit.PDFDocument,
  obj: TextObject,
  resolved: string
): number {
  if (!obj.autoFit) return obj.fontSize;
  const fontName = pdfFontName(obj.fontFamily, obj.fontWeight === "bold", obj.italic);
  const maxWidth = obj.width;
  let size = Math.min(obj.maxFontSize || obj.fontSize, obj.fontSize);
  const min = obj.minFontSize || 8;

  const widthAt = (s: number) => {
    doc.font(fontName).fontSize(s * PX_TO_PT);
    return doc.widthOfString(resolved) / PX_TO_PT;
  };

  while (size > min && widthAt(size) > maxWidth) {
    size -= 1;
  }
  // If still too wide at minimum, we allow wrapping (handled in drawText).
  return Math.max(min, size);
}

function wrapText(
  doc: PDFKit.PDFDocument,
  fontName: string,
  sizePx: number,
  text: string,
  maxWidthPx: number
): string[] {
  doc.font(fontName).fontSize(sizePx * PX_TO_PT);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? current + " " + word : word;
    if (doc.widthOfString(attempt) / PX_TO_PT <= maxWidthPx || !current) {
      current = attempt;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function drawText(doc: PDFKit.PDFDocument, obj: TextObject, map: Record<string, string>) {
  const resolved = resolveVariables(obj.text, map);
  if (!obj.visible) return;
  const fontName = pdfFontName(obj.fontFamily, obj.fontWeight === "bold", obj.italic);
  const size = fitFontSize(doc, obj, resolved);
  const fontSizePt = size * PX_TO_PT;
  doc.font(fontName).fontSize(fontSizePt);
  setFill(doc, obj.color);
  doc.fillOpacity(obj.opacity ?? 1);

  const lineHeightPx = size * (obj.lineHeight || 1.3);
  let lines = resolved.split("\n");
  // Wrap lines that still overflow
  const wrapped: string[] = [];
  for (const line of lines) {
    if (doc.widthOfString(line) / PX_TO_PT > obj.width && line.includes(" ")) {
      wrapped.push(...wrapText(doc, fontName, size, line, obj.width));
    } else {
      wrapped.push(line);
    }
  }
  lines = wrapped;

  doc.save();
  if (obj.rotation) {
    const cx = (obj.x + obj.width / 2) * PX_TO_PT;
    const cy = (obj.y + obj.height / 2) * PX_TO_PT;
    doc.rotate(obj.rotation, { origin: [cx, cy] });
  }

  lines.forEach((line, i) => {
    const lineW = doc.widthOfString(line) / PX_TO_PT;
    let xPx = obj.x;
    if (obj.align === "center") xPx = obj.x + (obj.width - lineW) / 2;
    if (obj.align === "right") xPx = obj.x + (obj.width - lineW);
    const yPx = obj.y + i * lineHeightPx;
    // PDFKit text y is the baseline; approximate ascent as 80%% of the font size.
    const ascentPt = fontSizePt * 0.8;
    const yPt = yPx * PX_TO_PT + ascentPt;
    doc.text(line, xPx * PX_TO_PT, yPt, {
      lineBreak: false,
      underline: obj.underline || undefined,
    });
  });
  doc.restore();
  doc.fillOpacity(1);
}

async function drawImage(doc: PDFKit.PDFDocument, obj: ImageObject) {
  if (!obj.visible) return;
  const buf = await loadImageBuffer(obj.assetId);
  if (!buf) return;
  doc.save();
  doc.fillOpacity(obj.opacity ?? 1);
  if (obj.rotation) {
    doc.rotate(obj.rotation, { origin: [(obj.x + obj.width / 2) * PX_TO_PT, (obj.y + obj.height / 2) * PX_TO_PT] });
  }
  try {
    doc.image(buf, obj.x * PX_TO_PT, obj.y * PX_TO_PT, {
      width: obj.width * PX_TO_PT,
      height: obj.height * PX_TO_PT,
      fit: obj.fit === "contain" ? [obj.width * PX_TO_PT, obj.height * PX_TO_PT] : undefined,
    });
  } catch (err) {
    console.error("[pdf] image draw failed", err);
  }
  doc.restore();
  doc.fillOpacity(1);
}

async function drawShape(doc: PDFKit.PDFDocument, obj: ShapeObject) {
  if (!obj.visible) return;
  doc.save();
  doc.fillOpacity(obj.opacity ?? 1);
  if (obj.rotation) {
    doc.rotate(obj.rotation, { origin: [(obj.x + obj.width / 2) * PX_TO_PT, (obj.y + obj.height / 2) * PX_TO_PT] });
  }
  const x = obj.x * PX_TO_PT;
  const y = obj.y * PX_TO_PT;
  const w = obj.width * PX_TO_PT;
  const h = obj.height * PX_TO_PT;

  if (obj.shape === "line") {
    setStroke(doc, obj.stroke || "#000");
    doc.lineWidth(Math.max(0.5, obj.strokeWidth * PX_TO_PT));
    doc.moveTo(x, y + h / 2).lineTo(x + w, y + h / 2).stroke();
  } else if (obj.shape === "ellipse") {
    if (obj.fill) {
      setFill(doc, obj.fill);
      doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2).fill();
    }
    if (obj.stroke) {
      setStroke(doc, obj.stroke);
      doc.lineWidth(Math.max(0.5, obj.strokeWidth * PX_TO_PT));
      doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2).stroke();
    }
  } else {
    // rect / roundRect
    if (obj.fill) {
      setFill(doc, obj.fill);
      if (obj.shape === "roundRect") doc.roundedRect(x, y, w, h, (obj.cornerRadius || 0) * PX_TO_PT).fill();
      else doc.rect(x, y, w, h).fill();
    }
    if (obj.stroke) {
      setStroke(doc, obj.stroke);
      doc.lineWidth(Math.max(0.5, obj.strokeWidth * PX_TO_PT));
      if (obj.shape === "roundRect") doc.roundedRect(x, y, w, h, (obj.cornerRadius || 0) * PX_TO_PT).stroke();
      else doc.rect(x, y, w, h).stroke();
    }
  }
  doc.restore();
  doc.fillOpacity(1);
}

async function drawQR(doc: PDFKit.PDFDocument, obj: DesignObject & { type: "qr" }, url: string) {
  if (!obj.visible) return;
  try {
    const png = await QRCode.toBuffer(url, {
      width: 512,
      margin: 1,
      color: {
        dark: obj.fgColor || "#000000",
        light: obj.bgColor || "#ffffff",
      },
      errorCorrectionLevel: "M",
    });
    doc.save();
    doc.fillOpacity(obj.opacity ?? 1);
    if (obj.rotation) {
      doc.rotate(obj.rotation, { origin: [(obj.x + obj.width / 2) * PX_TO_PT, (obj.y + obj.height / 2) * PX_TO_PT] });
    }
    doc.image(png, obj.x * PX_TO_PT, obj.y * PX_TO_PT, {
      width: obj.width * PX_TO_PT,
      height: obj.height * PX_TO_PT,
    });
    doc.restore();
    doc.fillOpacity(1);
  } catch (err) {
    console.error("[pdf] qr draw failed", err);
  }
}

export async function renderCertificatePdf(opts: {
  design: CertificateDesign;
  variableCtx: VariableContext;
  verificationUrl: string;
}): Promise<Buffer> {
  const { design, variableCtx, verificationUrl } = opts;
  const map = buildVariableMap(variableCtx);

  const doc = new PDFDocument({
    size: [design.page.width * PX_TO_PT, design.page.height * PX_TO_PT],
    margin: 0,
    info: { Title: `Certificate ${variableCtx.certificateId || ""}`.trim() },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // Background
  if (design.background && design.background.toLowerCase() !== "#ffffff" && design.background.toLowerCase() !== "#fff") {
    setFill(doc, design.background);
    doc.rect(0, 0, design.page.width * PX_TO_PT, design.page.height * PX_TO_PT).fill();
  }
  if (design.backgroundImageAssetId) {
    const bg = await loadImageBuffer(design.backgroundImageAssetId);
    if (bg) {
      doc.image(bg, 0, 0, { width: design.page.width * PX_TO_PT, height: design.page.height * PX_TO_PT });
    }
  }

  for (const obj of design.objects || []) {
    if (obj.type === "shape") await drawShape(doc, obj);
    else if (obj.type === "text") await drawText(doc, obj, map);
    else if (obj.type === "image") await drawImage(doc, obj);
    else if (obj.type === "qr") await drawQR(doc, obj, verificationUrl);
  }

  doc.end();
  return done;
}

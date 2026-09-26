// Certificate design JSON model — shared by the visual editor and PDF renderer.
// The PDF renderer consumes the exact same JSON, so preview == PDF.

export type DesignObject =
  | TextObject
  | ImageObject
  | ShapeObject
  | QRObject;

export interface BaseObject {
  id: string;
  type: "text" | "image" | "shape" | "qr";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  visible?: boolean;
  name?: string;
}

export interface TextObject extends BaseObject {
  type: "text";
  text: string; // may contain {{Variables}}
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
  lineHeight: number; // multiplier
  letterSpacing: number;
  autoFit: boolean; // shrink to fit width (for long names)
  minFontSize: number;
  maxFontSize: number;
}

export interface ImageObject extends BaseObject {
  type: "image";
  assetId: string; // stored asset key or data URL
  fit: "contain" | "fill";
}

export interface ShapeObject extends BaseObject {
  type: "shape";
  shape: "rect" | "ellipse" | "line" | "roundRect";
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
}

export interface QRObject extends BaseObject {
  type: "qr";
  fgColor: string;
  bgColor: string;
}

export interface CertificateDesign {
  version: number; // design schema version
  page: { width: number; height: number };
  background: string; // css color
  backgroundImageAssetId?: string | null;
  objects: DesignObject[];
}

export const PAGE_PRESETS: Record<string, { label: string; width: number; height: number }> = {
  "a4-landscape": { label: "A4 Landscape", width: 1123, height: 794 },
  "a4-portrait": { label: "A4 Portrait", width: 794, height: 1123 },
  "letter-landscape": { label: "Letter Landscape", width: 1056, height: 816 },
  "letter-portrait": { label: "Letter Portrait", width: 816, height: 1056 },
};

export const FONTS = [
  "Helvetica",
  "Times-Roman",
  "Courier",
  "Georgia",
  "Verdana",
  "Trebuchet MS",
  "Arial",
  "Times New Roman",
  "Courier New",
];

// PDF-kit base-14 mapping: what we can render identically in PDF and browser.
export const PDF_FONT_MAP: Record<string, string> = {
  Helvetica: "Helvetica",
  Arial: "Helvetica",
  "Liberation Sans": "Helvetica",
  "Times-Roman": "Times-Roman",
  "Times New Roman": "Times-Roman",
  Georgia: "Times-Roman",
  "Liberation Serif": "Times-Roman",
  Courier: "Courier",
  "Courier New": "Courier",
  "Liberation Mono": "Courier",
  Verdana: "Helvetica",
  "Trebuchet MS": "Helvetica",
  "sans-serif": "Helvetica",
  "serif": "Times-Roman",
  "monospace": "Courier",
};

export function pdfFontName(f: string, bold: boolean, italic: boolean): string {
  const base = PDF_FONT_MAP[f] || "Helvetica";
  if (bold && italic) return `${base}-BoldOblique`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-Oblique`;
  return base;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function defaultDesign(): CertificateDesign {
  return {
    version: 1,
    page: { ...PAGE_PRESETS["a4-landscape"] },
    background: "#ffffff",
    backgroundImageAssetId: null,
    objects: [],
  };
}

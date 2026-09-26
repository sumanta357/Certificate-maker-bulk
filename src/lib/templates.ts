// Ten fully-editable starter certificate templates.
// Generic: only system/CSV variables, no hardcoded organizations or people.
import type { CertificateDesign, DesignObject } from "./design";
import { newId } from "./design";

const A4L = { width: 1123, height: 794 };

type TextOpts = Partial<{
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  italic: boolean;
  align: "left" | "center" | "right";
  color: string;
  letterSpacing: number;
  lineHeight: number;
  autoFit: boolean;
  minFontSize: number;
  maxFontSize: number;
}>;

function text(o: TextOpts): DesignObject {
  return {
    id: newId(),
    type: "text",
    x: 0,
    y: 0,
    width: 400,
    height: 40,
    rotation: 0,
    opacity: 1,
    text: "Text",
    fontSize: 24,
    fontFamily: "Helvetica",
    fontWeight: "normal",
    italic: false,
    underline: false,
    align: "center",
    color: "#1f2937",
    lineHeight: 1.3,
    letterSpacing: 0,
    autoFit: true,
    minFontSize: 12,
    maxFontSize: 42,
    locked: false,
    visible: true,
    ...o,
  } as DesignObject;
}

function rect(o: Record<string, unknown>): DesignObject {
  return {
    id: newId(),
    type: "shape",
    shape: "rect",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "",
    stroke: "#b98a2f",
    strokeWidth: 2,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    ...o,
  } as DesignObject;
}

function image(o: Record<string, unknown>): DesignObject {
  return {
    id: newId(),
    type: "image",
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    assetId: "",
    fit: "contain",
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    ...o,
  } as DesignObject;
}

function qrObj(o: Record<string, unknown>): DesignObject {
  return {
    id: newId(),
    type: "qr",
    x: 0,
    y: 0,
    width: 90,
    height: 90,
    fgColor: "#111827",
    bgColor: "#ffffff",
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    ...o,
  } as DesignObject;
}

function makeDesign(page: { width: number; height: number }, background: string, objects: DesignObject[]): CertificateDesign {
  return {
    version: 1,
    page,
    background,
    backgroundImageAssetId: null,
    objects,
  };
}

// ── Reusable building blocks (A4 landscape geometry) ────────────────────────

function frame(color: string, inset = 30, sw = 2, second = false): DesignObject[] {
  const out = [rect({ x: inset, y: inset, width: A4L.width - inset * 2, height: A4L.height - inset * 2, stroke: color, strokeWidth: sw })];
  if (second) {
    out.push(rect({ x: inset + 10, y: inset + 10, width: A4L.width - (inset + 10) * 2, height: A4L.height - (inset + 10) * 2, stroke: color, strokeWidth: 1 }));
  }
  return out;
}

function heading(t: string, color: string, y = 100, size = 34): DesignObject {
  return text({ text: t, x: 112, y, width: A4L.width - 224, height: size + 14, fontSize: size, fontWeight: "bold", align: "center", color, letterSpacing: 4 });
}

function subheading(t: string, y: number): DesignObject {
  return text({ text: t, x: 162, y, width: A4L.width - 324, height: 28, fontSize: 17, color: "#6b7280", align: "center" });
}

function namePlate(y = 296): DesignObject {
  return text({ text: "{{Name}}", x: 162, y, width: A4L.width - 324, height: 62, fontSize: 42, fontWeight: "bold", align: "center", color: "#111827", autoFit: true, minFontSize: 20, maxFontSize: 42 });
}

function institution(y = 368): DesignObject {
  return text({ text: "{{University}}", x: 262, y, width: A4L.width - 524, height: 30, fontSize: 19, color: "#374151", align: "center", autoFit: true, minFontSize: 12, maxFontSize: 19 });
}

function line(t: string, y: number, size = 16, color = "#4b5563"): DesignObject {
  return text({ text: t, x: 200, y, width: A4L.width - 400, height: size + 12, fontSize: size, color, align: "center" });
}

function footer(): DesignObject[] {
  return [
    text({ text: "{{ISSUE_DATE}}", x: 96, y: 686, width: 260, height: 22, fontSize: 13, color: "#6b7280", align: "left" }),
    text({ text: "{{ORGANIZER}}", x: A4L.width - 356, y: 686, width: 260, height: 22, fontSize: 13, color: "#6b7280", align: "right" }),
  ];
}

function qrBlock(x = A4L.width - 136, y = 588): DesignObject[] {
  return [
    qrObj({ x, y, width: 92, height: 92 }),
    text({ text: "{{CERTIFICATE_ID}}", x: x - 34, y: y + 96, width: 160, height: 18, fontSize: 11, color: "#6b7280", align: "center" }),
  ];
}

function seal(x = 96, y = 560): DesignObject[] {
  return [
    rect({ shape: "ellipse", x, y, width: 110, height: 110, stroke: "#b98a2f", strokeWidth: 2, fill: "" }),
    text({ text: "OFFICIAL", x: x - 5, y: y + 42, width: 120, height: 18, fontSize: 12, color: "#b98a2f", align: "center", letterSpacing: 2 }),
  ];
}

// ── The ten starter templates ───────────────────────────────────────────────

export type StarterTemplate = {
  key: string;
  name: string;
  description: string;
  design: () => CertificateDesign;
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "classic-academic",
    name: "Classic Academic",
    description: "Traditional serif academic certificate with double frame and seal.",
    design: () =>
      makeDesign(A4L, "#fffdf5", [
        ...frame("#9a7b2d", 34, 2, true),
        heading("CERTIFICATE OF ACHIEVEMENT", "#9a7b2d", 110),
        subheading("This certificate is proudly presented to", 200),
        namePlate(268),
        institution(344),
        line("for outstanding accomplishment in", 412),
        line("{{EVENT_NAME}}", 448, 20, "#111827"),
        text({ text: "held on {{EVENT_DATE}} at {{LOCATION}}", x: 200, y: 490, width: A4L.width - 400, height: 26, fontSize: 14, color: "#6b7280", align: "center" }),
        ...seal(110, 540),
        ...footer(),
        ...qrBlock(A4L.width - 140, 588),
      ]),
  },
  {
    key: "modern-minimal",
    name: "Modern Minimal",
    description: "Clean minimal layout with a bold accent bar.",
    design: () =>
      makeDesign(A4L, "#ffffff", [
        rect({ x: 0, y: 0, width: 14, height: A4L.height, fill: "#2563eb", stroke: "", strokeWidth: 0 }),
        text({ text: "{{CERTIFICATE_TYPE}}", x: 140, y: 150, width: 500, height: 44, fontSize: 30, fontWeight: "bold", align: "left", color: "#111827" }),
        text({ text: "Awarded to", x: 140, y: 250, width: 400, height: 26, fontSize: 15, color: "#6b7280", align: "left" }),
        text({ text: "{{Name}}", x: 140, y: 292, width: 600, height: 60, fontSize: 40, fontWeight: "bold", align: "left", color: "#2563eb", autoFit: true, minFontSize: 20, maxFontSize: 40 }),
        text({ text: "{{University}}", x: 140, y: 366, width: 500, height: 28, fontSize: 18, color: "#374151", align: "left", autoFit: true, minFontSize: 12, maxFontSize: 18 }),
        text({ text: "for successfully completing {{EVENT_NAME}} on {{EVENT_DATE}}.", x: 140, y: 440, width: 560, height: 52, fontSize: 15, color: "#4b5563", align: "left", lineHeight: 1.5 }),
        text({ text: "{{ORGANIZATION}}", x: 140, y: 660, width: 400, height: 24, fontSize: 14, fontWeight: "bold", align: "left", color: "#111827" }),
        text({ text: "{{ORGANIZER}} · {{ISSUE_DATE}}", x: 140, y: 690, width: 400, height: 20, fontSize: 12, color: "#6b7280", align: "left" }),
        ...qrBlock(920, 560),
        rect({ x: 920, y: 690, width: 92, height: 2, fill: "#2563eb", stroke: "", strokeWidth: 0 }),
      ]),
  },
  {
    key: "corporate",
    name: "Corporate",
    description: "Professional corporate certificate with structured bands.",
    design: () =>
      makeDesign(A4L, "#f8fafc", [
        rect({ x: 0, y: 0, width: A4L.width, height: 120, fill: "#0f172a", stroke: "", strokeWidth: 0 }),
        text({ text: "{{ORGANIZATION}}", x: 60, y: 44, width: 700, height: 32, fontSize: 22, fontWeight: "bold", align: "left", color: "#ffffff" }),
        text({ text: "{{CERTIFICATE_TYPE}}", x: 112, y: 180, width: A4L.width - 224, height: 42, fontSize: 30, fontWeight: "bold", align: "center", color: "#0f172a", letterSpacing: 3 }),
        text({ text: "This is to certify that", x: 200, y: 260, width: A4L.width - 400, height: 26, fontSize: 15, color: "#64748b", align: "center" }),
        namePlate(300),
        institution(372),
        line("has successfully completed", 430),
        line("{{EVENT_NAME}}", 464, 19, "#0f172a"),
        text({ text: "{{LOCATION}} · {{EVENT_DATE}}", x: 200, y: 506, width: A4L.width - 400, height: 24, fontSize: 13, color: "#64748b", align: "center" }),
        ...footer(),
        ...qrBlock(A4L.width - 140, 590),
      ]),
  },
  {
    key: "elegant",
    name: "Elegant",
    description: "Elegant gold-accented certificate for formal occasions.",
    design: () =>
      makeDesign(A4L, "#fffef9", [
        ...frame("#c9a44a", 26, 1.5),
        rect({ shape: "ellipse", x: 531, y: 84, width: 60, height: 60, stroke: "#c9a44a", strokeWidth: 1.5, fill: "" }),
        text({ text: "★", x: 531, y: 98, width: 60, height: 30, fontSize: 22, color: "#c9a44a", align: "center" }),
        heading("CERTIFICATE", "#a8863a", 170, 40),
        subheading("OF PARTICIPATION", 232),
        text({ text: "presented with gratitude to", x: 200, y: 300, width: A4L.width - 400, height: 24, fontSize: 14, italic: true, color: "#8a7a55", align: "center" }),
        text({ text: "{{Name}}", x: 162, y: 336, width: A4L.width - 324, height: 58, fontSize: 38, fontWeight: "bold", fontFamily: "Times-Roman", align: "center", color: "#3f3420", autoFit: true, minFontSize: 18, maxFontSize: 38 }),
        institution(404),
        line("for gracious participation in {{EVENT_NAME}}", 466, 15, "#8a7a55"),
        text({ text: "{{EVENT_DATE}}", x: 200, y: 498, width: A4L.width - 400, height: 24, fontSize: 13, italic: true, color: "#8a7a55", align: "center" }),
        ...footer(),
        ...qrBlock(84, 584),
      ]),
  },
  {
    key: "workshop",
    name: "Workshop",
    description: "Energetic two-tone workshop completion certificate.",
    design: () =>
      makeDesign(A4L, "#ffffff", [
        rect({ x: 0, y: 0, width: A4L.width, height: 10, fill: "#f97316", stroke: "", strokeWidth: 0 }),
        rect({ x: 0, y: A4L.height - 10, width: A4L.width, height: 10, fill: "#f97316", stroke: "", strokeWidth: 0 }),
        text({ text: "WORKSHOP CERTIFICATE", x: 112, y: 110, width: A4L.width - 224, height: 40, fontSize: 28, fontWeight: "bold", align: "center", color: "#c2410c", letterSpacing: 3 }),
        text({ text: "awarded to the hands-on participant", x: 200, y: 190, width: A4L.width - 400, height: 24, fontSize: 14, color: "#78716c", align: "center" }),
        namePlate(232),
        institution(306),
        text({ text: "for active participation in the workshop", x: 200, y: 370, width: A4L.width - 400, height: 24, fontSize: 15, color: "#57534e", align: "center" }),
        text({ text: "{{EVENT_NAME}}", x: 162, y: 404, width: A4L.width - 324, height: 34, fontSize: 21, fontWeight: "bold", align: "center", color: "#c2410c", autoFit: true, minFontSize: 14, maxFontSize: 21 }),
        text({ text: "{{ISSUE_DATE}}", x: 96, y: 620, width: 260, height: 22, fontSize: 13, color: "#78716c", align: "left" }),
        text({ text: "{{ORGANIZER}}", x: A4L.width - 356, y: 620, width: 260, height: 22, fontSize: 13, color: "#78716c", align: "right" }),
        ...qrBlock(516, 560),
      ]),
  },
  {
    key: "conference",
    name: "Conference",
    description: "Conference attendance certificate with speaker-style layout.",
    design: () =>
      makeDesign(A4L, "#0f172a", [
        text({ text: "{{EVENT_NAME}}", x: 112, y: 120, width: A4L.width - 224, height: 40, fontSize: 27, fontWeight: "bold", align: "center", color: "#7dd3fc", autoFit: true, minFontSize: 16, maxFontSize: 27 }),
        text({ text: "CERTIFICATE OF ATTENDANCE", x: 112, y: 186, width: A4L.width - 224, height: 30, fontSize: 16, align: "center", color: "#e2e8f0", letterSpacing: 6 }),
        text({ text: "presented to", x: 200, y: 280, width: A4L.width - 400, height: 24, fontSize: 14, color: "#94a3b8", align: "center" }),
        text({ text: "{{Name}}", x: 162, y: 318, width: A4L.width - 324, height: 58, fontSize: 40, fontWeight: "bold", align: "center", color: "#ffffff", autoFit: true, minFontSize: 20, maxFontSize: 40 }),
        text({ text: "{{University}}", x: 262, y: 390, width: A4L.width - 524, height: 28, fontSize: 17, align: "center", color: "#cbd5e1", autoFit: true, minFontSize: 12, maxFontSize: 17 }),
        text({ text: "{{LOCATION}} — {{EVENT_DATE}}", x: 200, y: 462, width: A4L.width - 400, height: 24, fontSize: 13, color: "#94a3b8", align: "center" }),
        text({ text: "{{CERTIFICATE_ID}}", x: 112, y: 700, width: A4L.width - 224, height: 22, fontSize: 12, color: "#64748b", align: "center" }),
        qrObj({ x: 515, y: 540, width: 92, height: 92, fgColor: "#ffffff", bgColor: "#0f172a" }),
      ]),
  },
  {
    key: "training-completion",
    name: "Training Completion",
    description: "Structured completion certificate with progress framing.",
    design: () =>
      makeDesign(A4L, "#ffffff", [
        ...frame("#0e7490", 30, 2),
        heading("TRAINING CERTIFICATE", "#0e7490", 104, 30),
        subheading("Certificate of Completion", 158),
        text({ text: "This certifies that", x: 200, y: 246, width: A4L.width - 400, height: 24, fontSize: 14, color: "#64748b", align: "center" }),
        namePlate(286),
        institution(360),
        text({ text: "has completed all requirements of the training program", x: 200, y: 424, width: A4L.width - 400, height: 24, fontSize: 15, color: "#475569", align: "center" }),
        text({ text: "{{EVENT_NAME}}", x: 162, y: 458, width: A4L.width - 324, height: 32, fontSize: 19, fontWeight: "bold", align: "center", color: "#0e7490", autoFit: true, minFontSize: 13, maxFontSize: 19 }),
        ...seal(120, 540),
        text({ text: "Issued {{ISSUE_DATE}}", x: 400, y: 600, width: 320, height: 24, fontSize: 13, color: "#64748b", align: "center" }),
        ...footer(),
        ...qrBlock(A4L.width - 140, 580),
      ]),
  },
  {
    key: "participation",
    name: "Participation",
    description: "Friendly, colorful participation certificate for events of any size.",
    design: () =>
      makeDesign(A4L, "#ffffff", [
        rect({ x: 60, y: 60, width: A4L.width - 120, height: A4L.height - 120, fill: "", stroke: "#7c3aed", strokeWidth: 3 }),
        rect({ x: 76, y: 76, width: A4L.width - 152, height: A4L.height - 152, fill: "", stroke: "#ddd6fe", strokeWidth: 1.5 }),
        text({ text: "CERTIFICATE OF PARTICIPATION", x: 142, y: 128, width: A4L.width - 284, height: 40, fontSize: 27, fontWeight: "bold", align: "center", color: "#5b21b6", letterSpacing: 2 }),
        text({ text: "This certificate is proudly presented to", x: 200, y: 222, width: A4L.width - 400, height: 26, fontSize: 15, color: "#6d28d9", align: "center" }),
        namePlate(266),
        institution(342),
        text({ text: "for participating in", x: 200, y: 408, width: A4L.width - 400, height: 24, fontSize: 15, color: "#4b5563", align: "center" }),
        text({ text: "{{EVENT_NAME}}", x: 162, y: 442, width: A4L.width - 324, height: 34, fontSize: 21, fontWeight: "bold", align: "center", color: "#5b21b6", autoFit: true, minFontSize: 14, maxFontSize: 21 }),
        text({ text: "held on {{EVENT_DATE}}", x: 200, y: 490, width: A4L.width - 400, height: 24, fontSize: 13, color: "#6b7280", align: "center" }),
        ...footer(),
        ...qrBlock(96, 572),
      ]),
  },
  {
    key: "appreciation",
    name: "Appreciation",
    description: "Warm appreciation certificate with ribbon accent.",
    design: () =>
      makeDesign(A4L, "#fff7ed", [
        rect({ x: 0, y: 0, width: A4L.width, height: 8, fill: "#ea580c", stroke: "", strokeWidth: 0 }),
        rect({ shape: "ellipse", x: 521, y: 90, width: 80, height: 80, fill: "#ea580c", stroke: "", strokeWidth: 0 }),
        text({ text: "♥", x: 521, y: 112, width: 80, height: 36, fontSize: 26, color: "#ffffff", align: "center" }),
        heading("CERTIFICATE OF APPRECIATION", "#9a3412", 206, 28),
        text({ text: "gratefully presented to", x: 200, y: 282, width: A4L.width - 400, height: 24, fontSize: 14, italic: true, color: "#c2410c", align: "center" }),
        text({ text: "{{Name}}", x: 162, y: 318, width: A4L.width - 324, height: 56, fontSize: 38, fontWeight: "bold", align: "center", color: "#7c2d12", autoFit: true, minFontSize: 18, maxFontSize: 38 }),
        institution(388),
        text({ text: "in sincere appreciation of your contribution to {{EVENT_NAME}}.", x: 162, y: 452, width: A4L.width - 324, height: 48, fontSize: 15, color: "#9a3412", align: "center", lineHeight: 1.5 }),
        text({ text: "With gratitude — {{ORGANIZER}}", x: 200, y: 560, width: A4L.width - 400, height: 26, fontSize: 14, italic: true, color: "#c2410c", align: "center" }),
        text({ text: "{{ISSUE_DATE}}", x: 96, y: 668, width: 260, height: 22, fontSize: 13, color: "#9a3412", align: "left" }),
        ...qrBlock(A4L.width - 140, 586),
      ]),
  },
  {
    key: "achievement",
    name: "Achievement",
    description: "Bold achievement certificate with laurel-style corners.",
    design: () =>
      makeDesign(A4L, "#f0fdf4", [
        ...frame("#166534", 26, 2),
        rect({ x: 46, y: 46, width: A4L.width - 92, height: A4L.height - 92, fill: "", stroke: "#bbf7d0", strokeWidth: 1 }),
        text({ text: "🏆 ACHIEVEMENT 🏆", x: 112, y: 96, width: A4L.width - 224, height: 34, fontSize: 18, color: "#166534", align: "center", letterSpacing: 4 }),
        heading("CERTIFICATE OF ACHIEVEMENT", "#14532d", 150, 30),
        subheading("awarded for exceptional performance", 212),
        namePlate(268),
        institution(342),
        text({ text: "in recognition of remarkable results in", x: 200, y: 404, width: A4L.width - 400, height: 24, fontSize: 14, color: "#166534", align: "center" }),
        text({ text: "{{EVENT_NAME}}", x: 162, y: 436, width: A4L.width - 324, height: 32, fontSize: 20, fontWeight: "bold", align: "center", color: "#14532d", autoFit: true, minFontSize: 13, maxFontSize: 20 }),
        text({ text: "{{ORGANIZATION}} · {{EVENT_DATE}}", x: 200, y: 482, width: A4L.width - 400, height: 24, fontSize: 13, color: "#15803d", align: "center" }),
        ...seal(108, 546),
        ...footer(),
        ...qrBlock(A4L.width - 140, 586),
      ]),
  },
];

export function getStarterTemplate(key: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.key === key);
}

"use client";
// Konva-based certificate renderer — identical geometry to the PDF renderer.
// Used for live preview and as the base of the visual editor.
import React, { useMemo } from "react";
import { Stage, Layer, Text, Rect, Ellipse, Line, Image as KImage } from "react-konva";
import useImage from "use-image";
import type { CertificateDesign, DesignObject, TextObject } from "@/lib/design";
import { resolveVariables } from "@/lib/variables";

function fitFontSizeClient(text: string, obj: TextObject): number {
  if (!obj.autoFit || !text) return obj.fontSize;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return obj.fontSize;
  const family = obj.fontFamily === "Helvetica" ? "Arial, sans-serif" : obj.fontFamily;
  measure.font = `${obj.italic ? "italic " : ""}${obj.fontWeight === "bold" ? "700" : "400"} ${obj.fontSize}px ${family}`;
  const widthAt = (s: number) => {
    measure.font = `${obj.italic ? "italic " : ""}${obj.fontWeight === "bold" ? "700" : "400"} ${s}px ${family}`;
    return measure.measureText(text).width;
  };
  let size = Math.min(obj.maxFontSize || obj.fontSize, obj.fontSize);
  const min = obj.minFontSize || 8;
  while (size > min && widthAt(size) > obj.width) size -= 1;
  return Math.max(min, size);
}

function QRNode({ obj, url }: { obj: Extract<DesignObject, { type: "qr" }>; url: string }) {
  const [img] = useImage(
    `/api/qr?url=${encodeURIComponent(url)}&fg=${encodeURIComponent(obj.fgColor)}&bg=${encodeURIComponent(obj.bgColor)}`
  );
  if (!img) return null;
  return <KImage image={img} x={obj.x} y={obj.y} width={obj.width} height={obj.height} opacity={obj.opacity ?? 1} rotation={obj.rotation} listening={false} />;
}

function AssetImage({ obj }: { obj: Extract<DesignObject, { type: "image" }> }) {
  const src = obj.assetId.startsWith("data:") ? obj.assetId : `/api/assets/${obj.assetId}/file`;
  const [img] = useImage(src);
  if (!img) return null;
  return <KImage image={img} x={obj.x} y={obj.y} width={obj.width} height={obj.height} opacity={obj.opacity ?? 1} rotation={obj.rotation} listening={false} />;
}

export function CertificateCanvas({
  design,
  variables,
  verificationUrl,
}: {
  design: CertificateDesign;
  variables: Record<string, string>;
  verificationUrl?: string;
}) {
  const bgImage = useMemo(() => design.backgroundImageAssetId || null, [design.backgroundImageAssetId]);

  return (
    <Stage width={design.page.width} height={design.page.height} style={{ maxWidth: "100%" }}>
      <Layer>
        <Rect x={0} y={0} width={design.page.width} height={design.page.height} fill={design.background || "#ffffff"} listening={false} />
        {bgImage ? <BackgroundImage assetId={bgImage} w={design.page.width} h={design.page.height} /> : null}
        {design.objects.map((obj) => {
          if (obj.visible === false) return null;
          if (obj.type === "shape") {
            if (obj.shape === "ellipse") {
              return (
                <Ellipse
                  key={obj.id}
                  x={obj.x + obj.width / 2}
                  y={obj.y + obj.height / 2}
                  radiusX={obj.width / 2}
                  radiusY={obj.height / 2}
                  fill={obj.fill || undefined}
                  stroke={obj.stroke || undefined}
                  strokeWidth={obj.strokeWidth}
                  opacity={obj.opacity ?? 1}
                  rotation={obj.rotation}
                  listening={false}
                />
              );
            }
            if (obj.shape === "line") {
              return (
                <Line
                  key={obj.id}
                  points={[obj.x, obj.y + obj.height / 2, obj.x + obj.width, obj.y + obj.height / 2]}
                  stroke={obj.stroke || "#000"}
                  strokeWidth={obj.strokeWidth}
                  opacity={obj.opacity ?? 1}
                  rotation={obj.rotation}
                  listening={false}
                />
              );
            }
            return (
              <Rect
                key={obj.id}
                x={obj.x}
                y={obj.y}
                width={obj.width}
                height={obj.height}
                fill={obj.fill || undefined}
                stroke={obj.stroke || undefined}
                strokeWidth={obj.strokeWidth}
                cornerRadius={obj.shape === "roundRect" ? obj.cornerRadius || 0 : 0}
                opacity={obj.opacity ?? 1}
                rotation={obj.rotation}
                listening={false}
              />
            );
          }
          if (obj.type === "text") {
            const resolved = resolveVariables(obj.text, variables);
            const size = fitFontSizeClient(resolved, obj);
            const family = obj.fontFamily === "Helvetica" ? "Arial" : obj.fontFamily === "Times-Roman" ? "Georgia" : obj.fontFamily;
            return (
              <Text
                key={obj.id}
                text={resolved}
                x={obj.x}
                y={obj.y}
                width={obj.width}
                align={obj.align}
                fontSize={size}
                fontFamily={family}
                fontStyle={`${obj.italic ? "italic " : ""}${obj.fontWeight === "bold" ? "bold" : "normal"}`}
                textDecoration={obj.underline ? "underline" : ""}
                fill={obj.color}
                opacity={obj.opacity ?? 1}
                rotation={obj.rotation}
                lineHeight={obj.lineHeight || 1.3}
                letterSpacing={obj.letterSpacing || 0}
                listening={false}
              />
            );
          }
          if (obj.type === "image") return <AssetImage key={obj.id} obj={obj} />;
          if (obj.type === "qr") return <QRNode key={obj.id} obj={obj} url={verificationUrl || "about:blank"} />;
          return null;
        })}
      </Layer>
    </Stage>
  );
}

function BackgroundImage({ assetId, w, h }: { assetId: string; w: number; h: number }) {
  const src = assetId.startsWith("data:") ? assetId : `/api/assets/${assetId}/file`;
  const [img] = useImage(src);
  if (!img) return null;
  return <KImage image={img} x={0} y={0} width={w} height={h} listening={false} />;
}

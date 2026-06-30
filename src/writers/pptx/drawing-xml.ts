import type {
  FillIR,
  FrameIR,
  LinearGradientStopIR,
  ShadowIR,
  StrokeIR,
} from "@/src/layout/projected";
import { XmlChunkWriter } from "./xml-writer";

const MAX_WRITER_SHAPE_OBJECT_ID = Number.MAX_SAFE_INTEGER - 1;

export function emu(value: number | undefined, path = "EMU value"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PPTX drawing XML requires finite ${path}.`);
  }

  return Math.round(value);
}

export function pointToEmu(value: number | undefined, path = "point value"): number | undefined {
  return value === undefined ? undefined : Math.round(finiteNumber(value, path) * 12700);
}

export function alphaValue(transparency: number | undefined, opacity = 1): number | undefined {
  if (transparency !== undefined) {
    finiteNumber(transparency, "transparency");
    if (transparency < 0 || transparency > 100) {
      throw new Error("PPTX drawing XML requires transparency between 0 and 100.");
    }
  }
  finiteNumber(opacity, "opacity");
  if (opacity < 0 || opacity > 1) {
    throw new Error("PPTX drawing XML requires opacity between 0 and 1.");
  }

  const transparencyPercent = transparency ?? 0;
  const alpha = opacity * (1 - transparencyPercent / 100);
  return Math.round(alpha * 100000);
}

export function writeColor(
  writer: XmlChunkWriter,
  color: string | undefined,
  transparency?: number,
  opacity?: number,
): void {
  if (typeof color !== "string" || color.length === 0) {
    throw new Error("PPTX drawing XML requires a projected color value.");
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error("PPTX drawing XML requires a projected six-digit RGB color value.");
  }

  const value = color.toUpperCase();
  const alpha = alphaValue(transparency, opacity);
  if (alpha === undefined || alpha === 100000) {
    writer.empty("a:srgbClr", { val: value });
    return;
  }
  writer.open("a:srgbClr", { val: value }).empty("a:alpha", { val: alpha }).close("a:srgbClr");
}

export function writeFill(
  writer: XmlChunkWriter,
  fill: FillIR | undefined,
  opacity?: number,
): void {
  if (!fill) {
    writer.empty("a:noFill");
    return;
  }

  if (fill.kind === "solid") {
    writer.open("a:solidFill");
    writeColor(writer, fill.color, fill.transparency, opacity);
    writer.close("a:solidFill");
    return;
  }

  if (fill.kind !== "linear-gradient" && fill.kind !== "radial-gradient") {
    throw new Error("PPTX drawing XML requires supported fill.kind.");
  }

  writer.open("a:gradFill", { rotWithShape: 1 }).open("a:gsLst");
  for (const [index, stop] of gradientStops(fill.stops).entries()) {
    writer.open("a:gs", {
      pos: Math.round(gradientStopPosition(stop.position, index) * 100000),
    });
    writeColor(writer, stop.color, stop.transparency, opacity);
    writer.close("a:gs");
  }
  writer.close("a:gsLst");

  if (fill.kind === "linear-gradient") {
    writer.empty("a:lin", {
      ang: Math.round(finiteNumber(fill.angle, "fill.angle") * 60000),
      scaled: 1,
    });
    writer.close("a:gradFill");
    return;
  }

  const radialPath = radialGradientPath(fill);
  writer
    .open("a:path", { path: radialPath })
    .empty("a:fillToRect", {
      l: Math.round(
        (finiteNumber(fill.center.x, "fill.center.x") -
          positiveNumber(fill.radius.x, "fill.radius.x")) *
          100000,
      ),
      t: Math.round(
        (finiteNumber(fill.center.y, "fill.center.y") -
          positiveNumber(fill.radius.y, "fill.radius.y")) *
          100000,
      ),
      r: Math.round(
        (1 -
          (finiteNumber(fill.center.x, "fill.center.x") +
            positiveNumber(fill.radius.x, "fill.radius.x"))) *
          100000,
      ),
      b: Math.round(
        (1 -
          (finiteNumber(fill.center.y, "fill.center.y") +
            positiveNumber(fill.radius.y, "fill.radius.y"))) *
          100000,
      ),
    })
    .close("a:path")
    .close("a:gradFill");
}

function radialGradientPath(fill: Extract<FillIR, { kind: "radial-gradient" }>): "circle" {
  if (fill.shape === "circle" || fill.shape === "ellipse") {
    return "circle";
  }

  throw new Error("PPTX drawing XML requires supported radial fill.shape.");
}

function writeStroke(writer: XmlChunkWriter, stroke: StrokeIR | undefined): void {
  if (!stroke) {
    writer.open("a:ln", { w: 0 }).empty("a:noFill").close("a:ln");
    return;
  }

  const widthPt = finiteNumber(stroke.widthPt, "stroke.widthPt");
  if (widthPt < 0) {
    throw new Error("PPTX drawing XML requires non-negative stroke.widthPt.");
  }

  if (widthPt === 0 || stroke.style === "none") {
    writer.open("a:ln", { w: 0 }).empty("a:noFill").close("a:ln");
    return;
  }

  const capValue =
    stroke.lineCap === "butt"
      ? "flat"
      : stroke.lineCap === "round"
        ? "rnd"
        : stroke.lineCap === "square"
          ? "sq"
          : undefined;
  if (stroke.lineCap !== undefined && capValue === undefined) {
    throw new Error("PPTX drawing XML requires supported stroke.lineCap.");
  }
  if (
    stroke.style !== undefined &&
    stroke.style !== "solid" &&
    stroke.style !== "dash" &&
    stroke.style !== "none"
  ) {
    throw new Error("PPTX drawing XML requires supported stroke.style.");
  }
  writer
    .open("a:ln", {
      w: Math.round(widthPt * 12700),
      cap: capValue,
    })
    .open("a:solidFill");
  writeColor(writer, stroke.color, stroke.transparency);
  writer.close("a:solidFill");
  if (stroke.style === "dash" && !stroke.dashType) {
    throw new Error("PPTX drawing XML requires projected stroke.dashType for dashed strokes.");
  }
  const dashType = stroke.dashType;
  if (dashType) {
    if (!isStrokeDashType(dashType)) {
      throw new Error("PPTX drawing XML requires supported stroke.dashType.");
    }
    writer.empty("a:prstDash", { val: dashType });
  }
  if (stroke.lineJoin) {
    if (stroke.lineJoin !== "bevel" && stroke.lineJoin !== "miter" && stroke.lineJoin !== "round") {
      throw new Error("PPTX drawing XML requires supported stroke.lineJoin.");
    }
    writer.empty(`a:${stroke.lineJoin}`);
  }
  writer.close("a:ln");
}

export function writeShadow(writer: XmlChunkWriter, shadow: ShadowIR | undefined): void {
  if (!shadow) {
    return;
  }

  if (shadow.type !== "inner" && shadow.type !== "outer") {
    throw new Error("PPTX drawing XML requires supported shadow.type.");
  }
  if (!Number.isFinite(shadow.opacity) || shadow.opacity < 0 || shadow.opacity > 1) {
    throw new Error("PPTX drawing XML requires shadow.opacity between 0 and 1.");
  }

  const name = shadow.type === "inner" ? "a:innerShdw" : "a:outerShdw";
  const attrs = {
    blurRad: Math.round(finiteNumber(shadow.blurPt, "shadow.blurPt") * 12700),
    dist: Math.round(finiteNumber(shadow.offsetPt, "shadow.offsetPt") * 12700),
    dir: Math.round(finiteNumber(shadow.angle, "shadow.angle") * 60000),
  };
  writer.open("a:effectLst").open(name, attrs);
  writeColor(writer, shadow.color, (1 - shadow.opacity) * 100);
  writer.close(name).close("a:effectLst");
}

export function writeTransform(
  writer: XmlChunkWriter,
  frame: FrameIR,
  rotation?: number,
  flipH?: boolean,
  flipV?: boolean,
): void {
  writer
    .open("a:xfrm", {
      rot:
        rotation === undefined ? undefined : Math.round(finiteNumber(rotation, "rotation") * 60000),
      flipH: flipH ? 1 : undefined,
      flipV: flipV ? 1 : undefined,
    })
    .empty("a:off", { x: emu(frame.xEmu, "frame.xEmu"), y: emu(frame.yEmu, "frame.yEmu") })
    .empty("a:ext", {
      cx: emu(frame.widthEmu, "frame.widthEmu"),
      cy: emu(frame.heightEmu, "frame.heightEmu"),
    })
    .close("a:xfrm");
}

export function writeHyperlink(
  writer: XmlChunkWriter,
  relationshipId: string | undefined,
  tooltip: string | undefined,
): void {
  if (relationshipId) {
    writer.empty("a:hlinkClick", { "r:id": relationshipId, tooltip });
  }
}

export function requireProjectedRelationshipId(
  relationshipId: string | undefined,
  input: { readonly label: string; readonly type: string },
): string {
  if (!relationshipId) {
    throw new Error(`${input.label} must reference projected ${input.type} relationship id.`);
  }

  return relationshipId;
}

export function writerShapeObjectNumericId(id: string | undefined, name: string): number {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
    throw new Error(`${name} must carry a projected positive shape object id.`);
  }

  const objectId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(objectId) || objectId <= 0 || objectId > MAX_WRITER_SHAPE_OBJECT_ID) {
    throw new Error(`${name} must carry a projected positive shape object id.`);
  }

  return objectId + 1;
}

export function writeNonVisual(
  writer: XmlChunkWriter,
  kind: "pic" | "sp",
  id: string | undefined,
  name: string,
  hyperlinkRelationshipId?: string,
  hyperlinkTooltip?: string,
): void {
  const numericId = writerShapeObjectNumericId(id, name);

  if (kind === "pic") {
    writer.open("p:nvPicPr").open("p:cNvPr", { id: numericId, name });
    writeHyperlink(writer, hyperlinkRelationshipId, hyperlinkTooltip);
    writer.close("p:cNvPr").empty("p:cNvPicPr").empty("p:nvPr").close("p:nvPicPr");
    return;
  }

  writer.open("p:nvSpPr").open("p:cNvPr", { id: numericId, name });
  writeHyperlink(writer, hyperlinkRelationshipId, hyperlinkTooltip);
  writer.close("p:cNvPr").empty("p:cNvSpPr").empty("p:nvPr").close("p:nvSpPr");
}

export function writeShapeProperties(
  writer: XmlChunkWriter,
  input: {
    frame: FrameIR;
    geometry: string;
    radiusEmu?: number;
    fill?: FillIR;
    stroke?: StrokeIR;
    shadow?: ShadowIR;
    opacity?: number;
    rotation?: number;
    flipH?: boolean;
    flipV?: boolean;
  },
): void {
  validateShapePropertyFrame(input.frame, input.geometry);
  writer.open("p:spPr");
  writeTransform(writer, input.frame, input.rotation, input.flipH, input.flipV);
  writePresetGeometry(writer, input);
  writeFill(writer, input.fill, input.opacity);
  writeStroke(writer, input.stroke);
  writeShadow(writer, input.shadow);
  writer.close("p:spPr");
}

function validateShapePropertyFrame(frame: FrameIR, geometry: string): void {
  emu(frame.xEmu, "frame.xEmu");
  emu(frame.yEmu, "frame.yEmu");
  const widthEmu = emu(frame.widthEmu, "frame.widthEmu");
  const heightEmu = emu(frame.heightEmu, "frame.heightEmu");
  if (geometry === "line") {
    if (widthEmu < 0 || heightEmu < 0) {
      throw new Error("PPTX drawing XML requires non-negative line frame size.");
    }
    if (widthEmu === 0 && heightEmu === 0) {
      throw new Error("PPTX drawing XML requires line frame size on at least one axis.");
    }
    return;
  }
  if (widthEmu < 0 || heightEmu < 0) {
    throw new Error("PPTX drawing XML requires non-negative shape frame size.");
  }
}

function writePresetGeometry(
  writer: XmlChunkWriter,
  input: { frame: FrameIR; geometry: string; radiusEmu?: number },
): void {
  if (input.radiusEmu !== undefined && (!Number.isFinite(input.radiusEmu) || input.radiusEmu < 0)) {
    throw new Error("PPTX drawing XML requires non-negative radiusEmu.");
  }

  if (input.geometry !== "rect" || input.radiusEmu === undefined || input.radiusEmu === 0) {
    writer.open("a:prstGeom", { prst: input.geometry }).empty("a:avLst").close("a:prstGeom");
    return;
  }

  writer.open("a:prstGeom", { prst: "roundRect" }).open("a:avLst");
  writer.empty("a:gd", {
    name: "adj",
    fmla: `val ${roundedRectAdjustment(input.frame, input.radiusEmu)}`,
  });
  writer.close("a:avLst").close("a:prstGeom");
}

function roundedRectAdjustment(frame: FrameIR, radiusEmu: number): number {
  const shortSide = Math.min(
    positiveNumber(frame.widthEmu, "frame.widthEmu"),
    positiveNumber(frame.heightEmu, "frame.heightEmu"),
  );
  return Math.max(
    0,
    Math.min(50000, Math.round((finiteNumber(radiusEmu, "radiusEmu") / shortSide) * 100000)),
  );
}

function finiteNumber(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PPTX drawing XML requires finite ${path}.`);
  }

  return value;
}

function positiveNumber(value: number | undefined, path: string): number {
  const number = finiteNumber(value, path);
  if (number <= 0) {
    throw new Error(`PPTX drawing XML requires positive ${path}.`);
  }

  return number;
}

function gradientStops(
  value: readonly LinearGradientStopIR[] | undefined,
): readonly LinearGradientStopIR[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("PPTX drawing XML requires fill.stops.");
  }

  return value;
}

function gradientStopPosition(value: number | undefined, index: number): number {
  const position = finiteNumber(value, `fill.stops.${index}.position`);
  if (position < 0 || position > 1) {
    throw new Error(`PPTX drawing XML requires fill.stops.${index}.position between 0 and 1.`);
  }

  return position;
}

function isStrokeDashType(value: string): boolean {
  return (
    value === "dash" ||
    value === "dashDot" ||
    value === "lgDash" ||
    value === "lgDashDot" ||
    value === "lgDashDotDot" ||
    value === "solid" ||
    value === "sysDash" ||
    value === "sysDashDot" ||
    value === "sysDashDotDot" ||
    value === "sysDot"
  );
}

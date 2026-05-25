import PptxGenJSModule from "pptxgenjs";
import {
  expandBackgroundImageLayer,
  isBackgroundImageLayer,
  patchPresentationXml,
} from "./pptxgenjs-xml-patches";
import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type {
  PptxElement,
  PptxGroupElement,
  PptxPackageModel,
  PptxPictureElement,
  PptxShapeElement,
  PptxTextElement,
} from "../projection/pptx";
import { EMU_PER_INCH } from "../types";

type PptxSlide = {
  addImage(options: PptxImageOptions): void;
  addShape(shapeName: string, options?: PptxShapeOptions): void;
  addText(text: string | PptxTextRun[], options?: PptxTextOptions): void;
  background?: PptxFillOptions;
};

type PptxPresentation = {
  defineLayout(layout: { name: string; width: number; height: number }): void;
  layout: string;
  author: string;
  title: string;
  subject: string;
  addSlide(): PptxSlide;
  write(props: { outputType: "uint8array" }): Promise<string | ArrayBuffer | Blob | Uint8Array>;
};

type PptxFillOptions = {
  color: string;
  transparency?: number;
};

type PptxLineOptions = {
  color: string;
  width: number;
  dashType?: string;
  transparency?: number;
};

type PptxShadowOptions = {
  type: "outer" | "inner";
  color: string;
  opacity?: number;
  blur?: number;
  offset?: number;
  angle?: number;
};

type PptxBaseRenderableOptions = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
};

type PptxImageOptions = PptxBaseRenderableOptions & {
  path?: string;
  data?: string;
  transparency?: number;
  rounding?: boolean;
  shadow?: PptxShadowOptions;
  hyperlink?: { url: string; tooltip?: string };
};

type PptxShapeOptions = PptxBaseRenderableOptions & {
  fill?: PptxFillOptions;
  line?: PptxLineOptions;
  shadow?: PptxShadowOptions;
  hyperlink?: { url: string; tooltip?: string };
  radius?: number;
};

type PptxTextOptions = PptxShapeOptions & {
  fontFace?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean | { style?: string; color?: string };
  strike?: boolean;
  align?: "left" | "center" | "right" | "justify";
  valign?: string;
  margin?: readonly [number, number, number, number];
  lineSpacing?: number;
  lineSpacingMultiple?: number;
  paraSpaceBefore?: number;
  paraSpaceAfter?: number;
  tabStops?: { position: number; alignment?: string }[];
  charSpacing?: number;
  bullet?: boolean | object;
  rtlMode?: boolean;
  vert?: "horz" | "vert" | "vert270";
  superscript?: boolean;
  subscript?: boolean;
  fit?: string;
  wrap?: boolean;
  shape?: string;
  transparency?: number;
  breakLine?: boolean;
};

type PptxTextRun = {
  text: string;
  options?: {
    fontFace?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean | { style?: string; color?: string };
    strike?: boolean;
    charSpacing?: number;
    breakLine?: boolean;
    superscript?: boolean;
    subscript?: boolean;
  };
};

export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const TRANSPARENT_FILL: PptxFillOptions = { color: "FFFFFF", transparency: 100 };
const TRANSPARENT_LINE: PptxLineOptions = { color: "FFFFFF", transparency: 100, width: 0 };

type PptxGenJSConstructor = { new (): PptxPresentation };

function resolvePptxGenJSConstructor(moduleValue: unknown): PptxGenJSConstructor {
  if (typeof moduleValue === "function") {
    return moduleValue as PptxGenJSConstructor;
  }

  if (typeof moduleValue === "object" && moduleValue !== null && "default" in moduleValue) {
    const defaultExport = moduleValue.default;
    if (typeof defaultExport === "function") {
      return defaultExport as PptxGenJSConstructor;
    }
  }

  throw new Error("Unable to resolve PptxGenJS constructor.");
}

const PptxGenJS = resolvePptxGenJSConstructor(PptxGenJSModule);

function normalizeBuffer(data: string | ArrayBuffer | Blob | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  throw new Error("Unsupported PptxGenJS output type received.");
}

function emuToInches(value: number): number {
  return value / EMU_PER_INCH;
}

function pointsToEmu(value: number): number {
  return (value / 72) * EMU_PER_INCH;
}

function combineTransparency(transparency: number | undefined, opacity: number | undefined) {
  if (transparency === undefined && opacity === undefined) {
    return undefined;
  }

  const baseVisibleAlpha = 1 - (transparency ?? 0) / 100;
  const nodeOpacity = opacity ?? 1;
  const visibleAlpha = Math.max(0, Math.min(1, baseVisibleAlpha * nodeOpacity));
  return Math.round((1 - visibleAlpha) * 100);
}

function combineOpacities(parentOpacity: number | undefined, nodeOpacity: number | undefined) {
  return (parentOpacity ?? 1) * (nodeOpacity ?? 1);
}

function mapShapeName(shape: PptxShapeElement["shape"], radiusEmu?: number) {
  if (shape === "rect") {
    return radiusEmu && radiusEmu > 0 ? "roundRect" : "rect";
  }

  if (shape === "ellipse") {
    return "ellipse";
  }

  return "line";
}

function toPptxFill(fill: PptxGroupElement["fill"], opacity?: number): PptxFillOptions | undefined {
  if (!fill) {
    return undefined;
  }

  if (fill.kind !== "solid") {
    return TRANSPARENT_FILL;
  }

  return {
    color: fill.color,
    transparency: combineTransparency(fill.transparency, opacity),
  };
}

function toPptxLine(
  stroke: PptxGroupElement["stroke"],
  opacity?: number,
): PptxLineOptions | undefined {
  if (!stroke) {
    return undefined;
  }

  return {
    color: stroke.color,
    width: stroke.widthPt,
    dashType: stroke.dashType ?? (stroke.style === "dash" ? "dash" : "solid"),
    transparency: combineTransparency(stroke.transparency, opacity),
  };
}

function toPptxShadow(
  shadow: PptxGroupElement["shadow"],
  opacity?: number,
): PptxShadowOptions | undefined {
  if (!shadow) {
    return undefined;
  }

  return {
    type: shadow.type,
    color: shadow.color,
    opacity: shadow.opacity === undefined ? opacity : shadow.opacity * (opacity ?? 1),
    blur: shadow.blurPt,
    offset: shadow.offsetPt,
    angle: shadow.angle,
  };
}

function toPptxUnderline(
  style: PptxTextElement["style"],
): PptxTextOptions["underline"] | undefined {
  if (!style.underline && !style.underlineStyle && !style.underlineColor) {
    return undefined;
  }

  if (!style.underlineStyle && !style.underlineColor) {
    return style.underline;
  }

  return {
    ...(style.underlineStyle ? { style: style.underlineStyle } : {}),
    ...(style.underlineColor ? { color: style.underlineColor } : {}),
  };
}

function toPptxBullet(list: PptxTextElement["style"]["list"]): PptxTextOptions["bullet"] {
  if (!list) {
    return undefined;
  }

  if (list.type === "none") {
    return false;
  }

  if (list.type === "bullet") {
    if (!list.characterCode && list.indentPt === undefined) {
      return true;
    }

    return {
      ...(list.characterCode ? { characterCode: list.characterCode } : {}),
      ...(list.indentPt !== undefined ? { indent: list.indentPt } : {}),
    };
  }

  return {
    type: "number",
    ...(list.style ? { style: list.style } : {}),
    ...(list.startAt !== undefined ? { numberStartAt: list.startAt } : {}),
    ...(list.indentPt !== undefined ? { indent: list.indentPt } : {}),
  };
}

function toPptxTextRunOptions(style: PptxTextElement["style"] | undefined): PptxTextRun["options"] {
  if (!style) {
    return undefined;
  }

  const options: PptxTextRun["options"] = {
    fontFace: style.fontFamily,
    fontSize: style.fontSizePt,
    color: style.color,
    bold:
      style.fontWeight === "bold" ||
      (typeof style.fontWeight === "number" && style.fontWeight >= 600),
    italic: style.italic,
    underline: toPptxUnderline(style),
    strike: style.strike,
    charSpacing: style.charSpacing,
    superscript: style.superscript,
    subscript: style.subscript,
    breakLine: false,
  };

  return Object.values(options).every((value) => value === undefined || value === false)
    ? undefined
    : options;
}

function emitOutlineShape(
  slide: PptxSlide,
  shapeName: string,
  node: PptxGroupElement | PptxShapeElement | PptxTextElement,
  effectiveOpacity?: number,
) {
  if (!node.outline) {
    return;
  }

  const insetEmu = pointsToEmu(node.outline.widthPt) / 2;
  slide.addShape(shapeName, {
    x: emuToInches(node.frame.xEmu - insetEmu),
    y: emuToInches(node.frame.yEmu - insetEmu),
    w: emuToInches(node.frame.widthEmu + insetEmu * 2),
    h: emuToInches(node.frame.heightEmu + insetEmu * 2),
    fill: TRANSPARENT_FILL,
    line: toPptxLine(node.outline, effectiveOpacity),
    radius: node.radiusEmu ? emuToInches(node.radiusEmu + insetEmu) : undefined,
    rotate: node.rotation,
    flipH: node.flipH,
    flipV: node.flipV,
  });
}

function emitEdgeStrokes(
  slide: PptxSlide,
  node: PptxGroupElement | PptxShapeElement | PptxTextElement,
  effectiveOpacity?: number,
) {
  if (!node.edgeStrokes) {
    return;
  }

  const emitLine = (
    stroke: PptxGroupElement["stroke"] | undefined,
    xEmu: number,
    yEmu: number,
    widthEmu: number,
    heightEmu: number,
  ) => {
    if (!stroke) {
      return;
    }

    slide.addShape("line", {
      x: emuToInches(xEmu),
      y: emuToInches(yEmu),
      w: emuToInches(widthEmu),
      h: emuToInches(heightEmu),
      line: toPptxLine(stroke, effectiveOpacity),
      rotate: node.rotation,
      flipH: node.flipH,
      flipV: node.flipV,
    });
  };

  emitLine(node.edgeStrokes.top, node.frame.xEmu, node.frame.yEmu, node.frame.widthEmu, 0);
  emitLine(
    node.edgeStrokes.right,
    node.frame.xEmu + node.frame.widthEmu,
    node.frame.yEmu,
    0,
    node.frame.heightEmu,
  );
  emitLine(
    node.edgeStrokes.bottom,
    node.frame.xEmu,
    node.frame.yEmu + node.frame.heightEmu,
    node.frame.widthEmu,
    0,
  );
  emitLine(node.edgeStrokes.left, node.frame.xEmu, node.frame.yEmu, 0, node.frame.heightEmu);
}

function emitBackgroundLayers(
  slide: PptxSlide,
  node: PptxGroupElement | PptxShapeElement | PptxTextElement,
  shapeName: string,
  effectiveOpacity?: number,
) {
  if (!node.backgroundLayers || node.backgroundLayers.length === 0) {
    return;
  }

  for (const layer of node.backgroundLayers) {
    if (isBackgroundImageLayer(layer)) {
      for (const tile of expandBackgroundImageLayer(layer)) {
        slide.addImage({
          x: emuToInches(tile.frame.xEmu),
          y: emuToInches(tile.frame.yEmu),
          w: emuToInches(tile.frame.widthEmu),
          h: emuToInches(tile.frame.heightEmu),
          path: tile.source.kind === "path" ? tile.source.path : undefined,
          data: tile.source.kind === "data" ? tile.source.data : undefined,
          transparency: combineTransparency(layer.transparency, effectiveOpacity),
          rotate: node.rotation,
          flipH: node.flipH,
          flipV: node.flipV,
        });
      }
      continue;
    }

    const layerFrame = "frame" in layer && layer.frame ? layer.frame : node.frame;

    slide.addShape(shapeName, {
      x: emuToInches(layerFrame.xEmu),
      y: emuToInches(layerFrame.yEmu),
      w: emuToInches(layerFrame.widthEmu),
      h: emuToInches(layerFrame.heightEmu),
      fill: toPptxFill(layer, effectiveOpacity),
      line: TRANSPARENT_LINE,
      radius: node.radiusEmu ? emuToInches(node.radiusEmu) : undefined,
      rotate: node.rotation,
      flipH: node.flipH,
      flipV: node.flipV,
    });
  }
}

function emitText(slide: PptxSlide, node: PptxTextElement, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  const shapeName = node.radiusEmu && node.radiusEmu > 0 ? "roundRect" : "rect";
  emitOutlineShape(slide, shapeName, node, effectiveOpacity);
  emitEdgeStrokes(slide, node, effectiveOpacity);
  emitBackgroundLayers(slide, node, shapeName, effectiveOpacity);

  const textContent: string | PptxTextRun[] = node.content.runs
    ? node.content.runs.map((run) => {
        const options = toPptxTextRunOptions(run.style);
        return {
          text: run.text,
          ...(options ? { options } : {}),
        };
      })
    : node.content.text;

  slide.addText(textContent, {
    x: emuToInches(node.frame.xEmu),
    y: emuToInches(node.frame.yEmu),
    w: emuToInches(node.frame.widthEmu),
    h: emuToInches(node.frame.heightEmu),
    fontFace: node.style.fontFamily,
    fontSize: node.style.fontSizePt,
    color: node.style.color,
    bold:
      node.style.fontWeight === "bold" ||
      (typeof node.style.fontWeight === "number" && node.style.fontWeight >= 600),
    italic: node.style.italic,
    underline: toPptxUnderline(node.style),
    strike: node.style.strike,
    align: node.style.textAlign,
    valign: node.style.verticalAlign,
    margin: node.style.paddingPt,
    lineSpacing: node.style.lineSpacing,
    lineSpacingMultiple: node.style.lineSpacingMultiple,
    paraSpaceBefore: node.style.paragraphSpacingBefore,
    paraSpaceAfter: node.style.paragraphSpacingAfter,
    tabStops: node.style.tabStops?.map((tabStop) => ({
      position: tabStop.positionIn,
      ...(tabStop.alignment ? { alignment: tabStop.alignment } : {}),
    })),
    charSpacing: node.style.charSpacing,
    bullet: toPptxBullet(node.style.list),
    rtlMode: node.style.rtlMode,
    vert: node.style.textDirection,
    superscript: node.style.superscript,
    subscript: node.style.subscript,
    fit: node.style.fit,
    wrap: node.style.wrap,
    shape: shapeName,
    fill: toPptxFill(node.fill, effectiveOpacity),
    line: toPptxLine(node.stroke, effectiveOpacity),
    shadow: toPptxShadow(node.shadow, effectiveOpacity),
    transparency: combineTransparency(undefined, effectiveOpacity),
    hyperlink: node.hyperlink,
    rotate: node.rotation,
    flipH: node.flipH,
    flipV: node.flipV,
    breakLine: false,
  });
}

function emitImage(slide: PptxSlide, node: PptxPictureElement, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  slide.addImage({
    x: emuToInches(node.frame.xEmu),
    y: emuToInches(node.frame.yEmu),
    w: emuToInches(node.frame.widthEmu),
    h: emuToInches(node.frame.heightEmu),
    path: node.source.kind === "path" ? node.source.path : undefined,
    data: node.source.kind === "data" ? node.source.data : undefined,
    transparency: combineTransparency(node.transparency, effectiveOpacity),
    rounding: node.rounding,
    shadow: toPptxShadow(node.shadow, effectiveOpacity),
    hyperlink: node.hyperlink,
    rotate: node.rotation,
    flipH: node.flipH,
    flipV: node.flipV,
  });
}

function emitShape(slide: PptxSlide, node: PptxShapeElement, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  const shapeName = mapShapeName(node.shape, node.radiusEmu);
  emitOutlineShape(slide, shapeName, node, effectiveOpacity);
  emitEdgeStrokes(slide, node, effectiveOpacity);
  emitBackgroundLayers(slide, node, shapeName, effectiveOpacity);
  slide.addShape(shapeName, {
    x: emuToInches(node.frame.xEmu),
    y: emuToInches(node.frame.yEmu),
    w: emuToInches(node.frame.widthEmu),
    h: emuToInches(node.frame.heightEmu),
    fill: toPptxFill(node.fill, effectiveOpacity),
    line: toPptxLine(node.stroke, effectiveOpacity),
    shadow: toPptxShadow(node.shadow, effectiveOpacity),
    hyperlink: node.hyperlink,
    rotate: node.rotation,
    flipH: node.flipH,
    flipV: node.flipV,
  });
}

function emitGroup(slide: PptxSlide, node: PptxGroupElement, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  const shapeName = mapShapeName("rect", node.radiusEmu);
  emitOutlineShape(slide, shapeName, node, effectiveOpacity);
  emitEdgeStrokes(slide, node, effectiveOpacity);
  emitBackgroundLayers(slide, node, shapeName, effectiveOpacity);

  if (node.fill || node.stroke || node.shadow) {
    slide.addShape(shapeName, {
      x: emuToInches(node.frame.xEmu),
      y: emuToInches(node.frame.yEmu),
      w: emuToInches(node.frame.widthEmu),
      h: emuToInches(node.frame.heightEmu),
      fill: node.fill ? toPptxFill(node.fill, effectiveOpacity) : TRANSPARENT_FILL,
      line: node.stroke ? toPptxLine(node.stroke, effectiveOpacity) : TRANSPARENT_LINE,
      shadow: toPptxShadow(node.shadow, effectiveOpacity),
      rotate: node.rotation,
      flipH: node.flipH,
      flipV: node.flipV,
    });
  }

  for (const child of node.children) {
    emitElement(slide, child, effectiveOpacity);
  }
}

function emitElement(slide: PptxSlide, node: PptxElement, inheritedOpacity?: number) {
  if (node.visibility === "hidden") {
    return;
  }

  switch (node.kind) {
    case "group":
      emitGroup(slide, node, inheritedOpacity);
      return;
    case "image":
      emitImage(slide, node, inheritedOpacity);
      return;
    case "shape":
      emitShape(slide, node, inheritedOpacity);
      return;
    case "text":
      emitText(slide, node, inheritedOpacity);
      return;
  }
}

function emitSlideBackgroundLayers(
  slide: PptxSlide,
  projection: PptxPackageModel,
  backgroundLayers: PptxPackageModel["slides"][number]["payload"]["backgroundLayers"],
) {
  if (!backgroundLayers || backgroundLayers.length === 0) {
    return;
  }

  for (const layer of backgroundLayers) {
    if (isBackgroundImageLayer(layer)) {
      for (const tile of expandBackgroundImageLayer(layer)) {
        slide.addImage({
          x: emuToInches(tile.frame.xEmu),
          y: emuToInches(tile.frame.yEmu),
          w: emuToInches(tile.frame.widthEmu),
          h: emuToInches(tile.frame.heightEmu),
          path: tile.source.kind === "path" ? tile.source.path : undefined,
          data: tile.source.kind === "data" ? tile.source.data : undefined,
          transparency: layer.transparency,
        });
      }
      continue;
    }

    const layerFrame =
      "frame" in layer && layer.frame
        ? layer.frame
        : {
            xEmu: 0,
            yEmu: 0,
            widthEmu: projection.size.widthEmu,
            heightEmu: projection.size.heightEmu,
          };

    slide.addShape("rect", {
      x: emuToInches(layerFrame.xEmu),
      y: emuToInches(layerFrame.yEmu),
      w: emuToInches(layerFrame.widthEmu),
      h: emuToInches(layerFrame.heightEmu),
      fill: toPptxFill(layer),
      line: TRANSPARENT_LINE,
    });
  }
}

function adapterDiagnostics(): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_PPTXGENJS_TEMPORARY_ADAPTER",
      title: "pptxgenjs adapter is temporary",
      message:
        "The pptxgenjs adapter consumes the Pptx Package Model directly, but it cannot serialize every projected package-part detail yet.",
      labels: [{ path: "render.adapter", message: "Some package metadata is adapter-limited." }],
    }),
  ]);
}

export async function renderPptxPackageWithPptxGenjs(projection: PptxPackageModel): Promise<{
  readonly diagnostics: Diagnostics;
  readonly artifact: {
    readonly format: "pptx";
    readonly mediaType: string;
    readonly extension: "pptx";
    readonly bytes: Uint8Array;
  };
}> {
  const pptx = new PptxGenJS();
  const layoutName = "DECKJSX_CUSTOM";

  pptx.defineLayout({
    name: layoutName,
    width: projection.size.widthEmu / EMU_PER_INCH,
    height: projection.size.heightEmu / EMU_PER_INCH,
  });
  pptx.layout = layoutName;

  if (projection.meta?.author) {
    pptx.author = projection.meta.author;
  }
  if (projection.meta?.title) {
    pptx.title = projection.meta.title;
  }
  if (projection.meta?.subject) {
    pptx.subject = projection.meta.subject;
  }

  for (const slidePart of projection.slides) {
    const slide = pptx.addSlide();

    if (slidePart.payload.background) {
      slide.background = toPptxFill(slidePart.payload.background);
    }

    emitSlideBackgroundLayers(slide, projection, slidePart.payload.backgroundLayers);

    for (const element of slidePart.payload.elements) {
      emitElement(slide, element);
    }
  }

  const data = await pptx.write({ outputType: "uint8array" });
  const normalized = normalizeBuffer(data);
  const bytes = await patchPresentationXml(normalized, projection);

  return {
    diagnostics: adapterDiagnostics(),
    artifact: {
      format: "pptx",
      mediaType: PPTX_MIME_TYPE,
      extension: "pptx",
      bytes,
    },
  };
}

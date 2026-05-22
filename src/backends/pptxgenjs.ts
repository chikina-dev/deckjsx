import PptxGenJSModule from "pptxgenjs";
import type {
  BackendArtifact,
  CompileBackend,
  EdgeStrokeIR,
  FrameIR,
  GroupIR,
  HyperlinkIR,
  ImageIR,
  NodeIR,
  PresentationIR,
  ShadowIR,
  ShapeIR,
  TextIR,
} from "../ir/index";
import { EMU_PER_INCH } from "../types";
import {
  expandBackgroundImageLayer,
  isBackgroundImageLayer,
  patchPresentationXml,
} from "./pptxgenjs-xml-patches";

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
  type: ShadowIR["type"];
  color: string;
  opacity?: number;
  blur?: number;
  offset?: number;
  angle?: number;
};

type PptxHyperlinkOptions = HyperlinkIR;

type PptxBulletOptions =
  | boolean
  | {
      characterCode?: string;
      indent?: number;
    }
  | {
      type: "number";
      style?: string;
      numberStartAt?: number;
      indent?: number;
    };

type PptxUnderlineOptions =
  | boolean
  | {
      style?: NonNullable<TextIR["style"]["underlineStyle"]>;
      color?: string;
    };

type PptxTabStopOptions = {
  position: number;
  alignment?: NonNullable<NonNullable<TextIR["style"]["tabStops"]>[number]["alignment"]>;
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
  hyperlink?: PptxHyperlinkOptions;
};

type PptxShapeOptions = PptxBaseRenderableOptions & {
  fill?: PptxFillOptions;
  line?: PptxLineOptions;
  shadow?: PptxShadowOptions;
  hyperlink?: PptxHyperlinkOptions;
  radius?: number;
};

type PptxTextOptions = PptxShapeOptions & {
  fontFace?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: PptxUnderlineOptions;
  strike?: boolean;
  align?: TextIR["style"]["textAlign"];
  valign?: TextIR["style"]["verticalAlign"];
  margin?: TextIR["style"]["paddingPt"];
  lineSpacing?: number;
  lineSpacingMultiple?: number;
  paraSpaceBefore?: number;
  paraSpaceAfter?: number;
  tabStops?: PptxTabStopOptions[];
  charSpacing?: number;
  bullet?: PptxBulletOptions;
  rtlMode?: boolean;
  vert?: TextIR["style"]["textDirection"];
  superscript?: boolean;
  subscript?: boolean;
  fit?: TextIR["style"]["fit"];
  wrap?: boolean;
  shape?: string;
  transparency?: number;
  breakLine?: boolean;
};

type PptxTextRun = {
  text: string;
  options?: PptxTextRunOptions;
};

type PptxTextRunOptions = {
  fontFace?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: PptxUnderlineOptions;
  strike?: boolean;
  charSpacing?: number;
  breakLine?: boolean;
  superscript?: boolean;
  subscript?: boolean;
};

const TRANSPARENT_FILL: PptxFillOptions = { color: "FFFFFF", transparency: 100 };
const TRANSPARENT_LINE: PptxLineOptions = { color: "FFFFFF", transparency: 100, width: 0 };

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
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

function emuToInches(value: number): number {
  return value / EMU_PER_INCH;
}

function pointsToEmu(value: number): number {
  return (value / 72) * EMU_PER_INCH;
}

function combineTransparency(
  transparency: number | undefined,
  opacity: number | undefined,
): number | undefined {
  if (transparency === undefined && opacity === undefined) {
    return undefined;
  }

  const baseVisibleAlpha = 1 - (transparency ?? 0) / 100;
  const nodeOpacity = opacity ?? 1;
  const visibleAlpha = Math.max(0, Math.min(1, baseVisibleAlpha * nodeOpacity));

  return Math.round((1 - visibleAlpha) * 100);
}

function combineOpacities(parentOpacity: number | undefined, nodeOpacity: number | undefined) {
  const parent = parentOpacity ?? 1;
  const node = nodeOpacity ?? 1;
  return parent * node;
}

function normalizeBuffer(data: string | ArrayBuffer | Blob | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  throw new Error("Unsupported PptxGenJS output type received.");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled PptxGenJS backend value: ${String(value)}`);
}

function mapShapeName(shape: ShapeIR["shape"], radiusEmu?: number) {
  if (shape === "rect") {
    return radiusEmu && radiusEmu > 0 ? "roundRect" : "rect";
  }

  if (shape === "ellipse") {
    return "ellipse";
  }

  return "line";
}

function toPptxFill(fill: GroupIR["fill"], opacity?: number): PptxFillOptions | undefined {
  if (!fill) {
    return undefined;
  }

  switch (fill.kind) {
    case "solid":
      return {
        color: fill.color,
        transparency: combineTransparency(fill.transparency, opacity),
      };
    case "linear-gradient":
    case "radial-gradient":
      return TRANSPARENT_FILL;
    default:
      return assertNever(fill);
  }
}

function toPptxLine(stroke: GroupIR["stroke"], opacity?: number): PptxLineOptions | undefined {
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
  shadow: ShadowIR | undefined,
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

function toPptxBullet(list: TextIR["style"]["list"]): PptxBulletOptions | undefined {
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

function toPptxUnderline(style: TextIR["style"]): PptxUnderlineOptions | undefined {
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

function toPptxTabStops(tabStops: TextIR["style"]["tabStops"]): PptxTabStopOptions[] | undefined {
  if (!tabStops || tabStops.length === 0) {
    return undefined;
  }

  return tabStops.map((tabStop) => ({
    position: tabStop.positionIn,
    ...(tabStop.alignment ? { alignment: tabStop.alignment } : {}),
  }));
}

function toPptxTextRunOptions(style: TextIR["style"] | undefined): PptxTextRunOptions | undefined {
  if (!style) {
    return undefined;
  }

  const options: PptxTextRunOptions = {
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

  if (Object.values(options).every((value) => value === undefined || value === false)) {
    return undefined;
  }

  return options;
}

function emitOutlineShape(
  slide: PptxSlide,
  shapeName: string,
  frame: FrameIR,
  outline: GroupIR["outline"],
  radiusEmu?: number,
  effectiveOpacity?: number,
  rotation?: number,
  flipH?: boolean,
  flipV?: boolean,
) {
  if (!outline) {
    return;
  }

  const insetEmu = pointsToEmu(outline.widthPt) / 2;

  slide.addShape(shapeName, {
    x: emuToInches(frame.xEmu - insetEmu),
    y: emuToInches(frame.yEmu - insetEmu),
    w: emuToInches(frame.widthEmu + insetEmu * 2),
    h: emuToInches(frame.heightEmu + insetEmu * 2),
    fill: TRANSPARENT_FILL,
    line: toPptxLine(outline, effectiveOpacity),
    radius: radiusEmu ? emuToInches(radiusEmu + insetEmu) : undefined,
    rotate: rotation,
    flipH,
    flipV,
  });
}

function emitEdgeStrokes(
  slide: PptxSlide,
  frame: FrameIR,
  edgeStrokes: EdgeStrokeIR | undefined,
  effectiveOpacity?: number,
  rotation?: number,
  flipH?: boolean,
  flipV?: boolean,
) {
  if (!edgeStrokes) {
    return;
  }

  const emitLine = (
    stroke: GroupIR["stroke"] | undefined,
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
      rotate: rotation,
      flipH,
      flipV,
    });
  };

  emitLine(edgeStrokes.top, frame.xEmu, frame.yEmu, frame.widthEmu, 0);
  emitLine(edgeStrokes.right, frame.xEmu + frame.widthEmu, frame.yEmu, 0, frame.heightEmu);
  emitLine(edgeStrokes.bottom, frame.xEmu, frame.yEmu + frame.heightEmu, frame.widthEmu, 0);
  emitLine(edgeStrokes.left, frame.xEmu, frame.yEmu, 0, frame.heightEmu);
}

function emitBackgroundLayers(
  slide: PptxSlide,
  frame: FrameIR,
  backgroundLayers: GroupIR["backgroundLayers"],
  shapeName: string,
  radiusEmu?: number,
  effectiveOpacity?: number,
  rotation?: number,
  flipH?: boolean,
  flipV?: boolean,
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
          transparency: combineTransparency(layer.transparency, effectiveOpacity),
          rotate: rotation,
          flipH,
          flipV,
        });
      }
      continue;
    }

    const layerFrame = "frame" in layer && layer.frame ? layer.frame : frame;

    slide.addShape(shapeName, {
      x: emuToInches(layerFrame.xEmu),
      y: emuToInches(layerFrame.yEmu),
      w: emuToInches(layerFrame.widthEmu),
      h: emuToInches(layerFrame.heightEmu),
      fill: toPptxFill(layer, effectiveOpacity),
      line: TRANSPARENT_LINE,
      radius: radiusEmu ? emuToInches(radiusEmu) : undefined,
      rotate: rotation,
      flipH,
      flipV,
    });
  }
}

function emitText(slide: PptxSlide, node: TextIR, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  emitOutlineShape(
    slide,
    node.radiusEmu && node.radiusEmu > 0 ? "roundRect" : "rect",
    node.frame,
    node.outline,
    node.radiusEmu,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );
  emitEdgeStrokes(
    slide,
    node.frame,
    node.edgeStrokes,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );
  emitBackgroundLayers(
    slide,
    node.frame,
    node.backgroundLayers,
    node.radiusEmu && node.radiusEmu > 0 ? "roundRect" : "rect",
    node.radiusEmu,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );

  const textContent: string | PptxTextRun[] = node.content.runs
    ? node.content.runs.map((run) => ({
        text: run.text,
        ...(toPptxTextRunOptions(run.style) ? { options: toPptxTextRunOptions(run.style) } : {}),
      }))
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
    tabStops: toPptxTabStops(node.style.tabStops),
    charSpacing: node.style.charSpacing,
    bullet: toPptxBullet(node.style.list),
    rtlMode: node.style.rtlMode,
    vert: node.style.textDirection,
    superscript: node.style.superscript,
    subscript: node.style.subscript,
    fit: node.style.fit,
    wrap: node.style.wrap,
    shape: node.radiusEmu && node.radiusEmu > 0 ? "roundRect" : "rect",
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

function emitImage(slide: PptxSlide, node: ImageIR, inheritedOpacity?: number) {
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

function emitShape(slide: PptxSlide, node: ShapeIR, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  emitOutlineShape(
    slide,
    mapShapeName(node.shape, node.radiusEmu),
    node.frame,
    node.outline,
    node.radiusEmu,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );
  emitEdgeStrokes(
    slide,
    node.frame,
    node.edgeStrokes,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );
  emitBackgroundLayers(
    slide,
    node.frame,
    node.backgroundLayers,
    mapShapeName(node.shape, node.radiusEmu),
    node.radiusEmu,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );

  slide.addShape(mapShapeName(node.shape, node.radiusEmu), {
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

function emitGroup(slide: PptxSlide, node: GroupIR, inheritedOpacity?: number) {
  const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);
  emitOutlineShape(
    slide,
    mapShapeName("rect", node.radiusEmu),
    node.frame,
    node.outline,
    node.radiusEmu,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );
  emitEdgeStrokes(
    slide,
    node.frame,
    node.edgeStrokes,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );
  emitBackgroundLayers(
    slide,
    node.frame,
    node.backgroundLayers,
    mapShapeName("rect", node.radiusEmu),
    node.radiusEmu,
    effectiveOpacity,
    node.rotation,
    node.flipH,
    node.flipV,
  );

  if (node.fill || node.stroke || node.shadow) {
    slide.addShape(mapShapeName("rect", node.radiusEmu), {
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
    emitNode(slide, child, effectiveOpacity);
  }
}

function emitNode(slide: PptxSlide, node: NodeIR, inheritedOpacity?: number) {
  if (node.visibility === "hidden") {
    return;
  }

  switch (node.kind) {
    case "group":
      emitGroup(slide, node, inheritedOpacity);
      return;
    case "text":
      emitText(slide, node, inheritedOpacity);
      return;
    case "image":
      emitImage(slide, node, inheritedOpacity);
      return;
    case "shape":
      emitShape(slide, node, inheritedOpacity);
      return;
    default:
      assertNever(node);
  }
}

export function pptxgenjsBackend(): CompileBackend {
  return {
    name: "pptxgenjs",
    async emit(ir: PresentationIR): Promise<BackendArtifact> {
      const pptx = new PptxGenJS();
      const layoutName = "DECKJSX_CUSTOM";

      pptx.defineLayout({
        name: layoutName,
        width: ir.size.widthEmu / EMU_PER_INCH,
        height: ir.size.heightEmu / EMU_PER_INCH,
      });
      pptx.layout = layoutName;

      if (ir.meta?.author) {
        pptx.author = ir.meta.author;
      }
      if (ir.meta?.title) {
        pptx.title = ir.meta.title;
      }
      if (ir.meta?.subject) {
        pptx.subject = ir.meta.subject;
      }

      for (const slideIR of ir.slides) {
        const slide = pptx.addSlide();

        if (slideIR.background) {
          slide.background = toPptxFill(slideIR.background);
        }

        emitBackgroundLayers(
          slide,
          {
            xEmu: 0,
            yEmu: 0,
            widthEmu: ir.size.widthEmu,
            heightEmu: ir.size.heightEmu,
          },
          slideIR.backgroundLayers,
          "rect",
        );

        for (const node of slideIR.nodes) {
          emitNode(slide, node);
        }
      }

      const data = await pptx.write({
        outputType: "uint8array",
      });
      const normalized = normalizeBuffer(data);

      return {
        kind: "buffer",
        mimeType: PPTX_MIME_TYPE,
        data: await patchPresentationXml(normalized, ir),
        extension: "pptx",
      };
    },
  };
}

export { PPTX_MIME_TYPE };

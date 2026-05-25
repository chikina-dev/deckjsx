import type { DeckOptions } from "../authoring/index";
import {
  normalizeImageProps,
  normalizeShapeProps,
  normalizeSlideProps,
  normalizeTextProps,
  normalizeViewProps,
} from "../compiler/normalization";
import { resolveProjectedLayoutFromGraph } from "../layout/graph";
import type { Diagnostics } from "../diagnostics";
import type { Frame } from "../layout/frame";
import { frameFromProps } from "../layout/absolute";
import { parseSpacing, parseSpacingInPoints } from "../layout/spacing";
import type {
  AssetEntity,
  Brand,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticContainerNode,
  SemanticImageNode,
  SemanticNode,
  SemanticShapeNode,
  SemanticSlideNode,
  SemanticTextNode,
  SourceOrigin,
  StyleEntityId,
} from "../graph";
import type {
  BackgroundLayerIR,
  EdgeStrokeIR,
  FillIR,
  FrameIR,
  HyperlinkIR,
  ImageCropIR,
  ImageSourceIR,
  ProjectedLayoutNode,
  ProjectedLayoutOrigin,
  ObjectPositionIR,
  ShadowIR,
  StrokeIR,
  TextRunIR,
  TextStyleIR,
  ProjectedLayoutSlide,
} from "../layout/projected";
import type { ProjectionFormat } from "../pipeline";
import { buildPptxManifest } from "./pptx-manifest";
import type { PptxContentTypesPayload, PptxRelationshipsPayload } from "./pptx-manifest";
import { resolveBackgroundBoxFrames, resolveBackgroundLayers } from "../style/background";
import { normalizeColor } from "../style/color";
import { parseLength, parsePointValue, type LengthResolutionContext } from "../style/length";
import { parseShadowShorthand } from "../style/shadow";
import {
  parseStrokeLineCap,
  parseStrokeLineJoin,
  resolveNodeStrokes,
  toStroke,
} from "../style/stroke";
import type { ResolvedStyle, ResolvedStyleMap } from "../style/resolve";
import {
  getTextLengthContext,
  resolveLineHeight,
  resolveListStyle,
  resolveTabStops,
  resolveTextDirection,
  resolveUnderlineStyle,
} from "../style/typography";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../types";

export type PackagePartId = Brand<string, "PackagePartId">;
export type PptxElementId = Brand<string, "PptxElementId">;
export type PptxSerializedIdentity = Brand<string, "PptxSerializedIdentity">;

export type PptxPackagePartCategory = "authored-content" | "manifest" | "support";

export type PptxPackagePartKind =
  | "content-types"
  | "document-properties"
  | "media"
  | "notes-master"
  | "notes-slide"
  | "presentation"
  | "presentation-properties"
  | "relationships"
  | "slide"
  | "slide-layout"
  | "slide-master"
  | "theme"
  | "view-properties";

export type PptxElementKind = "group" | "image" | "shape" | "text";

export type PptxElementOrigin = {
  readonly graphNodeIds?: readonly GraphNodeId[];
  readonly styleEntityIds?: readonly StyleEntityId[];
  readonly assetEntityIds?: readonly AssetEntity["id"][];
  readonly source?: SourceOrigin;
};

export type PptxSerializedIdentities = {
  readonly relationshipId?: PptxSerializedIdentity;
  readonly shapeObjectId?: PptxSerializedIdentity;
};

export type PptxMeasurement = {
  readonly frame?: FrameIR;
  readonly overflow?: "clip" | "fit" | "visible";
};

type PptxBaseElement = {
  readonly id: PptxElementId;
  readonly kind: PptxElementKind;
  readonly packagePartId: PackagePartId;
  readonly serialized: PptxSerializedIdentities;
  readonly origin: PptxElementOrigin;
  readonly frame: FrameIR;
  readonly opacity?: number;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly visibility?: string;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly measurement?: PptxMeasurement;
};

export type PptxGroupElement = PptxBaseElement & {
  readonly kind: "group";
  readonly children: readonly PptxElement[];
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly BackgroundLayerIR[];
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly shadow?: ShadowIR;
  readonly radiusEmu?: number;
};

export type PptxTextElement = PptxBaseElement & {
  readonly kind: "text";
  readonly content: {
    readonly text: string;
    readonly runs?: readonly TextRunIR[];
  };
  readonly style: TextStyleIR;
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly BackgroundLayerIR[];
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly shadow?: ShadowIR;
  readonly hyperlink?: HyperlinkIR;
  readonly radiusEmu?: number;
};

export type PptxPictureElement = PptxBaseElement & {
  readonly kind: "image";
  readonly mediaPartId?: PackagePartId;
  readonly sourceFrame: FrameIR;
  readonly source: ImageSourceIR;
  readonly fit: "contain" | "cover" | "stretch";
  readonly objectPosition?: ObjectPositionIR;
  readonly crop?: ImageCropIR;
  readonly transparency?: number;
  readonly rounding?: boolean;
  readonly shadow?: ShadowIR;
  readonly hyperlink?: HyperlinkIR;
};

export type PptxShapeElement = PptxBaseElement & {
  readonly kind: "shape";
  readonly shape: "rect" | "ellipse" | "line";
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly BackgroundLayerIR[];
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly shadow?: ShadowIR;
  readonly hyperlink?: HyperlinkIR;
  readonly radiusEmu?: number;
};

export type PptxElement =
  | PptxGroupElement
  | PptxPictureElement
  | PptxShapeElement
  | PptxTextElement;

export type PptxRelationship = {
  readonly id: PptxSerializedIdentity;
  readonly targetPartId: PackagePartId;
  readonly targetPath: string;
  readonly type: string;
};

export type PptxPackagePart = {
  readonly id: PackagePartId;
  readonly category: PptxPackagePartCategory;
  readonly kind: PptxPackagePartKind;
  readonly path: string;
  readonly relationships?: readonly PptxRelationship[];
  readonly origin?: {
    readonly graphNodeIds?: readonly GraphNodeId[];
    readonly source?: SourceOrigin;
  };
  readonly payload?: unknown;
};

export type PptxSupportPartPayload =
  | {
      readonly kind: "presentation";
      readonly size: PptxPackageModel["size"];
      readonly slidePartIds: readonly PackagePartId[];
    }
  | {
      readonly kind: "document-properties";
      readonly meta?: DeckOptions["meta"];
    }
  | {
      readonly kind:
        | "notes-master"
        | "notes-slide"
        | "presentation-properties"
        | "slide-layout"
        | "slide-master"
        | "theme"
        | "view-properties";
      readonly status: "placeholder";
      readonly editable: true;
    };

export type PptxContentTypesPart = PptxPackagePart & {
  readonly kind: "content-types";
  readonly payload?: PptxContentTypesPayload;
};

export type PptxRelationshipsPart = PptxPackagePart & {
  readonly kind: "relationships";
  readonly payload?: PptxRelationshipsPayload;
};

export type PptxSlidePart = PptxPackagePart & {
  readonly category: "authored-content";
  readonly kind: "slide";
  readonly payload: {
    readonly slideId: string;
    readonly name?: string;
    readonly background?: FillIR;
    readonly backgroundLayers?: readonly BackgroundLayerIR[];
    readonly elements: readonly PptxElement[];
  };
};

export type ProjectInspectionElementSummary = {
  readonly id: PptxElementId;
  readonly kind: PptxElementKind;
  readonly packagePartId: PackagePartId;
  readonly frame?: FrameIR;
  readonly textPreview?: string;
  readonly origin: PptxElementOrigin;
  readonly resolvedValues?: ProjectInspectionResolvedValues;
};

export type ProjectInspectionResolvedValues = {
  readonly frame?: FrameIR;
  readonly fill?: FillIR;
  readonly stroke?: StrokeIR;
  readonly textStyle?: TextStyleIR;
  readonly imageSource?: ImageSourceIR;
};

export type ProjectInspectionPartSummary = {
  readonly id: PackagePartId;
  readonly category: PptxPackagePartCategory;
  readonly kind: PptxPackagePartKind;
  readonly path: string;
  readonly relationshipCount?: number;
  readonly contentTypeCount?: number;
};

export type ProjectInspectionSummary = {
  readonly format: ProjectionFormat;
  readonly parts: readonly ProjectInspectionPartSummary[];
  readonly media: readonly ProjectInspectionMediaSummary[];
  readonly slides: readonly {
    readonly partId: PackagePartId;
    readonly slideId: string;
    readonly name?: string;
    readonly elements: readonly ProjectInspectionElementSummary[];
  }[];
  readonly pptx: {
    readonly packageParts: readonly ProjectInspectionPartSummary[];
    readonly relationshipCount: number;
  };
  readonly diagnostics: readonly ProjectInspectionDiagnosticSummary[];
  readonly adapterLimitations: readonly ProjectInspectionAdapterLimitation[];
};

export type ProjectInspectionDiagnosticSummary = {
  readonly severity: Diagnostics["items"][number]["severity"];
  readonly code: string;
  readonly title: string;
};

export type ProjectInspectionAdapterLimitation = {
  readonly adapter: string;
  readonly code: string;
  readonly message: string;
};

export type ProjectInspectionMediaSummary = {
  readonly partId?: PackagePartId;
  readonly elementId?: PptxElementId;
  readonly sourceKind: ImageSourceIR["kind"];
  readonly origin: PptxElementOrigin;
};

export type PptxPackageModel = {
  readonly version: "0.6";
  readonly format: "pptx";
  readonly size: {
    readonly widthEmu: number;
    readonly heightEmu: number;
  };
  readonly meta?: DeckOptions["meta"];
  readonly parts: readonly PptxPackagePart[];
  readonly slides: readonly PptxSlidePart[];
};

function packagePartId(value: string): PackagePartId {
  return value as PackagePartId;
}

function pptxElementId(value: string): PptxElementId {
  return value as PptxElementId;
}

function serializedId(value: string): PptxSerializedIdentity {
  return value as PptxSerializedIdentity;
}

function identityToken(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function packageIdentity(kind: string, identity: string): PackagePartId {
  return packagePartId(`pptx:${kind}:${identityToken(identity)}`);
}

function slidePartIdFor(slide: SemanticSlideNode): PackagePartId {
  return packageIdentity("slide", slide.id);
}

function mediaPartIdForElement(elementId: PptxElementId): PackagePartId {
  return packageIdentity("media", elementId);
}

function mediaRelationshipId(index: number): PptxSerializedIdentity {
  return serializedId(`rId${index}`);
}

function elementIdentity(input: {
  packagePartId: PackagePartId;
  graphNodeId?: GraphNodeId;
  indexPath: readonly number[];
}): PptxElementId {
  const identity = input.graphNodeId
    ? `graph:${input.graphNodeId}`
    : `path:${input.indexPath.join(".")}`;
  return pptxElementId(`${input.packagePartId}:element:${identityToken(identity)}`);
}

function sizeFromOptions(options: DeckOptions): PptxPackageModel["size"] {
  return options.layout.unit === "in"
    ? {
        widthEmu: options.layout.width * EMU_PER_INCH,
        heightEmu: options.layout.height * EMU_PER_INCH,
      }
    : {
        widthEmu: (options.layout.width / POINTS_PER_INCH) * EMU_PER_INCH,
        heightEmu: (options.layout.height / POINTS_PER_INCH) * EMU_PER_INCH,
      };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function styleFor(node: SemanticNode, resolvedStyles: ResolvedStyleMap): Record<string, unknown> {
  return asRecord(resolvedStyles.get(node.id)?.style);
}

function resolvedStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): ResolvedStyle | undefined {
  return resolvedStyles.get(node.id);
}

function hasNonDefaultProperty(resolved: ResolvedStyle | undefined, key: string): boolean {
  const source = resolved?.properties[key]?.source;
  return source !== undefined && source.layer !== "default";
}

function backgroundValueFor(
  resolved: ResolvedStyle | undefined,
  props: {
    readonly background?: string;
    readonly backgroundColor?: string;
    readonly backgroundImage?: string;
  },
): string | undefined {
  if (hasNonDefaultProperty(resolved, "backgroundColor")) {
    return props.backgroundColor;
  }
  if (hasNonDefaultProperty(resolved, "backgroundImage")) {
    return props.backgroundImage;
  }
  if (hasNonDefaultProperty(resolved, "background")) {
    return props.background;
  }

  return props.backgroundColor ?? props.backgroundImage ?? props.background;
}

function shapeFillValueFor(
  resolved: ResolvedStyle | undefined,
  props: {
    readonly background?: string;
    readonly backgroundColor?: string;
    readonly backgroundImage?: string;
    readonly fill?: string;
  },
): string | undefined {
  if (hasNonDefaultProperty(resolved, "fill")) {
    return props.fill;
  }
  if (hasNonDefaultProperty(resolved, "backgroundColor")) {
    return props.backgroundColor;
  }
  if (hasNonDefaultProperty(resolved, "backgroundImage")) {
    return props.backgroundImage;
  }
  if (hasNonDefaultProperty(resolved, "background")) {
    return props.background;
  }

  return props.fill ?? props.backgroundColor ?? props.backgroundImage ?? props.background;
}

function frameToFrameIR(frame: Frame): FrameIR {
  return {
    xEmu: frame.xEmu,
    yEmu: frame.yEmu,
    widthEmu: frame.widthEmu,
    heightEmu: frame.heightEmu,
  };
}

function originFor(node: SemanticNode): PptxElementOrigin {
  return {
    graphNodeIds: [node.id],
    ...(node.styleRef ? { styleEntityIds: [node.styleRef] } : {}),
    ...(node.kind === "image" && node.assetRef ? { assetEntityIds: [node.assetRef] } : {}),
    ...(node.origin.source ? { source: node.origin.source } : {}),
  };
}

function shapeObjectId(indexPath: readonly number[]): PptxSerializedIdentity {
  return serializedId(indexPath.map((index) => index + 1).join("."));
}

function assetSource(asset: AssetEntity | undefined): ImageSourceIR {
  if (!asset) {
    return { kind: "data", data: "" };
  }

  return asset.source.kind === "path"
    ? { kind: "path", path: asset.source.path }
    : { kind: "data", data: asset.source.data };
}

function parseCropValue(value: number | `${number}%` | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseFloat(value) / 100;
}

function parseImageCrop(crop: unknown): ImageCropIR | undefined {
  if (crop === undefined) {
    return undefined;
  }

  if (typeof crop === "number" || typeof crop === "string") {
    const value = parseCropValue(crop as number | `${number}%`);
    return {
      top: value,
      right: value,
      bottom: value,
      left: value,
    };
  }

  if (typeof crop !== "object" || crop === null || Array.isArray(crop)) {
    return undefined;
  }

  const input = crop as {
    top?: number | `${number}%`;
    right?: number | `${number}%`;
    bottom?: number | `${number}%`;
    left?: number | `${number}%`;
  };

  return {
    top: parseCropValue(input.top),
    right: parseCropValue(input.right),
    bottom: parseCropValue(input.bottom),
    left: parseCropValue(input.left),
  };
}

function parseObjectPositionValue(
  objectPosition: string | undefined,
  frame: { widthEmu: number; heightEmu: number },
): ObjectPositionIR | undefined {
  if (!objectPosition) {
    return undefined;
  }

  const parts = objectPosition.trim().split(/\s+/).filter(Boolean);
  const xToken = parts[0] ?? "50%";
  const yToken = parts[1] ?? xToken;
  const axisValue = (token: string, size: number) => {
    if (token === "left" || token === "top") {
      return 0;
    }
    if (token === "center") {
      return 0.5;
    }
    if (token === "right" || token === "bottom") {
      return 1;
    }
    if (token.endsWith("%")) {
      const value = Number.parseFloat(token);
      return Number.isFinite(value) ? value / 100 : 0.5;
    }
    const value = Number.parseFloat(token);
    return Number.isFinite(value) && size > 0 ? value / size : 0.5;
  };

  return {
    x: axisValue(xToken, frame.widthEmu),
    y: axisValue(yToken, frame.heightEmu),
  };
}

function textStyleFromProps(
  props: ReturnType<typeof normalizeTextProps>,
  textLengthContext?: LengthResolutionContext,
): TextStyleIR {
  const list = resolveListStyle(props, textLengthContext);
  const lineHeight = resolveLineHeight(props.lineHeight, textLengthContext);
  const underlineStyle = resolveUnderlineStyle(props.textDecorationStyle);
  const underlineColor = normalizeColor(props.textDecorationColor);
  const textDirection = resolveTextDirection(props.writingMode);
  const tabStops = resolveTabStops(props.tabStops, textLengthContext);
  const fontSizePt =
    props.fontSize === undefined
      ? undefined
      : parsePointValue(props.fontSize, 0, textLengthContext);

  return {
    fontFamily: props.fontFamily,
    fontSizePt,
    fontWeight: props.fontWeight,
    italic: props.italic,
    underline: props.underline,
    ...(underlineStyle ? { underlineStyle } : {}),
    ...(underlineColor ? { underlineColor } : {}),
    strike: props.strike,
    color: normalizeColor(props.color),
    textAlign: props.textAlign,
    verticalAlign: props.verticalAlign,
    paddingPt: parseSpacingInPoints(props.padding, textLengthContext),
    lineSpacing: props.lineSpacing ?? lineHeight.lineSpacing,
    lineSpacingMultiple: props.lineSpacingMultiple ?? lineHeight.lineSpacingMultiple,
    paragraphSpacingBefore: props.paragraphSpacingBefore,
    paragraphSpacingAfter: props.paragraphSpacingAfter,
    ...(props.textIndent === undefined
      ? {}
      : { textIndentPt: parsePointValue(props.textIndent, 0, textLengthContext) }),
    ...(tabStops ? { tabStops } : {}),
    charSpacing: props.charSpacing,
    ...(list ? { list } : {}),
    fit: props.fit,
    wrap: props.wrap,
    ...(props.direction === "rtl" ? { rtlMode: true } : {}),
    ...(textDirection ? { textDirection } : {}),
    ...(props.superscript ? { superscript: true } : {}),
    ...(props.subscript ? { subscript: true } : {}),
  };
}

function applyTextTransform(value: string, textTransform: unknown): string {
  if (!textTransform || textTransform === "none") {
    return value;
  }
  if (textTransform === "uppercase") {
    return value.toUpperCase();
  }
  if (textTransform === "lowercase") {
    return value.toLowerCase();
  }
  if (textTransform === "capitalize") {
    return value.replace(/\b(\p{L})(\p{L}*)/gu, (_match, first: string, rest: string) => {
      return first.toUpperCase() + rest.toLowerCase();
    });
  }
  return value;
}

function textRunStyleFromProps(
  props: ReturnType<typeof normalizeTextProps>,
  context?: LengthResolutionContext,
): TextStyleIR {
  return textStyleFromProps(props, context);
}

function textRunsFor(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTextNode,
  parentTextTransform: unknown,
  context?: LengthResolutionContext,
): TextRunIR[] {
  return node.inlineChildren.flatMap((childId): TextRunIR[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    if (child.kind === "textRun") {
      const props = normalizeTextProps(styleFor(child, resolvedStyles) as never);
      const childContext = getTextLengthContext(props, context);
      const text = applyTextTransform(child.text, props.textTransform ?? parentTextTransform);
      const style = textRunStyleFromProps(props, childContext);
      return [{ text, style }];
    }

    if (child.kind === "text") {
      const props = normalizeTextProps(styleFor(child, resolvedStyles) as never);
      const childContext = getTextLengthContext(props, context);
      return textRunsFor(
        graph,
        resolvedStyles,
        child,
        props.textTransform ?? parentTextTransform,
        childContext,
      );
    }

    return [];
  });
}

function baseElement(input: {
  node: SemanticNode;
  packagePartId: PackagePartId;
  indexPath: readonly number[];
  frame: FrameIR;
  props: Record<string, unknown>;
}): Omit<PptxBaseElement, "kind"> {
  return {
    id: elementIdentity({
      packagePartId: input.packagePartId,
      graphNodeId: input.node.id,
      indexPath: input.indexPath,
    }),
    packagePartId: input.packagePartId,
    serialized: { shapeObjectId: shapeObjectId(input.indexPath) },
    origin: originFor(input.node),
    frame: input.frame,
    measurement: { frame: input.frame },
    opacity: input.props.opacity as number | undefined,
    rotation: input.props.rotation as number | undefined,
    zIndex: input.props.zIndex as number | undefined,
    visibility: input.props.visibility as string | undefined,
    flipH: input.props.flipH as boolean | undefined,
    flipV: input.props.flipV as boolean | undefined,
  };
}

function childFrame(
  props: Record<string, unknown>,
  parentFrame: Frame,
  context?: LengthResolutionContext,
): FrameIR {
  const resolved = frameFromProps(props, parentFrame, undefined, context);
  return frameToFrameIR(resolved);
}

function compileContainer(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticContainerNode,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxGroupElement | undefined {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const props = normalizeViewProps(styleFor(node, resolvedStyles) as never);
  if (props.display === "none") {
    return undefined;
  }

  const frame = childFrame(props as Record<string, unknown>, parentFrame, context);
  const strokes = resolveNodeStrokes(props, context);
  const shadow = parseShadowShorthand(props.boxShadow);
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    frame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, context),
  );
  const backgroundFill = resolveBackgroundLayers(
    backgroundValueFor(resolved, props),
    props.backgroundTransparency,
    {
      widthEmu: frame.widthEmu,
      heightEmu: frame.heightEmu,
    },
    frame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );

  return {
    ...baseElement({
      node,
      packagePartId: packagePartIdValue,
      indexPath,
      frame,
      props: props as Record<string, unknown>,
    }),
    kind: "group",
    fill: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(toStroke(
      props.outlineColor,
      props.outlineWidth,
      props.outlineStyle,
      undefined,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    )
      ? {
          outline: toStroke(
            props.outlineColor,
            props.outlineWidth,
            props.outlineStyle,
            undefined,
            parseStrokeLineCap(props.strokeLinecap),
            parseStrokeLineJoin(props.strokeLinejoin),
            undefined,
            context,
          ),
        }
      : {}),
    ...(shadow ? { shadow } : {}),
    radiusEmu: parseLength(props.borderRadius, 0, 0, context),
    children: compileChildren(
      graph,
      resolvedStyles,
      node.children,
      packagePartIdValue,
      frame,
      indexPath,
      context,
    ),
  };
}

function compileText(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTextNode,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxTextElement | undefined {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const props = normalizeTextProps(styleFor(node, resolvedStyles) as never);
  if (props.display === "none") {
    return undefined;
  }

  const textLengthContext = getTextLengthContext(props, context);
  const frame = childFrame(props as Record<string, unknown>, parentFrame, textLengthContext);
  const strokes = resolveNodeStrokes(props, textLengthContext);
  const shadow = parseShadowShorthand(props.textShadow ?? props.boxShadow);
  const style = textStyleFromProps(props, textLengthContext);
  const runs = textRunsFor(graph, resolvedStyles, node, props.textTransform, textLengthContext);
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    frame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, textLengthContext),
  );
  const backgroundFill = resolveBackgroundLayers(
    backgroundValueFor(resolved, props),
    props.backgroundTransparency,
    {
      widthEmu: frame.widthEmu,
      heightEmu: frame.heightEmu,
    },
    frame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;

  return {
    ...baseElement({
      node,
      packagePartId: packagePartIdValue,
      indexPath,
      frame,
      props: props as Record<string, unknown>,
    }),
    kind: "text",
    content: {
      text: runs.map((run) => run.text).join(""),
      ...(runs.length > 1 || runs.some((run) => run.style) ? { runs } : {}),
    },
    style,
    fill: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(toStroke(
      props.outlineColor,
      props.outlineWidth,
      props.outlineStyle,
      undefined,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      textLengthContext,
    )
      ? {
          outline: toStroke(
            props.outlineColor,
            props.outlineWidth,
            props.outlineStyle,
            undefined,
            parseStrokeLineCap(props.strokeLinecap),
            parseStrokeLineJoin(props.strokeLinejoin),
            undefined,
            textLengthContext,
          ),
        }
      : {}),
    ...(shadow ? { shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: parseLength(props.borderRadius, 0, 0, textLengthContext),
  };
}

function compileImage(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticImageNode,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxPictureElement | undefined {
  const asset = node.assetRef ? graph.assets.get(node.assetRef) : undefined;
  const props = normalizeImageProps(
    {
      ...styleFor(node, resolvedStyles),
      ...(asset?.source.kind === "path" ? { src: asset.source.path } : {}),
      ...(asset?.source.kind === "data" ? { data: asset.source.data } : {}),
    } as never,
    context,
  );
  if (props.display === "none") {
    return undefined;
  }

  const resolved = frameFromProps(props, parentFrame, undefined, context);
  const frame = frameToFrameIR(resolved);
  const shadow = parseShadowShorthand(props.boxShadow);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;
  const base = baseElement({
    node,
    packagePartId: packagePartIdValue,
    indexPath,
    frame,
    props: props as Record<string, unknown>,
  });

  return {
    ...base,
    kind: "image",
    mediaPartId: mediaPartIdForElement(base.id),
    sourceFrame: frame,
    source: assetSource(asset),
    fit: props.fit ?? "contain",
    ...(parseObjectPositionValue(props.objectPosition, frame)
      ? { objectPosition: parseObjectPositionValue(props.objectPosition, frame) }
      : {}),
    ...(parseImageCrop(props.crop) ? { crop: parseImageCrop(props.crop) } : {}),
    transparency: props.transparency,
    rounding: props.rounding,
    ...(shadow ? { shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
  };
}

function compileShape(
  node: SemanticShapeNode,
  resolvedStyles: ResolvedStyleMap,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxShapeElement | undefined {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const props = normalizeShapeProps({
    ...styleFor(node, resolvedStyles),
    shape: node.shape,
  } as never);
  if (props.display === "none") {
    return undefined;
  }

  const frame = childFrame(props as Record<string, unknown>, parentFrame, context);
  const strokes = resolveNodeStrokes(props, context);
  const shadow = parseShadowShorthand(props.boxShadow);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    frame,
    strokes.stroke,
    strokes.edgeStrokes,
  );
  const shapeFill = resolveBackgroundLayers(
    shapeFillValueFor(resolved, props),
    props.fillTransparency,
    {
      widthEmu: frame.widthEmu,
      heightEmu: frame.heightEmu,
    },
    frame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );

  return {
    ...baseElement({
      node,
      packagePartId: packagePartIdValue,
      indexPath,
      frame,
      props: props as Record<string, unknown>,
    }),
    kind: "shape",
    shape: node.shape,
    fill: shapeFill.fill,
    ...(shapeFill.backgroundLayers ? { backgroundLayers: shapeFill.backgroundLayers } : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(toStroke(
      props.outlineColor,
      props.outlineWidth,
      props.outlineStyle,
      undefined,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    )
      ? {
          outline: toStroke(
            props.outlineColor,
            props.outlineWidth,
            props.outlineStyle,
            undefined,
            parseStrokeLineCap(props.strokeLinecap),
            parseStrokeLineJoin(props.strokeLinejoin),
            undefined,
            context,
          ),
        }
      : {}),
    ...(shadow ? { shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: parseLength(props.radius, 0, 0, context),
  };
}

function compileElement(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  nodeId: GraphNodeId,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxElement | undefined {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return undefined;
  }

  switch (node.kind) {
    case "container":
      return compileContainer(
        graph,
        resolvedStyles,
        node,
        packagePartIdValue,
        parentFrame,
        indexPath,
        context,
      );
    case "text":
      return compileText(
        graph,
        resolvedStyles,
        node,
        packagePartIdValue,
        parentFrame,
        indexPath,
        context,
      );
    case "image":
      return compileImage(
        graph,
        resolvedStyles,
        node,
        packagePartIdValue,
        parentFrame,
        indexPath,
        context,
      );
    case "shape":
      return compileShape(
        node,
        resolvedStyles,
        packagePartIdValue,
        parentFrame,
        indexPath,
        context,
      );
    case "document":
    case "slide":
    case "textRun":
      return undefined;
  }
}

function compileChildren(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  children: readonly GraphNodeId[],
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  parentPath: readonly number[],
  context?: LengthResolutionContext,
): PptxElement[] {
  return children
    .map((childId, index) =>
      compileElement(
        graph,
        resolvedStyles,
        childId,
        packagePartIdValue,
        parentFrame,
        [...parentPath, index],
        context,
      ),
    )
    .filter((element): element is PptxElement => element !== undefined)
    .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
}

function compileChildrenPartial(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  children: readonly GraphNodeId[],
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  parentPath: readonly number[],
  context?: LengthResolutionContext,
): PptxElement[] {
  const elements: PptxElement[] = [];

  children.forEach((childId, index) => {
    try {
      const element = compileElement(
        graph,
        resolvedStyles,
        childId,
        packagePartIdValue,
        parentFrame,
        [...parentPath, index],
        context,
      );
      if (element) {
        elements.push(element);
      }
    } catch {
      // Partial projection is inspection-oriented: keep the elements that can be
      // computed and let the stage diagnostics describe the failed projection.
    }
  });

  return elements.sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
}

function graphNodeForElement(
  graph: SemanticAuthorGraph,
  nodeId: GraphNodeId | undefined,
): SemanticNode | undefined {
  return nodeId ? graph.nodes.get(nodeId) : undefined;
}

function elementOriginFromLayoutOrigin(
  origin: ProjectedLayoutOrigin | undefined,
): PptxElementOrigin {
  return {
    ...(origin?.graphNodeIds ? { graphNodeIds: origin.graphNodeIds } : {}),
    ...(origin?.styleEntityIds ? { styleEntityIds: origin.styleEntityIds } : {}),
    ...(origin?.assetEntityIds ? { assetEntityIds: origin.assetEntityIds } : {}),
    ...(origin?.source ? { source: origin.source } : {}),
  };
}

function mapProjectedLayoutNodeToElement(input: {
  node: ProjectedLayoutNode;
  graph: SemanticAuthorGraph;
  packagePartId: PackagePartId;
  indexPath: readonly number[];
}): PptxElement {
  const graphNodeId = input.node.origin?.graphNodeIds?.[0];
  const graphNode = graphNodeForElement(input.graph, graphNodeId);
  const base = {
    id: elementIdentity({
      packagePartId: input.packagePartId,
      graphNodeId,
      indexPath: input.indexPath,
    }),
    packagePartId: input.packagePartId,
    serialized: { shapeObjectId: shapeObjectId(input.indexPath) },
    origin: input.node.origin
      ? elementOriginFromLayoutOrigin(input.node.origin)
      : graphNode
        ? originFor(graphNode)
        : {},
    frame: input.node.frame,
    measurement: { frame: input.node.frame },
    opacity: input.node.opacity,
    rotation: input.node.rotation,
    zIndex: input.node.zIndex,
    visibility: input.node.visibility,
    flipH: input.node.flipH,
    flipV: input.node.flipV,
  };

  switch (input.node.kind) {
    case "group": {
      return {
        ...base,
        kind: "group",
        fill: input.node.fill,
        backgroundLayers: input.node.backgroundLayers,
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        shadow: input.node.shadow,
        radiusEmu: input.node.radiusEmu,
        children: input.node.children.map((child, index) =>
          mapProjectedLayoutNodeToElement({
            node: child,
            graph: input.graph,
            packagePartId: input.packagePartId,
            indexPath: [...input.indexPath, index],
          }),
        ),
      };
    }
    case "text":
      return {
        ...base,
        kind: "text",
        content: input.node.content,
        style: input.node.style,
        fill: input.node.fill,
        backgroundLayers: input.node.backgroundLayers,
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
        radiusEmu: input.node.radiusEmu,
      };
    case "image":
      return {
        ...base,
        kind: "image",
        mediaPartId: mediaPartIdForElement(base.id),
        sourceFrame: input.node.sourceFrame,
        source: input.node.source,
        fit: input.node.fit,
        objectPosition: input.node.objectPosition,
        crop: input.node.crop,
        transparency: input.node.transparency,
        rounding: input.node.rounding,
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
      };
    case "shape":
      return {
        ...base,
        kind: "shape",
        shape: input.node.shape,
        fill: input.node.fill,
        backgroundLayers: input.node.backgroundLayers,
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
        radiusEmu: input.node.radiusEmu,
      };
  }
}

function slidePartFor(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  slide: SemanticSlideNode;
  layoutSlide?: ProjectedLayoutSlide;
  slideIndex: number;
  slideFrame: FrameIR;
  slideLayoutPart: PptxPackagePart;
  partial?: boolean;
}): PptxSlidePart {
  const slideNumber = input.slideIndex + 1;
  const partId = slidePartIdFor(input.slide);
  const resolved = resolvedStyleFor(input.slide, input.resolvedStyles);
  const props = normalizeSlideProps(styleFor(input.slide, input.resolvedStyles) as never);
  const slideFill = input.partial
    ? undefined
    : resolveBackgroundLayers(
        backgroundValueFor(resolved, props),
        props.backgroundTransparency,
        {
          widthEmu: input.slideFrame.widthEmu,
          heightEmu: input.slideFrame.heightEmu,
        },
        input.slideFrame,
        {
          borderBox: input.slideFrame,
          paddingBox: input.slideFrame,
          contentBox: input.slideFrame,
        },
        props.backgroundPosition,
        props.backgroundSize,
        props.backgroundRepeat,
        props.backgroundOrigin,
        props.backgroundClip,
      );

  return {
    id: partId,
    category: "authored-content",
    kind: "slide",
    path: `ppt/slides/slide${slideNumber}.xml`,
    origin: {
      graphNodeIds: [input.slide.id],
      ...(input.slide.origin.source ? { source: input.slide.origin.source } : {}),
    },
    relationships: [
      {
        id: serializedId("rId1"),
        targetPartId: input.slideLayoutPart.id,
        targetPath: input.slideLayoutPart.path,
        type: "slideLayout",
      },
    ],
    payload: {
      slideId: String(input.slide.id),
      name: input.slide.name,
      background: input.layoutSlide?.background ?? slideFill?.fill,
      ...((input.layoutSlide?.backgroundLayers ?? slideFill?.backgroundLayers)
        ? { backgroundLayers: input.layoutSlide?.backgroundLayers ?? slideFill?.backgroundLayers }
        : {}),
      elements: input.partial
        ? compileChildrenPartial(
            input.graph,
            input.resolvedStyles,
            input.slide.children,
            partId,
            input.slideFrame,
            [],
            {
              viewportWidthEmu: input.slideFrame.widthEmu,
              viewportHeightEmu: input.slideFrame.heightEmu,
            },
          )
        : input.layoutSlide
          ? input.layoutSlide.nodes.map((node, index) =>
              mapProjectedLayoutNodeToElement({
                node,
                graph: input.graph,
                packagePartId: partId,
                indexPath: [index],
              }),
            )
          : compileChildren(
              input.graph,
              input.resolvedStyles,
              input.slide.children,
              partId,
              input.slideFrame,
              [],
              {
                viewportWidthEmu: input.slideFrame.widthEmu,
                viewportHeightEmu: input.slideFrame.heightEmu,
              },
            ),
    },
  };
}

function projectGraphToPptxPackageInternal(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  partial?: boolean;
}): PptxPackageModel {
  const size = sizeFromOptions(input.options);
  const document = input.graph.nodes.get(input.graph.documentId);
  const slideIds = document?.kind === "document" ? document.children : [];
  const contentTypes: PptxPackagePart = {
    id: packageIdentity("manifest", "content-types"),
    category: "manifest",
    kind: "content-types",
    path: "[Content_Types].xml",
  };
  const rootRelationships: PptxPackagePart = {
    id: packageIdentity("manifest", "root-relationships"),
    category: "manifest",
    kind: "relationships",
    path: "_rels/.rels",
  };
  const presentationPart: PptxPackagePart = {
    id: packageIdentity("support", "presentation"),
    category: "support",
    kind: "presentation",
    path: "ppt/presentation.xml",
    payload: {
      kind: "presentation",
      size,
      slidePartIds: slideIds.flatMap((slideId) => {
        const slide = input.graph.nodes.get(slideId);
        return slide?.kind === "slide" ? [slidePartIdFor(slide)] : [];
      }),
    } satisfies PptxSupportPartPayload,
  };
  const presentationRelationships: PptxPackagePart = {
    id: packageIdentity("manifest", "presentation-relationships"),
    category: "manifest",
    kind: "relationships",
    path: "ppt/_rels/presentation.xml.rels",
  };
  const themePart: PptxPackagePart = {
    id: packageIdentity("support", "theme-default"),
    category: "support",
    kind: "theme",
    path: "ppt/theme/theme1.xml",
    payload: {
      kind: "theme",
      status: "placeholder",
      editable: true,
    } satisfies PptxSupportPartPayload,
  };
  const slideMasterPart: PptxPackagePart = {
    id: packageIdentity("support", "slide-master-default"),
    category: "support",
    kind: "slide-master",
    path: "ppt/slideMasters/slideMaster1.xml",
    payload: {
      kind: "slide-master",
      status: "placeholder",
      editable: true,
    } satisfies PptxSupportPartPayload,
  };
  const slideLayoutPart: PptxPackagePart = {
    id: packageIdentity("support", "slide-layout-default"),
    category: "support",
    kind: "slide-layout",
    path: "ppt/slideLayouts/slideLayout1.xml",
    payload: {
      kind: "slide-layout",
      status: "placeholder",
      editable: true,
    } satisfies PptxSupportPartPayload,
  };
  const documentPropertiesPart: PptxPackagePart = {
    id: packageIdentity("support", "document-properties-core"),
    category: "support",
    kind: "document-properties",
    path: "docProps/core.xml",
    payload: {
      kind: "document-properties",
      ...(input.options.meta ? { meta: input.options.meta } : {}),
    } satisfies PptxSupportPartPayload,
  };
  const viewPropertiesPart: PptxPackagePart = {
    id: packageIdentity("support", "view-properties"),
    category: "support",
    kind: "view-properties",
    path: "ppt/viewProps.xml",
    payload: {
      kind: "view-properties",
      status: "placeholder",
      editable: true,
    } satisfies PptxSupportPartPayload,
  };
  const presentationPropertiesPart: PptxPackagePart = {
    id: packageIdentity("support", "presentation-properties"),
    category: "support",
    kind: "presentation-properties",
    path: "ppt/presProps.xml",
    payload: {
      kind: "presentation-properties",
      status: "placeholder",
      editable: true,
    } satisfies PptxSupportPartPayload,
  };
  const projectedLayout = input.partial
    ? undefined
    : resolveProjectedLayoutFromGraph(input.options, input.graph, input.resolvedStyles);
  const slideFrame: FrameIR = {
    xEmu: 0,
    yEmu: 0,
    widthEmu: size.widthEmu,
    heightEmu: size.heightEmu,
  };
  const projectedSlides = slideIds.flatMap((slideId, slideIndex): PptxSlidePart[] => {
    const slide = input.graph.nodes.get(slideId);
    if (slide?.kind !== "slide") {
      return [];
    }
    return [
      slidePartFor({
        graph: input.graph,
        resolvedStyles: input.resolvedStyles,
        slide,
        layoutSlide: projectedLayout?.slides[slideIndex],
        slideIndex,
        slideFrame,
        slideLayoutPart,
        partial: input.partial,
      }),
    ];
  });
  const mediaParts = mediaPartsFor(projectedSlides);
  const slides = attachMediaRelationships(projectedSlides, mediaParts);
  const slideRelationshipParts: PptxPackagePart[] = slides.map((slide, index) => ({
    id: packageIdentity("relationships", `${slide.id}`),
    category: "authored-content",
    kind: "relationships",
    path: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
    relationships: slide.relationships,
    payload: { relationships: slide.relationships ?? [] } satisfies PptxRelationshipsPayload,
    origin: slide.origin,
  }));
  const manifest = buildPptxManifest({
    contentTypes,
    rootRelationships,
    presentationPart,
    presentationRelationships,
    themePart,
    slideMasterPart,
    slideLayoutPart,
    documentPropertiesPart,
    viewPropertiesPart,
    presentationPropertiesPart,
    slides,
    mediaParts,
    serializedId,
  });

  return {
    version: "0.6",
    format: "pptx",
    size,
    meta: input.options.meta,
    parts: [
      manifest.contentTypes,
      manifest.rootRelationships,
      manifest.presentationPart,
      manifest.presentationRelationships,
      manifest.themePart,
      manifest.slideMasterPart,
      manifest.slideLayoutPart,
      manifest.documentPropertiesPart,
      manifest.viewPropertiesPart,
      manifest.presentationPropertiesPart,
      ...slides,
      ...slideRelationshipParts,
      ...mediaParts,
    ],
    slides,
  };
}

function walkElements(
  elements: readonly PptxElement[],
  visit: (element: PptxElement) => void,
): void {
  for (const element of elements) {
    visit(element);
    if (element.kind === "group") {
      walkElements(element.children, visit);
    }
  }
}

function mapElements(
  elements: readonly PptxElement[],
  map: (element: PptxElement) => PptxElement,
): PptxElement[] {
  return elements.map((element) => {
    const mapped = map(element);

    if (mapped.kind !== "group") {
      return mapped;
    }

    return {
      ...mapped,
      children: mapElements(mapped.children, map),
    };
  });
}

function imageExtension(source: ImageSourceIR): string {
  if (source.kind === "path") {
    const extension = source.path.split(".").pop();
    return extension && extension.length <= 5 ? extension : "bin";
  }

  const match = /^data:image\/([a-zA-Z0-9.+-]+);/.exec(source.data);
  return match?.[1] ?? "bin";
}

function mediaPartsFor(slides: readonly PptxSlidePart[]): PptxPackagePart[] {
  const parts = new Map<PackagePartId, PptxPackagePart>();
  let mediaIndex = 1;

  for (const slide of slides) {
    walkElements(slide.payload.elements, (element) => {
      if (element.kind !== "image" || !element.mediaPartId) {
        return;
      }
      if (parts.has(element.mediaPartId)) {
        return;
      }

      parts.set(element.mediaPartId, {
        id: element.mediaPartId,
        category: "authored-content",
        kind: "media",
        path: `ppt/media/media${mediaIndex}.${imageExtension(element.source)}`,
        origin: {
          ...(element.origin.graphNodeIds ? { graphNodeIds: element.origin.graphNodeIds } : {}),
          ...(element.origin.source ? { source: element.origin.source } : {}),
        },
        payload: {
          source: element.source,
          elementId: element.id,
        },
      });
      mediaIndex += 1;
    });
  }

  return [...parts.values()];
}

function attachMediaRelationships(
  slides: readonly PptxSlidePart[],
  mediaParts: readonly PptxPackagePart[],
): PptxSlidePart[] {
  const mediaPartById = new Map(mediaParts.map((part) => [part.id, part]));

  return slides.map((slide) => {
    const relationships = [...(slide.relationships ?? [])];
    const relationshipByMediaPartId = new Map<PackagePartId, PptxRelationship>();

    const elements = mapElements(slide.payload.elements, (element) => {
      if (element.kind !== "image" || !element.mediaPartId) {
        return element;
      }

      const mediaPart = mediaPartById.get(element.mediaPartId);
      if (!mediaPart) {
        return element;
      }

      const relationship =
        relationshipByMediaPartId.get(element.mediaPartId) ??
        ({
          id: mediaRelationshipId(relationships.length + 1),
          targetPartId: mediaPart.id,
          targetPath: mediaPart.path,
          type: "image",
        } satisfies PptxRelationship);

      if (!relationshipByMediaPartId.has(element.mediaPartId)) {
        relationshipByMediaPartId.set(element.mediaPartId, relationship);
        relationships.push(relationship);
      }

      return {
        ...element,
        serialized: {
          ...element.serialized,
          relationshipId: relationship.id,
        },
      };
    });

    return {
      ...slide,
      relationships,
      payload: {
        ...slide.payload,
        elements,
      },
    };
  });
}

export function projectGraphToPptxPackage(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
}): PptxPackageModel {
  return projectGraphToPptxPackageInternal(input);
}

export function projectGraphToPartialPptxPackage(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
}): PptxPackageModel {
  return projectGraphToPptxPackageInternal({ ...input, partial: true });
}

function summarizeElement(element: PptxElement): ProjectInspectionElementSummary {
  const resolvedValues: ProjectInspectionResolvedValues = {
    frame: element.frame,
    ...("fill" in element && element.fill ? { fill: element.fill } : {}),
    ...("stroke" in element && element.stroke ? { stroke: element.stroke } : {}),
    ...(element.kind === "text" ? { textStyle: element.style } : {}),
    ...(element.kind === "image" ? { imageSource: element.source } : {}),
  };

  return {
    id: element.id,
    kind: element.kind,
    packagePartId: element.packagePartId,
    frame: element.frame,
    ...(element.kind === "text" && element.content.text
      ? { textPreview: element.content.text.slice(0, 80) }
      : {}),
    origin: element.origin,
    resolvedValues,
  };
}

function summarizeMedia(projection: PptxPackageModel): ProjectInspectionMediaSummary[] {
  const media: ProjectInspectionMediaSummary[] = [];

  for (const slide of projection.slides) {
    walkElements(slide.payload.elements, (element) => {
      if (element.kind !== "image") {
        return;
      }
      media.push({
        partId: element.mediaPartId,
        elementId: element.id,
        sourceKind: element.source.kind,
        origin: element.origin,
      });
    });
  }

  return media;
}

export function summarizePptxPackage(
  projection: PptxPackageModel,
  options: {
    diagnostics?: Diagnostics;
    adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
  } = {},
): ProjectInspectionSummary {
  const parts = projection.parts.map((part) => ({
    id: part.id,
    category: part.category,
    kind: part.kind,
    path: part.path,
    ...(part.relationships ? { relationshipCount: part.relationships.length } : {}),
    ...(part.kind === "content-types" && isContentTypesPayload(part.payload)
      ? { contentTypeCount: part.payload.defaults.length + part.payload.overrides.length }
      : {}),
  }));

  return {
    format: "pptx",
    parts,
    media: summarizeMedia(projection),
    slides: projection.slides.map((slide) => ({
      partId: slide.id,
      slideId: slide.payload.slideId,
      name: slide.payload.name,
      elements: slide.payload.elements.map(summarizeElement),
    })),
    pptx: {
      packageParts: parts,
      relationshipCount: projection.parts.reduce(
        (sum, part) => sum + (part.relationships?.length ?? 0),
        0,
      ),
    },
    diagnostics:
      options.diagnostics?.items.map((item) => ({
        severity: item.severity,
        code: item.code,
        title: item.title,
      })) ?? [],
    adapterLimitations: options.adapterLimitations ?? [],
  };
}

function isContentTypesPayload(value: unknown): value is PptxContentTypesPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { defaults?: unknown }).defaults) &&
    Array.isArray((value as { overrides?: unknown }).overrides)
  );
}

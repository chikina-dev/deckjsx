import {
  normalizeImageProps,
  normalizeShapeProps,
  normalizeTextProps,
  normalizeViewProps,
} from "../../layout/normalization";
import type {
  AssetEntity,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticContainerNode,
  SemanticImageNode,
  SemanticNode,
  SemanticShapeNode,
  SemanticSlideNode,
  SemanticTextNode,
  SourceOrigin,
} from "../../graph";
import { frameFromProps } from "../../layout/absolute";
import type { Frame } from "../../layout/frame";
import type {
  BackgroundLayerIR,
  EdgeStrokeIR,
  FrameIR,
  ImageCropIR,
  ImageSourceIR,
  ObjectPositionIR,
  ProjectedLayoutNode,
  ProjectedLayoutOrigin,
  ProjectedLayoutSlide,
  StrokeIR,
  TextRunIR,
  TextStyleIR,
} from "../../layout/projected";
import { normalizeProjectedImageFit, unsupportedObjectFitSemantics } from "../../layout/image-fit";
import { parseSpacing, parseSpacingInPoints } from "../../layout/spacing";
import { resolveBackgroundBoxFrames } from "../../style/background";
import { normalizeColor } from "../../style/color";
import { parseLength, parsePointValue, type LengthResolutionContext } from "../../style/length";
import type { ResolvedStyleMap } from "../../style/resolve";
import type { DeckLength, ImageCropAuthoring, ImageCropValue, TextStyle } from "../../style/types";
import type { SlideTemplateSet, TemplateAreaKind } from "../../templates";
import {
  getTextLengthContext,
  resolveCharacterSpacing,
  resolveLineHeight,
  resolveListStyle,
  resolveTabStops,
  resolveTextDirection,
  resolveUnderlineStyle,
} from "../../style/typography";
import { comparePptxElementsByPaintOrder, drawingFromElements } from "./drawing";
import {
  elementIdentity,
  generatedShapeObjectId,
  mediaPartIdForElement,
  packageIdentity,
  pptxElementId,
  serializedId,
  shapeObjectId,
} from "./identity";
import { projectedRelationshipTarget } from "./relationships";
import type {
  PackagePartId,
  PptxBackgroundLayer,
  PptxElement,
  PptxElementOrigin,
  PptxGeneratedStrokeLayer,
  PptxGroupElement,
  PptxLayoutAnchor,
  PptxPackagePart,
  PptxPaintOrderInput,
  PptxPictureElement,
  PptxShapeElement,
  PptxSlidePart,
  PptxTextBodyStyle,
  PptxTextElement,
  PptxUnsupportedSemantic,
  PptxVisibility,
} from "./model";

const BACKGROUND_LAYER_SHAPE_OBJECT_ID_OFFSET = 50;
const BACKGROUND_LAYER_SHAPE_OBJECT_ID_STRIDE = 100;
const DEFAULT_OBJECT_POSITION: ObjectPositionIR = { x: 0.5, y: 0.5 };
const DEFAULT_VIDEO_POSTER_SOURCE: ImageSourceIR = {
  kind: "data",
  data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
};
const DEFAULT_TEXT_FIT: NonNullable<TextStyleIR["fit"]> = "none";
const DEFAULT_TEXT_DIRECTION: NonNullable<TextStyleIR["textDirection"]> = "horz";
const DEFAULT_TEXT_VERTICAL_ALIGN: NonNullable<TextStyleIR["verticalAlign"]> = "top";
const DEFAULT_TEXT_WRAP = true;

type FrameProps = Parameters<typeof frameFromProps>[0];
type BaseElementProps = FrameProps & {
  readonly opacity?: number;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly visibility?: PptxVisibility;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
};

import {
  backgroundInputFor,
  imageStyleFor,
  outlineStrokeSafely,
  parseShadowSafely,
  resolvedStyleFor,
  resolveBackgroundLayersSafely,
  resolveNodeStrokesSafely,
  shapeFillInputFor,
  shapeStyleFor,
  textRunStyleFor,
  textStyleFor,
  unsupportedCompositingSemantics,
  unsupportedGroupOpacitySemantics,
  unsupportedOpacityStackingContextSemantics,
  unsupportedTransformStackingContextSemantics,
  unsupportedTransformSemantics,
  viewStyleFor,
} from "./style";

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

function layoutAnchorFor(input: {
  templateAreaRef?: { readonly template: string; readonly area: string };
  templateAreaKind?: TemplateAreaKind;
  frame: FrameIR;
}): PptxLayoutAnchor | undefined {
  return input.templateAreaRef
    ? {
        template: input.templateAreaRef.template,
        area: input.templateAreaRef.area,
        kind: input.templateAreaKind ?? "generic",
        frame: input.frame,
      }
    : undefined;
}

function sourceKeyForOrigin(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

function templateAreaKindFor(
  node: SemanticNode,
  templates: SlideTemplateSet | undefined,
): TemplateAreaKind | undefined {
  const ref = node.templateAreaRef;
  if (!ref) {
    return undefined;
  }

  return templates?.[ref.template]?.areas?.[ref.area]?.kind ?? "generic";
}

function assetSource(asset: AssetEntity | undefined): ImageSourceIR {
  if (!asset) {
    return { kind: "data", data: "" };
  }

  switch (asset.source.kind) {
    case "path":
      return { kind: "path", path: asset.source.path };
    case "url":
      return { kind: "url", url: asset.source.url };
    case "data":
      return { kind: "data", data: asset.source.data };
  }
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

function parseImageCrop(
  crop: ImageCropAuthoring | ImageCropValue | undefined,
): ImageCropIR | undefined {
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
): ObjectPositionIR {
  if (!objectPosition) {
    return DEFAULT_OBJECT_POSITION;
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

function resolveCornerRadiusEmu(
  value: DeckLength | undefined,
  frame: FrameIR,
  context?: LengthResolutionContext,
): number {
  return parseLength(value, Math.min(frame.widthEmu, frame.heightEmu), 0, context);
}

function textStyleFromProps(
  props: ReturnType<typeof normalizeTextProps>,
  textLengthContext?: LengthResolutionContext,
): PptxTextBodyStyle {
  const list = resolveListStyle(props, textLengthContext);
  const lineHeight = resolveLineHeight(props.lineHeight, textLengthContext);
  const underlineStyle = props.underline
    ? (resolveUnderlineStyle(props.textDecorationStyle) ?? "sng")
    : resolveUnderlineStyle(props.textDecorationStyle);
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
    verticalAlign: props.verticalAlign ?? DEFAULT_TEXT_VERTICAL_ALIGN,
    paddingPt: parseSpacingInPoints(props.padding, textLengthContext),
    lineSpacing: props.lineSpacing ?? lineHeight.lineSpacing,
    lineSpacingMultiple: props.lineSpacingMultiple ?? lineHeight.lineSpacingMultiple,
    paragraphSpacingBefore:
      props.paragraphSpacingBefore === undefined
        ? undefined
        : parsePointValue(props.paragraphSpacingBefore, 0, textLengthContext),
    paragraphSpacingAfter:
      props.paragraphSpacingAfter === undefined
        ? undefined
        : parsePointValue(props.paragraphSpacingAfter, 0, textLengthContext),
    ...(props.textIndent === undefined
      ? {}
      : { textIndentPt: parsePointValue(props.textIndent, 0, textLengthContext) }),
    ...(tabStops ? { tabStops } : {}),
    charSpacing: resolveCharacterSpacing(props.charSpacing, textLengthContext),
    ...(list ? { list } : {}),
    fit: props.fit ?? DEFAULT_TEXT_FIT,
    wrap: props.wrap ?? DEFAULT_TEXT_WRAP,
    ...(props.direction === "rtl" ? { rtlMode: true } : {}),
    textDirection: textDirection ?? DEFAULT_TEXT_DIRECTION,
    ...(props.superscript ? { superscript: true } : {}),
    ...(props.subscript ? { subscript: true } : {}),
  };
}

function applyTextTransform(value: string, textTransform: TextStyle["textTransform"]): string {
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

function textBodyStyleFromProjected(style: TextStyleIR): PptxTextBodyStyle {
  return {
    ...style,
    fit: style.fit ?? DEFAULT_TEXT_FIT,
    textDirection: style.textDirection ?? DEFAULT_TEXT_DIRECTION,
    verticalAlign: style.verticalAlign ?? DEFAULT_TEXT_VERTICAL_ALIGN,
    wrap: style.wrap ?? DEFAULT_TEXT_WRAP,
  };
}

function authoredPaintOrder(input: { siblingOrder: number; zIndex?: number }): PptxPaintOrderInput {
  return {
    siblingOrder: input.siblingOrder,
    ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
    generatedLayerRole: "authored",
  };
}

function generatedPaintOrder(input: {
  siblingOrder: number;
  zIndex?: number;
  generatedLayerRole: "background" | "border" | "outline";
}): PptxPaintOrderInput {
  return {
    siblingOrder: input.siblingOrder,
    ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
    generatedLayerRole: input.generatedLayerRole,
  };
}

function generatedStrokeIdentity(input: {
  packagePartId: PackagePartId;
  graphNodeId?: GraphNodeId;
  indexPath: readonly number[];
  role: "border" | "outline";
  key: string;
}): PptxGeneratedStrokeLayer["id"] {
  return pptxElementId(
    `${elementIdentity({
      packagePartId: input.packagePartId,
      graphNodeId: input.graphNodeId,
      indexPath: input.indexPath,
    })}:generated:${input.role}:${input.key}`,
  );
}

function generatedStrokeLayers(input: {
  packagePartId: PackagePartId;
  graphNodeId?: GraphNodeId;
  indexPath: readonly number[];
  frame: FrameIR;
  siblingOrder: number;
  zIndex?: number;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
}): readonly PptxGeneratedStrokeLayer[] | undefined {
  const layers: PptxGeneratedStrokeLayer[] = [];
  const edgeEntries = [
    ["top", input.edgeStrokes?.top],
    ["right", input.edgeStrokes?.right],
    ["bottom", input.edgeStrokes?.bottom],
    ["left", input.edgeStrokes?.left],
  ] as const;

  for (const [edge, stroke] of edgeEntries) {
    if (!stroke) {
      continue;
    }

    const frame =
      edge === "top"
        ? { ...input.frame, heightEmu: 0 }
        : edge === "bottom"
          ? {
              ...input.frame,
              yEmu: input.frame.yEmu + input.frame.heightEmu,
              heightEmu: 0,
            }
          : edge === "left"
            ? { ...input.frame, widthEmu: 0 }
            : {
                ...input.frame,
                xEmu: input.frame.xEmu + input.frame.widthEmu,
                widthEmu: 0,
              };
    const localIndex = layers.length;
    layers.push({
      kind: "stroke",
      role: "border",
      edge,
      id: generatedStrokeIdentity({
        packagePartId: input.packagePartId,
        graphNodeId: input.graphNodeId,
        indexPath: input.indexPath,
        role: "border",
        key: edge,
      }),
      serialized: { shapeObjectId: generatedShapeObjectId(input.indexPath, localIndex) },
      frame,
      stroke,
      shape: "line",
      paintOrder: generatedPaintOrder({
        siblingOrder: input.siblingOrder,
        zIndex: input.zIndex,
        generatedLayerRole: "border",
      }),
    });
  }

  if (input.outline) {
    const localIndex = layers.length;
    layers.push({
      kind: "stroke",
      role: "outline",
      id: generatedStrokeIdentity({
        packagePartId: input.packagePartId,
        graphNodeId: input.graphNodeId,
        indexPath: input.indexPath,
        role: "outline",
        key: "outline",
      }),
      serialized: { shapeObjectId: generatedShapeObjectId(input.indexPath, localIndex) },
      frame: input.frame,
      stroke: input.outline,
      shape: "rect",
      paintOrder: generatedPaintOrder({
        siblingOrder: input.siblingOrder,
        zIndex: input.zIndex,
        generatedLayerRole: "outline",
      }),
    });
  }

  return layers.length > 0 ? layers : undefined;
}

function projectBackgroundLayers(input: {
  layers: readonly BackgroundLayerIR[] | undefined;
  indexPath: readonly number[];
  zIndex?: number;
}): readonly PptxBackgroundLayer[] | undefined {
  if (!input.layers || input.layers.length === 0) {
    return undefined;
  }

  return input.layers.map((layer, index) => {
    const paintOrder = generatedPaintOrder({
      siblingOrder: input.indexPath.at(-1) ?? 0,
      zIndex: input.zIndex,
      generatedLayerRole: "background",
    });
    const serialized = {
      shapeObjectId: generatedShapeObjectId(
        input.indexPath,
        BACKGROUND_LAYER_SHAPE_OBJECT_ID_OFFSET + index * BACKGROUND_LAYER_SHAPE_OBJECT_ID_STRIDE,
      ),
    };

    if (layer.kind === "background-image") {
      return {
        ...layer,
        objectPosition: layer.objectPosition ?? DEFAULT_OBJECT_POSITION,
        paintOrder,
        serialized,
      };
    }

    return {
      ...layer,
      paintOrder,
      serialized,
    };
  });
}

function textRunsFor(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTextNode,
  parentTextTransform: TextStyle["textTransform"],
  context?: LengthResolutionContext,
): TextRunIR[] {
  return node.inlineChildren.flatMap((childId): TextRunIR[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    if (child.kind === "textRun") {
      const props = normalizeTextProps(textRunStyleFor(child, resolvedStyles));
      const childContext = getTextLengthContext(props, context);
      const text = applyTextTransform(child.text, props.textTransform ?? parentTextTransform);
      const style = textRunStyleFromProps(props, childContext);
      return [{ text, style }];
    }

    if (child.kind === "text") {
      const props = normalizeTextProps(textStyleFor(child, resolvedStyles));
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
  props: BaseElementProps;
  templateAreaKind?: TemplateAreaKind;
  unsupportedSemantics?: readonly PptxUnsupportedSemantic[];
}) {
  const siblingOrder = input.indexPath.at(-1) ?? 0;
  const layoutAnchor = layoutAnchorFor({
    templateAreaRef: input.node.templateAreaRef,
    templateAreaKind: input.templateAreaKind,
    frame: input.frame,
  });

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
    ...(layoutAnchor ? { layoutAnchor } : {}),
    opacity: input.props.opacity,
    rotation: input.props.rotation,
    zIndex: input.props.zIndex,
    paintOrder: authoredPaintOrder({
      siblingOrder,
      zIndex: input.props.zIndex,
    }),
    visibility: input.props.visibility,
    flipH: input.props.flipH,
    flipV: input.props.flipV,
    ...(input.unsupportedSemantics?.length
      ? { unsupportedSemantics: input.unsupportedSemantics }
      : {}),
  };
}

function childFrame(
  props: FrameProps,
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
  templates: SlideTemplateSet | undefined,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxGroupElement | undefined {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const props = normalizeViewProps(viewStyleFor(node, resolvedStyles));
  if (props.display === "none") {
    return undefined;
  }

  const frame = childFrame(props, parentFrame, context);
  const siblingOrder = indexPath.at(-1) ?? 0;
  const strokes = resolveNodeStrokesSafely(props, context);
  const shadowResult = parseShadowSafely({ property: "boxShadow", value: props.boxShadow });
  const outlineResult = outlineStrokeSafely(props, context);
  const generatedStrokes = generatedStrokeLayers({
    packagePartId: packagePartIdValue,
    graphNodeId: node.id,
    indexPath,
    frame,
    siblingOrder,
    zIndex: props.zIndex,
    edgeStrokes: strokes.edgeStrokes,
    outline: outlineResult.outline,
  });
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    frame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, context),
  );
  const backgroundInput = backgroundInputFor(resolved, props);
  const backgroundFill = resolveBackgroundLayersSafely(
    { property: backgroundInput?.property ?? "background", value: backgroundInput?.value },
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
  const backgroundLayers = projectBackgroundLayers({
    layers: backgroundFill.backgroundLayers,
    indexPath,
    zIndex: props.zIndex,
  });

  return {
    ...baseElement({
      node,
      packagePartId: packagePartIdValue,
      indexPath,
      frame,
      props,
      templateAreaKind: templateAreaKindFor(node, templates),
      unsupportedSemantics: [
        ...unsupportedTransformSemantics(props),
        ...unsupportedTransformStackingContextSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...unsupportedGroupOpacitySemantics(props),
        ...strokes.unsupportedSemantics,
        ...outlineResult.unsupportedSemantics,
        ...shadowResult.unsupportedSemantics,
        ...(backgroundFill.unsupportedSemantics ?? []),
      ],
    }),
    kind: "group",
    fill: backgroundFill.fill,
    ...(backgroundLayers ? { backgroundLayers } : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(outlineResult.outline ? { outline: outlineResult.outline } : {}),
    ...(generatedStrokes ? { generatedStrokes } : {}),
    ...(shadowResult.shadow ? { shadow: shadowResult.shadow } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.borderRadius, frame, context),
    children: compileChildren(
      graph,
      resolvedStyles,
      node.children,
      templates,
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
  templates: SlideTemplateSet | undefined,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxTextElement | undefined {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const props = normalizeTextProps(textStyleFor(node, resolvedStyles));
  if (props.display === "none") {
    return undefined;
  }

  const textLengthContext = getTextLengthContext(props, context);
  const frame = childFrame(props, parentFrame, textLengthContext);
  const siblingOrder = indexPath.at(-1) ?? 0;
  const strokes = resolveNodeStrokesSafely(props, textLengthContext);
  const shadowResult = parseShadowSafely({
    property: props.textShadow !== undefined ? "textShadow" : "boxShadow",
    value: props.textShadow ?? props.boxShadow,
  });
  const outlineResult = outlineStrokeSafely(props, textLengthContext);
  const generatedStrokes = generatedStrokeLayers({
    packagePartId: packagePartIdValue,
    graphNodeId: node.id,
    indexPath,
    frame,
    siblingOrder,
    zIndex: props.zIndex,
    edgeStrokes: strokes.edgeStrokes,
    outline: outlineResult.outline,
  });
  const style = textStyleFromProps(props, textLengthContext);
  const runs = textRunsFor(graph, resolvedStyles, node, props.textTransform, textLengthContext);
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    frame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, textLengthContext),
  );
  const backgroundInput = backgroundInputFor(resolved, props);
  const backgroundFill = resolveBackgroundLayersSafely(
    { property: backgroundInput?.property ?? "background", value: backgroundInput?.value },
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
  const backgroundLayers = projectBackgroundLayers({
    layers: backgroundFill.backgroundLayers,
    indexPath,
    zIndex: props.zIndex,
  });
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
      props,
      templateAreaKind: templateAreaKindFor(node, templates),
      unsupportedSemantics: [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...unsupportedOpacityStackingContextSemantics(props),
        ...strokes.unsupportedSemantics,
        ...outlineResult.unsupportedSemantics,
        ...shadowResult.unsupportedSemantics,
        ...(backgroundFill.unsupportedSemantics ?? []),
      ],
    }),
    kind: "text",
    content: {
      text: runs.map((run) => run.text).join(""),
      ...(runs.length > 1 || runs.some((run) => run.style) ? { runs } : {}),
    },
    style,
    fill: backgroundFill.fill,
    ...(backgroundLayers ? { backgroundLayers } : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(outlineResult.outline ? { outline: outlineResult.outline } : {}),
    ...(generatedStrokes ? { generatedStrokes } : {}),
    ...(shadowResult.shadow ? { shadow: shadowResult.shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.borderRadius, frame, textLengthContext),
  };
}

function compileImage(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticImageNode,
  templates: SlideTemplateSet | undefined,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxPictureElement | undefined {
  const asset = node.assetRef ? graph.assets.get(node.assetRef) : undefined;
  const props = normalizeImageProps(
    {
      ...imageStyleFor(node, resolvedStyles),
      ...(asset?.source.kind === "path" ? { src: asset.source.path } : {}),
      ...(asset?.source.kind === "url" ? { src: asset.source.url } : {}),
      ...(asset?.source.kind === "data" ? { data: asset.source.data } : {}),
    },
    context,
  );
  if (props.display === "none") {
    return undefined;
  }

  const resolved = frameFromProps(props, parentFrame, undefined, context);
  const frame = frameToFrameIR(resolved);
  const fit = normalizeProjectedImageFit(props.fit);
  const shadowResult = parseShadowSafely({ property: "boxShadow", value: props.boxShadow });
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
    props,
    templateAreaKind: templateAreaKindFor(node, templates),
    unsupportedSemantics: [
      ...unsupportedTransformSemantics(props),
      ...unsupportedCompositingSemantics(props),
      ...unsupportedOpacityStackingContextSemantics(props),
      ...unsupportedObjectFitSemantics(props.fit),
      ...shadowResult.unsupportedSemantics,
    ],
  });

  return {
    ...base,
    kind: "image",
    mediaPartId: mediaPartIdForElement(base.id),
    sourceFrame: frame,
    source: assetSource(asset),
    fit,
    objectPosition: parseObjectPositionValue(props.objectPosition, frame),
    ...(parseImageCrop(props.crop) ? { crop: parseImageCrop(props.crop) } : {}),
    transparency: props.transparency,
    rounding: props.rounding,
    ...(shadowResult.shadow ? { shadow: shadowResult.shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
  };
}

function compileShape(
  node: SemanticShapeNode,
  resolvedStyles: ResolvedStyleMap,
  templates: SlideTemplateSet | undefined,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  indexPath: readonly number[],
  context?: LengthResolutionContext,
): PptxShapeElement | undefined {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const props = normalizeShapeProps(shapeStyleFor(node, resolvedStyles, node.shape));
  if (props.display === "none") {
    return undefined;
  }

  const frame = childFrame(props, parentFrame, context);
  const siblingOrder = indexPath.at(-1) ?? 0;
  const strokes = resolveNodeStrokesSafely(props, context);
  const shadowResult = parseShadowSafely({ property: "boxShadow", value: props.boxShadow });
  const outlineResult = outlineStrokeSafely(props, context);
  const generatedStrokes = generatedStrokeLayers({
    packagePartId: packagePartIdValue,
    graphNodeId: node.id,
    indexPath,
    frame,
    siblingOrder,
    zIndex: props.zIndex,
    edgeStrokes: strokes.edgeStrokes,
    outline: outlineResult.outline,
  });
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
  const fillInput = shapeFillInputFor(resolved, props);
  const shapeFill = resolveBackgroundLayersSafely(
    { property: fillInput?.property ?? "fill", value: fillInput?.value },
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
  const backgroundLayers = projectBackgroundLayers({
    layers: shapeFill.backgroundLayers,
    indexPath,
    zIndex: props.zIndex,
  });

  return {
    ...baseElement({
      node,
      packagePartId: packagePartIdValue,
      indexPath,
      frame,
      props,
      templateAreaKind: templateAreaKindFor(node, templates),
      unsupportedSemantics: [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...unsupportedOpacityStackingContextSemantics(props),
        ...strokes.unsupportedSemantics,
        ...outlineResult.unsupportedSemantics,
        ...shadowResult.unsupportedSemantics,
        ...(shapeFill.unsupportedSemantics ?? []),
      ],
    }),
    kind: "shape",
    shape: node.shape,
    fill: shapeFill.fill,
    ...(backgroundLayers ? { backgroundLayers } : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(outlineResult.outline ? { outline: outlineResult.outline } : {}),
    ...(generatedStrokes ? { generatedStrokes } : {}),
    ...(shadowResult.shadow ? { shadow: shadowResult.shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.radius, frame, context),
  };
}

function compileElement(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  nodeId: GraphNodeId;
  templates?: SlideTemplateSet;
  packagePartId: PackagePartId;
  parentFrame: Frame;
  indexPath: readonly number[];
  context?: LengthResolutionContext;
}): PptxElement | undefined {
  const node = input.graph.nodes.get(input.nodeId);
  if (!node) {
    return undefined;
  }

  switch (node.kind) {
    case "container":
      return compileContainer(
        input.graph,
        input.resolvedStyles,
        node,
        input.templates,
        input.packagePartId,
        input.parentFrame,
        input.indexPath,
        input.context,
      );
    case "text":
      return compileText(
        input.graph,
        input.resolvedStyles,
        node,
        input.templates,
        input.packagePartId,
        input.parentFrame,
        input.indexPath,
        input.context,
      );
    case "image":
      return compileImage(
        input.graph,
        input.resolvedStyles,
        node,
        input.templates,
        input.packagePartId,
        input.parentFrame,
        input.indexPath,
        input.context,
      );
    case "video":
      return undefined;
    case "shape":
      return compileShape(
        node,
        input.resolvedStyles,
        input.templates,
        input.packagePartId,
        input.parentFrame,
        input.indexPath,
        input.context,
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
  templates: SlideTemplateSet | undefined,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  parentPath: readonly number[],
  context?: LengthResolutionContext,
): PptxElement[] {
  return children
    .map((childId, index) =>
      compileElement({
        graph,
        resolvedStyles,
        nodeId: childId,
        templates,
        packagePartId: packagePartIdValue,
        parentFrame,
        indexPath: [...parentPath, index],
        context,
      }),
    )
    .filter((element): element is PptxElement => element !== undefined)
    .sort(comparePptxElementsByPaintOrder);
}

function compileChildrenPartial(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  children: readonly GraphNodeId[],
  templates: SlideTemplateSet | undefined,
  packagePartIdValue: PackagePartId,
  parentFrame: Frame,
  parentPath: readonly number[],
  context?: LengthResolutionContext,
): PptxElement[] {
  const elements: PptxElement[] = [];

  children.forEach((childId, index) => {
    try {
      const element = compileElement({
        graph,
        resolvedStyles,
        nodeId: childId,
        templates,
        packagePartId: packagePartIdValue,
        parentFrame,
        indexPath: [...parentPath, index],
        context,
      });
      if (element) {
        elements.push(element);
      }
    } catch {
      // Partial projection is inspection-oriented: keep the elements that can be
      // computed and let the stage diagnostics describe the failed projection.
    }
  });

  return elements.sort(comparePptxElementsByPaintOrder);
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

function textFromProjectedLayoutNode(node: ProjectedLayoutNode): string {
  switch (node.kind) {
    case "text":
      return node.content.text;
    case "group":
      return node.children.map((child) => textFromProjectedLayoutNode(child)).join("");
    case "table":
      return node.sections
        .flatMap((section) => section.rows)
        .flatMap((row) => row.cells)
        .map((cell) => cell.children.map((child) => textFromProjectedLayoutNode(child)).join(""))
        .join("");
    case "image":
    case "video":
    case "shape":
      return "";
  }
}

function unsupportedTableCellContentSemantics(
  children: readonly PptxElement[],
): readonly PptxUnsupportedSemantic[] {
  const unsupportedKinds = [
    ...new Set(children.filter((child) => child.kind !== "text").map((child) => child.kind)),
  ];
  if (unsupportedKinds.length === 0) {
    return [];
  }

  return [
    {
      feature: "content",
      property: "tableCell.children",
      value: unsupportedKinds.join(","),
      reason:
        "Native PPTX table cell projection is text-centric in v0.8.4; rich cell content is preserved in the projected model but omitted from the native table XML fallback.",
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["nativeTableStructure", "textContent", "projectedCellChildren"],
        missing: ["nativeRichCellContent"],
      },
    },
  ];
}

function mapProjectedLayoutNodeToElement(input: {
  node: ProjectedLayoutNode;
  packagePartId: PackagePartId;
  indexPath: readonly number[];
}): PptxElement {
  const graphNodeId = input.node.origin?.graphNodeIds?.[0];
  const layoutAnchor = layoutAnchorFor({
    templateAreaRef: input.node.origin?.templateAreaRef,
    templateAreaKind: input.node.origin?.templateAreaKind,
    frame: input.node.frame,
  });
  const base = {
    id: elementIdentity({
      packagePartId: input.packagePartId,
      graphNodeId,
      indexPath: input.indexPath,
    }),
    packagePartId: input.packagePartId,
    serialized: { shapeObjectId: shapeObjectId(input.indexPath) },
    origin: elementOriginFromLayoutOrigin(input.node.origin),
    frame: input.node.frame,
    measurement: { frame: input.node.frame },
    ...(layoutAnchor ? { layoutAnchor } : {}),
    opacity: input.node.opacity,
    rotation: input.node.rotation,
    zIndex: input.node.zIndex,
    paintOrder: authoredPaintOrder({
      siblingOrder: input.node.siblingOrder,
      zIndex: input.node.zIndex,
    }),
    visibility: input.node.visibility,
    flipH: input.node.flipH,
    flipV: input.node.flipV,
    clip: input.node.clip,
    unsupportedSemantics: input.node.unsupportedSemantics,
  };

  switch (input.node.kind) {
    case "group": {
      const backgroundLayers = projectBackgroundLayers({
        layers: input.node.backgroundLayers,
        indexPath: input.indexPath,
        zIndex: input.node.zIndex,
      });
      const generatedStrokes = generatedStrokeLayers({
        packagePartId: input.packagePartId,
        graphNodeId,
        indexPath: input.indexPath,
        frame: input.node.frame,
        siblingOrder: input.node.siblingOrder,
        zIndex: input.node.zIndex,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
      });
      return {
        ...base,
        kind: "group",
        fill: input.node.fill,
        ...(backgroundLayers ? { backgroundLayers } : {}),
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        ...(generatedStrokes ? { generatedStrokes } : {}),
        shadow: input.node.shadow,
        radiusEmu: input.node.radiusEmu,
        children: input.node.children.map((child, index) =>
          mapProjectedLayoutNodeToElement({
            node: child,
            packagePartId: input.packagePartId,
            indexPath: [...input.indexPath, index],
          }),
        ),
      };
    }
    case "table": {
      return {
        ...base,
        kind: "table",
        sections: input.node.sections.map((section, sectionIndex) => ({
          kind: "tableSection",
          sectionKind: section.sectionKind,
          rows: section.rows.map((row, rowIndex) => ({
            kind: "tableRow",
            frame: row.frame,
            cells: row.cells.map((cell, cellIndex) => {
              const children = cell.children.map((child, childIndex) =>
                mapProjectedLayoutNodeToElement({
                  node: child,
                  packagePartId: input.packagePartId,
                  indexPath: [...input.indexPath, sectionIndex, rowIndex, cellIndex, childIndex],
                }),
              );
              const unsupportedSemantics = unsupportedTableCellContentSemantics(children);
              return {
                kind: "tableCell",
                cellKind: cell.cellKind,
                gridColumnIndex: cell.gridColumnIndex,
                colSpan: cell.colSpan,
                rowSpan: cell.rowSpan,
                frame: cell.frame,
                fill: cell.fill,
                edgeStrokes: cell.edgeStrokes,
                style: cell.style,
                text: cell.children.map((child) => textFromProjectedLayoutNode(child)).join(""),
                children,
                ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
              };
            }),
          })),
        })),
      };
    }
    case "text": {
      const backgroundLayers = projectBackgroundLayers({
        layers: input.node.backgroundLayers,
        indexPath: input.indexPath,
        zIndex: input.node.zIndex,
      });
      const textGeneratedStrokes = generatedStrokeLayers({
        packagePartId: input.packagePartId,
        graphNodeId,
        indexPath: input.indexPath,
        frame: input.node.frame,
        siblingOrder: input.node.siblingOrder,
        zIndex: input.node.zIndex,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
      });
      return {
        ...base,
        kind: "text",
        content: input.node.content,
        style: textBodyStyleFromProjected(input.node.style),
        fill: input.node.fill,
        ...(backgroundLayers ? { backgroundLayers } : {}),
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        ...(textGeneratedStrokes ? { generatedStrokes: textGeneratedStrokes } : {}),
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
        radiusEmu: input.node.radiusEmu,
      };
    }
    case "image":
      return {
        ...base,
        kind: "image",
        mediaPartId: mediaPartIdForElement(base.id),
        sourceFrame: input.node.sourceFrame,
        source: input.node.source,
        fit: input.node.fit,
        objectPosition: input.node.objectPosition ?? DEFAULT_OBJECT_POSITION,
        crop: input.node.crop,
        transparency: input.node.transparency,
        rounding: input.node.rounding,
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
      };
    case "video": {
      const posterSource = input.node.posterSource ?? DEFAULT_VIDEO_POSTER_SOURCE;
      return {
        ...base,
        kind: "video",
        mediaPartId: mediaPartIdForElement(base.id),
        posterMediaPartId: packageIdentity("media", `${base.id}:poster`),
        sourceFrame: input.node.sourceFrame,
        source: input.node.source,
        posterSource,
        fit: input.node.fit,
        objectPosition: input.node.objectPosition ?? DEFAULT_OBJECT_POSITION,
        transparency: input.node.transparency,
        rounding: input.node.rounding,
        shadow: input.node.shadow,
      };
    }
    case "shape": {
      const backgroundLayers = projectBackgroundLayers({
        layers: input.node.backgroundLayers,
        indexPath: input.indexPath,
        zIndex: input.node.zIndex,
      });
      const shapeGeneratedStrokes = generatedStrokeLayers({
        packagePartId: input.packagePartId,
        graphNodeId,
        indexPath: input.indexPath,
        frame: input.node.frame,
        siblingOrder: input.node.siblingOrder,
        zIndex: input.node.zIndex,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
      });
      return {
        ...base,
        kind: "shape",
        shape: input.node.shape,
        fill: input.node.fill,
        ...(backgroundLayers ? { backgroundLayers } : {}),
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        ...(shapeGeneratedStrokes ? { generatedStrokes: shapeGeneratedStrokes } : {}),
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
        radiusEmu: input.node.radiusEmu,
      };
    }
  }
}

export function pptxSlidePartFor(input: {
  layoutSlide: ProjectedLayoutSlide;
  slideIndex: number;
  slideFrame: FrameIR;
  slideLayoutPart: PptxPackagePart;
  slidePartId: PackagePartId;
}): PptxSlidePart {
  const slideNumber = input.slideIndex + 1;
  const partId = input.slidePartId;
  const backgroundLayers = projectBackgroundLayers({
    layers: input.layoutSlide.backgroundLayers,
    indexPath: [5000 + input.slideIndex],
  });
  const origin = elementOriginFromLayoutOrigin(input.layoutSlide.origin);

  return {
    id: partId,
    category: "authored-content",
    kind: "slide",
    path: `ppt/slides/slide${slideNumber}.xml`,
    origin,
    relationships: [
      {
        id: serializedId("rId1"),
        target: projectedRelationshipTarget({
          ownerPath: `ppt/slides/slide${slideNumber}.xml`,
          targetPath: input.slideLayoutPart.path,
        }),
        targetPartId: input.slideLayoutPart.id,
        targetPath: input.slideLayoutPart.path,
        type: "slideLayout",
      },
    ],
    payload: {
      slideId: String(256 + input.slideIndex),
      name: input.layoutSlide.name,
      background: input.layoutSlide.background,
      ...(backgroundLayers ? { backgroundLayers } : {}),
      drawing: drawingFromElements(
        input.layoutSlide.nodes.map((node, index) =>
          mapProjectedLayoutNodeToElement({
            node,
            packagePartId: partId,
            indexPath: [index],
          }),
        ),
      ),
    },
  };
}

export function partialPptxSlidePartFor(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  slide: SemanticSlideNode;
  slideIndex: number;
  slideFrame: FrameIR;
  slideLayoutPart: PptxPackagePart;
  slidePartId: PackagePartId;
}): PptxSlidePart {
  const slideNumber = input.slideIndex + 1;
  const partId = input.slidePartId;
  const slideTemplates = input.graph.templates.get(sourceKeyForOrigin(input.slide.origin.source));

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
        target: projectedRelationshipTarget({
          ownerPath: `ppt/slides/slide${slideNumber}.xml`,
          targetPath: input.slideLayoutPart.path,
        }),
        targetPartId: input.slideLayoutPart.id,
        targetPath: input.slideLayoutPart.path,
        type: "slideLayout",
      },
    ],
    payload: {
      slideId: String(256 + input.slideIndex),
      name: input.slide.name,
      drawing: drawingFromElements(
        compileChildrenPartial(
          input.graph,
          input.resolvedStyles,
          input.slide.children,
          slideTemplates,
          partId,
          input.slideFrame,
          [],
          {
            viewportWidthEmu: input.slideFrame.widthEmu,
            viewportHeightEmu: input.slideFrame.heightEmu,
          },
        ),
      ),
    },
  };
}

import {
  type ImageNormalizationInput,
  normalizeImageProps,
  normalizeShapeProps,
  normalizeSlideProps,
  normalizeTextProps,
  normalizeVideoProps,
  normalizeViewProps,
  type ShapeNormalizationInput,
  type SlideNormalizationInput,
  type TextNormalizationInput,
  type VideoNormalizationInput,
  type ViewNormalizationInput,
} from "@/src/layout/normalization";
import { createDiagnostics, diagnostic, type Diagnostics } from "@/src/diagnostics";
import type { SemanticAuthorGraph, SemanticNode } from "@/src/graph";
import type { Frame } from "@/src/layout/frame";
import type { EdgeStrokeIR, StrokeIR } from "@/src/layout/projected";
import {
  errorReason,
  throwableResult,
  unsupportedCssWideKeywordSemantic,
  unsupportedSemantic,
  unsupportedSemanticFromReason,
} from "@/src/layout/unsupported";
import type {
  PptxPackageModel,
  PptxUnsupportedSemantic,
  PptxUnsupportedSemanticFeature,
} from "./model";
import { walkElements } from "./drawing";
import { resolveBackgroundLayers } from "@/src/style/background";
import {
  IMAGE_STYLE_KEYS,
  SHAPE_STYLE_KEYS,
  TEXT_RUN_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  VIDEO_STYLE_KEYS,
  VIEW_STYLE_KEYS,
} from "@/src/style/keysets";
import { type BorderStyle, type BorderWidthValue } from "@/src/style/types";
import type { StyleDeclaration, StyleDeclarationValue } from "@/src/style/declaration";
import { hasCssWideKeywordToken } from "@/src/style/defaulting";
import type {
  ResolvedStyle,
  ResolvedStyleDeclaration,
  ResolvedStyleMap,
} from "@/src/style/resolve";
import { hasShadowSpreadRadius, parseShadowShorthand } from "@/src/style/shadow";
import {
  parseOutlineShorthand,
  parseStrokeLineCap,
  parseStrokeLineJoin,
  resolveNodeStrokes,
  toStroke,
} from "@/src/style/stroke";
import { parseTransformOrigin, parseTransformShorthand } from "@/src/style/transform";
import { EMU_PER_INCH } from "@/src/types";

const SLIDE_STYLE_KEYS = [
  "background",
  "backgroundImage",
  "backgroundColor",
  "backgroundPosition",
  "backgroundSize",
  "backgroundRepeat",
  "backgroundClip",
  "backgroundOrigin",
] as const;

function targetStyle<TStyle extends object>(
  style: Readonly<StyleDeclaration>,
  keys: readonly (keyof StyleDeclaration)[],
): Partial<TStyle> {
  const result: Record<string, StyleDeclaration[keyof StyleDeclaration]> = {};
  keys.forEach((key) => {
    if (style[key] !== undefined) {
      result[String(key)] = style[key];
    }
  });
  return result as Partial<TStyle>;
}

export function pptxStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): Readonly<ResolvedStyleDeclaration> {
  return resolvedStyles.get(node.id)?.style ?? {};
}

export function slideStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): SlideNormalizationInput {
  return targetStyle<SlideNormalizationInput>(pptxStyleFor(node, resolvedStyles), SLIDE_STYLE_KEYS);
}

export function viewStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): ViewNormalizationInput {
  return targetStyle<ViewNormalizationInput>(pptxStyleFor(node, resolvedStyles), VIEW_STYLE_KEYS);
}

export function textStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): TextNormalizationInput {
  return targetStyle<TextNormalizationInput>(pptxStyleFor(node, resolvedStyles), TEXT_STYLE_KEYS);
}

export function textRunStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): TextNormalizationInput {
  return targetStyle<TextNormalizationInput>(
    pptxStyleFor(node, resolvedStyles),
    TEXT_RUN_STYLE_KEYS,
  );
}

export function imageStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): ImageNormalizationInput {
  return targetStyle<ImageNormalizationInput>(pptxStyleFor(node, resolvedStyles), IMAGE_STYLE_KEYS);
}

export function videoStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): VideoNormalizationInput {
  return targetStyle<VideoNormalizationInput>(pptxStyleFor(node, resolvedStyles), VIDEO_STYLE_KEYS);
}

export function shapeStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
  shape: ShapeNormalizationInput["shape"],
): ShapeNormalizationInput {
  return {
    ...targetStyle<ShapeNormalizationInput>(pptxStyleFor(node, resolvedStyles), SHAPE_STYLE_KEYS),
    shape,
  };
}

export function resolvedStyleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): ResolvedStyle | undefined {
  return resolvedStyles.get(node.id);
}

function hasNonDefaultProperty(resolved: ResolvedStyle | undefined, key: string): boolean {
  const source = resolved?.properties[key]?.source;
  return source !== undefined && source.layer !== "default";
}

export function backgroundInputFor(
  resolved: ResolvedStyle | undefined,
  props: {
    readonly background?: string;
    readonly backgroundColor?: string;
    readonly backgroundImage?: string;
  },
): { readonly property: string; readonly value: string } | undefined {
  if (hasNonDefaultProperty(resolved, "backgroundColor") && props.backgroundColor !== undefined) {
    return { property: "backgroundColor", value: props.backgroundColor };
  }
  if (hasNonDefaultProperty(resolved, "backgroundImage") && props.backgroundImage !== undefined) {
    return { property: "backgroundImage", value: props.backgroundImage };
  }
  if (hasNonDefaultProperty(resolved, "background") && props.background !== undefined) {
    return { property: "background", value: props.background };
  }
  if (props.backgroundColor !== undefined) {
    return { property: "backgroundColor", value: props.backgroundColor };
  }
  if (props.backgroundImage !== undefined) {
    return { property: "backgroundImage", value: props.backgroundImage };
  }
  if (props.background !== undefined) {
    return { property: "background", value: props.background };
  }
  return undefined;
}

export function shapeFillInputFor(
  resolved: ResolvedStyle | undefined,
  props: {
    readonly background?: string;
    readonly backgroundColor?: string;
    readonly backgroundImage?: string;
    readonly fill?: string;
  },
): { readonly property: string; readonly value: string } | undefined {
  if (hasNonDefaultProperty(resolved, "fill") && props.fill !== undefined) {
    return { property: "fill", value: props.fill };
  }
  return (
    backgroundInputFor(resolved, props) ??
    (props.fill !== undefined ? { property: "fill", value: props.fill } : undefined)
  );
}

export function parseShadowSafely(input: { property: string; value: string | undefined }): {
  readonly shadow?: ReturnType<typeof parseShadowShorthand>;
  readonly unsupportedSemantics: readonly PptxUnsupportedSemantic[];
} {
  const parsed = throwableResult(() => parseShadowShorthand(input.value));
  if (!parsed.ok) {
    const unsupported = unsupportedSemanticFromReason({
      feature: "shadow",
      property: input.property,
      value: input.value,
      reason: parsed.reason,
    });
    return { unsupportedSemantics: unsupported ? [unsupported] : [] };
  }

  const unsupported = hasShadowSpreadRadius(input.value)
    ? unsupportedSemanticFromReason({
        feature: "shadow",
        property: input.property,
        value: input.value,
        reason: `CSS shadow spread radius is not projected by the current PPTX shadow model: ${input.value}`,
        fallback: {
          strategy: "preserveAuthoredValueOnly",
          preserves: ["projectedShadowWithoutSpread"],
          missing: ["cssShadowSpreadRadius"],
        },
      })
    : undefined;
  return {
    shadow: parsed.value,
    unsupportedSemantics: unsupported ? [unsupported] : [],
  };
}

type PptxStrokeProjectionProps = {
  readonly border?: string;
  readonly borderColor?: string;
  readonly borderWidth?: BorderWidthValue;
  readonly borderStyle?: BorderStyle;
  readonly borderTop?: string;
  readonly borderRight?: string;
  readonly borderBottom?: string;
  readonly borderLeft?: string;
  readonly borderTopColor?: string;
  readonly borderRightColor?: string;
  readonly borderBottomColor?: string;
  readonly borderLeftColor?: string;
  readonly borderTopWidth?: BorderWidthValue;
  readonly borderRightWidth?: BorderWidthValue;
  readonly borderBottomWidth?: BorderWidthValue;
  readonly borderLeftWidth?: BorderWidthValue;
  readonly borderTopStyle?: BorderStyle;
  readonly borderRightStyle?: BorderStyle;
  readonly borderBottomStyle?: BorderStyle;
  readonly borderLeftStyle?: BorderStyle;
  readonly outline?: string;
  readonly outlineColor?: string;
  readonly outlineWidth?: BorderWidthValue;
  readonly outlineStyle?: BorderStyle;
  readonly stroke?: string;
  readonly strokeDasharray?: string;
  readonly strokeLinecap?: string;
  readonly strokeLinejoin?: string;
};

const STROKE_FALLBACK_REASON =
  "CSS-like stroke or border input could not be projected to the current PPTX stroke model; v0.8 preserves the authored stroke input as unsupported semantic metadata.";

const OUTLINE_FALLBACK_REASON =
  "CSS-like outline input could not be projected to the current PPTX outline model; v0.8 preserves the authored outline input as unsupported semantic metadata.";

function firstDefinedStrokeInput(
  props: PptxStrokeProjectionProps,
  keys: readonly (keyof PptxStrokeProjectionProps)[],
): { readonly property: string; readonly value: StyleDeclarationValue } | undefined {
  for (const key of keys) {
    const value = props[key];
    if (value !== undefined && value !== null && value !== "") {
      return { property: key, value };
    }
  }
  return undefined;
}

function strokeFallbackInput(props: PptxStrokeProjectionProps): {
  readonly feature: PptxUnsupportedSemanticFeature;
  readonly property: string;
  readonly value: StyleDeclarationValue;
} {
  const strokeInput = firstDefinedStrokeInput(props, [
    "strokeDasharray",
    "strokeLinecap",
    "strokeLinejoin",
    "stroke",
  ]);
  if (strokeInput) {
    return { feature: "stroke", ...strokeInput };
  }

  const borderInput = firstDefinedStrokeInput(props, [
    "border",
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderColor",
    "borderWidth",
    "borderStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
  ]);
  return borderInput
    ? { feature: "border", ...borderInput }
    : { feature: "border", property: "border", value: "unknown" };
}

function outlineFallbackInput(props: PptxStrokeProjectionProps): {
  readonly property: string;
  readonly value: StyleDeclarationValue;
} {
  return (
    firstDefinedStrokeInput(props, ["outline", "outlineColor", "outlineWidth", "outlineStyle"]) ??
    firstDefinedStrokeInput(props, ["strokeLinecap", "strokeLinejoin"]) ?? {
      property: "outline",
      value: "unknown",
    }
  );
}

function hasAuthoredOutlineInput(props: PptxStrokeProjectionProps): boolean {
  return (
    props.outline !== undefined ||
    props.outlineColor !== undefined ||
    props.outlineWidth !== undefined ||
    props.outlineStyle !== undefined
  );
}

function hasAuthoredStrokeInput(props: PptxStrokeProjectionProps): boolean {
  return (
    props.border !== undefined ||
    props.borderTop !== undefined ||
    props.borderRight !== undefined ||
    props.borderBottom !== undefined ||
    props.borderLeft !== undefined ||
    props.stroke !== undefined ||
    props.strokeDasharray !== undefined ||
    props.strokeLinecap !== undefined ||
    props.strokeLinejoin !== undefined
  );
}

function isExplicitNone(value: StyleDeclarationValue): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "none";
}

function isStrokeIntentionallyNone(props: PptxStrokeProjectionProps): boolean {
  return (
    isExplicitNone(props.border) ||
    isExplicitNone(props.borderTop) ||
    isExplicitNone(props.borderRight) ||
    isExplicitNone(props.borderBottom) ||
    isExplicitNone(props.borderLeft) ||
    props.borderStyle === "none"
  );
}

function unsupportedStrokeCssWideKeywordSemantics(
  props: PptxStrokeProjectionProps,
): readonly PptxUnsupportedSemantic[] {
  const unsupported: PptxUnsupportedSemantic[] = [];
  const properties: Array<keyof PptxStrokeProjectionProps> = [
    "borderWidth",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
  ];

  for (const property of properties) {
    if (!hasCssWideKeywordToken(props[property])) {
      continue;
    }

    const semantic = unsupportedCssWideKeywordSemantic(property, props[property]);
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  return unsupported;
}

function unsupportedOutlineCssWideKeywordSemantics(
  props: PptxStrokeProjectionProps,
): readonly PptxUnsupportedSemantic[] {
  if (!hasCssWideKeywordToken(props.outlineWidth)) {
    return [];
  }

  const semantic = unsupportedCssWideKeywordSemantic("outlineWidth", props.outlineWidth);
  return semantic ? [semantic] : [];
}

function unsupportedStrokeFallback(
  props: PptxStrokeProjectionProps,
  error: unknown,
): PptxUnsupportedSemantic | undefined {
  const input = strokeFallbackInput(props);
  return unsupportedSemantic({
    feature: input.feature,
    property: input.property,
    value: input.value,
    error: new Error(`${STROKE_FALLBACK_REASON} ${errorReason(error)}`),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredStrokeInput"],
      missing: ["pptxStroke"],
    },
  });
}

export function resolveNodeStrokesSafely(
  props: PptxStrokeProjectionProps,
  context?: Parameters<typeof resolveNodeStrokes>[1],
): {
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly unsupportedSemantics: readonly PptxUnsupportedSemantic[];
} {
  const cssWideSemantics = unsupportedStrokeCssWideKeywordSemantics(props);
  const resolved = throwableResult(() =>
    resolveNodeStrokes(props as Parameters<typeof resolveNodeStrokes>[0], context),
  );

  if (!resolved.ok) {
    const semantic = unsupportedStrokeFallback(props, resolved.reason);
    return {
      unsupportedSemantics: semantic ? [semantic, ...cssWideSemantics] : cssWideSemantics,
    };
  }

  const strokes = resolved.value;
  if (
    !strokes.stroke &&
    !strokes.edgeStrokes &&
    hasAuthoredStrokeInput(props) &&
    !isStrokeIntentionallyNone(props)
  ) {
    const semantic = unsupportedStrokeFallback(
      props,
      "No PPTX stroke could be produced from the authored stroke input.",
    );
    return {
      ...strokes,
      unsupportedSemantics: semantic ? [semantic, ...cssWideSemantics] : cssWideSemantics,
    };
  }

  return {
    ...strokes,
    unsupportedSemantics: cssWideSemantics,
  };
}

export function outlineStrokeSafely(
  props: PptxStrokeProjectionProps,
  context?: Parameters<typeof toStroke>[7],
): {
  readonly outline?: StrokeIR;
  readonly unsupportedSemantics: readonly PptxUnsupportedSemantic[];
} {
  if (!hasAuthoredOutlineInput(props)) {
    return { unsupportedSemantics: [] };
  }

  const cssWideSemantics = unsupportedOutlineCssWideKeywordSemantics(props);
  const resolved = throwableResult(() => {
    const outlineInput = parseOutlineShorthand(props.outline);
    return toStroke(
      props.outlineColor ?? outlineInput.outlineColor,
      props.outlineWidth ?? outlineInput.outlineWidth,
      props.outlineStyle ?? outlineInput.outlineStyle,
      outlineInput.outlineDashType,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    );
  });

  if (!resolved.ok) {
    const input = outlineFallbackInput(props);
    const semantic = unsupportedSemanticFromReason({
      feature: "outline",
      property: input.property,
      value: input.value,
      reason: `${OUTLINE_FALLBACK_REASON} ${resolved.reason}`,
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["authoredOutlineInput"],
        missing: ["pptxOutline"],
      },
    });
    return {
      unsupportedSemantics: semantic ? [semantic, ...cssWideSemantics] : cssWideSemantics,
    };
  }

  if (resolved.value) {
    return { outline: resolved.value, unsupportedSemantics: cssWideSemantics };
  }
  const input = outlineFallbackInput(props);
  const semantic = unsupportedSemanticFromReason({
    feature: "outline",
    property: input.property,
    value: input.value,
    reason: OUTLINE_FALLBACK_REASON,
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredOutlineInput"],
      missing: ["pptxOutline"],
    },
  });
  return {
    unsupportedSemantics: semantic ? [semantic, ...cssWideSemantics] : cssWideSemantics,
  };
}

export function unsupportedTransformSemantics(props: {
  readonly transform?: string;
  readonly transformOrigin?: string;
}): readonly PptxUnsupportedSemantic[] {
  const unsupported: PptxUnsupportedSemantic[] = [];
  const transform = throwableResult(() => parseTransformShorthand(props.transform));
  if (!transform.ok) {
    const semantic = unsupportedSemanticFromReason({
      feature: "transform",
      property: "transform",
      value: props.transform,
      reason: transform.reason,
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const origin = throwableResult(() =>
    parseTransformOrigin(props.transformOrigin, {
      widthEmu: EMU_PER_INCH,
      heightEmu: EMU_PER_INCH,
    }),
  );
  if (!origin.ok) {
    const semantic = unsupportedSemanticFromReason({
      feature: "transform",
      property: "transformOrigin",
      value: props.transformOrigin,
      reason: origin.reason,
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  return unsupported;
}

const GROUP_OPACITY_COMPOSITING_FALLBACK_REASON =
  "CSS group opacity creates a composited stacking context; the current PPTX writer cascades alpha to child drawing values instead of compositing the rendered subtree.";

const OPACITY_STACKING_CONTEXT_FALLBACK_REASON =
  "CSS opacity creates a stacking context; v0.8 preserves the projected opacity value but does not yet evaluate a full CSS stacking-context subtree for this drawing node.";

const TRANSFORM_STACKING_CONTEXT_FALLBACK_REASON =
  "CSS transforms create a stacking context; v0.8 preserves projected transform and paint-order inputs but does not yet evaluate a full CSS stacking-context subtree.";

const FILTER_EFFECT_FALLBACK_REASON =
  "CSS filter effects are not emitted by the current PPTX writer; v0.8 preserves the authored filter as an unsupported paint semantic for inspection.";

const BLEND_MODE_FALLBACK_REASON =
  "CSS blend modes require compositing behavior that the current PPTX writer does not reproduce; v0.8 preserves the authored blend mode as an unsupported paint semantic for inspection.";

const ISOLATION_FALLBACK_REASON =
  "CSS isolation creates a compositing group; v0.8 preserves the authored isolation input but does not yet evaluate isolated compositing groups.";

export function unsupportedGroupOpacitySemantics(props: {
  readonly opacity?: number;
}): readonly PptxUnsupportedSemantic[] {
  if (props.opacity === undefined || props.opacity <= 0 || props.opacity >= 1) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "opacity",
    property: "opacity",
    value: props.opacity,
    error: new Error(GROUP_OPACITY_COMPOSITING_FALLBACK_REASON),
    fallback: {
      strategy: "cascadeOpacityToChildren",
      preserves: ["projectedOpacity", "childDrawingValues"],
      missing: ["compositedSubtree", "cssStackingContext"],
    },
  });
  return semantic ? [semantic] : [];
}

export function unsupportedOpacityStackingContextSemantics(props: {
  readonly opacity?: number;
}): readonly PptxUnsupportedSemantic[] {
  if (props.opacity === undefined || props.opacity <= 0 || props.opacity >= 1) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "opacity",
    property: "stackingContext",
    value: props.opacity,
    error: new Error(OPACITY_STACKING_CONTEXT_FALLBACK_REASON),
    fallback: {
      strategy: "preserveOpacityWithoutCompositedSubtree",
      preserves: ["projectedOpacity", "drawingNode"],
      missing: ["compositedSubtree", "cssStackingContext"],
    },
  });
  return semantic ? [semantic] : [];
}

export function unsupportedTransformStackingContextSemantics(props: {
  readonly transform?: string;
}): readonly PptxUnsupportedSemantic[] {
  const operations = throwableResult(() => parseTransformShorthand(props.transform));
  if (!operations.ok || !operations.value?.length) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "transform",
    property: "stackingContext",
    value: props.transform,
    error: new Error(TRANSFORM_STACKING_CONTEXT_FALLBACK_REASON),
    fallback: {
      strategy: "preserveTransformWithoutStackingContext",
      preserves: ["projectedTransform", "paintOrderInputs"],
      missing: ["cssStackingContext"],
    },
  });
  return semantic ? [semantic] : [];
}

export function unsupportedCompositingSemantics(props: {
  readonly filter?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: string;
}): readonly PptxUnsupportedSemantic[] {
  const unsupported: PptxUnsupportedSemantic[] = [];
  const filter = props.filter?.trim();
  if (filter && filter.toLowerCase() !== "none") {
    const semantic = unsupportedSemantic({
      feature: "filter",
      property: "filter",
      value: props.filter,
      error: new Error(FILTER_EFFECT_FALLBACK_REASON),
      fallback: {
        strategy: "dropFilterEffect",
        preserves: ["authoredFilter"],
        missing: ["filterEffect"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const mixBlendMode = props.mixBlendMode?.trim();
  if (mixBlendMode && mixBlendMode.toLowerCase() !== "normal") {
    const semantic = unsupportedSemantic({
      feature: "blend",
      property: "mixBlendMode",
      value: props.mixBlendMode,
      error: new Error(BLEND_MODE_FALLBACK_REASON),
      fallback: {
        strategy: "dropBlendMode",
        preserves: ["authoredBlendMode"],
        missing: ["blendCompositing"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  if (props.isolation === "isolate") {
    const semantic = unsupportedSemantic({
      feature: "isolation",
      property: "isolation",
      value: props.isolation,
      error: new Error(ISOLATION_FALLBACK_REASON),
      fallback: {
        strategy: "dropIsolationGroup",
        preserves: ["authoredIsolation"],
        missing: ["isolatedCompositingGroup"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  return unsupported;
}

export function resolveBackgroundLayersSafely(
  input: { readonly property: string; readonly value: string | undefined },
  transparency?: number,
  context?: { widthEmu: number; heightEmu: number },
  frame?: Frame,
  boxFrames?: Parameters<typeof resolveBackgroundLayers>[4],
  backgroundPosition?: string,
  backgroundSize?: string,
  backgroundRepeat?: string,
  backgroundOrigin?: string,
  backgroundClip?: string,
): ReturnType<typeof resolveBackgroundLayers> & {
  readonly unsupportedSemantics?: readonly PptxUnsupportedSemantic[];
} {
  const resolved = throwableResult(() =>
    resolveBackgroundLayers(
      input.value,
      transparency,
      context,
      frame,
      boxFrames,
      backgroundPosition,
      backgroundSize,
      backgroundRepeat,
      backgroundOrigin,
      backgroundClip,
    ),
  );
  if (resolved.ok) {
    return resolved.value;
  }

  const unsupported = unsupportedSemanticFromReason({
    feature: "background",
    property: input.property,
    value: input.value,
    reason: resolved.reason,
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredBackgroundInput"],
      missing: ["pptxBackgroundLayer"],
    },
  });
  return unsupported ? { unsupportedSemantics: [unsupported] } : {};
}

function unsupportedSemanticsForGraphNode(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): readonly PptxUnsupportedSemantic[] {
  const resolved = resolvedStyleFor(node, resolvedStyles);
  const frame = {
    xEmu: 0,
    yEmu: 0,
    widthEmu: EMU_PER_INCH,
    heightEmu: EMU_PER_INCH,
  };

  switch (node.kind) {
    case "container": {
      const props = normalizeViewProps(viewStyleFor(node, resolvedStyles));
      const strokes = resolveNodeStrokesSafely(props);
      const outline = outlineStrokeSafely(props);
      const backgroundInput = backgroundInputFor(resolved, props);
      const background = resolveBackgroundLayersSafely(
        { property: backgroundInput?.property ?? "background", value: backgroundInput?.value },
        undefined,
        { widthEmu: frame.widthEmu, heightEmu: frame.heightEmu },
        frame,
        { borderBox: frame, paddingBox: frame, contentBox: frame },
        props.backgroundPosition,
        props.backgroundSize,
        props.backgroundRepeat,
        props.backgroundOrigin,
        props.backgroundClip,
      );
      return [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...unsupportedGroupOpacitySemantics(props),
        ...strokes.unsupportedSemantics,
        ...outline.unsupportedSemantics,
        ...parseShadowSafely({ property: "boxShadow", value: props.boxShadow })
          .unsupportedSemantics,
        ...(background.unsupportedSemantics ?? []),
      ];
    }
    case "text": {
      const props = normalizeTextProps(textStyleFor(node, resolvedStyles));
      const strokes = resolveNodeStrokesSafely(props);
      const outline = outlineStrokeSafely(props);
      const backgroundInput = backgroundInputFor(resolved, props);
      const background = resolveBackgroundLayersSafely(
        { property: backgroundInput?.property ?? "background", value: backgroundInput?.value },
        undefined,
        { widthEmu: frame.widthEmu, heightEmu: frame.heightEmu },
        frame,
        { borderBox: frame, paddingBox: frame, contentBox: frame },
        props.backgroundPosition,
        props.backgroundSize,
        props.backgroundRepeat,
        props.backgroundOrigin,
        props.backgroundClip,
      );
      const shadowValue: string | undefined =
        (props.textShadow as string | undefined) ?? (props.boxShadow as string | undefined);
      return [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...strokes.unsupportedSemantics,
        ...outline.unsupportedSemantics,
        ...parseShadowSafely({
          property: props.textShadow !== undefined ? "textShadow" : "boxShadow",
          value: shadowValue,
        }).unsupportedSemantics,
        ...(background.unsupportedSemantics ?? []),
      ];
    }
    case "image": {
      const props = normalizeImageProps(imageStyleFor(node, resolvedStyles));
      return [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...parseShadowSafely({ property: "boxShadow", value: props.boxShadow })
          .unsupportedSemantics,
      ];
    }
    case "video": {
      const props = normalizeVideoProps(videoStyleFor(node, resolvedStyles));
      return [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...parseShadowSafely({ property: "boxShadow", value: props.boxShadow })
          .unsupportedSemantics,
      ];
    }
    case "shape": {
      const props = normalizeShapeProps({
        ...shapeStyleFor(node, resolvedStyles, node.shape),
      });
      const strokes = resolveNodeStrokesSafely(props);
      const outline = outlineStrokeSafely(props);
      const fillInput = shapeFillInputFor(resolved, props);
      const fill = resolveBackgroundLayersSafely(
        { property: fillInput?.property ?? "fill", value: fillInput?.value },
        undefined,
        { widthEmu: frame.widthEmu, heightEmu: frame.heightEmu },
        frame,
        { borderBox: frame, paddingBox: frame, contentBox: frame },
        props.backgroundPosition,
        props.backgroundSize,
        props.backgroundRepeat,
        props.backgroundOrigin,
        props.backgroundClip,
      );
      return [
        ...unsupportedTransformSemantics(props),
        ...unsupportedCompositingSemantics(props),
        ...strokes.unsupportedSemantics,
        ...outline.unsupportedSemantics,
        ...parseShadowSafely({ property: "boxShadow", value: props.boxShadow })
          .unsupportedSemantics,
        ...(fill.unsupportedSemantics ?? []),
      ];
    }
    case "slide": {
      const props = normalizeSlideProps(slideStyleFor(node, resolvedStyles));
      const backgroundInput = backgroundInputFor(resolved, props);
      const background = resolveBackgroundLayersSafely(
        { property: backgroundInput?.property ?? "background", value: backgroundInput?.value },
        undefined,
        { widthEmu: frame.widthEmu, heightEmu: frame.heightEmu },
        frame,
        { borderBox: frame, paddingBox: frame, contentBox: frame },
        props.backgroundPosition,
        props.backgroundSize,
        props.backgroundRepeat,
        props.backgroundOrigin,
        props.backgroundClip,
      );
      return background.unsupportedSemantics ?? [];
    }
    case "document":
    case "table":
    case "tableSection":
    case "tableRow":
    case "tableCell":
    case "textRun":
      return [];
  }
}

export function collectPptxUnsupportedProjectionDiagnostics(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
}): Diagnostics {
  const items = [...input.graph.nodes.values()].flatMap((node) =>
    unsupportedSemanticsForGraphNode(node, input.resolvedStyles).map((semantic) =>
      diagnostic({
        severity: "warning",
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        title: "css-like semantic was preserved with a pptx fallback",
        message: semantic.reason,
        labels: [
          {
            path: `graph.nodes.${node.id}.style.${semantic.property}`,
            message: `${semantic.feature} fallback for ${semantic.value}`,
            severity: "primary",
          },
        ],
        notes: [
          `graphNodeId=${node.id}`,
          `nodeKind=${node.kind}`,
          `feature=${semantic.feature}`,
          `property=${semantic.property}`,
          `value=${semantic.value}`,
          semantic.fallback ? `fallbackStrategy=${semantic.fallback.strategy}` : undefined,
          semantic.fallback?.preserves.length
            ? `fallbackPreserves=${semantic.fallback.preserves.join(",")}`
            : undefined,
          semantic.fallback?.missing.length
            ? `fallbackMissing=${semantic.fallback.missing.join(",")}`
            : undefined,
        ].filter((note): note is string => note !== undefined),
        help: [
          "The projected PPTX model keeps this unsupported CSS-like meaning for inspection, but the current direct writer uses a fallback instead of reproducing it exactly.",
        ],
      }),
    ),
  );
  return createDiagnostics(items);
}

export function collectPptxUnsupportedProjectionModelDiagnostics(
  projection: PptxPackageModel,
  options: { readonly includeAllUnsupportedSemantics?: boolean } = {},
): Diagnostics {
  const items = projection.slides.flatMap((slide) => {
    const slideItems: ReturnType<typeof diagnostic>[] = [];
    walkElements(slide.payload.drawing.children, (element) => {
      for (const semantic of element.unsupportedSemantics ?? []) {
        if (
          !options.includeAllUnsupportedSemantics &&
          semantic.feature !== "border" &&
          semantic.feature !== "clipping" &&
          semantic.feature !== "content" &&
          semantic.feature !== "filter" &&
          semantic.feature !== "blend" &&
          semantic.feature !== "isolation" &&
          semantic.feature !== "layout" &&
          semantic.feature !== "outline" &&
          semantic.feature !== "stroke" &&
          semantic.fallback?.strategy !== "synthesizeFallbackFrame" &&
          !(semantic.feature === "opacity" && semantic.property === "stackingContext") &&
          !(semantic.feature === "transform" && semantic.property === "stackingContext")
        ) {
          continue;
        }

        const graphNodeId = element.origin.graphNodeIds?.[0];
        slideItems.push(
          diagnostic({
            severity: "warning",
            code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
            title: "css-like semantic was preserved with a pptx fallback",
            message: semantic.reason,
            labels: [
              {
                path: `projection.parts.${element.packagePartId}.elements.${element.id}.${semantic.property}`,
                message: `${semantic.feature} fallback for ${semantic.value}`,
                severity: "primary",
              },
            ],
            notes: [
              graphNodeId ? `graphNodeId=${graphNodeId}` : undefined,
              `elementId=${element.id}`,
              `elementKind=${element.kind}`,
              `slidePartId=${slide.id}`,
              `slideId=${slide.payload.slideId}`,
              `feature=${semantic.feature}`,
              `property=${semantic.property}`,
              `value=${semantic.value}`,
              semantic.fallback ? `fallbackStrategy=${semantic.fallback.strategy}` : undefined,
              semantic.fallback?.preserves.length
                ? `fallbackPreserves=${semantic.fallback.preserves.join(",")}`
                : undefined,
              semantic.fallback?.missing.length
                ? `fallbackMissing=${semantic.fallback.missing.join(",")}`
                : undefined,
            ].filter((note): note is string => note !== undefined),
            help: [
              "The projected PPTX model keeps this unsupported CSS-like meaning for inspection, but the current direct writer uses a fallback instead of reproducing it exactly.",
            ],
          }),
        );
      }

      if (element.kind === "table") {
        element.sections.forEach((section, sectionIndex) => {
          section.rows.forEach((row, rowIndex) => {
            row.cells.forEach((cell, cellIndex) => {
              for (const semantic of cell.unsupportedSemantics ?? []) {
                if (!options.includeAllUnsupportedSemantics && semantic.feature !== "content") {
                  continue;
                }

                const graphNodeId = element.origin.graphNodeIds?.[0];
                slideItems.push(
                  diagnostic({
                    severity: "warning",
                    code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
                    title: "css-like semantic was preserved with a pptx fallback",
                    message: semantic.reason,
                    labels: [
                      {
                        path: `projection.parts.${element.packagePartId}.elements.${element.id}.sections.${sectionIndex}.rows.${rowIndex}.cells.${cellIndex}.${semantic.property}`,
                        message: `${semantic.feature} fallback for ${semantic.value}`,
                        severity: "primary",
                      },
                    ],
                    notes: [
                      graphNodeId ? `graphNodeId=${graphNodeId}` : undefined,
                      `elementId=${element.id}`,
                      "elementKind=table",
                      `slidePartId=${slide.id}`,
                      `slideId=${slide.payload.slideId}`,
                      `tableSection=${section.sectionKind}`,
                      `tableCellKind=${cell.cellKind}`,
                      `feature=${semantic.feature}`,
                      `property=${semantic.property}`,
                      `value=${semantic.value}`,
                      semantic.fallback
                        ? `fallbackStrategy=${semantic.fallback.strategy}`
                        : undefined,
                      semantic.fallback?.preserves.length
                        ? `fallbackPreserves=${semantic.fallback.preserves.join(",")}`
                        : undefined,
                      semantic.fallback?.missing.length
                        ? `fallbackMissing=${semantic.fallback.missing.join(",")}`
                        : undefined,
                    ].filter((note): note is string => note !== undefined),
                    help: [
                      "The projected PPTX model keeps this unsupported CSS-like meaning for inspection, but the current direct writer uses a fallback instead of reproducing it exactly.",
                    ],
                  }),
                );
              }
            });
          });
        });
      }
    });
    return slideItems;
  });

  return createDiagnostics(items);
}

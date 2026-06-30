import type { GraphNodeId, SemanticAuthorGraph, SemanticNode } from "@/src/graph";
import type { ResolvedStyleMap } from "@/src/style/resolve";
import type { StyleDeclarationValue } from "@/src/style/declaration";
import { createDiagnostics, diagnostic, type Diagnostics } from "@/src/diagnostics";
import type {
  PackagePartId,
  PptxThemeConcreteDrawingPropertyMapping,
  PptxThemeDefaultStyleDecision,
  PptxThemeEffectiveInheritanceTrace,
  PptxThemeProjectionTrace,
  PptxThemeReferenceSerializationChoice,
  PptxThemeUnprojectedMapping,
  PptxThemeValueGroup,
  PptxThemeValueGroupFingerprint,
} from "./model";
import { fingerprintString, stableJson } from "./fingerprint";
import { slidePartIdFor } from "./identity";

export const DEFAULT_THEME_COLORS = {
  dk1: "111111",
  lt1: "FFFFFF",
  dk2: "1F2937",
  lt2: "F8FAFC",
  accent1: "2563EB",
  accent2: "DC2626",
  accent3: "16A34A",
  accent4: "F97316",
  accent5: "7C3AED",
  accent6: "0891B2",
  hlink: "2563EB",
  folHlink: "7C3AED",
} as const;

export const DEFAULT_COLOR_MAP = {
  bg1: "lt1",
  tx1: "dk1",
  bg2: "lt2",
  tx2: "dk2",
  accent1: "accent1",
  accent2: "accent2",
  accent3: "accent3",
  accent4: "accent4",
  accent5: "accent5",
  accent6: "accent6",
  hlink: "hlink",
  folHlink: "folHlink",
} as const;

export function defaultThemeProjectionTrace(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  themePartId?: PackagePartId;
  slideMasterPartId?: PackagePartId;
  slideLayoutPartIdBySlideId?: ReadonlyMap<GraphNodeId, PackagePartId>;
}): PptxThemeProjectionTrace {
  const defaultStyleDecisions: PptxThemeDefaultStyleDecision[] = [];
  const concreteDrawingProperties: PptxThemeConcreteDrawingPropertyMapping[] = [];
  const unprojected: PptxThemeUnprojectedMapping[] = [];
  const parentById = parentMapFor(input.graph);

  for (const [graphNodeId, resolved] of input.resolvedStyles) {
    const node = input.graph.nodes.get(graphNodeId);
    if (!node) {
      continue;
    }

    for (const [property, entry] of Object.entries(resolved.properties)) {
      if (entry.source.layer !== "theme") {
        continue;
      }

      const decision = themeDefaultStyleDecision({
        graphNodeId,
        node,
        defaultKey: entry.source.defaultKey,
        property,
        resolvedValue: entry.value,
      });
      defaultStyleDecisions.push(decision);

      if (decision.projectedAs === "unsupportedSemanticFallback") {
        unprojected.push({
          source: "themeDefault",
          graphNodeId,
          ...(node.authoredTag ? { authoredTag: node.authoredTag } : {}),
          ...(node.origin.source ? { origin: node.origin.source } : {}),
          defaultKey: entry.source.defaultKey,
          property,
          projectedAs: "unprojected",
          resolvedValue: entry.value,
          reason: decision.reason,
        });
        continue;
      }

      if (decision.projectedAs !== "concreteDrawingProperty") {
        continue;
      }

      concreteDrawingProperties.push({
        graphNodeId,
        ...(node.authoredTag ? { authoredTag: node.authoredTag } : {}),
        ...(node.origin.source ? { source: node.origin.source } : {}),
        defaultKey: entry.source.defaultKey,
        property,
        projectedAs: "concreteDrawingProperty",
        resolvedValue: entry.value,
      });
    }
  }

  concreteDrawingProperties.sort((left, right) => {
    const nodeOrder = String(left.graphNodeId).localeCompare(String(right.graphNodeId));
    return nodeOrder === 0 ? left.property.localeCompare(right.property) : nodeOrder;
  });
  defaultStyleDecisions.sort((left, right) => {
    const nodeOrder = String(left.graphNodeId).localeCompare(String(right.graphNodeId));
    return nodeOrder === 0 ? left.property.localeCompare(right.property) : nodeOrder;
  });
  unprojected.sort((left, right) => {
    const nodeOrder = String(left.graphNodeId).localeCompare(String(right.graphNodeId));
    return nodeOrder === 0 ? left.property.localeCompare(right.property) : nodeOrder;
  });

  const valueGroupFingerprints: PptxThemeValueGroupFingerprint[] = [
    themeValueGroupFingerprint({
      group: "colorScheme",
      source: "deckjsx-default",
      projectedAs: "themeSupport",
      value: DEFAULT_THEME_COLORS,
      itemCount: Object.keys(DEFAULT_THEME_COLORS).length,
    }),
    themeValueGroupFingerprint({
      group: "fontScheme",
      source: "deckjsx-default",
      projectedAs: "themeSupport",
      value: { majorLatin: "Aptos Display", minorLatin: "Aptos" },
      itemCount: 2,
    }),
    themeValueGroupFingerprint({
      group: "formatScheme",
      source: "deckjsx-default",
      projectedAs: "themeSupport",
      value: { name: "deckjsx" },
      itemCount: 1,
    }),
    themeValueGroupFingerprint({
      group: "themeDefaults",
      source: "themeDefault",
      projectedAs: "themeProjectionTrace",
      value: { concreteDrawingProperties, defaultStyleDecisions, unprojected },
      itemCount: defaultStyleDecisions.length,
    }),
  ];
  const wholeThemeGroups: readonly PptxThemeValueGroup[] = [
    "colorScheme",
    "fontScheme",
    "formatScheme",
    "themeDefaults",
  ];
  const effectiveInheritance = themeEffectiveInheritanceTrace({
    graph: input.graph,
    parentById,
    concreteDrawingProperties,
    unprojected,
    themePartId: input.themePartId,
    slideMasterPartId: input.slideMasterPartId,
    slideLayoutPartIdBySlideId: input.slideLayoutPartIdBySlideId,
  });
  const referenceSerialization = themeReferenceSerializationChoices({
    concreteDrawingProperties,
    themePartId: input.themePartId,
  });

  return {
    wholeThemeMappings: [
      {
        source: "deckjsx-default",
        projectedAs: "themePart",
        purpose: "default",
        ...(input.themePartId ? { themePartId: input.themePartId } : {}),
        groups: wholeThemeGroups,
        fingerprint: fingerprintString(
          stableJson({
            purpose: "default",
            source: "deckjsx-default",
            valueGroupFingerprints,
          }),
        ),
      },
    ],
    valueGroupFingerprints,
    supportMappings: [
      {
        source: "deckjsx-default",
        projectedAs: "themeSupport",
        groups: ["colorScheme", "fontScheme", "formatScheme"],
      },
    ],
    defaultStyleDecisions,
    concreteDrawingProperties,
    unprojected,
    effectiveInheritance,
    referenceSerialization,
  };
}

export function collectPptxThemeProjectionDiagnostics(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
}): Diagnostics {
  const trace = defaultThemeProjectionTrace(input);
  return createDiagnostics(
    trace.unprojected.map((mapping) =>
      diagnostic({
        severity: "warning",
        code: "W_PROJECT_UNPROJECTED_PPTX_THEME_DEFAULT",
        title: "theme default was preserved as unprojected pptx theme mapping",
        message: mapping.reason,
        labels: [
          {
            path: `graph.nodes.${mapping.graphNodeId}.style.${mapping.property}`,
            message: `Theme default ${mapping.defaultKey}.${mapping.property} is not projected into PPTX theme support or concrete drawing properties.`,
            severity: "primary",
          },
        ],
        notes: [
          `graphNodeId=${mapping.graphNodeId}`,
          mapping.authoredTag ? `authoredTag=${mapping.authoredTag}` : undefined,
          `defaultKey=${mapping.defaultKey}`,
          `property=${mapping.property}`,
          `projectedAs=${mapping.projectedAs}`,
          `value=${semanticThemeValue(mapping.resolvedValue)}`,
        ].filter((note): note is string => note !== undefined),
        help: [
          "The value still participates in resolved style and node-level unsupported semantic diagnostics, but Pptx Theme Projection does not claim it as PPTX theme support or a concrete drawing-property mapping.",
        ],
      }),
    ),
  );
}

function themeValueGroupFingerprint(input: {
  group: PptxThemeValueGroup;
  source: "deckjsx-default" | "themeDefault";
  projectedAs: "themeSupport" | "themeProjectionTrace";
  value: unknown;
  itemCount: number;
}): PptxThemeValueGroupFingerprint {
  return {
    group: input.group,
    source: input.source,
    projectedAs: input.projectedAs,
    fingerprint: fingerprintString(
      stableJson({
        group: input.group,
        projectedAs: input.projectedAs,
        source: input.source,
        value: input.value,
      }),
    ),
    itemCount: input.itemCount,
  };
}

function semanticThemeValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

const THEME_LAYOUT_INPUT_PROPERTIES = new Set([
  "alignContent",
  "alignItems",
  "alignSelf",
  "aspectRatio",
  "bottom",
  "boxSizing",
  "columnGap",
  "display",
  "flexBasis",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexWrap",
  "gap",
  "grid",
  "gridArea",
  "gridAutoColumns",
  "gridAutoFlow",
  "gridAutoRows",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnStart",
  "gridRow",
  "gridRowEnd",
  "gridRowStart",
  "gridTemplate",
  "gridTemplateAreas",
  "gridTemplateColumns",
  "gridTemplateRows",
  "height",
  "inset",
  "justifyContent",
  "justifyItems",
  "justifySelf",
  "left",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "order",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "placeContent",
  "placeItems",
  "placeSelf",
  "position",
  "right",
  "rowGap",
  "top",
  "width",
]);

const THEME_DRAWING_METADATA_PROPERTIES = new Set([
  "flipH",
  "flipV",
  "opacity",
  "overflow",
  "rotation",
  "transform",
  "transformOrigin",
  "visibility",
  "zIndex",
]);

const THEME_FILTERED_STATE_PROPERTIES = new Set(["display"]);

const THEME_UNSUPPORTED_SEMANTIC_PROPERTIES = new Set(["filter", "isolation", "mixBlendMode"]);

const THEME_STYLE_INPUT_PROPERTIES = new Set(["whiteSpace", "wordBreak", "overflowWrap"]);

function themeDefaultStyleDecision(input: {
  graphNodeId: GraphNodeId;
  node: SemanticNode;
  defaultKey: string;
  property: string;
  resolvedValue: StyleDeclarationValue;
}): PptxThemeDefaultStyleDecision {
  const base = {
    source: "themeDefault" as const,
    graphNodeId: input.graphNodeId,
    ...(input.node.authoredTag ? { authoredTag: input.node.authoredTag } : {}),
    ...(input.node.origin.source ? { origin: input.node.origin.source } : {}),
    defaultKey: input.defaultKey,
    property: input.property,
    resolvedValue: input.resolvedValue,
  };

  const unprojectedReason = unprojectedThemeDefaultReason(input.property, input.resolvedValue);
  if (unprojectedReason || THEME_UNSUPPORTED_SEMANTIC_PROPERTIES.has(input.property)) {
    return {
      ...base,
      decision: "preserveUnsupportedSemantic",
      projectedAs: "unsupportedSemanticFallback",
      reason:
        unprojectedReason ??
        "The Theme Default is preserved through unsupported semantic fallback data rather than projected as a PPTX concrete drawing property.",
    };
  }

  if (input.property === "layout" || input.property === "x" || input.property === "y") {
    return {
      ...base,
      decision: "preserveUnsupportedSemantic",
      projectedAs: "unsupportedSemanticFallback",
      reason:
        "The Theme Default uses a property that is not part of the public authoring style API, so PPTX theme projection preserves it as an unprojected mapping instead of treating it as layout input.",
    };
  }

  if (THEME_FILTERED_STATE_PROPERTIES.has(input.property) && input.resolvedValue === "none") {
    return {
      ...base,
      decision: "projectFilteredState",
      projectedAs: "filteredProjectionInput",
      reason:
        "The Theme Default controls projection filtering rather than a concrete PPTX drawing property.",
    };
  }

  if (THEME_LAYOUT_INPUT_PROPERTIES.has(input.property)) {
    return {
      ...base,
      decision: "projectLayoutInput",
      projectedAs: "layoutInput",
      reason:
        "The Theme Default participates in layout resolution before PPTX drawing values are emitted.",
    };
  }

  if (THEME_DRAWING_METADATA_PROPERTIES.has(input.property)) {
    return {
      ...base,
      decision: "projectDrawingMetadata",
      projectedAs: "drawingMetadata",
      reason:
        "The Theme Default projects into drawing metadata such as paint order, visibility, opacity, or transform state.",
    };
  }

  if (THEME_STYLE_INPUT_PROPERTIES.has(input.property)) {
    return {
      ...base,
      decision: "preserveAsStyleInput",
      projectedAs: "styleInput",
      reason:
        "The Theme Default remains a resolved style input for projection behavior without becoming a direct PPTX drawing property.",
    };
  }

  return {
    ...base,
    decision: "projectConcreteDrawingProperty",
    projectedAs: "concreteDrawingProperty",
    reason:
      "The Theme Default won resolved style resolution and is projected as a concrete PPTX drawing property.",
  };
}

function unprojectedThemeDefaultReason(property: string, value: unknown): string | undefined {
  if (property === "filter" && typeof value === "string" && value.trim().toLowerCase() !== "none") {
    return "CSS filter effects remain resolved style inputs and unsupported semantic warnings, but v0.8 does not project them into PPTX theme support or concrete drawing properties.";
  }

  if (
    property === "mixBlendMode" &&
    typeof value === "string" &&
    value.trim().toLowerCase() !== "normal"
  ) {
    return "CSS blend modes require compositing behavior outside the current PPTX theme/default projection, so the Theme Default is preserved as an unprojected mapping.";
  }

  if (property === "isolation" && value === "isolate") {
    return "CSS isolation creates a compositing group outside the current PPTX theme/default projection, so the Theme Default is preserved as an unprojected mapping.";
  }

  return undefined;
}

function themeReferenceSerializationChoices(input: {
  concreteDrawingProperties: readonly PptxThemeConcreteDrawingPropertyMapping[];
  themePartId?: PackagePartId;
}): readonly PptxThemeReferenceSerializationChoice[] {
  return input.concreteDrawingProperties
    .map((mapping) => themeReferenceSerializationChoiceForMapping(mapping, input.themePartId))
    .sort((left, right) => {
      const nodeOrder = String(left.graphNodeId).localeCompare(String(right.graphNodeId));
      return nodeOrder === 0 ? left.property.localeCompare(right.property) : nodeOrder;
    });
}

function themeReferenceSerializationChoiceForMapping(
  mapping: PptxThemeConcreteDrawingPropertyMapping,
  themePartId: PackagePartId | undefined,
): PptxThemeReferenceSerializationChoice {
  const base = {
    source: "themeDefault" as const,
    graphNodeId: mapping.graphNodeId,
    ...(mapping.authoredTag ? { authoredTag: mapping.authoredTag } : {}),
    ...(mapping.source ? { origin: mapping.source } : {}),
    defaultKey: mapping.defaultKey,
    property: mapping.property,
    resolvedValue: mapping.resolvedValue,
  };
  const colorCandidate = colorSchemeCandidateFor(mapping.resolvedValue, themePartId);
  if (isColorThemeReferenceProperty(mapping.property)) {
    return {
      ...base,
      currentSerialization: "srgbClr",
      decision: colorCandidate ? "deferThemeReferenceSerialization" : "noThemeReferenceCandidate",
      ...(colorCandidate ? { candidate: colorCandidate } : {}),
      reason: colorCandidate
        ? "The resolved Theme Default color matches a PPTX theme color, but v0.8 emits the concrete sRGB color while preserving the scheme-color candidate for future theme-reference serialization."
        : "The resolved Theme Default color does not match the default PPTX color scheme, so v0.8 emits it as a concrete sRGB color.",
    };
  }

  if (mapping.property === "fontFamily") {
    const fontCandidate = fontSchemeCandidateFor(mapping.resolvedValue, themePartId);
    return {
      ...base,
      currentSerialization: "latinTypeface",
      decision: fontCandidate ? "deferThemeReferenceSerialization" : "noThemeReferenceCandidate",
      ...(fontCandidate ? { candidate: fontCandidate } : {}),
      reason: fontCandidate
        ? "The resolved Theme Default font matches the PPTX font scheme, but v0.8 emits the concrete latin typeface while preserving the font-scheme candidate for future theme-reference serialization."
        : "The resolved Theme Default font does not match the default PPTX font scheme, so v0.8 emits it as a concrete latin typeface.",
    };
  }

  return {
    ...base,
    currentSerialization: "concreteDrawingValue",
    decision: "emitConcreteValue",
    reason:
      "The Theme Default property is projected as a concrete drawing value and has no PPTX theme-reference serialization form in the current v0.8 projection.",
  };
}

function isColorThemeReferenceProperty(property: string): boolean {
  return (
    property === "color" ||
    property === "backgroundColor" ||
    property === "fill" ||
    property === "stroke" ||
    property === "strokeColor" ||
    property === "borderColor" ||
    property === "outlineColor" ||
    property === "textDecorationColor"
  );
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : undefined;
}

function colorSchemeCandidateFor(
  value: unknown,
  themePartId: PackagePartId | undefined,
): PptxThemeReferenceSerializationChoice["candidate"] | undefined {
  const color = normalizeHexColor(value);
  if (!color) {
    return undefined;
  }
  const entry = Object.entries(DEFAULT_THEME_COLORS).find(
    ([, themeColor]) => themeColor.toUpperCase() === color,
  );
  return entry
    ? {
        kind: "schemeColor",
        value: entry[0],
        ...(themePartId ? { themePartId } : {}),
      }
    : undefined;
}

function fontSchemeCandidateFor(
  value: unknown,
  themePartId: PackagePartId | undefined,
): PptxThemeReferenceSerializationChoice["candidate"] | undefined {
  if (value === "Aptos Display") {
    return { kind: "fontScheme", value: "majorLatin", ...(themePartId ? { themePartId } : {}) };
  }
  if (value === "Aptos") {
    return { kind: "fontScheme", value: "minorLatin", ...(themePartId ? { themePartId } : {}) };
  }
  return undefined;
}

function parentMapFor(graph: SemanticAuthorGraph): ReadonlyMap<GraphNodeId, GraphNodeId> {
  const parentById = new Map<GraphNodeId, GraphNodeId>();

  graph.nodes.forEach((node) => {
    const childIds =
      "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];
    childIds.forEach((childId) => {
      parentById.set(childId, node.id);
    });
  });

  return parentById;
}

function slideForNode(input: {
  graph: SemanticAuthorGraph;
  parentById: ReadonlyMap<GraphNodeId, GraphNodeId>;
  graphNodeId: GraphNodeId;
}): Extract<SemanticNode, { kind: "slide" }> | undefined {
  let currentId: GraphNodeId | undefined = input.graphNodeId;
  while (currentId) {
    const node = input.graph.nodes.get(currentId);
    if (node?.kind === "slide") {
      return node;
    }
    currentId = input.parentById.get(currentId);
  }
  return undefined;
}

function themeEffectiveInheritanceTrace(input: {
  graph: SemanticAuthorGraph;
  parentById: ReadonlyMap<GraphNodeId, GraphNodeId>;
  concreteDrawingProperties: readonly PptxThemeConcreteDrawingPropertyMapping[];
  unprojected: readonly PptxThemeUnprojectedMapping[];
  themePartId?: PackagePartId;
  slideMasterPartId?: PackagePartId;
  slideLayoutPartIdBySlideId?: ReadonlyMap<GraphNodeId, PackagePartId>;
}): readonly PptxThemeEffectiveInheritanceTrace[] {
  const concrete = input.concreteDrawingProperties.map((mapping) =>
    themeEffectiveInheritanceTraceForMapping({
      graph: input.graph,
      parentById: input.parentById,
      mapping,
      themePartId: input.themePartId,
      slideMasterPartId: input.slideMasterPartId,
      slideLayoutPartIdBySlideId: input.slideLayoutPartIdBySlideId,
      reason:
        "Theme Default won resolved style resolution and was projected as a concrete PPTX drawing property.",
    }),
  );
  const unprojected = input.unprojected.map((mapping) =>
    themeEffectiveInheritanceTraceForMapping({
      graph: input.graph,
      parentById: input.parentById,
      mapping,
      themePartId: input.themePartId,
      slideMasterPartId: input.slideMasterPartId,
      slideLayoutPartIdBySlideId: input.slideLayoutPartIdBySlideId,
      reason: mapping.reason,
    }),
  );

  return [...concrete, ...unprojected].sort((left, right) => {
    const nodeOrder = String(left.graphNodeId).localeCompare(String(right.graphNodeId));
    return nodeOrder === 0 ? left.property.localeCompare(right.property) : nodeOrder;
  });
}

function themeEffectiveInheritanceTraceForMapping(input: {
  graph: SemanticAuthorGraph;
  parentById: ReadonlyMap<GraphNodeId, GraphNodeId>;
  mapping: PptxThemeConcreteDrawingPropertyMapping | PptxThemeUnprojectedMapping;
  themePartId?: PackagePartId;
  slideMasterPartId?: PackagePartId;
  slideLayoutPartIdBySlideId?: ReadonlyMap<GraphNodeId, PackagePartId>;
  reason: string;
}): PptxThemeEffectiveInheritanceTrace {
  const slide = slideForNode({
    graph: input.graph,
    parentById: input.parentById,
    graphNodeId: input.mapping.graphNodeId,
  });
  const slideLayoutPartId = slide ? input.slideLayoutPartIdBySlideId?.get(slide.id) : undefined;
  const origin =
    input.mapping.projectedAs === "concreteDrawingProperty"
      ? input.mapping.source
      : input.mapping.origin;

  return {
    source: "themeDefault",
    graphNodeId: input.mapping.graphNodeId,
    ...(input.mapping.authoredTag ? { authoredTag: input.mapping.authoredTag } : {}),
    ...(origin ? { origin } : {}),
    defaultKey: input.mapping.defaultKey,
    property: input.mapping.property,
    projectedAs: input.mapping.projectedAs,
    resolvedValue: input.mapping.resolvedValue,
    ...(input.themePartId ? { themePartId: input.themePartId } : {}),
    ...(input.slideMasterPartId ? { slideMasterPartId: input.slideMasterPartId } : {}),
    ...(slideLayoutPartId ? { slideLayoutPartId } : {}),
    ...(slide ? { slidePartId: slidePartIdFor(slide) } : {}),
    inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide", "drawing"],
    reason: input.reason,
  };
}

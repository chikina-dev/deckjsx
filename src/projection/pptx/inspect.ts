import type { Diagnostics } from "../../diagnostics";
import type { AssetEntityId, GraphNodeId, SemanticAuthorGraph, SemanticNode } from "../../graph";
import type { ResolvedStyleDeclaration, ResolvedStyleMap } from "../../style/resolve";
import { walkElements } from "./drawing";
import { isContentTypesPayload, isInspectableThemePayload, isRecord } from "./package-candidates";
import { packageDependencyEdges, relationshipTargets } from "./package-parts";
import { isPptxMediaPart } from "./model";
import type {
  ProjectInspectionBackgroundLayerSummary,
  ProjectInspectionAdapterLimitation,
  ProjectInspectionComposedPaintOrderEntry,
  ProjectInspectionDetails,
  ProjectInspectionEffectiveProjectedStyleEntry,
  ProjectInspectionElementSummary,
  ProjectInspectionFilteredRecord,
  ProjectInspectionMediaSummary,
  ProjectInspectionPackageDependencyReason,
  ProjectInspectionPackageDependencySummary,
  ProjectInspectionResolvedValues,
  ProjectInspectionRelationshipSummary,
  ProjectInspectionSummary,
  ProjectInspectionUnsupportedSemanticRecord,
  PptxElement,
  PptxElementOrigin,
  PptxPackageModel,
  PptxDrawingNode,
  PptxBackgroundLayer,
} from "./model";

type InspectedDrawingElement = PptxElement &
  Partial<Pick<PptxDrawingNode, "emissionTarget" | "paintOrderIndex">>;

function summarizeBackgroundLayer(
  layer: PptxBackgroundLayer,
): ProjectInspectionBackgroundLayerSummary {
  if (layer.kind === "background-image") {
    return {
      kind: layer.kind,
      frame: layer.frame,
      sourceFrame: layer.sourceFrame,
      sourceKind: layer.source.kind,
      fit: layer.fit,
      ...(layer.size ? { size: layer.size } : {}),
      repeat: layer.repeat,
      objectPosition: layer.objectPosition,
      ...(layer.transparency !== undefined ? { transparency: layer.transparency } : {}),
    };
  }

  if (layer.kind === "linear-gradient") {
    return {
      kind: layer.kind,
      ...(layer.frame ? { frame: layer.frame } : {}),
      angle: layer.angle,
      stops: layer.stops,
    };
  }

  if (layer.kind === "radial-gradient") {
    return {
      kind: layer.kind,
      ...(layer.frame ? { frame: layer.frame } : {}),
      shape: layer.shape,
      center: layer.center,
      radius: layer.radius,
      stops: layer.stops,
    };
  }

  return {
    kind: layer.kind,
    ...(layer.frame ? { frame: layer.frame } : {}),
    color: layer.color,
    ...(layer.transparency !== undefined ? { transparency: layer.transparency } : {}),
  };
}

function summarizeBackgroundLayers(
  layers: readonly PptxBackgroundLayer[] | undefined,
): ProjectInspectionBackgroundLayerSummary[] | undefined {
  return layers?.length ? layers.map(summarizeBackgroundLayer) : undefined;
}

function effectiveProjectedValues(element: PptxElement): ProjectInspectionResolvedValues {
  const backgroundLayers =
    "backgroundLayers" in element ? summarizeBackgroundLayers(element.backgroundLayers) : undefined;

  return {
    frame: element.frame,
    ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
    ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
    ...(element.flipH !== undefined ? { flipH: element.flipH } : {}),
    ...(element.flipV !== undefined ? { flipV: element.flipV } : {}),
    ...(element.zIndex !== undefined ? { zIndex: element.zIndex } : {}),
    ...(element.measurement ? { measurement: element.measurement } : {}),
    ...(element.clip ? { clip: element.clip } : {}),
    ...(backgroundLayers ? { backgroundLayers } : {}),
    ...("edgeStrokes" in element && element.edgeStrokes
      ? { edgeStrokes: element.edgeStrokes }
      : {}),
    ...("outline" in element && element.outline ? { outline: element.outline } : {}),
    ...("generatedStrokes" in element && element.generatedStrokes?.length
      ? { generatedStrokes: element.generatedStrokes }
      : {}),
    ...("fill" in element && element.fill ? { fill: element.fill } : {}),
    ...("stroke" in element && element.stroke ? { stroke: element.stroke } : {}),
    ...(element.kind === "text" ? { textStyle: element.style } : {}),
    ...(element.kind === "image" ? { imageSource: element.source } : {}),
    ...(element.kind === "image" ? { imageObjectPosition: element.objectPosition } : {}),
    ...(element.kind === "video" ? { videoSource: element.source } : {}),
    ...(element.kind === "video" && element.posterSource
      ? { videoPosterSource: element.posterSource }
      : {}),
    ...(element.kind === "video" ? { videoObjectPosition: element.objectPosition } : {}),
    ...(element.unsupportedSemantics?.length
      ? { unsupportedSemantics: element.unsupportedSemantics }
      : {}),
  };
}

function summarizeElement(element: PptxDrawingNode): ProjectInspectionElementSummary {
  const backgroundLayers =
    "backgroundLayers" in element ? summarizeBackgroundLayers(element.backgroundLayers) : undefined;

  return {
    id: element.id,
    kind: element.kind,
    packagePartId: element.packagePartId,
    frame: element.frame,
    emissionTarget: element.emissionTarget,
    paintOrderIndex: element.paintOrderIndex,
    paintOrder: element.paintOrder,
    ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
    ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
    ...(element.flipH !== undefined ? { flipH: element.flipH } : {}),
    ...(element.flipV !== undefined ? { flipV: element.flipV } : {}),
    ...(element.zIndex !== undefined ? { zIndex: element.zIndex } : {}),
    ...(element.visibility ? { visibility: element.visibility } : {}),
    ...(element.measurement ? { measurement: element.measurement } : {}),
    ...(element.clip ? { clip: element.clip } : {}),
    ...(backgroundLayers ? { backgroundLayers } : {}),
    ...("edgeStrokes" in element && element.edgeStrokes
      ? { edgeStrokes: element.edgeStrokes }
      : {}),
    ...("outline" in element && element.outline ? { outline: element.outline } : {}),
    ...("generatedStrokes" in element && element.generatedStrokes?.length
      ? { generatedStrokes: element.generatedStrokes }
      : {}),
    ...(element.layoutAnchor ? { layoutAnchor: element.layoutAnchor } : {}),
    ...(element.kind === "text" && element.content.text
      ? { textPreview: element.content.text.slice(0, 80) }
      : {}),
    origin: element.origin,
    resolvedValues: effectiveProjectedValues(element),
  };
}

function collectDrawingPaintOrderEntries(input: {
  element: InspectedDrawingElement;
  slidePartId: ProjectInspectionComposedPaintOrderEntry["slidePartId"];
  slideId: string;
  parentElementId?: ProjectInspectionComposedPaintOrderEntry["parentElementId"];
  depth: number;
  siblingPath: readonly number[];
  nextOrder: () => number;
}): ProjectInspectionComposedPaintOrderEntry[] {
  const element = input.element;
  const entries: ProjectInspectionComposedPaintOrderEntry[] = [];
  const backgroundLayers = "backgroundLayers" in element ? element.backgroundLayers : undefined;

  if (backgroundLayers?.length) {
    backgroundLayers.forEach((layer, layerIndex) => {
      const backgroundLayer = summarizeBackgroundLayer(layer);
      entries.push({
        source: "backgroundLayer",
        order: input.nextOrder(),
        slidePartId: input.slidePartId,
        slideId: input.slideId,
        packagePartId: element.packagePartId,
        elementId: element.id,
        kind: element.kind,
        backgroundLayer,
        backgroundLayerIndex: layerIndex,
        ...(input.parentElementId ? { parentElementId: input.parentElementId } : {}),
        depth: input.depth,
        siblingPath: [...input.siblingPath, layerIndex],
        ...("frame" in backgroundLayer ? { frame: backgroundLayer.frame } : {}),
        ...(element.emissionTarget ? { emissionTarget: element.emissionTarget } : {}),
        paintOrder: layer.paintOrder,
        ...(element.visibility ? { visibility: element.visibility } : {}),
        origin: element.origin,
      });
    });
  }

  entries.push({
    source: "drawingNode",
    order: input.nextOrder(),
    slidePartId: input.slidePartId,
    slideId: input.slideId,
    packagePartId: element.packagePartId,
    elementId: element.id,
    kind: element.kind,
    ...(input.parentElementId ? { parentElementId: input.parentElementId } : {}),
    depth: input.depth,
    siblingPath: input.siblingPath,
    frame: element.frame,
    ...(element.emissionTarget ? { emissionTarget: element.emissionTarget } : {}),
    ...(element.paintOrderIndex !== undefined ? { paintOrderIndex: element.paintOrderIndex } : {}),
    ...(element.paintOrder ? { paintOrder: element.paintOrder } : {}),
    ...(element.visibility ? { visibility: element.visibility } : {}),
    ...(element.layoutAnchor ? { layoutAnchor: element.layoutAnchor } : {}),
    origin: element.origin,
  });

  if ("generatedStrokes" in element && element.generatedStrokes?.length) {
    element.generatedStrokes.forEach((layer, layerIndex) => {
      entries.push({
        source: "generatedStroke",
        order: input.nextOrder(),
        slidePartId: input.slidePartId,
        slideId: input.slideId,
        packagePartId: element.packagePartId,
        elementId: element.id,
        kind: element.kind,
        generatedStroke: layer,
        generatedLayerIndex: layerIndex,
        ...(input.parentElementId ? { parentElementId: input.parentElementId } : {}),
        depth: input.depth,
        siblingPath: [...input.siblingPath, layerIndex],
        frame: layer.frame,
        ...(element.emissionTarget ? { emissionTarget: element.emissionTarget } : {}),
        paintOrder: layer.paintOrder,
        ...(element.visibility ? { visibility: element.visibility } : {}),
        origin: element.origin,
      });
    });
  }

  if (element.kind === "group") {
    element.children.forEach((child, childIndex) => {
      entries.push(
        ...collectDrawingPaintOrderEntries({
          element: child,
          slidePartId: input.slidePartId,
          slideId: input.slideId,
          parentElementId: element.id,
          depth: input.depth + 1,
          siblingPath: [...input.siblingPath, childIndex],
          nextOrder: input.nextOrder,
        }),
      );
    });
  }

  return entries;
}

function collectEffectiveProjectedStyleEntries(input: {
  element: InspectedDrawingElement;
  slidePartId: ProjectInspectionEffectiveProjectedStyleEntry["slidePartId"];
  slideId: string;
  parentElementId?: ProjectInspectionEffectiveProjectedStyleEntry["parentElementId"];
  depth: number;
  siblingPath: readonly number[];
}): ProjectInspectionEffectiveProjectedStyleEntry[] {
  const element = input.element;
  const entries: ProjectInspectionEffectiveProjectedStyleEntry[] = [
    {
      slidePartId: input.slidePartId,
      slideId: input.slideId,
      packagePartId: element.packagePartId,
      elementId: element.id,
      kind: element.kind,
      ...(input.parentElementId ? { parentElementId: input.parentElementId } : {}),
      depth: input.depth,
      siblingPath: input.siblingPath,
      ...(element.emissionTarget ? { emissionTarget: element.emissionTarget } : {}),
      ...(element.paintOrderIndex !== undefined
        ? { paintOrderIndex: element.paintOrderIndex }
        : {}),
      ...(element.paintOrder ? { paintOrder: element.paintOrder } : {}),
      ...(element.layoutAnchor ? { layoutAnchor: element.layoutAnchor } : {}),
      origin: element.origin,
      values: effectiveProjectedValues(element),
    },
  ];

  if (element.kind === "group") {
    element.children.forEach((child, childIndex) => {
      entries.push(
        ...collectEffectiveProjectedStyleEntries({
          element: child,
          slidePartId: input.slidePartId,
          slideId: input.slideId,
          parentElementId: element.id,
          depth: input.depth + 1,
          siblingPath: [...input.siblingPath, childIndex],
        }),
      );
    });
  }

  return entries;
}

function collectPackageDependencyInvalidation(
  projection: PptxPackageModel,
): ProjectInspectionDetails["packageDependencyInvalidation"] {
  const dependenciesByPartId = new Map<string, ProjectInspectionPackageDependencySummary[]>();
  const dependentsByPartId = new Map<string, ProjectInspectionPackageDependencySummary[]>();

  for (const part of projection.parts) {
    dependenciesByPartId.set(part.id, []);
    dependentsByPartId.set(part.id, []);
  }

  for (const edge of packageDependencyEdges(projection.parts)) {
    dependenciesByPartId.get(edge.ownerPartId)?.push(edge);
    dependentsByPartId.get(edge.targetPartId)?.push(edge);
  }

  const uniqueReasons = (
    edges: readonly ProjectInspectionPackageDependencySummary[],
  ): ProjectInspectionPackageDependencyReason[] => [...new Set(edges.map((edge) => edge.reason))];

  return {
    entries: projection.parts.map((part) => {
      const dependencies = dependenciesByPartId.get(part.id) ?? [];
      const dependents = dependentsByPartId.get(part.id) ?? [];
      return {
        partId: part.id,
        path: part.path,
        category: part.category,
        kind: part.kind,
        ...(part.requirement ? { requirement: part.requirement } : {}),
        ...(part.orderKey ? { orderKey: part.orderKey } : {}),
        ...(part.fingerprint ? { fingerprint: part.fingerprint } : {}),
        ...(part.dependencyFingerprints?.length
          ? { dependencyFingerprintCount: part.dependencyFingerprints.length }
          : {}),
        dependencies,
        dependents,
        dependencyReasons: uniqueReasons(dependencies),
        dependentReasons: uniqueReasons(dependents),
      };
    }),
  };
}

function appendUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function collectPaintFallbackAggregation(
  records: readonly ProjectInspectionUnsupportedSemanticRecord[],
): ProjectInspectionDetails["paintFallbackAggregation"] {
  type MutableEntry = {
    feature: ProjectInspectionUnsupportedSemanticRecord["feature"];
    property: string;
    fallbackStrategy?: NonNullable<
      ProjectInspectionUnsupportedSemanticRecord["fallback"]
    >["strategy"];
    count: number;
    slidePartIds: ProjectInspectionUnsupportedSemanticRecord["slidePartId"][];
    slideIds: string[];
    elementIds: ProjectInspectionUnsupportedSemanticRecord["elementId"][];
    kinds: ProjectInspectionUnsupportedSemanticRecord["kind"][];
    values: string[];
    preserves: string[];
    missing: string[];
    reasons: string[];
    recordIndexes: number[];
  };
  const entriesByKey = new Map<string, MutableEntry>();

  records.forEach((record, recordIndex) => {
    const key = [record.feature, record.property, record.fallback?.strategy ?? ""].join("\u0000");
    let entry = entriesByKey.get(key);
    if (!entry) {
      entry = {
        feature: record.feature,
        property: record.property,
        ...(record.fallback?.strategy ? { fallbackStrategy: record.fallback.strategy } : {}),
        count: 0,
        slidePartIds: [],
        slideIds: [],
        elementIds: [],
        kinds: [],
        values: [],
        preserves: [],
        missing: [],
        reasons: [],
        recordIndexes: [],
      };
      entriesByKey.set(key, entry);
    }

    entry.count += 1;
    appendUnique(entry.slidePartIds, record.slidePartId);
    appendUnique(entry.slideIds, record.slideId);
    appendUnique(entry.elementIds, record.elementId);
    appendUnique(entry.kinds, record.kind);
    appendUnique(entry.values, record.value);
    appendUnique(entry.reasons, record.reason);
    entry.recordIndexes.push(recordIndex);
    record.fallback?.preserves.forEach((value) => appendUnique(entry.preserves, value));
    record.fallback?.missing.forEach((value) => appendUnique(entry.missing, value));
  });

  return { entries: [...entriesByKey.values()] };
}

function collectThemeProjectionDetails(
  projection: PptxPackageModel,
): ProjectInspectionDetails["themeProjections"] {
  return {
    entries: projection.parts.flatMap((part) => {
      if (part.kind !== "theme" || !isInspectableThemePayload(part.payload)) {
        return [];
      }

      const payload = part.payload;
      const trace = payload.projection.trace;
      return [
        {
          partId: part.id,
          path: part.path,
          name: payload.name,
          projectionId: payload.projection.id,
          purpose: payload.projection.purpose,
          source: payload.projection.source,
          colorSchemeName: payload.colorScheme.name,
          fontSchemeName: payload.fontScheme.name,
          formatSchemeName: payload.formatScheme.name,
          wholeThemeMappings: trace.wholeThemeMappings,
          valueGroupFingerprints: trace.valueGroupFingerprints,
          supportMappings: trace.supportMappings,
          defaultStyleDecisionCount: trace.defaultStyleDecisions.length,
          concreteDrawingPropertyCount: trace.concreteDrawingProperties.length,
          unprojectedCount: trace.unprojected.length,
          effectiveInheritanceCount: trace.effectiveInheritance.length,
          referenceSerializationCount: trace.referenceSerialization.length,
          defaultStyleDecisions: trace.defaultStyleDecisions,
          concreteDrawingProperties: trace.concreteDrawingProperties,
          unprojected: trace.unprojected,
          effectiveInheritance: trace.effectiveInheritance,
          referenceSerialization: trace.referenceSerialization,
        },
      ];
    }),
  };
}

function collectProjectInspectionDetails(
  projection: PptxPackageModel,
  options: { unsupportedSemantics: readonly ProjectInspectionUnsupportedSemanticRecord[] },
): ProjectInspectionDetails {
  return {
    composedPaintOrder: projection.slides.map((slide) => {
      let order = 0;
      const nextOrder = () => order++;
      const backgroundLayerEntries =
        slide.payload.backgroundLayers?.map((layer, layerIndex) => ({
          source: "backgroundLayer" as const,
          order: nextOrder(),
          slidePartId: slide.id,
          slideId: slide.payload.slideId,
          packagePartId: slide.id,
          frame: "frame" in layer ? layer.frame : undefined,
          backgroundLayer: summarizeBackgroundLayer(layer),
          backgroundLayerIndex: layerIndex,
          paintOrder: layer.paintOrder,
          siblingPath: [layerIndex],
        })) ?? [];
      const drawingEntries = slide.payload.drawing.children.flatMap((element, elementIndex) =>
        collectDrawingPaintOrderEntries({
          element,
          slidePartId: slide.id,
          slideId: slide.payload.slideId,
          depth: 0,
          siblingPath: [elementIndex],
          nextOrder,
        }),
      );

      return {
        slidePartId: slide.id,
        slideId: slide.payload.slideId,
        ...(slide.payload.name ? { name: slide.payload.name } : {}),
        entries: [...backgroundLayerEntries, ...drawingEntries],
      };
    }),
    effectiveProjectedStyles: projection.slides.map((slide) => ({
      slidePartId: slide.id,
      slideId: slide.payload.slideId,
      ...(slide.payload.name ? { name: slide.payload.name } : {}),
      entries: slide.payload.drawing.children.flatMap((element, elementIndex) =>
        collectEffectiveProjectedStyleEntries({
          element,
          slidePartId: slide.id,
          slideId: slide.payload.slideId,
          depth: 0,
          siblingPath: [elementIndex],
        }),
      ),
    })),
    packageDependencyInvalidation: collectPackageDependencyInvalidation(projection),
    paintFallbackAggregation: collectPaintFallbackAggregation(options.unsupportedSemantics),
    themeProjections: collectThemeProjectionDetails(projection),
  };
}

function summarizeMedia(projection: PptxPackageModel): ProjectInspectionMediaSummary[] {
  const media: ProjectInspectionMediaSummary[] = [];
  const mediaPartById = new Map(
    projection.parts.flatMap((part) => (isPptxMediaPart(part) ? [[part.id, part] as const] : [])),
  );

  for (const slide of projection.slides) {
    walkElements(slide.payload.drawing.children, (element) => {
      if (element.kind !== "image") {
        return;
      }
      const mediaPart = element.mediaPartId ? mediaPartById.get(element.mediaPartId) : undefined;
      media.push({
        partId: element.mediaPartId,
        ...(mediaPart ? { partPath: mediaPart.path } : {}),
        elementId: element.id,
        sourceKind: element.source.kind,
        ...(mediaPart?.payload.metadata ? { metadata: mediaPart.payload.metadata } : {}),
        origin: element.origin,
      });
    });
  }

  return media;
}

function collectUnsupportedSemanticRecords(
  projection: PptxPackageModel,
): ProjectInspectionUnsupportedSemanticRecord[] {
  const records: ProjectInspectionUnsupportedSemanticRecord[] = [];

  const visit = (
    element: PptxElement,
    slide: PptxPackageModel["slides"][number],
    drawingNodeContext?: PptxDrawingNode,
  ): void => {
    for (const semantic of element.unsupportedSemantics ?? []) {
      records.push({
        ...semantic,
        elementId: element.id,
        kind: element.kind,
        packagePartId: element.packagePartId,
        slidePartId: slide.id,
        slideId: slide.payload.slideId,
        origin: element.origin,
        ...(drawingNodeContext
          ? {
              emissionTarget: drawingNodeContext.emissionTarget,
              paintOrderIndex: drawingNodeContext.paintOrderIndex,
            }
          : {}),
        ...(element.paintOrder ? { paintOrder: element.paintOrder } : {}),
      });
    }

    if (element.kind === "group") {
      element.children.forEach((child) => visit(child, slide));
    }
  };

  for (const slide of projection.slides) {
    slide.payload.drawing.children.forEach((element) => visit(element, slide, element));
  }

  return records;
}

function styleFor(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): Readonly<ResolvedStyleDeclaration> {
  return resolvedStyles.get(node.id)?.style ?? {};
}

function isDisplayNoneNode(input: {
  node: SemanticNode;
  resolvedStyles: ResolvedStyleMap;
}): boolean {
  return styleFor(input.node, input.resolvedStyles).display === "none";
}

function rawTextForNode(graph: SemanticAuthorGraph, node: SemanticNode): string | undefined {
  if (node.kind === "textRun") {
    return node.text;
  }

  if (node.kind !== "text") {
    return undefined;
  }

  const text = node.inlineChildren
    .map((childId) => {
      const child = graph.nodes.get(childId);
      return child ? rawTextForNode(graph, child) : undefined;
    })
    .filter((value): value is string => value !== undefined)
    .join("");

  return text.length > 0 ? text : undefined;
}

function originFor(node: SemanticNode): PptxElementOrigin {
  const videoAssetIds =
    node.kind === "video"
      ? [node.assetRef, node.posterAssetRef].filter((id): id is AssetEntityId => id !== undefined)
      : [];

  return {
    graphNodeIds: [node.id],
    ...(node.styleRef ? { styleEntityIds: [node.styleRef] } : {}),
    ...(node.kind === "image" && node.assetRef ? { assetEntityIds: [node.assetRef] } : {}),
    ...(videoAssetIds.length > 0 ? { assetEntityIds: videoAssetIds } : {}),
    ...(node.origin.source ? { source: node.origin.source } : {}),
  };
}

function collectFilteredProjectionRecords(input: {
  projection: PptxPackageModel;
  graph?: SemanticAuthorGraph;
  resolvedStyles?: ResolvedStyleMap;
}): ProjectInspectionFilteredRecord[] {
  if (!input.graph || !input.resolvedStyles) {
    return [];
  }

  const records: ProjectInspectionFilteredRecord[] = [];
  const document = input.graph.nodes.get(input.graph.documentId);
  const slideIds = document?.kind === "document" ? document.children : [];
  const slideByGraphId = new Map(
    input.projection.slides.flatMap((slide) => {
      const graphNodeId = slide.origin?.graphNodeIds?.[0];
      return graphNodeId ? [[graphNodeId, slide] as const] : [];
    }),
  );

  const visit = (nodeId: GraphNodeId, slide: PptxPackageModel["slides"][number]): void => {
    const node = input.graph?.nodes.get(nodeId);
    if (!node || !input.graph || !input.resolvedStyles) {
      return;
    }

    if (isDisplayNoneNode({ node, resolvedStyles: input.resolvedStyles })) {
      const textPreview = rawTextForNode(input.graph, node)?.slice(0, 80);
      records.push({
        reason: "displayNone",
        kind: node.kind,
        graphNodeId: node.id,
        slidePartId: slide.id,
        slideId: slide.payload.slideId,
        ...(textPreview ? { textPreview } : {}),
        origin: originFor(node),
      });
      return;
    }

    if (node.kind === "container") {
      node.children.forEach((childId) => visit(childId, slide));
    }
  };

  slideIds.forEach((slideId) => {
    const slideNode = input.graph?.nodes.get(slideId);
    const slide = slideByGraphId.get(slideId);
    if (slideNode?.kind !== "slide" || !slide) {
      return;
    }

    slideNode.children.forEach((childId) => visit(childId, slide));
  });

  return records;
}

function payloadKind(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.kind === "string" ? value.kind : undefined;
}

function summarizePackageTopology(projection: PptxPackageModel): {
  readonly relationships: readonly ProjectInspectionRelationshipSummary[];
  readonly packageDependencies: readonly ProjectInspectionPackageDependencySummary[];
} {
  const relationships: ProjectInspectionRelationshipSummary[] = [];

  for (const part of projection.parts) {
    for (const relationship of relationshipTargets(part)) {
      relationships.push({
        ownerPartId: part.id,
        ownerPath: part.path,
        id: relationship.id,
        type: relationship.type,
        target: relationship.target,
        targetPath: relationship.targetPath,
        ...(relationship.targetMode ? { targetMode: relationship.targetMode } : {}),
        ...(relationship.targetPartId ? { targetPartId: relationship.targetPartId } : {}),
      });
    }
  }

  return { relationships, packageDependencies: packageDependencyEdges(projection.parts) };
}

export function summarizePptxPackage(
  projection: PptxPackageModel,
  options: {
    diagnostics?: Diagnostics;
    adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
    graph?: SemanticAuthorGraph;
    includeDetails?: boolean;
    resolvedStyles?: ResolvedStyleMap;
  } = {},
): ProjectInspectionSummary {
  const packageTopology = summarizePackageTopology(projection);
  const unsupportedSemantics = collectUnsupportedSemanticRecords(projection);
  const parts = projection.parts.map((part) => {
    const partPayloadKind = payloadKind(part.payload);
    return {
      id: part.id,
      category: part.category,
      kind: part.kind,
      path: part.path,
      ...(part.payload && typeof part.payload === "object" ? { hasStructuredPayload: true } : {}),
      ...(partPayloadKind ? { payloadKind: partPayloadKind } : {}),
      ...(part.requirement ? { requirement: part.requirement } : {}),
      ...(part.orderKey ? { orderKey: part.orderKey } : {}),
      ...(part.fingerprint ? { fingerprint: part.fingerprint } : {}),
      ...(part.dependencyFingerprints
        ? { dependencyFingerprintCount: part.dependencyFingerprints.length }
        : {}),
      ...(part.relationships ? { relationshipCount: part.relationships.length } : {}),
      ...(part.kind === "content-types" && isContentTypesPayload(part.payload)
        ? { contentTypeCount: part.payload.defaults.length + part.payload.overrides.length }
        : {}),
    };
  });

  return {
    format: "pptx",
    parts,
    relationships: packageTopology.relationships,
    packageDependencies: packageTopology.packageDependencies,
    media: summarizeMedia(projection),
    filtered: collectFilteredProjectionRecords({
      projection,
      graph: options.graph,
      resolvedStyles: options.resolvedStyles,
    }),
    unsupportedSemantics,
    slides: projection.slides.map((slide) => ({
      partId: slide.id,
      slideId: slide.payload.slideId,
      name: slide.payload.name,
      ...(slide.payload.backgroundLayers
        ? { backgroundLayers: summarizeBackgroundLayers(slide.payload.backgroundLayers) }
        : {}),
      elements: slide.payload.drawing.children.map(summarizeElement),
    })),
    pptx: {
      packageParts: parts,
      relationshipCount: packageTopology.relationships.length,
      packageDependencyCount: packageTopology.packageDependencies.length,
    },
    diagnostics:
      options.diagnostics?.items.map((item) => ({
        severity: item.severity,
        code: item.code,
        title: item.title,
      })) ?? [],
    adapterLimitations: options.adapterLimitations ?? [],
    ...(options.includeDetails
      ? { details: collectProjectInspectionDetails(projection, { unsupportedSemantics }) }
      : {}),
  };
}

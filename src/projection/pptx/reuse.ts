import type { DeckOptions } from "@/src/authoring/options";
import type { AssetEntityId, GraphNodeId, SemanticAuthorGraph, StyleEntityId } from "@/src/graph";
import type {
  AssetArtifact,
  DefinedGraphArtifact,
  DefinedProjectionArtifact,
} from "@/src/pipeline/artifacts";
import type { ResolvedStyleMap } from "@/src/style/resolve";
import type { SlideProjectionFingerprintSnapshot } from "./artifact";
import { fingerprintString, stableJson } from "./fingerprint";
import { isPptxPackageModel, type PptxPackageModel } from "./model";

export type PptxProjectionReusePlan = {
  readonly previousProjection: PptxPackageModel;
  readonly slideNodeIds: ReadonlySet<GraphNodeId>;
  readonly slideProjectionFingerprints: ReadonlyMap<
    GraphNodeId,
    SlideProjectionFingerprintSnapshot
  >;
};

export function incrementalProjectionReusePlan(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  assets: ReadonlyMap<AssetEntityId, AssetArtifact>;
  previousOptions?: DeckOptions;
  previousAssets?: ReadonlyMap<AssetEntityId, AssetArtifact>;
  previousGraph?: DefinedGraphArtifact;
  previousProjection?: DefinedProjectionArtifact;
  staleAssetEntityIds?: ReadonlySet<AssetEntityId>;
}): PptxProjectionReusePlan | undefined {
  if (!input.previousGraph || !input.previousProjection) {
    return undefined;
  }
  const previousGraph = input.previousGraph;
  const previousProjectionArtifact = input.previousProjection;
  const previousProjection = previousProjectionArtifact.projection;
  const previousOptions = input.previousOptions;
  const previousAssets = input.previousAssets;
  if (
    previousProjectionArtifact.format !== "pptx" ||
    !isPptxPackageModel(previousProjection as PptxPackageModel) ||
    !previousOptions ||
    !previousAssets
  ) {
    return undefined;
  }
  const previousPptxProjection = previousProjection as PptxPackageModel;

  const document = input.graph.nodes.get(input.graph.documentId);
  const previousDocument = previousGraph.graph.nodes.get(previousGraph.graph.documentId);
  if (document?.kind !== "document" || previousDocument?.kind !== "document") {
    return undefined;
  }
  if (document.children.length !== previousDocument.children.length) {
    return undefined;
  }

  const slideProjectionFingerprints = slideProjectionFingerprintSnapshots({
    graph: input.graph,
    resolvedStyles: input.resolvedStyles,
    options: input.options,
    assets: input.assets,
  });
  const slideNodeIds = new Set<GraphNodeId>();
  document.children.forEach((slideNodeId, index) => {
    if (previousDocument.children[index] !== slideNodeId) {
      return;
    }
    const slide = input.graph.nodes.get(slideNodeId);
    const previousSlide = previousGraph.graph.nodes.get(slideNodeId);
    if (slide?.kind !== "slide" || previousSlide?.kind !== "slide") {
      return;
    }
    const currentSnapshot = slideProjectionFingerprints.get(slideNodeId);
    if (!currentSnapshot) {
      return;
    }
    if (
      input.staleAssetEntityIds &&
      currentSnapshot.assetEntityIds.some((id) => input.staleAssetEntityIds?.has(id))
    ) {
      return;
    }

    const previousFingerprint =
      previousProjectionArtifact.slideProjectionFingerprints.get(slideNodeId)?.fingerprint ??
      slideProjectionFingerprint({
        graph: previousGraph.graph,
        resolvedStyles: previousGraph.resolvedStyles,
        options: previousOptions,
        assets: previousAssets,
        slideNodeId,
        assetEntityIds: currentSnapshot.assetEntityIds,
      });
    if (currentSnapshot.fingerprint === previousFingerprint) {
      slideNodeIds.add(slideNodeId);
    }
  });

  return {
    previousProjection: previousPptxProjection,
    slideNodeIds,
    slideProjectionFingerprints,
  };
}

export function slideProjectionFingerprintSnapshots(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  assets: ReadonlyMap<AssetEntityId, AssetArtifact>;
}): ReadonlyMap<GraphNodeId, SlideProjectionFingerprintSnapshot> {
  const document = input.graph.nodes.get(input.graph.documentId);
  if (document?.kind !== "document") {
    return new Map();
  }

  const snapshots = new Map<GraphNodeId, SlideProjectionFingerprintSnapshot>();
  document.children.forEach((slideNodeId) => {
    const slide = input.graph.nodes.get(slideNodeId);
    if (slide?.kind !== "slide") {
      return;
    }
    const graphNodeIds = graphSubtreeNodeIds(input.graph, slideNodeId);
    const assetEntityIds = graphSubtreeAssetEntityIdsFromNodeIds(input.graph, graphNodeIds);
    snapshots.set(slideNodeId, {
      slideNodeId,
      graphNodeIds,
      assetEntityIds,
      fingerprint: slideProjectionFingerprint({
        graph: input.graph,
        resolvedStyles: input.resolvedStyles,
        options: input.options,
        assets: input.assets,
        slideNodeId,
        graphNodeIds,
        assetEntityIds,
      }),
    });
  });
  return snapshots;
}

function slideProjectionFingerprint(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  assets: ReadonlyMap<AssetEntityId, AssetArtifact>;
  slideNodeId: GraphNodeId;
  graphNodeIds?: readonly GraphNodeId[];
  assetEntityIds?: readonly AssetEntityId[];
}): string {
  const graphNodeIds = input.graphNodeIds ?? graphSubtreeNodeIds(input.graph, input.slideNodeId);
  const styleEntityIds = new Set<StyleEntityId>();
  const assetEntityIds = new Set<AssetEntityId>(input.assetEntityIds);
  const nodes = graphNodeIds.flatMap((id) => {
    const node = input.graph.nodes.get(id);
    if (!node) {
      return [];
    }
    if (node.styleRef) {
      styleEntityIds.add(node.styleRef);
    }
    if (node.kind === "image" && node.assetRef) {
      assetEntityIds.add(node.assetRef);
    }
    if (node.kind === "video") {
      if (node.assetRef) {
        assetEntityIds.add(node.assetRef);
      }
      if (node.posterAssetRef) {
        assetEntityIds.add(node.posterAssetRef);
      }
    }
    return [node];
  });

  return fingerprintString(
    stableJson({
      nodes,
      projectionContext: {
        layout: input.options.layout,
        meta: input.options.meta,
      },
      resolvedStyles: graphNodeIds.flatMap((id) => {
        const resolved = input.resolvedStyles.get(id);
        return resolved ? [{ id, resolved }] : [];
      }),
      styles: [...styleEntityIds].sort().flatMap((id) => {
        const style = input.graph.styles.get(id);
        return style ? [style] : [];
      }),
      graphAssets: [...assetEntityIds].sort().flatMap((id) => {
        const asset = input.graph.assets.get(id);
        return asset ? [asset] : [];
      }),
      assetArtifacts: [...assetEntityIds].sort().flatMap((id) => {
        const asset = input.assets.get(id);
        return asset ? [assetProjectionFingerprintInput(asset)] : [];
      }),
      templates: [...input.graph.templates.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    }),
  );
}

function assetProjectionFingerprintInput(asset: AssetArtifact): unknown {
  return {
    assetEntityId: asset.assetEntityId,
    source: asset.source,
    sourceField: asset.sourceField,
    resolverIdentity: asset.resolverIdentity,
    origin: asset.origin,
    probe: asset.probe,
    diagnosticCodes: asset.diagnostics.items.map((item) => item.code),
  };
}

function graphSubtreeNodeIds(
  graph: SemanticAuthorGraph,
  rootId: GraphNodeId,
): readonly GraphNodeId[] {
  const ids: GraphNodeId[] = [];
  const visit = (nodeId: GraphNodeId): void => {
    const node = graph.nodes.get(nodeId);
    if (!node) {
      return;
    }
    ids.push(nodeId);
    const children =
      "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];
    children.forEach(visit);
  };

  visit(rootId);
  return ids;
}

function graphSubtreeAssetEntityIdsFromNodeIds(
  graph: SemanticAuthorGraph,
  graphNodeIds: readonly GraphNodeId[],
): readonly AssetEntityId[] {
  const assetEntityIds = new Set<AssetEntityId>();
  graphNodeIds.forEach((nodeId) => {
    const node = graph.nodes.get(nodeId);
    if (node?.kind === "image" && node.assetRef) {
      assetEntityIds.add(node.assetRef);
    }
    if (node?.kind === "video") {
      if (node.assetRef) {
        assetEntityIds.add(node.assetRef);
      }
      if (node.posterAssetRef) {
        assetEntityIds.add(node.posterAssetRef);
      }
    }
  });
  return [...assetEntityIds];
}

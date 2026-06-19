import type { DeckOptions } from "../../authoring/index";
import type { AssetEntityId, GraphNodeId, SemanticAuthorGraph, StyleEntityId } from "../../graph";
import type {
  AssetArtifact,
  DefinedGraphArtifact,
  DefinedProjectionArtifact,
} from "../../pipeline-artifacts";
import type { ResolvedStyleMap } from "../../style/resolve";
import { fingerprintString, stableJson } from "./fingerprint";
import { isPptxPackageModel, type PptxPackageModel } from "./model";

export type PptxProjectionReusePlan = {
  readonly previousProjection: PptxPackageModel;
  readonly slideNodeIds: ReadonlySet<GraphNodeId>;
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
  const previousProjection = input.previousProjection.projection;
  const previousOptions = input.previousOptions;
  const previousAssets = input.previousAssets;
  if (!isPptxPackageModel(previousProjection) || !previousOptions || !previousAssets) {
    return undefined;
  }

  const document = input.graph.nodes.get(input.graph.documentId);
  const previousDocument = previousGraph.graph.nodes.get(previousGraph.graph.documentId);
  if (document?.kind !== "document" || previousDocument?.kind !== "document") {
    return undefined;
  }
  if (document.children.length !== previousDocument.children.length) {
    return undefined;
  }

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
    const subtreeAssetEntityIds = graphSubtreeAssetEntityIds(input.graph, slideNodeId);
    if (
      input.staleAssetEntityIds &&
      subtreeAssetEntityIds.some((id) => input.staleAssetEntityIds?.has(id))
    ) {
      return;
    }

    const currentFingerprint = slideProjectionFingerprint({
      graph: input.graph,
      resolvedStyles: input.resolvedStyles,
      options: input.options,
      assets: input.assets,
      slideNodeId,
      assetEntityIds: subtreeAssetEntityIds,
    });
    const previousFingerprint = slideProjectionFingerprint({
      graph: previousGraph.graph,
      resolvedStyles: previousGraph.resolvedStyles,
      options: previousOptions,
      assets: previousAssets,
      slideNodeId,
      assetEntityIds: subtreeAssetEntityIds,
    });
    if (currentFingerprint === previousFingerprint) {
      slideNodeIds.add(slideNodeId);
    }
  });

  return slideNodeIds.size > 0 ? { previousProjection, slideNodeIds } : undefined;
}

function slideProjectionFingerprint(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  assets: ReadonlyMap<AssetEntityId, AssetArtifact>;
  slideNodeId: GraphNodeId;
  assetEntityIds?: readonly AssetEntityId[];
}): string {
  const graphNodeIds = graphSubtreeNodeIds(input.graph, input.slideNodeId);
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

function graphSubtreeAssetEntityIds(
  graph: SemanticAuthorGraph,
  rootId: GraphNodeId,
): readonly AssetEntityId[] {
  const assetEntityIds = new Set<AssetEntityId>();
  graphSubtreeNodeIds(graph, rootId).forEach((nodeId) => {
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

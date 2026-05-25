import type { CompositionSource } from "./composition/types";
import { resolveComposition } from "./composition/resolve";
import type { ComposedAuthorRoot } from "./composition/types";
import { createDiagnostics, type Diagnostics } from "./diagnostics";
import type {
  AssetEntityId,
  AssetEntity,
  GraphNodeId,
  SemanticNode,
  SemanticAuthorGraph,
  SourceOrigin,
  StyleEntity,
  StyleEntityId,
} from "./graph";
import type { PptxPackageModel } from "./projection/pptx";
import {
  pptxProjectionArtifact,
  projectionShapeDiagnostics,
  type PackageDependencySnapshot,
  type ProjectionArtifact,
  type PptxProjectionArtifact,
} from "./projection/pptx-artifact";
import { resolveStyles, type ResolvedStyle, type ResolvedStyleMap } from "./style/resolve";

export type DefinedGraphArtifact = {
  readonly sourceKey: string;
  readonly source?: SourceOrigin;
  readonly graph: SemanticAuthorGraph;
  readonly graphSlice: SourceGraphArtifactSlice;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly graphNodeIds: readonly GraphNodeId[];
  readonly styleEntityIds: readonly StyleEntityId[];
  readonly assetEntityIds: readonly AssetEntityId[];
  readonly diagnostics: Diagnostics;
};

export type SourceGraphArtifactSlice = {
  readonly nodes: ReadonlyMap<GraphNodeId, SemanticNode>;
  readonly styles: ReadonlyMap<StyleEntityId, StyleEntity>;
  readonly assets: ReadonlyMap<AssetEntityId, AssetEntity>;
  readonly resolvedStyles: ResolvedStyleMap;
};

export type SourceArtifact = {
  readonly sourceKey: string;
  readonly source?: SourceOrigin;
  readonly rootCount: number;
  readonly rootPaths: readonly string[];
  readonly diagnostics: Diagnostics;
};

export type DefinedProjectionArtifact = PptxProjectionArtifact;
export type { PackageDependencySnapshot, ProjectionArtifact, PptxProjectionArtifact };

export const ROOT_SOURCE_ARTIFACT_KEY = "deck:root";

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
}

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? ROOT_SOURCE_ARTIFACT_KEY : source.sourceIdentity;
}

export class PipelineArtifactCollection {
  #sourcesByKey = new Map<string, SourceArtifact>();
  #graphsBySourceKey = new Map<string, DefinedGraphArtifact>();
  #projection?: DefinedProjectionArtifact;

  get graph(): DefinedGraphArtifact | undefined {
    return this.#graphsBySourceKey.get(ROOT_SOURCE_ARTIFACT_KEY);
  }

  get projection(): DefinedProjectionArtifact | undefined {
    return this.#projection;
  }

  get sourcesByKey(): ReadonlyMap<string, SourceArtifact> {
    return this.#sourcesByKey;
  }

  get graphsBySourceKey(): ReadonlyMap<string, DefinedGraphArtifact> {
    return this.#graphsBySourceKey;
  }

  invalidateFromSource(): void {
    this.#sourcesByKey.clear();
    this.#graphsBySourceKey.clear();
    this.#projection = undefined;
  }

  invalidateFromGraph(): void {
    this.#graphsBySourceKey.clear();
    this.#projection = undefined;
  }

  invalidateFromProjection(): void {
    this.#projection = undefined;
  }

  materializeComposition(
    roots: readonly ComposedAuthorRoot[] | undefined,
    diagnostics: Diagnostics,
  ): void {
    this.#sourcesByKey.clear();

    if (!roots || roots.length === 0) {
      this.materializeSource({
        sourceKey: ROOT_SOURCE_ARTIFACT_KEY,
        source: { kind: "root" },
        rootCount: 0,
        rootPaths: [],
        diagnostics,
      });
      return;
    }

    const rootsBySourceKey = new Map<
      string,
      { source: SourceOrigin; rootPaths: string[]; rootCount: number }
    >();

    roots.forEach((root) => {
      const sourceKey = sourceKeyFor(root.source);
      const current = rootsBySourceKey.get(sourceKey);
      if (current) {
        current.rootCount += 1;
        current.rootPaths.push(root.path);
        return;
      }

      rootsBySourceKey.set(sourceKey, {
        source: root.source,
        rootPaths: [root.path],
        rootCount: 1,
      });
    });

    rootsBySourceKey.forEach((artifact, sourceKey) => {
      this.materializeSource({
        sourceKey,
        source: artifact.source,
        rootCount: artifact.rootCount,
        rootPaths: artifact.rootPaths,
        diagnostics,
      });
    });
  }

  materializeSource(input: {
    sourceKey?: string;
    source?: SourceOrigin;
    rootCount: number;
    rootPaths?: readonly string[];
    diagnostics: Diagnostics;
  }): void {
    const sourceKey = input.sourceKey ?? ROOT_SOURCE_ARTIFACT_KEY;
    this.#sourcesByKey.set(sourceKey, {
      sourceKey,
      ...(input.source ? { source: input.source } : {}),
      rootCount: input.rootCount,
      rootPaths: input.rootPaths ?? [],
      diagnostics: input.diagnostics,
    });
  }

  materializeGraph(input: {
    sourceKey?: string;
    source?: SourceOrigin;
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    graphNodeIds?: readonly GraphNodeId[];
    styleEntityIds?: readonly StyleEntityId[];
    assetEntityIds?: readonly AssetEntityId[];
    diagnostics: Diagnostics;
  }): void {
    const sourceKey = input.sourceKey ?? ROOT_SOURCE_ARTIFACT_KEY;
    const graphNodeIds = input.graphNodeIds ?? [...input.graph.nodes.keys()];
    const styleEntityIds = input.styleEntityIds ?? [...input.graph.styles.keys()];
    const assetEntityIds = input.assetEntityIds ?? [...input.graph.assets.keys()];
    this.#graphsBySourceKey.set(sourceKey, {
      sourceKey,
      ...(input.source ? { source: input.source } : {}),
      graph: input.graph,
      resolvedStyles: input.resolvedStyles,
      graphSlice: graphSliceFor({
        graph: input.graph,
        resolvedStyles: input.resolvedStyles,
        graphNodeIds,
        styleEntityIds,
        assetEntityIds,
      }),
      graphNodeIds,
      styleEntityIds,
      assetEntityIds,
      diagnostics: input.diagnostics,
    });
  }

  materializeGraphFromComposition(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    roots: readonly ComposedAuthorRoot[];
    diagnostics: Diagnostics;
  }): void {
    this.#graphsBySourceKey.clear();

    const sourceByKey = new Map<string, SourceOrigin>();
    sourceByKey.set(ROOT_SOURCE_ARTIFACT_KEY, { kind: "root" });
    input.roots.forEach((root) => {
      sourceByKey.set(sourceKeyFor(root.source), root.source);
    });

    const nodesBySourceKey = new Map<string, GraphNodeId[]>();
    const stylesBySourceKey = new Map<string, StyleEntityId[]>();
    const assetsBySourceKey = new Map<string, AssetEntityId[]>();

    input.graph.nodes.forEach((node) => {
      const sourceKey = sourceKeyFor(node.origin.source);
      sourceByKey.set(sourceKey, node.origin.source ?? { kind: "root" });
      const nodeIds = nodesBySourceKey.get(sourceKey) ?? [];
      nodeIds.push(node.id);
      nodesBySourceKey.set(sourceKey, nodeIds);

      if (node.styleRef) {
        const styleIds = stylesBySourceKey.get(sourceKey) ?? [];
        styleIds.push(node.styleRef);
        stylesBySourceKey.set(sourceKey, styleIds);
      }

      if (node.kind === "image" && node.assetRef) {
        const assetIds = assetsBySourceKey.get(sourceKey) ?? [];
        assetIds.push(node.assetRef);
        assetsBySourceKey.set(sourceKey, assetIds);
      }
    });

    sourceByKey.forEach((source, sourceKey) => {
      this.materializeGraph({
        sourceKey,
        source,
        graph: input.graph,
        resolvedStyles: input.resolvedStyles,
        graphNodeIds: nodesBySourceKey.get(sourceKey) ?? [],
        styleEntityIds: [...new Set(stylesBySourceKey.get(sourceKey) ?? [])],
        assetEntityIds: [...new Set(assetsBySourceKey.get(sourceKey) ?? [])],
        diagnostics: input.diagnostics,
      });
    });
  }

  materializeProjection(projection: PptxPackageModel, diagnostics: Diagnostics): void {
    this.#projection = pptxProjectionArtifact(projection, diagnostics);
  }

  replaceGraphArtifact(source: CompositionSource<any>, graph: SemanticAuthorGraph): void {
    const composition = resolveComposition(source);
    const styleResult = resolveStyles(graph, composition.roots ?? []);
    const diagnostics = combineDiagnostics(composition.diagnostics, styleResult.diagnostics);
    this.invalidateFromGraph();
    this.materializeComposition(composition.roots, composition.diagnostics);
    this.materializeGraphFromComposition({
      graph,
      resolvedStyles: styleResult.resolvedStyles,
      roots: composition.roots ?? [],
      diagnostics,
    });
    this.#projection = undefined;
  }

  replaceProjectionArtifact(projection: PptxPackageModel): void {
    this.invalidateFromSource();
    this.#projection = pptxProjectionArtifact(projection, projectionShapeDiagnostics(projection));
  }
}

function graphSliceFor(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  graphNodeIds: readonly GraphNodeId[];
  styleEntityIds: readonly StyleEntityId[];
  assetEntityIds: readonly AssetEntityId[];
}): SourceGraphArtifactSlice {
  const nodes = new Map<GraphNodeId, SemanticNode>();
  const styles = new Map<StyleEntityId, StyleEntity>();
  const assets = new Map<AssetEntityId, AssetEntity>();
  const resolvedStyles = new Map<GraphNodeId, ResolvedStyle>();

  input.graphNodeIds.forEach((id) => {
    const node = input.graph.nodes.get(id);
    const resolved = input.resolvedStyles.get(id);

    if (node) {
      nodes.set(id, node);
    }
    if (resolved) {
      resolvedStyles.set(id, resolved);
    }
  });

  input.styleEntityIds.forEach((id) => {
    const style = input.graph.styles.get(id);
    if (style) {
      styles.set(id, style);
    }
  });

  input.assetEntityIds.forEach((id) => {
    const asset = input.graph.assets.get(id);
    if (asset) {
      assets.set(id, asset);
    }
  });

  return {
    nodes,
    styles,
    assets,
    resolvedStyles,
  };
}

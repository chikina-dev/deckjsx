import type { ComposedAuthorRoot } from "../composition/types";
import type { DeckOptions } from "../authoring/options";
import type { SourceInvalidation } from "../source-invalidation";
import { createDiagnostics, type Diagnostics } from "../diagnostics";
import type {
  AssetEntityId,
  AssetEntity,
  GraphNodeId,
  SemanticNode,
  SemanticAuthorGraph,
  SourceOrigin,
  StyleEntity,
  StyleEntityId,
} from "../graph";
import type {
  PackagePartId,
  PptxPackageModel,
  PptxPackageModelCandidate,
} from "../projection/pptx/model";
import { isPptxPackageModel } from "../projection/pptx/model";
import { isPdfPageModel, type PdfPageModel } from "../projection/pdf/model";
import { pptxProjectionArtifact, projectionShapeDiagnostics } from "../projection/pptx/artifact";
import type { ResolvedStyle, ResolvedStyleMap } from "../style/resolve";
import {
  assetSourceCacheKey,
  ROOT_SOURCE_ARTIFACT_KEY,
  type AssetArtifact,
  type DefinedGraphArtifact,
  type DefinedProjectionArtifact,
  type GraphArtifactReplacement,
  type IncrementalProjectionReuseSnapshot,
  type ProjectionArtifact,
  type PptxPackageBuildArtifact,
  type PptxProjectionArtifact,
  type SourceArtifact,
  type SourceGraphArtifactSlice,
  type SlideProjectionFingerprintSnapshot,
} from "./artifact-contract";

export {
  assetSourceCacheKey,
  fingerprintBytes,
  ROOT_SOURCE_ARTIFACT_KEY,
  type AssetArtifact,
  type AssetArtifactStore,
  type DefinedGraphArtifact,
  type DefinedProjectionArtifact,
  type GraphArtifactReplacement,
  type IncrementalProjectionReuseSnapshot,
  type PptxPackageBuildNote,
  type PptxPackageBuildReason,
  type PptxPackageBuildArtifact,
  type PptxProjectionArtifact,
  type SourceArtifact,
  type SourceGraphArtifactSlice,
  type SlideProjectionFingerprintSnapshot,
} from "./artifact-contract";

type ProjectionArtifactIndexes = Omit<
  PptxProjectionArtifact<PptxPackageModelCandidate>,
  keyof ProjectionArtifact<PptxPackageModelCandidate>
>;

function emptyProjectionArtifactIndexes(): ProjectionArtifactIndexes {
  return {
    partsById: new Map(),
    partsBySourceKey: new Map(),
    partsByGraphNodeId: new Map(),
    slideProjectionFingerprints: new Map(),
    slidePackagePartFingerprints: new Map(),
    packageDependencies: {
      edges: [],
      dependenciesByPartId: new Map(),
      dependentsByPartId: new Map(),
    },
  };
}

function projectionArtifactForModel(
  projection: PptxPackageModel | PdfPageModel,
  diagnostics: Diagnostics,
  artifactOptions: {
    readonly slideProjectionFingerprints?: ReadonlyMap<
      GraphNodeId,
      SlideProjectionFingerprintSnapshot
    >;
  } = {},
): DefinedProjectionArtifact {
  return isPptxPackageModel(projection as PptxPackageModelCandidate)
    ? pptxProjectionArtifact(projection as PptxPackageModel, diagnostics, artifactOptions)
    : {
        projection,
        diagnostics,
        ...emptyProjectionArtifactIndexes(),
      };
}

function mergeAssetDiagnostics(previous: Diagnostics, next: Diagnostics): Diagnostics {
  const items = [...previous.items];
  const seen = new Set(items.map(assetDiagnosticKey));
  next.items.forEach((item) => {
    const key = assetDiagnosticKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  });
  return createDiagnostics(items);
}

function assetDiagnosticKey(item: Diagnostics["items"][number]): string {
  return JSON.stringify(item);
}

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? ROOT_SOURCE_ARTIFACT_KEY : source.sourceIdentity;
}

function normalizedSourceId(id: string): string {
  return sourcePathNormalize(id.replace(/[?#].*$/, ""));
}

function isCodeLikeSourceId(id: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(normalizedSourceId(id));
}

function sourcePathNormalize(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const leadingSlash = normalized.startsWith("/");
  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return `${leadingSlash ? "/" : ""}${segments.join("/")}`;
}

function sourcePathDirname(value: string): string {
  const normalized = sourcePathNormalize(value);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return normalized.startsWith("/") ? "/" : "";
  }

  return normalized.slice(0, index);
}

function sourcePathResolve(importer: string, source: string): string {
  const normalizedSource = normalizedSourceId(source);
  if (normalizedSource.startsWith("/")) {
    return normalizedSource;
  }

  return sourcePathNormalize(`${sourcePathDirname(importer)}/${normalizedSource}`);
}

function assetMatchesChangedSource(
  asset: AssetArtifact,
  changedSourceIds: ReadonlySet<string>,
): boolean {
  const resolvedId = asset.load?.provenance?.resolvedId ?? asset.probe?.provenance?.resolvedId;
  if (resolvedId && changedSourceIds.has(normalizedSourceId(resolvedId))) {
    return true;
  }

  const { source, origin } = asset;
  if (!origin) {
    return source.kind === "path" && changedSourceIds.has(normalizedSourceId(source.path));
  }

  const directMatches = [origin.importer, origin.source]
    .filter((value): value is string => value !== undefined)
    .some((value) => changedSourceIds.has(normalizedSourceId(value)));
  if (directMatches) {
    return true;
  }

  if (source.kind !== "path" || !origin.importer) {
    return false;
  }

  return changedSourceIds.has(sourcePathResolve(origin.importer, origin.source ?? source.path));
}

export class PipelineArtifactCollection {
  #sourcesByKey = new Map<string, SourceArtifact>();
  #graphsBySourceKey = new Map<string, DefinedGraphArtifact>();
  #assetsById = new Map<AssetEntityId, AssetArtifact>();
  #assetsBySourceCacheKey = new Map<string, AssetArtifact>();
  #pptxBuildArtifactsByPartId = new Map<PackagePartId, PptxPackageBuildArtifact>();
  #projection?: DefinedProjectionArtifact;
  #projectionOptions?: DeckOptions;
  #staleProjectionForReuse?: DefinedProjectionArtifact;
  #staleGraphForReuse?: DefinedGraphArtifact;
  #staleProjectionOptionsForReuse?: DeckOptions;
  #staleAssetsByIdForReuse?: ReadonlyMap<AssetEntityId, AssetArtifact>;
  #staleAssetEntityIdsForReuse = new Set<AssetEntityId>();

  get graph(): DefinedGraphArtifact | undefined {
    return this.#graphsBySourceKey.get(ROOT_SOURCE_ARTIFACT_KEY);
  }

  get projection(): DefinedProjectionArtifact | undefined {
    return this.#projection;
  }

  get incrementalProjectionReuseSnapshot(): IncrementalProjectionReuseSnapshot | undefined {
    if (
      !this.#staleGraphForReuse ||
      !this.#staleProjectionForReuse ||
      !this.#staleProjectionOptionsForReuse ||
      !this.#staleAssetsByIdForReuse
    ) {
      return undefined;
    }

    return {
      graph: this.#staleGraphForReuse,
      projection: this.#staleProjectionForReuse,
      options: this.#staleProjectionOptionsForReuse,
      assetsById: this.#staleAssetsByIdForReuse,
      staleAssetEntityIds: this.#staleAssetEntityIdsForReuse,
    };
  }

  get sourcesByKey(): ReadonlyMap<string, SourceArtifact> {
    return this.#sourcesByKey;
  }

  get graphsBySourceKey(): ReadonlyMap<string, DefinedGraphArtifact> {
    return this.#graphsBySourceKey;
  }

  get assetsById(): ReadonlyMap<AssetEntityId, AssetArtifact> {
    return this.#assetsById;
  }

  get assetsBySourceCacheKey(): ReadonlyMap<string, AssetArtifact> {
    return this.#assetsBySourceCacheKey;
  }

  get pptxBuildArtifactsByPartId(): ReadonlyMap<PackagePartId, PptxPackageBuildArtifact> {
    return this.#pptxBuildArtifactsByPartId;
  }

  clone(): PipelineArtifactCollection {
    const clone = new PipelineArtifactCollection();
    clone.#sourcesByKey = new Map(this.#sourcesByKey);
    clone.#graphsBySourceKey = new Map(this.#graphsBySourceKey);
    clone.#assetsById = new Map(this.#assetsById);
    clone.#assetsBySourceCacheKey = new Map(this.#assetsBySourceCacheKey);
    clone.#pptxBuildArtifactsByPartId = new Map(this.#pptxBuildArtifactsByPartId);
    clone.#projection = this.#projection;
    clone.#projectionOptions = this.#projectionOptions;
    clone.#staleProjectionForReuse = this.#staleProjectionForReuse;
    clone.#staleGraphForReuse = this.#staleGraphForReuse;
    clone.#staleProjectionOptionsForReuse = this.#staleProjectionOptionsForReuse;
    clone.#staleAssetsByIdForReuse = this.#staleAssetsByIdForReuse
      ? new Map(this.#staleAssetsByIdForReuse)
      : undefined;
    clone.#staleAssetEntityIdsForReuse = new Set(this.#staleAssetEntityIdsForReuse);
    return clone;
  }

  invalidateFromSource(): void {
    this.#sourcesByKey.clear();
    this.#graphsBySourceKey.clear();
    this.#assetsById.clear();
    this.#assetsBySourceCacheKey.clear();
    this.#pptxBuildArtifactsByPartId.clear();
    this.#projection = undefined;
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  invalidateFromGraph(): void {
    this.#graphsBySourceKey.clear();
    this.#assetsById.clear();
    this.#assetsBySourceCacheKey.clear();
    this.#pptxBuildArtifactsByPartId.clear();
    this.#projection = undefined;
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  invalidateFromProjection(): void {
    this.#pptxBuildArtifactsByPartId.clear();
    this.#projection = undefined;
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  invalidateAssets(): void {
    this.#assetsById.clear();
    this.#assetsBySourceCacheKey.clear();
    this.#pptxBuildArtifactsByPartId.clear();
    this.#projection = undefined;
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  invalidateForSourceChange(invalidation: SourceInvalidation): boolean {
    const changedSourceIds = new Set(
      invalidation.changedSourceIds.map((id) => normalizedSourceId(id)),
    );
    if (changedSourceIds.size === 0) {
      return false;
    }

    const codeChanged = [...changedSourceIds].some((id) => isCodeLikeSourceId(id));
    if (codeChanged) {
      this.preserveProjectionForIncrementalReuse();
      this.#sourcesByKey.clear();
      this.#graphsBySourceKey.clear();
      this.#assetsById.clear();
      this.#assetsBySourceCacheKey.clear();
      this.#projection = undefined;
      this.#projectionOptions = undefined;
      this.#staleAssetEntityIdsForReuse.clear();
      return true;
    }

    const staleAssetIds = new Set<AssetEntityId>();
    this.#assetsById.forEach((asset) => {
      if (assetMatchesChangedSource(asset, changedSourceIds)) {
        staleAssetIds.add(asset.assetEntityId);
      }
    });
    if (staleAssetIds.size === 0) {
      return false;
    }

    this.preserveProjectionForIncrementalReuse();
    this.#staleAssetEntityIdsForReuse = staleAssetIds;
    staleAssetIds.forEach((id) => {
      this.#assetsById.delete(id);
    });
    this.#assetsBySourceCacheKey.clear();
    this.#assetsById.forEach((asset) => {
      this.#assetsBySourceCacheKey.set(
        assetSourceCacheKey(asset.source, asset.resolverIdentity, asset.origin, asset.sourceField),
        asset,
      );
    });
    this.#projection = undefined;
    this.#projectionOptions = undefined;
    return true;
  }

  private preserveProjectionForIncrementalReuse(): void {
    if (this.#projection) {
      this.#staleProjectionForReuse = this.#projection;
    }
    if (this.#projectionOptions) {
      this.#staleProjectionOptionsForReuse = this.#projectionOptions;
    }
    if (this.graph) {
      this.#staleGraphForReuse = this.graph;
    }
    this.#staleAssetsByIdForReuse = new Map(this.#assetsById);
  }

  private clearIncrementalProjectionReuseSnapshot(): void {
    this.#staleProjectionForReuse = undefined;
    this.#staleGraphForReuse = undefined;
    this.#staleProjectionOptionsForReuse = undefined;
    this.#staleAssetsByIdForReuse = undefined;
    this.#staleAssetEntityIdsForReuse.clear();
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
      {
        source: SourceOrigin;
        rootPaths: string[];
        rootCount: number;
      }
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
    compositionRevision?: string;
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
      ...(input.compositionRevision ? { compositionRevision: input.compositionRevision } : {}),
    });
  }

  materializeGraphFromComposition(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    roots: readonly ComposedAuthorRoot[];
    diagnostics: Diagnostics;
    compositionRevision?: string;
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

      const nodeAssetIds =
        node.kind === "image" && node.assetRef
          ? [node.assetRef]
          : node.kind === "video"
            ? [node.assetRef, node.posterAssetRef].filter(
                (id): id is AssetEntityId => id !== undefined,
              )
            : [];

      if (nodeAssetIds.length > 0) {
        const assetIds = assetsBySourceKey.get(sourceKey) ?? [];
        assetIds.push(...nodeAssetIds);
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
        ...(input.compositionRevision ? { compositionRevision: input.compositionRevision } : {}),
      });
    });
  }

  materializeProjection(
    projection: PptxPackageModel | PdfPageModel,
    diagnostics: Diagnostics,
    options: DeckOptions,
    artifactOptions: {
      readonly slideProjectionFingerprints?: ReadonlyMap<
        GraphNodeId,
        SlideProjectionFingerprintSnapshot
      >;
    } = {},
  ): void {
    this.#projection = projectionArtifactForModel(projection, diagnostics, artifactOptions);
    this.#projectionOptions = options;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  materializeAsset(input: AssetArtifact): void {
    const previous = this.#assetsById.get(input.assetEntityId);
    const artifact = {
      ...previous,
      ...input,
      diagnostics: mergeAssetDiagnostics(
        previous?.diagnostics ?? createDiagnostics(),
        input.diagnostics,
      ),
    };
    this.#assetsById.set(input.assetEntityId, artifact);
    this.#assetsBySourceCacheKey.set(
      assetSourceCacheKey(
        artifact.source,
        artifact.resolverIdentity,
        artifact.origin,
        artifact.sourceField,
      ),
      artifact,
    );
  }

  materializePptxBuildArtifact(input: PptxPackageBuildArtifact): void {
    this.#pptxBuildArtifactsByPartId.set(input.packagePartId, input);
  }

  materializePptxBuildArtifacts(input: readonly PptxPackageBuildArtifact[]): void {
    input.forEach((artifact) => {
      this.materializePptxBuildArtifact(artifact);
    });
  }

  invalidatePptxBuildArtifacts(): void {
    this.#pptxBuildArtifactsByPartId.clear();
  }

  replaceGraphArtifact(input: GraphArtifactReplacement): void {
    this.invalidateFromGraph();
    this.materializeComposition(input.roots, input.compositionDiagnostics);
    this.materializeGraphFromComposition(input);
    this.#projection = undefined;
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  replaceProjectionArtifact(projection: PptxPackageModelCandidate | PdfPageModel): void {
    this.#sourcesByKey.clear();
    this.#graphsBySourceKey.clear();
    this.#projection = isPdfPageModel(projection)
      ? projectionArtifactForModel(projection, createDiagnostics())
      : pptxProjectionArtifact(projection, projectionShapeDiagnostics(projection));
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
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

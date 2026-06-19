import type { CompositionSource } from "./composition/types";
import { resolveComposition } from "./composition/resolve";
import type { ComposedAuthorRoot } from "./composition/types";
import type { DeckOptions } from "./authoring/index";
import type { AssetLoadResult, AssetProbeResult, AssetSource } from "./assets";
import type { MediaSourceOrigin } from "./media-source-origin";
import type { SourceInvalidation } from "./plugin";
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
import type {
  PackagePartId,
  PptxPackageModel,
  PptxPackageModelCandidate,
} from "./projection/pptx/model";
import {
  pptxProjectionArtifact,
  projectionShapeDiagnostics,
  type PackageDependencyEdge,
  type PackageDependencyReason,
  type PackageDependencySnapshot,
  type ProjectionArtifact,
  type PptxProjectionArtifact,
} from "./projection/pptx/artifact";
import { resolveStyles, type ResolvedStyle, type ResolvedStyleMap } from "./style/resolve";
import type { SlideTemplateSet } from "./templates";
import type { SourceContextValue } from "./composition/types";

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

export type DefinedProjectionArtifact = PptxProjectionArtifact<PptxPackageModelCandidate>;
export type {
  PackageDependencyEdge,
  PackageDependencyReason,
  PackageDependencySnapshot,
  ProjectionArtifact,
  PptxProjectionArtifact,
};

export type AssetArtifact = {
  readonly assetEntityId: AssetEntityId;
  readonly source: AssetSource;
  readonly sourceField: AssetEntity["sourceField"];
  readonly resolverIdentity?: string;
  readonly origin?: MediaSourceOrigin;
  readonly probe?: AssetProbeResult;
  readonly load?: AssetLoadResult;
  readonly diagnostics: Diagnostics;
};

export type IncrementalProjectionReuseSnapshot = {
  readonly graph: DefinedGraphArtifact;
  readonly projection: DefinedProjectionArtifact;
  readonly options: DeckOptions;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly staleAssetEntityIds: ReadonlySet<AssetEntityId>;
};

export function fingerprintBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function assetSourceCacheKey(
  source: AssetSource,
  resolverIdentity = "deckjsx:builtin",
  origin?: MediaSourceOrigin,
): string {
  const originKey = origin
    ? `:${origin.sourceIdentity ?? ""}:${origin.importer ?? ""}:${origin.source ?? ""}`
    : "";
  switch (source.kind) {
    case "bytes":
      return `${resolverIdentity}:bytes:${source.mediaType ?? ""}:${source.extension ?? ""}:${source.bytes.byteLength}:${fingerprintBytes(source.bytes)}`;
    case "data":
      return `${resolverIdentity}:data:${source.data}`;
    case "path":
      return `${resolverIdentity}:path${originKey}:${source.path}`;
    case "url":
      return `${resolverIdentity}:url:${source.url}`;
  }
}

export type PptxPackageBuildReason =
  | "dependencyFingerprintChanged"
  | "emitterFingerprintChanged"
  | "mediaBytesChanged"
  | "missingArtifact"
  | "orderKeyChanged"
  | "packagePartIdChanged"
  | "partFingerprintChanged"
  | "pathChanged"
  | "writerFingerprintChanged";

export type PptxPackageBuildNote = {
  readonly kind: "packagePartBytesBuilt";
  readonly reason: PptxPackageBuildReason;
  readonly partKind: string;
  readonly byteLength: number;
  readonly partFingerprint: string;
  readonly writerFingerprint: string;
  readonly emitterFingerprint?: string;
  readonly dependencyFingerprintCount: number;
  readonly mediaByteFingerprint?: string;
  readonly mediaByteFingerprintSource?: "byteHash" | "loadedAssetHash" | "projectedMetadataHash";
  readonly diagnosticCodes: readonly string[];
};

export type PptxPackageBuildArtifact = {
  readonly packagePartId: PackagePartId;
  readonly path: string;
  readonly orderKey?: string;
  readonly bytes: Uint8Array;
  readonly partFingerprint: string;
  readonly dependencyFingerprints?: readonly {
    readonly packagePartId: PackagePartId;
    readonly fingerprint: string;
  }[];
  readonly writerFingerprint: string;
  readonly emitterFingerprint?: string;
  readonly mediaByteFingerprint?: string;
  readonly mediaByteFingerprintSource?: "byteHash" | "loadedAssetHash" | "projectedMetadataHash";
  readonly buildNotes: readonly PptxPackageBuildNote[];
  readonly diagnostics: Diagnostics;
};

export const ROOT_SOURCE_ARTIFACT_KEY = "deck:root";

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
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

function originMatchesChangedSource(
  source: AssetSource,
  origin: MediaSourceOrigin | undefined,
  changedSourceIds: ReadonlySet<string>,
): boolean {
  if (!origin) {
    return false;
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
      if (originMatchesChangedSource(asset.source, asset.origin, changedSourceIds)) {
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
        assetSourceCacheKey(asset.source, asset.resolverIdentity, asset.origin),
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
      });
    });
  }

  materializeProjection(
    projection: PptxPackageModel,
    diagnostics: Diagnostics,
    options: DeckOptions,
  ): void {
    this.#projection = pptxProjectionArtifact(projection, diagnostics);
    this.#projectionOptions = options;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  materializeAsset(input: AssetArtifact): void {
    const previous = this.#assetsById.get(input.assetEntityId);
    const artifact = {
      ...previous,
      ...input,
      diagnostics: combineDiagnostics(
        previous?.diagnostics ?? createDiagnostics(),
        input.diagnostics,
      ),
    };
    this.#assetsById.set(input.assetEntityId, artifact);
    this.#assetsBySourceCacheKey.set(
      assetSourceCacheKey(artifact.source, artifact.resolverIdentity, artifact.origin),
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

  replaceGraphArtifact<
    TSourceContext extends SourceContextValue | void,
    TTemplates extends SlideTemplateSet,
  >(source: CompositionSource<TSourceContext, TTemplates>, graph: SemanticAuthorGraph): void {
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
    this.#projectionOptions = undefined;
    this.clearIncrementalProjectionReuseSnapshot();
  }

  replaceProjectionArtifact(projection: PptxPackageModelCandidate): void {
    this.#sourcesByKey.clear();
    this.#graphsBySourceKey.clear();
    this.#projection = pptxProjectionArtifact(projection, projectionShapeDiagnostics(projection));
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

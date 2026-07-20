import type { AssetLoadResult, AssetProbeResult, AssetSource, AssetSourceField } from "../assets";
import type { DeckOptions } from "../authoring/options";
import type { ComposedAuthorRoot } from "../composition/types";
import type { Diagnostics } from "../diagnostics";
import type {
  AssetEntity,
  AssetEntityId,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SourceOrigin,
  StyleEntity,
  StyleEntityId,
} from "../graph";
import type { MediaSourceOrigin } from "../media-source-origin";
import type { PdfPageModel } from "../projection/pdf/model";
import type {
  PackageDependencyEdge,
  PackageDependencyReason,
  PackageDependencySnapshot,
  ProjectionArtifact,
  PptxProjectionArtifact,
  SlideProjectionFingerprintSnapshot,
} from "../projection/pptx/artifact";
import type { PackagePartId, PptxPackageModelCandidate } from "../projection/pptx/model";
import type { ResolvedStyleMap } from "../style/resolve";

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
  readonly compositionRevision?: string;
  readonly pluginSetRevision?: string;
};

export type GraphArtifactReplacement = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly roots: readonly ComposedAuthorRoot[];
  readonly compositionDiagnostics: Diagnostics;
  readonly diagnostics: Diagnostics;
  readonly compositionRevision?: string;
  readonly pluginSetRevision?: string;
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

type ProjectionArtifactIndexes = Omit<
  PptxProjectionArtifact<PptxPackageModelCandidate>,
  keyof ProjectionArtifact<PptxPackageModelCandidate>
>;

export type DefinedProjectionArtifact = ProjectionArtifact<
  PptxPackageModelCandidate | PdfPageModel
> &
  ProjectionArtifactIndexes;

export type {
  PackageDependencyEdge,
  PackageDependencyReason,
  PackageDependencySnapshot,
  ProjectionArtifact,
  PptxProjectionArtifact,
  SlideProjectionFingerprintSnapshot,
};

export type AssetArtifact = {
  readonly assetEntityId: AssetEntityId;
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
  readonly resolverIdentity?: string;
  readonly origin?: MediaSourceOrigin;
  readonly probe?: AssetProbeResult;
  readonly load?: AssetLoadResult;
  readonly diagnostics: Diagnostics;
};

export type AssetArtifactStore = {
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly assetsBySourceCacheKey: ReadonlyMap<string, AssetArtifact>;
  readonly pptxBuildArtifactsByPartId: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
  materializeAsset(input: AssetArtifact): void;
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
  sourceField?: AssetSourceField,
): string {
  const fieldKey = sourceField ? `:${sourceField}` : "";
  const originKey = origin
    ? `:${origin.sourceIdentity ?? ""}:${origin.importer ?? ""}:${origin.source ?? ""}`
    : "";
  switch (source.kind) {
    case "bytes":
      return `${resolverIdentity}${fieldKey}:bytes:${source.mediaType ?? ""}:${source.extension ?? ""}:${source.bytes.byteLength}:${fingerprintBytes(source.bytes)}`;
    case "data":
      return `${resolverIdentity}${fieldKey}:data:${source.data}`;
    case "path":
      return `${resolverIdentity}${fieldKey}:path${originKey}:${source.path}`;
    case "url":
      return `${resolverIdentity}${fieldKey}:url:${source.url}`;
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

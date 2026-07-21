import type { AssetLoadResult, AssetProbeResult, AssetSource, AssetSourceField } from "./assets";
import type { Diagnostics } from "./diagnostics";
import type { AssetEntityId } from "./graph";
import type { MediaSourceOrigin } from "./media-source-origin";

/** Reusable resource observation owned by the asset loading boundary. */
export type AssetArtifact = {
  readonly assetEntityId: AssetEntityId;
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
  readonly resolverIdentity?: string;
  readonly origin?: MediaSourceOrigin;
  readonly probe?: AssetProbeResult;
  readonly load?: AssetLoadResult;
  readonly probeDiagnostics?: Diagnostics;
  readonly loadDiagnostics?: Diagnostics;
  readonly diagnostics: Diagnostics;
};

/** Mutable materialization seam exposed by the asset loading boundary. */
export type AssetArtifactStore = {
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly assetsBySourceCacheKey: ReadonlyMap<string, AssetArtifact>;
  materializeAsset(input: AssetArtifact): void;
};

/** One concrete byte dependency requested by the selected output adapter. */
export type AssetLoadRequirement = {
  readonly assetEntityId: AssetEntityId;
  readonly packagePartPath: string;
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
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

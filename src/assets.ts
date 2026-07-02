import type { Diagnostic } from "./diagnostics";

export type AssetMediaType = string;

export type AssetResolutionProvenanceKind =
  | "inline"
  | "fetch"
  | "file"
  | "publicAsset"
  | "generatedAsset";

export type AssetResolutionHashSource = "loader" | "bytes";

export type AssetResolutionProvenance = {
  readonly kind: AssetResolutionProvenanceKind;
  readonly resolvedId?: string;
  readonly hashSource?: AssetResolutionHashSource;
};

export type AssetSource =
  | {
      readonly kind: "data";
      readonly data: string;
    }
  | {
      readonly kind: "bytes";
      readonly bytes: Uint8Array;
      readonly mediaType?: AssetMediaType;
      readonly extension?: string;
    }
  | {
      readonly kind: "url";
      readonly url: string;
    }
  | {
      readonly kind: "path";
      readonly path: string;
    };

export type AssetProbeResult = {
  readonly mediaType?: AssetMediaType;
  readonly extension?: string;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly hash?: string;
  readonly provenance?: AssetResolutionProvenance;
};

export type AssetLoadResult = AssetProbeResult & {
  readonly bytes: Uint8Array;
};

export type AssetSourceField = "src" | "data" | "poster" | "posterData" | "font";

export type AssetLoaderOutcome<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly diagnostics?: readonly Diagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
    }
  | undefined;

export type AssetLoaderContext = {
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId: string;
  readonly sourceField: AssetSourceField;
  readonly origin?: {
    readonly importer?: string;
    readonly source?: string;
  };
};

export type AssetLoader = {
  readonly resolverIdentity: string;
  probe?(context: AssetLoaderContext): Promise<AssetLoaderOutcome<AssetProbeResult>>;
  load?(context: AssetLoaderContext): Promise<AssetLoaderOutcome<AssetLoadResult>>;
};

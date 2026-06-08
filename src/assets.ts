import type { Diagnostic } from "./diagnostics";

export type AssetMediaType = string;

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
  readonly diagnostics?: readonly Diagnostic[];
};

export type AssetLoadResult = AssetProbeResult & {
  readonly bytes: Uint8Array;
};

export type AssetLoaderContext = {
  readonly source: AssetSource;
  readonly scope?: string;
};

export type AssetLoader = {
  readonly name?: string;
  probe?(context: AssetLoaderContext): Promise<AssetProbeResult | undefined>;
  load?(context: AssetLoaderContext): Promise<AssetLoadResult | undefined>;
};

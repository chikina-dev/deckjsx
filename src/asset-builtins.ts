import type { AssetLoadResult, AssetProbeResult, AssetSource } from "./assets";
import { createDiagnostics, diagnostic, type Diagnostics } from "./diagnostics";

export const BUILTIN_ASSET_RESOLVER_IDENTITY = "deckjsx:builtin";

export type BuiltInAssetProbeResult = {
  readonly probe: AssetProbeResult;
  readonly load?: AssetLoadResult;
  readonly diagnostics?: Diagnostics;
};

function extensionFromPath(value: string): string | undefined {
  const path = value.split(/[?#]/, 1)[0] ?? value;
  const extension = path.split(".").pop();
  return extension && extension.length <= 8 && extension !== path
    ? extension.toLowerCase()
    : undefined;
}

function mediaTypeFromExtension(extension: string | undefined): string | undefined {
  switch (extension?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
}

function extensionFromMediaType(mediaType: string | undefined): string | undefined {
  switch (mediaType?.split(";")[0]?.trim().toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return undefined;
  }
}

function readUint16Be(bytes: Uint8Array, offset: number): number | undefined {
  return offset + 1 < bytes.byteLength ? (bytes[offset]! << 8) | bytes[offset + 1]! : undefined;
}

function readUint16Le(bytes: Uint8Array, offset: number): number | undefined {
  return offset + 1 < bytes.byteLength ? bytes[offset]! | (bytes[offset + 1]! << 8) : undefined;
}

function readUint32Be(bytes: Uint8Array, offset: number): number | undefined {
  return offset + 3 < bytes.byteLength
    ? ((bytes[offset]! << 24) |
        (bytes[offset + 1]! << 16) |
        (bytes[offset + 2]! << 8) |
        bytes[offset + 3]!) >>>
        0
    : undefined;
}

function svgDimensionsFromText(svg: string): { readonly width?: number; readonly height?: number } {
  const svgTag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  const dimension = (name: string): number | undefined => {
    const match = svgTag
      ? new RegExp(`\\b${name}=["']?([0-9.]+)(?:px)?`, "i").exec(svgTag)
      : undefined;
    const value = match ? Number.parseFloat(match[1] ?? "") : undefined;
    return value && Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const width = dimension("width");
  const height = dimension("height");

  if (width && height) {
    return { width, height };
  }

  const viewBox = /\bviewBox=["']?([0-9.\-\s]+)["']?/i.exec(svgTag ?? "")?.[1];
  const [, , viewBoxWidth, viewBoxHeight] = viewBox
    ? viewBox
        .trim()
        .split(/\s+/)
        .map((value) => Number.parseFloat(value))
    : [];
  return {
    ...(width || (viewBoxWidth && viewBoxWidth > 0) ? { width: width ?? viewBoxWidth } : {}),
    ...(height || (viewBoxHeight && viewBoxHeight > 0) ? { height: height ?? viewBoxHeight } : {}),
  };
}

function imageDimensionsFromBytes(input: {
  readonly bytes: Uint8Array;
  readonly mediaType?: string;
  readonly extension?: string;
}): { readonly width?: number; readonly height?: number } {
  const mediaType = input.mediaType?.split(";")[0]?.trim().toLowerCase();
  const extension = input.extension?.toLowerCase();
  const bytes = input.bytes;

  if (
    (mediaType === "image/png" || extension === "png") &&
    bytes.byteLength >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width = readUint32Be(bytes, 16);
    const height = readUint32Be(bytes, 20);
    return {
      ...(width && width > 0 ? { width } : {}),
      ...(height && height > 0 ? { height } : {}),
    };
  }

  if (
    (mediaType === "image/gif" || extension === "gif") &&
    bytes.byteLength >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    const width = readUint16Le(bytes, 6);
    const height = readUint16Le(bytes, 8);
    return {
      ...(width && width > 0 ? { width } : {}),
      ...(height && height > 0 ? { height } : {}),
    };
  }

  if (
    (mediaType === "image/jpeg" || extension === "jpg" || extension === "jpeg") &&
    bytes.byteLength >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1]!;
      const length = readUint16Be(bytes, offset + 2);
      if (!length || length < 2) {
        return {};
      }

      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) {
        const height = readUint16Be(bytes, offset + 5);
        const width = readUint16Be(bytes, offset + 7);
        return {
          ...(width && width > 0 ? { width } : {}),
          ...(height && height > 0 ? { height } : {}),
        };
      }

      offset += 2 + length;
    }
  }

  if (mediaType === "image/svg+xml" || extension === "svg") {
    return svgDimensionsFromText(new TextDecoder().decode(bytes));
  }

  return {};
}

export async function probeBuiltInAssetSource(
  source: AssetSource,
): Promise<BuiltInAssetProbeResult | undefined> {
  if (source.kind === "bytes") {
    const dimensions = imageDimensionsFromBytes({
      bytes: source.bytes,
      mediaType: source.mediaType,
      extension: source.extension,
    });
    const probe = {
      ...(source.mediaType ? { mediaType: source.mediaType } : {}),
      ...(source.extension ? { extension: source.extension } : {}),
      ...(dimensions.width ? { width: dimensions.width } : {}),
      ...(dimensions.height ? { height: dimensions.height } : {}),
      byteLength: source.bytes.byteLength,
    };
    return { probe, load: { ...probe, bytes: source.bytes } };
  }

  if (source.kind === "url") {
    const extension = extensionFromPath(source.url);
    const mediaType = mediaTypeFromExtension(extension);
    return {
      probe: {
        ...(mediaType ? { mediaType } : {}),
        ...(extension ? { extension } : {}),
      },
      diagnostics: builtInRemoteAssetFetchDisabledDiagnostics(source),
    };
  }

  if (source.kind !== "data") {
    return undefined;
  }

  const commaIndex = source.data.indexOf(",");
  const metadata =
    source.data.startsWith("data:") && commaIndex !== -1 ? source.data.slice(5, commaIndex) : "";
  const mediaType = metadata ? metadata.replace(/;base64$/, "") : undefined;
  const extension = extensionFromMediaType(mediaType);
  const payload = commaIndex === -1 ? source.data : source.data.slice(commaIndex + 1);
  const bytes = bytesFromDataSource(source);
  const byteLength = bytes.byteLength;
  const dimensions =
    mediaType === "image/svg+xml"
      ? svgDimensionsFromText(dataPayloadText(metadata, payload))
      : imageDimensionsFromBytes({ bytes, mediaType, extension });
  const probe = {
    ...(mediaType ? { mediaType } : {}),
    ...(extension ? { extension } : {}),
    ...(byteLength > 0 ? { byteLength } : {}),
    ...(dimensions.width ? { width: dimensions.width } : {}),
    ...(dimensions.height ? { height: dimensions.height } : {}),
  };

  return { probe, load: { ...probe, bytes } };
}

function builtInRemoteAssetFetchDisabledDiagnostics(source: AssetSource): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_PROJECT_REMOTE_ASSET_FETCH_DISABLED",
      title: "built-in remote asset fetch is disabled",
      message:
        "The built-in Asset Loading Boundary does not fetch HTTP(S) media URLs. Provide an explicit AssetLoader to load trusted remote media.",
      labels: [
        {
          path: "asset.probe",
          message: source.kind === "url" ? source.url : JSON.stringify(source),
          severity: "primary",
        },
      ],
      notes: [
        "phase=probe",
        `resolverIdentity=${BUILTIN_ASSET_RESOLVER_IDENTITY}`,
        `sourceKind=${source.kind}`,
      ],
    }),
  ]);
}

function dataPayloadText(metadata: string, payload: string): string {
  if (!metadata.endsWith(";base64")) {
    return decodeURIComponent(payload);
  }

  return globalThis.atob(payload);
}

function bytesFromDataSource(source: Extract<AssetSource, { kind: "data" }>): Uint8Array {
  const commaIndex = source.data.indexOf(",");
  if (!source.data.startsWith("data:") || commaIndex === -1) {
    return new TextEncoder().encode(source.data);
  }

  const metadata = source.data.slice(0, commaIndex);
  const payload = source.data.slice(commaIndex + 1);
  if (!metadata.endsWith(";base64")) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const decoded = globalThis.atob(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export async function loadBuiltInAssetSource(
  source: AssetSource,
): Promise<AssetLoadResult | undefined> {
  if (source.kind === "bytes") {
    return {
      bytes: source.bytes,
      ...(source.mediaType ? { mediaType: source.mediaType } : {}),
      ...(source.extension ? { extension: source.extension } : {}),
      byteLength: source.bytes.byteLength,
    };
  }

  if (source.kind === "url") {
    return undefined;
  }

  if (source.kind !== "data") {
    return undefined;
  }

  const builtIn = await probeBuiltInAssetSource(source);
  if (builtIn?.load) {
    return builtIn.load;
  }

  const probe = builtIn?.probe;
  const bytes = bytesFromDataSource(source);
  const dimensions = imageDimensionsFromBytes({
    bytes,
    mediaType: probe?.mediaType,
    extension: probe?.extension,
  });
  return {
    bytes,
    ...(probe?.mediaType ? { mediaType: probe.mediaType } : {}),
    ...(probe?.extension ? { extension: probe.extension } : {}),
    ...((probe?.width ?? dimensions.width) ? { width: probe?.width ?? dimensions.width } : {}),
    ...((probe?.height ?? dimensions.height) ? { height: probe?.height ?? dimensions.height } : {}),
    byteLength: probe?.byteLength ?? bytes.byteLength,
    ...(probe?.hash ? { hash: probe.hash } : {}),
  };
}

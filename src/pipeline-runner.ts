import type { DeckOptions } from "./authoring/index";
import type { RenderOptions, WriterAdapter } from "./adapter";
import { createWriterRenderContext } from "./adapter-context";
import type {
  AssetLoader,
  AssetLoaderOutcome,
  AssetLoadResult,
  AssetProbeResult,
  AssetSource,
} from "./assets";
import {
  defaultAdapterLimitationsFor,
  defaultWriterAdapterFor,
  isWriterAdapter,
} from "./adapter-registry";
import { createDiagnostics, diagnostic, type Diagnostics } from "./diagnostics";
import type { CompositionSource, SourceContextValue } from "./composition/types";
import { resolveComposition } from "./composition/resolve";
import {
  buildSemanticAuthorGraph,
  type AssetEntity,
  type AssetEntityId,
  type SemanticAuthorGraph,
} from "./graph";
import {
  resultOk,
  stageSummary,
  type InspectionDetailLevel,
  type CompileStages,
  type OutputFormat,
  type ProjectOptions,
  type ProjectionFormat,
  type ProjectStages,
  type RenderedArtifact,
  type RenderInspectionSummary,
  type RenderStages,
  type StageArtifactStatus,
} from "./pipeline";
import {
  PipelineArtifactCollection,
  assetSourceCacheKey,
  type AssetArtifact,
  type DefinedGraphArtifact,
  type DefinedProjectionArtifact,
} from "./pipeline-artifacts";
import { isPptxPackageModel } from "./projection/pptx/model";
import type { ProjectInspectionSummary, PptxPackageModel } from "./projection/pptx/model";
import {
  projectGraphToDocumentModel,
  projectGraphToPartialDocumentModel,
  projectionDiagnosticsForGraph,
  projectionDiagnosticsForModel,
  summarizeProjectedDocumentModel,
} from "./projection/registry";
import { validatePptxPackageModel } from "./projection/pptx/validation";
import { resolveStyles, type ResolvedStyleMap } from "./style/resolve";
import type { SlideTemplateSet } from "./templates";
import { pptxMediaAssetLoadRequirements } from "./writers/pptx";

type PresentStageArtifactStatus = Exclude<StageArtifactStatus, "missing">;

export type CompileResult = CompileResultWithGraph | CompileResultWithoutGraph;

export type CompileResultWithGraph = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: CompileStages<PresentStageArtifactStatus>;
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
};

export type CompileResultWithoutGraph = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: CompileStages<"missing">;
  readonly graph?: undefined;
  readonly resolvedStyles?: undefined;
};

export type ProjectResult = ProjectResultWithProjection | ProjectResultWithoutProjection;

export type ProjectResultWithProjection = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: ProjectStages<StageArtifactStatus, PresentStageArtifactStatus>;
  readonly format: ProjectionFormat;
  readonly projection: PptxPackageModel;
  readonly summary?: ProjectInspectionSummary;
};

export type ProjectResultWithoutProjection = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: ProjectStages<StageArtifactStatus, "missing">;
  readonly format: ProjectionFormat;
  readonly projection?: undefined;
  readonly summary?: undefined;
};

export type RenderResult = RenderResultWithArtifact | RenderResultWithoutArtifact;

export type RenderResultWithArtifact = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: RenderStages<
    StageArtifactStatus,
    StageArtifactStatus,
    PresentStageArtifactStatus
  >;
  readonly format: OutputFormat;
  readonly artifact: RenderedArtifact;
  readonly summary?: RenderInspectionSummary;
};

export type RenderResultWithoutArtifact = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: RenderStages<StageArtifactStatus, StageArtifactStatus, "missing">;
  readonly format: OutputFormat;
  readonly artifact?: undefined;
  readonly summary?: undefined;
};

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
}

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

const BUILTIN_ASSET_RESOLVER_IDENTITY = "deckjsx:builtin";

function assetLoadersWithIdentities(
  loaders: readonly AssetLoader[] | undefined,
): readonly { readonly loader: AssetLoader; readonly resolverIdentity: string }[] {
  return (loaders ?? []).map((loader) => ({
    loader,
    resolverIdentity: loader.resolverIdentity,
  }));
}

function assetLoaderForIdentity(
  loaders: readonly { readonly loader: AssetLoader; readonly resolverIdentity: string }[],
  resolverIdentity: string,
): { readonly loader: AssetLoader; readonly resolverIdentity: string } | undefined {
  return loaders.find((loader) => loader.resolverIdentity === resolverIdentity);
}

function assetSourceDiagnosticValue(source: AssetSource): string {
  switch (source.kind) {
    case "bytes":
      return `bytes:${source.mediaType ?? "unknown"}:${source.bytes.byteLength}`;
    case "data":
      return source.data.startsWith("data:")
        ? source.data.slice(0, source.data.indexOf(",") + 1)
        : "data";
    case "path":
      return source.path;
    case "url":
      return source.url;
  }
}

function assetDiagnosticFromError(input: {
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
  readonly error: unknown;
}): Diagnostics {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: input.code,
      title: input.title,
      message,
      labels: [
        {
          path: input.packagePartPath ?? `asset.${input.phase}`,
          message: assetSourceDiagnosticValue(input.source),
          severity: "primary",
        },
      ],
      notes: [
        `phase=${input.phase}`,
        `resolverIdentity=${input.resolverIdentity}`,
        input.assetEntityId ? `assetEntityId=${input.assetEntityId}` : undefined,
        input.packagePartPath ? `packagePartPath=${input.packagePartPath}` : undefined,
        `sourceKind=${input.source.kind}`,
      ].filter((note): note is string => note !== undefined),
    }),
  ]);
}

function invalidAssetResultDiagnostics(input: {
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly invalidFields: readonly string[];
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
}): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: input.code,
      title: input.title,
      message: "Asset loader returned an invalid result shape.",
      labels: [
        {
          path: input.packagePartPath ?? `asset.${input.phase}`,
          message: assetSourceDiagnosticValue(input.source),
          severity: "primary",
        },
      ],
      notes: [
        `phase=${input.phase}`,
        `resolverIdentity=${input.resolverIdentity}`,
        `invalidFields=${input.invalidFields.join(",")}`,
        input.assetEntityId ? `assetEntityId=${input.assetEntityId}` : undefined,
        input.packagePartPath ? `packagePartPath=${input.packagePartPath}` : undefined,
        `sourceKind=${input.source.kind}`,
      ].filter((note): note is string => note !== undefined),
    }),
  ]);
}

function invalidAssetOutcomeDiagnostics(input: {
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
}): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: input.code,
      title: input.title,
      message:
        "Asset loader returned ok=false without at least one error diagnostic to explain the failed resolution.",
      labels: [
        {
          path: input.packagePartPath ?? `asset.${input.phase}`,
          message: assetSourceDiagnosticValue(input.source),
          severity: "primary",
        },
      ],
      notes: [
        `phase=${input.phase}`,
        `resolverIdentity=${input.resolverIdentity}`,
        input.assetEntityId ? `assetEntityId=${input.assetEntityId}` : undefined,
        input.packagePartPath ? `packagePartPath=${input.packagePartPath}` : undefined,
        `sourceKind=${input.source.kind}`,
      ].filter((note): note is string => note !== undefined),
    }),
  ]);
}

function assetLoaderOutcomeValue<T>(input: {
  readonly outcome: AssetLoaderOutcome<T>;
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
}):
  | { readonly kind: "unresolved" }
  | { readonly kind: "resolved"; readonly value: T; readonly diagnostics: Diagnostics }
  | { readonly kind: "failed"; readonly diagnostics: Diagnostics } {
  if (input.outcome === undefined) {
    return { kind: "unresolved" };
  }

  if (!input.outcome.ok) {
    const diagnostics = createDiagnostics(input.outcome.diagnostics);
    return diagnostics.hasErrors
      ? { kind: "failed", diagnostics }
      : {
          kind: "failed",
          diagnostics: invalidAssetOutcomeDiagnostics(input),
        };
  }

  return {
    kind: "resolved",
    value: input.outcome.value,
    diagnostics: createDiagnostics(input.outcome.diagnostics ?? []),
  };
}

function missingRequiredAssetProbeDiagnostics(input: {
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly missingFields: readonly string[];
}): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_PROJECT_ASSET_PROBE_INCOMPLETE",
      title: "asset probe result is incomplete",
      message: "Asset probe did not return metadata required by the projected package model.",
      labels: [
        {
          path: "asset.probe",
          message: assetSourceDiagnosticValue(input.source),
          severity: "primary",
        },
      ],
      notes: [
        "phase=probe",
        `resolverIdentity=${input.resolverIdentity}`,
        `missingFields=${input.missingFields.join(",")}`,
        input.assetEntityId ? `assetEntityId=${input.assetEntityId}` : undefined,
        `sourceKind=${input.source.kind}`,
      ].filter((note): note is string => note !== undefined),
    }),
  ]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assetProbeInvalidFields(result: AssetProbeResult): readonly string[] {
  const invalidFields: string[] = [];

  if (result.mediaType !== undefined && !isNonEmptyString(result.mediaType)) {
    invalidFields.push("mediaType");
  }
  if (result.extension !== undefined && !isNonEmptyString(result.extension)) {
    invalidFields.push("extension");
  }
  if (result.hash !== undefined && !isNonEmptyString(result.hash)) {
    invalidFields.push("hash");
  }
  if (result.width !== undefined && (!isFiniteNumber(result.width) || result.width <= 0)) {
    invalidFields.push("width");
  }
  if (result.height !== undefined && (!isFiniteNumber(result.height) || result.height <= 0)) {
    invalidFields.push("height");
  }
  if (
    result.byteLength !== undefined &&
    (!isFiniteNumber(result.byteLength) || result.byteLength < 0)
  ) {
    invalidFields.push("byteLength");
  }

  return invalidFields;
}

function missingRequiredAssetProbeFields(input: {
  probe: AssetProbeResult | undefined;
  assetKind: AssetEntity["kind"];
}): readonly string[] {
  if (input.assetKind === "video") {
    return [];
  }

  const missingFields: string[] = [];
  if (input.probe?.width === undefined) {
    missingFields.push("width");
  }
  if (input.probe?.height === undefined) {
    missingFields.push("height");
  }
  return missingFields;
}

function normalizedAssetProbeResult(input: {
  readonly result: AssetProbeResult;
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
}):
  | { readonly ok: true; readonly result: AssetProbeResult }
  | { readonly ok: false; readonly diagnostics: Diagnostics } {
  const invalidFields = assetProbeInvalidFields(input.result);
  if (invalidFields.length > 0) {
    return {
      ok: false,
      diagnostics: invalidAssetResultDiagnostics({
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_INVALID",
        title: "asset probe result is invalid",
        phase: "probe",
        source: input.source,
        resolverIdentity: input.resolverIdentity,
        assetEntityId: input.assetEntityId,
        invalidFields,
      }),
    };
  }

  return { ok: true, result: input.result };
}

function normalizedAssetLoadResult(input: {
  readonly result: AssetLoadResult;
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
}):
  | { readonly ok: true; readonly result: AssetLoadResult }
  | { readonly ok: false; readonly diagnostics: Diagnostics } {
  const invalidFields = [...assetProbeInvalidFields(input.result)];
  if (!(input.result.bytes instanceof Uint8Array)) {
    invalidFields.push("bytes");
  }

  if (invalidFields.length > 0) {
    return {
      ok: false,
      diagnostics: invalidAssetResultDiagnostics({
        stage: "render",
        code: "E_RENDER_ASSET_LOAD_INVALID",
        title: "asset load result is invalid",
        phase: "load",
        source: input.source,
        resolverIdentity: input.resolverIdentity,
        assetEntityId: input.assetEntityId,
        packagePartPath: input.packagePartPath,
        invalidFields,
      }),
    };
  }

  return { ok: true, result: input.result };
}

function assetSourceFromEntity(asset: AssetEntity): AssetSource {
  switch (asset.source.kind) {
    case "path":
      return { kind: "path", path: asset.source.path };
    case "url":
      return { kind: "url", url: asset.source.url };
    case "data":
      return { kind: "data", data: asset.source.data };
  }
}

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

type BuiltInAssetProbeResult = {
  readonly probe: AssetProbeResult;
  readonly load?: AssetLoadResult;
};

async function probeBuiltInAssetSource(
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
    if (typeof fetch !== "function") {
      return {
        probe: {
          ...(mediaType ? { mediaType } : {}),
          ...(extension ? { extension } : {}),
        },
      };
    }

    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch asset URL ${source.url}: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? mediaType;
    const resolvedExtension = extension ?? extensionFromMediaType(contentType);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const dimensions = imageDimensionsFromBytes({
      bytes,
      mediaType: contentType,
      extension: resolvedExtension,
    });
    const probe = {
      ...(contentType ? { mediaType: contentType.split(";")[0] } : {}),
      ...(resolvedExtension ? { extension: resolvedExtension } : {}),
      ...(dimensions.width ? { width: dimensions.width } : {}),
      ...(dimensions.height ? { height: dimensions.height } : {}),
      byteLength: bytes.byteLength,
    };
    return { probe, load: { ...probe, bytes } };
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

async function loadBuiltInAssetSource(source: AssetSource): Promise<AssetLoadResult | undefined> {
  if (source.kind === "bytes") {
    return {
      bytes: source.bytes,
      ...(source.mediaType ? { mediaType: source.mediaType } : {}),
      ...(source.extension ? { extension: source.extension } : {}),
      byteLength: source.bytes.byteLength,
    };
  }

  if (source.kind === "url") {
    if (typeof fetch !== "function") {
      return undefined;
    }

    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch asset URL ${source.url}: ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? undefined;
    const extension = extensionFromPath(source.url) ?? extensionFromMediaType(contentType);
    const dimensions = imageDimensionsFromBytes({ bytes, mediaType: contentType, extension });
    return {
      bytes,
      ...(contentType ? { mediaType: contentType.split(";")[0] } : {}),
      ...(extension ? { extension } : {}),
      ...(dimensions.width ? { width: dimensions.width } : {}),
      ...(dimensions.height ? { height: dimensions.height } : {}),
      byteLength: bytes.byteLength,
    };
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

async function resolveAssetArtifacts(input: {
  graph: SemanticAuthorGraph;
  loaders?: readonly AssetLoader[];
  artifacts?: PipelineArtifactCollection;
}): Promise<{
  diagnostics: Diagnostics;
  assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
}> {
  const diagnostics: Diagnostics[] = [];
  const assetsById = new Map<AssetEntityId, AssetArtifact>();
  const loaders = assetLoadersWithIdentities(input.loaders);

  for (const [assetEntityId, asset] of input.graph.assets) {
    const source = assetSourceFromEntity(asset);
    let probe: AssetProbeResult | undefined;
    let load: AssetLoadResult | undefined;
    let resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
    let assetDiagnostics = emptyDiagnostics();
    let cached = input.artifacts?.assetsById.get(assetEntityId);

    if (!cached) {
      for (const { resolverIdentity } of loaders) {
        cached = input.artifacts?.assetsBySourceCacheKey.get(
          assetSourceCacheKey(source, resolverIdentity),
        );
        if (cached?.probe) {
          break;
        }
      }
    }

    if (!cached) {
      cached = input.artifacts?.assetsBySourceCacheKey.get(
        assetSourceCacheKey(source, BUILTIN_ASSET_RESOLVER_IDENTITY),
      );
    }

    if (cached?.probe) {
      const artifact = {
        ...cached,
        assetEntityId,
      } satisfies AssetArtifact;
      input.artifacts?.materializeAsset(artifact);
      assetsById.set(assetEntityId, artifact);
      diagnostics.push(artifact.diagnostics);
      continue;
    }

    for (const { loader, resolverIdentity: loaderResolverIdentity } of loaders) {
      try {
        const outcome = assetLoaderOutcomeValue({
          outcome: await loader.probe?.({
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
            sourceField: asset.sourceField,
          }),
          stage: "project",
          code: "E_PROJECT_ASSET_PROBE_OUTCOME_INVALID",
          title: "asset probe outcome is invalid",
          phase: "probe",
          source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId,
        });
        if (outcome.kind === "failed") {
          diagnostics.push(outcome.diagnostics);
          continue;
        }
        if (outcome.kind === "resolved") {
          const normalized = normalizedAssetProbeResult({
            result: outcome.value,
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
          });
          if (!normalized.ok) {
            diagnostics.push(normalized.diagnostics);
            continue;
          }

          probe = normalized.result;
          resolverIdentity = loaderResolverIdentity;
          assetDiagnostics = outcome.diagnostics;
          break;
        }
      } catch (error) {
        diagnostics.push(
          assetDiagnosticFromError({
            stage: "project",
            code: "E_PROJECT_ASSET_PROBE_FAILED",
            title: "asset probe failed",
            phase: "probe",
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
            error,
          }),
        );
      }
    }

    if (!probe) {
      try {
        const builtInProbe = await probeBuiltInAssetSource(source);
        if (builtInProbe) {
          const normalized = normalizedAssetProbeResult({
            result: builtInProbe.probe,
            source,
            resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
            assetEntityId,
          });
          if (normalized.ok) {
            probe = normalized.result;
            load = builtInProbe.load;
          } else {
            diagnostics.push(normalized.diagnostics);
          }
        }
      } catch (error) {
        diagnostics.push(
          assetDiagnosticFromError({
            stage: "project",
            code: "E_PROJECT_ASSET_PROBE_FAILED",
            title: "asset probe failed",
            phase: "probe",
            source,
            resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
            assetEntityId,
            error,
          }),
        );
      }
      resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
    }

    const missingRequiredFields = missingRequiredAssetProbeFields({
      probe,
      assetKind: asset.kind,
    });
    if (missingRequiredFields.length > 0) {
      diagnostics.push(
        missingRequiredAssetProbeDiagnostics({
          source,
          resolverIdentity,
          assetEntityId,
          missingFields: missingRequiredFields,
        }),
      );
    }

    const artifactDiagnostics = assetDiagnostics;
    diagnostics.push(artifactDiagnostics);
    const artifact = {
      assetEntityId,
      source,
      sourceField: asset.sourceField,
      resolverIdentity,
      ...(probe ? { probe } : {}),
      ...(load ? { load } : {}),
      diagnostics: artifactDiagnostics,
    } satisfies AssetArtifact;
    input.artifacts?.materializeAsset(artifact);
    assetsById.set(assetEntityId, artifact);
  }

  return { diagnostics: combineDiagnostics(...diagnostics), assetsById };
}

async function loadAssetArtifacts(input: {
  artifacts?: PipelineArtifactCollection;
  loaders?: readonly AssetLoader[];
  projection: PptxPackageModel;
}): Promise<Diagnostics> {
  if (!input.artifacts) {
    return emptyDiagnostics();
  }

  const diagnostics: Diagnostics[] = [];
  const loaders = assetLoadersWithIdentities(input.loaders);
  const mediaPayloads = pptxMediaAssetLoadRequirements({
    projection: input.projection,
    assetsById: input.artifacts.assetsById,
    buildArtifactsByPartId: input.artifacts.pptxBuildArtifactsByPartId,
  });

  mediaLoop: for (const media of mediaPayloads) {
    const current = input.artifacts.assetsById.get(media.assetEntityId);
    const currentMatchesSource =
      current !== undefined &&
      assetSourceCacheKey(current.source, current.resolverIdentity) ===
        assetSourceCacheKey(media.source, current.resolverIdentity);

    if (currentMatchesSource && current.load) {
      continue;
    }

    const currentResolverIdentity = currentMatchesSource ? current.resolverIdentity : undefined;
    const cached = input.artifacts.assetsBySourceCacheKey.get(
      assetSourceCacheKey(media.source, currentResolverIdentity),
    );
    if (cached?.load) {
      input.artifacts.materializeAsset({
        ...cached,
        assetEntityId: media.assetEntityId,
      });
      diagnostics.push(cached.diagnostics);
      continue;
    }

    let load: AssetLoadResult | undefined;
    let resolverIdentity = currentResolverIdentity ?? BUILTIN_ASSET_RESOLVER_IDENTITY;
    let assetDiagnostics = emptyDiagnostics();
    const scopedLoader = currentResolverIdentity
      ? assetLoaderForIdentity(loaders, currentResolverIdentity)
      : undefined;
    const scopedLoaders = currentResolverIdentity ? (scopedLoader ? [scopedLoader] : []) : loaders;

    for (const { loader, resolverIdentity: loaderResolverIdentity } of scopedLoaders) {
      const loaderCached = input.artifacts.assetsBySourceCacheKey.get(
        assetSourceCacheKey(media.source, loaderResolverIdentity),
      );
      if (loaderCached?.load) {
        input.artifacts.materializeAsset({
          ...loaderCached,
          assetEntityId: media.assetEntityId,
        });
        diagnostics.push(loaderCached.diagnostics);
        continue mediaLoop;
      }

      try {
        const outcome = assetLoaderOutcomeValue({
          outcome: await loader.load?.({
            source: media.source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId: media.assetEntityId,
            sourceField: media.sourceField,
          }),
          stage: "render",
          code: "E_RENDER_ASSET_LOAD_OUTCOME_INVALID",
          title: "asset load outcome is invalid",
          phase: "load",
          source: media.source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId: media.assetEntityId,
          packagePartPath: media.packagePartPath,
        });
        if (outcome.kind === "failed") {
          diagnostics.push(outcome.diagnostics);
          continue;
        }
        if (outcome.kind === "resolved") {
          const normalized = normalizedAssetLoadResult({
            result: outcome.value,
            source: media.source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId: media.assetEntityId,
            packagePartPath: media.packagePartPath,
          });
          if (!normalized.ok) {
            diagnostics.push(normalized.diagnostics);
            continue;
          }

          load = normalized.result;
          resolverIdentity = loaderResolverIdentity;
          assetDiagnostics = outcome.diagnostics;
          break;
        }
      } catch (error) {
        diagnostics.push(
          assetDiagnosticFromError({
            stage: "render",
            code: "E_RENDER_ASSET_LOAD_FAILED",
            title: "asset load failed",
            phase: "load",
            source: media.source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId: media.assetEntityId,
            packagePartPath: media.packagePartPath,
            error,
          }),
        );
      }
    }

    if (
      !load &&
      (!currentResolverIdentity || currentResolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY)
    ) {
      try {
        const builtInLoad = await loadBuiltInAssetSource(media.source);
        if (builtInLoad) {
          const normalized = normalizedAssetLoadResult({
            result: builtInLoad,
            source: media.source,
            resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
            assetEntityId: media.assetEntityId,
            packagePartPath: media.packagePartPath,
          });
          if (normalized.ok) {
            load = normalized.result;
          } else {
            diagnostics.push(normalized.diagnostics);
          }
        }
        resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
      } catch (error) {
        diagnostics.push(
          assetDiagnosticFromError({
            stage: "render",
            code: "E_RENDER_ASSET_LOAD_FAILED",
            title: "asset load failed",
            phase: "load",
            source: media.source,
            resolverIdentity,
            assetEntityId: media.assetEntityId,
            packagePartPath: media.packagePartPath,
            error,
          }),
        );
      }
    }

    if (!load) {
      diagnostics.push(
        assetDiagnosticFromError({
          stage: "render",
          code: "E_RENDER_ASSET_LOAD_FAILED",
          title: "asset load failed",
          phase: "load",
          source: media.source,
          resolverIdentity,
          assetEntityId: media.assetEntityId,
          packagePartPath: media.packagePartPath,
          error: new Error("No asset loader returned bytes for this media source."),
        }),
      );
      continue;
    }

    const artifactDiagnostics = currentMatchesSource
      ? combineDiagnostics(current.diagnostics, assetDiagnostics)
      : assetDiagnostics;
    diagnostics.push(assetDiagnostics);
    input.artifacts.materializeAsset({
      assetEntityId: media.assetEntityId,
      source: currentMatchesSource ? current.source : media.source,
      sourceField: media.sourceField,
      resolverIdentity,
      ...(currentMatchesSource && current.probe ? { probe: current.probe } : {}),
      load,
      diagnostics: artifactDiagnostics,
    });
  }

  return combineDiagnostics(...diagnostics);
}

function projectedArtifactStatus(value: undefined, diagnostics: Diagnostics): "missing";
function projectedArtifactStatus<T>(value: T, diagnostics: Diagnostics): PresentStageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus {
  if (value === undefined) {
    return "missing";
  }

  return diagnostics.hasErrors ? "partial" : "available";
}

function includeInspectionSummary(inspection: InspectionDetailLevel | undefined): boolean {
  return inspection !== "none";
}

function includeInspectionDetails(inspection: InspectionDetailLevel | undefined): boolean {
  return inspection === "details";
}

function projectionFormatFor(options: DeckOptions): ProjectionFormat {
  return options.output?.format ?? "pptx";
}

function isRenderInputObject(
  value: RenderOptions | WriterAdapter<PptxPackageModel> | undefined,
): value is RenderOptions | WriterAdapter<PptxPackageModel> {
  return typeof value === "object" && value !== null;
}

function isWriterAdapterLike(
  value: RenderOptions | WriterAdapter<PptxPackageModel> | undefined,
): boolean {
  return (
    isRenderInputObject(value) &&
    (("kind" in value && value.kind === "deckjsx.writerAdapter") ||
      "projectionFormat" in value ||
      "render" in value ||
      ("name" in value && "format" in value))
  );
}

function invalidWriterAdapterDiagnostics(
  value: RenderOptions | WriterAdapter<PptxPackageModel> | undefined,
): Diagnostics | undefined {
  if (!isWriterAdapterLike(value) || isWriterAdapter(value)) {
    return undefined;
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_RENDER_INVALID_WRITER_ADAPTER",
      title: "writer adapter shape is invalid",
      message:
        "render() received a value that looks like a Writer Adapter, but it does not satisfy the deckjsx.writerAdapter runtime contract.",
      labels: [
        {
          path: "render.adapter",
          message:
            'expected kind, name, projectionFormat="pptx", format, options, and render(projection)',
          severity: "primary",
        },
      ],
    }),
  ]);
}

function selectWriterAdapter(input: {
  renderInput: RenderOptions | WriterAdapter<PptxPackageModel> | undefined;
  projectionFormat: ProjectionFormat;
}):
  | { readonly ok: true; readonly adapter: WriterAdapter<PptxPackageModel> }
  | { readonly ok: false; readonly diagnostics: Diagnostics; readonly format: OutputFormat } {
  const invalidAdapterDiagnostics = invalidWriterAdapterDiagnostics(input.renderInput);

  if (invalidAdapterDiagnostics) {
    return {
      ok: false,
      diagnostics: invalidAdapterDiagnostics,
      format: input.projectionFormat,
    };
  }

  return {
    ok: true,
    adapter: isWriterAdapter(input.renderInput)
      ? input.renderInput
      : defaultWriterAdapterFor(input.projectionFormat, input.renderInput ?? {}),
  };
}

function writerAdapterFormatDiagnostics(input: {
  adapter: WriterAdapter;
  deckFormat: ProjectionFormat;
}): Diagnostics {
  const adapterFormat = input.adapter.format;
  const deckFormat = input.deckFormat;

  if (adapterFormat === deckFormat) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_RENDER_ADAPTER_FORMAT_MISMATCH",
      title: "writer adapter format differs from deck output format",
      message:
        "The selected Writer Adapter format does not match this Deck's configured output format.",
      labels: [
        {
          path: "render.adapter.format",
          message: `adapter=${adapterFormat}, deck=${deckFormat}`,
        },
      ],
    }),
  ]);
}

function diagnosticFromError(input: {
  stage: "compile" | "project" | "render";
  code: string;
  title: string;
  error: unknown;
}): Diagnostics {
  const message = input.error instanceof Error ? input.error.message : String(input.error);

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: input.code,
      title: input.title,
      message,
      labels: [{ path: input.stage, message }],
    }),
  ]);
}

export function compileSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  artifacts?: PipelineArtifactCollection,
): CompileResult {
  const composition = resolveComposition(source);

  if (composition.diagnostics.hasErrors) {
    artifacts?.materializeComposition(composition.roots, composition.diagnostics);

    return {
      ok: false,
      diagnostics: composition.diagnostics,
      stages: {
        compile: stageSummary("compile", composition.diagnostics, "missing"),
      },
    };
  }

  const result = buildSemanticAuthorGraph(composition.roots ?? []);
  const styleResult = result.graph
    ? resolveStyles(result.graph, composition.roots ?? [])
    : undefined;
  const diagnostics = styleResult
    ? combineDiagnostics(result.diagnostics, styleResult.diagnostics)
    : result.diagnostics;
  artifacts?.materializeComposition(composition.roots, composition.diagnostics);
  if (result.graph && styleResult) {
    artifacts?.materializeGraphFromComposition({
      graph: result.graph,
      resolvedStyles: styleResult.resolvedStyles,
      roots: composition.roots ?? [],
      diagnostics,
    });
  }

  if (!result.graph || !styleResult) {
    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
      },
    };
  }

  return {
    ok: resultOk(diagnostics),
    diagnostics,
    stages: {
      compile: stageSummary(
        "compile",
        diagnostics,
        projectedArtifactStatus(result.graph, diagnostics),
      ),
    },
    graph: result.graph,
    resolvedStyles: styleResult.resolvedStyles,
  };
}

export async function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(input: {
  source: CompositionSource<TSourceContext, TTemplates>;
  options: DeckOptions;
  projectOptions?: ProjectOptions;
  projectionFormat?: ProjectionFormat;
  definedGraph?: DefinedGraphArtifact;
  definedProjection?: DefinedProjectionArtifact;
  artifacts?: PipelineArtifactCollection;
  assetLoaders?: readonly AssetLoader[];
}): Promise<ProjectResult> {
  const projectionFormat = input.projectionFormat ?? projectionFormatFor(input.options);

  if (input.definedProjection) {
    const definedProjection = input.definedProjection.projection;
    const diagnostics = combineDiagnostics(
      input.definedProjection.diagnostics,
      isPptxPackageModel(definedProjection)
        ? projectionDiagnosticsForModel({
            projection: definedProjection,
            includeAllUnsupportedSemantics: true,
          })
        : emptyDiagnostics(),
      validatePptxPackageModel(definedProjection),
    );
    if (!isPptxPackageModel(definedProjection)) {
      return {
        ok: resultOk(diagnostics),
        diagnostics,
        stages: {
          compile: stageSummary("compile", emptyDiagnostics(), "available"),
          project: stageSummary("project", diagnostics, "missing"),
        },
        format: projectionFormat,
      };
    }

    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(definedProjection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
        })
      : undefined;

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "available"),
        project: stageSummary(
          "project",
          diagnostics,
          projectedArtifactStatus(definedProjection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection: definedProjection,
      ...(summary ? { summary } : {}),
    };
  }

  const compileResult = input.definedGraph
    ? {
        ok: resultOk(input.definedGraph.diagnostics),
        diagnostics: input.definedGraph.diagnostics,
        stages: {
          compile: stageSummary(
            "compile",
            input.definedGraph.diagnostics,
            projectedArtifactStatus(input.definedGraph.graph, input.definedGraph.diagnostics),
          ),
        },
        graph: input.definedGraph.graph,
        resolvedStyles: input.definedGraph.resolvedStyles,
      }
    : compileSource(input.source, input.artifacts);

  if (
    compileResult.diagnostics.hasErrors ||
    !compileResult.graph ||
    !compileResult.resolvedStyles
  ) {
    return {
      ok: false,
      diagnostics: compileResult.diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary("project", compileResult.diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  try {
    const assetResult = await resolveAssetArtifacts({
      graph: compileResult.graph,
      loaders: input.assetLoaders,
      artifacts: input.artifacts,
    });
    const projection = projectGraphToDocumentModel({
      format: projectionFormat,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      options: input.options,
      assets: assetResult.assetsById,
    });
    const unsupportedProjectionDiagnostics = projectionDiagnosticsForGraph({
      format: projectionFormat,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      options: input.options,
    });
    const unsupportedProjectionModelDiagnostics = projectionDiagnosticsForModel({ projection });
    const projectionDiagnostics = validatePptxPackageModel(projection);
    const diagnostics = combineDiagnostics(
      compileResult.diagnostics,
      assetResult.diagnostics,
      unsupportedProjectionDiagnostics,
      unsupportedProjectionModelDiagnostics,
      projectionDiagnostics,
    );
    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(projection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          graph: compileResult.graph,
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
          resolvedStyles: compileResult.resolvedStyles,
        })
      : undefined;
    input.artifacts?.materializeProjection(projection, diagnostics);

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          projectionDiagnostics,
          projectedArtifactStatus(projection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection,
      ...(summary ? { summary } : {}),
    };
  } catch (error) {
    const projectDiagnostics = diagnosticFromError({
      stage: "project",
      code: "E_PROJECT_FAILED",
      title: "project failed",
      error,
    });
    let diagnostics = combineDiagnostics(compileResult.diagnostics, projectDiagnostics);
    let partialProjection: PptxPackageModel | undefined;
    try {
      partialProjection = projectGraphToPartialDocumentModel({
        format: projectionFormat,
        graph: compileResult.graph,
        resolvedStyles: compileResult.resolvedStyles,
        options: input.options,
      });
      const partialDiagnostics = combineDiagnostics(
        diagnostics,
        projectionDiagnosticsForModel({
          projection: partialProjection,
          includeAllUnsupportedSemantics: true,
        }),
        validatePptxPackageModel(partialProjection),
      );
      diagnostics = partialDiagnostics;
      input.artifacts?.materializeProjection(partialProjection, partialDiagnostics);
    } catch {
      partialProjection = undefined;
    }

    if (!partialProjection) {
      return {
        ok: false,
        diagnostics,
        stages: {
          ...compileResult.stages,
          project: stageSummary("project", projectDiagnostics, "missing"),
        },
        format: projectionFormat,
      };
    }

    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(partialProjection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          graph: compileResult.graph,
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
          resolvedStyles: compileResult.resolvedStyles,
        })
      : undefined;

    return {
      ok: false,
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          projectDiagnostics,
          projectedArtifactStatus(partialProjection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection: partialProjection,
      ...(summary ? { summary } : {}),
    };
  }
}

export async function renderSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(input: {
  source: CompositionSource<TSourceContext, TTemplates>;
  options: DeckOptions;
  renderInput?: RenderOptions | WriterAdapter<PptxPackageModel>;
  definedGraph?: DefinedGraphArtifact;
  definedProjection?: DefinedProjectionArtifact;
  artifacts?: PipelineArtifactCollection;
  assetLoaders?: readonly AssetLoader[];
}): Promise<RenderResult> {
  const artifacts = input.artifacts ?? new PipelineArtifactCollection();
  const projectionFormat = projectionFormatFor(input.options);
  const adapterSelection = selectWriterAdapter({
    renderInput: input.renderInput,
    projectionFormat,
  });

  if (!adapterSelection.ok) {
    return {
      ok: false,
      diagnostics: adapterSelection.diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "missing"),
        project: stageSummary("project", emptyDiagnostics(), "missing"),
        render: stageSummary("render", adapterSelection.diagnostics, "missing"),
      },
      format: adapterSelection.format,
    };
  }

  const adapter = adapterSelection.adapter;
  const projectResult = await projectSource({
    source: input.source,
    options: input.options,
    projectionFormat: adapter.projectionFormat,
    definedGraph: input.definedGraph,
    definedProjection: input.definedProjection,
    artifacts,
    assetLoaders: input.assetLoaders,
    projectOptions: { inspection: "none" },
  });
  const formatDiagnostics = writerAdapterFormatDiagnostics({
    adapter,
    deckFormat: projectionFormat,
  });
  const projectDiagnostics = combineDiagnostics(projectResult.diagnostics, formatDiagnostics);

  if (!projectResult.projection || projectDiagnostics.hasErrors) {
    return {
      ok: false,
      diagnostics: projectDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", projectDiagnostics, "missing"),
      },
      format: adapter.format,
    };
  }

  try {
    const assetLoadDiagnostics = await loadAssetArtifacts({
      artifacts,
      loaders: input.assetLoaders,
      projection: projectResult.projection,
    });
    if (assetLoadDiagnostics.hasErrors) {
      const diagnostics = combineDiagnostics(projectDiagnostics, assetLoadDiagnostics);
      return {
        ok: false,
        diagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", diagnostics, "missing"),
        },
        format: adapter.format,
      };
    }

    const writerContext = createWriterRenderContext({
      assetsById: artifacts.assetsById,
      pptxBuildArtifactsByPartId: artifacts.pptxBuildArtifactsByPartId,
      onBuildArtifacts: (buildArtifacts) => artifacts.materializePptxBuildArtifacts(buildArtifacts),
    });

    const adapterResult = await adapter.render(projectResult.projection, writerContext);
    const renderDiagnostics = combineDiagnostics(
      projectDiagnostics,
      assetLoadDiagnostics,
      adapterResult.diagnostics,
    );
    if (!adapterResult.artifact) {
      return {
        ok: resultOk(renderDiagnostics),
        diagnostics: renderDiagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", renderDiagnostics, "missing"),
        },
        format: adapter.format,
      };
    }

    const summary = includeInspectionSummary(adapter.options.inspection)
      ? adapterResult.summary
      : undefined;

    return {
      ok: resultOk(renderDiagnostics),
      diagnostics: renderDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary(
          "render",
          renderDiagnostics,
          projectedArtifactStatus(adapterResult.artifact, renderDiagnostics),
        ),
      },
      format: adapter.format,
      artifact: adapterResult.artifact,
      ...(summary ? { summary } : {}),
    };
  } catch (error) {
    const renderDiagnostics = diagnosticFromError({
      stage: "render",
      code: "E_RENDER_FAILED",
      title: "render failed",
      error,
    });
    const diagnostics = combineDiagnostics(projectDiagnostics, renderDiagnostics);

    return {
      ok: false,
      diagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", renderDiagnostics, "missing"),
      },
      format: adapter.format,
    };
  }
}

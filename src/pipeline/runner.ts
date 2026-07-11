import type { DeckOptions } from "../authoring/options";
import { validateDeckOptions } from "../authoring/options/validation";
import type { RenderOptions, WriterAdapter, WriterAdapterResult } from "../adapter";
import { createWriterRenderContext } from "../adapter/context";
import type { AssetLoader, AssetLoadResult, AssetProbeResult, AssetSource } from "../assets";
import {
  BUILTIN_ASSET_RESOLVER_IDENTITY,
  assetDependencyBoundaryValue,
  assetDiagnostic,
  assetLoaderBoundaryOutcome,
  assetLoaderForIdentity,
  assetLoadersWithIdentities,
  assetSourceFromEntity,
  missingAssetContextDiagnostics,
  missingRequiredAssetProbeDiagnostics,
  missingRequiredAssetProbeFields,
  normalizedAssetLoadResult,
  normalizedAssetProbeResult,
  summarizeAssetResolutions,
} from "../asset-loading";
import { defaultAdapterLimitationsFor, selectWriterAdapter } from "../adapter/registry";
import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import {
  COMPOSITION_SOURCE,
  type CompositionSource,
  type SourceContextValue,
} from "../composition/types";
import { compositionRevisionForSource } from "../composition/source";
import { applyPluginHooks } from "../plugin";
import {
  createRenderExecution,
  withRenderExecutionContext,
  type RenderExecution,
} from "../render-execution";
import {
  fontAssetEntityId,
  type DeckIntegrationContext,
  type FontAssetRegistration,
} from "../integration-context";
import {
  attachArtifactWriteToken,
  claimIncrementalArtifactRenderSlot,
} from "../incremental-artifact-session";
import { type AssetEntityId, type GraphNodeId, type SemanticAuthorGraph } from "../graph";
import { resultOk, stageSummary } from "./index";
import type {
  InspectionDetailLevel,
  ProjectOptions,
  ProjectionFormat,
  StageArtifactStatus,
} from "./public";
import {
  PipelineArtifactCollection,
  assetSourceCacheKey,
  type AssetArtifact,
  type DefinedProjectionArtifact,
  type PptxProjectionArtifact,
} from "./artifacts";
import type { DefinedGraphInput, DefinedProjectionInput } from "./artifact-input";
import type { MediaSourceOrigin } from "../media-source-origin";
import { compileSource } from "../compile-runner";
import {
  definedProjectionFormatDiagnostics,
  selectProjectOutputTarget,
  selectRenderOutputTarget,
  writerAdapterFormatDiagnostics,
} from "../output-target/policy";
import type { InternalProjectResult } from "./results";
import type { PresentStageArtifactStatus, RenderResult } from "./results-public";
import { isPptxPackageModel, isPptxSlidePart } from "../projection/pptx/model";
import { isPdfPageModel, type PdfPageModel } from "../projection/pdf/model";
import { projectionShapeDiagnostics } from "../projection/pptx/artifact";
import { withPackagePartFingerprints } from "../projection/pptx/fingerprint";
import type {
  PptxPackageModel,
  PptxPackageModelCandidate,
  PptxPackagePart,
  PptxPackagePartCandidate,
  PptxSlidePart,
} from "../projection/pptx/model";
import {
  projectGraphToDocumentModel,
  projectionDiagnosticsForGraph,
  projectionDiagnosticsForModel,
  summarizeProjectedDocumentModel,
  validateProjectedDocumentModel,
  type ProjectedDocumentModel,
} from "../projection/registry";
import {
  incrementalProjectionReusePlan,
  slideProjectionFingerprintSnapshots,
} from "../projection/pptx/reuse";
import type { SlideTemplateSet } from "../templates";
import { pdfImageAssetLoadRequirements } from "../writers/pdf";
import { pptxMediaAssetLoadRequirements } from "../writers/pptx";

export { compileSource } from "../compile-runner";
export type { CompileResult, ProjectResult, RenderResult } from "./results-public";

type PptxPackagePartModel = PptxPackageModel["parts"][number];
type DefinedPptxPackageModelArtifact = PptxProjectionArtifact<PptxPackageModel>;

function isDefinedPptxPackageModelArtifact(
  artifact: DefinedProjectionInput | undefined,
): artifact is DefinedPptxPackageModelArtifact {
  return (
    artifact !== undefined && isPptxPackageModel(artifact.projection as PptxPackageModelCandidate)
  );
}

function definedDocumentModel(value: unknown): ProjectedDocumentModel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isPptxPackageModel(value as PptxPackageModelCandidate)) {
    return value as PptxPackageModel;
  }

  return isPdfPageModel(value) ? value : undefined;
}

function definedProjectionShapeDiagnostics(value: unknown): Diagnostics {
  if (isPdfPageModel(value)) {
    return emptyDiagnostics();
  }

  if (isRecord(value)) {
    return projectionShapeDiagnostics(value as PptxPackageModelCandidate);
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_DEFINE_PROJECTION_SHAPE",
      title: "defined projection shape is invalid",
      message: "defineProjection() requires a projected document model object.",
      labels: [
        {
          path: "projection",
          message: value === null ? "received null" : `received ${typeof value}`,
          severity: "primary",
        },
      ],
    }),
  ]);
}

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  const items: Diagnostics["items"][number][] = [];
  const keysFromPreviousStages = new Set<string>();
  diagnostics.forEach((stageDiagnostics) => {
    const currentStageKeys = new Set<string>();
    stageDiagnostics.items.forEach((item) => {
      const key = JSON.stringify([
        item.severity,
        item.code,
        item.title,
        item.message,
        item.labels.map((label) => [
          label.path,
          label.message,
          label.severity,
          label.sourceSpan?.file,
          label.sourceSpan?.line,
          label.sourceSpan?.column,
        ]),
        item.notes,
        item.help,
      ]);
      if (!keysFromPreviousStages.has(key)) {
        items.push(item);
      }
      currentStageKeys.add(key);
    });
    currentStageKeys.forEach((key) => keysFromPreviousStages.add(key));
  });
  return createDiagnostics(items);
}

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

function directPluginsForSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(source: CompositionSource<TSourceContext, TTemplates>) {
  return source[COMPOSITION_SOURCE]().plugins;
}

function graphForCurrentComposition<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  graph: DefinedGraphInput | undefined,
  currentRevision = compositionRevisionForSource(source),
): DefinedGraphInput | undefined {
  return graph?.compositionRevision === currentRevision ? graph : undefined;
}

function materializeAssetMap(
  artifacts: PipelineArtifactCollection,
  assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>,
): void {
  assetsById.forEach((asset) => artifacts.materializeAsset(asset));
}

function normalizePptxPackageProjection(projection: PptxPackageModel): PptxPackageModel {
  const parts = withPackagePartFingerprints(projection.parts);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const slides = projection.slides
    .map((slide): PptxPackagePart | undefined => partsById.get(slide.id))
    .filter((part): part is PptxSlidePart => part !== undefined && isPptxSlidePart(part));

  return {
    ...projection,
    parts,
    slides,
  };
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
  readonly diagnostics?: Diagnostics;
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

async function resolveFontAssetRegistration(input: {
  readonly registration: FontAssetRegistration;
  readonly loaders?: readonly AssetLoader[];
  readonly artifacts?: PipelineArtifactCollection;
  readonly origin?: MediaSourceOrigin;
}): Promise<{
  readonly registration: FontAssetRegistration;
  readonly artifact: AssetArtifact;
  readonly diagnostics: Diagnostics;
}> {
  const source = input.registration.source;
  const assetEntityId = fontAssetEntityId(input.registration);
  const loaders = assetLoadersWithIdentities(input.loaders);
  let cached = input.artifacts?.assetsById.get(assetEntityId);
  const cachedMatchesSource =
    cached !== undefined &&
    assetSourceCacheKey(
      cached.source,
      cached.resolverIdentity,
      cached.origin,
      cached.sourceField,
    ) === assetSourceCacheKey(source, cached.resolverIdentity, input.origin, "font");
  if (!cachedMatchesSource) {
    cached = undefined;
  }
  if (!cached) {
    for (const { resolverIdentity } of loaders) {
      cached = input.artifacts?.assetsBySourceCacheKey.get(
        assetSourceCacheKey(source, resolverIdentity, input.origin, "font"),
      );
      if (cached?.load) {
        break;
      }
    }
  }
  cached ??= input.artifacts?.assetsBySourceCacheKey.get(
    assetSourceCacheKey(source, BUILTIN_ASSET_RESOLVER_IDENTITY, input.origin, "font"),
  );

  if (cached?.load) {
    const artifact = {
      ...cached,
      assetEntityId,
      source,
      sourceField: "font" as const,
      ...(input.origin ? { origin: input.origin } : {}),
    } satisfies AssetArtifact;
    input.artifacts?.materializeAsset(artifact);
    return {
      registration: fontRegistrationWithLoad(input.registration, cached.load),
      artifact,
      diagnostics: artifact.diagnostics,
    };
  }

  let probe = cached?.probe;
  let load = cached?.load;
  let resolverIdentity = cached?.resolverIdentity ?? BUILTIN_ASSET_RESOLVER_IDENTITY;
  let diagnostics = cached?.diagnostics ?? emptyDiagnostics();
  let resolutionStopped = false;
  const scopedProbeLoader = cached?.resolverIdentity
    ? assetLoaderForIdentity(loaders, cached.resolverIdentity)
    : undefined;
  const probeLoaders = cached?.resolverIdentity
    ? scopedProbeLoader
      ? [scopedProbeLoader]
      : []
    : loaders;

  if (!probe) {
    for (const { loader, resolverIdentity: loaderResolverIdentity } of probeLoaders) {
      const outcome = await assetLoaderBoundaryOutcome({
        invoke: () =>
          loader.probe?.({
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
            sourceField: "font",
            ...(input.origin ? { origin: input.origin } : {}),
          }),
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_OUTCOME_INVALID",
        title: "asset probe outcome is invalid",
        failureCode: "E_PROJECT_ASSET_PROBE_FAILED",
        failureTitle: "asset probe failed",
        phase: "probe",
        source,
        resolverIdentity: loaderResolverIdentity,
        assetEntityId,
      });
      if (outcome.kind === "failed") {
        diagnostics = combineDiagnostics(diagnostics, outcome.diagnostics);
        resolverIdentity = loaderResolverIdentity;
        resolutionStopped = true;
        break;
      }
      if (outcome.kind === "resolved") {
        const normalized = normalizedAssetProbeResult({
          result: outcome.value,
          source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId,
        });
        if (!normalized.ok) {
          diagnostics = combineDiagnostics(diagnostics, normalized.diagnostics);
          continue;
        }
        probe = normalized.result;
        resolverIdentity = loaderResolverIdentity;
        diagnostics = combineDiagnostics(diagnostics, outcome.diagnostics);
        break;
      }
    }
  }

  if (!probe && !resolutionStopped) {
    const builtInResult = await assetDependencyBoundaryValue({
      invoke: () => probeBuiltInAssetSource(source),
      stage: "project",
      code: "E_PROJECT_ASSET_PROBE_FAILED",
      title: "asset probe failed",
      phase: "probe",
      source,
      resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
      assetEntityId,
    });
    if (builtInResult.ok) {
      const builtIn = builtInResult.value;
      if (builtIn) {
        probe = builtIn.probe;
        load = builtIn.load;
        resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
        diagnostics = combineDiagnostics(diagnostics, builtIn.diagnostics ?? emptyDiagnostics());
        resolutionStopped = builtIn.diagnostics?.hasErrors ?? false;
      }
    } else {
      diagnostics = combineDiagnostics(diagnostics, builtInResult.diagnostics);
    }
  }

  const resolvedLoader =
    resolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY
      ? undefined
      : assetLoaderForIdentity(loaders, resolverIdentity);
  const loadLoaders = resolvedLoader ? [resolvedLoader] : loaders;

  for (const { loader, resolverIdentity: loaderResolverIdentity } of loadLoaders) {
    if (load || resolutionStopped) {
      break;
    }
    const outcome = await assetLoaderBoundaryOutcome({
      invoke: () =>
        loader.load?.({
          source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId,
          sourceField: "font",
          ...(input.origin ? { origin: input.origin } : {}),
        }),
      stage: "project",
      code: "E_PROJECT_ASSET_LOAD_OUTCOME_INVALID",
      title: "asset load outcome is invalid",
      failureCode: "E_PROJECT_ASSET_LOAD_FAILED",
      failureTitle: "asset load failed",
      phase: "load",
      source,
      resolverIdentity: loaderResolverIdentity,
      assetEntityId,
    });
    if (outcome.kind === "failed") {
      diagnostics = outcome.diagnostics;
      resolverIdentity = loaderResolverIdentity;
      resolutionStopped = true;
      break;
    }
    if (outcome.kind === "resolved") {
      const normalized = normalizedAssetLoadResult({
        result: outcome.value,
        source,
        resolverIdentity: loaderResolverIdentity,
        stage: "project",
        assetEntityId,
      });
      if (!normalized.ok) {
        diagnostics = combineDiagnostics(diagnostics, normalized.diagnostics);
        continue;
      }

      load = normalized.result;
      resolverIdentity = loaderResolverIdentity;
      diagnostics = combineDiagnostics(diagnostics, outcome.diagnostics);
      break;
    }
  }

  if (!load && !resolutionStopped && resolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY) {
    const builtInResult = await assetDependencyBoundaryValue({
      invoke: () => loadBuiltInAssetSource(source),
      stage: "project",
      code: "E_PROJECT_ASSET_LOAD_FAILED",
      title: "asset load failed",
      phase: "load",
      source,
      resolverIdentity,
      assetEntityId,
    });
    if (builtInResult.ok) {
      load = builtInResult.value;
    } else {
      diagnostics = combineDiagnostics(diagnostics, builtInResult.diagnostics);
    }
  }

  if (!load && !diagnostics.hasErrors && source.kind === "path") {
    diagnostics = combineDiagnostics(
      diagnostics,
      missingAssetContextDiagnostics({ source, sourceField: "font", assetEntityId }),
    );
  }

  const artifact = {
    assetEntityId,
    source,
    sourceField: "font" as const,
    resolverIdentity,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(probe ? { probe } : {}),
    ...(load ? { load } : {}),
    diagnostics,
  } satisfies AssetArtifact;
  input.artifacts?.materializeAsset(artifact);

  return {
    registration: load ? fontRegistrationWithLoad(input.registration, load) : input.registration,
    artifact,
    diagnostics,
  };
}

function fontRegistrationWithLoad(
  registration: FontAssetRegistration,
  load: AssetLoadResult,
): FontAssetRegistration {
  return {
    ...registration,
    source: {
      kind: "bytes",
      bytes: load.bytes,
      ...(load.mediaType ? { mediaType: load.mediaType } : {}),
      ...(load.extension ? { extension: load.extension } : {}),
    },
  };
}

async function resolveIntegrationFontAssets(input: {
  readonly integrationContext?: DeckIntegrationContext;
  readonly loaders?: readonly AssetLoader[];
  readonly artifacts?: PipelineArtifactCollection;
  readonly origin?: MediaSourceOrigin;
}): Promise<{
  readonly integrationContext?: DeckIntegrationContext;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly diagnostics: Diagnostics;
}> {
  const fontAssets = input.integrationContext?.fontAssets;
  if (!input.integrationContext || !fontAssets || fontAssets.length === 0) {
    return {
      integrationContext: input.integrationContext,
      assetsById: new Map(),
      diagnostics: emptyDiagnostics(),
    };
  }

  const resolved: Awaited<ReturnType<typeof resolveFontAssetRegistration>>[] = [];
  for (const registration of fontAssets) {
    resolved.push(
      await resolveFontAssetRegistration({
        registration,
        loaders: input.loaders,
        artifacts: input.artifacts,
        ...(input.origin ? { origin: input.origin } : {}),
      }),
    );
  }
  const nextFontAssets = resolved.map((entry) => entry.registration);
  const assetsById = new Map(
    resolved.map((entry) => [entry.artifact.assetEntityId, entry.artifact]),
  );
  const diagnostics = combineDiagnostics(...resolved.map((entry) => entry.diagnostics));
  const changed = nextFontAssets.some((registration, index) => registration !== fontAssets[index]);

  return {
    integrationContext: changed
      ? {
          ...input.integrationContext,
          fontAssets: nextFontAssets,
        }
      : input.integrationContext,
    assetsById,
    diagnostics,
  };
}

async function resolveAssetArtifacts(input: {
  graph: SemanticAuthorGraph;
  loaders?: readonly AssetLoader[];
  artifacts?: PipelineArtifactCollection;
  mediaSourceOrigin?: MediaSourceOrigin;
}): Promise<{
  diagnostics: Diagnostics;
  assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
}> {
  const diagnostics: Diagnostics[] = [];
  const assetsById = new Map<AssetEntityId, AssetArtifact>();

  for (const [assetEntityId, asset] of input.graph.assets) {
    const source = assetSourceFromEntity(asset);
    const assetOrigin = asset.origin ?? input.mediaSourceOrigin;
    const loaders = assetLoadersWithIdentities(input.loaders);
    let probe: AssetProbeResult | undefined;
    let load: AssetLoadResult | undefined;
    let resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
    let assetDiagnostics = emptyDiagnostics();
    let resolutionStopped = false;
    let cached = input.artifacts?.assetsById.get(assetEntityId);

    if (!cached) {
      for (const { resolverIdentity } of loaders) {
        cached = input.artifacts?.assetsBySourceCacheKey.get(
          assetSourceCacheKey(source, resolverIdentity, assetOrigin, asset.sourceField),
        );
        if (cached?.probe) {
          break;
        }
      }
    }

    if (!cached) {
      cached = input.artifacts?.assetsBySourceCacheKey.get(
        assetSourceCacheKey(
          source,
          BUILTIN_ASSET_RESOLVER_IDENTITY,
          assetOrigin,
          asset.sourceField,
        ),
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
      const outcome = await assetLoaderBoundaryOutcome({
        invoke: () =>
          loader.probe?.({
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
            sourceField: asset.sourceField,
            ...(assetOrigin ? { origin: assetOrigin } : {}),
          }),
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_OUTCOME_INVALID",
        title: "asset probe outcome is invalid",
        failureCode: "E_PROJECT_ASSET_PROBE_FAILED",
        failureTitle: "asset probe failed",
        phase: "probe",
        source,
        resolverIdentity: loaderResolverIdentity,
        assetEntityId,
      });
      if (outcome.kind === "failed") {
        assetDiagnostics = outcome.diagnostics;
        resolverIdentity = loaderResolverIdentity;
        resolutionStopped = true;
        break;
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
    }

    if (!probe && !resolutionStopped) {
      const builtInResult = await assetDependencyBoundaryValue({
        invoke: () => probeBuiltInAssetSource(source),
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_FAILED",
        title: "asset probe failed",
        phase: "probe",
        source,
        resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
        assetEntityId,
      });
      if (builtInResult.ok) {
        const builtInProbe = builtInResult.value;
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
            if (builtInProbe.diagnostics) {
              assetDiagnostics = builtInProbe.diagnostics;
              resolutionStopped = builtInProbe.diagnostics.hasErrors;
            }
          } else {
            diagnostics.push(normalized.diagnostics);
          }
        }
      } else {
        diagnostics.push(builtInResult.diagnostics);
      }
      resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
    }

    if (!probe && !resolutionStopped && source.kind === "path") {
      assetDiagnostics = missingAssetContextDiagnostics({
        source,
        sourceField: asset.sourceField,
        assetEntityId,
      });
      resolutionStopped = true;
    }

    const missingRequiredFields = missingRequiredAssetProbeFields({
      probe,
      assetKind: asset.kind,
    });
    if (!resolutionStopped && missingRequiredFields.length > 0) {
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
      ...(assetOrigin ? { origin: assetOrigin } : {}),
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
  mediaSourceOrigin?: MediaSourceOrigin;
  projection: ProjectedDocumentModel;
}): Promise<Diagnostics> {
  if (!input.artifacts) {
    return emptyDiagnostics();
  }

  const diagnostics: Diagnostics[] = [];
  const mediaPayloads =
    input.projection.format === "pptx"
      ? pptxMediaAssetLoadRequirements({
          projection: input.projection,
          assetsById: input.artifacts.assetsById,
          buildArtifactsByPartId: input.artifacts.pptxBuildArtifactsByPartId,
        })
      : pdfImageAssetLoadRequirements({
          projection: input.projection,
          assetsById: input.artifacts.assetsById,
        });

  mediaLoop: for (const media of mediaPayloads) {
    const current = input.artifacts.assetsById.get(media.assetEntityId);
    const mediaOrigin = current?.origin ?? input.mediaSourceOrigin;
    const loaders = assetLoadersWithIdentities(input.loaders);
    const currentMatchesSource =
      current !== undefined &&
      assetSourceCacheKey(
        current.source,
        current.resolverIdentity,
        current.origin,
        current.sourceField,
      ) ===
        assetSourceCacheKey(
          media.source,
          current.resolverIdentity,
          current.origin,
          media.sourceField,
        );

    if (currentMatchesSource && current.load) {
      continue;
    }

    const currentResolverIdentity = currentMatchesSource ? current.resolverIdentity : undefined;
    const cached = input.artifacts.assetsBySourceCacheKey.get(
      assetSourceCacheKey(media.source, currentResolverIdentity, mediaOrigin, media.sourceField),
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
    let resolutionStopped = false;
    const scopedLoader = currentResolverIdentity
      ? assetLoaderForIdentity(loaders, currentResolverIdentity)
      : undefined;
    const scopedLoaders = currentResolverIdentity ? (scopedLoader ? [scopedLoader] : []) : loaders;

    for (const { loader, resolverIdentity: loaderResolverIdentity } of scopedLoaders) {
      const loaderCached = input.artifacts.assetsBySourceCacheKey.get(
        assetSourceCacheKey(media.source, loaderResolverIdentity, mediaOrigin, media.sourceField),
      );
      if (loaderCached?.load) {
        input.artifacts.materializeAsset({
          ...loaderCached,
          assetEntityId: media.assetEntityId,
        });
        diagnostics.push(loaderCached.diagnostics);
        continue mediaLoop;
      }

      const outcome = await assetLoaderBoundaryOutcome({
        invoke: () =>
          loader.load?.({
            source: media.source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId: media.assetEntityId,
            sourceField: media.sourceField,
            ...(mediaOrigin ? { origin: mediaOrigin } : {}),
          }),
        stage: "render",
        code: "E_RENDER_ASSET_LOAD_OUTCOME_INVALID",
        title: "asset load outcome is invalid",
        failureCode: "E_RENDER_ASSET_LOAD_FAILED",
        failureTitle: "asset load failed",
        phase: "load",
        source: media.source,
        resolverIdentity: loaderResolverIdentity,
        assetEntityId: media.assetEntityId,
        packagePartPath: media.packagePartPath,
      });
      if (outcome.kind === "failed") {
        assetDiagnostics = outcome.diagnostics;
        resolverIdentity = loaderResolverIdentity;
        resolutionStopped = true;
        break;
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
    }

    if (
      !load &&
      !resolutionStopped &&
      (!currentResolverIdentity || currentResolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY)
    ) {
      const builtInResult = await assetDependencyBoundaryValue({
        invoke: () => loadBuiltInAssetSource(media.source),
        stage: "render",
        code: "E_RENDER_ASSET_LOAD_FAILED",
        title: "asset load failed",
        phase: "load",
        source: media.source,
        resolverIdentity,
        assetEntityId: media.assetEntityId,
        packagePartPath: media.packagePartPath,
      });
      if (builtInResult.ok) {
        const builtInLoad = builtInResult.value;
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
      } else {
        diagnostics.push(builtInResult.diagnostics);
      }
    }

    if (!load && resolutionStopped) {
      diagnostics.push(assetDiagnostics);
      input.artifacts.materializeAsset({
        assetEntityId: media.assetEntityId,
        source: currentMatchesSource ? current.source : media.source,
        sourceField: media.sourceField,
        resolverIdentity,
        ...(currentMatchesSource && current.origin ? { origin: current.origin } : {}),
        ...(currentMatchesSource && current.probe ? { probe: current.probe } : {}),
        diagnostics: assetDiagnostics,
      });
      continue;
    }

    if (!load) {
      diagnostics.push(
        assetDiagnostic({
          stage: "render",
          code: "E_RENDER_ASSET_LOAD_FAILED",
          title: "asset load failed",
          phase: "load",
          source: media.source,
          resolverIdentity,
          assetEntityId: media.assetEntityId,
          packagePartPath: media.packagePartPath,
          message: "No asset loader returned bytes for this media source.",
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
      ...(currentMatchesSource && current.origin ? { origin: current.origin } : {}),
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectionInputFormatMatches(
  input: DefinedProjectionInput | undefined,
  format: ProjectionFormat,
): boolean {
  const projection = input?.projection;
  return isRecord(projection) && projection.format === format;
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

async function renderAdapterAtIntegrationBoundary(input: {
  readonly adapter: WriterAdapter;
  readonly projection: ProjectedDocumentModel;
  readonly context: ReturnType<typeof createWriterRenderContext>;
}): Promise<
  | { readonly ok: true; readonly result: WriterAdapterResult }
  | { readonly ok: false; readonly diagnostics: Diagnostics }
> {
  try {
    return {
      ok: true,
      result: await input.adapter.render(input.projection, input.context),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: diagnosticFromError({
        stage: "render",
        code: "E_RENDER_FAILED",
        title: "render failed",
        error,
      }),
    };
  }
}

function projectionWithReusablePackageParts(input: {
  projection: PptxPackageModel;
  previous?: DefinedProjectionArtifact;
  graph?: SemanticAuthorGraph;
  reusableSlideNodeIds?: ReadonlySet<GraphNodeId>;
}): PptxPackageModel {
  if (!isDefinedPptxPackageModelArtifact(input.previous) || !input.graph) {
    return input.projection;
  }
  const previousArtifact = input.previous;

  const reusableSlideUnits = reusableSlideUnitIndex({
    graph: input.graph,
    previous: previousArtifact,
    projection: input.projection,
    reusableSlideNodeIds: input.reusableSlideNodeIds,
  });
  let reused = false;
  const parts = input.projection.parts.map((part): PptxPackagePartModel => {
    const previous = previousArtifact.partsById.get(part.id);
    if (
      isIncrementalReusableSlideUnitPart(part, reusableSlideUnits) &&
      previous &&
      isIncrementalReusableSlideUnitPart(previous, reusableSlideUnits) &&
      previous.fingerprint &&
      previous.fingerprint === part.fingerprint
    ) {
      reused = true;
      return previous;
    }

    return part;
  });

  if (!reused) {
    return input.projection;
  }

  return {
    ...input.projection,
    parts,
    slides: parts.filter(isPptxSlidePart),
  };
}

type ReusableSlideUnitIndex = {
  readonly slidePartIds: ReadonlySet<string>;
  readonly slideNodeIds: ReadonlySet<GraphNodeId>;
  readonly slideNodeIdByGraphNodeId: ReadonlyMap<GraphNodeId, GraphNodeId>;
};

function reusableSlideUnitIndex(input: {
  graph: SemanticAuthorGraph;
  previous: DefinedProjectionArtifact;
  projection: PptxPackageModel;
  reusableSlideNodeIds?: ReadonlySet<GraphNodeId>;
}): ReusableSlideUnitIndex {
  const slidePartIds = new Set<string>();
  const slideNodeIds = new Set<GraphNodeId>();
  const reusableSlideNodeIds = input.reusableSlideNodeIds;
  if (!reusableSlideNodeIds) {
    return {
      slidePartIds,
      slideNodeIds,
      slideNodeIdByGraphNodeId: slideNodeIdByGraphNodeId(input.graph),
    };
  }

  input.projection.slides.forEach((slide) => {
    const slideNodeId = slide.origin?.graphNodeIds?.find(
      (id) => input.graph.nodes.get(id)?.kind === "slide",
    );
    if (!slideNodeId) {
      return;
    }
    if (!reusableSlideNodeIds.has(slideNodeId)) {
      return;
    }

    slidePartIds.add(slide.id);
    slideNodeIds.add(slideNodeId);
  });

  return {
    slidePartIds,
    slideNodeIds,
    slideNodeIdByGraphNodeId: slideNodeIdByGraphNodeId(input.graph),
  };
}

function slideNodeIdByGraphNodeId(
  graph: SemanticAuthorGraph,
): ReadonlyMap<GraphNodeId, GraphNodeId> {
  const index = new Map<GraphNodeId, GraphNodeId>();
  const document = graph.nodes.get(graph.documentId);
  if (document?.kind !== "document") {
    return index;
  }

  const visit = (nodeId: GraphNodeId, slideNodeId: GraphNodeId): void => {
    index.set(nodeId, slideNodeId);
    const node = graph.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const children =
      "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];
    children.forEach((childId) => visit(childId, slideNodeId));
  };

  document.children.forEach((slideNodeId) => {
    const slide = graph.nodes.get(slideNodeId);
    if (slide?.kind === "slide") {
      visit(slideNodeId, slideNodeId);
    }
  });

  return index;
}

function graphNodeIdsBelongToReusableSlideUnit(
  graphNodeIds: readonly GraphNodeId[] | undefined,
  reusableSlideUnits: ReusableSlideUnitIndex,
): boolean {
  if (!graphNodeIds || graphNodeIds.length === 0) {
    return false;
  }

  let ownerSlideNodeId: GraphNodeId | undefined;
  for (const graphNodeId of graphNodeIds) {
    const slideNodeId = reusableSlideUnits.slideNodeIdByGraphNodeId.get(graphNodeId);
    if (!slideNodeId || !reusableSlideUnits.slideNodeIds.has(slideNodeId)) {
      return false;
    }
    if (ownerSlideNodeId && ownerSlideNodeId !== slideNodeId) {
      return false;
    }
    ownerSlideNodeId = slideNodeId;
  }

  return ownerSlideNodeId !== undefined;
}

function isIncrementalReusableSlideUnitPart(
  part: PptxPackagePartCandidate,
  reusableSlideUnits: ReusableSlideUnitIndex,
): boolean {
  if (isPptxSlidePart(part)) {
    return reusableSlideUnits.slidePartIds.has(part.id);
  }

  if (part.category !== "authored-content") {
    return false;
  }

  return part.kind === "media" ||
    (part.kind === "relationships" && part.path.startsWith("ppt/slides/_rels/"))
    ? graphNodeIdsBelongToReusableSlideUnit(part.origin?.graphNodeIds, reusableSlideUnits)
    : false;
}

export function createPipelineArtifacts(): PipelineArtifactCollection {
  return new PipelineArtifactCollection();
}

type ProjectSourceRunnerInput<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
> = {
  source: CompositionSource<TSourceContext, TTemplates>;
  options: DeckOptions;
  projectOptions?: ProjectOptions;
  projectionFormat?: ProjectionFormat;
  definedGraph?: DefinedGraphInput;
  definedProjection?: DefinedProjectionInput;
  artifacts?: PipelineArtifactCollection;
  assetLoaders?: readonly AssetLoader[];
  mediaSourceOrigin?: MediaSourceOrigin;
  execution?: RenderExecution;
  retainSlideProjectionFingerprints?: boolean;
};

export function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  input: ProjectSourceRunnerInput<TSourceContext, TTemplates> & { projectionFormat: "pdf" },
): Promise<InternalProjectResult<PdfPageModel>>;
export function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  input: ProjectSourceRunnerInput<TSourceContext, TTemplates> & {
    projectOptions: ProjectOptions & { readonly format: "pdf" };
  },
): Promise<InternalProjectResult<PdfPageModel>>;
export function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(input: ProjectSourceRunnerInput<TSourceContext, TTemplates>): Promise<InternalProjectResult>;
export async function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  input: ProjectSourceRunnerInput<TSourceContext, TTemplates>,
): Promise<InternalProjectResult<ProjectedDocumentModel>> {
  const artifacts = input.artifacts ?? new PipelineArtifactCollection();
  const outputTarget = selectProjectOutputTarget({
    options: input.options,
    projectOptions: input.projectOptions,
    projectionFormat: input.projectionFormat,
  });
  const projectionFormat = outputTarget.projectionFormat;
  const implicitFormatDiagnostics = outputTarget.diagnostics;
  const optionsDiagnostics = validateDeckOptions(input.options);
  const executionDiagnostics = createDiagnostics(input.execution?.diagnostics);

  if (optionsDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, optionsDiagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  if (executionDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, executionDiagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  if (implicitFormatDiagnostics.hasErrors) {
    return {
      ok: false,
      diagnostics: implicitFormatDiagnostics,
      stages: {
        compile: stageSummary("compile", implicitFormatDiagnostics, "missing"),
        project: stageSummary("project", implicitFormatDiagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  if (input.definedProjection) {
    const definedProjectionInput = input.definedProjection.projection;
    const definedProjection = definedDocumentModel(definedProjectionInput);
    const definedShapeDiagnostics =
      input.definedProjection.diagnostics.items.length > 0
        ? input.definedProjection.diagnostics
        : definedProjectionShapeDiagnostics(definedProjectionInput);
    const definedFormatDiagnostics = definedProjection
      ? definedProjectionFormatDiagnostics({
          projection: definedProjection,
          format: projectionFormat,
        })
      : emptyDiagnostics();
    const diagnostics = combineDiagnostics(
      implicitFormatDiagnostics,
      definedShapeDiagnostics,
      definedFormatDiagnostics,
      definedProjection
        ? projectionDiagnosticsForModel({
            projection: definedProjection,
            includeAllUnsupportedSemantics: true,
          })
        : emptyDiagnostics(),
      definedProjection ? validateProjectedDocumentModel(definedProjection) : emptyDiagnostics(),
    );
    if (!definedProjection || definedFormatDiagnostics.hasErrors) {
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
    : compileSource(
        input.source,
        artifacts,
        input.execution?.plugins,
        input.execution?.authoringRuntimeObservers,
      );

  if (
    compileResult.diagnostics.hasErrors ||
    !compileResult.graph ||
    !compileResult.resolvedStyles
  ) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, compileResult.diagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  {
    const execution =
      input.execution ??
      createRenderExecution({
        plugins: directPluginsForSource(input.source),
        assetLoaders: input.assetLoaders,
        mediaSourceOrigin: input.mediaSourceOrigin,
      });
    const beforeAsset = applyPluginHooks(execution.plugins, "beforeAsset", {
      stage: "asset" as const,
      phase: "before" as const,
      operation: "probe" as const,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      assetLoaders: execution.assetLoaders,
      mediaSourceOrigin: execution.mediaSourceOrigin,
      ...(execution.integrationContext ? { integrationContext: execution.integrationContext } : {}),
    });
    const beforeAssetDiagnostics = createDiagnostics(beforeAsset.diagnostics);
    const assetResult = await resolveAssetArtifacts({
      graph: compileResult.graph,
      loaders: beforeAsset.context.assetLoaders,
      artifacts,
      mediaSourceOrigin: beforeAsset.context.mediaSourceOrigin,
    });
    const fontAssetResult = await resolveIntegrationFontAssets({
      integrationContext: beforeAsset.context.integrationContext ?? execution.integrationContext,
      loaders: beforeAsset.context.assetLoaders,
      artifacts,
      ...(beforeAsset.context.mediaSourceOrigin
        ? { origin: beforeAsset.context.mediaSourceOrigin }
        : {}),
    });
    const resolvedAssetsById = new Map([...assetResult.assetsById, ...fontAssetResult.assetsById]);
    const afterAsset = applyPluginHooks(execution.plugins, "afterAsset", {
      stage: "asset" as const,
      phase: "after" as const,
      operation: "probe" as const,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      assetsById: resolvedAssetsById,
      assetLoaders: beforeAsset.context.assetLoaders,
      mediaSourceOrigin: beforeAsset.context.mediaSourceOrigin,
      ...(fontAssetResult.integrationContext
        ? { integrationContext: fontAssetResult.integrationContext }
        : {}),
    });
    const assetsById = afterAsset.context.assetsById;
    if (assetsById !== resolvedAssetsById) {
      materializeAssetMap(artifacts, assetsById);
    }
    const assetDiagnostics = combineDiagnostics(
      beforeAssetDiagnostics,
      assetResult.diagnostics,
      fontAssetResult.diagnostics,
      createDiagnostics(afterAsset.diagnostics),
    );
    const beforeProject = applyPluginHooks(execution.plugins, "beforeProject", {
      stage: "project" as const,
      phase: "before" as const,
      format: projectionFormat,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      assetsById,
    });
    const projectGraph = beforeProject.context.graph;
    const projectResolvedStyles = beforeProject.context.resolvedStyles;
    const projectAssetsById = beforeProject.context.assetsById;
    if (projectAssetsById !== assetsById) {
      materializeAssetMap(artifacts, projectAssetsById);
    }
    const incrementalReuseSnapshot = artifacts.incrementalProjectionReuseSnapshot;
    const projectionReuse =
      projectionFormat === "pptx"
        ? incrementalProjectionReusePlan({
            graph: projectGraph,
            resolvedStyles: projectResolvedStyles,
            options: input.options,
            assets: projectAssetsById,
            previousGraph: incrementalReuseSnapshot?.graph,
            previousProjection: incrementalReuseSnapshot?.projection,
            previousOptions: incrementalReuseSnapshot?.options,
            previousAssets: incrementalReuseSnapshot?.assetsById,
            staleAssetEntityIds: incrementalReuseSnapshot?.staleAssetEntityIds,
          })
        : undefined;
    const beforeProjectDiagnostics = createDiagnostics(beforeProject.diagnostics);
    const projected = projectGraphToDocumentModel({
      format: projectionFormat,
      graph: projectGraph,
      resolvedStyles: projectResolvedStyles,
      options: input.options,
      assets: projectAssetsById,
      integrationContext: afterAsset.context.integrationContext,
    });
    const reusedProjection =
      projected.format === "pptx"
        ? projectionWithReusablePackageParts({
            projection: projected,
            previous: incrementalReuseSnapshot?.projection,
            graph: projectGraph,
            reusableSlideNodeIds: projectionReuse?.slideNodeIds,
          })
        : projected;
    const afterProject = applyPluginHooks(execution.plugins, "afterProject", {
      stage: "project" as const,
      phase: "after" as const,
      format: projectionFormat,
      graph: projectGraph,
      resolvedStyles: projectResolvedStyles,
      assetsById: projectAssetsById,
      projection: reusedProjection,
    });
    const projection =
      afterProject.context.projection === reusedProjection
        ? reusedProjection
        : afterProject.context.projection.format === "pptx"
          ? normalizePptxPackageProjection(afterProject.context.projection)
          : afterProject.context.projection;
    const unsupportedProjectionDiagnostics = projectionDiagnosticsForGraph({
      format: projectionFormat,
      graph: projectGraph,
      resolvedStyles: projectResolvedStyles,
      options: input.options,
    });
    const unsupportedProjectionModelDiagnostics = projectionDiagnosticsForModel({ projection });
    const projectionDiagnostics = validateProjectedDocumentModel(projection);
    const slideProjectionFingerprints =
      projection.format === "pptx"
        ? (projectionReuse?.slideProjectionFingerprints ??
          (input.retainSlideProjectionFingerprints
            ? slideProjectionFingerprintSnapshots({
                graph: projectGraph,
                resolvedStyles: projectResolvedStyles,
                options: input.options,
                assets: projectAssetsById,
              })
            : undefined))
        : undefined;
    const diagnostics = combineDiagnostics(
      implicitFormatDiagnostics,
      compileResult.diagnostics,
      assetDiagnostics,
      beforeProjectDiagnostics,
      unsupportedProjectionDiagnostics,
      unsupportedProjectionModelDiagnostics,
      projectionDiagnostics,
      createDiagnostics(afterProject.diagnostics),
    );
    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(projection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          assetResolutions: summarizeAssetResolutions(projectAssetsById),
          graph: projectGraph,
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
          resolvedStyles: projectResolvedStyles,
        })
      : undefined;
    artifacts.materializeProjection(
      projection,
      diagnostics,
      input.options,
      slideProjectionFingerprints ? { slideProjectionFingerprints } : {},
    );

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          diagnostics,
          projectedArtifactStatus(projection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection,
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
  renderInput?: RenderOptions | WriterAdapter;
  definedGraph?: DefinedGraphInput;
  definedProjection?: DefinedProjectionInput;
  definedProjectionOrigin?: "cache" | "explicit";
  artifacts?: PipelineArtifactCollection;
  assetLoaders?: readonly AssetLoader[];
}): Promise<RenderResult> {
  const incrementalSlot = claimIncrementalArtifactRenderSlot();
  const artifacts =
    incrementalSlot?.artifacts ?? input.artifacts ?? new PipelineArtifactCollection();
  const finishRender = <TResult extends RenderResult>(result: TResult): TResult =>
    attachArtifactWriteToken(result, incrementalSlot?.token);
  const outputTarget = selectRenderOutputTarget({
    options: input.options,
    renderInput: input.renderInput,
  });
  const projectionFormat = outputTarget.projectionFormat;
  const implicitFormatDiagnostics = outputTarget.diagnostics;
  const optionsDiagnostics = validateDeckOptions(input.options);
  if (optionsDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, optionsDiagnostics);
    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: projectionFormat,
    });
  }

  const adapterSelection = selectWriterAdapter({
    renderInput: input.renderInput,
    projectionFormat,
  });

  if (!adapterSelection.ok) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, adapterSelection.diagnostics);
    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "missing"),
        project: stageSummary("project", emptyDiagnostics(), "missing"),
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: adapterSelection.format,
    });
  }

  const adapter = adapterSelection.adapter;
  const renderInputForExecution =
    input.renderInput && typeof input.renderInput === "object" ? input.renderInput : adapter;
  const execution = createRenderExecution({
    plugins: directPluginsForSource(input.source),
    renderInput: incrementalSlot
      ? withRenderExecutionContext(renderInputForExecution, incrementalSlot.renderExecutionContext)
      : renderInputForExecution,
    assetLoaders: input.assetLoaders,
  });
  const executionDiagnostics = createDiagnostics(execution.diagnostics);
  if (executionDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, executionDiagnostics);
    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: adapter.format,
    });
  }
  const sourceInvalidated = execution.sourceInvalidation
    ? artifacts.invalidateForSourceChange(execution.sourceInvalidation)
    : false;
  const currentCompositionRevision = compositionRevisionForSource(input.source);
  const incrementalGraph = graphForCurrentComposition(
    input.source,
    incrementalSlot?.artifacts.graph,
    currentCompositionRevision,
  );
  const inputGraph = graphForCurrentComposition(
    input.source,
    input.definedGraph,
    currentCompositionRevision,
  );
  const explicitDefinedProjection =
    input.definedProjectionOrigin === "cache" ? undefined : input.definedProjection;
  const projectResult = await projectSource({
    source: input.source,
    options: input.options,
    projectionFormat: adapter.projectionFormat,
    definedGraph: sourceInvalidated ? artifacts.graph : (incrementalGraph ?? inputGraph),
    definedProjection:
      explicitDefinedProjection ??
      (sourceInvalidated
        ? projectionInputFormatMatches(artifacts.projection, adapter.projectionFormat)
          ? artifacts.projection
          : undefined
        : incrementalGraph
          ? projectionInputFormatMatches(
              incrementalSlot?.artifacts.projection,
              adapter.projectionFormat,
            )
            ? incrementalSlot?.artifacts.projection
            : undefined
          : undefined),
    artifacts,
    assetLoaders: execution.assetLoaders,
    mediaSourceOrigin: execution.mediaSourceOrigin,
    execution,
    projectOptions: { inspection: "none" },
    retainSlideProjectionFingerprints: incrementalSlot !== undefined,
  });
  const formatDiagnostics = writerAdapterFormatDiagnostics({
    adapter,
    options: input.options,
  });
  const projectDiagnostics = combineDiagnostics(
    projectResult.diagnostics,
    formatDiagnostics,
    implicitFormatDiagnostics,
  );

  if (!projectResult.projection || projectDiagnostics.hasErrors) {
    return finishRender({
      ok: false,
      diagnostics: projectDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", projectDiagnostics, "missing"),
      },
      format: adapter.format,
    });
  }

  const beforeRender = applyPluginHooks(execution.plugins, "beforeRender", {
    stage: "render" as const,
    phase: "before" as const,
    format: adapter.format,
    projection: projectResult.projection,
  });
  const renderProjection = beforeRender.context.projection;
  const beforeRenderDiagnostics = createDiagnostics(beforeRender.diagnostics);
  const preRenderDiagnostics = combineDiagnostics(projectDiagnostics, beforeRenderDiagnostics);
  if (preRenderDiagnostics.hasErrors) {
    return finishRender({
      ok: false,
      diagnostics: preRenderDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", preRenderDiagnostics, "missing"),
      },
      format: adapter.format,
    });
  }

  {
    const graphArtifact = artifacts.graph;
    const beforeAssetLoad =
      graphArtifact && graphArtifact.graph && graphArtifact.resolvedStyles
        ? applyPluginHooks(execution.plugins, "beforeAsset", {
            stage: "asset" as const,
            phase: "before" as const,
            operation: "load" as const,
            graph: graphArtifact.graph,
            resolvedStyles: graphArtifact.resolvedStyles,
            assetLoaders: execution.assetLoaders,
            mediaSourceOrigin: execution.mediaSourceOrigin,
            ...(execution.integrationContext
              ? { integrationContext: execution.integrationContext }
              : {}),
          })
        : undefined;
    const beforeAssetLoadDiagnostics = createDiagnostics(beforeAssetLoad?.diagnostics);
    const loadPreRenderDiagnostics = combineDiagnostics(
      preRenderDiagnostics,
      beforeAssetLoadDiagnostics,
    );
    if (loadPreRenderDiagnostics.hasErrors) {
      return finishRender({
        ok: false,
        diagnostics: loadPreRenderDiagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", loadPreRenderDiagnostics, "missing"),
        },
        format: adapter.format,
      });
    }
    const assetLoadDiagnostics = await loadAssetArtifacts({
      artifacts,
      loaders: beforeAssetLoad?.context.assetLoaders ?? execution.assetLoaders,
      mediaSourceOrigin: beforeAssetLoad?.context.mediaSourceOrigin ?? execution.mediaSourceOrigin,
      projection: renderProjection,
    });
    const afterAssetLoad =
      graphArtifact && graphArtifact.graph && graphArtifact.resolvedStyles
        ? applyPluginHooks(execution.plugins, "afterAsset", {
            stage: "asset" as const,
            phase: "after" as const,
            operation: "load" as const,
            graph: graphArtifact.graph,
            resolvedStyles: graphArtifact.resolvedStyles,
            assetsById: artifacts.assetsById,
            assetLoaders: beforeAssetLoad?.context.assetLoaders ?? execution.assetLoaders,
            mediaSourceOrigin:
              beforeAssetLoad?.context.mediaSourceOrigin ?? execution.mediaSourceOrigin,
            ...(beforeAssetLoad?.context.integrationContext
              ? { integrationContext: beforeAssetLoad.context.integrationContext }
              : execution.integrationContext
                ? { integrationContext: execution.integrationContext }
                : {}),
          })
        : undefined;
    if (afterAssetLoad && afterAssetLoad.context.assetsById !== artifacts.assetsById) {
      materializeAssetMap(artifacts, afterAssetLoad.context.assetsById);
    }
    const assetLoadLifecycleDiagnostics = combineDiagnostics(
      beforeAssetLoadDiagnostics,
      assetLoadDiagnostics,
      createDiagnostics(afterAssetLoad?.diagnostics),
    );
    if (assetLoadLifecycleDiagnostics.hasErrors) {
      const diagnostics = combineDiagnostics(preRenderDiagnostics, assetLoadLifecycleDiagnostics);
      return finishRender({
        ok: false,
        diagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", diagnostics, "missing"),
        },
        format: adapter.format,
      });
    }

    const writerContext = createWriterRenderContext({
      assetsById: artifacts.assetsById,
      pptxBuildArtifactsByPartId: artifacts.pptxBuildArtifactsByPartId,
      onBuildArtifacts: (buildArtifacts) => artifacts.materializePptxBuildArtifacts(buildArtifacts),
    });

    const adapterBoundaryResult = await renderAdapterAtIntegrationBoundary({
      adapter,
      projection: renderProjection,
      context: writerContext,
    });
    if (!adapterBoundaryResult.ok) {
      const diagnostics = combineDiagnostics(
        preRenderDiagnostics,
        adapterBoundaryResult.diagnostics,
      );
      return finishRender({
        ok: false,
        diagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", adapterBoundaryResult.diagnostics, "missing"),
        },
        format: adapter.format,
      });
    }

    const adapterResult = adapterBoundaryResult.result;
    const afterRender = applyPluginHooks(execution.plugins, "afterRender", {
      stage: "render" as const,
      phase: "after" as const,
      format: adapter.format,
      projection: renderProjection,
      ...(adapterResult.artifact ? { artifact: adapterResult.artifact } : {}),
    });
    const afterRenderDiagnostics = createDiagnostics(afterRender.diagnostics);
    const renderDiagnostics = combineDiagnostics(
      preRenderDiagnostics,
      assetLoadLifecycleDiagnostics,
      adapterResult.diagnostics,
      afterRenderDiagnostics,
    );
    const artifact = afterRender.context.artifact;
    if (!artifact) {
      return finishRender({
        ok: resultOk(renderDiagnostics),
        diagnostics: renderDiagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", renderDiagnostics, "missing"),
        },
        format: adapter.format,
      });
    }

    const artifactWasReplaced = artifact !== adapterResult.artifact;
    const summary =
      !artifactWasReplaced && includeInspectionSummary(adapter.options.inspection)
        ? adapterResult.summary
        : undefined;
    const patchPlan =
      !artifactWasReplaced && adapterResult.patchPlan && execution.sourceInvalidation
        ? { ...adapterResult.patchPlan, sourceInvalidation: execution.sourceInvalidation }
        : artifactWasReplaced
          ? undefined
          : adapterResult.patchPlan;

    return finishRender({
      ok: resultOk(renderDiagnostics),
      diagnostics: renderDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary(
          "render",
          renderDiagnostics,
          projectedArtifactStatus(artifact, renderDiagnostics),
        ),
      },
      format: adapter.format,
      artifact,
      ...(patchPlan ? { patchPlan } : {}),
      ...(summary ? { summary } : {}),
    });
  }
}

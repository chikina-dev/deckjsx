import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetResolutionHashSource,
  AssetResolutionProvenanceKind,
  AssetSource,
  AssetSourceField,
} from "./assets";
import { createDiagnostics, diagnostic, type Diagnostics } from "./diagnostics";
import type { AssetEntity, AssetEntityId } from "./graph";
import type { AssetArtifact } from "./asset-artifact";
import type { ProjectInspectionAssetResolutionSummary } from "./projection/pptx/model";
import { BUILTIN_ASSET_RESOLVER_IDENTITY } from "./asset-builtins";

export { BUILTIN_ASSET_RESOLVER_IDENTITY } from "./asset-builtins";

export type AssetLoaderWithIdentity = {
  readonly loader: AssetLoader;
  readonly resolverIdentity: string;
};

export function assetLoadersWithIdentities(
  loaders: readonly AssetLoader[] | undefined,
): readonly AssetLoaderWithIdentity[] {
  return (loaders ?? []).map((loader) => ({
    loader,
    resolverIdentity: loader.resolverIdentity,
  }));
}

export function assetLoaderForIdentity(
  loaders: readonly AssetLoaderWithIdentity[],
  resolverIdentity: string,
): AssetLoaderWithIdentity | undefined {
  return loaders.find((loader) => loader.resolverIdentity === resolverIdentity);
}

export function assetSourceDiagnosticValue(source: AssetSource): string {
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

export function assetDiagnostic(input: {
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
  readonly message: string;
}): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: input.code,
      title: input.title,
      message: input.message,
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

export function assetDiagnosticFromError(
  input: Omit<Parameters<typeof assetDiagnostic>[0], "message"> & {
    readonly error: unknown;
  },
): Diagnostics {
  return assetDiagnostic({
    ...input,
    message: input.error instanceof Error ? input.error.message : String(input.error),
  });
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

export function assetLoaderOutcomeValue<T>(input: {
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

export async function assetLoaderBoundaryOutcome<T>(input: {
  readonly invoke: () => AssetLoaderOutcome<T> | Promise<AssetLoaderOutcome<T>>;
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly failureCode?: string;
  readonly failureTitle?: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
}): Promise<ReturnType<typeof assetLoaderOutcomeValue<T>>> {
  try {
    return assetLoaderOutcomeValue({
      outcome: await input.invoke(),
      stage: input.stage,
      code: input.code,
      title: input.title,
      phase: input.phase,
      source: input.source,
      resolverIdentity: input.resolverIdentity,
      assetEntityId: input.assetEntityId,
      packagePartPath: input.packagePartPath,
    });
  } catch (error) {
    return {
      kind: "failed",
      diagnostics: assetDiagnosticFromError({
        stage: input.stage,
        code: input.failureCode ?? input.code,
        title: input.failureTitle ?? input.title,
        phase: input.phase,
        source: input.source,
        resolverIdentity: input.resolverIdentity,
        assetEntityId: input.assetEntityId,
        packagePartPath: input.packagePartPath,
        error,
      }),
    };
  }
}

export async function assetDependencyBoundaryValue<T>(input: {
  readonly invoke: () => T | Promise<T>;
  readonly stage: "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly assetEntityId?: AssetEntityId;
  readonly packagePartPath?: string;
}): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: Diagnostics }
> {
  try {
    return { ok: true, value: await input.invoke() };
  } catch (error) {
    return {
      ok: false,
      diagnostics: assetDiagnosticFromError({
        stage: input.stage,
        code: input.code,
        title: input.title,
        phase: input.phase,
        source: input.source,
        resolverIdentity: input.resolverIdentity,
        assetEntityId: input.assetEntityId,
        packagePartPath: input.packagePartPath,
        error,
      }),
    };
  }
}

export function missingRequiredAssetProbeDiagnostics(input: {
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

export function missingAssetContextDiagnostics(input: {
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
  readonly assetEntityId: AssetEntityId;
}): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_PROJECT_ASSET_CONTEXT_MISSING",
      title: "asset integration context is missing",
      message: "Project-local asset paths require an Integration Context.",
      labels: [
        {
          path: "asset.probe",
          message: assetSourceDiagnosticValue(input.source),
          severity: "primary",
        },
      ],
      notes: [
        "phase=probe",
        `assetEntityId=${input.assetEntityId}`,
        `sourceKind=${input.source.kind}`,
        `sourceField=${input.sourceField}`,
      ],
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

export function missingRequiredAssetProbeFields(input: {
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

export function normalizedAssetProbeResult(input: {
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

export function normalizedAssetLoadResult(input: {
  readonly result: AssetLoadResult;
  readonly source: AssetSource;
  readonly resolverIdentity: string;
  readonly stage?: "project" | "render";
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
        stage: input.stage ?? "render",
        code:
          input.stage === "project"
            ? "E_PROJECT_ASSET_LOAD_INVALID"
            : "E_RENDER_ASSET_LOAD_INVALID",
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

export function assetSourceFromEntity(asset: AssetEntity): AssetSource {
  switch (asset.source.kind) {
    case "path":
      return { kind: "path", path: asset.source.path };
    case "url":
      return { kind: "url", url: asset.source.url };
    case "data":
      return { kind: "data", data: asset.source.data };
  }
}

export function summarizeAssetResolutions(
  assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>,
): readonly ProjectInspectionAssetResolutionSummary[] {
  return [...assetsById.values()].map((asset): ProjectInspectionAssetResolutionSummary => {
    const provenance = asset.load?.provenance ?? asset.probe?.provenance;
    const resolvedId = provenance?.resolvedId ?? asset.load?.hash ?? asset.probe?.hash;
    const hashSource =
      provenance?.hashSource ?? assetResolutionHashSource(asset.load?.hash ?? asset.probe?.hash);
    const provenanceKind = provenance?.kind ?? inferredAssetResolutionProvenanceKind(asset);

    return {
      assetEntityId: asset.assetEntityId,
      sourceKind: asset.source.kind,
      sourceField: asset.sourceField,
      ...(asset.resolverIdentity ? { resolverIdentity: asset.resolverIdentity } : {}),
      provenanceKind,
      ...(resolvedId ? { resolvedId } : {}),
      ...(asset.origin?.importer ? { importer: asset.origin.importer } : {}),
      ...(asset.origin?.sourceIdentity ? { sourceIdentity: asset.origin.sourceIdentity } : {}),
      ...(hashSource ? { hashSource } : {}),
      diagnosticCodes: asset.diagnostics.items.map((item) => item.code),
    };
  });
}

function assetResolutionHashSource(
  hash: string | undefined,
): AssetResolutionHashSource | undefined {
  return hash ? "loader" : undefined;
}

function inferredAssetResolutionProvenanceKind(
  asset: AssetArtifact,
): AssetResolutionProvenanceKind {
  if (asset.source.kind === "data" || asset.source.kind === "bytes") {
    return "inline";
  }
  if (asset.resolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY && asset.source.kind === "url") {
    return "fetch";
  }
  if (asset.source.kind === "path") {
    return "file";
  }
  return "generatedAsset";
}

import type { AssetLoader, AssetSource } from "./assets";
import type { ComposedAuthorRoot } from "./composition/types";
import type { Diagnostic } from "./diagnostics";
import { clonePluginStageValue } from "./plugin-snapshot";
import type { AssetEntityId, SemanticAuthorGraph } from "./graph";
import type { DeckIntegrationContext } from "./integration-context";
import type { MediaSourceOrigin } from "./media-source-origin";
import type { RenderedArtifact } from "./pipeline/contract";
import {
  isComposedAuthorRootArray,
  isResolvedStyleMap,
  isSemanticAuthorGraph,
} from "./pipeline/artifact-input";
import { isRenderedArtifact } from "./pipeline/results-public";
import type { ProjectionFormat } from "./pipeline/public";
import type { AssetArtifact } from "./pipeline/artifacts";
import { isPdfPageModel } from "./projection/pdf/model";
import type { ProjectedDocumentModel } from "./projection/registry";
import { isPptxPackageModel, type PptxPackageModel } from "./projection/pptx/model";
import type { ResolvedStyleMap } from "./style/resolve";

export type SourceInvalidation = {
  readonly changedSourceIds: readonly string[];
};

export type PluginHookResult<TUpdate extends object = object> =
  | void
  | (Partial<TUpdate> & {
      readonly diagnostics?: readonly Diagnostic[];
    });

export type TreeLifecycleSnapshot = {
  readonly stage: "tree";
  readonly phase: "before" | "after";
  readonly rootCount?: number;
};

export type BeforeTreeLifecycleContext = {
  readonly stage: "tree";
  readonly phase: "before";
};

export type AfterTreeLifecycleContext = {
  readonly stage: "tree";
  readonly phase: "after";
  readonly roots: readonly ComposedAuthorRoot[];
};

export type AfterTreeLifecycleUpdate = {
  readonly roots: readonly ComposedAuthorRoot[];
};

export type GraphLifecycleSnapshot = {
  readonly stage: "graph";
  readonly phase: "before" | "after";
  readonly nodeCount?: number;
  readonly assetCount?: number;
  readonly styleCount?: number;
};

export type BeforeGraphLifecycleContext = {
  readonly stage: "graph";
  readonly phase: "before";
  readonly roots: readonly ComposedAuthorRoot[];
};

export type BeforeGraphLifecycleUpdate = {
  readonly roots: readonly ComposedAuthorRoot[];
};

export type AfterGraphLifecycleContext = {
  readonly stage: "graph";
  readonly phase: "after";
  readonly roots: readonly ComposedAuthorRoot[];
  readonly graph?: SemanticAuthorGraph;
  readonly resolvedStyles?: ResolvedStyleMap;
};

export type AfterGraphLifecycleUpdate = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
};

export type AssetLifecycleSnapshot = {
  readonly stage: "asset";
  readonly phase: "before" | "after";
  readonly assetCount?: number;
};

export type BeforeAssetLifecycleContext = {
  readonly stage: "asset";
  readonly phase: "before";
  readonly operation: "probe" | "load";
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type BeforeAssetLifecycleUpdate = {
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type AfterAssetLifecycleContext = {
  readonly stage: "asset";
  readonly phase: "after";
  readonly operation: "probe" | "load";
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type AfterAssetLifecycleUpdate = {
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type ProjectLifecycleSnapshot = {
  readonly stage: "project";
  readonly phase: "before" | "after";
  readonly format: string;
  readonly partCount?: number;
};

export type BeforeProjectLifecycleContext = {
  readonly stage: "project";
  readonly phase: "before";
  readonly format: string;
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
};

export type BeforeProjectLifecycleUpdate = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
};

export type AfterProjectLifecycleContext = {
  readonly stage: "project";
  readonly phase: "after";
  readonly format: string;
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly projection: ProjectedDocumentModel;
};

export type AfterProjectLifecycleUpdate = {
  readonly projection: ProjectedDocumentModel;
};

export type RenderLifecycleSnapshot = {
  readonly stage: "render";
  readonly phase: "before" | "after";
  readonly format: string;
  readonly artifactByteLength?: number;
};

export type BeforeRenderLifecycleContext = {
  readonly stage: "render";
  readonly phase: "before";
  readonly format: string;
  readonly projection: ProjectedDocumentModel;
};

export type BeforeRenderLifecycleUpdate = {
  readonly projection: ProjectedDocumentModel;
};

export type AfterRenderLifecycleContext = {
  readonly stage: "render";
  readonly phase: "after";
  readonly format: string;
  readonly projection: ProjectedDocumentModel;
  readonly artifact?: RenderedArtifact;
};

export type AfterRenderLifecycleUpdate = {
  readonly artifact?: RenderedArtifact;
};

export type DeckPluginHooks = {
  beforeTree?(context: BeforeTreeLifecycleContext): PluginHookResult;
  afterTree?(context: AfterTreeLifecycleContext): PluginHookResult<AfterTreeLifecycleUpdate>;
  beforeGraph?(context: BeforeGraphLifecycleContext): PluginHookResult<BeforeGraphLifecycleUpdate>;
  afterGraph?(context: AfterGraphLifecycleContext): PluginHookResult<AfterGraphLifecycleUpdate>;
  beforeAsset?(context: BeforeAssetLifecycleContext): PluginHookResult<BeforeAssetLifecycleUpdate>;
  afterAsset?(context: AfterAssetLifecycleContext): PluginHookResult<AfterAssetLifecycleUpdate>;
  beforeProject?(
    context: BeforeProjectLifecycleContext,
  ): PluginHookResult<BeforeProjectLifecycleUpdate>;
  afterProject?(
    context: AfterProjectLifecycleContext,
  ): PluginHookResult<AfterProjectLifecycleUpdate>;
  beforeRender?(
    context: BeforeRenderLifecycleContext,
  ): PluginHookResult<BeforeRenderLifecycleUpdate>;
  afterRender?(context: AfterRenderLifecycleContext): PluginHookResult<AfterRenderLifecycleUpdate>;
};

export type DeckPlugin = {
  readonly kind: "deckjsx.plugin";
  readonly id: string;
  readonly name?: string;
  readonly integration?: DeckIntegrationContext;
  readonly hooks?: DeckPluginHooks;
};

export function isDeckPlugin(value: unknown): value is DeckPlugin {
  return (
    isRecord(value) &&
    value.kind === "deckjsx.plugin" &&
    isNonEmptyString(value.id) &&
    deckPluginValidationMessage(value) === undefined
  );
}

function deckPluginValidationMessage(plugin: unknown): string | undefined {
  if (!isRecord(plugin) || plugin.kind !== "deckjsx.plugin" || !isNonEmptyString(plugin.id)) {
    return 'Deck plugin must be an object with kind "deckjsx.plugin" and a string id.';
  }

  for (const key of Object.keys(plugin)) {
    if (
      key !== "kind" &&
      key !== "id" &&
      key !== "name" &&
      key !== "integration" &&
      key !== "hooks"
    ) {
      return `Deck plugin ${key} is not part of the public authoring API.`;
    }
  }

  if (plugin.name !== undefined && typeof plugin.name !== "string") {
    return "Deck plugin name must be a string when provided.";
  }

  if (plugin.integration !== undefined) {
    const integrationMessage = deckPluginIntegrationValidationMessage(plugin.integration);
    if (integrationMessage) {
      return integrationMessage;
    }
  }

  if (plugin.hooks !== undefined) {
    if (!isRecord(plugin.hooks)) {
      return "Deck plugin hooks must be an object when provided.";
    }

    for (const [hookName, hook] of Object.entries(plugin.hooks)) {
      if (!(hookName in allowedPluginHookUpdateKeys)) {
        return `Deck plugin hooks.${hookName} is not part of the public authoring API.`;
      }
      if (hook !== undefined && typeof hook !== "function") {
        return `Deck plugin hooks.${hookName} must be a function when provided.`;
      }
    }
  }

  return undefined;
}

function deckPluginIntegrationValidationMessage(integration: unknown): string | undefined {
  if (!isRecord(integration)) {
    return "Deck plugin integration must be an object when provided.";
  }

  for (const key of Object.keys(integration)) {
    if (
      key !== "id" &&
      key !== "assetLoaders" &&
      key !== "fontAssets" &&
      key !== "mediaSourceOrigin"
    ) {
      return `Deck plugin integration.${key} is not part of the public authoring API.`;
    }
  }

  if (!isNonEmptyString(integration.id)) {
    return "Deck plugin integration.id must be a non-empty string.";
  }

  if (integration.assetLoaders !== undefined && !isAssetLoaderArray(integration.assetLoaders)) {
    return "Deck plugin integration.assetLoaders must be an array of Asset Loaders.";
  }

  if (
    integration.fontAssets !== undefined &&
    !isFontAssetRegistrationArray(integration.fontAssets)
  ) {
    return "Deck plugin integration.fontAssets must be an array of Font Asset Registrations.";
  }

  if (
    integration.mediaSourceOrigin !== undefined &&
    !isMediaSourceOrigin(integration.mediaSourceOrigin)
  ) {
    return "Deck plugin integration.mediaSourceOrigin must be a Media Source Origin object.";
  }

  return undefined;
}

export function invalidDeckPluginDiagnostic(plugin?: unknown): Diagnostic {
  return {
    severity: "error",
    code: "E_PLUGIN_INVALID",
    title: "deck plugin is not part of the public authoring API",
    message:
      deckPluginValidationMessage(plugin) ??
      'Deck plugin must be an object with kind "deckjsx.plugin" and a string id.',
    labels: [],
  };
}

function invalidDeckPluginListDiagnostic(): Diagnostic {
  return {
    severity: "error",
    code: "E_PLUGIN_INVALID",
    title: "deck plugin is not part of the public authoring API",
    message: "Deck plugins must be an array of Deck Plugins when provided.",
    labels: [],
  };
}

export function validateDeckPlugins(plugins: unknown): readonly Diagnostic[] {
  if (plugins === undefined) {
    return [];
  }

  if (!Array.isArray(plugins)) {
    return [invalidDeckPluginListDiagnostic()];
  }

  return plugins
    .filter((plugin) => !isDeckPlugin(plugin))
    .map((plugin) => invalidDeckPluginDiagnostic(plugin));
}

export function validDeckPlugins(plugins: unknown): readonly DeckPlugin[] {
  return Array.isArray(plugins) ? plugins.filter(isDeckPlugin) : [];
}

export function mergeAssetLoaders(
  ...groups: readonly (readonly AssetLoader[] | undefined)[]
): readonly AssetLoader[] | undefined {
  const loaders = groups.flatMap((group) => group ?? []);
  return loaders.length > 0 ? loaders : undefined;
}

export function applyPluginHooks<TContext extends object>(
  plugins: readonly DeckPlugin[] | undefined,
  hookName: keyof DeckPluginHooks,
  initialContext: TContext,
): { readonly context: TContext; readonly diagnostics: readonly Diagnostic[] } {
  let context = initialContext;
  const diagnostics: Diagnostic[] = [];
  const allowedUpdateKeys: readonly string[] = allowedPluginHookUpdateKeys[hookName];

  for (const plugin of plugins ?? []) {
    const hook = plugin.hooks?.[hookName] as ((value: TContext) => PluginHookResult) | undefined;
    let result: PluginHookResult;
    try {
      result = hook?.(snapshotPluginHookContext(context));
    } catch (error) {
      diagnostics.push(pluginHookFailedDiagnostic({ plugin, hookName, error }));
      continue;
    }
    if (!result) {
      continue;
    }

    if (!isHookResultObject(result)) {
      diagnostics.push(pluginHookInvalidResultDiagnostic({ plugin, hookName }));
      continue;
    }

    if (result.diagnostics !== undefined && !isDiagnosticArray(result.diagnostics)) {
      diagnostics.push(pluginHookInvalidResultDiagnosticsDiagnostic({ plugin, hookName }));
      continue;
    }

    if (result.diagnostics) {
      diagnostics.push(...result.diagnostics);
    }

    const { diagnostics: _diagnostics, ...updates } = result;
    const updateEntries = Object.entries(updates);
    const invalidUpdateKeys = updateEntries
      .map(([key]) => key)
      .filter((key) => !allowedUpdateKeys.includes(key));
    if (invalidUpdateKeys.length > 0) {
      diagnostics.push(pluginHookInvalidUpdateDiagnostic({ plugin, hookName, invalidUpdateKeys }));
    }
    const candidateUpdates = Object.fromEntries(
      updateEntries.filter(([key]) => allowedUpdateKeys.includes(key)),
    );
    const candidateGraph = candidateUpdates.graph;
    const validationContext = {
      ...context,
      ...candidateUpdates,
      ...(candidateGraph !== undefined && !isSemanticAuthorGraph(candidateGraph)
        ? { graph: isRecord(context) ? context.graph : undefined }
        : {}),
    };
    const allowedUpdates = Object.fromEntries(
      updateEntries.filter(([key, value]) => {
        if (!allowedUpdateKeys.includes(key)) {
          return false;
        }
        const validator = pluginHookUpdateValueValidators[hookName]?.[key];
        if (!validator || validator(value, validationContext)) {
          return true;
        }
        diagnostics.push(
          pluginHookInvalidUpdateValueDiagnostic({ plugin, hookName, updateKey: key }),
        );
        return false;
      }),
    );
    if (Object.keys(allowedUpdates).length > 0) {
      context = { ...context, ...allowedUpdates };
    }
  }

  return { context, diagnostics };
}

function snapshotPluginHookContext<TContext extends object>(context: TContext): TContext {
  const snapshot = { ...context } as Record<string, unknown>;
  if (Array.isArray(snapshot.roots)) {
    snapshot.roots = [...snapshot.roots];
  }
  if (isSemanticAuthorGraphValue(snapshot.graph)) {
    snapshot.graph = clonePluginStageValue(snapshot.graph);
  }
  if (snapshot.resolvedStyles instanceof Map) {
    snapshot.resolvedStyles = clonePluginStageValue(snapshot.resolvedStyles);
  }
  if (snapshot.assetsById instanceof Map) {
    snapshot.assetsById = clonePluginStageValue(snapshot.assetsById);
  }
  if (Array.isArray(snapshot.assetLoaders)) {
    snapshot.assetLoaders = [...snapshot.assetLoaders];
  }
  return snapshot as TContext;
}

function isHookResultObject(result: unknown): result is Partial<object> & {
  readonly diagnostics?: unknown;
} {
  return isRecord(result) && !Array.isArray(result);
}

function isDiagnosticArray(value: unknown): value is readonly Diagnostic[] {
  return Array.isArray(value) && value.every(isDiagnosticValue);
}

function isDiagnosticValue(value: unknown): value is Diagnostic {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["severity", "code", "title", "message", "labels", "notes", "help"]) &&
    (value.severity === "error" || value.severity === "warning") &&
    typeof value.code === "string" &&
    typeof value.title === "string" &&
    (value.message === undefined || typeof value.message === "string") &&
    Array.isArray(value.labels) &&
    value.labels.every(isDiagnosticLabelValue) &&
    (value.notes === undefined || isStringArray(value.notes)) &&
    (value.help === undefined || isStringArray(value.help))
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isDiagnosticLabelValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["path", "message", "sourceSpan", "severity"]) &&
    typeof value.path === "string" &&
    typeof value.message === "string" &&
    (value.sourceSpan === undefined || isSourceSpanValue(value.sourceSpan)) &&
    (value.severity === undefined || value.severity === "primary" || value.severity === "secondary")
  );
}

function isSourceSpanValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["file", "line", "column"]) &&
    (value.file === undefined || typeof value.file === "string") &&
    (value.line === undefined || typeof value.line === "number") &&
    (value.column === undefined || typeof value.column === "number")
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const allowedPluginHookUpdateKeys = {
  beforeTree: [],
  afterTree: ["roots"],
  beforeGraph: ["roots"],
  afterGraph: ["graph", "resolvedStyles"],
  beforeAsset: ["assetLoaders", "mediaSourceOrigin", "integrationContext"],
  afterAsset: ["assetsById", "assetLoaders", "mediaSourceOrigin", "integrationContext"],
  beforeProject: ["graph", "resolvedStyles", "assetsById"],
  afterProject: ["projection"],
  beforeRender: ["projection"],
  afterRender: ["artifact"],
} satisfies Record<keyof DeckPluginHooks, readonly string[]>;

type PluginHookUpdateValueValidator = (value: unknown, context: object) => boolean;

const pluginHookUpdateValueValidators: Record<
  keyof DeckPluginHooks,
  Record<string, PluginHookUpdateValueValidator | undefined>
> = {
  beforeTree: {},
  afterTree: {
    roots: isComposedAuthorRootArray,
  },
  beforeGraph: {
    roots: isComposedAuthorRootArray,
  },
  afterGraph: {
    graph: isSemanticAuthorGraph,
    resolvedStyles: isResolvedStyleMapForContext,
  },
  beforeAsset: {
    assetLoaders: isAssetLoaderArray,
    mediaSourceOrigin: isMediaSourceOrigin,
    integrationContext: isIntegrationContext,
  },
  afterAsset: {
    assetsById: isAssetArtifactMap,
    assetLoaders: isAssetLoaderArray,
    mediaSourceOrigin: isMediaSourceOrigin,
    integrationContext: isIntegrationContext,
  },
  beforeProject: {
    graph: isSemanticAuthorGraph,
    resolvedStyles: isResolvedStyleMapForContext,
    assetsById: isAssetArtifactMap,
  },
  afterProject: {
    projection: isProjectedDocumentModelForActiveFormat,
  },
  beforeRender: {
    projection: isProjectedDocumentModelForActiveFormat,
  },
  afterRender: {
    artifact: isRenderedArtifactForActiveFormat,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isResolvedStyleMapForContext(value: unknown, context: object): boolean {
  const graph =
    isRecord(context) && isSemanticAuthorGraph(context.graph) ? context.graph : undefined;
  return isResolvedStyleMap(value, graph);
}

function isRenderedArtifactForActiveFormat(value: unknown, context: object): boolean {
  const format = isRecord(context) && isNonEmptyString(context.format) ? context.format : undefined;
  return isRenderedArtifact(value, format);
}

function activeFormatFromContext(context: object): ProjectionFormat | undefined {
  if (!isRecord(context)) {
    return undefined;
  }

  return context.format === "pptx" || context.format === "pdf" ? context.format : undefined;
}

function isProjectedDocumentModelForActiveFormat(value: unknown, context: object): boolean {
  if (!isProjectedDocumentModelValue(value)) {
    return false;
  }

  const format = activeFormatFromContext(context);
  return format === undefined || value.format === format;
}

function isSemanticAuthorGraphValue(value: unknown): value is SemanticAuthorGraph {
  return isSemanticAuthorGraph(value);
}

function isAssetArtifactMap(value: unknown): value is ReadonlyMap<AssetEntityId, AssetArtifact> {
  return (
    value instanceof Map &&
    [...value.entries()].every(
      ([key, artifact]) =>
        isNonEmptyString(key) && isAssetArtifactValue(artifact) && artifact.assetEntityId === key,
    )
  );
}

function isAssetArtifactValue(value: unknown): value is AssetArtifact {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "assetEntityId",
      "source",
      "sourceField",
      "resolverIdentity",
      "origin",
      "probe",
      "load",
      "diagnostics",
    ]) &&
    isNonEmptyString(value.assetEntityId) &&
    isAssetSource(value.source) &&
    isAssetSourceField(value.sourceField) &&
    (value.resolverIdentity === undefined || isNonEmptyString(value.resolverIdentity)) &&
    (value.origin === undefined || isMediaSourceOrigin(value.origin)) &&
    (value.probe === undefined || isAssetProbeResult(value.probe)) &&
    (value.load === undefined || isAssetLoadResult(value.load)) &&
    isDiagnosticsValue(value.diagnostics)
  );
}

function isAssetProbeResult(value: unknown): boolean {
  return isAssetProbeResultWithAllowedKeys(value, [
    "mediaType",
    "extension",
    "width",
    "height",
    "byteLength",
    "hash",
    "provenance",
  ]);
}

function isAssetProbeResultWithAllowedKeys(
  value: unknown,
  allowedKeys: readonly string[],
): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, allowedKeys) &&
    (value.mediaType === undefined || isNonEmptyString(value.mediaType)) &&
    (value.extension === undefined || isNonEmptyString(value.extension)) &&
    (value.width === undefined ||
      (typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0)) &&
    (value.height === undefined ||
      (typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0)) &&
    (value.byteLength === undefined ||
      (Number.isInteger(value.byteLength) && (value.byteLength as number) >= 0)) &&
    (value.hash === undefined || isNonEmptyString(value.hash)) &&
    (value.provenance === undefined || isAssetResolutionProvenance(value.provenance))
  );
}

function isAssetLoadResult(value: unknown): boolean {
  return (
    isAssetProbeResultWithAllowedKeys(value, [
      "mediaType",
      "extension",
      "width",
      "height",
      "byteLength",
      "hash",
      "provenance",
      "bytes",
    ]) &&
    isRecord(value) &&
    value.bytes instanceof Uint8Array &&
    value.bytes.byteLength > 0 &&
    (value.byteLength === undefined || value.byteLength === value.bytes.byteLength)
  );
}

function isAssetResolutionProvenance(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["kind", "resolvedId", "hashSource"]) &&
    (value.kind === "inline" ||
      value.kind === "fetch" ||
      value.kind === "file" ||
      value.kind === "publicAsset" ||
      value.kind === "generatedAsset") &&
    (value.resolvedId === undefined || isNonEmptyString(value.resolvedId)) &&
    (value.hashSource === undefined ||
      value.hashSource === "loader" ||
      value.hashSource === "bytes")
  );
}

function isAssetSource(value: unknown): value is AssetSource {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "bytes":
      return (
        hasOnlyKeys(value, ["kind", "bytes", "mediaType", "extension"]) &&
        value.bytes instanceof Uint8Array &&
        value.bytes.byteLength > 0 &&
        (value.mediaType === undefined || isNonEmptyString(value.mediaType)) &&
        (value.extension === undefined || isNonEmptyString(value.extension))
      );
    case "data":
      return hasOnlyKeys(value, ["kind", "data"]) && isNonEmptyString(value.data);
    case "url":
      return hasOnlyKeys(value, ["kind", "url"]) && isNonEmptyString(value.url);
    case "path":
      return hasOnlyKeys(value, ["kind", "path"]) && isNonEmptyString(value.path);
    default:
      return false;
  }
}

function isFontAssetRegistrationArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (asset) =>
        isRecord(asset) &&
        hasOnlyKeys(asset, ["key", "family", "weight", "style", "unicodeRange", "source"]) &&
        isNonEmptyString(asset.key) &&
        isNonEmptyString(asset.family) &&
        (asset.weight === undefined ||
          (typeof asset.weight === "number" && Number.isFinite(asset.weight))) &&
        (asset.style === undefined || asset.style === "normal" || asset.style === "italic") &&
        (asset.unicodeRange === undefined || isStringArray(asset.unicodeRange)) &&
        isAssetSource(asset.source),
    )
  );
}

function isAssetSourceField(value: unknown): boolean {
  return (
    value === "src" ||
    value === "data" ||
    value === "poster" ||
    value === "posterData" ||
    value === "font"
  );
}

function isDiagnosticsValue(value: unknown): value is { readonly items: readonly Diagnostic[] } {
  return isRecord(value) && hasOnlyKeys(value, ["items"]) && isDiagnosticArray(value.items);
}

function isAssetLoaderArray(value: unknown): value is readonly AssetLoader[] {
  return (
    Array.isArray(value) &&
    value.every(
      (loader) =>
        isRecord(loader) &&
        hasOnlyKeys(loader, ["resolverIdentity", "probe", "load"]) &&
        isNonEmptyString(loader.resolverIdentity) &&
        (loader.probe === undefined || typeof loader.probe === "function") &&
        (loader.load === undefined || typeof loader.load === "function"),
    )
  );
}

function isMediaSourceOrigin(value: unknown): value is MediaSourceOrigin {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["importer", "source", "sourceIdentity"]) &&
    (value.importer === undefined || isNonEmptyString(value.importer)) &&
    (value.source === undefined || isNonEmptyString(value.source)) &&
    (value.sourceIdentity === undefined || isNonEmptyString(value.sourceIdentity))
  );
}

function isIntegrationContext(value: unknown): value is DeckIntegrationContext {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "assetLoaders", "fontAssets", "mediaSourceOrigin"]) &&
    isNonEmptyString(value.id) &&
    (value.assetLoaders === undefined || isAssetLoaderArray(value.assetLoaders)) &&
    (value.fontAssets === undefined || isFontAssetRegistrationArray(value.fontAssets)) &&
    (value.mediaSourceOrigin === undefined || isMediaSourceOrigin(value.mediaSourceOrigin))
  );
}

function isPptxPackageModelValue(value: unknown): value is PptxPackageModel {
  return isRecord(value) && isPptxPackageModel(value as never);
}

function isProjectedDocumentModelValue(value: unknown): value is ProjectedDocumentModel {
  return isPptxPackageModelValue(value) || isPdfPageModelValue(value);
}

function isPdfPageModelValue(value: unknown): boolean {
  return (
    isPdfPageModel(value) &&
    value.pages.every(isPdfPageValue) &&
    isPdfResourceDictionaryValue(value.resources) &&
    value.fallbacks.every(
      (fallback) =>
        isRecord(fallback) &&
        typeof fallback.code === "string" &&
        typeof fallback.message === "string" &&
        (fallback.pageId === undefined || typeof fallback.pageId === "string"),
    )
  );
}

function isPdfPageValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.index === "number" &&
    isPdfRectangleValue(value.mediaBox) &&
    isRecord(value.resources) &&
    Array.isArray(value.resources.fonts) &&
    value.resources.fonts.every((fontId) => typeof fontId === "string") &&
    Array.isArray(value.resources.images) &&
    value.resources.images.every((imageId) => typeof imageId === "string") &&
    Array.isArray(value.content) &&
    value.content.every(isPdfContentOpValue)
  );
}

function isPdfRectangleValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0
  );
}

function isPdfPointValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  );
}

function isPdfOpacityValue(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function isPdfLineWidthValue(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPdfRotationValue(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isPdfStrokeStyleValue(value: Readonly<Record<string, unknown>>): boolean {
  return (
    (value.dash === undefined || value.dash === "dash" || value.dash === "sysDot") &&
    (value.lineCap === undefined ||
      value.lineCap === "butt" ||
      value.lineCap === "round" ||
      value.lineCap === "square") &&
    (value.lineJoin === undefined ||
      value.lineJoin === "bevel" ||
      value.lineJoin === "miter" ||
      value.lineJoin === "round")
  );
}

function isPdfResourceDictionaryValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.fonts) &&
    value.fonts.every(isPdfFontResourceValue) &&
    Array.isArray(value.images) &&
    value.images.every(isPdfImageResourceValue)
  );
}

function isPdfContentOpValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.op) {
    case "setFillColor":
    case "setStrokeColor":
      return isPdfColorValue(value.color);
    case "setLineWidth":
      return isPdfLineWidthValue(value.width);
    case "fillRect":
    case "fillEllipse":
      return (
        isPdfRectangleValue(value.box) &&
        isPdfRotationValue(value.rotation) &&
        isPdfOpacityValue(value.opacity)
      );
    case "fillLinearGradientRect":
    case "fillLinearGradientEllipse":
    case "fillRadialGradientRect":
    case "fillRadialGradientEllipse":
      return (
        typeof value.gradientId === "string" &&
        isPdfRectangleValue(value.box) &&
        isPdfRotationValue(value.rotation) &&
        isPdfOpacityValue(value.opacity)
      );
    case "fillRoundRect":
      return (
        isPdfRectangleValue(value.box) &&
        typeof value.radius === "number" &&
        Number.isFinite(value.radius) &&
        value.radius >= 0 &&
        isPdfRotationValue(value.rotation) &&
        isPdfOpacityValue(value.opacity)
      );
    case "fillLinearGradientRoundRect":
    case "fillRadialGradientRoundRect":
      return (
        typeof value.gradientId === "string" &&
        isPdfRectangleValue(value.box) &&
        typeof value.radius === "number" &&
        Number.isFinite(value.radius) &&
        value.radius >= 0 &&
        isPdfRotationValue(value.rotation) &&
        isPdfOpacityValue(value.opacity)
      );
    case "strokeRect":
    case "strokeEllipse":
      return (
        isPdfRectangleValue(value.box) &&
        isPdfRotationValue(value.rotation) &&
        (value.lineWidth === undefined || isPdfLineWidthValue(value.lineWidth)) &&
        isPdfStrokeStyleValue(value) &&
        isPdfOpacityValue(value.opacity)
      );
    case "strokeRoundRect":
      return (
        isPdfRectangleValue(value.box) &&
        typeof value.radius === "number" &&
        Number.isFinite(value.radius) &&
        value.radius >= 0 &&
        isPdfRotationValue(value.rotation) &&
        (value.lineWidth === undefined || isPdfLineWidthValue(value.lineWidth)) &&
        isPdfStrokeStyleValue(value) &&
        isPdfOpacityValue(value.opacity)
      );
    case "strokeLine":
      return (
        isPdfPointValue(value.from) &&
        isPdfPointValue(value.to) &&
        isPdfColorValue(value.color) &&
        isPdfLineWidthValue(value.lineWidth) &&
        isPdfRotationValue(value.rotation) &&
        (value.rotationBox === undefined || isPdfRectangleValue(value.rotationBox)) &&
        isPdfStrokeStyleValue(value) &&
        isPdfOpacityValue(value.opacity)
      );
    case "text":
      return (
        typeof value.text === "string" &&
        typeof value.x === "number" &&
        typeof value.y === "number" &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        (value.box === undefined || isPdfRectangleValue(value.box)) &&
        (value.fontId === undefined || typeof value.fontId === "string") &&
        (value.fontSize === undefined ||
          (typeof value.fontSize === "number" &&
            Number.isFinite(value.fontSize) &&
            value.fontSize > 0)) &&
        (value.charSpacing === undefined ||
          (typeof value.charSpacing === "number" && Number.isFinite(value.charSpacing))) &&
        (value.textRise === undefined ||
          (typeof value.textRise === "number" && Number.isFinite(value.textRise))) &&
        (value.color === undefined || isPdfColorValue(value.color)) &&
        isPdfRotationValue(value.rotation) &&
        isPdfOpacityValue(value.opacity)
      );
    case "image":
      return (
        typeof value.imageId === "string" &&
        isPdfRectangleValue(value.box) &&
        (value.clipBox === undefined || isPdfRectangleValue(value.clipBox)) &&
        isPdfRotationValue(value.rotation) &&
        (value.flipH === undefined || typeof value.flipH === "boolean") &&
        (value.flipV === undefined || typeof value.flipV === "boolean") &&
        isPdfOpacityValue(value.opacity)
      );
    default:
      return false;
  }
}

function isPdfColorValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.r === "number" &&
    typeof value.g === "number" &&
    typeof value.b === "number" &&
    Number.isFinite(value.r) &&
    Number.isFinite(value.g) &&
    Number.isFinite(value.b)
  );
}

function isPdfFontResourceValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.family === undefined || typeof value.family === "string") &&
    (value.weight === undefined ||
      (typeof value.weight === "number" && Number.isFinite(value.weight))) &&
    (value.style === undefined || value.style === "normal" || value.style === "italic") &&
    (value.fallback === undefined || typeof value.fallback === "boolean") &&
    (value.sourceKey === undefined || typeof value.sourceKey === "string") &&
    (value.data === undefined || value.data instanceof Uint8Array)
  );
}

function isPdfImageResourceValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.mediaType === undefined || typeof value.mediaType === "string") &&
    (value.width === undefined || typeof value.width === "number") &&
    (value.height === undefined || typeof value.height === "number") &&
    (value.data === undefined || value.data instanceof Uint8Array)
  );
}

function pluginHookFailedDiagnostic(input: {
  readonly plugin: DeckPlugin;
  readonly hookName: keyof DeckPluginHooks;
  readonly error: unknown;
}): Diagnostic {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return {
    severity: "error",
    code: "E_PLUGIN_HOOK_FAILED",
    title: "plugin hook failed",
    message: `${input.plugin.id}.${input.hookName} threw an error: ${message}`,
    labels: [],
  };
}

function pluginHookInvalidUpdateDiagnostic(input: {
  readonly plugin: DeckPlugin;
  readonly hookName: keyof DeckPluginHooks;
  readonly invalidUpdateKeys: readonly string[];
}): Diagnostic {
  return {
    severity: "error",
    code: "E_PLUGIN_HOOK_INVALID_UPDATE",
    title: "plugin hook returned invalid updates",
    message: `${input.plugin.id}.${input.hookName} returned unsupported update keys: ${input.invalidUpdateKeys.join(", ")}`,
    labels: [],
  };
}

function pluginHookInvalidResultDiagnostic(input: {
  readonly plugin: DeckPlugin;
  readonly hookName: keyof DeckPluginHooks;
}): Diagnostic {
  return {
    severity: "error",
    code: "E_PLUGIN_HOOK_INVALID_RESULT",
    title: "plugin hook returned invalid result",
    message: `${input.plugin.id}.${input.hookName} must return an object or void.`,
    labels: [],
  };
}

function pluginHookInvalidResultDiagnosticsDiagnostic(input: {
  readonly plugin: DeckPlugin;
  readonly hookName: keyof DeckPluginHooks;
}): Diagnostic {
  return {
    severity: "error",
    code: "E_PLUGIN_HOOK_INVALID_RESULT",
    title: "plugin hook returned invalid result",
    message: `${input.plugin.id}.${input.hookName} diagnostics must be an array of diagnostics when provided.`,
    labels: [],
  };
}

function pluginHookInvalidUpdateValueDiagnostic(input: {
  readonly plugin: DeckPlugin;
  readonly hookName: keyof DeckPluginHooks;
  readonly updateKey: string;
}): Diagnostic {
  return {
    severity: "error",
    code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
    title: "plugin hook returned an invalid update value",
    message: `${input.plugin.id}.${input.hookName} returned an invalid value for update key: ${input.updateKey}`,
    labels: [],
  };
}

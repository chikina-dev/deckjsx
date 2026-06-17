import type { AssetLoader, AssetSource } from "./assets";
import type { ComposedAuthorRoot } from "./composition/types";
import type { Diagnostic } from "./diagnostics";
import type { AssetEntityId, SemanticAuthorGraph } from "./graph";
import type { DeckIntegrationContext } from "./integration-context";
import type { MediaSourceOrigin } from "./media-source-origin";
import type { RenderedArtifact } from "./pipeline";
import type { AssetArtifact } from "./pipeline-artifacts";
import { isPptxPackageModel, type PptxPackageModel } from "./projection/pptx/model";
import type { ResolvedStyleMap } from "./style/resolve";

export type HmrInvalidation = {
  readonly importer?: string;
  readonly changedModuleIds: readonly string[];
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
  readonly projection: PptxPackageModel;
};

export type AfterProjectLifecycleUpdate = {
  readonly projection: PptxPackageModel;
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
  readonly projection: PptxPackageModel;
};

export type BeforeRenderLifecycleUpdate = {
  readonly projection: PptxPackageModel;
};

export type AfterRenderLifecycleContext = {
  readonly stage: "render";
  readonly phase: "after";
  readonly format: string;
  readonly projection: PptxPackageModel;
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
    const allowedUpdates = Object.fromEntries(
      updateEntries.filter(([key, value]) => {
        if (!allowedUpdateKeys.includes(key)) {
          return false;
        }
        const validator = pluginHookUpdateValueValidators[hookName]?.[key];
        if (!validator || validator(value)) {
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
    snapshot.graph = snapshotSemanticAuthorGraph(snapshot.graph);
  }
  if (snapshot.resolvedStyles instanceof Map) {
    snapshot.resolvedStyles = new Map(snapshot.resolvedStyles);
  }
  if (snapshot.assetsById instanceof Map) {
    snapshot.assetsById = new Map(snapshot.assetsById);
  }
  if (Array.isArray(snapshot.assetLoaders)) {
    snapshot.assetLoaders = [...snapshot.assetLoaders];
  }
  return snapshot as TContext;
}

function snapshotSemanticAuthorGraph(graph: SemanticAuthorGraph): SemanticAuthorGraph {
  return {
    ...graph,
    nodes: new Map(graph.nodes),
    styles: new Map(graph.styles),
    assets: new Map(graph.assets),
    templates: new Map(graph.templates),
  };
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

type PluginHookUpdateValueValidator = (value: unknown) => boolean;

const pluginHookUpdateValueValidators: Record<
  keyof DeckPluginHooks,
  Record<string, PluginHookUpdateValueValidator | undefined>
> = {
  beforeTree: {},
  afterTree: {
    roots: Array.isArray,
  },
  beforeGraph: {
    roots: Array.isArray,
  },
  afterGraph: {
    graph: isSemanticAuthorGraphValue,
    resolvedStyles: isReadonlyMap,
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
    graph: isSemanticAuthorGraphValue,
    resolvedStyles: isReadonlyMap,
    assetsById: isAssetArtifactMap,
  },
  afterProject: {
    projection: isPptxPackageModelValue,
  },
  beforeRender: {
    projection: isPptxPackageModelValue,
  },
  afterRender: {
    artifact: isRenderedArtifact,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isReadonlyMap(value: unknown): value is ReadonlyMap<unknown, unknown> {
  return value instanceof Map;
}

function isSemanticAuthorGraphValue(value: unknown): value is SemanticAuthorGraph {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.documentId === "string" &&
    value.nodes instanceof Map &&
    value.styles instanceof Map &&
    value.assets instanceof Map &&
    value.nodes.has(value.documentId)
  );
}

function isAssetArtifactMap(value: unknown): value is ReadonlyMap<AssetEntityId, AssetArtifact> {
  return (
    value instanceof Map &&
    [...value.entries()].every(
      ([key, artifact]) => typeof key === "string" && isAssetArtifactValue(artifact),
    )
  );
}

function isAssetArtifactValue(value: unknown): value is AssetArtifact {
  return (
    isRecord(value) &&
    typeof value.assetEntityId === "string" &&
    isAssetSource(value.source) &&
    isAssetSourceField(value.sourceField) &&
    (value.resolverIdentity === undefined || typeof value.resolverIdentity === "string") &&
    (value.origin === undefined || isMediaSourceOrigin(value.origin)) &&
    (value.probe === undefined || isRecord(value.probe)) &&
    (value.load === undefined || isRecord(value.load)) &&
    isDiagnosticsValue(value.diagnostics)
  );
}

function isAssetSource(value: unknown): value is AssetSource {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "bytes":
      return value.bytes instanceof Uint8Array;
    case "data":
      return typeof value.data === "string";
    case "url":
      return typeof value.url === "string";
    case "path":
      return typeof value.path === "string";
    default:
      return false;
  }
}

function isAssetSourceField(value: unknown): boolean {
  return value === "src" || value === "data" || value === "poster" || value === "posterData";
}

function isDiagnosticsValue(value: unknown): value is { readonly items: readonly Diagnostic[] } {
  return isRecord(value) && Array.isArray(value.items);
}

function isAssetLoaderArray(value: unknown): value is readonly AssetLoader[] {
  return (
    Array.isArray(value) &&
    value.every(
      (loader) =>
        isRecord(loader) &&
        typeof loader.resolverIdentity === "string" &&
        (loader.probe === undefined || typeof loader.probe === "function") &&
        (loader.load === undefined || typeof loader.load === "function"),
    )
  );
}

function isMediaSourceOrigin(value: unknown): value is MediaSourceOrigin {
  return (
    isRecord(value) &&
    (value.importer === undefined || typeof value.importer === "string") &&
    (value.source === undefined || typeof value.source === "string") &&
    (value.sourceIdentity === undefined || typeof value.sourceIdentity === "string")
  );
}

function isIntegrationContext(value: unknown): value is DeckIntegrationContext {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.assetLoaders === undefined || isAssetLoaderArray(value.assetLoaders)) &&
    (value.mediaSourceOrigin === undefined || isMediaSourceOrigin(value.mediaSourceOrigin))
  );
}

function isPptxPackageModelValue(value: unknown): value is PptxPackageModel {
  return isRecord(value) && isPptxPackageModel(value as never);
}

function isRenderedArtifact(value: unknown): value is RenderedArtifact {
  return (
    isRecord(value) &&
    typeof value.format === "string" &&
    typeof value.mediaType === "string" &&
    typeof value.extension === "string" &&
    value.bytes instanceof Uint8Array
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

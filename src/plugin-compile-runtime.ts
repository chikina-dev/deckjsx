import type { Diagnostic } from "./diagnostics";
import type { SemanticAuthorGraph } from "./graph/types";

export type CompilePluginHookName = "afterGraph" | "afterTree" | "beforeGraph" | "beforeTree";

export type CompilePluginHookResult<TUpdate extends object = object> =
  | void
  | (Partial<TUpdate> & {
      readonly diagnostics?: readonly Diagnostic[];
    });

export type CompileDeckPluginHooks = {
  beforeTree?(context: {
    readonly stage: "tree";
    readonly phase: "before";
  }): CompilePluginHookResult;
  afterTree?(context: {
    readonly stage: "tree";
    readonly phase: "after";
    readonly roots: readonly unknown[];
  }): CompilePluginHookResult<{ readonly roots: readonly unknown[] }>;
  beforeGraph?(context: {
    readonly stage: "graph";
    readonly phase: "before";
    readonly roots: readonly unknown[];
  }): CompilePluginHookResult<{ readonly roots: readonly unknown[] }>;
  afterGraph?(context: {
    readonly stage: "graph";
    readonly phase: "after";
    readonly roots: readonly unknown[];
    readonly graph?: SemanticAuthorGraph;
    readonly resolvedStyles?: ReadonlyMap<unknown, unknown>;
  }): CompilePluginHookResult<{
    readonly graph: SemanticAuthorGraph;
    readonly resolvedStyles: ReadonlyMap<unknown, unknown>;
  }>;
};

export type CompileDeckPlugin = {
  readonly kind: "deckjsx.plugin";
  readonly id: string;
  readonly name?: string;
  readonly integration?: unknown;
  readonly hooks?: CompileDeckPluginHooks;
};

const compilePluginHookUpdateKeys = {
  beforeTree: [],
  afterTree: ["roots"],
  beforeGraph: ["roots"],
  afterGraph: ["graph", "resolvedStyles"],
} satisfies Record<CompilePluginHookName, readonly string[]>;

const deckPluginHookKeys = [
  "beforeTree",
  "afterTree",
  "beforeGraph",
  "afterGraph",
  "beforeAsset",
  "afterAsset",
  "beforeProject",
  "afterProject",
  "beforeRender",
  "afterRender",
] as const;

type CompilePluginHookUpdateValueValidator = (value: unknown) => boolean;

const compilePluginHookUpdateValueValidators: Record<
  CompilePluginHookName,
  Record<string, CompilePluginHookUpdateValueValidator | undefined>
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
};

const deckPluginKeys = ["kind", "id", "name", "integration", "hooks"] as const;
const deckPluginIntegrationKeys = ["id", "assetLoaders", "mediaSourceOrigin"] as const;

export function validateCompileDeckPlugins(plugins: unknown): readonly Diagnostic[] {
  if (plugins === undefined) {
    return [];
  }

  if (!Array.isArray(plugins)) {
    return [invalidDeckPluginListDiagnostic()];
  }

  return plugins
    .filter((plugin) => !isCompileDeckPlugin(plugin))
    .map((plugin) => invalidDeckPluginDiagnostic(plugin));
}

export function validCompileDeckPlugins(plugins: unknown): readonly CompileDeckPlugin[] {
  return Array.isArray(plugins) ? plugins.filter(isCompileDeckPlugin) : [];
}

export function applyCompilePluginHooks<TContext extends object>(
  plugins: readonly CompileDeckPlugin[] | undefined,
  hookName: CompilePluginHookName,
  initialContext: TContext,
): { readonly context: TContext; readonly diagnostics: readonly Diagnostic[] } {
  let context = initialContext;
  const diagnostics: Diagnostic[] = [];
  const allowedUpdateKeys: readonly string[] = compilePluginHookUpdateKeys[hookName];

  for (const plugin of plugins ?? []) {
    const hook = plugin.hooks?.[hookName] as
      | ((value: TContext) => CompilePluginHookResult)
      | undefined;
    let result: CompilePluginHookResult;
    try {
      result = hook?.(snapshotCompilePluginHookContext(context));
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

    const allowedUpdates = Object.fromEntries(
      updateEntries.filter(([key, value]) => {
        if (!allowedUpdateKeys.includes(key)) {
          return false;
        }
        const validator = compilePluginHookUpdateValueValidators[hookName]?.[key];
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

function isCompileDeckPlugin(value: unknown): value is CompileDeckPlugin {
  return (
    isRecord(value) &&
    value.kind === "deckjsx.plugin" &&
    typeof value.id === "string" &&
    deckPluginValidationMessage(value) === undefined
  );
}

function deckPluginValidationMessage(plugin: unknown): string | undefined {
  if (!isRecord(plugin) || plugin.kind !== "deckjsx.plugin" || typeof plugin.id !== "string") {
    return 'Deck plugin must be an object with kind "deckjsx.plugin" and a string id.';
  }

  for (const key of Object.keys(plugin)) {
    if (!includesString(deckPluginKeys, key)) {
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
      if (!includesString(deckPluginHookKeys, hookName)) {
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
    if (!includesString(deckPluginIntegrationKeys, key)) {
      return `Deck plugin integration.${key} is not part of the public authoring API.`;
    }
  }

  if (typeof integration.id !== "string") {
    return "Deck plugin integration.id must be a string.";
  }

  if (integration.assetLoaders !== undefined && !isAssetLoaderArray(integration.assetLoaders)) {
    return "Deck plugin integration.assetLoaders must be an array of Asset Loaders.";
  }

  if (
    integration.mediaSourceOrigin !== undefined &&
    !isMediaSourceOrigin(integration.mediaSourceOrigin)
  ) {
    return "Deck plugin integration.mediaSourceOrigin must be a Media Source Origin object.";
  }

  return undefined;
}

function invalidDeckPluginDiagnostic(plugin?: unknown): Diagnostic {
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

function snapshotCompilePluginHookContext<TContext extends object>(context: TContext): TContext {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value);
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

function snapshotSemanticAuthorGraph(graph: SemanticAuthorGraph): SemanticAuthorGraph {
  return {
    ...graph,
    nodes: new Map(graph.nodes),
    styles: new Map(graph.styles),
    assets: new Map(graph.assets),
    templates: new Map(graph.templates),
  };
}

function isAssetLoaderArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (loader) =>
        isRecord(loader) &&
        hasOnlyKeys(loader, ["resolverIdentity", "probe", "load"]) &&
        typeof loader.resolverIdentity === "string" &&
        (loader.probe === undefined || typeof loader.probe === "function") &&
        (loader.load === undefined || typeof loader.load === "function"),
    )
  );
}

function isMediaSourceOrigin(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["importer", "source", "sourceIdentity"]) &&
    (value.importer === undefined || typeof value.importer === "string") &&
    (value.source === undefined || typeof value.source === "string") &&
    (value.sourceIdentity === undefined || typeof value.sourceIdentity === "string")
  );
}

function pluginHookFailedDiagnostic(input: {
  readonly plugin: CompileDeckPlugin;
  readonly hookName: CompilePluginHookName;
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
  readonly plugin: CompileDeckPlugin;
  readonly hookName: CompilePluginHookName;
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
  readonly plugin: CompileDeckPlugin;
  readonly hookName: CompilePluginHookName;
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
  readonly plugin: CompileDeckPlugin;
  readonly hookName: CompilePluginHookName;
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
  readonly plugin: CompileDeckPlugin;
  readonly hookName: CompilePluginHookName;
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

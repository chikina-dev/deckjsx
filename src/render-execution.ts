import type { RenderOptions, WriterAdapter } from "./adapter";
import {
  AUTHORING_RUNTIME_OBSERVERS,
  authoringRuntimeObserversFrom,
  type AuthoringRuntimeObserver,
  type AuthoringRuntimeObserverCarrier,
} from "./authoring-runtime-observer";
import type { AssetLoader } from "./assets";
import type { DeckIntegrationContext } from "./integration-context";
import { integrationContextFromPlugins, mergeIntegrationContexts } from "./integration-context";
import type { MediaSourceOrigin } from "./media-source-origin";
import {
  mergeAssetLoaders,
  validateDeckPlugins,
  validDeckPlugins,
  type DeckPlugin,
  type SourceInvalidation,
} from "./plugin";
import type { Diagnostic } from "./diagnostics";
import type { PptxPackageModel } from "./projection/pptx/model";

const RENDER_EXECUTION_CONTEXT = Symbol.for("deckjsx.renderExecutionContext");
const RENDER_EXECUTION_CONTEXT_DIAGNOSTICS = Symbol.for(
  "deckjsx.renderExecutionContextDiagnostics",
);

export type RenderExecutionContext = {
  readonly plugins?: readonly DeckPlugin[];
  readonly integration?: DeckIntegrationContext;
  readonly sourceInvalidation?: SourceInvalidation;
};

export type RenderInputWithExecutionContext = RenderOptions | WriterAdapter<PptxPackageModel>;

type RenderExecutionContextCarrier = {
  readonly [RENDER_EXECUTION_CONTEXT]?: RenderExecutionContext;
};

type RenderExecutionContextDiagnosticsCarrier = {
  readonly [RENDER_EXECUTION_CONTEXT_DIAGNOSTICS]?: readonly Diagnostic[];
};

export type RenderExecution = {
  readonly authoringRuntimeObservers?: readonly AuthoringRuntimeObserver[];
  readonly plugins: readonly DeckPlugin[];
  readonly diagnostics: readonly Diagnostic[];
  readonly integrationContext?: DeckIntegrationContext;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly sourceInvalidation?: SourceInvalidation;
};

export function withRenderExecutionContext<TInput extends RenderInputWithExecutionContext>(
  input: TInput,
  context: RenderExecutionContext,
): TInput {
  const current = renderExecutionContextFrom(input);
  const output = Object.create(Object.getPrototypeOf(input)) as TInput;
  Object.defineProperties(output, Object.getOwnPropertyDescriptors(input));
  Object.defineProperty(output, RENDER_EXECUTION_CONTEXT, {
    configurable: true,
    enumerable: false,
    value: mergeRenderExecutionContext(current, context),
    writable: false,
  });
  return output;
}

export function renderExecutionContextFrom(
  input: RenderInputWithExecutionContext | undefined,
): RenderExecutionContext | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  return (input as RenderExecutionContextCarrier)[RENDER_EXECUTION_CONTEXT];
}

function renderExecutionContextDiagnosticsFrom(value: unknown): readonly Diagnostic[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  return (
    (value as RenderExecutionContextDiagnosticsCarrier)[RENDER_EXECUTION_CONTEXT_DIAGNOSTICS] ?? []
  );
}

export function createRenderExecution(input: {
  readonly plugins: readonly unknown[] | undefined;
  readonly renderInput?: RenderInputWithExecutionContext;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
}): RenderExecution {
  const renderExecutionContext = renderExecutionContextFrom(input.renderInput);
  const authoringRuntimeObservers = authoringRuntimeObserversFrom(renderExecutionContext);
  const renderContextShapeDiagnostics =
    renderExecutionContext === undefined
      ? []
      : renderExecutionContextShapeDiagnostics(renderExecutionContext);
  const renderContextDiagnostics = [
    ...renderExecutionContextDiagnosticsFrom(renderExecutionContext),
    ...renderContextShapeDiagnostics,
  ];
  const renderContextFieldsAreValid = renderContextShapeDiagnostics.length === 0;
  const renderContextPluginsDiagnostics = renderContextFieldsAreValid
    ? renderContextPluginsDiagnostic(renderExecutionContext?.plugins)
    : [];
  const renderContextPlugins =
    renderContextFieldsAreValid && renderContextPluginsDiagnostics.length === 0
      ? (renderExecutionContext?.plugins ?? [])
      : [];
  const deckPluginDiagnostics = validateDeckPlugins(input.plugins ?? []);
  const plugins = validDeckPlugins([...(input.plugins ?? []), ...renderContextPlugins]);
  const renderContextIntegration = renderExecutionContext?.integration;
  const integrationDiagnostics = renderContextFieldsAreValid
    ? renderContextIntegrationDiagnostic(renderContextIntegration)
    : [];
  const sourceInvalidationDiagnostics = renderContextFieldsAreValid
    ? renderContextSourceInvalidationDiagnostic(renderExecutionContext?.sourceInvalidation)
    : [];
  const diagnostics = [
    ...renderContextDiagnostics,
    ...renderContextPluginsDiagnostics,
    ...deckPluginDiagnostics,
    ...validateDeckPlugins(renderContextPlugins),
    ...integrationDiagnostics,
    ...sourceInvalidationDiagnostics,
  ];
  const validRenderContextIntegration =
    integrationDiagnostics.length === 0 ? renderContextIntegration : undefined;
  const validSourceInvalidation =
    sourceInvalidationDiagnostics.length === 0
      ? renderExecutionContext?.sourceInvalidation
      : undefined;
  const integrationContext = mergeIntegrationContexts(
    [integrationContextFromPlugins(plugins), validRenderContextIntegration].filter(
      (context): context is DeckIntegrationContext => context !== undefined,
    ),
  );
  const assetLoaders = mergeAssetLoaders(integrationContext?.assetLoaders, input.assetLoaders);
  const mediaSourceOrigin = integrationContext?.mediaSourceOrigin ?? input.mediaSourceOrigin;

  return {
    ...(authoringRuntimeObservers && authoringRuntimeObservers.length > 0
      ? { authoringRuntimeObservers }
      : {}),
    plugins,
    diagnostics,
    ...(integrationContext ? { integrationContext } : {}),
    ...(assetLoaders ? { assetLoaders } : {}),
    ...(mediaSourceOrigin ? { mediaSourceOrigin } : {}),
    ...(validSourceInvalidation ? { sourceInvalidation: validSourceInvalidation } : {}),
  };
}

function renderContextPluginsDiagnostic(
  plugins: readonly DeckPlugin[] | undefined,
): readonly Diagnostic[] {
  if (plugins === undefined || Array.isArray(plugins)) {
    return [];
  }

  return [
    {
      severity: "error",
      code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
      title: "render execution context is not part of the public authoring API",
      message: "Render execution plugins must be an array of Deck Plugins when provided.",
      labels: [],
    },
  ];
}

function renderContextIntegrationDiagnostic(integration: unknown): readonly Diagnostic[] {
  const message = renderContextIntegrationValidationMessage(integration);
  return message
    ? [
        {
          severity: "error",
          code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
          title: "render execution context is not part of the public authoring API",
          message,
          labels: [],
        },
      ]
    : [];
}

function renderContextIntegrationValidationMessage(integration: unknown): string | undefined {
  if (integration === undefined) {
    return undefined;
  }

  if (!isRecord(integration)) {
    return "Render execution integration must be an object when provided.";
  }

  for (const key of Object.keys(integration)) {
    if (key !== "id" && key !== "assetLoaders" && key !== "mediaSourceOrigin") {
      return `Render execution integration.${key} is not part of the public authoring API.`;
    }
  }

  if (typeof integration.id !== "string") {
    return "Render execution integration.id must be a string.";
  }

  if (integration.assetLoaders !== undefined && !isAssetLoaderArray(integration.assetLoaders)) {
    return "Render execution integration.assetLoaders must be an array of Asset Loaders.";
  }

  if (
    integration.mediaSourceOrigin !== undefined &&
    !isMediaSourceOrigin(integration.mediaSourceOrigin)
  ) {
    return "Render execution integration.mediaSourceOrigin must be a Media Source Origin object.";
  }

  return undefined;
}

function isDeckIntegrationContext(value: unknown): value is DeckIntegrationContext {
  return renderContextIntegrationValidationMessage(value) === undefined;
}

function renderContextSourceInvalidationDiagnostic(
  sourceInvalidation: unknown,
): readonly Diagnostic[] {
  const message = renderContextSourceInvalidationValidationMessage(sourceInvalidation);
  return message
    ? [
        {
          severity: "error",
          code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
          title: "render execution context is not part of the public authoring API",
          message,
          labels: [],
        },
      ]
    : [];
}

function renderContextSourceInvalidationValidationMessage(
  sourceInvalidation: unknown,
): string | undefined {
  if (sourceInvalidation === undefined) {
    return undefined;
  }

  if (!isRecord(sourceInvalidation)) {
    return "Render execution sourceInvalidation must be an object when provided.";
  }

  for (const key of Object.keys(sourceInvalidation)) {
    if (key !== "changedSourceIds") {
      return `Render execution sourceInvalidation.${key} is not part of the public authoring API.`;
    }
  }

  if (
    !Array.isArray(sourceInvalidation.changedSourceIds) ||
    !sourceInvalidation.changedSourceIds.every((id) => typeof id === "string")
  ) {
    return "Render execution sourceInvalidation.changedSourceIds must be an array of strings.";
  }

  return undefined;
}

function isSourceInvalidation(value: unknown): value is SourceInvalidation {
  return renderContextSourceInvalidationValidationMessage(value) === undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssetLoaderArray(value: unknown): value is readonly AssetLoader[] {
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

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isMediaSourceOrigin(value: unknown): value is MediaSourceOrigin {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["importer", "source", "sourceIdentity"]) &&
    (value.importer === undefined || typeof value.importer === "string") &&
    (value.source === undefined || typeof value.source === "string") &&
    (value.sourceIdentity === undefined || typeof value.sourceIdentity === "string")
  );
}

function renderExecutionContextShapeDiagnostics(context: unknown): readonly Diagnostic[] {
  const message = renderExecutionContextShapeValidationMessage(context);
  return message
    ? [
        {
          severity: "error",
          code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
          title: "render execution context is not part of the public authoring API",
          message,
          labels: [],
        },
      ]
    : [];
}

function renderExecutionContextShapeValidationMessage(context: unknown): string | undefined {
  if (!isRecord(context)) {
    return "Render execution context must be an object.";
  }

  for (const key of Object.keys(context)) {
    if (key !== "plugins" && key !== "integration" && key !== "sourceInvalidation") {
      return `Render execution context ${key} is not part of the public authoring API.`;
    }
  }

  if (context.plugins !== undefined && !Array.isArray(context.plugins)) {
    return "Render execution plugins must be an array of Deck Plugins when provided.";
  }

  const integrationMessage = renderContextIntegrationValidationMessage(context.integration);
  if (integrationMessage) {
    return integrationMessage;
  }

  const sourceInvalidationMessage = renderContextSourceInvalidationValidationMessage(
    context.sourceInvalidation,
  );
  if (sourceInvalidationMessage) {
    return sourceInvalidationMessage;
  }

  return undefined;
}

function mergeRenderExecutionContext(
  current: RenderExecutionContext | undefined,
  next: unknown,
): RenderExecutionContext {
  const nextContext = isRecord(next) ? (next as RenderExecutionContext) : undefined;
  const authoringRuntimeObservers = [
    ...(authoringRuntimeObserversFrom(current) ?? []),
    ...(authoringRuntimeObserversFrom(nextContext) ?? []),
  ];
  const contextDiagnostics = [
    ...renderExecutionContextDiagnosticsFrom(current),
    ...(current === undefined ? [] : renderExecutionContextShapeDiagnostics(current)),
    ...renderExecutionContextShapeDiagnostics(next),
  ];
  const currentPlugins = Array.isArray(current?.plugins) ? current.plugins : [];
  const nextPlugins = Array.isArray(nextContext?.plugins) ? nextContext.plugins : [];
  const currentIntegration = isDeckIntegrationContext(current?.integration)
    ? current?.integration
    : undefined;
  const nextIntegration = isDeckIntegrationContext(nextContext?.integration)
    ? nextContext?.integration
    : undefined;
  const currentSourceInvalidation = isSourceInvalidation(current?.sourceInvalidation)
    ? current?.sourceInvalidation
    : undefined;
  const nextSourceInvalidation = isSourceInvalidation(nextContext?.sourceInvalidation)
    ? nextContext?.sourceInvalidation
    : undefined;
  const sourceInvalidation =
    currentSourceInvalidation && nextSourceInvalidation
      ? {
          changedSourceIds: [
            ...new Set([
              ...currentSourceInvalidation.changedSourceIds,
              ...nextSourceInvalidation.changedSourceIds,
            ]),
          ],
        }
      : (nextSourceInvalidation ?? currentSourceInvalidation);
  const output: RenderExecutionContext & AuthoringRuntimeObserverCarrier = {
    plugins: [...currentPlugins, ...nextPlugins],
    integration: mergeIntegrationContexts(
      [currentIntegration, nextIntegration].filter(
        (context): context is DeckIntegrationContext => context !== undefined,
      ),
    ),
    ...(sourceInvalidation ? { sourceInvalidation } : {}),
  };
  if (contextDiagnostics.length > 0) {
    Object.defineProperty(output, RENDER_EXECUTION_CONTEXT_DIAGNOSTICS, {
      configurable: true,
      enumerable: false,
      value: contextDiagnostics,
      writable: false,
    });
  }
  if (authoringRuntimeObservers.length > 0) {
    Object.defineProperty(output, AUTHORING_RUNTIME_OBSERVERS, {
      configurable: true,
      enumerable: false,
      value: authoringRuntimeObservers,
      writable: false,
    });
  }
  return output;
}

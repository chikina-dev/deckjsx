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
import { mergeAssetLoaders, type DeckPlugin, type SourceInvalidation } from "./plugin";
import type { PptxPackageModel } from "./projection/pptx/model";

const RENDER_EXECUTION_CONTEXT = Symbol.for("deckjsx.renderExecutionContext");

export type RenderExecutionContext = {
  readonly plugins?: readonly DeckPlugin[];
  readonly integration?: DeckIntegrationContext;
  readonly sourceInvalidation?: SourceInvalidation;
};

export type RenderInputWithExecutionContext = RenderOptions | WriterAdapter<PptxPackageModel>;

type RenderExecutionContextCarrier = {
  readonly [RENDER_EXECUTION_CONTEXT]?: RenderExecutionContext;
};

export type RenderExecution = {
  readonly authoringRuntimeObservers?: readonly AuthoringRuntimeObserver[];
  readonly plugins: readonly DeckPlugin[];
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

export function createRenderExecution(input: {
  readonly plugins: readonly DeckPlugin[] | undefined;
  readonly renderInput?: RenderInputWithExecutionContext;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
}): RenderExecution {
  const renderExecutionContext = renderExecutionContextFrom(input.renderInput);
  const authoringRuntimeObservers = authoringRuntimeObserversFrom(renderExecutionContext);
  const plugins = [...(input.plugins ?? []), ...(renderExecutionContext?.plugins ?? [])];
  const integrationContext = mergeIntegrationContexts(
    [integrationContextFromPlugins(plugins), renderExecutionContext?.integration].filter(
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
    ...(integrationContext ? { integrationContext } : {}),
    ...(assetLoaders ? { assetLoaders } : {}),
    ...(mediaSourceOrigin ? { mediaSourceOrigin } : {}),
    ...(renderExecutionContext?.sourceInvalidation
      ? { sourceInvalidation: renderExecutionContext.sourceInvalidation }
      : {}),
  };
}

function mergeRenderExecutionContext(
  current: RenderExecutionContext | undefined,
  next: RenderExecutionContext,
): RenderExecutionContext {
  const authoringRuntimeObservers = [
    ...(authoringRuntimeObserversFrom(current) ?? []),
    ...(authoringRuntimeObserversFrom(next) ?? []),
  ];
  const sourceInvalidation =
    current?.sourceInvalidation && next.sourceInvalidation
      ? {
          changedSourceIds: [
            ...new Set([
              ...current.sourceInvalidation.changedSourceIds,
              ...next.sourceInvalidation.changedSourceIds,
            ]),
          ],
        }
      : (next.sourceInvalidation ?? current?.sourceInvalidation);
  const output: RenderExecutionContext & AuthoringRuntimeObserverCarrier = {
    plugins: [...(current?.plugins ?? []), ...(next.plugins ?? [])],
    integration: mergeIntegrationContexts(
      [current?.integration, next.integration].filter(
        (context): context is DeckIntegrationContext => context !== undefined,
      ),
    ),
    ...(sourceInvalidation ? { sourceInvalidation } : {}),
  };
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

import type { WriterAdapter } from "./adapter";
import type { AssetLoader } from "./assets";
import type { MediaSourceOrigin } from "./media-source-origin";

export type IntegrationContext = {
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly hmrInvalidation?: {
    readonly importer?: string;
    readonly changedModuleIds: readonly string[];
  };
};

const integrationContexts = new WeakMap<object, IntegrationContext>();

export function attachIntegrationContext<TAdapter extends WriterAdapter>(
  adapter: TAdapter,
  context: IntegrationContext,
): TAdapter {
  const wrapped = { ...adapter };
  integrationContexts.set(wrapped, context);
  return wrapped;
}

export function integrationContextFor(value: object | undefined): IntegrationContext | undefined {
  return value ? integrationContexts.get(value) : undefined;
}

export function mergeAssetLoaders(
  ...groups: readonly (readonly AssetLoader[] | undefined)[]
): readonly AssetLoader[] | undefined {
  const loaders = groups.flatMap((group) => group ?? []);
  return loaders.length > 0 ? loaders : undefined;
}

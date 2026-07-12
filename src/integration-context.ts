import type { AssetLoader, AssetSource } from "./assets";
import { assetEntityId } from "./graph/identity";
import type { AssetEntityId } from "./graph";
import type { MediaSourceOrigin } from "./media-source-origin";

type Brand<T, B extends string> = T & { readonly __brand: B };

export type IntegrationContextId = Brand<string, "IntegrationContextId">;

export type FontAssetRegistration = {
  readonly key: string;
  readonly family: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly unicodeRange?: readonly string[];
  readonly source: AssetSource;
};

export function fontAssetEntityId(registration: FontAssetRegistration): AssetEntityId {
  return assetEntityId(["font", registration.key]);
}

export type DeckIntegrationContext = {
  readonly id: IntegrationContextId;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly fontAssets?: readonly FontAssetRegistration[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
};

export function integrationContextId(value: string): IntegrationContextId {
  return value as IntegrationContextId;
}

export function integrationContextsFromValidatedPlugins(
  plugins: readonly { readonly integration?: DeckIntegrationContext }[] | undefined,
): readonly DeckIntegrationContext[] {
  return (plugins ?? []).flatMap((plugin) => (plugin.integration ? [plugin.integration] : []));
}

export function mergeIntegrationContexts(
  contexts: readonly DeckIntegrationContext[],
): DeckIntegrationContext | undefined {
  if (contexts.length === 0) {
    return undefined;
  }

  const assetLoaders = contexts.flatMap((context) => context.assetLoaders ?? []);
  const fontAssets = contexts.flatMap((context) => context.fontAssets ?? []);
  const mediaSourceOrigin = [...contexts]
    .reverse()
    .find((context) => context.mediaSourceOrigin)?.mediaSourceOrigin;
  const id =
    contexts.length === 1
      ? contexts[0]!.id
      : integrationContextId(`deckjsx:plugins:${contexts.map((context) => context.id).join("+")}`);

  return {
    id,
    ...(assetLoaders.length > 0 ? { assetLoaders } : {}),
    ...(fontAssets.length > 0 ? { fontAssets } : {}),
    ...(mediaSourceOrigin ? { mediaSourceOrigin } : {}),
  };
}

export function integrationContextFromValidatedPlugins(
  plugins: readonly { readonly integration?: DeckIntegrationContext }[] | undefined,
): DeckIntegrationContext | undefined {
  return mergeIntegrationContexts(integrationContextsFromValidatedPlugins(plugins));
}

import type { DeckPluginInput } from "deckjsx";
import type {
  AfterProjectLifecycleContext,
  AssetLoadResult,
  AssetLoader,
  AssetLoaderContext,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetResolutionHashSource,
  AssetResolutionProvenance,
  AssetResolutionProvenanceKind,
  AssetSource,
  AssetSourceField,
  DeckIntegrationContext,
  DeckPlugin,
  DeckPluginHooks,
  IntegrationContextId,
  MediaSourceOrigin,
  PluginHookResult,
  RenderExecutionContext,
  SourceInvalidation,
} from "deckjsx/integration";
import { integrationContextId, withRenderExecutionContext } from "deckjsx/integration";
import { isDeckPlugin } from "deckjsx/plugin-validation";
import { pptx } from "deckjsx/adapter";

const mediaOrigin = {
  importer: "/project/src/deck.tsx",
  source: "/project/src/deck.tsx",
} satisfies MediaSourceOrigin;
void mediaOrigin;

const source = {
  kind: "path",
  path: "./image.png",
} satisfies AssetSource;
void source;

const sourceField = "src" satisfies AssetSourceField;
void sourceField;

const loaderContext = {
  source,
  sourceField,
  resolverIdentity: "test-loader",
  assetEntityId: "asset:test",
  origin: mediaOrigin,
} satisfies AssetLoaderContext;
void loaderContext;

const probe = {
  mediaType: "image/png",
  extension: "png",
  width: 128,
  height: 64,
  byteLength: 4,
  hash: "fnv1a32:00000000",
  provenance: {
    kind: "file",
    resolvedId: "fnv1a32:00000000",
    hashSource: "bytes",
  },
} satisfies AssetProbeResult;
void probe;

const provenanceKind = "publicAsset" satisfies AssetResolutionProvenanceKind;
void provenanceKind;

const hashSource = "loader" satisfies AssetResolutionHashSource;
void hashSource;

const provenance = {
  kind: provenanceKind,
  resolvedId: "/assets/image.png",
  hashSource,
} satisfies AssetResolutionProvenance;
void provenance;

const load = {
  ...probe,
  bytes: new Uint8Array([1, 2, 3, 4]),
} satisfies AssetLoadResult;
void load;

const outcome = {
  ok: true,
  value: load,
} satisfies AssetLoaderOutcome<AssetLoadResult>;
void outcome;

const loader = {
  resolverIdentity: "test-loader",
  async probe(context) {
    context satisfies AssetLoaderContext;
    return { ok: true, value: probe };
  },
  async load(context) {
    context satisfies AssetLoaderContext;
    return { ok: true, value: load };
  },
} satisfies AssetLoader;
void loader;

const extension = {
  kind: "deckjsx.plugin",
  id: "test-extension",
  name: "test-extension",
  integration: {
    id: integrationContextId("test-extension"),
    assetLoaders: [loader],
    mediaSourceOrigin: mediaOrigin,
  },
} satisfies DeckPlugin;
void extension;
extension satisfies DeckPluginInput;

const sourceInvalidation = {
  changedSourceIds: ["/project/src/deck.tsx"],
} satisfies SourceInvalidation;
void sourceInvalidation;

const invalidSourceInvalidation = {
  // @ts-expect-error source invalidation no longer carries importer.
  importer: "/project/src/deck.tsx",
  changedSourceIds: ["/project/src/deck.tsx"],
} satisfies SourceInvalidation;
void invalidSourceInvalidation;

const integrationContext = {
  id: integrationContextId("test-context"),
  assetLoaders: [loader],
  mediaSourceOrigin: mediaOrigin,
} satisfies DeckIntegrationContext;
void integrationContext;
integrationContext.id satisfies IntegrationContextId;

const lifecycleHooks = {
  afterProject(context) {
    context satisfies AfterProjectLifecycleContext;
    return {
      projection: context.projection,
    } satisfies PluginHookResult<{ readonly projection: typeof context.projection }>;
  },
} satisfies DeckPluginHooks;
void lifecycleHooks;
const lifecyclePlugin = {
  kind: "deckjsx.plugin",
  id: "test:render-execution-plugin",
  hooks: lifecycleHooks,
} satisfies DeckPlugin;
void lifecyclePlugin;
isDeckPlugin(lifecyclePlugin) satisfies boolean;

const typedAuthoringPlugin: DeckPlugin<"diagram", { readonly source: string }> = {
  kind: "deckjsx.plugin",
  id: "test:typed-authoring",
  authoring: {
    lower({ value }) {
      value.payload.source satisfies string;
      return { children: [] };
    },
  },
};
void typedAuthoringPlugin;

const renderExecutionContext = {
  plugins: [lifecyclePlugin],
  integration: integrationContext,
  sourceInvalidation,
} satisfies RenderExecutionContext;
void renderExecutionContext;
const renderInput = withRenderExecutionContext(pptx(), renderExecutionContext);
void renderInput;

import type {
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
  AfterProjectLifecycleContext,
  DeckIntegrationContext,
  DeckPluginHooks,
  DeckPlugin,
  PluginHookResult,
  HmrInvalidation,
  IntegrationContextId,
  MediaSourceOrigin,
  RenderExecutionContext,
  RenderPatchPlan,
  RenderPatchPlanPart,
} from "deckjsx/integration";
import {
  integrationContextId,
  mediaSourceOrigins,
  PATCH_MANIFEST_KIND,
  PATCH_MANIFEST_PATH,
  PATCH_MANIFEST_VERSION,
  RENDER_PATCH_PLAN_KIND,
  withRenderExecutionContext,
} from "deckjsx/integration";
import { pptx } from "deckjsx/adapter";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

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
  resolverIdentity: "vite:test",
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

const hmrInvalidation = {
  importer: "/project/src/deck.tsx",
  changedModuleIds: ["/project/src/deck.tsx"],
} satisfies HmrInvalidation;
void hmrInvalidation;

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

const renderExecutionContext = {
  integration: integrationContext,
  hmrInvalidation,
} satisfies RenderExecutionContext;
void renderExecutionContext;
const renderInput = withRenderExecutionContext(pptx(), renderExecutionContext);
void renderInput;

const mediaOriginProps = mediaSourceOrigins({ src: mediaOrigin, poster: mediaOrigin });
mediaOriginProps satisfies object;
void mediaOriginProps;

const patchPart = {
  packagePartId: "pptx:slide:example",
  path: "ppt/slides/slide1.xml",
  patchableKind: "xml",
  reservedCapacity: 65536,
  logicalByteLength: 1024,
  storedByteLength: 66589,
  fingerprint: "fnv1a32:11111111",
  buildStatus: "rebuilt",
} satisfies RenderPatchPlanPart;

const patchPlan = {
  kind: RENDER_PATCH_PLAN_KIND,
  version: PATCH_MANIFEST_VERSION,
  manifestPath: PATCH_MANIFEST_PATH,
  hmrInvalidation,
  parts: [patchPart],
} satisfies RenderPatchPlan;
void patchPlan;

const patchManifestKind = PATCH_MANIFEST_KIND satisfies "deckjsx.patchManifest";
void patchManifestKind;

type IntegrationAssertions = {
  readonly renderExecutionCarriesHmrInvalidation: Assert<
    IsAssignable<HmrInvalidation, NonNullable<RenderExecutionContext["hmrInvalidation"]>>
  >;
  readonly extensionCarriesIntegrationContext: Assert<
    IsAssignable<DeckIntegrationContext, NonNullable<DeckPlugin["integration"]>>
  >;
  readonly patchPlanReexported: Assert<
    IsAssignable<RenderPatchPlanPart, RenderPatchPlan["parts"][number]>
  >;
};

declare const integrationAssertions: IntegrationAssertions;
void integrationAssertions;

import type { RenderResult } from "deckjsx";
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
  AuthoringMetadata,
  ComponentProvenance,
  AfterProjectLifecycleContext,
  DeckIntegrationContext,
  DeckPluginHooks,
  DeckPlugin,
  PluginHookResult,
  IntegrationContextId,
  MediaSourceOrigin,
  RenderExecutionContext,
  RenderPatchPlan,
  RenderPatchPlanPart,
  SourceInvalidation,
  ArtifactWriteRecord,
  ArtifactWriteToken,
  IncrementalArtifactInspection,
  IncrementalArtifactCycleResult,
  IncrementalArtifactSession,
  IncrementalArtifactSessionSnapshot,
  IncrementalArtifactWriteRecord,
} from "deckjsx/integration";
import {
  authoringMetadata,
  createIncrementalArtifactSession,
  integrationContextId,
  mediaSourceOrigins,
  PATCH_MANIFEST_KIND,
  PATCH_MANIFEST_PATH,
  PATCH_MANIFEST_VERSION,
  RENDER_PATCH_PLAN_KIND,
  getArtifactWriteToken,
  recordArtifactWrite,
  runIncrementalArtifactCycle,
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

const renderExecutionContext = {
  plugins: [lifecyclePlugin],
  integration: integrationContext,
  sourceInvalidation,
} satisfies RenderExecutionContext;
void renderExecutionContext;
const renderInput = withRenderExecutionContext(pptx(), renderExecutionContext);
void renderInput;

const incrementalSession = createIncrementalArtifactSession();
incrementalSession satisfies IncrementalArtifactSession;
// @ts-expect-error Incremental Artifact Session must not expose private Pipeline Artifacts.
incrementalSession.slotArtifacts(0);
const incrementalSnapshot = incrementalSession.snapshot();
incrementalSnapshot satisfies IncrementalArtifactSessionSnapshot;
// @ts-expect-error Retained Pipeline Artifact collections stay behind inspectArtifacts().
void incrementalSnapshot.artifactSlots;
const incrementalInspection = incrementalSession.inspectArtifacts();
incrementalInspection satisfies IncrementalArtifactInspection;
incrementalInspection.retainedSlots() satisfies readonly number[];
incrementalInspection.graphNode("node-id");
incrementalInspection.firstProjection();
const cyclePromise = runIncrementalArtifactCycle(
  incrementalSession,
  { sourceInvalidation, renderExecutionContext },
  () => {
    const token = undefined satisfies ArtifactWriteToken | undefined;
    const writeRecord = {
      path: "/project/output.pptx",
      result: { status: "created" },
    } satisfies ArtifactWriteRecord<{ readonly status: "created" }>;
    const recorded = recordArtifactWrite(token, writeRecord);
    recorded satisfies IncrementalArtifactWriteRecord<{ readonly status: "created" }> | undefined;
    return recorded;
  },
);
void (cyclePromise satisfies Promise<
  IncrementalArtifactWriteRecord<{ readonly status: "created" }> | undefined
>);
declare const renderResult: RenderResult;
const artifactWriteToken = getArtifactWriteToken(renderResult);
artifactWriteToken satisfies ArtifactWriteToken | undefined;
declare const cycleResult: IncrementalArtifactCycleResult;
cycleResult.renderCount satisfies number;

const mediaOriginProps = mediaSourceOrigins({ src: mediaOrigin, poster: mediaOrigin });
mediaOriginProps satisfies object;
void mediaOriginProps;

const componentProvenance = {
  stack: [
    {
      name: "MetricCard",
      moduleId: "/project/src/components/MetricCard.tsx",
      sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
      key: "metric-card",
    },
  ],
} satisfies ComponentProvenance;
void componentProvenance;

const authoredMetadata = {
  mediaSourceOrigins: { src: mediaOrigin },
  componentProvenance,
} satisfies AuthoringMetadata;
void authoredMetadata;
authoringMetadata(authoredMetadata) satisfies object;

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
  sourceInvalidation,
  parts: [patchPart],
} satisfies RenderPatchPlan;
void patchPlan;

const patchManifestKind = PATCH_MANIFEST_KIND satisfies "deckjsx.patchManifest";
void patchManifestKind;

type IntegrationAssertions = {
  readonly renderExecutionCarriesSourceInvalidation: Assert<
    IsAssignable<SourceInvalidation, NonNullable<RenderExecutionContext["sourceInvalidation"]>>
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

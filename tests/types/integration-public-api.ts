import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderContext,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetSource,
  AssetSourceField,
  IntegrationContext,
  MediaSourceOrigin,
  RenderPatchPlan,
  RenderPatchPlanPart,
} from "deckjsx/integration";
import { mediaSourceOrigins, withIntegrationContext } from "deckjsx/integration";
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
} satisfies AssetProbeResult;
void probe;

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

const integrationContext = {
  assetLoaders: [loader],
  mediaSourceOrigin: mediaOrigin,
  hmrInvalidation: {
    importer: "/project/src/deck.tsx",
    changedModuleIds: ["/project/src/deck.tsx"],
  },
} satisfies IntegrationContext;
void integrationContext;

const mediaOriginProps = mediaSourceOrigins({ src: mediaOrigin, poster: mediaOrigin });
mediaOriginProps satisfies object;
void mediaOriginProps;

const integratedAdapter = withIntegrationContext(pptx(), integrationContext);
integratedAdapter satisfies ReturnType<typeof pptx>;

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
  kind: "deckjsx.renderPatchPlan",
  version: 1,
  manifestPath: "ppt/deckjsx/patch-manifest.json",
  hmrInvalidation: integrationContext.hmrInvalidation,
  parts: [patchPart],
} satisfies RenderPatchPlan;
void patchPlan;

type IntegrationAssertions = {
  readonly contextCarriesLoaders: Assert<
    IsAssignable<readonly AssetLoader[], NonNullable<IntegrationContext["assetLoaders"]>>
  >;
  readonly patchPlanReexported: Assert<
    IsAssignable<RenderPatchPlanPart, RenderPatchPlan["parts"][number]>
  >;
};

declare const integrationAssertions: IntegrationAssertions;
void integrationAssertions;

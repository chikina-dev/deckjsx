import type { DeckPluginInput } from "deckjsx";
import type {
  AuthoringMetadata,
  ComponentProvenance,
  DeckIntegrationContext,
  DeckPlugin,
  MediaSourceOrigin,
  RenderExecutionContext,
  RenderPatchPlan,
  RenderPatchPlanPart,
  SourceInvalidation,
} from "deckjsx/integration";
import {
  authoringMetadata,
  PATCH_MANIFEST_KIND,
  PATCH_MANIFEST_PATH,
  PATCH_MANIFEST_VERSION,
  RENDER_PATCH_PLAN_KIND,
} from "deckjsx/integration";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const mediaOrigin = {
  importer: "/project/src/deck.tsx",
  source: "/project/src/deck.tsx",
} satisfies MediaSourceOrigin;

const sourceInvalidation = {
  changedSourceIds: ["/project/src/deck.tsx"],
} satisfies SourceInvalidation;

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
  readonly rootPluginInputAcceptsIntegrationPlugin: Assert<
    IsAssignable<DeckPlugin, DeckPluginInput>
  >;
  readonly patchPlanReexported: Assert<
    IsAssignable<RenderPatchPlanPart, RenderPatchPlan["parts"][number]>
  >;
};

declare const integrationAssertions: IntegrationAssertions;
void integrationAssertions;

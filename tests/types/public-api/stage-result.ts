import { Deck, StyleSheet } from "deckjsx";
import type { CompileResult, Diagnostics, ProjectResult, RenderResult } from "deckjsx";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const publicStylesheetValue = new StyleSheet({
  classes: {
    body: { target: "p.body", style: { color: "red" } },
  },
});

const typedDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
typedDeck.useStyles(publicStylesheetValue).slide(() => undefined);
const typedGraph = typedDeck.compile().graph!;
typedGraph.documentId satisfies string;
const typedInspect = typedDeck.compile();
typedInspect satisfies CompileResult;
typedInspect.diagnostics satisfies Diagnostics;
void (typedDeck.project() satisfies Promise<ProjectResult>);
void (typedDeck.project({ inspection: "none" }) satisfies Promise<ProjectResult>);
typedDeck.defineProjection({
  format: "pptx",
  size: { widthEmu: 9144000, heightEmu: 5143500 },
  parts: [],
  slides: [],
});
type DefineProjectionInput = Parameters<typeof typedDeck.defineProjection>[0];
declare const defineProjectionInput: DefineProjectionInput;
defineProjectionInput.format satisfies import("deckjsx").ProjectionFormat;
// @ts-expect-error root defineProjection input is a lightweight projection definition, not the detailed PPTX candidate type.
void defineProjectionInput.slides;

type CompileResultWithGraphCase = Extract<CompileResult, { readonly graph: object }>;
type CompileResultWithoutGraphCase = Extract<CompileResult, { readonly graph?: undefined }>;
type CompileResultStageAssertions = {
  withGraph: Assert<
    IsAssignable<
      CompileResultWithGraphCase["stages"]["compile"]["artifact"],
      "available" | "partial"
    >
  >;
  withoutGraph: Assert<
    IsAssignable<CompileResultWithoutGraphCase["stages"]["compile"]["artifact"], "missing">
  >;
};
declare const compileResultStageAssertions: CompileResultStageAssertions;
void compileResultStageAssertions;

declare const compileResultForArtifactNarrowing: CompileResult;
if (compileResultForArtifactNarrowing.graph) {
  compileResultForArtifactNarrowing.graph.documentId satisfies string;
  compileResultForArtifactNarrowing.resolvedStyles satisfies object;
} else {
  compileResultForArtifactNarrowing.graph satisfies undefined;
}

type ProjectResultWithProjectionCase = Extract<
  ProjectResult,
  { readonly projection: { readonly format: import("deckjsx").ProjectionFormat } }
>;
type ProjectResultWithoutProjectionCase = Extract<
  ProjectResult,
  { readonly projection?: undefined }
>;
type ProjectResultStageAssertions = {
  withProjection: Assert<
    IsAssignable<
      ProjectResultWithProjectionCase["stages"]["project"]["artifact"],
      "available" | "partial"
    >
  >;
  withoutProjection: Assert<
    IsAssignable<ProjectResultWithoutProjectionCase["stages"]["project"]["artifact"], "missing">
  >;
};
declare const projectResultStageAssertions: ProjectResultStageAssertions;
void projectResultStageAssertions;

declare const projectResultForArtifactNarrowing: ProjectResult;
if (projectResultForArtifactNarrowing.projection) {
  projectResultForArtifactNarrowing.projection.format satisfies import("deckjsx").ProjectionFormat;
  // @ts-expect-error root ProjectResult projection is a lightweight public model, not the detailed PPTX inspection model.
  void projectResultForArtifactNarrowing.projection.slides;
  // @ts-expect-error use deckjsx/inspect or integration hooks for detailed PPTX package typing.
  projectResultForArtifactNarrowing.projection satisfies import("deckjsx/inspect").PptxPackageModel;
  projectResultForArtifactNarrowing.summary?.format satisfies
    | import("deckjsx").ProjectionFormat
    | undefined;
  // @ts-expect-error root ProjectResult summary is a lightweight inspection handle, not detailed PPTX inspection output.
  void projectResultForArtifactNarrowing.summary?.slides;
} else {
  projectResultForArtifactNarrowing.projection satisfies undefined;
  projectResultForArtifactNarrowing.summary satisfies undefined;
}

type RenderResultWithArtifactCase = Extract<RenderResult, { readonly artifact: object }>;
type RenderResultWithoutArtifactCase = Extract<RenderResult, { readonly artifact?: undefined }>;
type RenderResultStageAssertions = {
  withArtifact: Assert<
    IsAssignable<
      RenderResultWithArtifactCase["stages"]["render"]["artifact"],
      "available" | "partial"
    >
  >;
  withoutArtifact: Assert<
    IsAssignable<RenderResultWithoutArtifactCase["stages"]["render"]["artifact"], "missing">
  >;
};
declare const renderResultStageAssertions: RenderResultStageAssertions;
void renderResultStageAssertions;

declare const renderResultForArtifactNarrowing: RenderResult;
if (renderResultForArtifactNarrowing.artifact) {
  renderResultForArtifactNarrowing.artifact.bytes satisfies Uint8Array;
  renderResultForArtifactNarrowing.artifact.format satisfies import("deckjsx").OutputFormat;
  renderResultForArtifactNarrowing.patchPlan satisfies RenderResult["patchPlan"];
} else {
  renderResultForArtifactNarrowing.artifact satisfies undefined;
  renderResultForArtifactNarrowing.patchPlan satisfies undefined;
}

type RootRenderSummary = NonNullable<
  Extract<RenderResult, { readonly summary?: object }>["summary"]
>;
type RootAssemblyPlanSummary = NonNullable<RootRenderSummary["assembly"]>;
type RootAssemblyPlanEntrySummary = RootAssemblyPlanSummary["entries"][number];
type RootAssemblyBuildSummary = NonNullable<RootAssemblyPlanEntrySummary["build"]>;
type RootAssemblyReasonDetails = NonNullable<RootAssemblyPlanEntrySummary["reasonDetails"]>;

const assemblyBuildSummary = {
  partFingerprint: "fnv1a32:00000000",
  writerFingerprint: "deckjsx:pptx-writer:0.8-bootstrap",
  emitterFingerprint: "deckjsx:pptx-emitter:slide:0.8-chunk-paint",
  dependencyFingerprintCount: 1,
  dependencyFingerprints: [
    { packagePartId: "pptx:theme:default", fingerprint: "fnv1a32:22222222" },
  ],
  mediaByteFingerprint: "fnv1a32:11111111",
  mediaByteFingerprintSource: "byteHash",
  diagnosticCodes: [],
} satisfies RootAssemblyBuildSummary;
void assemblyBuildSummary;

const assemblyEntrySummary = {
  path: "ppt/slides/slide1.xml",
  packagePartId: "pptx:slide:one",
  requirement: "required",
  required: true,
  requirementReason: "slide is part of the presentation",
  status: "reused",
  reason: "buildArtifactFingerprintMatched",
  reasonDetails: { kind: "buildArtifactFingerprintMatched", matchedBuild: assemblyBuildSummary },
  expected: {
    path: "ppt/slides/slide1.xml",
    packagePartId: "pptx:slide:one",
    requirement: "required",
    required: true,
    requirementReason: "slide is part of the presentation",
  },
  final: {
    status: "reused",
    reason: "buildArtifactFingerprintMatched",
    reasonDetails: { kind: "buildArtifactFingerprintMatched", matchedBuild: assemblyBuildSummary },
  },
  build: assemblyBuildSummary,
  previousBuild: assemblyBuildSummary,
} satisfies RootAssemblyPlanEntrySummary;
void assemblyEntrySummary;

const assemblyReasonDetails = {
  kind: "partFingerprintChanged",
  partFingerprint: { previous: "fnv1a32:00000000", current: "fnv1a32:11111111" },
} satisfies RootAssemblyReasonDetails;
void assemblyReasonDetails;

const assemblySummaryPublicShapeAssertions = {
  entryDoesNotExposeBuildArtifact: true,
  entryDoesNotExposeZipEntry: true,
  entryDoesNotExposeCompression: true,
  entryDoesNotExposeXml: true,
  buildDoesNotExposeBytes: true,
  buildDoesNotExposeZipCompressionOptions: true,
  buildDoesNotExposeSerializedXml: true,
} satisfies {
  entryDoesNotExposeBuildArtifact: Assert<
    "buildArtifact" extends keyof RootAssemblyPlanEntrySummary ? false : true
  >;
  entryDoesNotExposeZipEntry: Assert<
    "zipEntry" extends keyof RootAssemblyPlanEntrySummary ? false : true
  >;
  entryDoesNotExposeCompression: Assert<
    "compression" extends keyof RootAssemblyPlanEntrySummary ? false : true
  >;
  entryDoesNotExposeXml: Assert<"xml" extends keyof RootAssemblyPlanEntrySummary ? false : true>;
  buildDoesNotExposeBytes: Assert<"bytes" extends keyof RootAssemblyBuildSummary ? false : true>;
  buildDoesNotExposeZipCompressionOptions: Assert<
    "compressionOptions" extends keyof RootAssemblyBuildSummary ? false : true
  >;
  buildDoesNotExposeSerializedXml: Assert<
    "serializedXml" extends keyof RootAssemblyBuildSummary ? false : true
  >;
};
void assemblySummaryPublicShapeAssertions;

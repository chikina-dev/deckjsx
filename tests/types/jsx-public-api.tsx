import { StyleSheet, Theme } from "deckjsx";
import { jsx } from "deckjsx/jsx-runtime";
import type {
  CssAlignContent,
  CssGridTemplate,
  CssGridTemplateAreas,
  ClassNameValue,
  CompileResult,
  ProjectResult,
  ProjectOptions,
  InspectionDetailLevel,
  DeckJsxIntrinsicElements,
  Diagnostics,
  RenderAssemblyBuildSummary,
  RenderAssemblyPlanEntrySummary,
  RenderAssemblyReasonDetails,
  RenderResult,
  AssetLoader,
  JsxKey,
  Spacing,
  TextRunStyle,
  TextTabStopAuthoring,
  ThemeInput,
  ViewStyle,
} from "deckjsx";
import { Deck } from "deckjsx";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

type RootPrivateLeakAssertions = {
  // @ts-expect-error capitalized intermediate authoring components are not root authoring API.
  Image: typeof import("deckjsx").Image;
  // @ts-expect-error capitalized intermediate authoring components are not root authoring API.
  Shape: typeof import("deckjsx").Shape;
  // @ts-expect-error capitalized intermediate authoring components are not root authoring API.
  Slide: typeof import("deckjsx").Slide;
  // @ts-expect-error capitalized intermediate authoring components are not root authoring API.
  Text: typeof import("deckjsx").Text;
  // @ts-expect-error capitalized intermediate authoring components are not root authoring API.
  View: typeof import("deckjsx").View;
  // @ts-expect-error JSX implementation helper is exposed through jsx-runtime, not root.
  createElement: typeof import("deckjsx").createElement;
  // @ts-expect-error JSX Fragment is exposed through jsx-runtime, not root.
  Fragment: typeof import("deckjsx").Fragment;
  // @ts-expect-error intermediate component props are not root authoring API.
  ImageProps: import("deckjsx").ImageProps;
  // @ts-expect-error intermediate component props are not root authoring API.
  ShapeProps: import("deckjsx").ShapeProps;
  // @ts-expect-error intermediate component props are not root authoring API.
  TextProps: import("deckjsx").TextProps;
  // @ts-expect-error intermediate component props are not root authoring API.
  ViewProps: import("deckjsx").ViewProps;
  // @ts-expect-error internal AuthorNode is not root authoring API.
  AuthorNode: import("deckjsx").AuthorNode;
  // @ts-expect-error internal AuthorTreeNode is not root authoring API.
  AuthorTreeNode: import("deckjsx").AuthorTreeNode;
  // @ts-expect-error internal AuthorElementNode is not root authoring API.
  AuthorElementNode: import("deckjsx").AuthorElementNode;
  // @ts-expect-error the historical pptxgenjs adapter is not root authoring API.
  pptxgenjs: typeof import("deckjsx").pptxgenjs;
  // @ts-expect-error detailed PPTX package model types belong to deckjsx/inspect.
  pptxPackageModel: import("deckjsx").PptxPackageModel;
  // @ts-expect-error detailed PPTX package part inspection belongs to deckjsx/inspect.
  pptxPackagePart: import("deckjsx").PptxPackagePart;
  // @ts-expect-error detailed PPTX drawing nodes belong to deckjsx/inspect.
  pptxDrawingNode: import("deckjsx").PptxDrawingNode;
  // @ts-expect-error detailed PPTX relationships belong to deckjsx/inspect.
  pptxRelationship: import("deckjsx").PptxRelationship;
  // @ts-expect-error PPTX theme payload inspection belongs to deckjsx/inspect.
  themePayload: import("deckjsx").PptxThemePartPayload;
  // @ts-expect-error serialized PPTX identity details belong to deckjsx/inspect.
  serializedIdentities: import("deckjsx").PptxSerializedIdentities;
  // @ts-expect-error generated stroke layer inspection belongs to deckjsx/inspect.
  generatedStrokeLayer: import("deckjsx").PptxGeneratedStrokeLayer;
  // @ts-expect-error unsupported semantic projection records belong to deckjsx/inspect.
  unsupportedSemantic: import("deckjsx").PptxUnsupportedSemantic;
  // @ts-expect-error direct writer XML helpers must not leak through root authoring.
  xmlWriter: import("deckjsx").XmlChunkWriter;
  // @ts-expect-error PPTX package build artifacts are render internals, not authoring vocabulary.
  buildArtifact: import("deckjsx").PptxPackageBuildArtifact;
  // @ts-expect-error PPTX media payload inspection belongs to deckjsx/inspect.
  mediaPayload: import("deckjsx").PptxMediaPartPayload;
  // @ts-expect-error PPTX package dependency inspection belongs to deckjsx/inspect.
  packageDependencySummary: import("deckjsx").ProjectInspectionPackageDependencySummary;
  // @ts-expect-error derived projection inspection views belong to deckjsx/inspect.
  projectInspectionDetails: import("deckjsx").ProjectInspectionDetails;
  // @ts-expect-error detailed package dependency invalidation view belongs to deckjsx/inspect.
  packageDependencyInvalidation: import("deckjsx").ProjectInspectionPackageDependencyInvalidation;
  // @ts-expect-error detailed paint fallback aggregation view belongs to deckjsx/inspect.
  paintFallbackAggregation: import("deckjsx").ProjectInspectionPaintFallbackAggregation;
  // @ts-expect-error detailed theme projection view belongs to deckjsx/inspect.
  themeProjections: import("deckjsx").ProjectInspectionThemeProjection;
  // @ts-expect-error direct-writer implementation modules are not root public subpaths.
  writerSubpath: import("deckjsx/writers/pptx");
  // @ts-expect-error projection implementation modules are not root public subpaths.
  projectionSubpath: import("deckjsx/projection/pptx");
  // @ts-expect-error runtime implementation modules are not root public subpaths.
  runtimeOutputSubpath: import("deckjsx/runtime/node-output");
};
declare const rootPrivateLeakAssertions: RootPrivateLeakAssertions;
void rootPrivateLeakAssertions;

const regressionTypeAssertions = {
  supportedSpan: true,
  spanRejectsBoxStyle: true,
  imgRequiresSourceOrData: true,
  imgRejectsChildren: true,
} satisfies {
  supportedSpan: Assert<IsAssignable<"span", keyof DeckJsxIntrinsicElements>>;
  spanRejectsBoxStyle: Assert<
    IsAssignable<{ backgroundColor: "red" }, DeckJsxIntrinsicElements["span"]> extends true
      ? false
      : true
  >;
  imgRequiresSourceOrData: Assert<
    IsAssignable<{}, DeckJsxIntrinsicElements["img"]> extends true ? false : true
  >;
  imgRejectsChildren: Assert<
    IsAssignable<
      { src: "image.png"; children: "caption" },
      DeckJsxIntrinsicElements["img"]
    > extends true
      ? false
      : true
  >;
};
void regressionTypeAssertions;

const runtime = jsx("p", { children: "Runtime text" });
runtime satisfies import("deckjsx").DeckJsxElement;

const runtimeKey = 1n satisfies JsxKey;
const runtimeKeyed = jsx("p", { children: runtime }, runtimeKey);
runtimeKeyed satisfies import("deckjsx").DeckJsxElement;

const readonlySpacing = [1, "2pt", "3px", "4%"] as const;
readonlySpacing satisfies Spacing;

const readonlyGridColumns = ["1fr", "2in", "minmax(1in)"] as const;
readonlyGridColumns satisfies CssGridTemplate;

const readonlyAreas = ['"header header"', '"main side"'] as const;
readonlyAreas satisfies CssGridTemplateAreas;

const readonlyTabStops = [{ position: "1in", alignment: "right" }] as const;
readonlyTabStops satisfies readonly TextTabStopAuthoring[];

const clsxLikeClassName = [
  "card selected",
  false,
  null,
  undefined,
  ["nested", { active: true, disabled: false, muted: null }],
] as const satisfies ClassNameValue;
void clsxLikeClassName;

const exportedStyleTypes = {
  alignContent: "space-between",
  padding: readonlySpacing,
  gridTemplateColumns: readonlyGridColumns,
  gridTemplateAreas: readonlyAreas,
  filter: "blur(2px)",
  mixBlendMode: "multiply",
  isolation: "isolate",
} satisfies ViewStyle & { alignContent?: CssAlignContent };
void exportedStyleTypes;

const inspectionDetail = "details" satisfies InspectionDetailLevel;
void inspectionDetail;

const projectOptions = { inspection: "details" } satisfies ProjectOptions;
void projectOptions;

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
} satisfies RenderAssemblyBuildSummary;
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
} satisfies RenderAssemblyPlanEntrySummary;
void assemblyEntrySummary;

const assemblyReasonDetails = {
  kind: "partFingerprintChanged",
  partFingerprint: { previous: "fnv1a32:00000000", current: "fnv1a32:11111111" },
} satisfies RenderAssemblyReasonDetails;
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
    "buildArtifact" extends keyof RenderAssemblyPlanEntrySummary ? false : true
  >;
  entryDoesNotExposeZipEntry: Assert<
    "zipEntry" extends keyof RenderAssemblyPlanEntrySummary ? false : true
  >;
  entryDoesNotExposeCompression: Assert<
    "compression" extends keyof RenderAssemblyPlanEntrySummary ? false : true
  >;
  entryDoesNotExposeXml: Assert<"xml" extends keyof RenderAssemblyPlanEntrySummary ? false : true>;
  buildDoesNotExposeBytes: Assert<"bytes" extends keyof RenderAssemblyBuildSummary ? false : true>;
  buildDoesNotExposeZipCompressionOptions: Assert<
    "compressionOptions" extends keyof RenderAssemblyBuildSummary ? false : true
  >;
  buildDoesNotExposeSerializedXml: Assert<
    "serializedXml" extends keyof RenderAssemblyBuildSummary ? false : true
  >;
};
void assemblySummaryPublicShapeAssertions;

const textRunStyle = {
  color: "red",
  fontSize: 18,
  href: "https://example.com",
} satisfies TextRunStyle;
void textRunStyle;

const reportStyles = new StyleSheet({
  classes: {
    card: { target: "div.card", style: { backgroundColor: "#fff", padding: 0.2 } },
    title: { target: ["p.title", "h1.title"], style: { color: "navy", fontSize: 28 } },
    accent: textRunStyle,
  },
});
reportStyles satisfies StyleSheet;

new StyleSheet({
  classes: {
    // @ts-expect-error StyleSheet rejects unknown style keys.
    broken: { unknownStyleKey: true },
  },
});

new StyleSheet({
  classes: {
    // @ts-expect-error span-targeted styles use TextRunStyle and reject frame keys.
    accent: { target: "span.accent", style: { x: 1 } },
  },
});

new StyleSheet({
  classes: {
    // @ts-expect-error img-targeted styles use ImageStyle and reject text keys.
    logo: { target: "img.logo", style: { fontSize: 18 } },
  },
});

new StyleSheet({
  classes: { unknownElement: { target: "button.unknownElement", style: { color: "red" } } },
});

const reportTheme = new Theme({
  colors: { text: "#111111", accent: "#2563eb" },
  defaults: {
    p: { fontSize: 18, color: "#111111" },
    div: { padding: 0.2 },
    span: { color: "#2563eb" },
    img: { objectFit: "contain" },
  },
});
reportTheme.colors.text satisfies "#111111";

const extendedTheme = reportTheme.extend({
  colors: { accent: "#dc2626" },
  defaults: { p: { color: "#0f172a" } },
});
extendedTheme.colors.accent satisfies "#dc2626";

const themedStyles = extendedTheme.defineStyles((theme) => ({
  classes: { title: { color: theme.colors.accent } },
}));
themedStyles satisfies StyleSheet;

const rawThemeInput = { defaults: { p: { fontSize: 18 } } } satisfies ThemeInput;
void rawThemeInput;

// @ts-expect-error Theme defaults are authored tag keyed.
new Theme({
  defaults: {
    article: { fontSize: 18 },
  },
});

// @ts-expect-error span defaults use TextRunStyle and reject box positioning.
new Theme({ defaults: { span: { x: 1 } } });

void (
  <>
    <div className={clsxLikeClassName} style={{ x: 1, y: 1, width: 4, height: 2 }}>
      <p className={{ title: true }}>Hello</p>
      <p style={{ tabStops: readonlyTabStops }}>Tabs</p>
      <img src="image.png" className="image" />
      <shape shape="rect" className={["shape", { active: true }]} />
    </div>
  </>
);

void (
  <p
    // @ts-expect-error className does not accept numeric class tokens.
    className={1}
  >
    Bad class
  </p>
);

void (
  <div
    // @ts-expect-error className object maps accept boolean, null, or undefined values only.
    className={{ selected: 1 }}
  />
);

void (
  <p>
    <span style={{ color: "red" }}>Inline</span>
  </p>
);

void (
  <>
    <div style={{ x: 1, y: 1, width: 6, height: 3 }}>
      <p style={{ x: "10%", y: "20%", width: "50%", height: "25%" }}>percent child</p>
      {[
        <div style={{ x: 0.5, y: 0.5, width: 2, height: 1 }}>
          <shape shape="rect" />
        </div>,
        <p>array child</p>,
      ]}
    </div>
  </>
);

void (
  <div>
    <>
      <p>Inside fragment</p>
      <shape shape="ellipse" />
    </>
  </div>
);

const keyedItems = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
] as const;

function KeyedLabel(props: { label: string }) {
  return <p>{props.label}</p>;
}

void (
  <div>
    {keyedItems.map((item, index) => (
      <div key={item.id} style={{ x: index, y: 1, width: 2, height: 1 }}>
        <KeyedLabel key={index} label={item.label} />
      </div>
    ))}
    <shape key={1n} shape="rect" />
  </div>
);

void (<p>{["a", 1, false, null, undefined]}</p>);

void (
  <div style={{ x: 1, y: 1, width: 4, height: 2 }}>
    Raw text
    <p style={{ fontSize: 18 }}>Paragraph</p>
    <img src="image.png" />
  </div>
);

void (
  <main style={{ x: 0, y: 0, width: 10, height: 5 }}>
    <header>
      <h1>Title</h1>
    </header>
    <section>
      <h2>Section</h2>
      <p>Body</p>
      <figure>
        <img src="chart.png" />
      </figure>
    </section>
    <aside>Note</aside>
    <nav>Navigation</nav>
    <footer>Footer</footer>
  </main>
);

void (<img data="data:image/png;base64,AAAA" />);

const pptxOutput = { output: "deck.pptx" };
void pptxOutput;

const typedDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
typedDeck.useStyles(reportStyles).slide(() => <></>);
const typedGraph = typedDeck.compile().graph!;
typedGraph.documentId satisfies string;
const typedInspect = typedDeck.compile();
typedInspect satisfies CompileResult;
typedInspect.diagnostics satisfies Diagnostics;
const assetLoader = {
  async probe({ source }) {
    if (source.kind === "path") {
      return { mediaType: "image/png", width: 100, height: 100 };
    }
    return undefined;
  },
} satisfies AssetLoader;
typedDeck.useAssets(assetLoader).slide(() => <></>);
void (typedDeck.project() satisfies Promise<ProjectResult>);
void (typedDeck.project({ inspection: "none" }) satisfies Promise<ProjectResult>);

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
  { readonly projection: import("deckjsx/inspect").PptxPackageModel }
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
  projectResultForArtifactNarrowing.projection satisfies import("deckjsx/inspect").PptxPackageModel;
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
} else {
  renderResultForArtifactNarrowing.artifact satisfies undefined;
  renderResultForArtifactNarrowing.output satisfies undefined;
}

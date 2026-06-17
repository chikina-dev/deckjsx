import { StyleSheet, Theme } from "deckjsx";
import { jsx } from "deckjsx/jsx-runtime";
import type {
  CssAlignContent,
  CssGridTemplate,
  CssGridTemplateAreas,
  CssLetterSpacing,
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

const regressionTypeAssertions = {
  supportedSpan: true,
  supportedTable: true,
  supportedTableCellSpanProps: true,
  captionIsNotIntrinsic: true,
  colgroupIsNotIntrinsic: true,
  colIsNotIntrinsic: true,
  spanRejectsBoxStyle: true,
  imgRequiresSourceOrData: true,
  imgRejectsChildren: true,
} satisfies {
  supportedSpan: Assert<IsAssignable<"span", keyof DeckJsxIntrinsicElements>>;
  supportedTable: Assert<IsAssignable<"table", keyof DeckJsxIntrinsicElements>>;
  supportedTableCellSpanProps: Assert<
    IsAssignable<{ colspan: 2; rowspan: 2 }, DeckJsxIntrinsicElements["td"]>
  >;
  captionIsNotIntrinsic: Assert<
    IsAssignable<"caption", keyof DeckJsxIntrinsicElements> extends true ? false : true
  >;
  colgroupIsNotIntrinsic: Assert<
    IsAssignable<"colgroup", keyof DeckJsxIntrinsicElements> extends true ? false : true
  >;
  colIsNotIntrinsic: Assert<
    IsAssignable<"col", keyof DeckJsxIntrinsicElements> extends true ? false : true
  >;
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

const cssLetterSpacing = "0.1em" satisfies CssLetterSpacing;
const normalLetterSpacing = "normal" satisfies CssLetterSpacing;
void cssLetterSpacing;
void normalLetterSpacing;

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
    <p
      style={{
        fontSize: 18,
        letterSpacing: "0.1em",
        paragraphSpacingBefore: "12px",
        paragraphSpacingAfter: "0.25in",
      }}
    >
      Paragraph
    </p>
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
void (<video data="data:video/mp4;base64,AAAA" poster="poster.png" />);
// @ts-expect-error deckjsx video does not expose browser playback props yet.
void (<video src="clip.mp4" controls />);

const typedDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
typedDeck.useStyles(reportStyles).slide(() => <></>);
const typedGraph = typedDeck.compile().graph!;
typedGraph.documentId satisfies string;
const typedInspect = typedDeck.compile();
typedInspect satisfies CompileResult;
typedInspect.diagnostics satisfies Diagnostics;
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
  renderResultForArtifactNarrowing.patchPlan satisfies
    | import("deckjsx").RenderPatchPlan
    | undefined;
} else {
  renderResultForArtifactNarrowing.artifact satisfies undefined;
  renderResultForArtifactNarrowing.patchPlan satisfies undefined;
}

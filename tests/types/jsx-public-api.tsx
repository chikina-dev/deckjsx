import { Fragment, Image, Shape, Slide, Text, View } from "../../src/index.ts";
import { jsx } from "../../src/jsx-runtime.ts";
import type {
  CssAlignContent,
  CssGridTemplate,
  CssGridTemplateAreas,
  ClassNameValue,
  DeckJsxIntrinsicElements,
  Diagnostics,
  GraphNodeId,
  ImplementedBackendName,
  JsxKey,
  OutputConfig,
  Spacing,
  StyleClassRef,
  StyleEntity,
  TextTabStopAuthoring,
  ViewStyle,
} from "../../src/index.ts";
import { Deck } from "../../src/index.ts";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const regressionTypeAssertions = {
  supportedSpan: true,
  imgRequiresSourceOrData: true,
  imgRejectsChildren: true,
  ooxmlBackendIsNotImplemented: true,
} satisfies {
  supportedSpan: Assert<IsAssignable<"span", keyof DeckJsxIntrinsicElements>>;
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
  ooxmlBackendIsNotImplemented: Assert<
    IsAssignable<"ooxml", ImplementedBackendName> extends true ? false : true
  >;
};
void regressionTypeAssertions;

const runtimeSlide = jsx(Slide, { name: "Runtime slide" }, "slide-key");
runtimeSlide.kind satisfies "element";

const runtimeText = jsx(Text, { children: "Runtime text" });
runtimeText.kind satisfies "element";

const runtimeKey = 1n satisfies JsxKey;
const runtimeKeyedView = jsx(View, { children: runtimeText }, runtimeKey);
runtimeKeyedView.kind satisfies "element";

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

const styleClassRef = { name: "card", index: 0 } satisfies StyleClassRef;
const styleEntityWithClassRefs = {
  id: "style/test" as StyleEntity["id"],
  target: "container",
  authored: { classRefs: [styleClassRef] },
} satisfies StyleEntity;
void styleEntityWithClassRefs;

const styleEntityWithResolved = {
  id: "style/resolved" as StyleEntity["id"],
  target: "text",
  authored: {},
  // @ts-expect-error StyleEntity does not carry resolved concrete style values.
  resolved: {},
} satisfies StyleEntity;
void styleEntityWithResolved;

const exportedStyleTypes = {
  alignContent: "space-between",
  padding: readonlySpacing,
  gridTemplateColumns: readonlyGridColumns,
  gridTemplateAreas: readonlyAreas,
} satisfies ViewStyle & { alignContent?: CssAlignContent };
void exportedStyleTypes;

void (
  <Slide name="Valid slide">
    <View className={clsxLikeClassName} style={{ x: 1, y: 1, width: 4, height: 2 }}>
      <Text className={{ title: true }}>Hello</Text>
      <Text tabStops={readonlyTabStops}>Tabs</Text>
      <Image src="image.png" className="image" />
      <Shape shape="rect" className={["shape", { active: true }]} />
    </View>
  </Slide>
);

void (
  <Text
    // @ts-expect-error className does not accept numeric class tokens.
    className={1}
  >
    Bad class
  </Text>
);

void (
  <View
    // @ts-expect-error className object maps accept boolean, null, or undefined values only.
    className={{ selected: 1 }}
  />
);

void (
  <Slide name="Recursive child probe">
    <View style={{ x: 1, y: 1, width: 6, height: 3 }}>
      <Text style={{ x: "10%", y: "20%", width: "50%", height: "25%" }}>percent child</Text>
      {[
        <View style={{ x: 0.5, y: 0.5, width: 2, height: 1 }}>
          <Shape shape="rect" />
        </View>,
        <Text>array child</Text>,
      ]}
    </View>
  </Slide>
);

void (
  <View>
    <Fragment>
      <Text>Inside fragment</Text>
      <Shape shape="ellipse" />
    </Fragment>
  </View>
);

const keyedItems = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
] as const;

function KeyedLabel(props: { label: string }) {
  return <Text>{props.label}</Text>;
}

void (
  <View>
    {keyedItems.map((item, index) => (
      <View key={item.id} style={{ x: index, y: 1, width: 2, height: 1 }}>
        <KeyedLabel key={index} label={item.label} />
      </View>
    ))}
    <Shape key={1n} shape="rect" />
  </View>
);

void (<Text>{["a", 1, false, null, undefined]}</Text>);

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

const pptxOutput = {
  backend: "pptxgenjs",
  output: "deck.pptx",
} satisfies OutputConfig;
void pptxOutput;

const typedDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
const typedGraph = typedDeck.compile();
typedGraph.documentId satisfies GraphNodeId;
const typedInspect = typedDeck.compile({ mode: "inspect" });
typedInspect.diagnostics satisfies Diagnostics;

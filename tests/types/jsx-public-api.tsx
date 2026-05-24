import { Fragment, Image, Shape, Slide, Text, View, StyleSheet, Theme } from "deckjsx";
import { jsx } from "deckjsx/jsx-runtime";
import type {
  CssAlignContent,
  CssGridTemplate,
  CssGridTemplateAreas,
  ClassNameValue,
  CompileInspectResult,
  DeckJsxIntrinsicElements,
  Diagnostics,
  ImplementedBackendName,
  JsxKey,
  OutputConfig,
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
  spanRejectsBoxStyle: true,
  imgRequiresSourceOrData: true,
  imgRejectsChildren: true,
  ooxmlBackendIsNotImplemented: true,
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

const exportedStyleTypes = {
  alignContent: "space-between",
  padding: readonlySpacing,
  gridTemplateColumns: readonlyGridColumns,
  gridTemplateAreas: readonlyAreas,
} satisfies ViewStyle & { alignContent?: CssAlignContent };
void exportedStyleTypes;

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
    accent: {
      target: "span.accent",
      style: {
        x: 1,
      },
    },
  },
});

new StyleSheet({
  classes: {
    // @ts-expect-error img-targeted styles use ImageStyle and reject text keys.
    logo: {
      target: "img.logo",
      style: {
        fontSize: 18,
      },
    },
  },
});

new StyleSheet({
  classes: {
    unknownElement: {
      target: "button.unknownElement",
      style: { color: "red" },
    },
  },
});

const reportTheme = new Theme({
  colors: {
    text: "#111111",
    accent: "#2563eb",
  },
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
  classes: {
    title: { color: theme.colors.accent },
  },
}));
themedStyles satisfies StyleSheet;

const rawThemeInput = {
  defaults: { p: { fontSize: 18 } },
} satisfies ThemeInput;
void rawThemeInput;

// @ts-expect-error Theme defaults are authored tag keyed, not component keyed.
new Theme({
  defaults: {
    Text: { fontSize: 18 },
  },
});

// @ts-expect-error span defaults use TextRunStyle and reject box positioning.
new Theme({
  defaults: {
    span: {
      x: 1,
    },
  },
});

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
  <Text>
    <span style={{ color: "red" }}>Inline</span>
  </Text>
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
typedDeck.useStyles(reportStyles).add(() => <Slide />);
const typedGraph = typedDeck.compile();
typedGraph.documentId satisfies string;
const typedInspect = typedDeck.compile({ mode: "inspect" });
typedInspect satisfies CompileInspectResult;
typedInspect.diagnostics satisfies Diagnostics;

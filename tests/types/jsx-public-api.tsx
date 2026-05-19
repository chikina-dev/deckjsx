import { Fragment, Image, Shape, Slide, Text, View, createElement } from "../../src/index.ts";
import { jsx } from "../../src/jsx-runtime.ts";
import type {
  CssAlignContent,
  CssGridTemplate,
  CssGridTemplateAreas,
  JsxKey,
  OutputConfig,
  Spacing,
  TextTabStopAuthoring,
  ViewStyle,
} from "../../src/index.ts";

const directSlide = createElement(Slide, { name: "Direct slide" });
directSlide.kind satisfies "slide";

const directText = createElement(Text, null, "Direct text");
directText.kind satisfies "text";

const runtimeSlide = jsx(Slide, { name: "Runtime slide" }, "slide-key");
runtimeSlide.kind satisfies "slide";

const runtimeKey = 1n satisfies JsxKey;
const runtimeKeyedView = jsx(View, { children: directText }, runtimeKey);
runtimeKeyedView.kind satisfies "view";

const runtimeText = jsx(Text, { children: "Runtime text" });
runtimeText.kind satisfies "text";

const directView = createElement(View, null, directText, false, null);
directView.kind satisfies "view";
// @ts-expect-error Author node children are immutable after JSX runtime creation.
directView.children.push(directText);

const readonlySpacing = [1, "2pt", "3px", "4%"] as const;
readonlySpacing satisfies Spacing;

const readonlyGridColumns = ["1fr", "2in", "minmax(1in)"] as const;
readonlyGridColumns satisfies CssGridTemplate;

const readonlyAreas = ['"header header"', '"main side"'] as const;
readonlyAreas satisfies CssGridTemplateAreas;

const readonlyTabStops = [{ position: "1in", alignment: "right" }] as const;
readonlyTabStops satisfies readonly TextTabStopAuthoring[];

const exportedStyleTypes = {
  alignContent: "space-between",
  padding: readonlySpacing,
  gridTemplateColumns: readonlyGridColumns,
  gridTemplateAreas: readonlyAreas,
} satisfies ViewStyle & { alignContent?: CssAlignContent };
void exportedStyleTypes;

// @ts-expect-error Direct createElement calls preserve leaf children constraints.
createElement(Image, { src: "image.png" }, "caption");

// @ts-expect-error Direct createElement calls preserve Text child constraints.
createElement(Text, null, directView);

// @ts-expect-error Direct jsx calls preserve Text child constraints.
jsx(Text, { children: directView });

// @ts-expect-error Direct jsx calls preserve leaf children constraints.
jsx(Image, { src: "image.png", children: "caption" });

void (
  <Slide name="Valid slide">
    <View style={{ x: 1, y: 1, width: 4, height: 2 }}>
      <Text>Hello</Text>
      <Text tabStops={readonlyTabStops}>Tabs</Text>
      <Image src="image.png" />
      <Shape shape="rect" />
    </View>
  </Slide>
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

// @ts-expect-error View children must be deckjsx component nodes, not raw text.
void (<View>Raw text</View>);

void (
  <Text>
    {/* @ts-expect-error Text children must be text-like values, not structured component nodes. */}
    <View />
  </Text>
);

// @ts-expect-error Image is a leaf node and does not accept children.
void (<Image src="image.png">caption</Image>);

void (
  <Shape shape="rect">
    {/* @ts-expect-error Shape is a leaf node and does not accept children. */}
    <Text>caption</Text>
  </Shape>
);

// @ts-expect-error Intrinsic JSX elements are intentionally unsupported.
void (<div />);

const pptxOutput = {
  backend: "pptxgenjs",
  output: "deck.pptx",
} satisfies OutputConfig;
void pptxOutput;

const ooxmlOutput = {
  // @ts-expect-error OutputConfig accepts only implemented backends.
  backend: "ooxml",
  output: "deck.pptx",
} satisfies OutputConfig;
void ooxmlOutput;

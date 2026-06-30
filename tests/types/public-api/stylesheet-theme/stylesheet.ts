import { Deck, StyleSheet } from "deckjsx";
import { StyleSheet as StyleSubpathSheet } from "deckjsx/style";
import type { StyleClassStyle, StyleSheetInput, StyleSheetValue, TextRunStyle } from "deckjsx";

const textRunStyle = {
  color: "#2563eb",
  fontWeight: 700,
} satisfies TextRunStyle;

const reportStyles = new StyleSheet({
  classes: {
    card: { target: "div.card", style: { backgroundColor: "#fff", padding: 0.2 } },
    title: { target: ["p.title", "h1.title"], style: { color: "navy", fontSize: 28 } },
    accent: { target: "span.accent", style: textRunStyle },
    metrics: { target: "table.metrics", style: { tableLayout: "fixed" } },
    badge: { target: "shape.badge", style: { fill: "#DBEAFE", stroke: "1pt solid #2563EB" } },
  },
});
reportStyles satisfies StyleSheet;

const subpathStylesheet = new StyleSubpathSheet({
  classes: {
    title: { target: "h1.title", style: { fontSize: 28 } },
  },
});
subpathStylesheet satisfies import("deckjsx/style").StyleSheetValue;

const publicStylesheetValue = new StyleSheet({
  classes: {
    body: { target: "p.body", style: { color: "red" } },
  },
});
publicStylesheetValue satisfies StyleSheetValue;

type PublicStyleSheetInput = StyleSheetInput<{
  readonly body: { readonly target: "p.body"; readonly style: { readonly color: "red" } };
}>;
const publicStylesheetInput = {
  classes: {
    body: { target: "p.body", style: { color: "red" } },
  },
} satisfies PublicStyleSheetInput;
void publicStylesheetInput;

// @ts-expect-error StyleSheetInput requires an explicit class map so it does not widen style authoring.
type MissingStyleSheetInputClasses = StyleSheetInput; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleSheet target selector lists must contain at least one selector.
new StyleSheet({
  classes: {
    emptyTargets: { target: [], style: { color: "red" } },
  },
});

const tableClassStyle = {
  // @ts-expect-error StyleClassStyle without a target is not a broad style declaration.
  tableLayout: "fixed",
  // @ts-expect-error StyleClassStyle without a target is not a broad style declaration.
  borderCollapse: "separate",
} satisfies StyleClassStyle;
void tableClassStyle;

// @ts-expect-error styles for multiple targets must be valid for every targeted authored tag.
new StyleSheet({
  classes: {
    mixed: { target: ["p.mixed", "img.mixed"], style: { fontSize: 18 } },
  },
});

// @ts-expect-error StyleSheet rejects unknown style keys.
new StyleSheet({
  classes: {
    broken: { unknownStyleKey: true },
  },
});

// @ts-expect-error span-targeted styles use TextRunStyle and reject positioning keys.
new StyleSheet({
  classes: {
    accent: { target: "span.accent", style: { left: 1 } },
  },
});

// @ts-expect-error valid span style keys must not hide extra positioning keys.
new StyleSheet({
  classes: {
    accent: { target: "span.accent", style: { color: "red", left: 1 } },
  },
});

// @ts-expect-error img-targeted styles use ImageStyle and reject text keys.
new StyleSheet({
  classes: {
    logo: { target: "img.logo", style: { fontSize: 18 } },
  },
});

// @ts-expect-error shape-targeted styles use ShapeStyle and reject text keys.
new StyleSheet({
  classes: {
    badge: { target: "shape.badge", style: { fontSize: 18 } },
  },
});

// @ts-expect-error table-specific style keys only apply to table targets.
new StyleSheet({
  classes: {
    card: { target: "div.card", style: { tableLayout: "fixed" } },
  },
});

// @ts-expect-error StyleSheet targets must name a deckjsx authored tag when declaring style.
new StyleSheet({
  classes: {
    unknownElement: { target: "button.unknownElement", style: { color: "red" } },
  },
});

// @ts-expect-error class-only targets cannot prove the authored tag for a style declaration.
new StyleSheet({
  classes: {
    classOnly: { target: ".classOnly", style: { color: "red" } },
  },
});

new StyleSheet({
  classes: {
    descendant: { target: ".card p.descendant", style: { color: "red" } },
  },
});

new StyleSheet({
  classes: {
    "report/title": { target: "p.report\\/title", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet targets must not contain empty class selectors.
new StyleSheet({
  classes: {
    "report/title": { target: "p.", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet descendant targets must not contain empty class selectors.
new StyleSheet({
  classes: {
    "report/title": { target: ".card p.", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet class-only targets must name a class after the dot.
new StyleSheet({
  classes: {
    "report/title": { target: ".", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet class names must not be empty.
new StyleSheet({
  classes: {
    "": { target: "p.", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet class names must not be whitespace-only.
new StyleSheet({
  classes: {
    "   ": { target: "p.\\ \\ \\ ", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet class names must not contain whitespace.
new StyleSheet({
  classes: {
    "bad class": { target: "p.bad-class", style: { color: "red" } },
  },
});

const literalStyleTarget = "p.literal";
new StyleSheet({
  classes: {
    literal: { target: literalStyleTarget, style: { color: "red" } },
  },
});

const dynamicStyleTarget: string = "p.dynamic";
// @ts-expect-error StyleSheet style declarations require literal targets so the authored tag can be inferred.
new StyleSheet({
  classes: {
    dynamic: { target: dynamicStyleTarget, style: { color: "red" } },
  },
});

// @ts-expect-error ordinary StyleSheet targets must include the class name in the rightmost selector.
new StyleSheet({
  classes: {
    title: { target: "p", style: { color: "red" } },
  },
});

// @ts-expect-error descendant targets must include the class being defined in the rightmost selector.
new StyleSheet({
  classes: {
    lead: { target: "div.lead p.caption", style: { fontSize: 24 } },
  },
});

// @ts-expect-error StyleSheet targets do not support pseudo selectors.
new StyleSheet({
  classes: {
    pseudo: { target: "p.title:hover", style: { color: "red" } },
  },
});

// @ts-expect-error StyleSheet targets use descendant selectors, not child combinators.
new StyleSheet({
  classes: {
    child: { target: "div.card > p.title", style: { color: "red" } },
  },
});

new Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).useStyles(publicStylesheetValue);

new Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).useStyles(
  // @ts-expect-error Deck#useStyles accepts StyleSheet values, not plain class maps.
  {
    classes: {
      body: { target: "p.body", style: { color: "red" } },
    },
  },
);

// @ts-expect-error Deck.useStyles accepts constructed StyleSheet values, not plain class objects.
new Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).useStyles({ classes: {} });

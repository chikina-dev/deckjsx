import type { ShapeStyle, TextStyle, ViewStyle } from "deckjsx";

const invalidShapeEmptyUrlPaint = {
  // Detailed fill url() source grammar is runtime validated.
  fill: 'url("")',
} satisfies ShapeStyle;
void invalidShapeEmptyUrlPaint;

const invalidEmptyHslColorFunction = {
  // Detailed hsl() argument grammar is runtime validated.
  backgroundColor: "hsl()",
} satisfies ViewStyle;
void invalidEmptyHslColorFunction;

const invalidWhitespaceHslaColorFunction = {
  // Detailed hsla() argument grammar is runtime validated.
  fill: "hsla(   )",
} satisfies ShapeStyle;
void invalidWhitespaceHslaColorFunction;

const invalidEmptyLinearGradientFunction = {
  // Detailed gradient argument grammar is runtime validated.
  background: "linear-gradient()",
} satisfies ViewStyle;
void invalidEmptyLinearGradientFunction;

const invalidWhitespaceRadialGradientFunction = {
  // Detailed gradient argument grammar is runtime validated.
  fill: "radial-gradient(   )",
} satisfies ShapeStyle;
void invalidWhitespaceRadialGradientFunction;

const invalidEmptyRepeatingGradientFunction = {
  // Detailed gradient argument grammar is runtime validated.
  background: "repeating-linear-gradient()",
} satisfies ViewStyle;
void invalidEmptyRepeatingGradientFunction;

const shapeStrokeStyleTypes = {
  background: "linear-gradient(90deg, #fff, #000)",
  backgroundColor: "#fff",
  fill: "rgba(37, 99, 235, 0.7)",
  stroke: "1pt dashed rgba(37, 99, 235, 0.75)",
  strokeDasharray: "1 4",
  strokeLinecap: "round",
  strokeLinejoin: "bevel",
  borderRadius: 0.15,
} satisfies ShapeStyle;
void shapeStrokeStyleTypes;

const invalidViewStrokeLineCap = {
  // @ts-expect-error strokeLinecap belongs to shape stroke styling, not box borders.
  strokeLinecap: "round",
} satisfies ViewStyle;
void invalidViewStrokeLineCap;

const invalidTextStrokeLineJoin = {
  // @ts-expect-error strokeLinejoin belongs to shape stroke styling, not text box borders.
  strokeLinejoin: "bevel",
} satisfies TextStyle;
void invalidTextStrokeLineJoin;

const invalidShapeStrokeOpacityAlias = {
  // @ts-expect-error shape stroke opacity is authored with alpha in the stroke paint.
  strokeOpacity: 0.25,
} satisfies ShapeStyle;
void invalidShapeStrokeOpacityAlias;

const invalidShapeStrokeWidthAlias = {
  // @ts-expect-error shape stroke width is authored in the stroke shorthand.
  strokeWidth: "3pt",
} satisfies ShapeStyle;
void invalidShapeStrokeWidthAlias;

const invalidShapeFillTransparencyAlias = {
  // @ts-expect-error shape styles use alpha in fill colors, not the deckjsx fillTransparency alias.
  fillTransparency: 30,
} satisfies ShapeStyle;
void invalidShapeFillTransparencyAlias;

const invalidShapeRadiusAlias = {
  // @ts-expect-error shape styles use CSS-like borderRadius, not the deckjsx radius alias.
  radius: 0.15,
} satisfies ShapeStyle;
void invalidShapeRadiusAlias;

const invalidShapeStrokeStyleTypes = {
  // @ts-expect-error background is closed to CSS colors, gradients, url() sources, and supported background shorthands.
  background: "definitely-not-background",
  // @ts-expect-error shape backgroundColor uses the public CSS color contract.
  backgroundColor: 123,
  // @ts-expect-error fill is closed to CSS colors, gradients, and url() image sources.
  fill: "definitely-not-paint",
  // @ts-expect-error stroke shorthand is closed to supported public border styles.
  stroke: "1pt groove #2563EB",
  // @ts-expect-error strokeDasharray is closed to numeric/length dash tokens.
  strokeDasharray: "4 var(--gap)",
} satisfies ShapeStyle;
void invalidShapeStrokeStyleTypes;

const invalidNegativeStrokeDasharray = {
  strokeDasharray: "-1 4",
} satisfies ShapeStyle;
void invalidNegativeStrokeDasharray;

const invalidLongStrokeDasharray = {
  // @ts-expect-error strokeDasharray accepts one or two public dash tokens.
  strokeDasharray: "1 2 3",
} satisfies ShapeStyle;
void invalidLongStrokeDasharray;

const invalidShapeStrokeColorType = {
  // Detailed stroke shorthand color grammar is runtime validated.
  stroke: "1pt solid definitely-not-a-color",
} satisfies ShapeStyle;
void invalidShapeStrokeColorType;

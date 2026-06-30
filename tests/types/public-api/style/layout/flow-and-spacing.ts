import type {
  CssAspectRatio,
  CssFlexFactor,
  CssInteger,
  Spacing,
  TextStyle,
  ViewStyle,
} from "deckjsx";

const viewFlexDirection = {
  display: "flex",
  flexDirection: "column",
} satisfies ViewStyle;
void viewFlexDirection;
const flexFactor = 2 satisfies CssFlexFactor;
const viewFlexFactors = {
  flexGrow: flexFactor,
  flexShrink: 0,
} satisfies ViewStyle;
void viewFlexFactors;
const cssInteger = -1 satisfies CssInteger;
const viewOrdering = {
  zIndex: cssInteger,
  order: 2,
} satisfies ViewStyle;
void viewOrdering;
const aspectRatioString = "16 / 9" satisfies CssAspectRatio;
const viewAspectRatio = {
  aspectRatio: aspectRatioString,
} satisfies ViewStyle;
void viewAspectRatio;

const invalidNegativeAspectRatio = {
  // @ts-expect-error aspectRatio string values must be positive public CSS ratio tokens.
  aspectRatio: "-1",
} satisfies ViewStyle;
void invalidNegativeAspectRatio;

const invalidZeroAspectRatio = {
  // @ts-expect-error aspectRatio string values must be positive public CSS ratio tokens.
  aspectRatio: "0",
} satisfies ViewStyle;
void invalidZeroAspectRatio;

const invalidZeroRatioAspectRatio = {
  // @ts-expect-error aspectRatio ratio strings require positive width and height tokens.
  aspectRatio: "0 / 1",
} satisfies ViewStyle;
void invalidZeroRatioAspectRatio;

const invalidMalformedAspectRatio = {
  // @ts-expect-error aspectRatio string values must be authored positive numeric tokens.
  aspectRatio: "1banana",
} satisfies ViewStyle;
void invalidMalformedAspectRatio;

const invalidMalformedRatioAspectRatio = {
  // @ts-expect-error aspectRatio ratio parts must be authored positive numeric tokens.
  aspectRatio: "16 / 9banana",
} satisfies ViewStyle;
void invalidMalformedRatioAspectRatio;

const viewRejectsDirectionAxis = {
  // @ts-expect-error view layout uses CSS-like flexDirection, not deckjsx direction axes.
  direction: "vertical",
} satisfies ViewStyle;
void viewRejectsDirectionAxis;

const invalidCssWideLayoutLengthTypes = {
  // @ts-expect-error positioning lengths do not accept CSS-wide reset keywords in public authoring.
  left: "initial",
  // @ts-expect-error positioning lengths do not accept CSS-wide reset keywords in public authoring.
  top: "inherit",
  // @ts-expect-error spacing lengths do not accept CSS-wide reset keywords in public authoring.
  marginTop: "unset",
  // @ts-expect-error signed point lengths do not accept CSS-wide reset keywords in public authoring.
  textIndent: "revert",
} satisfies TextStyle;
void invalidCssWideLayoutLengthTypes;

const readonlySpacing = [1, "2pt", "3px", "4%"] as const;
readonlySpacing satisfies Spacing;

const spacingShorthand = "0 0.25in" satisfies Spacing;
void spacingShorthand;

const nonNegativeSizingValues = {
  width: "1in",
  minHeight: "0.25in",
  padding: "0.1in 0.2in",
  borderWidth: "1pt",
} satisfies ViewStyle;
void nonNegativeSizingValues;

// @ts-expect-error spacing shorthand is closed to CSS-like deck length tokens.
const invalidSpacingShorthand = "0 auto" satisfies Spacing;
void invalidSpacingShorthand;

// @ts-expect-error public spacing strings support one or two length tokens; use a tuple for three or four sides.
const threeTokenSpacingString = "0 0.25in 5%" satisfies Spacing;
void threeTokenSpacingString;

// @ts-expect-error public spacing strings support one or two length tokens; use a tuple for four sides.
const fourTokenSpacingString = "0 0.25in 5% 2px" satisfies Spacing;
void fourTokenSpacingString;

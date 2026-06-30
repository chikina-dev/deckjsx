import type { TextRunStyle, TextStyle } from "deckjsx";

const textDirection = {
  direction: "rtl",
} satisfies TextStyle;
void textDirection;

const textFontStyle = {
  fontStyle: "italic",
} satisfies TextStyle;
void textFontStyle;

const textFontWeight = {
  fontWeight: 700,
} satisfies TextStyle;
void textFontWeight;

const textRunFontWeight = {
  fontWeight: 400,
} satisfies TextRunStyle;
void textRunFontWeight;

const textRejectsZeroFontWeight = {
  // @ts-expect-error fontWeight is closed to normal, bold, or 100-900 hundred-step numeric weights.
  fontWeight: 0,
} satisfies TextStyle;
void textRejectsZeroFontWeight;

const textRejectsOffScaleFontWeight = {
  // @ts-expect-error fontWeight is closed to normal, bold, or 100-900 hundred-step numeric weights.
  fontWeight: 950,
} satisfies TextStyle;
void textRejectsOffScaleFontWeight;

const textRunRejectsFractionalFontWeight = {
  // @ts-expect-error fontWeight numeric authoring values must be supported CSS font-weight steps.
  fontWeight: 700.5,
} satisfies TextRunStyle;
void textRunRejectsFractionalFontWeight;

const textRejectsItalicAlias = {
  // @ts-expect-error text styles use CSS-like fontStyle, not the deckjsx italic alias.
  italic: true,
} satisfies TextStyle;
void textRejectsItalicAlias;

const textRunFontStyle = {
  fontStyle: "italic",
} satisfies TextRunStyle;
void textRunFontStyle;

const textRunRejectsItalicAlias = {
  // @ts-expect-error text run styles use CSS-like fontStyle, not the deckjsx italic alias.
  italic: true,
} satisfies TextRunStyle;
void textRunRejectsItalicAlias;

const textDecorationLine = {
  textDecorationLine: "underline line-through",
} satisfies TextStyle;
void textDecorationLine;

const textLetterSpacing = {
  letterSpacing: 1.5,
} satisfies TextStyle;
void textLetterSpacing;

const textRejectsCharSpacingAlias = {
  // @ts-expect-error text styles use CSS-like letterSpacing, not the deckjsx charSpacing alias.
  charSpacing: 1.5,
} satisfies TextStyle;
void textRejectsCharSpacingAlias;

const textRunLetterSpacing = {
  letterSpacing: 1.5,
} satisfies TextRunStyle;
void textRunLetterSpacing;

const textRunRejectsCharSpacingAlias = {
  // @ts-expect-error text run styles use CSS-like letterSpacing, not the deckjsx charSpacing alias.
  charSpacing: 1.5,
} satisfies TextRunStyle;
void textRunRejectsCharSpacingAlias;

const textLineHeight = {
  lineHeight: 1.4,
} satisfies TextStyle;
void textLineHeight;

const invalidCssWideTypographyLengthTypes = {
  // @ts-expect-error fontSize does not accept CSS-wide reset keywords in public authoring.
  fontSize: "initial",
  // @ts-expect-error lineHeight only accepts normal or authored positive/non-negative point lengths.
  lineHeight: "initial",
  // @ts-expect-error paragraph spacing does not accept CSS-wide reset keywords in public authoring.
  paragraphSpacingBefore: "initial",
  // @ts-expect-error listIndent does not accept CSS-wide reset keywords in public authoring.
  listIndent: "initial",
} satisfies TextStyle;
void invalidCssWideTypographyLengthTypes;

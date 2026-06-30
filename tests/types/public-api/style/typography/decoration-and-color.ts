import type { TextStyle } from "deckjsx";

const textDecorationStyleTypes = {
  textDecoration: "underline line-through",
  textDecorationLine: "underline",
  color: "rgb(15 23 42)",
  fontFamily: "Aptos Display",
  textDecorationColor: "rebeccapurple",
} satisfies TextStyle;
void textDecorationStyleTypes;

const quotedFontFamilyStyleTypes = {
  fontFamily: '"IBM Plex Sans"',
} satisfies TextStyle;
void quotedFontFamilyStyleTypes;

const invalidEmptyQuotedFontFamilyStyleTypes = {
  // Detailed quoted font-family grammar is runtime validated.
  fontFamily: '""',
} satisfies TextStyle;
void invalidEmptyQuotedFontFamilyStyleTypes;

const invalidWhitespaceQuotedFontFamilyStyleTypes = {
  // Detailed quoted font-family grammar is runtime validated.
  fontFamily: '"   "',
} satisfies TextStyle;
void invalidWhitespaceQuotedFontFamilyStyleTypes;

const invalidTextDecorationStyleTypes = {
  // @ts-expect-error textDecoration is closed to the decoration lines deckjsx resolves.
  textDecoration: "overline",
  // @ts-expect-error textDecorationLine is closed to the decoration lines deckjsx resolves.
  textDecorationLine: "underline overline",
  // @ts-expect-error color is closed to deckjsx's supported CSS color syntax.
  color: "definitely-not-a-color",
  // Detailed font-family identifier grammar is runtime validated.
  fontFamily: "123bad",
  // @ts-expect-error textShadow length tokens use supported shadow units, not arbitrary suffixes.
  textShadow: "1banana 2px 3px red",
} satisfies TextStyle;
void invalidTextDecorationStyleTypes;

const invalidTextShadowColorToken = {
  // @ts-expect-error textShadow color tokens use the public CSS color contract.
  textShadow: "1px 2px definitely-not-a-color",
} satisfies TextStyle;
void invalidTextShadowColorToken;

const invalidTextShadowNegativeBlur = {
  textShadow: "1px 2px -3px #111111",
} satisfies TextStyle;
void invalidTextShadowNegativeBlur;

const invalidEmptyHexColor = {
  // @ts-expect-error hex colors require at least one hex digit after #.
  color: "#",
} satisfies TextStyle;
void invalidEmptyHexColor;

const invalidShortHexColor = {
  color: "#1",
} satisfies TextStyle;
void invalidShortHexColor;

const invalidTwoDigitHexColor = {
  color: "#12",
} satisfies TextStyle;
void invalidTwoDigitHexColor;

const invalidNonHexColor = {
  color: "#12z",
} satisfies TextStyle;
void invalidNonHexColor;

const invalidEmptyRgbColorFunction = {
  // Detailed rgb() argument grammar is runtime validated.
  color: "rgb()",
} satisfies TextStyle;
void invalidEmptyRgbColorFunction;

const invalidWhitespaceRgbaColorFunction = {
  // Detailed rgba() argument grammar is runtime validated.
  color: "rgba(   )",
} satisfies TextStyle;
void invalidWhitespaceRgbaColorFunction;

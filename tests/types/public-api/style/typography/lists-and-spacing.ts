import type {
  CssLetterSpacing,
  ListStart,
  TextRunStyle,
  TextStyle,
  TextTabStopAuthoring,
} from "deckjsx";

const textListStart = {
  listStyleType: "decimal",
  listStart: 3,
} satisfies TextStyle;
void textListStart;
const explicitListStart = 3 satisfies ListStart;
void explicitListStart;

const textRejectsZeroListStart = {
  listStyleType: "decimal",
  // @ts-expect-error listStart must be a positive integer supported by the public authoring API.
  listStart: 0,
} satisfies TextStyle;
void textRejectsZeroListStart;

const textRejectsNegativeListStart = {
  listStyleType: "decimal",
  // @ts-expect-error listStart must be a positive integer supported by the public authoring API.
  listStart: -1,
} satisfies TextStyle;
void textRejectsNegativeListStart;

const textRejectsFractionalListStart = {
  listStyleType: "decimal",
  // @ts-expect-error listStart must be an integer.
  listStart: 1.5,
} satisfies TextStyle;
void textRejectsFractionalListStart;

const textRejectsLineSpacingAlias = {
  // @ts-expect-error text styles use CSS-like lineHeight, not the deckjsx lineSpacing alias.
  lineSpacing: 21,
} satisfies TextStyle;
void textRejectsLineSpacingAlias;

const textRejectsLineSpacingMultipleAlias = {
  // @ts-expect-error text styles use CSS-like lineHeight, not the deckjsx lineSpacingMultiple alias.
  lineSpacingMultiple: 1.4,
} satisfies TextStyle;
void textRejectsLineSpacingMultipleAlias;

const textCssWrapping = {
  whiteSpace: "nowrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
} satisfies TextStyle;
void textCssWrapping;

const textRejectsWrapAlias = {
  // @ts-expect-error text styles use CSS whiteSpace, wordBreak, or overflowWrap, not the deckjsx wrap alias.
  wrap: false,
} satisfies TextStyle;
void textRejectsWrapAlias;

const textRejectsUnderlineAlias = {
  // @ts-expect-error text styles use CSS-like textDecorationLine, not the deckjsx underline alias.
  underline: true,
} satisfies TextStyle;
void textRejectsUnderlineAlias;

const textRejectsStrikeAlias = {
  // @ts-expect-error text styles use CSS-like textDecorationLine, not the deckjsx strike alias.
  strike: true,
} satisfies TextStyle;
void textRejectsStrikeAlias;

const textRunRejectsUnderlineAlias = {
  // @ts-expect-error text run styles use CSS-like textDecorationLine, not the deckjsx underline alias.
  underline: true,
} satisfies TextRunStyle;
void textRunRejectsUnderlineAlias;

const textRunRejectsStrikeAlias = {
  // @ts-expect-error text run styles use CSS-like textDecorationLine, not the deckjsx strike alias.
  strike: true,
} satisfies TextRunStyle;
void textRunRejectsStrikeAlias;

const readonlyTabStops = [{ position: "1in", alignment: "right" }] as const;
readonlyTabStops satisfies readonly TextTabStopAuthoring[];

const cssLetterSpacing = "0.1em" satisfies CssLetterSpacing;
const negativeCssLetterSpacing = "-0.02em" satisfies CssLetterSpacing;
const normalLetterSpacing = "normal" satisfies CssLetterSpacing;
void cssLetterSpacing;
void negativeCssLetterSpacing;
void normalLetterSpacing;

const invalidCssWideLetterSpacing = {
  // @ts-expect-error letterSpacing does not accept CSS-wide reset keywords in public authoring.
  letterSpacing: "initial",
} satisfies TextStyle;
void invalidCssWideLetterSpacing;

const invalidCssWideTextIndent = {
  // @ts-expect-error textIndent does not accept CSS-wide reset keywords in public authoring.
  textIndent: "initial",
} satisfies TextStyle;
void invalidCssWideTextIndent;

const invalidTabStopPositions = [
  {
    // @ts-expect-error tab stop positions must be non-negative public point lengths.
    position: "-1pt",
  },
  {
    // @ts-expect-error tab stop positions do not accept CSS-wide reset keywords.
    position: "initial",
  },
] as const satisfies readonly TextTabStopAuthoring[];
void invalidTabStopPositions;

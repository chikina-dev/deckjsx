import type {
  CssGridAreaAuthoringString,
  CssGridTemplate,
  CssGridTemplateAreas,
  ViewStyle,
} from "deckjsx";

const readonlyGridColumns = ["1fr", "2in", "minmax(1in, 2in)"] as const;
readonlyGridColumns satisfies CssGridTemplate;

const repeatGridColumns = "repeat(3, 1fr)" satisfies CssGridTemplate;
void repeatGridColumns;

const threeTrackGridRows = "auto 1fr auto" satisfies CssGridTemplate;
void threeTrackGridRows;

// @ts-expect-error minmax() requires a non-empty supported public grid track argument.
const emptyMinmaxGridColumns = "minmax()" satisfies CssGridTemplate;
void emptyMinmaxGridColumns;

// @ts-expect-error minmax() requires two supported public grid track arguments.
const oneArgumentMinmaxGridColumns = "minmax(1in)" satisfies CssGridTemplate;
void oneArgumentMinmaxGridColumns;

// @ts-expect-error repeat() requires non-empty repeat arguments.
const emptyRepeatGridColumns = "repeat()" satisfies CssGridTemplate;
void emptyRepeatGridColumns;

// @ts-expect-error repeat() requires an integer, auto-fill, or auto-fit repetition count.
const invalidRepeatCountGridColumns = "repeat(three, 1fr)" satisfies CssGridTemplate;
void invalidRepeatCountGridColumns;

const negativeFractionGridColumns = "-1fr" satisfies CssGridTemplate;
void negativeFractionGridColumns;

// @ts-expect-error minmax() arguments must be supported public grid track sizes.
const invalidMinmaxTrackArgument = "minmax(nonsense, 1fr)" satisfies CssGridTemplate;
void invalidMinmaxTrackArgument;

// @ts-expect-error repeat() track arguments must be supported public grid tracks.
const invalidRepeatTrackArgument = "repeat(auto-fit, nonsense)" satisfies CssGridTemplate;
void invalidRepeatTrackArgument;

// @ts-expect-error gridTemplate shorthand strings are runtime-diagnostic input, not public authoring API.
const gridTemplateShorthand = "1fr 2in / 2fr 1fr" satisfies ViewStyle["gridTemplate"];
void gridTemplateShorthand;

// @ts-expect-error grid shorthand strings are runtime-diagnostic input, not public authoring API.
const gridAutoFlowShorthand = "auto-flow dense 1in / 2in 1fr" satisfies ViewStyle["grid"];
void gridAutoFlowShorthand;

const namedGridArea = "hero" satisfies ViewStyle["gridArea"];
namedGridArea satisfies CssGridAreaAuthoringString;
const lineGridArea = "1 / 2 / 3 / 4" satisfies ViewStyle["gridArea"];
const spanGridArea = "span 2 / 1" satisfies ViewStyle["gridArea"];
const dashedGridArea = "hero-main_1" satisfies ViewStyle["gridArea"];
const gridColumnStartLine = 2 satisfies ViewStyle["gridColumnStart"];
const gridRowEndSpan = "span 2" satisfies ViewStyle["gridRowEnd"];
void namedGridArea;
void lineGridArea;
void spanGridArea;
void dashedGridArea;
void gridColumnStartLine;
void gridRowEndSpan;

// Detailed named gridArea grammar is runtime validated.
const invalidNamedGridArea = "123bad" satisfies ViewStyle["gridArea"];
void invalidNamedGridArea;

// Detailed gridArea shorthand grammar is runtime validated.
const invalidLineGridArea = "1 / header" satisfies ViewStyle["gridArea"];
void invalidLineGridArea;

// @ts-expect-error grid line placement strings must use authored positive integers.
const invalidMalformedGridPlacement = "1banana / 2" satisfies ViewStyle["gridColumn"];
void invalidMalformedGridPlacement;

// @ts-expect-error grid line span strings must use authored positive integers.
const invalidMalformedSpanGridLine = "span 2banana" satisfies ViewStyle["gridRowEnd"];
void invalidMalformedSpanGridLine;

// @ts-expect-error gridTemplate shorthand is not part of the public authoring API.
const invalidGridTemplateShorthand = "nonsense / 1fr" satisfies ViewStyle["gridTemplate"];
void invalidGridTemplateShorthand;

// @ts-expect-error gridTemplate shorthand is not part of the public authoring API.
const invalidGridTemplateLengthUnit = "1banana / 1fr" satisfies ViewStyle["gridTemplate"];
void invalidGridTemplateLengthUnit;

// @ts-expect-error grid shorthand is not part of the public authoring API.
const invalidGridAutoFlowShorthand = "auto-flow 1in / auto-flow 2in" satisfies ViewStyle["grid"];
void invalidGridAutoFlowShorthand;

// @ts-expect-error grid shorthand is not part of the public authoring API.
const invalidGridLengthUnit = "auto-flow 1banana / 1fr" satisfies ViewStyle["grid"];
void invalidGridLengthUnit;

const readonlyAreas = ['"header header"', '"main side"'] as const;
readonlyAreas satisfies CssGridTemplateAreas;

// @ts-expect-error multiline gridTemplateAreas strings are not part of the public authoring API; use a row array.
const multilineAreas = '"hero hero"\n"main side"' satisfies CssGridTemplateAreas;
void multilineAreas;

// @ts-expect-error gridTemplateAreas rows must be quoted CSS area rows.
const unquotedAreas = "hero hero\nmain side" satisfies CssGridTemplateAreas;
void unquotedAreas;

// @ts-expect-error multiline gridTemplateAreas strings are not part of the public authoring API.
const unquotedSecondAreasRow = '"hero hero"\nmain side' satisfies CssGridTemplateAreas;
void unquotedSecondAreasRow;

// @ts-expect-error gridTemplateAreas rows require at least one authored area token.
const emptyQuotedAreas = '""' satisfies CssGridTemplateAreas;
void emptyQuotedAreas;

// @ts-expect-error gridTemplateAreas rows cannot be whitespace-only.
const whitespaceQuotedAreas = '"   "' satisfies CssGridTemplateAreas;
void whitespaceQuotedAreas;

const invalidEmptyQuotedAreasRow = [
  // Detailed gridTemplateAreas row grammar is runtime validated.
  '""',
] as const satisfies CssGridTemplateAreas;
void invalidEmptyQuotedAreasRow;

const invalidWhitespaceQuotedAreasRow = [
  // Detailed gridTemplateAreas row grammar is runtime validated.
  '"   "',
] as const satisfies CssGridTemplateAreas;
void invalidWhitespaceQuotedAreasRow;

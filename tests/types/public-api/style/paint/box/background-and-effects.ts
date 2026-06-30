import type { ViewStyle } from "deckjsx";

const invalidEmptyTransformFunction = {
  // Detailed transform argument grammar is runtime validated.
  transform: "rotate()",
} satisfies ViewStyle;
void invalidEmptyTransformFunction;

const invalidWhitespaceTransformFunction = {
  // Detailed transform argument grammar is runtime validated.
  transform: "scale(   )",
} satisfies ViewStyle;
void invalidWhitespaceTransformFunction;

const invalidTransformNumberToken = {
  // Detailed transform argument grammar is runtime validated.
  transform: "scale(big)",
} satisfies ViewStyle;
void invalidTransformNumberToken;

const invalidEmptyFilterFunction = {
  // Detailed filter argument grammar is runtime validated.
  filter: "blur()",
} satisfies ViewStyle;
void invalidEmptyFilterFunction;

const invalidWhitespaceFilterFunction = {
  // Detailed filter argument grammar is runtime validated.
  filter: "opacity(   )",
} satisfies ViewStyle;
void invalidWhitespaceFilterFunction;

const invalidFilterIdentifierArgument = {
  // Detailed filter argument grammar is runtime validated.
  filter: "blur(foo)",
} satisfies ViewStyle;
void invalidFilterIdentifierArgument;

const invalidTransformOriginCssWideKeyword = {
  // @ts-expect-error transformOrigin does not accept CSS-wide keywords as origin tokens.
  transformOrigin: "initial",
} satisfies ViewStyle;
void invalidTransformOriginCssWideKeyword;

const invalidTransformOriginCssWideOffset = {
  // @ts-expect-error transformOrigin offset tokens must be authored CSS length tokens.
  transformOrigin: "left initial",
} satisfies ViewStyle;
void invalidTransformOriginCssWideOffset;

const invalidBackgroundSizeStretch = {
  // @ts-expect-error backgroundSize uses CSS sizing; use "100% 100%" instead of the deckjsx stretch keyword.
  backgroundSize: "stretch",
} satisfies ViewStyle;
void invalidBackgroundSizeStretch;

const invalidBackgroundSizeTail = {
  // @ts-expect-error backgroundSize two-component values use supported size components.
  backgroundSize: "contain 1banana",
} satisfies ViewStyle;
void invalidBackgroundSizeTail;

const invalidBackgroundSizeCssWideKeyword = {
  // @ts-expect-error backgroundSize does not accept CSS-wide keywords as size components.
  backgroundSize: "initial",
} satisfies ViewStyle;
void invalidBackgroundSizeCssWideKeyword;

const invalidBackgroundSizeNegativeLength = {
  backgroundSize: "-1px",
} satisfies ViewStyle;
void invalidBackgroundSizeNegativeLength;

const invalidBackgroundSizeNegativeSecondLength = {
  backgroundSize: "auto -1px",
} satisfies ViewStyle;
void invalidBackgroundSizeNegativeSecondLength;

const invalidBackgroundSizeComponent = {
  // @ts-expect-error backgroundSize length components use supported deck length units.
  backgroundSize: "50% banana",
} satisfies ViewStyle;
void invalidBackgroundSizeComponent;

const invalidBackgroundSizeListTail = {
  // @ts-expect-error every backgroundSize layer must use supported CSS sizing values.
  backgroundSize: "contain, definitely-not-size",
} satisfies ViewStyle;
void invalidBackgroundSizeListTail;

const invalidBackgroundPositionTail = {
  // @ts-expect-error backgroundPosition is closed to supported object-position tokens.
  backgroundPosition: "right nowhere",
} satisfies ViewStyle;
void invalidBackgroundPositionTail;

const invalidBackgroundPositionCssWideKeyword = {
  // @ts-expect-error backgroundPosition does not accept CSS-wide keywords as position tokens.
  backgroundPosition: "initial",
} satisfies ViewStyle;
void invalidBackgroundPositionCssWideKeyword;

const invalidBackgroundPositionCssWideOffset = {
  // @ts-expect-error backgroundPosition offset tokens must be authored CSS length tokens.
  backgroundPosition: "right initial",
} satisfies ViewStyle;
void invalidBackgroundPositionCssWideOffset;

const invalidBackgroundPositionLayerTail = {
  // @ts-expect-error every backgroundPosition layer must start with public object-position tokens.
  backgroundPosition: "right bottom, nowhere",
} satisfies ViewStyle;
void invalidBackgroundPositionLayerTail;

const invalidBackgroundPositionTrailingComma = {
  // @ts-expect-error backgroundPosition layer lists cannot end with a trailing comma.
  backgroundPosition: "right bottom,",
} satisfies ViewStyle;
void invalidBackgroundPositionTrailingComma;

const invalidBackgroundImageEmptyUrl = {
  // Detailed backgroundImage url() source grammar is runtime validated.
  backgroundImage: "url()",
} satisfies ViewStyle;
void invalidBackgroundImageEmptyUrl;

const invalidBackgroundImageEmptyQuotedUrl = {
  // Detailed backgroundImage url() source grammar is runtime validated.
  backgroundImage: 'url("")',
} satisfies ViewStyle;
void invalidBackgroundImageEmptyQuotedUrl;

const invalidBackgroundImageWhitespaceQuotedUrl = {
  // Detailed backgroundImage url() source grammar is runtime validated.
  backgroundImage: 'url("   ")',
} satisfies ViewStyle;
void invalidBackgroundImageWhitespaceQuotedUrl;

const invalidBackgroundImageLeadingWhitespaceQuotedUrl = {
  // Detailed backgroundImage url() source grammar is runtime validated.
  backgroundImage: 'url(" image.png")',
} satisfies ViewStyle;
void invalidBackgroundImageLeadingWhitespaceQuotedUrl;

const invalidBackgroundEmptyUrl = {
  // Detailed background url() source grammar is runtime validated.
  background: "url()",
} satisfies ViewStyle;
void invalidBackgroundEmptyUrl;

const invalidBackgroundTrailingToken = {
  // @ts-expect-error color background shorthands reject unsupported trailing tokens.
  background: "red sparkle",
} satisfies ViewStyle;
void invalidBackgroundTrailingToken;

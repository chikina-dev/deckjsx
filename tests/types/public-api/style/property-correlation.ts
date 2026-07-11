import type { CssColor, NonNegativeDeckPointLength, TextStyle, ViewStyle } from "deckjsx";

type Assert<T extends true> = T;
type IsUnknown<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false;

type FontSizeRemainsSpecific = Assert<
  IsUnknown<NonNullable<TextStyle["fontSize"]>> extends false ? true : false
>;
type ColorRemainsSpecific = Assert<
  IsUnknown<NonNullable<TextStyle["color"]>> extends false ? true : false
>;
void (undefined as unknown as FontSizeRemainsSpecific);
void (undefined as unknown as ColorRemainsSpecific);

const validTextStyle = {
  color: "#123456" satisfies CssColor,
  fontSize: 24 satisfies NonNegativeDeckPointLength,
} satisfies TextStyle;
void validTextStyle;

const invalidTextStyle = {
  // @ts-expect-error CSS-wide values remain outside validated fontSize authoring.
  fontSize: "initial",
} satisfies TextStyle;
void invalidTextStyle;

const invalidViewStyle = {
  // @ts-expect-error text-only properties do not leak into view authoring.
  fontSize: 24,
} satisfies ViewStyle;
void invalidViewStyle;

// @ts-expect-error runtime validation results are internal and do not widen the public API.
type NoPublicValidatedStyleResult = import("deckjsx").SupportedStyleValueValidationResult; // eslint-disable-line no-unused-vars

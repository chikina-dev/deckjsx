import type { CssBorderWidth, ViewStyle } from "deckjsx";

const invalidCssLikeValues = {
  // @ts-expect-error backgroundRepeat is closed to deckjsx's supported repeat keywords.
  backgroundRepeat: "space",
  // @ts-expect-error backgroundClip is closed to supported background box keywords.
  backgroundClip: "margin-box",
  // @ts-expect-error backgroundOrigin is closed to supported background box keywords.
  backgroundOrigin: "padding-box, margin-box",
  // @ts-expect-error backgroundSize is closed to supported image sizing values.
  backgroundSize: "giant",
  // @ts-expect-error backgroundPosition is closed to supported object-position tokens.
  backgroundPosition: "somewhere else",
  // @ts-expect-error backgroundImage is closed to url() image sources.
  backgroundImage: "image.png",
  // @ts-expect-error border shorthand is closed to supported public border styles.
  border: "2pt groove #111111",
  // Detailed border shorthand color grammar is runtime validated.
  borderLeft: "2pt solid definitely-not-a-color",
  // @ts-expect-error outline shorthand is closed to supported public border styles.
  outline: "1pt groove #222222",
  // @ts-expect-error boxShadow is closed to deckjsx's supported single-layer shadow syntax.
  boxShadow: "sparkle",
  // @ts-expect-error mixBlendMode is closed to standard CSS blend mode keywords.
  mixBlendMode: "made-up",
  // @ts-expect-error transform is closed to deckjsx's supported transform functions.
  transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
  // @ts-expect-error transformOrigin accepts one or two keyword/length tokens.
  transformOrigin: "left top center",
  // @ts-expect-error placeSelf is closed to supported self-alignment keywords.
  placeSelf: "left center",
  // @ts-expect-error placeItems is closed to supported item-alignment keywords.
  placeItems: "center unsafe",
  // @ts-expect-error placeContent is closed to supported content-distribution keywords.
  placeContent: "around center",
  // @ts-expect-error gridTemplateColumns must start with a supported grid track token.
  gridTemplateColumns: "nonsense",
  // @ts-expect-error gridTemplateColumns track lists use supported grid track tokens.
  gridTemplateRows: "1fr 1banana",
  // @ts-expect-error filter is closed to CSS filter function syntax deckjsx records.
  filter: "sparkle(1)",
} satisfies ViewStyle;
void invalidCssLikeValues;

const invalidBoxShadowNegativeBlur = {
  boxShadow: "1px 2px -3px #111111",
} satisfies ViewStyle;
void invalidBoxShadowNegativeBlur;

const borderWidthToken = "2pt" satisfies CssBorderWidth;
void borderWidthToken;

const invalidNegativeBorderWidthToken = "-1pt" satisfies CssBorderWidth;
void invalidNegativeBorderWidthToken;

const invalidBorderWidthValues = {
  borderWidth: "-1pt",
  // @ts-expect-error CSS-wide reset keywords are not public border width authoring values.
  outlineWidth: "initial",
} satisfies ViewStyle;
void invalidBorderWidthValues;

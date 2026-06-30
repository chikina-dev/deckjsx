import type { ImageCropValue, ImageStyle, VideoStyle, ViewStyle } from "deckjsx";

const imageObjectFit = {
  objectFit: "cover",
  opacity: 0.65,
  borderRadius: 0.2,
} satisfies ImageStyle;
void imageObjectFit;

const imageObjectFitFill = {
  objectFit: "fill",
} satisfies ImageStyle;
void imageObjectFitFill;

const imageRejectsStretchObjectFit = {
  // @ts-expect-error objectFit uses CSS object-fit keywords; use fill instead of the deckjsx stretch fit.
  objectFit: "stretch",
} satisfies ImageStyle;
void imageRejectsStretchObjectFit;

const imageRejectsRoundingAlias = {
  // @ts-expect-error media styles use CSS-like borderRadius, not the deckjsx rounding alias.
  rounding: true,
} satisfies ImageStyle;
void imageRejectsRoundingAlias;

const imageRejectsTransparencyAlias = {
  // @ts-expect-error media styles use CSS-like opacity, not the PPTX transparency alias.
  transparency: 35,
} satisfies ImageStyle;
void imageRejectsTransparencyAlias;

const imageRejectsFitAlias = {
  // @ts-expect-error media styles use CSS-like objectFit, not the deckjsx fit alias.
  fit: "cover",
} satisfies ImageStyle;
void imageRejectsFitAlias;

const videoObjectFit = {
  objectFit: "contain",
  opacity: 0.65,
  borderRadius: 0.2,
} satisfies VideoStyle;
void videoObjectFit;

const videoObjectFitFill = {
  objectFit: "fill",
} satisfies VideoStyle;
void videoObjectFitFill;

const videoRejectsStretchObjectFit = {
  // @ts-expect-error objectFit uses CSS object-fit keywords; use fill instead of the deckjsx stretch fit.
  objectFit: "stretch",
} satisfies VideoStyle;
void videoRejectsStretchObjectFit;

const videoRejectsRoundingAlias = {
  // @ts-expect-error media styles use CSS-like borderRadius, not the deckjsx rounding alias.
  rounding: true,
} satisfies VideoStyle;
void videoRejectsRoundingAlias;

const videoRejectsTransparencyAlias = {
  // @ts-expect-error media styles use CSS-like opacity, not the PPTX transparency alias.
  transparency: 35,
} satisfies VideoStyle;
void videoRejectsTransparencyAlias;

const videoRejectsFitAlias = {
  // @ts-expect-error media styles use CSS-like objectFit, not the deckjsx fit alias.
  fit: "contain",
} satisfies VideoStyle;
void videoRejectsFitAlias;

const imagePositionStyleTypes = {
  objectPosition: "right 25% bottom 10%",
} satisfies ImageStyle;
void imagePositionStyleTypes;

const imageCropPercent = "12.5%" satisfies ImageCropValue;
const imageCropStyleTypes = {
  crop: { top: 0, right: imageCropPercent, bottom: "99.5%", left: "0%" },
} satisfies ImageStyle;
void imageCropStyleTypes;

const invalidNegativeImageCropPercent = {
  crop: {
    left: "-1%",
  },
} satisfies ImageStyle;
void invalidNegativeImageCropPercent;

const invalidFullImageCropPercent = {
  crop: {
    right: "100%",
  },
} satisfies ImageStyle;
void invalidFullImageCropPercent;

const invalidImagePositionStyleTypes = {
  // @ts-expect-error objectPosition is closed to supported CSS object-position tokens.
  objectPosition: "somewhere else",
} satisfies ImageStyle;
void invalidImagePositionStyleTypes;

const invalidCssLengthUnitTypes = {
  // @ts-expect-error spacing shorthands accept deck length units, not arbitrary number-prefixed strings.
  padding: "1banana 2px",
  // @ts-expect-error spacing shorthand trailing tokens are also deck length tokens.
  margin: "1px 2banana",
  // @ts-expect-error objectPosition length tokens accept deck length units, not arbitrary suffixes.
  objectPosition: "1banana 2px",
} satisfies ViewStyle & ImageStyle;
void invalidCssLengthUnitTypes;

const invalidCssWideNonNegativeLengthTypes = {
  // @ts-expect-error height does not accept CSS-wide reset keywords in public authoring.
  height: "initial",
  // @ts-expect-error padding does not accept CSS-wide reset keywords in public authoring.
  padding: "initial",
  // @ts-expect-error borderRadius does not accept CSS-wide reset keywords in public authoring.
  borderRadius: "initial",
} satisfies ViewStyle;
void invalidCssWideNonNegativeLengthTypes;

const invalidWhitespaceImageCropNumberTokenTypes = {
  crop: { left: "   %" },
} satisfies ImageStyle;
void invalidWhitespaceImageCropNumberTokenTypes;

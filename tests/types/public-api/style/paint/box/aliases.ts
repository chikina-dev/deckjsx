import type { ViewStyle } from "deckjsx";

type Assert<T extends true> = T;

const invalidViewBackgroundTransparencyAlias = {
  // @ts-expect-error use alpha in backgroundColor/background instead of the PPTX backgroundTransparency alias.
  backgroundTransparency: 12,
} satisfies ViewStyle;
void invalidViewBackgroundTransparencyAlias;

const invalidViewBorderTransparencyAlias = {
  // @ts-expect-error use alpha in borderColor/border instead of the PPTX borderTransparency alias.
  borderTransparency: 20,
} satisfies ViewStyle;
void invalidViewBorderTransparencyAlias;

const invalidViewBorderStyleAlias = {
  // @ts-expect-error borderStyle uses CSS border styles such as dashed, not the PPTX dash alias.
  borderStyle: "dash",
} satisfies ViewStyle;
void invalidViewBorderStyleAlias;

const invalidViewBorderShorthandStyleAlias = {
  // @ts-expect-error border shorthand uses CSS border styles such as dashed, not the PPTX dash alias.
  border: "2pt dash #111111",
} satisfies ViewStyle;
void invalidViewBorderShorthandStyleAlias;

const invalidViewBorderEmptyHexColor = {
  // Detailed border shorthand color grammar is runtime validated.
  border: "1pt solid #",
} satisfies ViewStyle;
void invalidViewBorderEmptyHexColor;

const viewStyleDoesNotExposeRotation = {
  ok: true,
} satisfies {
  ok: Assert<"rotation" extends keyof ViewStyle ? false : true>;
};
void viewStyleDoesNotExposeRotation;

const viewStyleDoesNotExposeFlipAliases = {
  ok: true,
} satisfies {
  ok: Assert<
    "flipH" extends keyof ViewStyle ? false : "flipV" extends keyof ViewStyle ? false : true
  >;
};
void viewStyleDoesNotExposeFlipAliases;

const invalidViewRotationAlias = {
  // @ts-expect-error use CSS transform rotate(), not the deckjsx rotation alias.
  rotation: 15,
} satisfies ViewStyle;
void invalidViewRotationAlias;

const invalidViewFlipAlias = {
  // @ts-expect-error use CSS transform scaleX(-1)/scaleY(-1), not deckjsx flip aliases.
  flipH: true,
} satisfies ViewStyle;
void invalidViewFlipAlias;

const invalidViewFlipVAlias = {
  // @ts-expect-error use CSS transform scaleX(-1)/scaleY(-1), not deckjsx flip aliases.
  flipV: true,
} satisfies ViewStyle;
void invalidViewFlipVAlias;

import type {
  CssBackgroundAuthoringString,
  CssBackgroundImageSourceAuthoringString,
  CssColor,
  CssExternalHyperlinkAuthoringString,
  CssFontFamilyAuthoringString,
  CssGradientAuthoringString,
  CssHexColor,
  ShapeStyle,
  TextStyle,
  ViewStyle,
} from "deckjsx";
import type {
  CssBackgroundImageSourceAuthoringString as StyleSubpathBackgroundImageSource,
  CssColor as StyleSubpathColor,
  CssExternalHyperlinkAuthoringString as StyleSubpathExternalHyperlink,
  CssGradientAuthoringString as StyleSubpathGradient,
  CssHexColor as StyleSubpathHexColor,
} from "deckjsx/style";

type Assert<T extends true> = T;

const exportedCssValueTypes = {
  color: "#1D4ED8" satisfies CssColor,
  hex: "#fff" satisfies CssHexColor,
  gradient: "linear-gradient(90deg, #fff, #000)" satisfies CssGradientAuthoringString,
  background: "linear-gradient(90deg, #fff, #000)" satisfies CssBackgroundAuthoringString,
  backgroundImage: "url(./image.png)" satisfies CssBackgroundImageSourceAuthoringString,
  fontFamily: "Aptos" satisfies CssFontFamilyAuthoringString,
  href: "https://example.com" satisfies CssExternalHyperlinkAuthoringString,
  subpathColor: "#1D4ED8" satisfies StyleSubpathColor,
  subpathHex: "#fff" satisfies StyleSubpathHexColor,
  subpathGradient: "linear-gradient(90deg, #fff, #000)" satisfies StyleSubpathGradient,
  subpathBackgroundImage: "url(./image.png)" satisfies StyleSubpathBackgroundImageSource,
  subpathHref: "mailto:deckjsx@example.com" satisfies StyleSubpathExternalHyperlink,
};
void exportedCssValueTypes;

const cssAlphaBackgrounds = {
  slide: { backgroundColor: "rgba(17, 34, 51, 0.88)" },
  view: { backgroundColor: "rgba(248, 225, 108, 0.85)" },
  text: { backgroundColor: "rgba(255, 255, 255, 0.75)" },
  shape: { backgroundColor: "rgba(37, 99, 235, 0.7)" },
} satisfies {
  slide: import("deckjsx").SlideStyle;
  view: ViewStyle;
  text: TextStyle;
  shape: ShapeStyle;
};
void cssAlphaBackgrounds;

const invalidSlidePositioningStyle = {
  // @ts-expect-error slide style does not accept fixed positioning offsets.
  left: 1,
} satisfies import("deckjsx").SlideStyle;
void invalidSlidePositioningStyle;

const cssAlphaBorders = {
  view: { borderColor: "rgba(31, 41, 55, 0.8)", borderStyle: "dashed" },
  text: { border: "1pt solid rgba(220, 38, 38, 0.9)" },
  shape: { borderColor: "rgba(29, 78, 216, 0.95)", borderStyle: "dotted" },
} satisfies {
  view: ViewStyle;
  text: TextStyle;
  shape: ShapeStyle;
};
void cssAlphaBorders;

const publicStyleDoesNotExposeBackgroundTransparency = {
  ok: true,
} satisfies {
  ok: Assert<
    "backgroundTransparency" extends keyof import("deckjsx").SlideStyle
      ? false
      : "backgroundTransparency" extends keyof ViewStyle
        ? false
        : "backgroundTransparency" extends keyof TextStyle
          ? false
          : "backgroundTransparency" extends keyof ShapeStyle
            ? false
            : true
  >;
};
void publicStyleDoesNotExposeBackgroundTransparency;

const publicStyleDoesNotExposeBorderTransparency = {
  ok: true,
} satisfies {
  ok: Assert<
    "borderTransparency" extends keyof ViewStyle
      ? false
      : "borderTransparency" extends keyof TextStyle
        ? false
        : "borderTransparency" extends keyof ShapeStyle
          ? false
          : true
  >;
};
void publicStyleDoesNotExposeBorderTransparency;

import type { CssNamedColor } from "./color";
import type { AuthoredTag, IntrinsicTextTag, IntrinsicViewTag } from "../authoring/tags";

export type CssWideKeyword = "initial" | "inherit" | "unset" | "revert" | "revert-layer";
type CssDecimalDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type CssCropPercentString = `${number}%`;
type CssNumberString = `${number}`;
type CssNonNegativeNumberishString = CssNumberString;
type CssNonNegativeNumberString = CssNumberString;
type CssPositiveIntegerString = CssNumberString;
/**
 * CSS length units accepted by public deckjsx authoring.
 *
 * Template literal length types use this closed unit set instead of accepting arbitrary strings.
 * Numeric `DeckLength` values remain deck layout units; string values are CSS-like tokens that are
 * parsed and validated by deckjsx before layout or projection.
 */
export type CssLengthUnit =
  | "in"
  | "cm"
  | "mm"
  | "q"
  | "pt"
  | "pc"
  | "px"
  | "%"
  | "em"
  | "rem"
  | "vh"
  | "vw"
  | "vmin"
  | "vmax"
  | "ch";
/** CSS length units accepted for point-oriented text metrics. Percentages are intentionally absent. */
export type CssPointLengthUnit = Exclude<CssLengthUnit, "%">;
/** CSS-like deck length token accepted by geometry and spacing properties. */
export type DeckLengthString = "0" | `${number}${CssLengthUnit}`;
/** CSS-like point length token accepted by typography properties. */
export type DeckPointLengthString = "0" | `${number}${CssPointLengthUnit}`;
/**
 * Public authoring length for slide geometry.
 *
 * Numeric values are deck layout units, normally inches. CSS-like length strings are accepted only
 * in the units listed by this type and are validated during layout/projection.
 */
export type DeckLength = number | DeckLengthString;
/**
 * Public authoring length for point-oriented typography values.
 *
 * Numeric values are points. String values must use a unit from `CssPointLengthUnit` and are parsed
 * by deckjsx diagnostics for JavaScript/casted input.
 */
export type DeckPointLength = number | DeckPointLengthString;
export type NonNegativeDeckLengthString = DeckLengthString;
export type CssPointLengthString = DeckPointLengthString;
export type NonNegativeDeckPointLengthString = DeckPointLengthString &
  (`${CssDecimalDigit}${string}` | `.${string}`);
/**
 * Public non-negative length for sizing, gaps, padding, and radius-like properties.
 *
 * Numeric values are deck layout units and are checked by compile diagnostics for JavaScript/casted
 * inputs. String values exclude CSS-wide reset keywords at the type boundary; compile diagnostics
 * reject negative or malformed CSS-like length tokens.
 */
export type NonNegativeDeckLength = number | NonNegativeDeckLengthString;
/**
 * Public non-negative point length for typography metrics.
 *
 * Numeric values are points. String values exclude CSS-wide reset keywords at the type boundary;
 * compile diagnostics reject negative or malformed CSS-like point length tokens.
 */
export type NonNegativeDeckPointLength = number | NonNegativeDeckPointLengthString;
/** CSS-like point length used where signed text offsets are allowed. */
export type CssPointLength = number | CssPointLengthString;
/** CSS letter-spacing value. `normal` is preserved as the CSS keyword; numbers are points. */
export type CssLetterSpacing = CssPointLength | "normal";
type CssPositiveNumberString = (
  | `${Exclude<CssDecimalDigit, "0">}${string}`
  | `0.${Exclude<CssDecimalDigit, "0">}${string}`
) &
  `${number}`;
export type CssAspectRatio =
  | number
  | "auto"
  | CssPositiveNumberString
  | `${CssPositiveNumberString}/${CssPositiveNumberString}`
  | `${CssPositiveNumberString} / ${CssPositiveNumberString}`;
/** Box sizing keywords supported by public box layout. */
export type CssBoxSizing = "border-box" | "content-box";
export type CssSpacingToken = DeckLengthString;
export type CssSpacingShorthand = `${CssSpacingToken} ${CssSpacingToken}`;
/**
 * Public spacing shorthand for margin, padding, and inset-like properties.
 *
 * Use a single `DeckLength`, a two-token CSS-like string, or a four-item tuple when sides need
 * independent values. The string form is intentionally closed to deck length units so values such
 * as `"1banana 2px"` fail at the authoring type boundary.
 */
export type Spacing =
  | DeckLength
  | CssSpacingShorthand
  | readonly [DeckLength, DeckLength, DeckLength, DeckLength];
type CssNonNegativeSpacingShorthand =
  `${NonNegativeDeckLengthString} ${NonNegativeDeckLengthString}`;
export type NonNegativeSpacing =
  | NonNegativeDeckLength
  | CssNonNegativeSpacingShorthand
  | readonly [
      NonNegativeDeckLength,
      NonNegativeDeckLength,
      NonNegativeDeckLength,
      NonNegativeDeckLength,
    ];
export type StackAxis = "horizontal" | "vertical";
export type CssBorderStyleKeyword = "none" | "solid" | "dashed" | "dotted";
export type BorderStyle = CssBorderStyleKeyword;
export type ProjectedStrokeStyle = "none" | "solid" | "dash";
export type CssBorderWidthKeyword = "thin" | "medium" | "thick";
/** CSS-like border width token accepted by public border and outline shorthands. */
export type CssBorderWidth =
  | CssBorderWidthKeyword
  | "0"
  | `${CssNonNegativeNumberishString}${"in" | "pt" | "px" | "%"}`;
/**
 * Border width value accepted by public box styles.
 *
 * Numeric values are deck layout units. String values are closed to CSS-like border width keywords
 * and non-negative length tokens.
 */
export type BorderWidthValue = number | CssBorderWidth;
type CssBorderShorthandWidth = CssBorderWidthKeyword | "0" | `${number}${"in" | "pt" | "px" | "%"}`;
type CssBorderShorthandColor = CssNamedColor | CssHexColor | CssRgbColor | CssHslColor;
type CssBorderShorthandToken =
  | CssBorderStyleKeyword
  | CssBorderShorthandWidth
  | CssBorderShorthandColor;
/**
 * CSS border shorthand accepted by public authoring styles.
 *
 * The type keeps the first token inside deckjsx's public CSS-like vocabulary, while detailed
 * shorthand order, color validity, and unsupported border styles are validated by runtime
 * diagnostics. This avoids expanding a very large TypeScript union for every border-bearing style.
 */
export type CssBorderShorthand =
  | CssBorderShorthandToken
  | `${CssBorderShorthandWidth} ${CssBorderStyleKeyword}`
  | `${CssBorderStyleKeyword} ${CssBorderShorthandWidth}`
  | `${CssBorderStyleKeyword} ${string}`
  | `${CssBorderShorthandWidth} ${CssBorderStyleKeyword} ${string}`
  | `${CssBorderStyleKeyword} ${CssBorderShorthandWidth} ${string}`;
export type CssStrokeShorthand = CssColor | CssBorderShorthand;
export type StrokeDashType =
  | "solid"
  | "dash"
  | "dashDot"
  | "lgDash"
  | "lgDashDot"
  | "lgDashDotDot"
  | "sysDash"
  | "sysDot";
export type StrokeLineCap = "butt" | "round" | "square";
export type StrokeLineJoin = "miter" | "round" | "bevel";
type CssStrokeDasharrayNumberToken = CssNonNegativeNumberishString;
type CssStrokeDasharrayLengthToken = `${CssNonNegativeNumberString}${CssPointLengthUnit}`;
export type CssStrokeDasharrayToken = CssStrokeDasharrayNumberToken | CssStrokeDasharrayLengthToken;
export type CssStrokeDasharray =
  | "none"
  | CssStrokeDasharrayToken
  | `${CssStrokeDasharrayToken} ${CssStrokeDasharrayToken}`
  | `${CssStrokeDasharrayToken},${CssStrokeDasharrayToken}`
  | `${CssStrokeDasharrayToken}, ${CssStrokeDasharrayToken}`;
/** Vertical alignment keywords supported for text boxes and table cells. */
export type VerticalAlign = "top" | "middle" | "bottom";
/** Text fitting behavior supported by deckjsx text projection. */
export type TextFit = "none" | "shrink" | "resize";
export type CssTextDecorationLine = "none" | "underline" | "line-through";
export type CssTextDecoration =
  | CssTextDecorationLine
  | "underline line-through"
  | "line-through underline";
/** Display modes supported by the public authoring layout engine. */
export type CssDisplay = "flex" | "block" | "grid" | "none";
export type CssTableLayout = "auto" | "fixed";
export type CssBorderCollapse = "collapse" | "separate";
/**
 * Public positioning mode. Fixed slide geometry is authored with `position: "absolute"` plus
 * CSS positioning props such as `left`, `top`, `right`, `bottom`, and `inset`.
 */
export type CssPosition = "static" | "absolute" | "relative";
/** Visibility keywords supported by public authoring styles. */
export type CssVisibility = "visible" | "hidden";
/** Overflow behavior supported by deckjsx layout and PPTX clipping projection. */
export type CssOverflow = "visible" | "hidden";
/** Flex directions supported by public normal-flow layout. */
export type CssFlexDirection = "row" | "column";
/** Single CSS grid track size accepted by deckjsx grid layout. */
export type CssGridTrackSize =
  | "auto"
  | "0"
  | `${CssNonNegativeNumberString}${CssLengthUnit}`
  | `${CssNonNegativeNumberString}fr`;
export type CssGridMinmaxTrack =
  | `minmax(${CssGridTrackSize},${CssGridTrackSize})`
  | `minmax(${CssGridTrackSize}, ${CssGridTrackSize})`;
export type CssGridTrackString = CssGridTrackSize | CssGridMinmaxTrack;
export type CssGridRepeatCount = CssPositiveIntegerString | "auto-fill" | "auto-fit";
export type CssGridRepeatTrack =
  | `repeat(${CssGridRepeatCount},${CssGridTrackString})`
  | `repeat(${CssGridRepeatCount}, ${CssGridTrackString})`;
/**
 * Grid track value for `gridAutoColumns`, `gridAutoRows`, and template arrays.
 *
 * Numeric tracks are deck layout units. String tracks are limited to the CSS-like track syntax
 * deckjsx parses, avoiding arbitrary wide strings in public authoring types.
 */
export type CssGridTrack = number | CssGridTrackString;
export type CssGridTrackListItem = CssGridTrackString | CssGridRepeatTrack;
export type CssGridTemplateString =
  | CssGridTrackListItem
  | `${CssGridTrackSize} ${CssGridTrackSize}`
  | `${CssGridMinmaxTrack} ${CssGridTrackSize}`
  | `${CssGridTrackSize} ${CssGridMinmaxTrack}`
  | `auto ${CssGridTrackSize} auto`;
/** Grid template rows/columns accepted by public grid authoring. */
export type CssGridTemplate = readonly CssGridTrack[] | CssGridTemplateString;
type CssGridLinePositiveIntegerString = CssPositiveIntegerString;
export type CssGridLineString =
  | "auto"
  | CssGridLinePositiveIntegerString
  | `span ${CssGridLinePositiveIntegerString}`;
export type CssGridLine = number | CssGridLineString;
/** Grid row/column placement shorthand accepted by public grid authoring. */
export type CssGridPlacement =
  | number
  | `span ${CssGridLinePositiveIntegerString}`
  | `${CssGridLinePositiveIntegerString} / ${CssGridLinePositiveIntegerString}`
  | `${CssGridLinePositiveIntegerString}/${CssGridLinePositiveIntegerString}`
  | `${CssGridLinePositiveIntegerString} / span ${CssGridLinePositiveIntegerString}`
  | `${CssGridLinePositiveIntegerString}/span${CssGridLinePositiveIntegerString}`;
/** Cross-axis alignment keywords supported by deckjsx flex/grid layout. */
export type CssAlignItems = "start" | "flex-start" | "center" | "end" | "flex-end" | "stretch";
export type CssAlignSelf = CssAlignItems | "auto";
export type CssJustifySelf = CssAlignItems | "auto";
export type CssJustifyContent =
  | "start"
  | "flex-start"
  | "center"
  | "end"
  | "flex-end"
  | "stretch"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type CssAlignContent =
  | "start"
  | "flex-start"
  | "center"
  | "end"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch";
export type CssFlexWrap = "nowrap" | "wrap";
/**
 * Flex grow/shrink factor accepted by public authoring styles.
 *
 * TypeScript keeps this as a number so ratios can be computed. Compile diagnostics reject
 * negative, infinite, and NaN values as outside the public authoring API.
 */
export type CssFlexFactor = number;
/** Flex basis accepted by public flex authoring. */
export type CssFlexBasis = DeckLength | "auto";
/** Grid auto-flow keywords supported by deckjsx grid layout. */
export type CssGridAutoFlow = "row" | "column" | "row dense" | "column dense";
export type CssPlaceSelf = CssAlignSelf | `${CssAlignSelf} ${CssJustifySelf}`;
export type CssPlaceItems = CssAlignItems | `${CssAlignItems} ${CssJustifySelf}`;
export type CssPlaceContent = CssAlignContent | `${CssAlignContent} ${CssJustifyContent}`;
export type CssGridAreaLine =
  | CssGridLinePositiveIntegerString
  | "auto"
  | `span ${CssGridLinePositiveIntegerString}`;
/**
 * Diagnostics-validated CSS grid-area authoring string.
 *
 * Named grid areas and grid-area shorthands are broad enough that TypeScript only keeps the value
 * as authoring text. Runtime diagnostics enforce the supported public grid-area grammar.
 */
export type CssGridAreaAuthoringString = string;
/** One diagnostics-validated quoted row in a CSS grid-template-areas declaration. */
export type CssGridTemplateAreaRowAuthoringString = `"${string}"` | `'${string}'`;
/** Grid template areas accepted by public grid authoring. */
export type CssGridTemplateAreas = readonly CssGridTemplateAreaRowAuthoringString[];
export type CssObjectPositionKeyword = "left" | "center" | "right" | "top" | "bottom";
export type CssObjectPositionLength = Exclude<DeckLengthString, CssWideKeyword>;
export type CssObjectPositionHorizontalKeyword = "left" | "center" | "right";
export type CssObjectPositionVerticalKeyword = "top" | "center" | "bottom";
export type CssObjectPositionEdgeOffsetAuthoringString =
  | `${CssObjectPositionHorizontalKeyword} ${string} ${CssObjectPositionVerticalKeyword} ${string}`
  | `${CssObjectPositionVerticalKeyword} ${string} ${CssObjectPositionHorizontalKeyword} ${string}`;
/**
 * CSS object-position value accepted by image, video, and background positioning.
 *
 * The type keeps the first token inside deckjsx's public CSS-like vocabulary. Detailed
 * object-position combinations, edge-offset syntax, and malformed JavaScript/casted strings are
 * validated by runtime diagnostics before projection so TypeScript does not expand a large
 * template-literal union for every media style.
 */
export type CssObjectPosition =
  | CssObjectPositionKeyword
  | CssObjectPositionLength
  | `${CssObjectPositionKeyword | CssObjectPositionLength} ${CssObjectPositionKeyword | CssObjectPositionLength}`
  | CssObjectPositionEdgeOffsetAuthoringString;
type CssHexDigitLower = "a" | "b" | "c" | "d" | "e" | "f";
type CssHexDigit = CssDecimalDigit | CssHexDigitLower | Uppercase<CssHexDigitLower>;
/**
 * CSS hex color accepted by public authoring styles.
 *
 * The public type requires a leading `#` and at least one hex digit. Exact CSS hex lengths and
 * remaining characters are validated by deckjsx diagnostics so TypeScript does not have to expand a
 * large literal union for every color-bearing style.
 */
export type CssHexColor = `#${CssHexDigit}${string}`;
export type CssRgbColor = `rgb(${string})` | `rgba(${string})`;
export type CssHslColor = `hsl(${string})` | `hsla(${string})`;
/**
 * CSS color accepted by public authoring styles.
 *
 * Named colors are closed to deckjsx's supported CSS color table. Hex and color-function strings
 * are typed by recognizable CSS syntax and validated by compile diagnostics before projection.
 */
export type CssColor = CssNamedColor | CssHexColor | CssRgbColor | CssHslColor;
type CssPaintColor = CssNamedColor | CssHexColor | CssRgbColor | CssHslColor;
/**
 * CSS gradient string accepted by public authoring styles.
 *
 * The type accepts deckjsx gradient function names without expanding every valid first argument
 * character into editor hovers. deckjsx parses color stops and descriptors before projection;
 * empty or malformed argument lists are compile diagnostics for JavaScript and casted input.
 */
export type CssGradientAuthoringString =
  | `linear-gradient(${string})`
  | `radial-gradient(${string})`
  | `repeating-linear-gradient(${string})`
  | `repeating-radial-gradient(${string})`;
/**
 * Paint value accepted by public fill/background-like styles.
 *
 * The type admits recognizable CSS color, gradient, and `url(...)` image-source syntax. Values that
 * need full CSS parsing are validated by deckjsx runtime diagnostics before projection; malformed
 * JavaScript or casted strings are not silently accepted.
 */
export type CssPaint =
  | CssPaintColor
  | CssGradientAuthoringString
  | CssBackgroundImageSourceAuthoringString;
/**
 * CSS background authoring string parsed by deckjsx's supported CSS-like background parser.
 *
 * This is a named public value type, not an arbitrary string escape hatch. TypeScript narrows the
 * value to supported starting syntax, then runtime diagnostics validate background layers, colors,
 * gradients, image sources, size, repeat, and position details that are impractical to express as a
 * small template-literal type.
 */
export type CssBackgroundAuthoringString =
  | "none"
  | CssPaint
  | `${CssGradientAuthoringString} ${string}`
  | `${CssGradientAuthoringString}, ${string}`
  | `${CssBackgroundImageSourceAuthoringString} ${string}`
  | `${CssBackgroundImageSourceAuthoringString}, ${string}`;
/**
 * CSS background-image source accepted by deckjsx's public authoring API.
 *
 * The source must be expressed as a `url(...)`. Empty sources, whitespace-starting sources, and
 * unresolved assets are validated by deckjsx diagnostics instead of expanding every possible first
 * path character into editor hovers.
 */
export type CssBackgroundImageSourceAuthoringString =
  | `url(${string})`
  | `url("${string}")`
  | `url('${string}')`;
export type CssBackgroundRepeatKeyword = "no-repeat" | "repeat-x" | "repeat-y" | "repeat";
export type CssBackgroundBox = "border-box" | "padding-box" | "content-box";
export type CssTwoLayerList<T extends string> = T | `${T},${T}` | `${T}, ${T}`;
export type CssThreeLayerList<T extends string> =
  | CssTwoLayerList<T>
  | `${T},${T},${T}`
  | `${T}, ${T}, ${T}`;
export type CssBackgroundSizeLength = "0" | `${CssNonNegativeNumberString}${CssLengthUnit}`;
export type CssBackgroundSizeComponent = "auto" | CssBackgroundSizeLength;
export type CssBackgroundSizeKeyword = "cover" | "contain";
export type CssBackgroundSizeLayer =
  | CssBackgroundSizeKeyword
  | CssBackgroundSizeComponent
  | `${CssBackgroundSizeComponent} ${CssBackgroundSizeComponent}`;
export type CssBackgroundSizeLayerList =
  | "contain,100% 100%"
  | "contain, 100% 100%"
  | "cover,100% 100%"
  | "cover, 100% 100%"
  | "100% 100%,contain"
  | "100% 100%, contain"
  | "100% 100%,cover"
  | "100% 100%, cover";
export type CssBackgroundSize = CssBackgroundSizeLayer | CssBackgroundSizeLayerList;
export type CssBackgroundPositionToken = CssObjectPositionKeyword | CssObjectPositionLength;
export type CssBackgroundPositionLayer = CssObjectPosition;
/**
 * CSS background-position value accepted by public background styles.
 *
 * Single-layer and comma-separated values must start with public object-position tokens. Per-layer
 * tail grammar is validated by runtime diagnostics, keeping the authoring type precise enough to
 * reject unrelated strings without creating a large union of every valid position combination.
 */
export type CssBackgroundPosition =
  | CssBackgroundPositionLayer
  | `${CssBackgroundPositionToken}${string},${CssBackgroundPositionToken}${string}`
  | `${CssBackgroundPositionToken}${string}, ${CssBackgroundPositionToken}${string}`;
/** Background repeat keywords supported by deckjsx, including typed per-layer lists. */
export type CssBackgroundRepeat = CssThreeLayerList<CssBackgroundRepeatKeyword>;
/** Background origin/clip box keywords supported by deckjsx, including typed per-layer lists. */
export type CssBackgroundBoxList = CssThreeLayerList<CssBackgroundBox>;
/** Closed transform function names supported by deckjsx public authoring. */
export type CssTransformFunctionName =
  | "rotate"
  | "rotateZ"
  | "rotatez"
  | "translate"
  | "translateX"
  | "translatex"
  | "translateY"
  | "translatey"
  | "scale"
  | "scaleX"
  | "scalex"
  | "scaleY"
  | "scaley"
  | "skew"
  | "skewX"
  | "skewx"
  | "skewY"
  | "skewy"
  | "matrix";
/**
 * Diagnostics-validated CSS transform authoring string.
 *
 * Public authoring is limited to the transform functions deckjsx can normalize; argument
 * validation is performed by the transform parser during layout/projection. Unsupported JavaScript
 * or casted strings are compile diagnostics, not permissive CSS pass-through.
 */
export type CssTransformAuthoringString = "none" | `${CssTransformFunctionName}(${string})`;
/**
 * Closed filter function names supported by deckjsx public authoring.
 *
 * Current PPTX projection preserves non-`none` filters as inspectable fallback semantics.
 */
export type CssFilterFunctionName =
  | "blur"
  | "brightness"
  | "contrast"
  | "drop-shadow"
  | "grayscale"
  | "hue-rotate"
  | "invert"
  | "opacity"
  | "saturate"
  | "sepia";
/**
 * Diagnostics-validated CSS filter authoring string.
 *
 * Public authoring is limited to recognizable CSS filter function syntax instead of arbitrary
 * strings. Malformed JavaScript or casted strings are compile diagnostics.
 */
export type CssFilterAuthoringString = "none" | `${CssFilterFunctionName}(${string})`;
export type CssTransformOriginKeyword = "left" | "center" | "right" | "top" | "bottom";
export type CssTransformOriginLength = Exclude<DeckLengthString, CssWideKeyword>;
export type CssTransformOriginToken = CssTransformOriginKeyword | CssTransformOriginLength;
export type CssTransformOrigin =
  | CssTransformOriginToken
  | `${CssTransformOriginToken} ${CssTransformOriginToken}`;
/** Signed offset/spread length token accepted by the public shadow shorthand type. */
export type CssShadowLength = "0" | `${number}${"px" | "pt" | "in"}`;
/** Non-negative blur length token accepted by the public shadow shorthand type. */
export type CssShadowBlurLength = "0" | `${CssNonNegativeNumberString}${"px" | "pt" | "in"}`;
type CssShadowColorPrefix = "#" | "rgb(" | "rgba(" | "hsl(" | "hsla(";
export type CssShadowColor = `${CssShadowColorPrefix}${string}`;
export type CssShadowCore = `${CssShadowLength} ${CssShadowLength}`;
export type CssShadowBlur = `${CssShadowCore} ${CssShadowBlurLength}`;
export type CssShadowSpread = `${CssShadowBlur} ${CssShadowLength}`;
export type CssShadowLayer =
  | CssShadowCore
  | CssShadowBlur
  | CssShadowSpread
  | `${CssShadowCore} ${CssShadowColor}`
  | `${CssShadowBlur} ${CssShadowColor}`
  | `${CssShadowSpread} ${CssShadowColor}`;
/**
 * CSS shadow authoring string parsed by deckjsx before projection.
 *
 * The public type accepts a single shadow layer with deck length tokens and a public CSS color.
 * JavaScript or casted multi-layer values are rejected by runtime diagnostics; use this as a
 * supported deckjsx shadow subset rather than a generic CSS string.
 */
export type CssShadow = "none" | CssShadowLayer | `inset ${CssShadowLayer}`;
export type CssMixBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";
/**
 * CSS integer-like ordering value accepted by public authoring styles.
 *
 * TypeScript keeps this as a number so computed values are ergonomic. Compile diagnostics reject
 * fractional, infinite, and NaN values. Negative integers are allowed for CSS `order` and `zIndex`.
 */
export type CssInteger = number;
/**
 * HTTP(S) hyperlink accepted by public authoring.
 *
 * The type keeps the protocol prefix closed without enumerating every possible first host
 * character, which keeps VSCode hover and completion readable. Empty hosts, whitespace, and URL
 * parser details are validated by compile diagnostics for JavaScript and casted input.
 */
export type CssHttpHyperlinkAuthoringString = `http://${string}` | `https://${string}`;
/**
 * Mail hyperlink accepted by public authoring.
 *
 * Recipient shape is validated by compile diagnostics instead of expanding a large template
 * literal union in editor type display.
 */
export type CssMailtoHyperlinkAuthoringString = `mailto:${string}`;
/** External hyperlink URL accepted by the public authoring API. */
export type CssExternalHyperlinkAuthoringString =
  | CssHttpHyperlinkAuthoringString
  | CssMailtoHyperlinkAuthoringString;
/**
 * Tooltip text accepted alongside hyperlink styles.
 *
 * TypeScript represents this as a string so authoring can use arbitrary human language text.
 * Empty and whitespace-only values are rejected by compile diagnostics as values outside the
 * public authoring API.
 */
export type TooltipText = string;
export type CssGenericFontFamily =
  | "serif"
  | "sans-serif"
  | "monospace"
  | "cursive"
  | "fantasy"
  | "system-ui"
  | "ui-serif"
  | "ui-sans-serif"
  | "ui-monospace"
  | "ui-rounded"
  | "emoji"
  | "math"
  | "fangsong";
/** Diagnostics-validated quoted CSS font-family authoring string. */
export type CssQuotedFontFamilyAuthoringString = `"${string}"` | `'${string}'`;
/**
 * CSS font-family authoring value accepted by deckjsx text styles.
 *
 * Public authoring accepts CSS generic families, quoted family names, and CSS custom
 * identifier-like family names. Runtime diagnostics continue to reject malformed quoted strings or
 * token sequences outside the public authoring API for JavaScript and casted input.
 */
export type CssFontFamilyAuthoringString = string;
/**
 * CSS font-weight authoring values supported by deckjsx.
 *
 * Numeric authoring is closed to the common CSS hundred-step scale so accidental arbitrary numbers
 * fail at the public type boundary.
 */
export type CssFontWeight = "normal" | "bold" | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
/**
 * Public starting number for authored numbered lists.
 *
 * The range is intentionally capped to small positive integer literals so invalid values such as
 * `0`, negative numbers, and fractions fail at the authoring boundary instead of being deferred to
 * PPTX validation.
 */
export type ListStart =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 39
  | 40
  | 41
  | 42
  | 43
  | 44
  | 45
  | 46
  | 47
  | 48
  | 49
  | 50
  | 51
  | 52
  | 53
  | 54
  | 55
  | 56
  | 57
  | 58
  | 59
  | 60
  | 61
  | 62
  | 63
  | 64
  | 65
  | 66
  | 67
  | 68
  | 69
  | 70
  | 71
  | 72
  | 73
  | 74
  | 75
  | 76
  | 77
  | 78
  | 79
  | 80
  | 81
  | 82
  | 83
  | 84
  | 85
  | 86
  | 87
  | 88
  | 89
  | 90
  | 91
  | 92
  | 93
  | 94
  | 95
  | 96
  | 97
  | 98
  | 99;
/**
 * Public crop inset value for media elements.
 *
 * Numeric values are crop ratios. Compile diagnostics reject invalid numeric values for
 * JavaScript/casted inputs.
 * Percentage string values are closed to the authored range `0%` inclusive through `100%`
 * exclusive at the TypeScript boundary.
 */
export type ImageCropValue = number | CssCropPercentString;
export type TextTabStopLength = NonNegativeDeckPointLength;
export type TextTabStopAlignment = "left" | "right" | "center" | "decimal";
export type TextTabStopAuthoring = {
  position: TextTabStopLength;
  alignment?: TextTabStopAlignment;
};
export type ImageCropAuthoring = {
  top?: ImageCropValue;
  right?: ImageCropValue;
  bottom?: ImageCropValue;
  left?: ImageCropValue;
};

type BaseAuthorProps = {
  opacity?: number;
  transform?: CssTransformAuthoringString;
  transformOrigin?: CssTransformOrigin;
  filter?: CssFilterAuthoringString;
  mixBlendMode?: CssMixBlendMode;
  isolation?: "auto" | "isolate";
  zIndex?: CssInteger;
  overflow?: CssOverflow;
  alignSelf?: CssAlignSelf;
  justifySelf?: CssJustifySelf;
  placeSelf?: CssPlaceSelf;
  position?: CssPosition;
  order?: CssInteger;
  flexGrow?: CssFlexFactor;
  flexShrink?: CssFlexFactor;
  flexBasis?: CssFlexBasis;
  gridArea?: CssGridAreaAuthoringString;
  gridColumnStart?: CssGridLine;
  gridColumnEnd?: CssGridLine;
  gridRowStart?: CssGridLine;
  gridRowEnd?: CssGridLine;
  gridColumn?: CssGridPlacement;
  gridRow?: CssGridPlacement;
};

/**
 * CSS-like layout, positioning, sizing, and flow participation shared by authored elements.
 *
 * This is a public authoring contract. It describes properties authors may write in TSX `style`
 * objects; it is not the internal normalized layout representation. Normal flow is the default.
 * Fixed slide placement is explicit via `position: "absolute"` plus CSS positioning properties
 * such as `left`, `top`, `right`, `bottom`, or `inset`.
 */
export type LayoutStyle = BaseAuthorProps & {
  display?: CssDisplay;
  visibility?: CssVisibility;
  inset?: Spacing;
  left?: DeckLength;
  top?: DeckLength;
  right?: DeckLength;
  bottom?: DeckLength;
  width?: NonNegativeDeckLength;
  height?: NonNegativeDeckLength;
  aspectRatio?: CssAspectRatio;
  minWidth?: NonNegativeDeckLength;
  minHeight?: NonNegativeDeckLength;
  maxWidth?: NonNegativeDeckLength;
  maxHeight?: NonNegativeDeckLength;
};

/**
 * CSS-like box paint, border, shadow, margin, and padding properties for box-generating elements.
 *
 * String values are intentionally limited to the CSS-like syntax deckjsx parses and validates at
 * compile time. Keys and values outside the public authoring API are reported by diagnostics.
 */
export type BoxStyle = {
  boxSizing?: CssBoxSizing;
  background?: CssBackgroundAuthoringString;
  backgroundImage?: CssBackgroundImageSourceAuthoringString;
  backgroundColor?: CssColor;
  backgroundPosition?: CssBackgroundPosition;
  backgroundSize?: CssBackgroundSize;
  backgroundRepeat?: CssBackgroundRepeat;
  backgroundClip?: CssBackgroundBoxList;
  backgroundOrigin?: CssBackgroundBoxList;
  boxShadow?: CssShadow;
  border?: CssBorderShorthand;
  borderColor?: CssColor;
  borderWidth?: BorderWidthValue;
  borderStyle?: BorderStyle;
  borderTop?: CssBorderShorthand;
  borderRight?: CssBorderShorthand;
  borderBottom?: CssBorderShorthand;
  borderLeft?: CssBorderShorthand;
  borderTopColor?: CssColor;
  borderRightColor?: CssColor;
  borderBottomColor?: CssColor;
  borderLeftColor?: CssColor;
  borderTopWidth?: BorderWidthValue;
  borderRightWidth?: BorderWidthValue;
  borderBottomWidth?: BorderWidthValue;
  borderLeftWidth?: BorderWidthValue;
  borderTopStyle?: BorderStyle;
  borderRightStyle?: BorderStyle;
  borderBottomStyle?: BorderStyle;
  borderLeftStyle?: BorderStyle;
  borderRadius?: NonNegativeDeckLength;
  outline?: CssBorderShorthand;
  outlineColor?: CssColor;
  outlineWidth?: BorderWidthValue;
  outlineStyle?: BorderStyle;
  margin?: Spacing;
  marginTop?: DeckLength;
  marginRight?: DeckLength;
  marginBottom?: DeckLength;
  marginLeft?: DeckLength;
  paddingTop?: NonNegativeDeckLength;
  paddingRight?: NonNegativeDeckLength;
  paddingBottom?: NonNegativeDeckLength;
  paddingLeft?: NonNegativeDeckLength;
};

/** Flow layout style accepted by slide roots and slide templates. */
export type SlideRootFlowStyle = {
  display?: CssDisplay;
  flexDirection?: CssFlexDirection;
  gap?: NonNegativeDeckLength;
  rowGap?: NonNegativeDeckLength;
  columnGap?: NonNegativeDeckLength;
  padding?: NonNegativeSpacing;
  alignItems?: CssAlignItems;
  justifyContent?: CssJustifyContent;
  justifyItems?: CssJustifySelf;
  placeItems?: CssPlaceItems;
  alignContent?: CssAlignContent;
  placeContent?: CssPlaceContent;
  flexWrap?: CssFlexWrap;
  gridTemplateAreas?: CssGridTemplateAreas;
  gridTemplateColumns?: CssGridTemplate;
  gridTemplateRows?: CssGridTemplate;
  gridAutoColumns?: CssGridTrack;
  gridAutoRows?: CssGridTrack;
  gridAutoFlow?: CssGridAutoFlow;
};

export type SlideStyle = SlideRootFlowStyle & {
  background?: CssBackgroundAuthoringString;
  backgroundImage?: CssBackgroundImageSourceAuthoringString;
  backgroundColor?: CssColor;
  backgroundPosition?: CssBackgroundPosition;
  backgroundSize?: CssBackgroundSize;
  backgroundRepeat?: CssBackgroundRepeat;
  backgroundClip?: CssBackgroundBoxList;
  backgroundOrigin?: CssBackgroundBoxList;
};

/** Style accepted by view-like authored elements such as `div`, `section`, and `main`. */
export type ViewStyle = LayoutStyle & BoxStyle & SlideRootFlowStyle;

/** Style accepted by table authored elements. */
export type TableStyle = ViewStyle & {
  tableLayout?: CssTableLayout;
  borderCollapse?: CssBorderCollapse;
};

/** Style accepted by table section authored elements such as `thead`, `tbody`, and `tfoot`. */
export type TableSectionStyle = ViewStyle;

/** Style accepted by table row authored elements. */
export type TableRowStyle = ViewStyle;

/** Style accepted by block text authored elements such as `p`, `h1`, and `h2`. */
export type TextStyle = LayoutStyle &
  BoxStyle & {
    fontFamily?: CssFontFamilyAuthoringString;
    fontSize?: NonNegativeDeckPointLength;
    fontWeight?: CssFontWeight;
    fontStyle?: "normal" | "italic";
    textDecoration?: CssTextDecoration;
    textDecorationLine?: CssTextDecoration;
    textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
    textDecorationColor?: CssColor;
    textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
    direction?: "ltr" | "rtl";
    writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
    color?: CssColor;
    textAlign?: "left" | "center" | "right" | "justify";
    verticalAlign?: VerticalAlign;
    padding?: NonNegativeSpacing;
    lineHeight?: NonNegativeDeckPointLength | "normal";
    paragraphSpacingBefore?: NonNegativeDeckPointLength;
    paragraphSpacingAfter?: NonNegativeDeckPointLength;
    textIndent?: CssPointLength;
    tabStops?: readonly TextTabStopAuthoring[];
    letterSpacing?: CssLetterSpacing;
    whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
    wordBreak?: "normal" | "break-all" | "keep-all" | "break-word";
    overflowWrap?: "normal" | "break-word" | "anywhere";
    href?: CssExternalHyperlinkAuthoringString;
    tooltip?: TooltipText;
    listStyleType?:
      | "none"
      | "disc"
      | "circle"
      | "square"
      | "decimal"
      | "lower-alpha"
      | "upper-alpha"
      | "lower-roman"
      | "upper-roman";
    listStart?: ListStart;
    listIndent?: NonNegativeDeckPointLength;
    superscript?: boolean;
    subscript?: boolean;
    textShadow?: CssShadow;
    fit?: TextFit;
  };

export type ImageFit = "contain" | "cover" | "fill";

/** Style accepted by image authored elements. */
export type ImageStyle = LayoutStyle & {
  objectFit?: ImageFit;
  objectPosition?: CssObjectPosition;
  crop?: ImageCropAuthoring;
  href?: CssExternalHyperlinkAuthoringString;
  tooltip?: TooltipText;
  borderRadius?: NonNegativeDeckLength;
  boxShadow?: CssShadow;
  margin?: Spacing;
  marginTop?: DeckLength;
  marginRight?: DeckLength;
  marginBottom?: DeckLength;
  marginLeft?: DeckLength;
};

/** Style accepted by video authored elements. */
export type VideoStyle = LayoutStyle & {
  objectFit?: ImageFit;
  objectPosition?: CssObjectPosition;
  borderRadius?: NonNegativeDeckLength;
  boxShadow?: CssShadow;
  margin?: Spacing;
  marginTop?: DeckLength;
  marginRight?: DeckLength;
  marginBottom?: DeckLength;
  marginLeft?: DeckLength;
};

/** Style accepted by shape authored elements. */
export type ShapeStyle = LayoutStyle &
  Omit<BoxStyle, "backgroundColor" | "borderRadius"> & {
    background?: CssBackgroundAuthoringString;
    backgroundColor?: CssColor;
    href?: CssExternalHyperlinkAuthoringString;
    tooltip?: TooltipText;
    fill?: CssPaint;
    stroke?: CssStrokeShorthand;
    strokeDasharray?: CssStrokeDasharray;
    strokeLinecap?: StrokeLineCap;
    strokeLinejoin?: StrokeLineJoin;
    borderRadius?: NonNegativeDeckLength;
  };

/**
 * Style accepted by inline text runs such as `span`.
 *
 * Inline runs intentionally expose typography, hyperlink, and text effect styles only. Layout,
 * box, and media styles belong to the surrounding block or media element.
 */
export type TextRunStyle = Pick<
  TextStyle,
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "textDecoration"
  | "textDecorationLine"
  | "textDecorationStyle"
  | "textDecorationColor"
  | "textTransform"
  | "direction"
  | "writingMode"
  | "color"
  | "verticalAlign"
  | "letterSpacing"
  | "href"
  | "tooltip"
  | "superscript"
  | "subscript"
  | "textShadow"
>;

/** Style surface for targetless StyleSheet classes. Use `target` for element-specific styles. */
export type UntargetedStyleClassStyle = {
  readonly [Key in string]?: never;
};

export type TableCellStyle = TextStyle;

/**
 * Public style contract for an authored tag.
 *
 * `StyleForAuthoredTag<"p">` resolves to text style, `StyleForAuthoredTag<"img">` resolves to
 * image style, table tags resolve to their table-specific surfaces, and view-like authored tags
 * resolve to view style. StyleSheet targets and Theme defaults use this mapping to keep authored
 * styles tag-specific instead of accepting one global style mix-in.
 */
type AuthoredTagStyleMap = {
  readonly [Tag in IntrinsicViewTag]: ViewStyle;
} & {
  readonly [Tag in IntrinsicTextTag]: TextStyle;
} & {
  readonly img: ImageStyle;
  readonly shape: ShapeStyle;
  readonly span: TextRunStyle;
  readonly table: TableStyle;
  readonly tbody: TableSectionStyle;
  readonly td: TableCellStyle;
  readonly tfoot: TableSectionStyle;
  readonly th: TableCellStyle;
  readonly thead: TableSectionStyle;
  readonly tr: TableRowStyle;
  readonly video: VideoStyle;
};

export type StyleForAuthoredTag<TTag extends AuthoredTag> = AuthoredTagStyleMap[TTag];

import type { DeckOptions } from "../../authoring/options";
import type { AssetLoadResult, AssetProbeResult, AssetSource } from "../../assets";
import type { Diagnostics } from "../../diagnostics";
import type { AssetEntity, GraphNodeId, SemanticAuthorGraph, SemanticNode } from "../../graph";
import { assetEntityId } from "../../graph/identity";
import type { DeckIntegrationContext, FontAssetRegistration } from "../../integration-context";
import { buildLayoutInputSnapshot } from "../../layout/input";
import type {
  BackgroundImageLayerIR,
  BackgroundLayerIR,
  EdgeStrokeIR,
  FillIR,
  FrameIR,
  ImageSourceIR,
  LinearGradientFillIR,
  RadialGradientFillIR,
  ProjectedLayoutNode,
  ProjectedLayoutGroup,
  ProjectedLayoutImage,
  ProjectedLayoutShape,
  ProjectedLayoutSlide,
  ProjectedLayoutTable,
  ProjectedLayoutTableCell,
  ProjectedLayoutText,
  ProjectedUnsupportedSemantic,
  ProjectedLayoutVideo,
  ShadowIR,
  StrokeIR,
  TextStyleIR,
} from "../../layout/projected";
import { resolveProjectedLayout } from "../../layout/resolve";
import { textFontMetricsFromRegistrations } from "../../layout/text-metrics";
import { normalizeColor } from "../../style/color";
import { DEFAULT_FONT_SIZE_PT } from "../../style/length";
import type { ResolvedStyle, ResolvedStyleMap } from "../../style/resolve";
import { parseShadowShorthand } from "../../style/shadow";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../../types";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "./identity";
import { pdfCssColorFilterAdjustsColor, pdfCssColorFilterTransform } from "./filter-color";
import { shapedGlyphRunForPdf, shapedTextWidthUnits } from "../../font/shaping";
import { fontFamilyList } from "../../font/family";
import type {
  PdfBlendMode,
  PdfContentOp,
  PdfElementOrigin,
  PdfFallback,
  PdfFontResource,
  PdfGradientResource,
  PdfGradientStop,
  PdfImageResource,
  PdfLinearGradientResource,
  PdfRadialGradientResource,
  PdfPageAnnotation,
  PdfPage,
  PdfPageModel,
  PdfPaintOrderInput,
  PdfPoint,
  PdfRectangle,
  PdfResourceDictionary,
  PdfRgbColor,
  PdfShapeVisualElement,
  PdfVisualElement,
} from "./model";
import {
  annotationsFromPdfTextVisuals,
  contentOpsFromPdfVisuals,
  intersectPdfRectangles,
  linkAnnotationFromBox,
  transformedPdfRectangle,
} from "./lower";
import { pdfEmbeddablePngImage } from "./png";
import { pdfTextEncodingIsSupported } from "./text-encoding";
import {
  parseTrueTypeCodeUnitGlyphIds,
  parseTrueTypeCodeUnitWidths,
  parseTrueTypeFontKerning,
  parseTrueTypeFontMetrics,
  trueTypeFontHasCmap,
} from "../../font/truetype";
import {
  HELVETICA_ASCII_WIDTH_UNITS_BY_CODE,
  HELVETICA_BOLD_ASCII_WIDTH_UNITS_BY_CODE,
} from "../../font/standard-metrics";

const EMU_PER_POINT = EMU_PER_INCH / POINTS_PER_INCH;
const DEFAULT_FONT_RESOURCE_ID = pdfResourceId("font", "default-helvetica");
const DEFAULT_BOLD_FONT_RESOURCE_ID = pdfResourceId("font", "default-helvetica-bold");
const DEFAULT_ITALIC_FONT_RESOURCE_ID = pdfResourceId("font", "default-helvetica-oblique");
const DEFAULT_BOLD_ITALIC_FONT_RESOURCE_ID = pdfResourceId(
  "font",
  "default-helvetica-bold-oblique",
);
const DEFAULT_UNICODE_FONT_RESOURCE_ID = pdfResourceId("font", "default-unicode-identity-h");
const DEFAULT_NORMAL_LINE_HEIGHT_MULTIPLE = 1.2;
const DEFAULT_TAB_STOP_PT = 36;
const DEFAULT_PDF_TEXT_COLOR: PdfRgbColor = { r: 0, g: 0, b: 0 };
const DEFAULT_FONT_RESOURCE: PdfFontResource = {
  id: DEFAULT_FONT_RESOURCE_ID,
  name: "F1",
  family: "Helvetica",
  weight: 400,
  style: "normal",
  fallback: false,
};
const DEFAULT_BOLD_FONT_RESOURCE: PdfFontResource = {
  id: DEFAULT_BOLD_FONT_RESOURCE_ID,
  name: "FHelveticaBold",
  family: "Helvetica",
  weight: 700,
  style: "normal",
  fallback: false,
};
const DEFAULT_ITALIC_FONT_RESOURCE: PdfFontResource = {
  id: DEFAULT_ITALIC_FONT_RESOURCE_ID,
  name: "FHelveticaOblique",
  family: "Helvetica",
  weight: 400,
  style: "italic",
  fallback: false,
};
const DEFAULT_BOLD_ITALIC_FONT_RESOURCE: PdfFontResource = {
  id: DEFAULT_BOLD_ITALIC_FONT_RESOURCE_ID,
  name: "FHelveticaBoldOblique",
  family: "Helvetica",
  weight: 700,
  style: "italic",
  fallback: false,
};
const DEFAULT_UNICODE_FONT_RESOURCE: PdfFontResource = {
  id: DEFAULT_UNICODE_FONT_RESOURCE_ID,
  name: "FUnicode",
  family: "HeiseiKakuGo-W5",
  encoding: "identity-h",
  fallback: true,
};
const DEFAULT_FONT_RESOURCES: readonly PdfFontResource[] = [
  DEFAULT_FONT_RESOURCE,
  DEFAULT_BOLD_FONT_RESOURCE,
  DEFAULT_ITALIC_FONT_RESOURCE,
  DEFAULT_BOLD_ITALIC_FONT_RESOURCE,
  DEFAULT_UNICODE_FONT_RESOURCE,
];

type PdfProjectionAssetArtifact = {
  readonly source?: AssetSource;
  readonly probe?: AssetProbeResult;
  readonly load?: AssetLoadResult;
  readonly resolverIdentity?: string;
};

type PdfTextLayoutRun = {
  readonly text: string;
  readonly style?: TextStyleIR;
  readonly hyperlink?: { readonly url: string; readonly tooltip?: string };
};

function pdfOpacity(value: number | undefined): number | undefined {
  if (value === undefined || value >= 1 || value < 0 || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function pdfOpacityFromTransparency(value: number | undefined): number | undefined {
  if (value === undefined || value <= 0 || !Number.isFinite(value)) {
    return undefined;
  }

  return pdfOpacity(1 - Math.min(value, 100) / 100);
}

function combinePdfOpacity(
  inheritedOpacity: number | undefined,
  ownOpacity: number | undefined,
): number | undefined {
  const inherited = pdfOpacity(inheritedOpacity) ?? 1;
  const own = pdfOpacity(ownOpacity) ?? 1;
  return pdfOpacity(inherited * own);
}

type PdfCssFilterFunction = {
  readonly name: string;
  readonly args: string;
};

type PdfCssFilterLengthContext = {
  readonly viewportHeightPt?: number;
  readonly viewportWidthPt?: number;
};

function pdfCssFilterFunctions(value: string): readonly PdfCssFilterFunction[] {
  const normalized = value.trim();
  const functionMatches = [...normalized.matchAll(/([a-z-]+)\(((?:[^()]|\([^()]*\))*)\)/giu)];
  if (functionMatches.length === 0) {
    return [];
  }

  if (!pdfCssFilterFunctionMatchesCoverValue(normalized, functionMatches)) {
    return [];
  }

  return functionMatches.map((match) => ({
    name: match[1]!.toLowerCase(),
    args: match[2]!.trim(),
  }));
}

function pdfCssFilterFunctionMatchesCoverValue(
  value: string,
  matches: readonly RegExpMatchArray[],
): boolean {
  let offset = 0;
  for (const match of matches) {
    const index = match.index ?? -1;
    if (index < offset || value.slice(offset, index).trim().length > 0) {
      return false;
    }
    offset = index + match[0].length;
  }

  return value.slice(offset).trim().length === 0;
}

function pdfOpacityFromCssOpacityFilterArgs(value: string): number | undefined {
  const match = /^([+-]?(?:\d+|\d*\.\d+))\s*(%)?$/iu.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const raw = Number.parseFloat(match[1]!);
  if (!Number.isFinite(raw)) {
    return undefined;
  }

  const opacity = match[2] ? raw / 100 : raw;
  return Math.min(Math.max(opacity, 0), 1);
}

function pdfCssFilterNumberArgs(value: string):
  | {
      readonly unit?: string;
      readonly value: number;
    }
  | undefined {
  const match = /^([+-]?(?:\d+|\d*\.\d+))\s*([a-z%]*)$/iu.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]!);
  return Number.isFinite(parsed)
    ? { value: parsed, ...(match[2] ? { unit: match[2]!.toLowerCase() } : {}) }
    : undefined;
}

function pdfCssFilterLengthPt(
  value: string,
  context?: PdfCssFilterLengthContext,
): number | undefined {
  const args = pdfCssFilterNumberArgs(value);
  if (!args) {
    return undefined;
  }

  switch (args.unit) {
    case undefined:
    case "px":
    case "pt":
      return args.value;
    case "in":
      return args.value * POINTS_PER_INCH;
    case "cm":
      return (args.value / 2.54) * POINTS_PER_INCH;
    case "mm":
      return (args.value / 25.4) * POINTS_PER_INCH;
    case "q":
      return (args.value / 101.6) * POINTS_PER_INCH;
    case "pc":
      return args.value * 12;
    case "em":
    case "rem":
      return args.value * DEFAULT_FONT_SIZE_PT;
    case "ch":
      return args.value * DEFAULT_FONT_SIZE_PT * 0.5;
    case "vw":
      return context?.viewportWidthPt === undefined
        ? undefined
        : (context.viewportWidthPt * args.value) / 100;
    case "vh":
      return context?.viewportHeightPt === undefined
        ? undefined
        : (context.viewportHeightPt * args.value) / 100;
    case "vmin":
      return context?.viewportWidthPt === undefined || context.viewportHeightPt === undefined
        ? undefined
        : (Math.min(context.viewportWidthPt, context.viewportHeightPt) * args.value) / 100;
    case "vmax":
      return context?.viewportWidthPt === undefined || context.viewportHeightPt === undefined
        ? undefined
        : (Math.max(context.viewportWidthPt, context.viewportHeightPt) * args.value) / 100;
    default:
      return undefined;
  }
}

function pdfCssFilterFunctionIsVisualNoop(filter: PdfCssFilterFunction): boolean {
  const args = pdfCssFilterNumberArgs(filter.args);
  if (!args) {
    return false;
  }

  switch (filter.name) {
    case "blur":
      return args.value === 0;
    case "brightness":
    case "contrast":
    case "saturate":
      return args.unit === "%" ? args.value === 100 : args.value === 1;
    case "grayscale":
    case "sepia":
    case "invert":
      return (args.unit === undefined || args.unit === "%") && args.value === 0;
    case "hue-rotate":
      return (
        args.value === 0 &&
        (args.unit === undefined ||
          args.unit === "deg" ||
          args.unit === "rad" ||
          args.unit === "turn")
      );
    case "opacity":
      return args.unit === "%" ? args.value === 100 : args.value === 1;
    default:
      return false;
  }
}

function pdfCssFilterIsVisualNoop(value: string): boolean {
  const filters = pdfCssFilterFunctions(value);
  return filters.length > 0 && filters.every(pdfCssFilterFunctionIsVisualNoop);
}

function pdfCssVisibleEffectFilterFunctions(value: string): readonly PdfCssFilterFunction[] {
  return pdfCssFilterFunctions(value).filter((filter) => !pdfCssFilterFunctionIsVisualNoop(filter));
}

function pdfOpacityFromCssFilter(value: string): number | undefined {
  const opacityValues = pdfCssFilterFunctions(value).flatMap((filter) => {
    if (filter.name !== "opacity") {
      return [];
    }

    const opacity = pdfOpacityFromCssOpacityFilterArgs(filter.args);
    return opacity === undefined ? [] : [opacity];
  });
  if (!opacityValues.length) {
    return undefined;
  }

  return opacityValues.reduce((opacity, value) => opacity * value, 1);
}

function pdfBlurRadiusFromCssFilter(
  value: string,
  context?: PdfCssFilterLengthContext,
): number | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  const blurFilters = visibleEffectFilters.filter((filter) => filter.name === "blur");
  if (
    visibleEffectFilters.length === 0 ||
    blurFilters.length !== 1 ||
    visibleEffectFilters.some(
      (filter) =>
        filter.name !== "blur" &&
        (filter.name !== "opacity" ||
          pdfOpacityFromCssOpacityFilterArgs(filter.args) === undefined),
    )
  ) {
    return undefined;
  }

  const radius = pdfCssFilterLengthPt(blurFilters[0]!.args, context);
  return radius !== undefined && Number.isFinite(radius) && radius > 0 ? radius : undefined;
}

function pdfCssFilterIsProjectedAsOpacity(value: string): boolean {
  const filters = pdfCssFilterFunctions(value);
  return (
    filters.length > 0 &&
    filters.every(
      (filter) =>
        filter.name === "opacity" && pdfOpacityFromCssOpacityFilterArgs(filter.args) !== undefined,
    )
  );
}

function pdfCssFilterIsProjectedAsSolidBlur(
  value: string,
  context?: PdfCssFilterLengthContext,
): boolean {
  return pdfBlurRadiusFromCssFilter(value, context) !== undefined;
}

function pdfDropShadowFromCssFilter(value: string): ShadowIR | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  const dropShadowFilters = visibleEffectFilters.filter((filter) => filter.name === "drop-shadow");
  if (
    visibleEffectFilters.length === 0 ||
    dropShadowFilters.length !== 1 ||
    visibleEffectFilters.some(
      (filter) =>
        filter.name !== "drop-shadow" &&
        (filter.name !== "opacity" ||
          pdfOpacityFromCssOpacityFilterArgs(filter.args) === undefined),
    )
  ) {
    return undefined;
  }

  try {
    const shadow = parseShadowShorthand(dropShadowFilters[0]!.args);
    return shadow?.type === "outer" ? shadow : undefined;
  } catch {
    return undefined;
  }
}

function pdfCssFilterIsProjectedAsDropShadow(value: string): boolean {
  return pdfDropShadowFromCssFilter(value) !== undefined;
}

function pdfBrightnessFactorFromCssFilter(value: string): number | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  if (visibleEffectFilters.length !== 1 || visibleEffectFilters[0]?.name !== "brightness") {
    return undefined;
  }

  const args = pdfCssFilterNumberArgs(visibleEffectFilters[0].args);
  if (!args) {
    return undefined;
  }

  const factor = args.unit === "%" ? args.value / 100 : args.value;
  return Number.isFinite(factor) && factor >= 0 ? factor : undefined;
}

function pdfBrightnessAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const adjust = (channel: number) => Math.min(1, Math.max(0, channel * factor));
  return {
    r: adjust(color.r),
    g: adjust(color.g),
    b: adjust(color.b),
  };
}

function pdfContrastFactorFromCssFilter(value: string): number | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  if (visibleEffectFilters.length !== 1 || visibleEffectFilters[0]?.name !== "contrast") {
    return undefined;
  }

  const args = pdfCssFilterNumberArgs(visibleEffectFilters[0].args);
  if (!args) {
    return undefined;
  }

  const factor = args.unit === "%" ? args.value / 100 : args.value;
  return Number.isFinite(factor) && factor >= 0 ? factor : undefined;
}

function pdfContrastAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const adjust = (channel: number) => Math.min(1, Math.max(0, (channel - 0.5) * factor + 0.5));
  return {
    r: adjust(color.r),
    g: adjust(color.g),
    b: adjust(color.b),
  };
}

function pdfSaturateFactorFromCssFilter(value: string): number | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  if (visibleEffectFilters.length !== 1 || visibleEffectFilters[0]?.name !== "saturate") {
    return undefined;
  }

  const args = pdfCssFilterNumberArgs(visibleEffectFilters[0].args);
  if (!args) {
    return undefined;
  }

  const factor = args.unit === "%" ? args.value / 100 : args.value;
  return Number.isFinite(factor) && factor >= 0 ? factor : undefined;
}

function pdfSaturateAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return {
    r: clamp(
      (0.213 + 0.787 * factor) * color.r +
        (0.715 - 0.715 * factor) * color.g +
        (0.072 - 0.072 * factor) * color.b,
    ),
    g: clamp(
      (0.213 - 0.213 * factor) * color.r +
        (0.715 + 0.285 * factor) * color.g +
        (0.072 - 0.072 * factor) * color.b,
    ),
    b: clamp(
      (0.213 - 0.213 * factor) * color.r +
        (0.715 - 0.715 * factor) * color.g +
        (0.072 + 0.928 * factor) * color.b,
    ),
  };
}

function pdfUnitIntervalFactorFromCssFilter(value: string, name: string): number | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  if (visibleEffectFilters.length !== 1 || visibleEffectFilters[0]?.name !== name) {
    return undefined;
  }

  const args = pdfCssFilterNumberArgs(visibleEffectFilters[0].args);
  if (!args) {
    return undefined;
  }

  const factor = args.unit === "%" ? args.value / 100 : args.value;
  return Number.isFinite(factor) && factor >= 0 ? Math.min(factor, 1) : undefined;
}

function pdfGrayscaleFactorFromCssFilter(value: string): number | undefined {
  return pdfUnitIntervalFactorFromCssFilter(value, "grayscale");
}

function pdfGrayscaleAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  return pdfSaturateAdjustedColor(color, 1 - factor);
}

function pdfInvertFactorFromCssFilter(value: string): number | undefined {
  return pdfUnitIntervalFactorFromCssFilter(value, "invert");
}

function pdfInvertAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const adjust = (channel: number) => channel * (1 - factor) + (1 - channel) * factor;
  return {
    r: adjust(color.r),
    g: adjust(color.g),
    b: adjust(color.b),
  };
}

function pdfSepiaFactorFromCssFilter(value: string): number | undefined {
  return pdfUnitIntervalFactorFromCssFilter(value, "sepia");
}

function pdfSepiaAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  const sepia = {
    r: clamp(0.393 * color.r + 0.769 * color.g + 0.189 * color.b),
    g: clamp(0.349 * color.r + 0.686 * color.g + 0.168 * color.b),
    b: clamp(0.272 * color.r + 0.534 * color.g + 0.131 * color.b),
  };
  const mix = (from: number, to: number) => from * (1 - factor) + to * factor;
  return {
    r: mix(color.r, sepia.r),
    g: mix(color.g, sepia.g),
    b: mix(color.b, sepia.b),
  };
}

function pdfHueRotateRadiansFromCssFilter(value: string): number | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  if (visibleEffectFilters.length !== 1 || visibleEffectFilters[0]?.name !== "hue-rotate") {
    return undefined;
  }

  const args = pdfCssFilterNumberArgs(visibleEffectFilters[0].args);
  if (!args || !Number.isFinite(args.value)) {
    return undefined;
  }

  switch (args.unit) {
    case undefined:
    case "deg":
      return (args.value * Math.PI) / 180;
    case "rad":
      return args.value;
    case "turn":
      return args.value * Math.PI * 2;
    default:
      return undefined;
  }
}

function pdfHueRotateAdjustedColor(color: PdfRgbColor, radians: number): PdfRgbColor {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return {
    r: clamp(
      (0.213 + cos * 0.787 - sin * 0.213) * color.r +
        (0.715 - cos * 0.715 - sin * 0.715) * color.g +
        (0.072 - cos * 0.072 + sin * 0.928) * color.b,
    ),
    g: clamp(
      (0.213 - cos * 0.213 + sin * 0.143) * color.r +
        (0.715 + cos * 0.285 + sin * 0.14) * color.g +
        (0.072 - cos * 0.072 - sin * 0.283) * color.b,
    ),
    b: clamp(
      (0.213 - cos * 0.213 - sin * 0.787) * color.r +
        (0.715 - cos * 0.715 + sin * 0.715) * color.g +
        (0.072 + cos * 0.928 + sin * 0.072) * color.b,
    ),
  };
}

function pdfCssFilterFactorFromArgs(argsValue: string): number | undefined {
  const args = pdfCssFilterNumberArgs(argsValue);
  if (!args) {
    return undefined;
  }

  const factor = args.unit === "%" ? args.value / 100 : args.value;
  return Number.isFinite(factor) && factor >= 0 ? factor : undefined;
}

function pdfCssFilterUnitIntervalFactorFromArgs(argsValue: string): number | undefined {
  const factor = pdfCssFilterFactorFromArgs(argsValue);
  return factor === undefined ? undefined : Math.min(factor, 1);
}

function pdfHueRotateRadiansFromCssFilterArgs(argsValue: string): number | undefined {
  const args = pdfCssFilterNumberArgs(argsValue);
  if (!args || !Number.isFinite(args.value)) {
    return undefined;
  }

  switch (args.unit) {
    case undefined:
    case "deg":
      return (args.value * Math.PI) / 180;
    case "rad":
      return args.value;
    case "turn":
      return args.value * Math.PI * 2;
    default:
      return undefined;
  }
}

function pdfAdjustedColorFromCssFilter(
  value: string,
  initialColor: PdfRgbColor,
): PdfRgbColor | undefined {
  const visibleEffectFilters = pdfCssVisibleEffectFilterFunctions(value);
  if (visibleEffectFilters.length === 0) {
    return undefined;
  }

  let color = initialColor;
  let adjustedColor = false;
  for (const filter of visibleEffectFilters) {
    switch (filter.name) {
      case "brightness": {
        const factor = pdfCssFilterFactorFromArgs(filter.args);
        if (factor === undefined) {
          return undefined;
        }
        color = pdfBrightnessAdjustedColor(color, factor);
        adjustedColor = true;
        break;
      }
      case "contrast": {
        const factor = pdfCssFilterFactorFromArgs(filter.args);
        if (factor === undefined) {
          return undefined;
        }
        color = pdfContrastAdjustedColor(color, factor);
        adjustedColor = true;
        break;
      }
      case "saturate": {
        const factor = pdfCssFilterFactorFromArgs(filter.args);
        if (factor === undefined) {
          return undefined;
        }
        color = pdfSaturateAdjustedColor(color, factor);
        adjustedColor = true;
        break;
      }
      case "grayscale": {
        const factor = pdfCssFilterUnitIntervalFactorFromArgs(filter.args);
        if (factor === undefined) {
          return undefined;
        }
        color = pdfGrayscaleAdjustedColor(color, factor);
        adjustedColor = true;
        break;
      }
      case "invert": {
        const factor = pdfCssFilterUnitIntervalFactorFromArgs(filter.args);
        if (factor === undefined) {
          return undefined;
        }
        color = pdfInvertAdjustedColor(color, factor);
        adjustedColor = true;
        break;
      }
      case "sepia": {
        const factor = pdfCssFilterUnitIntervalFactorFromArgs(filter.args);
        if (factor === undefined) {
          return undefined;
        }
        color = pdfSepiaAdjustedColor(color, factor);
        adjustedColor = true;
        break;
      }
      case "hue-rotate": {
        const radians = pdfHueRotateRadiansFromCssFilterArgs(filter.args);
        if (radians === undefined) {
          return undefined;
        }
        color = pdfHueRotateAdjustedColor(color, radians);
        adjustedColor = true;
        break;
      }
      case "opacity":
        if (pdfOpacityFromCssOpacityFilterArgs(filter.args) === undefined) {
          return undefined;
        }
        break;
      default:
        return undefined;
    }
  }

  return adjustedColor ? color : undefined;
}

function pdfCssFilterAdjustsSolidColor(value: string): boolean {
  return pdfAdjustedColorFromCssFilter(value, { r: 0, g: 0, b: 0 }) !== undefined;
}

function pdfOpacityFromUnsupportedSemantics(
  unsupportedSemantics: readonly ProjectedUnsupportedSemantic[] | undefined,
): number | undefined {
  for (const semantic of unsupportedSemantics ?? []) {
    if (semantic.feature !== "filter" || semantic.property !== "filter") {
      continue;
    }

    const opacity = pdfOpacityFromCssFilter(semantic.value);
    if (opacity !== undefined) {
      return opacity;
    }
  }

  return undefined;
}

function pdfFilterOpacityFromNode(node: ProjectedLayoutNode): number | undefined {
  return pdfOpacityFromUnsupportedSemantics(node.unsupportedSemantics);
}

function pdfOpacityForLayoutNode(node: ProjectedLayoutNode): number | undefined {
  return combinePdfOpacity(pdfOpacity(node.opacity), pdfFilterOpacityFromNode(node));
}

function pdfBlendModeFromCssMixBlendMode(value: string): PdfBlendMode | undefined {
  switch (value.trim().toLowerCase()) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "darken":
      return "darken";
    case "lighten":
      return "lighten";
    case "color-dodge":
      return "color-dodge";
    case "color-burn":
      return "color-burn";
    case "hard-light":
      return "hard-light";
    case "soft-light":
      return "soft-light";
    case "difference":
      return "difference";
    case "exclusion":
      return "exclusion";
    case "hue":
      return "hue";
    case "saturation":
      return "saturation";
    case "color":
      return "color";
    case "luminosity":
      return "luminosity";
  }
}

function pdfBlendModeFromUnsupportedSemantics(
  unsupportedSemantics: readonly ProjectedUnsupportedSemantic[] | undefined,
): PdfBlendMode | undefined {
  for (const semantic of unsupportedSemantics ?? []) {
    if (semantic.feature !== "blend" || semantic.property !== "mixBlendMode") {
      continue;
    }

    const blendMode = pdfBlendModeFromCssMixBlendMode(semantic.value);
    if (blendMode !== undefined) {
      return blendMode;
    }
  }

  return undefined;
}

function pdfBlendModeFromNode(node: ProjectedLayoutNode): PdfBlendMode | undefined {
  return pdfBlendModeFromUnsupportedSemantics(node.unsupportedSemantics);
}

function pdfBlendModeForTableCell(
  table: ProjectedLayoutTable,
  section: ProjectedLayoutTable["sections"][number],
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
  cell: ProjectedLayoutTableCell,
): PdfBlendMode | undefined {
  return (
    pdfBlendModeFromUnsupportedSemantics(cell.unsupportedSemantics) ??
    pdfBlendModeFromUnsupportedSemantics(row.unsupportedSemantics) ??
    pdfBlendModeFromUnsupportedSemantics(section.unsupportedSemantics) ??
    pdfBlendModeFromNode(table)
  );
}

function pointsFromLayout(value: number, unit: DeckOptions["layout"]["unit"]): number {
  return unit === "in" ? value * POINTS_PER_INCH : value;
}

function pointsFromEmu(value: number): number {
  return value / EMU_PER_POINT;
}

function pageSizeFromOptions(options: DeckOptions): PdfPage["mediaBox"] {
  return {
    x: 0,
    y: 0,
    width: pointsFromLayout(options.layout.width, options.layout.unit),
    height: pointsFromLayout(options.layout.height, options.layout.unit),
  };
}

function slideIdsForGraph(graph: SemanticAuthorGraph): readonly string[] {
  const document = graph.nodes.get(graph.documentId);
  if (document?.kind !== "document") {
    return [graph.documentId];
  }

  return document.children.filter((slideId) => graph.nodes.get(slideId)?.kind === "slide");
}

type FontRequest = {
  readonly family: string;
  readonly families?: readonly string[];
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly text?: string;
};

function normalizedFontFamily(value: unknown): string | undefined {
  return typeof value === "string" ? fontFamilyList(value)?.[0] : undefined;
}

function fontFamilyCandidates(value: unknown): readonly string[] | undefined {
  return typeof value === "string" ? fontFamilyList(value) : undefined;
}

function fontRequestKey(request: FontRequest): string {
  const textKey = request.text ? unicodeCodePointsForText(request.text).join(",") : "";
  return [
    request.families?.join("\u0001") ?? request.family,
    request.weight,
    request.style,
    textKey,
  ].join("\u0000");
}

function stableRequestHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function fontRequestResourceId(
  kind: "request" | "fallback" | "unicode",
  request: FontRequest,
): PdfFontResource["id"] {
  const key = fontRequestKey(request);
  return pdfResourceId(
    "font",
    `${kind}:${request.family}:${request.weight}:${request.style}:${stableRequestHash(key)}`,
  );
}

function resolvedFontWeight(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (value === "bold") {
    return 700;
  }
  return 400;
}

function resolvedFontStyle(value: unknown): "normal" | "italic" {
  return value === "italic" ? "italic" : "normal";
}

function registrationWeight(registration: FontAssetRegistration): number {
  return registration.weight ?? 400;
}

function registrationStyle(registration: FontAssetRegistration): "normal" | "italic" {
  return registration.style ?? "normal";
}

function fontRequestDescription(request: FontRequest): string {
  return `family "${request.family}", weight ${request.weight}, style ${request.style}`;
}

function fontRequestFromResolvedStyle(input: {
  readonly resolvedStyle: ResolvedStyle | undefined;
  readonly resolvedStyles?: ResolvedStyleMap;
  readonly requireExplicitFamily: boolean;
}): FontRequest | undefined {
  const familyProperty = input.resolvedStyle?.properties.fontFamily;
  if (!familyProperty) {
    return undefined;
  }
  if (
    input.requireExplicitFamily &&
    !resolvedFontFamilySourceIsExplicit({
      resolvedStyle: input.resolvedStyle,
      resolvedStyles: input.resolvedStyles,
    })
  ) {
    return undefined;
  }

  const families = fontFamilyCandidates(familyProperty.value);
  const family = families?.[0];
  if (!family) {
    return undefined;
  }

  return {
    family,
    ...(families && families.length > 1 ? { families } : {}),
    weight: resolvedFontWeight(input.resolvedStyle?.properties.fontWeight?.value),
    style: resolvedFontStyle(input.resolvedStyle?.properties.fontStyle?.value),
  };
}

function resolvedFontFamilySourceIsExplicit(input: {
  readonly resolvedStyle: ResolvedStyle | undefined;
  readonly resolvedStyles?: ResolvedStyleMap;
  readonly seen?: ReadonlySet<GraphNodeId>;
}): boolean {
  const source = input.resolvedStyle?.properties.fontFamily?.source;
  if (!source) {
    return false;
  }
  if (source.layer === "default") {
    return false;
  }
  if (source.layer !== "inherited") {
    return true;
  }
  if (input.seen?.has(source.parentId)) {
    return false;
  }

  return resolvedFontFamilySourceIsExplicit({
    resolvedStyle: input.resolvedStyles?.get(source.parentId),
    resolvedStyles: input.resolvedStyles,
    seen: new Set([...(input.seen ?? []), source.parentId]),
  });
}

function fontRequestTextFromGraphNode(
  graph: SemanticAuthorGraph,
  nodeId: GraphNodeId,
  seen: ReadonlySet<GraphNodeId> = new Set(),
): string | undefined {
  if (seen.has(nodeId)) {
    return undefined;
  }
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return undefined;
  }
  if (node.kind === "textRun") {
    return node.text;
  }
  if (node.kind !== "text") {
    return undefined;
  }

  const nextSeen = new Set([...seen, nodeId]);
  const text = node.inlineChildren
    .map((childId) => fontRequestTextFromGraphNode(graph, childId, nextSeen))
    .filter((part): part is string => part !== undefined)
    .join("");

  return text.length > 0 ? text : undefined;
}

function fontRequestForGraphNode(input: {
  readonly graph: SemanticAuthorGraph;
  readonly nodeId: GraphNodeId;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly fontAssets?: readonly FontAssetRegistration[];
}): FontRequest | undefined {
  const resolvedStyle = input.resolvedStyles.get(input.nodeId);
  const request = fontRequestFromResolvedStyle({
    resolvedStyle,
    resolvedStyles: input.resolvedStyles,
    requireExplicitFamily: false,
  });
  if (!request) {
    return undefined;
  }

  const hasExplicitFamily = resolvedFontFamilySourceIsExplicit({
    resolvedStyle,
    resolvedStyles: input.resolvedStyles,
  });
  if (!hasExplicitFamily && !fontRegistrationForRequest(input.fontAssets ?? [], request)) {
    return undefined;
  }

  const text = fontRequestTextFromGraphNode(input.graph, input.nodeId);
  return text ? { ...request, text } : request;
}

function graphNodeIsHiddenForPdfFontRequest(input: {
  readonly nodeId: GraphNodeId;
  readonly parentByNodeId: ReadonlyMap<GraphNodeId, GraphNodeId>;
  readonly resolvedStyles: ResolvedStyleMap;
}): boolean {
  let nodeId: GraphNodeId | undefined = input.nodeId;
  const seen = new Set<GraphNodeId>();

  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);

    const properties = input.resolvedStyles.get(nodeId)?.properties;
    if (properties?.visibility?.value === "hidden" || properties?.display?.value === "none") {
      return true;
    }

    nodeId = input.parentByNodeId.get(nodeId);
  }

  return false;
}

function graphChildIdsForPdfFontRequest(node: SemanticNode): readonly GraphNodeId[] {
  return "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];
}

function parentGraphNodeIds(graph: SemanticAuthorGraph): ReadonlyMap<GraphNodeId, GraphNodeId> {
  const parentByNodeId = new Map<GraphNodeId, GraphNodeId>();

  graph.nodes.forEach((node) => {
    graphChildIdsForPdfFontRequest(node).forEach((childId) => {
      parentByNodeId.set(childId, node.id);
    });
  });

  return parentByNodeId;
}

function fontRegistrationKey(registration: FontAssetRegistration | undefined): string {
  return registration
    ? [
        registration.key,
        registration.family,
        registrationWeight(registration),
        registrationStyle(registration),
      ].join("\u0000")
    : "\u0000fallback";
}

function unicodeRangeFontRequestChunks(input: {
  readonly request: FontRequest;
  readonly fontAssets: readonly FontAssetRegistration[];
}): readonly FontRequest[] {
  if (!input.request.text) {
    return [input.request];
  }

  const chunks: FontRequest[] = [];
  let currentText = "";
  let currentKey: string | undefined;

  for (const character of Array.from(input.request.text)) {
    const registration = fontRegistrationForRequest(input.fontAssets, {
      ...input.request,
      text: character,
    });
    const key = fontRegistrationKey(registration);
    if (currentText.length > 0 && currentKey !== key) {
      chunks.push({ ...input.request, text: currentText });
      currentText = "";
    }

    currentText += character;
    currentKey = key;
  }

  if (currentText.length > 0) {
    chunks.push({ ...input.request, text: currentText });
  }

  return chunks.length > 0 ? chunks : [input.request];
}

function segmentedFontRequests(
  request: FontRequest,
  fontAssets: readonly FontAssetRegistration[],
): readonly FontRequest[] {
  if (!request.text) {
    return [request];
  }

  const encodingChunks = pdfTextEncodingChunks(request.text);
  if (encodingChunks.length <= 1) {
    const rangeChunks = unicodeRangeFontRequestChunks({ request, fontAssets });
    if (rangeChunks.length > 1) {
      return rangeChunks;
    }
    return [request];
  }

  return encodingChunks.flatMap((text) =>
    unicodeRangeFontRequestChunks({ request: { ...request, text }, fontAssets }),
  );
}

function explicitFontRequests(input: {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly integrationContext?: DeckIntegrationContext;
}): readonly FontRequest[] {
  const requests = new Map<string, FontRequest>();
  const fontAssets = input.integrationContext?.fontAssets ?? [];
  const parentByNodeId = parentGraphNodeIds(input.graph);

  input.graph.nodes.forEach((node) => {
    if (node.kind !== "text" && node.kind !== "textRun") {
      return;
    }
    if (node.kind === "textRun" && !node.styleRef) {
      return;
    }
    if (
      graphNodeIsHiddenForPdfFontRequest({
        nodeId: node.id,
        parentByNodeId,
        resolvedStyles: input.resolvedStyles,
      })
    ) {
      return;
    }

    const request = fontRequestForGraphNode({
      graph: input.graph,
      nodeId: node.id,
      resolvedStyles: input.resolvedStyles,
      fontAssets,
    });
    if (!request) {
      return;
    }

    segmentedFontRequests(request, fontAssets).forEach((segmentRequest) => {
      requests.set(fontRequestKey(segmentRequest), segmentRequest);
    });
  });

  return [...requests.values()];
}

function fontRegistrationMatchesRequest(
  registration: FontAssetRegistration,
  request: FontRequest,
): boolean {
  return (
    registration.family === request.family &&
    registrationWeight(registration) === request.weight &&
    registrationStyle(registration) === request.style
  );
}

type ParsedUnicodeRange = {
  readonly start: number;
  readonly end: number;
};

function parseUnicodeRange(value: string): ParsedUnicodeRange | undefined {
  const normalized = value.trim().toUpperCase();
  const match = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/u.exec(normalized);
  if (!match) {
    return undefined;
  }

  const startToken = match[1]!;
  const explicitEndToken = match[2];
  const start = Number.parseInt(startToken.replaceAll("?", "0"), 16);
  const end = Number.parseInt((explicitEndToken ?? startToken).replaceAll("?", "F"), 16);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > 0x10ffff ||
    start > end
  ) {
    return undefined;
  }

  return { start, end };
}

function unicodeRangeContains(ranges: readonly ParsedUnicodeRange[], codePoint: number): boolean {
  return ranges.some((range) => codePoint >= range.start && codePoint <= range.end);
}

function fontRegistrationRangeScore(
  registration: FontAssetRegistration,
  request: FontRequest,
): number {
  if (!fontRegistrationMatchesRequest(registration, request)) {
    return -1;
  }
  if (!request.text || registration.unicodeRange === undefined) {
    return 1;
  }

  const ranges = registration.unicodeRange
    .map(parseUnicodeRange)
    .filter((range): range is ParsedUnicodeRange => range !== undefined);
  if (ranges.length === 0) {
    return 1;
  }

  const codePoints = unicodeCodePointsForText(request.text);
  return codePoints.length > 0 &&
    codePoints.every((codePoint) => unicodeRangeContains(ranges, codePoint))
    ? 2
    : -1;
}

function fontRegistrationGlyphCoverageScore(
  registration: FontAssetRegistration,
  request: FontRequest,
): number {
  if (!request.text) {
    return 0;
  }

  const data = fontDataFromRegistrationSource(registration.source);
  if (!data || !trueTypeFontHasCmap(data)) {
    return 0;
  }

  const codePoints = unicodeCodePointsForText(request.text);
  if (codePoints.length === 0) {
    return 0;
  }

  const glyphIds = parseTrueTypeCodeUnitGlyphIds(data, codePoints);
  return codePoints.every((codePoint) => glyphIds.has(codePoint)) ? 1 : -1;
}

function fontRegistrationForRequest(
  registrations: readonly FontAssetRegistration[],
  request: FontRequest,
): FontAssetRegistration | undefined {
  for (const family of request.families ?? [request.family]) {
    const candidate = { ...request, family, families: undefined };
    let best: { readonly registration: FontAssetRegistration; readonly score: number } | undefined;
    registrations.forEach((registration) => {
      const rangeScore = fontRegistrationRangeScore(registration, candidate);
      const coverageScore = fontRegistrationGlyphCoverageScore(registration, candidate);
      const score = rangeScore < 0 || coverageScore < 0 ? -1 : rangeScore + coverageScore;
      if (score >= 0 && (!best || score > best.score)) {
        best = { registration, score };
      }
    });
    if (best) {
      return best.registration;
    }
  }
  return undefined;
}

function bytesFromDataAssetSource(source: Extract<AssetSource, { kind: "data" }>): Uint8Array {
  const commaIndex = source.data.indexOf(",");
  if (!source.data.startsWith("data:") || commaIndex === -1) {
    return new TextEncoder().encode(source.data);
  }

  const metadata = source.data.slice(0, commaIndex);
  const payload = source.data.slice(commaIndex + 1);
  if (!metadata.endsWith(";base64")) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const decoded = globalThis.atob(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function fontDataFromRegistrationSource(
  source: FontAssetRegistration["source"],
): Uint8Array | undefined {
  switch (source.kind) {
    case "bytes":
      return source.bytes;
    case "data":
      return bytesFromDataAssetSource(source);
    case "path":
    case "url":
      return undefined;
  }
}

function pdfFontResourceForRegistration(
  request: FontRequest,
  registration: FontAssetRegistration,
  name: string,
): PdfFontResource {
  const fontData = fontDataFromRegistrationSource(registration.source);
  return {
    id: fontRequestResourceId("request", request),
    name,
    family: registration.family,
    weight: request.weight,
    style: request.style,
    fallback: false,
    sourceKey: registration.key,
    ...(fontData ? { data: fontData } : {}),
  };
}

function pdfUnicodeFontResourceForRegistration(
  request: FontRequest,
  registration: FontAssetRegistration,
  name: string,
  data: Uint8Array,
): PdfFontResource {
  return {
    id: fontRequestResourceId("unicode", request),
    name: `${name}Unicode`,
    family: registration.family,
    weight: request.weight,
    style: request.style,
    encoding: "identity-h",
    fallback: false,
    sourceKey: registration.key,
    data,
  };
}

function pdfFallbackForRequest(request: FontRequest): PdfFallback {
  return {
    code: "W_PDF_FONT_FALLBACK",
    message: `PDF projection used Helvetica for missing font request ${fontRequestDescription(request)}.`,
  };
}

function isAsciiFontRangeSeparator(character: string): boolean {
  return /^\s$/u.test(character) || /^[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]$/u.test(character);
}

function fontRequestNeedsFallbackDiagnostic(
  request: FontRequest,
  fontAssets: readonly FontAssetRegistration[],
): boolean {
  if (request.text === undefined) {
    return true;
  }

  const isUnicodeRangeSeparator =
    Array.from(request.text).every(isAsciiFontRangeSeparator) &&
    fontAssets.some(
      (registration) =>
        fontRegistrationMatchesRequest(registration, request) &&
        registration.unicodeRange !== undefined,
    );

  return (
    !isUnicodeRangeSeparator &&
    Array.from(request.text).some((character) => !/^\s$/u.test(character))
  );
}

function pdfFallbackForRegistration(
  request: FontRequest,
  registration: FontAssetRegistration,
): PdfFallback {
  return {
    code: "W_PDF_FONT_FALLBACK",
    message: `PDF projection used Helvetica because embedding registered font asset key "${registration.key}" for ${fontRequestDescription(request)} is not supported yet.`,
  };
}

function pdfFallbackForUnsupportedSemantic(input: {
  readonly pageId: PdfPage["id"];
  readonly nodeId: string;
  readonly kind: NonNullable<PdfFallback["kind"]>;
  readonly semantic: ProjectedUnsupportedSemantic;
  readonly origin?: PdfElementOrigin;
}): PdfFallback {
  return {
    code: "W_PDF_UNSUPPORTED_SEMANTIC",
    pageId: input.pageId,
    nodeId: input.nodeId,
    kind: input.kind,
    semantic: input.semantic,
    ...(input.origin ? { origin: input.origin } : {}),
    message: `PDF projection omitted unsupported ${input.semantic.feature} semantic on node ${input.nodeId}: ${input.semantic.property}=${input.semantic.value}. ${input.semantic.reason}`,
  };
}

function pdfFallbackFontResourceForRequest(
  request: FontRequest,
  name: string,
  sourceKey?: string,
): PdfFontResource {
  return {
    id: fontRequestResourceId("fallback", request),
    name,
    family: "Helvetica",
    weight: request.weight,
    style: request.style,
    fallback: true,
    ...(sourceKey ? { sourceKey } : {}),
  };
}

function pdfFontResourcesForRequests(input: {
  readonly requests: readonly FontRequest[];
  readonly integrationContext?: DeckIntegrationContext;
}): {
  readonly fonts: readonly PdfFontResource[];
  readonly fallbacks: readonly PdfFallback[];
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly unicodeResourceIdsByFontId: ReadonlyMap<PdfFontResource["id"], PdfFontResource["id"]>;
} {
  const fontAssets = input.integrationContext?.fontAssets ?? [];

  const fonts: PdfFontResource[] = [];
  const fallbacks: PdfFallback[] = [];
  const resourceIdsByRequestKey = new Map<string, PdfFontResource["id"]>();
  const unicodeResourceIdsByFontId = new Map<PdfFontResource["id"], PdfFontResource["id"]>();

  input.requests.forEach((request, index) => {
    const name = `F${index + 2}`;
    const registration = fontRegistrationForRequest(fontAssets, request);

    if (registration) {
      const font = pdfFontResourceForRegistration(request, registration, name);
      if (!font.data) {
        const fallbackFont = pdfFallbackFontResourceForRequest(request, name, registration.key);
        fonts.push(fallbackFont);
        resourceIdsByRequestKey.set(fontRequestKey(request), fallbackFont.id);
        if (fontRequestNeedsFallbackDiagnostic(request, fontAssets)) {
          fallbacks.push(pdfFallbackForRegistration(request, registration));
        }
        return;
      }

      fonts.push(font);
      resourceIdsByRequestKey.set(fontRequestKey(request), font.id);
      const unicodeFont = pdfUnicodeFontResourceForRegistration(
        request,
        registration,
        name,
        font.data,
      );
      fonts.push(unicodeFont);
      unicodeResourceIdsByFontId.set(font.id, unicodeFont.id);
      return;
    }

    const font = pdfFallbackFontResourceForRequest(request, name);
    fonts.push(font);
    resourceIdsByRequestKey.set(fontRequestKey(request), font.id);
    if (fontRequestNeedsFallbackDiagnostic(request, fontAssets)) {
      fallbacks.push(pdfFallbackForRequest(request));
    }
  });

  return { fonts, fallbacks, resourceIdsByRequestKey, unicodeResourceIdsByFontId };
}

function unsupportedSemanticFallbackKey(input: {
  readonly pageId: PdfPage["id"];
  readonly nodeId: string;
  readonly semantic: ProjectedUnsupportedSemantic;
}): string {
  return [
    input.pageId,
    input.nodeId,
    input.semantic.feature,
    input.semantic.property,
    input.semantic.value,
    input.semantic.reason,
  ].join("\u0000");
}

function pdfVariableGradientOpacityUnsupportedSemantics(input: {
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly BackgroundLayerIR[];
}): readonly ProjectedUnsupportedSemantic[] {
  const gradients: readonly {
    readonly fill: LinearGradientFillIR | RadialGradientFillIR;
    readonly property: string;
  }[] = [
    ...(input.fill?.kind === "linear-gradient" || input.fill?.kind === "radial-gradient"
      ? [{ fill: input.fill, property: "fill.gradientStopOpacity" }]
      : []),
    ...(input.backgroundLayers ?? []).flatMap((layer, layerIndex) =>
      layer.kind === "linear-gradient" || layer.kind === "radial-gradient"
        ? [{ fill: layer, property: `backgroundLayers[${layerIndex}].gradientStopOpacity` }]
        : [],
    ),
  ];

  return gradients.flatMap(({ fill, property }) => {
    const opacities = fill.stops.map((stop) => pdfOpacityFromTransparency(stop.transparency) ?? 1);
    const firstOpacity = opacities[0];
    if (
      firstOpacity === undefined ||
      opacities.every((opacity) => Math.abs(opacity - firstOpacity) < 0.0001)
    ) {
      return [];
    }

    return [
      {
        feature: "opacity",
        property,
        value: opacities.map((opacity) => Number(opacity.toFixed(4))).join(","),
        reason:
          "PDF projection preserves the gradient colors and positions, but the direct PDF writer cannot render opacity that varies between gradient stops.",
        fallback: {
          strategy: "preserveAuthoredValueOnly",
          preserves: [
            "gradientKind",
            "gradientGeometry",
            "gradientColorStops",
            "gradientStopPositions",
            "gradientStopOpacityMetadata",
          ],
          missing: ["variableGradientStopOpacity"],
        },
      },
    ];
  });
}

function pdfInnerShadowUnsupportedSemantic(
  node: ProjectedLayoutNode,
): ProjectedUnsupportedSemantic | undefined {
  if (!("shadow" in node) || node.shadow?.type !== "inner") {
    return undefined;
  }
  if (pdfInnerShadowIsDirectlyProjected(node)) {
    return undefined;
  }

  const property = node.kind === "text" ? "textShadow" : "boxShadow";
  return {
    feature: "shadow",
    property,
    value: "inset",
    reason: `PDF projection does not render inset ${property} yet; the authored inner shadow is preserved as unsupported shadow metadata for inspection.`,
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["shadowMetadata"],
      missing: ["innerShadow"],
    },
  };
}

function pdfInnerShadowIsDirectlyProjected(node: ProjectedLayoutNode): boolean {
  if (!("shadow" in node) || node.shadow?.type !== "inner") {
    return false;
  }
  if (node.kind === "text" && !pdfTextShadowShouldUseBox(node)) {
    return false;
  }
  if (
    node.kind !== "group" &&
    node.kind !== "text" &&
    node.kind !== "table" &&
    node.kind !== "image" &&
    (node.kind !== "video" || node.posterSource === undefined) &&
    (node.kind !== "shape" ||
      (node.shape !== "rect" && node.shape !== "roundRect" && node.shape !== "ellipse"))
  ) {
    return false;
  }
  if ((node.shadow.spreadPt ?? 0) !== 0) {
    return false;
  }
  if (!rgbColorFromStyle(node.shadow.color)) {
    return false;
  }
  if (
    node.shadow.blurPt > 0 &&
    (node.kind === "group" ||
      node.kind === "image" ||
      node.kind === "video" ||
      node.kind === "table" ||
      node.kind === "text" ||
      node.kind === "shape")
  ) {
    return innerShadowBaseBoxFromFrame(node.frame, node.shadow) !== undefined;
  }
  if (node.shadow.blurPt !== 0) {
    return false;
  }

  return innerShadowBoxFromFrame(node.frame, node.shadow) !== undefined;
}

function pdfTextOpacityStackingContextIsDirectlyProjected(): boolean {
  return true;
}

function pdfShapeOpacityStackingContextIsDirectlyProjected(node: ProjectedLayoutShape): boolean {
  if (!node.shadow) {
    return true;
  }

  if (node.shadow.type !== "outer" || node.shadow.blurPt !== 0) {
    return false;
  }

  return !pdfRectanglesOverlap(
    boxFromFrame(node.frame),
    shadowBoxFromFrame(node.frame, node.shadow),
  );
}

function pdfOpacityPaintBoundsFromGroup(
  node: ProjectedLayoutGroup,
): readonly PdfRectangle[] | undefined {
  if (node.visibility === "hidden" || pdfOpacityForLayoutNode(node) === 0) {
    return [];
  }
  if (pdfNodeHasAuthoredTransform(node)) {
    return undefined;
  }
  if (
    node.unsupportedSemantics?.some(
      (semantic) => semantic.feature === "blend" || semantic.feature === "isolation",
    )
  ) {
    return undefined;
  }

  const nodeBox = boxFromFrame(node.frame);
  const ownPaintBounds: PdfRectangle[] = [];
  if (node.fill) {
    ownPaintBounds.push(nodeBox);
  }
  for (const layer of node.backgroundLayers ?? []) {
    ownPaintBounds.push(boxFromFrame(layer.frame ?? node.frame));
  }
  if (node.stroke) {
    ownPaintBounds.push(nodeBox);
  }
  for (const stroke of [
    node.edgeStrokes?.top,
    node.edgeStrokes?.right,
    node.edgeStrokes?.bottom,
    node.edgeStrokes?.left,
  ]) {
    if (stroke) {
      ownPaintBounds.push(nodeBox);
    }
  }
  if (node.outline) {
    ownPaintBounds.push(nodeBox);
  }
  if (node.shadow) {
    ownPaintBounds.push(
      node.shadow.type === "outer" ? shadowBoxFromFrame(node.frame, node.shadow) : nodeBox,
    );
  }

  const childPaintBounds: PdfRectangle[] = [];
  for (const child of node.children) {
    if (child.visibility === "hidden" || pdfOpacityForLayoutNode(child) === 0) {
      continue;
    }
    if (child.kind === "group") {
      const nestedBounds = pdfOpacityPaintBoundsFromGroup(child);
      if (!nestedBounds) {
        return undefined;
      }
      childPaintBounds.push(...nestedBounds);
      continue;
    }
    if (
      child.kind === "table" ||
      pdfNodeHasAuthoredTransform(child) ||
      ("shadow" in child && child.shadow !== undefined) ||
      ("outline" in child && child.outline !== undefined)
    ) {
      return undefined;
    }
    childPaintBounds.push(boxFromFrame(child.frame));
  }

  const paintBounds = [...ownPaintBounds, ...childPaintBounds];
  for (let leftIndex = 0; leftIndex < paintBounds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < paintBounds.length; rightIndex += 1) {
      if (pdfRectanglesOverlap(paintBounds[leftIndex]!, paintBounds[rightIndex]!)) {
        return undefined;
      }
    }
  }

  return paintBounds;
}

function pdfGroupOpacityStackingContextIsDirectlyProjected(node: ProjectedLayoutGroup): boolean {
  return pdfOpacityPaintBoundsFromGroup(node) !== undefined;
}

function pdfNodeHasAuthoredTransform(node: ProjectedLayoutNode): boolean {
  return node.rotation !== undefined || node.flipH === true || node.flipV === true;
}

function pdfDescendantsHaveAuthoredTransform(node: ProjectedLayoutNode): boolean {
  if (node.kind === "group") {
    return node.children.some(
      (child) => pdfNodeHasAuthoredTransform(child) || pdfDescendantsHaveAuthoredTransform(child),
    );
  }

  if (node.kind === "table") {
    return node.sections.some((section) =>
      section.rows.some((row) =>
        row.cells.some((cell) =>
          cell.children.some(
            (child) =>
              pdfNodeHasAuthoredTransform(child) || pdfDescendantsHaveAuthoredTransform(child),
          ),
        ),
      ),
    );
  }

  return false;
}

function pdfGroupTransformStackingContextIsDirectlyProjected(node: ProjectedLayoutGroup): boolean {
  return !pdfDescendantsHaveAuthoredTransform(node);
}

function pdfShapeFillIsDirectlyProjected(fill: FillIR | undefined): boolean {
  return (
    fill?.kind === "solid" || fill?.kind === "linear-gradient" || fill?.kind === "radial-gradient"
  );
}

function pdfSolidShapeBrightnessFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    (node.stroke === undefined || strokeColor(node.stroke) !== undefined) &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfBrightnessFactorFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeContrastFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    (node.stroke === undefined || strokeColor(node.stroke) !== undefined) &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfContrastFactorFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeSaturateFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    node.stroke === undefined &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfSaturateFactorFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeGrayscaleFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    node.stroke === undefined &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfGrayscaleFactorFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeInvertFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    node.stroke === undefined &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfInvertFactorFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeSepiaFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    node.stroke === undefined &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfSepiaFactorFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeHueRotateFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    node.stroke === undefined &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfHueRotateRadiansFromCssFilter(value) !== undefined
  );
}

function pdfSolidShapeColorFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutShape {
  return (
    node.kind === "shape" &&
    (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
    node.fill?.kind === "solid" &&
    solidFillColor(node.fill) !== undefined &&
    (node.stroke === undefined || strokeColor(node.stroke) !== undefined) &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined &&
    !node.backgroundLayers?.length &&
    pdfCssFilterAdjustsSolidColor(value)
  );
}

function pdfTextColorFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutText {
  return node.kind === "text" && pdfCssFilterAdjustsSolidColor(value);
}

function pngBytesForImageColorFilter(input: {
  readonly source: ImageSourceIR;
  readonly asset?: PdfProjectionAssetArtifact;
}): Uint8Array | undefined {
  const mediaType = imageSourceMediaType(input);
  if (mediaType !== "image/png") {
    return undefined;
  }

  return (
    input.asset?.load?.bytes ??
    (input.source.kind === "data" ? bytesFromDataImageSource(input.source) : undefined)
  );
}

function imageSourceMediaType(input: {
  readonly source: ImageSourceIR;
  readonly asset?: PdfProjectionAssetArtifact;
}): string | undefined {
  return normalizedMediaType(
    input.asset?.load?.mediaType ??
      input.asset?.probe?.mediaType ??
      (input.source.kind === "data"
        ? dataSourceMediaType(input.source)
        : mediaTypeFromImageSourcePath(input.source)),
  );
}

function mediaTypeFromImageSourcePath(source: ImageSourceIR): string | undefined {
  if (source.kind === "data") {
    return undefined;
  }

  const value = source.kind === "path" ? source.path : source.url;
  const path = value.split(/[?#]/)[0];
  const extension = path?.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return undefined;
  }
}

function pdfImageColorFilterIsDirectlyProjected(input: {
  readonly node: ProjectedLayoutNode;
  readonly value: string;
  readonly asset?: PdfProjectionAssetArtifact;
}): input is {
  readonly node: ProjectedLayoutImage;
  readonly value: string;
  readonly asset?: PdfProjectionAssetArtifact;
} {
  if (input.node.kind !== "image" || !pdfCssColorFilterAdjustsColor(input.value)) {
    return false;
  }

  const mediaType = imageSourceMediaType({ source: input.node.source, asset: input.asset });
  if (mediaType !== "image/png") {
    return false;
  }

  const bytes = pngBytesForImageColorFilter({ source: input.node.source, asset: input.asset });
  if (bytes === undefined && input.node.source.kind !== "data") {
    return true;
  }

  const colorTransform = pdfCssColorFilterTransform(input.value);
  return (
    bytes !== undefined &&
    colorTransform !== undefined &&
    pdfEmbeddablePngImage(bytes, { colorTransform }) !== undefined
  );
}

function pdfVideoPosterColorFilterIsDirectlyProjected(input: {
  readonly node: ProjectedLayoutNode;
  readonly value: string;
  readonly asset?: PdfProjectionAssetArtifact;
}): boolean {
  if (input.node.kind !== "video" || !input.node.posterSource) {
    return false;
  }
  if (!pdfCssColorFilterAdjustsColor(input.value)) {
    return false;
  }

  const mediaType = imageSourceMediaType({
    source: input.node.posterSource,
    ...(input.asset ? { asset: input.asset } : {}),
  });
  if (mediaType !== "image/png") {
    return false;
  }

  const bytes = pngBytesForImageColorFilter({
    source: input.node.posterSource,
    ...(input.asset ? { asset: input.asset } : {}),
  });
  if (bytes === undefined && input.node.posterSource.kind !== "data") {
    return true;
  }

  const colorTransform = pdfCssColorFilterTransform(input.value);
  return (
    bytes !== undefined &&
    colorTransform !== undefined &&
    pdfEmbeddablePngImage(bytes, { colorTransform }) !== undefined
  );
}

function pdfBackgroundImageLayerColorFilterIsDirectlyProjected(
  layer: BackgroundImageLayerIR,
  value: string,
): boolean {
  if (!pdfCssColorFilterAdjustsColor(value)) {
    return false;
  }

  const mediaType = imageSourceMediaType({ source: layer.source });
  if (mediaType !== "image/png") {
    return false;
  }

  const bytes = pngBytesForImageColorFilter({ source: layer.source });
  if (bytes === undefined && layer.source.kind !== "data") {
    return true;
  }

  const colorTransform = pdfCssColorFilterTransform(value);
  return (
    bytes !== undefined &&
    colorTransform !== undefined &&
    pdfEmbeddablePngImage(bytes, { colorTransform }) !== undefined
  );
}

function pdfBackgroundLayersColorFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is ProjectedLayoutGroup | ProjectedLayoutShape | ProjectedLayoutText {
  if (!("backgroundLayers" in node)) {
    return false;
  }

  const imageLayers = backgroundImageLayers(node.backgroundLayers);
  if (
    imageLayers.length === 0 ||
    !imageLayers.every((layer) =>
      pdfBackgroundImageLayerColorFilterIsDirectlyProjected(layer, value),
    )
  ) {
    return false;
  }

  if (!gradientBackgroundLayersColorFilterAreDirectlyProjected(node.backgroundLayers)) {
    return false;
  }

  if (node.kind === "group") {
    return (
      node.children.length === 0 &&
      (node.fill === undefined ||
        (node.fill.kind === "solid" && solidFillColor(node.fill) !== undefined)) &&
      node.stroke === undefined &&
      node.edgeStrokes === undefined &&
      node.outline === undefined &&
      node.shadow === undefined
    );
  }

  if (node.kind === "shape") {
    return (
      (node.shape === "rect" || node.shape === "roundRect") &&
      node.fill === undefined &&
      (node.stroke === undefined || strokeColor(node.stroke) !== undefined) &&
      node.edgeStrokes === undefined &&
      node.outline === undefined &&
      node.shadow === undefined
    );
  }

  if (node.kind === "text") {
    return true;
  }

  return false;
}

function pdfTableCellBackgroundLayersColorFilterIsDirectlyProjected(
  cell: ProjectedLayoutTableCell,
  value: string,
): boolean {
  const imageLayers = backgroundImageLayers(cell.backgroundLayers);
  return (
    cell.children.length === 0 &&
    (cell.fill === undefined || solidFillColor(cell.fill) !== undefined) &&
    edgeStrokeColorsAreDirectlyProjected(cell.edgeStrokes) &&
    imageLayers.length > 0 &&
    imageLayers.every((layer) =>
      pdfBackgroundImageLayerColorFilterIsDirectlyProjected(layer, value),
    ) &&
    gradientBackgroundLayersColorFilterAreDirectlyProjected(cell.backgroundLayers)
  );
}

function pdfTableCellHasNoVisiblePaint(cell: ProjectedLayoutTableCell): boolean {
  return (
    cell.children.length === 0 &&
    cell.fill === undefined &&
    cell.backgroundLayers === undefined &&
    cell.edgeStrokes === undefined &&
    cell.opacity === undefined &&
    cell.unsupportedSemantics === undefined
  );
}

function pdfTableRowBackgroundLayersColorFilterIsDirectlyProjected(
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
  value: string,
): boolean {
  const imageLayers = backgroundImageLayers(row.backgroundLayers);
  return (
    row.cells.every(pdfTableCellHasNoVisiblePaint) &&
    (row.fill === undefined || solidFillColor(row.fill) !== undefined) &&
    imageLayers.length > 0 &&
    imageLayers.every((layer) =>
      pdfBackgroundImageLayerColorFilterIsDirectlyProjected(layer, value),
    ) &&
    gradientBackgroundLayersColorFilterAreDirectlyProjected(row.backgroundLayers)
  );
}

function pdfTableRowHasNoVisiblePaint(
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
): boolean {
  return (
    row.cells.every(pdfTableCellHasNoVisiblePaint) &&
    row.fill === undefined &&
    row.backgroundLayers === undefined &&
    row.opacity === undefined &&
    row.unsupportedSemantics === undefined
  );
}

function pdfTableSectionBackgroundLayersColorFilterIsDirectlyProjected(
  section: ProjectedLayoutTable["sections"][number],
  value: string,
): boolean {
  const imageLayers = backgroundImageLayers(section.backgroundLayers);
  return (
    section.rows.every(pdfTableRowHasNoVisiblePaint) &&
    (section.fill === undefined || solidFillColor(section.fill) !== undefined) &&
    imageLayers.length > 0 &&
    imageLayers.every((layer) =>
      pdfBackgroundImageLayerColorFilterIsDirectlyProjected(layer, value),
    ) &&
    gradientBackgroundLayersColorFilterAreDirectlyProjected(section.backgroundLayers)
  );
}

function pdfTableSectionHasNoVisiblePaint(
  section: ProjectedLayoutTable["sections"][number],
): boolean {
  return (
    section.rows.every(pdfTableRowHasNoVisiblePaint) &&
    section.fill === undefined &&
    section.backgroundLayers === undefined &&
    section.opacity === undefined &&
    section.unsupportedSemantics === undefined
  );
}

function pdfTableBackgroundLayersColorFilterIsDirectlyProjected(
  table: ProjectedLayoutTable,
  value: string,
): boolean {
  const imageLayers = backgroundImageLayers(table.backgroundLayers);
  return (
    table.sections.every(pdfTableSectionHasNoVisiblePaint) &&
    table.outline === undefined &&
    table.shadow === undefined &&
    (table.fill === undefined || solidFillColor(table.fill) !== undefined) &&
    edgeStrokeColorsAreDirectlyProjected(table.edgeStrokes) &&
    imageLayers.length > 0 &&
    imageLayers.every((layer) =>
      pdfBackgroundImageLayerColorFilterIsDirectlyProjected(layer, value),
    ) &&
    gradientBackgroundLayersColorFilterAreDirectlyProjected(table.backgroundLayers)
  );
}

function edgeStrokeColorsAreDirectlyProjected(edgeStrokes: EdgeStrokeIR | undefined): boolean {
  return [edgeStrokes?.top, edgeStrokes?.right, edgeStrokes?.bottom, edgeStrokes?.left].every(
    (stroke) => stroke === undefined || strokeColor(stroke) !== undefined,
  );
}

function pdfColorFilterFromBackgroundImageNode(node: ProjectedLayoutNode): string | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfBackgroundLayersColorFilterIsDirectlyProjected(node, semantic.value)
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfColorFilterFromTableCellBackgroundImage(
  cell: ProjectedLayoutTableCell,
): string | undefined {
  for (const semantic of cell.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfTableCellBackgroundLayersColorFilterIsDirectlyProjected(cell, semantic.value)
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfColorFilterFromTableRowBackgroundImage(
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
): string | undefined {
  for (const semantic of row.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfTableRowBackgroundLayersColorFilterIsDirectlyProjected(row, semantic.value)
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfColorFilterFromTableSectionBackgroundImage(
  section: ProjectedLayoutTable["sections"][number],
): string | undefined {
  for (const semantic of section.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfTableSectionBackgroundLayersColorFilterIsDirectlyProjected(section, semantic.value)
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfColorFilterFromTableBackgroundImage(table: ProjectedLayoutTable): string | undefined {
  for (const semantic of table.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfTableBackgroundLayersColorFilterIsDirectlyProjected(table, semantic.value)
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfAdjustedBackgroundImageNodeColorFromFilters(
  node: ProjectedLayoutGroup | ProjectedLayoutShape,
  color: PdfRgbColor,
): PdfRgbColor | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (semantic.feature !== "filter" || semantic.property !== "filter") {
      continue;
    }

    const adjustedColor = pdfAdjustedColorFromCssFilter(semantic.value, color);
    if (
      adjustedColor !== undefined &&
      pdfBackgroundLayersColorFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return adjustedColor;
    }
  }

  return undefined;
}

function pdfAdjustedSolidShapeColorFromFilters(
  node: ProjectedLayoutShape,
  color: PdfRgbColor,
): PdfRgbColor | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (semantic.feature !== "filter" || semantic.property !== "filter") {
      continue;
    }

    const adjustedColor = pdfAdjustedColorFromCssFilter(semantic.value, color);
    if (
      adjustedColor !== undefined &&
      (pdfSolidShapeColorFilterIsDirectlyProjected(node, semantic.value) ||
        pdfBackgroundLayersColorFilterIsDirectlyProjected(node, semantic.value))
    ) {
      return adjustedColor;
    }

    const brightnessFactor = pdfBrightnessFactorFromCssFilter(semantic.value);
    if (
      brightnessFactor !== undefined &&
      pdfSolidShapeBrightnessFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfBrightnessAdjustedColor(color, brightnessFactor);
    }

    const contrastFactor = pdfContrastFactorFromCssFilter(semantic.value);
    if (
      contrastFactor !== undefined &&
      pdfSolidShapeContrastFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfContrastAdjustedColor(color, contrastFactor);
    }

    const saturateFactor = pdfSaturateFactorFromCssFilter(semantic.value);
    if (
      saturateFactor !== undefined &&
      pdfSolidShapeSaturateFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfSaturateAdjustedColor(color, saturateFactor);
    }

    const grayscaleFactor = pdfGrayscaleFactorFromCssFilter(semantic.value);
    if (
      grayscaleFactor !== undefined &&
      pdfSolidShapeGrayscaleFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfGrayscaleAdjustedColor(color, grayscaleFactor);
    }

    const invertFactor = pdfInvertFactorFromCssFilter(semantic.value);
    if (
      invertFactor !== undefined &&
      pdfSolidShapeInvertFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfInvertAdjustedColor(color, invertFactor);
    }

    const sepiaFactor = pdfSepiaFactorFromCssFilter(semantic.value);
    if (
      sepiaFactor !== undefined &&
      pdfSolidShapeSepiaFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfSepiaAdjustedColor(color, sepiaFactor);
    }

    const hueRotateRadians = pdfHueRotateRadiansFromCssFilter(semantic.value);
    if (
      hueRotateRadians !== undefined &&
      pdfSolidShapeHueRotateFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return pdfHueRotateAdjustedColor(color, hueRotateRadians);
    }
  }

  return undefined;
}

function pdfAdjustedTextColorFromFilters(
  node: ProjectedLayoutText,
  color: PdfRgbColor,
): PdfRgbColor | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (semantic.feature !== "filter" || semantic.property !== "filter") {
      continue;
    }

    const adjustedColor = pdfAdjustedColorFromCssFilter(semantic.value, color);
    if (
      adjustedColor !== undefined &&
      pdfTextColorFilterIsDirectlyProjected(node, semantic.value)
    ) {
      return adjustedColor;
    }
  }

  return undefined;
}

function pdfBackgroundLayersAreDirectlyProjectedForDropShadow(
  layers: readonly BackgroundLayerIR[] | undefined,
): boolean {
  return (
    layers !== undefined &&
    layers.length > 0 &&
    layers.every(
      (layer) =>
        layer.kind === "background-image" ||
        layer.kind === "linear-gradient" ||
        layer.kind === "radial-gradient" ||
        layer.kind === "solid",
    )
  );
}

function pdfSolidBlurFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
  context?: PdfCssFilterLengthContext,
): node is ProjectedLayoutGroup | ProjectedLayoutShape {
  if (!pdfCssFilterIsProjectedAsSolidBlur(value, context)) {
    return false;
  }

  if (node.kind === "group") {
    return (
      node.children.length === 0 &&
      node.fill?.kind === "solid" &&
      !node.backgroundLayers?.length &&
      node.stroke === undefined &&
      node.edgeStrokes === undefined &&
      node.outline === undefined &&
      node.shadow === undefined
    );
  }

  if (node.kind === "shape") {
    return (
      (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
      node.fill?.kind === "solid" &&
      !node.backgroundLayers?.length &&
      node.stroke === undefined &&
      node.edgeStrokes === undefined &&
      node.outline === undefined &&
      node.shadow === undefined
    );
  }

  return false;
}

function pdfDropShadowFilterIsDirectlyProjected(
  node: ProjectedLayoutNode,
  value: string,
): node is
  | ProjectedLayoutGroup
  | ProjectedLayoutImage
  | ProjectedLayoutShape
  | ProjectedLayoutTable
  | ProjectedLayoutText
  | ProjectedLayoutVideo {
  if (!pdfCssFilterIsProjectedAsDropShadow(value)) {
    return false;
  }

  if (node.kind === "group") {
    return (
      (pdfShapeFillIsDirectlyProjected(node.fill) ||
        pdfBackgroundLayersAreDirectlyProjectedForDropShadow(node.backgroundLayers)) &&
      node.shadow === undefined
    );
  }

  if (node.kind === "shape") {
    return (
      (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse") &&
      (pdfShapeFillIsDirectlyProjected(node.fill) ||
        pdfBackgroundLayersAreDirectlyProjectedForDropShadow(node.backgroundLayers)) &&
      node.shadow === undefined
    );
  }

  if (node.kind === "table") {
    return node.shadow === undefined;
  }

  if (node.kind === "image" || node.kind === "video") {
    return node.shadow === undefined;
  }

  if (node.kind === "text") {
    const shadow = pdfDropShadowFromCssFilter(value);
    return node.shadow === undefined && shadow !== undefined;
  }

  return false;
}

function pdfFilterIsNoopOnVisuallyEmptyGroup(node: ProjectedLayoutNode): boolean {
  return (
    node.kind === "group" &&
    node.children.length === 0 &&
    node.fill === undefined &&
    (node.backgroundLayers?.length ?? 0) === 0 &&
    node.stroke === undefined &&
    node.edgeStrokes === undefined &&
    node.outline === undefined &&
    node.shadow === undefined
  );
}

function pdfFilterIsNoopOnZeroAreaNode(node: ProjectedLayoutNode): boolean {
  if (node.kind === "shape" && node.shape !== "line") {
    return pdfNonLineShapeHasZeroArea(node);
  }

  return node.kind === "group" && pdfEmptyGroupHasZeroArea(node);
}

function pdfFilterIsNoopOnEffectiveTransparentNode(
  node: ProjectedLayoutNode,
  inheritedOpacity: number | undefined,
): boolean {
  return combinePdfOpacity(inheritedOpacity, pdfOpacityForLayoutNode(node)) === 0;
}

function pdfNonLineShapeHasZeroArea(node: ProjectedLayoutShape): boolean {
  return node.shape !== "line" && (node.frame.widthEmu <= 0 || node.frame.heightEmu <= 0);
}

function pdfEmptyGroupHasZeroArea(node: ProjectedLayoutGroup): boolean {
  return node.children.length === 0 && (node.frame.widthEmu <= 0 || node.frame.heightEmu <= 0);
}

function pdfProjectionHandlesUnsupportedSemantic(input: {
  readonly node: ProjectedLayoutNode;
  readonly semantic: ProjectedUnsupportedSemantic;
  readonly assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
  readonly filterLengthContext?: PdfCssFilterLengthContext;
  readonly inheritedOpacity?: number;
}): boolean {
  const { node, semantic } = input;
  if (node.visibility === "hidden") {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfFilterIsNoopOnVisuallyEmptyGroup(node)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfFilterIsNoopOnZeroAreaNode(node)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfFilterIsNoopOnEffectiveTransparentNode(node, input.inheritedOpacity)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsVisualNoop(semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsOpacity(semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidBlurFilterIsDirectlyProjected(node, semantic.value, input.filterLengthContext)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfDropShadowFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeBrightnessFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeContrastFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeColorFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfTextColorFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfImageColorFilterIsDirectlyProjected({
      node,
      value: semantic.value,
      ...(node.kind === "image"
        ? { asset: imageAssetForLayoutImage({ node, assets: input.assets }) }
        : {}),
    })
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfVideoPosterColorFilterIsDirectlyProjected({
      node,
      value: semantic.value,
      ...(node.kind === "video"
        ? { asset: imageAssetForVideoPoster({ node, assets: input.assets }) }
        : {}),
    })
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfBackgroundLayersColorFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    node.kind === "table" &&
    pdfTableBackgroundLayersColorFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeSaturateFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeGrayscaleFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeInvertFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeSepiaFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfSolidShapeHueRotateFilterIsDirectlyProjected(node, semantic.value)
  ) {
    return true;
  }
  if (
    semantic.feature === "isolation" &&
    semantic.property === "isolation" &&
    semantic.value === "isolate"
  ) {
    return true;
  }
  if (
    semantic.feature === "clipping" &&
    (semantic.property === "overflow" || semantic.property === "imageSourceRect") &&
    (node.kind === "image" || node.kind === "video") &&
    node.clip !== undefined &&
    pdfNodeHasAuthoredTransform(node)
  ) {
    return true;
  }
  if (
    semantic.feature === "transform" &&
    semantic.property === "stackingContext" &&
    node.kind === "group" &&
    pdfGroupTransformStackingContextIsDirectlyProjected(node)
  ) {
    return true;
  }
  if (semantic.feature === "opacity" && semantic.property === "opacity" && node.kind === "group") {
    return pdfGroupOpacityStackingContextIsDirectlyProjected(node);
  }
  if (
    semantic.feature === "opacity" &&
    semantic.property === "stackingContext" &&
    node.kind === "text" &&
    pdfTextOpacityStackingContextIsDirectlyProjected()
  ) {
    return true;
  }
  if (
    semantic.feature === "opacity" &&
    semantic.property === "stackingContext" &&
    (node.kind === "image" || node.kind === "video")
  ) {
    return true;
  }
  if (
    semantic.feature === "opacity" &&
    semantic.property === "stackingContext" &&
    node.kind === "shape" &&
    pdfShapeOpacityStackingContextIsDirectlyProjected(node)
  ) {
    return true;
  }
  if (
    semantic.feature === "blend" &&
    semantic.property === "mixBlendMode" &&
    (node.kind === "shape" ||
      node.kind === "text" ||
      node.kind === "table" ||
      node.kind === "image" ||
      node.kind === "video" ||
      node.kind === "group") &&
    pdfBlendModeFromCssMixBlendMode(semantic.value) !== undefined
  ) {
    return true;
  }

  if (
    semantic.feature !== "shadow" ||
    !semantic.fallback?.missing.includes("cssShadowSpreadRadius")
  ) {
    return false;
  }

  if (
    node.kind === "group" ||
    node.kind === "table" ||
    node.kind === "image" ||
    node.kind === "video"
  ) {
    return node.shadow?.type === "outer" && node.shadow.spreadPt !== undefined;
  }

  if (node.kind === "shape") {
    return (
      node.shadow?.type === "outer" &&
      node.shadow.spreadPt !== undefined &&
      (node.shape === "rect" || node.shape === "roundRect" || node.shape === "ellipse")
    );
  }

  return false;
}

function pdfProjectionHandlesUnsupportedTableCellSemantic(input: {
  readonly cell: ProjectedLayoutTableCell;
  readonly semantic: ProjectedUnsupportedSemantic;
  readonly effectiveOpacity?: number;
}): boolean {
  const { semantic } = input;
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    input.effectiveOpacity === 0
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsVisualNoop(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsOpacity(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsDropShadow(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfTableCellBackgroundLayersColorFilterIsDirectlyProjected(input.cell, semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "blend" &&
    semantic.property === "mixBlendMode" &&
    pdfBlendModeFromCssMixBlendMode(semantic.value) !== undefined
  ) {
    return true;
  }

  return false;
}

function pdfProjectionHandlesUnsupportedTableRowSemantic(input: {
  readonly row: ProjectedLayoutTable["sections"][number]["rows"][number];
  readonly semantic: ProjectedUnsupportedSemantic;
  readonly effectiveOpacity?: number;
}): boolean {
  const { semantic } = input;
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    input.effectiveOpacity === 0
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsVisualNoop(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsOpacity(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsDropShadow(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfTableRowBackgroundLayersColorFilterIsDirectlyProjected(input.row, semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "blend" &&
    semantic.property === "mixBlendMode" &&
    pdfBlendModeFromCssMixBlendMode(semantic.value) !== undefined
  ) {
    return true;
  }

  return false;
}

function pdfProjectionHandlesUnsupportedTableSectionSemantic(input: {
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly semantic: ProjectedUnsupportedSemantic;
  readonly effectiveOpacity?: number;
}): boolean {
  const { semantic } = input;
  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    input.effectiveOpacity === 0
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsVisualNoop(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsOpacity(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfCssFilterIsProjectedAsDropShadow(semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "filter" &&
    semantic.property === "filter" &&
    pdfTableSectionBackgroundLayersColorFilterIsDirectlyProjected(input.section, semantic.value)
  ) {
    return true;
  }

  if (
    semantic.feature === "blend" &&
    semantic.property === "mixBlendMode" &&
    pdfBlendModeFromCssMixBlendMode(semantic.value) !== undefined
  ) {
    return true;
  }

  return false;
}

function unsupportedSemanticFallbacksFromTableSection(input: {
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly sectionNodeId: string;
  readonly pageId: PdfPage["id"];
  readonly seenKeys: Set<string>;
  readonly effectiveOpacity?: number;
}): readonly PdfFallback[] {
  const fallbacks: PdfFallback[] = [];

  const semantics = [
    ...(input.section.unsupportedSemantics ?? []),
    ...(input.effectiveOpacity === 0
      ? []
      : pdfVariableGradientOpacityUnsupportedSemantics(input.section)),
  ];
  semantics.forEach((semantic) => {
    if (
      pdfProjectionHandlesUnsupportedTableSectionSemantic({
        section: input.section,
        semantic,
        ...(input.effectiveOpacity !== undefined
          ? { effectiveOpacity: input.effectiveOpacity }
          : {}),
      })
    ) {
      return;
    }

    const key = unsupportedSemanticFallbackKey({
      pageId: input.pageId,
      nodeId: input.sectionNodeId,
      semantic,
    });
    if (input.seenKeys.has(key)) {
      return;
    }

    input.seenKeys.add(key);
    fallbacks.push(
      pdfFallbackForUnsupportedSemantic({
        pageId: input.pageId,
        nodeId: input.sectionNodeId,
        kind: "table",
        semantic,
        origin: pdfOriginFromLayoutOrigin(input.section.origin),
      }),
    );
  });

  return fallbacks;
}

function unsupportedSemanticFallbacksFromTableRow(input: {
  readonly row: ProjectedLayoutTable["sections"][number]["rows"][number];
  readonly rowNodeId: string;
  readonly pageId: PdfPage["id"];
  readonly seenKeys: Set<string>;
  readonly effectiveOpacity?: number;
}): readonly PdfFallback[] {
  const fallbacks: PdfFallback[] = [];

  const semantics = [
    ...(input.row.unsupportedSemantics ?? []),
    ...(input.effectiveOpacity === 0
      ? []
      : pdfVariableGradientOpacityUnsupportedSemantics(input.row)),
  ];
  semantics.forEach((semantic) => {
    if (
      pdfProjectionHandlesUnsupportedTableRowSemantic({
        row: input.row,
        semantic,
        ...(input.effectiveOpacity !== undefined
          ? { effectiveOpacity: input.effectiveOpacity }
          : {}),
      })
    ) {
      return;
    }

    const key = unsupportedSemanticFallbackKey({
      pageId: input.pageId,
      nodeId: input.rowNodeId,
      semantic,
    });
    if (input.seenKeys.has(key)) {
      return;
    }

    input.seenKeys.add(key);
    fallbacks.push(
      pdfFallbackForUnsupportedSemantic({
        pageId: input.pageId,
        nodeId: input.rowNodeId,
        kind: "table",
        semantic,
        origin: pdfOriginFromLayoutOrigin(input.row.origin),
      }),
    );
  });

  return fallbacks;
}

function unsupportedSemanticFallbacksFromTableCell(input: {
  readonly cell: ProjectedLayoutTableCell;
  readonly cellNodeId: string;
  readonly pageId: PdfPage["id"];
  readonly seenKeys: Set<string>;
  readonly effectiveOpacity?: number;
}): readonly PdfFallback[] {
  const fallbacks: PdfFallback[] = [];

  const semantics = [
    ...(input.cell.unsupportedSemantics ?? []),
    ...(input.effectiveOpacity === 0
      ? []
      : pdfVariableGradientOpacityUnsupportedSemantics(input.cell)),
  ];
  semantics.forEach((semantic) => {
    if (
      pdfProjectionHandlesUnsupportedTableCellSemantic({
        cell: input.cell,
        semantic,
        ...(input.effectiveOpacity !== undefined
          ? { effectiveOpacity: input.effectiveOpacity }
          : {}),
      })
    ) {
      return;
    }

    const key = unsupportedSemanticFallbackKey({
      pageId: input.pageId,
      nodeId: input.cellNodeId,
      semantic,
    });
    if (input.seenKeys.has(key)) {
      return;
    }

    input.seenKeys.add(key);
    fallbacks.push(
      pdfFallbackForUnsupportedSemantic({
        pageId: input.pageId,
        nodeId: input.cellNodeId,
        kind: "table",
        semantic,
        origin: pdfOriginFromLayoutOrigin(input.cell.origin),
      }),
    );
  });

  return fallbacks;
}

function unsupportedSemanticFallbacksFromNode(input: {
  readonly filterLengthContext?: PdfCssFilterLengthContext;
  readonly node: ProjectedLayoutNode;
  readonly pageId: PdfPage["id"];
  readonly seenKeys: Set<string>;
  readonly assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
  readonly hidden?: boolean;
  readonly inheritedOpacity?: number;
}): readonly PdfFallback[] {
  const hidden = input.hidden || input.node.visibility === "hidden";
  if (hidden) {
    return [];
  }
  const effectiveOpacity = combinePdfOpacity(
    input.inheritedOpacity,
    pdfOpacityForLayoutNode(input.node),
  );

  const fallbacks: PdfFallback[] = [];

  const semantics = [
    ...(input.node.unsupportedSemantics ?? []),
    ...(effectiveOpacity === 0 || input.node.kind === "image" || input.node.kind === "video"
      ? []
      : pdfVariableGradientOpacityUnsupportedSemantics(input.node)),
  ];
  semantics.forEach((semantic) => {
    if (
      pdfProjectionHandlesUnsupportedSemantic({
        node: input.node,
        semantic,
        assets: input.assets,
        filterLengthContext: input.filterLengthContext,
        inheritedOpacity: input.inheritedOpacity,
      })
    ) {
      return;
    }

    const key = unsupportedSemanticFallbackKey({
      pageId: input.pageId,
      nodeId: input.node.id,
      semantic,
    });
    if (input.seenKeys.has(key)) {
      return;
    }

    input.seenKeys.add(key);
    fallbacks.push(
      pdfFallbackForUnsupportedSemantic({
        pageId: input.pageId,
        nodeId: input.node.id,
        kind: input.node.kind,
        semantic,
        origin: pdfOriginFromLayoutOrigin(input.node.origin),
      }),
    );
  });

  const innerShadowSemantic = pdfInnerShadowUnsupportedSemantic(input.node);
  if (innerShadowSemantic) {
    const key = unsupportedSemanticFallbackKey({
      pageId: input.pageId,
      nodeId: input.node.id,
      semantic: innerShadowSemantic,
    });
    if (!input.seenKeys.has(key)) {
      input.seenKeys.add(key);
      fallbacks.push(
        pdfFallbackForUnsupportedSemantic({
          pageId: input.pageId,
          nodeId: input.node.id,
          kind: input.node.kind,
          semantic: innerShadowSemantic,
          origin: pdfOriginFromLayoutOrigin(input.node.origin),
        }),
      );
    }
  }

  if (input.node.kind === "group") {
    fallbacks.push(
      ...input.node.children.flatMap((child) =>
        unsupportedSemanticFallbacksFromNode({
          node: child,
          pageId: input.pageId,
          seenKeys: input.seenKeys,
          hidden,
          filterLengthContext: input.filterLengthContext,
          assets: input.assets,
          inheritedOpacity: effectiveOpacity,
        }),
      ),
    );
  }

  if (input.node.kind === "table") {
    fallbacks.push(
      ...input.node.sections.flatMap((section, sectionIndex) => {
        const sectionOpacity = combinePdfOpacity(
          input.inheritedOpacity,
          pdfOpacityForTableSection(input.node as ProjectedLayoutTable, section),
        );
        return [
          ...unsupportedSemanticFallbacksFromTableSection({
            section,
            sectionNodeId: `${input.node.id}:section:${section.sectionKind}:${sectionIndex}`,
            pageId: input.pageId,
            seenKeys: input.seenKeys,
            effectiveOpacity: sectionOpacity,
          }),
          ...section.rows.flatMap((row, rowIndex) => {
            const rowOpacity = combinePdfOpacity(
              input.inheritedOpacity,
              pdfOpacityForTableRow(input.node as ProjectedLayoutTable, section, row),
            );
            return [
              ...unsupportedSemanticFallbacksFromTableRow({
                row,
                rowNodeId: `${input.node.id}:row:${section.sectionKind}:${sectionIndex}:${rowIndex}`,
                pageId: input.pageId,
                seenKeys: input.seenKeys,
                effectiveOpacity: rowOpacity,
              }),
              ...row.cells.flatMap((cell, cellIndex) => {
                const cellOpacity = combinePdfOpacity(
                  input.inheritedOpacity,
                  pdfOpacityForTableCell(input.node as ProjectedLayoutTable, section, row, cell),
                );
                return [
                  ...unsupportedSemanticFallbacksFromTableCell({
                    cell,
                    cellNodeId: `${input.node.id}:cell:${section.sectionKind}:${sectionIndex}:${rowIndex}:${cellIndex}`,
                    pageId: input.pageId,
                    seenKeys: input.seenKeys,
                    effectiveOpacity: cellOpacity,
                  }),
                  ...cell.children.flatMap((child) =>
                    unsupportedSemanticFallbacksFromNode({
                      node: child,
                      pageId: input.pageId,
                      seenKeys: input.seenKeys,
                      hidden,
                      filterLengthContext: input.filterLengthContext,
                      assets: input.assets,
                      inheritedOpacity: cellOpacity,
                    }),
                  ),
                ];
              }),
            ];
          }),
        ];
      }),
    );
  }

  return fallbacks;
}

function unsupportedSemanticFallbacksFromSlide(input: {
  readonly filterLengthContext?: PdfCssFilterLengthContext;
  readonly slide: ProjectedLayoutSlide | undefined;
  readonly pageId: PdfPage["id"];
  readonly assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
}): readonly PdfFallback[] {
  const seenKeys = new Set<string>();
  return (
    input.slide?.nodes.flatMap((node) =>
      unsupportedSemanticFallbacksFromNode({
        node,
        pageId: input.pageId,
        seenKeys,
        hidden: false,
        assets: input.assets,
        filterLengthContext: input.filterLengthContext,
      }),
    ) ?? []
  );
}

function unsupportedTextEncodingSnippet(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized;
}

function pdfFallbackForUnsupportedTextEncoding(input: {
  readonly pageId: PdfPage["id"];
  readonly text: string;
}): PdfFallback {
  const snippet = unsupportedTextEncodingSnippet(input.text);
  return {
    code: "E_PDF_UNRESOLVED_FONT_GLYPH",
    pageId: input.pageId,
    message: `PDF projection cannot resolve text "${snippet}" to an embedded Unicode font. Register an embeddable Font Asset with glyph coverage for this text.`,
  };
}

function pdfFallbackForMissingFontGlyph(input: {
  readonly pageId: PdfPage["id"];
  readonly text: string;
  readonly font: PdfFontResource;
  readonly missingText: string;
}): PdfFallback {
  const snippet = unsupportedTextEncodingSnippet(input.text);
  const missing = unsupportedTextEncodingSnippet(input.missingText);
  return {
    code: "E_PDF_UNRESOLVED_FONT_GLYPH",
    pageId: input.pageId,
    message: `PDF projection cannot resolve "${missing}" in embedded font asset "${input.font.sourceKey ?? input.font.name}" for text "${snippet}". Register a Font Asset with glyph coverage for the unresolved text.`,
  };
}

function pdfFallbackForNonBmpText(input: {
  readonly pageId: PdfPage["id"];
  readonly text: string;
  readonly nonBmpText: string;
}): PdfFallback {
  const snippet = unsupportedTextEncodingSnippet(input.text);
  const nonBmp = unsupportedTextEncodingSnippet(input.nonBmpText);
  return {
    code: "W_PDF_NON_BMP_TEXT",
    pageId: input.pageId,
    message: `PDF projection rendered non-BMP text "${nonBmp}" in "${snippet}"; Identity-H output currently maps UTF-16 code units as CIDs, so these characters may not render or extract correctly.`,
  };
}

function textOperationUsesUnicodeFallback(input: {
  readonly operation: PdfContentOp;
  readonly resources: PdfResourceDictionary;
}): boolean {
  if (input.operation.op !== "text") {
    return false;
  }

  const operation = input.operation;
  if (pdfTextEncodingIsSupported(operation.text)) {
    return false;
  }

  const font = input.resources.fonts.find((resource) => resource.id === operation.fontId);
  return font?.encoding !== "identity-h" || font.fallback === true || !font.data;
}

function unsupportedTextEncodingFallbacksFromPage(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
}): readonly PdfFallback[] {
  return input.page.content.flatMap((operation) => {
    if (operation.op !== "text") {
      return [];
    }
    if (!textOperationUsesUnicodeFallback({ operation, resources: input.resources })) {
      return [];
    }

    return [
      pdfFallbackForUnsupportedTextEncoding({
        pageId: input.page.id,
        text: operation.text,
      }),
    ];
  });
}

function unicodeCodePointsForText(text: string): readonly number[] {
  const codePoints = new Set<number>();
  for (const character of Array.from(text)) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      codePoints.add(codePoint);
    }
  }
  return [...codePoints].sort((left, right) => left - right);
}

function missingMappedGlyphFallbackFromTextOperation(input: {
  readonly pageId: PdfPage["id"];
  readonly operation: PdfContentOp;
  readonly resources: PdfResourceDictionary;
}): PdfFallback | undefined {
  if (input.operation.op !== "text") {
    return undefined;
  }

  const operation = input.operation;
  const font = input.resources.fonts.find((resource) => resource.id === operation.fontId);
  if (!font?.data || font.fallback === true) {
    return undefined;
  }
  if (!trueTypeFontHasCmap(font.data)) {
    return undefined;
  }

  const codePoints = unicodeCodePointsForText(operation.text);
  const glyphIds = parseTrueTypeCodeUnitGlyphIds(font.data, codePoints);
  const missingCodePoints = codePoints.filter((codePoint) => !glyphIds.has(codePoint));
  if (missingCodePoints.length === 0) {
    return undefined;
  }

  return pdfFallbackForMissingFontGlyph({
    pageId: input.pageId,
    text: operation.text,
    font,
    missingText: String.fromCodePoint(...missingCodePoints),
  });
}

function missingMappedGlyphFallbacksFromPage(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
}): readonly PdfFallback[] {
  return input.page.content.flatMap((operation) => {
    const fallback = missingMappedGlyphFallbackFromTextOperation({
      pageId: input.page.id,
      operation,
      resources: input.resources,
    });
    return fallback ? [fallback] : [];
  });
}

function nonBmpCharacters(text: string): string {
  return Array.from(text)
    .filter((character) => (character.codePointAt(0) ?? 0) > 0xffff)
    .join("");
}

function nonBmpTextCanUseEmbeddedFont(input: {
  readonly operation: PdfContentOp;
  readonly resources: PdfResourceDictionary;
}): boolean {
  if (input.operation.op !== "text") {
    return false;
  }

  const operation = input.operation;
  const font = input.resources.fonts.find((resource) => resource.id === operation.fontId);
  if (!font?.data || font.encoding !== "identity-h" || font.fallback === true) {
    return false;
  }

  const nonBmpCodePoints = unicodeCodePointsForText(operation.text).filter(
    (codePoint) => codePoint > 0xffff,
  );
  if (nonBmpCodePoints.length === 0) {
    return true;
  }

  const glyphIds = parseTrueTypeCodeUnitGlyphIds(font.data, nonBmpCodePoints);
  return nonBmpCodePoints.every((codePoint) => glyphIds.has(codePoint));
}

function nonBmpTextFallbacksFromPage(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
}): readonly PdfFallback[] {
  return input.page.content.flatMap((operation) => {
    if (operation.op !== "text" || operation.textEncoding !== "utf16be") {
      return [];
    }

    const nonBmpText = nonBmpCharacters(operation.text);
    if (nonBmpText.length === 0) {
      return [];
    }
    if (nonBmpTextCanUseEmbeddedFont({ operation, resources: input.resources })) {
      return [];
    }

    return [
      pdfFallbackForNonBmpText({
        pageId: input.page.id,
        text: operation.text,
        nonBmpText,
      }),
    ];
  });
}

function annotationsFromLayoutNode(node: ProjectedLayoutNode): readonly PdfPageAnnotation[] {
  if (node.visibility === "hidden") {
    return [];
  }

  if (node.kind === "group") {
    return node.children.flatMap(annotationsFromLayoutNode);
  }

  if (node.kind === "table") {
    return node.sections.flatMap((section) =>
      section.rows.flatMap((row) =>
        row.cells.flatMap((cell) => {
          const cellAnnotation = linkAnnotationFromBox({
            box: boxFromFrame(cell.frame),
            hyperlink: cell.hyperlink,
          });
          return [
            ...(cellAnnotation ? [cellAnnotation] : []),
            ...cell.children.flatMap(annotationsFromLayoutNode),
          ];
        }),
      ),
    );
  }

  const annotation = (() => {
    if (node.kind !== "text" && node.kind !== "image" && node.kind !== "shape") {
      return undefined;
    }

    const frameBox = boxFromFrame(node.frame);
    const transformedBox = transformedPdfRectangle(frameBox, frameBox, {
      rotation: node.rotation,
      flipH: node.flipH,
      flipV: node.flipV,
    });
    const clipBox = node.clip ? boxFromFrame(node.clip.clipFrame) : undefined;
    const annotationBox = clipBox
      ? intersectPdfRectangles(transformedBox, clipBox)
      : transformedBox;
    return annotationBox
      ? linkAnnotationFromBox({ box: annotationBox, hyperlink: node.hyperlink })
      : undefined;
  })();

  return annotation ? [annotation] : [];
}

function annotationsFromLayoutSlide(
  slide: ProjectedLayoutSlide | undefined,
): readonly PdfPageAnnotation[] {
  return slide?.nodes.flatMap(annotationsFromLayoutNode) ?? [];
}

function explicitFontRequestsByTextNode(input: {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly integrationContext?: DeckIntegrationContext;
}): ReadonlyMap<GraphNodeId, FontRequest> {
  const requests = new Map<GraphNodeId, FontRequest>();
  const fontAssets = input.integrationContext?.fontAssets ?? [];
  const parentByNodeId = parentGraphNodeIds(input.graph);

  input.graph.nodes.forEach((node) => {
    if (node.kind !== "text" && node.kind !== "textRun") {
      return;
    }
    if (node.kind === "textRun" && !node.styleRef) {
      return;
    }
    if (
      graphNodeIsHiddenForPdfFontRequest({
        nodeId: node.id,
        parentByNodeId,
        resolvedStyles: input.resolvedStyles,
      })
    ) {
      return;
    }

    const request = fontRequestForGraphNode({
      graph: input.graph,
      nodeId: node.id,
      resolvedStyles: input.resolvedStyles,
      fontAssets,
    });
    if (!request) {
      return;
    }

    requests.set(node.id, request);
  });

  return requests;
}

function textNodeFontRequest(input: {
  readonly node: ProjectedLayoutNode;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
}): FontRequest | undefined {
  const graphNodeIds = input.node.origin?.graphNodeIds ?? [];
  for (const graphNodeId of graphNodeIds) {
    const request = input.requestsByTextNode.get(graphNodeId);
    if (request) {
      return request;
    }
  }

  return undefined;
}

function textNodeFontId(input: {
  readonly node: ProjectedLayoutNode;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
}): PdfFontResource["id"] {
  const request = textNodeFontRequest(input);
  if (request) {
    const resourceId = input.resourceIdsByRequestKey.get(fontRequestKey(request));
    if (resourceId) {
      return resourceId;
    }
  }

  return DEFAULT_FONT_RESOURCE_ID;
}

function pdfFontWeightIsBold(weight: TextStyleIR["fontWeight"] | undefined): boolean {
  return weight === "bold" || (typeof weight === "number" && weight >= 600);
}

function defaultStandardFontResourceId(input: {
  readonly fontWeight?: TextStyleIR["fontWeight"];
  readonly italic?: boolean;
}): PdfFontResource["id"] {
  const bold = pdfFontWeightIsBold(input.fontWeight);
  const italic = input.italic === true;
  if (bold && italic) {
    return DEFAULT_BOLD_ITALIC_FONT_RESOURCE_ID;
  }
  if (bold) {
    return DEFAULT_BOLD_FONT_RESOURCE_ID;
  }
  if (italic) {
    return DEFAULT_ITALIC_FONT_RESOURCE_ID;
  }

  return DEFAULT_FONT_RESOURCE_ID;
}

function defaultStandardFontResourceIdForTextStyle(input: {
  readonly nodeStyle: TextStyleIR;
  readonly runStyle?: TextStyleIR;
}): PdfFontResource["id"] {
  return defaultStandardFontResourceId({
    fontWeight: input.runStyle?.fontWeight ?? input.nodeStyle.fontWeight,
    italic: input.runStyle?.italic ?? input.nodeStyle.italic,
  });
}

function rgbColorFromStyle(value: string | undefined): PdfRgbColor | undefined {
  const color = normalizeColor(value);
  if (!color || !/^[0-9A-F]{6}$/u.test(color)) {
    return undefined;
  }

  return {
    r: Number.parseInt(color.slice(0, 2), 16) / 255,
    g: Number.parseInt(color.slice(2, 4), 16) / 255,
    b: Number.parseInt(color.slice(4, 6), 16) / 255,
  };
}

function pdfOpacityForTextPaint(
  node: ProjectedLayoutNode,
  transparency: number | undefined,
): number | undefined {
  return combinePdfOpacity(pdfOpacityForLayoutNode(node), pdfOpacityFromTransparency(transparency));
}

const trueTypeFontMetricsByData = new WeakMap<
  Uint8Array,
  ReturnType<typeof parseTrueTypeFontMetrics>
>();

function trueTypeFontMetrics(data: Uint8Array) {
  const cached = trueTypeFontMetricsByData.get(data);
  if (cached !== undefined) {
    return cached;
  }

  const metrics = parseTrueTypeFontMetrics(data);
  trueTypeFontMetricsByData.set(data, metrics);
  return metrics;
}

function embeddedPdfFontCharacterWidthUnits(
  char: string,
  font: PdfFontResource | undefined,
): number | undefined {
  if (!font?.data) {
    return undefined;
  }

  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) {
    return undefined;
  }
  if (codePoint >= 32 && codePoint <= 255) {
    return trueTypeFontMetrics(font.data)?.winAnsiWidths?.[codePoint - 32];
  }

  return parseTrueTypeCodeUnitWidths(font.data, [codePoint]).get(codePoint);
}

function pdfKerningAdjustments(
  text: string,
  font: PdfFontResource | undefined,
): readonly number[] | undefined {
  if (!font?.data) {
    return undefined;
  }

  const codePoints = Array.from(text, (character) => character.codePointAt(0) ?? 0);
  if (codePoints.length < 2) {
    return undefined;
  }

  const pairs = parseTrueTypeFontKerning(font.data, codePoints);
  const adjustments = codePoints.slice(0, -1).map((codePoint, index) => {
    const nextCodePoint = codePoints[index + 1];
    return nextCodePoint === undefined ? 0 : (pairs.get(`${codePoint}:${nextCodePoint}`) ?? 0);
  });
  return adjustments.some((adjustment) => adjustment !== 0) ? adjustments : undefined;
}

function estimatedPdfCharacterWidthPt(
  char: string,
  fontSizePt: number,
  font?: PdfFontResource,
): number {
  const embeddedWidthUnits = embeddedPdfFontCharacterWidthUnits(char, font);
  if (embeddedWidthUnits !== undefined) {
    return (fontSizePt * embeddedWidthUnits) / 1000;
  }

  const codePoint = char.codePointAt(0);
  if (codePoint !== undefined) {
    const widthUnits =
      font?.family === "Helvetica" && typeof font.weight === "number" && font.weight >= 600
        ? HELVETICA_BOLD_ASCII_WIDTH_UNITS_BY_CODE[codePoint]
        : HELVETICA_ASCII_WIDTH_UNITS_BY_CODE[codePoint];
    if (widthUnits !== undefined) {
      return (fontSizePt * widthUnits) / 1000;
    }
  }

  if (/\s/u.test(char)) {
    return (fontSizePt * HELVETICA_ASCII_WIDTH_UNITS_BY_CODE[32]!) / 1000;
  }

  return char.charCodeAt(0) > 0x7f ? fontSizePt : fontSizePt * 0.55;
}

function estimatedPdfTextWidthPt(text: string, fontSizePt: number, font?: PdfFontResource): number {
  if (font?.data) {
    const shapedWidthUnits = shapedTextWidthUnits(font.data, text);
    if (shapedWidthUnits.value !== undefined) {
      return (fontSizePt * shapedWidthUnits.value) / 1000;
    }
  }

  const width = Array.from(text).reduce(
    (total, char) => total + estimatedPdfCharacterWidthPt(char, fontSizePt, font),
    0,
  );
  const kerning = pdfKerningAdjustments(text, font) ?? [];
  return width + kerning.reduce((total, adjustment) => total + (fontSizePt * adjustment) / 1000, 0);
}

function estimatedPdfTextWidthWithCharSpacingPt(
  text: string,
  fontSizePt: number,
  charSpacing: number | undefined,
  font?: PdfFontResource,
): number {
  const baseWidth = estimatedPdfTextWidthPt(text, fontSizePt, font);
  const characterCount = Array.from(text).length;
  return baseWidth + Math.max(0, characterCount - 1) * (charSpacing ?? 0);
}

function pdfScriptTextMetrics(input: {
  readonly fontSize: number;
  readonly superscript?: boolean;
  readonly subscript?: boolean;
}): { readonly fontSize: number; readonly textRise?: number; readonly lineFontSize: number } {
  if (input.superscript) {
    return {
      fontSize: input.fontSize * 0.65,
      textRise: input.fontSize * 0.35,
      lineFontSize: input.fontSize,
    };
  }

  if (input.subscript) {
    return {
      fontSize: input.fontSize * 0.65,
      textRise: -input.fontSize * 0.2,
      lineFontSize: input.fontSize,
    };
  }

  return { fontSize: input.fontSize, lineFontSize: input.fontSize };
}

function pdfTextDirectionRotation(style: TextStyleIR): number | undefined {
  switch (style.textDirection) {
    case "vert":
      return 90;
    case "vert270":
      return 270;
    case "horz":
    case undefined:
      return undefined;
  }
}

function normalizePdfRotation(value: number): number {
  const rotation = value % 360;
  return rotation < 0 ? rotation + 360 : rotation;
}

function pdfTextRotationFromLayoutText(node: ProjectedLayoutText): number | undefined {
  const textDirectionRotation = pdfTextDirectionRotation(node.style);
  if (node.rotation === undefined) {
    return textDirectionRotation;
  }
  if (textDirectionRotation === undefined) {
    return node.rotation;
  }

  const combined = normalizePdfRotation(node.rotation + textDirectionRotation);
  return combined === 0 ? undefined : combined;
}

function solidFillColor(fill: FillIR | undefined): PdfRgbColor | undefined {
  if (!fill || fill.kind !== "solid") {
    return undefined;
  }

  return rgbColorFromStyle(fill.color);
}

function solidFillOpacity(fill: FillIR | undefined): number | undefined {
  if (!fill || fill.kind !== "solid") {
    return undefined;
  }

  return pdfOpacityFromTransparency(fill.transparency);
}

type PdfShapeFill = NonNullable<Extract<PdfVisualElement, { kind: "shape" }>["fill"]>;

function pdfShapeFillFromFill(input: {
  readonly fill: FillIR | undefined;
  readonly scopeId: string;
  readonly box: PdfRectangle;
  readonly pdfColorFilter?: string;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfShapeFill | undefined {
  const fillColor = solidFillColor(input.fill);
  if (fillColor) {
    const adjustedColor = input.pdfColorFilter
      ? pdfAdjustedColorFromCssFilter(input.pdfColorFilter, fillColor)
      : undefined;
    return {
      color: adjustedColor ?? fillColor,
      ...(solidFillOpacity(input.fill) !== undefined
        ? { opacity: solidFillOpacity(input.fill) }
        : {}),
    };
  }

  const gradient =
    input.fill?.kind === "linear-gradient"
      ? pdfLinearGradientResourceForFill({
          fill: input.fill,
          scopeId: input.scopeId,
          layerIndex: 0,
          box: input.box,
          ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
          gradientResourcesById: input.gradientResourcesById,
        })
      : input.fill?.kind === "radial-gradient"
        ? pdfRadialGradientResourceForFill({
            fill: input.fill,
            scopeId: input.scopeId,
            layerIndex: 0,
            box: input.box,
            ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
            gradientResourcesById: input.gradientResourcesById,
          })
        : undefined;
  if (!gradient) {
    return undefined;
  }

  return pdfShapeFillFromGradientResource(gradient);
}

function strokeColor(stroke: StrokeIR | undefined): PdfRgbColor | undefined {
  if (!stroke) {
    return undefined;
  }

  return rgbColorFromStyle(stroke.color);
}

function pdfStrokeDash(stroke: StrokeIR | undefined): "dash" | "sysDot" | undefined {
  if (stroke?.dashType === "dash" || stroke?.dashType === "sysDot") {
    return stroke.dashType;
  }

  return undefined;
}

function pdfStrokeLineCap(stroke: StrokeIR | undefined): "butt" | "round" | "square" | undefined {
  return stroke?.lineCap;
}

function pdfStrokeLineJoin(stroke: StrokeIR | undefined): "bevel" | "miter" | "round" | undefined {
  return stroke?.lineJoin;
}

function shadowOffset(shadow: ShadowIR): { readonly x: number; readonly y: number } {
  const radians = (shadow.angle * Math.PI) / 180;
  return {
    x: Math.cos(radians) * shadow.offsetPt,
    y: -Math.sin(radians) * shadow.offsetPt,
  };
}

function shadowBoxFromFrame(frame: FrameIR, shadow: ShadowIR): PdfRectangle {
  return shadowBoxFromBox(boxFromFrame(frame), shadow);
}

function pdfRectanglesOverlap(a: PdfRectangle, b: PdfRectangle): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
    return false;
  }

  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function shadowBoxFromBox(box: PdfRectangle, shadow: ShadowIR): PdfRectangle {
  const offset = shadowOffset(shadow);
  const spread = shadow.spreadPt ?? 0;

  return {
    x: box.x + offset.x - spread,
    y: box.y + offset.y - spread,
    width: Math.max(0, box.width + spread * 2),
    height: Math.max(0, box.height + spread * 2),
  };
}

function innerShadowBaseBoxFromFrame(frame: FrameIR, shadow: ShadowIR): PdfRectangle | undefined {
  if (shadow.type !== "inner" || (shadow.spreadPt ?? 0) !== 0) {
    return undefined;
  }

  return innerShadowBaseBoxFromBox(boxFromFrame(frame), shadow);
}

function innerShadowBaseBoxFromBox(box: PdfRectangle, shadow: ShadowIR): PdfRectangle | undefined {
  if (shadow.type !== "inner" || (shadow.spreadPt ?? 0) !== 0) {
    return undefined;
  }

  const offset = shadowOffset(shadow);
  if (Math.abs(offset.x) >= Math.abs(offset.y)) {
    const width = Math.min(Math.abs(offset.x), box.width);
    if (width <= 0) {
      return undefined;
    }

    return offset.x >= 0
      ? { x: box.x, y: box.y, width, height: box.height }
      : { x: box.x + box.width - width, y: box.y, width, height: box.height };
  }

  const height = Math.min(Math.abs(offset.y), box.height);
  if (height <= 0) {
    return undefined;
  }

  return offset.y >= 0
    ? { x: box.x, y: box.y, width: box.width, height }
    : { x: box.x, y: box.y + box.height - height, width: box.width, height };
}

function innerShadowBoxFromFrame(frame: FrameIR, shadow: ShadowIR): PdfRectangle | undefined {
  if (shadow.blurPt !== 0) {
    return undefined;
  }

  return innerShadowBoxFromBox(boxFromFrame(frame), shadow);
}

function innerShadowBoxFromBox(box: PdfRectangle, shadow: ShadowIR): PdfRectangle | undefined {
  if (shadow.blurPt !== 0) {
    return undefined;
  }

  return innerShadowBaseBoxFromBox(box, shadow);
}

function blurredInnerShadowVisualLayers(input: {
  readonly shadow: ShadowIR;
  readonly frame?: FrameIR;
  readonly frameBox?: PdfRectangle;
  readonly color: PdfRgbColor;
  readonly radius?: number;
  readonly clipBox?: PdfRectangle;
  readonly clipShape?: PdfShapeVisualElement["clipShape"];
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly zIndex?: number;
  readonly siblingOrder: number;
  readonly generatedLayerPlacement?: PdfPaintOrderInput["generatedLayerPlacement"];
}): readonly PdfVisualElement[] {
  if (input.shadow.type !== "inner" || input.shadow.blurPt <= 0) {
    return [];
  }

  const frameBox = input.frameBox ?? (input.frame ? boxFromFrame(input.frame) : undefined);
  if (!frameBox) {
    return [];
  }

  const baseBox =
    input.frameBox !== undefined
      ? innerShadowBaseBoxFromBox(input.frameBox, input.shadow)
      : input.frame
        ? innerShadowBaseBoxFromFrame(input.frame, input.shadow)
        : undefined;
  if (!baseBox) {
    return [];
  }

  const layerCount = 4;
  const weightTotal = (layerCount * (layerCount + 1)) / 2;
  const alignedToLeft = Math.abs(baseBox.x - frameBox.x) < 0.001;
  const alignedToRight =
    Math.abs(baseBox.x + baseBox.width - (frameBox.x + frameBox.width)) < 0.001;
  const alignedToTop = Math.abs(baseBox.y - frameBox.y) < 0.001;

  return Array.from({ length: layerCount }, (_, index): PdfVisualElement => {
    const expansion = input.shadow.blurPt * ((layerCount - index - 1) / (layerCount - 1));
    const opacity = input.shadow.opacity * ((index + 1) / weightTotal);
    const box = (() => {
      if (alignedToLeft || alignedToRight) {
        const width = Math.min(frameBox.width, baseBox.width + expansion);
        return {
          x: alignedToLeft ? frameBox.x : frameBox.x + frameBox.width - width,
          y: frameBox.y,
          width,
          height: frameBox.height,
        };
      }

      const height = Math.min(frameBox.height, baseBox.height + expansion);
      return {
        x: frameBox.x,
        y: alignedToTop ? frameBox.y : frameBox.y + frameBox.height - height,
        width: frameBox.width,
        height,
      };
    })();

    return {
      kind: "shape",
      shape: input.radius !== undefined ? "roundRect" : "rect",
      box,
      ...(input.radius !== undefined ? { radius: Math.max(0, input.radius + expansion) } : {}),
      ...(input.clipBox ? { clipBox: input.clipBox } : {}),
      ...(input.clipShape ? { clipShape: input.clipShape } : {}),
      ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
      ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
      ...(input.flipH ? { flipH: input.flipH } : {}),
      ...(input.flipV ? { flipV: input.flipV } : {}),
      fill: {
        color: input.color,
        opacity,
      },
      ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      paintOrder: {
        zIndex: input.zIndex,
        siblingOrder: input.siblingOrder + 0.0002 + index / 100_000,
        generatedLayerRole: "shadow",
        generatedLayerPlacement: input.generatedLayerPlacement ?? "aboveBackground",
      },
    };
  });
}

type PdfBlurredShadowLayerInput = {
  readonly shadow: ShadowIR;
  readonly shape: PdfShapeVisualElement["shape"];
  readonly baseBox: PdfRectangle;
  readonly color: PdfRgbColor;
  readonly radius?: number;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly zIndex?: number;
  readonly siblingOrder: number;
};

function blurredShadowVisualLayers(input: PdfBlurredShadowLayerInput): readonly PdfVisualElement[] {
  const layerCount = 4;
  const weightTotal = (layerCount * (layerCount + 1)) / 2;

  return Array.from({ length: layerCount }, (_, index): PdfVisualElement => {
    const expansion = input.shadow.blurPt * ((layerCount - index - 1) / (layerCount - 1));
    const opacity = input.shadow.opacity * ((index + 1) / weightTotal);

    return {
      kind: "shape",
      shape: input.shape,
      box: {
        x: input.baseBox.x - expansion,
        y: input.baseBox.y - expansion,
        width: input.baseBox.width + expansion * 2,
        height: input.baseBox.height + expansion * 2,
      },
      ...(input.radius !== undefined ? { radius: Math.max(0, input.radius + expansion) } : {}),
      ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
      ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
      ...(input.flipH ? { flipH: input.flipH } : {}),
      ...(input.flipV ? { flipV: input.flipV } : {}),
      fill: {
        color: input.color,
        opacity,
      },
      ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      paintOrder: {
        zIndex: input.zIndex,
        siblingOrder: input.siblingOrder - (layerCount - index) / 10_000,
        generatedLayerRole: "shadow",
      },
    };
  });
}

function boxFromFrame(frame: FrameIR): PdfRectangle {
  return {
    x: pointsFromEmu(frame.xEmu),
    y: pointsFromEmu(frame.yEmu),
    width: pointsFromEmu(frame.widthEmu),
    height: pointsFromEmu(frame.heightEmu),
  };
}

function frameFromBox(box: PdfRectangle): FrameIR {
  return {
    xEmu: box.x * EMU_PER_POINT,
    yEmu: box.y * EMU_PER_POINT,
    widthEmu: box.width * EMU_PER_POINT,
    heightEmu: box.height * EMU_PER_POINT,
  };
}

function pdfShapeKind(shape: ProjectedLayoutShape["shape"]): "ellipse" | "rect" | "roundRect" {
  return shape === "ellipse" || shape === "roundRect" ? shape : "rect";
}

function pdfRoundRectRadiusFromLayoutShape(node: ProjectedLayoutShape): number | undefined {
  if (node.shape !== "roundRect") {
    return undefined;
  }

  const frame = node.clip?.originalFrame ?? node.frame;
  return pointsFromEmu(
    node.radiusEmu && node.radiusEmu > 0
      ? node.radiusEmu
      : Math.min(frame.widthEmu, frame.heightEmu) / 6,
  );
}

function pdfRoundRectRadiusFromLayoutRadius(input: {
  readonly radiusEmu?: number;
}): number | undefined {
  return input.radiusEmu && input.radiusEmu > 0 ? pointsFromEmu(input.radiusEmu) : undefined;
}

function dataSourceMediaType(source: Extract<ImageSourceIR, { kind: "data" }>): string | undefined {
  const commaIndex = source.data.indexOf(",");
  if (!source.data.startsWith("data:") || commaIndex === -1) {
    return undefined;
  }

  const metadata = source.data.slice(5, commaIndex);
  return metadata ? metadata.replace(/;base64$/, "") : undefined;
}

function bytesFromDataImageSource(source: Extract<ImageSourceIR, { kind: "data" }>): Uint8Array {
  const commaIndex = source.data.indexOf(",");
  if (!source.data.startsWith("data:") || commaIndex === -1) {
    return new TextEncoder().encode(source.data);
  }

  const metadata = source.data.slice(0, commaIndex);
  const payload = source.data.slice(commaIndex + 1);
  if (!metadata.endsWith(";base64")) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const decoded = globalThis.atob(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function normalizedMediaType(value: string | undefined): string | undefined {
  return value?.split(";")[0]?.trim().toLowerCase();
}

function assetSourceFromImageSource(source: ImageSourceIR): AssetSource {
  switch (source.kind) {
    case "data":
      return { kind: "data", data: source.data };
    case "path":
      return { kind: "path", path: source.path };
    case "url":
      return { kind: "url", url: source.url };
  }
}

function imageAssetForLayoutImage(input: {
  readonly node: ProjectedLayoutImage;
  readonly assets: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact> | undefined;
}): PdfProjectionAssetArtifact | undefined {
  const assetEntityId = input.node.origin?.assetEntityIds?.[0];
  return assetEntityId ? input.assets?.get(assetEntityId) : undefined;
}

function imageAssetForVideoPoster(input: {
  readonly node: ProjectedLayoutVideo;
  readonly assets: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact> | undefined;
}): PdfProjectionAssetArtifact | undefined {
  const assetEntityId = input.node.origin?.assetEntityIds?.[1];
  return assetEntityId ? input.assets?.get(assetEntityId) : undefined;
}

function pdfColorFilterFromLayoutImage(input: {
  readonly node: ProjectedLayoutImage;
  readonly asset?: PdfProjectionAssetArtifact;
}): string | undefined {
  for (const semantic of input.node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfImageColorFilterIsDirectlyProjected({
        node: input.node,
        value: semantic.value,
        ...(input.asset ? { asset: input.asset } : {}),
      })
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfColorFilterFromVideoPoster(input: {
  readonly node: ProjectedLayoutVideo;
  readonly asset?: PdfProjectionAssetArtifact;
}): string | undefined {
  for (const semantic of input.node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfVideoPosterColorFilterIsDirectlyProjected({
        node: input.node,
        value: semantic.value,
        ...(input.asset ? { asset: input.asset } : {}),
      })
    ) {
      continue;
    }

    return semantic.value;
  }

  return undefined;
}

function pdfImageResourceIdForLayoutImage(input: {
  readonly node: ProjectedLayoutImage;
  readonly pdfColorFilter?: string;
}): PdfImageResource["id"] {
  const baseId = input.node.origin?.assetEntityIds?.[0] ?? input.node.id;
  return pdfResourceId(
    "image",
    input.pdfColorFilter
      ? `${baseId}:pdf-color-filter:${stableRequestHash(input.pdfColorFilter)}`
      : baseId,
  );
}

function pdfImageResourceForSource(input: {
  readonly id: PdfImageResource["id"];
  readonly source: ImageSourceIR;
  readonly sourceField: NonNullable<PdfImageResource["sourceField"]>;
  readonly asset?: PdfProjectionAssetArtifact;
  readonly assetEntityId?: AssetEntity["id"];
  readonly pdfColorFilter?: string;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
}): PdfImageResource | undefined {
  const existing = input.imageResourcesById.get(input.id);
  if (existing) {
    return existing;
  }

  const source = input.asset?.source ?? assetSourceFromImageSource(input.source);
  const mediaType = normalizedMediaType(
    input.asset?.load?.mediaType ??
      input.asset?.probe?.mediaType ??
      (input.source.kind === "data" ? dataSourceMediaType(input.source) : undefined),
  );
  const bytes =
    input.asset?.load?.bytes ??
    (input.source.kind === "data" ? bytesFromDataImageSource(input.source) : undefined);
  const png = bytes ? pdfEmbeddablePngImage(bytes) : undefined;
  const width = input.asset?.load?.width ?? input.asset?.probe?.width ?? png?.width;
  const height = input.asset?.load?.height ?? input.asset?.probe?.height ?? png?.height;
  const canLoadLater = input.source.kind !== "data" && input.assetEntityId !== undefined;

  if (
    !canLoadLater &&
    ((mediaType !== "image/jpeg" && mediaType !== "image/png") || !width || !height)
  ) {
    return undefined;
  }

  const image: PdfImageResource = {
    id: input.id,
    name: `Im${input.imageResourcesById.size + 1}`,
    ...(input.assetEntityId ? { assetEntityId: input.assetEntityId } : {}),
    source,
    sourceField: input.sourceField,
    ...(mediaType ? { mediaType } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(bytes ? { data: bytes } : {}),
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
  };
  input.imageResourcesById.set(input.id, image);
  return image;
}

function pdfImageResourceForLayoutImage(input: {
  readonly node: ProjectedLayoutImage;
  readonly assets: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact> | undefined;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
}): PdfImageResource | undefined {
  const assetEntityId = input.node.origin?.assetEntityIds?.[0];
  const asset = imageAssetForLayoutImage({ node: input.node, assets: input.assets });
  const pdfColorFilter = pdfColorFilterFromLayoutImage({
    node: input.node,
    ...(asset ? { asset } : {}),
  });
  return pdfImageResourceForSource({
    id: pdfImageResourceIdForLayoutImage({
      node: input.node,
      ...(pdfColorFilter ? { pdfColorFilter } : {}),
    }),
    source: input.node.source,
    sourceField: input.node.source.kind === "data" ? "data" : "src",
    ...(asset ? { asset } : {}),
    ...(assetEntityId ? { assetEntityId } : {}),
    ...(pdfColorFilter ? { pdfColorFilter } : {}),
    imageResourcesById: input.imageResourcesById,
  });
}

function pdfImageResourceForVideoPoster(input: {
  readonly node: ProjectedLayoutVideo;
  readonly assets: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact> | undefined;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
}): PdfImageResource | undefined {
  if (!input.node.posterSource) {
    return undefined;
  }

  const assetEntityId = input.node.origin?.assetEntityIds?.[1];
  const asset = imageAssetForVideoPoster({ node: input.node, assets: input.assets });
  const pdfColorFilter = pdfColorFilterFromVideoPoster({
    node: input.node,
    ...(asset ? { asset } : {}),
  });
  const baseId = assetEntityId ?? `${input.node.id}:poster`;
  return pdfImageResourceForSource({
    id: pdfResourceId(
      "image",
      pdfColorFilter ? `${baseId}:pdf-color-filter:${stableRequestHash(pdfColorFilter)}` : baseId,
    ),
    source: input.node.posterSource,
    sourceField: input.node.posterSource.kind === "data" ? "posterData" : "poster",
    ...(asset ? { asset } : {}),
    ...(assetEntityId ? { assetEntityId } : {}),
    ...(pdfColorFilter ? { pdfColorFilter } : {}),
    imageResourcesById: input.imageResourcesById,
  });
}

function pdfImageResourceForBackgroundImageLayer(input: {
  readonly layer: BackgroundImageLayerIR;
  readonly scopeId: string;
  readonly layerIndex: number;
  readonly pdfColorFilter?: string;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
}): PdfImageResource | undefined {
  const sourceHash = stableRequestHash(JSON.stringify(input.layer.source));
  const colorFilterHash = input.pdfColorFilter
    ? `:pdf-color-filter:${stableRequestHash(input.pdfColorFilter)}`
    : "";

  return pdfImageResourceForSource({
    id: pdfResourceId(
      "image",
      `${input.scopeId}:background:${input.layerIndex}:${input.layer.source.kind}:${sourceHash}${colorFilterHash}`,
    ),
    source: input.layer.source,
    sourceField: input.layer.source.kind === "data" ? "data" : "src",
    ...(input.layer.source.kind !== "data"
      ? {
          assetEntityId: assetEntityId([
            "pdf-background",
            input.scopeId,
            String(input.layerIndex),
            input.layer.source.kind,
            sourceHash,
            colorFilterHash,
          ]),
        }
      : {}),
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
    imageResourcesById: input.imageResourcesById,
  });
}

function backgroundImageLayers(
  layers: readonly BackgroundLayerIR[] | undefined,
): readonly BackgroundImageLayerIR[] {
  return (
    layers?.filter((layer): layer is BackgroundImageLayerIR => layer.kind === "background-image") ??
    []
  );
}

function linearGradientBackgroundLayers(
  layers: readonly BackgroundLayerIR[] | undefined,
): readonly LinearGradientFillIR[] {
  return (
    layers?.filter((layer): layer is LinearGradientFillIR => layer.kind === "linear-gradient") ?? []
  );
}

function radialGradientBackgroundLayers(
  layers: readonly BackgroundLayerIR[] | undefined,
): readonly RadialGradientFillIR[] {
  return (
    layers?.filter((layer): layer is RadialGradientFillIR => layer.kind === "radial-gradient") ?? []
  );
}

function gradientBackgroundLayers(
  layers: readonly BackgroundLayerIR[] | undefined,
): readonly (LinearGradientFillIR | RadialGradientFillIR)[] {
  return [...linearGradientBackgroundLayers(layers), ...radialGradientBackgroundLayers(layers)];
}

function gradientBackgroundLayersColorFilterAreDirectlyProjected(
  layers: readonly BackgroundLayerIR[] | undefined,
): boolean {
  return gradientBackgroundLayers(layers).every(
    (layer) =>
      layer.stops.length >= 2 && layer.stops.every((stop) => rgbColorFromStyle(stop.color)),
  );
}

function pdfGradientStopsFromFill(input: {
  readonly fill: LinearGradientFillIR | RadialGradientFillIR;
  readonly pdfColorFilter?: string;
}): readonly PdfGradientStop[] {
  const colorTransform = input.pdfColorFilter
    ? pdfCssColorFilterTransform(input.pdfColorFilter)
    : undefined;

  return input.fill.stops.flatMap((stop): readonly PdfGradientStop[] => {
    const color = rgbColorFromStyle(stop.color);
    if (!color) {
      return [];
    }
    const adjustedColor = colorTransform ? colorTransform(color) : color;

    return [
      {
        color: adjustedColor,
        position: stop.position,
        ...(pdfOpacityFromTransparency(stop.transparency) !== undefined
          ? { opacity: pdfOpacityFromTransparency(stop.transparency) }
          : {}),
      },
    ];
  });
}

function commonPdfGradientStopOpacity(stops: readonly PdfGradientStop[]): number | undefined {
  if (stops.length === 0) {
    return undefined;
  }

  const opacities = stops.map((stop) => stop.opacity ?? 1);
  const first = opacities[0];
  if (first === undefined || first >= 1) {
    return undefined;
  }

  return opacities.every((opacity) => Math.abs(opacity - first) < 0.0001) ? first : undefined;
}

function pdfLinearGradientResourceForFill(input: {
  readonly fill: LinearGradientFillIR;
  readonly scopeId: string;
  readonly layerIndex: number;
  readonly box: PdfRectangle;
  readonly pdfColorFilter?: string;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfLinearGradientResource | undefined {
  const stops = pdfGradientStopsFromFill({
    fill: input.fill,
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
  });
  if (stops.length < 2) {
    return undefined;
  }

  const id = pdfResourceId(
    "gradient",
    `${input.scopeId}:background:${input.layerIndex}:${input.fill.angle}:${stableRequestHash(
      JSON.stringify({ box: input.box, stops }),
    )}`,
  );
  const existing = input.gradientResourcesById.get(id);
  if (existing?.kind === "linear-gradient") {
    return existing;
  }
  if (existing) {
    return undefined;
  }

  const gradient: PdfLinearGradientResource = {
    id,
    name: `P${input.gradientResourcesById.size + 1}`,
    kind: "linear-gradient",
    angle: input.fill.angle,
    box: input.box,
    stops,
  };
  input.gradientResourcesById.set(id, gradient);
  return gradient;
}

function pdfRadialGradientResourceForFill(input: {
  readonly fill: RadialGradientFillIR;
  readonly scopeId: string;
  readonly layerIndex: number;
  readonly box: PdfRectangle;
  readonly pdfColorFilter?: string;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfRadialGradientResource | undefined {
  const stops = pdfGradientStopsFromFill({
    fill: input.fill,
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
  });
  if (stops.length < 2) {
    return undefined;
  }

  const id = pdfResourceId(
    "gradient",
    `${input.scopeId}:background:${input.layerIndex}:${input.fill.shape}:${stableRequestHash(
      JSON.stringify({
        box: input.box,
        center: input.fill.center,
        radius: input.fill.radius,
        stops,
      }),
    )}`,
  );
  const existing = input.gradientResourcesById.get(id);
  if (existing?.kind === "radial-gradient") {
    return existing;
  }
  if (existing) {
    return undefined;
  }

  const gradient: PdfRadialGradientResource = {
    id,
    name: `P${input.gradientResourcesById.size + 1}`,
    kind: "radial-gradient",
    shape: input.fill.shape,
    center: input.fill.center,
    radius: input.fill.radius,
    box: input.box,
    stops,
  };
  input.gradientResourcesById.set(id, gradient);
  return gradient;
}

function pdfShapeFillFromGradientResource(
  gradient: PdfLinearGradientResource | PdfRadialGradientResource,
): PdfShapeFill {
  const opacity = commonPdfGradientStopOpacity(gradient.stops);
  if (gradient.kind === "linear-gradient") {
    return {
      kind: "linear-gradient",
      gradientId: gradient.id,
      angle: gradient.angle,
      stops: gradient.stops,
      ...(opacity !== undefined ? { opacity } : {}),
    };
  }

  return {
    kind: "radial-gradient",
    gradientId: gradient.id,
    shape: gradient.shape,
    center: gradient.center,
    radius: gradient.radius,
    stops: gradient.stops,
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

function shapeVisualsFromGradientBackgroundLayers(input: {
  readonly layers: readonly (LinearGradientFillIR | RadialGradientFillIR)[] | undefined;
  readonly scopeId: string;
  readonly pdfColorFilter?: string;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly radius?: number;
  readonly zIndex?: number;
  readonly siblingOrder: number;
}): readonly PdfVisualElement[] {
  return (
    input.layers?.flatMap((layer, layerIndex): readonly PdfVisualElement[] => {
      if (!layer.frame) {
        return [];
      }

      const box = boxFromFrame(layer.frame);
      const gradient =
        layer.kind === "linear-gradient"
          ? pdfLinearGradientResourceForFill({
              fill: layer,
              scopeId: input.scopeId,
              layerIndex,
              box,
              ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
              gradientResourcesById: input.gradientResourcesById,
            })
          : pdfRadialGradientResourceForFill({
              fill: layer,
              scopeId: input.scopeId,
              layerIndex,
              box,
              ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
              gradientResourcesById: input.gradientResourcesById,
            });
      if (!gradient) {
        return [];
      }

      return [
        {
          kind: "shape",
          shape: input.radius !== undefined ? "roundRect" : "rect",
          box,
          ...(input.radius !== undefined ? { radius: input.radius } : {}),
          ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
          ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
          ...(input.flipH ? { flipH: input.flipH } : {}),
          ...(input.flipV ? { flipV: input.flipV } : {}),
          fill: pdfShapeFillFromGradientResource(gradient),
          ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
          ...(input.blendMode ? { blendMode: input.blendMode } : {}),
          paintOrder: {
            ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
            siblingOrder: input.siblingOrder + layerIndex / 1000,
            generatedLayerRole: "background",
          },
        },
      ];
    }) ?? []
  );
}

function sizedBackgroundImageBox(input: {
  readonly layer: BackgroundImageLayerIR;
  readonly image: PdfImageResource;
  readonly frameBox: PdfRectangle;
}): PdfImageDrawGeometry {
  const { layer, image, frameBox } = input;
  const position = layer.objectPosition ?? { x: 0.5, y: 0.5 };
  if (layer.size?.widthEmu && layer.size.heightEmu) {
    const width = pointsFromEmu(layer.size.widthEmu);
    const height = pointsFromEmu(layer.size.heightEmu);
    if (width > 0 && height > 0) {
      return {
        box: {
          x: frameBox.x + (frameBox.width - width) * position.x,
          y: frameBox.y + (frameBox.height - height) * position.y,
          width,
          height,
        },
      };
    }
  }

  if ((layer.fit !== "contain" && layer.fit !== "cover") || !image.width || !image.height) {
    return { box: frameBox };
  }

  const imageRatio = image.width / image.height;
  const frameRatio = frameBox.width / frameBox.height;
  if (!Number.isFinite(imageRatio) || !Number.isFinite(frameRatio) || imageRatio <= 0) {
    return { box: frameBox };
  }

  if (layer.fit === "contain") {
    if (frameRatio > imageRatio) {
      const width = frameBox.height * imageRatio;
      return {
        box: {
          x: frameBox.x + (frameBox.width - width) * position.x,
          y: frameBox.y,
          width,
          height: frameBox.height,
        },
      };
    }

    const height = frameBox.width / imageRatio;
    return {
      box: {
        x: frameBox.x,
        y: frameBox.y + (frameBox.height - height) * position.y,
        width: frameBox.width,
        height,
      },
    };
  }

  if (frameRatio > imageRatio) {
    const height = frameBox.width / imageRatio;
    return {
      box: {
        x: frameBox.x,
        y: frameBox.y - (height - frameBox.height) * position.y,
        width: frameBox.width,
        height,
      },
      clipBox: frameBox,
    };
  }

  const width = frameBox.height * imageRatio;
  return {
    box: {
      x: frameBox.x - (width - frameBox.width) * position.x,
      y: frameBox.y,
      width,
      height: frameBox.height,
    },
    clipBox: frameBox,
  };
}

function repeatedBackgroundImageBoxes(input: {
  readonly layer: BackgroundImageLayerIR;
  readonly image: PdfImageResource;
}): PdfBackgroundImageDrawGeometry {
  const { layer, image } = input;
  const frameBox = boxFromFrame(layer.frame);
  const positionX = layer.objectPosition?.x ?? 0;
  const positionY = layer.objectPosition?.y ?? 0;
  if (layer.repeat === "no-repeat") {
    const geometry = sizedBackgroundImageBox({ layer, image, frameBox });
    return {
      boxes: [geometry.box],
      ...(geometry.clipBox ? { clipBox: geometry.clipBox } : {}),
    };
  }

  const fittedGeometry =
    layer.fit === "contain" || layer.fit === "cover"
      ? sizedBackgroundImageBox({ layer, image, frameBox })
      : undefined;
  const tileWidth = layer.size?.widthEmu
    ? pointsFromEmu(layer.size.widthEmu)
    : fittedGeometry?.box.width;
  const tileHeight = layer.size?.heightEmu
    ? pointsFromEmu(layer.size.heightEmu)
    : fittedGeometry?.box.height;
  if (tileWidth === undefined || tileHeight === undefined) {
    return { boxes: [] };
  }
  if (tileWidth <= 0 || tileHeight <= 0) {
    return { boxes: [] };
  }

  const boxes: PdfRectangle[] = [];
  const repeatX = layer.repeat === "repeat-x" || layer.repeat === "repeat";
  const repeatY = layer.repeat === "repeat-y" || layer.repeat === "repeat";
  const positionedX =
    fittedGeometry?.box.x ?? frameBox.x + (frameBox.width - tileWidth) * positionX;
  const positionedY =
    fittedGeometry?.box.y ?? frameBox.y + (frameBox.height - tileHeight) * positionY;
  const startX = repeatX ? frameBox.x : positionedX;
  const startY = repeatY ? frameBox.y : positionedY;
  for (
    let y = startY;
    y < frameBox.y + frameBox.height - 0.001;
    y += repeatY ? tileHeight : frameBox.height
  ) {
    for (
      let x = startX;
      x < frameBox.x + frameBox.width - 0.001;
      x += repeatX ? tileWidth : frameBox.width
    ) {
      boxes.push({ x, y, width: tileWidth, height: tileHeight });
      if (!repeatX) {
        break;
      }
    }
    if (!repeatY) {
      break;
    }
  }

  return { boxes, clipBox: frameBox };
}

function imageVisualsFromBackgroundLayers(input: {
  readonly layers: readonly BackgroundImageLayerIR[] | undefined;
  readonly scopeId: string;
  readonly pdfColorFilter?: string;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly clipRadius?: number;
  readonly zIndex?: number;
  readonly siblingOrder: number;
}): readonly PdfVisualElement[] {
  return (
    input.layers?.flatMap((layer, layerIndex): readonly PdfVisualElement[] => {
      const image = pdfImageResourceForBackgroundImageLayer({
        layer,
        scopeId: input.scopeId,
        layerIndex,
        ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
        imageResourcesById: input.imageResourcesById,
      });
      if (!image) {
        return [];
      }

      const geometry = repeatedBackgroundImageBoxes({ layer, image });
      if (geometry.boxes.length === 0) {
        return [];
      }

      const opacity = combinePdfOpacity(
        input.opacity,
        pdfOpacityFromTransparency(layer.transparency),
      );
      return geometry.boxes.map((box, tileIndex): PdfVisualElement => {
        const clipBox =
          geometry.clipBox ??
          (input.clipRadius !== undefined ? boxFromFrame(layer.frame) : undefined);
        return {
          kind: "image",
          imageId: image.id,
          box,
          ...(clipBox ? { clipBox } : {}),
          ...(input.clipRadius !== undefined ? { clipRadius: input.clipRadius } : {}),
          fit: layer.fit === "contain" || layer.fit === "cover" ? layer.fit : "stretch",
          objectPosition: layer.objectPosition ?? { x: 0, y: 0 },
          ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
          ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
          ...(input.flipH ? { flipH: input.flipH } : {}),
          ...(input.flipV ? { flipV: input.flipV } : {}),
          ...(opacity !== undefined ? { opacity } : {}),
          ...(input.blendMode ? { blendMode: input.blendMode } : {}),
          paintOrder: {
            ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
            siblingOrder: input.siblingOrder + layerIndex / 1000 + tileIndex / 1_000_000,
            generatedLayerRole: "background",
          },
        };
      });
    }) ?? []
  );
}

type PdfImageDrawGeometry = {
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
};

type PdfBackgroundImageDrawGeometry = {
  readonly boxes: readonly PdfRectangle[];
  readonly clipBox?: PdfRectangle;
};

function imageDrawGeometry(input: {
  readonly node: ProjectedLayoutImage | ProjectedLayoutVideo;
  readonly image: PdfImageResource;
}): PdfImageDrawGeometry {
  const visibleBox = boxFromFrame(input.node.frame);
  const box = input.node.clip ? boxFromFrame(input.node.sourceFrame) : visibleBox;
  const clipBox = input.node.clip ? visibleBox : undefined;
  if ("crop" in input.node && input.node.crop) {
    const sourceWidthRatio = 1 - input.node.crop.left - input.node.crop.right;
    const sourceHeightRatio = 1 - input.node.crop.top - input.node.crop.bottom;
    if (sourceWidthRatio <= 0 || sourceHeightRatio <= 0) {
      return { box, ...(clipBox ? { clipBox } : {}) };
    }

    const width = box.width / sourceWidthRatio;
    const height = box.height / sourceHeightRatio;
    return {
      box: {
        x: box.x - width * input.node.crop.left,
        y: box.y - height * input.node.crop.top,
        width,
        height,
      },
      clipBox: clipBox ?? box,
    };
  }

  if (
    (input.node.fit !== "contain" && input.node.fit !== "cover") ||
    !input.image.width ||
    !input.image.height
  ) {
    return { box, ...(clipBox ? { clipBox } : {}) };
  }

  const imageRatio = input.image.width / input.image.height;
  const boxRatio = box.width / box.height;
  if (!Number.isFinite(imageRatio) || !Number.isFinite(boxRatio) || imageRatio <= 0) {
    return { box, ...(clipBox ? { clipBox } : {}) };
  }

  const objectPosition = input.node.objectPosition ?? { x: 0.5, y: 0.5 };
  if (input.node.fit === "contain") {
    if (boxRatio > imageRatio) {
      const width = box.height * imageRatio;
      return {
        box: {
          x: box.x + (box.width - width) * objectPosition.x,
          y: box.y,
          width,
          height: box.height,
        },
        ...(clipBox ? { clipBox } : {}),
      };
    }

    const height = box.width / imageRatio;
    return {
      box: {
        x: box.x,
        y: box.y + (box.height - height) * objectPosition.y,
        width: box.width,
        height,
      },
      ...(clipBox ? { clipBox } : {}),
    };
  }

  if (boxRatio > imageRatio) {
    const height = box.width / imageRatio;
    return {
      box: {
        x: box.x,
        y: box.y - (height - box.height) * objectPosition.y,
        width: box.width,
        height,
      },
      clipBox: clipBox ?? box,
    };
  }

  const width = box.height * imageRatio;
  return {
    box: {
      x: box.x - (width - box.width) * objectPosition.x,
      y: box.y,
      width,
      height: box.height,
    },
    clipBox: clipBox ?? box,
  };
}

function shadowVisualFromLayoutMedia(
  node: ProjectedLayoutImage | ProjectedLayoutVideo,
): PdfVisualElement | undefined {
  if (!node.shadow || node.shadow.type !== "outer") {
    return undefined;
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return undefined;
  }

  const box = shadowBoxFromFrame(node.frame, node.shadow);
  const rounded = node.rounding === true;

  return {
    kind: "shape",
    shape: rounded ? "roundRect" : "rect",
    box,
    ...(rounded ? { radius: Math.min(box.width, box.height) / 6 } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV
      ? { rotationBox: boxFromFrame(node.frame) }
      : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    fill: {
      color,
      opacity: node.shadow.opacity,
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "shadow",
    },
  };
}

function blurredShadowVisualsFromLayoutMedia(
  node: ProjectedLayoutImage | ProjectedLayoutVideo,
): readonly PdfVisualElement[] {
  const shadow = node.shadow;
  if (!shadow || shadow.type !== "outer" || shadow.blurPt <= 0) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const baseBox = shadowBoxFromFrame(node.frame, shadow);
  const rounded = node.rounding === true;
  return blurredShadowVisualLayers({
    shadow,
    shape: rounded ? "roundRect" : "rect",
    baseBox,
    color,
    ...(rounded ? { radius: Math.min(baseBox.width, baseBox.height) / 6 } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV
      ? { rotationBox: boxFromFrame(node.frame) }
      : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
  });
}

function shadowVisualsFromLayoutMedia(
  node: ProjectedLayoutImage | ProjectedLayoutVideo,
): readonly PdfVisualElement[] {
  const blurredShadowVisuals = blurredShadowVisualsFromLayoutMedia(node);
  if (blurredShadowVisuals.length > 0) {
    return blurredShadowVisuals;
  }

  const shadowVisual = shadowVisualFromLayoutMedia(node);
  return shadowVisual ? [shadowVisual] : [];
}

function dropShadowFromFilterForLayoutMedia(
  node: ProjectedLayoutImage | ProjectedLayoutVideo,
): ShadowIR | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfDropShadowFilterIsDirectlyProjected(node, semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromLayoutMedia(
  node: ProjectedLayoutImage | ProjectedLayoutVideo,
): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForLayoutMedia(node);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const baseBox = shadowBoxFromFrame(node.frame, shadow);
  const rounded = node.rounding === true;
  const rotationBox =
    node.rotation !== undefined || node.flipH || node.flipV ? boxFromFrame(node.frame) : undefined;
  const opacity = pdfOpacityForLayoutNode(node);
  const blendMode = pdfBlendModeFromNode(node);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: rounded ? "roundRect" : "rect",
      baseBox,
      color,
      ...(rounded ? { radius: Math.min(baseBox.width, baseBox.height) / 6 } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: rounded ? "roundRect" : "rect",
      box: baseBox,
      ...(rounded ? { radius: Math.min(baseBox.width, baseBox.height) / 6 } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function innerShadowVisualsFromLayoutMedia(
  node: ProjectedLayoutImage | ProjectedLayoutVideo,
): readonly PdfVisualElement[] {
  if (!node.shadow || node.shadow.type !== "inner") {
    return [];
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return [];
  }
  const clipBox = node.rounding === true ? boxFromFrame(node.frame) : undefined;
  const clipRadius =
    clipBox !== undefined ? Math.min(clipBox.width, clipBox.height) / 6 : undefined;
  if (node.shadow.blurPt > 0) {
    return blurredInnerShadowVisualLayers({
      shadow: node.shadow,
      frame: node.frame,
      color,
      ...(clipRadius !== undefined ? { radius: clipRadius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(clipBox && (node.rotation !== undefined || node.flipH || node.flipV)
        ? { rotationBox: clipBox }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerPlacement: "aboveAuthored",
    });
  }

  const box = innerShadowBoxFromFrame(node.frame, node.shadow);
  if (!color || !box) {
    return [];
  }

  return [
    {
      kind: "shape",
      shape: "rect",
      box,
      ...(clipBox ? { clipBox } : {}),
      ...(clipRadius !== undefined ? { clipRadius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(clipBox && (node.rotation !== undefined || node.flipH || node.flipV)
        ? { rotationBox: clipBox }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: node.shadow.opacity,
      },
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder + 0.0002,
        generatedLayerRole: "shadow",
        generatedLayerPlacement: "aboveAuthored",
      },
    },
  ];
}

function shapeVisualFromLayoutShape(input: {
  readonly node: ProjectedLayoutShape;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfVisualElement | undefined {
  const { node } = input;
  if (node.shape !== "rect" && node.shape !== "roundRect" && node.shape !== "ellipse") {
    return undefined;
  }

  const lineColor = strokeColor(node.stroke);
  const box = boxFromFrame(node.clip?.originalFrame ?? node.frame);
  const clipBox = node.clip ? boxFromFrame(node.clip.clipFrame) : undefined;
  const radius = pdfRoundRectRadiusFromLayoutShape(node);
  const fill = pdfShapeFillFromFill({
    fill: node.fill,
    scopeId: node.id,
    box,
    gradientResourcesById: input.gradientResourcesById,
  });
  const adjustedColor =
    fill && "color" in fill && fill.color !== undefined
      ? pdfAdjustedSolidShapeColorFromFilters(node, fill.color)
      : undefined;
  const adjustedFill =
    fill && "color" in fill && fill.color !== undefined && adjustedColor !== undefined
      ? {
          ...fill,
          color: adjustedColor,
        }
      : fill;
  const adjustedLineColor = lineColor
    ? pdfAdjustedSolidShapeColorFromFilters(node, lineColor)
    : undefined;

  return {
    kind: "shape",
    shape: pdfShapeKind(node.shape),
    box,
    ...(clipBox ? { clipBox } : {}),
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(adjustedFill ? { fill: adjustedFill } : {}),
    ...(lineColor && node.stroke
      ? {
          stroke: {
            color: adjustedLineColor ?? lineColor,
            width: node.stroke.widthPt,
            ...(pdfStrokeDash(node.stroke) ? { dash: pdfStrokeDash(node.stroke) } : {}),
            ...(pdfStrokeLineCap(node.stroke) ? { lineCap: pdfStrokeLineCap(node.stroke) } : {}),
            ...(pdfStrokeLineJoin(node.stroke) ? { lineJoin: pdfStrokeLineJoin(node.stroke) } : {}),
            ...(pdfOpacityFromTransparency(node.stroke.transparency) !== undefined
              ? { opacity: pdfOpacityFromTransparency(node.stroke.transparency) }
              : {}),
          },
        }
      : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "authored",
    },
  };
}

function shadowVisualFromLayoutShape(node: ProjectedLayoutShape): PdfVisualElement | undefined {
  if (
    !node.shadow ||
    node.shadow.type !== "outer" ||
    (node.shape !== "rect" && node.shape !== "roundRect" && node.shape !== "ellipse")
  ) {
    return undefined;
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return undefined;
  }

  const box = shadowBoxFromFrame(node.frame, node.shadow);
  const radius = pdfRoundRectRadiusFromLayoutShape(node);

  return {
    kind: "shape",
    shape: pdfShapeKind(node.shape),
    box,
    ...(radius !== undefined ? { radius: Math.max(0, radius + (node.shadow.spreadPt ?? 0)) } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    fill: {
      color,
      opacity: node.shadow.opacity,
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "shadow",
    },
  };
}

function blurredShadowVisualsFromLayoutShape(
  node: ProjectedLayoutShape,
): readonly PdfVisualElement[] {
  const shadow = node.shadow;
  if (
    !shadow ||
    shadow.type !== "outer" ||
    shadow.blurPt <= 0 ||
    (node.shape !== "rect" && node.shape !== "roundRect" && node.shape !== "ellipse")
  ) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const baseBox = shadowBoxFromFrame(node.frame, shadow);
  const radius = pdfRoundRectRadiusFromLayoutShape(node);
  return blurredShadowVisualLayers({
    shadow,
    shape: pdfShapeKind(node.shape),
    baseBox,
    color,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
  });
}

function shadowVisualsFromLayoutShape(node: ProjectedLayoutShape): readonly PdfVisualElement[] {
  const blurredShadowVisuals = blurredShadowVisualsFromLayoutShape(node);
  if (blurredShadowVisuals.length > 0) {
    return blurredShadowVisuals;
  }

  const shadowVisual = shadowVisualFromLayoutShape(node);
  return shadowVisual ? [shadowVisual] : [];
}

function dropShadowFromFilterForLayoutShape(node: ProjectedLayoutShape): ShadowIR | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfDropShadowFilterIsDirectlyProjected(node, semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromLayoutShape(node: ProjectedLayoutShape): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForLayoutShape(node);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutShape(node);
  const rotationBox =
    node.rotation !== undefined || node.flipH || node.flipV ? boxFromFrame(node.frame) : undefined;
  const opacity = pdfOpacityForLayoutNode(node);
  const blendMode = pdfBlendModeFromNode(node);

  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: pdfShapeKind(node.shape),
      baseBox: shadowBoxFromFrame(node.frame, shadow),
      color,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: pdfShapeKind(node.shape),
      box: shadowBoxFromFrame(node.frame, shadow),
      ...(radius !== undefined ? { radius: Math.max(0, radius + (shadow.spreadPt ?? 0)) } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function innerShadowVisualsFromLayoutShape(
  node: ProjectedLayoutShape,
): readonly PdfVisualElement[] {
  if (
    !node.shadow ||
    node.shadow.type !== "inner" ||
    (node.shape !== "rect" && node.shape !== "roundRect" && node.shape !== "ellipse")
  ) {
    return [];
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return [];
  }
  const clipRadius =
    node.shape === "roundRect" ? pdfRoundRectRadiusFromLayoutShape(node) : undefined;
  const clipShape = node.shape === "ellipse" ? "ellipse" : undefined;
  const clipBox =
    clipRadius !== undefined || clipShape !== undefined ? boxFromFrame(node.frame) : undefined;
  if (node.shadow.blurPt > 0) {
    return blurredInnerShadowVisualLayers({
      shadow: node.shadow,
      frame: node.frame,
      color,
      ...(clipRadius !== undefined ? { radius: clipRadius } : {}),
      ...(clipBox && clipRadius === undefined ? { clipBox } : {}),
      ...(clipShape ? { clipShape } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(clipBox && (node.rotation !== undefined || node.flipH || node.flipV)
        ? { rotationBox: clipBox }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerPlacement: "aboveAuthored",
    });
  }

  const box = innerShadowBoxFromFrame(node.frame, node.shadow);
  if (!box) {
    return [];
  }

  return [
    {
      kind: "shape",
      shape: "rect",
      box,
      ...(clipBox ? { clipBox } : {}),
      ...(clipRadius !== undefined ? { clipRadius } : {}),
      ...(clipShape ? { clipShape } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(clipBox && (node.rotation !== undefined || node.flipH || node.flipV)
        ? { rotationBox: clipBox }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: node.shadow.opacity,
      },
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder + 0.0002,
        generatedLayerRole: "shadow",
        generatedLayerPlacement: "aboveAuthored",
      },
    },
  ];
}

function shadowVisualFromLayoutGroup(node: ProjectedLayoutGroup): PdfVisualElement | undefined {
  if (!node.shadow || node.shadow.type !== "outer") {
    return undefined;
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return undefined;
  }

  const box = shadowBoxFromFrame(node.frame, node.shadow);
  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });

  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius: Math.max(0, radius + (node.shadow.spreadPt ?? 0)) } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV
      ? { rotationBox: boxFromFrame(node.frame) }
      : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    fill: {
      color,
      opacity: node.shadow.opacity,
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "shadow",
    },
  };
}

function blurredShadowVisualsFromLayoutGroup(
  node: ProjectedLayoutGroup,
): readonly PdfVisualElement[] {
  const shadow = node.shadow;
  if (!shadow || shadow.type !== "outer" || shadow.blurPt <= 0) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  return blurredShadowVisualLayers({
    shadow,
    shape: radius !== undefined ? "roundRect" : "rect",
    baseBox: shadowBoxFromFrame(node.frame, shadow),
    color,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV
      ? { rotationBox: boxFromFrame(node.frame) }
      : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
  });
}

function shadowVisualsFromLayoutGroup(node: ProjectedLayoutGroup): readonly PdfVisualElement[] {
  const blurredShadowVisuals = blurredShadowVisualsFromLayoutGroup(node);
  if (blurredShadowVisuals.length > 0) {
    return blurredShadowVisuals;
  }

  const shadowVisual = shadowVisualFromLayoutGroup(node);
  return shadowVisual ? [shadowVisual] : [];
}

function dropShadowFromFilterForLayoutGroup(node: ProjectedLayoutGroup): ShadowIR | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfDropShadowFilterIsDirectlyProjected(node, semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromLayoutGroup(node: ProjectedLayoutGroup): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForLayoutGroup(node);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  const rotationBox =
    node.rotation !== undefined || node.flipH || node.flipV ? boxFromFrame(node.frame) : undefined;
  const opacity = pdfOpacityForLayoutNode(node);
  const blendMode = pdfBlendModeFromNode(node);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: radius !== undefined ? "roundRect" : "rect",
      baseBox: shadowBoxFromFrame(node.frame, shadow),
      color,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: radius !== undefined ? "roundRect" : "rect",
      box: shadowBoxFromFrame(node.frame, shadow),
      ...(radius !== undefined ? { radius: Math.max(0, radius + (shadow.spreadPt ?? 0)) } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function innerShadowVisualsFromLayoutGroup(
  node: ProjectedLayoutGroup,
): readonly PdfVisualElement[] {
  if (!node.shadow || node.shadow.type !== "inner") {
    return [];
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return [];
  }
  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  if (node.shadow.blurPt > 0) {
    return blurredInnerShadowVisualLayers({
      shadow: node.shadow,
      frame: node.frame,
      color,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(node.rotation !== undefined || node.flipH || node.flipV
        ? { rotationBox: boxFromFrame(node.frame) }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
    });
  }

  const box = innerShadowBoxFromFrame(node.frame, node.shadow);
  if (!box) {
    return [];
  }

  return [
    {
      kind: "shape",
      shape: radius !== undefined ? "roundRect" : "rect",
      box,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(node.rotation !== undefined || node.flipH || node.flipV
        ? { rotationBox: boxFromFrame(node.frame) }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: node.shadow.opacity,
      },
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder + 0.0002,
        generatedLayerRole: "shadow",
        generatedLayerPlacement: "aboveBackground",
      },
    },
  ];
}

function shadowVisualFromLayoutTable(node: ProjectedLayoutTable): PdfVisualElement | undefined {
  if (!node.shadow || node.shadow.type !== "outer") {
    return undefined;
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return undefined;
  }

  const box = shadowBoxFromFrame(node.frame, node.shadow);
  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });

  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius: Math.max(0, radius + (node.shadow.spreadPt ?? 0)) } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV
      ? { rotationBox: boxFromFrame(node.frame) }
      : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    fill: {
      color,
      opacity: node.shadow.opacity,
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "shadow",
    },
  };
}

function blurredShadowVisualsFromLayoutTable(
  node: ProjectedLayoutTable,
): readonly PdfVisualElement[] {
  const shadow = node.shadow;
  if (!shadow || shadow.type !== "outer" || shadow.blurPt <= 0) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  return blurredShadowVisualLayers({
    shadow,
    shape: radius !== undefined ? "roundRect" : "rect",
    baseBox: shadowBoxFromFrame(node.frame, shadow),
    color,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV
      ? { rotationBox: boxFromFrame(node.frame) }
      : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
  });
}

function shadowVisualsFromLayoutTable(node: ProjectedLayoutTable): readonly PdfVisualElement[] {
  const blurredShadowVisuals = blurredShadowVisualsFromLayoutTable(node);
  if (blurredShadowVisuals.length > 0) {
    return blurredShadowVisuals;
  }

  const shadowVisual = shadowVisualFromLayoutTable(node);
  return shadowVisual ? [shadowVisual] : [];
}

function dropShadowFromFilterForLayoutTable(node: ProjectedLayoutTable): ShadowIR | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfDropShadowFilterIsDirectlyProjected(node, semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromLayoutTable(node: ProjectedLayoutTable): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForLayoutTable(node);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  const rotationBox =
    node.rotation !== undefined || node.flipH || node.flipV ? boxFromFrame(node.frame) : undefined;
  const opacity = pdfOpacityForLayoutNode(node);
  const blendMode = pdfBlendModeFromNode(node);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: radius !== undefined ? "roundRect" : "rect",
      baseBox: shadowBoxFromFrame(node.frame, shadow),
      color,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: radius !== undefined ? "roundRect" : "rect",
      box: shadowBoxFromFrame(node.frame, shadow),
      ...(radius !== undefined ? { radius: Math.max(0, radius + (shadow.spreadPt ?? 0)) } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function innerShadowVisualsFromLayoutTable(
  node: ProjectedLayoutTable,
): readonly PdfVisualElement[] {
  if (!node.shadow || node.shadow.type !== "inner") {
    return [];
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return [];
  }
  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  if (node.shadow.blurPt > 0) {
    return blurredInnerShadowVisualLayers({
      shadow: node.shadow,
      frame: node.frame,
      color,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(node.rotation !== undefined || node.flipH || node.flipV
        ? { rotationBox: boxFromFrame(node.frame) }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder * 1_000_000 + 999_998,
    });
  }

  const box = innerShadowBoxFromFrame(node.frame, node.shadow);
  if (!box) {
    return [];
  }

  return [
    {
      kind: "shape",
      shape: radius !== undefined ? "roundRect" : "rect",
      box,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(node.rotation !== undefined || node.flipH || node.flipV
        ? { rotationBox: boxFromFrame(node.frame) }
        : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: node.shadow.opacity,
      },
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder * 1_000_000 + 999_998,
        generatedLayerRole: "shadow",
        generatedLayerPlacement: "aboveBackground",
      },
    },
  ];
}

function backgroundVisualFromLayoutTable(input: {
  readonly node: ProjectedLayoutTable;
  readonly pdfColorFilter?: string;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfVisualElement | undefined {
  const box = boxFromFrame(input.node.frame);
  const fill = pdfShapeFillFromFill({
    fill: input.node.fill,
    scopeId: `${input.node.id}:table`,
    box,
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
  });
  if (!fill) {
    return undefined;
  }

  const blendMode = pdfBlendModeFromNode(input.node);
  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: input.node.radiusEmu });
  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius } : {}),
    ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
    ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
    ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
    ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
      ? { rotationBox: box }
      : {}),
    fill,
    ...(pdfOpacityForLayoutNode(input.node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(input.node) }
      : {}),
    ...(blendMode ? { blendMode } : {}),
    paintOrder: {
      zIndex: input.node.zIndex,
      siblingOrder: input.node.siblingOrder * 1_000_000 - 1,
      generatedLayerRole: "background",
    },
  };
}

function outlineVisualFromLayoutTable(node: ProjectedLayoutTable): PdfVisualElement | undefined {
  if (!node.outline) {
    return undefined;
  }

  const lineColor = strokeColor(node.outline);
  if (!lineColor) {
    return undefined;
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  const box = boxFromFrame(node.frame);
  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.rotation !== undefined || node.flipH || node.flipV ? { rotationBox: box } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    stroke: {
      color: lineColor,
      width: node.outline.widthPt,
      ...(pdfStrokeDash(node.outline) ? { dash: pdfStrokeDash(node.outline) } : {}),
      ...(pdfStrokeLineCap(node.outline) ? { lineCap: pdfStrokeLineCap(node.outline) } : {}),
      ...(pdfStrokeLineJoin(node.outline) ? { lineJoin: pdfStrokeLineJoin(node.outline) } : {}),
      ...(pdfOpacityFromTransparency(node.outline.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(node.outline.transparency) }
        : {}),
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder * 1_000_000 + 1_000_000,
      generatedLayerRole: "outline",
    },
  };
}

function lineVisualFromLayoutLineShape(node: ProjectedLayoutShape): PdfVisualElement | undefined {
  if (node.shape !== "line" || !node.stroke) {
    return undefined;
  }

  const color = strokeColor(node.stroke);
  if (!color) {
    return undefined;
  }

  const box = boxFromFrame(node.clip?.originalFrame ?? node.frame);
  const clipBox = node.clip ? boxFromFrame(node.clip.clipFrame) : undefined;
  const hasTransform = node.rotation !== undefined || node.flipH === true || node.flipV === true;
  return {
    kind: "line",
    from: { x: box.x, y: box.y },
    to: { x: box.x + box.width, y: box.y + box.height },
    ...(clipBox ? { clipBox } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(hasTransform ? { rotationBox: box } : {}),
    stroke: {
      color,
      width: node.stroke.widthPt,
      ...(pdfStrokeDash(node.stroke) ? { dash: pdfStrokeDash(node.stroke) } : {}),
      ...(pdfStrokeLineCap(node.stroke) ? { lineCap: pdfStrokeLineCap(node.stroke) } : {}),
      ...(pdfStrokeLineJoin(node.stroke) ? { lineJoin: pdfStrokeLineJoin(node.stroke) } : {}),
      ...(pdfOpacityFromTransparency(node.stroke.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(node.stroke.transparency) }
        : {}),
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "authored",
    },
  };
}

function backgroundVisualFromLayoutGroup(input: {
  readonly node: ProjectedLayoutGroup;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfVisualElement | undefined {
  const { node } = input;
  const lineColor = strokeColor(node.stroke);
  const box = boxFromFrame(node.frame);
  const fill = pdfShapeFillFromFill({
    fill: node.fill,
    scopeId: node.id,
    box,
    gradientResourcesById: input.gradientResourcesById,
  });
  const adjustedFillColor =
    fill && "color" in fill && fill.color !== undefined
      ? pdfAdjustedBackgroundImageNodeColorFromFilters(node, fill.color)
      : undefined;
  const adjustedFill =
    fill && "color" in fill && fill.color !== undefined && adjustedFillColor !== undefined
      ? {
          ...fill,
          color: adjustedFillColor,
        }
      : fill;
  if (!fill && !lineColor) {
    return undefined;
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(adjustedFill ? { fill: adjustedFill } : {}),
    ...(lineColor && node.stroke
      ? {
          stroke: {
            color: lineColor,
            width: node.stroke.widthPt,
            ...(pdfStrokeDash(node.stroke) ? { dash: pdfStrokeDash(node.stroke) } : {}),
            ...(pdfStrokeLineCap(node.stroke) ? { lineCap: pdfStrokeLineCap(node.stroke) } : {}),
            ...(pdfStrokeLineJoin(node.stroke) ? { lineJoin: pdfStrokeLineJoin(node.stroke) } : {}),
            ...(pdfOpacityFromTransparency(node.stroke.transparency) !== undefined
              ? { opacity: pdfOpacityFromTransparency(node.stroke.transparency) }
              : {}),
          },
        }
      : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "background",
    },
  };
}

function pdfBlurFilterRadiusForNodeWithContext(
  node: ProjectedLayoutNode,
  context?: PdfCssFilterLengthContext,
): number | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (semantic.feature !== "filter" || semantic.property !== "filter") {
      continue;
    }

    const radius = pdfBlurRadiusFromCssFilter(semantic.value, context);
    if (radius !== undefined) {
      return radius;
    }
  }

  return undefined;
}

function blurredFilterVisualsFromSolidNode(
  node: ProjectedLayoutGroup | ProjectedLayoutShape,
  context?: PdfCssFilterLengthContext,
): readonly PdfVisualElement[] {
  const blurRadius = pdfBlurFilterRadiusForNodeWithContext(node, context);
  if (
    blurRadius === undefined ||
    !pdfSolidBlurFilterIsDirectlyProjected(node, `blur(${blurRadius}px)`, context)
  ) {
    return [];
  }

  const fill = node.fill;
  if (!fill || fill.kind !== "solid") {
    return [];
  }

  const color = rgbColorFromStyle(fill.color);
  if (!color) {
    return [];
  }

  const box = boxFromFrame(node.frame);
  const layerCount = 4;
  const weightTotal = (layerCount * (layerCount + 1)) / 2;
  const baseOpacity = pdfOpacityFromTransparency(fill.transparency) ?? 1;

  return Array.from({ length: layerCount }, (_, index): PdfVisualElement => {
    const expansion = blurRadius * ((layerCount - index - 1) / (layerCount - 1));
    const radius =
      node.kind === "shape" && node.shape === "roundRect"
        ? pdfRoundRectRadiusFromLayoutShape(node)
        : node.kind === "group"
          ? pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu })
          : undefined;
    return {
      kind: "shape",
      shape:
        node.kind === "shape"
          ? pdfShapeKind(node.shape)
          : radius !== undefined
            ? "roundRect"
            : "rect",
      box: {
        x: box.x - expansion,
        y: box.y - expansion,
        width: box.width + expansion * 2,
        height: box.height + expansion * 2,
      },
      ...(radius !== undefined ? { radius: Math.max(0, radius + expansion) } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(node.rotation !== undefined || node.flipH || node.flipV ? { rotationBox: box } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: baseOpacity * ((index + 1) / weightTotal),
      },
      ...(pdfOpacityForLayoutNode(node) !== undefined
        ? { opacity: pdfOpacityForLayoutNode(node) }
        : {}),
      ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder + index / 100_000,
        generatedLayerRole: "filter",
      },
    };
  });
}

function outlineVisualFromLayoutGroup(node: ProjectedLayoutGroup): PdfVisualElement | undefined {
  if (!node.outline) {
    return undefined;
  }

  const lineColor = strokeColor(node.outline);
  if (!lineColor) {
    return undefined;
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box: boxFromFrame(node.frame),
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    stroke: {
      color: lineColor,
      width: node.outline.widthPt,
      ...(pdfStrokeDash(node.outline) ? { dash: pdfStrokeDash(node.outline) } : {}),
      ...(pdfStrokeLineCap(node.outline) ? { lineCap: pdfStrokeLineCap(node.outline) } : {}),
      ...(pdfStrokeLineJoin(node.outline) ? { lineJoin: pdfStrokeLineJoin(node.outline) } : {}),
      ...(pdfOpacityFromTransparency(node.outline.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(node.outline.transparency) }
        : {}),
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "outline",
    },
  };
}

function backgroundVisualFromLayoutText(input: {
  readonly node: ProjectedLayoutText;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
  readonly box?: PdfRectangle;
}): PdfVisualElement | undefined {
  const { node } = input;
  const lineColor = strokeColor(node.stroke);
  const box = input.box ?? boxFromFrame(node.frame);
  const fill = pdfShapeFillFromFill({
    fill: node.fill,
    scopeId: node.id,
    box,
    gradientResourcesById: input.gradientResourcesById,
  });
  if (!fill && !lineColor) {
    return undefined;
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  const adjustedFillColor =
    fill && "color" in fill && fill.color !== undefined
      ? pdfAdjustedTextColorFromFilters(node, fill.color)
      : undefined;
  const adjustedFill =
    fill && "color" in fill && fill.color !== undefined && adjustedFillColor !== undefined
      ? {
          ...fill,
          color: adjustedFillColor,
        }
      : fill;
  const adjustedLineColor = lineColor
    ? pdfAdjustedTextColorFromFilters(node, lineColor)
    : undefined;
  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(adjustedFill ? { fill: adjustedFill } : {}),
    ...(lineColor && node.stroke
      ? {
          stroke: {
            color: adjustedLineColor ?? lineColor,
            width: node.stroke.widthPt,
            ...(pdfStrokeDash(node.stroke) ? { dash: pdfStrokeDash(node.stroke) } : {}),
            ...(pdfStrokeLineCap(node.stroke) ? { lineCap: pdfStrokeLineCap(node.stroke) } : {}),
            ...(pdfStrokeLineJoin(node.stroke) ? { lineJoin: pdfStrokeLineJoin(node.stroke) } : {}),
            ...(pdfOpacityFromTransparency(node.stroke.transparency) !== undefined
              ? { opacity: pdfOpacityFromTransparency(node.stroke.transparency) }
              : {}),
          },
        }
      : {}),
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "background",
    },
  };
}

function outlineVisualFromLayoutText(
  node: ProjectedLayoutText,
  box: PdfRectangle = boxFromFrame(node.frame),
): PdfVisualElement | undefined {
  if (!node.outline) {
    return undefined;
  }

  const lineColor = strokeColor(node.outline);
  if (!lineColor) {
    return undefined;
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  return {
    kind: "shape",
    shape: radius !== undefined ? "roundRect" : "rect",
    box,
    ...(radius !== undefined ? { radius } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    stroke: {
      color: lineColor,
      width: node.outline.widthPt,
      ...(pdfStrokeDash(node.outline) ? { dash: pdfStrokeDash(node.outline) } : {}),
      ...(pdfStrokeLineCap(node.outline) ? { lineCap: pdfStrokeLineCap(node.outline) } : {}),
      ...(pdfStrokeLineJoin(node.outline) ? { lineJoin: pdfStrokeLineJoin(node.outline) } : {}),
      ...(pdfOpacityFromTransparency(node.outline.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(node.outline.transparency) }
        : {}),
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "outline",
    },
  };
}

function outlineVisualFromLayoutShape(node: ProjectedLayoutShape): PdfVisualElement | undefined {
  if (
    (node.shape !== "rect" && node.shape !== "roundRect" && node.shape !== "ellipse") ||
    !node.outline
  ) {
    return undefined;
  }

  const lineColor = strokeColor(node.outline);
  if (!lineColor) {
    return undefined;
  }

  return {
    kind: "shape",
    shape: pdfShapeKind(node.shape),
    box: boxFromFrame(node.frame),
    ...(node.shape === "roundRect" && pdfRoundRectRadiusFromLayoutShape(node) !== undefined
      ? { radius: pdfRoundRectRadiusFromLayoutShape(node) }
      : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    stroke: {
      color: lineColor,
      width: node.outline.widthPt,
      ...(pdfStrokeDash(node.outline) ? { dash: pdfStrokeDash(node.outline) } : {}),
      ...(pdfStrokeLineCap(node.outline) ? { lineCap: pdfStrokeLineCap(node.outline) } : {}),
      ...(pdfStrokeLineJoin(node.outline) ? { lineJoin: pdfStrokeLineJoin(node.outline) } : {}),
      ...(pdfOpacityFromTransparency(node.outline.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(node.outline.transparency) }
        : {}),
    },
    ...(pdfOpacityForLayoutNode(node) !== undefined
      ? { opacity: pdfOpacityForLayoutNode(node) }
      : {}),
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    paintOrder: {
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
      generatedLayerRole: "outline",
    },
  };
}

function lineVisualForEdge(input: {
  readonly edge: keyof EdgeStrokeIR;
  readonly box: PdfPage["mediaBox"];
  readonly stroke: StrokeIR;
  readonly pdfColorFilter?: string;
  readonly zIndex?: number;
  readonly siblingOrder: number;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
}): PdfVisualElement | undefined {
  const color = strokeColor(input.stroke);
  if (!color) {
    return undefined;
  }
  const adjustedColor = input.pdfColorFilter
    ? pdfAdjustedColorFromCssFilter(input.pdfColorFilter, color)
    : undefined;

  const { box } = input;
  const fromTo = (() => {
    switch (input.edge) {
      case "top":
        return { from: { x: box.x, y: box.y }, to: { x: box.x + box.width, y: box.y } };
      case "right":
        return {
          from: { x: box.x + box.width, y: box.y },
          to: { x: box.x + box.width, y: box.y + box.height },
        };
      case "bottom":
        return {
          from: { x: box.x, y: box.y + box.height },
          to: { x: box.x + box.width, y: box.y + box.height },
        };
      case "left":
        return { from: { x: box.x, y: box.y }, to: { x: box.x, y: box.y + box.height } };
    }
  })();

  return {
    kind: "line",
    ...fromTo,
    ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
    ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
    ...(input.flipH ? { flipH: input.flipH } : {}),
    ...(input.flipV ? { flipV: input.flipV } : {}),
    stroke: {
      color: adjustedColor ?? color,
      width: input.stroke.widthPt,
      ...(pdfStrokeDash(input.stroke) ? { dash: pdfStrokeDash(input.stroke) } : {}),
      ...(pdfStrokeLineCap(input.stroke) ? { lineCap: pdfStrokeLineCap(input.stroke) } : {}),
      ...(pdfStrokeLineJoin(input.stroke) ? { lineJoin: pdfStrokeLineJoin(input.stroke) } : {}),
      ...(pdfOpacityFromTransparency(input.stroke.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(input.stroke.transparency) }
        : {}),
    },
    ...(pdfOpacity(input.opacity) !== undefined ? { opacity: pdfOpacity(input.opacity) } : {}),
    ...(input.blendMode ? { blendMode: input.blendMode } : {}),
    paintOrder: {
      zIndex: input.zIndex,
      siblingOrder: input.siblingOrder,
      generatedLayerRole: "border",
    },
  };
}

function strokeIrEquivalent(left: StrokeIR | undefined, right: StrokeIR | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.color === right.color &&
    left.widthPt === right.widthPt &&
    left.style === right.style &&
    left.dashType === right.dashType &&
    left.lineCap === right.lineCap &&
    left.lineJoin === right.lineJoin &&
    left.transparency === right.transparency
  );
}

function uniformEdgeStroke(edgeStrokes: EdgeStrokeIR | undefined): StrokeIR | undefined {
  const top = edgeStrokes?.top;
  if (
    !top ||
    !strokeIrEquivalent(top, edgeStrokes?.right) ||
    !strokeIrEquivalent(top, edgeStrokes?.bottom) ||
    !strokeIrEquivalent(top, edgeStrokes?.left)
  ) {
    return undefined;
  }

  return top;
}

function roundedStrokeVisualFromBox(input: {
  readonly box: PdfRectangle;
  readonly edgeStrokes: EdgeStrokeIR | undefined;
  readonly radius?: number;
  readonly pdfColorFilter?: string;
  readonly zIndex?: number;
  readonly siblingOrder: number;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
}): PdfVisualElement | undefined {
  const stroke = input.radius !== undefined ? uniformEdgeStroke(input.edgeStrokes) : undefined;
  const color = strokeColor(stroke);
  if (!stroke || !color) {
    return undefined;
  }
  const adjustedColor = input.pdfColorFilter
    ? pdfAdjustedColorFromCssFilter(input.pdfColorFilter, color)
    : undefined;

  return {
    kind: "shape",
    shape: "roundRect",
    box: input.box,
    radius: input.radius,
    ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
    ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
    ...(input.flipH ? { flipH: input.flipH } : {}),
    ...(input.flipV ? { flipV: input.flipV } : {}),
    stroke: {
      color: adjustedColor ?? color,
      width: stroke.widthPt,
      ...(pdfStrokeDash(stroke) ? { dash: pdfStrokeDash(stroke) } : {}),
      ...(pdfStrokeLineCap(stroke) ? { lineCap: pdfStrokeLineCap(stroke) } : {}),
      ...(pdfStrokeLineJoin(stroke) ? { lineJoin: pdfStrokeLineJoin(stroke) } : {}),
      ...(pdfOpacityFromTransparency(stroke.transparency) !== undefined
        ? { opacity: pdfOpacityFromTransparency(stroke.transparency) }
        : {}),
    },
    ...(pdfOpacity(input.opacity) !== undefined ? { opacity: pdfOpacity(input.opacity) } : {}),
    ...(input.blendMode ? { blendMode: input.blendMode } : {}),
    paintOrder: {
      zIndex: input.zIndex,
      siblingOrder: input.siblingOrder,
      generatedLayerRole: "border",
    },
  };
}

function edgeStrokeVisualsFromBox(input: {
  readonly box: PdfRectangle;
  readonly edgeStrokes: EdgeStrokeIR | undefined;
  readonly pdfColorFilter?: string;
  readonly zIndex?: number;
  readonly siblingOrder: number;
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
}): readonly PdfVisualElement[] {
  if (!input.edgeStrokes) {
    return [];
  }

  const entries = [
    ["top", input.edgeStrokes.top],
    ["right", input.edgeStrokes.right],
    ["bottom", input.edgeStrokes.bottom],
    ["left", input.edgeStrokes.left],
  ] as const;

  return entries.flatMap(([edge, stroke]) => {
    if (!stroke) {
      return [];
    }

    const visual = lineVisualForEdge({
      edge,
      box: input.box,
      stroke,
      ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
      zIndex: input.zIndex,
      siblingOrder: input.siblingOrder,
      opacity: input.opacity,
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
      ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
      ...(input.flipH ? { flipH: input.flipH } : {}),
      ...(input.flipV ? { flipV: input.flipV } : {}),
    });

    return visual ? [visual] : [];
  });
}

function edgeStrokeVisualsFromLayoutShape(node: ProjectedLayoutShape): readonly PdfVisualElement[] {
  const box = boxFromFrame(node.frame);
  const hasTransform = node.rotation !== undefined || node.flipH === true || node.flipV === true;
  return edgeStrokeVisualsFromBox({
    box,
    edgeStrokes: node.edgeStrokes,
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
    opacity: node.opacity,
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(hasTransform ? { rotationBox: box } : {}),
  });
}

function edgeStrokeVisualsFromLayoutGroup(node: ProjectedLayoutGroup): readonly PdfVisualElement[] {
  const box = boxFromFrame(node.frame);
  const hasTransform = node.rotation !== undefined || node.flipH === true || node.flipV === true;
  return edgeStrokeVisualsFromBox({
    box,
    edgeStrokes: node.edgeStrokes,
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
    opacity: node.opacity,
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(hasTransform ? { rotationBox: box } : {}),
  });
}

function edgeStrokeVisualsFromLayoutText(
  node: ProjectedLayoutText,
  box: PdfRectangle = boxFromFrame(node.frame),
): readonly PdfVisualElement[] {
  const hasTransform = node.rotation !== undefined || node.flipH === true || node.flipV === true;
  return edgeStrokeVisualsFromBox({
    box,
    edgeStrokes: node.edgeStrokes,
    zIndex: node.zIndex,
    siblingOrder: node.siblingOrder,
    opacity: node.opacity,
    ...(pdfBlendModeFromNode(node) ? { blendMode: pdfBlendModeFromNode(node) } : {}),
    ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
    ...(node.flipH ? { flipH: node.flipH } : {}),
    ...(node.flipV ? { flipV: node.flipV } : {}),
    ...(hasTransform ? { rotationBox: box } : {}),
  });
}

function tableCellPaintOrder(input: {
  readonly table: ProjectedLayoutTable;
  readonly sectionIndex: number;
  readonly rowIndex: number;
  readonly cellIndex: number;
}): number {
  return (
    input.table.siblingOrder * 1_000_000 +
    input.sectionIndex * 100_000 +
    input.rowIndex * 1_000 +
    input.cellIndex
  );
}

function tableRowPaintOrder(input: {
  readonly table: ProjectedLayoutTable;
  readonly sectionIndex: number;
  readonly rowIndex: number;
}): number {
  return (
    input.table.siblingOrder * 1_000_000 +
    input.sectionIndex * 100_000 +
    input.rowIndex * 1_000 -
    0.5
  );
}

function tableSectionPaintOrder(input: {
  readonly table: ProjectedLayoutTable;
  readonly sectionIndex: number;
}): number {
  return input.table.siblingOrder * 1_000_000 + input.sectionIndex * 100_000 - 1;
}

function pdfOpacityForTableSection(
  table: ProjectedLayoutTable,
  section: ProjectedLayoutTable["sections"][number],
): number | undefined {
  const sectionOpacity = combinePdfOpacity(
    pdfOpacity(section.opacity),
    pdfOpacityFromUnsupportedSemantics(section.unsupportedSemantics),
  );
  return combinePdfOpacity(pdfOpacityForLayoutNode(table), sectionOpacity);
}

function pdfBlendModeForTableSection(
  table: ProjectedLayoutTable,
  section: ProjectedLayoutTable["sections"][number],
): PdfBlendMode | undefined {
  return (
    pdfBlendModeFromUnsupportedSemantics(section.unsupportedSemantics) ??
    pdfBlendModeFromNode(table)
  );
}

function backgroundVisualFromTableSection(input: {
  readonly table: ProjectedLayoutTable;
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly siblingOrder: number;
  readonly pdfColorFilter?: string;
  readonly blendMode?: PdfBlendMode;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfVisualElement | undefined {
  const box = boxFromFrame(input.section.frame);
  const fill = pdfShapeFillFromFill({
    fill: input.section.fill,
    scopeId: `${input.table.id}:section:${input.siblingOrder}`,
    box,
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
  });
  if (!fill) {
    return undefined;
  }

  return {
    kind: "shape",
    shape: "rect",
    box,
    fill,
    ...(pdfOpacityForTableSection(input.table, input.section) !== undefined
      ? { opacity: pdfOpacityForTableSection(input.table, input.section) }
      : {}),
    ...(input.blendMode ? { blendMode: input.blendMode } : {}),
    paintOrder: {
      zIndex: input.table.zIndex,
      siblingOrder: input.siblingOrder,
      generatedLayerRole: "background",
    },
  };
}

function dropShadowFromFilterForTableSection(
  section: ProjectedLayoutTable["sections"][number],
): ShadowIR | undefined {
  for (const semantic of section.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfCssFilterIsProjectedAsDropShadow(semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromTableSection(input: {
  readonly table: ProjectedLayoutTable;
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly siblingOrder: number;
  readonly blendMode?: PdfBlendMode;
}): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForTableSection(input.section);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const opacity = pdfOpacityForTableSection(input.table, input.section);
  const baseBox = shadowBoxFromFrame(input.section.frame, shadow);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: "rect",
      baseBox,
      color,
      ...(opacity !== undefined ? { opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      zIndex: input.table.zIndex,
      siblingOrder: input.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: "rect",
      box: baseBox,
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      paintOrder: {
        zIndex: input.table.zIndex,
        siblingOrder: input.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function pdfOpacityForTableRow(
  table: ProjectedLayoutTable,
  section: ProjectedLayoutTable["sections"][number],
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
): number | undefined {
  const sectionOpacity = combinePdfOpacity(
    pdfOpacity(section.opacity),
    pdfOpacityFromUnsupportedSemantics(section.unsupportedSemantics),
  );
  const rowOpacity = combinePdfOpacity(
    pdfOpacity(row.opacity),
    pdfOpacityFromUnsupportedSemantics(row.unsupportedSemantics),
  );
  return combinePdfOpacity(
    combinePdfOpacity(pdfOpacityForLayoutNode(table), sectionOpacity),
    rowOpacity,
  );
}

function pdfBlendModeForTableRow(
  table: ProjectedLayoutTable,
  section: ProjectedLayoutTable["sections"][number],
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
): PdfBlendMode | undefined {
  return (
    pdfBlendModeFromUnsupportedSemantics(row.unsupportedSemantics) ??
    pdfBlendModeFromUnsupportedSemantics(section.unsupportedSemantics) ??
    pdfBlendModeFromNode(table)
  );
}

function backgroundVisualFromTableRow(input: {
  readonly table: ProjectedLayoutTable;
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly row: ProjectedLayoutTable["sections"][number]["rows"][number];
  readonly siblingOrder: number;
  readonly pdfColorFilter?: string;
  readonly blendMode?: PdfBlendMode;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfVisualElement | undefined {
  const box = boxFromFrame(input.row.frame);
  const fill = pdfShapeFillFromFill({
    fill: input.row.fill,
    scopeId: `${input.table.id}:row:${input.siblingOrder}`,
    box,
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
  });
  if (!fill) {
    return undefined;
  }

  return {
    kind: "shape",
    shape: "rect",
    box,
    fill,
    ...(pdfOpacityForTableRow(input.table, input.section, input.row) !== undefined
      ? { opacity: pdfOpacityForTableRow(input.table, input.section, input.row) }
      : {}),
    ...(input.blendMode ? { blendMode: input.blendMode } : {}),
    paintOrder: {
      zIndex: input.table.zIndex,
      siblingOrder: input.siblingOrder,
      generatedLayerRole: "background",
    },
  };
}

function dropShadowFromFilterForTableRow(
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
): ShadowIR | undefined {
  for (const semantic of row.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfCssFilterIsProjectedAsDropShadow(semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromTableRow(input: {
  readonly table: ProjectedLayoutTable;
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly row: ProjectedLayoutTable["sections"][number]["rows"][number];
  readonly siblingOrder: number;
  readonly blendMode?: PdfBlendMode;
}): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForTableRow(input.row);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const opacity = pdfOpacityForTableRow(input.table, input.section, input.row);
  const baseBox = shadowBoxFromFrame(input.row.frame, shadow);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: "rect",
      baseBox,
      color,
      ...(opacity !== undefined ? { opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      zIndex: input.table.zIndex,
      siblingOrder: input.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: "rect",
      box: baseBox,
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      paintOrder: {
        zIndex: input.table.zIndex,
        siblingOrder: input.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function backgroundVisualFromTableCell(input: {
  readonly table: ProjectedLayoutTable;
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly row: ProjectedLayoutTable["sections"][number]["rows"][number];
  readonly cell: ProjectedLayoutTableCell;
  readonly siblingOrder: number;
  readonly pdfColorFilter?: string;
  readonly blendMode?: PdfBlendMode;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): PdfVisualElement | undefined {
  const box = boxFromFrame(input.cell.frame);
  const fill = pdfShapeFillFromFill({
    fill: input.cell.fill,
    scopeId: `${input.table.id}:cell:${input.siblingOrder}`,
    box,
    ...(input.pdfColorFilter ? { pdfColorFilter: input.pdfColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
  });
  if (!fill) {
    return undefined;
  }

  return {
    kind: "shape",
    shape: "rect",
    box,
    fill,
    ...(pdfOpacityForTableCell(input.table, input.section, input.row, input.cell) !== undefined
      ? { opacity: pdfOpacityForTableCell(input.table, input.section, input.row, input.cell) }
      : {}),
    ...(input.blendMode ? { blendMode: input.blendMode } : {}),
    paintOrder: {
      zIndex: input.table.zIndex,
      siblingOrder: input.siblingOrder,
      generatedLayerRole: "background",
    },
  };
}

function dropShadowFromFilterForTableCell(cell: ProjectedLayoutTableCell): ShadowIR | undefined {
  for (const semantic of cell.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfCssFilterIsProjectedAsDropShadow(semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowVisualsFromTableCell(input: {
  readonly table: ProjectedLayoutTable;
  readonly section: ProjectedLayoutTable["sections"][number];
  readonly row: ProjectedLayoutTable["sections"][number]["rows"][number];
  readonly cell: ProjectedLayoutTableCell;
  readonly siblingOrder: number;
  readonly blendMode?: PdfBlendMode;
}): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForTableCell(input.cell);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const opacity = pdfOpacityForTableCell(input.table, input.section, input.row, input.cell);
  const baseBox = shadowBoxFromFrame(input.cell.frame, shadow);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: "rect",
      baseBox,
      color,
      ...(opacity !== undefined ? { opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      zIndex: input.table.zIndex,
      siblingOrder: input.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: "rect",
      box: baseBox,
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(input.blendMode ? { blendMode: input.blendMode } : {}),
      paintOrder: {
        zIndex: input.table.zIndex,
        siblingOrder: input.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function pdfOpacityForTableCell(
  table: ProjectedLayoutTable,
  section: ProjectedLayoutTable["sections"][number],
  row: ProjectedLayoutTable["sections"][number]["rows"][number],
  cell: ProjectedLayoutTableCell,
): number | undefined {
  const sectionOpacity = combinePdfOpacity(
    pdfOpacity(section.opacity),
    pdfOpacityFromUnsupportedSemantics(section.unsupportedSemantics),
  );
  const rowOpacity = combinePdfOpacity(
    pdfOpacity(row.opacity),
    pdfOpacityFromUnsupportedSemantics(row.unsupportedSemantics),
  );
  return combinePdfOpacity(
    combinePdfOpacity(
      combinePdfOpacity(pdfOpacityForLayoutNode(table), sectionOpacity),
      rowOpacity,
    ),
    combinePdfOpacity(
      pdfOpacity(cell.opacity),
      pdfOpacityFromUnsupportedSemantics(cell.unsupportedSemantics),
    ),
  );
}

function visualElementsFromLayoutTable(input: {
  readonly filterLengthContext?: PdfCssFilterLengthContext;
  readonly node: ProjectedLayoutTable;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly unicodeResourceIdsByFontId: ReadonlyMap<PdfFontResource["id"], PdfFontResource["id"]>;
  readonly fontResourcesById: ReadonlyMap<PdfFontResource["id"], PdfFontResource>;
  readonly assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): readonly PdfVisualElement[] {
  const dropShadowVisuals = dropShadowVisualsFromLayoutTable(input.node);
  const shadowVisuals = shadowVisualsFromLayoutTable(input.node);
  const innerShadowVisuals = innerShadowVisualsFromLayoutTable(input.node);
  const outlineVisual = outlineVisualFromLayoutTable(input.node);
  const tableOpacity = pdfOpacityForLayoutNode(input.node);
  const tableBlendMode = pdfBlendModeFromNode(input.node);
  const tableRadius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: input.node.radiusEmu });
  const tableBackgroundImageColorFilter = pdfColorFilterFromTableBackgroundImage(input.node);
  const tableBackgroundVisual = backgroundVisualFromLayoutTable({
    node: input.node,
    ...(tableBackgroundImageColorFilter ? { pdfColorFilter: tableBackgroundImageColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
  });
  const tableBackgroundImageVisuals = imageVisualsFromBackgroundLayers({
    layers: backgroundImageLayers(input.node.backgroundLayers),
    scopeId: `${input.node.id}:table`,
    ...(tableBackgroundImageColorFilter ? { pdfColorFilter: tableBackgroundImageColorFilter } : {}),
    imageResourcesById: input.imageResourcesById,
    opacity: tableOpacity,
    ...(tableBlendMode ? { blendMode: tableBlendMode } : {}),
    ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
    ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
      ? { rotationBox: boxFromFrame(input.node.frame) }
      : {}),
    ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
    ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
    ...(tableRadius !== undefined ? { clipRadius: tableRadius } : {}),
    ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
    siblingOrder: input.node.siblingOrder * 1_000_000 - 0.9999,
  });
  const tableGradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
    layers: gradientBackgroundLayers(input.node.backgroundLayers),
    scopeId: `${input.node.id}:table`,
    ...(tableBackgroundImageColorFilter ? { pdfColorFilter: tableBackgroundImageColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
    opacity: tableOpacity,
    ...(tableBlendMode ? { blendMode: tableBlendMode } : {}),
    ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
    ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
      ? { rotationBox: boxFromFrame(input.node.frame) }
      : {}),
    ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
    ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
    ...(tableRadius !== undefined ? { radius: tableRadius } : {}),
    ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
    siblingOrder: input.node.siblingOrder * 1_000_000 - 0.9999,
  });
  const tableBorderBox = boxFromFrame(input.node.frame);
  const tableBorderSiblingOrder = input.node.siblingOrder * 1_000_000 + 999_999;
  const tableRoundedEdgeVisual = roundedStrokeVisualFromBox({
    box: tableBorderBox,
    edgeStrokes: input.node.edgeStrokes,
    radius: tableRadius,
    ...(tableBackgroundImageColorFilter ? { pdfColorFilter: tableBackgroundImageColorFilter } : {}),
    zIndex: input.node.zIndex,
    siblingOrder: tableBorderSiblingOrder,
    opacity: tableOpacity,
    ...(tableBlendMode ? { blendMode: tableBlendMode } : {}),
    ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
    rotationBox: tableBorderBox,
    ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
    ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
  });
  const tableEdgeVisuals =
    tableRoundedEdgeVisual !== undefined
      ? [tableRoundedEdgeVisual]
      : edgeStrokeVisualsFromBox({
          box: tableBorderBox,
          edgeStrokes: input.node.edgeStrokes,
          ...(tableBackgroundImageColorFilter
            ? { pdfColorFilter: tableBackgroundImageColorFilter }
            : {}),
          zIndex: input.node.zIndex,
          siblingOrder: tableBorderSiblingOrder,
          opacity: tableOpacity,
          ...(tableBlendMode ? { blendMode: tableBlendMode } : {}),
          ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
          rotationBox: tableBorderBox,
          ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
          ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
        });
  const transformBox = boxFromFrame(input.node.frame);
  const cellVisuals = input.node.sections.flatMap((section, sectionIndex) => {
    const sectionSiblingOrder = tableSectionPaintOrder({
      table: input.node,
      sectionIndex,
    });
    const sectionOpacity = pdfOpacityForTableSection(input.node, section);
    const sectionBlendMode = pdfBlendModeForTableSection(input.node, section);
    const sectionBackgroundImageColorFilter =
      pdfColorFilterFromTableSectionBackgroundImage(section);
    const sectionDropShadowVisuals = dropShadowVisualsFromTableSection({
      table: input.node,
      section,
      siblingOrder: sectionSiblingOrder,
      ...(sectionBlendMode ? { blendMode: sectionBlendMode } : {}),
    });
    const sectionBackgroundVisual = backgroundVisualFromTableSection({
      table: input.node,
      section,
      siblingOrder: sectionSiblingOrder,
      ...(sectionBackgroundImageColorFilter
        ? { pdfColorFilter: sectionBackgroundImageColorFilter }
        : {}),
      ...(sectionBlendMode ? { blendMode: sectionBlendMode } : {}),
      gradientResourcesById: input.gradientResourcesById,
    });
    const sectionBackgroundImageVisuals = imageVisualsFromBackgroundLayers({
      layers: backgroundImageLayers(section.backgroundLayers),
      scopeId: `${input.node.id}:section:${sectionIndex}`,
      ...(sectionBackgroundImageColorFilter
        ? { pdfColorFilter: sectionBackgroundImageColorFilter }
        : {}),
      imageResourcesById: input.imageResourcesById,
      opacity: sectionOpacity,
      ...(sectionBlendMode ? { blendMode: sectionBlendMode } : {}),
      ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
      siblingOrder: sectionSiblingOrder + 0.0001,
    });
    const sectionGradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
      layers: gradientBackgroundLayers(section.backgroundLayers),
      scopeId: `${input.node.id}:section:${sectionIndex}`,
      ...(sectionBackgroundImageColorFilter
        ? { pdfColorFilter: sectionBackgroundImageColorFilter }
        : {}),
      gradientResourcesById: input.gradientResourcesById,
      opacity: sectionOpacity,
      ...(sectionBlendMode ? { blendMode: sectionBlendMode } : {}),
      ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
      siblingOrder: sectionSiblingOrder + 0.0001,
    });
    const sectionRowVisuals = section.rows.flatMap((row, rowIndex) => {
      const rowSiblingOrder = tableRowPaintOrder({
        table: input.node,
        sectionIndex,
        rowIndex,
      });
      const rowOpacity = pdfOpacityForTableRow(input.node, section, row);
      const rowBlendMode = pdfBlendModeForTableRow(input.node, section, row);
      const rowBackgroundImageColorFilter = pdfColorFilterFromTableRowBackgroundImage(row);
      const rowDropShadowVisuals = dropShadowVisualsFromTableRow({
        table: input.node,
        section,
        row,
        siblingOrder: rowSiblingOrder,
        ...(rowBlendMode ? { blendMode: rowBlendMode } : {}),
      });
      const rowBackgroundVisual = backgroundVisualFromTableRow({
        table: input.node,
        section,
        row,
        siblingOrder: rowSiblingOrder,
        ...(rowBackgroundImageColorFilter ? { pdfColorFilter: rowBackgroundImageColorFilter } : {}),
        ...(rowBlendMode ? { blendMode: rowBlendMode } : {}),
        gradientResourcesById: input.gradientResourcesById,
      });
      const rowBackgroundImageVisuals = imageVisualsFromBackgroundLayers({
        layers: backgroundImageLayers(row.backgroundLayers),
        scopeId: `${input.node.id}:row:${sectionIndex}:${rowIndex}`,
        ...(rowBackgroundImageColorFilter ? { pdfColorFilter: rowBackgroundImageColorFilter } : {}),
        imageResourcesById: input.imageResourcesById,
        opacity: rowOpacity,
        ...(rowBlendMode ? { blendMode: rowBlendMode } : {}),
        ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
        siblingOrder: rowSiblingOrder + 0.0001,
      });
      const rowGradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
        layers: gradientBackgroundLayers(row.backgroundLayers),
        scopeId: `${input.node.id}:row:${sectionIndex}:${rowIndex}`,
        ...(rowBackgroundImageColorFilter ? { pdfColorFilter: rowBackgroundImageColorFilter } : {}),
        gradientResourcesById: input.gradientResourcesById,
        opacity: rowOpacity,
        ...(rowBlendMode ? { blendMode: rowBlendMode } : {}),
        ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
        siblingOrder: rowSiblingOrder + 0.0001,
      });
      const rowCellVisuals = row.cells.flatMap((cell, cellIndex) => {
        const siblingOrder = tableCellPaintOrder({
          table: input.node,
          sectionIndex,
          rowIndex,
          cellIndex,
        });
        const cellOpacity = pdfOpacityForTableCell(input.node, section, row, cell);
        const cellBlendMode = pdfBlendModeForTableCell(input.node, section, row, cell);
        const cellBackgroundImageColorFilter = pdfColorFilterFromTableCellBackgroundImage(cell);
        const dropShadowVisuals = dropShadowVisualsFromTableCell({
          table: input.node,
          section,
          row,
          cell,
          siblingOrder,
          ...(cellBlendMode ? { blendMode: cellBlendMode } : {}),
        });
        const backgroundVisual = backgroundVisualFromTableCell({
          table: input.node,
          section,
          row,
          cell,
          siblingOrder,
          ...(cellBackgroundImageColorFilter
            ? { pdfColorFilter: cellBackgroundImageColorFilter }
            : {}),
          ...(cellBlendMode ? { blendMode: cellBlendMode } : {}),
          gradientResourcesById: input.gradientResourcesById,
        });
        const backgroundImageVisuals = imageVisualsFromBackgroundLayers({
          layers: backgroundImageLayers(cell.backgroundLayers),
          scopeId: `${input.node.id}:cell:${sectionIndex}:${rowIndex}:${cellIndex}`,
          ...(cellBackgroundImageColorFilter
            ? { pdfColorFilter: cellBackgroundImageColorFilter }
            : {}),
          imageResourcesById: input.imageResourcesById,
          opacity: cellOpacity,
          ...(cellBlendMode ? { blendMode: cellBlendMode } : {}),
          ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
          siblingOrder: siblingOrder + 0.0001,
        });
        const gradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
          layers: gradientBackgroundLayers(cell.backgroundLayers),
          scopeId: `${input.node.id}:cell:${sectionIndex}:${rowIndex}:${cellIndex}`,
          ...(cellBackgroundImageColorFilter
            ? { pdfColorFilter: cellBackgroundImageColorFilter }
            : {}),
          gradientResourcesById: input.gradientResourcesById,
          opacity: cellOpacity,
          ...(cellBlendMode ? { blendMode: cellBlendMode } : {}),
          ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
          siblingOrder: siblingOrder + 0.0001,
        });
        const edgeVisuals = edgeStrokeVisualsFromBox({
          box: boxFromFrame(cell.frame),
          edgeStrokes: cell.edgeStrokes,
          ...(cellBackgroundImageColorFilter
            ? { pdfColorFilter: cellBackgroundImageColorFilter }
            : {}),
          zIndex: input.node.zIndex,
          siblingOrder,
          opacity: cellOpacity,
          ...(cellBlendMode ? { blendMode: cellBlendMode } : {}),
        });
        const childVisuals = pdfVisualsWithInheritedBlendMode(
          cell.children.flatMap((child) =>
            visualElementsFromLayoutNode({
              node: child,
              requestsByTextNode: input.requestsByTextNode,
              resourceIdsByRequestKey: input.resourceIdsByRequestKey,
              unicodeResourceIdsByFontId: input.unicodeResourceIdsByFontId,
              fontResourcesById: input.fontResourcesById,
              assets: input.assets,
              imageResourcesById: input.imageResourcesById,
              gradientResourcesById: input.gradientResourcesById,
              hidden: false,
              filterLengthContext: input.filterLengthContext,
              inheritedOpacity: cellOpacity,
            }),
          ),
          cellBlendMode,
        );

        return [
          ...pdfVisualsWithLayoutOrigin(
            [
              ...dropShadowVisuals,
              ...(backgroundVisual ? [backgroundVisual] : []),
              ...gradientBackgroundVisuals,
              ...backgroundImageVisuals,
              ...edgeVisuals,
            ],
            cell.origin,
          ),
          ...childVisuals,
        ];
      });

      return [
        ...pdfVisualsWithLayoutOrigin(
          [
            ...rowDropShadowVisuals,
            ...(rowBackgroundVisual ? [rowBackgroundVisual] : []),
            ...rowGradientBackgroundVisuals,
            ...rowBackgroundImageVisuals,
          ],
          row.origin,
        ),
        ...rowCellVisuals,
      ];
    });

    return [
      ...pdfVisualsWithLayoutOrigin(
        [
          ...sectionDropShadowVisuals,
          ...(sectionBackgroundVisual ? [sectionBackgroundVisual] : []),
          ...sectionGradientBackgroundVisuals,
          ...sectionBackgroundImageVisuals,
        ],
        section.origin,
      ),
      ...sectionRowVisuals,
    ];
  });
  const transformedCellVisuals = pdfVisualsWithInheritedTransform(cellVisuals, {
    ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
    ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
    ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
    rotationBox: transformBox,
  });

  return [
    ...pdfVisualsWithLayoutOrigin(
      [
        ...dropShadowVisuals,
        ...shadowVisuals,
        ...(tableBackgroundVisual ? [tableBackgroundVisual] : []),
        ...tableGradientBackgroundVisuals,
        ...tableBackgroundImageVisuals,
      ],
      input.node.origin,
    ),
    ...transformedCellVisuals,
    ...pdfVisualsWithLayoutOrigin(innerShadowVisuals, input.node.origin),
    ...pdfVisualsWithLayoutOrigin(
      [...tableEdgeVisuals, ...(outlineVisual ? [outlineVisual] : [])],
      input.node.origin,
    ),
  ];
}

function backgroundVisualFromLayoutSlide(input: {
  readonly layoutSlide: ProjectedLayoutSlide | undefined;
  readonly mediaBox: PdfPage["mediaBox"];
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): readonly PdfVisualElement[] {
  const visuals: PdfVisualElement[] = [];
  const fill = pdfShapeFillFromFill({
    fill: input.layoutSlide?.background,
    scopeId: input.layoutSlide?.id ?? "slide",
    box: input.mediaBox,
    gradientResourcesById: input.gradientResourcesById,
  });
  if (fill) {
    visuals.push({
      kind: "shape",
      shape: "rect",
      box: input.mediaBox,
      fill,
      paintOrder: {
        siblingOrder: -1,
        generatedLayerRole: "background",
      },
    });
  }

  visuals.push(
    ...shapeVisualsFromGradientBackgroundLayers({
      layers: gradientBackgroundLayers(input.layoutSlide?.backgroundLayers),
      scopeId: input.layoutSlide?.id ?? "slide",
      gradientResourcesById: input.gradientResourcesById,
      siblingOrder: -0.95,
    }),
    ...imageVisualsFromBackgroundLayers({
      layers: backgroundImageLayers(input.layoutSlide?.backgroundLayers),
      scopeId: input.layoutSlide?.id ?? "slide",
      imageResourcesById: input.imageResourcesById,
      siblingOrder: -0.9,
    }),
  );

  return visuals;
}

function romanNumeral(value: number): string {
  const numerals: readonly [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.max(1, Math.floor(value));
  let output = "";

  numerals.forEach(([amount, symbol]) => {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  });

  return output;
}

function alphabeticMarker(value: number): string {
  let remaining = Math.max(1, Math.floor(value));
  let output = "";

  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(65 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }

  return output;
}

function pdfListMarkerText(list: ProjectedLayoutText["style"]["list"]): string | undefined {
  if (!list || list.type === "none") {
    return undefined;
  }

  if (list.type === "bullet") {
    return "•";
  }

  const value = list.startAt ?? 1;
  switch (list.style) {
    case "arabicPeriod":
      return `${value}.`;
    case "alphaLcPeriod":
      return `${alphabeticMarker(value).toLowerCase()}.`;
    case "alphaUcPeriod":
      return `${alphabeticMarker(value)}.`;
    case "romanLcPeriod":
      return `${romanNumeral(value).toLowerCase()}.`;
    case "romanUcPeriod":
      return `${romanNumeral(value)}.`;
  }
}

function pdfListIndentPt(list: ProjectedLayoutText["style"]["list"]): number {
  if (!list || list.type === "none") {
    return 0;
  }

  return list.indentPt ?? 18;
}

function pdfDecorationStrokeDash(
  underlineStyle: TextStyleIR["underlineStyle"] | undefined,
): "dash" | "sysDot" | undefined {
  switch (underlineStyle) {
    case "dash":
      return "dash";
    case "dotted":
      return "sysDot";
    case "dbl":
    case "none":
    case "sng":
    case "wavy":
    case undefined:
      return undefined;
  }
}

function pdfNextTabStopPt(input: {
  readonly currentOffset: number;
  readonly tabStops: ProjectedLayoutText["style"]["tabStops"] | undefined;
}): { readonly position: number; readonly alignment?: "ctr" | "dec" | "l" | "r" } {
  const configuredStop = [...(input.tabStops ?? [])]
    .map((tabStop) => ({
      position: tabStop.positionIn * POINTS_PER_INCH,
      ...(tabStop.alignment ? { alignment: tabStop.alignment } : {}),
    }))
    .sort((a, b) => a.position - b.position)
    .find((tabStop) => tabStop.position > input.currentOffset + 0.001);
  if (configuredStop !== undefined) {
    return configuredStop;
  }

  return {
    position: Math.ceil((input.currentOffset + 0.001) / DEFAULT_TAB_STOP_PT) * DEFAULT_TAB_STOP_PT,
  };
}

function pdfTabAdvanceWidthPt(input: {
  readonly currentOffset: number;
  readonly nextSegmentWidth: number;
  readonly nextSegmentDecimalOffset?: number;
  readonly tabStops: ProjectedLayoutText["style"]["tabStops"] | undefined;
}): number {
  const tabStop = pdfNextTabStopPt({
    currentOffset: input.currentOffset,
    tabStops: input.tabStops,
  });
  const alignmentOffset = (() => {
    switch (tabStop.alignment) {
      case "r":
        return input.nextSegmentWidth;
      case "ctr":
        return input.nextSegmentWidth / 2;
      case "dec":
        return input.nextSegmentDecimalOffset ?? 0;
      case "l":
      case undefined:
        return 0;
    }
  })();

  return Math.max(0, tabStop.position - input.currentOffset - alignmentOffset);
}

function pdfDecimalTabAlignmentOffsetPt(input: {
  readonly text: string;
  readonly fontSize: number;
  readonly charSpacing?: number;
  readonly font?: PdfFontResource;
}): number | undefined {
  const decimalIndex = input.text.indexOf(".");
  if (decimalIndex < 0) {
    return undefined;
  }

  return estimatedPdfTextWidthWithCharSpacingPt(
    input.text.slice(0, decimalIndex),
    input.fontSize,
    input.charSpacing,
    input.font,
  );
}

type PdfTextRunMetrics = {
  readonly fontSize: number;
  readonly lineFontSize: number;
  readonly charSpacing?: number;
  readonly textRise?: number;
};

function pdfTextMetricsForRun(input: {
  readonly node: ProjectedLayoutText;
  readonly run: PdfTextLayoutRun;
  readonly textFitScale: number;
}): PdfTextRunMetrics {
  const baseFontSize =
    (input.run.style?.fontSizePt ?? input.node.style.fontSizePt ?? 12) * input.textFitScale;
  const rawCharSpacing = input.run.style?.charSpacing ?? input.node.style.charSpacing;
  const charSpacing =
    rawCharSpacing === undefined ? undefined : rawCharSpacing * input.textFitScale;
  const scriptMetrics = pdfScriptTextMetrics({
    fontSize: baseFontSize,
    superscript:
      input.run.style?.superscript !== undefined
        ? input.run.style.superscript
        : input.node.style.superscript,
    subscript:
      input.run.style?.subscript !== undefined
        ? input.run.style.subscript
        : input.node.style.subscript,
  });

  return {
    fontSize: scriptMetrics.fontSize,
    lineFontSize: scriptMetrics.lineFontSize,
    ...(charSpacing !== undefined ? { charSpacing } : {}),
    ...(scriptMetrics.textRise !== undefined ? { textRise: scriptMetrics.textRise } : {}),
  };
}

function pdfTabAlignmentSegmentAfterRun(input: {
  readonly node: ProjectedLayoutText;
  readonly runs: readonly PdfTextLayoutRun[];
  readonly runIndex: number;
  readonly currentRun: PdfTextLayoutRun;
  readonly currentPart: string;
  readonly currentMetrics: PdfTextRunMetrics;
  readonly textFitScale: number;
}):
  | {
      readonly run: PdfTextLayoutRun;
      readonly text: string;
      readonly fontSize: number;
      readonly charSpacing?: number;
    }
  | undefined {
  if (input.currentPart.length > 0) {
    return {
      run: input.currentRun,
      text: input.currentPart,
      fontSize: input.currentMetrics.fontSize,
      ...(input.currentMetrics.charSpacing !== undefined
        ? { charSpacing: input.currentMetrics.charSpacing }
        : {}),
    };
  }

  for (let nextRunIndex = input.runIndex + 1; nextRunIndex < input.runs.length; nextRunIndex += 1) {
    const nextRun = input.runs[nextRunIndex];
    if (!nextRun) {
      return undefined;
    }

    const firstLine = nextRun.text.split("\n")[0] ?? "";
    const firstPart = firstLine.split("\t")[0] ?? "";
    if (firstPart.length > 0) {
      const nextMetrics = pdfTextMetricsForRun({
        node: input.node,
        run: nextRun,
        textFitScale: input.textFitScale,
      });
      return {
        run: nextRun,
        text: firstPart,
        fontSize: nextMetrics.fontSize,
        ...(nextMetrics.charSpacing !== undefined ? { charSpacing: nextMetrics.charSpacing } : {}),
      };
    }

    if (nextRun.text.includes("\n") || firstLine.includes("\t")) {
      return undefined;
    }
  }

  return undefined;
}

function pdfTextShrinkFitScale(input: {
  readonly node: ProjectedLayoutText;
  readonly runs: readonly PdfTextLayoutRun[];
  readonly textBox: PdfRectangle;
  readonly font?: PdfFontResource;
  readonly fontForRun?: (run: PdfTextLayoutRun, text: string) => PdfFontResource | undefined;
}): number {
  if (input.node.style.fit !== "shrink") {
    return 1;
  }

  const lineWidths: number[] = [0];
  const lineFontSizes: number[] = [input.node.style.fontSizePt ?? 12];
  const nextLine = (): void => {
    lineWidths.push(0);
    lineFontSizes.push(input.node.style.fontSizePt ?? 12);
  };
  const availableWidthForShrinkLine = (lineIndex: number): number =>
    Math.max(0, input.textBox.width - (lineIndex === 0 ? (input.node.style.textIndentPt ?? 0) : 0));
  const appendShrinkMeasuredWidth = (inputWidth: {
    readonly width: number;
    readonly fontSize: number;
  }): void => {
    const currentIndex = Math.max(0, lineWidths.length - 1);
    lineWidths[currentIndex] = (lineWidths[currentIndex] ?? 0) + inputWidth.width;
    lineFontSizes[currentIndex] = Math.max(lineFontSizes[currentIndex] ?? 0, inputWidth.fontSize);
  };

  input.runs.forEach((run, runIndex) => {
    const runMetrics = pdfTextMetricsForRun({ node: input.node, run, textFitScale: 1 });
    const fontSize = runMetrics.fontSize;
    const charSpacing = runMetrics.charSpacing;
    run.text.split("\n").forEach((lineText, lineIndex) => {
      if (lineIndex > 0) {
        nextLine();
      }

      lineText.split("\t").forEach((part, partIndex) => {
        const currentIndex = Math.max(0, lineWidths.length - 1);
        const partFont = input.fontForRun?.(run, part) ?? input.font;
        const partWidth = estimatedPdfTextWidthWithCharSpacingPt(
          part,
          fontSize,
          charSpacing,
          partFont,
        );
        if (partIndex > 0) {
          const currentOffset = lineWidths[currentIndex] ?? 0;
          const alignmentSegment = pdfTabAlignmentSegmentAfterRun({
            node: input.node,
            runs: input.runs,
            runIndex,
            currentRun: run,
            currentPart: part,
            currentMetrics: runMetrics,
            textFitScale: 1,
          });
          const nextSegmentWidth = alignmentSegment
            ? estimatedPdfTextWidthWithCharSpacingPt(
                alignmentSegment.text,
                alignmentSegment.fontSize,
                alignmentSegment.charSpacing,
                input.fontForRun?.(alignmentSegment.run, alignmentSegment.text) ?? input.font,
              )
            : partWidth;
          const decimalOffset = alignmentSegment
            ? pdfDecimalTabAlignmentOffsetPt({
                text: alignmentSegment.text,
                fontSize: alignmentSegment.fontSize,
                charSpacing: alignmentSegment.charSpacing,
                font: input.fontForRun?.(alignmentSegment.run, alignmentSegment.text) ?? input.font,
              })
            : undefined;
          lineWidths[currentIndex] =
            currentOffset +
            pdfTabAdvanceWidthPt({
              currentOffset,
              nextSegmentWidth,
              ...(decimalOffset !== undefined ? { nextSegmentDecimalOffset: decimalOffset } : {}),
              tabStops: input.node.style.tabStops,
            });
        }

        if (part.length === 0) {
          return;
        }

        if (input.node.style.breakWords) {
          Array.from(part).forEach((character) => {
            const targetIndex = Math.max(0, lineWidths.length - 1);
            const targetWidth = lineWidths[targetIndex] ?? 0;
            const characterWidth =
              estimatedPdfTextWidthPt(character, fontSize, partFont) +
              (targetWidth > 0 ? (charSpacing ?? 0) : 0);
            const availableWidth = availableWidthForShrinkLine(targetIndex);
            if (
              availableWidth > 0 &&
              targetWidth > 0 &&
              targetWidth + characterWidth > availableWidth
            ) {
              nextLine();
            }
            appendShrinkMeasuredWidth({ width: characterWidth, fontSize });
          });
          return;
        }

        appendShrinkMeasuredWidth({
          width: partWidth,
          fontSize,
        });
      });
    });
  });

  const maxWidthOverflowScale = lineWidths.reduce((scale, width, lineIndex) => {
    const availableWidth = availableWidthForShrinkLine(lineIndex);
    if (width <= 0 || availableWidth <= 0 || width <= availableWidth) {
      return scale;
    }

    return Math.min(scale, availableWidth / width);
  }, 1);
  const contentHeight =
    lineFontSizes.length === 0
      ? 0
      : lineFontSizes
          .slice(0, -1)
          .reduce(
            (total, lineHeight) =>
              total +
              (input.node.style.lineSpacing ??
                lineHeight *
                  (input.node.style.lineSpacingMultiple ?? DEFAULT_NORMAL_LINE_HEIGHT_MULTIPLE)),
            0,
          ) + (lineFontSizes.at(-1) ?? 0);
  const heightOverflowScale =
    contentHeight > input.textBox.height && contentHeight > 0
      ? input.textBox.height / contentHeight
      : 1;
  const scale = Math.min(maxWidthOverflowScale, heightOverflowScale);

  return Number.isFinite(scale) && scale > 0 ? Math.min(1, scale) : 1;
}

type PdfTextLineSegment = {
  readonly run: PdfTextLayoutRun;
  readonly text: string;
  readonly fontId: PdfFontResource["id"];
  readonly textEncoding?: "utf16be";
  readonly fontSize: number;
  readonly lineFontSize: number;
  readonly charSpacing?: number;
  readonly textRise?: number;
  readonly width: number;
};

function justifiedPdfTextLineSegments(input: {
  readonly line: readonly PdfTextLineSegment[];
  readonly lineWidth: number;
  readonly availableWidth: number;
  readonly fontResourcesById: ReadonlyMap<PdfFontResource["id"], PdfFontResource>;
}): readonly PdfTextLineSegment[] {
  const words = input.line.flatMap((segment): PdfTextLineSegment[] => {
    if (segment.text.length === 0) {
      return [{ ...segment }];
    }

    return (
      segment.text.match(/\S+/gu)?.map((word) => ({
        ...segment,
        text: word,
        width: estimatedPdfTextWidthWithCharSpacingPt(
          word,
          segment.fontSize,
          segment.charSpacing,
          input.fontResourcesById.get(segment.fontId),
        ),
      })) ?? []
    );
  });
  if (words.length <= 1 || input.availableWidth <= input.lineWidth) {
    return input.line;
  }

  const wordWidth = words.reduce((total, word) => total + word.width, 0);
  const gapCount = words.length - 1;
  const gapWidth = (input.availableWidth - wordWidth) / gapCount;

  return words.flatMap((word, index): PdfTextLineSegment[] =>
    index === 0
      ? [word]
      : [
          {
            ...word,
            text: "",
            width: gapWidth,
          },
          word,
        ],
  );
}

function pdfTextSegmentFontId(input: {
  readonly text: string;
  readonly fontId: PdfFontResource["id"];
  readonly fontRequest?: FontRequest;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly unicodeResourceIdsByFontId: ReadonlyMap<PdfFontResource["id"], PdfFontResource["id"]>;
}): PdfFontResource["id"] {
  const segmentFontId = input.fontRequest
    ? input.resourceIdsByRequestKey.get(fontRequestKey({ ...input.fontRequest, text: input.text }))
    : undefined;
  const baseFontId = segmentFontId ?? input.fontId;
  const embeddedUnicodeFontId =
    input.unicodeResourceIdsByFontId.get(baseFontId) ??
    (new Set(input.unicodeResourceIdsByFontId.values()).has(baseFontId) ? baseFontId : undefined);

  if (embeddedUnicodeFontId) {
    return embeddedUnicodeFontId;
  }

  if (pdfTextEncodingIsSupported(input.text)) {
    return baseFontId;
  }

  return DEFAULT_UNICODE_FONT_RESOURCE_ID;
}

function pdfTextSegmentEncoding(input: {
  readonly text: string;
  readonly fontId: PdfFontResource["id"];
  readonly fontResourcesById: ReadonlyMap<PdfFontResource["id"], PdfFontResource>;
}): "utf16be" | undefined {
  return input.fontResourcesById.get(input.fontId)?.encoding === "identity-h" ||
    !pdfTextEncodingIsSupported(input.text)
    ? "utf16be"
    : undefined;
}

function pdfTextEncodingChunks(text: string): readonly string[] {
  const chunks: string[] = [];
  let current = "";
  let currentSupported: boolean | undefined;

  for (const character of Array.from(text)) {
    const supported = pdfTextEncodingIsSupported(character);
    if (current.length > 0 && currentSupported !== supported) {
      chunks.push(current);
      current = "";
    }

    current += character;
    currentSupported = supported;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function longestFontRequestResourceChunk(input: {
  readonly text: string;
  readonly fontRequest: FontRequest;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
}): string | undefined {
  const characters = Array.from(input.text);
  for (let length = characters.length; length > 0; length -= 1) {
    const chunk = characters.slice(0, length).join("");
    if (input.resourceIdsByRequestKey.has(fontRequestKey({ ...input.fontRequest, text: chunk }))) {
      return chunk;
    }
  }

  return undefined;
}

function pdfTextFontChunks(input: {
  readonly text: string;
  readonly fontRequest?: FontRequest;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
}): readonly string[] {
  if (!input.fontRequest || input.text.length === 0) {
    return pdfTextEncodingChunks(input.text);
  }

  const chunks: string[] = [];
  let remaining = input.text;
  while (remaining.length > 0) {
    const resourceChunk = longestFontRequestResourceChunk({
      text: remaining,
      fontRequest: input.fontRequest,
      resourceIdsByRequestKey: input.resourceIdsByRequestKey,
    });
    if (resourceChunk) {
      chunks.push(resourceChunk);
      remaining = remaining.slice(resourceChunk.length);
      continue;
    }

    const [encodingChunk] = pdfTextEncodingChunks(remaining);
    if (!encodingChunk) {
      break;
    }
    chunks.push(encodingChunk);
    remaining = remaining.slice(encodingChunk.length);
  }

  return chunks;
}

function textVisualsFromLayoutText(input: {
  readonly node: ProjectedLayoutText;
  readonly fontId: PdfFontResource["id"];
  readonly fontRequest?: FontRequest;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly unicodeResourceIdsByFontId: ReadonlyMap<PdfFontResource["id"], PdfFontResource["id"]>;
  readonly fontResourcesById: ReadonlyMap<PdfFontResource["id"], PdfFontResource>;
}): readonly PdfVisualElement[] {
  const runs: readonly PdfTextLayoutRun[] =
    input.node.content.runs && input.node.content.runs.length > 0
      ? input.node.content.runs
      : [{ text: input.node.content.text }];
  const frameBox = boxFromFrame(input.node.clip?.originalFrame ?? input.node.frame);
  const textClipBox = input.node.clip
    ? boxFromFrame(input.node.clip.clipFrame)
    : input.node.style.overflow === "hidden"
      ? frameBox
      : undefined;
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = input.node.style.paddingPt ?? [
    0, 0, 0, 0,
  ];
  const box = {
    x: frameBox.x + paddingLeft,
    y: frameBox.y + paddingTop,
    width: Math.max(0, frameBox.width - paddingLeft - paddingRight),
    height: Math.max(0, frameBox.height - paddingTop - paddingBottom),
  };
  const listMarker = pdfListMarkerText(input.node.style.list);
  const blendMode = pdfBlendModeFromNode(input.node);
  const listIndent = listMarker ? pdfListIndentPt(input.node.style.list) : 0;
  let textBox = {
    ...box,
    x: box.x + listIndent,
    width: Math.max(0, box.width - listIndent),
  };
  const paragraphSpacingBefore = input.node.style.paragraphSpacingBefore ?? 0;
  const paragraphSpacingAfter = input.node.style.paragraphSpacingAfter ?? 0;
  const lineTextBox = (lineIndex: number) => {
    const indent = lineIndex === 0 ? (input.node.style.textIndentPt ?? 0) : 0;
    return {
      ...textBox,
      x: textBox.x + indent,
      width: Math.max(0, textBox.width - indent),
    };
  };
  const fontRequestForRunText = (run: PdfTextLayoutRun, text: string): FontRequest | undefined => {
    const families = fontFamilyCandidates(run.style?.fontFamily ?? input.node.style.fontFamily);
    const family = families?.[0];
    if (!family) {
      return undefined;
    }

    return {
      family,
      ...(families && families.length > 1 ? { families } : {}),
      weight: resolvedFontWeight(run.style?.fontWeight ?? input.node.style.fontWeight),
      style: (run.style?.italic ?? input.node.style.italic) === true ? "italic" : "normal",
      text,
    };
  };
  const fallbackFontIdForRun = (run: PdfTextLayoutRun): PdfFontResource["id"] =>
    input.fontId === DEFAULT_FONT_RESOURCE_ID
      ? defaultStandardFontResourceIdForTextStyle({
          nodeStyle: input.node.style,
          runStyle: run.style,
        })
      : input.fontId;
  const fontIdForRunText = (
    run: PdfTextLayoutRun,
    text: string,
    fallbackFontId: PdfFontResource["id"] = fallbackFontIdForRun(run),
  ): PdfFontResource["id"] => {
    const fontRequest = fontRequestForRunText(run, text);
    const resourceId = fontRequest
      ? input.resourceIdsByRequestKey.get(fontRequestKey(fontRequest))
      : undefined;
    return resourceId ?? fallbackFontId;
  };
  const textFitScale = pdfTextShrinkFitScale({
    node: input.node,
    runs,
    textBox,
    font: input.fontResourcesById.get(input.fontId),
    fontForRun: (run, text) => input.fontResourcesById.get(fontIdForRunText(run, text)),
  });
  const lines = [[]] as Array<Array<PdfTextLineSegment>>;
  const lineWidth = (line: (typeof lines)[number]): number =>
    line.reduce((total, segment) => total + segment.width, 0);
  const fontIdForText = (
    text: string,
    fontId: PdfFontResource["id"],
    fontRequest: FontRequest | undefined = input.fontRequest,
  ): PdfFontResource["id"] =>
    pdfTextSegmentFontId({
      text,
      fontId,
      ...(fontRequest ? { fontRequest } : {}),
      resourceIdsByRequestKey: input.resourceIdsByRequestKey,
      unicodeResourceIdsByFontId: input.unicodeResourceIdsByFontId,
    });
  const textWidth = (
    text: string,
    fontSize: number,
    charSpacing: number | undefined,
    fontId: PdfFontResource["id"],
    fontRequest?: FontRequest,
  ): number =>
    estimatedPdfTextWidthWithCharSpacingPt(
      text,
      fontSize,
      charSpacing,
      input.fontResourcesById.get(fontIdForText(text, fontId, fontRequest)),
    );
  const appendAdvance = (inputSegment: {
    readonly run: (typeof runs)[number];
    readonly fontId: PdfFontResource["id"];
    readonly fontSize: number;
    readonly lineFontSize: number;
    readonly fontRequest?: FontRequest;
    readonly width: number;
    readonly charSpacing?: number;
    readonly textRise?: number;
  }): void => {
    if (inputSegment.width <= 0) {
      return;
    }

    lines[lines.length - 1]?.push({
      run: inputSegment.run,
      text: "",
      fontId: inputSegment.fontId,
      fontSize: inputSegment.fontSize,
      lineFontSize: inputSegment.lineFontSize,
      ...(inputSegment.charSpacing !== undefined ? { charSpacing: inputSegment.charSpacing } : {}),
      ...(inputSegment.textRise !== undefined ? { textRise: inputSegment.textRise } : {}),
      width: inputSegment.width,
    });
  };
  const appendTabAdvance = (inputSegment: {
    readonly run: (typeof runs)[number];
    readonly fontId: PdfFontResource["id"];
    readonly fontSize: number;
    readonly lineFontSize: number;
    readonly nextSegmentWidth: number;
    readonly nextSegmentDecimalOffset?: number;
    readonly charSpacing?: number;
    readonly textRise?: number;
  }): void => {
    const currentLine = lines[Math.max(0, lines.length - 1)] ?? [];
    const currentOffset = lineWidth(currentLine);
    const advanceWidth = pdfTabAdvanceWidthPt({
      currentOffset,
      nextSegmentWidth: inputSegment.nextSegmentWidth,
      ...(inputSegment.nextSegmentDecimalOffset !== undefined
        ? { nextSegmentDecimalOffset: inputSegment.nextSegmentDecimalOffset }
        : {}),
      tabStops: input.node.style.tabStops,
    });

    appendAdvance({
      ...inputSegment,
      width: advanceWidth,
    });
  };
  const appendSegment = (inputSegment: {
    readonly run: (typeof runs)[number];
    readonly text: string;
    readonly fontId: PdfFontResource["id"];
    readonly fontSize: number;
    readonly lineFontSize: number;
    readonly fontRequest?: FontRequest;
    readonly charSpacing?: number;
    readonly textRise?: number;
  }): void => {
    if (inputSegment.text.length === 0) {
      return;
    }

    const pushTextSegment = (inputPush: {
      readonly text: string;
      readonly width: number;
    }): void => {
      if (inputPush.text.length === 0 && inputPush.width <= 0) {
        return;
      }

      const segmentFontId = fontIdForText(
        inputPush.text,
        inputSegment.fontId,
        inputSegment.fontRequest,
      );
      const textEncoding = pdfTextSegmentEncoding({
        text: inputPush.text,
        fontId: segmentFontId,
        fontResourcesById: input.fontResourcesById,
      });
      lines[lines.length - 1]?.push({
        run: inputSegment.run,
        text: inputPush.text,
        fontId: segmentFontId,
        ...(textEncoding ? { textEncoding } : {}),
        fontSize: inputSegment.fontSize,
        lineFontSize: inputSegment.lineFontSize,
        ...(inputSegment.charSpacing !== undefined
          ? { charSpacing: inputSegment.charSpacing }
          : {}),
        ...(inputSegment.textRise !== undefined ? { textRise: inputSegment.textRise } : {}),
        width: inputPush.width,
      });
    };

    const appendBreakableWord = (word: string): void => {
      let chunk = "";
      let chunkWidth = 0;
      const flushChunk = (): void => {
        pushTextSegment({ text: chunk, width: chunkWidth });
        chunk = "";
        chunkWidth = 0;
      };

      Array.from(word).forEach((character) => {
        let characterWidth =
          estimatedPdfTextWidthPt(
            character,
            inputSegment.fontSize,
            input.fontResourcesById.get(
              fontIdForText(character, inputSegment.fontId, inputSegment.fontRequest),
            ),
          ) + (chunk.length > 0 ? (inputSegment.charSpacing ?? 0) : 0);
        const targetLineIndex = Math.max(0, lines.length - 1);
        const targetLine = lines[targetLineIndex] ?? [];
        const targetLineBox = lineTextBox(targetLineIndex);
        const occupiedWidth = lineWidth(targetLine) + chunkWidth;
        if (
          targetLineBox.width > 0 &&
          occupiedWidth > 0 &&
          occupiedWidth + characterWidth > targetLineBox.width
        ) {
          flushChunk();
          lines.push([]);
          characterWidth = estimatedPdfTextWidthPt(
            character,
            inputSegment.fontSize,
            input.fontResourcesById.get(
              fontIdForText(character, inputSegment.fontId, inputSegment.fontRequest),
            ),
          );
        }

        chunk += character;
        chunkWidth += characterWidth;
      });

      flushChunk();
    };

    const width = textWidth(
      inputSegment.text,
      inputSegment.fontSize,
      inputSegment.charSpacing,
      inputSegment.fontId,
      inputSegment.fontRequest,
    );
    const currentLineIndex = Math.max(0, lines.length - 1);
    const currentLine = lines[currentLineIndex] ?? [];
    const currentLineBox = lineTextBox(currentLineIndex);
    if (
      input.node.style.wrap === false ||
      currentLineBox.width <= 0 ||
      lineWidth(currentLine) + width <= currentLineBox.width
    ) {
      const segmentFontId = fontIdForText(
        inputSegment.text,
        inputSegment.fontId,
        inputSegment.fontRequest,
      );
      const textEncoding = pdfTextSegmentEncoding({
        text: inputSegment.text,
        fontId: segmentFontId,
        fontResourcesById: input.fontResourcesById,
      });
      currentLine.push({
        ...inputSegment,
        fontId: segmentFontId,
        ...(textEncoding ? { textEncoding } : {}),
        width,
      });
      return;
    }

    const tokens = inputSegment.text.match(/\s+|\S+/gu);
    if (!tokens || tokens.length === 0) {
      return;
    }

    let pendingSpaceWidth = 0;
    tokens.forEach((word) => {
      if (/^\s+$/u.test(word)) {
        pendingSpaceWidth += textWidth(
          word,
          inputSegment.fontSize,
          inputSegment.charSpacing,
          inputSegment.fontId,
          inputSegment.fontRequest,
        );
        return;
      }

      const wordWidth = textWidth(
        word,
        inputSegment.fontSize,
        inputSegment.charSpacing,
        inputSegment.fontId,
        inputSegment.fontRequest,
      );
      const targetLineIndex = Math.max(0, lines.length - 1);
      const targetLine = lines[targetLineIndex] ?? [];
      const targetLineBox = lineTextBox(targetLineIndex);
      const spaceWidth =
        lineWidth(targetLine) > 0 && pendingSpaceWidth > 0
          ? pendingSpaceWidth + 2 * (inputSegment.charSpacing ?? 0)
          : 0;
      if (input.node.style.breakWords && wordWidth > targetLineBox.width) {
        if (lineWidth(targetLine) > 0) {
          lines.push([]);
        }
        pendingSpaceWidth = 0;
        appendBreakableWord(word);
        return;
      }

      if (
        lineWidth(targetLine) > 0 &&
        lineWidth(targetLine) + spaceWidth + wordWidth > targetLineBox.width
      ) {
        lines.push([]);
      } else if (spaceWidth > 0) {
        pushTextSegment({ text: "", width: spaceWidth });
      }
      pendingSpaceWidth = 0;

      pushTextSegment({ text: word, width: wordWidth });
    });
  };

  runs.forEach((run, runIndex) => {
    const runMetrics = pdfTextMetricsForRun({ node: input.node, run, textFitScale });
    const fallbackFontId =
      input.fontId === DEFAULT_FONT_RESOURCE_ID
        ? defaultStandardFontResourceIdForTextStyle({
            nodeStyle: input.node.style,
            runStyle: run.style,
          })
        : input.fontId;
    const runFontRequest = fontRequestForRunText(run, run.text);
    const fontId = fontIdForRunText(run, run.text, fallbackFontId);
    run.text.split("\n").forEach((text, segmentIndex) => {
      if (segmentIndex > 0) {
        lines.push([]);
      }

      text.split("\t").forEach((part, partIndex) => {
        const partFontRequest = runFontRequest ? { ...runFontRequest, text: part } : undefined;
        const partWidth = textWidth(
          part,
          runMetrics.fontSize,
          runMetrics.charSpacing,
          fontId,
          partFontRequest,
        );
        const segment = {
          run,
          fontId,
          ...(partFontRequest ? { fontRequest: partFontRequest } : {}),
          fontSize: runMetrics.fontSize,
          lineFontSize: runMetrics.lineFontSize,
          ...(runMetrics.charSpacing !== undefined ? { charSpacing: runMetrics.charSpacing } : {}),
          ...(runMetrics.textRise !== undefined ? { textRise: runMetrics.textRise } : {}),
        };
        if (partIndex > 0) {
          const alignmentSegment = pdfTabAlignmentSegmentAfterRun({
            node: input.node,
            runs,
            runIndex,
            currentRun: run,
            currentPart: part,
            currentMetrics: runMetrics,
            textFitScale,
          });
          const alignmentFontRequest = alignmentSegment
            ? fontRequestForRunText(alignmentSegment.run, alignmentSegment.text)
            : undefined;
          const alignmentFontId = alignmentSegment
            ? fontIdForRunText(alignmentSegment.run, alignmentSegment.text, fontId)
            : fontId;
          const nextSegmentWidth = alignmentSegment
            ? textWidth(
                alignmentSegment.text,
                alignmentSegment.fontSize,
                alignmentSegment.charSpacing,
                alignmentFontId,
                alignmentFontRequest,
              )
            : partWidth;
          const decimalOffset = alignmentSegment
            ? pdfDecimalTabAlignmentOffsetPt({
                text: alignmentSegment.text,
                fontSize: alignmentSegment.fontSize,
                charSpacing: alignmentSegment.charSpacing,
                font: input.fontResourcesById.get(
                  fontIdForText(alignmentSegment.text, alignmentFontId, alignmentFontRequest),
                ),
              })
            : undefined;
          appendTabAdvance({
            ...segment,
            nextSegmentWidth,
            ...(decimalOffset !== undefined ? { nextSegmentDecimalOffset: decimalOffset } : {}),
          });
        }

        const partResourceFontId = partFontRequest
          ? input.resourceIdsByRequestKey.get(fontRequestKey(partFontRequest))
          : undefined;
        const shapingBaseFontId = partResourceFontId ?? fontId;
        const shapingFontRequest = partFontRequest ?? fontRequestForRunText(run, part);
        const unicodeFontId =
          input.unicodeResourceIdsByFontId.get(shapingBaseFontId) ??
          [...input.fontResourcesById.values()].find(
            (candidate) =>
              candidate.encoding === "identity-h" &&
              ((candidate.sourceKey !== undefined &&
                candidate.sourceKey ===
                  input.fontResourcesById.get(shapingBaseFontId)?.sourceKey) ||
                (shapingFontRequest !== undefined &&
                  normalizedFontFamily(candidate.family) === shapingFontRequest.family &&
                  candidate.weight === shapingFontRequest.weight &&
                  candidate.style === shapingFontRequest.style)),
          )?.id;
        const unicodeFont = unicodeFontId ? input.fontResourcesById.get(unicodeFontId) : undefined;
        const shapedEmbeddedPart = unicodeFont?.data
          ? shapedGlyphRunForPdf(unicodeFont.data, part, {
              direction: input.node.style.rtlMode ? "rtl" : undefined,
              includeUnmodifiedGlyphs: true,
            }).value?.glyphs
          : undefined;
        const chunks = shapedEmbeddedPart
          ? [part]
          : pdfTextFontChunks({
              text: part,
              ...(partFontRequest ? { fontRequest: partFontRequest } : {}),
              resourceIdsByRequestKey: input.resourceIdsByRequestKey,
            });
        chunks.forEach((chunk) => {
          appendSegment({
            ...(shapedEmbeddedPart && unicodeFontId
              ? {
                  run,
                  fontId: unicodeFontId,
                  fontSize: runMetrics.fontSize,
                  lineFontSize: runMetrics.lineFontSize,
                  ...(runMetrics.charSpacing !== undefined
                    ? { charSpacing: runMetrics.charSpacing }
                    : {}),
                  ...(runMetrics.textRise !== undefined ? { textRise: runMetrics.textRise } : {}),
                }
              : segment),
            text: chunk,
          });
        });
      });
    });
  });

  const lineHeights = lines.map((line) =>
    Math.max(...line.map((segment) => segment.lineFontSize), input.node.style.fontSizePt ?? 12),
  );
  const lineAdvances = lineHeights.map(
    (lineHeight) =>
      input.node.style.lineSpacing ??
      lineHeight * (input.node.style.lineSpacingMultiple ?? DEFAULT_NORMAL_LINE_HEIGHT_MULTIPLE),
  );
  const textContentHeight =
    lines.length === 0
      ? 0
      : lineAdvances.slice(0, -1).reduce((total, advance) => total + advance, 0) +
        (lineHeights.at(-1) ?? 0);
  const contentHeight = paragraphSpacingBefore + textContentHeight + paragraphSpacingAfter;
  if (input.node.style.fit === "resize" && contentHeight > textBox.height) {
    textBox = {
      ...textBox,
      height: contentHeight,
    };
  }
  const alignedStartY = (() => {
    switch (input.node.style.verticalAlign) {
      case "middle":
        return textBox.y + Math.max(0, textBox.height - contentHeight) / 2;
      case "bottom":
        return textBox.y + Math.max(0, textBox.height - contentHeight);
      case "top":
      case undefined:
        return textBox.y;
    }
  })();
  let paintOffset = 0;
  const textRotation = pdfTextRotationFromLayoutText(input.node);
  const hasTextTransform =
    textRotation !== undefined || input.node.flipH === true || input.node.flipV === true;

  return lines.flatMap((line, lineIndex) => {
    const currentLineBox = lineTextBox(lineIndex);
    const textWidth = line.reduce((total, metric) => total + metric.width, 0);
    const visualLine =
      input.node.style.textAlign === "justify"
        ? justifiedPdfTextLineSegments({
            line,
            lineWidth: textWidth,
            availableWidth: currentLineBox.width,
            fontResourcesById: input.fontResourcesById,
          })
        : line;
    const alignedStartX = (() => {
      switch (input.node.style.textAlign) {
        case "center":
          return currentLineBox.x + Math.max(0, currentLineBox.width - textWidth) / 2;
        case "right":
          return currentLineBox.x + Math.max(0, currentLineBox.width - textWidth);
        case "justify":
        case "left":
        case undefined:
          return currentLineBox.x;
      }
    })();
    const lineY =
      alignedStartY +
      paragraphSpacingBefore +
      lineAdvances.slice(0, lineIndex).reduce((total, advance) => total + advance, 0);
    let xOffset = 0;
    const markerFontSize = input.node.style.fontSizePt ?? line[0]?.fontSize ?? 12;
    const markerFontId =
      input.fontId === DEFAULT_FONT_RESOURCE_ID
        ? defaultStandardFontResourceIdForTextStyle({ nodeStyle: input.node.style })
        : input.fontId;
    const markerColorValue = input.node.style.color;
    const markerColor = rgbColorFromStyle(markerColorValue);
    const adjustedMarkerColor = pdfAdjustedTextColorFromFilters(
      input.node,
      markerColor ?? DEFAULT_PDF_TEXT_COLOR,
    );
    const markerPaintOffset = paintOffset;
    const markerVisual: PdfVisualElement | undefined =
      lineIndex === 0 && listMarker
        ? {
            kind: "text",
            text: listMarker,
            box: {
              ...box,
              y: lineY,
              width: listIndent,
            },
            ...(textClipBox ? { clipBox: textClipBox } : {}),
            fontId: markerFontId,
            style: {
              fontSize: markerFontSize,
              ...(markerColor || adjustedMarkerColor
                ? { color: adjustedMarkerColor ?? markerColor }
                : {}),
              ...(input.node.style.textDirection !== undefined
                ? { textDirection: input.node.style.textDirection }
                : {}),
              ...(input.node.style.fit !== undefined ? { fit: input.node.style.fit } : {}),
              ...(input.node.style.wrap !== undefined ? { wrap: input.node.style.wrap } : {}),
            },
            ...(textRotation !== undefined ? { rotation: textRotation } : {}),
            ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
            ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
            ...(pdfOpacityForTextPaint(input.node, input.node.style.colorTransparency) !== undefined
              ? { opacity: pdfOpacityForTextPaint(input.node, input.node.style.colorTransparency) }
              : {}),
            ...(blendMode ? { blendMode } : {}),
            paintOrder: {
              zIndex: input.node.zIndex,
              siblingOrder: input.node.siblingOrder + markerPaintOffset / 1000,
              generatedLayerRole: "authored",
            },
          }
        : undefined;
    if (markerVisual) {
      paintOffset += 1;
    }

    const textVisuals = visualLine.flatMap(
      ({ run, text, fontId, textEncoding, fontSize, charSpacing, textRise, width }) => {
        if (text.length === 0) {
          xOffset += width;
          return [];
        }

        const segmentPaintOffset = paintOffset;
        paintOffset += 1;

        const colorValue = run.style?.color ?? input.node.style.color;
        const color = rgbColorFromStyle(colorValue);
        const adjustedColor = pdfAdjustedTextColorFromFilters(
          input.node,
          color ?? DEFAULT_PDF_TEXT_COLOR,
        );
        const colorTransparency =
          run.style?.color !== undefined
            ? run.style.colorTransparency
            : input.node.style.colorTransparency;
        const segmentX = alignedStartX + xOffset;
        const segmentBox = {
          ...currentLineBox,
          x: segmentX,
          y: lineY,
          width: Math.max(0, currentLineBox.width - xOffset),
        };
        const hyperlinkBox = {
          ...segmentBox,
          width,
        };
        const font = input.fontResourcesById.get(fontId);
        const shapedGlyphResult =
          textEncoding === "utf16be" && font?.data
            ? shapedGlyphRunForPdf(font.data, text, {
                direction: input.node.style.rtlMode ? "rtl" : undefined,
                includeUnmodifiedGlyphs: true,
              })
            : {};
        const shapedGlyphs = shapedGlyphResult.value?.glyphs;
        const actualText = shapedGlyphResult.value?.actualText;
        const kerningAdjustments = shapedGlyphs ? undefined : pdfKerningAdjustments(text, font);
        const visual: PdfVisualElement = {
          kind: "text",
          text,
          ...(textEncoding ? { textEncoding } : {}),
          ...(actualText ? { actualText } : {}),
          ...(shapedGlyphs ? { glyphs: shapedGlyphs } : {}),
          ...(shapedGlyphResult.diagnostic
            ? { shapingDiagnostic: shapedGlyphResult.diagnostic }
            : {}),
          box: segmentBox,
          ...(textClipBox ? { clipBox: textClipBox } : {}),
          ...(run.hyperlink ? { hyperlink: run.hyperlink, hyperlinkBox } : {}),
          fontId,
          ...(kerningAdjustments ? { kerningAdjustments } : {}),
          style: {
            ...(input.node.style.fontFamily ? { fontFamily: input.node.style.fontFamily } : {}),
            fontSize,
            ...(charSpacing !== undefined ? { charSpacing } : {}),
            ...(textRise !== undefined ? { textRise } : {}),
            ...(color || adjustedColor ? { color: adjustedColor ?? color } : {}),
            ...(input.node.style.textDirection !== undefined
              ? { textDirection: input.node.style.textDirection }
              : {}),
            ...(input.node.style.fit !== undefined ? { fit: input.node.style.fit } : {}),
            ...(input.node.style.wrap !== undefined ? { wrap: input.node.style.wrap } : {}),
          },
          ...(textRotation !== undefined ? { rotation: textRotation } : {}),
          ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
          ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
          ...(pdfOpacityForTextPaint(input.node, colorTransparency) !== undefined
            ? { opacity: pdfOpacityForTextPaint(input.node, colorTransparency) }
            : {}),
          ...(blendMode ? { blendMode } : {}),
          paintOrder: {
            zIndex: input.node.zIndex,
            siblingOrder: input.node.siblingOrder + segmentPaintOffset / 1000,
            generatedLayerRole: "authored",
          },
        };
        const decorationColorValue =
          run.style?.underlineColor ?? input.node.style.underlineColor ?? colorValue;
        const baseDecorationColor = rgbColorFromStyle(decorationColorValue) ?? color;
        const decorationColor = baseDecorationColor
          ? (pdfAdjustedTextColorFromFilters(input.node, baseDecorationColor) ??
            baseDecorationColor)
          : undefined;
        const decorationTransparency =
          run.style?.underlineColor !== undefined
            ? run.style.underlineTransparency
            : input.node.style.underlineColor !== undefined
              ? input.node.style.underlineTransparency
              : colorTransparency;
        const decorationOpacity = pdfOpacityForTextPaint(input.node, decorationTransparency);
        const underline =
          run.style?.underline !== undefined ? run.style.underline : input.node.style.underline;
        const underlineStyle = run.style?.underlineStyle ?? input.node.style.underlineStyle;
        const strike = run.style?.strike !== undefined ? run.style.strike : input.node.style.strike;
        const lineWidth = Math.max(0.5, fontSize / 16);
        const decorationLine = (
          y: number,
          orderOffset: number,
          options: { readonly dash?: "dash" | "sysDot" } = {},
        ): PdfVisualElement | undefined =>
          decorationColor
            ? {
                kind: "line" as const,
                from: { x: segmentX, y },
                to: { x: segmentX + width, y },
                ...(textClipBox ? { clipBox: textClipBox } : {}),
                ...(textRotation !== undefined ? { rotation: textRotation } : {}),
                ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
                ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
                ...(hasTextTransform ? { rotationBox: segmentBox } : {}),
                stroke: {
                  color: decorationColor,
                  width: lineWidth,
                  ...(options.dash ? { dash: options.dash } : {}),
                },
                ...(decorationOpacity !== undefined ? { opacity: decorationOpacity } : {}),
                ...(blendMode ? { blendMode } : {}),
                paintOrder: {
                  zIndex: input.node.zIndex,
                  siblingOrder: input.node.siblingOrder + segmentPaintOffset / 1000 + orderOffset,
                  generatedLayerRole: "authored",
                },
              }
            : undefined;
        const wavyDecorationLines = (
          y: number,
          orderOffset: number,
        ): readonly PdfVisualElement[] => {
          if (!decorationColor || width <= 0) {
            return [];
          }

          const step = Math.max(4, lineWidth * 3);
          const amplitude = lineWidth;
          const points: PdfPoint[] = [{ x: segmentX, y }];
          let nextX = segmentX + step;
          let direction = -1;
          while (nextX < segmentX + width) {
            points.push({ x: nextX, y: y + amplitude * direction });
            nextX += step;
            direction *= -1;
          }
          points.push({ x: segmentX + width, y: y + amplitude * direction });

          return points.slice(0, -1).map((point, index): PdfVisualElement => {
            const next = points[index + 1] ?? point;
            return {
              kind: "line",
              from: point,
              to: next,
              ...(textClipBox ? { clipBox: textClipBox } : {}),
              ...(textRotation !== undefined ? { rotation: textRotation } : {}),
              ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
              ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
              ...(hasTextTransform ? { rotationBox: segmentBox } : {}),
              stroke: {
                color: decorationColor,
                width: lineWidth,
              },
              ...(decorationOpacity !== undefined ? { opacity: decorationOpacity } : {}),
              ...(blendMode ? { blendMode } : {}),
              paintOrder: {
                zIndex: input.node.zIndex,
                siblingOrder: input.node.siblingOrder + segmentPaintOffset / 1000 + orderOffset,
                generatedLayerRole: "authored",
              },
            };
          });
        };
        const underlineVisuals = (() => {
          if (!underline) {
            return [];
          }

          const underlineY = lineY + fontSize * 1.1;
          if (underlineStyle === "wavy") {
            return wavyDecorationLines(underlineY, 0.0005);
          }

          if (underlineStyle === "dbl") {
            return [
              decorationLine(underlineY - lineWidth, 0.0005),
              decorationLine(underlineY + lineWidth, 0.00055),
            ];
          }

          return [
            decorationLine(
              underlineY,
              0.0005,
              pdfDecorationStrokeDash(underlineStyle)
                ? { dash: pdfDecorationStrokeDash(underlineStyle) }
                : {},
            ),
          ];
        })();
        const decorationVisuals = [
          ...underlineVisuals,
          strike ? decorationLine(lineY + fontSize * 0.55, 0.0006) : undefined,
        ].filter((decoration): decoration is PdfVisualElement => decoration !== undefined);
        xOffset += width;
        return [visual, ...decorationVisuals];
      },
    );

    return markerVisual ? [markerVisual, ...textVisuals] : textVisuals;
  });
}

function shadowTextVisualsFromLayoutText(
  node: ProjectedLayoutText,
  textVisuals: readonly PdfVisualElement[],
): readonly PdfVisualElement[] {
  const shadow = node.shadow;
  if (!shadow || shadow.type !== "outer") {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const offset = shadowOffset(shadow);
  return textVisuals.flatMap((visual): readonly PdfVisualElement[] => {
    if (visual.kind !== "text") {
      return [];
    }

    return shadowTextVisualLayers({ node, visual, shadow, color, offset });
  });
}

function shadowTextVisualLayers(input: {
  readonly node: ProjectedLayoutText;
  readonly visual: Extract<PdfVisualElement, { readonly kind: "text" }>;
  readonly shadow: ShadowIR;
  readonly color: PdfRgbColor;
  readonly offset: PdfPoint;
}): readonly PdfVisualElement[] {
  if (input.shadow.blurPt <= 0) {
    return [
      {
        ...input.visual,
        box: {
          ...input.visual.box,
          x: input.visual.box.x + input.offset.x,
          y: input.visual.box.y + input.offset.y,
        },
        style: {
          ...input.visual.style,
          color: input.color,
        },
        opacity: combinePdfOpacity(pdfOpacityForLayoutNode(input.node), input.shadow.opacity),
        paintOrder: {
          ...input.visual.paintOrder,
          generatedLayerRole: "shadow",
        },
      },
    ];
  }

  const layerCount = 4;
  const weightTotal = (layerCount * (layerCount + 1)) / 2;
  const directions: readonly PdfPoint[] = [
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];

  return Array.from({ length: layerCount }, (_, index): PdfVisualElement => {
    const radius = input.shadow.blurPt * ((layerCount - index - 1) / (layerCount - 1));
    const direction = directions[index]!;
    const opacity = input.shadow.opacity * ((index + 1) / weightTotal);

    return {
      ...input.visual,
      box: {
        ...input.visual.box,
        x: input.visual.box.x + input.offset.x + direction.x * radius,
        y: input.visual.box.y + input.offset.y + direction.y * radius,
      },
      style: {
        ...input.visual.style,
        color: input.color,
      },
      opacity: combinePdfOpacity(pdfOpacityForLayoutNode(input.node), opacity),
      paintOrder: {
        ...input.visual.paintOrder,
        siblingOrder: input.visual.paintOrder.siblingOrder - (layerCount - index) / 10_000,
        generatedLayerRole: "shadow",
      },
    };
  });
}

function dropShadowFromFilterForLayoutText(node: ProjectedLayoutText): ShadowIR | undefined {
  for (const semantic of node.unsupportedSemantics ?? []) {
    if (
      semantic.feature !== "filter" ||
      semantic.property !== "filter" ||
      !pdfDropShadowFilterIsDirectlyProjected(node, semantic.value)
    ) {
      continue;
    }

    return pdfDropShadowFromCssFilter(semantic.value);
  }

  return undefined;
}

function dropShadowTextVisualsFromLayoutText(
  node: ProjectedLayoutText,
  textVisuals: readonly PdfVisualElement[],
): readonly PdfVisualElement[] {
  const shadow = dropShadowFromFilterForLayoutText(node);
  if (!shadow) {
    return [];
  }

  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const offset = shadowOffset(shadow);
  return textVisuals.flatMap((visual): readonly PdfVisualElement[] => {
    if (visual.kind !== "text") {
      return [];
    }

    return shadowTextVisualLayers({ node, visual, shadow, color, offset });
  });
}

function pdfTextShadowShouldUseBox(node: ProjectedLayoutText): boolean {
  return (
    node.fill !== undefined ||
    (node.backgroundLayers?.length ?? 0) > 0 ||
    node.stroke !== undefined ||
    node.edgeStrokes !== undefined ||
    node.outline !== undefined
  );
}

function textBoxShadowVisualsFromShadow(input: {
  readonly node: ProjectedLayoutText;
  readonly box: PdfRectangle;
  readonly shadow: ShadowIR;
}): readonly PdfVisualElement[] {
  const { node, box, shadow } = input;
  const color = rgbColorFromStyle(shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  const rotationBox = node.rotation !== undefined || node.flipH || node.flipV ? box : undefined;
  const opacity = pdfOpacityForLayoutNode(node);
  const blendMode = pdfBlendModeFromNode(node);
  if (shadow.blurPt > 0) {
    return blurredShadowVisualLayers({
      shadow,
      shape: radius !== undefined ? "roundRect" : "rect",
      baseBox: shadowBoxFromBox(box, shadow),
      color,
      ...(radius !== undefined ? { radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder - 0.0001,
    });
  }

  return [
    {
      kind: "shape",
      shape: radius !== undefined ? "roundRect" : "rect",
      box: shadowBoxFromBox(box, shadow),
      ...(radius !== undefined ? { radius: Math.max(0, radius + (shadow.spreadPt ?? 0)) } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder - 0.0001,
        generatedLayerRole: "shadow",
      },
    },
  ];
}

function dropShadowBoxVisualsFromLayoutText(
  node: ProjectedLayoutText,
  box: PdfRectangle,
): readonly PdfVisualElement[] {
  if (!pdfTextShadowShouldUseBox(node)) {
    return [];
  }

  const shadow = dropShadowFromFilterForLayoutText(node);
  return shadow ? textBoxShadowVisualsFromShadow({ node, box, shadow }) : [];
}

function boxShadowVisualsFromLayoutText(
  node: ProjectedLayoutText,
  box: PdfRectangle,
): readonly PdfVisualElement[] {
  if (!pdfTextShadowShouldUseBox(node) || node.shadow?.type !== "outer") {
    return [];
  }

  return textBoxShadowVisualsFromShadow({ node, box, shadow: node.shadow });
}

function innerShadowVisualsFromLayoutText(
  node: ProjectedLayoutText,
  box: PdfRectangle,
): readonly PdfVisualElement[] {
  if (!pdfTextShadowShouldUseBox(node) || node.shadow?.type !== "inner") {
    return [];
  }

  const color = rgbColorFromStyle(node.shadow.color);
  if (!color) {
    return [];
  }

  const radius = pdfRoundRectRadiusFromLayoutRadius({ radiusEmu: node.radiusEmu });
  const rotationBox = node.rotation !== undefined || node.flipH || node.flipV ? box : undefined;
  const opacity = pdfOpacityForLayoutNode(node);
  const blendMode = pdfBlendModeFromNode(node);
  if (node.shadow.blurPt > 0) {
    return blurredInnerShadowVisualLayers({
      shadow: node.shadow,
      frameBox: box,
      color,
      ...(radius !== undefined ? { radius } : {}),
      clipBox: box,
      ...(radius !== undefined ? { clipRadius: radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      zIndex: node.zIndex,
      siblingOrder: node.siblingOrder,
    });
  }

  const shadowBox = innerShadowBoxFromBox(box, node.shadow);
  if (!shadowBox) {
    return [];
  }

  return [
    {
      kind: "shape",
      shape: "rect",
      box: shadowBox,
      clipBox: box,
      ...(radius !== undefined ? { clipRadius: radius } : {}),
      ...(node.rotation !== undefined ? { rotation: node.rotation } : {}),
      ...(rotationBox ? { rotationBox } : {}),
      ...(node.flipH ? { flipH: node.flipH } : {}),
      ...(node.flipV ? { flipV: node.flipV } : {}),
      fill: {
        color,
        opacity: node.shadow.opacity,
      },
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blendMode ? { blendMode } : {}),
      paintOrder: {
        zIndex: node.zIndex,
        siblingOrder: node.siblingOrder + 0.0002,
        generatedLayerRole: "shadow",
        generatedLayerPlacement: "aboveBackground",
      },
    },
  ];
}

function resizedTextFrameBox(
  node: ProjectedLayoutText,
  textVisuals: readonly PdfVisualElement[],
): PdfRectangle {
  const frameBox = boxFromFrame(node.frame);
  if (node.style.fit !== "resize") {
    return frameBox;
  }

  const paddingTop = node.style.paddingPt?.[0] ?? 0;
  const paddingBottom = node.style.paddingPt?.[2] ?? 0;
  const textBoxHeight = textVisuals.reduce(
    (height, visual) => {
      if (visual.kind !== "text") {
        return height;
      }

      return Math.max(height, visual.box.height);
    },
    Math.max(0, frameBox.height - paddingTop - paddingBottom),
  );

  return {
    ...frameBox,
    height: Math.max(frameBox.height, paddingTop + textBoxHeight + paddingBottom),
  };
}

function backgroundLayersWithFrame(
  layers: readonly BackgroundLayerIR[] | undefined,
  box: PdfRectangle,
): readonly BackgroundLayerIR[] | undefined {
  if (!layers || layers.length === 0) {
    return layers;
  }

  const frame = frameFromBox(box);
  return layers.map((layer) => ({
    ...layer,
    frame,
  }));
}

function pdfVisualWithInheritedOpacity(
  visual: PdfVisualElement,
  inheritedOpacity: number | undefined,
): PdfVisualElement {
  const opacity = combinePdfOpacity(inheritedOpacity, visual.opacity);
  if (opacity === visual.opacity) {
    return visual;
  }

  return {
    ...visual,
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

function pdfVisualsWithInheritedOpacity(
  visuals: readonly PdfVisualElement[],
  inheritedOpacity: number | undefined,
): readonly PdfVisualElement[] {
  if (inheritedOpacity === undefined) {
    return visuals;
  }

  return visuals.map((visual) => pdfVisualWithInheritedOpacity(visual, inheritedOpacity));
}

function pdfVisualWithInheritedBlendMode(
  visual: PdfVisualElement,
  inheritedBlendMode: PdfBlendMode | undefined,
): PdfVisualElement {
  if (inheritedBlendMode === undefined || visual.blendMode !== undefined) {
    return visual;
  }

  return {
    ...visual,
    blendMode: inheritedBlendMode,
  };
}

function pdfVisualsWithInheritedBlendMode(
  visuals: readonly PdfVisualElement[],
  inheritedBlendMode: PdfBlendMode | undefined,
): readonly PdfVisualElement[] {
  if (inheritedBlendMode === undefined) {
    return visuals;
  }

  return visuals.map((visual) => pdfVisualWithInheritedBlendMode(visual, inheritedBlendMode));
}

function pdfVisualWithInheritedTransform(
  visual: PdfVisualElement,
  input: {
    readonly rotation?: number;
    readonly flipH?: boolean;
    readonly flipV?: boolean;
    readonly rotationBox?: PdfRectangle;
  },
): PdfVisualElement {
  if (input.rotation === undefined && !input.flipH && !input.flipV) {
    return visual;
  }

  const transformed = {
    ...visual,
    ...(input.rotation !== undefined && visual.rotation === undefined
      ? { rotation: input.rotation }
      : {}),
    ...(input.flipH && !visual.flipH ? { flipH: true } : {}),
    ...(input.flipV && !visual.flipV ? { flipV: true } : {}),
  };

  if (transformed.rotationBox !== undefined) {
    return transformed;
  }

  return {
    ...transformed,
    ...(input.rotationBox ? { rotationBox: input.rotationBox } : {}),
  };
}

function pdfVisualsWithInheritedTransform(
  visuals: readonly PdfVisualElement[],
  input: {
    readonly rotation?: number;
    readonly flipH?: boolean;
    readonly flipV?: boolean;
    readonly rotationBox?: PdfRectangle;
  },
): readonly PdfVisualElement[] {
  if (input.rotation === undefined && !input.flipH && !input.flipV) {
    return visuals;
  }

  return visuals.map((visual) => pdfVisualWithInheritedTransform(visual, input));
}

function pdfOriginFromLayoutOrigin(
  origin: ProjectedLayoutNode["origin"] | undefined,
): PdfElementOrigin | undefined {
  if (!origin) {
    return undefined;
  }

  const mapped: PdfElementOrigin = {
    ...(origin.graphNodeIds ? { graphNodeIds: origin.graphNodeIds } : {}),
    ...(origin.styleEntityIds ? { styleEntityIds: origin.styleEntityIds } : {}),
    ...(origin.assetEntityIds ? { assetEntityIds: origin.assetEntityIds } : {}),
    ...(origin.source ? { source: origin.source } : {}),
    ...(origin.componentProvenance ? { componentProvenance: origin.componentProvenance } : {}),
  };
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function pdfVisualsWithLayoutOrigin(
  visuals: readonly PdfVisualElement[],
  origin: ProjectedLayoutNode["origin"] | undefined,
): readonly PdfVisualElement[] {
  const pdfOrigin = pdfOriginFromLayoutOrigin(origin);
  if (!pdfOrigin) {
    return visuals;
  }

  return visuals.map((visual) =>
    visual.origin === undefined
      ? {
          ...visual,
          origin: pdfOrigin,
        }
      : visual,
  );
}

function visualElementsFromLayoutNode(input: {
  readonly filterLengthContext?: PdfCssFilterLengthContext;
  readonly node: ProjectedLayoutNode;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly unicodeResourceIdsByFontId: ReadonlyMap<PdfFontResource["id"], PdfFontResource["id"]>;
  readonly fontResourcesById: ReadonlyMap<PdfFontResource["id"], PdfFontResource>;
  readonly assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
  readonly hidden?: boolean;
  readonly inheritedOpacity?: number;
}): readonly PdfVisualElement[] {
  if (input.hidden || input.node.visibility === "hidden") {
    return [];
  }

  if (input.node.kind === "group") {
    if (pdfEmptyGroupHasZeroArea(input.node)) {
      return [];
    }

    const childOpacity = combinePdfOpacity(
      input.inheritedOpacity,
      pdfOpacityForLayoutNode(input.node),
    );
    const childBlendMode = pdfBlendModeFromNode(input.node);
    const dropShadowVisuals = dropShadowVisualsFromLayoutGroup(input.node);
    const shadowVisuals = shadowVisualsFromLayoutGroup(input.node);
    const innerShadowVisuals = innerShadowVisualsFromLayoutGroup(input.node);
    const filterVisuals = blurredFilterVisualsFromSolidNode(input.node, input.filterLengthContext);
    const backgroundVisual = backgroundVisualFromLayoutGroup({
      node: input.node,
      gradientResourcesById: input.gradientResourcesById,
    });
    const groupBackgroundClipRadius = pdfRoundRectRadiusFromLayoutRadius({
      radiusEmu: input.node.radiusEmu,
    });
    const groupBackgroundImageColorFilter = pdfColorFilterFromBackgroundImageNode(input.node);
    const backgroundImageVisuals = imageVisualsFromBackgroundLayers({
      layers: backgroundImageLayers(input.node.backgroundLayers),
      scopeId: input.node.id,
      ...(groupBackgroundImageColorFilter
        ? { pdfColorFilter: groupBackgroundImageColorFilter }
        : {}),
      imageResourcesById: input.imageResourcesById,
      opacity: pdfOpacityForLayoutNode(input.node),
      ...(pdfBlendModeFromNode(input.node) ? { blendMode: pdfBlendModeFromNode(input.node) } : {}),
      ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
      ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
      ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
      ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
        ? { rotationBox: boxFromFrame(input.node.frame) }
        : {}),
      ...(groupBackgroundClipRadius !== undefined ? { clipRadius: groupBackgroundClipRadius } : {}),
      ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
      siblingOrder: input.node.siblingOrder + 0.0001,
    });
    const gradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
      layers: gradientBackgroundLayers(input.node.backgroundLayers),
      scopeId: input.node.id,
      ...(groupBackgroundImageColorFilter
        ? { pdfColorFilter: groupBackgroundImageColorFilter }
        : {}),
      gradientResourcesById: input.gradientResourcesById,
      opacity: pdfOpacityForLayoutNode(input.node),
      ...(pdfBlendModeFromNode(input.node) ? { blendMode: pdfBlendModeFromNode(input.node) } : {}),
      ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
      ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
      ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
      ...(groupBackgroundClipRadius !== undefined ? { radius: groupBackgroundClipRadius } : {}),
      ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
      siblingOrder: input.node.siblingOrder + 0.0001,
    });
    const childVisuals = pdfVisualsWithInheritedBlendMode(
      pdfVisualsWithInheritedTransform(
        input.node.children.flatMap((child) =>
          visualElementsFromLayoutNode({
            node: child,
            requestsByTextNode: input.requestsByTextNode,
            resourceIdsByRequestKey: input.resourceIdsByRequestKey,
            unicodeResourceIdsByFontId: input.unicodeResourceIdsByFontId,
            fontResourcesById: input.fontResourcesById,
            assets: input.assets,
            imageResourcesById: input.imageResourcesById,
            gradientResourcesById: input.gradientResourcesById,
            hidden: false,
            filterLengthContext: input.filterLengthContext,
            inheritedOpacity: childOpacity,
          }),
        ),
        {
          ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
          ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
          ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
          rotationBox: boxFromFrame(input.node.frame),
        },
      ),
      childBlendMode,
    );
    const edgeVisuals = edgeStrokeVisualsFromLayoutGroup(input.node);
    const outlineVisual = outlineVisualFromLayoutGroup(input.node);
    const backgroundVisuals = pdfVisualsWithInheritedOpacity(
      [
        ...dropShadowVisuals,
        ...shadowVisuals,
        ...filterVisuals,
        ...(filterVisuals.length === 0 && backgroundVisual ? [backgroundVisual] : []),
        ...gradientBackgroundVisuals,
        ...backgroundImageVisuals,
        ...innerShadowVisuals,
      ],
      input.inheritedOpacity,
    );
    const foregroundVisuals = pdfVisualsWithInheritedOpacity(
      [...edgeVisuals, ...(outlineVisual ? [outlineVisual] : [])],
      input.inheritedOpacity,
    );

    return [
      ...pdfVisualsWithLayoutOrigin(backgroundVisuals, input.node.origin),
      ...childVisuals,
      ...pdfVisualsWithLayoutOrigin(foregroundVisuals, input.node.origin),
    ];
  }

  if (input.node.kind === "image") {
    const image = pdfImageResourceForLayoutImage({
      node: input.node,
      assets: input.assets,
      imageResourcesById: input.imageResourcesById,
    });
    if (!image) {
      return [];
    }
    const geometry = imageDrawGeometry({ node: input.node, image });
    const dropShadowVisuals = dropShadowVisualsFromLayoutMedia(input.node);
    const shadowVisuals = shadowVisualsFromLayoutMedia(input.node);
    const innerShadowVisuals = innerShadowVisualsFromLayoutMedia(input.node);
    const roundedClipBox =
      input.node.rounding === true ? boxFromFrame(input.node.frame) : undefined;
    const mediaClipBox = roundedClipBox ?? geometry.clipBox;
    const mediaClipRadius =
      roundedClipBox !== undefined
        ? Math.min(roundedClipBox.width, roundedClipBox.height) / 6
        : undefined;

    return pdfVisualsWithLayoutOrigin(
      pdfVisualsWithInheritedOpacity(
        [
          ...dropShadowVisuals,
          ...shadowVisuals,
          {
            kind: "image",
            imageId: image.id,
            box: geometry.box,
            ...(mediaClipBox ? { clipBox: mediaClipBox } : {}),
            ...(mediaClipRadius !== undefined ? { clipRadius: mediaClipRadius } : {}),
            fit: input.node.fit,
            objectPosition: input.node.objectPosition ?? { x: 0.5, y: 0.5 },
            ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
            ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
            ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
            ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
              ? { rotationBox: boxFromFrame(input.node.frame) }
              : {}),
            ...(pdfOpacityForLayoutNode(input.node) !== undefined
              ? { opacity: pdfOpacityForLayoutNode(input.node) }
              : {}),
            ...(pdfBlendModeFromNode(input.node)
              ? { blendMode: pdfBlendModeFromNode(input.node) }
              : {}),
            paintOrder: {
              zIndex: input.node.zIndex,
              siblingOrder: input.node.siblingOrder,
              generatedLayerRole: "authored",
            },
          },
          ...innerShadowVisuals,
        ],
        input.inheritedOpacity,
      ),
      input.node.origin,
    );
  }

  if (input.node.kind === "video") {
    const image = pdfImageResourceForVideoPoster({
      node: input.node,
      assets: input.assets,
      imageResourcesById: input.imageResourcesById,
    });
    if (!image) {
      return [];
    }
    const geometry = imageDrawGeometry({ node: input.node, image });
    const dropShadowVisuals = dropShadowVisualsFromLayoutMedia(input.node);
    const shadowVisuals = shadowVisualsFromLayoutMedia(input.node);
    const innerShadowVisuals = innerShadowVisualsFromLayoutMedia(input.node);
    const roundedClipBox =
      input.node.rounding === true ? boxFromFrame(input.node.frame) : undefined;
    const mediaClipBox = roundedClipBox ?? geometry.clipBox;
    const mediaClipRadius =
      roundedClipBox !== undefined
        ? Math.min(roundedClipBox.width, roundedClipBox.height) / 6
        : undefined;

    return pdfVisualsWithLayoutOrigin(
      pdfVisualsWithInheritedOpacity(
        [
          ...dropShadowVisuals,
          ...shadowVisuals,
          {
            kind: "image",
            imageId: image.id,
            box: geometry.box,
            ...(mediaClipBox ? { clipBox: mediaClipBox } : {}),
            ...(mediaClipRadius !== undefined ? { clipRadius: mediaClipRadius } : {}),
            fit: input.node.fit,
            objectPosition: input.node.objectPosition ?? { x: 0.5, y: 0.5 },
            ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
            ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
            ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
            ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
              ? { rotationBox: boxFromFrame(input.node.frame) }
              : {}),
            ...(pdfOpacityForLayoutNode(input.node) !== undefined
              ? { opacity: pdfOpacityForLayoutNode(input.node) }
              : {}),
            ...(pdfBlendModeFromNode(input.node)
              ? { blendMode: pdfBlendModeFromNode(input.node) }
              : {}),
            paintOrder: {
              zIndex: input.node.zIndex,
              siblingOrder: input.node.siblingOrder,
              generatedLayerRole: "authored",
            },
          },
          ...innerShadowVisuals,
        ],
        input.inheritedOpacity,
      ),
      input.node.origin,
    );
  }

  if (input.node.kind === "shape") {
    if (input.node.shape === "line") {
      const visual = lineVisualFromLayoutLineShape(input.node);
      return visual
        ? pdfVisualsWithLayoutOrigin(
            pdfVisualsWithInheritedOpacity([visual], input.inheritedOpacity),
            input.node.origin,
          )
        : [];
    }
    if (pdfNonLineShapeHasZeroArea(input.node)) {
      return [];
    }

    const visual = shapeVisualFromLayoutShape({
      node: input.node,
      gradientResourcesById: input.gradientResourcesById,
    });
    const dropShadowVisuals = dropShadowVisualsFromLayoutShape(input.node);
    const shadowVisuals = shadowVisualsFromLayoutShape(input.node);
    const innerShadowVisuals = innerShadowVisualsFromLayoutShape(input.node);
    const filterVisuals = blurredFilterVisualsFromSolidNode(input.node, input.filterLengthContext);
    const shapeBackgroundClipRadius =
      input.node.shape === "roundRect" ? pdfRoundRectRadiusFromLayoutShape(input.node) : undefined;
    const shapeBackgroundImageColorFilter = pdfColorFilterFromBackgroundImageNode(input.node);
    const backgroundImageVisuals = imageVisualsFromBackgroundLayers({
      layers: backgroundImageLayers(input.node.backgroundLayers),
      scopeId: input.node.id,
      ...(shapeBackgroundImageColorFilter
        ? { pdfColorFilter: shapeBackgroundImageColorFilter }
        : {}),
      imageResourcesById: input.imageResourcesById,
      opacity: pdfOpacityForLayoutNode(input.node),
      ...(pdfBlendModeFromNode(input.node) ? { blendMode: pdfBlendModeFromNode(input.node) } : {}),
      ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
      ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
      ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
      ...(input.node.rotation !== undefined || input.node.flipH || input.node.flipV
        ? { rotationBox: boxFromFrame(input.node.frame) }
        : {}),
      ...(shapeBackgroundClipRadius !== undefined ? { clipRadius: shapeBackgroundClipRadius } : {}),
      ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
      siblingOrder: input.node.siblingOrder + 0.0001,
    });
    const gradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
      layers: gradientBackgroundLayers(input.node.backgroundLayers),
      scopeId: input.node.id,
      ...(shapeBackgroundImageColorFilter
        ? { pdfColorFilter: shapeBackgroundImageColorFilter }
        : {}),
      gradientResourcesById: input.gradientResourcesById,
      opacity: pdfOpacityForLayoutNode(input.node),
      ...(pdfBlendModeFromNode(input.node) ? { blendMode: pdfBlendModeFromNode(input.node) } : {}),
      ...(input.node.rotation !== undefined ? { rotation: input.node.rotation } : {}),
      ...(input.node.flipH ? { flipH: input.node.flipH } : {}),
      ...(input.node.flipV ? { flipV: input.node.flipV } : {}),
      ...(shapeBackgroundClipRadius !== undefined ? { radius: shapeBackgroundClipRadius } : {}),
      ...(input.node.zIndex !== undefined ? { zIndex: input.node.zIndex } : {}),
      siblingOrder: input.node.siblingOrder + 0.0001,
    });
    const edgeVisuals = edgeStrokeVisualsFromLayoutShape(input.node);
    const outlineVisual = outlineVisualFromLayoutShape(input.node);
    return pdfVisualsWithLayoutOrigin(
      pdfVisualsWithInheritedOpacity(
        [
          ...dropShadowVisuals,
          ...shadowVisuals,
          ...filterVisuals,
          ...gradientBackgroundVisuals,
          ...backgroundImageVisuals,
          ...(filterVisuals.length === 0 && visual ? [visual] : []),
          ...innerShadowVisuals,
          ...edgeVisuals,
          ...(outlineVisual ? [outlineVisual] : []),
        ],
        input.inheritedOpacity,
      ),
      input.node.origin,
    );
  }

  if (input.node.kind === "table") {
    return pdfVisualsWithInheritedOpacity(
      visualElementsFromLayoutTable({
        node: input.node,
        requestsByTextNode: input.requestsByTextNode,
        resourceIdsByRequestKey: input.resourceIdsByRequestKey,
        unicodeResourceIdsByFontId: input.unicodeResourceIdsByFontId,
        fontResourcesById: input.fontResourcesById,
        assets: input.assets,
        imageResourcesById: input.imageResourcesById,
        gradientResourcesById: input.gradientResourcesById,
        filterLengthContext: input.filterLengthContext,
      }),
      input.inheritedOpacity,
    );
  }

  if (input.node.kind !== "text") {
    return [];
  }

  const textNode = input.node;
  const textVisuals = textVisualsFromLayoutText({
    node: textNode,
    fontId: textNodeFontId(input),
    ...(textNodeFontRequest(input) ? { fontRequest: textNodeFontRequest(input) } : {}),
    resourceIdsByRequestKey: input.resourceIdsByRequestKey,
    unicodeResourceIdsByFontId: input.unicodeResourceIdsByFontId,
    fontResourcesById: input.fontResourcesById,
  });
  const resizedFrameBox = resizedTextFrameBox(textNode, textVisuals);
  const resizedBackgroundLayers = backgroundLayersWithFrame(
    textNode.backgroundLayers,
    resizedFrameBox,
  );
  const backgroundVisual = backgroundVisualFromLayoutText({
    node: textNode,
    gradientResourcesById: input.gradientResourcesById,
    box: resizedFrameBox,
  });
  const textBackgroundClipRadius = pdfRoundRectRadiusFromLayoutRadius({
    radiusEmu: textNode.radiusEmu,
  });
  const textBackgroundImageColorFilter = pdfColorFilterFromBackgroundImageNode(textNode);
  const backgroundImageVisuals = imageVisualsFromBackgroundLayers({
    layers: backgroundImageLayers(resizedBackgroundLayers),
    scopeId: textNode.id,
    ...(textBackgroundImageColorFilter ? { pdfColorFilter: textBackgroundImageColorFilter } : {}),
    imageResourcesById: input.imageResourcesById,
    opacity: pdfOpacityForLayoutNode(textNode),
    ...(pdfBlendModeFromNode(textNode) ? { blendMode: pdfBlendModeFromNode(textNode) } : {}),
    ...(textNode.rotation !== undefined ? { rotation: textNode.rotation } : {}),
    ...(textNode.flipH ? { flipH: textNode.flipH } : {}),
    ...(textNode.flipV ? { flipV: textNode.flipV } : {}),
    ...(textNode.rotation !== undefined || textNode.flipH || textNode.flipV
      ? { rotationBox: resizedFrameBox }
      : {}),
    ...(textBackgroundClipRadius !== undefined ? { clipRadius: textBackgroundClipRadius } : {}),
    ...(textNode.zIndex !== undefined ? { zIndex: textNode.zIndex } : {}),
    siblingOrder: textNode.siblingOrder + 0.0001,
  });
  const gradientBackgroundVisuals = shapeVisualsFromGradientBackgroundLayers({
    layers: gradientBackgroundLayers(resizedBackgroundLayers),
    scopeId: textNode.id,
    ...(textBackgroundImageColorFilter ? { pdfColorFilter: textBackgroundImageColorFilter } : {}),
    gradientResourcesById: input.gradientResourcesById,
    opacity: pdfOpacityForLayoutNode(textNode),
    ...(pdfBlendModeFromNode(textNode) ? { blendMode: pdfBlendModeFromNode(textNode) } : {}),
    ...(textNode.rotation !== undefined ? { rotation: textNode.rotation } : {}),
    ...(textNode.flipH ? { flipH: textNode.flipH } : {}),
    ...(textNode.flipV ? { flipV: textNode.flipV } : {}),
    ...(textBackgroundClipRadius !== undefined ? { radius: textBackgroundClipRadius } : {}),
    ...(textNode.zIndex !== undefined ? { zIndex: textNode.zIndex } : {}),
    siblingOrder: textNode.siblingOrder + 0.0001,
  });
  const edgeVisuals = edgeStrokeVisualsFromLayoutText(textNode, resizedFrameBox);
  const outlineVisual = outlineVisualFromLayoutText(textNode, resizedFrameBox);
  const boxShadowVisuals = boxShadowVisualsFromLayoutText(textNode, resizedFrameBox);
  const innerShadowVisuals = innerShadowVisualsFromLayoutText(textNode, resizedFrameBox);
  const dropShadowBoxVisuals = dropShadowBoxVisualsFromLayoutText(textNode, resizedFrameBox);
  const dropShadowTextVisuals =
    dropShadowBoxVisuals.length > 0
      ? []
      : dropShadowTextVisualsFromLayoutText(textNode, textVisuals);
  const shadowTextVisuals =
    boxShadowVisuals.length > 0 ? [] : shadowTextVisualsFromLayoutText(textNode, textVisuals);

  return pdfVisualsWithLayoutOrigin(
    pdfVisualsWithInheritedOpacity(
      [
        ...boxShadowVisuals,
        ...dropShadowBoxVisuals,
        ...(backgroundVisual ? [backgroundVisual] : []),
        ...gradientBackgroundVisuals,
        ...backgroundImageVisuals,
        ...innerShadowVisuals,
        ...dropShadowTextVisuals,
        ...shadowTextVisuals,
        ...textVisuals,
        ...edgeVisuals,
        ...(outlineVisual ? [outlineVisual] : []),
      ],
      input.inheritedOpacity,
    ),
    input.node.origin,
  );
}

function visualElementsFromLayoutSlide(input: {
  readonly layoutSlide: ProjectedLayoutSlide | undefined;
  readonly mediaBox: PdfPage["mediaBox"];
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly unicodeResourceIdsByFontId: ReadonlyMap<PdfFontResource["id"], PdfFontResource["id"]>;
  readonly fontResourcesById: ReadonlyMap<PdfFontResource["id"], PdfFontResource>;
  readonly assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
  readonly imageResourcesById: Map<PdfImageResource["id"], PdfImageResource>;
  readonly gradientResourcesById: Map<PdfGradientResource["id"], PdfGradientResource>;
}): readonly PdfVisualElement[] {
  const backgroundVisuals = backgroundVisualFromLayoutSlide({
    layoutSlide: input.layoutSlide,
    mediaBox: input.mediaBox,
    imageResourcesById: input.imageResourcesById,
    gradientResourcesById: input.gradientResourcesById,
  });
  const childVisuals =
    input.layoutSlide?.nodes.flatMap((node) =>
      visualElementsFromLayoutNode({
        node,
        requestsByTextNode: input.requestsByTextNode,
        resourceIdsByRequestKey: input.resourceIdsByRequestKey,
        unicodeResourceIdsByFontId: input.unicodeResourceIdsByFontId,
        fontResourcesById: input.fontResourcesById,
        assets: input.assets,
        imageResourcesById: input.imageResourcesById,
        gradientResourcesById: input.gradientResourcesById,
        hidden: false,
        filterLengthContext: {
          viewportHeightPt: input.mediaBox.height,
          viewportWidthPt: input.mediaBox.width,
        },
      }),
    ) ?? [];

  return [
    ...pdfVisualsWithLayoutOrigin(backgroundVisuals, input.layoutSlide?.origin),
    ...childVisuals,
  ].map((visual, sequence) => ({
    ...visual,
    paintOrder: { ...visual.paintOrder, sequence },
  }));
}

function pageFontIdsForContent(content: readonly PdfContentOp[]): readonly PdfFontResource["id"][] {
  return [
    ...new Set(
      content.flatMap((op) => {
        return op.op === "text" && op.fontId ? [op.fontId] : [];
      }),
    ),
  ];
}

function pageImageIdsForContent(
  content: readonly PdfContentOp[],
): readonly PdfImageResource["id"][] {
  return [
    ...new Set(
      content.flatMap((op) => {
        return op.op === "image" ? [op.imageId] : [];
      }),
    ),
  ];
}

function pageGradientIdsForContent(
  content: readonly PdfContentOp[],
): readonly PdfGradientResource["id"][] {
  return [
    ...new Set(
      content.flatMap((op) => {
        return op.op === "fillLinearGradientEllipse" ||
          op.op === "fillLinearGradientRect" ||
          op.op === "fillLinearGradientRoundRect" ||
          op.op === "fillRadialGradientEllipse" ||
          op.op === "fillRadialGradientRect" ||
          op.op === "fillRadialGradientRoundRect"
          ? [op.gradientId]
          : [];
      }),
    ),
  ];
}

function resourceFontsForContent(input: {
  readonly fontProjectionFonts: readonly PdfFontResource[];
  readonly pages: readonly Pick<PdfPage, "resources">[];
}): readonly PdfFontResource[] {
  const usedFontIds = new Set(input.pages.flatMap((page) => page.resources.fonts));

  return [
    ...DEFAULT_FONT_RESOURCES.filter((font) => usedFontIds.has(font.id)),
    ...input.fontProjectionFonts,
  ];
}

function resourceImagesForContent(input: {
  readonly imageResourcesById: ReadonlyMap<PdfImageResource["id"], PdfImageResource>;
  readonly pages: readonly Pick<PdfPage, "resources">[];
}): readonly PdfImageResource[] {
  const usedImageIds = new Set(input.pages.flatMap((page) => page.resources.images));
  return [...input.imageResourcesById.values()].filter((image) => usedImageIds.has(image.id));
}

function resourceGradientsForContent(input: {
  readonly gradientResourcesById: ReadonlyMap<PdfGradientResource["id"], PdfGradientResource>;
  readonly pages: readonly Pick<PdfPage, "resources">[];
}): readonly PdfGradientResource[] {
  const usedGradientIds = new Set(input.pages.flatMap((page) => page.resources.gradients ?? []));
  return [...input.gradientResourcesById.values()].filter((gradient) =>
    usedGradientIds.has(gradient.id),
  );
}

export function projectGraphToPdfPageModel(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
  integrationContext?: DeckIntegrationContext;
}): PdfPageModel {
  const mediaBox = pageSizeFromOptions(input.options);
  const slideIds = slideIdsForGraph(input.graph);
  const pageSourceIds = slideIds.length > 0 ? slideIds : [input.graph.documentId];
  const fontProjection = pdfFontResourcesForRequests({
    requests: explicitFontRequests({
      graph: input.graph,
      resolvedStyles: input.resolvedStyles,
      integrationContext: input.integrationContext,
    }),
    integrationContext: input.integrationContext,
  });
  const layoutInput = buildLayoutInputSnapshot({
    graph: input.graph,
    resolvedStyles: input.resolvedStyles,
    assetProbeArtifacts: input.assets,
    deckSize: {
      widthEmu: mediaBox.width * EMU_PER_POINT,
      heightEmu: mediaBox.height * EMU_PER_POINT,
    },
    diagnostics: input.diagnostics,
    meta: input.options.meta,
  });
  const projectedLayout = resolveProjectedLayout(input.options, layoutInput.snapshot, {
    fontMetrics: textFontMetricsFromRegistrations(input.integrationContext?.fontAssets),
    // The unregistered-font PDF path uses the built-in Helvetica width table directly.
    fallbackTextWidthSafetyFactor: 1,
  });
  const requestsByTextNode = explicitFontRequestsByTextNode({
    graph: input.graph,
    resolvedStyles: input.resolvedStyles,
    integrationContext: input.integrationContext,
  });
  const imageResourcesById = new Map<PdfImageResource["id"], PdfImageResource>();
  const gradientResourcesById = new Map<PdfGradientResource["id"], PdfGradientResource>();
  const fontResourcesById = new Map<PdfFontResource["id"], PdfFontResource>(
    [...DEFAULT_FONT_RESOURCES, ...fontProjection.fonts].map((font) => [font.id, font]),
  );
  const pageDrafts = pageSourceIds.map((slideId, index): PdfPage => {
    const layoutSlide = projectedLayout.slides[index];
    const visuals = visualElementsFromLayoutSlide({
      layoutSlide,
      mediaBox,
      requestsByTextNode,
      resourceIdsByRequestKey: fontProjection.resourceIdsByRequestKey,
      unicodeResourceIdsByFontId: fontProjection.unicodeResourceIdsByFontId,
      fontResourcesById,
      assets: input.assets,
      imageResourcesById,
      gradientResourcesById,
    });
    const content = contentOpsFromPdfVisuals(visuals);
    const annotations = [
      ...annotationsFromLayoutSlide(layoutSlide),
      ...annotationsFromPdfTextVisuals(visuals),
    ];

    return {
      id: pdfPageId(slideId, index),
      index,
      ...(layoutSlide?.name ? { name: layoutSlide.name } : {}),
      mediaBox,
      resources: {
        fonts: pageFontIdsForContent(content),
        images: pageImageIdsForContent(content),
        gradients: pageGradientIdsForContent(content),
      },
      ...(annotations.length > 0 ? { annotations } : {}),
      visuals,
      content,
    };
  });
  const unsupportedSemanticFallbacks = pageSourceIds.flatMap((slideId, index) =>
    unsupportedSemanticFallbacksFromSlide({
      slide: projectedLayout.slides[index],
      pageId: pdfPageId(slideId, index),
      filterLengthContext: {
        viewportHeightPt: mediaBox.height,
        viewportWidthPt: mediaBox.width,
      },
      assets: input.assets,
    }),
  );
  const provisionalResources = {
    fonts: resourceFontsForContent({
      fontProjectionFonts: fontProjection.fonts,
      pages: pageDrafts,
    }),
    images: resourceImagesForContent({
      imageResourcesById,
      pages: pageDrafts,
    }),
    gradients: resourceGradientsForContent({
      gradientResourcesById,
      pages: pageDrafts,
    }),
  };
  const unsupportedTextEncodingFallbacks = pageDrafts.flatMap((page) =>
    unsupportedTextEncodingFallbacksFromPage({
      page,
      resources: provisionalResources,
    }),
  );
  const missingMappedGlyphFallbacks = pageDrafts.flatMap((page) =>
    missingMappedGlyphFallbacksFromPage({
      page,
      resources: provisionalResources,
    }),
  );
  const nonBmpTextFallbacks = pageDrafts.flatMap((page) =>
    nonBmpTextFallbacksFromPage({
      page,
      resources: provisionalResources,
    }),
  );
  const shapingFallbacks = pageDrafts.flatMap((page) =>
    (page.visuals ?? []).flatMap((visual) =>
      visual.kind === "text" && visual.shapingDiagnostic
        ? [
            {
              code: visual.shapingDiagnostic.code,
              message: visual.shapingDiagnostic.message,
              pageId: page.id,
              kind: "text" as const,
            },
          ]
        : [],
    ),
  );

  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId(input.graph.documentId),
    metadata: {
      producer: "deckjsx",
      ...input.options.meta,
    },
    pages: pageDrafts,
    resources: {
      ...provisionalResources,
    },
    fallbacks: [
      ...fontProjection.fallbacks,
      ...unsupportedSemanticFallbacks,
      ...unsupportedTextEncodingFallbacks,
      ...missingMappedGlyphFallbacks,
      ...nonBmpTextFallbacks,
      ...shapingFallbacks,
    ],
  };
}

export const projectGraphToPartialPdfPageModel = projectGraphToPdfPageModel;

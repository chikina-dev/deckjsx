import type { PdfRgbColor } from "./model";

type PdfCssFilterFunction = {
  readonly name: string;
  readonly args: string;
};

export type PdfColorTransform = (color: PdfRgbColor) => PdfRgbColor;

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

function pdfCssFilterFunctionIsVisualNoop(filter: PdfCssFilterFunction): boolean {
  const args = pdfCssFilterNumberArgs(filter.args);
  if (!args) {
    return false;
  }

  switch (filter.name) {
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

function pdfCssVisibleEffectFilterFunctions(value: string): readonly PdfCssFilterFunction[] {
  return pdfCssFilterFunctions(value).filter((filter) => !pdfCssFilterFunctionIsVisualNoop(filter));
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

function pdfBrightnessAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const adjust = (channel: number) => Math.min(1, Math.max(0, channel * factor));
  return {
    r: adjust(color.r),
    g: adjust(color.g),
    b: adjust(color.b),
  };
}

function pdfContrastAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const adjust = (channel: number) => Math.min(1, Math.max(0, (channel - 0.5) * factor + 0.5));
  return {
    r: adjust(color.r),
    g: adjust(color.g),
    b: adjust(color.b),
  };
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

function pdfGrayscaleAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  return pdfSaturateAdjustedColor(color, 1 - factor);
}

function pdfInvertAdjustedColor(color: PdfRgbColor, factor: number): PdfRgbColor {
  const adjust = (channel: number) => channel * (1 - factor) + (1 - channel) * factor;
  return {
    r: adjust(color.r),
    g: adjust(color.g),
    b: adjust(color.b),
  };
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

export function pdfAdjustedColorFromCssColorFilter(
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

export function pdfCssColorFilterAdjustsColor(value: string): boolean {
  return pdfAdjustedColorFromCssColorFilter(value, { r: 0, g: 0, b: 0 }) !== undefined;
}

export function pdfCssColorFilterTransform(value: string): PdfColorTransform | undefined {
  return pdfCssColorFilterAdjustsColor(value)
    ? (color) => pdfAdjustedColorFromCssColorFilter(value, color) ?? color
    : undefined;
}

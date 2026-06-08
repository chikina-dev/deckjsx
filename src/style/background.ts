import type {
  BackgroundImageLayerIR,
  BackgroundLayerIR,
  EdgeStrokeIR,
  FillIR,
  ImageSourceIR,
  StrokeIR,
} from "../layout/projected";
import { EMU_PER_INCH } from "../types";
import { normalizeHue } from "./angle";
import { alphaToTransparency, parseCssColor } from "./color";
import { parseLengthToken, parsePercentage, pointsToEmu } from "./length";

export type Frame = {
  xEmu: number;
  yEmu: number;
  widthEmu: number;
  heightEmu: number;
};

export type BackgroundBoxFrames = {
  borderBox: Frame;
  paddingBox: Frame;
  contentBox: Frame;
};
type BackgroundBoxKeyword = "border-box" | "padding-box" | "content-box";
type GradientColorStopEntry =
  | {
      kind: "hint";
      position: number;
    }
  | {
      kind: "stop";
      color: string;
      transparency?: number;
      positions: number[];
    };
type RadialGradientDescriptor = {
  shape: "circle" | "ellipse";
  center: { x: number; y: number };
  radius: { x: number; y: number };
};
type BackgroundImageSizing = {
  fit: BackgroundImageLayerIR["fit"];
  size?: BackgroundImageLayerIR["size"];
};

export function parseBackgroundShorthand(value?: string): {
  backgroundColor?: string;
} {
  if (!value) {
    return {};
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return {};
  }

  return parseCssColor(trimmed) ? { backgroundColor: trimmed } : {};
}

function isBackgroundBoxToken(value: string): value is BackgroundBoxKeyword {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "border-box" || normalized === "padding-box" || normalized === "content-box"
  );
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function splitTopLevelSlash(value: string) {
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === "/" && depth === 0) {
      return {
        before: value.slice(0, index).trim(),
        after: value.slice(index + 1).trim(),
      };
    }
  }

  return {
    before: value.trim(),
    after: undefined,
  };
}

function insetFrame(
  frame: Frame,
  insets: { top: number; right: number; bottom: number; left: number },
): Frame {
  const xEmu = frame.xEmu + insets.left;
  const yEmu = frame.yEmu + insets.top;
  const widthEmu = Math.max(0, frame.widthEmu - insets.left - insets.right);
  const heightEmu = Math.max(0, frame.heightEmu - insets.top - insets.bottom);

  return {
    xEmu,
    yEmu,
    widthEmu,
    heightEmu,
  };
}

function resolveBackgroundBoxKeyword(
  value: string | undefined,
  propertyName: "backgroundClip" | "backgroundOrigin",
): BackgroundBoxKeyword {
  if (!value) {
    return "border-box";
  }

  const trimmed = value.trim().toLowerCase();
  if (isBackgroundBoxToken(trimmed)) {
    return trimmed;
  }

  throw new Error(
    `Unsupported ${propertyName} value: ${value}. Supported values are border-box, padding-box, and content-box.`,
  );
}

function getBackgroundBorderInsets(stroke?: StrokeIR, edgeStrokes?: EdgeStrokeIR) {
  const uniformWidthEmu = stroke ? pointsToEmu(stroke.widthPt) : 0;
  return {
    top: edgeStrokes?.top ? pointsToEmu(edgeStrokes.top.widthPt) : uniformWidthEmu,
    right: edgeStrokes?.right ? pointsToEmu(edgeStrokes.right.widthPt) : uniformWidthEmu,
    bottom: edgeStrokes?.bottom ? pointsToEmu(edgeStrokes.bottom.widthPt) : uniformWidthEmu,
    left: edgeStrokes?.left ? pointsToEmu(edgeStrokes.left.widthPt) : uniformWidthEmu,
  };
}

export function resolveBackgroundBoxFrames(
  frame: Frame,
  stroke?: StrokeIR,
  edgeStrokes?: EdgeStrokeIR,
  paddingInsets?: [number, number, number, number],
): BackgroundBoxFrames {
  const borderInsets = getBackgroundBorderInsets(stroke, edgeStrokes);
  const paddingBox = insetFrame(frame, borderInsets);
  const [paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0] =
    paddingInsets ?? [];
  const contentBox = insetFrame(paddingBox, {
    top: paddingTop,
    right: paddingRight,
    bottom: paddingBottom,
    left: paddingLeft,
  });

  return {
    borderBox: frame,
    paddingBox,
    contentBox,
  };
}

function selectBackgroundBoxFrame(
  frames: BackgroundBoxFrames,
  box: "border-box" | "padding-box" | "content-box",
) {
  switch (box) {
    case "padding-box":
      return frames.paddingBox;
    case "content-box":
      return frames.contentBox;
    case "border-box":
    default:
      return frames.borderBox;
  }
}

function framesEqual(a: Frame | undefined, b: Frame | undefined) {
  if (!a || !b) {
    return a === b;
  }

  return (
    a.xEmu === b.xEmu &&
    a.yEmu === b.yEmu &&
    a.widthEmu === b.widthEmu &&
    a.heightEmu === b.heightEmu
  );
}

function withBackgroundFillFrame(
  fill: FillIR,
  frame: Frame | undefined,
  defaultFrame: Frame | undefined,
) {
  if (!frame || !defaultFrame || framesEqual(frame, defaultFrame)) {
    return fill;
  }

  return {
    ...fill,
    frame: { ...frame },
  };
}

function ensureBackgroundFillLayerFrame(layer: BackgroundLayerIR, frame: Frame | undefined) {
  if (layer.kind === "background-image" || layer.frame !== undefined || !frame) {
    return layer;
  }

  return {
    ...layer,
    frame: { ...frame },
  };
}

function resolveBackgroundLayerFrames(
  frame: Frame | undefined,
  boxFrames: BackgroundBoxFrames | undefined,
  backgroundOrigin: string | undefined,
  backgroundClip: string | undefined,
) {
  const resolvedOrigin = resolveBackgroundBoxKeyword(backgroundOrigin, "backgroundOrigin");
  const resolvedClip = resolveBackgroundBoxKeyword(backgroundClip, "backgroundClip");
  const positioningFrame =
    boxFrames && frame ? selectBackgroundBoxFrame(boxFrames, resolvedOrigin) : frame;
  const paintFrame = boxFrames && frame ? selectBackgroundBoxFrame(boxFrames, resolvedClip) : frame;

  return {
    positioningFrame,
    paintFrame,
  };
}

function normalizeCssGradientAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function resolveLinearGradientSpanEmu(angle: number, widthEmu: number, heightEmu: number) {
  const radians = (normalizeCssGradientAngle(angle) * Math.PI) / 180;
  return Math.abs(Math.sin(radians)) * widthEmu + Math.abs(Math.cos(radians)) * heightEmu;
}

function parseLinearGradientDirection(value: string): number | undefined {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  switch (normalized) {
    case "to top":
      return 0;
    case "to top right":
    case "to right top":
      return 45;
    case "to right":
      return 90;
    case "to bottom right":
    case "to right bottom":
      return 135;
    case "to bottom":
      return 180;
    case "to bottom left":
    case "to left bottom":
      return 225;
    case "to left":
      return 270;
    case "to top left":
    case "to left top":
      return 315;
    default:
      return undefined;
  }
}

function resolveGradientStops(
  rawStops: Array<{ color: string; transparency?: number; position?: number }>,
  kind = "gradient",
): Array<{ color: string; transparency?: number; position: number }> {
  if (rawStops.length < 2) {
    throw new Error(`${kind}() requires at least two color stops.`);
  }

  const stops = rawStops.map((stop) => ({ ...stop }));

  const firstStop = stops[0];
  if (firstStop === undefined) {
    throw new Error(`${kind}() requires at least two color stops.`);
  }
  if (firstStop.position === undefined) {
    firstStop.position = 0;
  }

  const lastStop = stops.at(-1);
  if (lastStop === undefined) {
    throw new Error(`${kind}() requires at least two color stops.`);
  }
  if (lastStop.position === undefined) {
    lastStop.position = 1;
  }

  let index = 0;
  while (index < stops.length) {
    const stop = stops[index];
    if (stop === undefined || stop.position !== undefined) {
      index += 1;
      continue;
    }

    const startIndex = index - 1;
    let endIndex = index;
    while (endIndex < stops.length && stops[endIndex]?.position === undefined) {
      endIndex += 1;
    }

    const startPosition = stops[startIndex]?.position ?? 0;
    const endPosition = stops[endIndex]?.position ?? 1;
    const count = endIndex - startIndex;

    for (let offset = 1; offset < count; offset += 1) {
      const unresolvedStop = stops[startIndex + offset];
      if (unresolvedStop !== undefined) {
        unresolvedStop.position = startPosition + ((endPosition - startPosition) * offset) / count;
      }
    }

    index = endIndex;
  }

  return stops.map((stop) => ({
    color: stop.color,
    transparency: stop.transparency,
    position: Math.max(0, Math.min(1, stop.position ?? 0)),
  }));
}

function parseHexColorComponents(color: string) {
  return {
    r: Number.parseInt(color.slice(0, 2), 16),
    g: Number.parseInt(color.slice(2, 4), 16),
    b: Number.parseInt(color.slice(4, 6), 16),
  };
}

function formatHexColorComponent(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
}

function interpolateGradientStop(
  from: { color: string; transparency?: number; position: number },
  to: { color: string; transparency?: number; position: number },
  position: number,
) {
  if (to.position === from.position) {
    return {
      color: to.color,
      transparency: to.transparency,
      position,
    };
  }

  const t = (position - from.position) / (to.position - from.position);
  const fromColor = parseHexColorComponents(from.color);
  const toColor = parseHexColorComponents(to.color);
  const fromAlpha = 1 - (from.transparency ?? 0) / 100;
  const toAlpha = 1 - (to.transparency ?? 0) / 100;
  const alpha = fromAlpha + (toAlpha - fromAlpha) * t;
  const transparency = normalizeTransparency((1 - alpha) * 100);

  return {
    color: `${formatHexColorComponent(fromColor.r + (toColor.r - fromColor.r) * t)}${formatHexColorComponent(fromColor.g + (toColor.g - fromColor.g) * t)}${formatHexColorComponent(fromColor.b + (toColor.b - fromColor.b) * t)}`,
    transparency: transparency === 0 ? undefined : transparency,
    position,
  };
}

function parseGradientPositionToken(
  token: string,
  kind:
    | "linear-gradient"
    | "radial-gradient"
    | "repeating-linear-gradient"
    | "repeating-radial-gradient",
  stopLengthBaseEmu?: number,
) {
  if (token.trim() === "0") {
    return 0;
  }

  const percentage = parsePercentage(token);
  if (percentage !== undefined) {
    return Math.max(0, Math.min(1, percentage / 100));
  }

  if (stopLengthBaseEmu !== undefined && stopLengthBaseEmu > 0) {
    try {
      return parseLengthToken(token, stopLengthBaseEmu, NaN) / stopLengthBaseEmu;
    } catch {
      throw new Error(
        `Unsupported ${kind} stop position: ${token}. Only percentages and supported length units are supported.`,
      );
    }
  }

  throw new Error(
    `Unsupported ${kind} stop position: ${token}. Only percentages and supported length units are supported.`,
  );
}

function expandRepeatingGradientStops(
  stops: Array<{ color: string; transparency?: number; position: number }>,
  kind: "repeating-linear-gradient" | "repeating-radial-gradient",
) {
  const firstStop = stops[0];
  const lastStop = stops.at(-1);
  if (firstStop === undefined || lastStop === undefined) {
    throw new Error(`${kind}() requires at least two color stops.`);
  }

  const cycleStart = firstStop.position;
  const cycleEnd = lastStop.position;
  const cycleLength = cycleEnd - cycleStart;

  if (cycleLength <= 0) {
    throw new Error(`${kind}() requires a positive repeat span.`);
  }

  const minCycle = Math.floor((0 - cycleEnd) / cycleLength);
  const maxCycle = Math.ceil((1 - cycleStart) / cycleLength);
  const repeatedStops: Array<{ color: string; transparency?: number; position: number }> = [];

  for (let cycle = minCycle; cycle <= maxCycle; cycle += 1) {
    for (const stop of stops) {
      repeatedStops.push({
        ...stop,
        position: stop.position + cycle * cycleLength,
      });
    }
  }

  repeatedStops.sort((a, b) => a.position - b.position);

  const expanded = repeatedStops.filter((stop) => stop.position >= 0 && stop.position <= 1);
  const hasZeroStop = expanded.some((stop) => stop.position === 0);
  const hasOneStop = expanded.some((stop) => stop.position === 1);

  if (!hasZeroStop) {
    const beforeZero = [...repeatedStops].reverse().find((stop) => stop.position < 0);
    const afterZero = repeatedStops.find((stop) => stop.position > 0);
    if (beforeZero && afterZero) {
      expanded.unshift(interpolateGradientStop(beforeZero, afterZero, 0));
    }
  }

  if (!hasOneStop) {
    const beforeOne = [...repeatedStops].reverse().find((stop) => stop.position < 1);
    const afterOne = repeatedStops.find((stop) => stop.position > 1);
    if (beforeOne && afterOne) {
      expanded.push(interpolateGradientStop(beforeOne, afterOne, 1));
    }
  }

  return expanded;
}

function parseGradientColorStops(
  parts: string[],
  kind:
    | "linear-gradient"
    | "radial-gradient"
    | "repeating-linear-gradient"
    | "repeating-radial-gradient",
  startIndex = 0,
  stopLengthBaseEmu?: number,
) {
  const entries: GradientColorStopEntry[] = parts.slice(startIndex).map((part) => {
    const tokens = splitCssValueTokens(part);
    if (tokens.length === 0) {
      throw new Error(`${kind}() contains an empty color stop.`);
    }

    const [colorToken] = tokens;
    if (colorToken === undefined) {
      throw new Error(`${kind}() contains an empty color stop.`);
    }

    const parsedColor = parseCssColor(colorToken);
    if (!parsedColor) {
      if (tokens.length !== 1) {
        throw new Error(`Unsupported ${kind} color stop: ${colorToken}`);
      }

      return {
        kind: "hint",
        position: parseGradientPositionToken(colorToken, kind, stopLengthBaseEmu),
      };
    }

    const positions = tokens
      .slice(1)
      .map((token) => parseGradientPositionToken(token, kind, stopLengthBaseEmu));

    if (positions.length > 2) {
      throw new Error(`${kind}() color stops accept at most two positions.`);
    }

    return {
      kind: "stop",
      color: parsedColor.color,
      transparency: alphaToTransparency(parsedColor.alpha),
      positions,
    };
  });

  const rawStops: Array<{ color: string; transparency?: number; position?: number }> = [];
  const hints: Array<{ afterStopIndex: number; position: number }> = [];

  for (const entry of entries) {
    if (entry.kind === "hint") {
      if (rawStops.length === 0) {
        throw new Error(`${kind}() color hints must come after a color stop.`);
      }
      hints.push({
        afterStopIndex: rawStops.length - 1,
        position: entry.position,
      });
      continue;
    }

    if (entry.positions.length === 0) {
      rawStops.push({
        color: entry.color,
        transparency: entry.transparency,
      });
      continue;
    }

    rawStops.push({
      color: entry.color,
      transparency: entry.transparency,
      position: entry.positions[0],
    });

    if (entry.positions[1] !== undefined) {
      rawStops.push({
        color: entry.color,
        transparency: entry.transparency,
        position: entry.positions[1],
      });
    }
  }

  const stops = resolveGradientStops(rawStops, kind);

  for (const hint of hints) {
    const from = stops[hint.afterStopIndex];
    const to = stops[hint.afterStopIndex + 1];

    if (!from || !to) {
      throw new Error(`${kind}() color hints must appear between two color stops.`);
    }

    if (hint.position <= from.position || hint.position >= to.position) {
      throw new Error(`${kind}() color hints must fall between adjacent color stop positions.`);
    }
  }

  const hintedStops = [...stops];
  let inserted = 0;
  for (const hint of hints) {
    const from = hintedStops[hint.afterStopIndex + inserted];
    const to = hintedStops[hint.afterStopIndex + inserted + 1];
    if (from === undefined || to === undefined) {
      throw new Error(`${kind}() color hints must appear between two color stops.`);
    }

    hintedStops.splice(
      hint.afterStopIndex + inserted + 1,
      0,
      interpolateGradientStop(from, to, hint.position),
    );
    inserted += 1;
  }

  if (kind === "repeating-linear-gradient" || kind === "repeating-radial-gradient") {
    return expandRepeatingGradientStops(hintedStops, kind);
  }

  return hintedStops;
}

function parseRadialGradientSizeToken(
  value: string,
  baseEmu: number,
  fallback: number,
): number | undefined {
  const trimmed = value.trim().toLowerCase();
  if (
    trimmed === "closest-side" ||
    trimmed === "farthest-side" ||
    trimmed === "closest-corner" ||
    trimmed === "farthest-corner" ||
    trimmed === "contain" ||
    trimmed === "cover"
  ) {
    return undefined;
  }

  return parseLengthToken(trimmed, baseEmu, fallback);
}

function resolveRadialGradientKeywordSize(
  keyword: string,
  shape: "circle" | "ellipse",
  center: { x: number; y: number },
  widthEmu: number,
  heightEmu: number,
) {
  const left = center.x * widthEmu;
  const right = (1 - center.x) * widthEmu;
  const top = center.y * heightEmu;
  const bottom = (1 - center.y) * heightEmu;

  const closestCornerDistance = Math.min(
    Math.hypot(left, top),
    Math.hypot(right, top),
    Math.hypot(left, bottom),
    Math.hypot(right, bottom),
  );
  const farthestCornerDistance = Math.max(
    Math.hypot(left, top),
    Math.hypot(right, top),
    Math.hypot(left, bottom),
    Math.hypot(right, bottom),
  );
  const nearestCornerDx = Math.min(left, right);
  const nearestCornerDy = Math.min(top, bottom);
  const farthestCornerDx = Math.max(left, right);
  const farthestCornerDy = Math.max(top, bottom);

  switch (keyword) {
    case "contain":
    case "closest-side":
      if (shape === "circle") {
        const radius = Math.min(left, right, top, bottom);
        return { x: radius / widthEmu, y: radius / heightEmu };
      }
      return {
        x: Math.min(left, right) / widthEmu,
        y: Math.min(top, bottom) / heightEmu,
      };
    case "farthest-side":
      if (shape === "circle") {
        const radius = Math.max(left, right, top, bottom);
        return { x: radius / widthEmu, y: radius / heightEmu };
      }
      return {
        x: Math.max(left, right) / widthEmu,
        y: Math.max(top, bottom) / heightEmu,
      };
    case "closest-corner":
      if (shape === "circle") {
        return {
          x: closestCornerDistance / widthEmu,
          y: closestCornerDistance / heightEmu,
        };
      }
      return {
        x: (nearestCornerDx * Math.SQRT2) / widthEmu,
        y: (nearestCornerDy * Math.SQRT2) / heightEmu,
      };
    case "cover":
    case "farthest-corner":
    default:
      if (shape === "circle") {
        return {
          x: farthestCornerDistance / widthEmu,
          y: farthestCornerDistance / heightEmu,
        };
      }
      return {
        x: (farthestCornerDx * Math.SQRT2) / widthEmu,
        y: (farthestCornerDy * Math.SQRT2) / heightEmu,
      };
  }
}

function resolveRadialGradientDescriptor(
  descriptor: string,
  widthEmu: number,
  heightEmu: number,
): RadialGradientDescriptor {
  const normalized = descriptor.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      shape: "ellipse",
      center: { x: 0.5, y: 0.5 },
      radius: resolveRadialGradientKeywordSize(
        "farthest-corner",
        "ellipse",
        { x: 0.5, y: 0.5 },
        widthEmu,
        heightEmu,
      ),
    };
  }

  let descriptorPart = normalized;
  let center = { x: 0.5, y: 0.5 };
  const atMatch = descriptorPart.match(/\bat\b/i);

  if (atMatch && atMatch.index !== undefined) {
    descriptorPart = descriptorPart.slice(0, atMatch.index).trim();
    const positionPart = normalized.slice(atMatch.index + atMatch[0].length).trim();
    const parsedPosition = parseObjectPosition(positionPart, { widthEmu, heightEmu });
    if (!parsedPosition) {
      throw new Error(`Unsupported radial-gradient position: ${descriptor}`);
    }
    center = parsedPosition;
  }

  const tokens = splitCssValueTokens(descriptorPart);
  let shape: "circle" | "ellipse" | undefined;
  const sizeTokens: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "circle" || lower === "ellipse") {
      if (shape) {
        throw new Error(`Unsupported radial-gradient descriptor: ${descriptor}`);
      }
      shape = lower;
      continue;
    }
    sizeTokens.push(token);
  }

  let keywordSize: string | undefined;
  if (sizeTokens.length > 0) {
    const [firstSizeToken] = sizeTokens;
    if (firstSizeToken === undefined) {
      throw new Error(`Unsupported radial-gradient descriptor: ${descriptor}`);
    }

    const lower = firstSizeToken.toLowerCase();
    if (
      lower === "closest-side" ||
      lower === "farthest-side" ||
      lower === "closest-corner" ||
      lower === "farthest-corner" ||
      lower === "contain" ||
      lower === "cover"
    ) {
      keywordSize = lower;
      if (sizeTokens.length > 1) {
        throw new Error(
          `Unsupported radial-gradient descriptor: ${descriptor}. Size keywords cannot be combined with explicit radii.`,
        );
      }
    }
  }

  if (!shape) {
    shape = keywordSize || sizeTokens.length === 2 ? "ellipse" : "circle";
  }

  if (shape === "circle" && sizeTokens.length > 1 && !keywordSize) {
    throw new Error(
      `Unsupported radial-gradient descriptor: ${descriptor}. circle gradients accept only one explicit radius.`,
    );
  }

  if (shape === "ellipse" && sizeTokens.length === 1 && !keywordSize) {
    throw new Error(
      `Unsupported radial-gradient descriptor: ${descriptor}. ellipse gradients require two explicit radii or a size keyword.`,
    );
  }

  let radius:
    | {
        x: number;
        y: number;
      }
    | undefined;

  if (keywordSize) {
    radius = resolveRadialGradientKeywordSize(keywordSize, shape, center, widthEmu, heightEmu);
  } else if (sizeTokens.length > 0) {
    if (shape === "circle") {
      const [radiusToken] = sizeTokens;
      if (radiusToken === undefined) {
        throw new Error(`Unsupported radial-gradient descriptor: ${descriptor}`);
      }

      const radiusEmu = parseRadialGradientSizeToken(radiusToken, Math.min(widthEmu, heightEmu), 0);
      if (radiusEmu === undefined) {
        throw new Error(`Unsupported radial-gradient descriptor: ${descriptor}`);
      }
      radius = {
        x: radiusEmu / widthEmu,
        y: radiusEmu / heightEmu,
      };
    } else {
      const [radiusXToken, radiusYToken] = sizeTokens;
      if (radiusXToken === undefined || radiusYToken === undefined) {
        throw new Error(`Unsupported radial-gradient descriptor: ${descriptor}`);
      }

      const radiusXEmu = parseRadialGradientSizeToken(radiusXToken, widthEmu, 0);
      const radiusYEmu = parseRadialGradientSizeToken(radiusYToken, heightEmu, 0);
      if (radiusXEmu === undefined || radiusYEmu === undefined) {
        throw new Error(`Unsupported radial-gradient descriptor: ${descriptor}`);
      }
      radius = {
        x: radiusXEmu / widthEmu,
        y: radiusYEmu / heightEmu,
      };
    }
  } else {
    radius = resolveRadialGradientKeywordSize(
      "farthest-corner",
      shape,
      center,
      widthEmu,
      heightEmu,
    );
  }

  return {
    shape,
    center,
    radius,
  };
}

function parseLinearGradient(
  value?: string,
  context?: { widthEmu: number; heightEmu: number },
): FillIR | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("linear-gradient(") || !trimmed.endsWith(")")) {
    return undefined;
  }

  const inner = trimmed.slice("linear-gradient(".length, -1);
  const parts = splitTopLevelCommas(inner);
  if (parts.length < 2) {
    throw new Error("linear-gradient() requires at least two arguments.");
  }

  let angle = 180;
  let startIndex = 0;
  const [firstPart] = parts;
  if (firstPart === undefined) {
    throw new Error("linear-gradient() requires at least two arguments.");
  }

  const parsedDirection = parseLinearGradientDirection(firstPart);
  if (parsedDirection !== undefined) {
    angle = parsedDirection;
    startIndex = 1;
  } else {
    const parsedAngle = normalizeHue(firstPart);
    if (parsedAngle !== undefined && /deg|rad|turn/i.test(firstPart)) {
      angle = parsedAngle;
      startIndex = 1;
    }
  }

  const stopLengthBaseEmu = context
    ? resolveLinearGradientSpanEmu(angle, context.widthEmu, context.heightEmu)
    : undefined;

  return {
    kind: "linear-gradient",
    angle: normalizeCssGradientAngle(angle),
    stops: parseGradientColorStops(parts, "linear-gradient", startIndex, stopLengthBaseEmu),
  };
}

function parseRepeatingLinearGradient(
  value?: string,
  context?: { widthEmu: number; heightEmu: number },
): FillIR | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("repeating-linear-gradient(") || !trimmed.endsWith(")")) {
    return undefined;
  }

  const inner = trimmed.slice("repeating-linear-gradient(".length, -1);
  const parts = splitTopLevelCommas(inner);
  if (parts.length < 2) {
    throw new Error("repeating-linear-gradient() requires at least two arguments.");
  }

  let angle = 180;
  let startIndex = 0;
  const [firstPart] = parts;
  if (firstPart === undefined) {
    throw new Error("repeating-linear-gradient() requires at least two arguments.");
  }

  const parsedDirection = parseLinearGradientDirection(firstPart);
  if (parsedDirection !== undefined) {
    angle = parsedDirection;
    startIndex = 1;
  } else {
    const parsedAngle = normalizeHue(firstPart);
    if (parsedAngle !== undefined && /deg|rad|turn/i.test(firstPart)) {
      angle = parsedAngle;
      startIndex = 1;
    }
  }

  const stopLengthBaseEmu = context
    ? resolveLinearGradientSpanEmu(angle, context.widthEmu, context.heightEmu)
    : undefined;

  return {
    kind: "linear-gradient",
    angle: normalizeCssGradientAngle(angle),
    stops: parseGradientColorStops(
      parts,
      "repeating-linear-gradient",
      startIndex,
      stopLengthBaseEmu,
    ),
  };
}

function parseRadialGradient(
  value: string | undefined,
  context?: { widthEmu: number; heightEmu: number },
): FillIR | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("radial-gradient(") || !trimmed.endsWith(")")) {
    return undefined;
  }

  const inner = trimmed.slice("radial-gradient(".length, -1);
  const parts = splitTopLevelCommas(inner);
  if (parts.length < 2) {
    throw new Error("radial-gradient() requires at least two arguments.");
  }

  let startIndex = 0;
  const [rawFirstPart] = parts;
  if (rawFirstPart === undefined) {
    throw new Error("radial-gradient() requires at least two arguments.");
  }

  const firstPart = rawFirstPart.trim();
  const firstPartColor = parseCssColor(splitCssValueTokens(firstPart)[0] ?? "");
  let descriptor: {
    shape: "circle" | "ellipse";
    center: { x: number; y: number };
    radius: { x: number; y: number };
  } = {
    shape: "ellipse",
    center: { x: 0.5, y: 0.5 },
    radius: {
      x: 0.5,
      y: 0.5,
    },
  };

  if (!firstPartColor) {
    startIndex = 1;
    descriptor = resolveRadialGradientDescriptor(
      firstPart,
      context?.widthEmu ?? EMU_PER_INCH,
      context?.heightEmu ?? EMU_PER_INCH,
    );
  } else {
    descriptor = resolveRadialGradientDescriptor(
      "",
      context?.widthEmu ?? EMU_PER_INCH,
      context?.heightEmu ?? EMU_PER_INCH,
    );
  }

  return {
    kind: "radial-gradient",
    shape: descriptor.shape,
    center: descriptor.center,
    radius: descriptor.radius,
    stops: parseGradientColorStops(
      parts,
      "radial-gradient",
      startIndex,
      Math.max(
        descriptor.radius.x * (context?.widthEmu ?? EMU_PER_INCH),
        descriptor.radius.y * (context?.heightEmu ?? EMU_PER_INCH),
      ),
    ),
  };
}

function parseRepeatingRadialGradient(
  value: string | undefined,
  context?: { widthEmu: number; heightEmu: number },
): FillIR | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("repeating-radial-gradient(") || !trimmed.endsWith(")")) {
    return undefined;
  }

  const inner = trimmed.slice("repeating-radial-gradient(".length, -1);
  const parts = splitTopLevelCommas(inner);
  if (parts.length < 2) {
    throw new Error("repeating-radial-gradient() requires at least two arguments.");
  }

  let startIndex = 0;
  const [rawFirstPart] = parts;
  if (rawFirstPart === undefined) {
    throw new Error("repeating-radial-gradient() requires at least two arguments.");
  }

  const firstPart = rawFirstPart.trim();
  const firstPartColor = parseCssColor(splitCssValueTokens(firstPart)[0] ?? "");
  let descriptor: {
    shape: "circle" | "ellipse";
    center: { x: number; y: number };
    radius: { x: number; y: number };
  } = {
    shape: "ellipse",
    center: { x: 0.5, y: 0.5 },
    radius: {
      x: 0.5,
      y: 0.5,
    },
  };

  if (!firstPartColor) {
    startIndex = 1;
    descriptor = resolveRadialGradientDescriptor(
      firstPart,
      context?.widthEmu ?? EMU_PER_INCH,
      context?.heightEmu ?? EMU_PER_INCH,
    );
  } else {
    descriptor = resolveRadialGradientDescriptor(
      "",
      context?.widthEmu ?? EMU_PER_INCH,
      context?.heightEmu ?? EMU_PER_INCH,
    );
  }

  return {
    kind: "radial-gradient",
    shape: descriptor.shape,
    center: descriptor.center,
    radius: descriptor.radius,
    stops: parseGradientColorStops(
      parts,
      "repeating-radial-gradient",
      startIndex,
      Math.max(
        descriptor.radius.x * (context?.widthEmu ?? EMU_PER_INCH),
        descriptor.radius.y * (context?.heightEmu ?? EMU_PER_INCH),
      ),
    ),
  };
}

export function normalizeTransparency(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, value));
}

function isLinearGradientFill(
  fill: FillIR | undefined,
): fill is Extract<FillIR, { kind: "linear-gradient" }> {
  return fill !== undefined && fill.kind === "linear-gradient";
}

function isRadialGradientFill(
  fill: FillIR | undefined,
): fill is Extract<FillIR, { kind: "radial-gradient" }> {
  return fill !== undefined && fill.kind === "radial-gradient";
}

export function normalizeOpacityAsTransparency(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeTransparency((1 - Math.max(0, Math.min(1, value))) * 100);
}

function combineFillTransparency(
  baseTransparency: number | undefined,
  fillTransparency: number | undefined,
) {
  if (baseTransparency === undefined && fillTransparency === undefined) {
    return undefined;
  }

  const baseVisibleAlpha = 1 - (baseTransparency ?? 0) / 100;
  const fillVisibleAlpha = 1 - (fillTransparency ?? 0) / 100;
  return normalizeTransparency((1 - baseVisibleAlpha * fillVisibleAlpha) * 100);
}

export function toFill(
  color?: string,
  transparency?: number,
  context?: { widthEmu: number; heightEmu: number },
): FillIR | undefined {
  const repeatingLinearGradient = parseRepeatingLinearGradient(color, context);
  if (isLinearGradientFill(repeatingLinearGradient)) {
    return {
      ...repeatingLinearGradient,
      stops: repeatingLinearGradient.stops.map((stop) => ({
        ...stop,
        transparency: combineFillTransparency(stop.transparency, transparency),
      })),
    };
  }

  const linearGradient = parseLinearGradient(color, context);
  if (isLinearGradientFill(linearGradient)) {
    return {
      ...linearGradient,
      stops: linearGradient.stops.map((stop) => ({
        ...stop,
        transparency: combineFillTransparency(stop.transparency, transparency),
      })),
    };
  }

  const repeatingRadialGradient = parseRepeatingRadialGradient(color, context);
  if (isRadialGradientFill(repeatingRadialGradient)) {
    return {
      ...repeatingRadialGradient,
      stops: repeatingRadialGradient.stops.map((stop) => ({
        ...stop,
        transparency: combineFillTransparency(stop.transparency, transparency),
      })),
    };
  }

  const radialGradient = parseRadialGradient(color, context);
  if (isRadialGradientFill(radialGradient)) {
    return {
      ...radialGradient,
      stops: radialGradient.stops.map((stop) => ({
        ...stop,
        transparency: combineFillTransparency(stop.transparency, transparency),
      })),
    };
  }

  const parsed = parseCssColor(color);
  return parsed
    ? {
        kind: "solid",
        color: parsed.color,
        transparency: normalizeTransparency(transparency ?? alphaToTransparency(parsed.alpha)),
      }
    : undefined;
}

function parseBackgroundImageSource(value: string): ImageSourceIR | undefined {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("url(") || !trimmed.endsWith(")")) {
    return undefined;
  }

  const inner = trimmed.slice(4, -1).trim();
  const unquoted =
    (inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))
      ? inner.slice(1, -1)
      : inner;

  if (!unquoted) {
    throw new Error("backgroundImage url() requires a non-empty source.");
  }

  return unquoted.startsWith("data:")
    ? { kind: "data", data: unquoted }
    : { kind: "path", path: unquoted };
}

function parseBackgroundSizeComponent(value: string, axisSizeEmu: number): number | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "auto") {
    return undefined;
  }

  if (trimmed === "0") {
    return 0;
  }

  return parseLengthToken(trimmed, axisSizeEmu, NaN);
}

function resolveBackgroundImageSizing(
  value: string | undefined,
  frame: Frame,
): BackgroundImageSizing | undefined {
  if (!value) {
    return {
      fit: "stretch",
    };
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return {
      fit: "stretch",
    };
  }

  if (trimmed === "cover" || trimmed === "contain") {
    return {
      fit: trimmed,
    };
  }

  if (trimmed === "stretch" || trimmed === "100% 100%") {
    return {
      fit: "stretch",
    };
  }

  const tokens = splitCssValueTokens(trimmed);
  if (tokens.length === 0 || tokens.length > 2) {
    throw new Error(
      `Unsupported backgroundSize value: ${value}. Supported values are cover, contain, 100% 100%, or one/two explicit size components.`,
    );
  }

  const [widthToken, heightToken] = tokens;
  if (widthToken === undefined) {
    throw new Error(
      `Unsupported backgroundSize value: ${value}. Supported values are cover, contain, 100% 100%, or one/two explicit size components.`,
    );
  }

  const widthEmu = parseBackgroundSizeComponent(widthToken, frame.widthEmu);
  const heightEmu =
    heightToken === undefined
      ? undefined
      : parseBackgroundSizeComponent(heightToken, frame.heightEmu);

  return {
    fit: "size",
    ...(widthEmu !== undefined || heightEmu !== undefined
      ? {
          size: {
            ...(widthEmu !== undefined ? { widthEmu } : {}),
            ...(heightEmu !== undefined ? { heightEmu } : {}),
          },
        }
      : {}),
  };
}

function resolveBackgroundImageRepeat(value?: string): BackgroundImageLayerIR["repeat"] {
  if (!value) {
    return "no-repeat";
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "no-repeat";
  }

  if (
    trimmed === "no-repeat" ||
    trimmed === "repeat-x" ||
    trimmed === "repeat-y" ||
    trimmed === "repeat"
  ) {
    return trimmed;
  }

  throw new Error(
    `Unsupported backgroundRepeat value: ${value}. Supported values are no-repeat, repeat-x, repeat-y, and repeat.`,
  );
}

function resolveLayerListValue(values: string[] | undefined, index: number) {
  if (!values || values.length === 0) {
    return undefined;
  }

  if (values.length === 1) {
    return values[0];
  }

  return values[index];
}

function toBackgroundImageLayer(
  value: string,
  transparency: number | undefined,
  frame: Frame,
  positioningFrame: Frame,
  backgroundPosition?: string,
  backgroundSize?: string,
  backgroundRepeat?: string,
): BackgroundImageLayerIR | undefined {
  const source = parseBackgroundImageSource(value);
  if (!source) {
    return undefined;
  }

  const objectPosition = parseObjectPosition(backgroundPosition, {
    widthEmu: positioningFrame.widthEmu,
    heightEmu: positioningFrame.heightEmu,
  });
  const sizing = resolveBackgroundImageSizing(backgroundSize, positioningFrame) ?? {
    fit: "stretch",
  };

  return {
    kind: "background-image",
    frame: { ...frame },
    sourceFrame: { ...positioningFrame },
    source,
    fit: sizing.fit,
    ...(sizing.size ? { size: sizing.size } : {}),
    repeat: resolveBackgroundImageRepeat(backgroundRepeat),
    ...(objectPosition ? { objectPosition } : {}),
    ...(normalizeTransparency(transparency) !== undefined
      ? { transparency: normalizeTransparency(transparency) }
      : {}),
  };
}

function parseBackgroundShorthandLayer(
  value: string,
  transparency: number | undefined,
  context?: { widthEmu: number; heightEmu: number },
  frame?: Frame,
  boxFrames?: BackgroundBoxFrames,
  backgroundPosition?: string,
  backgroundSize?: string,
  backgroundRepeat?: string,
  backgroundOrigin?: string,
  backgroundClip?: string,
): BackgroundLayerIR[] | undefined {
  const { before, after } = splitTopLevelSlash(value);
  const beforeTokens = splitCssValueTokens(before);
  const afterTokens = after ? splitCssValueTokens(after) : [];
  const repeatTokens = new Set(["no-repeat", "repeat-x", "repeat-y", "repeat"]);

  let imageToken: string | undefined;
  let fillToken: string | undefined;
  let colorToken: string | undefined;
  let repeatToken: string | undefined;
  const boxTokens: string[] = [];
  const positionTokens: string[] = [];

  for (const token of beforeTokens) {
    const lower = token.toLowerCase();
    if (!imageToken && parseBackgroundImageSource(token)) {
      imageToken = token;
      continue;
    }

    if (!colorToken && parseCssColor(token)) {
      colorToken = token;
      continue;
    }

    if (!fillToken && toFill(token, transparency, context)) {
      fillToken = token;
      continue;
    }

    if (!repeatToken && repeatTokens.has(lower)) {
      repeatToken = lower;
      continue;
    }

    if (isBackgroundBoxToken(lower)) {
      boxTokens.push(lower);
      continue;
    }

    positionTokens.push(token);
  }

  if (!imageToken && !fillToken && !colorToken) {
    return undefined;
  }

  if (!frame) {
    throw new Error(`Background image layers require a frame: ${value}`);
  }

  const explicitOrigin = backgroundOrigin
    ? resolveBackgroundBoxKeyword(backgroundOrigin, "backgroundOrigin")
    : undefined;
  const explicitClip = backgroundClip
    ? resolveBackgroundBoxKeyword(backgroundClip, "backgroundClip")
    : undefined;
  const shorthandOrigin =
    boxTokens.length >= 1
      ? resolveBackgroundBoxKeyword(boxTokens[0], "backgroundOrigin")
      : undefined;
  const shorthandClip =
    boxTokens.length >= 2
      ? resolveBackgroundBoxKeyword(boxTokens[1], "backgroundClip")
      : shorthandOrigin;
  const resolvedOrigin = explicitOrigin ?? shorthandOrigin ?? "border-box";
  const resolvedClip = explicitClip ?? shorthandClip ?? "border-box";
  const layerPositioningFrame = boxFrames
    ? selectBackgroundBoxFrame(boxFrames, resolvedOrigin)
    : frame;
  const layerPaintFrame = boxFrames ? selectBackgroundBoxFrame(boxFrames, resolvedClip) : frame;

  if (!imageToken) {
    if (repeatToken || positionTokens.length > 0 || afterTokens.length > 0) {
      return undefined;
    }

    const fill = toFill(fillToken ?? colorToken, transparency, {
      widthEmu: layerPositioningFrame.widthEmu,
      heightEmu: layerPositioningFrame.heightEmu,
    });
    if (!fill) {
      return undefined;
    }

    const layers: BackgroundLayerIR[] = [
      withBackgroundFillFrame(fill, layerPaintFrame, boxFrames?.borderBox ?? frame),
    ];

    if (fillToken && colorToken && fillToken !== colorToken) {
      const colorFill = toFill(colorToken, transparency, context);
      if (colorFill) {
        layers.push(
          withBackgroundFillFrame(colorFill, layerPaintFrame, boxFrames?.borderBox ?? frame),
        );
      }
    }

    return layers;
  }

  const layers: BackgroundLayerIR[] = [];
  const imageLayer = toBackgroundImageLayer(
    imageToken,
    transparency,
    layerPaintFrame,
    layerPositioningFrame,
    backgroundPosition ?? (positionTokens.length > 0 ? positionTokens.join(" ") : undefined),
    backgroundSize ?? (afterTokens.length > 0 ? afterTokens.join(" ") : undefined),
    backgroundRepeat ?? repeatToken,
  );

  if (!imageLayer) {
    return undefined;
  }

  layers.push(imageLayer);

  if (colorToken) {
    const colorFill = toFill(colorToken, transparency, context);
    if (colorFill) {
      layers.push(
        withBackgroundFillFrame(colorFill, layerPaintFrame, boxFrames?.borderBox ?? frame),
      );
    }
  }

  return layers;
}

function toBackgroundLayers(
  value?: string,
  transparency?: number,
  context?: { widthEmu: number; heightEmu: number },
  frame?: Frame,
  boxFrames?: BackgroundBoxFrames,
  backgroundPosition?: string,
  backgroundSize?: string,
  backgroundRepeat?: string,
  backgroundOrigin?: string,
  backgroundClip?: string,
): BackgroundLayerIR[] | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return undefined;
  }

  const backgroundPositions = backgroundPosition
    ? splitTopLevelCommas(backgroundPosition).map((part) => part.trim())
    : undefined;
  const backgroundSizes = backgroundSize
    ? splitTopLevelCommas(backgroundSize).map((part) => part.trim())
    : undefined;
  const backgroundRepeats = backgroundRepeat
    ? splitTopLevelCommas(backgroundRepeat).map((part) => part.trim())
    : undefined;
  const backgroundOrigins = backgroundOrigin
    ? splitTopLevelCommas(backgroundOrigin).map((part) => part.trim())
    : undefined;
  const backgroundClips = backgroundClip
    ? splitTopLevelCommas(backgroundClip).map((part) => part.trim())
    : undefined;

  const layers = splitTopLevelCommas(trimmed)
    .flatMap((part, index) => {
      const { positioningFrame, paintFrame } = resolveBackgroundLayerFrames(
        frame,
        boxFrames,
        resolveLayerListValue(backgroundOrigins, index),
        resolveLayerListValue(backgroundClips, index),
      );
      const fill = toFill(
        part,
        transparency,
        positioningFrame
          ? {
              widthEmu: positioningFrame.widthEmu,
              heightEmu: positioningFrame.heightEmu,
            }
          : context,
      );
      if (fill) {
        return [withBackgroundFillFrame(fill, paintFrame, boxFrames?.borderBox ?? frame)];
      }

      const shorthandLayers = parseBackgroundShorthandLayer(
        part,
        transparency,
        context,
        frame,
        boxFrames,
        resolveLayerListValue(backgroundPositions, index),
        resolveLayerListValue(backgroundSizes, index),
        resolveLayerListValue(backgroundRepeats, index),
        resolveLayerListValue(backgroundOrigins, index),
        resolveLayerListValue(backgroundClips, index),
      );
      if (shorthandLayers) {
        return shorthandLayers;
      }

      if (!frame) {
        return [];
      }

      const layerPaintFrame = paintFrame ?? frame;
      const layerPositioningFrame = positioningFrame ?? frame;
      const imageLayer = toBackgroundImageLayer(
        part,
        transparency,
        layerPaintFrame,
        layerPositioningFrame,
        resolveLayerListValue(backgroundPositions, index),
        resolveLayerListValue(backgroundSizes, index),
        resolveLayerListValue(backgroundRepeats, index),
      );
      return imageLayer ? [imageLayer] : [];
    })
    .filter((layer): layer is BackgroundLayerIR => layer !== undefined);

  return layers.length > 0 ? layers : undefined;
}

function isBackgroundImageLayer(layer: BackgroundLayerIR): layer is BackgroundImageLayerIR {
  return layer.kind === "background-image";
}

function topLayerFill(layer: BackgroundLayerIR | undefined): FillIR | undefined {
  if (!layer || isBackgroundImageLayer(layer) || layer.frame !== undefined) {
    return undefined;
  }

  return layer;
}

export function resolveBackgroundLayers(
  value?: string,
  transparency?: number,
  context?: { widthEmu: number; heightEmu: number },
  frame?: Frame,
  boxFrames?: BackgroundBoxFrames,
  backgroundPosition?: string,
  backgroundSize?: string,
  backgroundRepeat?: string,
  backgroundOrigin?: string,
  backgroundClip?: string,
): {
  fill?: FillIR;
  backgroundLayers?: BackgroundLayerIR[];
} {
  const layers = toBackgroundLayers(
    value,
    transparency,
    context,
    frame,
    boxFrames,
    backgroundPosition,
    backgroundSize,
    backgroundRepeat,
    backgroundOrigin,
    backgroundClip,
  );
  if (!layers || layers.length === 0) {
    return {};
  }

  const [topLayer, ...remainingLayers] = layers;
  const fill = topLayerFill(topLayer);
  const backgroundLayers =
    fill === undefined
      ? [...layers].reverse()
      : remainingLayers.length > 0
        ? [...remainingLayers].reverse()
        : undefined;

  return {
    fill,
    backgroundLayers: backgroundLayers?.map((layer) =>
      ensureBackgroundFillLayerFrame(layer, frame),
    ),
  };
}

function splitCssValueTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

export function parseObjectPosition(
  value?: string,
  context?: { widthEmu: number; heightEmu: number },
): { x: number; y: number } | undefined {
  if (!value) {
    return undefined;
  }

  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  const parsePositionRatio = (token: string, axisSizeEmu: number | undefined) => {
    const trimmed = token.trim().toLowerCase();
    if (trimmed === "0") {
      return 0;
    }

    const percentage = parsePercentage(trimmed);
    if (percentage !== undefined) {
      return Math.max(0, Math.min(1, percentage / 100));
    }

    if (axisSizeEmu === undefined || axisSizeEmu <= 0) {
      return undefined;
    }

    try {
      return Math.max(0, Math.min(1, parseLengthToken(trimmed, axisSizeEmu, NaN) / axisSizeEmu));
    } catch {
      return undefined;
    }
  };

  const parseXToken = (token: string) => {
    switch (token.toLowerCase()) {
      case "left":
        return 0;
      case "center":
        return 0.5;
      case "right":
        return 1;
      default:
        return parsePositionRatio(token, context?.widthEmu);
    }
  };

  const parseYToken = (token: string) => {
    switch (token.toLowerCase()) {
      case "top":
        return 0;
      case "center":
        return 0.5;
      case "bottom":
        return 1;
      default:
        return parsePositionRatio(token, context?.heightEmu);
    }
  };

  const parseAxisComponent = (
    axis: "x" | "y",
    startIndex: number,
  ): { value: number; consumed: number } | undefined => {
    const token = tokens[startIndex]?.toLowerCase();
    if (!token) {
      return undefined;
    }

    const startKeyword = axis === "x" ? "left" : "top";
    const endKeyword = axis === "x" ? "right" : "bottom";
    const axisSizeEmu = axis === "x" ? context?.widthEmu : context?.heightEmu;

    if (token === "center") {
      return { value: 0.5, consumed: 1 };
    }

    if (token === startKeyword || token === endKeyword) {
      const nextToken = tokens[startIndex + 1];
      const offset = nextToken ? parsePositionRatio(nextToken, axisSizeEmu) : undefined;
      if (offset !== undefined) {
        return {
          value: token === startKeyword ? offset : 1 - offset,
          consumed: 2,
        };
      }

      return { value: token === startKeyword ? 0 : 1, consumed: 1 };
    }

    const ratio = parsePositionRatio(token, axisSizeEmu);
    if (ratio !== undefined) {
      return { value: ratio, consumed: 1 };
    }

    return undefined;
  };

  if (tokens.length === 1) {
    const [token] = tokens;
    if (token === undefined) {
      return undefined;
    }

    const x = parseXToken(token);
    if (x !== undefined) {
      return { x, y: 0.5 };
    }

    const y = parseYToken(token);
    if (y !== undefined) {
      return { x: 0.5, y };
    }

    return undefined;
  }

  if (tokens.length === 2) {
    const [firstToken, secondToken] = tokens;
    if (firstToken === undefined || secondToken === undefined) {
      return undefined;
    }

    const firstX = parseXToken(firstToken);
    const firstY = parseYToken(firstToken);
    const secondX = parseXToken(secondToken);
    const secondY = parseYToken(secondToken);

    if (firstX !== undefined && secondY !== undefined) {
      return { x: firstX, y: secondY };
    }

    if (firstY !== undefined && secondX !== undefined) {
      return { x: secondX, y: firstY };
    }
  }

  if (tokens.length >= 3 && tokens.length <= 4) {
    let x: number | undefined;
    let y: number | undefined;
    let index = 0;

    while (index < tokens.length) {
      const token = tokens[index]?.toLowerCase();
      if (token === undefined) {
        return undefined;
      }

      const xSpecific = token === "left" || token === "right";
      const ySpecific = token === "top" || token === "bottom";

      if ((xSpecific || (!ySpecific && x === undefined)) && x === undefined) {
        const parsed = parseAxisComponent("x", index);
        if (!parsed) {
          return undefined;
        }
        x = parsed.value;
        index += parsed.consumed;
        continue;
      }

      if ((ySpecific || y === undefined) && y === undefined) {
        const parsed = parseAxisComponent("y", index);
        if (!parsed) {
          return undefined;
        }
        y = parsed.value;
        index += parsed.consumed;
        continue;
      }

      return undefined;
    }

    if (x === undefined && y === undefined) {
      return undefined;
    }

    return { x: x ?? 0.5, y: y ?? 0.5 };
  }

  return undefined;
}

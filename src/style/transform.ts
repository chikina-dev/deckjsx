import type { DeckLength } from "../authoring/index";
import { EMU_PER_INCH, PIXELS_PER_INCH } from "../types";
import { normalizeHue } from "./angle";
import {
  isDeckLengthString,
  parseLengthToken,
  parsePercentage,
  type LengthResolutionContext,
} from "./length";

export type ParsedTransformOperation =
  | {
      kind: "rotate";
      angle: number;
    }
  | {
      kind: "translate";
      x: DeckLength;
      y: DeckLength;
    }
  | {
      kind: "scale";
      x: number;
      y: number;
    }
  | {
      kind: "skew";
      x: number;
      y: number;
    }
  | {
      kind: "matrix";
      a: number;
      b: number;
      c: number;
      d: number;
      txPx: number;
      tyPx: number;
    };

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

function splitTopLevelCommaList(value: string): string[] {
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
      if (current.trim()) {
        parts.push(current.trim());
      }
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

function parseTransformArgs(rawArgs: string): string[] {
  const commaArgs = splitTopLevelCommaList(rawArgs);
  return commaArgs.length > 1 ? commaArgs : splitCssValueTokens(rawArgs).filter((token) => token);
}

function requireSingleTransformArg(args: string[], message: string): string {
  const [arg] = args;
  if (arg === undefined || args.length !== 1) {
    throw new Error(message);
  }

  return arg;
}

function requireOneOrTwoTransformArgs(args: string[], message: string): [string, string?] {
  const [first, second] = args;
  if (first === undefined || args.length > 2) {
    throw new Error(message);
  }

  return second === undefined ? [first] : [first, second];
}

function requireSixTransformArgs(
  args: string[],
  message: string,
): [string, string, string, string, string, string] {
  const [first, second, third, fourth, fifth, sixth] = args;
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined ||
    args.length !== 6
  ) {
    throw new Error(message);
  }

  return [first, second, third, fourth, fifth, sixth];
}

export function parseTransformOrigin(
  value: string | undefined,
  context: { widthEmu: number; heightEmu: number },
  lengthContext?: LengthResolutionContext,
) {
  if (!value) {
    return { x: 0.5, y: 0.5 };
  }

  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  if (tokens.length > 2) {
    throw new Error(
      `Unsupported transformOrigin value: ${value}. Supported syntax is one or two keyword, percentage, or length values.`,
    );
  }

  const isHorizontalKeyword = (token: string) =>
    token === "left" || token === "center" || token === "right";
  const isVerticalKeyword = (token: string) =>
    token === "top" || token === "center" || token === "bottom";

  const parseAxisValue = (token: string, axis: "x" | "y") => {
    const normalized = token.toLowerCase();
    if (normalized === "center") {
      return 0.5;
    }
    if (axis === "x") {
      if (normalized === "left") {
        return 0;
      }
      if (normalized === "right") {
        return 1;
      }
    } else {
      if (normalized === "top") {
        return 0;
      }
      if (normalized === "bottom") {
        return 1;
      }
    }

    const percentage = parsePercentage(normalized);
    if (percentage !== undefined) {
      return percentage / 100;
    }

    const axisSizeEmu = axis === "x" ? context.widthEmu : context.heightEmu;
    if (axisSizeEmu === 0) {
      return 0;
    }

    return parseLengthToken(normalized, axisSizeEmu, 0, lengthContext) / axisSizeEmu;
  };

  if (tokens.length === 1) {
    const token = tokens[0]?.toLowerCase();
    if (token === undefined) {
      return { x: 0.5, y: 0.5 };
    }

    if (isVerticalKeyword(token) && token !== "center") {
      return {
        x: 0.5,
        y: parseAxisValue(token, "y"),
      };
    }

    return {
      x: parseAxisValue(token, "x"),
      y: 0.5,
    };
  }

  const [firstToken, secondToken] = tokens.map((token) => token.toLowerCase());
  if (firstToken === undefined || secondToken === undefined) {
    return { x: 0.5, y: 0.5 };
  }

  const swap = isVerticalKeyword(firstToken) && isHorizontalKeyword(secondToken);
  const xToken = swap ? secondToken : firstToken;
  const yToken = swap ? firstToken : secondToken;

  return {
    x: parseAxisValue(xToken, "x"),
    y: parseAxisValue(yToken, "y"),
  };
}

export function normalizeRotation(angle: number) {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized === 0 ? 0 : normalized;
}

export function rotateVectorClockwise(dx: number, dy: number, angle: number) {
  const radians = (normalizeRotation(angle) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: dx * cosine + dy * sine,
    y: -dx * sine + dy * cosine,
  };
}

export function skewVector(dx: number, dy: number, skewXAngle: number, skewYAngle: number) {
  const skewXRadians = (skewXAngle * Math.PI) / 180;
  const skewYRadians = (skewYAngle * Math.PI) / 180;
  const tanX = Math.tan(skewXRadians);
  const tanY = Math.tan(skewYRadians);

  return {
    x: dx + tanX * dy,
    y: tanY * dx + dy,
  };
}

export function applyAffineMatrix(
  dx: number,
  dy: number,
  matrix: {
    a: number;
    b: number;
    c: number;
    d: number;
    txEmu: number;
    tyEmu: number;
  },
) {
  return {
    x: matrix.a * dx + matrix.c * dy + matrix.txEmu,
    y: matrix.b * dx + matrix.d * dy + matrix.tyEmu,
  };
}

function parseTransformNumberArgument(value: string) {
  const trimmed = value.trim();
  if (!/^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
    throw new Error(`Unsupported transform numeric value: ${value}`);
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unsupported transform numeric value: ${value}`);
  }

  return parsed;
}

function parseTransformLengthArgument(value: string): DeckLength {
  const trimmed = value.trim();
  if (trimmed === "0") {
    return 0;
  }

  if (/^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
    throw new Error(
      `Unsupported transform length value without unit: ${value}. Only unitless zero is currently supported.`,
    );
  }

  if (!isDeckLengthString(trimmed)) {
    throw new Error(`Unsupported transform length value: ${value}`);
  }

  return trimmed;
}

export function parseTransformShorthand(value?: string): ParsedTransformOperation[] | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return undefined;
  }

  const transformPattern = /([a-zA-Z][a-zA-Z0-9]*)\(([^()]*)\)/g;
  let lastIndex = 0;
  let matched = false;
  const operations: ParsedTransformOperation[] = [];

  for (const match of trimmed.matchAll(transformPattern)) {
    if (match.index === undefined) {
      continue;
    }

    if (trimmed.slice(lastIndex, match.index).trim()) {
      throw new Error(`Unsupported transform syntax: ${value}`);
    }

    matched = true;
    lastIndex = match.index + match[0].length;
    const matchedName = match[1];
    const matchedArgs = match[2];
    if (matchedName === undefined || matchedArgs === undefined) {
      throw new Error(`Unsupported transform syntax: ${value}`);
    }

    const name = matchedName.toLowerCase();
    const rawArgs = matchedArgs.trim();

    switch (name) {
      case "rotate":
      case "rotatez": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          `${name}() requires exactly one angle value.`,
        );

        const angle = normalizeHue(arg);
        if (angle === undefined || !Number.isFinite(angle)) {
          throw new Error(`Unsupported transform angle: ${arg}`);
        }

        operations.push({
          kind: "rotate",
          angle,
        });
        break;
      }

      case "translatex": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          "translateX() requires exactly one length or percentage value.",
        );

        operations.push({
          kind: "translate",
          x: parseTransformLengthArgument(arg),
          y: 0,
        });
        break;
      }

      case "translatey": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          "translateY() requires exactly one length or percentage value.",
        );

        operations.push({
          kind: "translate",
          x: 0,
          y: parseTransformLengthArgument(arg),
        });
        break;
      }

      case "translate": {
        const [xArg, yArg] = requireOneOrTwoTransformArgs(
          parseTransformArgs(rawArgs),
          "translate() requires one or two length or percentage values.",
        );

        operations.push({
          kind: "translate",
          x: parseTransformLengthArgument(xArg),
          y: parseTransformLengthArgument(yArg ?? "0"),
        });
        break;
      }

      case "scalex": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          "scaleX() requires exactly one numeric value.",
        );

        operations.push({
          kind: "scale",
          x: parseTransformNumberArgument(arg),
          y: 1,
        });
        break;
      }

      case "scaley": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          "scaleY() requires exactly one numeric value.",
        );

        operations.push({
          kind: "scale",
          x: 1,
          y: parseTransformNumberArgument(arg),
        });
        break;
      }

      case "scale": {
        const [xArg, yArg] = requireOneOrTwoTransformArgs(
          parseTransformArgs(rawArgs),
          "scale() requires one or two numeric values.",
        );

        const x = parseTransformNumberArgument(xArg);
        const y = parseTransformNumberArgument(yArg ?? xArg);
        operations.push({
          kind: "scale",
          x,
          y,
        });
        break;
      }

      case "skewx": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          "skewX() requires exactly one angle value.",
        );

        const angle = normalizeHue(arg);
        if (angle === undefined || !Number.isFinite(angle)) {
          throw new Error(`Unsupported transform angle: ${arg}`);
        }

        operations.push({
          kind: "skew",
          x: angle,
          y: 0,
        });
        break;
      }

      case "skewy": {
        const arg = requireSingleTransformArg(
          splitCssValueTokens(rawArgs),
          "skewY() requires exactly one angle value.",
        );

        const angle = normalizeHue(arg);
        if (angle === undefined || !Number.isFinite(angle)) {
          throw new Error(`Unsupported transform angle: ${arg}`);
        }

        operations.push({
          kind: "skew",
          x: 0,
          y: angle,
        });
        break;
      }

      case "skew": {
        const [xArg, yArg] = requireOneOrTwoTransformArgs(
          parseTransformArgs(rawArgs),
          "skew() requires one or two angle values.",
        );

        const x = normalizeHue(xArg);
        const y = normalizeHue(yArg ?? "0deg");
        if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`Unsupported transform angle: ${rawArgs}`);
        }

        operations.push({
          kind: "skew",
          x,
          y,
        });
        break;
      }

      case "matrix": {
        const [aArg, bArg, cArg, dArg, txArg, tyArg] = requireSixTransformArgs(
          parseTransformArgs(rawArgs),
          "matrix() requires exactly six numeric values.",
        );

        operations.push({
          kind: "matrix",
          a: parseTransformNumberArgument(aArg),
          b: parseTransformNumberArgument(bArg),
          c: parseTransformNumberArgument(cArg),
          d: parseTransformNumberArgument(dArg),
          txPx: parseTransformNumberArgument(txArg),
          tyPx: parseTransformNumberArgument(tyArg),
        });
        break;
      }

      default:
        throw new Error(`Unsupported transform function: ${name}`);
    }
  }

  if (!matched || trimmed.slice(lastIndex).trim()) {
    throw new Error(`Unsupported transform syntax: ${value}`);
  }

  return operations;
}

export function matrixTranslatePxToEmu(value: number) {
  return (value / PIXELS_PER_INCH) * EMU_PER_INCH;
}

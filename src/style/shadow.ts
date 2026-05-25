import type { ShadowIR } from "../layout/projected";
import { parseCssColor } from "./color";
import { isDeckPointLengthString, parsePointToken } from "./length";

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

function tryParsePointToken(value: string): number | undefined {
  if (value === "0") {
    return 0;
  }

  if (!isDeckPointLengthString(value) || !/^-?(?:\d+|\d*\.\d+)(?:pt|in|px)$/i.test(value)) {
    return undefined;
  }

  return parsePointToken(value);
}

export function parseShadowShorthand(value?: string): ShadowIR | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return undefined;
  }

  const layers = splitTopLevelCommaList(trimmed);
  if (layers.length > 1) {
    throw new Error(`Only a single shadow layer is currently supported: ${value}`);
  }

  const [layer] = layers;
  if (layer === undefined) {
    return undefined;
  }

  const tokens = splitCssValueTokens(layer);
  const filtered = tokens.filter((token) => token.toLowerCase() !== "inset");
  const type = tokens.some((token) => token.toLowerCase() === "inset") ? "inner" : "outer";
  const lengths: number[] = [];
  let parsedColor: ReturnType<typeof parseCssColor> | undefined;

  for (const token of filtered) {
    const color = parseCssColor(token);
    if (color) {
      parsedColor = color;
      continue;
    }

    const length = tryParsePointToken(token);
    if (length !== undefined) {
      lengths.push(length);
      continue;
    }

    throw new Error(`Unsupported shadow token: ${token}`);
  }

  if (lengths.length < 2 || lengths.length > 4) {
    throw new Error(`Shadow requires 2 to 4 length values: ${value}`);
  }

  const [offsetXPt, offsetYPt, blurPt = 0] = lengths;
  const offsetPt = Math.sqrt(offsetXPt ** 2 + offsetYPt ** 2);
  const angle = offsetPt === 0 ? 0 : (Math.atan2(-offsetYPt, offsetXPt) * 180) / Math.PI + 360;

  return {
    type,
    color: parsedColor?.color ?? "000000",
    opacity: parsedColor?.alpha,
    blurPt,
    offsetPt,
    angle: angle % 360,
  };
}

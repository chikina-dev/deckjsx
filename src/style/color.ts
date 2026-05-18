import { normalizeHue } from "./angle";

export type ParsedCssColor = {
  color: string;
  alpha?: number;
};

export function normalizeColor(value?: string): string | undefined {
  return parseCssColor(value)?.color;
}

export function alphaToTransparency(alpha: number | undefined): number | undefined {
  if (alpha === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round((1 - alpha) * 100)));
}

function parsePercentage(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed.endsWith("%")) {
    return undefined;
  }

  return Number.parseFloat(trimmed.slice(0, -1));
}

function parseAlphaValue(value: string): number | undefined {
  const percent = parsePercentage(value);
  if (percent !== undefined) {
    return Math.max(0, Math.min(1, percent / 100));
  }

  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, numeric));
}

function parseRgbChannel(value: string): number | undefined {
  const percent = parsePercentage(value);
  if (percent !== undefined) {
    return Math.round(Math.max(0, Math.min(255, (percent / 100) * 255)));
  }

  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return Math.round(Math.max(0, Math.min(255, numeric)));
}

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = l - chroma / 2;
  return {
    red: Math.round((red + match) * 255),
    green: Math.round((green + match) * 255),
    blue: Math.round((blue + match) * 255),
  };
}

function formatHexColor(red: number, green: number, blue: number) {
  return [red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: "F0F8FF",
  antiquewhite: "FAEBD7",
  aqua: "00FFFF",
  aquamarine: "7FFFD4",
  azure: "F0FFFF",
  beige: "F5F5DC",
  bisque: "FFE4C4",
  black: "000000",
  blanchedalmond: "FFEBCD",
  blue: "0000FF",
  blueviolet: "8A2BE2",
  brown: "A52A2A",
  burlywood: "DEB887",
  cadetblue: "5F9EA0",
  chartreuse: "7FFF00",
  chocolate: "D2691E",
  coral: "FF7F50",
  cornflowerblue: "6495ED",
  cornsilk: "FFF8DC",
  crimson: "DC143C",
  cyan: "00FFFF",
  darkblue: "00008B",
  darkcyan: "008B8B",
  darkgoldenrod: "B8860B",
  darkgray: "A9A9A9",
  darkgreen: "006400",
  darkgrey: "A9A9A9",
  darkkhaki: "BDB76B",
  darkmagenta: "8B008B",
  darkolivegreen: "556B2F",
  darkorange: "FF8C00",
  darkorchid: "9932CC",
  darkred: "8B0000",
  darksalmon: "E9967A",
  darkseagreen: "8FBC8F",
  darkslateblue: "483D8B",
  darkslategray: "2F4F4F",
  darkslategrey: "2F4F4F",
  darkturquoise: "00CED1",
  darkviolet: "9400D3",
  deeppink: "FF1493",
  deepskyblue: "00BFFF",
  dimgray: "696969",
  dimgrey: "696969",
  dodgerblue: "1E90FF",
  firebrick: "B22222",
  floralwhite: "FFFAF0",
  forestgreen: "228B22",
  fuchsia: "FF00FF",
  gainsboro: "DCDCDC",
  ghostwhite: "F8F8FF",
  gold: "FFD700",
  goldenrod: "DAA520",
  gray: "808080",
  green: "008000",
  greenyellow: "ADFF2F",
  grey: "808080",
  honeydew: "F0FFF0",
  hotpink: "FF69B4",
  indianred: "CD5C5C",
  indigo: "4B0082",
  ivory: "FFFFF0",
  khaki: "F0E68C",
  lavender: "E6E6FA",
  lavenderblush: "FFF0F5",
  lawngreen: "7CFC00",
  lemonchiffon: "FFFACD",
  lightblue: "ADD8E6",
  lightcoral: "F08080",
  lightcyan: "E0FFFF",
  lightgoldenrodyellow: "FAFAD2",
  lightgray: "D3D3D3",
  lightgreen: "90EE90",
  lightgrey: "D3D3D3",
  lightpink: "FFB6C1",
  lightsalmon: "FFA07A",
  lightseagreen: "20B2AA",
  lightskyblue: "87CEFA",
  lightslategray: "778899",
  lightslategrey: "778899",
  lightsteelblue: "B0C4DE",
  lightyellow: "FFFFE0",
  lime: "00FF00",
  limegreen: "32CD32",
  linen: "FAF0E6",
  magenta: "FF00FF",
  maroon: "800000",
  mediumaquamarine: "66CDAA",
  mediumblue: "0000CD",
  mediumorchid: "BA55D3",
  mediumpurple: "9370DB",
  mediumseagreen: "3CB371",
  mediumslateblue: "7B68EE",
  mediumspringgreen: "00FA9A",
  mediumturquoise: "48D1CC",
  mediumvioletred: "C71585",
  midnightblue: "191970",
  mintcream: "F5FFFA",
  mistyrose: "FFE4E1",
  moccasin: "FFE4B5",
  navajowhite: "FFDEAD",
  navy: "000080",
  oldlace: "FDF5E6",
  olive: "808000",
  olivedrab: "6B8E23",
  orange: "FFA500",
  orangered: "FF4500",
  orchid: "DA70D6",
  palegoldenrod: "EEE8AA",
  palegreen: "98FB98",
  paleturquoise: "AFEEEE",
  palevioletred: "DB7093",
  papayawhip: "FFEFD5",
  peachpuff: "FFDAB9",
  peru: "CD853F",
  pink: "FFC0CB",
  plum: "DDA0DD",
  powderblue: "B0E0E6",
  purple: "800080",
  rebeccapurple: "663399",
  red: "FF0000",
  rosybrown: "BC8F8F",
  royalblue: "4169E1",
  saddlebrown: "8B4513",
  salmon: "FA8072",
  sandybrown: "F4A460",
  seagreen: "2E8B57",
  seashell: "FFF5EE",
  sienna: "A0522D",
  silver: "C0C0C0",
  skyblue: "87CEEB",
  slateblue: "6A5ACD",
  slategray: "708090",
  slategrey: "708090",
  snow: "FFFAFA",
  springgreen: "00FF7F",
  steelblue: "4682B4",
  tan: "D2B48C",
  teal: "008080",
  thistle: "D8BFD8",
  tomato: "FF6347",
  turquoise: "40E0D0",
  violet: "EE82EE",
  wheat: "F5DEB3",
  white: "FFFFFF",
  whitesmoke: "F5F5F5",
  yellow: "FFFF00",
  yellowgreen: "9ACD32",
  transparent: "000000",
};

export function parseCssColor(value?: string): ParsedCssColor | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const hex = trimmed.match(/^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const normalized = hex.toUpperCase();

    if (normalized.length === 3 || normalized.length === 4) {
      const expanded = normalized
        .split("")
        .map((char) => char + char)
        .join("");
      return {
        color: expanded.slice(0, 6),
        alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : undefined,
      };
    }

    return {
      color: normalized.slice(0, 6),
      alpha:
        normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : undefined,
    };
  }

  const lowered = trimmed.toLowerCase();
  const named = CSS_NAMED_COLORS[lowered];
  if (named) {
    return {
      color: named,
      alpha: lowered === "transparent" ? 0 : undefined,
    };
  }

  const rgbMatch = trimmed.match(/^rgba?\((.*)\)$/i);
  if (rgbMatch) {
    const inner = rgbMatch[1];
    if (inner === undefined) {
      return undefined;
    }

    const [channelsPart, alphaPart] = inner.includes("/")
      ? inner.split("/", 2).map((part) => part.trim())
      : [inner.trim(), undefined];
    const channelTokens = channelsPart.includes(",")
      ? channelsPart.split(",").map((part) => part.trim())
      : channelsPart.split(/\s+/).filter(Boolean);
    const alphaToken = alphaPart ?? (channelTokens.length === 4 ? channelTokens.pop() : undefined);

    if (channelTokens.length !== 3) {
      return undefined;
    }

    const [redToken, greenToken, blueToken] = channelTokens;
    if (redToken === undefined || greenToken === undefined || blueToken === undefined) {
      return undefined;
    }

    const red = parseRgbChannel(redToken);
    const green = parseRgbChannel(greenToken);
    const blue = parseRgbChannel(blueToken);
    const alpha = alphaToken === undefined ? undefined : parseAlphaValue(alphaToken);

    if (red === undefined || green === undefined || blue === undefined) {
      return undefined;
    }

    return {
      color: formatHexColor(red, green, blue),
      alpha,
    };
  }

  const hslMatch = trimmed.match(/^hsla?\((.*)\)$/i);
  if (hslMatch) {
    const inner = hslMatch[1];
    if (inner === undefined) {
      return undefined;
    }

    const [channelsPart, alphaPart] = inner.includes("/")
      ? inner.split("/", 2).map((part) => part.trim())
      : [inner.trim(), undefined];
    const channelTokens = channelsPart.includes(",")
      ? channelsPart.split(",").map((part) => part.trim())
      : channelsPart.split(/\s+/).filter(Boolean);
    const alphaToken = alphaPart ?? (channelTokens.length === 4 ? channelTokens.pop() : undefined);

    if (channelTokens.length !== 3) {
      return undefined;
    }

    const [hueToken, saturationToken, lightnessToken] = channelTokens;
    if (hueToken === undefined || saturationToken === undefined || lightnessToken === undefined) {
      return undefined;
    }

    const hue = normalizeHue(hueToken);
    const saturation = parsePercentage(saturationToken);
    const lightness = parsePercentage(lightnessToken);
    const alpha = alphaToken === undefined ? undefined : parseAlphaValue(alphaToken);

    if (hue === undefined || saturation === undefined || lightness === undefined) {
      return undefined;
    }

    const rgb = hslToRgb(hue, saturation / 100, lightness / 100);
    return {
      color: formatHexColor(rgb.red, rgb.green, rgb.blue),
      alpha,
    };
  }
}

import { create, type FontKitFont } from "fontkit";
import bidiFactory, { type Bidi } from "bidi-js";
import { parseTrueTypeCodeUnitGlyphIds } from "./truetype";

export type ShapedTextGlyph = {
  readonly glyphId: number;
  readonly unicode: string;
  /** Shaped advance in 1/1000 em units. */
  readonly advanceWidth: number;
  readonly advanceAdjustment?: number;
  readonly xOffset?: number;
  readonly yOffset?: number;
};

export type ShapedText = {
  readonly unitsPerEm: number;
  readonly advanceWidth: number;
  readonly glyphs: readonly ShapedTextGlyph[];
  readonly direction?: string;
};

export type ShapedPdfGlyphRun = {
  readonly glyphs: readonly ShapedTextGlyph[];
  /** Logical source text retained when the visual glyph order differs. */
  readonly actualText?: string;
};

export type FontShapingDiagnostic = {
  readonly code: "W_FONT_SHAPING_FALLBACK" | "W_TEXT_BIDI_FALLBACK";
  readonly message: string;
};

export type FontShapingResult<T> = {
  readonly value?: T;
  readonly diagnostic?: FontShapingDiagnostic;
};

const fontCache = new WeakMap<Uint8Array, FontKitFont | FontShapingDiagnostic>();
let bidi: Bidi | FontShapingDiagnostic | undefined;

type BidiTextDirection = "ltr" | "rtl";

type BidiCharacter = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly direction: BidiTextDirection;
};

type BidiVisualRun = {
  readonly text: string;
  readonly direction: BidiTextDirection;
};

type OpenTypeScriptRun = {
  readonly text: string;
  readonly script?: string;
};

type ScriptCharacter = {
  readonly text: string;
  script?: string;
  readonly neutral: boolean;
};

function fontForBytes(data: Uint8Array): FontKitFont | FontShapingDiagnostic {
  const cached = fontCache.get(data);
  if (cached) {
    return cached;
  }

  try {
    const font = create(data);
    fontCache.set(data, font);
    return font;
  } catch (error) {
    const diagnostic: FontShapingDiagnostic = {
      code: "W_FONT_SHAPING_FALLBACK",
      message: `OpenType shaping was unavailable for the registered font bytes: ${
        error instanceof Error ? error.message : "unknown fontkit error"
      }`,
    };
    fontCache.set(data, diagnostic);
    return diagnostic;
  }
}

function bidiForText(): Bidi | FontShapingDiagnostic {
  if (bidi) {
    return bidi;
  }

  try {
    bidi = bidiFactory();
    return bidi;
  } catch (error) {
    bidi = {
      code: "W_TEXT_BIDI_FALLBACK",
      message: `Unicode bidirectional analysis was unavailable: ${
        error instanceof Error ? error.message : "unknown bidi-js error"
      }`,
    };
    return bidi;
  }
}

function shapeFontText(input: {
  readonly font: FontKitFont;
  readonly text: string;
  readonly direction?: BidiTextDirection;
  readonly script?: string;
}): FontShapingResult<ShapedText> {
  const { font, text, direction, script } = input;
  try {
    const run = font.layout(text, undefined, script, undefined, direction);
    if (run.glyphs.length !== run.positions.length) {
      return {
        diagnostic: {
          code: "W_FONT_SHAPING_FALLBACK",
          message: "OpenType shaping returned mismatched glyph and position counts.",
        },
      };
    }

    return {
      value: {
        unitsPerEm: font.unitsPerEm,
        advanceWidth: run.advanceWidth,
        glyphs: run.glyphs.map((glyph, index) => {
          const position = run.positions[index];
          const advanceWidth =
            position && glyph.advanceWidth !== undefined
              ? Math.round((position.xAdvance / font.unitsPerEm) * 1000)
              : 0;
          const adjustment =
            position && glyph.advanceWidth !== undefined
              ? Math.round(((position.xAdvance - glyph.advanceWidth) / font.unitsPerEm) * 1000)
              : 0;
          return {
            glyphId: glyph.id,
            unicode: String.fromCodePoint(...glyph.codePoints),
            advanceWidth,
            ...(adjustment !== 0 ? { advanceAdjustment: adjustment } : {}),
            ...(position?.xOffset
              ? { xOffset: Math.round((position.xOffset / font.unitsPerEm) * 1000) }
              : {}),
            ...(position?.yOffset
              ? { yOffset: Math.round((position.yOffset / font.unitsPerEm) * 1000) }
              : {}),
          };
        }),
        ...(run.direction ? { direction: run.direction } : {}),
      },
    };
  } catch (error) {
    return {
      diagnostic: {
        code: "W_FONT_SHAPING_FALLBACK",
        message: `OpenType shaping failed while laying out text: ${
          error instanceof Error ? error.message : "unknown fontkit error"
        }`,
      },
    };
  }
}

function openTypeScriptForCodePoint(codePoint: number): string | undefined {
  if (
    (codePoint >= 0x0041 && codePoint <= 0x024f) ||
    (codePoint >= 0x1e00 && codePoint <= 0x1eff)
  ) {
    return "latn";
  }
  if (
    (codePoint >= 0x0370 && codePoint <= 0x03ff) ||
    (codePoint >= 0x1f00 && codePoint <= 0x1fff)
  ) {
    return "grek";
  }
  if (
    (codePoint >= 0x0400 && codePoint <= 0x052f) ||
    (codePoint >= 0x2de0 && codePoint <= 0x2dff)
  ) {
    return "cyrl";
  }
  if (
    (codePoint >= 0x0590 && codePoint <= 0x05ff) ||
    (codePoint >= 0xfb1d && codePoint <= 0xfb4f)
  ) {
    return "hebr";
  }
  if (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  ) {
    return "arab";
  }
  if (
    (codePoint >= 0x0900 && codePoint <= 0x097f) ||
    (codePoint >= 0xa8e0 && codePoint <= 0xa8ff)
  ) {
    return "deva";
  }
  if (codePoint >= 0x0980 && codePoint <= 0x09ff) {
    return "beng";
  }
  if (codePoint >= 0x0a00 && codePoint <= 0x0a7f) {
    return "guru";
  }
  if (codePoint >= 0x0a80 && codePoint <= 0x0aff) {
    return "gujr";
  }
  if (codePoint >= 0x0b00 && codePoint <= 0x0b7f) {
    return "orya";
  }
  if (codePoint >= 0x0b80 && codePoint <= 0x0bff) {
    return "taml";
  }
  if (codePoint >= 0x0c00 && codePoint <= 0x0c7f) {
    return "telu";
  }
  if (codePoint >= 0x0c80 && codePoint <= 0x0cff) {
    return "knda";
  }
  if (codePoint >= 0x0d00 && codePoint <= 0x0d7f) {
    return "mlym";
  }
  if (codePoint >= 0x0d80 && codePoint <= 0x0dff) {
    return "sinh";
  }
  if (codePoint >= 0x0e00 && codePoint <= 0x0e7f) {
    return "thai";
  }
  if (codePoint >= 0x0e80 && codePoint <= 0x0eff) {
    return "lao";
  }
  if (
    (codePoint >= 0x1000 && codePoint <= 0x109f) ||
    (codePoint >= 0xaa60 && codePoint <= 0xaa7f) ||
    (codePoint >= 0xa9e0 && codePoint <= 0xa9ff)
  ) {
    return "mymr";
  }
  if (
    (codePoint >= 0x1780 && codePoint <= 0x17ff) ||
    (codePoint >= 0x19e0 && codePoint <= 0x19ff)
  ) {
    return "khmr";
  }
  if (codePoint >= 0x0530 && codePoint <= 0x058f) {
    return "armn";
  }
  if (
    (codePoint >= 0x10a0 && codePoint <= 0x10ff) ||
    (codePoint >= 0x2d00 && codePoint <= 0x2d2f)
  ) {
    return "geor";
  }
  return undefined;
}

function isNeutralScriptCharacter(text: string): boolean {
  return /^[\p{Mark}\p{Number}\p{Punctuation}\p{Separator}]$/u.test(text);
}

function openTypeScriptRuns(input: BidiVisualRun): readonly OpenTypeScriptRun[] {
  const characters: ScriptCharacter[] = Array.from(input.text, (text) => ({
    text,
    script: openTypeScriptForCodePoint(text.codePointAt(0) ?? 0),
    neutral: isNeutralScriptCharacter(text),
  }));
  let precedingScript: string | undefined;
  for (const character of characters) {
    if (character.script) {
      precedingScript = character.script;
    } else if (character.neutral && precedingScript) {
      character.script = precedingScript;
    }
  }
  let followingScript: string | undefined;
  for (const character of characters.toReversed()) {
    if (character.script) {
      followingScript = character.script;
    } else if (character.neutral && followingScript) {
      character.script = followingScript;
    }
  }

  const runs: OpenTypeScriptRun[] = [];
  for (const character of characters) {
    const previous = runs.at(-1);
    if (previous && previous.script === character.script) {
      runs[runs.length - 1] = { ...previous, text: `${previous.text}${character.text}` };
    } else {
      runs.push({
        text: character.text,
        ...(character.script ? { script: character.script } : {}),
      });
    }
  }
  return input.direction === "rtl" ? runs.toReversed() : runs;
}

function bidiVisualRuns(input: {
  readonly text: string;
  readonly direction?: BidiTextDirection;
}): FontShapingResult<readonly BidiVisualRun[]> {
  const analyzer = bidiForText();
  if ("code" in analyzer) {
    return { diagnostic: analyzer };
  }

  try {
    const levels = analyzer.getEmbeddingLevels(input.text, input.direction);
    const mirroredCharacters = analyzer.getMirroredCharactersMap(input.text, levels.levels);
    const charactersByStart = new Map<number, BidiCharacter>();
    for (let start = 0; start < input.text.length;) {
      const codePoint = input.text.codePointAt(start);
      if (codePoint === undefined) {
        break;
      }
      const text = String.fromCodePoint(codePoint);
      const end = start + text.length;
      charactersByStart.set(start, {
        start,
        end,
        text: mirroredCharacters.get(start) ?? text,
        direction: (levels.levels[start] ?? 0) % 2 === 0 ? "ltr" : "rtl",
      });
      start = end;
    }
    const visualCharacters = analyzer.getReorderedIndices(input.text, levels).flatMap((index) => {
      const character = charactersByStart.get(index);
      return character ? [character] : [];
    });
    const runs: BidiVisualRun[] = [];
    let runCharacters: BidiCharacter[] = [];
    for (const character of visualCharacters) {
      const previous = runCharacters.at(-1);
      const isLogicallyAdjacent =
        previous === undefined ||
        (character.direction === "ltr"
          ? character.start === previous.end
          : character.end === previous.start);
      if (previous && (previous.direction !== character.direction || !isLogicallyAdjacent)) {
        runs.push({
          direction: previous.direction,
          text:
            previous.direction === "rtl"
              ? runCharacters
                  .slice()
                  .reverse()
                  .map((item) => item.text)
                  .join("")
              : runCharacters.map((item) => item.text).join(""),
        });
        runCharacters = [];
      }
      runCharacters.push(character);
    }
    const previous = runCharacters.at(-1);
    if (previous) {
      runs.push({
        direction: previous.direction,
        text:
          previous.direction === "rtl"
            ? runCharacters
                .slice()
                .reverse()
                .map((item) => item.text)
                .join("")
            : runCharacters.map((item) => item.text).join(""),
      });
    }
    return { value: runs };
  } catch (error) {
    return {
      diagnostic: {
        code: "W_TEXT_BIDI_FALLBACK",
        message: `Unicode bidirectional analysis failed: ${
          error instanceof Error ? error.message : "unknown bidi-js error"
        }`,
      },
    };
  }
}

export function shapeText(data: Uint8Array, text: string): FontShapingResult<ShapedText> {
  if (text.length === 0) {
    return {
      value: { unitsPerEm: 1000, advanceWidth: 0, glyphs: [] },
    };
  }

  const font = fontForBytes(data);
  if ("code" in font) {
    return { diagnostic: font };
  }
  if (!font.unitsPerEm || !Number.isFinite(font.unitsPerEm)) {
    return {
      diagnostic: {
        code: "W_FONT_SHAPING_FALLBACK",
        message: "OpenType shaping was unavailable because the font has no valid unitsPerEm.",
      },
    };
  }

  return shapeFontText({ font, text });
}

export function shapedTextWidthUnits(data: Uint8Array, text: string): FontShapingResult<number> {
  const result = shapeText(data, text);
  return {
    ...(result.value
      ? { value: Math.round((result.value.advanceWidth / result.value.unitsPerEm) * 1000) }
      : {}),
    ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
  };
}

export function shapedGlyphRunForPdf(
  data: Uint8Array,
  text: string,
  options: {
    readonly direction?: BidiTextDirection;
    readonly includeUnmodifiedGlyphs?: boolean;
  } = {},
): FontShapingResult<ShapedPdfGlyphRun> {
  const font = fontForBytes(data);
  if ("code" in font) {
    return { diagnostic: font };
  }
  if (!font.unitsPerEm || !Number.isFinite(font.unitsPerEm)) {
    return {
      diagnostic: {
        code: "W_FONT_SHAPING_FALLBACK",
        message: "OpenType shaping was unavailable because the font has no valid unitsPerEm.",
      },
    };
  }
  const visualRuns = bidiVisualRuns({ text, ...options });
  if (!visualRuns.value) {
    return visualRuns.diagnostic ? { diagnostic: visualRuns.diagnostic } : {};
  }
  const shapedRuns: ShapedText[] = [];
  for (const visualRun of visualRuns.value) {
    for (const scriptRun of openTypeScriptRuns(visualRun)) {
      const result = shapeFontText({ font, direction: visualRun.direction, ...scriptRun });
      if (!result.value) {
        return result.diagnostic ? { diagnostic: result.diagnostic } : {};
      }
      shapedRuns.push(result.value);
    }
  }
  const glyphs = shapedRuns.flatMap((run) => run.glyphs);
  const codePoints = Array.from(text, (character) => character.codePointAt(0) ?? 0);
  const directGlyphIds = parseTrueTypeCodeUnitGlyphIds(data, codePoints);
  const substitutes =
    glyphs.length !== codePoints.length ||
    glyphs.some(
      (glyph, index) =>
        glyph.unicode !== String.fromCodePoint(codePoints[index] ?? 0) ||
        directGlyphIds.get(codePoints[index] ?? 0) !== glyph.glyphId,
    );
  const hasOffsets = glyphs.some(
    (glyph) => glyph.xOffset !== undefined || glyph.yOffset !== undefined,
  );
  const requiresVisualOrder =
    visualRuns.value.length !== 1 ||
    visualRuns.value[0]?.direction === "rtl" ||
    visualRuns.value[0]?.text !== text;
  return options.includeUnmodifiedGlyphs || substitutes || hasOffsets || requiresVisualOrder
    ? {
        value: {
          glyphs,
          ...(requiresVisualOrder ? { actualText: text } : {}),
        },
      }
    : {};
}

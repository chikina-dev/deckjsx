declare module "fontkit" {
  export type FontKitGlyph = {
    readonly id: number;
    readonly codePoints: readonly number[];
    readonly advanceWidth: number;
  };

  export type FontKitGlyphPosition = {
    readonly xAdvance: number;
    readonly yAdvance: number;
    readonly xOffset: number;
    readonly yOffset: number;
  };

  export type FontKitGlyphRun = {
    readonly glyphs: readonly FontKitGlyph[];
    readonly positions: readonly FontKitGlyphPosition[];
    readonly advanceWidth: number;
    readonly direction?: string;
  };

  export type FontKitFont = {
    readonly unitsPerEm: number;
    layout(
      text: string,
      features?: readonly string[] | Readonly<Record<string, boolean>>,
      script?: string,
      language?: string,
      direction?: "ltr" | "rtl",
    ): FontKitGlyphRun;
  };

  export function create(buffer: Uint8Array | ArrayBuffer): FontKitFont;
}

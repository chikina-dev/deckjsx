declare module "bidi-js" {
  export type BidiEmbeddingLevels = {
    readonly levels: Uint8Array;
  };

  export type Bidi = {
    getEmbeddingLevels(text: string, direction?: "ltr" | "rtl"): BidiEmbeddingLevels;
    getMirroredCharactersMap(
      text: string,
      embeddingLevels: Uint8Array,
    ): ReadonlyMap<number, string>;
    getReorderedIndices(text: string, embeddingLevels: BidiEmbeddingLevels): readonly number[];
  };

  export default function bidiFactory(): Bidi;
}

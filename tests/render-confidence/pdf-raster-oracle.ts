import { selectRenderConfidenceFixtures } from "./manifest";
import type { RenderConfidenceFixture, RenderConfidencePdfAssertionOptions } from "./types";

export type PdfRasterOracleFixture = RenderConfidenceFixture & {
  readonly pdfAssertions: RenderConfidencePdfAssertionOptions & {
    readonly rasterTolerance: NonNullable<RenderConfidencePdfAssertionOptions["rasterTolerance"]>;
  };
};

export type PpmRaster = {
  readonly width: number;
  readonly height: number;
  readonly maxValue: number;
  readonly data: Uint8Array;
};

export type RasterPairComparison = {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly meanAbsoluteChannelDifference: number;
  readonly maxChannelDifference: number;
  readonly changedPixelRatio: number;
};

export type RasterComparisonTolerance = {
  readonly maxMeanAbsoluteChannelDifference: number;
  readonly maxChannelDifference: number;
  readonly maxChangedPixelRatio?: number;
};

export type PdfRasterOracleWorkspace = {
  readonly directory: string;
  readonly retainArtifacts: boolean;
};

export function pdfRasterOracleWorkspace(input: {
  readonly temporaryDirectory: string;
  readonly artifactDirectory?: string;
}): PdfRasterOracleWorkspace {
  const artifactDirectory = input.artifactDirectory?.trim();
  if (artifactDirectory) {
    return { directory: artifactDirectory, retainArtifacts: true };
  }
  return { directory: input.temporaryDirectory, retainArtifacts: false };
}

export function selectPdfRasterOracleFixtures(input: {
  readonly fixtureGroups: readonly string[];
  readonly fixtureNames: readonly string[];
}): readonly PdfRasterOracleFixture[] {
  return selectRenderConfidenceFixtures(input).filter(
    (fixture): fixture is PdfRasterOracleFixture =>
      fixture.pdfAssertions?.rasterTolerance !== undefined,
  );
}

export function pdfRasterOraclePageNumbers(
  fixture: Pick<PdfRasterOracleFixture, "name" | "pdfAssertions" | "rasterPages">,
): readonly number[] {
  const pages = fixture.rasterPages.map((entry) => entry.page);
  if (new Set(pages).size !== pages.length) {
    throw new Error(`${fixture.name} PDF raster pages must not contain duplicate pages.`);
  }

  const expectedPages = Array.from(
    { length: fixture.pdfAssertions.expectedPages },
    (_, index) => index + 1,
  );
  const sortedPages = [...pages].sort((left, right) => left - right);
  if (
    sortedPages.length !== expectedPages.length ||
    sortedPages.some((page, index) => page !== expectedPages[index])
  ) {
    throw new Error(
      `${fixture.name} PDF raster pages must exactly cover pages 1..${fixture.pdfAssertions.expectedPages}.`,
    );
  }

  return expectedPages;
}

export function rasterComparisonReportLine(input: {
  readonly fixtureName: string;
  readonly page?: number;
  readonly comparison: RasterPairComparison;
  readonly tolerance: RasterComparisonTolerance;
}): string {
  return [
    `${input.fixtureName}${input.page === undefined ? "" : ` page=${input.page}`}:`,
    `mean=${input.comparison.meanAbsoluteChannelDifference.toFixed(2)}/${input.tolerance.maxMeanAbsoluteChannelDifference}`,
    `max=${input.comparison.maxChannelDifference}/${input.tolerance.maxChannelDifference}`,
    ...(input.tolerance.maxChangedPixelRatio !== undefined
      ? [
          `changed=${(input.comparison.changedPixelRatio * 100).toFixed(2)}%/${(
            input.tolerance.maxChangedPixelRatio * 100
          ).toFixed(2)}%`,
        ]
      : []),
    `pixels=${input.comparison.pixelCount}`,
    `size=${input.comparison.width}x${input.comparison.height}`,
  ].join(" ");
}

export function rasterComparisonReportText(lines: readonly string[]): string {
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function asciiWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}

function ppmHeaderTokens(bytes: Uint8Array): {
  readonly tokens: readonly string[];
  readonly dataOffset: number;
} {
  const tokens: string[] = [];
  let index = 0;

  while (index < bytes.length && tokens.length < 4) {
    while (index < bytes.length && asciiWhitespace(bytes[index]!)) {
      index += 1;
    }
    if (bytes[index] === 0x23) {
      while (index < bytes.length && bytes[index] !== 0x0a) {
        index += 1;
      }
      continue;
    }

    const start = index;
    while (index < bytes.length && !asciiWhitespace(bytes[index]!)) {
      index += 1;
    }
    if (index > start) {
      tokens.push(new TextDecoder().decode(bytes.slice(start, index)));
    }
  }

  if (index < bytes.length && asciiWhitespace(bytes[index]!)) {
    index += 1;
  }

  return { tokens, dataOffset: index };
}

export function parsePpmRaster(bytes: Uint8Array): PpmRaster {
  const { tokens, dataOffset } = ppmHeaderTokens(bytes);
  if (tokens.length !== 4 || tokens[0] !== "P6") {
    throw new Error("Raster oracle expects binary PPM P6 output.");
  }

  const width = Number.parseInt(tokens[1]!, 10);
  const height = Number.parseInt(tokens[2]!, 10);
  const maxValue = Number.parseInt(tokens[3]!, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Raster oracle PPM dimensions must be positive integers.");
  }
  if (maxValue !== 255) {
    throw new Error("Raster oracle currently supports 8-bit PPM channels only.");
  }

  const expectedLength = width * height * 3;
  const data = bytes.slice(dataOffset);
  if (data.length !== expectedLength) {
    throw new Error("Raster oracle PPM payload length does not match its dimensions.");
  }

  return { width, height, maxValue, data };
}

export function comparePpmRasterPair(
  referenceBytes: Uint8Array,
  candidateBytes: Uint8Array,
): RasterPairComparison {
  const reference = parsePpmRaster(referenceBytes);
  const candidate = parsePpmRaster(candidateBytes);
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error("Raster oracle cannot compare pages with different pixel dimensions.");
  }

  let differenceTotal = 0;
  let maxChannelDifference = 0;
  let changedPixels = 0;
  for (let index = 0; index < reference.data.length; index += 1) {
    const difference = Math.abs(reference.data[index]! - candidate.data[index]!);
    differenceTotal += difference;
    maxChannelDifference = Math.max(maxChannelDifference, difference);
    if (index % 3 === 0) {
      const nextDifference =
        difference +
        Math.abs(reference.data[index + 1]! - candidate.data[index + 1]!) +
        Math.abs(reference.data[index + 2]! - candidate.data[index + 2]!);
      if (nextDifference > 0) {
        changedPixels += 1;
      }
    }
  }

  return {
    width: reference.width,
    height: reference.height,
    pixelCount: reference.width * reference.height,
    meanAbsoluteChannelDifference: differenceTotal / reference.data.length,
    maxChannelDifference,
    changedPixelRatio: changedPixels / (reference.width * reference.height),
  };
}

export function diffPpmRasterPair(
  referenceBytes: Uint8Array,
  candidateBytes: Uint8Array,
): Uint8Array {
  const reference = parsePpmRaster(referenceBytes);
  const candidate = parsePpmRaster(candidateBytes);
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error("Raster oracle cannot diff pages with different pixel dimensions.");
  }

  const header = new TextEncoder().encode(`P6\n${reference.width} ${reference.height}\n255\n`);
  const data = new Uint8Array(reference.data.length);
  for (let index = 0; index < reference.data.length; index += 1) {
    data[index] = Math.min(255, Math.abs(reference.data[index]! - candidate.data[index]!) * 4);
  }

  const output = new Uint8Array(header.length + data.length);
  output.set(header, 0);
  output.set(data, header.length);
  return output;
}

import { describe, expect, test } from "vite-plus/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Deck } from "@/src";
import { pdf, pptx } from "@/src/adapter";
import type { PdfPageModel } from "@/src/projection/pdf/model";
import { selectRenderConfidenceFixtures } from "../render-confidence/manifest";
import type {
  RenderConfidenceFixture,
  RenderConfidencePdfAssertionOptions,
} from "../render-confidence/types";
import {
  comparePpmRasterPair,
  diffPpmRasterPair,
  parsePpmRaster,
  pdfRasterOraclePageNumbers,
  pdfRasterOracleWorkspace,
  rasterComparisonReportLine,
  rasterComparisonReportText,
  selectPdfRasterOracleFixtures,
} from "../render-confidence/pdf-raster-oracle";

function decodePdf(bytes: Uint8Array | undefined): string {
  return new TextDecoder().decode(bytes ?? new Uint8Array());
}

function pdfLiteralTextPattern(text: string): RegExp {
  const escapedChars = Array.from(text)
    .map((char) => {
      const escaped = char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      return `\\\\?${escaped}`;
    })
    .join("");

  return new RegExp(`\\(${escapedChars}\\) Tj`);
}

function pdfRgbColorMatchesHex(
  color: { readonly b: number; readonly g: number; readonly r: number } | undefined,
  hex: string,
): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!color || !match) {
    return false;
  }

  const value = match[1] ?? "";
  const expected = {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
  const tolerance = 0.0001;

  return (
    Math.abs(color.r - expected.r) <= tolerance &&
    Math.abs(color.g - expected.g) <= tolerance &&
    Math.abs(color.b - expected.b) <= tolerance
  );
}

function pdfRectangleApproximatelyEquals(
  actual:
    | { readonly height: number; readonly width: number; readonly x: number; readonly y: number }
    | undefined,
  expected: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): boolean {
  if (!actual) {
    return false;
  }

  const tolerance = 0.0001;
  return (
    Math.abs(actual.x - expected.x) <= tolerance &&
    Math.abs(actual.y - expected.y) <= tolerance &&
    Math.abs(actual.width - expected.width) <= tolerance &&
    Math.abs(actual.height - expected.height) <= tolerance
  );
}

type PdfParityFixture = RenderConfidenceFixture & {
  readonly pdfAssertions?: RenderConfidencePdfAssertionOptions;
};

const libreOfficeOracleTest = process.env.DECKJSX_PDF_LIBREOFFICE_ORACLE === "1" ? test : test.skip;
const externalPdfOracleTest =
  commandAvailable("qpdf") &&
  commandAvailable("pdfinfo") &&
  commandAvailable("pdftoppm") &&
  commandAvailable("pdftotext")
    ? test
    : test.skip;

function commandAvailable(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function expectPdfPageModel(value: unknown): PdfPageModel {
  expect(value).toMatchObject({ format: "pdf" });
  return value as PdfPageModel;
}

function withTemporaryPdf<T>(
  bytes: Uint8Array,
  callback: (path: string, directory: string) => T,
): T {
  const directory = mkdtempSync(join(tmpdir(), "deckjsx-pdf-oracle-"));
  const pdfPath = join(directory, "deck.pdf");

  try {
    writeFileSync(pdfPath, bytes);
    return callback(pdfPath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function renderPdfPageToPpm(input: {
  readonly pdfPath: string;
  readonly outputPrefix: string;
  readonly page?: number;
}): Uint8Array {
  execFileSync(
    "pdftoppm",
    [
      "-singlefile",
      "-scale-to-x",
      "720",
      "-scale-to-y",
      "405",
      ...(input.page === undefined ? [] : ["-f", `${input.page}`, "-l", `${input.page}`]),
      input.pdfPath,
      input.outputPrefix,
    ],
    { stdio: "pipe" },
  );
  return readFileSync(`${input.outputPrefix}.ppm`);
}

describe("PDF verification", () => {
  test("compares binary PPM raster pages for visual oracle thresholds", () => {
    const reference = new Uint8Array([
      0x50, 0x36, 0x0a, 0x32, 0x20, 0x31, 0x0a, 0x32, 0x35, 0x35, 0x0a, 0x00, 0x10, 0x20, 0x40,
      0x50, 0x60,
    ]);
    const candidate = new Uint8Array([
      0x50, 0x36, 0x0a, 0x32, 0x20, 0x31, 0x0a, 0x32, 0x35, 0x35, 0x0a, 0x00, 0x10, 0x20, 0x50,
      0x60, 0x70,
    ]);

    expect(parsePpmRaster(reference)).toMatchObject({ width: 2, height: 1, maxValue: 255 });
    expect(comparePpmRasterPair(reference, reference)).toMatchObject({
      width: 2,
      height: 1,
      meanAbsoluteChannelDifference: 0,
      maxChannelDifference: 0,
      changedPixelRatio: 0,
      pixelCount: 2,
    });
    expect(comparePpmRasterPair(reference, candidate)).toMatchObject({
      width: 2,
      height: 1,
      meanAbsoluteChannelDifference: 8,
      maxChannelDifference: 16,
      changedPixelRatio: 0.5,
      pixelCount: 2,
    });
  });

  test("renders binary PPM raster differences for visual oracle debugging", () => {
    const reference = new Uint8Array([
      0x50, 0x36, 0x0a, 0x32, 0x20, 0x31, 0x0a, 0x32, 0x35, 0x35, 0x0a, 0x00, 0x10, 0x20, 0x40,
      0x50, 0x60,
    ]);
    const candidate = new Uint8Array([
      0x50, 0x36, 0x0a, 0x32, 0x20, 0x31, 0x0a, 0x32, 0x35, 0x35, 0x0a, 0x08, 0x18, 0x28, 0x40,
      0x50, 0x80,
    ]);

    const diff = parsePpmRaster(diffPpmRasterPair(reference, candidate));

    expect(diff).toMatchObject({ width: 2, height: 1, maxValue: 255 });
    expect(Array.from(diff.data)).toEqual([32, 32, 32, 0, 0, 128]);
  });

  test("selects every PDF parity fixture for the raster oracle", () => {
    const fixtures = selectPdfRasterOracleFixtures({
      fixtureGroups: ["pr"],
      fixtureNames: [],
    });

    expect(fixtures.map((fixture) => fixture.name)).toEqual([
      "feature-text-layout",
      "feature-media-table",
      "scenario-business-report",
      "scenario-sales-deck",
      "scenario-product-roadmap",
      "scenario-technical-diagram",
      "scenario-mixed-dashboard",
      "scenario-multi-page-static",
      "scenario-image-heavy",
      "scenario-table-heavy",
    ]);
  });

  test("includes a multi-page PDF parity fixture in the raster oracle", () => {
    const fixtures = selectPdfRasterOracleFixtures({
      fixtureGroups: ["pr"],
      fixtureNames: [],
    });

    expect(fixtures.some((fixture) => fixture.pdfAssertions.expectedPages > 1)).toBe(true);
  });

  test("requires page-specific text assertions for the multi-page PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-multi-page-static"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredTextsByPage).toEqual([
      { page: 1, texts: ["Static overview", "Inputs", "Exports"] },
      { page: 2, texts: ["Static operating plan", "Stage", "Verify"] },
    ]);
  });

  test("requires image crop parity assertions for the media table PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-media-table"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requireImageClip).toBe(true);
  });

  test("requires concrete image clip box assertions for the media table PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-media-table"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredImageClipBoxes).toEqual([
      { x: 507.6, y: 118.8, width: 201.6, height: 100.8 },
    ]);
  });

  test("requires gradient visual parity assertions for the media table PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-media-table"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requireGradientVisual).toBe(true);
  });

  test("requires concrete gradient stop assertions for the media table PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-media-table"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredGradientVisuals).toEqual([
      {
        angle: 45,
        kind: "linear-gradient",
        stops: [
          { color: "#EF4444", offset: 0 },
          { color: "#F59E0B", offset: 1 },
        ],
      },
    ]);
  });

  test("requires blurred shadow layer assertions for the media table PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-media-table"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.minimumShadowVisuals).toBe(4);
  });

  test("requires shape visual parity assertions for the text layout PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-text-layout"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requireShapeVisual).toBe(true);
  });

  test("requires minimum shape visual assertions for geometry PDF fixtures", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-product-roadmap", "scenario-technical-diagram"],
    }) as readonly PdfParityFixture[];

    expect(
      fixtures.map((fixture) => [fixture.name, fixture.pdfAssertions?.minimumShapeVisuals]),
    ).toEqual([
      ["scenario-product-roadmap", 3],
      ["scenario-technical-diagram", 3],
    ]);
  });

  test("requires minimum shape visual assertions for business card PDF fixtures", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-business-report", "scenario-sales-deck"],
    }) as readonly PdfParityFixture[];

    expect(
      fixtures.map((fixture) => [fixture.name, fixture.pdfAssertions?.minimumShapeVisuals]),
    ).toEqual([
      ["scenario-business-report", 1],
      ["scenario-sales-deck", 1],
    ]);
  });

  test("requires business metric color assertions for the business report PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-business-report"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredTextColorSignals).toEqual([
      { text: "$1.2M", color: "#0F766E" },
    ]);
  });

  test("requires business card fill color assertions for the business report PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-business-report"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredShapeFillColorSignals).toEqual([
      { color: "#ECFDF5", shape: "rect" },
    ]);
  });

  test("requires round rectangle shape assertions for the sales deck PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-sales-deck"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredShapeVisualKinds).toEqual(["roundRect"]);
  });

  test("requires dashboard shape and metric color assertions for the mixed dashboard PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-mixed-dashboard"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.minimumShapeVisuals).toBe(2);
    expect(fixtures[0]?.pdfAssertions?.requiredTextColorSignals).toEqual([
      { text: "97% healthy", color: "#0F766E" },
    ]);
  });

  test("requires PDF text paint-order assertions for the text layout fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-text-layout"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.orderedTextSignals).toEqual(["Back label", "Front label"]);
  });

  test("requires PDF visual paint-order assertions for the text layout fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-text-layout"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.orderedVisualSignals).toEqual([
      { kind: "text", text: "Back label" },
      { kind: "shape", shape: "rect" },
      { kind: "text", text: "Front label" },
    ]);
  });

  test("requires rich text color assertions for the text layout PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-text-layout"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredTextColorSignals).toEqual([
      { text: "rich red", color: "#DC2626" },
    ]);
  });

  test("requires text font size assertions for the text layout PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["feature-text-layout"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredTextFontSizeSignals).toEqual([
      { text: "Text layout confidence", fontSize: 28 },
      { text: "Styled callout signal", fontSize: 18 },
      { text: "rich red", fontSize: 17 },
    ]);
  });

  test("requires table cell visual parity assertions for the table-heavy PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-table-heavy"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requireTableCellVisuals).toBe(true);
  });

  test("requires table border count assertions for the table-heavy PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-table-heavy"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.minimumTableBorderVisuals).toBe(80);
  });

  test("requires page-specific table visual assertions for the multi-page PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-multi-page-static"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredTableCellVisualPages).toEqual([2]);
  });

  test("requires page-specific table border count assertions for the multi-page PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-multi-page-static"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.minimumTableBorderVisualsByPage).toEqual([
      { page: 2, minimum: 48 },
    ]);
  });

  test("requires page-specific shape visual assertions for the multi-page PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-multi-page-static"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.minimumShapeVisualsByPage).toEqual([
      { page: 1, minimum: 3 },
    ]);
  });

  test("requires repeated image visual parity assertions for the image-heavy PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-image-heavy"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.minimumImageVisuals).toBe(6);
    expect(fixtures[0]?.pdfAssertions?.minimumImageClipVisuals).toBe(3);
  });

  test("requires image fit mode assertions for the image-heavy PDF fixture", () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: [],
      fixtureNames: ["scenario-image-heavy"],
    }) as readonly PdfParityFixture[];

    expect(fixtures[0]?.pdfAssertions?.requiredImageFitVisuals).toEqual([
      { fit: "cover", minimum: 3 },
      { fit: "contain", minimum: 3 },
    ]);
  });

  test("requires raster oracle thresholds for every PDF parity fixture", () => {
    const fixtures = selectPdfRasterOracleFixtures({
      fixtureGroups: ["pr"],
      fixtureNames: [],
    });

    for (const fixture of fixtures) {
      expect(
        fixture.pdfAssertions.rasterTolerance,
        `${fixture.name} rasterTolerance`,
      ).toBeDefined();
    }
  });

  test("derives validated PDF raster oracle page numbers from fixture raster pages", () => {
    expect(
      pdfRasterOraclePageNumbers({
        name: "valid-fixture",
        rasterPages: [
          { page: 1, category: "text" },
          { page: 2, category: "complexLayout" },
        ],
        pdfAssertions: {
          expectedPages: 2,
          requiredTexts: [],
          rasterTolerance: {
            maxMeanAbsoluteChannelDifference: 8,
            maxChannelDifference: 255,
          },
        },
      }),
    ).toEqual([1, 2]);

    expect(() =>
      pdfRasterOraclePageNumbers({
        name: "missing-page-fixture",
        rasterPages: [{ page: 1, category: "text" }],
        pdfAssertions: {
          expectedPages: 2,
          requiredTexts: [],
          rasterTolerance: {
            maxMeanAbsoluteChannelDifference: 8,
            maxChannelDifference: 255,
          },
        },
      }),
    ).toThrow("missing-page-fixture PDF raster pages must exactly cover pages 1..2.");

    expect(() =>
      pdfRasterOraclePageNumbers({
        name: "duplicate-page-fixture",
        rasterPages: [
          { page: 1, category: "text" },
          { page: 1, category: "complexLayout" },
        ],
        pdfAssertions: {
          expectedPages: 1,
          requiredTexts: [],
          rasterTolerance: {
            maxMeanAbsoluteChannelDifference: 8,
            maxChannelDifference: 255,
          },
        },
      }),
    ).toThrow("duplicate-page-fixture PDF raster pages must not contain duplicate pages.");
  });

  test("formats raster oracle comparison reports with fixture thresholds", () => {
    const reportLine = rasterComparisonReportLine({
      fixtureName: "fixture-a",
      page: 2,
      comparison: {
        width: 720,
        height: 405,
        pixelCount: 291600,
        meanAbsoluteChannelDifference: 12.3456,
        maxChannelDifference: 123,
        changedPixelRatio: 0.1234,
      },
      tolerance: {
        maxMeanAbsoluteChannelDifference: 80,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.5,
      },
    });

    expect(reportLine).toBe(
      "fixture-a page=2: mean=12.35/80 max=123/255 changed=12.34%/50.00% pixels=291600 size=720x405",
    );
    expect(rasterComparisonReportText([reportLine])).toBe(
      "fixture-a page=2: mean=12.35/80 max=123/255 changed=12.34%/50.00% pixels=291600 size=720x405\n",
    );
  });

  test("uses a retained artifact directory for raster oracle debugging", () => {
    expect(
      pdfRasterOracleWorkspace({
        temporaryDirectory: "/tmp/deckjsx-generated",
      }),
    ).toEqual({
      directory: "/tmp/deckjsx-generated",
      retainArtifacts: false,
    });
    expect(
      pdfRasterOracleWorkspace({
        temporaryDirectory: "/tmp/deckjsx-generated",
        artifactDirectory: " /tmp/deckjsx-retained ",
      }),
    ).toEqual({
      directory: "/tmp/deckjsx-retained",
      retainArtifacts: true,
    });
  });

  test("renders a structurally inspectable PDF with authored text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Verification" }, () => <p>Verification text</p>);

    const result = await deck.render(pdf({ inspection: "none" }));
    const output = decodePdf(result.artifact?.bytes);

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({ format: "pdf" });
    expect(output).toContain("/Type /Catalog");
    expect(output).toContain("/Type /Pages");
    expect(output).toContain("/Type /Page");
    expect(output).toContain("xref");
    expect(output).toContain("trailer");
    expect(output).toContain("startxref");
    expect(output).toContain("%%EOF");
    expect(output).toMatch(pdfLiteralTextPattern("Verification text"));
    expect(output).toMatch(/xref\s+0\s+\d+\s+(?:\d{10}\s+\d{5}\s+[fn]\s+)+/);
    expect(output).toMatch(/startxref\s+\d+\s+%%EOF\s*$/);
  });

  externalPdfOracleTest("emits a PDF that external readers can inspect and extract", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "External oracle" }, () => <p>Poppler external smoke</p>);

    const result = await deck.render(pdf({ inspection: "none" }));
    const bytes = result.artifact?.bytes;

    expect(result.ok).toBe(true);
    expect(bytes).toBeDefined();

    withTemporaryPdf(bytes ?? new Uint8Array(), (pdfPath, directory) => {
      expect(() => execFileSync("qpdf", ["--check", pdfPath], { stdio: "pipe" })).not.toThrow();

      const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      const text = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
      const renderPrefix = join(directory, "rendered");

      expect(info).toContain("Pages:           1");
      expect(text).toContain("Poppler external smoke");

      execFileSync("pdftoppm", ["-png", pdfPath, renderPrefix], { stdio: "pipe" });

      const pngBytes = readFileSync(`${renderPrefix}-1.png`);
      expect(Array.from(pngBytes.slice(0, 8))).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
    });
  });

  externalPdfOracleTest(
    "renders requested PDF pages for multi-page raster oracle checks",
    async () => {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "First page" }, () => <p>First page text</p>);
      deck.slide({ name: "Second page" }, () => <p>Second page text</p>);

      const result = await deck.render(pdf({ inspection: "none" }));
      const bytes = result.artifact?.bytes;

      expect(result.ok).toBe(true);
      expect(bytes).toBeDefined();

      withTemporaryPdf(bytes ?? new Uint8Array(), (pdfPath, directory) => {
        const firstPage = renderPdfPageToPpm({
          pdfPath,
          outputPrefix: join(directory, "first-page"),
          page: 1,
        });
        const secondPage = renderPdfPageToPpm({
          pdfPath,
          outputPrefix: join(directory, "second-page"),
          page: 2,
        });

        expect(parsePpmRaster(firstPage)).toMatchObject({ width: 720, height: 405 });
        expect(parsePpmRaster(secondPage)).toMatchObject({ width: 720, height: 405 });
        expect(Buffer.compare(Buffer.from(firstPage), Buffer.from(secondPage))).not.toBe(0);
      });
    },
  );

  test("static render-confidence fixtures declare and satisfy PDF parity assertions", async () => {
    const fixtures = selectRenderConfidenceFixtures({
      fixtureGroups: ["pr"],
      fixtureNames: [],
    });

    for (const fixture of fixtures) {
      const pdfAssertions = (fixture as PdfParityFixture).pdfAssertions;
      expect(pdfAssertions, `${fixture.name} pdfAssertions`).toBeDefined();
      if (!pdfAssertions) {
        continue;
      }

      const deck = fixture.createDeck();
      const pdfProject = await deck.project({ format: "pdf", inspection: "summary" });
      const pdfResult = await deck.render(pdf({ inspection: "none" }));
      const pptxResult = await deck.render(pptx({ inspection: "none" }));

      expect(pdfProject.diagnostics.items, `${fixture.name} pdf diagnostics`).toEqual([]);
      expect(pdfProject.ok, `${fixture.name} pdf project`).toBe(true);
      expect(pdfResult.ok, `${fixture.name} pdf render`).toBe(true);
      expect(pptxResult.ok, `${fixture.name} pptx render`).toBe(true);
      expect(pdfResult.artifact).toMatchObject({ format: "pdf", mediaType: "application/pdf" });
      expect(pptxResult.artifact).toMatchObject({
        format: "pptx",
        mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });

      const projection = expectPdfPageModel(pdfProject.projection);
      const content = projection.pages.flatMap((page) => page.content);
      const textValues = content.flatMap((op) => (op.op === "text" ? [op.text] : []));

      expect(projection.pages).toHaveLength(pdfAssertions.expectedPages);
      for (const text of pdfAssertions.requiredTexts) {
        expect(
          textValues.some((value) => value.includes(text)),
          `${fixture.name} PDF text "${text}"`,
        ).toBe(true);
      }
      for (const pageAssertion of pdfAssertions.requiredTextsByPage ?? []) {
        const page = projection.pages[pageAssertion.page - 1];
        const pageTextValues = (page?.content ?? []).flatMap((op) =>
          op.op === "text" ? [op.text] : [],
        );
        expect(page, `${fixture.name} PDF page ${pageAssertion.page}`).toBeDefined();
        for (const text of pageAssertion.texts) {
          expect(
            pageTextValues.some((value) => value.includes(text)),
            `${fixture.name} PDF page ${pageAssertion.page} text "${text}"`,
          ).toBe(true);
        }
      }
      if (pdfAssertions.orderedTextSignals) {
        let previousTextIndex = -1;
        for (const text of pdfAssertions.orderedTextSignals) {
          const textIndex = textValues.findIndex(
            (value, index) => index > previousTextIndex && value.includes(text),
          );
          expect(textIndex, `${fixture.name} PDF ordered text "${text}"`).toBeGreaterThan(
            previousTextIndex,
          );
          previousTextIndex = textIndex;
        }
      }
      if (pdfAssertions.orderedVisualSignals) {
        const visuals = projection.pages.flatMap((page) => page.visuals ?? []);
        let previousVisualIndex = -1;
        for (const signal of pdfAssertions.orderedVisualSignals) {
          const visualIndex = visuals.findIndex((visual, index) => {
            if (index <= previousVisualIndex || visual.kind !== signal.kind) {
              return false;
            }
            if (visual.kind === "text") {
              return signal.text === undefined || visual.text.includes(signal.text);
            }
            if (visual.kind === "shape") {
              return signal.shape === undefined || visual.shape === signal.shape;
            }
            return true;
          });
          expect(
            visualIndex,
            `${fixture.name} PDF ordered visual ${JSON.stringify(signal)}`,
          ).toBeGreaterThan(previousVisualIndex);
          previousVisualIndex = visualIndex;
        }
      }
      for (const signal of pdfAssertions.requiredTextColorSignals ?? []) {
        expect(
          content.some(
            (op) =>
              op.op === "text" &&
              op.text.includes(signal.text) &&
              pdfRgbColorMatchesHex(op.color, signal.color),
          ),
          `${fixture.name} PDF text "${signal.text}" color ${signal.color}`,
        ).toBe(true);
      }
      for (const signal of pdfAssertions.requiredTextFontSizeSignals ?? []) {
        expect(
          content.some(
            (op) =>
              op.op === "text" &&
              op.fontSize !== undefined &&
              op.text.includes(signal.text) &&
              Math.abs(op.fontSize - signal.fontSize) <= 0.0001,
          ),
          `${fixture.name} PDF text "${signal.text}" fontSize ${signal.fontSize}`,
        ).toBe(true);
      }
      if (pdfAssertions.requireImageResource) {
        expect(projection.resources.images.length, `${fixture.name} PDF images`).toBeGreaterThan(0);
      }
      if (pdfAssertions.minimumImageVisuals !== undefined) {
        const imageVisuals = projection.pages.flatMap((page) =>
          (page.visuals ?? []).filter((visual) => visual.kind === "image"),
        );
        expect(imageVisuals.length, `${fixture.name} PDF image visuals`).toBeGreaterThanOrEqual(
          pdfAssertions.minimumImageVisuals,
        );
      }
      for (const requirement of pdfAssertions.requiredImageFitVisuals ?? []) {
        const imageVisuals = projection.pages.flatMap((page) =>
          (page.visuals ?? []).filter(
            (visual) => visual.kind === "image" && visual.fit === requirement.fit,
          ),
        );
        expect(
          imageVisuals.length,
          `${fixture.name} PDF ${requirement.fit} image visuals`,
        ).toBeGreaterThanOrEqual(requirement.minimum);
      }
      if (pdfAssertions.minimumImageClipVisuals !== undefined) {
        const clippedImageVisuals = projection.pages.flatMap((page) =>
          (page.visuals ?? []).filter(
            (visual) => visual.kind === "image" && visual.clipBox !== undefined,
          ),
        );
        expect(
          clippedImageVisuals.length,
          `${fixture.name} PDF clipped image visuals`,
        ).toBeGreaterThanOrEqual(pdfAssertions.minimumImageClipVisuals);
      }
      if (pdfAssertions.requireImageClip) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some((visual) => visual.kind === "image" && visual.clipBox !== undefined),
          ),
          `${fixture.name} PDF clipped image visual`,
        ).toBe(true);
      }
      for (const expectedClipBox of pdfAssertions.requiredImageClipBoxes ?? []) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some(
              (visual) =>
                visual.kind === "image" &&
                pdfRectangleApproximatelyEquals(visual.clipBox, expectedClipBox),
            ),
          ),
          `${fixture.name} PDF image clipBox ${JSON.stringify(expectedClipBox)}`,
        ).toBe(true);
      }
      if (pdfAssertions.requireGradientResource) {
        expect(
          projection.resources.gradients?.length ?? 0,
          `${fixture.name} PDF gradients`,
        ).toBeGreaterThan(0);
      }
      if (pdfAssertions.requireGradientVisual) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some(
              (visual) =>
                visual.kind === "shape" &&
                visual.fill?.gradientId !== undefined &&
                (visual.fill.kind === "linear-gradient" || visual.fill.kind === "radial-gradient"),
            ),
          ),
          `${fixture.name} PDF gradient shape visual`,
        ).toBe(true);
      }
      for (const requiredGradient of pdfAssertions.requiredGradientVisuals ?? []) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some((visual) => {
              if (
                visual.kind !== "shape" ||
                visual.fill?.kind !== requiredGradient.kind ||
                visual.fill.gradientId === undefined
              ) {
                return false;
              }
              if (
                requiredGradient.angle !== undefined &&
                Math.abs((visual.fill.angle ?? 0) - requiredGradient.angle) > 0.0001
              ) {
                return false;
              }

              return (requiredGradient.stops ?? []).every((requiredStop) =>
                visual.fill?.stops?.some(
                  (actualStop) =>
                    Math.abs(actualStop.position - requiredStop.offset) <= 0.0001 &&
                    pdfRgbColorMatchesHex(actualStop.color, requiredStop.color),
                ),
              );
            }),
          ),
          `${fixture.name} PDF ${requiredGradient.kind} gradient visual`,
        ).toBe(true);
      }
      if (pdfAssertions.requireShapeVisual) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some(
              (visual) =>
                visual.kind === "shape" &&
                visual.paintOrder.generatedLayerRole === "authored" &&
                (visual.fill !== undefined || visual.stroke !== undefined),
            ),
          ),
          `${fixture.name} PDF authored shape visual`,
        ).toBe(true);
      }
      if (pdfAssertions.minimumShapeVisuals !== undefined) {
        const shapeVisuals = projection.pages.flatMap((page) =>
          (page.visuals ?? []).filter(
            (visual) =>
              visual.kind === "shape" &&
              visual.paintOrder.generatedLayerRole === "authored" &&
              (visual.fill !== undefined || visual.stroke !== undefined),
          ),
        );
        expect(
          shapeVisuals.length,
          `${fixture.name} PDF authored shape visuals`,
        ).toBeGreaterThanOrEqual(pdfAssertions.minimumShapeVisuals);
      }
      for (const requirement of pdfAssertions.minimumShapeVisualsByPage ?? []) {
        const page = projection.pages[requirement.page - 1];
        const shapeVisuals = (page?.visuals ?? []).filter(
          (visual) =>
            visual.kind === "shape" &&
            visual.paintOrder.generatedLayerRole === "authored" &&
            (visual.fill !== undefined || visual.stroke !== undefined),
        );
        expect(page, `${fixture.name} PDF page ${requirement.page}`).toBeDefined();
        expect(
          shapeVisuals.length,
          `${fixture.name} PDF page ${requirement.page} authored shape visuals`,
        ).toBeGreaterThanOrEqual(requirement.minimum);
      }
      for (const shapeKind of pdfAssertions.requiredShapeVisualKinds ?? []) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some(
              (visual) =>
                visual.kind === "shape" &&
                visual.shape === shapeKind &&
                visual.paintOrder.generatedLayerRole === "authored",
            ),
          ),
          `${fixture.name} PDF authored ${shapeKind} shape visual`,
        ).toBe(true);
      }
      for (const signal of pdfAssertions.requiredShapeFillColorSignals ?? []) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some(
              (visual) =>
                visual.kind === "shape" &&
                visual.paintOrder.generatedLayerRole === "authored" &&
                (signal.shape === undefined || visual.shape === signal.shape) &&
                pdfRgbColorMatchesHex(visual.fill?.color, signal.color),
            ),
          ),
          `${fixture.name} PDF ${signal.shape ?? "shape"} fill ${signal.color}`,
        ).toBe(true);
      }
      if (pdfAssertions.requireShadowVisual) {
        expect(
          projection.pages.some((page) =>
            page.visuals?.some((visual) => visual.paintOrder.generatedLayerRole === "shadow"),
          ),
          `${fixture.name} PDF shadow visual`,
        ).toBe(true);
      }
      if (pdfAssertions.minimumShadowVisuals !== undefined) {
        const shadowVisuals = projection.pages.flatMap((page) =>
          (page.visuals ?? []).filter(
            (visual) => visual.paintOrder.generatedLayerRole === "shadow",
          ),
        );
        expect(shadowVisuals.length, `${fixture.name} PDF shadow visuals`).toBeGreaterThanOrEqual(
          pdfAssertions.minimumShadowVisuals,
        );
      }
      if (pdfAssertions.requireTableCellVisuals) {
        const visuals = projection.pages.flatMap((page) => page.visuals ?? []);
        expect(
          visuals.some(
            (visual) =>
              visual.kind === "line" &&
              visual.paintOrder.generatedLayerRole === "border" &&
              (visual.origin?.graphNodeIds?.length ?? 0) > 0,
          ),
          `${fixture.name} PDF table cell border visual`,
        ).toBe(true);
      }
      if (pdfAssertions.minimumTableBorderVisuals !== undefined) {
        const borderVisuals = projection.pages.flatMap((page) =>
          (page.visuals ?? []).filter(
            (visual) =>
              visual.kind === "line" &&
              visual.paintOrder.generatedLayerRole === "border" &&
              (visual.origin?.graphNodeIds?.length ?? 0) > 0,
          ),
        );
        expect(
          borderVisuals.length,
          `${fixture.name} PDF table border visuals`,
        ).toBeGreaterThanOrEqual(pdfAssertions.minimumTableBorderVisuals);
      }
      for (const requirement of pdfAssertions.minimumTableBorderVisualsByPage ?? []) {
        const page = projection.pages[requirement.page - 1];
        const borderVisuals = (page?.visuals ?? []).filter(
          (visual) =>
            visual.kind === "line" &&
            visual.paintOrder.generatedLayerRole === "border" &&
            (visual.origin?.graphNodeIds?.length ?? 0) > 0,
        );
        expect(page, `${fixture.name} PDF page ${requirement.page}`).toBeDefined();
        expect(
          borderVisuals.length,
          `${fixture.name} PDF page ${requirement.page} table border visuals`,
        ).toBeGreaterThanOrEqual(requirement.minimum);
      }
      for (const pageNumber of pdfAssertions.requiredTableCellVisualPages ?? []) {
        const page = projection.pages[pageNumber - 1];
        expect(page, `${fixture.name} PDF page ${pageNumber}`).toBeDefined();
        expect(
          (page?.visuals ?? []).some(
            (visual) =>
              visual.kind === "line" &&
              visual.paintOrder.generatedLayerRole === "border" &&
              (visual.origin?.graphNodeIds?.length ?? 0) > 0,
          ),
          `${fixture.name} PDF page ${pageNumber} table cell border visual`,
        ).toBe(true);
      }
      if (pdfAssertions.requireTableText) {
        for (const text of pdfAssertions.requiredTableTexts ?? []) {
          expect(
            textValues.some((value) => value.includes(text)),
            `${fixture.name} PDF table text "${text}"`,
          ).toBe(true);
        }
      }
    }
  });

  libreOfficeOracleTest(
    "compares native PDF output with LibreOffice PPTX-derived PDF rasters",
    async () => {
      expect(process.env.DECKJSX_PDF_LIBREOFFICE_ORACLE).toBe("1");

      expect(commandAvailable("soffice"), "soffice is required for the oracle").toBe(true);
      expect(commandAvailable("pdftoppm"), "pdftoppm is required for the oracle").toBe(true);

      const fixtures = selectPdfRasterOracleFixtures({
        fixtureGroups: ["pr"],
        fixtureNames: [],
      });
      expect(fixtures.length).toBeGreaterThan(0);
      const reportLines: string[] = [];

      const temporaryDirectory = mkdtempSync(join(tmpdir(), "deckjsx-pdf-raster-oracle-"));
      const workspace = pdfRasterOracleWorkspace({
        temporaryDirectory,
        artifactDirectory: process.env.DECKJSX_PDF_RASTER_ORACLE_ARTIFACT_DIR,
      });
      const { directory } = workspace;
      if (workspace.retainArtifacts) {
        mkdirSync(directory, { recursive: true });
      }
      const libreOfficeProfileDirectory = join(directory, "libreoffice-profile");
      mkdirSync(libreOfficeProfileDirectory, { recursive: true });
      const libreOfficeProfileUrl = pathToFileURL(libreOfficeProfileDirectory).href;
      try {
        for (const fixture of fixtures) {
          const deck = fixture.createDeck();
          const nativePdf = await deck.render(pdf({ inspection: "none" }));
          const pptxResult = await deck.render(pptx({ inspection: "none" }));

          expect(nativePdf.ok, `${fixture.name} native PDF render`).toBe(true);
          expect(pptxResult.ok, `${fixture.name} PPTX render`).toBe(true);
          expect(nativePdf.artifact?.bytes, `${fixture.name} native PDF bytes`).toBeDefined();
          expect(pptxResult.artifact?.bytes, `${fixture.name} PPTX bytes`).toBeDefined();

          const nativePdfPath = join(directory, `${fixture.artifactBaseName}-native.pdf`);
          const pptxPath = join(directory, `${fixture.artifactBaseName}.pptx`);
          const pptxDerivedPdfPath = join(directory, `${fixture.artifactBaseName}.pdf`);
          writeFileSync(nativePdfPath, nativePdf.artifact?.bytes ?? new Uint8Array());
          writeFileSync(pptxPath, pptxResult.artifact?.bytes ?? new Uint8Array());

          execFileSync(
            "soffice",
            [
              `-env:UserInstallation=${libreOfficeProfileUrl}`,
              "--headless",
              "--convert-to",
              "pdf",
              "--outdir",
              directory,
              pptxPath,
            ],
            { stdio: "pipe" },
          );

          for (const page of pdfRasterOraclePageNumbers(fixture)) {
            const nativePpm = renderPdfPageToPpm({
              pdfPath: nativePdfPath,
              outputPrefix: join(directory, `${fixture.artifactBaseName}-native-page-${page}`),
              page,
            });
            const pptxDerivedPpm = renderPdfPageToPpm({
              pdfPath: pptxDerivedPdfPath,
              outputPrefix: join(
                directory,
                `${fixture.artifactBaseName}-pptx-derived-page-${page}`,
              ),
              page,
            });
            const comparison = comparePpmRasterPair(pptxDerivedPpm, nativePpm);
            const reportLine = rasterComparisonReportLine({
              fixtureName: fixture.name,
              page,
              comparison,
              tolerance: fixture.pdfAssertions.rasterTolerance,
            });
            if (workspace.retainArtifacts) {
              writeFileSync(
                join(directory, `${fixture.artifactBaseName}-page-${page}-diff.ppm`),
                diffPpmRasterPair(pptxDerivedPpm, nativePpm),
              );
            }
            if (process.env.DECKJSX_PDF_RASTER_ORACLE_REPORT === "1") {
              console.info(reportLine);
            }
            reportLines.push(reportLine);

            expect(comparison, `${fixture.name} page ${page} raster dimensions`).toMatchObject({
              width: 720,
              height: 405,
              pixelCount: 291600,
            });
            expect(
              Number.isFinite(comparison.meanAbsoluteChannelDifference),
              `${fixture.name} page ${page} raster mean absolute channel difference`,
            ).toBe(true);
            expect(comparison.meanAbsoluteChannelDifference, reportLine).toBeLessThanOrEqual(
              fixture.pdfAssertions.rasterTolerance.maxMeanAbsoluteChannelDifference,
            );
            expect(comparison.maxChannelDifference, reportLine).toBeGreaterThanOrEqual(0);
            expect(comparison.maxChannelDifference, reportLine).toBeLessThanOrEqual(
              fixture.pdfAssertions.rasterTolerance.maxChannelDifference,
            );
            if (fixture.pdfAssertions.rasterTolerance.maxChangedPixelRatio !== undefined) {
              expect(comparison.changedPixelRatio, reportLine).toBeLessThanOrEqual(
                fixture.pdfAssertions.rasterTolerance.maxChangedPixelRatio,
              );
            }
          }
        }
      } finally {
        if (process.env.DECKJSX_PDF_RASTER_ORACLE_REPORT_PATH) {
          writeFileSync(
            process.env.DECKJSX_PDF_RASTER_ORACLE_REPORT_PATH,
            rasterComparisonReportText(reportLines),
          );
        }
        if (workspace.retainArtifacts) {
          writeFileSync(
            join(directory, "raster-report.txt"),
            rasterComparisonReportText(reportLines),
          );
        } else {
          rmSync(temporaryDirectory, { recursive: true, force: true });
        }
      }
    },
    120_000,
  );
});

// @ts-nocheck
/** @jsxImportSource deckjsx */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse } from "node:path";
import { spawn } from "node:child_process";
import { strFromU8, unzipSync, type Unzipped } from "fflate";
import { Deck } from "../../src/index.ts";

type Options = {
  baseline: string | null;
  outdir: string;
  pages: number[];
  strict: boolean;
  skipRaster: boolean;
};

type ToolResult = {
  name: string;
  command: string | null;
  status: "disabled" | "used" | "missing" | "failed" | "skipped";
};

type PackageAssertionResult = { name: string; status: "passed"; details?: Record<string, unknown> };

type RasterExpectation = {
  page: number;
  category: "colorFill" | "complexLayout" | "geometry" | "imageCrop" | "shadowEffect" | "text";
  tolerance:
    | { kind: "manualArtifact"; note: string }
    | { kind: "pixelBaseline"; maxDifferentPixels: number; note: string };
  png: string | null;
  pngByteLength: number | null;
  baselineComparison?: {
    baselinePng: string;
    currentPng: string;
    differencePng: string;
    differentPixels: number;
    maxDifferentPixels: number;
    tool: string;
  };
};

type FixtureManifest = {
  name: string;
  pptx: string;
  pdf: string | null;
  pngs: string[];
  packageAssertions: PackageAssertionResult[];
  rasterExpectations: RasterExpectation[];
};

type ArtifactManifest = {
  pptx: string;
  pdf: string | null;
  pngs: string[];
  fixtures: FixtureManifest[];
  renderToolsEnabled: boolean;
  tools: ToolResult[];
};

const defaultOptions: Options = {
  baseline: null,
  outdir: ".github/render/artifacts",
  pages: [1, 2],
  strict: false,
  skipRaster: false,
};

const renderToolsEnabled = process.env.DECKJSX_RENDER_WITH_TOOLS === "1";
const pngData =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURSVj6////y1UwPwAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gYIBDM5nZgK7wAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDYtMDhUMDQ6NTE6NTcrMDA6MDBDyTUuAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA2LTA4VDA0OjUxOjU3KzAwOjAwMpSNkgAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wNi0wOFQwNDo1MTo1NyswMDowMGWBrE0AAAAASUVORK5CYII=";
const widePngData =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyAQMAAACQ++z9AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURSVj6////y1UwPwAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gYIBDIiDubyQgAAAA9JREFUKM9jYBgFo2BoAgACvAABbZIddAAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wNi0wOFQwNDo1MDozNCswMDowMFuMTQoAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDYtMDhUMDQ6NTA6MzQrMDA6MDAq0fW2AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA2LTA4VDA0OjUwOjM0KzAwOjAwfcTUaQAAAABJRU5ErkJggg==";

function parsePages(value: string): number[] {
  const pages = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((page) => Number.isInteger(page) && page > 0);

  if (pages.length === 0) {
    throw new Error("Expected --pages to include at least one positive page number.");
  }

  return pages;
}

function parseArgs(args: string[]): Options {
  const options = { ...defaultOptions };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--outdir" && next) {
      options.outdir = next;
      index += 1;
      continue;
    }

    if (arg === "--baseline" && next) {
      options.baseline = next;
      index += 1;
      continue;
    }

    if (arg === "--pages" && next) {
      options.pages = parsePages(next);
      index += 1;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    if (arg === "--skip-raster") {
      options.skipRaster = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function maybePngByteLength(path: string | null): Promise<number | null> {
  if (!path) {
    return null;
  }
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function fixtureByName(manifest: ArtifactManifest): Map<string, FixtureManifest> {
  return new Map(manifest.fixtures.map((fixture) => [fixture.name, fixture]));
}

function baselineComparableAssertionNames(fixture: FixtureManifest): string[] {
  return fixture.packageAssertions
    .map((item) => item.name)
    .filter((name) => !name.startsWith("baseline "))
    .sort();
}

type RasterCompareTool = { command: string; argsPrefix: readonly string[]; label: string };

function rasterTolerance(category: RasterExpectation["category"]): {
  maxDifferentPixels: number;
  note: string;
} {
  switch (category) {
    case "geometry":
      return {
        maxDifferentPixels: 2500,
        note: "Compare rendered geometry with a strict pixel baseline tolerance.",
      };
    case "colorFill":
    case "imageCrop":
      return {
        maxDifferentPixels: 6000,
        note: "Compare rendered fill/crop output with a moderate pixel baseline tolerance.",
      };
    case "shadowEffect":
      return {
        maxDifferentPixels: 9000,
        note: "Compare rendered shadow/effect output with a moderate pixel baseline tolerance.",
      };
    case "text":
      return {
        maxDifferentPixels: 25000,
        note: "Compare rendered text output with a loose pixel baseline tolerance.",
      };
    case "complexLayout":
      return {
        maxDifferentPixels: 12000,
        note: "Compare rendered layout output with a category-specific pixel baseline tolerance.",
      };
  }
}

function uniqueSortedPages(pages: readonly number[]): number[] {
  return [...new Set(pages)].sort((left, right) => left - right);
}

function rasterPagesForFixture(
  fixture: FixtureManifest,
  requestedPages: readonly number[],
): number[] {
  if (fixture.name === "v0.8-generation-regression") {
    return uniqueSortedPages([...requestedPages, 3, 4, 5, 6]);
  }

  return uniqueSortedPages(requestedPages);
}

function rasterCategoryForFixture(
  fixture: FixtureManifest,
  page: number,
): RasterExpectation["category"] {
  if (fixture.name === "v0.8-generation-regression" && page === 3) {
    return "imageCrop";
  }

  if (fixture.name === "v0.8-generation-regression" && page === 4) {
    return "shadowEffect";
  }

  if (fixture.name === "v0.8-generation-regression" && page === 5) {
    return "colorFill";
  }

  if (fixture.name === "v0.8-generation-regression" && page === 6) {
    return "text";
  }

  return page === 1 ? "geometry" : "complexLayout";
}

function rasterExpectationNote(category: RasterExpectation["category"]): string {
  const tolerance = rasterTolerance(category);
  switch (category) {
    case "geometry":
      return `${tolerance.note} Inspect slide geometry, primary text placement, and color/fill stability.`;
    case "imageCrop":
      return `${tolerance.note} Inspect image crop/source-rectangle rendering and image frame stability.`;
    case "shadowEffect":
      return `${tolerance.note} Inspect shadow effect rendering, effect color, and shape frame stability.`;
    case "text":
      return `${tolerance.note} Inspect text placement, run styling, and typography stability.`;
    case "colorFill":
      return `${tolerance.note} Inspect fill, transparency, and color stability.`;
    case "complexLayout":
      return `${tolerance.note} Inspect z-order, layout grouping, text placement, and repeated-shape stability.`;
  }
}

function rasterToleranceSignature(tolerance: RasterExpectation["tolerance"]): {
  kind: RasterExpectation["tolerance"]["kind"];
  maxDifferentPixels?: number;
  note: string;
} {
  return tolerance.kind === "pixelBaseline"
    ? {
        kind: tolerance.kind,
        maxDifferentPixels: tolerance.maxDifferentPixels,
        note: tolerance.note,
      }
    : { kind: tolerance.kind, note: tolerance.note };
}

async function existingPath(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function manifestAssetPath(manifestPath: string, assetPath: string): Promise<string | null> {
  if (isAbsolute(assetPath)) {
    return existingPath([assetPath]);
  }

  return existingPath([
    assetPath,
    join(dirname(manifestPath), assetPath),
    join(dirname(manifestPath), basename(assetPath)),
  ]);
}

async function findRasterCompareTool(): Promise<RasterCompareTool | null> {
  const magick = await findCommand(["magick"]);
  if (magick) {
    return { command: magick, argsPrefix: ["compare"], label: "magick compare" };
  }

  const compare = await findCommand(["compare"]);
  if (compare) {
    return { command: compare, argsPrefix: [], label: "compare" };
  }

  return null;
}

async function compareRasterPixels(input: {
  baselinePng: string;
  currentPng: string;
  differencePng: string;
  tool: RasterCompareTool;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.tool.command, [
      ...input.tool.argsPrefix,
      "-metric",
      "AE",
      input.baselinePng,
      input.currentPng,
      input.differencePng,
    ]);
    const chunks: Buffer[] = [];

    child.stderr.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const output = Buffer.concat(chunks).toString("utf8").trim();
      const match = output.match(/([0-9]+(?:\.[0-9]+)?)(?:\s|$)/);
      if ((code === 0 || code === 1) && match) {
        resolve(Number(match[1]));
        return;
      }

      const exitReason =
        code === null ? `terminated by signal ${signal ?? "unknown"}` : `exited with code ${code}`;
      reject(
        new Error(
          `${input.tool.label} ${input.baselinePng} ${input.currentPng} ${exitReason}: ${output}`,
        ),
      );
    });
  });
}

async function assertManifestBaseline(input: {
  baselinePath: string;
  currentManifestPath: string;
  manifest: ArtifactManifest;
}): Promise<PackageAssertionResult[]> {
  const baseline = JSON.parse(await readFile(input.baselinePath, "utf8")) as ArtifactManifest;
  const currentFixtures = fixtureByName(input.manifest);
  const assertions: PackageAssertionResult[] = [];

  for (const baselineFixture of baseline.fixtures) {
    const currentFixture = currentFixtures.get(baselineFixture.name);
    assertions.push(
      packageAssertion(`baseline fixture exists: ${baselineFixture.name}`, Boolean(currentFixture)),
    );
    if (!currentFixture) {
      continue;
    }

    const baselineAssertions = baselineComparableAssertionNames(baselineFixture);
    const currentAssertions = baselineComparableAssertionNames(currentFixture);
    assertions.push(
      packageAssertion(
        `baseline package assertions: ${baselineFixture.name}`,
        JSON.stringify(currentAssertions) === JSON.stringify(baselineAssertions),
        { expected: baselineAssertions, actual: currentAssertions },
      ),
    );

    for (const baselineRaster of baselineFixture.rasterExpectations) {
      const currentRaster = currentFixture.rasterExpectations.find(
        (item) => item.page === baselineRaster.page && item.category === baselineRaster.category,
      );
      assertions.push(
        packageAssertion(
          `baseline raster expectation: ${baselineFixture.name} page ${baselineRaster.page}`,
          Boolean(currentRaster),
          { category: baselineRaster.category },
        ),
      );
      if (!currentRaster) {
        continue;
      }

      const baselineTolerance = rasterToleranceSignature(baselineRaster.tolerance);
      const currentTolerance = rasterToleranceSignature(currentRaster.tolerance);
      assertions.push(
        packageAssertion(
          `baseline raster tolerance: ${baselineFixture.name} page ${baselineRaster.page}`,
          JSON.stringify(currentTolerance) === JSON.stringify(baselineTolerance),
          { expected: baselineTolerance, actual: currentTolerance },
        ),
      );

      assertions.push(
        packageAssertion(
          `baseline raster artifact presence: ${baselineFixture.name} page ${baselineRaster.page}`,
          Boolean(currentRaster.png) === Boolean(baselineRaster.png),
          { expectedPng: Boolean(baselineRaster.png), actualPng: Boolean(currentRaster.png) },
        ),
      );

      if (baselineRaster.pngByteLength !== null) {
        assertions.push(
          packageAssertion(
            `baseline raster byte length: ${baselineFixture.name} page ${baselineRaster.page}`,
            currentRaster.pngByteLength !== null &&
              currentRaster.pngByteLength > 0 &&
              Math.abs(currentRaster.pngByteLength - baselineRaster.pngByteLength) <=
                Math.max(4096, Math.round(baselineRaster.pngByteLength * 0.1)),
            {
              expected: baselineRaster.pngByteLength,
              actual: currentRaster.pngByteLength,
            },
          ),
        );
      }

      if (baselineRaster.png && currentRaster.png) {
        const compareTool = await findRasterCompareTool();
        assertions.push(
          packageAssertion(
            `baseline raster pixel comparison tool: ${baselineFixture.name} page ${baselineRaster.page}`,
            Boolean(compareTool),
          ),
        );
        if (!compareTool) {
          continue;
        }

        const baselinePng = await manifestAssetPath(input.baselinePath, baselineRaster.png);
        const currentPng = await manifestAssetPath(input.currentManifestPath, currentRaster.png);
        assertions.push(
          packageAssertion(
            `baseline raster file exists: ${baselineFixture.name} page ${baselineRaster.page}`,
            Boolean(baselinePng) && Boolean(currentPng),
            { baselinePng: baselineRaster.png, currentPng: currentRaster.png },
          ),
        );
        if (!baselinePng || !currentPng) {
          continue;
        }

        const tolerance =
          currentRaster.tolerance.kind === "pixelBaseline"
            ? currentRaster.tolerance
            : { kind: "pixelBaseline" as const, ...rasterTolerance(currentRaster.category) };
        const differencePng = join(
          dirname(currentPng),
          `${parse(basename(currentPng)).name}-baseline-diff.png`,
        );
        const differentPixels = await compareRasterPixels({
          baselinePng,
          currentPng,
          differencePng,
          tool: compareTool,
        });
        currentRaster.baselineComparison = {
          baselinePng,
          currentPng,
          differencePng,
          differentPixels,
          maxDifferentPixels: tolerance.maxDifferentPixels,
          tool: compareTool.label,
        };
        assertions.push(
          packageAssertion(
            `baseline raster pixels: ${baselineFixture.name} page ${baselineRaster.page}`,
            differentPixels <= tolerance.maxDifferentPixels,
            {
              differentPixels,
              maxDifferentPixels: tolerance.maxDifferentPixels,
              differencePng,
              category: currentRaster.category,
            },
          ),
        );
      }
    }
  }

  return assertions;
}

async function writeManifest(input: {
  baselinePath: string | null;
  manifest: ArtifactManifest;
  path: string;
}) {
  if (input.baselinePath) {
    const baselineAssertions = await assertManifestBaseline({
      baselinePath: input.baselinePath,
      currentManifestPath: input.path,
      manifest: input.manifest,
    });
    const firstFixture = input.manifest.fixtures[0];
    if (!firstFixture) {
      throw new Error("Render manifest baseline comparison needs at least one fixture.");
    }
    firstFixture.packageAssertions.push(...baselineAssertions);
  }

  await writeFile(input.path, `${JSON.stringify(input.manifest, null, 2)}\n`);
}

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const exitReason =
        code === null ? `terminated by signal ${signal ?? "unknown"}` : `exited with code ${code}`;
      reject(new Error(`${command} ${args.join(" ")} ${exitReason}.`));
    });
  });
}

async function capture(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const output = Buffer.concat(chunks).toString("utf8").trim();
      resolve(output.length > 0 ? output.split("\n")[0] : null);
    });
  });
}

async function findCommand(candidates: string[]): Promise<string | null> {
  const finder = process.platform === "win32" ? "where" : "which";

  for (const candidate of candidates) {
    const found = await capture(finder, [candidate]);
    if (found) {
      return candidate;
    }
  }

  return null;
}

function zipEntry(zip: Unzipped, path: string): string {
  const entry = zip[path];
  if (!entry) {
    throw new Error(`Generated PPTX is missing required zip entry: ${path}`);
  }
  return strFromU8(entry);
}

function slidePaths(zip: Unzipped): string[] {
  return Object.keys(zip)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort();
}

function relationshipPaths(zip: Unzipped): string[] {
  return Object.keys(zip)
    .filter((path) => path.endsWith(".rels"))
    .sort();
}

function mediaPaths(zip: Unzipped): string[] {
  return Object.keys(zip)
    .filter((path) => path.startsWith("ppt/media/"))
    .sort();
}

function packageAssertion(
  name: string,
  condition: boolean,
  details?: Record<string, unknown>,
): PackageAssertionResult {
  if (!condition) {
    throw new Error(`PPTX package assertion failed: ${name}`);
  }

  return { name, status: "passed", ...(details ? { details } : {}) };
}

async function assertPptxZip(input: {
  path: string;
  expectedSlides: number;
  requiredTexts: readonly string[];
  requireImageRelationship?: boolean;
  requireHyperlinkRelationship?: boolean;
  requireGradientFillSignal?: boolean;
  requireImageCropSourceRectSignal?: boolean;
  requirePaintOrderSignal?: boolean;
  requireRichTextRunSignal?: boolean;
  requireShadowSignal?: boolean;
  requireTextBodySignal?: boolean;
  requireTemplateLayoutTopology?: boolean;
}): Promise<PackageAssertionResult[]> {
  const zip = unzipSync(new Uint8Array(await readFile(input.path)));
  const slides = slidePaths(zip);
  const relationships = relationshipPaths(zip);
  const requiredEntries = ["[Content_Types].xml", "ppt/presentation.xml", "ppt/slides/slide1.xml"];
  const missingEntries = requiredEntries.filter((entry) => !zip[entry]);
  const assertions: PackageAssertionResult[] = [];

  assertions.push(
    packageAssertion("required package entries", missingEntries.length === 0, { requiredEntries }),
  );
  assertions.push(
    packageAssertion("slide count", slides.length === input.expectedSlides, {
      expectedSlides: input.expectedSlides,
      actualSlides: slides.length,
    }),
  );

  const contentTypes = zipEntry(zip, "[Content_Types].xml");
  const slideXmlByPath = new Map(slides.map((slide) => [slide, zipEntry(zip, slide)]));
  const slideXml = (path: string): string => slideXmlByPath.get(path) ?? zipEntry(zip, path);
  assertions.push(
    packageAssertion(
      "presentation and slide content types",
      contentTypes.includes("presentationml.presentation.main+xml") &&
        contentTypes.includes("presentationml.slide+xml"),
    ),
  );
  assertions.push(
    packageAssertion(
      "support package parts",
      Boolean(zip["ppt/theme/theme1.xml"]) &&
        Boolean(zip["ppt/slideMasters/slideMaster1.xml"]) &&
        Boolean(zip["ppt/slideLayouts/slideLayout1.xml"]),
    ),
  );

  const allSlideXml = slides.map((slide) => slideXml(slide)).join("\n");
  for (const text of input.requiredTexts) {
    assertions.push(packageAssertion(`text signal: ${text}`, allSlideXml.includes(text), { text }));
  }

  const allRelationshipXml = relationships
    .map((relationship) => zipEntry(zip, relationship))
    .join("\n");
  if (input.requireImageRelationship) {
    assertions.push(
      packageAssertion(
        "image relationship and media entry",
        allRelationshipXml.includes("/image") && mediaPaths(zip).length > 0,
        { mediaEntries: mediaPaths(zip).length },
      ),
    );
  }

  if (input.requireHyperlinkRelationship) {
    assertions.push(
      packageAssertion(
        "external hyperlink relationship",
        allRelationshipXml.includes("/hyperlink") &&
          allRelationshipXml.includes('TargetMode="External"'),
      ),
    );
  }

  if (input.requireGradientFillSignal) {
    const gradientSlide = slideXml("ppt/slides/slide5.xml");
    assertions.push(
      packageAssertion(
        "gradient fill signal",
        gradientSlide.includes("Gradient verification") &&
          gradientSlide.includes("<a:gradFill") &&
          (gradientSlide.includes("EF4444") || gradientSlide.includes("ef4444")) &&
          (gradientSlide.includes("F59E0B") || gradientSlide.includes("f59e0b")),
      ),
    );
  }

  if (input.requireImageCropSourceRectSignal) {
    const cropSlide = slideXml("ppt/slides/slide3.xml");
    assertions.push(
      packageAssertion(
        "image crop source-rect signal",
        cropSlide.includes("Image crop verification") &&
          cropSlide.includes('<a:srcRect l="10000" r="20000" t="0" b="30000"/>'),
      ),
    );
  }

  if (input.requirePaintOrderSignal) {
    const paintSlide = zipEntry(zip, "ppt/slides/slide2.xml");
    const backIndex = paintSlide.indexOf("Back layer");
    const middleIndex = paintSlide.indexOf("Middle layer");
    const frontIndex = paintSlide.indexOf("Front layer");
    assertions.push(
      packageAssertion(
        "paint-order z-index signal",
        backIndex >= 0 && middleIndex > backIndex && frontIndex > middleIndex,
        { backIndex, middleIndex, frontIndex },
      ),
    );
  }

  if (input.requireRichTextRunSignal) {
    const richTextSlide = slideXml("ppt/slides/slide1.xml");
    assertions.push(
      packageAssertion(
        "rich-text run signal",
        richTextSlide.includes("Migration ") &&
          richTextSlide.includes("bold red") &&
          richTextSlide.includes(" signal") &&
          (richTextSlide.includes("DC2626") || richTextSlide.includes("dc2626")) &&
          (richTextSlide.includes('b="1"') || richTextSlide.includes('b="true"')),
      ),
    );
  }

  if (input.requireShadowSignal) {
    const shadowSlide = slideXml("ppt/slides/slide4.xml");
    assertions.push(
      packageAssertion(
        "outer shadow signal",
        shadowSlide.includes("Shadow verification") &&
          shadowSlide.includes("<a:outerShdw") &&
          (shadowSlide.includes("2563EB") || shadowSlide.includes("2563eb")),
      ),
    );
  }

  if (input.requireTextBodySignal) {
    const textBodySlide = slideXml("ppt/slides/slide6.xml");
    assertions.push(
      packageAssertion(
        "text body semantics signal",
        textBodySlide.includes("Text body verification") &&
          textBodySlide.includes('rtl="1"') &&
          textBodySlide.includes('baseline="30000"') &&
          textBodySlide.includes('baseline="-40000"') &&
          textBodySlide.includes('u="wavy"') &&
          textBodySlide.includes('spc="150"') &&
          textBodySlide.includes("<a:normAutofit/>") &&
          textBodySlide.includes("<a:spAutoFit/>") &&
          textBodySlide.includes('anchor="ctr"') &&
          textBodySlide.includes('anchor="b"') &&
          textBodySlide.includes('lIns="76200"') &&
          textBodySlide.includes('tIns="152400"') &&
          textBodySlide.includes('rIns="152400"') &&
          textBodySlide.includes('bIns="76200"') &&
          textBodySlide.includes('algn="ctr"') &&
          textBodySlide.includes('algn="r"') &&
          textBodySlide.includes('algn="just"') &&
          (textBodySlide.includes("FF6347") || textBodySlide.includes("ff6347")) &&
          textBodySlide.includes("<a:buChar") &&
          textBodySlide.includes("<a:buAutoNum") &&
          textBodySlide.includes('<a:lnSpc><a:spcPts val="2800"/></a:lnSpc>') &&
          textBodySlide.includes('<a:spcBef><a:spcPts val="1200"/></a:spcBef>') &&
          textBodySlide.includes('<a:spcAft><a:spcPts val="1800"/></a:spcAft>'),
      ),
    );
  }

  if (input.requireTemplateLayoutTopology) {
    const masterXml = zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRels = zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");
    const slide1Rels = zipEntry(zip, "ppt/slides/_rels/slide1.xml.rels");
    const layout2Xml = zipEntry(zip, "ppt/slideLayouts/slideLayout2.xml");
    const layout2Rels = zipEntry(zip, "ppt/slideLayouts/_rels/slideLayout2.xml.rels");

    assertions.push(
      packageAssertion(
        "template-derived slide layout topology",
        contentTypes.includes("/ppt/slideLayouts/slideLayout2.xml") &&
          masterXml.includes('<p:sldLayoutId id="2147483650"') &&
          masterRels.includes('Target="../slideLayouts/slideLayout2.xml"') &&
          slide1Rels.includes('Target="../slideLayouts/slideLayout2.xml"') &&
          layout2Rels.includes('Target="../slideMasters/slideMaster1.xml"') &&
          layout2Xml.includes('<p:cSld name="report">'),
      ),
    );
  }

  assertions.push(
    packageAssertion("relationship part count", relationships.length >= input.expectedSlides + 4, {
      relationshipParts: relationships.length,
    }),
  );

  return assertions;
}

async function writeVerificationDeck(output: string) {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    meta: { title: "deckjsx v0.8 verification fixture", author: "deckjsx" },
    templates: {
      report: {
        areas: {
          title: { kind: "title", frame: { x: 0.7, y: 0.55, width: 7.8, height: 0.7 } },
          body: { kind: "body", frame: { x: 0.7, y: 1.35, width: 6.2, height: 3.8 } },
        },
      },
    },
  });

  deck.slide({ name: "Template and media", template: "report" }, ({ template }) => [
    <h1 area={template.title} style={{ fontSize: 26, fontWeight: 700, color: "#0F172A" }}>
      Template layout verification
    </h1>,
    <p area={template.body} style={{ fontSize: 16, color: "#334155" }}>
      Template areas project into slide layout topology.
    </p>,
    <img
      data={pngData}
      style={{ x: 7.25, y: 1.45, width: 1.2, height: 1.2, objectFit: "stretch" }}
    />,
    <p
      style={{
        x: 7.25,
        y: 3,
        width: 2,
        height: 0.4,
        fontSize: 15,
        color: "#2563EB",
        href: "https://example.com/deckjsx",
      }}
    >
      Linked docs
    </p>,
    <p style={{ x: 0.7, y: 4.45, width: 5.2, height: 0.45, fontSize: 16, color: "#334155" }}>
      Migration <span style={{ color: "#DC2626", fontWeight: 700 }}>bold red</span> signal
    </p>,
  ]);

  deck.slide({ name: "Paint order" }, () => [
    <p style={{ x: 1, y: 0.8, width: 3, height: 0.45, fontSize: 18, zIndex: 10 }}>Front layer</p>,
    <shape shape="rect" style={{ x: 0.8, y: 1.55, width: 2.4, height: 0.7, fill: "#16A34A" }} />,
    <p style={{ x: 1, y: 1.65, width: 3, height: 0.45, fontSize: 18, zIndex: 1 }}>Middle layer</p>,
    <p style={{ x: 1, y: 2.5, width: 3, height: 0.45, fontSize: 18, zIndex: -1 }}>Back layer</p>,
  ]);

  deck.slide({ name: "Image crop" }, () => [
    <h1 style={{ x: 0.8, y: 0.75, width: 6, height: 0.55, fontSize: 22, color: "#0F172A" }}>
      Image crop verification
    </h1>,
    <img
      data={widePngData}
      style={{
        x: 0.8,
        y: 1.55,
        width: 3,
        height: 1.5,
        crop: { left: "10%", right: "20%", bottom: "30%" },
      }}
    />,
  ]);

  deck.slide({ name: "Shadow effect" }, () => [
    <h1 style={{ x: 0.8, y: 0.75, width: 6, height: 0.55, fontSize: 22, color: "#0F172A" }}>
      Shadow verification
    </h1>,
    <shape
      shape="rect"
      style={{
        x: 0.8,
        y: 1.55,
        width: 3,
        height: 1.25,
        fill: "#DBEAFE",
        stroke: "1pt solid #1D4ED8",
        boxShadow: "6px 6px 10px rgba(37, 99, 235, 0.45)",
      }}
    />,
  ]);

  deck.slide({ name: "Gradient fill" }, () => [
    <h1 style={{ x: 0.8, y: 0.75, width: 6, height: 0.55, fontSize: 22, color: "#0F172A" }}>
      Gradient verification
    </h1>,
    <shape
      shape="rect"
      style={{
        x: 0.8,
        y: 1.55,
        width: 3,
        height: 1.25,
        fill: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
        stroke: "1pt solid #7C2D12",
      }}
    />,
  ]);

  deck.slide({ name: "Text body semantics" }, () => [
    <h1 style={{ x: 0.8, y: 0.55, width: 6.5, height: 0.5, fontSize: 22, color: "#0F172A" }}>
      Text body verification
    </h1>,
    <p
      style={{
        x: 0.8,
        y: 1.25,
        width: 2.8,
        height: 0.5,
        fontSize: 18,
        direction: "rtl",
        lineHeight: "28pt",
        color: "#334155",
      }}
    >
      RTL text
    </p>,
    <p
      style={{
        x: 0.8,
        y: 1.95,
        width: 2.8,
        height: 0.5,
        fontSize: 18,
        superscript: true,
        fit: "shrink",
      }}
    >
      Super
    </p>,
    <p
      style={{
        x: 0.8,
        y: 2.65,
        width: 2.8,
        height: 0.5,
        fontSize: 18,
        subscript: true,
        fit: "resize",
      }}
    >
      Sub
    </p>,
    <p
      style={{
        x: 4.2,
        y: 1.25,
        width: 2.8,
        height: 0.5,
        fontSize: 18,
        textDecorationLine: "underline",
        textDecorationStyle: "wavy",
        textDecorationColor: "tomato",
        letterSpacing: 1.5,
        verticalAlign: "middle",
        padding: ["12pt", "12pt", "6pt", "6pt"],
        textAlign: "center",
      }}
    >
      Decorated
    </p>,
    <p style={{ x: 4.2, y: 1.95, width: 3, height: 0.5, fontSize: 18, listStyleType: "circle" }}>
      Bullet item
    </p>,
    <p
      style={{
        x: 4.2,
        y: 2.65,
        width: 3,
        height: 0.5,
        fontSize: 18,
        listStyleType: "upper-roman",
        listStart: 3,
        paragraphSpacingBefore: 12,
        paragraphSpacingAfter: 18,
        verticalAlign: "bottom",
        textAlign: "right",
      }}
    >
      Number item
    </p>,
    <p style={{ x: 0.8, y: 3.35, width: 4, height: 0.5, fontSize: 18, textAlign: "justify" }}>
      Justified text
    </p>,
  ]);

  const render = await deck.render();
  if (!render.ok) {
    const details = render.diagnostics.items
      .map((item) => {
        const labels = item.labels?.map((label) => `${label.path}: ${label.message}`).join("; ");
        const notes = item.notes?.join("; ");
        return [item.code, labels, notes].filter(Boolean).join(" | ");
      })
      .join("\n");
    throw new Error(
      `Verification deck render failed: ${render.diagnostics.items
        .map((item) => item.code)
        .join(", ")}${details ? `\n${details}` : ""}`,
    );
  }
  if (!render.artifact) {
    throw new Error("Verification deck render did not return artifact bytes.");
  }
  await writeFile(output, render.artifact.bytes);
}

async function writeSampleDeck(output: string) {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    meta: { title: "deckjsx Sample Report", author: "deckjsx" },
  });

  deck.slide({ name: "deckjsx Sample Report", style: { backgroundColor: "#F8FAFC" } }, () => [
    <header style={{ x: 0.7, y: 0.55, width: 8.4, height: 0.7 }}>
      <h1
        style={{
          width: "100%",
          height: 0.55,
          fontSize: 28,
          fontWeight: 700,
          color: "#0F172A",
        }}
      >
        deckjsx Sample Report
      </h1>
    </header>,
    <main
      style={{
        x: 0.7,
        y: 1.35,
        width: 8.6,
        height: 3.6,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 0.35,
      }}
    >
      <section
        style={{
          backgroundColor: "#DBEAFE",
          padding: 0.22,
          borderRadius: 0.12,
          display: "flex",
          flexDirection: "column",
          gap: 0.12,
        }}
      >
        <h2 style={{ width: "100%", height: 0.35, fontSize: 18, color: "#1D4ED8" }}>
          JSX authoring
        </h2>
        <p style={{ width: "100%", height: 0.35, fontSize: 13, color: "#334155" }}>
          Write slides with typed TSX.
        </p>
      </section>
      <section
        style={{
          backgroundColor: "#DCFCE7",
          padding: 0.22,
          borderRadius: 0.12,
          display: "flex",
          flexDirection: "column",
          gap: 0.12,
        }}
      >
        <h2 style={{ width: "100%", height: 0.35, fontSize: 18, color: "#15803D" }}>typed TSX</h2>
        <p style={{ width: "100%", height: 0.35, fontSize: 13, color: "#334155" }}>
          Project then render direct PPTX.
        </p>
      </section>
    </main>,
  ]);

  deck.slide({ name: "Takeaways" }, () => [
    <h1 style={{ x: 0.7, y: 0.55, width: 8, height: 0.7, fontSize: 26, color: "#0F172A" }}>
      Takeaways
    </h1>,
    <p style={{ x: 0.9, y: 1.45, width: 7.6, height: 0.5, fontSize: 18 }}>
      JSX authoring stays declarative.
    </p>,
    <p style={{ x: 0.9, y: 2.15, width: 7.6, height: 0.5, fontSize: 18 }}>
      typed TSX keeps slide intent inspectable.
    </p>,
  ]);

  const render = await deck.render();
  if (!render.ok) {
    throw new Error(
      `Sample deck render failed: ${render.diagnostics.items.map((item) => item.code).join(", ")}`,
    );
  }
  if (!render.artifact) {
    throw new Error("Sample deck render did not return artifact bytes.");
  }
  await writeFile(output, render.artifact.bytes);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tools: ToolResult[] = [];

  await mkdir(options.outdir, { recursive: true });

  const fixtures: FixtureManifest[] = [
    {
      name: "sample-report",
      pptx: join(options.outdir, "deckjsx-sample.pptx"),
      pdf: null,
      pngs: [],
      packageAssertions: [],
      rasterExpectations: [],
    },
    {
      name: "v0.8-generation-regression",
      pptx: join(options.outdir, "deckjsx-v0.8-regression.pptx"),
      pdf: null,
      pngs: [],
      packageAssertions: [],
      rasterExpectations: [],
    },
  ];

  await writeSampleDeck(fixtures[0]!.pptx);
  fixtures[0]!.packageAssertions = await assertPptxZip({
    path: fixtures[0]!.pptx,
    expectedSlides: 2,
    requiredTexts: ["deckjsx Sample Report", "Takeaways", "JSX authoring", "typed TSX"],
  });
  console.log(`Generated and verified PPTX zip: ${fixtures[0]!.pptx}`);

  await writeVerificationDeck(fixtures[1]!.pptx);
  fixtures[1]!.packageAssertions = await assertPptxZip({
    path: fixtures[1]!.pptx,
    expectedSlides: 6,
    requiredTexts: [
      "Template layout verification",
      "Template areas project into slide layout topology.",
      "Linked docs",
      "Migration ",
      "bold red",
      " signal",
      "Back layer",
      "Middle layer",
      "Front layer",
      "Image crop verification",
      "Shadow verification",
      "Gradient verification",
      "Text body verification",
      "RTL text",
      "Super",
      "Sub",
      "Decorated",
      "Bullet item",
      "Number item",
    ],
    requireGradientFillSignal: true,
    requireImageRelationship: true,
    requireHyperlinkRelationship: true,
    requireImageCropSourceRectSignal: true,
    requirePaintOrderSignal: true,
    requireRichTextRunSignal: true,
    requireShadowSignal: true,
    requireTextBodySignal: true,
    requireTemplateLayoutTopology: true,
  });
  console.log(`Generated and verified PPTX zip: ${fixtures[1]!.pptx}`);

  for (const fixture of fixtures) {
    for (const page of rasterPagesForFixture(fixture, options.pages)) {
      const category = rasterCategoryForFixture(fixture, page);
      fixture.rasterExpectations.push({
        page,
        category,
        tolerance: {
          kind: "manualArtifact",
          note: "Raster artifact was not produced; use package assertions and generated PPTX/PDF artifacts.",
        },
        png: null,
        pngByteLength: null,
      });
    }
  }

  if (!renderToolsEnabled) {
    const manifest: ArtifactManifest = {
      pptx: fixtures[0]!.pptx,
      pdf: null,
      pngs: [],
      fixtures,
      renderToolsEnabled,
      tools: [
        { name: "LibreOffice", command: null, status: "disabled" },
        { name: "ImageMagick", command: null, status: "disabled" },
      ],
    };
    const manifestPath = join(options.outdir, "render-manifest.json");
    await writeManifest({ baselinePath: options.baseline, manifest, path: manifestPath });
    console.log(`Renderer tools disabled; wrote render manifest: ${manifestPath}`);
    return;
  }

  const office = await findCommand(["soffice", "libreoffice"]);
  const officeTool: ToolResult = {
    name: "LibreOffice",
    command: office,
    status: office ? "used" : "missing",
  };
  tools.push(officeTool);

  let pdf: string | null = null;
  if (office) {
    for (const fixture of fixtures) {
      try {
        await run(office, [
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          options.outdir,
          fixture.pptx,
        ]);
        const convertedPdf = join(options.outdir, `${parse(basename(fixture.pptx)).name}.pdf`);
        if (!(await fileExists(convertedPdf))) {
          throw new Error(
            `LibreOffice did not produce the expected PDF for ${fixture.name}: ${convertedPdf}`,
          );
        }

        fixture.pdf = convertedPdf;
        pdf ??= fixture.pdf;
        console.log(`Rendered PDF: ${fixture.pdf}`);
      } catch (error) {
        officeTool.status = "failed";
        if (options.strict) {
          throw error;
        }

        console.warn(error instanceof Error ? error.message : String(error));
        console.warn(`LibreOffice PDF render failed for ${fixture.name}. Skipping PDF artifacts.`);
      }
    }
  } else if (options.strict) {
    throw new Error(
      "LibreOffice was not found. Install soffice/libreoffice or rerun without --strict.",
    );
  } else {
    console.warn("LibreOffice was not found. Skipping PDF render.");
  }

  const magick = options.skipRaster ? null : await findCommand(["magick", "convert"]);
  const magickTool: ToolResult = {
    name: "ImageMagick",
    command: magick,
    status: options.skipRaster ? "skipped" : magick ? "used" : "missing",
  };
  tools.push(magickTool);

  if (magick) {
    for (const fixture of fixtures) {
      if (!fixture.pdf) {
        continue;
      }

      for (const expectation of fixture.rasterExpectations) {
        const page = expectation.page;
        const png = join(options.outdir, `${parse(basename(fixture.pptx)).name}-page-${page}.png`);
        try {
          await run(magick, ["-density", "144", `${fixture.pdf}[${page - 1}]`, png]);
          fixture.pngs.push(png);
          expectation.png = png;
          expectation.pngByteLength = await maybePngByteLength(png);
          const tolerance = rasterTolerance(expectation.category);
          expectation.tolerance = {
            kind: "pixelBaseline",
            maxDifferentPixels: tolerance.maxDifferentPixels,
            note: rasterExpectationNote(expectation.category),
          };
          console.log(`Rasterized ${fixture.name} page ${page}: ${png}`);
        } catch (error) {
          magickTool.status = "failed";
          if (options.strict) {
            throw error;
          }

          console.warn(error instanceof Error ? error.message : String(error));
          console.warn(`Skipping raster artifact for ${fixture.name} page ${page}.`);
        }
      }
    }
  } else if (!options.skipRaster && options.strict) {
    throw new Error("ImageMagick was not found or PDF render was skipped.");
  } else if (!options.skipRaster) {
    console.warn("ImageMagick rasterization was skipped.");
  }

  const sampleFixture = fixtures[0]!;
  const manifest: ArtifactManifest = {
    pptx: sampleFixture.pptx,
    pdf: sampleFixture.pdf,
    pngs: sampleFixture.pngs,
    fixtures,
    renderToolsEnabled,
    tools,
  };
  const manifestPath = join(options.outdir, "render-manifest.json");
  await writeManifest({ baselinePath: options.baseline, manifest, path: manifestPath });
  console.log(`Wrote render manifest: ${manifestPath}`);
}

await main();

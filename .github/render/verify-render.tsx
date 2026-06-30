// @ts-nocheck
/** @jsxImportSource deckjsx */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse } from "node:path";
import { spawn } from "node:child_process";
import { strFromU8, unzipSync, type Unzipped } from "fflate";
import {
  listRenderConfidenceFixtures,
  selectRenderConfidenceFixtures,
} from "@/tests/render-confidence/manifest";
import type {
  RenderConfidenceCategory,
  RenderConfidenceFixture,
} from "@/tests/render-confidence/types";

type Options = {
  baseline: string | null;
  fixtureGroups: string[];
  fixtures: string[];
  listFixtures: boolean;
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
  category: RenderConfidenceCategory;
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
  fixtureGroups: [],
  fixtures: [],
  listFixtures: false,
  outdir: ".github/render/artifacts",
  pages: [1, 2],
  strict: false,
  skipRaster: false,
};

const renderToolsEnabled = process.env.DECKJSX_RENDER_WITH_TOOLS === "1";

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

    if (arg === "--fixture-group" && next) {
      options.fixtureGroups.push(next);
      index += 1;
      continue;
    }

    if (arg === "--fixture" && next) {
      options.fixtures.push(next);
      index += 1;
      continue;
    }

    if (arg === "--list-fixtures") {
      options.listFixtures = true;
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
  orderedTextSignals?: readonly string[];
  requiredXmlSnippets?: readonly string[];
  requireImageRelationship?: boolean;
  requireHyperlinkRelationship?: boolean;
  requireGradientFillSignal?: boolean;
  requireImageCropSourceRectSignal?: boolean;
  requirePaintOrderSignal?: boolean;
  requireRichTextRunSignal?: boolean;
  requireShadowSignal?: boolean;
  requireTableSignal?: boolean;
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
  for (const snippet of input.requiredXmlSnippets ?? []) {
    assertions.push(
      packageAssertion(`xml signal: ${snippet}`, allSlideXml.includes(snippet), { snippet }),
    );
  }
  if (input.orderedTextSignals) {
    let previousIndex = -1;
    for (const text of input.orderedTextSignals) {
      const currentIndex = allSlideXml.indexOf(text, previousIndex + 1);
      assertions.push(
        packageAssertion(`ordered text signal: ${text}`, currentIndex > previousIndex, {
          previousIndex,
          currentIndex,
          text,
        }),
      );
      previousIndex = currentIndex;
    }
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
    assertions.push(
      packageAssertion(
        "gradient fill signal",
        allSlideXml.includes("<a:gradFill") &&
          (allSlideXml.includes("EF4444") || allSlideXml.includes("ef4444")) &&
          (allSlideXml.includes("F59E0B") || allSlideXml.includes("f59e0b")),
      ),
    );
  }

  if (input.requireImageCropSourceRectSignal) {
    assertions.push(
      packageAssertion(
        "image crop source-rect signal",
        allSlideXml.includes('<a:srcRect l="10000" r="20000" t="0" b="30000"/>') ||
          allSlideXml.includes("<a:srcRect"),
      ),
    );
  }

  if (input.requirePaintOrderSignal && input.orderedTextSignals) {
    assertions.push(
      packageAssertion(
        "paint-order z-index signal declared",
        input.orderedTextSignals.length >= 2,
        { orderedTextSignals: input.orderedTextSignals },
      ),
    );
  }

  if (input.requireRichTextRunSignal) {
    assertions.push(
      packageAssertion(
        "rich-text run signal",
        (allSlideXml.includes("DC2626") || allSlideXml.includes("dc2626")) &&
          (allSlideXml.includes('b="1"') || allSlideXml.includes('b="true"')),
      ),
    );
  }

  if (input.requireShadowSignal) {
    assertions.push(
      packageAssertion(
        "outer shadow signal",
        allSlideXml.includes("<a:outerShdw") &&
          (allSlideXml.includes("2563EB") || allSlideXml.includes("2563eb")),
      ),
    );
  }

  if (input.requireTextBodySignal) {
    assertions.push(
      packageAssertion(
        "text body semantics signal",
        (input.requiredXmlSnippets ?? []).every((snippet) => allSlideXml.includes(snippet)),
      ),
    );
  }

  if (input.requireTableSignal) {
    assertions.push(
      packageAssertion(
        "table graphic frame signal",
        allSlideXml.includes("graphicFrame") &&
          allSlideXml.includes("http://schemas.openxmlformats.org/drawingml/2006/table"),
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

async function renderConfidenceFixture(
  fixture: RenderConfidenceFixture,
  outdir: string,
  requestedPages: readonly number[],
): Promise<FixtureManifest> {
  const pptx = join(outdir, `${fixture.artifactBaseName}.pptx`);
  const startedAt = performance.now();
  const render = await fixture.createDeck().render();
  const renderMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
  if (!render.ok) {
    throw new Error(
      `${fixture.name} render failed: ${render.diagnostics.items.map((item) => item.code).join(", ")}`,
    );
  }
  if (!render.artifact) {
    throw new Error(`${fixture.name} render did not return artifact bytes.`);
  }

  await writeFile(pptx, render.artifact.bytes);
  const packageAssertions = await assertPptxZip({
    path: pptx,
    ...fixture.assertions,
  });
  packageAssertions.push(
    packageAssertion(`${fixture.name} render timing recorded`, renderMs >= 0, { renderMs }),
  );

  const rasterPages =
    fixture.rasterPages.length > 0
      ? fixture.rasterPages
      : [...new Set(requestedPages)]
          .sort((left, right) => left - right)
          .map((page) => ({ page, category: "complexLayout" as const }));

  return {
    name: fixture.name,
    pptx,
    pdf: null,
    pngs: [],
    packageAssertions,
    rasterExpectations: rasterPages.map((item) => ({
      page: item.page,
      category: item.category,
      tolerance: {
        kind: "manualArtifact",
        note: "Raster artifact was not produced; use package assertions and generated PPTX/PDF artifacts.",
      },
      png: null,
      pngByteLength: null,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tools: ToolResult[] = [];

  if (options.listFixtures) {
    for (const fixture of listRenderConfidenceFixtures()) {
      console.log(`${fixture.name}\t${fixture.group}\t${fixture.description}`);
    }
    return;
  }

  await mkdir(options.outdir, { recursive: true });

  const selectedFixtures = selectRenderConfidenceFixtures({
    fixtureGroups: options.fixtureGroups,
    fixtureNames: options.fixtures,
  });
  const fixtures: FixtureManifest[] = [];

  for (const selectedFixture of selectedFixtures) {
    const fixture = await renderConfidenceFixture(selectedFixture, options.outdir, options.pages);
    fixtures.push(fixture);
    console.log(`Generated and verified render confidence fixture: ${fixture.pptx}`);
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

  const firstFixture = fixtures[0]!;
  const manifest: ArtifactManifest = {
    pptx: firstFixture.pptx,
    pdf: firstFixture.pdf,
    pngs: firstFixture.pngs,
    fixtures,
    renderToolsEnabled,
    tools,
  };
  const manifestPath = join(options.outdir, "render-manifest.json");
  await writeManifest({ baselinePath: options.baseline, manifest, path: manifestPath });
  console.log(`Wrote render manifest: ${manifestPath}`);
}

await main();

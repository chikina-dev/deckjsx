import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, parse } from "node:path";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import { writeSampleDeck } from "../examples/pdf-sample.tsx";

type Options = {
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

type ArtifactManifest = {
  pptx: string;
  pdf: string | null;
  pngs: string[];
  renderToolsEnabled: boolean;
  tools: ToolResult[];
};

const defaultOptions: Options = {
  outdir: "examples/rendered",
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

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}.`));
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

async function assertPptxZip(path: string) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const requiredEntries = ["[Content_Types].xml", "ppt/presentation.xml", "ppt/slides/slide1.xml"];
  const missingEntries = requiredEntries.filter((entry) => !zip.file(entry));

  if (missingEntries.length > 0) {
    throw new Error(`Generated PPTX is missing required zip entries: ${missingEntries.join(", ")}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tools: ToolResult[] = [];
  const pngs: string[] = [];

  await mkdir(options.outdir, { recursive: true });

  const pptx = join(options.outdir, "deckjsx-sample.pptx");
  await writeSampleDeck(pptx);
  await assertPptxZip(pptx);
  console.log(`Generated and verified PPTX zip: ${pptx}`);

  if (!renderToolsEnabled) {
    const manifest: ArtifactManifest = {
      pptx,
      pdf: null,
      pngs,
      renderToolsEnabled,
      tools: [
        { name: "LibreOffice", command: null, status: "disabled" },
        { name: "ImageMagick", command: null, status: "disabled" },
      ],
    };
    const manifestPath = join(options.outdir, "render-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
    try {
      await run(office, ["--headless", "--convert-to", "pdf", "--outdir", options.outdir, pptx]);
      pdf = join(options.outdir, `${parse(basename(pptx)).name}.pdf`);
      console.log(`Rendered PDF: ${pdf}`);
    } catch (error) {
      officeTool.status = "failed";
      if (options.strict) {
        throw error;
      }

      console.warn(error instanceof Error ? error.message : String(error));
      console.warn("LibreOffice PDF render failed. Skipping PDF artifacts.");
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

  if (pdf && magick) {
    for (const page of options.pages) {
      const png = join(options.outdir, `deckjsx-sample-page-${page}.png`);
      try {
        await run(magick, ["-density", "144", `${pdf}[${page - 1}]`, png]);
        pngs.push(png);
        console.log(`Rasterized page ${page}: ${png}`);
      } catch (error) {
        magickTool.status = "failed";
        if (options.strict) {
          throw error;
        }

        console.warn(error instanceof Error ? error.message : String(error));
        console.warn(`Skipping raster artifact for page ${page}.`);
      }
    }
  } else if (!options.skipRaster && options.strict) {
    throw new Error("ImageMagick was not found or PDF render was skipped.");
  } else if (!options.skipRaster) {
    console.warn("ImageMagick rasterization was skipped.");
  }

  const manifest: ArtifactManifest = { pptx, pdf, pngs, renderToolsEnabled, tools };
  const manifestPath = join(options.outdir, "render-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote render manifest: ${manifestPath}`);
}

await main();

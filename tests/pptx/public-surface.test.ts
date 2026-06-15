import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

type PackageJson = {
  dependencies?: Record<string, string>;
  files?: readonly string[];
  exports?: Record<string, string>;
};

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

async function readRepoText(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

async function sourceFiles(dir: string): Promise<string[]> {
  try {
    await stat(dir);
  } catch {
    throw new Error(
      `Expected generated public declaration output at ${dir}. Run \`bun run build\` before public-surface tests.`,
    );
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return files.flat();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe("public surface", () => {
  test("package export map exposes only intentional public entry points", async () => {
    const pkg = await readPackageJson();
    const packageRoot = new URL("../..", import.meta.url).pathname;

    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.exports).toEqual({
      ".": "./dist/index.mjs",
      "./adapter": "./dist/adapter.mjs",
      "./inspect": "./dist/inspect.mjs",
      "./jsx-dev-runtime": "./dist/jsx-dev-runtime.mjs",
      "./jsx-runtime": "./dist/jsx-runtime.mjs",
      "./package.json": "./package.json",
    });

    for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
      expect(subpath).not.toContain("*");
      expect(String(target)).not.toMatch(/(?:^|\/)(?:src|writers|projection|runtime)\//);
      expect(String(target)).not.toMatch(/(?:^|\/)(?:adapter|index|inspect)-[A-Za-z0-9_-]+\.mjs$/);
      if (subpath !== "./package.json") {
        expect(await fileExists(join(packageRoot, String(target)))).toBe(true);
      }
    }
  });

  test("public declaration output does not leak direct-writer internals", async () => {
    const distFiles = await sourceFiles(new URL("../../dist", import.meta.url).pathname);
    const declarationFiles = distFiles.filter((file) => file.endsWith(".d.mts"));
    const declarations = await Promise.all(
      declarationFiles.map(async (file) => [file, await readFile(file, "utf8")] as const),
    );

    const publicDeclarationText = declarations
      .filter(([file]) => /\/(?:adapter|index|inspect)(?:-[A-Za-z0-9_-]+)?\.d\.mts$/.test(file))
      .map(([file, source]) => `\n/* ${file} */\n${source}`)
      .join("\n");

    expect(publicDeclarationText).not.toMatch(/src\/writers/);
    expect(publicDeclarationText).not.toMatch(/src\/runtime/);
    expect(publicDeclarationText).not.toMatch(/src\/pipeline-artifacts/);
    expect(publicDeclarationText).not.toMatch(/\bXmlChunkWriter\b/);
    expect(publicDeclarationText).not.toMatch(/\bPptxWriterContext\b/);
    expect(publicDeclarationText).not.toMatch(/\bPptxZipSink\b/);
    expect(publicDeclarationText).not.toMatch(/\bPptxPackageBuildArtifact\b/);
    expect(publicDeclarationText).not.toMatch(/\bAssetArtifact\b/);
    expect(publicDeclarationText).not.toMatch(/\bAssetLoader\b/);
    expect(publicDeclarationText).not.toMatch(/\bAssetLoaderContext\b/);
    expect(publicDeclarationText).not.toMatch(/\bAssetProbeResult\b/);
    expect(publicDeclarationText).not.toMatch(/\bAssetLoadResult\b/);
    expect(publicDeclarationText).not.toMatch(/\bAssetSource\b/);
    expect(publicDeclarationText).not.toMatch(/\bWrittenOutput\b/);
    expect(publicDeclarationText).not.toMatch(/\bRenderOutputSideEffect/);
    expect(publicDeclarationText).not.toMatch(/\bfflate\b/);
    expect(publicDeclarationText).not.toMatch(/\bPptxCompressionMode\b/);
    expect(publicDeclarationText).not.toMatch(/\bLayoutInput/);
    expect(publicDeclarationText).not.toMatch(/\bProjectedLayoutDocument\b/);
    expect(publicDeclarationText).not.toMatch(/\bAuthorNode\b/);
    expect(publicDeclarationText).not.toMatch(/\bAuthorTreeNode\b/);
    expect(publicDeclarationText).not.toMatch(/\bAuthorElementNode\b/);
    expect(publicDeclarationText).not.toMatch(/\bAuthorTreeChild\b/);

    const declarationText = declarations
      .map(([file, source]) => `\n/* ${file} */\n${source}`)
      .join("\n");

    expect(declarationText).not.toMatch(/\bunknown\b/);
    expect(declarationText).not.toMatch(/Record<string, unknown>/);
    expect(declarationText).not.toMatch(/readonly unknown\[\]/);
  });

  test("public type tests do not rely on catch-all payload casts", async () => {
    const typeTestFiles = await sourceFiles(new URL("../../tests/types", import.meta.url).pathname);
    const typeTestText = (
      await Promise.all(typeTestFiles.map(async (file) => readFile(file, "utf8")))
    ).join("\n");

    expect(typeTestText).not.toMatch(/as unknown as/);
    expect(typeTestText).not.toMatch(/Record<string, unknown>/);
    expect(typeTestText).not.toMatch(/readonly unknown\[\]/);
  });

  test("core package has no runtime dependencies", async () => {
    const pkg = await readPackageJson();

    expect(pkg.dependencies).toEqual({});
  });

  test("core source does not import node filesystem builtins", async () => {
    const files = await sourceFiles(new URL("../../src", import.meta.url).pathname);
    const sources = await Promise.all(
      files.map(async (file) => [file, await readFile(file, "utf8")] as const),
    );
    const nodeBuiltinImport =
      /\b(?:from|import)\s*(?:\([^)]*)?["']node:(?:fs|path|os|stream|buffer|crypto|zlib)[^"']*["']/;
    const bareNodeBuiltinImport =
      /\b(?:from|require\()\s*["'](?:fs|path|os|stream|buffer|crypto|zlib)["']/;
    const nodeImportFiles = sources
      .filter(([, source]) => nodeBuiltinImport.test(source) || bareNodeBuiltinImport.test(source))
      .map(([file]) => file.replace(new URL("../../", import.meta.url).pathname, ""));

    expect(nodeImportFiles).toEqual([]);
  });

  test("published public entry files do not statically import node builtins", async () => {
    const publicEntries = [
      "dist/index.mjs",
      "dist/adapter.mjs",
      "dist/inspect.mjs",
      "dist/jsx-runtime.mjs",
      "dist/jsx-dev-runtime.mjs",
    ];
    const staticNodeImport =
      /\bimport\s+(?:[^("'`;]+?\s+from\s+)?["']node:(?:fs|path|os|stream|buffer|crypto|zlib)[^"']*["']/;

    const entrySources = await Promise.all(
      publicEntries.map(async (path) => [path, await readRepoText(path)] as const),
    );

    for (const [path, source] of entrySources) {
      expect(source, `${path} must stay browser/edge-loadable without node builtins`).not.toMatch(
        staticNodeImport,
      );
    }
  });

  test("release workflow keeps v0.8 direct-writer gates before publishing", async () => {
    const workflow = await readRepoText(".github/workflows/release.yml");
    const benchmarkDiagnostics = await readRepoText(
      ".github/scripts/benchmark-pptx-with-diagnostics.sh",
    );
    const requiredCommands = [
      "run: bun run check",
      "run: bun run build",
      "run: npm ci --prefix sample",
      "run: npm run --prefix sample smoke",
      "run: bun run test",
      "run: bash .github/scripts/benchmark-pptx-with-diagnostics.sh",
      "run: bun run verify:render -- --skip-raster",
      "run: npm install --no-audit --no-fund --prefix .github/compat/pptxgenjs",
      "run: npm run --prefix .github/compat/pptxgenjs compare",
      "run: npm pack",
    ];

    let previousIndex = -1;
    for (const command of requiredCommands) {
      const index = workflow.indexOf(command);
      expect(index, `release workflow includes ${command}`).toBeGreaterThanOrEqual(0);
      expect(index, `release workflow runs ${command} after earlier v0.8 gates`).toBeGreaterThan(
        previousIndex,
      );
      previousIndex = index;
    }

    expect(workflow).toContain("dry_run");
    expect(workflow).toContain("npm publish --dry-run --access public");
    expect(workflow).toContain("npm publish --access public");

    expect(benchmarkDiagnostics).toContain("PPTX_BENCHMARK_QUICK_ITERATIONS:-1");
    expect(benchmarkDiagnostics).toContain("PPTX_BENCHMARK_DEEP_ITERATIONS:-5");
    expect(benchmarkDiagnostics).toContain(
      'bun run benchmark:pptx -- --iterations "$quick_iterations" --strict',
    );
    expect(benchmarkDiagnostics).toContain(
      'bun run benchmark:pptx -- --iterations "$deep_iterations" --strict',
    );
    expect(benchmarkDiagnostics).toContain("Quick PPTX writer benchmark failed");
  });

  test("required generation regression workflows stay isolated from root dependencies", async () => {
    const oracleWorkflow = await readRepoText(".github/workflows/pptx-generation-regression.yml");
    const renderWorkflow = await readRepoText(".github/workflows/render-verification.yml");

    expect(oracleWorkflow).toContain("bun run build");
    expect(oracleWorkflow).toContain(
      "npm install --no-audit --no-fund --prefix .github/compat/pptxgenjs",
    );
    expect(oracleWorkflow).toContain("npm run --prefix .github/compat/pptxgenjs compare");
    expect(oracleWorkflow).toContain("path: .github/compat/pptxgenjs/artifacts");

    expect(renderWorkflow).toContain(
      "docker build -f .github/render/Dockerfile -t deckjsx-render .",
    );
    expect(renderWorkflow).toContain("docker run --name deckjsx-render-run deckjsx-render");
    expect(renderWorkflow).toContain("path: .github/render/artifacts");
  });
});

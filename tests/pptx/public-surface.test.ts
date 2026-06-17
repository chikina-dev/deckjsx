import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: readonly string[];
  exports?: Record<string, string | ExportCondition>;
  version?: string;
  peerDependencies?: Record<string, string>;
  publishConfig?: {
    access?: string;
  };
  scripts?: Record<string, string>;
};

type ExportCondition = {
  readonly types: string;
  readonly import: string;
};

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

async function readRepoPackageJson(path: string): Promise<PackageJson> {
  return JSON.parse(await readRepoText(path));
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

function exportImportTarget(target: string | ExportCondition): string {
  return typeof target === "string" ? target : target.import;
}

function expectTypedExportTarget(pkg: PackageJson, subpath: string, target: ExportCondition): void {
  expect(pkg.exports?.[subpath], `${subpath} export target`).toEqual(target);
}

describe("public surface", () => {
  test("package export map exposes only intentional public entry points", async () => {
    const pkg = await readPackageJson();
    const packageRoot = new URL("../..", import.meta.url).pathname;

    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.exports).toEqual({
      ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
      "./adapter": { types: "./dist/adapter.d.mts", import: "./dist/adapter.mjs" },
      "./inspect": { types: "./dist/inspect.d.mts", import: "./dist/inspect.mjs" },
      "./integration": { types: "./dist/integration.d.mts", import: "./dist/integration.mjs" },
      "./jsx-dev-runtime": {
        types: "./dist/jsx-dev-runtime.d.mts",
        import: "./dist/jsx-dev-runtime.mjs",
      },
      "./jsx-runtime": { types: "./dist/jsx-runtime.d.mts", import: "./dist/jsx-runtime.mjs" },
      "./package.json": "./package.json",
    });

    for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
      const importTarget = exportImportTarget(target);
      expect(subpath).not.toContain("*");
      expect(importTarget).not.toMatch(/(?:^|\/)(?:src|writers|projection|runtime)\//);
      expect(importTarget).not.toMatch(/(?:^|\/)(?:adapter|index|inspect)-[A-Za-z0-9_-]+\.mjs$/);
      if (subpath !== "./package.json") {
        expect(await fileExists(join(packageRoot, importTarget))).toBe(true);
        if (typeof target !== "string") {
          expect(await fileExists(join(packageRoot, target.types))).toBe(true);
        }
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

  test("package manifests use independent release lines", async () => {
    const rootPackage = await readPackageJson();
    const pluginPackages = await Promise.all(
      ["plugins/node/package.json", "plugins/vite/package.json"].map(
        async (path) => [path, await readRepoPackageJson(path)] as const,
      ),
    );

    expect(rootPackage.version).toBe("0.9.0");
    for (const [path, pkg] of pluginPackages) {
      expect(pkg.version, `${path} version should start at its own initial release`).toBe("0.1.0");
    }
  });

  test("plugin package manifests use peer dependencies instead of repo file dependencies", async () => {
    const pluginPackages = await Promise.all(
      ["plugins/node/package.json", "plugins/vite/package.json"].map(
        async (path) => [path, await readRepoPackageJson(path)] as const,
      ),
    );

    for (const [path, pkg] of pluginPackages) {
      expect(pkg.files, `${path} publishes only built artifacts`).toEqual(["dist"]);
      expectTypedExportTarget(pkg, ".", {
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      });
      expect(pkg.exports?.["./package.json"], `${path} exposes package metadata`).toBe(
        "./package.json",
      );
      expect(pkg.publishConfig?.access, `${path} publishes as a scoped public package`).toBe(
        "public",
      );
      expect(pkg.scripts?.prepublishOnly, `${path} builds before direct npm publish`).toBe(
        "vp run build",
      );
      expect(pkg.peerDependencies?.deckjsx, `${path} declares deckjsx as a peer`).toBe("^0.9.0");
      expect(pkg.dependencies?.deckjsx, `${path} must not publish a runtime file dependency`).toBe(
        undefined,
      );
      expect(
        pkg.devDependencies?.deckjsx,
        `${path} must not keep the temporary deckjsx file dependency`,
      ).toBe(undefined);
    }
  });

  test("plugin typecheck paths use root public declarations instead of root source", async () => {
    const pluginTsconfigs = await Promise.all(
      ["plugins/node/tsconfig.json", "plugins/vite/tsconfig.json"].map(
        async (path) =>
          [
            path,
            JSON.parse(await readRepoText(path)) as {
              compilerOptions?: { paths?: Record<string, readonly string[]> };
            },
          ] as const,
      ),
    );

    for (const [path, tsconfig] of pluginTsconfigs) {
      const paths = tsconfig.compilerOptions?.paths ?? {};
      expect(paths.deckjsx, `${path} resolves deckjsx through the built public surface`).toEqual([
        "../../dist/index.d.mts",
      ]);
      expect(
        paths["deckjsx/integration"],
        `${path} resolves deckjsx/integration through the built public surface`,
      ).toEqual(["../../dist/integration.d.mts"]);
      expect(JSON.stringify(paths), `${path} must not typecheck against root source`).not.toContain(
        "../../src",
      );
    }
  });

  test("v0.9 public surface review classifies integration packages before publishing", async () => {
    const review = await readRepoText("docs/reviews/v0.9-public-surface.md");

    expect(review).toContain("deckjsx/integration");
    expect(review).toContain("@deckjsx/node");
    expect(review).toContain("@deckjsx/vite");
    expect(review).toContain("Integration Interface");
    expect(review).toContain("Runtime Integration Package");
    expect(review).toContain("Project Integration Package");
    expect(review).toContain("not root Authoring Interface");
    expect(review).toContain("no `file:../..`");
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
    expect(workflow).toContain("package:");
    expect(workflow).toContain("version:");
    expect(workflow).toContain('input_version="${{ inputs.version }}"');
    expect(workflow).toContain('tag="deckjsx-node-v$version"');
    expect(workflow).toContain('tag="deckjsx-vite-v$version"');
    expect(workflow).toContain("package_dir=");
    expect(workflow).toContain("working-directory: ${{ steps.release.outputs.package_dir }}");
    expect(workflow).not.toContain("package_paths=(");
    expect(workflow.match(/npm publish --dry-run --access public/g)?.length).toBe(1);
    expect(workflow.match(/npm publish --access public/g)?.length).toBe(1);

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

  test("ci workflow checks and packs integration packages", async () => {
    const workflow = await readRepoText(".github/workflows/ci.yml");
    const requiredCommands = [
      "run: bun run check",
      "run: bun run build",
      "run: ../../node_modules/.bin/vp check",
      "run: ../../node_modules/.bin/vp pack",
      "run: npm ci --prefix sample",
      "run: npm run --prefix sample smoke",
      "run: bun run test",
      "run: bash .github/scripts/benchmark-pptx-with-diagnostics.sh",
    ];

    let previousIndex = -1;
    for (const command of requiredCommands) {
      const index = workflow.indexOf(command);
      expect(index, `CI workflow includes ${command}`).toBeGreaterThanOrEqual(0);
      expect(index, `CI workflow runs ${command} in release-relevant order`).toBeGreaterThan(
        previousIndex,
      );
      previousIndex = index;
    }

    expect(workflow).toContain("working-directory: plugins/node");
    expect(workflow).toContain("working-directory: plugins/vite");
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

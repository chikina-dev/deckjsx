import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

type PackageJson = {
  bin?: Record<string, string>;
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
      "./adapter": { types: "./dist/adapter/index.d.mts", import: "./dist/adapter/index.mjs" },
      "./inspect": { types: "./dist/inspect.d.mts", import: "./dist/inspect.mjs" },
      "./integration": { types: "./dist/integration.d.mts", import: "./dist/integration.mjs" },
      "./style": { types: "./dist/style/public.d.mts", import: "./dist/style/public.mjs" },
      "./jsx-dev-runtime": {
        types: "./dist/jsx-dev-runtime.d.mts",
        import: "./dist/jsx-dev-runtime.mjs",
      },
      "./jsx-runtime": { types: "./dist/jsx-runtime.d.mts", import: "./dist/jsx-runtime.mjs" },
      "./package.json": "./package.json",
    });

    for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
      const importTarget = exportImportTarget(target);
      if (subpath !== "./package.json") {
        expect(await fileExists(join(packageRoot, importTarget))).toBe(true);
        if (typeof target !== "string") {
          expect(await fileExists(join(packageRoot, target.types))).toBe(true);
        }
      }
    }
  });

  test("built root entry can render through its lazy pipeline chunk", async () => {
    const rootEntryUrl = new URL("../../dist/index.mjs", import.meta.url).href;
    const { Deck } = (await import(rootEntryUrl)) as Pick<typeof import("@/src/index.ts"), "Deck">;

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Built runtime" }, () => null);

    const render = await deck.render();

    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.bytes.subarray(0, 2).toString()).toBe("80,75");
  });

  test("built core runtime has no static Node builtin dependency", async () => {
    const dist = new URL("../../dist/", import.meta.url);
    const modules = (await readdir(dist)).filter((path) => path.endsWith(".mjs"));

    for (const path of modules) {
      const source = await readFile(new URL(path, dist), "utf8");
      expect(source, `${path} statically imports a Node builtin`).not.toMatch(
        /(?:from\s*|import\s*\()\s*["']node:/,
      );
    }
  });

  test("core package manifest publishes only intentional runtime dependencies", async () => {
    const pkg = await readPackageJson();

    expect(pkg.dependencies).toEqual({ "bidi-js": "^1.0.3", fontkit: "^2.0.4" });
  });

  test("plugin package manifests use peer dependencies instead of repo file dependencies", async () => {
    const pluginPackages = await Promise.all(
      ["plugins/node/package.json"].map(
        async (path) => [path, await readRepoPackageJson(path)] as const,
      ),
    );

    for (const [path, pkg] of pluginPackages) {
      expect(pkg.files, `${path} publishes only built artifacts`).toEqual(["dist"]);
      expectTypedExportTarget(pkg, ".", {
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      });
      expectTypedExportTarget(pkg, "./dev", {
        types: "./dist/dev.d.mts",
        import: "./dist/dev.mjs",
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
      expect(pkg.peerDependencies?.deckjsx, `${path} declares deckjsx as a peer`).toBe("^0.9.5");
      expect(pkg.bin?.deckjsx, `${path} exposes the deckjsx CLI`).toBe("dist/cli.mjs");
    }
  });

  test("plugin typecheck paths use root public declarations instead of root source", async () => {
    const pluginTsconfigs = await Promise.all(
      ["plugins/node/tsconfig.json"].map(
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
    }
  });
});

import { readFile, stat } from "node:fs/promises";
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
      if (subpath !== "./package.json") {
        expect(await fileExists(join(packageRoot, importTarget))).toBe(true);
        if (typeof target !== "string") {
          expect(await fileExists(join(packageRoot, target.types))).toBe(true);
        }
      }
    }
  });

  test("core package manifest publishes a dependency-free runtime", async () => {
    const pkg = await readPackageJson();

    expect(pkg.dependencies).toEqual({});
  });

  test("package manifests use independent release lines", async () => {
    const rootPackage = await readPackageJson();
    const pluginPackages = await Promise.all(
      ["plugins/node/package.json"].map(
        async (path) => [path, await readRepoPackageJson(path)] as const,
      ),
    );

    expect(rootPackage.version).toBe("0.9.4");
    for (const [path, pkg] of pluginPackages) {
      expect(pkg.version, `${path} version should follow its own release line`).toBe("0.1.5");
    }
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
      expect(pkg.peerDependencies?.deckjsx, `${path} declares deckjsx as a peer`).toBe("^0.9.3");
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

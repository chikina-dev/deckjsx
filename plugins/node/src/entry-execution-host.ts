import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as deckjsxRuntime from "deckjsx";
import * as deckjsxAdapterRuntime from "deckjsx/adapter";
import * as deckjsxJsxDevRuntime from "deckjsx/jsx-dev-runtime";
import * as deckjsxJsxRuntime from "deckjsx/jsx-runtime";
import { createNodeFileAssetLoader, inspectPatchablePptx, nodeAssets, write } from "./index";

export type EntryExecutionHost = {
  execute(input: { readonly code: string }): Promise<void>;
};

let entryExecutionQueue: Promise<void> = Promise.resolve();

export function createEntryExecutionHost(input: { readonly cwd: string }): EntryExecutionHost {
  const cwd = path.resolve(input.cwd);
  let serial = 0;

  return {
    execute(executionInput) {
      return serializeEntryExecution(async () => {
        serial += 1;
        const defaultExportKey = `__deckjsx_dev_default_${process.pid}_${Date.now()}_${serial}`;
        const nodeRuntimeKey = `__deckjsx_dev_node_runtime_${process.pid}_${Date.now()}_${serial}`;
        const deckjsxRuntimeKey = `__deckjsx_dev_deckjsx_runtime_${process.pid}_${Date.now()}_${serial}`;
        const previousCwd = process.cwd();
        globalSlot()[nodeRuntimeKey] = {
          createNodeFileAssetLoader,
          inspectPatchablePptx,
          nodeAssets,
          write,
        };
        globalSlot()[deckjsxRuntimeKey] = {
          adapter: deckjsxAdapterRuntime,
          deckjsx: deckjsxRuntime,
          jsxDevRuntime: deckjsxJsxDevRuntime,
          jsxRuntime: deckjsxJsxRuntime,
        };
        process.chdir(cwd);
        try {
          await import(
            executableDataUrl(
              awaitCapturedDefaultExport(
                captureDefaultExport(
                  resolveDeckjsxExternalImports(executionInput.code, (specifier) =>
                    specifier === "@deckjsx/node"
                      ? nodeRuntimeDataUrl(nodeRuntimeKey)
                      : (deckjsxRuntimeDataUrl(specifier, deckjsxRuntimeKey) ??
                        resolveDeckjsxPackageImport(specifier, cwd)),
                  ),
                  defaultExportKey,
                ),
                defaultExportKey,
              ),
              serial,
            )
          );
        } finally {
          delete globalSlot()[defaultExportKey];
          delete globalSlot()[nodeRuntimeKey];
          delete globalSlot()[deckjsxRuntimeKey];
          process.chdir(previousCwd);
        }
      });
    },
  };
}

function serializeEntryExecution<T>(operation: () => Promise<T>): Promise<T> {
  const current = entryExecutionQueue.then(operation, operation);
  entryExecutionQueue = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}

function globalSlot(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

function deckjsxRuntimeDataUrl(specifier: string, key: string): string | undefined {
  if (specifier === "deckjsx") {
    return executableDataUrl(
      [
        `const runtime = globalThis[${JSON.stringify(key)}].deckjsx;`,
        "export const CompositionDiagnosticError = runtime.CompositionDiagnosticError;",
        "export const Deck = runtime.Deck;",
        "export const DeckDiagnosticError = runtime.DeckDiagnosticError;",
        "export const EMU_PER_INCH = runtime.EMU_PER_INCH;",
        "export const POINTS_PER_INCH = runtime.POINTS_PER_INCH;",
        "export const SemanticGraphDiagnosticError = runtime.SemanticGraphDiagnosticError;",
        "export const StyleDiagnosticError = runtime.StyleDiagnosticError;",
        "export const StyleSheet = runtime.StyleSheet;",
        "export const Theme = runtime.Theme;",
        "export const formatDiagnostic = runtime.formatDiagnostic;",
        "export const formatDiagnostics = runtime.formatDiagnostics;",
      ].join("\n"),
      0,
    );
  }
  if (specifier === "deckjsx/adapter") {
    return executableDataUrl(
      [
        `const runtime = globalThis[${JSON.stringify(key)}].adapter;`,
        "export const pptx = runtime.pptx;",
      ].join("\n"),
      0,
    );
  }
  if (specifier === "deckjsx/jsx-runtime") {
    return executableDataUrl(
      [
        `const runtime = globalThis[${JSON.stringify(key)}].jsxRuntime;`,
        "export const Fragment = runtime.Fragment;",
        "export const jsx = runtime.jsx;",
        "export const jsxs = runtime.jsxs;",
      ].join("\n"),
      0,
    );
  }
  if (specifier === "deckjsx/jsx-dev-runtime") {
    return executableDataUrl(
      [
        `const runtime = globalThis[${JSON.stringify(key)}].jsxDevRuntime;`,
        "export const Fragment = runtime.Fragment;",
        "export const jsx = runtime.jsx;",
        "export const jsxDEV = runtime.jsxDEV;",
        "export const jsxs = runtime.jsxs;",
      ].join("\n"),
      0,
    );
  }
  return undefined;
}

function nodeRuntimeDataUrl(key: string): string {
  return executableDataUrl(
    [
      `const runtime = globalThis[${JSON.stringify(key)}];`,
      "export const createNodeFileAssetLoader = runtime.createNodeFileAssetLoader;",
      "export const inspectPatchablePptx = runtime.inspectPatchablePptx;",
      "export const nodeAssets = runtime.nodeAssets;",
      "export const write = runtime.write;",
    ].join("\n"),
    0,
  );
}

function executableDataUrl(code: string, serial: number): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#deckjsx-dev-${process.pid}-${Date.now()}-${serial}`;
}

function awaitCapturedDefaultExport(code: string, key: string): string {
  const slot = `globalThis[${JSON.stringify(key)}]`;
  return `${code}
{
  const __deckjsxDefaultExport = ${slot};
  if (__deckjsxDefaultExport && typeof __deckjsxDefaultExport.then === "function") {
    await __deckjsxDefaultExport;
  }
}`;
}

function resolveDeckjsxExternalImports(
  code: string,
  resolveSpecifier: (specifier: string) => string,
): string {
  return code
    .replaceAll(
      /(from\s+)(["'])(deckjsx(?:\/[^"']*)?|@deckjsx\/node(?:\/[^"']*)?)\2/g,
      (_match, prefix: string, quote: string, specifier: string) =>
        `${prefix}${quote}${resolveSpecifier(specifier)}${quote}`,
    )
    .replaceAll(
      /(\bimport\s+)(["'])(deckjsx(?:\/[^"']*)?|@deckjsx\/node(?:\/[^"']*)?)\2/g,
      (_match, prefix: string, quote: string, specifier: string) =>
        `${prefix}${quote}${resolveSpecifier(specifier)}${quote}`,
    )
    .replaceAll(
      /(import\s*\(\s*)(["'])(deckjsx(?:\/[^"']*)?|@deckjsx\/node(?:\/[^"']*)?)\2/g,
      (_match, prefix: string, quote: string, specifier: string) =>
        `${prefix}${quote}${resolveSpecifier(specifier)}${quote}`,
    );
}

function captureDefaultExport(code: string, key: string): string {
  const slot = `globalThis[${JSON.stringify(key)}]`;
  let output = "";
  let cursor = 0;
  let index = 0;

  while (index < code.length) {
    const skipped = skipNonSyntax(code, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    if (!startsWithKeyword(code, index, "export")) {
      index += 1;
      continue;
    }

    const slice = code.slice(index);
    const defaultMatch = /^export\s+default\s+/.exec(slice);
    if (defaultMatch) {
      output += code.slice(cursor, index);
      output += `${slot} = `;
      index += defaultMatch[0].length;
      cursor = index;
      continue;
    }

    const namedMatch = /^export\s*\{\s*([^}]+)\s*\}\s*;?/.exec(slice);
    if (namedMatch?.[1]) {
      const defaultLocal = defaultExportLocalName(namedMatch[1]);
      if (defaultLocal) {
        output += code.slice(cursor, index);
        output += `${slot} = ${defaultLocal};`;
        index += namedMatch[0].length;
        cursor = index;
        continue;
      }
    }

    index += 1;
  }

  return output ? output + code.slice(cursor) : code;
}

function skipNonSyntax(code: string, index: number): number {
  const char = code[index];
  const next = code[index + 1];
  if (char === "'" || char === '"' || char === "`") {
    return skipQuotedLiteral(code, index, char);
  }
  if (char === "/" && next === "/") {
    const lineEnd = code.indexOf("\n", index + 2);
    return lineEnd < 0 ? code.length : lineEnd + 1;
  }
  if (char === "/" && next === "*") {
    const blockEnd = code.indexOf("*/", index + 2);
    return blockEnd < 0 ? code.length : blockEnd + 2;
  }
  return index;
}

function skipQuotedLiteral(code: string, start: number, quote: "'" | '"' | "`"): number {
  let escaped = false;
  for (let index = start + 1; index < code.length; index += 1) {
    const char = code[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
  }
  return code.length;
}

function startsWithKeyword(code: string, index: number, keyword: string): boolean {
  return (
    code.startsWith(keyword, index) &&
    !/[\w$]/.test(code[index - 1] ?? "") &&
    !/[\w$]/.test(code[index + keyword.length] ?? "")
  );
}

function defaultExportLocalName(specifiers: string): string | undefined {
  for (const specifier of specifiers.split(",")) {
    const match = specifier.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (!match) {
      continue;
    }
    const local = match[1];
    const exported = match[2] ?? match[1];
    if (exported === "default") {
      return local;
    }
  }
  return undefined;
}

function resolveDeckjsxPackageImport(specifier: string, cwd: string): string {
  const parsed = parsePackageSpecifier(specifier);
  if (!parsed) {
    return specifier;
  }
  const packageDirectory = findPackageDirectory(parsed.packageName, [
    cwd,
    path.dirname(fileURLToPath(import.meta.url)),
  ]);
  if (!packageDirectory) {
    return import.meta.resolve(specifier);
  }
  return pathToFileURL(resolvePackageExport(packageDirectory, parsed.subpath)).href;
}

function parsePackageSpecifier(
  specifier: string,
): { readonly packageName: string; readonly subpath: string } | undefined {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2) {
      return undefined;
    }
    return {
      packageName: `${parts[0]}/${parts[1]}`,
      subpath: parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".",
    };
  }
  return {
    packageName: parts[0],
    subpath: parts.length > 1 ? `./${parts.slice(1).join("/")}` : ".",
  };
}

function findPackageDirectory(
  packageName: string,
  startDirectories: readonly string[],
): string | undefined {
  for (const startDirectory of startDirectories) {
    let directory = path.resolve(startDirectory);
    while (true) {
      const packageJson = path.join(directory, "node_modules", packageName, "package.json");
      if (existsSync(packageJson)) {
        return realpathSync(path.dirname(packageJson));
      }

      const ownPackageJson = path.join(directory, "package.json");
      if (existsSync(ownPackageJson) && packageJsonName(ownPackageJson) === packageName) {
        return realpathSync(directory);
      }

      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }
  return undefined;
}

function packageJsonName(packageJson: string): string | undefined {
  try {
    const packageData = packageManifestFromJson(JSON.parse(readFileSync(packageJson, "utf8")));
    return packageData.name;
  } catch {
    return undefined;
  }
}

function resolvePackageExport(packageDirectory: string, subpath: string): string {
  const packageJson = path.join(packageDirectory, "package.json");
  const packageData = packageManifestFromJson(JSON.parse(readFileSync(packageJson, "utf8")));
  const exportTarget = selectPackageExportTarget(packageData.exports, subpath);
  if (exportTarget) {
    return path.resolve(packageDirectory, exportTarget);
  }
  if (subpath !== ".") {
    return path.resolve(packageDirectory, subpath);
  }
  return path.resolve(packageDirectory, packageData.module ?? packageData.main ?? "index.js");
}

type PackageManifest = {
  readonly name?: string;
  readonly exports?: unknown;
  readonly module?: string;
  readonly main?: string;
};

function packageManifestFromJson(value: unknown): PackageManifest {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...("exports" in record ? { exports: record.exports } : {}),
    ...(typeof record.module === "string" ? { module: record.module } : {}),
    ...(typeof record.main === "string" ? { main: record.main } : {}),
  };
}

function selectPackageExportTarget(exportsField: unknown, subpath: string): string | undefined {
  if (typeof exportsField === "string") {
    return subpath === "." ? exportsField : undefined;
  }
  if (!exportsField || typeof exportsField !== "object") {
    return undefined;
  }
  const exportsRecord = exportsField as Record<string, unknown>;
  const target = exportsRecord[subpath] ?? (subpath === "." ? exportsRecord["."] : undefined);
  return selectConditionalExportTarget(target);
}

function selectConditionalExportTarget(target: unknown): string | undefined {
  if (typeof target === "string") {
    return target;
  }
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const record = target as Record<string, unknown>;
  return (
    selectConditionalExportTarget(record.import) ??
    selectConditionalExportTarget(record.default) ??
    selectConditionalExportTarget(record.module)
  );
}

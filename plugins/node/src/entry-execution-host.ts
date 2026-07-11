import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as deckjsxRuntime from "deckjsx";
import * as deckjsxAdapterRuntime from "deckjsx/adapter";
import * as deckjsxJsxDevRuntime from "deckjsx/jsx-dev-runtime";
import * as deckjsxJsxRuntime from "deckjsx/jsx-runtime";
import { parseAst } from "rolldown/parseAst";
import {
  createNodeFileAssetLoader,
  inspectPatchablePptx,
  nodeAssets,
  nodeFontAssets,
  write,
} from "./index";

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
          nodeFontAssets,
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
              captureDefaultExport(
                resolveDeckjsxExternalImports(executionInput.code, (specifier) =>
                  specifier === "@deckjsx/node"
                    ? nodeRuntimeDataUrl(nodeRuntimeKey)
                    : (deckjsxRuntimeDataUrl(specifier, deckjsxRuntimeKey) ??
                      resolveDeckjsxPackageImport(specifier, cwd)),
                ),
                defaultExportKey,
              ),
              serial,
            )
          );
          await awaitDefaultExport(globalSlot()[defaultExportKey]);
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
        "export const pdf = runtime.pdf;",
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
      "export const nodeFontAssets = runtime.nodeFontAssets;",
      "export const write = runtime.write;",
    ].join("\n"),
    0,
  );
}

function executableDataUrl(code: string, serial: number): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#deckjsx-dev-${process.pid}-${Date.now()}-${serial}`;
}

async function awaitDefaultExport(defaultExport: unknown): Promise<void> {
  if (isPromiseLike(defaultExport)) {
    await defaultExport;
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function resolveDeckjsxExternalImports(
  code: string,
  resolveSpecifier: (specifier: string) => string,
): string {
  const program = parseAst(code, { lang: "js", sourceType: "module" }, "deckjsx-dev-entry.mjs");
  const edits: { readonly start: number; readonly end: number; readonly text: string }[] = [];
  visitAst(program, (node) => {
    const source = moduleSpecifierNode(node);
    const specifier = source ? stringLiteralValue(source) : undefined;
    if (!source || !specifier || !isDeckjsxExternalSpecifier(specifier)) {
      return;
    }
    edits.push({
      start: source.start,
      end: source.end,
      text: JSON.stringify(resolveSpecifier(specifier)),
    });
  });

  let output = code;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
}

type EntryAstNode = {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
};

function visitAst(root: unknown, visitor: (node: EntryAstNode) => void): void {
  const pending: unknown[] = [root];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (isEntryAstNode(value)) {
      visitor(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "parent") {
        pending.push(child);
      }
    }
  }
}

function isEntryAstNode(value: object): value is EntryAstNode {
  return (
    "type" in value &&
    typeof value.type === "string" &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number"
  );
}

function entryAstNode(value: unknown): EntryAstNode | undefined {
  return value && typeof value === "object" && isEntryAstNode(value) ? value : undefined;
}

function moduleSpecifierNode(node: EntryAstNode): EntryAstNode | undefined {
  if (
    node.type === "ImportDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ExportAllDeclaration" ||
    node.type === "ImportExpression"
  ) {
    const source = entryAstNode(node.source);
    return source?.type === "Literal" ? source : undefined;
  }
  return undefined;
}

function stringLiteralValue(node: EntryAstNode): string | undefined {
  return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function isDeckjsxExternalSpecifier(specifier: string): boolean {
  return (
    specifier === "deckjsx" ||
    specifier.startsWith("deckjsx/") ||
    specifier === "@deckjsx/node" ||
    specifier.startsWith("@deckjsx/node/")
  );
}

function captureDefaultExport(code: string, key: string): string {
  const program = parseAst(code, { lang: "js", sourceType: "module" }, "deckjsx-dev-entry.mjs");
  const slot = `globalThis[${JSON.stringify(key)}]`;
  const edits: { readonly start: number; readonly end: number; readonly text: string }[] = [];

  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      edits.push({
        start: statement.start,
        end: statement.declaration.start,
        text: `${slot} = `,
      });
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration" || statement.source) {
      continue;
    }
    let defaultIndex = -1;
    for (let index = 0; index < statement.specifiers.length; index += 1) {
      if (moduleExportName(statement.specifiers[index]?.exported) === "default") {
        defaultIndex = index;
        break;
      }
    }
    const defaultSpecifier = statement.specifiers[defaultIndex];
    const local = defaultSpecifier ? moduleExportName(defaultSpecifier.local) : undefined;
    if (!local || !defaultSpecifier) {
      continue;
    }
    if (statement.specifiers.length === 1) {
      edits.push({ start: statement.start, end: statement.end, text: `${slot} = ${local};` });
      continue;
    }
    const previous = statement.specifiers[defaultIndex - 1];
    const next = statement.specifiers[defaultIndex + 1];
    const removal = previous
      ? { start: previous.end, end: defaultSpecifier.end, text: "" }
      : next
        ? { start: defaultSpecifier.start, end: next.start, text: "" }
        : undefined;
    if (!removal) {
      continue;
    }
    edits.push(removal, {
      start: statement.end,
      end: statement.end,
      text: `\n${slot} = ${local};`,
    });
  }

  let output = code;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
}

function moduleExportName(value: unknown): string | undefined {
  const node = entryAstNode(value);
  return node && typeof node.name === "string"
    ? node.name
    : node?.type === "Literal" && typeof node.value === "string"
      ? node.value
      : undefined;
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

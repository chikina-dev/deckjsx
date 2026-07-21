import path from "node:path";
import * as deckjsxRuntime from "deckjsx";
import * as deckjsxAdapterRuntime from "deckjsx/adapter";
import * as deckjsxJsxDevRuntime from "deckjsx/jsx-dev-runtime";
import * as deckjsxJsxRuntime from "deckjsx/jsx-runtime";
import { createNodeFileAssetLoader, nodeAssets, nodeFontAssets } from "./node-file-assets";
import { inspectPatchablePptx, write } from "./artifact-file-output";
import {
  awaitDefaultExport,
  captureDefaultExport,
  deckjsxRuntimeDataUrl,
  executableDataUrl,
  nodeRuntimeDataUrl,
  resolveDeckjsxExternalImports,
  resolveDeckjsxPackageImport,
} from "./entry-module-loader";

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
        const defaultExportKey = executionGlobalKey("default", serial);
        const nodeRuntimeKey = executionGlobalKey("node_runtime", serial);
        const deckjsxRuntimeKey = executionGlobalKey("deckjsx_runtime", serial);
        const globals = globalSlot();
        const previousCwd = process.cwd();
        globals[nodeRuntimeKey] = nodeRuntimeBindings();
        globals[deckjsxRuntimeKey] = deckjsxRuntimeBindings();
        process.chdir(cwd);
        try {
          const executableCode = captureDefaultExport(
            resolveDeckjsxExternalImports(executionInput.code, (specifier) =>
              specifier === "@deckjsx/node"
                ? nodeRuntimeDataUrl(nodeRuntimeKey)
                : (deckjsxRuntimeDataUrl(specifier, deckjsxRuntimeKey) ??
                  resolveDeckjsxPackageImport(specifier, cwd)),
            ),
            defaultExportKey,
          );
          await import(executableDataUrl(executableCode, serial));
          await awaitDefaultExport(globals[defaultExportKey]);
        } finally {
          delete globals[defaultExportKey];
          delete globals[nodeRuntimeKey];
          delete globals[deckjsxRuntimeKey];
          process.chdir(previousCwd);
        }
      });
    },
  };
}

function nodeRuntimeBindings() {
  return { createNodeFileAssetLoader, inspectPatchablePptx, nodeAssets, nodeFontAssets, write };
}

function deckjsxRuntimeBindings() {
  return {
    adapter: deckjsxAdapterRuntime,
    deckjsx: deckjsxRuntime,
    jsxDevRuntime: deckjsxJsxDevRuntime,
    jsxRuntime: deckjsxJsxRuntime,
  };
}

function executionGlobalKey(kind: string, serial: number): string {
  return `__deckjsx_dev_${kind}_${process.pid}_${Date.now()}_${serial}`;
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

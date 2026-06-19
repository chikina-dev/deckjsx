import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type EntryExecutionHost = {
  execute(input: { readonly code: string }): Promise<void>;
};

export function createEntryExecutionHost(input: {
  readonly cwd: string;
  readonly tempDirectory?: string;
}): EntryExecutionHost {
  const cwd = path.resolve(input.cwd);
  const tempDirectory = input.tempDirectory
    ? path.resolve(cwd, input.tempDirectory)
    : path.join(cwd, ".deckjsx", "dev");
  let serial = 0;

  return {
    async execute(executionInput) {
      serial += 1;
      await mkdir(tempDirectory, { recursive: true });
      const modulePath = path.join(
        tempDirectory,
        `bundle-${process.pid}-${Date.now()}-${serial}.mjs`,
      );
      await writeFile(modulePath, executionInput.code);

      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        const module = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${serial}`);
        const defaultExport = (module as { readonly default?: unknown }).default;
        if (isPromiseLike(defaultExport)) {
          await defaultExport;
        }
      } finally {
        process.chdir(previousCwd);
        await rm(modulePath, { force: true });
      }
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

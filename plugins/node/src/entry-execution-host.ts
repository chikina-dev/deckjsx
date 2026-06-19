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
        await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${serial}`);
      } finally {
        process.chdir(previousCwd);
        await rm(modulePath, { force: true });
      }
    },
  };
}

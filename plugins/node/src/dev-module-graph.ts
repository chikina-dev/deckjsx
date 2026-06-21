import path from "node:path";

export type DevModuleGraphSnapshot = {
  readonly moduleIds: readonly string[];
  readonly watchFiles: readonly string[];
  readonly observedAssetFiles: readonly string[];
  readonly ignoredFiles: readonly string[];
  readonly files: readonly string[];
};

export function createDevModuleGraphSnapshot(input: {
  readonly cwd: string;
  readonly moduleIds: readonly string[];
  readonly watchFiles: readonly string[];
  readonly observedAssetFiles?: readonly string[];
  readonly ignoredFiles?: readonly string[];
}): DevModuleGraphSnapshot {
  const cwd = path.resolve(input.cwd);
  const ignoredFiles = uniqueSorted(
    (input.ignoredFiles ?? []).map((file) => path.resolve(cwd, file)),
  );
  const ignored = new Set(ignoredFiles);
  const moduleIds = normalizeDevGraphFiles({ cwd, files: input.moduleIds, ignored });
  const watchFiles = normalizeDevGraphFiles({ cwd, files: input.watchFiles, ignored });
  const observedAssetFiles = normalizeDevGraphFiles({
    cwd,
    files: input.observedAssetFiles ?? [],
    ignored,
  });
  return {
    moduleIds,
    watchFiles,
    observedAssetFiles,
    ignoredFiles,
    files: uniqueSorted([...moduleIds, ...watchFiles, ...observedAssetFiles]),
  };
}

export function filterChangedSourceIdsForDevGraph(input: {
  readonly graph: DevModuleGraphSnapshot;
  readonly changedSourceIds: readonly string[];
}): readonly string[] {
  const files = new Set(input.graph.files);
  return uniqueSorted(
    input.changedSourceIds.map((id) => path.resolve(id)).filter((id) => files.has(id)),
  );
}

function normalizeDevGraphFiles(input: {
  readonly cwd: string;
  readonly files: readonly string[];
  readonly ignored: ReadonlySet<string>;
}): readonly string[] {
  return uniqueSorted(
    input.files
      .map((file) => path.resolve(input.cwd, file))
      .filter((file) => !input.ignored.has(file))
      .filter((file) => !file.endsWith(".deckjsx-lock"))
      .filter((file) => !isDevTempFile(input.cwd, file)),
  );
}

function isDevTempFile(cwd: string, file: string): boolean {
  return isInsideDirectory(file, path.join(cwd, ".deckjsx", "dev"));
}

function isInsideDirectory(file: string, directory: string): boolean {
  const relative = path.relative(directory, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

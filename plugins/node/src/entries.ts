import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic } from "deckjsx";
import type { DeckjsxResolveResult, ResolvedDeckjsxConfig } from "./config";
import { analyzeEntryWrites } from "./entry-write-analysis";

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".mjsx",
  ".mts",
  ".cjs",
  ".cjsx",
  ".cts",
]);

export type ResolvedDeckjsxEntries = {
  readonly entries: readonly [string, ...string[]];
  readonly watchFiles: readonly string[];
  readonly watchDirectories: readonly string[];
};

type DiscoveryCacheEntry = {
  readonly result: DeckjsxResolveResult<ResolvedDeckjsxEntries> & { readonly ok: true };
  readonly fingerprint: string;
};

const discoveryCache = new Map<string, DiscoveryCacheEntry>();

export async function resolveEntries(
  config: ResolvedDeckjsxConfig,
): Promise<DeckjsxResolveResult<ResolvedDeckjsxEntries>> {
  const key = JSON.stringify([
    config.packageRoot,
    config.configPath,
    config.environment,
    config.entry,
    config.output,
    config.watchFiles,
  ]);
  const cached = discoveryCache.get(key);
  if (cached) {
    const current = await discoveryFingerprint(cached.result.value);
    if (current === cached.fingerprint) return cached.result;
    discoveryCache.delete(key);
  }
  const result = await resolveEntriesUncached(config);
  if (result.ok) {
    discoveryCache.set(key, {
      result,
      fingerprint: await discoveryFingerprint(result.value),
    });
  }
  return result;
}

async function discoveryFingerprint(entries: ResolvedDeckjsxEntries): Promise<string> {
  const dependencies = [...new Set([...entries.watchFiles, ...entries.watchDirectories])].sort();
  const facts = await Promise.all(
    dependencies.map(async (file) => {
      try {
        const info = await stat(file, { bigint: true });
        return [file, info.mtimeNs.toString(), info.size.toString()];
      } catch {
        return [file, "missing"];
      }
    }),
  );
  return JSON.stringify(facts);
}

async function resolveEntriesUncached(
  config: ResolvedDeckjsxConfig,
): Promise<DeckjsxResolveResult<ResolvedDeckjsxEntries>> {
  if (config.entry) {
    return resolveExplicitEntries(config);
  }
  return discoverEntries(config);
}

async function resolveExplicitEntries(
  config: ResolvedDeckjsxConfig,
): Promise<DeckjsxResolveResult<ResolvedDeckjsxEntries>> {
  const diagnostics: Diagnostic[] = [];
  const entries: string[] = [];
  const ignoreWatchFiles = new Set<string>();
  if (config.entry?.length === 0) {
    return {
      ok: false,
      diagnostics: [
        entryDiagnostic(
          "error",
          "E_CONFIG_ENTRY_EMPTY",
          "Explicit deckjsx entry set must contain at least one path",
          config.configPath ?? config.packageRoot,
        ),
      ],
    };
  }
  for (const hint of config.entry ?? []) {
    const entry = path.resolve(config.packageRoot, hint);
    try {
      const info = await lstat(entry);
      if (!info.isFile() && !info.isSymbolicLink()) throw new Error("not a file");
      const resolved = await realpath(entry);
      entries.push(resolved);
      if (!isInside(config.packageRoot, resolved)) {
        diagnostics.push(
          entryDiagnostic(
            "warning",
            "W_CONFIG_ENTRY_OUTSIDE_PACKAGE",
            "Explicit entry resolves outside the Host Package Boundary",
            resolved,
          ),
        );
      } else {
        const ignoreState = await ignoreStateForFile(config.packageRoot, resolved);
        ignoreState.files.forEach((file) => ignoreWatchFiles.add(file));
        if (isIgnored(resolved, false, ignoreState.rules)) {
          diagnostics.push(
            entryDiagnostic(
              "warning",
              "W_CONFIG_ENTRY_IGNORED",
              "Explicit deckjsx entry is excluded by project ignore rules",
              resolved,
            ),
          );
        }
      }
    } catch {
      diagnostics.push(
        entryDiagnostic(
          "error",
          "E_CONFIG_ENTRY_MISSING",
          "Explicit deckjsx entry does not exist",
          entry,
        ),
      );
    }
  }
  if (diagnostics.some((item) => item.severity === "error")) {
    return {
      ok: false,
      diagnostics,
      watchFiles: Object.freeze(
        [...new Set([...config.watchFiles, ...entries, ...ignoreWatchFiles])].sort(),
      ),
      watchDirectories: Object.freeze(
        [
          ...new Set(
            (config.entry ?? []).flatMap((hint) =>
              directoriesBetween(config.packageRoot, path.resolve(config.packageRoot, hint)),
            ),
          ),
        ].sort(),
      ),
    };
  }
  const resolvedEntries = [...new Set(entries)] as [string, ...string[]];
  return {
    ok: true,
    value: {
      entries: Object.freeze(resolvedEntries),
      watchFiles: Object.freeze(
        [...new Set([...config.watchFiles, ...resolvedEntries, ...ignoreWatchFiles])].sort(),
      ),
      watchDirectories: Object.freeze(
        [
          ...new Set(
            resolvedEntries.flatMap((entry) => directoriesBetween(config.packageRoot, entry)),
          ),
        ].sort(),
      ),
    },
    diagnostics,
  };
}

async function discoverEntries(
  config: ResolvedDeckjsxConfig,
): Promise<DeckjsxResolveResult<ResolvedDeckjsxEntries>> {
  const walkedResult = await walkSourcesWithRetry(config.packageRoot, config.configPath);
  if (!walkedResult.ok) return discoveryRaceFailure(config, walkedResult.error);
  const walked = walkedResult.value;
  const outputSelectors = new Set(
    (config.output ?? []).flatMap((item) => [
      normalizeSlash(item),
      normalizeSlash(path.resolve(config.packageRoot, item)),
    ]),
  );
  const candidates: {
    readonly file: string;
    readonly outputs: ReadonlySet<string>;
  }[] = [];
  const analysisDiagnostics: Diagnostic[] = [];
  for (const source of walked.sources) {
    const analysis = await analyzeEntryWrites(source.file, config.packageRoot);
    if (!analysis.ok) {
      analysisDiagnostics.push(analysis.diagnostic);
      continue;
    }
    if (analysis.reachesWrite) candidates.push({ file: source.file, outputs: analysis.outputs });
  }
  if (analysisDiagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: Object.freeze(analysisDiagnostics),
      watchFiles: Object.freeze([...new Set([...config.watchFiles, ...walked.watchFiles])].sort()),
      watchDirectories: Object.freeze(walked.directories.sort()),
    };
  }
  const outputMatches =
    outputSelectors.size === 0
      ? candidates
      : candidates.filter((candidate) =>
          [...candidate.outputs].some((output) => outputSelectors.has(output)),
        );
  const outputHintApplied = outputSelectors.size === 0 || outputMatches.length > 0;
  const entries = (outputHintApplied ? outputMatches : candidates)
    .map((candidate) => candidate.file)
    .sort();
  if (entries.length === 0) {
    return {
      ok: false,
      diagnostics: [
        entryDiagnostic(
          "error",
          "E_CONFIG_ENTRY_NOT_FOUND",
          "No deckjsx Entry Execution Root was found",
          config.packageRoot,
        ),
      ],
      watchFiles: Object.freeze([...new Set([...config.watchFiles, ...walked.watchFiles])].sort()),
      watchDirectories: Object.freeze(walked.directories.sort()),
    };
  }
  if (entries.length > 1) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "E_CONFIG_ENTRY_AMBIGUOUS",
          title: "Multiple deckjsx Entry Execution Roots were found",
          message: entries.map((entry) => path.relative(config.packageRoot, entry)).join(", "),
          labels: entries.map((entry) => ({
            message: "entry candidate",
            path: entry,
            sourceSpan: { file: entry },
          })),
        },
      ],
      watchFiles: Object.freeze([...new Set([...config.watchFiles, ...walked.watchFiles])].sort()),
      watchDirectories: Object.freeze(walked.directories.sort()),
    };
  }
  return {
    ok: true,
    value: {
      entries: Object.freeze(entries as [string, ...string[]]),
      watchFiles: Object.freeze([...new Set([...config.watchFiles, ...walked.watchFiles])].sort()),
      watchDirectories: Object.freeze(walked.directories.sort()),
    },
    diagnostics: outputHintApplied
      ? []
      : [
          entryDiagnostic(
            "warning",
            "W_CONFIG_OUTPUT_STATIC_UNRESOLVED",
            "Output hint could not narrow static entry discovery",
            config.configPath ?? config.packageRoot,
          ),
        ],
  };
}

type SourceWalk = Awaited<ReturnType<typeof walkSources>>;

async function walkSourcesWithRetry(
  packageRoot: string,
  configPath: string | undefined,
): Promise<
  | { readonly ok: true; readonly value: SourceWalk }
  | { readonly ok: false; readonly error: unknown }
> {
  const first = await attemptSourceWalk(packageRoot, configPath);
  if (first.ok) return first;
  return attemptSourceWalk(packageRoot, configPath);
}

async function attemptSourceWalk(
  packageRoot: string,
  configPath: string | undefined,
): Promise<
  | { readonly ok: true; readonly value: SourceWalk }
  | { readonly ok: false; readonly error: unknown }
> {
  try {
    return { ok: true, value: await walkSources(packageRoot, configPath) };
  } catch (error) {
    return { ok: false, error };
  }
}

function discoveryRaceFailure(
  config: ResolvedDeckjsxConfig,
  error: unknown,
): DeckjsxResolveResult<ResolvedDeckjsxEntries> {
  return {
    ok: false,
    diagnostics: [
      {
        ...entryDiagnostic(
          "error",
          "E_CONFIG_ENTRY_DISCOVERY_RETRY",
          "Entry discovery observed a changing filesystem",
          config.packageRoot,
        ),
        message: error instanceof Error ? error.message : String(error),
      },
    ],
    watchFiles: config.watchFiles,
    watchDirectories: Object.freeze([config.packageRoot]),
  };
}

type IgnoreRule = {
  readonly base: string;
  readonly pattern: string;
  readonly negated: boolean;
  readonly anchored: boolean;
};

async function walkSources(
  root: string,
  configPath: string | undefined,
): Promise<{
  readonly sources: readonly { readonly file: string; readonly code: string }[];
  readonly watchFiles: readonly string[];
  readonly directories: string[];
}> {
  const sources: { file: string; code: string }[] = [];
  const watchFiles: string[] = [];
  const directories: string[] = [];
  const seenRealFiles = new Set<string>();
  const ancestorIgnoreFiles = await ancestorProjectIgnoreFiles(root);
  const ancestorRules: IgnoreRule[] = [];
  for (const ignoreFile of ancestorIgnoreFiles) {
    ancestorRules.push(...(await readIgnoreRules(ignoreFile)));
    watchFiles.push(ignoreFile);
  }

  async function visit(directory: string, inheritedRules: readonly IgnoreRule[]): Promise<void> {
    directories.push(directory);
    const ignorePath = path.join(directory, ".gitignore");
    const rules = [...inheritedRules, ...(await readIgnoreRules(ignorePath))];
    if (await exists(ignorePath)) watchFiles.push(ignorePath);
    const items = await readdir(directory, { withFileTypes: true });
    for (const item of items) {
      if (item.name === ".git" || item.name === "node_modules") continue;
      const file = path.join(directory, item.name);
      const ignored = isIgnored(file, item.isDirectory(), rules);
      if (ignored && !(item.isDirectory() && rules.some((rule) => rule.negated))) continue;
      if (item.isSymbolicLink()) {
        const resolved = await realpath(file).catch(() => undefined);
        if (!resolved || !isInsideDiscoveryScope(root, resolved)) continue;
        const info = await lstat(resolved);
        if (!info.isFile() || seenRealFiles.has(resolved)) continue;
        seenRealFiles.add(resolved);
        await addSource(resolved);
        continue;
      }
      if (item.isDirectory()) {
        if (file !== root && (await exists(path.join(file, "package.json")))) continue;
        await visit(file, rules);
        continue;
      }
      if (!item.isFile()) continue;
      const resolved = await realpath(file);
      if (seenRealFiles.has(resolved)) continue;
      seenRealFiles.add(resolved);
      await addSource(resolved);
    }
  }

  async function addSource(file: string): Promise<void> {
    if (
      file === configPath ||
      file.endsWith(".d.ts") ||
      !SOURCE_EXTENSIONS.has(path.extname(file))
    ) {
      return;
    }
    const code = await readFile(file, "utf8");
    sources.push({ file, code });
    watchFiles.push(file);
  }

  await visit(root, ancestorRules);
  return { sources, watchFiles, directories };
}

async function readIgnoreRules(file: string): Promise<readonly IgnoreRule[]> {
  try {
    const text = await readFile(file, "utf8");
    const base = path.dirname(file);
    return text.split(/\r?\n/u).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return [];
      const escapedPrefix = trimmed.startsWith("\\#") || trimmed.startsWith("\\!");
      const literal = escapedPrefix ? trimmed.slice(1) : trimmed;
      const negated = !escapedPrefix && literal.startsWith("!");
      const rawPattern = normalizeSlash(negated ? literal.slice(1) : literal);
      const anchored = rawPattern.startsWith("/");
      const pattern = rawPattern.replace(/^\//u, "");
      return pattern ? [{ base, pattern, negated, anchored }] : [];
    });
  } catch {
    return [];
  }
}

async function ignoreStateForFile(
  packageRoot: string,
  file: string,
): Promise<{ readonly rules: readonly IgnoreRule[]; readonly files: readonly string[] }> {
  const files = [...(await ancestorProjectIgnoreFiles(packageRoot))];
  let directory = packageRoot;
  const targetDirectory = path.dirname(file);
  while (isInside(packageRoot, directory) && isInside(directory, targetDirectory)) {
    const ignoreFile = path.join(directory, ".gitignore");
    if (await exists(ignoreFile)) files.push(ignoreFile);
    if (directory === targetDirectory) break;
    const relative = path.relative(directory, targetDirectory).split(path.sep)[0];
    if (!relative) break;
    directory = path.join(directory, relative);
  }
  const uniqueFiles = [...new Set(files)];
  const rules: IgnoreRule[] = [];
  for (const ignoreFile of uniqueFiles) rules.push(...(await readIgnoreRules(ignoreFile)));
  return { rules, files: uniqueFiles };
}

function isIgnored(file: string, directory: boolean, rules: readonly IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    const scoped = normalizeSlash(path.relative(rule.base, file));
    if (scoped.startsWith("../")) continue;
    const pattern = rule.pattern.endsWith("/") ? `${rule.pattern}**` : rule.pattern;
    const matches =
      rule.anchored || pattern.includes("/")
        ? path.matchesGlob(scoped, pattern) || path.matchesGlob(scoped, `${pattern}/**`)
        : scoped.split("/").some((segment) => path.matchesGlob(segment, pattern));
    if (matches || (directory && path.matchesGlob(`${scoped}/`, pattern))) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

async function ancestorProjectIgnoreFiles(packageRoot: string): Promise<readonly string[]> {
  const directories: string[] = [];
  let current = packageRoot;
  let gitRoot: string | undefined;
  while (true) {
    directories.push(current);
    if (await exists(path.join(current, ".git"))) {
      gitRoot = current;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (!gitRoot) return [];
  const candidates = directories
    .reverse()
    .map((directory) => path.join(directory, ".gitignore"))
    .filter((file) => file !== path.join(packageRoot, ".gitignore"));
  const files: string[] = [];
  for (const file of candidates) {
    if (await exists(file)) files.push(file);
  }
  return files;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isInsideDiscoveryScope(root: string, candidate: string): boolean {
  if (!isInside(root, candidate)) return false;
  const segments = path.relative(root, candidate).split(path.sep);
  return !segments.includes("node_modules") && !segments.includes(".git");
}

function directoriesBetween(root: string, file: string): readonly string[] {
  if (!isInside(root, file)) return [];
  const output = [root];
  let current = root;
  for (const segment of path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    output.push(current);
  }
  return output;
}

function normalizeSlash(value: string): string {
  return value.split(path.sep).join("/");
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

function entryDiagnostic(
  severity: "error" | "warning",
  code: string,
  title: string,
  file: string,
): Diagnostic {
  return {
    severity,
    code,
    title,
    labels: [{ message: title, path: file, sourceSpan: { file } }],
  };
}

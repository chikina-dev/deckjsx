import { readdirSync, statSync, unwatchFile, watchFile, type Stats } from "node:fs";
import path from "node:path";
import type { Diagnostic } from "deckjsx";
import { resolveConfig, type ResolvedDeckjsxConfig } from "./config";
import { resolveEntries, type ResolvedDeckjsxEntries } from "./entries";
import { createRolldownWatchAdapter, type RolldownWatchAdapter } from "./rolldown-watch-adapter";
import {
  createDiagnosticSourceSnapshot,
  createExecutableSourceSnapshot,
  type DeckjsxDevExecutionSnapshot,
  type DeckjsxDevSourceSnapshot,
} from "./dev-source-snapshot";
import type { DevSourceProvider } from "./dev-source-provider";
import type { DeckjsxDevDiagnostic } from "./dev-diagnostics";
import { devOutputIgnoreFiles } from "./tracked-output-coordinator";

export type HostExecutionSnapshot = DeckjsxDevExecutionSnapshot;

export type HostSessionSourceProvider = DevSourceProvider & {
  executionSnapshot(): HostExecutionSnapshot;
};

export type UnresolvedHostSessionSourceProvider = DevSourceProvider & {
  executionSnapshot(): HostExecutionSnapshot | undefined;
};

type HostSessionSourceProviderBaseInput = {
  readonly cwd: string;
  readonly debounceMs?: number;
};

type ResolvedHostSessionSourceProviderInput = HostSessionSourceProviderBaseInput & {
  readonly initial: {
    readonly config: ResolvedDeckjsxConfig;
    readonly entries: ResolvedDeckjsxEntries;
    readonly diagnostics?: readonly Diagnostic[];
  };
};

type UnresolvedHostSessionSourceProviderInput = HostSessionSourceProviderBaseInput & {
  readonly initialFailure: {
    readonly packageRoot: string;
    readonly environment: string;
    readonly diagnostics: readonly Diagnostic[];
    readonly watchFiles?: readonly string[];
    readonly watchDirectories?: readonly string[];
  };
};

type HostSessionSourceProviderInput =
  | ResolvedHostSessionSourceProviderInput
  | UnresolvedHostSessionSourceProviderInput;

export function createHostSessionSourceProvider(
  input: ResolvedHostSessionSourceProviderInput,
): HostSessionSourceProvider;
export function createHostSessionSourceProvider(
  input: UnresolvedHostSessionSourceProviderInput,
): UnresolvedHostSessionSourceProvider;

export function createHostSessionSourceProvider(
  input: HostSessionSourceProviderInput,
): UnresolvedHostSessionSourceProvider {
  const invocationCwd = path.resolve(input.cwd);
  const debounceMs = input.debounceMs ?? 50;
  const queued: DeckjsxDevSourceSnapshot[] = [];
  const pending: ((snapshot: DeckjsxDevSourceSnapshot) => void)[] = [];
  const watchedPaths = new Set<string>();
  const watchListeners = new Map<string, (current: Stats, previous: Stats) => void>();
  const directoryFingerprints = new Map<string, string>();
  const startup =
    "initial" in input
      ? ({ status: "resolved", value: input.initial } as const)
      : ({ status: "diagnostic", value: input.initialFailure } as const);
  const hostPackageRoot =
    startup.status === "resolved" ? startup.value.config.packageRoot : startup.value.packageRoot;
  const hostConfigPath =
    (startup.status === "resolved" ? startup.value.config.configPath : undefined) ??
    path.join(hostPackageRoot, "deckjsx.config.ts");
  const environment =
    startup.status === "resolved" ? startup.value.config.environment : startup.value.environment;
  let configWatchFiles = (startup.status === "resolved"
    ? startup.value.config.watchFiles
    : startup.value.watchFiles) ?? [hostConfigPath];
  let execution =
    startup.status === "resolved"
      ? executionSnapshotFrom(startup.value.config, startup.value.entries)
      : undefined;
  let adapter: RolldownWatchAdapter | undefined;
  let generation = 0;
  let started = false;
  let closed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    start() {
      if (started || closed) return;
      started = true;
      if (startup.status === "resolved") {
        installSession(
          startup.value.config,
          startup.value.entries,
          (startup.value.diagnostics ?? []).map(toDevDiagnostic),
        );
      } else {
        configureWatchers([
          hostConfigPath,
          ...configWatchFiles,
          ...(startup.value.watchDirectories ?? [hostPackageRoot]),
        ]);
        emit(createDiagnosticSourceSnapshot(startup.value.diagnostics.map(toDevDiagnostic)));
      }
    },
    nextSourceSnapshot() {
      const snapshot = queued.shift();
      if (snapshot) return Promise.resolve(snapshot);
      if (closed) return Promise.resolve(createDiagnosticSourceSnapshot([]));
      return new Promise((resolve) => pending.push(resolve));
    },
    executionSnapshot() {
      return execution;
    },
    async close() {
      if (closed) return;
      closed = true;
      generation += 1;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearWatchers();
      await adapter?.close();
      const terminal = createDiagnosticSourceSnapshot([]);
      pending.splice(0).forEach((resolve) => resolve(terminal));
    },
  };

  function installSession(
    config: ResolvedDeckjsxConfig,
    entries: ResolvedDeckjsxEntries,
    diagnostics: readonly DeckjsxDevDiagnostic[] = [],
  ): void {
    generation += 1;
    const installedGeneration = generation;
    execution = executionSnapshotFrom(config, entries);
    configWatchFiles = config.watchFiles;
    const previous = adapter;
    adapter = createRolldownWatchAdapter({
      cwd: config.packageRoot,
      entry: entries.entries.length > 1 ? entries.entries : entries.entries[0],
    });
    configureWatchers([
      hostConfigPath,
      ...config.watchFiles,
      ...entries.watchFiles,
      ...entries.watchDirectories,
    ]);
    adapter.start();
    void previous?.close();
    void pumpAdapter(installedGeneration, adapter, execution, diagnostics);
  }

  async function pumpAdapter(
    installedGeneration: number,
    installedAdapter: RolldownWatchAdapter,
    installedExecution: HostExecutionSnapshot,
    installedDiagnostics: readonly DeckjsxDevDiagnostic[],
  ): Promise<void> {
    let pendingDiagnostics = installedDiagnostics;
    while (!closed && installedGeneration === generation) {
      const snapshot = await installedAdapter.nextSourceSnapshot();
      if (closed || installedGeneration !== generation) return;
      if (snapshot.status === "executable") {
        emit(
          Object.freeze(
            createExecutableSourceSnapshot({
              ...snapshot,
              execution: installedExecution,
              ...(pendingDiagnostics.length > 0 ? { diagnostics: pendingDiagnostics } : {}),
            }),
          ),
        );
      } else {
        emit(
          pendingDiagnostics.length > 0
            ? createDiagnosticSourceSnapshot([...pendingDiagnostics, ...snapshot.diagnostics])
            : snapshot,
        );
      }
      pendingDiagnostics = [];
    }
  }

  function scheduleRebuild(): void {
    if (closed) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void rebuildSession().catch((error: unknown) => {
        if (closed) return;
        emit(
          createDiagnosticSourceSnapshot([
            {
              severity: "error",
              code: "deckjsx.node.hostSession.rebuildFailed",
              title: "Host Session rebuild failed",
              message: error instanceof Error ? error.message : String(error),
              primary: { file: hostConfigPath },
            },
          ]),
        );
      });
    }, debounceMs);
  }

  async function rebuildSession(): Promise<void> {
    generation += 1;
    const rebuildGeneration = generation;
    const previous = adapter;
    adapter = undefined;
    await previous?.close();
    if (closed || rebuildGeneration !== generation) return;
    const config = await resolveConfig({
      cwd: invocationCwd,
      environment,
    });
    if (closed || rebuildGeneration !== generation) return;
    if (!config.ok) {
      configureWatchers([hostConfigPath, ...configWatchFiles]);
      emit(createDiagnosticSourceSnapshot(config.diagnostics.map(toDevDiagnostic)));
      return;
    }
    const entries = await resolveEntries(config.value);
    if (closed || rebuildGeneration !== generation) return;
    if (!entries.ok) {
      configureWatchers([
        hostConfigPath,
        ...config.value.watchFiles,
        ...(entries.watchFiles ?? []),
        ...(entries.watchDirectories ?? [config.value.packageRoot]),
      ]);
      emit(
        createDiagnosticSourceSnapshot(
          [...config.diagnostics, ...entries.diagnostics].map(toDevDiagnostic),
        ),
      );
      return;
    }
    installSession(config.value, entries.value, [
      ...config.diagnostics.map(toDevDiagnostic),
      ...entries.diagnostics.map(toDevDiagnostic),
    ]);
  }

  function configureWatchers(paths: readonly string[]): void {
    const next = new Set(
      paths.filter((item) => !item.includes("\0")).map((item) => path.resolve(item)),
    );
    for (const watched of watchedPaths) {
      if (!next.has(watched)) {
        const listener = watchListeners.get(watched);
        if (listener) unwatchFile(watched, listener);
        watchListeners.delete(watched);
        directoryFingerprints.delete(watched);
        watchedPaths.delete(watched);
      }
    }
    for (const watched of next) {
      if (watchedPaths.has(watched)) continue;
      if (isDirectory(watched)) directoryFingerprints.set(watched, directoryFingerprint(watched));
      const listener = (current: Stats, previous: Stats) =>
        onWatchChange(watched, current, previous);
      watchListeners.set(watched, listener);
      watchedPaths.add(watched);
      watchFile(watched, { interval: 100, persistent: true }, listener);
    }
  }

  function clearWatchers(): void {
    for (const watched of watchedPaths) {
      const listener = watchListeners.get(watched);
      if (listener) unwatchFile(watched, listener);
    }
    watchedPaths.clear();
    watchListeners.clear();
    directoryFingerprints.clear();
  }

  function onWatchChange(watched: string, current: Stats, previous: Stats): void {
    if (
      current.mtimeMs !== previous.mtimeMs ||
      current.ctimeMs !== previous.ctimeMs ||
      current.size !== previous.size ||
      current.ino !== previous.ino
    ) {
      if (directoryFingerprints.has(watched)) {
        const nextFingerprint = directoryFingerprint(watched);
        if (nextFingerprint === directoryFingerprints.get(watched)) return;
        directoryFingerprints.set(watched, nextFingerprint);
      }
      scheduleRebuild();
    }
  }

  function emit(snapshot: DeckjsxDevSourceSnapshot): void {
    const resolve = pending.shift();
    if (resolve) resolve(snapshot);
    else queued.push(snapshot);
  }

  function isIgnoredArtifactChange(changedPath: string): boolean {
    const normalized = path.resolve(changedPath);
    if (
      normalized.endsWith(".deckjsx-lock") ||
      normalized.endsWith(".pptx") ||
      normalized.endsWith(".pdf")
    ) {
      return true;
    }
    const current = execution;
    if (!current) return false;
    return new Set(
      devOutputIgnoreFiles({
        cwd: hostPackageRoot,
        out: current.out,
        outputs: current.outputs,
      }).map((item) => path.resolve(item)),
    ).has(normalized);
  }

  function directoryFingerprint(directory: string): string {
    try {
      return readdirSync(directory, { withFileTypes: true })
        .filter((item) => !isIgnoredArtifactChange(path.join(directory, item.name)))
        .map(
          (item) => `${item.name}:${item.isDirectory() ? "d" : item.isSymbolicLink() ? "l" : "f"}`,
        )
        .sort()
        .join("\n");
    } catch {
      return "missing";
    }
  }
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function executionSnapshotFrom(
  config: ResolvedDeckjsxConfig,
  entries: ResolvedDeckjsxEntries,
): HostExecutionSnapshot {
  const outputs = config.output ?? undefined;
  return Object.freeze({
    entry: entries.entries[0],
    entries: entries.entries,
    ...(outputs ? { out: outputs[0], outputs } : {}),
    renderExecutionContext: Object.freeze({ plugins: config.plugins }),
  });
}

function toDevDiagnostic(diagnostic: import("deckjsx").Diagnostic) {
  const primary = diagnostic.labels[0];
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    title: diagnostic.title,
    ...(diagnostic.message ? { message: diagnostic.message } : {}),
    ...(primary?.path ? { primary: { file: primary.path } } : {}),
  } as const;
}

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
import { createHostWatchSet } from "./host-watch-set";
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
  let ignoredArtifactPaths = outputIgnorePaths(hostPackageRoot, execution);
  let adapter: RolldownWatchAdapter | undefined;
  let generation = 0;
  let started = false;
  let closed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const watchSet = createHostWatchSet({
    onChange: scheduleRebuild,
    isIgnored: isIgnoredArtifactChange,
  });

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
        watchSet.replace([
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
      watchSet.close();
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
    ignoredArtifactPaths = outputIgnorePaths(hostPackageRoot, execution);
    configWatchFiles = config.watchFiles;
    const previous = adapter;
    adapter = createRolldownWatchAdapter({
      cwd: config.packageRoot,
      entry: entries.entries.length > 1 ? entries.entries : entries.entries[0],
    });
    watchSet.replace([
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
      void rebuildSession().catch(reportRebuildFailure);
    }, debounceMs);
  }

  function reportRebuildFailure(error: unknown): void {
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
      watchSet.replace([hostConfigPath, ...configWatchFiles]);
      emit(createDiagnosticSourceSnapshot(config.diagnostics.map(toDevDiagnostic)));
      return;
    }
    const entries = await resolveEntries(config.value);
    if (closed || rebuildGeneration !== generation) return;
    if (!entries.ok) {
      watchSet.replace([
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

  function emit(snapshot: DeckjsxDevSourceSnapshot): void {
    const resolve = pending.shift();
    if (resolve) resolve(snapshot);
    else queued.push(snapshot);
  }

  function isIgnoredArtifactChange(changedPath: string): boolean {
    return ignoredArtifactPaths.has(path.resolve(changedPath));
  }
}

function outputIgnorePaths(
  cwd: string,
  execution: HostExecutionSnapshot | undefined,
): ReadonlySet<string> {
  if (!execution) return new Set();
  return new Set(
    devOutputIgnoreFiles({ cwd, out: execution.out, outputs: execution.outputs }).map((item) =>
      path.resolve(item),
    ),
  );
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

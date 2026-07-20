import { readdirSync, statSync, unwatchFile, watchFile, type Stats } from "node:fs";
import path from "node:path";

export type HostWatchSet = {
  replace(paths: readonly string[]): void;
  close(): void;
};

export function createHostWatchSet(input: {
  readonly onChange: () => void;
  readonly isIgnored: (candidate: string) => boolean;
  readonly intervalMs?: number;
}): HostWatchSet {
  const entries = new Map<string, WatchedEntry>();
  const interval = input.intervalMs ?? 100;

  return {
    replace(paths) {
      const next = normalizedPaths(paths);
      removeObsoleteEntries(entries, next);
      addNewEntries(entries, next, input, interval);
    },
    close() {
      for (const [watched, entry] of entries) unwatchFile(watched, entry.listener);
      entries.clear();
    },
  };
}

function normalizedPaths(paths: readonly string[]): ReadonlySet<string> {
  return new Set(
    paths
      .filter((candidate) => !candidate.includes("\0"))
      .map((candidate) => path.resolve(candidate)),
  );
}

function removeObsoleteEntries(
  entries: Map<string, WatchedEntry>,
  next: ReadonlySet<string>,
): void {
  for (const [watched, entry] of entries) {
    if (next.has(watched)) continue;
    unwatchFile(watched, entry.listener);
    entries.delete(watched);
  }
}

function addNewEntries(
  entries: Map<string, WatchedEntry>,
  next: ReadonlySet<string>,
  input: {
    readonly onChange: () => void;
    readonly isIgnored: (candidate: string) => boolean;
  },
  interval: number,
): void {
  for (const watched of next) {
    if (entries.has(watched)) continue;
    const entry = createWatchedEntry(watched, input);
    entries.set(watched, entry);
    watchFile(watched, { interval, persistent: true }, entry.listener);
  }
}

function createWatchedEntry(
  watched: string,
  input: {
    readonly onChange: () => void;
    readonly isIgnored: (candidate: string) => boolean;
  },
): WatchedEntry {
  const entry: WatchedEntry = {
    directory: directorySnapshot(watched, input.isIgnored),
    listener(current, previous) {
      if (!statsChanged(current, previous)) return;
      if (!directoryChanged(entry, watched, input.isIgnored)) return;
      input.onChange();
    },
  };
  return entry;
}

function directoryChanged(
  entry: WatchedEntry,
  watched: string,
  isIgnored: (candidate: string) => boolean,
): boolean {
  if (entry.directory === undefined) return true;
  const current = directorySnapshot(watched, isIgnored) ?? "missing";
  if (current === entry.directory) return false;
  entry.directory = current;
  return true;
}

type WatchedEntry = {
  directory: string | undefined;
  readonly listener: (current: Stats, previous: Stats) => void;
};

function statsChanged(current: Stats, previous: Stats): boolean {
  return (
    current.mtimeMs !== previous.mtimeMs ||
    current.ctimeMs !== previous.ctimeMs ||
    current.size !== previous.size ||
    current.ino !== previous.ino
  );
}

function directorySnapshot(
  candidate: string,
  isIgnored: (candidate: string) => boolean,
): string | undefined {
  if (!isDirectory(candidate)) return undefined;
  return readDirectorySnapshot(candidate, isIgnored);
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function readDirectorySnapshot(
  directory: string,
  isIgnored: (candidate: string) => boolean,
): string {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((item) => !isIgnored(path.join(directory, item.name)))
      .map((item) => `${item.name}:${entryKind(item)}`)
      .sort()
      .join("\n");
  } catch {
    return "missing";
  }
}

function entryKind(entry: import("node:fs").Dirent): "d" | "l" | "f" {
  if (entry.isDirectory()) return "d";
  if (entry.isSymbolicLink()) return "l";
  return "f";
}

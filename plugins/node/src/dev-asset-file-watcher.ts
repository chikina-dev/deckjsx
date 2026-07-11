import { unwatchFile, watchFile, type StatsListener } from "node:fs";
import path from "node:path";

export type DevAssetFileWatcher = {
  update(files: readonly string[]): void;
  close(): void;
};

type DevAssetFileWatcherFactory = (
  filePath: string,
  onChange: () => void,
) => { readonly close: () => void };

export function createDevAssetFileWatcher(
  onChange: (filePath: string) => void,
  createFileWatcher: DevAssetFileWatcherFactory = createRecoveringFileWatcher,
): DevAssetFileWatcher {
  const watchers = new Map<string, { readonly close: () => void }>();
  let closed = false;

  return {
    update(files) {
      if (closed) {
        return;
      }
      const nextFiles = new Set(files.map((file) => path.resolve(file)));
      for (const [file, watcher] of watchers) {
        if (!nextFiles.has(file)) {
          watchers.delete(file);
          watcher.close();
        }
      }

      for (const file of nextFiles) {
        if (watchers.has(file)) {
          continue;
        }

        let ready = false;
        let changedWhileRegistering = false;
        let registration: { readonly close: () => void } | undefined;
        const watcher = createFileWatcher(file, () => {
          if (!ready) {
            changedWhileRegistering = true;
            return;
          }
          if (!closed && watchers.get(file) === registration) {
            onChange(file);
          }
        });
        let active = true;
        registration = {
          close() {
            if (!active) {
              return;
            }
            active = false;
            watcher.close();
          },
        };
        watchers.set(file, registration);
        ready = true;
        if (changedWhileRegistering && !closed && watchers.get(file) === registration) {
          onChange(file);
        }
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      const registrations = [...watchers.values()];
      watchers.clear();
      for (const watcher of registrations) {
        watcher.close();
      }
    },
  };
}

function createRecoveringFileWatcher(
  filePath: string,
  onChange: () => void,
): { readonly close: () => void } {
  let active = true;
  const listener: StatsListener = (current, previous) => {
    if (active && (current.nlink !== 0 || previous.nlink !== 0)) {
      onChange();
    }
  };
  watchFile(filePath, { persistent: true, interval: 100 }, listener);
  return {
    close() {
      if (!active) {
        return;
      }
      active = false;
      unwatchFile(filePath, listener);
    },
  };
}

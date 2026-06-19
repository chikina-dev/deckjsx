import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

export type DevAssetFileWatcher = {
  update(files: readonly string[]): void;
  close(): void;
};

export function createDevAssetFileWatcher(
  onChange: (filePath: string) => void,
): DevAssetFileWatcher {
  const watchers = new Map<string, FSWatcher>();

  return {
    update(files) {
      const nextFiles = new Set(files.map((file) => path.resolve(file)));
      for (const [file, watcher] of watchers) {
        if (!nextFiles.has(file)) {
          watcher.close();
          watchers.delete(file);
        }
      }

      for (const file of nextFiles) {
        if (watchers.has(file)) {
          continue;
        }

        try {
          const watcher = watch(file, () => {
            onChange(file);
          });
          watchers.set(file, watcher);
        } catch {
          // Missing files can appear after the next successful graph update.
        }
      }
    },
    close() {
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
  };
}

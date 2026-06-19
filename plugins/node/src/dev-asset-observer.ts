import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

type DevAssetObserver = (filePath: string) => void;

const observerStorage = new AsyncLocalStorage<DevAssetObserver>();

export function withDeckjsxDevAssetObserver<T>(
  observer: DevAssetObserver,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return observerStorage.run(observer, callback);
}

export function observeDeckjsxDevAssetFile(filePath: string): void {
  observerStorage.getStore()?.(path.resolve(filePath));
}

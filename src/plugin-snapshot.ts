export function clonePluginStageValue<T>(value: T): T {
  return globalThis.structuredClone(value) as T;
}

import { Deck, StyleSheet, Theme } from "../../../src/index.ts";
export function values<T>(map: ReadonlyMap<PropertyKey, T>): T[] {
  return [...map.values()];
}

export { Deck, StyleSheet, Theme };

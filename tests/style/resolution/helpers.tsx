import { StyleSheet, Theme } from "@/src/index.ts";
import { Deck } from "@/tests/helpers.ts";
export function values<T>(map: ReadonlyMap<PropertyKey, T>): T[] {
  return [...map.values()];
}

export { Deck, StyleSheet, Theme };

import type { DeckjsxDevSourceSnapshot } from "./dev-source-snapshot";

/**
 * Source provider used by the `@deckjsx/node/dev` compiler.
 *
 * Providers own bundling or source acquisition. The default provider uses Rolldown watch mode, but
 * tests and editor integrations can supply their own provider as long as it returns source
 * snapshots in response to compiler cycles.
 */
export type DevSourceProvider = {
  /** Start watching or preparing source snapshots. */
  start(): void;
  /** Return the next executable or diagnostic source snapshot. */
  nextSourceSnapshot(): Promise<DeckjsxDevSourceSnapshot>;
  /** Release provider resources. */
  close(): Promise<void>;
};

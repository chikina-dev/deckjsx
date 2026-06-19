import type { DeckjsxDevSourceSnapshot } from "./dev-source-snapshot";

export type DevSourceProvider = {
  start(): void;
  nextSourceSnapshot(): Promise<DeckjsxDevSourceSnapshot>;
  close(): Promise<void>;
};

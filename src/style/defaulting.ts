import { isCssWideKeyword } from "./length";
import type { DeckLength } from "./types";

export function authoredLengthOrUndefined(value: DeckLength | undefined): DeckLength | undefined {
  if (
    typeof value === "string" &&
    (value.trim().toLowerCase() === "auto" || isCssWideKeyword(value))
  ) {
    return undefined;
  }

  return value;
}

export function hasAuthoredLength(value: DeckLength | undefined): boolean {
  return authoredLengthOrUndefined(value) !== undefined;
}

function defaultingTokens(value: unknown): readonly unknown[] {
  if (typeof value === "string") {
    return value.trim().split(/\s+/).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

export function hasAutoToken(value: unknown): boolean {
  return defaultingTokens(value).some(
    (token) => typeof token === "string" && token.trim().toLowerCase() === "auto",
  );
}

export function hasCssWideKeywordToken(value: unknown): boolean {
  return defaultingTokens(value).some((token) => isCssWideKeyword(token));
}

import type { ProjectedUnsupportedSemantic } from "./projected";

export function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ThrowableResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function throwableResult<T>(run: () => T): ThrowableResult<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return { ok: false, reason: errorReason(error) };
  }
}

function semanticValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value) ?? String(value);
}

export function unsupportedSemantic(input: {
  feature: ProjectedUnsupportedSemantic["feature"];
  property: string;
  value: unknown;
  error: unknown;
  fallback?: ProjectedUnsupportedSemantic["fallback"];
}): ProjectedUnsupportedSemantic | undefined {
  if (input.value === undefined || input.value === null || input.value === "") {
    return undefined;
  }

  return {
    feature: input.feature,
    property: input.property,
    value: semanticValue(input.value),
    reason: errorReason(input.error),
    ...(input.fallback ? { fallback: input.fallback } : {}),
  };
}

export function unsupportedSemanticFromReason(input: {
  feature: ProjectedUnsupportedSemantic["feature"];
  property: string;
  value: unknown;
  reason: string;
  fallback?: ProjectedUnsupportedSemantic["fallback"];
}): ProjectedUnsupportedSemantic | undefined {
  return unsupportedSemantic({ ...input, error: input.reason });
}

export function unsupportedCssWideKeywordSemantic(
  property: string,
  value: unknown,
): ProjectedUnsupportedSemantic | undefined {
  return unsupportedSemantic({
    feature: "layout",
    property,
    value,
    error: new Error(
      "CSS-wide keywords require cascade/defaulting semantics; deckjsx v0.8.2 falls back to the supported subset initial value and preserves the authored keyword for inspection.",
    ),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredValue"],
      missing: ["cssWideKeywordCascade"],
    },
  });
}

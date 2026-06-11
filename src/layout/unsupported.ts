import type { ProjectedUnsupportedSemantic } from "./projected";

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

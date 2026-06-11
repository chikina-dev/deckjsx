import type { ProjectedUnsupportedSemantic } from "./projected";
import { unsupportedSemantic } from "./unsupported";

export type ProjectedImageFit = "contain" | "cover" | "stretch";

export function normalizeProjectedImageFit(value: unknown): ProjectedImageFit {
  if (value === "cover" || value === "contain" || value === "stretch" || value === "fill") {
    return value === "fill" ? "stretch" : value;
  }

  return "contain";
}

export function unsupportedObjectFitSemantics(
  value: unknown,
): readonly ProjectedUnsupportedSemantic[] {
  if (
    value === undefined ||
    value === "cover" ||
    value === "contain" ||
    value === "stretch" ||
    value === "fill"
  ) {
    return [];
  }

  const unsupported = unsupportedSemantic({
    feature: "image",
    property: "objectFit",
    value,
    error: new Error(
      "CSS object-fit values none and scale-down require natural-size comparison that is outside the current deckjsx v0.8.2 image projection subset.",
    ),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredObjectFit"],
      missing: ["cssObjectFitNaturalSize"],
    },
  });

  return unsupported ? [unsupported] : [];
}

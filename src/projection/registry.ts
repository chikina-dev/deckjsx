import type { DeckOptions } from "../authoring/index";
import type { Diagnostics } from "../diagnostics";
import type { SemanticAuthorGraph } from "../graph";
import type { ProjectionFormat } from "../pipeline";
import type { ResolvedStyleMap } from "../style/resolve";
import {
  projectGraphToPartialPptxPackage,
  projectGraphToPptxPackage,
  summarizePptxPackage,
  type ProjectInspectionAdapterLimitation,
  type ProjectInspectionSummary,
  type PptxPackageModel,
} from "./pptx";

export type ProjectedDocumentModel = PptxPackageModel;

type ProjectionCapability<TModel extends ProjectedDocumentModel> = {
  readonly format: ProjectionFormat;
  project(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    options: DeckOptions;
    diagnostics?: Diagnostics;
  }): TModel;
  projectPartial(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    options: DeckOptions;
    diagnostics?: Diagnostics;
  }): TModel;
  canSummarize(projection: ProjectedDocumentModel): projection is TModel;
  summarize(
    projection: TModel,
    options?: {
      diagnostics?: Diagnostics;
      adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
    },
  ): ProjectInspectionSummary;
};

const pptxProjectionCapability: ProjectionCapability<PptxPackageModel> = {
  format: "pptx",
  project: projectGraphToPptxPackage,
  projectPartial: projectGraphToPartialPptxPackage,
  canSummarize: isPptxPackageModelShape,
  summarize: summarizePptxPackage,
};

function projectionCapabilityFor(
  format: ProjectionFormat,
): ProjectionCapability<ProjectedDocumentModel> {
  switch (format) {
    case "pptx":
      return pptxProjectionCapability;
  }
}

export function projectGraphToDocumentModel(input: {
  format: ProjectionFormat;
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
}): ProjectedDocumentModel {
  return projectionCapabilityFor(input.format).project(input);
}

export function projectGraphToPartialDocumentModel(input: {
  format: ProjectionFormat;
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
}): ProjectedDocumentModel {
  return projectionCapabilityFor(input.format).projectPartial(input);
}

export function summarizeProjectedDocumentModel(
  projection: ProjectedDocumentModel,
  options: {
    diagnostics?: Diagnostics;
    adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
  } = {},
): ProjectInspectionSummary | undefined {
  if (!canSummarizeProjectedDocumentModel(projection)) {
    return undefined;
  }

  return projectionCapabilityFor(projection.format).summarize(projection, options);
}

export function canSummarizeProjectedDocumentModel(
  projection: ProjectedDocumentModel,
): projection is PptxPackageModel {
  return projection.format === "pptx" && pptxProjectionCapability.canSummarize(projection);
}

function isPptxPackageModelShape(
  projection: ProjectedDocumentModel,
): projection is PptxPackageModel {
  const candidate = projection as unknown as {
    format?: unknown;
    parts?: unknown;
    slides?: unknown;
  };

  return (
    candidate.format === "pptx" && Array.isArray(candidate.parts) && Array.isArray(candidate.slides)
  );
}

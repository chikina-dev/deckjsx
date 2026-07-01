import type { DeckOptions } from "../authoring/options";
import { createDiagnostics, type Diagnostics } from "../diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "../graph";
import type { DeckIntegrationContext } from "../integration-context";
import type { ProjectionFormat } from "../pipeline/public";
import type { ResolvedStyleMap } from "../style/resolve";
import type { PdfPageModel } from "./pdf/model";
import { projectGraphToPartialPdfPageModel, projectGraphToPdfPageModel } from "./pdf/project";
import { validatePdfPageModel } from "./pdf/validation";
import { summarizePptxPackage } from "./pptx/inspect";
import { projectGraphToPartialPptxPackage, projectGraphToPptxPackage } from "./pptx/project";
import {
  collectPptxUnsupportedProjectionDiagnostics,
  collectPptxUnsupportedProjectionModelDiagnostics,
} from "./pptx/style";
import { collectPptxThemeProjectionDiagnostics } from "./pptx/theme";
import type {
  ProjectInspectionAdapterLimitation,
  ProjectInspectionAssetResolutionSummary,
  ProjectInspectionSummary,
  PptxPackageModel,
  PptxProjectionAssetArtifact,
} from "./pptx/model";

export type ProjectedDocumentModel = PptxPackageModel | PdfPageModel;

type ProjectionCapability<TModel extends ProjectedDocumentModel> = {
  readonly format: ProjectionFormat;
  project(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    options: DeckOptions;
    diagnostics?: Diagnostics;
    assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
    integrationContext?: DeckIntegrationContext;
  }): TModel;
  diagnostics(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    options: DeckOptions;
  }): Diagnostics;
  projectionDiagnostics(
    projection: TModel,
    options?: { readonly includeAllUnsupportedSemantics?: boolean },
  ): Diagnostics;
  projectPartial(input: {
    graph: SemanticAuthorGraph;
    resolvedStyles: ResolvedStyleMap;
    options: DeckOptions;
    diagnostics?: Diagnostics;
    assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
    integrationContext?: DeckIntegrationContext;
  }): TModel;
  canSummarize(projection: ProjectedDocumentModel): projection is TModel;
  summarize(
    projection: TModel,
    options?: {
      diagnostics?: Diagnostics;
      adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
      assetResolutions?: readonly ProjectInspectionAssetResolutionSummary[];
      graph?: SemanticAuthorGraph;
      includeDetails?: boolean;
      resolvedStyles?: ResolvedStyleMap;
    },
  ): ProjectInspectionSummary | undefined;
};

const pptxProjectionCapability: ProjectionCapability<PptxPackageModel> = {
  format: "pptx",
  project: projectGraphToPptxPackage,
  diagnostics: (input) =>
    createDiagnostics([
      ...collectPptxUnsupportedProjectionDiagnostics(input).items,
      ...collectPptxThemeProjectionDiagnostics(input).items,
    ]),
  projectionDiagnostics: collectPptxUnsupportedProjectionModelDiagnostics,
  projectPartial: projectGraphToPartialPptxPackage,
  canSummarize: isPptxPackageModelShape,
  summarize: summarizePptxPackage,
};

const pdfProjectionCapability: ProjectionCapability<PdfPageModel> = {
  format: "pdf",
  project: projectGraphToPdfPageModel,
  diagnostics: () => createDiagnostics(),
  projectionDiagnostics: validatePdfPageModel,
  projectPartial: projectGraphToPartialPdfPageModel,
  canSummarize: isPdfPageModelShape,
  summarize: () => undefined,
};

function projectionCapabilityFor(
  format: ProjectionFormat,
): ProjectionCapability<ProjectedDocumentModel> {
  switch (format) {
    case "pptx":
      return pptxProjectionCapability;
    case "pdf":
      return pdfProjectionCapability;
  }
}

export function projectionDiagnosticsForGraph(input: {
  format: ProjectionFormat;
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
}): Diagnostics {
  return projectionCapabilityFor(input.format).diagnostics(input);
}

export function projectionDiagnosticsForModel(input: {
  projection: ProjectedDocumentModel;
  includeAllUnsupportedSemantics?: boolean;
}): Diagnostics {
  return projectionCapabilityFor(input.projection.format).projectionDiagnostics(input.projection, {
    includeAllUnsupportedSemantics: input.includeAllUnsupportedSemantics,
  });
}

export function projectGraphToDocumentModel(input: {
  format: ProjectionFormat;
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
  integrationContext?: DeckIntegrationContext;
}): ProjectedDocumentModel {
  return projectionCapabilityFor(input.format).project(input);
}

export function projectGraphToPartialDocumentModel(input: {
  format: ProjectionFormat;
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
  integrationContext?: DeckIntegrationContext;
}): ProjectedDocumentModel {
  return projectionCapabilityFor(input.format).projectPartial(input);
}

export function summarizeProjectedDocumentModel(
  projection: ProjectedDocumentModel,
  options: {
    diagnostics?: Diagnostics;
    adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
    assetResolutions?: readonly ProjectInspectionAssetResolutionSummary[];
    graph?: SemanticAuthorGraph;
    includeDetails?: boolean;
    resolvedStyles?: ResolvedStyleMap;
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
  return (
    projection.format === "pptx" &&
    Array.isArray(projection.parts) &&
    Array.isArray(projection.slides)
  );
}

function isPdfPageModelShape(projection: ProjectedDocumentModel): projection is PdfPageModel {
  return (
    projection.format === "pdf" &&
    Array.isArray(projection.pages) &&
    Array.isArray(projection.resources.fonts) &&
    Array.isArray(projection.resources.images)
  );
}

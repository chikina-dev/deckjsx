import type { DeckOptions } from "../authoring/options";
import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "../graph";
import type { DeckIntegrationContext } from "../integration-context";
import type { ProjectionFormat } from "../pipeline/public";
import type { ResolvedStyleMap } from "../style/resolve";
import { summarizePdfPageModel } from "./pdf/inspect";
import type { PdfPageModel } from "./pdf/model";
import { projectGraphToPartialPdfPageModel, projectGraphToPdfPageModel } from "./pdf/project";
import { validatePdfPageModel } from "./pdf/validation";
import { summarizePptxPackage } from "./pptx/inspect";
import { projectGraphToPartialPptxPackage, projectGraphToPptxPackage } from "./pptx/project";
import { validatePptxPackageModel } from "./pptx/validation";
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
    projection?: ProjectedDocumentModel;
  }): Diagnostics;
  projectionDiagnostics(
    projection: TModel,
    options?: { readonly includeAllUnsupportedSemantics?: boolean },
  ): Diagnostics;
  validateModel(projection: TModel): Diagnostics;
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
      ...collectPptxUnsupportedProjectionDiagnostics({
        graph: input.graph,
        resolvedStyles: input.resolvedStyles,
        ...(input.projection?.format === "pptx" ? { projection: input.projection } : {}),
      }).items,
      ...collectPptxThemeProjectionDiagnostics(input).items,
    ]),
  projectionDiagnostics: collectPptxUnsupportedProjectionModelDiagnostics,
  validateModel: validatePptxPackageModel,
  projectPartial: projectGraphToPartialPptxPackage,
  canSummarize: isPptxPackageModelShape,
  summarize: summarizePptxPackage,
};

const pdfProjectionCapability: ProjectionCapability<PdfPageModel> = {
  format: "pdf",
  project: projectGraphToPdfPageModel,
  diagnostics: collectPdfUnsupportedProjectionDiagnostics,
  projectionDiagnostics: () => createDiagnostics(),
  validateModel: validatePdfPageModel,
  projectPartial: projectGraphToPartialPdfPageModel,
  canSummarize: isPdfPageModelShape,
  summarize: summarizePdfPageModel,
};

function pdfUnsupportedContentDiagnostic(input: {
  readonly nodeId: string;
  readonly kind: string;
  readonly path: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    title: "authored content is not supported by PDF projection",
    message:
      "PDF projection does not yet support this authored content, so this node would be omitted.",
    labels: [
      {
        path: input.path,
        message: `node=${input.nodeId}, kind=${input.kind}`,
        severity: "primary",
      },
    ],
  });
}

function collectPdfUnsupportedProjectionDiagnostics(input: {
  graph: SemanticAuthorGraph;
}): Diagnostics {
  const issues: Diagnostic[] = [];

  input.graph.nodes.forEach((node, nodeId) => {
    if (node.kind !== "video") {
      return;
    }

    if (node.posterAssetRef) {
      return;
    }

    issues.push(
      pdfUnsupportedContentDiagnostic({
        nodeId,
        kind: node.kind,
        path: node.origin.path,
      }),
    );
  });

  return createDiagnostics(issues);
}

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
  projection?: ProjectedDocumentModel;
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

export function validateProjectedDocumentModel(projection: ProjectedDocumentModel): Diagnostics {
  return projectionCapabilityFor(projection.format).validateModel(projection);
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
): projection is ProjectedDocumentModel {
  return projectionCapabilityFor(projection.format).canSummarize(projection);
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

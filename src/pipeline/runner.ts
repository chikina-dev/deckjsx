import type { DeckOptions } from "../authoring/options";
import { validateDeckOptions } from "../authoring/options/validation";
import type { RenderOptions, WriterAdapter } from "../adapter";
import { createWriterRenderContext } from "../adapter/context";
import type { AssetLoader } from "../assets";
import { summarizeAssetResolutions } from "../asset-loading";
import { defaultAdapterLimitationsFor, selectWriterAdapter } from "../adapter/registry";
import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import {
  COMPOSITION_SOURCE,
  type CompositionSource,
  type SourceContextValue,
} from "../composition/types";
import { compositionRevisionForSource } from "../composition/source";
import { applyPluginHooks } from "../plugin";
import {
  createRenderExecution,
  withRenderExecutionContext,
  type RenderExecution,
} from "../render-execution";
import {
  attachArtifactWriteToken,
  claimIncrementalArtifactRenderSlot,
} from "../incremental-artifact-session";
import type { AssetEntityId } from "../graph";
import { resultOk, stageSummary } from "./index";
import type {
  InspectionDetailLevel,
  ProjectOptions,
  ProjectionFormat,
  StageArtifactStatus,
} from "./public";
import { PipelineArtifactCollection, type AssetArtifact } from "./artifacts";
import type { DefinedGraphInput, DefinedProjectionInput } from "./artifact-input";
import type { MediaSourceOrigin } from "../media-source-origin";
import { compileSourceWithValidatedPlugins } from "../compile-runner";
import {
  definedProjectionFormatDiagnostics,
  selectProjectOutputTarget,
  selectRenderOutputTarget,
  writerAdapterFormatDiagnostics,
} from "../output-target/policy";
import type { InternalProjectResult } from "./results";
import type { PresentStageArtifactStatus, RenderResult } from "./results-public";
import { isPptxPackageModel, isPptxSlidePart } from "../projection/pptx/model";
import { isPdfPageModel, type PdfPageModel } from "../projection/pdf/model";
import { projectionShapeDiagnostics } from "../projection/pptx/artifact";
import { withPackagePartFingerprints } from "../projection/pptx/fingerprint";
import type {
  PptxPackageModel,
  PptxPackageModelCandidate,
  PptxPackagePart,
  PptxSlidePart,
} from "../projection/pptx/model";
import {
  projectGraphToDocumentModel,
  projectGraphToPartialDocumentModel,
  projectionDiagnosticsForGraph,
  projectionDiagnosticsForModel,
  summarizeProjectedDocumentModel,
  validateProjectedDocumentModel,
  type ProjectedDocumentModel,
} from "../projection/registry";
import {
  incrementalProjectionReusePlan,
  slideProjectionFingerprintSnapshots,
} from "../projection/pptx/reuse";
import type { SlideTemplateSet } from "../templates";
import {
  loadAssetArtifacts,
  resolveAssetArtifacts,
  resolveIntegrationFontAssets,
} from "./asset-resolution";
import { renderAdapterAtIntegrationBoundary } from "./render-boundary";
import { diagnosticFromError } from "./failure-diagnostics";
import { projectionWithReusablePackageParts } from "./projection-reuse";

export { compileSource } from "../compile-runner";
export type { CompileResult, ProjectResult, RenderResult } from "./results-public";

function definedDocumentModel(value: unknown): ProjectedDocumentModel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isPptxPackageModel(value as PptxPackageModelCandidate)) {
    return value as PptxPackageModel;
  }

  return isPdfPageModel(value) ? value : undefined;
}

function projectionInputFormatMatches(
  input: DefinedProjectionInput | undefined,
  format: ProjectionFormat,
): boolean {
  const projection = input?.projection;
  return isRecord(projection) && projection.format === format;
}

function definedProjectionShapeDiagnostics(value: unknown): Diagnostics {
  if (isPdfPageModel(value)) {
    return emptyDiagnostics();
  }

  if (isRecord(value)) {
    return projectionShapeDiagnostics(value as PptxPackageModelCandidate);
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_DEFINE_PROJECTION_SHAPE",
      title: "defined projection shape is invalid",
      message: "defineProjection() requires a projected document model object.",
      labels: [
        {
          path: "projection",
          message: value === null ? "received null" : `received ${typeof value}`,
          severity: "primary",
        },
      ],
    }),
  ]);
}

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  const items: Diagnostics["items"][number][] = [];
  const keysFromPreviousStages = new Set<string>();
  diagnostics.forEach((stageDiagnostics) => {
    const currentStageKeys = new Set<string>();
    stageDiagnostics.items.forEach((item) => {
      const key = JSON.stringify([
        item.severity,
        item.code,
        item.title,
        item.message,
        item.labels.map((label) => [
          label.path,
          label.message,
          label.severity,
          label.sourceSpan?.file,
          label.sourceSpan?.line,
          label.sourceSpan?.column,
        ]),
        item.notes,
        item.help,
      ]);
      if (!keysFromPreviousStages.has(key)) {
        items.push(item);
      }
      currentStageKeys.add(key);
    });
    currentStageKeys.forEach((key) => keysFromPreviousStages.add(key));
  });
  return createDiagnostics(items);
}

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

function directPluginsForSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(source: CompositionSource<TSourceContext, TTemplates>) {
  return source[COMPOSITION_SOURCE]().plugins;
}

function graphForCurrentComposition<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  graph: DefinedGraphInput | undefined,
  currentRevision = compositionRevisionForSource(source),
): DefinedGraphInput | undefined {
  return graph?.compositionRevision === currentRevision ? graph : undefined;
}

function materializeAssetMap(
  artifacts: PipelineArtifactCollection,
  assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>,
): void {
  assetsById.forEach((asset) => artifacts.materializeAsset(asset));
}

function normalizePptxPackageProjection(projection: PptxPackageModel): PptxPackageModel {
  const parts = withPackagePartFingerprints(projection.parts);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const slides = projection.slides
    .map((slide): PptxPackagePart | undefined => partsById.get(slide.id))
    .filter((part): part is PptxSlidePart => part !== undefined && isPptxSlidePart(part));

  return {
    ...projection,
    parts,
    slides,
  };
}

function projectedArtifactStatus(value: undefined, diagnostics: Diagnostics): "missing";
function projectedArtifactStatus<T>(value: T, diagnostics: Diagnostics): PresentStageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus {
  if (value === undefined) {
    return "missing";
  }

  return diagnostics.hasErrors ? "partial" : "available";
}

function includeInspectionSummary(inspection: InspectionDetailLevel | undefined): boolean {
  return inspection !== "none";
}

function includeInspectionDetails(inspection: InspectionDetailLevel | undefined): boolean {
  return inspection === "details";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createPipelineArtifacts(): PipelineArtifactCollection {
  return new PipelineArtifactCollection();
}

type ProjectSourceRunnerInput<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
> = {
  source: CompositionSource<TSourceContext, TTemplates>;
  options: DeckOptions;
  projectOptions?: ProjectOptions;
  projectionFormat?: ProjectionFormat;
  definedGraph?: DefinedGraphInput;
  definedProjection?: DefinedProjectionInput;
  artifacts?: PipelineArtifactCollection;
  assetLoaders?: readonly AssetLoader[];
  mediaSourceOrigin?: MediaSourceOrigin;
  execution?: RenderExecution;
  retainSlideProjectionFingerprints?: boolean;
};

export function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  input: ProjectSourceRunnerInput<TSourceContext, TTemplates> & { projectionFormat: "pdf" },
): Promise<InternalProjectResult<PdfPageModel>>;
export function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  input: ProjectSourceRunnerInput<TSourceContext, TTemplates> & {
    projectOptions: ProjectOptions & { readonly format: "pdf" };
  },
): Promise<InternalProjectResult<PdfPageModel>>;
export function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(input: ProjectSourceRunnerInput<TSourceContext, TTemplates>): Promise<InternalProjectResult>;
export async function projectSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  input: ProjectSourceRunnerInput<TSourceContext, TTemplates>,
): Promise<InternalProjectResult<ProjectedDocumentModel>> {
  const artifacts = input.artifacts ?? new PipelineArtifactCollection();
  const outputTarget = selectProjectOutputTarget({
    options: input.options,
    projectOptions: input.projectOptions,
    projectionFormat: input.projectionFormat,
  });
  const projectionFormat = outputTarget.projectionFormat;
  const implicitFormatDiagnostics = outputTarget.diagnostics;
  const optionsDiagnostics = validateDeckOptions(input.options);
  const providedExecutionDiagnostics = createDiagnostics(input.execution?.diagnostics);

  if (optionsDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, optionsDiagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  if (providedExecutionDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, providedExecutionDiagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  if (implicitFormatDiagnostics.hasErrors) {
    return {
      ok: false,
      diagnostics: implicitFormatDiagnostics,
      stages: {
        compile: stageSummary("compile", implicitFormatDiagnostics, "missing"),
        project: stageSummary("project", implicitFormatDiagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  if (input.definedProjection) {
    const definedProjectionInput = input.definedProjection.projection;
    const definedProjection = definedDocumentModel(definedProjectionInput);
    const definedShapeDiagnostics =
      input.definedProjection.diagnostics.items.length > 0
        ? input.definedProjection.diagnostics
        : definedProjectionShapeDiagnostics(definedProjectionInput);
    const definedFormatDiagnostics = definedProjection
      ? definedProjectionFormatDiagnostics({
          projection: definedProjection,
          format: projectionFormat,
        })
      : emptyDiagnostics();
    const diagnostics = combineDiagnostics(
      implicitFormatDiagnostics,
      definedShapeDiagnostics,
      definedFormatDiagnostics,
      definedProjection
        ? projectionDiagnosticsForModel({
            projection: definedProjection,
            includeAllUnsupportedSemantics: true,
          })
        : emptyDiagnostics(),
      definedProjection ? validateProjectedDocumentModel(definedProjection) : emptyDiagnostics(),
    );
    if (!definedProjection || definedFormatDiagnostics.hasErrors) {
      return {
        ok: resultOk(diagnostics),
        diagnostics,
        stages: {
          compile: stageSummary("compile", emptyDiagnostics(), "available"),
          project: stageSummary("project", diagnostics, "missing"),
        },
        format: projectionFormat,
      };
    }

    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(definedProjection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
        })
      : undefined;

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "available"),
        project: stageSummary(
          "project",
          diagnostics,
          projectedArtifactStatus(definedProjection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection: definedProjection,
      ...(summary ? { summary } : {}),
    };
  }

  const execution =
    input.execution ??
    createRenderExecution({
      plugins: directPluginsForSource(input.source),
      assetLoaders: input.assetLoaders,
      mediaSourceOrigin: input.mediaSourceOrigin,
    });
  const createdExecutionDiagnostics = createDiagnostics(execution.diagnostics);
  if (!input.execution && createdExecutionDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, createdExecutionDiagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  const compileResult = input.definedGraph
    ? {
        ok: resultOk(input.definedGraph.diagnostics),
        diagnostics: input.definedGraph.diagnostics,
        stages: {
          compile: stageSummary(
            "compile",
            input.definedGraph.diagnostics,
            projectedArtifactStatus(input.definedGraph.graph, input.definedGraph.diagnostics),
          ),
        },
        graph: input.definedGraph.graph,
        resolvedStyles: input.definedGraph.resolvedStyles,
      }
    : compileSourceWithValidatedPlugins(
        input.source,
        artifacts,
        execution.pluginSnapshot,
        input.execution?.authoringRuntimeObservers,
      );

  if (
    compileResult.diagnostics.hasErrors ||
    !compileResult.graph ||
    !compileResult.resolvedStyles
  ) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, compileResult.diagnostics);
    return {
      ok: false,
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary("project", diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  try {
    const beforeAsset = applyPluginHooks(execution.plugins, "beforeAsset", {
      stage: "asset" as const,
      phase: "before" as const,
      operation: "probe" as const,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      assetLoaders: execution.assetLoaders,
      mediaSourceOrigin: execution.mediaSourceOrigin,
      ...(execution.integrationContext ? { integrationContext: execution.integrationContext } : {}),
    });
    const beforeAssetDiagnostics = createDiagnostics(beforeAsset.diagnostics);
    const assetResult = await resolveAssetArtifacts({
      graph: compileResult.graph,
      loaders: beforeAsset.context.assetLoaders,
      artifacts,
      mediaSourceOrigin: beforeAsset.context.mediaSourceOrigin,
    });
    const fontAssetResult = await resolveIntegrationFontAssets({
      integrationContext: beforeAsset.context.integrationContext ?? execution.integrationContext,
      loaders: beforeAsset.context.assetLoaders,
      artifacts,
      ...(beforeAsset.context.mediaSourceOrigin
        ? { origin: beforeAsset.context.mediaSourceOrigin }
        : {}),
    });
    const resolvedAssetsById = new Map([...assetResult.assetsById, ...fontAssetResult.assetsById]);
    const afterAsset = applyPluginHooks(execution.plugins, "afterAsset", {
      stage: "asset" as const,
      phase: "after" as const,
      operation: "probe" as const,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      assetsById: resolvedAssetsById,
      assetLoaders: beforeAsset.context.assetLoaders,
      mediaSourceOrigin: beforeAsset.context.mediaSourceOrigin,
      ...(fontAssetResult.integrationContext
        ? { integrationContext: fontAssetResult.integrationContext }
        : {}),
    });
    const assetsById = afterAsset.context.assetsById;
    if (assetsById !== resolvedAssetsById) {
      materializeAssetMap(artifacts, assetsById);
    }
    const assetDiagnostics = combineDiagnostics(
      beforeAssetDiagnostics,
      assetResult.diagnostics,
      fontAssetResult.diagnostics,
      createDiagnostics(afterAsset.diagnostics),
    );
    const beforeProject = applyPluginHooks(execution.plugins, "beforeProject", {
      stage: "project" as const,
      phase: "before" as const,
      format: projectionFormat,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      assetsById,
    });
    const projectGraph = beforeProject.context.graph;
    const projectResolvedStyles = beforeProject.context.resolvedStyles;
    const projectAssetsById = beforeProject.context.assetsById;
    if (projectAssetsById !== assetsById) {
      materializeAssetMap(artifacts, projectAssetsById);
    }
    const incrementalReuseSnapshot = artifacts.incrementalProjectionReuseSnapshot;
    const projectionReuse =
      projectionFormat === "pptx"
        ? incrementalProjectionReusePlan({
            graph: projectGraph,
            resolvedStyles: projectResolvedStyles,
            options: input.options,
            assets: projectAssetsById,
            previousGraph: incrementalReuseSnapshot?.graph,
            previousProjection: incrementalReuseSnapshot?.projection,
            previousOptions: incrementalReuseSnapshot?.options,
            previousAssets: incrementalReuseSnapshot?.assetsById,
            staleAssetEntityIds: incrementalReuseSnapshot?.staleAssetEntityIds,
          })
        : undefined;
    const beforeProjectDiagnostics = createDiagnostics(beforeProject.diagnostics);
    const projected = projectGraphToDocumentModel({
      format: projectionFormat,
      graph: projectGraph,
      resolvedStyles: projectResolvedStyles,
      options: input.options,
      assets: projectAssetsById,
      integrationContext: afterAsset.context.integrationContext,
    });
    const reusedProjection =
      projected.format === "pptx"
        ? projectionWithReusablePackageParts({
            projection: projected,
            previous: incrementalReuseSnapshot?.projection,
            graph: projectGraph,
            reusableSlideNodeIds: projectionReuse?.slideNodeIds,
          })
        : projected;
    const afterProject = applyPluginHooks(execution.plugins, "afterProject", {
      stage: "project" as const,
      phase: "after" as const,
      format: projectionFormat,
      graph: projectGraph,
      resolvedStyles: projectResolvedStyles,
      assetsById: projectAssetsById,
      projection: reusedProjection,
    });
    const projection =
      afterProject.context.projection === reusedProjection
        ? reusedProjection
        : afterProject.context.projection.format === "pptx"
          ? normalizePptxPackageProjection(afterProject.context.projection)
          : afterProject.context.projection;
    const unsupportedProjectionDiagnostics = projectionDiagnosticsForGraph({
      format: projectionFormat,
      graph: projectGraph,
      resolvedStyles: projectResolvedStyles,
      options: input.options,
    });
    const unsupportedProjectionModelDiagnostics = projectionDiagnosticsForModel({ projection });
    const projectionDiagnostics = validateProjectedDocumentModel(projection);
    const slideProjectionFingerprints =
      projection.format === "pptx"
        ? (projectionReuse?.slideProjectionFingerprints ??
          (input.retainSlideProjectionFingerprints
            ? slideProjectionFingerprintSnapshots({
                graph: projectGraph,
                resolvedStyles: projectResolvedStyles,
                options: input.options,
                assets: projectAssetsById,
              })
            : undefined))
        : undefined;
    const diagnostics = combineDiagnostics(
      implicitFormatDiagnostics,
      compileResult.diagnostics,
      assetDiagnostics,
      beforeProjectDiagnostics,
      unsupportedProjectionDiagnostics,
      unsupportedProjectionModelDiagnostics,
      projectionDiagnostics,
      createDiagnostics(afterProject.diagnostics),
    );
    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(projection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          assetResolutions: summarizeAssetResolutions(projectAssetsById),
          graph: projectGraph,
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
          resolvedStyles: projectResolvedStyles,
        })
      : undefined;
    artifacts.materializeProjection(
      projection,
      diagnostics,
      input.options,
      slideProjectionFingerprints ? { slideProjectionFingerprints } : {},
    );

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          diagnostics,
          projectedArtifactStatus(projection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection,
      ...(summary ? { summary } : {}),
    };
  } catch (error) {
    const projectDiagnostics = diagnosticFromError({
      stage: "project",
      code: "E_PROJECT_FAILED",
      title: "project failed",
      error,
    });
    let diagnostics = combineDiagnostics(
      implicitFormatDiagnostics,
      compileResult.diagnostics,
      projectDiagnostics,
    );
    let partialProjection: ProjectedDocumentModel | undefined;

    try {
      partialProjection = projectGraphToPartialDocumentModel({
        format: projectionFormat,
        graph: compileResult.graph,
        resolvedStyles: compileResult.resolvedStyles,
        options: input.options,
      });
      diagnostics = combineDiagnostics(
        diagnostics,
        projectionDiagnosticsForModel({
          projection: partialProjection,
          includeAllUnsupportedSemantics: true,
        }),
        validateProjectedDocumentModel(partialProjection),
      );
      artifacts.materializeProjection(partialProjection, diagnostics, input.options);
    } catch {
      partialProjection = undefined;
    }

    if (!partialProjection) {
      return {
        ok: false,
        diagnostics,
        stages: {
          ...compileResult.stages,
          project: stageSummary("project", diagnostics, "missing"),
        },
        format: projectionFormat,
      };
    }

    const summary = includeInspectionSummary(input.projectOptions?.inspection)
      ? summarizeProjectedDocumentModel(partialProjection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
          graph: compileResult.graph,
          includeDetails: includeInspectionDetails(input.projectOptions?.inspection),
          resolvedStyles: compileResult.resolvedStyles,
        })
      : undefined;

    return {
      ok: false,
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          diagnostics,
          projectedArtifactStatus(partialProjection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection: partialProjection,
      ...(summary ? { summary } : {}),
    };
  }
}

export async function renderSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(input: {
  source: CompositionSource<TSourceContext, TTemplates>;
  options: DeckOptions;
  renderInput?: RenderOptions | WriterAdapter;
  definedGraph?: DefinedGraphInput;
  definedProjection?: DefinedProjectionInput;
  definedProjectionOrigin?: "cache" | "explicit";
  artifacts?: PipelineArtifactCollection;
  assetLoaders?: readonly AssetLoader[];
}): Promise<RenderResult> {
  const incrementalSlot = claimIncrementalArtifactRenderSlot();
  const artifacts =
    incrementalSlot?.artifacts ?? input.artifacts ?? new PipelineArtifactCollection();
  const finishRender = <TResult extends RenderResult>(result: TResult): TResult =>
    attachArtifactWriteToken(result, incrementalSlot?.token);
  const outputTarget = selectRenderOutputTarget({
    options: input.options,
    renderInput: input.renderInput,
  });
  const projectionFormat = outputTarget.projectionFormat;
  const implicitFormatDiagnostics = outputTarget.diagnostics;
  const optionsDiagnostics = validateDeckOptions(input.options);
  if (optionsDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, optionsDiagnostics);
    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: projectionFormat,
    });
  }

  const adapterSelection = selectWriterAdapter({
    renderInput: input.renderInput,
    projectionFormat,
  });

  if (!adapterSelection.ok) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, adapterSelection.diagnostics);
    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "missing"),
        project: stageSummary("project", emptyDiagnostics(), "missing"),
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: adapterSelection.format,
    });
  }

  const adapter = adapterSelection.adapter;
  const renderInputForExecution =
    input.renderInput && typeof input.renderInput === "object" ? input.renderInput : adapter;
  const execution = createRenderExecution({
    plugins: directPluginsForSource(input.source),
    renderInput: incrementalSlot
      ? withRenderExecutionContext(renderInputForExecution, incrementalSlot.renderExecutionContext)
      : renderInputForExecution,
    assetLoaders: input.assetLoaders,
  });
  const executionDiagnostics = createDiagnostics(execution.diagnostics);
  if (executionDiagnostics.hasErrors) {
    const diagnostics = combineDiagnostics(implicitFormatDiagnostics, executionDiagnostics);
    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
        project: stageSummary("project", diagnostics, "missing"),
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: adapter.format,
    });
  }
  const sourceInvalidated = execution.sourceInvalidation
    ? artifacts.invalidateForSourceChange(execution.sourceInvalidation)
    : false;
  const currentCompositionRevision = compositionRevisionForSource(input.source);
  const incrementalGraph = graphForCurrentComposition(
    input.source,
    incrementalSlot?.artifacts.graph,
    currentCompositionRevision,
  );
  const inputGraph = graphForCurrentComposition(
    input.source,
    input.definedGraph,
    currentCompositionRevision,
  );
  const explicitDefinedProjection =
    input.definedProjectionOrigin === "cache" ? undefined : input.definedProjection;
  const projectResult = await projectSource({
    source: input.source,
    options: input.options,
    projectionFormat: adapter.projectionFormat,
    definedGraph: sourceInvalidated ? artifacts.graph : (incrementalGraph ?? inputGraph),
    definedProjection:
      explicitDefinedProjection ??
      (sourceInvalidated
        ? projectionInputFormatMatches(artifacts.projection, adapter.projectionFormat)
          ? artifacts.projection
          : undefined
        : incrementalGraph
          ? projectionInputFormatMatches(
              incrementalSlot?.artifacts.projection,
              adapter.projectionFormat,
            )
            ? incrementalSlot?.artifacts.projection
            : undefined
          : undefined),
    artifacts,
    assetLoaders: execution.assetLoaders,
    mediaSourceOrigin: execution.mediaSourceOrigin,
    execution,
    projectOptions: { inspection: "none" },
    retainSlideProjectionFingerprints: incrementalSlot !== undefined,
  });
  const formatDiagnostics = writerAdapterFormatDiagnostics({
    adapter,
    options: input.options,
  });
  const projectDiagnostics = combineDiagnostics(
    projectResult.diagnostics,
    formatDiagnostics,
    implicitFormatDiagnostics,
  );

  if (!projectResult.projection || projectDiagnostics.hasErrors) {
    return finishRender({
      ok: false,
      diagnostics: projectDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", projectDiagnostics, "missing"),
      },
      format: adapter.format,
    });
  }

  const beforeRender = applyPluginHooks(execution.plugins, "beforeRender", {
    stage: "render" as const,
    phase: "before" as const,
    format: adapter.format,
    projection: projectResult.projection,
  });
  const renderProjection = beforeRender.context.projection;
  const beforeRenderDiagnostics = createDiagnostics(beforeRender.diagnostics);
  const preRenderDiagnostics = combineDiagnostics(projectDiagnostics, beforeRenderDiagnostics);
  if (preRenderDiagnostics.hasErrors) {
    return finishRender({
      ok: false,
      diagnostics: preRenderDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", preRenderDiagnostics, "missing"),
      },
      format: adapter.format,
    });
  }

  try {
    const graphArtifact = artifacts.graph;
    const beforeAssetLoad =
      graphArtifact && graphArtifact.graph && graphArtifact.resolvedStyles
        ? applyPluginHooks(execution.plugins, "beforeAsset", {
            stage: "asset" as const,
            phase: "before" as const,
            operation: "load" as const,
            graph: graphArtifact.graph,
            resolvedStyles: graphArtifact.resolvedStyles,
            assetLoaders: execution.assetLoaders,
            mediaSourceOrigin: execution.mediaSourceOrigin,
            ...(execution.integrationContext
              ? { integrationContext: execution.integrationContext }
              : {}),
          })
        : undefined;
    const beforeAssetLoadDiagnostics = createDiagnostics(beforeAssetLoad?.diagnostics);
    const loadPreRenderDiagnostics = combineDiagnostics(
      preRenderDiagnostics,
      beforeAssetLoadDiagnostics,
    );
    if (loadPreRenderDiagnostics.hasErrors) {
      return finishRender({
        ok: false,
        diagnostics: loadPreRenderDiagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", loadPreRenderDiagnostics, "missing"),
        },
        format: adapter.format,
      });
    }
    const assetLoadDiagnostics = await loadAssetArtifacts({
      artifacts,
      loaders: beforeAssetLoad?.context.assetLoaders ?? execution.assetLoaders,
      mediaSourceOrigin: beforeAssetLoad?.context.mediaSourceOrigin ?? execution.mediaSourceOrigin,
      projection: renderProjection,
    });
    const afterAssetLoad =
      graphArtifact && graphArtifact.graph && graphArtifact.resolvedStyles
        ? applyPluginHooks(execution.plugins, "afterAsset", {
            stage: "asset" as const,
            phase: "after" as const,
            operation: "load" as const,
            graph: graphArtifact.graph,
            resolvedStyles: graphArtifact.resolvedStyles,
            assetsById: artifacts.assetsById,
            assetLoaders: beforeAssetLoad?.context.assetLoaders ?? execution.assetLoaders,
            mediaSourceOrigin:
              beforeAssetLoad?.context.mediaSourceOrigin ?? execution.mediaSourceOrigin,
            ...(beforeAssetLoad?.context.integrationContext
              ? { integrationContext: beforeAssetLoad.context.integrationContext }
              : execution.integrationContext
                ? { integrationContext: execution.integrationContext }
                : {}),
          })
        : undefined;
    if (afterAssetLoad && afterAssetLoad.context.assetsById !== artifacts.assetsById) {
      materializeAssetMap(artifacts, afterAssetLoad.context.assetsById);
    }
    const assetLoadLifecycleDiagnostics = combineDiagnostics(
      beforeAssetLoadDiagnostics,
      assetLoadDiagnostics,
      createDiagnostics(afterAssetLoad?.diagnostics),
    );
    if (assetLoadLifecycleDiagnostics.hasErrors) {
      const diagnostics = combineDiagnostics(preRenderDiagnostics, assetLoadLifecycleDiagnostics);
      return finishRender({
        ok: false,
        diagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", diagnostics, "missing"),
        },
        format: adapter.format,
      });
    }

    const writerContext = createWriterRenderContext({
      assetsById: artifacts.assetsById,
      pptxBuildArtifactsByPartId: artifacts.pptxBuildArtifactsByPartId,
      onBuildArtifacts: (buildArtifacts) => artifacts.materializePptxBuildArtifacts(buildArtifacts),
    });

    const adapterBoundaryResult = await renderAdapterAtIntegrationBoundary({
      adapter,
      projection: renderProjection,
      context: writerContext,
    });
    if (!adapterBoundaryResult.ok) {
      const diagnostics = combineDiagnostics(
        preRenderDiagnostics,
        adapterBoundaryResult.diagnostics,
      );
      return finishRender({
        ok: false,
        diagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", diagnostics, "missing"),
        },
        format: adapter.format,
      });
    }

    const adapterResult = adapterBoundaryResult.result;
    const afterRender = applyPluginHooks(execution.plugins, "afterRender", {
      stage: "render" as const,
      phase: "after" as const,
      format: adapter.format,
      projection: renderProjection,
      ...(adapterResult.artifact ? { artifact: adapterResult.artifact } : {}),
    });
    const afterRenderDiagnostics = createDiagnostics(afterRender.diagnostics);
    const renderDiagnostics = combineDiagnostics(
      preRenderDiagnostics,
      assetLoadLifecycleDiagnostics,
      adapterResult.diagnostics,
      afterRenderDiagnostics,
    );
    const artifact = afterRender.context.artifact;
    if (!artifact) {
      return finishRender({
        ok: resultOk(renderDiagnostics),
        diagnostics: renderDiagnostics,
        stages: {
          ...projectResult.stages,
          render: stageSummary("render", renderDiagnostics, "missing"),
        },
        format: adapter.format,
      });
    }

    const artifactWasReplaced = artifact !== adapterResult.artifact;
    const summary =
      !artifactWasReplaced && includeInspectionSummary(adapter.options.inspection)
        ? adapterResult.summary
        : undefined;
    const patchPlan =
      !artifactWasReplaced && adapterResult.patchPlan && execution.sourceInvalidation
        ? { ...adapterResult.patchPlan, sourceInvalidation: execution.sourceInvalidation }
        : artifactWasReplaced
          ? undefined
          : adapterResult.patchPlan;

    return finishRender({
      ok: resultOk(renderDiagnostics),
      diagnostics: renderDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary(
          "render",
          renderDiagnostics,
          projectedArtifactStatus(artifact, renderDiagnostics),
        ),
      },
      format: adapter.format,
      artifact,
      ...(patchPlan ? { patchPlan } : {}),
      ...(summary ? { summary } : {}),
    });
  } catch (error) {
    const renderDiagnostics = diagnosticFromError({
      stage: "render",
      code: "E_RENDER_FAILED",
      title: "render failed",
      error,
    });
    const diagnostics = combineDiagnostics(preRenderDiagnostics, renderDiagnostics);

    return finishRender({
      ok: false,
      diagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", diagnostics, "missing"),
      },
      format: adapter.format,
    });
  }
}

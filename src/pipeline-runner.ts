import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeckOptions } from "./authoring/index";
import type { RenderOptions, WriterAdapter, WriterAdapterResult } from "./adapter";
import {
  defaultAdapterLimitationsFor,
  defaultWriterAdapterFor,
  isWriterAdapter,
} from "./adapter-registry";
import { createDiagnostics, diagnostic, type Diagnostics } from "./diagnostics";
import type { CompositionSource } from "./composition/types";
import { resolveComposition } from "./composition/resolve";
import { buildSemanticAuthorGraph, type SemanticAuthorGraph } from "./graph";
import {
  resultOk,
  stageSummary,
  type CompileStages,
  type OutputFormat,
  type ProjectionFormat,
  type ProjectStages,
  type RenderedArtifact,
  type RenderStages,
  type StageArtifactStatus,
  type WrittenOutput,
} from "./pipeline";
import {
  PipelineArtifactCollection,
  type DefinedGraphArtifact,
  type DefinedProjectionArtifact,
} from "./pipeline-artifacts";
import type { ProjectInspectionSummary, PptxPackageModel } from "./projection/pptx";
import {
  projectGraphToDocumentModel,
  projectGraphToPartialDocumentModel,
  summarizeProjectedDocumentModel,
} from "./projection/registry";
import { validatePptxPackageModel } from "./projection/pptx-validation";
import { resolveStyles, type ResolvedStyleMap } from "./style/resolve";

export type CompileResult = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: CompileStages;
  readonly graph?: SemanticAuthorGraph;
  readonly resolvedStyles?: ResolvedStyleMap;
};

export type ProjectResult = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: ProjectStages;
  readonly format: ProjectionFormat;
  readonly projection?: PptxPackageModel;
  readonly summary?: ProjectInspectionSummary;
};

export type RenderResult = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly stages: RenderStages;
  readonly format: OutputFormat;
  readonly artifact?: RenderedArtifact;
  readonly output?: WrittenOutput;
};

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
}

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

function artifactStatus<T>(value: T | undefined): StageArtifactStatus {
  return value === undefined ? "missing" : "available";
}

function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus {
  if (value === undefined) {
    return "missing";
  }

  return diagnostics.hasErrors ? "partial" : "available";
}

function projectionFormatFor(options: DeckOptions): ProjectionFormat {
  return options.output?.format ?? "pptx";
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isWriterAdapterLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === "deckjsx.writerAdapter" ||
      "projectionFormat" in value ||
      "render" in value ||
      ("name" in value && "format" in value))
  );
}

function invalidWriterAdapterDiagnostics(value: unknown): Diagnostics | undefined {
  if (!isWriterAdapterLike(value) || isWriterAdapter(value)) {
    return undefined;
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_RENDER_INVALID_WRITER_ADAPTER",
      title: "writer adapter shape is invalid",
      message:
        "render() received a value that looks like a Writer Adapter, but it does not satisfy the deckjsx.writerAdapter runtime contract.",
      labels: [
        {
          path: "render.adapter",
          message:
            'expected kind, name, projectionFormat="pptx", format, options, and render(projection)',
          severity: "primary",
        },
      ],
    }),
  ]);
}

function selectWriterAdapter(input: {
  renderInput: RenderOptions | WriterAdapter<PptxPackageModel> | undefined;
  projectionFormat: ProjectionFormat;
}):
  | { readonly ok: true; readonly adapter: WriterAdapter<PptxPackageModel> }
  | { readonly ok: false; readonly diagnostics: Diagnostics; readonly format: OutputFormat } {
  const invalidAdapterDiagnostics = invalidWriterAdapterDiagnostics(input.renderInput);

  if (invalidAdapterDiagnostics) {
    return {
      ok: false,
      diagnostics: invalidAdapterDiagnostics,
      format: input.projectionFormat,
    };
  }

  return {
    ok: true,
    adapter: isWriterAdapter(input.renderInput)
      ? input.renderInput
      : defaultWriterAdapterFor(input.projectionFormat, input.renderInput ?? {}),
  };
}

function writerAdapterFormatDiagnostics(input: {
  adapter: WriterAdapter;
  deckFormat: ProjectionFormat;
}): Diagnostics {
  const adapterFormat = input.adapter.format as string;
  const deckFormat = input.deckFormat as string;

  if (adapterFormat === deckFormat) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_RENDER_ADAPTER_FORMAT_MISMATCH",
      title: "writer adapter format differs from deck output format",
      message:
        "The selected Writer Adapter format does not match this Deck's configured output format.",
      labels: [
        {
          path: "render.adapter.format",
          message: `adapter=${adapterFormat}, deck=${deckFormat}`,
        },
      ],
    }),
  ]);
}

async function writeRenderedArtifact(input: {
  adapter: WriterAdapter;
  adapterResult: WriterAdapterResult;
  diagnostics: Diagnostics;
}): Promise<{
  readonly diagnostics: Diagnostics;
  readonly output?: WrittenOutput;
}> {
  if (!input.adapterResult.artifact || !input.adapter.options.output) {
    return { diagnostics: input.diagnostics };
  }

  try {
    await mkdir(dirname(input.adapter.options.output), { recursive: true });
    await writeFile(input.adapter.options.output, input.adapterResult.artifact.bytes);
    return {
      diagnostics: input.diagnostics,
      output: { path: input.adapter.options.output },
    };
  } catch (error) {
    return {
      diagnostics: combineDiagnostics(
        input.diagnostics,
        diagnosticFromError({
          stage: "render",
          code: "E_RENDER_WRITE_FAILED",
          title: "output write failed",
          error,
        }),
      ),
    };
  }
}

function diagnosticFromError(input: {
  stage: "compile" | "project" | "render";
  code: string;
  title: string;
  error: unknown;
}): Diagnostics {
  const message = input.error instanceof Error ? input.error.message : String(input.error);

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: input.code,
      title: input.title,
      message,
      labels: [{ path: input.stage, message }],
    }),
  ]);
}

export function compileSource(
  source: CompositionSource<any>,
  artifacts?: PipelineArtifactCollection,
): CompileResult {
  const composition = resolveComposition(source);

  if (composition.diagnostics.hasErrors) {
    artifacts?.materializeComposition(composition.roots, composition.diagnostics);

    return {
      ok: false,
      diagnostics: composition.diagnostics,
      stages: {
        compile: stageSummary("compile", composition.diagnostics, "missing"),
      },
    };
  }

  const result = buildSemanticAuthorGraph(composition.roots ?? []);
  const styleResult = result.graph
    ? resolveStyles(result.graph, composition.roots ?? [])
    : undefined;
  const diagnostics = styleResult
    ? combineDiagnostics(result.diagnostics, styleResult.diagnostics)
    : result.diagnostics;
  artifacts?.materializeComposition(composition.roots, composition.diagnostics);
  if (result.graph && styleResult) {
    artifacts?.materializeGraphFromComposition({
      graph: result.graph,
      resolvedStyles: styleResult.resolvedStyles,
      roots: composition.roots ?? [],
      diagnostics,
    });
  }

  return {
    ok: resultOk(diagnostics),
    diagnostics,
    stages: {
      compile: stageSummary("compile", diagnostics, artifactStatus(result.graph)),
    },
    ...(result.graph ? { graph: result.graph } : {}),
    ...(styleResult ? { resolvedStyles: styleResult.resolvedStyles } : {}),
  };
}

export function projectSource(input: {
  source: CompositionSource<any>;
  options: DeckOptions;
  projectionFormat?: ProjectionFormat;
  definedGraph?: DefinedGraphArtifact;
  definedProjection?: DefinedProjectionArtifact;
  artifacts?: PipelineArtifactCollection;
}): ProjectResult {
  const projectionFormat = input.projectionFormat ?? projectionFormatFor(input.options);

  if (input.definedProjection) {
    const diagnostics = combineDiagnostics(
      input.definedProjection.diagnostics,
      validatePptxPackageModel(input.definedProjection.projection),
    );
    const summary = summarizeProjectedDocumentModel(input.definedProjection.projection, {
      diagnostics,
      adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
    });

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "available"),
        project: stageSummary(
          "project",
          diagnostics,
          projectedArtifactStatus(input.definedProjection.projection, diagnostics),
        ),
      },
      format: projectionFormat,
      projection: input.definedProjection.projection,
      ...(summary ? { summary } : {}),
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
    : compileSource(input.source, input.artifacts);

  if (
    compileResult.diagnostics.hasErrors ||
    !compileResult.graph ||
    !compileResult.resolvedStyles
  ) {
    return {
      ok: false,
      diagnostics: compileResult.diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary("project", compileResult.diagnostics, "missing"),
      },
      format: projectionFormat,
    };
  }

  try {
    const projection = projectGraphToDocumentModel({
      format: projectionFormat,
      graph: compileResult.graph,
      resolvedStyles: compileResult.resolvedStyles,
      options: input.options,
    });
    const projectionDiagnostics = validatePptxPackageModel(projection);
    const diagnostics = combineDiagnostics(compileResult.diagnostics, projectionDiagnostics);
    const summary = summarizeProjectedDocumentModel(projection, {
      diagnostics,
      adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
    });
    input.artifacts?.materializeProjection(projection, diagnostics);

    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          projectionDiagnostics,
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
    let diagnostics = combineDiagnostics(compileResult.diagnostics, projectDiagnostics);
    let partialProjection: PptxPackageModel | undefined;
    try {
      partialProjection = projectGraphToPartialDocumentModel({
        format: projectionFormat,
        graph: compileResult.graph,
        resolvedStyles: compileResult.resolvedStyles,
        options: input.options,
      });
      const partialDiagnostics = combineDiagnostics(
        diagnostics,
        validatePptxPackageModel(partialProjection),
      );
      diagnostics = partialDiagnostics;
      input.artifacts?.materializeProjection(partialProjection, partialDiagnostics);
    } catch {
      partialProjection = undefined;
    }

    const summary = partialProjection
      ? summarizeProjectedDocumentModel(partialProjection, {
          diagnostics,
          adapterLimitations: defaultAdapterLimitationsFor(projectionFormat),
        })
      : undefined;

    return {
      ok: false,
      diagnostics,
      stages: {
        ...compileResult.stages,
        project: stageSummary(
          "project",
          projectDiagnostics,
          projectedArtifactStatus(partialProjection, diagnostics),
        ),
      },
      format: projectionFormat,
      ...(partialProjection ? { projection: partialProjection } : {}),
      ...(summary ? { summary } : {}),
    };
  }
}

export async function renderSource(input: {
  source: CompositionSource<any>;
  options: DeckOptions;
  renderInput?: RenderOptions | WriterAdapter<PptxPackageModel>;
  definedGraph?: DefinedGraphArtifact;
  definedProjection?: DefinedProjectionArtifact;
  artifacts?: PipelineArtifactCollection;
}): Promise<RenderResult> {
  const projectionFormat = projectionFormatFor(input.options);
  const adapterSelection = selectWriterAdapter({
    renderInput: input.renderInput,
    projectionFormat,
  });

  if (!adapterSelection.ok) {
    return {
      ok: false,
      diagnostics: adapterSelection.diagnostics,
      stages: {
        compile: stageSummary("compile", emptyDiagnostics(), "missing"),
        project: stageSummary("project", emptyDiagnostics(), "missing"),
        render: stageSummary("render", adapterSelection.diagnostics, "missing"),
      },
      format: adapterSelection.format,
    };
  }

  const adapter = adapterSelection.adapter;
  const projectResult = projectSource({
    source: input.source,
    options: input.options,
    projectionFormat: adapter.projectionFormat,
    definedGraph: input.definedGraph,
    definedProjection: input.definedProjection,
    artifacts: input.artifacts,
  });
  const formatDiagnostics = writerAdapterFormatDiagnostics({
    adapter,
    deckFormat: projectionFormat,
  });
  const projectDiagnostics = combineDiagnostics(projectResult.diagnostics, formatDiagnostics);

  if (!projectResult.projection || projectDiagnostics.hasErrors) {
    return {
      ok: false,
      diagnostics: projectDiagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", projectDiagnostics, "missing"),
      },
      format: adapter.format,
    };
  }

  try {
    const adapterResult = await adapter.render(projectResult.projection);
    const renderDiagnostics = combineDiagnostics(projectDiagnostics, adapterResult.diagnostics);
    const writeResult = await writeRenderedArtifact({
      adapter,
      adapterResult,
      diagnostics: renderDiagnostics,
    });

    return {
      ok: resultOk(writeResult.diagnostics),
      diagnostics: writeResult.diagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary(
          "render",
          writeResult.diagnostics,
          artifactStatus(adapterResult.artifact),
        ),
      },
      format: adapter.format,
      ...(adapterResult.artifact ? { artifact: adapterResult.artifact } : {}),
      ...(writeResult.output ? { output: writeResult.output } : {}),
    };
  } catch (error) {
    const renderDiagnostics = diagnosticFromError({
      stage: "render",
      code: "E_RENDER_FAILED",
      title: "render failed",
      error,
    });
    const diagnostics = combineDiagnostics(projectDiagnostics, renderDiagnostics);

    return {
      ok: false,
      diagnostics,
      stages: {
        ...projectResult.stages,
        render: stageSummary("render", renderDiagnostics, "missing"),
      },
      format: adapter.format,
    };
  }
}

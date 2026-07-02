import type { DeckOptions } from "../authoring/options";
import {
  configuredOutputFormats,
  hasMultipleConfiguredOutputFormats,
  implicitOutputFormat,
  isProjectionFormat,
  outputFormatsInclude,
} from "../authoring/options/output-formats";
import type { RenderOptions, WriterAdapter } from "../adapter";
import { isWriterAdapter } from "../adapter/guard";
import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type { ProjectedDocumentModel } from "../projection/registry";
import type { ProjectOptions, ProjectionFormat } from "../pipeline/public";

type OutputTargetPath = "project.format" | "render.format";

type OutputTargetSelection = {
  readonly projectionFormat: ProjectionFormat;
  readonly diagnostics: Diagnostics;
};

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

function implicitFirstOutputFormatDiagnostics(input: {
  options: DeckOptions;
  format: ProjectionFormat;
  path: OutputTargetPath;
}): Diagnostics {
  if (!hasMultipleConfiguredOutputFormats(input.options)) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
      title: "implicit output format selected the first configured format",
      message:
        "This Deck declares multiple output formats, so deckjsx used output.formats[0] for this single-format call.",
      labels: [
        {
          path: input.path,
          message: `selected ${input.format} from output.formats[0]`,
        },
      ],
    }),
  ]);
}

function invalidProjectFormatDiagnostics(input: { format: unknown }): Diagnostics {
  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_PROJECT_FORMAT_INVALID",
      title: "project format is invalid",
      message: "Project format must be one of: pptx, pdf.",
      labels: [
        {
          path: "project.format",
          message: `received ${String(input.format)}`,
          severity: "primary",
        },
      ],
    }),
  ]);
}

export function selectProjectOutputTarget(input: {
  options: DeckOptions;
  projectOptions?: ProjectOptions;
  projectionFormat?: ProjectionFormat;
}): OutputTargetSelection {
  const requestedFormat = input.projectionFormat ?? input.projectOptions?.format;
  if (requestedFormat !== undefined && !isProjectionFormat(requestedFormat)) {
    return {
      projectionFormat: implicitOutputFormat(input.options),
      diagnostics: invalidProjectFormatDiagnostics({ format: requestedFormat }),
    };
  }

  const projectionFormat = requestedFormat ?? implicitOutputFormat(input.options);
  const diagnostics = requestedFormat
    ? emptyDiagnostics()
    : implicitFirstOutputFormatDiagnostics({
        options: input.options,
        format: projectionFormat,
        path: "project.format",
      });

  return { projectionFormat, diagnostics };
}

export function selectRenderOutputTarget(input: {
  options: DeckOptions;
  renderInput?: RenderOptions | WriterAdapter;
}): OutputTargetSelection {
  if (isWriterAdapter(input.renderInput)) {
    return {
      projectionFormat: input.renderInput.projectionFormat,
      diagnostics: emptyDiagnostics(),
    };
  }

  const projectionFormat = implicitOutputFormat(input.options);
  return {
    projectionFormat,
    diagnostics: implicitFirstOutputFormatDiagnostics({
      options: input.options,
      format: projectionFormat,
      path: "render.format",
    }),
  };
}

export function writerAdapterFormatDiagnostics(input: {
  adapter: WriterAdapter;
  options: DeckOptions;
}): Diagnostics {
  const adapterFormat = input.adapter.format;

  if (outputFormatsInclude(input.options, adapterFormat)) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
      title: "writer adapter format is not configured for deck output",
      message:
        "The selected Writer Adapter format is not listed in this Deck's output.formats configuration.",
      labels: [
        {
          path: "render.adapter.format",
          message: `adapter=${adapterFormat}, output.formats=${configuredOutputFormats(input.options).join(",")}`,
        },
      ],
    }),
  ]);
}

export function definedProjectionFormatDiagnostics(input: {
  projection: ProjectedDocumentModel;
  format: ProjectionFormat;
}): Diagnostics {
  if (input.projection.format === input.format) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_DEFINE_PROJECTION_FORMAT",
      title: "projection format does not match the requested output format",
      message:
        "defineProjection() supplied a projected document model for a different output format.",
      labels: [
        {
          path: "projection.format",
          message: `expected ${input.format}, received ${input.projection.format}`,
          severity: "primary",
        },
      ],
    }),
  ]);
}

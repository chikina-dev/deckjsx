import type { ProjectionFormat } from "../../pipeline/contract";

export const DEFAULT_OUTPUT_FORMATS = ["pptx"] as const satisfies readonly ProjectionFormat[];

type OutputFormatSource = {
  readonly output?: {
    readonly formats?: unknown;
  };
};

export function isProjectionFormat(value: unknown): value is ProjectionFormat {
  return value === "pptx" || value === "pdf";
}

export function configuredOutputFormats(options: OutputFormatSource): readonly ProjectionFormat[] {
  const formats = options.output?.formats;
  if (!Array.isArray(formats) || formats.length === 0) {
    return DEFAULT_OUTPUT_FORMATS;
  }

  const validFormats = formats.filter(isProjectionFormat);
  return validFormats.length > 0 ? validFormats : DEFAULT_OUTPUT_FORMATS;
}

export function implicitOutputFormat(options: OutputFormatSource): ProjectionFormat {
  return configuredOutputFormats(options)[0] ?? "pptx";
}

export function hasMultipleConfiguredOutputFormats(options: OutputFormatSource): boolean {
  return configuredOutputFormats(options).length > 1;
}

export function outputFormatsInclude(
  options: OutputFormatSource,
  format: ProjectionFormat,
): boolean {
  return configuredOutputFormats(options).includes(format);
}

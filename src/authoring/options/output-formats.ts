import type { ProjectionFormat } from "../../pipeline/contract";

export const DEFAULT_OUTPUT_FORMATS = ["pptx"] as const satisfies readonly ProjectionFormat[];

type OutputFormatSource = {
  readonly output?: {
    readonly formats?: readonly ProjectionFormat[];
  };
};

export function configuredOutputFormats(options: OutputFormatSource): readonly ProjectionFormat[] {
  const formats = options.output?.formats;
  return formats && formats.length > 0 ? formats : DEFAULT_OUTPUT_FORMATS;
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

import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";

/** Normalize thrown execution failures at the pipeline stage boundary. */
export function diagnosticFromError(input: {
  readonly stage: "compile" | "project" | "render";
  readonly code: string;
  readonly title: string;
  readonly error: unknown;
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

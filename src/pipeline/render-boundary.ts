import type { WriterAdapter, WriterAdapterResult } from "../adapter";
import type { WriterRenderContext } from "../adapter/public";
import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import type { ProjectedDocumentModel } from "../projection/registry";
import { diagnosticFromError } from "./failure-diagnostics";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDiagnosticSourceSpan(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["file", "line", "column"]) &&
    (value.file === undefined || typeof value.file === "string") &&
    (value.line === undefined || typeof value.line === "number") &&
    (value.column === undefined || typeof value.column === "number")
  );
}

function isDiagnosticLabel(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["path", "message", "sourceSpan", "severity"]) &&
    typeof value.path === "string" &&
    typeof value.message === "string" &&
    (value.sourceSpan === undefined || isDiagnosticSourceSpan(value.sourceSpan)) &&
    (value.severity === undefined || value.severity === "primary" || value.severity === "secondary")
  );
}

function isDiagnosticValue(value: unknown): value is Diagnostic {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["severity", "code", "title", "message", "labels", "notes", "help"]) &&
    (value.severity === "error" || value.severity === "warning") &&
    typeof value.code === "string" &&
    typeof value.title === "string" &&
    (value.message === undefined || typeof value.message === "string") &&
    Array.isArray(value.labels) &&
    value.labels.every(isDiagnosticLabel) &&
    (value.notes === undefined || isStringArray(value.notes)) &&
    (value.help === undefined || isStringArray(value.help))
  );
}

function isDiagnosticsValue(value: unknown): value is Diagnostics {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["items", "hasErrors", "hasWarnings"]) &&
    Array.isArray(value.items) &&
    value.items.every(isDiagnosticValue) &&
    typeof value.hasErrors === "boolean" &&
    typeof value.hasWarnings === "boolean"
  );
}

function isWriterAdapterResult(value: unknown): value is WriterAdapterResult {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["diagnostics", "artifact", "patchPlan", "summary"]) &&
    isDiagnosticsValue(value.diagnostics)
  );
}

export async function renderAdapterAtIntegrationBoundary(input: {
  readonly adapter: WriterAdapter;
  readonly projection: ProjectedDocumentModel;
  readonly context: WriterRenderContext;
}): Promise<
  | { readonly ok: true; readonly result: WriterAdapterResult }
  | { readonly ok: false; readonly diagnostics: Diagnostics }
> {
  try {
    const result = await input.adapter.render(input.projection, input.context);
    if (!isWriterAdapterResult(result)) {
      return {
        ok: false,
        diagnostics: createDiagnostics([
          diagnostic({
            severity: "error",
            code: "E_RENDER_ADAPTER_RESULT_INVALID",
            title: "writer adapter result is invalid",
            message: "Writer adapters must return a result object with diagnostics.",
            labels: [
              {
                path: "render.adapter.result",
                message: result === null ? "received null" : `received ${typeof result}`,
                severity: "primary",
              },
            ],
          }),
        ]),
      };
    }

    return {
      ok: true,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: diagnosticFromError({
        stage: "render",
        code: "E_RENDER_FAILED",
        title: "render failed",
        error,
      }),
    };
  }
}

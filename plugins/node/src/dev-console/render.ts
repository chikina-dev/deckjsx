import type { DeckjsxDevDiagnostic } from "../dev-diagnostics";
import type { DeckjsxDevCompilationResult } from "../dev-compilation";
import type { InteractiveResponse } from "../interactive/session";
import { devConsoleEventFromCompilationResult, type DevConsoleEvent } from "./events";

export function formatDeckjsxDevHelp(): readonly string[] {
  return [
    "Usage",
    "  deckjsx dev <entry> --out <path> [extra output paths...]",
    "",
    "Options",
    "  --out <path>          tracked output path",
    "  --interactive         open the inline inspector",
    "  --interactive-help    print inspector command reference",
  ];
}

export function formatDeckjsxInteractiveHelp(): readonly string[] {
  return [
    "Interactive Commands",
    "  status",
    "  timings",
    "  diagnostics",
    "  diagnostic <index>",
    "  style <target> [property]",
    "  component tree",
    "  component inspect <target>",
    "  component search <query>",
    "  component filter <query>",
    "  component diff",
    "  component impact <target>",
    "  props inspect <target> [path]",
    "  props diff <target> [path]",
    "  projection [@slot] [slideIndex] [elementIndex]",
    "  history changes",
    "  selection",
    "  $0 | $1 | $2 | $$",
    "  exit | quit | .exit",
  ];
}

export function formatDeckjsxDevStarted(
  input: { readonly entry?: string } = {},
): readonly string[] {
  return [`${formatTime()} [deckjsx] dev started${input.entry ? `    ${input.entry}` : ""}`];
}

export function formatDeckjsxDevCompilationResult(
  result: DeckjsxDevCompilationResult,
): readonly string[] {
  return formatDeckjsxDevConsoleEvent(devConsoleEventFromCompilationResult(result));
}

export function formatDeckjsxDevConsoleEvent(event: DevConsoleEvent): readonly string[] {
  if (event.kind === "dev.started") {
    return formatDeckjsxDevStarted(event);
  }
  if (event.kind === "diagnostic") {
    return formatDeckjsxNodeDiagnostics([event.diagnostic]);
  }
  const status =
    event.kind === "dev.ready" ? "ready" : event.kind === "dev.blocked" ? "blocked" : "error";
  const summary = event.writes
    ? pluralCount(event.writes.length, "output")
    : `compilation ${event.compilation}`;
  const lines = [`${formatTime()} [deckjsx] ${status}          ${summary}`];
  if (event.changedSourceIds.length > 0) {
    lines.push(formatField("changed", formatChangedSourceIds(event.changedSourceIds)));
  }
  if (event.writes) {
    lines.push(
      ...event.writes.map((write) => {
        const resultStatus =
          typeof write.result === "object" && write.result !== null && "status" in write.result
            ? String(write.result.status)
            : write.tracked
              ? "tracked"
              : "untracked";
        return `  output  ${write.path}    ${resultStatus}`;
      }),
    );
  }
  return lines;
}

function formatChangedSourceIds(sourceIds: readonly string[]): string {
  const visible = sourceIds.slice(0, 3);
  const suffix =
    sourceIds.length > visible.length ? ` (+${sourceIds.length - visible.length})` : "";
  return `${visible.join(", ")}${suffix}`;
}

export function formatDeckjsxNodeDiagnostics(
  diagnostics: readonly DeckjsxDevDiagnostic[],
): readonly string[] {
  return diagnostics.flatMap((diagnostic) => {
    const lines = [`${diagnostic.severity} ${diagnostic.code}`, `  ${diagnostic.title}`];
    if (diagnostic.message) {
      lines.push(`  ${diagnostic.message}`);
    }
    if (diagnostic.primary) {
      lines.push(
        `  --> ${diagnostic.primary.file}:${diagnostic.primary.line ?? 1}:${diagnostic.primary.column ?? 1}`,
      );
    }
    const sourceSnippet = formatDiagnosticSourceSnippet(diagnostic);
    if (sourceSnippet) {
      lines.push(...sourceSnippet.lines);
    }
    if (diagnostic.phase) {
      lines.push(formatField("phase", diagnostic.phase));
    }
    if (diagnostic.compilation !== undefined) {
      lines.push(formatField("compilation", String(diagnostic.compilation)));
    }
    const labels = sourceSnippet?.consumedLabel
      ? (diagnostic.labels ?? []).slice(1)
      : (diagnostic.labels ?? []);
    for (const label of labels) {
      if (label.span) {
        lines.push(`  --> ${label.span.file}:${label.span.line ?? 1}:${label.span.column ?? 1}`);
      }
      lines.push(formatField("label", label.message));
    }
    for (const note of diagnostic.notes ?? []) {
      lines.push(formatField("note", note));
    }
    for (const help of diagnostic.help ?? []) {
      lines.push(formatField("help", help));
    }
    return lines;
  });
}

export function renderInteractiveResponse(response: InteractiveResponse): readonly string[] {
  if (!response.ok) {
    return [
      `error ${response.error.code}`,
      `  ${response.error.message}`,
      ...(response.error.input && response.error.span
        ? formatInteractiveInputSpan(response.error.input, response.error.span)
        : []),
      ...(response.error.suggestions && response.error.suggestions.length > 0
        ? [`  suggestions ${response.error.suggestions.join(", ")}`]
        : []),
    ];
  }
  const detailed = renderInteractiveResult(response.result);
  if (detailed) {
    return detailed;
  }
  const method = methodFromResult(response.result);
  return [`ok${method ? ` ${method}` : ""}`];
}

function formatInteractiveInputSpan(
  input: string,
  span: { readonly start: number; readonly length: number },
): readonly string[] {
  const start = Math.max(0, Math.min(input.length, span.start));
  const length = Math.max(1, Math.min(input.length - start, span.length));
  return [`  input ${input}`, `${" ".repeat("  input ".length + start)}${"^".repeat(length)}`];
}

function renderInteractiveResult(result: unknown): readonly string[] | undefined {
  if (isSessionHelpResult(result)) {
    return ["ok session.help", ...result.hints.map((hint) => `  ${hint}`)];
  }
  if (isSessionStatusResult(result)) {
    return renderSessionStatusResult(result);
  }
  if (isSessionTimingsResult(result)) {
    return renderSessionTimingsResult(result);
  }
  if (isStyleExplainResult(result)) {
    return renderStyleExplainResult(result);
  }
  if (isDiagnosticExplainResult(result)) {
    return renderDiagnosticExplainResult(result);
  }
  if (isDiagnosticsListResult(result)) {
    return renderDiagnosticsListResult(result);
  }
  if (isComponentInspectResult(result)) {
    return renderComponentInspectResult(result);
  }
  if (isComponentTreeResult(result)) {
    return renderComponentTreeResult(result);
  }
  if (isComponentDiffResult(result)) {
    return renderComponentDiffResult(result);
  }
  if (isPropsDiffResult(result)) {
    return renderPropsDiffResult(result);
  }
  if (isPropsInspectResult(result)) {
    return [
      "ok props.inspect",
      `  target ${result.target}`,
      ...(result.path ? [`  path   ${result.path}`] : []),
      `  value  ${formatInteractiveValue(result.value)}`,
    ];
  }
  if (isProjectionDetailResult(result)) {
    return renderProjectionDetailResult(result);
  }
  if (isProjectionSlideDetailResult(result)) {
    return renderProjectionSlideDetailResult(result);
  }
  if (isProjectionSummaryResult(result)) {
    return renderProjectionSummaryResult(result);
  }
  if (isComponentImpactResult(result)) {
    return [
      "ok component.impact",
      formatField("target", result.target),
      formatField("status", result.status),
      ...(result.diagnostic
        ? [
            formatField(
              "diagnostic",
              `[${result.diagnostic.index}] ${result.diagnostic.code} ${result.diagnostic.title}`,
            ),
          ]
        : []),
      ...(result.reason ? [formatField("reason", result.reason)] : []),
      ...renderComponentImpactSummary(result),
    ];
  }
  if (isSelectionListResult(result)) {
    return renderSelectionListResult(result);
  }
  if (isSelectionResolveResult(result)) {
    return renderSelectionResolveResult(result);
  }
  if (isHistoryChangesResult(result)) {
    return renderHistoryChangesResult(result);
  }
  if (isComponentListResult(result)) {
    return renderComponentListResult(result);
  }
  return undefined;
}

function renderComponentTreeResult(result: ComponentTreeResult): readonly string[] {
  const lines = ["ok component.tree"];
  if (result.status) {
    lines.push(formatField("status", result.status));
  }
  if (result.compilation !== undefined) {
    lines.push(formatField("compilation", String(result.compilation)));
  }
  if (result.items.length === 0) {
    lines.push(formatField("components", "0"));
    return lines;
  }
  const byId = new Map(result.items.map((item) => [item.id, item]));
  const roots = result.items.filter((item) => !item.parentId || !byId.has(item.parentId));
  const visited = new Set<string>();
  for (const root of roots) {
    lines.push(...renderComponentTreeNode(root, byId, visited, 1));
  }
  return lines;
}

function renderComponentListResult(result: ComponentListResult): readonly string[] {
  const lines = [`ok ${result.kind ?? "component.search"}`];
  if (result.items.length === 0) {
    lines.push(formatField("results", "0"));
    return lines;
  }
  lines.push(...result.items.map((item) => `  ${item.name} ${item.id}`));
  return lines;
}

function renderComponentInspectResult(result: ComponentInspectResult): readonly string[] {
  return [
    "ok component.inspect",
    formatField("id", result.id),
    formatField("name", result.name),
    ...(result.source ? [formatField("source", formatComponentSource(result.source))] : []),
    formatField("props", formatPropsSummary(result.propsSummary)),
    ...(result.childIds.length > 0 ? [formatField("children", result.childIds.join(", "))] : []),
    ...(result.graphNodeIds.length > 0
      ? [formatField("graph nodes", result.graphNodeIds.join(", "))]
      : []),
    ...result.diagnostics.map((diagnostic) =>
      formatField("diagnostic", `[${diagnostic.index}] ${diagnostic.code} ${diagnostic.title}`),
    ),
    formatField(
      "impact",
      `${result.impact.status}, ${result.impact.elementCount} ${result.impact.elementCount === 1 ? "element" : "elements"}`,
    ),
    ...(result.impact.reason ? [formatField("reason", result.impact.reason)] : []),
    ...result.hints.map((hint) => formatField("see", hint)),
  ];
}

function renderComponentImpactSummary(result: ComponentImpactResult): readonly string[] {
  const graphNodeIds = result.graphNodeIds ?? [];
  const elements = result.elements ?? [];
  if (graphNodeIds.length === 0 && elements.length === 0) {
    return [];
  }
  return [
    formatField(
      "summary",
      `${pluralCount(graphNodeIds.length, "graph node")}, ${pluralCount(uniqueSlideCount(elements), "slide")}, ${pluralCount(elements.length, "projection element")}`,
    ),
    ...(graphNodeIds.length > 0 ? [formatField("graph", graphNodeIds.join(", "))] : []),
    ...(result.components && result.components.length > 0
      ? [
          formatField(
            "component",
            result.components.map((component) => `${component.name} ${component.id}`).join(", "),
          ),
        ]
      : []),
    ...elements.map((element) =>
      formatField(
        "chain",
        `${result.target} -> ${impactElementGraphNodeLabel(element, graphNodeIds)} -> ${projectionElementLabel(element)}`,
      ),
    ),
    ...elements.map((element) =>
      formatField(
        "output",
        `${projectionElementLabel(element)} ${formatInteractiveValue(element.element)}`,
      ),
    ),
  ];
}

function uniqueSlideCount(
  elements: readonly { readonly slot: number; readonly slideIndex: number }[],
): number {
  return new Set(elements.map((element) => `${element.slot}:${element.slideIndex}`)).size;
}

function projectionElementLabel(element: {
  readonly slot: number;
  readonly slideIndex: number;
  readonly elementIndex: number;
}): string {
  return `@${element.slot} slide ${element.slideIndex} element ${element.elementIndex}`;
}

function impactElementGraphNodeLabel(
  element: { readonly element: unknown },
  graphNodeIds: readonly string[],
): string {
  const elementGraphNodeIds = graphNodeIdsFromProjectionElement(element.element);
  return (
    elementGraphNodeIds.find((id) => graphNodeIds.includes(id)) ??
    graphNodeIds[0] ??
    "(graph unavailable)"
  );
}

function graphNodeIdsFromProjectionElement(element: unknown): readonly string[] {
  if (!isRecord(element)) {
    return [];
  }
  const origin = element.origin;
  if (!isRecord(origin) || !Array.isArray(origin.graphNodeIds)) {
    return [];
  }
  return origin.graphNodeIds.filter((id): id is string => typeof id === "string");
}

function pluralCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function renderDiagnosticExplainResult(result: DiagnosticExplainResult): readonly string[] {
  return [
    "ok diagnostics.explain",
    formatField("index", String(result.index)),
    ...formatDeckjsxNodeDiagnostics([result.diagnostic]),
    ...result.relatedComponents.flatMap((component) => [
      formatField("component", `${component.name} ${component.id}`),
      formatField(
        "impact",
        `${component.impact.status}, ${component.impact.elementCount} ${component.impact.elementCount === 1 ? "element" : "elements"}`,
      ),
      ...(component.impact.reason ? [formatField("reason", component.impact.reason)] : []),
    ]),
    ...(result.inspection
      ? [
          formatField("context", formatDiagnosticInspectionContext(result.inspection)),
          ...(result.inspection.reason ? [formatField("reason", result.inspection.reason)] : []),
        ]
      : []),
    ...result.hints.map((hint) => formatField("see", hint)),
  ];
}

function renderDiagnosticsListResult(result: DiagnosticsListResult): readonly string[] {
  return [
    "ok diagnostics.list",
    ...(result.compilation !== undefined
      ? [formatField("compilation", String(result.compilation))]
      : []),
    ...(result.items.length === 0
      ? [formatField("diagnostics", "0")]
      : result.items.map(
          (item) =>
            `  [${item.index}] ${item.severity.padEnd(8)}${item.code} ${item.title}${item.phase ? ` (${item.phase})` : ""}`,
        )),
  ];
}

function renderSessionStatusResult(result: SessionStatusResult): readonly string[] {
  return [
    "ok session.status",
    formatField("compiler", formatCompilerStatus(result)),
    ...(result.lastCompilation !== undefined
      ? [formatField("last", `compilation ${result.lastCompilation}`)]
      : []),
    ...(result.lastSuccessfulCompilation !== undefined
      ? [formatField("success", `compilation ${result.lastSuccessfulCompilation}`)]
      : []),
    formatField("skipped", pluralCount(result.skippedFailedAttempts, "failed attempt")),
  ];
}

function formatCompilerStatus(result: SessionStatusResult): string {
  if (result.compilerClosed) {
    return "closed";
  }
  return result.compilerStarted ? "running" : "idle";
}

function renderSessionTimingsResult(result: SessionTimingsResult): readonly string[] {
  return [
    "ok session.timings",
    ...(result.compilerUptimeMs !== undefined
      ? [formatField("uptime", formatMilliseconds(result.compilerUptimeMs))]
      : []),
    ...(result.lastCompilationDurationMs !== undefined
      ? [formatField("compile", formatMilliseconds(result.lastCompilationDurationMs))]
      : []),
    formatField("commands", String(result.commandCount)),
    ...(result.lastCommandLatencyMs !== undefined
      ? [formatField("latency", formatMilliseconds(result.lastCommandLatencyMs))]
      : []),
  ];
}

function formatMilliseconds(value: number): string {
  return `${value}ms`;
}

function formatDiagnosticInspectionContext(
  inspection: DiagnosticExplainResult["inspection"],
): string {
  if (!inspection || inspection.status === "unavailable") {
    return "inspection unavailable";
  }
  return `inspection ${inspection.status} at ${inspection.boundary} (${inspection.devStatus}, compilation ${inspection.compilation})`;
}

function formatComponentSource(source: NonNullable<ComponentInspectResult["source"]>): string {
  return [
    source.file,
    source.line !== undefined ? String(source.line) : undefined,
    source.column !== undefined ? String(source.column) : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(":");
}

function formatPropsSummary(propsSummary: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(propsSummary);
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}=${formatInteractiveValue(value)}`).join(", ")
    : "(none)";
}

function renderComponentTreeNode(
  item: ComponentListItem,
  byId: ReadonlyMap<string, ComponentListItem>,
  visited: Set<string>,
  depth: number,
): readonly string[] {
  if (visited.has(item.id)) {
    return [];
  }
  visited.add(item.id);
  const indent = "  ".repeat(depth);
  return [
    `${indent}${item.name} ${item.id}`,
    ...item.childIds.flatMap((childId) => {
      const child = byId.get(childId);
      return child ? renderComponentTreeNode(child, byId, visited, depth + 1) : [];
    }),
  ];
}

function renderPropsDiffResult(result: PropsDiffResult): readonly string[] {
  return ["ok props.diff", `  target ${result.target}`, ...renderDiffChanges(result.changes)];
}

function renderProjectionDetailResult(result: ProjectionDetailResult): readonly string[] {
  return [
    "ok projection.inspect",
    formatField("slot", String(result.slot)),
    formatField("slide", String(result.slideIndex)),
    formatField("element", String(result.elementIndex)),
    formatField("value", formatInteractiveValue(result.element)),
  ];
}

function renderProjectionSummaryResult(result: ProjectionSummaryResult): readonly string[] {
  return [
    "ok projection.inspect",
    formatField("slot", String(result.slot)),
    formatField("format", result.format),
    formatField("slides", String(result.slides.length)),
    ...result.slides.map(formatProjectionSlideSummary),
  ];
}

function formatProjectionSlideSummary(slide: ProjectionSlideSummary): string {
  const label = slide.name ?? `slide ${slide.slideIndex}`;
  const location = slide.path ?? slide.partId ?? "(unknown part)";
  return `  [${slide.slideIndex}] ${label} ${location} ${pluralCount(slide.elementCount, "element")}`;
}

function renderProjectionSlideDetailResult(result: ProjectionSlideDetailResult): readonly string[] {
  return [
    "ok projection.inspect",
    formatField("slot", String(result.slot)),
    formatField("slide", String(result.slideIndex)),
    ...(result.slide.name ? [formatField("name", result.slide.name)] : []),
    ...(result.slide.path ? [formatField("path", result.slide.path)] : []),
    formatField("elements", String(result.slide.elementCount)),
  ];
}

function renderSelectionListResult(result: SelectionListResult): readonly string[] {
  const lines = ["ok selection.list"];
  if (result.items.length === 0) {
    lines.push(formatField("handles", "0"));
    return lines;
  }
  lines.push(
    ...result.items.map((item) =>
      formatField(item.handle, item.available ? formatSelectionValue(item.value) : "unavailable"),
    ),
  );
  return lines;
}

function renderSelectionResolveResult(result: SelectionResolveResult): readonly string[] {
  return [
    "ok selection.resolve",
    formatField("handle", result.handle),
    formatField("value", formatSelectionValue(result.value)),
  ];
}

function renderHistoryChangesResult(result: HistoryChangesResult): readonly string[] {
  return [
    "ok history.changes",
    formatField("from", `compilation ${result.fromCompilation}`),
    formatField("to", `compilation ${result.toCompilation}`),
    formatField("skipped", pluralCount(result.skippedFailedAttempts, "failed attempt")),
    ...(result.changedSourceIds.length > 0
      ? result.changedSourceIds.map((sourceId) => formatField("changed", sourceId))
      : [formatField("changed", "(none)")]),
  ];
}

function formatSelectionValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  if (
    isRecord(value) &&
    value.kind === "component.inspect" &&
    typeof value.name === "string" &&
    typeof value.id === "string"
  ) {
    return `component.inspect ${value.name} ${value.id}`;
  }
  return formatInteractiveValue(value);
}

function renderComponentDiffResult(result: ComponentDiffResult): readonly string[] {
  return [
    "ok component.diff",
    ...(result.target ? [`  target ${result.target}`] : []),
    ...renderDiffChanges(result.changes),
  ];
}

function renderDiffChanges(
  changes: readonly {
    readonly path: string;
    readonly before?: unknown;
    readonly after?: unknown;
  }[],
): readonly string[] {
  if (changes.length === 0) {
    return [formatField("changes", "0")];
  }
  return changes.flatMap((change) => [
    `  ${change.path}`,
    `    before ${formatInteractiveValue(change.before)}`,
    `    after  ${formatInteractiveValue(change.after)}`,
  ]);
}

function renderStyleExplainResult(result: StyleExplainResult): readonly string[] {
  const trace = result.trace;
  const style = result.style;
  return [
    "ok style.explain",
    formatField("node", result.nodeId),
    formatField("source", result.sourceKey),
    formatField("slot", String(result.slot)),
    ...(trace
      ? [
          `  ${result.property ?? trace.property ?? "style"}`,
          ...(trace.candidates ?? []).map((candidate) => {
            const marker = candidate.applied ? "*" : "x";
            return `    ${marker} ${String(candidate.value).padEnd(5)} ${styleCandidateSource(candidate.source)}`;
          }),
        ]
      : [
          formatField("style", formatStyleSummary(style)),
          ...(result.properties?.length
            ? [formatField("properties", result.properties.join(", "))]
            : []),
          ...(result.hints ?? []).map((hint) => formatField("see", hint)),
        ]),
  ];
}

function formatStyleSummary(style: unknown): string {
  if (!isRecord(style)) {
    return formatInteractiveValue(style);
  }
  return Object.entries(style)
    .map(([key, value]) => `${key}=${formatInteractiveValue(value)}`)
    .join(", ");
}

function styleCandidateSource(source: unknown): string {
  if (!isRecord(source)) {
    return "unknown";
  }
  const layer = typeof source.layer === "string" ? source.layer : "unknown";
  const className = typeof source.className === "string" ? ` .${source.className}` : "";
  return `${layer}${className}`;
}

function formatDiagnosticSourceSnippet(diagnostic: DeckjsxDevDiagnostic):
  | {
      readonly lines: readonly string[];
      readonly consumedLabel: boolean;
    }
  | undefined {
  if (!diagnostic.primary?.sourceLine) {
    return undefined;
  }

  const line = diagnostic.primary.line ?? 1;
  const column = Math.max(1, diagnostic.primary.column ?? 1);
  const spanLength = Math.max(1, diagnostic.primary.spanLength ?? 1);
  const label = diagnostic.labels?.[0]?.message;
  const lineNumber = String(line);
  const gutter = " ".repeat(lineNumber.length);
  const caret = `${" ".repeat(column - 1)}${"^".repeat(spanLength)}${label ? ` ${label}` : ""}`;
  return {
    lines: [`${lineNumber} | ${diagnostic.primary.sourceLine}`, `${gutter} | ${caret}`],
    consumedLabel: label !== undefined,
  };
}

function formatField(label: string, value: string): string {
  return `  ${label.padEnd(12)}${value}`;
}

function methodFromResult(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("method" in result)) {
    return inferredMethodFromResult(result);
  }
  const method = (result as { readonly method?: unknown }).method;
  return typeof method === "string" ? method : undefined;
}

function inferredMethodFromResult(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  if (isComponentTreeResult(result)) {
    return "component.tree";
  }
  if (isPropsDiffResult(result)) {
    return "props.diff";
  }
  if (isPropsInspectResult(result)) {
    return "props.inspect";
  }
  if ("commands" in result) {
    return "session.help";
  }
  if ("compilerStarted" in result && "compilerClosed" in result) {
    return "session.status";
  }
  if ("compilerUptimeMs" in result || "lastCompilationDurationMs" in result) {
    return "session.timings";
  }
  if ("format" in result && "slides" in result) {
    return "projection.inspect";
  }
  if (isProjectionDetailResult(result)) {
    return "projection.inspect";
  }
  if ("handle" in result && "value" in result) {
    return "selection.resolve";
  }
  return undefined;
}

type ComponentListItem = {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
};

type ComponentListResult = {
  readonly kind?: "component.search" | "component.filter";
  readonly items: readonly ComponentListItem[];
};

type ComponentInspectResult = {
  readonly kind: "component.inspect";
  readonly id: string;
  readonly name: string;
  readonly source?: {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
  };
  readonly propsSummary: Readonly<Record<string, unknown>>;
  readonly childIds: readonly string[];
  readonly graphNodeIds: readonly string[];
  readonly diagnostics: readonly {
    readonly index: number;
    readonly code: string;
    readonly title: string;
  }[];
  readonly impact: {
    readonly status: string;
    readonly elementCount: number;
    readonly reason?: string;
  };
  readonly hints: readonly string[];
};

type DiagnosticExplainResult = {
  readonly kind: "diagnostics.explain";
  readonly index: number;
  readonly diagnostic: DeckjsxDevDiagnostic;
  readonly relatedComponents: readonly {
    readonly id: string;
    readonly name: string;
    readonly impact: {
      readonly status: string;
      readonly elementCount: number;
      readonly reason?: string;
    };
  }[];
  readonly inspection?: {
    readonly status: string;
    readonly compilation?: number;
    readonly devStatus?: string;
    readonly boundary?: string;
    readonly componentCount?: number;
    readonly reason?: string;
  };
  readonly hints: readonly string[];
};

type DiagnosticsListResult = {
  readonly compilation?: number;
  readonly items: readonly {
    readonly index: number;
    readonly severity: string;
    readonly code: string;
    readonly title: string;
    readonly phase?: string;
  }[];
};

type SessionHelpResult = {
  readonly kind: "session.help";
  readonly title: string;
  readonly hints: readonly string[];
};

type SessionStatusResult = {
  readonly compilerStarted: boolean;
  readonly compilerClosed: boolean;
  readonly lastCompilation?: number;
  readonly lastSuccessfulCompilation?: number;
  readonly skippedFailedAttempts: number;
};

type SessionTimingsResult = {
  readonly compilerUptimeMs?: number;
  readonly lastCompilationDurationMs?: number;
  readonly commandCount: number;
  readonly lastCommandLatencyMs?: number;
};

type ComponentTreeResult = {
  readonly status?: string;
  readonly compilation?: number;
  readonly items: readonly ComponentListItem[];
};

type PropsDiffResult = {
  readonly target: string;
  readonly path?: string;
  readonly changes: readonly {
    readonly path: string;
    readonly before?: unknown;
    readonly after?: unknown;
  }[];
};

type ComponentDiffResult = {
  readonly kind: "component.diff";
  readonly target?: string;
  readonly changes: readonly {
    readonly path: string;
    readonly before?: unknown;
    readonly after?: unknown;
  }[];
};

type PropsInspectResult = {
  readonly target: string;
  readonly path?: string;
  readonly value: unknown;
};

type ProjectionDetailResult = {
  readonly slot: number;
  readonly slideIndex: number;
  readonly elementIndex: number;
  readonly element: unknown;
};

type ProjectionSummaryResult = {
  readonly slot: number;
  readonly format: string;
  readonly slides: readonly ProjectionSlideSummary[];
};

type ProjectionSlideDetailResult = {
  readonly slot: number;
  readonly slideIndex: number;
  readonly slide: ProjectionSlideSummary;
};

type ProjectionSlideSummary = {
  readonly slideIndex: number;
  readonly partId?: string;
  readonly path?: string;
  readonly slideId?: string;
  readonly name?: string;
  readonly origin?: unknown;
  readonly elementCount: number;
};

type SelectionListResult = {
  readonly kind: "selection.list";
  readonly items: readonly {
    readonly handle: "$0" | "$1" | "$2" | "$$";
    readonly available: boolean;
    readonly value?: unknown;
  }[];
};

type SelectionResolveResult = {
  readonly handle: "$0" | "$1" | "$2" | "$$";
  readonly value: unknown;
};

type HistoryChangesResult = {
  readonly fromCompilation: number;
  readonly toCompilation: number;
  readonly skippedFailedAttempts: number;
  readonly changedSourceIds: readonly string[];
};

type ComponentImpactResult = {
  readonly target: string;
  readonly status: string;
  readonly reason?: string;
  readonly diagnostic?: {
    readonly index: number;
    readonly code: string;
    readonly title: string;
  };
  readonly graphNodeIds?: readonly string[];
  readonly components?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly elements?: readonly {
    readonly slot: number;
    readonly slideIndex: number;
    readonly elementIndex: number;
    readonly element: unknown;
  }[];
};

type StyleExplainResult = {
  readonly nodeId: string;
  readonly sourceKey: string;
  readonly slot: number;
  readonly property?: string;
  readonly style?: unknown;
  readonly properties?: readonly string[];
  readonly hints?: readonly string[];
  readonly trace?: {
    readonly property?: string;
    readonly candidates?: readonly {
      readonly value?: unknown;
      readonly source?: unknown;
      readonly applied?: boolean;
    }[];
  };
};

function isComponentTreeResult(value: unknown): value is ComponentTreeResult {
  if (!isRecord(value) || typeof value.status !== "string" || !Array.isArray(value.items)) {
    return false;
  }
  return value.items.every(isComponentListItem);
}

function isStyleExplainResult(value: unknown): value is StyleExplainResult {
  return (
    isRecord(value) &&
    value.kind === "style.explain" &&
    typeof value.nodeId === "string" &&
    typeof value.sourceKey === "string" &&
    typeof value.slot === "number" &&
    ("trace" in value || "style" in value || "propertyTraces" in value) &&
    (!("properties" in value) ||
      (Array.isArray(value.properties) &&
        value.properties.every((property) => typeof property === "string"))) &&
    (!("hints" in value) ||
      (Array.isArray(value.hints) && value.hints.every((hint) => typeof hint === "string")))
  );
}

function isComponentInspectResult(value: unknown): value is ComponentInspectResult {
  return (
    isRecord(value) &&
    value.kind === "component.inspect" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(value.propsSummary) &&
    Array.isArray(value.childIds) &&
    value.childIds.every((childId) => typeof childId === "string") &&
    Array.isArray(value.graphNodeIds) &&
    value.graphNodeIds.every((graphNodeId) => typeof graphNodeId === "string") &&
    Array.isArray(value.diagnostics) &&
    isRecord(value.impact) &&
    typeof value.impact.status === "string" &&
    typeof value.impact.elementCount === "number" &&
    Array.isArray(value.hints) &&
    value.hints.every((hint) => typeof hint === "string")
  );
}

function isDiagnosticExplainResult(value: unknown): value is DiagnosticExplainResult {
  return (
    isRecord(value) &&
    value.kind === "diagnostics.explain" &&
    typeof value.index === "number" &&
    isRecord(value.diagnostic) &&
    Array.isArray(value.relatedComponents) &&
    value.relatedComponents.every(
      (component) =>
        isRecord(component) &&
        typeof component.id === "string" &&
        typeof component.name === "string" &&
        isRecord(component.impact) &&
        typeof component.impact.status === "string" &&
        typeof component.impact.elementCount === "number",
    ) &&
    (!("inspection" in value) ||
      (isRecord(value.inspection) && typeof value.inspection.status === "string")) &&
    Array.isArray(value.hints) &&
    value.hints.every((hint) => typeof hint === "string")
  );
}

function isDiagnosticsListResult(value: unknown): value is DiagnosticsListResult {
  return (
    isRecord(value) &&
    (!("kind" in value) || value.kind === "diagnostics.list") &&
    !("status" in value) &&
    (!("compilation" in value) || typeof value.compilation === "number") &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.index === "number" &&
        typeof item.severity === "string" &&
        typeof item.code === "string" &&
        typeof item.title === "string" &&
        (!("phase" in item) || typeof item.phase === "string"),
    )
  );
}

function isSessionHelpResult(value: unknown): value is SessionHelpResult {
  return (
    isRecord(value) &&
    value.kind === "session.help" &&
    typeof value.title === "string" &&
    Array.isArray(value.hints) &&
    value.hints.every((hint) => typeof hint === "string")
  );
}

function isSessionStatusResult(value: unknown): value is SessionStatusResult {
  return (
    isRecord(value) &&
    typeof value.compilerStarted === "boolean" &&
    typeof value.compilerClosed === "boolean" &&
    typeof value.skippedFailedAttempts === "number" &&
    (!("lastCompilation" in value) || typeof value.lastCompilation === "number") &&
    (!("lastSuccessfulCompilation" in value) || typeof value.lastSuccessfulCompilation === "number")
  );
}

function isSessionTimingsResult(value: unknown): value is SessionTimingsResult {
  return (
    isRecord(value) &&
    typeof value.commandCount === "number" &&
    (!("compilerUptimeMs" in value) || typeof value.compilerUptimeMs === "number") &&
    (!("lastCompilationDurationMs" in value) ||
      typeof value.lastCompilationDurationMs === "number") &&
    (!("lastCommandLatencyMs" in value) || typeof value.lastCommandLatencyMs === "number")
  );
}

function isComponentListResult(value: unknown): value is ComponentListResult {
  return (
    isRecord(value) &&
    (!("kind" in value) ||
      value.kind === "component.search" ||
      value.kind === "component.filter") &&
    Array.isArray(value.items) &&
    value.items.every(isComponentListItem)
  );
}

function isComponentListItem(value: unknown): value is ComponentListItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.childIds) &&
    value.childIds.every((childId) => typeof childId === "string")
  );
}

function isPropsDiffResult(value: unknown): value is PropsDiffResult {
  return (
    isRecord(value) &&
    value.kind !== "component.diff" &&
    typeof value.target === "string" &&
    Array.isArray(value.changes) &&
    value.changes.every((change) => isRecord(change) && typeof change.path === "string")
  );
}

function isComponentDiffResult(value: unknown): value is ComponentDiffResult {
  return (
    isRecord(value) &&
    value.kind === "component.diff" &&
    Array.isArray(value.changes) &&
    value.changes.every((change) => isRecord(change) && typeof change.path === "string")
  );
}

function isPropsInspectResult(value: unknown): value is PropsInspectResult {
  return isRecord(value) && typeof value.target === "string" && "value" in value;
}

function isProjectionDetailResult(value: unknown): value is ProjectionDetailResult {
  return (
    isRecord(value) &&
    typeof value.slot === "number" &&
    typeof value.slideIndex === "number" &&
    typeof value.elementIndex === "number" &&
    "element" in value
  );
}

function isProjectionSummaryResult(value: unknown): value is ProjectionSummaryResult {
  return (
    isRecord(value) &&
    typeof value.slot === "number" &&
    typeof value.format === "string" &&
    Array.isArray(value.slides) &&
    value.slides.every(isProjectionSlideSummary)
  );
}

function isProjectionSlideDetailResult(value: unknown): value is ProjectionSlideDetailResult {
  return (
    isRecord(value) &&
    typeof value.slot === "number" &&
    typeof value.slideIndex === "number" &&
    isProjectionSlideSummary(value.slide)
  );
}

function isProjectionSlideSummary(value: unknown): value is ProjectionSlideSummary {
  return (
    isRecord(value) &&
    typeof value.slideIndex === "number" &&
    typeof value.elementCount === "number" &&
    (!("partId" in value) || typeof value.partId === "string") &&
    (!("path" in value) || typeof value.path === "string") &&
    (!("slideId" in value) || typeof value.slideId === "string") &&
    (!("name" in value) || typeof value.name === "string")
  );
}

function isSelectionListResult(value: unknown): value is SelectionListResult {
  return (
    isRecord(value) &&
    value.kind === "selection.list" &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        isSelectionHandleLabel(item.handle) &&
        typeof item.available === "boolean",
    )
  );
}

function isSelectionResolveResult(value: unknown): value is SelectionResolveResult {
  return isRecord(value) && isSelectionHandleLabel(value.handle) && "value" in value;
}

function isHistoryChangesResult(value: unknown): value is HistoryChangesResult {
  return (
    isRecord(value) &&
    typeof value.fromCompilation === "number" &&
    typeof value.toCompilation === "number" &&
    typeof value.skippedFailedAttempts === "number" &&
    Array.isArray(value.changedSourceIds) &&
    value.changedSourceIds.every((sourceId) => typeof sourceId === "string")
  );
}

function isSelectionHandleLabel(value: unknown): value is "$0" | "$1" | "$2" | "$$" {
  return value === "$0" || value === "$1" || value === "$2" || value === "$$";
}

function isComponentImpactResult(value: unknown): value is ComponentImpactResult {
  return (
    isRecord(value) &&
    typeof value.target === "string" &&
    typeof value.status === "string" &&
    (!("elements" in value) || Array.isArray(value.elements))
  );
}

function formatInteractiveValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value, circularJsonReplacer());
}

function circularJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (typeof value !== "object" || value === null) {
      return value;
    }
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    return value;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatTime(): string {
  return new Date().toLocaleTimeString();
}

import type { DeckjsxDevCompiler, DeckjsxDevCompilerEvent } from "../dev-compiler";
import type { DeckjsxDevCompilationResult } from "../dev-compilation";
import type { DeckjsxDevDiagnostic } from "../dev-diagnostics";
import type {
  IncrementalArtifactGraphNodeInspection,
  IncrementalArtifactProjectionInspection,
  IncrementalArtifactSession,
} from "deckjsx/integration";

export type InteractiveCommand = {
  readonly method: string;
  readonly params?: unknown;
};

export type InteractiveError = {
  readonly code: string;
  readonly message: string;
};

export type InteractiveResponse =
  | {
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly ok: false;
      readonly error: InteractiveError;
    };

export type InteractiveDevSession = {
  dispatch(command: InteractiveCommand): Promise<InteractiveResponse>;
  close(): void;
};

type InteractiveSessionState = {
  compilerStarted: boolean;
  compilerClosed: boolean;
  lastCompilation?: number;
  lastSuccessfulCompilation?: number;
  previousSuccessful?: InteractiveSuccessfulCompilationSnapshot;
  latestSuccessful?: InteractiveSuccessfulCompilationSnapshot;
  failedAttemptsSinceLastSuccess: number;
  skippedFailedAttemptsForLatestSuccess: number;
  skippedFailedAttempts: number;
  latestDiagnosticsCompilation?: number;
  latestDiagnostics: readonly DeckjsxDevDiagnostic[];
  selectionHistory: unknown[];
  lastResultList?: readonly unknown[];
  compilerStartedAtMs?: number;
  lastCompilationStartedAtMs?: number;
  lastCompilationDurationMs?: number;
  commandCount: number;
  lastCommandLatencyMs?: number;
};

type InteractiveSuccessfulCompilationSnapshot = {
  readonly compilation: number;
  readonly changedSourceIds: readonly string[];
};

const INTERACTIVE_COMMAND_HELP = [
  {
    method: "session.help",
    shorthand: "help",
    description: "List available interactive commands.",
  },
  {
    method: "session.status",
    shorthand: "status",
    description: "Show compiler and latest compilation status.",
  },
  {
    method: "session.timings",
    shorthand: "timings",
    description: "Show compiler and interactive command timings.",
  },
  {
    method: "diagnostics.list",
    shorthand: "diagnostics",
    description: "List diagnostics from the latest compilation.",
  },
  {
    method: "diagnostics.explain",
    shorthand: "diagnostic <index>",
    description: "Show one diagnostic with details.",
  },
  {
    method: "history.changes",
    shorthand: "history changes",
    description: "Compare the latest successful artifact update with the previous one.",
  },
  {
    method: "style.explain",
    shorthand: "style <nodeId> [property]",
    description: "Explain resolved style or one style property for an artifact graph node.",
  },
  {
    method: "component.stack",
    shorthand: "component <nodeId>",
    description: "Show component provenance for an artifact graph node.",
  },
  {
    method: "projection.inspect",
    shorthand: "projection [@slot] [slideIndex] [elementIndex]",
    description: "Inspect retained PPTX projection slides and elements.",
  },
  {
    method: "selection.resolve",
    shorthand: "$0 | $1 | $2 | $$",
    description: "Resolve recent interactive selections and result lists.",
  },
] as const;

export function createInteractiveDevSession(input: {
  readonly compiler: DeckjsxDevCompiler;
  readonly artifactSession?: IncrementalArtifactSession;
  readonly now?: () => number;
}): InteractiveDevSession {
  const now = input.now ?? (() => Date.now());
  const state: InteractiveSessionState = {
    compilerStarted: false,
    compilerClosed: false,
    failedAttemptsSinceLastSuccess: 0,
    skippedFailedAttemptsForLatestSuccess: 0,
    skippedFailedAttempts: 0,
    latestDiagnostics: [],
    selectionHistory: [],
    commandCount: 0,
  };
  const unsubscribe = input.compiler.on((event) => {
    applyCompilerEvent(state, event, now);
  });

  return {
    async dispatch(command) {
      const startedAt = now();
      const response = await dispatchInteractiveCommand(
        state,
        input.artifactSession,
        command,
        now,
        startedAt,
      );
      if (command.method !== "session.timings") {
        state.commandCount += 1;
        state.lastCommandLatencyMs = now() - startedAt;
      }
      return response;
    },
    close() {
      unsubscribe();
    },
  };
}

async function dispatchInteractiveCommand(
  state: InteractiveSessionState,
  artifactSession: IncrementalArtifactSession | undefined,
  command: InteractiveCommand,
  now: () => number,
  observedAtMs: number,
): Promise<InteractiveResponse> {
  if (command.method === "session.status") {
    return { ok: true, result: statusView(state) };
  }

  if (command.method === "session.help") {
    return { ok: true, result: { commands: INTERACTIVE_COMMAND_HELP } };
  }

  if (command.method === "session.timings") {
    return { ok: true, result: timingsView(state, () => observedAtMs) };
  }

  if (command.method === "history.changes") {
    if (!state.previousSuccessful || !state.latestSuccessful) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.historyUnavailable",
          message: "history.changes requires at least two successful artifact updates.",
        },
      };
    }
    const result = {
      fromCompilation: state.previousSuccessful.compilation,
      toCompilation: state.latestSuccessful.compilation,
      skippedFailedAttempts: state.skippedFailedAttemptsForLatestSuccess,
      changedSourceIds: state.latestSuccessful.changedSourceIds,
    };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "selection.resolve") {
    const handle = selectionHandleFromParams(command.params);
    if (!handle) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.invalidSelectionHandle",
          message: "selection.resolve requires params.handle to be one of $0, $1, $2, or $$.",
        },
      };
    }
    const value = resolveSelectionHandle(state, handle);
    if (value === undefined) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.selectionUnavailable",
          message: `Selection handle is not available: ${handle}`,
        },
      };
    }
    return { ok: true, result: { handle, value } };
  }

  if (command.method === "diagnostics.list") {
    const result = {
      ...(state.latestDiagnosticsCompilation !== undefined
        ? { compilation: state.latestDiagnosticsCompilation }
        : {}),
      items: state.latestDiagnostics.map((diagnostic, index) => ({
        index,
        severity: diagnostic.severity,
        code: diagnostic.code,
        title: diagnostic.title,
        ...(diagnostic.phase ? { phase: diagnostic.phase } : {}),
      })),
    };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "diagnostics.explain") {
    const index = diagnosticIndexFromParams(command.params);
    const diagnostic = index === undefined ? undefined : state.latestDiagnostics[index];
    if (index === undefined || !diagnostic) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.diagnosticUnavailable",
          message: "diagnostics.explain requires params.index for an available diagnostic.",
        },
      };
    }
    const result = { index, diagnostic };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "style.explain") {
    const nodeId = nodeIdFromParams(command.params);
    const property = stylePropertyFromParams(command.params);
    const target = nodeId ? artifactNodeTargetFor(artifactSession, nodeId) : undefined;
    const resolved = resolvedStyleView(target?.resolvedStyle);
    const trace = property ? resolved?.propertyTraces[property] : undefined;
    if (!nodeId || !target || !resolved || (property && !trace)) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.styleUnavailable",
          message:
            "style.explain requires params.nodeId for a retained artifact node and an available resolved style trace.",
        },
      };
    }
    const result = {
      nodeId,
      sourceKey: target.sourceKey,
      slot: target.slot,
      ...(property
        ? { property, trace }
        : { style: resolved.style, traces: resolved.propertyTraces }),
    };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.stack") {
    const nodeId = nodeIdFromParams(command.params);
    const target = nodeId ? artifactNodeTargetFor(artifactSession, nodeId) : undefined;
    const stack = componentStackFromNode(target?.node);
    if (!nodeId || !target || !stack) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.componentUnavailable",
          message:
            "component.stack requires params.nodeId for a retained artifact node with component provenance.",
        },
      };
    }
    const result = {
      nodeId,
      sourceKey: target.sourceKey,
      slot: target.slot,
      stack,
    };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "projection.inspect") {
    const params = projectionInspectParamsFrom(command.params);
    if (!params.ok) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.invalidProjectionParams",
          message:
            "projection.inspect numeric params must be non-negative integers, and elementIndex requires slideIndex.",
        },
      };
    }
    const projection = projectionTargetFor(artifactSession, params.value.slot);
    if (!projection) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.projectionUnavailable",
          message: "projection.inspect requires a retained PPTX projection artifact.",
        },
      };
    }
    const result = inspectProjection(
      projection,
      params.value.slideIndex,
      params.value.elementIndex,
    );
    if (!result) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.projectionUnavailable",
          message: "projection.inspect could not find the requested slide or element.",
        },
      };
    }
    rememberSelection(state, result);
    return { ok: true, result };
  }

  return {
    ok: false,
    error: {
      code: "deckjsx.node.interactive.unknownCommand",
      message: `Unknown interactive command: ${command.method}`,
    },
  };
}

type ProjectionInspectParams = {
  readonly slot?: number;
  readonly slideIndex?: number;
  readonly elementIndex?: number;
};

function projectionInspectParamsFrom(
  params: unknown,
): { readonly ok: true; readonly value: ProjectionInspectParams } | { readonly ok: false } {
  if (params === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof params !== "object" || params === null) {
    return { ok: false };
  }
  const slot = optionalNonNegativeIntegerParam(params, "slot");
  const slideIndex = optionalNonNegativeIntegerParam(params, "slideIndex");
  const elementIndex = optionalNonNegativeIntegerParam(params, "elementIndex");
  if (!slot.ok || !slideIndex.ok || !elementIndex.ok) {
    return { ok: false };
  }
  if (elementIndex.value !== undefined && slideIndex.value === undefined) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      ...(slot.value !== undefined ? { slot: slot.value } : {}),
      ...(slideIndex.value !== undefined ? { slideIndex: slideIndex.value } : {}),
      ...(elementIndex.value !== undefined ? { elementIndex: elementIndex.value } : {}),
    },
  };
}

function optionalNonNegativeIntegerParam(
  params: object,
  key: string,
): { readonly ok: true; readonly value?: number } | { readonly ok: false } {
  if (!Object.prototype.hasOwnProperty.call(params, key)) {
    return { ok: true };
  }
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? { ok: true, value }
    : { ok: false };
}

function nodeIdFromParams(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || !("nodeId" in params)) {
    return undefined;
  }
  return typeof params.nodeId === "string" ? params.nodeId : undefined;
}

function stylePropertyFromParams(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || !("property" in params)) {
    return undefined;
  }
  return typeof params.property === "string" ? params.property : undefined;
}

function artifactNodeTargetFor(
  artifactSession: IncrementalArtifactSession | undefined,
  nodeId: string,
):
  | {
      readonly slot: number;
      readonly sourceKey: string;
      readonly node: unknown;
      readonly resolvedStyle: IncrementalArtifactGraphNodeInspection["resolvedStyle"];
    }
  | undefined {
  const target = artifactSession?.inspectArtifacts().graphNode(nodeId);
  if (target) {
    return {
      slot: target.slot,
      sourceKey: target.sourceKey,
      node: target.node,
      resolvedStyle: target.resolvedStyle,
    };
  }
  return undefined;
}

function projectionTargetFor(
  artifactSession: IncrementalArtifactSession | undefined,
  slot: number | undefined,
): { readonly slot: number; readonly projection: unknown } | undefined {
  const inspection = artifactSession?.inspectArtifacts();
  if (!inspection) {
    return undefined;
  }
  if (slot !== undefined) {
    const projection = inspection.projectionForSlot(slot);
    return projection === undefined ? undefined : { slot, projection };
  }
  const projection = inspection.firstProjection();
  return projection ? projectionTargetFromInspection(projection) : undefined;
}

function projectionTargetFromInspection(projection: IncrementalArtifactProjectionInspection): {
  readonly slot: number;
  readonly projection: unknown;
} {
  return { slot: projection.slot, projection: projection.projection };
}

function resolvedStyleView(value: unknown):
  | {
      readonly style: unknown;
      readonly propertyTraces: Readonly<Record<string, unknown>>;
    }
  | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const style = propertyValue(value, "style");
  const propertyTraces = propertyValue(value, "propertyTraces");
  return typeof propertyTraces === "object" && propertyTraces !== null
    ? {
        style,
        propertyTraces: propertyTraces as Readonly<Record<string, unknown>>,
      }
    : undefined;
}

function inspectProjection(
  target: { readonly slot: number; readonly projection: unknown },
  slideIndex: number | undefined,
  elementIndex: number | undefined,
): unknown {
  const projection = target.projection;
  const format = propertyValue(projection, "format");
  if (typeof projection !== "object" || projection === null || format !== "pptx") {
    return undefined;
  }
  const slides = propertyValue(projection, "slides");
  if (!Array.isArray(slides)) {
    return undefined;
  }
  if (slideIndex === undefined) {
    return {
      slot: target.slot,
      format,
      slides: slides.map((slide, index) => summarizeProjectionSlide(slide, index)),
    };
  }
  const slide = slides[slideIndex];
  if (!slide) {
    return undefined;
  }
  if (elementIndex === undefined) {
    return { slot: target.slot, slideIndex, slide: summarizeProjectionSlide(slide, slideIndex) };
  }
  const elements = projectionSlideElements(slide);
  const element = elements[elementIndex];
  if (!element) {
    return undefined;
  }
  return {
    slot: target.slot,
    slideIndex,
    elementIndex,
    element: summarizeProjectionElement(element),
  };
}

function summarizeProjectionSlide(slide: unknown, slideIndex: number): unknown {
  const payload = propertyObject(slide, "payload");
  const elements = projectionSlideElements(slide);
  return {
    slideIndex,
    ...(propertyValue(slide, "id") ? { partId: propertyValue(slide, "id") } : {}),
    ...(propertyValue(slide, "path") ? { path: propertyValue(slide, "path") } : {}),
    ...(payload && propertyValue(payload, "slideId")
      ? { slideId: propertyValue(payload, "slideId") }
      : {}),
    ...(payload && propertyValue(payload, "name") ? { name: propertyValue(payload, "name") } : {}),
    ...(propertyValue(slide, "origin") ? { origin: propertyValue(slide, "origin") } : {}),
    elementCount: elements.length,
  };
}

function summarizeProjectionElement(element: unknown): unknown {
  return {
    ...(propertyValue(element, "id") ? { id: propertyValue(element, "id") } : {}),
    ...(propertyValue(element, "kind") ? { kind: propertyValue(element, "kind") } : {}),
    ...(propertyValue(element, "packagePartId")
      ? { packagePartId: propertyValue(element, "packagePartId") }
      : {}),
    ...(propertyValue(element, "origin") ? { origin: propertyValue(element, "origin") } : {}),
    ...(propertyValue(element, "frame") ? { frame: propertyValue(element, "frame") } : {}),
    ...("content" in Object(element) && propertyObject(element, "content")?.text
      ? { textPreview: String(propertyObject(element, "content")?.text).slice(0, 80) }
      : {}),
  };
}

function projectionSlideElements(slide: unknown): readonly unknown[] {
  const payload = propertyObject(slide, "payload");
  const drawing = payload ? propertyObject(payload, "drawing") : undefined;
  const children = drawing ? propertyValue(drawing, "children") : undefined;
  return Array.isArray(children) ? children : [];
}

function propertyObject(value: unknown, key: string): Record<string, unknown> | undefined {
  const property = propertyValue(value, key);
  return typeof property === "object" && property !== null
    ? (property as Record<string, unknown>)
    : undefined;
}

function propertyValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function componentStackFromNode(node: unknown): unknown {
  if (typeof node !== "object" || node === null || !("origin" in node)) {
    return undefined;
  }
  const origin = node.origin;
  if (typeof origin !== "object" || origin === null || !("componentProvenance" in origin)) {
    return undefined;
  }
  const provenance = origin.componentProvenance;
  if (typeof provenance !== "object" || provenance === null || !("stack" in provenance)) {
    return undefined;
  }
  return Array.isArray(provenance.stack) ? provenance.stack : undefined;
}

function diagnosticIndexFromParams(params: unknown): number | undefined {
  if (typeof params !== "object" || params === null || !("index" in params)) {
    return undefined;
  }
  const index = params.index;
  return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : undefined;
}

function selectionHandleFromParams(params: unknown): "$0" | "$1" | "$2" | "$$" | undefined {
  if (typeof params !== "object" || params === null || !("handle" in params)) {
    return undefined;
  }
  const handle = params.handle;
  return handle === "$0" || handle === "$1" || handle === "$2" || handle === "$$"
    ? handle
    : undefined;
}

function rememberSelection(state: InteractiveSessionState, result: unknown): void {
  state.selectionHistory = [result, ...state.selectionHistory].slice(0, 3);
  const resultList = resultListFromInteractiveResult(result);
  if (resultList) {
    state.lastResultList = resultList;
  }
}

function resultListFromInteractiveResult(result: unknown): readonly unknown[] | undefined {
  if (Array.isArray(result)) {
    return result;
  }
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  if ("items" in result && Array.isArray(result.items)) {
    return result.items;
  }
  if ("changedSourceIds" in result && Array.isArray(result.changedSourceIds)) {
    return result.changedSourceIds;
  }
  return undefined;
}

function resolveSelectionHandle(
  state: InteractiveSessionState,
  handle: "$0" | "$1" | "$2" | "$$",
): unknown {
  if (handle === "$$") {
    return state.lastResultList;
  }
  return state.selectionHistory[Number(handle.slice(1))];
}

function applyCompilerEvent(
  state: InteractiveSessionState,
  event: DeckjsxDevCompilerEvent,
  now: () => number,
): void {
  switch (event.type) {
    case "compilerStarted":
      state.compilerStarted = true;
      state.compilerStartedAtMs = now();
      return;
    case "compilerClosed":
      state.compilerClosed = true;
      return;
    case "compilationFinished":
      state.lastCompilation = event.result.compilation;
      if (state.lastCompilationStartedAtMs !== undefined) {
        state.lastCompilationDurationMs = now() - state.lastCompilationStartedAtMs;
      }
      state.latestDiagnosticsCompilation = event.result.compilation;
      state.latestDiagnostics = event.result.diagnostics;
      if (event.result.status === "artifactUpdated") {
        state.previousSuccessful = state.latestSuccessful;
        state.latestSuccessful = successfulSnapshotFromResult(event.result);
        state.lastSuccessfulCompilation = event.result.compilation;
        state.skippedFailedAttemptsForLatestSuccess = state.failedAttemptsSinceLastSuccess;
        state.failedAttemptsSinceLastSuccess = 0;
        state.skippedFailedAttempts = 0;
      } else {
        state.failedAttemptsSinceLastSuccess += 1;
        state.skippedFailedAttempts += 1;
      }
      return;
    case "compilationStarted":
      state.lastCompilationStartedAtMs = now();
      return;
    case "diagnostic":
      return;
  }
}

function successfulSnapshotFromResult(
  result: DeckjsxDevCompilationResult & { readonly status: "artifactUpdated" },
): InteractiveSuccessfulCompilationSnapshot {
  return {
    compilation: result.compilation,
    changedSourceIds: result.sourceSnapshot?.changedSourceIds ?? [],
  };
}

function statusView(state: InteractiveSessionState): {
  readonly compilerStarted: boolean;
  readonly compilerClosed: boolean;
  readonly lastCompilation?: number;
  readonly lastSuccessfulCompilation?: number;
  readonly skippedFailedAttempts: number;
} {
  return {
    compilerStarted: state.compilerStarted,
    compilerClosed: state.compilerClosed,
    ...(state.lastCompilation !== undefined ? { lastCompilation: state.lastCompilation } : {}),
    ...(state.lastSuccessfulCompilation !== undefined
      ? { lastSuccessfulCompilation: state.lastSuccessfulCompilation }
      : {}),
    skippedFailedAttempts: state.skippedFailedAttempts,
  };
}

function timingsView(
  state: InteractiveSessionState,
  now: () => number,
): {
  readonly compilerUptimeMs?: number;
  readonly lastCompilationDurationMs?: number;
  readonly commandCount: number;
  readonly lastCommandLatencyMs?: number;
} {
  return {
    ...(state.compilerStartedAtMs !== undefined
      ? { compilerUptimeMs: now() - state.compilerStartedAtMs }
      : {}),
    ...(state.lastCompilationDurationMs !== undefined
      ? { lastCompilationDurationMs: state.lastCompilationDurationMs }
      : {}),
    commandCount: state.commandCount,
    ...(state.lastCommandLatencyMs !== undefined
      ? { lastCommandLatencyMs: state.lastCommandLatencyMs }
      : {}),
  };
}

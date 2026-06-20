import type { DeckjsxDevCompilerEvent } from "../dev-compiler";
import type { DeckjsxDevCompilationResult } from "../dev-compilation";
import type { DeckjsxDevDiagnostic } from "../dev-diagnostics";
import type { NodeDevComponentSnapshot, NodeDevInspectionStore } from "../dev-inspection-store";
import {
  createInteractiveDiagnosticSnapshot,
  type InteractiveDiagnosticSnapshot,
} from "./diagnostic-snapshot";
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
  readonly suggestions?: readonly string[];
  readonly input?: string;
  readonly span?: {
    readonly start: number;
    readonly length: number;
  };
};

export type InteractiveResponse =
  | {
      readonly ok: true;
      readonly result: InteractiveResult;
    }
  | {
      readonly ok: false;
      readonly error: InteractiveError;
    };

export type InteractiveResult =
  | { readonly kind?: string; readonly [key: string]: unknown }
  | readonly unknown[];

export type InteractiveKindedResult = {
  readonly kind: string;
  readonly [key: string]: unknown;
};

export type InteractiveInspectorModel = {
  dispatch(command: InteractiveCommand): Promise<InteractiveResponse>;
  applyCompilerEvent(event: DeckjsxDevCompilerEvent): void;
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
  diagnostics: InteractiveDiagnosticSnapshot;
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
    method: "component.tree",
    shorthand: "component tree",
    description: "Show the latest inspectable component hierarchy.",
  },
  {
    method: "component.inspect",
    shorthand: "component inspect <target>",
    description: "Inspect one component or related target.",
  },
  {
    method: "component.search",
    shorthand: "component search <query>",
    description: "Search components in the latest inspectable attempt.",
  },
  {
    method: "component.filter",
    shorthand: "component filter <query>",
    description: "Filter the current component result list.",
  },
  {
    method: "component.diff",
    shorthand: "component diff [target]",
    description: "Compare previous and latest inspectable component snapshots.",
  },
  {
    method: "component.impact",
    shorthand: "component impact <target>",
    description: "Show output impact for a component or related target.",
  },
  {
    method: "props.inspect",
    shorthand: "props inspect <target> [path]",
    description: "Inspect sanitized component or authored element props.",
  },
  {
    method: "props.diff",
    shorthand: "props diff <target> [path]",
    description: "Compare previous and latest inspectable props snapshots.",
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
  {
    method: "selection.list",
    shorthand: "selection",
    description: "Show current interactive selection handles.",
  },
] as const;

export function isInteractiveResult(value: unknown): value is InteractiveKindedResult {
  return (
    typeof value === "object" && value !== null && "kind" in value && typeof value.kind === "string"
  );
}

function withInteractiveResultKind<T extends object>(
  kind: string,
  result: T,
): T & InteractiveResult {
  Object.defineProperty(result, "kind", {
    configurable: true,
    enumerable: false,
    value: kind,
    writable: false,
  });
  return result as T & InteractiveResult;
}

export function createInteractiveInspectorModel(input: {
  readonly artifactSession?: IncrementalArtifactSession;
  readonly inspectionStore?: NodeDevInspectionStore;
  readonly diagnostics?: InteractiveDiagnosticSnapshot;
  readonly now?: () => number;
}): InteractiveInspectorModel {
  const now = input.now ?? (() => Date.now());
  const ownsDiagnostics = input.diagnostics === undefined;
  const state: InteractiveSessionState = {
    compilerStarted: false,
    compilerClosed: false,
    failedAttemptsSinceLastSuccess: 0,
    skippedFailedAttemptsForLatestSuccess: 0,
    skippedFailedAttempts: 0,
    diagnostics: input.diagnostics ?? createInteractiveDiagnosticSnapshot(),
    selectionHistory: [],
    commandCount: 0,
  };

  return {
    async dispatch(command) {
      const startedAt = now();
      const response = await dispatchInteractiveCommand(
        state,
        input.artifactSession,
        input.inspectionStore,
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
    applyCompilerEvent(event) {
      if (ownsDiagnostics) {
        state.diagnostics.applyCompilerEvent(event);
      }
      applyCompilerEvent(state, event, now);
    },
  };
}

async function dispatchInteractiveCommand(
  state: InteractiveSessionState,
  artifactSession: IncrementalArtifactSession | undefined,
  inspectionStore: NodeDevInspectionStore | undefined,
  command: InteractiveCommand,
  now: () => number,
  observedAtMs: number,
): Promise<InteractiveResponse> {
  const diagnosticsSnapshot = state.diagnostics.current();
  const latestDiagnostics = diagnosticsSnapshot.diagnostics;
  if (command.method === "session.status") {
    return { ok: true, result: withInteractiveResultKind("session.status", statusView(state)) };
  }

  if (command.method === "session.help") {
    return {
      ok: true,
      result: {
        kind: "session.help",
        title: "Interactive help",
        hints: [
          "Press Tab for contextual command completion.",
          "Run deckjsx dev --interactive-help for the full command reference.",
        ],
      },
    };
  }

  if (command.method === "session.timings") {
    return {
      ok: true,
      result: withInteractiveResultKind(
        "session.timings",
        timingsView(state, () => observedAtMs),
      ),
    };
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
    const result = withInteractiveResultKind("history.changes", {
      fromCompilation: state.previousSuccessful.compilation,
      toCompilation: state.latestSuccessful.compilation,
      skippedFailedAttempts: state.skippedFailedAttemptsForLatestSuccess,
      changedSourceIds: state.latestSuccessful.changedSourceIds,
    });
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "selection.list") {
    return { ok: true, result: selectionListView(state) };
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
    return { ok: true, result: withInteractiveResultKind("selection.resolve", { handle, value }) };
  }

  if (command.method === "diagnostics.list") {
    const result = withInteractiveResultKind("diagnostics.list", {
      ...(diagnosticsSnapshot.compilation !== undefined
        ? { compilation: diagnosticsSnapshot.compilation }
        : {}),
      items: latestDiagnostics.map((diagnostic, index) => ({
        index,
        severity: diagnostic.severity,
        code: diagnostic.code,
        title: diagnostic.title,
        ...(diagnostic.phase ? { phase: diagnostic.phase } : {}),
      })),
    });
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "diagnostics.explain") {
    const index = diagnosticIndexFromParams(command.params);
    const diagnostic = index === undefined ? undefined : latestDiagnostics[index];
    if (index === undefined || !diagnostic) {
      return {
        ok: false,
        error: {
          code: "deckjsx.node.interactive.diagnosticUnavailable",
          message: "diagnostics.explain requires params.index for an available diagnostic.",
        },
      };
    }
    const result = diagnosticExplainView(index, diagnostic, inspectionStore, artifactSession);
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.tree") {
    const result = withInteractiveResultKind("component.tree", {
      ...(inspectionStore?.componentTree() ?? { status: "unavailable", items: [] }),
    });
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.inspect") {
    const target = targetFromParams(state, command.params);
    const resolvedTarget = target
      ? inspectionStore?.inspectComponent(target)
        ? target
        : (resolveProjectionComponentTarget(target, artifactSession, inspectionStore) ??
          resolveGraphComponentTarget(target, inspectionStore) ??
          resolveDiagnosticComponentTarget(target, latestDiagnostics, inspectionStore))
      : undefined;
    const component = resolvedTarget
      ? inspectionStore?.inspectComponent(resolvedTarget)
      : undefined;
    if (!target || !component) {
      return {
        ok: false,
        error: componentUnavailableError(state, command.params, "component.inspect"),
      };
    }
    const result = componentInspectView(component, state, artifactSession);
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.search") {
    const query = queryFromParams(command.params);
    const parsedQuery = componentQueryFromString(query);
    const result = {
      kind: "component.search",
      items:
        query && inspectionStore
          ? filterComponentsByRelations(
              inspectionStore.searchComponents(parsedQuery.baseQuery),
              parsedQuery,
              state,
              artifactSession,
            )
          : [],
    };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.filter") {
    const query = queryFromParams(command.params);
    const candidates = componentSnapshotsFromResultList(state.lastResultList);
    const parsedQuery = componentQueryFromString(query);
    const result = {
      kind: "component.filter",
      items:
        query && inspectionStore
          ? filterComponentsByRelations(
              inspectionStore.filterComponents({
                candidates,
                query: parsedQuery.baseQuery,
              }),
              parsedQuery,
              state,
              artifactSession,
            )
          : [],
    };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.diff") {
    const target = targetFromParams(state, command.params);
    const diff = inspectionStore?.diffComponents(target) ?? {
      ...(target ? { target } : {}),
      changes: [],
    };
    const result = { kind: "component.diff", ...diff };
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.impact") {
    const target = targetFromParams(state, command.params);
    const diagnosticIndex = target ? diagnosticImpactTargetFromString(target) : undefined;
    if (diagnosticIndex !== undefined) {
      const result = diagnosticImpactView(
        diagnosticIndex,
        latestDiagnostics[diagnosticIndex],
        artifactSession,
        inspectionStore,
      );
      rememberSelection(state, result);
      return { ok: true, result };
    }
    const projectionTarget = target ? projectionElementTargetFromString(target) : undefined;
    if (projectionTarget) {
      const result = projectionImpactView(projectionTarget, artifactSession, inspectionStore);
      rememberSelection(state, result);
      return { ok: true, result };
    }
    const component = target ? inspectionStore?.inspectComponent(target) : undefined;
    if (component) {
      const result = componentImpactView(component, artifactSession);
      rememberSelection(state, result);
      return { ok: true, result };
    }
    const graphNodeId = target
      ? graphImpactTargetFromString(target, artifactSession, inspectionStore)
      : undefined;
    if (graphNodeId) {
      const result = graphImpactView(graphNodeId, artifactSession, inspectionStore);
      rememberSelection(state, result);
      return { ok: true, result };
    }
    if (!target) {
      return {
        ok: false,
        error: componentUnavailableError(state, command.params, "component.impact"),
      };
    }
    return {
      ok: false,
      error: componentUnavailableError(state, command.params, "component.impact"),
    };
  }

  if (command.method === "props.inspect") {
    const target = targetFromParams(state, command.params);
    const path = propsPathFromParams(command.params);
    const projectionTarget = target ? projectionElementTargetFromString(target) : undefined;
    if (projectionTarget) {
      const result = inspectProjectionElementProps(projectionTarget, path, artifactSession);
      if (result) {
        const propsResult = withInteractiveResultKind("props.inspect", { ...result });
        rememberSelection(state, propsResult);
        return { ok: true, result: propsResult };
      }
    }
    const result = target
      ? (inspectionStore?.inspectProps(target, path) ??
        inspectPropsForResolvedComponentTarget(target, path, latestDiagnostics, inspectionStore))
      : undefined;
    if (!target || !result) {
      return {
        ok: false,
        error: propsUnavailableError(state, command.params, "props.inspect"),
      };
    }
    const propsResult = withInteractiveResultKind("props.inspect", { ...result });
    rememberSelection(state, propsResult);
    return { ok: true, result: propsResult };
  }

  if (command.method === "props.diff") {
    const target = targetFromParams(state, command.params);
    const path = propsPathFromParams(command.params);
    if (!target || !inspectionStore) {
      return {
        ok: false,
        error: propsUnavailableError(state, command.params, "props.diff"),
      };
    }
    const resolvedTarget =
      resolveComponentTarget(target, latestDiagnostics, inspectionStore) ?? target;
    const props = inspectionStore.inspectProps(resolvedTarget, path);
    if (!props) {
      return {
        ok: false,
        error: propsUnavailableError(state, command.params, "props.diff"),
      };
    }
    const result = withInteractiveResultKind(
      "props.diff",
      inspectionStore.diffProps(resolvedTarget, path),
    );
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "style.explain") {
    const nodeId = styleNodeIdFromParams(state, inspectionStore, command.params);
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
    const result = withInteractiveResultKind("style.explain", {
      nodeId,
      sourceKey: target.sourceKey,
      slot: target.slot,
      ...(property
        ? { property, trace }
        : styleSummaryView(nodeId, resolved.style, resolved.propertyTraces)),
    });
    rememberSelection(state, result);
    return { ok: true, result };
  }

  if (command.method === "component.stack") {
    const nodeId = styleNodeIdFromParams(state, inspectionStore, command.params);
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
    const result = withInteractiveResultKind("component.stack", {
      nodeId,
      sourceKey: target.sourceKey,
      slot: target.slot,
      stack,
    });
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
    const projectionResult =
      typeof result === "object" && result !== null
        ? withInteractiveResultKind("projection.inspect", result)
        : withInteractiveResultKind("projection.inspect", { value: result });
    rememberSelection(state, projectionResult);
    return { ok: true, result: projectionResult };
  }

  return {
    ok: false,
    error: {
      code: "deckjsx.node.interactive.unknownCommand",
      message: `Unknown interactive command: ${command.method}`,
      suggestions: unknownCommandSuggestions(command.method),
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

function styleNodeIdFromParams(
  state: InteractiveSessionState,
  inspectionStore: NodeDevInspectionStore | undefined,
  params: unknown,
): string | undefined {
  const nodeId = nodeIdFromParams(params);
  if (!nodeId) {
    return undefined;
  }
  const handle = selectionHandleFromString(nodeId);
  if (handle) {
    return graphNodeIdFromSelectionValue(resolveSelectionHandle(state, handle), inspectionStore);
  }
  return graphNodeIdFromComponentTarget(nodeId, inspectionStore) ?? nodeId;
}

function graphNodeIdFromComponentTarget(
  target: string,
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  return inspectionStore?.inspectComponent(target)?.graphNodeIds[0];
}

function graphNodeIdFromSelectionValue(
  value: unknown,
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return graphNodeIdFromSelectionValue(value[0], inspectionStore);
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if ("graphNodeIds" in value && Array.isArray(value.graphNodeIds)) {
    return value.graphNodeIds.find((id): id is string => typeof id === "string");
  }
  if ("nodeId" in value && typeof value.nodeId === "string") {
    return value.nodeId;
  }
  if ("element" in value) {
    return projectionElementGraphNodeIds(value.element)[0];
  }
  const relatedComponentId = relatedComponentIdFromSelectionValue(value);
  if (relatedComponentId) {
    return graphNodeIdFromComponentTarget(relatedComponentId, inspectionStore);
  }
  const target = inspectorTargetFromSelectionValue(value);
  return target ? graphNodeIdFromComponentTarget(target, inspectionStore) : undefined;
}

function relatedComponentIdFromSelectionValue(value: object): string | undefined {
  if (!("relatedComponents" in value) || !Array.isArray(value.relatedComponents)) {
    return undefined;
  }
  const related = value.relatedComponents[0];
  return typeof related === "object" &&
    related !== null &&
    "id" in related &&
    typeof related.id === "string"
    ? related.id
    : undefined;
}

function stylePropertyFromParams(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || !("property" in params)) {
    return undefined;
  }
  return typeof params.property === "string" ? params.property : undefined;
}

function targetFromParams(state: InteractiveSessionState, params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || !("target" in params)) {
    return undefined;
  }
  if (typeof params.target !== "string") {
    return undefined;
  }
  const handle = selectionHandleFromString(params.target);
  if (!handle) {
    return params.target;
  }
  return inspectorTargetFromSelectionValue(resolveSelectionHandle(state, handle));
}

function componentUnavailableError(
  state: InteractiveSessionState,
  params: unknown,
  commandName: string,
): InteractiveError {
  const stale = staleSelectionComponentContext(state, params);
  if (!stale) {
    return {
      code: "deckjsx.node.interactive.componentUnavailable",
      message: `${commandName} requires an available component target.`,
    };
  }
  return {
    code: "deckjsx.node.interactive.componentUnavailable",
    message: `Selection ${stale.handle} resolved to ${stale.name} component from compilation ${stale.compilation ?? "unknown"}, but it is not available in the latest inspectable attempt.`,
    suggestions: [`component search ${stale.name}`, `component inspect ${stale.id}`],
  };
}

function propsUnavailableError(
  state: InteractiveSessionState,
  params: unknown,
  commandName: string,
): InteractiveError {
  const stale = staleSelectionComponentContext(state, params);
  if (!stale) {
    return {
      code: "deckjsx.node.interactive.propsUnavailable",
      message: `${commandName} requires an available props target.`,
    };
  }
  return {
    code: "deckjsx.node.interactive.propsUnavailable",
    message: `Selection ${stale.handle} resolved to ${stale.name} component from compilation ${stale.compilation ?? "unknown"}, but its props are not available in the latest inspectable attempt.`,
    suggestions: [`component search ${stale.name}`, `component inspect ${stale.id}`],
  };
}

function staleSelectionComponentContext(
  state: InteractiveSessionState,
  params: unknown,
):
  | {
      readonly handle: "$0" | "$1" | "$2" | "$$";
      readonly id: string;
      readonly name: string;
      readonly compilation?: number;
    }
  | undefined {
  if (typeof params !== "object" || params === null || !("target" in params)) {
    return undefined;
  }
  const handle =
    typeof params.target === "string" ? selectionHandleFromString(params.target) : undefined;
  if (!handle) {
    return undefined;
  }
  return componentSelectionContext(handle, resolveSelectionHandle(state, handle));
}

function componentSelectionContext(
  handle: "$0" | "$1" | "$2" | "$$",
  value: unknown,
):
  | {
      readonly handle: "$0" | "$1" | "$2" | "$$";
      readonly id: string;
      readonly name: string;
      readonly compilation?: number;
    }
  | undefined {
  if (Array.isArray(value)) {
    return componentSelectionContext(handle, value[0]);
  }
  if (!isNodeDevComponentSnapshot(value)) {
    return undefined;
  }
  return {
    handle,
    id: value.id,
    name: value.name,
    ...(value.compilation !== undefined ? { compilation: value.compilation } : {}),
  };
}

function queryFromParams(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || !("query" in params)) {
    return undefined;
  }
  return typeof params.query === "string" ? params.query : undefined;
}

type ComponentQuery = {
  readonly baseQuery: string;
  readonly relationTokens: readonly string[];
};

function componentQueryFromString(query: string | undefined): ComponentQuery {
  const tokens = (query ?? "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const relationTokens = tokens.filter(isComponentRelationToken);
  return {
    baseQuery: tokens.filter((token) => !isComponentRelationToken(token)).join(" "),
    relationTokens,
  };
}

function isComponentRelationToken(token: string): boolean {
  return token.startsWith("has:") || token.startsWith("impact:");
}

function filterComponentsByRelations(
  components: readonly NodeDevComponentSnapshot[],
  query: ComponentQuery,
  state: InteractiveSessionState,
  artifactSession: IncrementalArtifactSession | undefined,
): readonly NodeDevComponentSnapshot[] {
  if (query.relationTokens.length === 0) {
    return components;
  }
  return components.filter((component) =>
    query.relationTokens.every((token) =>
      componentMatchesRelation(component, token, state, artifactSession),
    ),
  );
}

function componentMatchesRelation(
  component: NodeDevComponentSnapshot,
  token: string,
  state: InteractiveSessionState,
  artifactSession: IncrementalArtifactSession | undefined,
): boolean {
  if (token === "has:diagnostic") {
    return componentHasDiagnostic(component, state.diagnostics.current().diagnostics);
  }
  if (token === "impact:slide") {
    return componentHasSlideImpact(component, artifactSession);
  }
  return false;
}

function diagnosticExplainView(
  index: number,
  diagnostic: DeckjsxDevDiagnostic,
  inspectionStore: NodeDevInspectionStore | undefined,
  artifactSession: IncrementalArtifactSession | undefined,
): {
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
  readonly inspection?: DiagnosticInspectionContext;
  readonly hints: readonly string[];
} {
  const relatedComponents = (inspectionStore?.componentTree().items ?? [])
    .filter((component) => componentHasDiagnostic(component, [diagnostic]))
    .map((component) => {
      const impact = componentImpactView(component, artifactSession);
      return {
        id: component.id,
        name: component.name,
        impact: {
          status: impact.status,
          elementCount: "elements" in impact ? impact.elements.length : 0,
          ...(impact.reason ? { reason: impact.reason } : {}),
        },
      };
    });
  const inspection =
    relatedComponents.length === 0 ? diagnosticInspectionContext(inspectionStore) : undefined;
  return {
    kind: "diagnostics.explain",
    index,
    diagnostic,
    relatedComponents,
    ...(inspection ? { inspection } : {}),
    hints: relatedComponents.flatMap((component) => [
      `component inspect ${component.id}`,
      `component impact ${component.id}`,
    ]),
  };
}

type DiagnosticInspectionContext =
  | {
      readonly status: "complete" | "partial";
      readonly compilation: number;
      readonly devStatus: string;
      readonly boundary: string;
      readonly componentCount: number;
      readonly reason?: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: string;
    };

function diagnosticInspectionContext(
  inspectionStore: NodeDevInspectionStore | undefined,
): DiagnosticInspectionContext {
  if (!inspectionStore) {
    return {
      status: "unavailable",
      reason: "No dev inspection store is attached to this interactive session.",
    };
  }
  const status = inspectionStore.inspectionStatus();
  if (status.status === "unavailable") {
    return status;
  }
  return {
    ...status,
    reason:
      status.componentCount === 0
        ? `No component inspection snapshots were recorded before the ${status.boundary} boundary.`
        : `No component matched this diagnostic in the latest ${status.boundary} inspection snapshot.`,
  };
}

function componentHasSlideImpact(
  component: NodeDevComponentSnapshot,
  artifactSession: IncrementalArtifactSession | undefined,
): boolean {
  const impact = componentImpactView(component, artifactSession);
  return "elements" in impact && impact.elements.length > 0;
}

function componentHasDiagnostic(
  component: NodeDevComponentSnapshot,
  diagnostics: readonly DeckjsxDevDiagnostic[],
): boolean {
  if (!component.source?.file) {
    return false;
  }
  return diagnostics.some((diagnostic) =>
    diagnosticFiles(diagnostic).some((file) => file === component.source?.file),
  );
}

function diagnosticFiles(diagnostic: DeckjsxDevDiagnostic): readonly string[] {
  return [
    diagnostic.primary?.file,
    ...(diagnostic.labels ?? []).map((label) => label.span?.file),
  ].filter((file): file is string => typeof file === "string");
}

function propsPathFromParams(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || !("path" in params)) {
    return undefined;
  }
  return typeof params.path === "string" ? params.path : undefined;
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

function componentInspectView(
  component: NodeDevComponentSnapshot,
  state: InteractiveSessionState,
  artifactSession: IncrementalArtifactSession | undefined,
): {
  readonly kind: "component.inspect";
  readonly id: string;
  readonly name: string;
  readonly source?: NodeDevComponentSnapshot["source"];
  readonly propsSummary: NodeDevComponentSnapshot["propsSummary"];
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
} {
  const impact = componentImpactView(component, artifactSession);
  return {
    kind: "component.inspect",
    id: component.id,
    name: component.name,
    ...(component.source ? { source: component.source } : {}),
    propsSummary: component.propsSummary,
    childIds: component.childIds,
    graphNodeIds: component.graphNodeIds,
    diagnostics: componentDiagnostics(component, state.diagnostics.current().diagnostics),
    impact: {
      status: impact.status,
      elementCount: "elements" in impact ? impact.elements.length : 0,
      ...(impact.reason ? { reason: impact.reason } : {}),
    },
    hints: [`props inspect ${component.id}`, `component impact ${component.id}`],
  };
}

function componentDiagnostics(
  component: NodeDevComponentSnapshot,
  diagnostics: readonly DeckjsxDevDiagnostic[],
): readonly {
  readonly index: number;
  readonly code: string;
  readonly title: string;
}[] {
  return diagnostics.flatMap((diagnostic, index) =>
    componentHasDiagnostic(component, [diagnostic])
      ? [{ index, code: diagnostic.code, title: diagnostic.title }]
      : [],
  );
}

function componentImpactView(
  component: NodeDevComponentSnapshot,
  artifactSession: IncrementalArtifactSession | undefined,
):
  | {
      readonly target: string;
      readonly status: "unavailable";
      readonly reason: string;
    }
  | {
      readonly target: string;
      readonly status: "available" | "partial";
      readonly graphNodeIds: readonly string[];
      readonly elements: readonly {
        readonly slot: number;
        readonly slideIndex: number;
        readonly elementIndex: number;
        readonly element: unknown;
      }[];
      readonly reason?: string;
    } {
  if (component.graphNodeIds.length === 0) {
    return {
      target: component.id,
      status: "unavailable",
      reason: "No graph node mapping has been recorded for this component.",
    };
  }
  const projection = projectionTargetFor(artifactSession, undefined);
  if (!projection) {
    return {
      target: component.id,
      status: "partial",
      graphNodeIds: component.graphNodeIds,
      elements: [],
      reason: "No retained projection artifact is available for impact inspection.",
    };
  }
  const elements = impactedProjectionElements(projection, new Set(component.graphNodeIds));
  return {
    target: component.id,
    status: elements.length > 0 ? "available" : "partial",
    graphNodeIds: component.graphNodeIds,
    elements,
    ...(elements.length === 0
      ? { reason: "No projected elements reference this component's graph nodes." }
      : {}),
  };
}

function projectionImpactView(
  target: ProjectionElementTarget,
  artifactSession: IncrementalArtifactSession | undefined,
  inspectionStore: NodeDevInspectionStore | undefined,
):
  | {
      readonly target: string;
      readonly status: "unavailable";
      readonly reason: string;
    }
  | {
      readonly target: string;
      readonly status: "available" | "partial";
      readonly graphNodeIds: readonly string[];
      readonly components: readonly { readonly id: string; readonly name: string }[];
      readonly elements: readonly {
        readonly slot: number;
        readonly slideIndex: number;
        readonly elementIndex: number;
        readonly element: unknown;
      }[];
      readonly reason?: string;
    } {
  const projection = projectionTargetFor(artifactSession, target.slot);
  const inspected = projection
    ? inspectProjection(projection, target.slideIndex, target.elementIndex)
    : undefined;
  if (!isProjectionElementInspection(inspected)) {
    return {
      target: projectionElementTargetToString(target),
      status: "unavailable",
      reason: "The requested projection element is not available in retained artifacts.",
    };
  }
  const graphNodeIds = projectionElementGraphNodeIds(inspected.element);
  const components = componentSnapshotsForGraphNodes(inspectionStore, graphNodeIds).map(
    (component) => ({ id: component.id, name: component.name }),
  );
  return {
    target: projectionElementTargetToString(target),
    status: graphNodeIds.length > 0 ? "available" : "partial",
    graphNodeIds,
    components,
    elements: [
      {
        slot: inspected.slot,
        slideIndex: inspected.slideIndex,
        elementIndex: inspected.elementIndex,
        element: inspected.element,
      },
    ],
    ...(graphNodeIds.length === 0
      ? { reason: "No graph node references were retained for this projection element." }
      : {}),
  };
}

function graphImpactView(
  graphNodeId: string,
  artifactSession: IncrementalArtifactSession | undefined,
  inspectionStore: NodeDevInspectionStore | undefined,
):
  | {
      readonly target: string;
      readonly status: "unavailable";
      readonly reason: string;
    }
  | {
      readonly target: string;
      readonly status: "available" | "partial";
      readonly graphNodeIds: readonly string[];
      readonly components: readonly { readonly id: string; readonly name: string }[];
      readonly elements: readonly {
        readonly slot: number;
        readonly slideIndex: number;
        readonly elementIndex: number;
        readonly element: unknown;
      }[];
      readonly reason?: string;
    } {
  const graphNodeIds = [graphNodeId];
  const elements = projectionElementsForGraphNodes(artifactSession, graphNodeIds);
  const components = componentSnapshotsForGraphNodes(inspectionStore, graphNodeIds).map(
    (component) => ({ id: component.id, name: component.name }),
  );
  const hasGraphNode = artifactSession?.inspectArtifacts().graphNode(graphNodeId) !== undefined;
  if (!hasGraphNode && elements.length === 0 && components.length === 0) {
    return {
      target: `graph:${graphNodeId}`,
      status: "unavailable",
      reason: "The requested graph node is not available in retained artifacts.",
    };
  }
  return {
    target: `graph:${graphNodeId}`,
    status: elements.length > 0 ? "available" : "partial",
    graphNodeIds,
    components,
    elements,
    ...(elements.length === 0
      ? { reason: "No projected elements reference this graph node." }
      : {}),
  };
}

function graphImpactTargetFromString(
  target: string,
  artifactSession: IncrementalArtifactSession | undefined,
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  const explicit = /^graph:(.+)$/.exec(target);
  if (explicit) {
    return explicit[1];
  }
  const graphNodeIds = [target];
  const hasGraphNode = artifactSession?.inspectArtifacts().graphNode(target) !== undefined;
  const hasProjectionImpact =
    projectionElementsForGraphNodes(artifactSession, graphNodeIds).length > 0;
  const hasComponent = componentSnapshotsForGraphNodes(inspectionStore, graphNodeIds).length > 0;
  return hasGraphNode || hasProjectionImpact || hasComponent ? target : undefined;
}

function diagnosticImpactView(
  index: number,
  diagnostic: DeckjsxDevDiagnostic | undefined,
  artifactSession: IncrementalArtifactSession | undefined,
  inspectionStore: NodeDevInspectionStore | undefined,
):
  | {
      readonly target: string;
      readonly status: "unavailable";
      readonly reason: string;
    }
  | {
      readonly target: string;
      readonly status: "available" | "partial";
      readonly diagnostic: {
        readonly index: number;
        readonly code: string;
        readonly title: string;
      };
      readonly graphNodeIds: readonly string[];
      readonly components: readonly { readonly id: string; readonly name: string }[];
      readonly elements: readonly {
        readonly slot: number;
        readonly slideIndex: number;
        readonly elementIndex: number;
        readonly element: unknown;
      }[];
      readonly reason?: string;
    } {
  if (!diagnostic) {
    return {
      target: `diagnostic:${index}`,
      status: "unavailable",
      reason: "The requested diagnostic is not available in the latest diagnostic snapshot.",
    };
  }
  const components = (inspectionStore?.componentTree().items ?? []).filter((component) =>
    componentHasDiagnostic(component, [diagnostic]),
  );
  const graphNodeIds = uniqueStrings(components.flatMap((component) => component.graphNodeIds));
  const elements = projectionElementsForGraphNodes(artifactSession, graphNodeIds);
  return {
    target: `diagnostic:${index}`,
    status: components.length > 0 ? (elements.length > 0 ? "available" : "partial") : "partial",
    diagnostic: {
      index,
      code: diagnostic.code,
      title: diagnostic.title,
    },
    graphNodeIds,
    components: components.map((component) => ({ id: component.id, name: component.name })),
    elements,
    ...(components.length === 0
      ? { reason: "No component inspection snapshot matched this diagnostic." }
      : elements.length === 0
        ? { reason: "No projected elements reference components related to this diagnostic." }
        : {}),
  };
}

function diagnosticImpactTargetFromString(target: string): number | undefined {
  const match = /^diagnostic:(\d+)$/.exec(target);
  return match ? Number(match[1]) : undefined;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

type ProjectionElementTarget = {
  readonly slot: number;
  readonly slideIndex: number;
  readonly elementIndex: number;
};

function projectionElementTargetFromString(value: string): ProjectionElementTarget | undefined {
  const match = /^projection:@(\d+):(\d+):(\d+)$/.exec(value);
  if (!match) {
    return undefined;
  }
  return {
    slot: Number(match[1]),
    slideIndex: Number(match[2]),
    elementIndex: Number(match[3]),
  };
}

function projectionElementTargetToString(target: ProjectionElementTarget): string {
  return `projection:@${target.slot}:${target.slideIndex}:${target.elementIndex}`;
}

function projectionElementGraphNodeIds(element: unknown): readonly string[] {
  const origin = propertyObject(element, "origin");
  const ids = origin ? propertyValue(origin, "graphNodeIds") : undefined;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function componentSnapshotsForGraphNodes(
  inspectionStore: NodeDevInspectionStore | undefined,
  graphNodeIds: readonly string[],
): readonly NodeDevComponentSnapshot[] {
  if (graphNodeIds.length === 0) {
    return [];
  }
  const graphNodeIdSet = new Set(graphNodeIds);
  return (inspectionStore?.componentTree().items ?? []).filter((component) =>
    component.graphNodeIds.some((id) => graphNodeIdSet.has(id)),
  );
}

function projectionElementsForGraphNodes(
  artifactSession: IncrementalArtifactSession | undefined,
  graphNodeIds: readonly string[],
): readonly {
  readonly slot: number;
  readonly slideIndex: number;
  readonly elementIndex: number;
  readonly element: unknown;
}[] {
  const graphNodeIdSet = new Set(graphNodeIds);
  return projectionTargetsFor(artifactSession).flatMap((projection) =>
    impactedProjectionElements(projection, graphNodeIdSet),
  );
}

function projectionTargetsFor(
  artifactSession: IncrementalArtifactSession | undefined,
): readonly { readonly slot: number; readonly projection: unknown }[] {
  const inspection = artifactSession?.inspectArtifacts();
  if (!inspection) {
    return [];
  }
  return inspection.retainedSlots().flatMap((slot) => {
    const projection = inspection.projectionForSlot(slot);
    return projection === undefined ? [] : [{ slot, projection }];
  });
}

function isProjectionElementInspection(value: unknown): value is {
  readonly slot: number;
  readonly slideIndex: number;
  readonly elementIndex: number;
  readonly element: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "slot" in value &&
    typeof value.slot === "number" &&
    "slideIndex" in value &&
    typeof value.slideIndex === "number" &&
    "elementIndex" in value &&
    typeof value.elementIndex === "number" &&
    "element" in value
  );
}

function impactedProjectionElements(
  target: { readonly slot: number; readonly projection: unknown },
  graphNodeIds: ReadonlySet<string>,
): readonly {
  readonly slot: number;
  readonly slideIndex: number;
  readonly elementIndex: number;
  readonly element: unknown;
}[] {
  const projection = target.projection;
  const slides = propertyValue(projection, "slides");
  if (!Array.isArray(slides)) {
    return [];
  }
  return slides.flatMap((slide, slideIndex) =>
    projectionSlideElements(slide).flatMap((element, elementIndex) =>
      elementReferencesGraphNode(element, graphNodeIds)
        ? [
            {
              slot: target.slot,
              slideIndex,
              elementIndex,
              element: summarizeProjectionElement(element),
            },
          ]
        : [],
    ),
  );
}

function elementReferencesGraphNode(element: unknown, graphNodeIds: ReadonlySet<string>): boolean {
  const origin = propertyObject(element, "origin");
  const ids = origin ? propertyValue(origin, "graphNodeIds") : undefined;
  return Array.isArray(ids) && ids.some((id) => typeof id === "string" && graphNodeIds.has(id));
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

function styleSummaryView(
  nodeId: string,
  style: unknown,
  propertyTraces: Readonly<Record<string, unknown>>,
): {
  readonly style: unknown;
  readonly propertyTraces: Readonly<Record<string, unknown>>;
  readonly properties: readonly string[];
  readonly hints: readonly string[];
} {
  const properties = Object.keys(propertyTraces);
  return {
    style,
    propertyTraces,
    properties,
    hints: properties.map((property) => `style ${nodeId} ${property}`),
  };
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

function inspectProjectionElementProps(
  target: ProjectionElementTarget,
  path: string | undefined,
  artifactSession: IncrementalArtifactSession | undefined,
): { readonly target: string; readonly path?: string; readonly value: unknown } | undefined {
  const projection = projectionTargetFor(artifactSession, target.slot);
  const inspected = projection
    ? inspectProjection(projection, target.slideIndex, target.elementIndex)
    : undefined;
  if (!isProjectionElementInspection(inspected)) {
    return undefined;
  }
  const props = authoredPropsForProjectionElement(inspected.element, artifactSession);
  if (props === undefined) {
    return undefined;
  }
  const value = path ? valueAtPath(props, path) : props;
  return {
    target: projectionElementTargetToString(target),
    ...(path ? { path } : {}),
    value,
  };
}

function authoredPropsForProjectionElement(
  element: unknown,
  artifactSession: IncrementalArtifactSession | undefined,
): unknown {
  const graphNodeId = projectionElementGraphNodeIds(element)[0];
  const graphNode = graphNodeId
    ? artifactNodeTargetFor(artifactSession, graphNodeId)?.node
    : undefined;
  return propertyValue(graphNode, "props");
}

function inspectPropsForResolvedComponentTarget(
  target: string,
  path: string | undefined,
  diagnostics: readonly DeckjsxDevDiagnostic[],
  inspectionStore: NodeDevInspectionStore | undefined,
): { readonly target: string; readonly path?: string; readonly value: unknown } | undefined {
  const resolvedTarget = resolveComponentTarget(target, diagnostics, inspectionStore);
  return resolvedTarget ? inspectionStore?.inspectProps(resolvedTarget, path) : undefined;
}

function resolveComponentTarget(
  target: string,
  diagnostics: readonly DeckjsxDevDiagnostic[],
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  return (
    resolveGraphComponentTarget(target, inspectionStore) ??
    resolveDiagnosticComponentTarget(target, diagnostics, inspectionStore)
  );
}

function resolveGraphComponentTarget(
  target: string,
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  const graphNodeId = graphTargetIdFromString(target);
  const component = graphNodeId
    ? componentSnapshotsForGraphNodes(inspectionStore, [graphNodeId])[0]
    : undefined;
  return component?.id;
}

function resolveProjectionComponentTarget(
  target: string,
  artifactSession: IncrementalArtifactSession | undefined,
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  const projectionTarget = projectionElementTargetFromString(target);
  if (!projectionTarget) {
    return undefined;
  }
  const projection = projectionTargetFor(artifactSession, projectionTarget.slot);
  const inspected = projection
    ? inspectProjection(projection, projectionTarget.slideIndex, projectionTarget.elementIndex)
    : undefined;
  if (!isProjectionElementInspection(inspected)) {
    return undefined;
  }
  return componentSnapshotsForGraphNodes(
    inspectionStore,
    projectionElementGraphNodeIds(inspected.element),
  )[0]?.id;
}

function resolveDiagnosticComponentTarget(
  target: string,
  diagnostics: readonly DeckjsxDevDiagnostic[],
  inspectionStore: NodeDevInspectionStore | undefined,
): string | undefined {
  const index = diagnosticImpactTargetFromString(target);
  const diagnostic = index === undefined ? undefined : diagnostics[index];
  if (!diagnostic) {
    return undefined;
  }
  return (inspectionStore?.componentTree().items ?? []).find((component) =>
    componentHasDiagnostic(component, [diagnostic]),
  )?.id;
}

function graphTargetIdFromString(target: string): string | undefined {
  const explicit = /^graph:(.+)$/.exec(target);
  return explicit ? explicit[1] : target;
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

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => propertyValue(current, key), value);
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

function unknownCommandSuggestions(method: string): readonly string[] {
  const candidates = INTERACTIVE_COMMAND_HELP.flatMap((command) => [
    command.method,
    command.shorthand.split(" ")[0] ?? command.shorthand,
  ]);
  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates
    .map((candidate) => ({
      candidate,
      distance: editDistance(method, candidate),
    }))
    .filter((item) => item.distance <= Math.max(2, Math.floor(method.length / 3)))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.candidate.localeCompare(right.candidate),
    )
    .slice(0, 3)
    .map((item) => item.candidate);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function selectionHandleFromParams(params: unknown): "$0" | "$1" | "$2" | "$$" | undefined {
  if (typeof params !== "object" || params === null || !("handle" in params)) {
    return undefined;
  }
  return typeof params.handle === "string" ? selectionHandleFromString(params.handle) : undefined;
}

function selectionHandleFromString(value: string): "$0" | "$1" | "$2" | "$$" | undefined {
  return value === "$0" || value === "$1" || value === "$2" || value === "$$" ? value : undefined;
}

function rememberSelection(state: InteractiveSessionState, result: unknown): void {
  const resultList = resultListFromInteractiveResult(result);
  if (resultList) {
    state.lastResultList = resultList;
  }
  const primarySelection = primarySelectionFromInteractiveResult(result);
  if (primarySelection !== undefined) {
    state.selectionHistory = [primarySelection, ...state.selectionHistory].slice(0, 3);
  }
}

function primarySelectionFromInteractiveResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result[0];
  }
  if (typeof result !== "object" || result === null) {
    return result;
  }
  if ("items" in result && Array.isArray(result.items)) {
    return result.items[0];
  }
  return result;
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

function componentSnapshotsFromResultList(
  resultList: readonly unknown[] | undefined,
): readonly NodeDevComponentSnapshot[] {
  return (resultList ?? []).filter(isNodeDevComponentSnapshot);
}

function isNodeDevComponentSnapshot(value: unknown): value is NodeDevComponentSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "propsSummary" in value &&
    typeof value.propsSummary === "object" &&
    value.propsSummary !== null
  );
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

function inspectorTargetFromSelectionValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return inspectorTargetFromSelectionValue(value[0]);
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const projectionTarget = projectionElementTargetFromSelectionValue(value);
  if (projectionTarget) {
    return projectionElementTargetToString(projectionTarget);
  }
  const diagnosticTarget = diagnosticTargetFromSelectionValue(value);
  if (diagnosticTarget !== undefined) {
    return `diagnostic:${diagnosticTarget}`;
  }
  if ("id" in value && typeof value.id === "string") {
    return value.id;
  }
  if ("target" in value && typeof value.target === "string") {
    return value.target;
  }
  if ("items" in value && Array.isArray(value.items)) {
    return inspectorTargetFromSelectionValue(value.items[0]);
  }
  if ("value" in value) {
    return inspectorTargetFromSelectionValue(value.value);
  }
  return undefined;
}

function diagnosticTargetFromSelectionValue(value: object): number | undefined {
  return "kind" in value &&
    value.kind === "diagnostics.explain" &&
    "index" in value &&
    typeof value.index === "number"
    ? value.index
    : undefined;
}

function projectionElementTargetFromSelectionValue(
  value: object,
): ProjectionElementTarget | undefined {
  if (
    "slot" in value &&
    typeof value.slot === "number" &&
    "slideIndex" in value &&
    typeof value.slideIndex === "number" &&
    "elementIndex" in value &&
    typeof value.elementIndex === "number" &&
    "element" in value
  ) {
    return { slot: value.slot, slideIndex: value.slideIndex, elementIndex: value.elementIndex };
  }
  return undefined;
}

function selectionListView(state: InteractiveSessionState): {
  readonly kind: "selection.list";
  readonly items: readonly {
    readonly handle: "$0" | "$1" | "$2" | "$$";
    readonly available: boolean;
    readonly value?: unknown;
  }[];
} {
  const items: {
    handle: "$0" | "$1" | "$2" | "$$";
    available: boolean;
    value?: unknown;
  }[] = [];
  for (const handle of ["$0", "$1", "$2"] as const) {
    const value = resolveSelectionHandle(state, handle);
    if (value !== undefined) {
      items.push({ handle, available: true, value });
    }
  }
  if (state.lastResultList !== undefined) {
    items.push({ handle: "$$", available: true, value: state.lastResultList });
  }
  return { kind: "selection.list", items };
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

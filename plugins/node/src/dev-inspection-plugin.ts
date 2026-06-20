import type { DeckPlugin } from "deckjsx/integration";
import type {
  NodeDevComponentKey,
  NodeDevInspectionSource,
  NodeDevInspectionStore,
} from "./dev-inspection-store";

export type NodeDevAuthoringComponentInvocation = {
  readonly stack: readonly unknown[];
  readonly props: unknown;
};

export type NodeDevAuthoringRuntimeObserver = {
  componentInvoked?(invocation: NodeDevAuthoringComponentInvocation): void;
};

export function createNodeDevInspectionPlugin(input: {
  readonly store: NodeDevInspectionStore;
}): DeckPlugin {
  return {
    kind: "deckjsx.plugin",
    id: "deckjsx.node.dev-inspection",
    name: "deckjsx node dev inspection",
    hooks: {
      afterGraph(context) {
        recordComponentsFromGraph(input.store, context.graph);
      },
    },
  };
}

export function createNodeDevInspectionAuthoringObserver(input: {
  readonly store: NodeDevInspectionStore;
}): NodeDevAuthoringRuntimeObserver {
  return {
    componentInvoked(invocation) {
      recordComponentInvocation(input.store, invocation);
    },
  };
}

function recordComponentsFromGraph(store: NodeDevInspectionStore, graph: unknown): void {
  const nodes = graphNodesFrom(graph);
  if (!nodes) {
    return;
  }
  for (const [graphNodeId, node] of nodes) {
    recordComponentStack(store, componentFramesFromNode(node), String(graphNodeId));
  }
}

function recordComponentStack(
  store: NodeDevInspectionStore,
  frames: readonly ComponentInspectionFrame[],
  graphNodeId: string | undefined,
): void {
  recordComponentFrames(store, frames, undefined, graphNodeId);
}

function recordComponentInvocation(
  store: NodeDevInspectionStore,
  invocation: NodeDevAuthoringComponentInvocation,
): void {
  recordComponentFrames(
    store,
    invocation.stack.flatMap(componentFrameFromUnknown),
    invocation.props,
    undefined,
  );
}

function recordComponentFrames(
  store: NodeDevInspectionStore,
  frames: readonly ComponentInspectionFrame[],
  leafProps: unknown,
  graphNodeId: string | undefined,
): void {
  let parentId: string | undefined;
  frames.forEach((frame, index) => {
    parentId = store.recordComponent({
      name: frame.name,
      ...(frame.key !== undefined ? { key: frame.key } : {}),
      ...(frame.source ? { source: frame.source } : {}),
      ...(index === frames.length - 1 ? { props: leafProps } : {}),
      ...(index === frames.length - 1 && graphNodeId ? { graphNodeId } : {}),
      ...(parentId ? { parentId } : {}),
    });
  });
}

function graphNodesFrom(graph: unknown): ReadonlyMap<unknown, unknown> | undefined {
  if (!isRecord(graph) || !(graph.nodes instanceof Map)) {
    return undefined;
  }
  return graph.nodes;
}

type ComponentInspectionFrame = {
  readonly name: string;
  readonly key?: NodeDevComponentKey;
  readonly source?: NodeDevInspectionSource;
};

function componentFramesFromNode(node: unknown): readonly ComponentInspectionFrame[] {
  const stack = componentStackFromNode(node);
  return stack.flatMap(componentFrameFromUnknown);
}

function componentFrameFromUnknown(frame: unknown): readonly ComponentInspectionFrame[] {
  if (!isRecord(frame) || typeof frame.name !== "string") {
    return [];
  }
  const source = sourceFromFrame(frame);
  return [
    {
      name: frame.name,
      ...(componentKeyFromFrame(frame) !== undefined ? { key: componentKeyFromFrame(frame) } : {}),
      ...(source ? { source } : {}),
    },
  ];
}

function componentKeyFromFrame(frame: Record<string, unknown>): NodeDevComponentKey | undefined {
  const key = frame.key;
  return typeof key === "string" || typeof key === "number" || typeof key === "bigint"
    ? key
    : undefined;
}

function componentStackFromNode(node: unknown): readonly unknown[] {
  const origin = isRecord(node) ? node.origin : undefined;
  const provenance = isRecord(origin) ? origin.componentProvenance : undefined;
  const stack = isRecord(provenance) ? provenance.stack : undefined;
  return Array.isArray(stack) ? stack : [];
}

function sourceFromFrame(frame: Record<string, unknown>): NodeDevInspectionSource | undefined {
  const span = isRecord(frame.sourceSpan) ? frame.sourceSpan : undefined;
  const file = typeof span?.file === "string" ? span.file : stringField(frame, "moduleId");
  const line = numberField(span, "line");
  const column = numberField(span, "column");
  if (!file && line === undefined && column === undefined) {
    return undefined;
  }
  return {
    ...(file ? { file } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
  };
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const field = value?.[key];
  return typeof field === "string" ? field : undefined;
}

function numberField(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const field = value?.[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

import type { AuthoringExtensionValue } from "./extensions";
import { normalizeAuthorChildren, type AuthorTreeNode } from "./tree";
import type { Diagnostic } from "../diagnostics";
import type { ComposedAuthorRoot, SourceSlotOrigin } from "../composition/types";
import { lowerAuthoringExtension } from "../plugin";
import type { DeckPlugin } from "../plugin-contract";

type LoweredNodeResult = {
  readonly nodes: readonly AuthorTreeNode[];
  readonly origins: ReadonlyMap<AuthorTreeNode, SourceSlotOrigin>;
};

type LoweringState = {
  readonly root: ComposedAuthorRoot;
  readonly plugins: readonly DeckPlugin[];
  readonly diagnostics: Diagnostic[];
  readonly activeValues: WeakSet<object>;
};

export function lowerComposedAuthorRoots(
  roots: readonly ComposedAuthorRoot[],
  plugins: readonly DeckPlugin[],
): {
  readonly roots: readonly ComposedAuthorRoot[];
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const loweredRoots = roots.map((root) => {
    const state: LoweringState = {
      root,
      plugins,
      diagnostics,
      activeValues: new WeakSet(),
    };
    const lowered = lowerNode(state, root.root, root.path);
    const nextRoot = lowered.nodes[0];

    if (lowered.nodes.length !== 1 || !nextRoot || nextRoot.kind !== "element") {
      diagnostics.push({
        severity: "error",
        code: "E_PLUGIN_AUTHORING_ROOT_LOWERING_INVALID",
        title: "authoring lowering changed the slide root",
        message: `Authoring lowering must preserve one element root for ${root.path}.`,
        labels: [],
      });
      return root;
    }

    const slotOrigins = new WeakMap<AuthorTreeNode, SourceSlotOrigin>();
    lowered.origins.forEach((origin, node) => slotOrigins.set(node, origin));

    return {
      ...root,
      root: nextRoot,
      slotOrigins,
    };
  });

  return { roots: loweredRoots, diagnostics };
}

function lowerNode(state: LoweringState, node: AuthorTreeNode, path: string): LoweredNodeResult {
  const origin = state.root.slotOrigins.get(node);

  if (node.kind === "text") {
    return {
      nodes: [node],
      origins: origin ? new Map([[node, origin]]) : new Map(),
    };
  }

  if (node.kind === "element" && node.source.kind === "extension") {
    return lowerExtension(state, node.source.value, path, origin);
  }

  const children = node.children.flatMap((child, index) =>
    lowerNode(state, child, `${path} > child[${index}]`),
  );
  const loweredChildren = children.flatMap((result) => result.nodes);
  const loweredOrigins = new Map<AuthorTreeNode, SourceSlotOrigin>();
  children.forEach((result) => {
    result.origins.forEach((childOrigin, childNode) => loweredOrigins.set(childNode, childOrigin));
  });

  const loweredNode: AuthorTreeNode =
    node.kind === "fragment"
      ? { ...node, children: loweredChildren }
      : { ...node, children: loweredChildren };
  if (origin) {
    loweredOrigins.set(loweredNode, origin);
  }

  return {
    nodes: [loweredNode],
    origins: loweredOrigins,
  };
}

function lowerExtension(
  state: LoweringState,
  value: AuthoringExtensionValue,
  path: string,
  origin: SourceSlotOrigin | undefined,
): LoweredNodeResult {
  if (state.activeValues.has(value)) {
    state.diagnostics.push({
      severity: "error",
      code: "E_PLUGIN_AUTHORING_LOWERING_CYCLE",
      title: "authoring lowering cycle detected",
      message: `Authoring lowering recursively returned ${value.pluginId}:${value.kind} at ${path}.`,
      labels: [],
    });
    return { nodes: [], origins: new Map() };
  }

  state.activeValues.add(value);
  try {
    const resolution = lowerAuthoringExtension(state.plugins, {
      stage: "tree",
      value,
      path,
      composition: state.root.composition,
    });
    state.diagnostics.push(...resolution.diagnostics);

    if (!resolution.handled) {
      state.diagnostics.push({
        severity: "error",
        code: "E_PLUGIN_AUTHORING_EXTENSION_UNRESOLVED",
        title: "authoring extension has no resolver",
        message: `No Deck Plugin resolved ${value.pluginId}:${value.kind} at ${path}.`,
        labels: [],
      });
      return { nodes: [], origins: new Map() };
    }

    if (resolution.children === undefined) {
      return { nodes: [], origins: new Map() };
    }

    let normalized: readonly AuthorTreeNode[];
    try {
      normalized = normalizeAuthorChildren(resolution.children);
    } catch (error) {
      state.diagnostics.push({
        severity: "error",
        code: "E_PLUGIN_AUTHORING_LOWERING_INVALID_CHILDREN",
        title: "authoring lowering returned invalid children",
        message: error instanceof Error ? error.message : String(error),
        labels: [],
      });
      return { nodes: [], origins: new Map() };
    }

    const lowered = normalized.flatMap((child, index) =>
      lowerNode(state, child, `${path} > lowered[${index}]`),
    );
    const origins = new Map<AuthorTreeNode, SourceSlotOrigin>();
    lowered.forEach((result) => {
      result.origins.forEach((childOrigin, childNode) => origins.set(childNode, childOrigin));
    });
    if (origin) {
      lowered.forEach((result) => {
        result.nodes.forEach((childNode) => origins.set(childNode, origin));
      });
    }

    return {
      nodes: lowered.flatMap((result) => result.nodes),
      origins,
    };
  } finally {
    state.activeValues.delete(value);
  }
}

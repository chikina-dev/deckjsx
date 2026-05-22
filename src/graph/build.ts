import type { AuthoredComponent, AuthoredTag } from "../authoring/tags";
import type {
  AuthorElementNode,
  AuthorFragmentNode,
  AuthorTextLeaf,
  AuthorTreeNode,
  JsxKey,
} from "../authoring/tree";
import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import { assetEntityId, graphNodeId, styleEntityId } from "./identity";
import {
  semanticKindForComponent,
  semanticKindForTag,
  semanticRoleForComponent,
  semanticRoleForTag,
} from "./roles";
import type {
  AssetEntity,
  AssetEntityId,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SemanticNodeKind,
  SemanticOrigin,
  StyleEntity,
  StyleEntityId,
} from "./types";

type BuildState = {
  nodes: Map<GraphNodeId, SemanticNode>;
  styles: Map<StyleEntityId, StyleEntity>;
  assets: Map<AssetEntityId, AssetEntity>;
  diagnostics: Diagnostic[];
};

type BuildContext = {
  parentId: GraphNodeId;
  parentMaterial: readonly string[];
  path: string;
  inline: boolean;
};

type BuildChild = {
  id: GraphNodeId;
  kind: SemanticNodeKind;
};

function keySegment(key: JsxKey | undefined, index: number): string {
  return key === undefined ? `index:${index}` : `key:${String(key)}`;
}

function sourceName(node: AuthorElementNode): string {
  return node.source.kind === "tag" ? node.source.tag : node.source.component;
}

function nodeSemanticKind(node: AuthorElementNode): SemanticNodeKind {
  return node.source.kind === "tag"
    ? semanticKindForTag(node.source.tag)
    : semanticKindForComponent(node.source.component);
}

function nodeRole(node: AuthorElementNode) {
  return node.source.kind === "tag"
    ? semanticRoleForTag(node.source.tag)
    : semanticRoleForComponent(node.source.component);
}

function originFor(node: AuthorElementNode, path: string): SemanticOrigin {
  return {
    kind: "authored",
    path,
    ...(node.sourceSpan ? { sourceSpan: node.sourceSpan } : {}),
  };
}

function textOriginFor(node: AuthorTextLeaf, path: string): SemanticOrigin {
  return {
    kind: "authored",
    path,
    ...(node.sourceSpan ? { sourceSpan: node.sourceSpan } : {}),
  };
}

function propsWithoutStyle(props: Record<string, unknown>): Record<string, unknown> | undefined {
  const { style: _style, children: _children, ...direct } = props;
  return Object.keys(direct).length === 0 ? undefined : direct;
}

function styleRefFor(
  state: BuildState,
  idMaterial: readonly string[],
  target: SemanticNodeKind,
  props: Record<string, unknown>,
): StyleEntityId | undefined {
  const style = props.style;
  const direct = propsWithoutStyle(props);

  if (style === undefined && direct === undefined) {
    return undefined;
  }

  const id = styleEntityId(idMaterial);
  state.styles.set(id, {
    id,
    target,
    authored: {
      ...(style !== undefined ? { style } : {}),
      ...(direct !== undefined ? { direct } : {}),
    },
  });
  return id;
}

function addDiagnostic(state: BuildState, item: Diagnostic): void {
  state.diagnostics.push(item);
}

function invalidStructure(
  path: string,
  title: string,
  message: string,
  help?: readonly string[],
): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_SEMANTIC_STRUCTURE",
    title,
    labels: [{ path, message }],
    ...(message ? { message } : {}),
    ...(help ? { help } : {}),
  });
}

function assetForImage(
  state: BuildState,
  idMaterial: readonly string[],
  props: Record<string, unknown>,
  path: string,
): AssetEntityId | undefined {
  if (typeof props.src !== "string" && typeof props.data !== "string") {
    addDiagnostic(
      state,
      invalidStructure(path, "image source is missing", "Image nodes require either src or data.", [
        "Add a src path or data URL to the image.",
      ]),
    );
    return undefined;
  }

  const id = assetEntityId(idMaterial);
  const entity: AssetEntity = {
    id,
    kind: "image",
    source:
      typeof props.src === "string"
        ? { kind: "path", path: props.src }
        : { kind: "data", data: props.data as string },
    metadata:
      typeof props.data === "string" && props.data.startsWith("data:")
        ? { mediaType: props.data.slice(5, props.data.indexOf(";")) || undefined }
        : {},
    resolution: "unresolved",
  };
  state.assets.set(id, entity);
  return id;
}

function semanticBase(
  state: BuildState,
  node: AuthorElementNode,
  id: GraphNodeId,
  kind: SemanticNodeKind,
  path: string,
  material: readonly string[],
) {
  const styleRef = styleRefFor(state, material, kind, node.props);
  return {
    id,
    kind,
    origin: originFor(node, path),
    ...(node.source.kind === "tag" ? { authoredTag: node.source.tag as AuthoredTag } : {}),
    ...(node.source.kind === "component"
      ? { authoredComponent: node.source.component as AuthoredComponent }
      : {}),
    ...(node.key !== undefined ? { key: node.key } : {}),
    ...(nodeRole(node) ? { role: nodeRole(node) } : {}),
    ...(styleRef ? { styleRef } : {}),
  };
}

function buildTextRunFromLeaf(
  state: BuildState,
  leaf: AuthorTextLeaf,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  const text = typeof leaf.value === "string" ? leaf.value : String(leaf.value);
  if (text.trim().length === 0) {
    return undefined;
  }

  const segment = `text:${index}`;
  const material = [...context.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${context.path} > text[${index}]`;
  state.nodes.set(id, {
    id,
    kind: "textRun",
    origin: textOriginFor(leaf, path),
    text,
  });
  return { id, kind: "textRun" };
}

function buildImplicitTextNode(
  state: BuildState,
  leaf: AuthorTextLeaf,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  const run = buildTextRunFromLeaf(
    state,
    leaf,
    {
      ...context,
      parentMaterial: [...context.parentMaterial, `implicit-text:${index}`],
      path: `${context.path} > implicitText[${index}]`,
    },
    0,
  );

  if (!run) {
    return undefined;
  }

  const material = [...context.parentMaterial, `implicit-text:${index}`];
  const id = graphNodeId(material);
  state.nodes.set(id, {
    id,
    kind: "text",
    origin: {
      kind: "implicit",
      path: `${context.path} > implicitText[${index}]`,
      ...(leaf.sourceSpan ? { sourceSpan: leaf.sourceSpan } : {}),
      reason: "primitive-text-in-container",
    },
    implicit: true,
    inlineChildren: [run.id],
  });
  return { id, kind: "text" };
}

function buildChildren(
  state: BuildState,
  children: readonly AuthorTreeNode[],
  context: BuildContext,
): GraphNodeId[] {
  const ids: GraphNodeId[] = [];

  children.forEach((child, index) => {
    const built = buildNode(state, child, context, index);
    if (built) {
      ids.push(built.id);
    }
  });

  return ids;
}

function buildFragment(
  state: BuildState,
  node: AuthorFragmentNode,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  const segment = `fragment:${keySegment(node.key, index)}`;
  const ids = buildChildren(state, node.children, {
    ...context,
    parentMaterial: [...context.parentMaterial, segment],
    path: `${context.path} > fragment[${keySegment(node.key, index)}]`,
  });
  return ids.length === 1
    ? { id: ids[0], kind: state.nodes.get(ids[0])?.kind ?? "container" }
    : undefined;
}

function buildTextLikeNode(
  state: BuildState,
  node: AuthorElementNode,
  id: GraphNodeId,
  path: string,
  material: readonly string[],
): BuildChild {
  const inlineChildren: GraphNodeId[] = [];

  node.children.forEach((child, index) => {
    if (child.kind === "text") {
      const run = buildTextRunFromLeaf(
        state,
        child,
        { parentId: id, parentMaterial: material, path, inline: true },
        index,
      );
      if (run) {
        inlineChildren.push(run.id);
      }
      return;
    }

    if (child.kind === "fragment") {
      inlineChildren.push(
        ...buildChildren(state, child.children, {
          parentId: id,
          parentMaterial: [...material, `fragment:${keySegment(child.key, index)}`],
          path: `${path} > fragment[${keySegment(child.key, index)}]`,
          inline: true,
        }),
      );
      return;
    }

    if (child.source.kind === "tag" && child.source.tag === "span") {
      const built = buildNode(
        state,
        child,
        { parentId: id, parentMaterial: material, path, inline: true },
        index,
      );
      if (built) {
        inlineChildren.push(built.id);
      }
      return;
    }

    addDiagnostic(
      state,
      invalidStructure(
        `${path} > ${sourceName(child)}[${index}]`,
        "block content cannot appear inside text",
        "Text-like elements accept primitive text and inline spans only.",
      ),
    );
  });

  state.nodes.set(id, {
    ...semanticBase(state, node, id, "text", path, material),
    kind: "text",
    inlineChildren,
  });
  return { id, kind: "text" };
}

function collectInlineText(
  state: BuildState,
  children: readonly AuthorTreeNode[],
  path: string,
): string {
  let text = "";

  children.forEach((child, index) => {
    if (child.kind === "text") {
      text += typeof child.value === "string" ? child.value : String(child.value);
      return;
    }

    if (child.kind === "fragment") {
      text += collectInlineText(
        state,
        child.children,
        `${path} > fragment[${keySegment(child.key, index)}]`,
      );
      return;
    }

    if (child.source.kind === "tag" && child.source.tag === "span") {
      text += collectInlineText(
        state,
        child.children,
        `${path} > span[${keySegment(child.key, index)}]`,
      );
      return;
    }

    addDiagnostic(
      state,
      invalidStructure(
        `${path} > ${sourceName(child)}[${index}]`,
        "block content cannot appear inside span",
        "span accepts primitive text or nested inline spans only.",
      ),
    );
  });

  return text;
}

function buildNode(
  state: BuildState,
  node: AuthorTreeNode,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  if (node.kind === "fragment") {
    return buildFragment(state, node, context, index);
  }

  if (node.kind === "text") {
    return context.inline
      ? buildTextRunFromLeaf(state, node, context, index)
      : buildImplicitTextNode(state, node, context, index);
  }

  const kind = nodeSemanticKind(node);
  const segment = `${sourceName(node)}:${keySegment(node.key, index)}`;
  const material = [...context.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${context.path} > ${sourceName(node)}[${keySegment(node.key, index)}]`;

  if (kind === "textRun") {
    if (!context.inline) {
      addDiagnostic(
        state,
        invalidStructure(
          path,
          "span cannot appear here",
          "span must be inside a text-like element.",
          ["Wrap the span in <p>...</p> or move it inside an existing text element."],
        ),
      );
      return undefined;
    }

    const text = collectInlineText(state, node.children, path);
    state.nodes.set(id, {
      ...semanticBase(state, node, id, "textRun", path, material),
      kind: "textRun",
      text,
    });
    return { id, kind: "textRun" };
  }

  if (kind === "text") {
    return buildTextLikeNode(state, node, id, path, material);
  }

  if (kind === "image") {
    if (node.children.length > 0) {
      addDiagnostic(
        state,
        invalidStructure(path, "image cannot have children", "Image nodes are leaf nodes."),
      );
    }

    const assetRef = assetForImage(state, material, node.props, path);
    state.nodes.set(id, {
      ...semanticBase(state, node, id, "image", path, material),
      kind: "image",
      ...(assetRef ? { assetRef } : {}),
    });
    return { id, kind: "image" };
  }

  const childIds = buildChildren(state, node.children, {
    parentId: id,
    parentMaterial: material,
    path,
    inline: false,
  });
  state.nodes.set(id, {
    ...semanticBase(state, node, id, kind, path, material),
    kind,
    children: childIds,
  } as SemanticNode);
  return { id, kind };
}

export function buildSemanticAuthorGraph(roots: readonly AuthorTreeNode[]): {
  graph?: SemanticAuthorGraph;
  diagnostics: Diagnostics;
} {
  const documentId = graphNodeId(["document", "root"]);
  const state: BuildState = {
    nodes: new Map(),
    styles: new Map(),
    assets: new Map(),
    diagnostics: [],
  };

  const slideIds = buildChildren(state, roots, {
    parentId: documentId,
    parentMaterial: ["document", "root"],
    path: "document",
    inline: false,
  });

  const documentNode: SemanticNode = {
    id: documentId,
    kind: "document",
    origin: { kind: "implicit", path: "document" },
    role: { kind: "document" },
    children: slideIds,
  };
  state.nodes.set(documentId, documentNode);

  const diagnostics = createDiagnostics(state.diagnostics);
  return {
    graph: {
      documentId,
      nodes: state.nodes,
      styles: state.styles,
      assets: state.assets,
    },
    diagnostics,
  };
}

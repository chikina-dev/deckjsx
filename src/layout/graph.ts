import type {
  AuthorNode,
  ContentJsxChild,
  DeckOptions,
  SlideFactory,
  TextJsxChild,
} from "../authoring/index";
import type {
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SemanticTextNode,
  StyleEntityId,
} from "../graph";
import type { ProjectedLayoutDocument, ProjectedLayoutOrigin } from "./projected";
import { resolveProjectedLayout } from "./resolve";
import type { ResolvedStyleMap } from "../style/resolve";

function layoutNode<K extends AuthorNode["kind"]>(
  kind: K,
  props: Extract<AuthorNode, { kind: K }>["props"],
  children: Extract<AuthorNode, { kind: K }>["children"],
): Extract<AuthorNode, { kind: K }> {
  return {
    $$typeof: "deckjsx.author-node",
    kind,
    props,
    children,
  } as Extract<AuthorNode, { kind: K }>;
}

function resolvedPropsFor(node: SemanticNode, resolvedStyles: ResolvedStyleMap) {
  const resolved = resolvedStyles.get(node.id);
  if (!resolved) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(resolved.properties)
      .filter(([, property]) => property.source.layer !== "default")
      .map(([key, property]) => [key, property.value]),
  );
}

function pushDefined<T>(values: T[], value: T | undefined): void {
  if (value !== undefined) {
    values.push(value);
  }
}

function collectTextOrigin(
  graph: SemanticAuthorGraph,
  node: SemanticTextNode,
): Pick<ProjectedLayoutOrigin, "graphNodeIds" | "styleEntityIds"> {
  const graphNodeIds: GraphNodeId[] = [node.id];
  const styleEntityIds: StyleEntityId[] = [];
  pushDefined(styleEntityIds, node.styleRef);

  node.inlineChildren.forEach((childId) => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return;
    }

    graphNodeIds.push(child.id);
    pushDefined(styleEntityIds, child.styleRef);
    if (child.kind === "text") {
      const nested = collectTextOrigin(graph, child);
      graphNodeIds.push(...(nested.graphNodeIds ?? []));
      styleEntityIds.push(...(nested.styleEntityIds ?? []));
    }
  });

  return {
    graphNodeIds: [...new Set(graphNodeIds)],
    ...(styleEntityIds.length > 0 ? { styleEntityIds: [...new Set(styleEntityIds)] } : {}),
  };
}

function layoutOriginFor(graph: SemanticAuthorGraph, node: SemanticNode): ProjectedLayoutOrigin {
  if (node.kind === "text") {
    const textOrigin = collectTextOrigin(graph, node);
    return {
      ...textOrigin,
      ...(node.origin.source ? { source: node.origin.source } : {}),
    };
  }

  return {
    graphNodeIds: [node.id],
    ...(node.styleRef ? { styleEntityIds: [node.styleRef] } : {}),
    ...(node.kind === "image" && node.assetRef ? { assetEntityIds: [node.assetRef] } : {}),
    ...(node.origin.source ? { source: node.origin.source } : {}),
  };
}

function rememberOrigin<T extends AuthorNode>(
  node: T,
  origin: ProjectedLayoutOrigin,
  origins: WeakMap<object, ProjectedLayoutOrigin>,
): T {
  origins.set(node, origin);
  return node;
}

function textChildrenFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  childIds: readonly GraphNodeId[],
  origins: WeakMap<object, ProjectedLayoutOrigin>,
): TextJsxChild[] {
  return childIds.flatMap((childId): TextJsxChild[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    if (child.kind === "textRun") {
      return [
        rememberOrigin(
          layoutNode(
            "text",
            resolvedPropsFor(child, resolvedStyles) as Extract<
              AuthorNode,
              { kind: "text" }
            >["props"],
            [child.text],
          ),
          layoutOriginFor(graph, child),
          origins,
        ) as unknown as TextJsxChild,
      ];
    }

    if (child.kind === "text") {
      return textChildrenFromGraph(graph, resolvedStyles, child.inlineChildren, origins);
    }

    return [];
  });
}

function contentChildrenFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  childIds: readonly GraphNodeId[],
  origins: WeakMap<object, ProjectedLayoutOrigin>,
): ContentJsxChild[] {
  return childIds.flatMap((childId): ContentJsxChild[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    const node = layoutAuthorNodeFromGraph(graph, resolvedStyles, child, origins);
    return node ? [node as ContentJsxChild] : [];
  });
}

function layoutAuthorNodeFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticNode,
  origins: WeakMap<object, ProjectedLayoutOrigin>,
): AuthorNode | undefined {
  const props = resolvedPropsFor(node, resolvedStyles);

  switch (node.kind) {
    case "slide":
      return rememberOrigin(
        layoutNode(
          "slide",
          { ...props, name: node.name } as Extract<AuthorNode, { kind: "slide" }>["props"],
          contentChildrenFromGraph(graph, resolvedStyles, node.children, origins),
        ),
        layoutOriginFor(graph, node),
        origins,
      );
    case "container":
      return rememberOrigin(
        layoutNode(
          "view",
          props as Extract<AuthorNode, { kind: "view" }>["props"],
          contentChildrenFromGraph(graph, resolvedStyles, node.children, origins),
        ),
        layoutOriginFor(graph, node),
        origins,
      );
    case "text":
      return rememberOrigin(
        layoutNode(
          "text",
          props as Extract<AuthorNode, { kind: "text" }>["props"],
          textChildrenFromGraph(graph, resolvedStyles, node.inlineChildren, origins),
        ),
        layoutOriginFor(graph, node),
        origins,
      );
    case "image": {
      const asset = node.assetRef ? graph.assets.get(node.assetRef) : undefined;
      return rememberOrigin(
        layoutNode(
          "image",
          {
            ...props,
            ...(asset?.source.kind === "path" ? { src: asset.source.path } : {}),
            ...(asset?.source.kind === "data" ? { data: asset.source.data } : {}),
          } as Extract<AuthorNode, { kind: "image" }>["props"],
          [],
        ),
        layoutOriginFor(graph, node),
        origins,
      );
    }
    case "shape":
      return rememberOrigin(
        layoutNode(
          "shape",
          { ...props, shape: node.shape } as Extract<AuthorNode, { kind: "shape" }>["props"],
          [],
        ),
        layoutOriginFor(graph, node),
        origins,
      );
    case "document":
    case "textRun":
      return undefined;
  }
}

export function resolveProjectedLayoutFromGraph(
  options: DeckOptions,
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
): ProjectedLayoutDocument {
  const origins = new WeakMap<object, ProjectedLayoutOrigin>();
  const document = graph.nodes.get(graph.documentId);
  const slideNodes =
    document?.kind === "document"
      ? document.children
          .map((id) => graph.nodes.get(id))
          .filter(
            (node): node is Extract<SemanticNode, { kind: "slide" }> => node?.kind === "slide",
          )
      : [];
  const slides = slideNodes
    .map((node) => layoutAuthorNodeFromGraph(graph, resolvedStyles, node, origins))
    .filter((node): node is AuthorNode<"slide"> => node?.kind === "slide");

  return resolveProjectedLayout(
    options,
    slides.map((slide) => (() => slide) as SlideFactory<void>),
    { origins },
  );
}

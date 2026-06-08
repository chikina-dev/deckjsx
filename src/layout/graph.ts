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
import type { StyleDeclarationValue } from "../style/types";
import type { SlideTemplateSet, TemplateAreaKind } from "../templates";

function layoutSlideNode(
  props: AuthorNode<"slide">["props"],
  children: readonly ContentJsxChild[],
): AuthorNode<"slide"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "slide",
    props,
    children,
  };
}

function layoutViewNode(
  props: AuthorNode<"view">["props"],
  children: readonly ContentJsxChild[],
): AuthorNode<"view"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "view",
    props,
    children,
  };
}

function layoutTextNode(
  props: AuthorNode<"text">["props"],
  children: readonly TextJsxChild[],
): AuthorNode<"text"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "text",
    props,
    children,
  };
}

function layoutImageNode(props: AuthorNode<"image">["props"]): AuthorNode<"image"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "image",
    props,
    children: [],
  };
}

function layoutShapeNode(props: AuthorNode<"shape">["props"]): AuthorNode<"shape"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "shape",
    props,
    children: [],
  };
}

function resolvedPropsFor<TProps extends object>(
  node: SemanticNode,
  resolvedStyles: ResolvedStyleMap,
): Partial<TProps> {
  const resolved = resolvedStyles.get(node.id);
  if (!resolved) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(resolved.properties)
      .filter(([, property]) => property.source.layer !== "default")
      .map(([key, property]) => [key, property.value]),
  ) as Partial<TProps>;
}

function sourceKeyForOrigin(source: SemanticNode["origin"]["source"]): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

function propsWithTemplateAreaFrame<TProps extends object>(
  resolvedStyles: ResolvedStyleMap,
  node: SemanticNode,
  templates: SlideTemplateSet | undefined,
): Partial<TProps> {
  const props = resolvedPropsFor<TProps>(node, resolvedStyles);
  const ref = node.templateAreaRef;
  if (!ref) {
    return props;
  }

  const frame = templates?.[ref.template]?.areas?.[ref.area]?.frame;
  if (!frame) {
    return props;
  }

  const resolved = resolvedStyles.get(node.id);
  const frameProps: Record<string, StyleDeclarationValue> = {};
  if (resolved?.properties.x?.source.layer !== "style") {
    frameProps.x = frame.x;
  }
  if (resolved?.properties.y?.source.layer !== "style") {
    frameProps.y = frame.y;
  }
  if (resolved?.properties.width?.source.layer !== "style") {
    frameProps.width = frame.width;
  }
  if (resolved?.properties.height?.source.layer !== "style") {
    frameProps.height = frame.height;
  }

  return { ...props, ...frameProps } as Partial<TProps>;
}

function templateAreaKindFor(
  node: SemanticNode,
  templates: SlideTemplateSet | undefined,
): TemplateAreaKind | undefined {
  const ref = node.templateAreaRef;
  if (!ref) {
    return undefined;
  }

  return templates?.[ref.template]?.areas?.[ref.area]?.kind ?? "generic";
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

function layoutOriginFor(
  graph: SemanticAuthorGraph,
  node: SemanticNode,
  templates?: SlideTemplateSet,
): ProjectedLayoutOrigin {
  const templateAreaKind = templateAreaKindFor(node, templates);

  if (node.kind === "text") {
    const textOrigin = collectTextOrigin(graph, node);
    return {
      ...textOrigin,
      ...(node.origin.source ? { source: node.origin.source } : {}),
      ...(node.templateAreaRef ? { templateAreaRef: node.templateAreaRef } : {}),
      ...(templateAreaKind ? { templateAreaKind } : {}),
    };
  }

  return {
    graphNodeIds: [node.id],
    ...(node.styleRef ? { styleEntityIds: [node.styleRef] } : {}),
    ...(node.kind === "image" && node.assetRef ? { assetEntityIds: [node.assetRef] } : {}),
    ...(node.origin.source ? { source: node.origin.source } : {}),
    ...(node.templateAreaRef ? { templateAreaRef: node.templateAreaRef } : {}),
    ...(templateAreaKind ? { templateAreaKind } : {}),
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

function slideFactoryFor(slide: AuthorNode<"slide">): SlideFactory<void> {
  return () => slide;
}

function textChildrenFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  childIds: readonly GraphNodeId[],
  origins: WeakMap<object, ProjectedLayoutOrigin>,
  templates?: SlideTemplateSet,
): TextJsxChild[] {
  return childIds.flatMap((childId): TextJsxChild[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    if (child.kind === "textRun") {
      return [
        rememberOrigin(
          layoutTextNode(resolvedPropsFor<AuthorNode<"text">["props"]>(child, resolvedStyles), [
            child.text,
          ]),
          layoutOriginFor(graph, child, templates),
          origins,
        ),
      ];
    }

    if (child.kind === "text") {
      return textChildrenFromGraph(graph, resolvedStyles, child.inlineChildren, origins, templates);
    }

    return [];
  });
}

function contentChildrenFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  childIds: readonly GraphNodeId[],
  origins: WeakMap<object, ProjectedLayoutOrigin>,
  templates: SlideTemplateSet | undefined,
): ContentJsxChild[] {
  return childIds.flatMap((childId): ContentJsxChild[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    const node = layoutAuthorNodeFromGraph(graph, resolvedStyles, child, origins, templates);
    return node ? [node] : [];
  });
}

function layoutAuthorNodeFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticNode,
  origins: WeakMap<object, ProjectedLayoutOrigin>,
  templates?: SlideTemplateSet,
): AuthorNode | undefined {
  switch (node.kind) {
    case "slide": {
      const props = propsWithTemplateAreaFrame<AuthorNode<"slide">["props"]>(
        resolvedStyles,
        node,
        templates,
      );
      const slideTemplates = graph.templates.get(sourceKeyForOrigin(node.origin.source));
      return rememberOrigin(
        layoutSlideNode(
          { ...props, name: node.name },
          contentChildrenFromGraph(graph, resolvedStyles, node.children, origins, slideTemplates),
        ),
        layoutOriginFor(graph, node, slideTemplates),
        origins,
      );
    }
    case "container": {
      const props = propsWithTemplateAreaFrame<AuthorNode<"view">["props"]>(
        resolvedStyles,
        node,
        templates,
      );
      return rememberOrigin(
        layoutViewNode(
          props,
          contentChildrenFromGraph(graph, resolvedStyles, node.children, origins, templates),
        ),
        layoutOriginFor(graph, node, templates),
        origins,
      );
    }
    case "text": {
      const props = propsWithTemplateAreaFrame<AuthorNode<"text">["props"]>(
        resolvedStyles,
        node,
        templates,
      );
      return rememberOrigin(
        layoutTextNode(
          props,
          textChildrenFromGraph(graph, resolvedStyles, node.inlineChildren, origins, templates),
        ),
        layoutOriginFor(graph, node, templates),
        origins,
      );
    }
    case "image": {
      const props = propsWithTemplateAreaFrame<AuthorNode<"image">["props"]>(
        resolvedStyles,
        node,
        templates,
      );
      const asset = node.assetRef ? graph.assets.get(node.assetRef) : undefined;
      if (!asset) {
        return undefined;
      }

      if (asset.source.kind === "data") {
        return rememberOrigin(
          layoutImageNode({
            ...props,
            data: asset.source.data,
          }),
          layoutOriginFor(graph, node, templates),
          origins,
        );
      }

      return rememberOrigin(
        layoutImageNode({
          ...props,
          src: asset.source.kind === "path" ? asset.source.path : asset.source.url,
        }),
        layoutOriginFor(graph, node, templates),
        origins,
      );
    }
    case "shape": {
      const props = propsWithTemplateAreaFrame<AuthorNode<"shape">["props"]>(
        resolvedStyles,
        node,
        templates,
      );
      return rememberOrigin(
        layoutShapeNode({ ...props, shape: node.shape }),
        layoutOriginFor(graph, node, templates),
        origins,
      );
    }
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

  return resolveProjectedLayout(options, slides.map(slideFactoryFor), { origins });
}

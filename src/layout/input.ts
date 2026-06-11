import type {
  ImageNormalizationInput,
  ShapeNormalizationInput,
  SlideNormalizationInput,
  TextNormalizationInput,
  ViewNormalizationInput,
} from "./normalization";
import type { AssetProbeResult } from "../assets";
import { createDiagnostics, type Diagnostics } from "../diagnostics";
import type {
  AssetEntity,
  AssetEntityId,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SemanticTextNode,
  StyleEntityId,
} from "../graph";
import type { ResolvedStyleMap } from "../style/resolve";
import type { StyleDeclarationValue } from "../style/types";
import type { SlideTemplateSet, TemplateAreaKind } from "../templates";
import type { ProjectedLayoutOrigin, SizeIR } from "./projected";

export type LayoutInputAssetProbe = Pick<
  AssetProbeResult,
  "byteLength" | "extension" | "hash" | "height" | "mediaType" | "width"
>;

export type LayoutInputAssetProbeArtifact = {
  readonly probe?: LayoutInputAssetProbe;
};

export type LayoutInputBuildContext = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetProbeArtifacts?: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact>;
  readonly deckSize?: SizeIR;
  readonly diagnostics?: Diagnostics;
  readonly meta?: LayoutInputDocument["meta"];
};

export type LayoutInputBuildResult = {
  readonly snapshot: LayoutInputDocument;
  readonly diagnostics: Diagnostics;
};

export type LayoutInputDocument = {
  readonly meta?: {
    readonly title?: string;
    readonly author?: string;
    readonly subject?: string;
  };
  readonly size?: SizeIR;
  readonly slides: readonly LayoutInputSlide[];
};

export type LayoutInputSlide = {
  readonly kind: "slide";
  readonly props: SlideNormalizationInput;
  readonly children: readonly LayoutInputContentNode[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputView = {
  readonly kind: "view";
  readonly props: ViewNormalizationInput;
  readonly children: readonly LayoutInputContentNode[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputText = {
  readonly kind: "text";
  readonly props: TextNormalizationInput;
  readonly children: readonly LayoutInputTextChild[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputImage = {
  readonly kind: "image";
  readonly props: ImageNormalizationInput;
  readonly assetProbe?: LayoutInputAssetProbe;
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputShape = {
  readonly kind: "shape";
  readonly props: ShapeNormalizationInput;
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputContentNode =
  | LayoutInputView
  | LayoutInputText
  | LayoutInputImage
  | LayoutInputShape;

export type LayoutInputTextChild =
  | LayoutInputText
  | string
  | number
  | readonly LayoutInputTextChild[];

function pushDefined<T>(values: T[], value: T | undefined): void {
  if (value !== undefined) {
    values.push(value);
  }
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
      .filter(
        ([, property]) =>
          property.source.layer !== "default" && property.source.layer !== "inherited",
      )
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

function textChildrenFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  childIds: readonly GraphNodeId[],
  templates?: SlideTemplateSet,
): LayoutInputTextChild[] {
  return childIds.flatMap((childId): LayoutInputTextChild[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    if (child.kind === "textRun") {
      return [
        {
          kind: "text",
          props: resolvedPropsFor<TextNormalizationInput>(child, resolvedStyles),
          children: [child.text],
          origin: layoutOriginFor(graph, child, templates),
        },
      ];
    }

    if (child.kind === "text") {
      return textChildrenFromGraph(graph, resolvedStyles, child.inlineChildren, templates);
    }

    return [];
  });
}

function contentChildrenFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  childIds: readonly GraphNodeId[],
  assetProbeArtifacts: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact> | undefined,
  templates: SlideTemplateSet | undefined,
): LayoutInputContentNode[] {
  return childIds.flatMap((childId): LayoutInputContentNode[] => {
    const child = graph.nodes.get(childId);
    if (!child) {
      return [];
    }

    const node = layoutInputNodeFromGraph(
      graph,
      resolvedStyles,
      child,
      assetProbeArtifacts,
      templates,
    );
    return node && node.kind !== "slide" ? [node] : [];
  });
}

function layoutInputNodeFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticNode,
  assetProbeArtifacts?: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact>,
  templates?: SlideTemplateSet,
): LayoutInputSlide | LayoutInputContentNode | undefined {
  switch (node.kind) {
    case "slide": {
      const props = propsWithTemplateAreaFrame<SlideNormalizationInput>(
        resolvedStyles,
        node,
        templates,
      );
      const slideTemplates = graph.templates.get(sourceKeyForOrigin(node.origin.source));
      return {
        kind: "slide",
        props: { ...props, name: node.name },
        children: contentChildrenFromGraph(
          graph,
          resolvedStyles,
          node.children,
          assetProbeArtifacts,
          slideTemplates,
        ),
        origin: layoutOriginFor(graph, node, slideTemplates),
      };
    }
    case "container": {
      const props = propsWithTemplateAreaFrame<ViewNormalizationInput>(
        resolvedStyles,
        node,
        templates,
      );
      return {
        kind: "view",
        props,
        children: contentChildrenFromGraph(
          graph,
          resolvedStyles,
          node.children,
          assetProbeArtifacts,
          templates,
        ),
        origin: layoutOriginFor(graph, node, templates),
      };
    }
    case "text": {
      const props = propsWithTemplateAreaFrame<TextNormalizationInput>(
        resolvedStyles,
        node,
        templates,
      );
      return {
        kind: "text",
        props,
        children: textChildrenFromGraph(graph, resolvedStyles, node.inlineChildren, templates),
        origin: layoutOriginFor(graph, node, templates),
      };
    }
    case "image": {
      const props = propsWithTemplateAreaFrame<ImageNormalizationInput>(
        resolvedStyles,
        node,
        templates,
      );
      const asset = node.assetRef ? graph.assets.get(node.assetRef) : undefined;
      if (!asset) {
        return undefined;
      }

      return {
        kind: "image",
        props: { ...props, ...imageSourceProps(asset) },
        ...(node.assetRef ? { assetProbe: assetProbeArtifacts?.get(node.assetRef)?.probe } : {}),
        origin: layoutOriginFor(graph, node, templates),
      };
    }
    case "shape": {
      const props = propsWithTemplateAreaFrame<ShapeNormalizationInput>(
        resolvedStyles,
        node,
        templates,
      );
      return {
        kind: "shape",
        props: { ...props, shape: node.shape },
        origin: layoutOriginFor(graph, node, templates),
      };
    }
    case "document":
    case "textRun":
      return undefined;
  }
}

function imageSourceProps(asset: AssetEntity): Pick<ImageNormalizationInput, "src" | "data"> {
  if (asset.source.kind === "data") {
    return { data: asset.source.data };
  }

  return { src: asset.source.kind === "path" ? asset.source.path : asset.source.url };
}

export function buildLayoutInputSnapshot(input: LayoutInputBuildContext): LayoutInputBuildResult {
  const document = input.graph.nodes.get(input.graph.documentId);
  const slideNodes =
    document?.kind === "document"
      ? document.children
          .map((id) => input.graph.nodes.get(id))
          .filter(
            (node): node is Extract<SemanticNode, { kind: "slide" }> => node?.kind === "slide",
          )
      : [];

  return {
    snapshot: {
      ...(input.meta ? { meta: input.meta } : {}),
      ...(input.deckSize ? { size: input.deckSize } : {}),
      slides: slideNodes
        .map((node) =>
          layoutInputNodeFromGraph(
            input.graph,
            input.resolvedStyles,
            node,
            input.assetProbeArtifacts,
          ),
        )
        .filter((node): node is LayoutInputSlide => node?.kind === "slide"),
    },
    diagnostics: input.diagnostics ?? createDiagnostics(),
  };
}

import type {
  ImageNormalizationInput,
  ShapeNormalizationInput,
  SlideNormalizationInput,
  TableCellNormalizationInput,
  TableNormalizationInput,
  TableRowNormalizationInput,
  TableSectionNormalizationInput,
  TextNormalizationInput,
  VideoNormalizationInput,
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
  SemanticTableCellNode,
  SemanticTableNode,
  SemanticTableRowNode,
  SemanticTableSectionNode,
  SemanticTextNode,
  SemanticVideoNode,
  StyleEntityId,
} from "../graph";
import type { ResolvedStyleMap } from "../style/resolve";
import type { StyleDeclarationValue } from "../style/declaration";
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

export type LayoutInputVideo = {
  readonly kind: "video";
  readonly props: VideoNormalizationInput;
  readonly assetProbe?: LayoutInputAssetProbe;
  readonly posterAssetProbe?: LayoutInputAssetProbe;
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputShape = {
  readonly kind: "shape";
  readonly props: ShapeNormalizationInput;
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputTable = {
  readonly kind: "table";
  readonly props: TableNormalizationInput;
  readonly sections: readonly LayoutInputTableSection[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputTableSection = {
  readonly kind: "tableSection";
  readonly sectionKind: SemanticTableSectionNode["sectionKind"];
  readonly props: TableSectionNormalizationInput;
  readonly rows: readonly LayoutInputTableRow[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputTableRow = {
  readonly kind: "tableRow";
  readonly props: TableRowNormalizationInput;
  readonly cells: readonly LayoutInputTableCell[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputTableCell = {
  readonly kind: "tableCell";
  readonly cellKind: SemanticTableCellNode["cellKind"];
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly props: TableCellNormalizationInput;
  readonly children: readonly LayoutInputContentNode[];
  readonly origin?: ProjectedLayoutOrigin;
};

export type LayoutInputContentNode =
  | LayoutInputView
  | LayoutInputTable
  | LayoutInputText
  | LayoutInputImage
  | LayoutInputVideo
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
          (property.source.layer !== "default" || property.source.defaultKey !== undefined) &&
          property.source.layer !== "inherited",
      )
      .map(([key, property]) => [key, property.value]),
  ) as Partial<TProps>;
}

function sourceKeyForOrigin(source: SemanticNode["origin"]["source"]): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

function mergeTemplateStyle<TProps extends object>(
  props: Partial<TProps>,
  templateStyle: Readonly<Record<string, StyleDeclarationValue>> | undefined,
  resolved: ReturnType<ResolvedStyleMap["get"]>,
): Partial<TProps> {
  if (!templateStyle) {
    return props;
  }

  const next: Record<string, StyleDeclarationValue> = {
    ...(props as Record<string, StyleDeclarationValue>),
  };
  Object.entries(templateStyle).forEach(([key, value]) => {
    if (resolved?.properties[key]?.source.layer !== "style") {
      next[key] = value;
    }
  });
  return next as Partial<TProps>;
}

function propsWithSlideTemplateStyle<TProps extends object>(
  resolvedStyles: ResolvedStyleMap,
  node: SemanticNode,
  templates: SlideTemplateSet | undefined,
): Partial<TProps> {
  const props = resolvedPropsFor<TProps>(node, resolvedStyles);
  const ref = node.kind === "slide" ? node.templateRef : undefined;
  const templateStyle = ref ? templates?.[ref.name]?.style : undefined;
  return mergeTemplateStyle(
    props,
    templateStyle as Readonly<Record<string, StyleDeclarationValue>> | undefined,
    resolvedStyles.get(node.id),
  );
}

function propsWithTemplateAreaPlacement<TProps extends object>(
  resolvedStyles: ResolvedStyleMap,
  node: SemanticNode,
  templates: SlideTemplateSet | undefined,
): Partial<TProps> {
  const props = resolvedPropsFor<TProps>(node, resolvedStyles);
  const ref = node.templateAreaRef;
  if (!ref) {
    return props;
  }

  const area = templates?.[ref.template]?.areas?.[ref.area];
  if (!area) {
    return props;
  }

  const resolved = resolvedStyles.get(node.id);
  return mergeTemplateStyle(
    props,
    area.style as Readonly<Record<string, StyleDeclarationValue>> | undefined,
    resolved,
  );
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
): Pick<ProjectedLayoutOrigin, "componentProvenance" | "graphNodeIds" | "styleEntityIds"> {
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
    ...(node.origin.componentProvenance
      ? { componentProvenance: node.origin.componentProvenance }
      : {}),
  };
}

function collectVideoAssetIds(node: SemanticVideoNode): AssetEntityId[] {
  return [node.assetRef, node.posterAssetRef].filter((id): id is AssetEntityId => id !== undefined);
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
    ...(node.kind === "video" && collectVideoAssetIds(node).length > 0
      ? { assetEntityIds: collectVideoAssetIds(node) }
      : {}),
    ...(node.origin.source ? { source: node.origin.source } : {}),
    ...(node.origin.componentProvenance
      ? { componentProvenance: node.origin.componentProvenance }
      : {}),
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

function tableCellFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTableCellNode,
  assetProbeArtifacts: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact> | undefined,
  templates: SlideTemplateSet | undefined,
): LayoutInputTableCell {
  return {
    kind: "tableCell",
    cellKind: node.cellKind,
    colSpan: node.colSpan,
    rowSpan: node.rowSpan,
    props: resolvedPropsFor<TableCellNormalizationInput>(node, resolvedStyles),
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

function tableRowFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTableRowNode,
  assetProbeArtifacts: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact> | undefined,
  templates: SlideTemplateSet | undefined,
): LayoutInputTableRow {
  return {
    kind: "tableRow",
    props: resolvedPropsFor<TableRowNormalizationInput>(node, resolvedStyles),
    cells: node.children.flatMap((childId): LayoutInputTableCell[] => {
      const child = graph.nodes.get(childId);
      return child?.kind === "tableCell"
        ? [tableCellFromGraph(graph, resolvedStyles, child, assetProbeArtifacts, templates)]
        : [];
    }),
    origin: layoutOriginFor(graph, node, templates),
  };
}

function tableSectionFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTableSectionNode,
  assetProbeArtifacts: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact> | undefined,
  templates: SlideTemplateSet | undefined,
): LayoutInputTableSection {
  return {
    kind: "tableSection",
    sectionKind: node.sectionKind,
    props: resolvedPropsFor<TableSectionNormalizationInput>(node, resolvedStyles),
    rows: node.children.flatMap((childId): LayoutInputTableRow[] => {
      const child = graph.nodes.get(childId);
      return child?.kind === "tableRow"
        ? [tableRowFromGraph(graph, resolvedStyles, child, assetProbeArtifacts, templates)]
        : [];
    }),
    origin: layoutOriginFor(graph, node, templates),
  };
}

function tableFromGraph(
  graph: SemanticAuthorGraph,
  resolvedStyles: ResolvedStyleMap,
  node: SemanticTableNode,
  assetProbeArtifacts: ReadonlyMap<AssetEntityId, LayoutInputAssetProbeArtifact> | undefined,
  templates: SlideTemplateSet | undefined,
): LayoutInputTable {
  return {
    kind: "table",
    props: propsWithTemplateAreaPlacement<TableNormalizationInput>(resolvedStyles, node, templates),
    sections: node.children.flatMap((childId): LayoutInputTableSection[] => {
      const child = graph.nodes.get(childId);
      return child?.kind === "tableSection"
        ? [tableSectionFromGraph(graph, resolvedStyles, child, assetProbeArtifacts, templates)]
        : [];
    }),
    origin: layoutOriginFor(graph, node, templates),
  };
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
      const slideTemplates = graph.templates.get(sourceKeyForOrigin(node.origin.source));
      const props = propsWithSlideTemplateStyle<SlideNormalizationInput>(
        resolvedStyles,
        node,
        slideTemplates,
      );
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
      const props = propsWithTemplateAreaPlacement<ViewNormalizationInput>(
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
    case "table":
      return tableFromGraph(graph, resolvedStyles, node, assetProbeArtifacts, templates);
    case "text": {
      const props = propsWithTemplateAreaPlacement<TextNormalizationInput>(
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
      const props = propsWithTemplateAreaPlacement<ImageNormalizationInput>(
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
    case "video": {
      const props = propsWithTemplateAreaPlacement<VideoNormalizationInput>(
        resolvedStyles,
        node,
        templates,
      );
      const asset = node.assetRef ? graph.assets.get(node.assetRef) : undefined;
      if (!asset) {
        return undefined;
      }
      const posterAsset = node.posterAssetRef ? graph.assets.get(node.posterAssetRef) : undefined;

      return {
        kind: "video",
        props: {
          ...props,
          ...videoSourceProps(asset),
          ...(posterAsset ? videoPosterSourceProps(posterAsset) : {}),
        },
        ...(node.assetRef ? { assetProbe: assetProbeArtifacts?.get(node.assetRef)?.probe } : {}),
        ...(node.posterAssetRef
          ? { posterAssetProbe: assetProbeArtifacts?.get(node.posterAssetRef)?.probe }
          : {}),
        origin: layoutOriginFor(graph, node, templates),
      };
    }
    case "shape": {
      const props = propsWithTemplateAreaPlacement<ShapeNormalizationInput>(
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
    case "tableSection":
    case "tableRow":
    case "tableCell":
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

function videoSourceProps(asset: AssetEntity): Pick<VideoNormalizationInput, "src" | "data"> {
  if (asset.source.kind === "data") {
    return { data: asset.source.data };
  }

  return { src: asset.source.kind === "path" ? asset.source.path : asset.source.url };
}

function videoPosterSourceProps(
  asset: AssetEntity,
): Pick<VideoNormalizationInput, "poster" | "posterData"> {
  if (asset.source.kind === "data") {
    return { posterData: asset.source.data };
  }

  return { poster: asset.source.kind === "path" ? asset.source.path : asset.source.url };
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

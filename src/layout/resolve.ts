import { isContentNode, isSlideNode } from "../jsx";
import { toAuthorJsxNode, toAuthorNode } from "../authoring/author-node";
import {
  normalizeImageProps,
  normalizeShapeProps,
  normalizeSlideProps,
  normalizeTextProps,
  normalizeViewProps,
  parsePlaceContent,
  parsePlaceItems,
  parsePlaceSelf,
  type NormalizedImageProps,
  type NormalizedShapeProps,
  type NormalizedTextProps,
  type NormalizedViewProps,
} from "../compiler/normalization";
import { frameFromProps, inflateSpecifiedBoxSize, parseAspectRatio } from "./absolute";
import { intersectClipRect, type ClipRect, type Frame, type Placement } from "./frame";
import type {
  ProjectedLayoutGroup,
  ImageSourceIR,
  ProjectedLayoutNode,
  ProjectedLayoutDocument,
  ProjectedLayoutOrigin,
  ProjectedLayoutShape,
  ProjectedLayoutSlide,
  ProjectedLayoutText,
  TextRunIR,
  TextStyleIR,
} from "./projected";
import type {
  AuthorNode,
  ContentAuthorNode,
  DeckOptions,
  ImageProps,
  JsxNode,
  SlideFactory,
} from "../authoring/index";
import type {
  CssAlignContent,
  CssAlignSelf,
  CssJustifySelf,
  DeckLength,
  StackAlignment,
  StackAxis,
  ViewStyle,
} from "../style/types";
import type { ComposedAuthorRoot } from "../composition/types";
import {
  advanceGridAutoPlacementCursor,
  markGridItem,
  parseGridAreaShorthand,
  parseGridPlacement,
  parseGridTemplateAreas,
  resolveAutoGridPlacement,
  resolveGridPlacementFromLonghands,
  resolveGridSelfAlignment,
  resolveGridTemplateTracks,
  resolveGridTrackContentMinimums,
  resolveGridTracksWithContentMinimums,
  resolveTrackOffsets,
  stretchTracksToFit,
  type GridAutoPlacementCursor,
  type GridEntryPlacement,
  type GridPlacement,
  type GridTemplateResolution,
  type NamedGridArea,
} from "./grid";
import { parseSpacing, parseSpacingInPoints } from "./spacing";
import {
  buildStackLines,
  resolveCrossGap,
  resolveCrossOffset,
  resolveCrossPlacement,
  resolveFlexMainAllocations,
  resolveJustifyOffset,
  resolveMainGap,
  type StackEntry,
  type StackMetrics,
} from "./stack";
import {
  normalizeTransparency,
  parseObjectPosition,
  resolveBackgroundBoxFrames,
  resolveBackgroundLayers,
} from "../style/background";
import { normalizeColor } from "../style/color";
import { parseLength, parsePointValue, type LengthResolutionContext } from "../style/length";
import {
  parseStrokeLineCap,
  parseStrokeLineJoin,
  resolveNodeStrokes,
  toStroke,
} from "../style/stroke";
import { parseShadowShorthand } from "../style/shadow";
import {
  extractText,
  getTextLengthContext,
  resolveLineHeight,
  resolveListStyle,
  resolveTabStops,
  resolveTextDirection,
  resolveUnderlineStyle,
} from "../style/typography";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../types";

type IdGenerator = {
  nextSlide(): string;
  nextNode(): string;
};

export type ProjectedLayoutResolutionOptions = {
  readonly origins?: WeakMap<object, ProjectedLayoutOrigin>;
};

type LayoutChildNode =
  | {
      kind: "view";
      source: AuthorNode<"view">;
      props: NormalizedViewProps;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "text";
      source: AuthorNode<"text">;
      props: NormalizedTextProps;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "image";
      source: AuthorNode<"image">;
      props: NormalizedImageProps;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "shape";
      source: AuthorNode<"shape">;
      props: NormalizedShapeProps;
      origin?: ProjectedLayoutOrigin;
    };
type ResolvedGridContainerSpec = {
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  contentFrame: Frame;
  columnGapEmu: number;
  rowGapEmu: number;
  defaultAlignSelf: ViewStyle["alignItems"] | CssAlignSelf | undefined;
  defaultJustifySelf: CssJustifySelf | undefined;
  resolvedAlignContent: ViewStyle["alignContent"] | undefined;
  resolvedJustifyContent: ViewStyle["justifyContent"] | undefined;
  namedAreas: Map<string, NamedGridArea>;
  columnTemplate: GridTemplateResolution;
  rowTemplate: GridTemplateResolution;
  areaColumnCount: number;
  areaRowCount: number;
};

type SpacingTuple = [number, number, number, number];

const EMPTY_SPACING: SpacingTuple = [0, 0, 0, 0];

function createIdGenerator(): IdGenerator {
  let slideCount = 0;
  let nodeCount = 0;

  return {
    nextSlide() {
      slideCount += 1;
      return `slide-${slideCount}`;
    },
    nextNode() {
      nodeCount += 1;
      return `node-${nodeCount}`;
    },
  };
}

function imageSourceFromProps(props: NormalizedImageProps): ImageSourceIR {
  if (props.src) {
    return { kind: "path", path: props.src };
  }

  if (props.data) {
    return { kind: "data", data: props.data };
  }

  throw new Error("Image requires either src or data.");
}

function originForNode(
  node: ContentAuthorNode,
  options?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutOrigin | undefined {
  return options?.origins?.get(node);
}

function layoutChildFromNode(
  child: ContentAuthorNode,
  context?: LengthResolutionContext,
  options?: ProjectedLayoutResolutionOptions,
): LayoutChildNode {
  const origin = originForNode(child, options);

  switch (child.kind) {
    case "view":
      return {
        kind: "view",
        source: child,
        props: normalizeViewProps(child.props),
        ...(origin ? { origin } : {}),
      };
    case "text":
      return {
        kind: "text",
        source: child,
        props: normalizeTextProps(child.props),
        ...(origin ? { origin } : {}),
      };
    case "image":
      return {
        kind: "image",
        source: child,
        props: normalizeImageProps(child.props, context),
        ...(origin ? { origin } : {}),
      };
    case "shape":
      return {
        kind: "shape",
        source: child,
        props: normalizeShapeProps(child.props),
        ...(origin ? { origin } : {}),
      };
  }
}

function parseCropValue(value: number | `${number}%` | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    const normalized = Math.abs(value) > 1 ? value / 100 : value;
    return Math.max(0, Math.min(1, normalized));
  }

  if (value.endsWith("%")) {
    return Math.max(0, Math.min(1, Number.parseFloat(value.slice(0, -1)) / 100));
  }

  return 0;
}

function parseImageCrop(
  crop: ImageProps["crop"],
): { top: number; right: number; bottom: number; left: number } | undefined {
  if (!crop) {
    return undefined;
  }

  const normalized = {
    top: parseCropValue(crop.top),
    right: parseCropValue(crop.right),
    bottom: parseCropValue(crop.bottom),
    left: parseCropValue(crop.left),
  };

  if (normalized.left + normalized.right >= 1) {
    throw new Error("Image crop left and right must leave positive source width.");
  }

  if (normalized.top + normalized.bottom >= 1) {
    throw new Error("Image crop top and bottom must leave positive source height.");
  }

  if (
    normalized.top === 0 &&
    normalized.right === 0 &&
    normalized.bottom === 0 &&
    normalized.left === 0
  ) {
    return undefined;
  }

  return normalized;
}
function sortNodesForPaint(nodes: ReadonlyArray<ProjectedLayoutNode>): ProjectedLayoutNode[] {
  return [...nodes]
    .map((node) =>
      node.kind === "group"
        ? {
            ...node,
            children: sortNodesForPaint(node.children),
          }
        : node,
    )
    .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
}

function resolveAlignContentOffset(
  alignContent: StackAlignment | CssAlignContent | undefined,
  availableEmu: number,
  usedEmu: number,
  lineCount: number,
) {
  const free = Math.max(availableEmu - usedEmu, 0);

  if (alignContent === "center") {
    return { offsetEmu: free / 2, extraGapEmu: 0, extraSizeEmu: 0 };
  }

  if (alignContent === "end" || alignContent === "flex-end") {
    return { offsetEmu: free, extraGapEmu: 0, extraSizeEmu: 0 };
  }

  if (alignContent === "space-between") {
    return {
      offsetEmu: 0,
      extraGapEmu: lineCount > 1 ? free / (lineCount - 1) : 0,
      extraSizeEmu: 0,
    };
  }

  if (alignContent === "space-around") {
    const gap = lineCount > 0 ? free / lineCount : 0;
    return { offsetEmu: gap / 2, extraGapEmu: gap, extraSizeEmu: 0 };
  }

  if (alignContent === "space-evenly") {
    const gap = lineCount > 0 ? free / (lineCount + 1) : 0;
    return { offsetEmu: gap, extraGapEmu: gap, extraSizeEmu: 0 };
  }

  if (alignContent === "stretch") {
    return {
      offsetEmu: 0,
      extraGapEmu: 0,
      extraSizeEmu: lineCount > 0 ? free / lineCount : 0,
    };
  }

  return { offsetEmu: 0, extraGapEmu: 0, extraSizeEmu: 0 };
}
function getChildPadding(node: LayoutChildNode, context?: LengthResolutionContext) {
  switch (node.kind) {
    case "view":
      return parseSpacing(node.props.padding, context);
    case "text": {
      const { props } = node;
      return parseSpacing(props.padding, getTextLengthContext(props, context));
    }
    case "image":
      return EMPTY_SPACING;
    case "shape":
      return EMPTY_SPACING;
  }
}

function getNodeLengthContext(
  node: LayoutChildNode,
  context?: LengthResolutionContext,
): LengthResolutionContext | undefined {
  if (node.kind !== "text") {
    return context;
  }

  return {
    ...context,
    ...getTextLengthContext(node.props, context),
  };
}

function resolveChildMainLength(node: LayoutChildNode, axis: StackAxis): DeckLength | undefined {
  const flexBasis = node.props.flexBasis;
  if (flexBasis !== undefined && flexBasis !== "auto") {
    return flexBasis;
  }

  return node.props[axis === "horizontal" ? "width" : "height"];
}

function estimateChildContentSize(
  node: LayoutChildNode,
  dimension: "width" | "height",
  parent: Frame,
  mainAxis?: StackAxis,
  context?: LengthResolutionContext,
) {
  const aspectRatio = parseAspectRatio(node.props.aspectRatio);
  const isMainDimension =
    (mainAxis === "horizontal" && dimension === "width") ||
    (mainAxis === "vertical" && dimension === "height");
  const basis = dimension === "width" ? parent.widthEmu : parent.heightEmu;
  const directValue =
    isMainDimension && mainAxis ? resolveChildMainLength(node, mainAxis) : node.props[dimension];

  if (directValue !== undefined) {
    return inflateSpecifiedBoxSize(
      parseLength(directValue, basis, 0, getNodeLengthContext(node, context)),
      node.kind === "image" ? "border-box" : (node.props.boxSizing ?? "border-box"),
      getChildPadding(node, context),
      dimension,
    );
  }

  if (aspectRatio === undefined) {
    return 0;
  }

  const oppositeDimension = dimension === "width" ? "height" : "width";
  const oppositeBasis = oppositeDimension === "width" ? parent.widthEmu : parent.heightEmu;
  const oppositeIsMain =
    (mainAxis === "horizontal" && oppositeDimension === "width") ||
    (mainAxis === "vertical" && oppositeDimension === "height");
  const oppositeValue =
    oppositeIsMain && mainAxis
      ? resolveChildMainLength(node, mainAxis)
      : node.props[oppositeDimension];

  if (oppositeValue === undefined) {
    return 0;
  }

  const oppositeSize = parseLength(
    oppositeValue,
    oppositeBasis,
    0,
    getNodeLengthContext(node, context),
  );
  const derivedSize =
    dimension === "width" ? oppositeSize * aspectRatio : oppositeSize / aspectRatio;
  return inflateSpecifiedBoxSize(
    derivedSize,
    node.kind === "image" ? "border-box" : (node.props.boxSizing ?? "border-box"),
    getChildPadding(node, context),
    dimension,
  );
}
function getNodeMargin(node: LayoutChildNode, context?: LengthResolutionContext) {
  switch (node.kind) {
    case "view":
      return parseSpacing(node.props.margin, context);
    case "text": {
      const { props } = node;
      return parseSpacing(props.margin, getTextLengthContext(props, context));
    }
    case "image":
      return parseSpacing(node.props.margin, context);
    case "shape":
      return parseSpacing(node.props.margin, context);
  }
}

function estimateChildMainSize(
  node: LayoutChildNode,
  axis: StackAxis,
  parent: Frame,
  context?: LengthResolutionContext,
) {
  const [top, right, bottom, left] = getNodeMargin(node, context);
  const margin = axis === "horizontal" ? left + right : top + bottom;
  return (
    estimateChildContentSize(
      node,
      axis === "horizontal" ? "width" : "height",
      parent,
      axis,
      context,
    ) + margin
  );
}

function estimateChildCrossSize(
  node: LayoutChildNode,
  axis: StackAxis,
  parent: Frame,
  context?: LengthResolutionContext,
) {
  const [top, right, bottom, left] = getNodeMargin(node, context);
  const margin = axis === "horizontal" ? top + bottom : left + right;
  return (
    estimateChildContentSize(
      node,
      axis === "horizontal" ? "height" : "width",
      parent,
      axis,
      context,
    ) + margin
  );
}
function shouldStretchGridDimension(node: LayoutChildNode, dimension: "width" | "height") {
  if (node.props[dimension] !== undefined) {
    return false;
  }

  const aspectRatio = parseAspectRatio(node.props.aspectRatio);
  if (!aspectRatio) {
    return true;
  }

  const oppositeDimension = dimension === "width" ? "height" : "width";
  return node.props[oppositeDimension] === undefined;
}
function resolveChildGridPlacements(
  node: LayoutChildNode,
  namedAreas: Map<string, NamedGridArea>,
): {
  rowPlacement?: GridPlacement;
  columnPlacement?: GridPlacement;
} {
  const explicitRow =
    resolveGridPlacementFromLonghands(node.props.gridRowStart, node.props.gridRowEnd) ??
    parseGridPlacement(node.props.gridRow);
  const explicitColumn =
    resolveGridPlacementFromLonghands(node.props.gridColumnStart, node.props.gridColumnEnd) ??
    parseGridPlacement(node.props.gridColumn);
  const shorthand = parseGridAreaShorthand(node.props.gridArea);
  const namedPlacement =
    node.props.gridArea && !node.props.gridArea.includes("/")
      ? namedAreas.get(node.props.gridArea)
      : undefined;

  return {
    rowPlacement:
      explicitRow ??
      shorthand.rowPlacement ??
      (namedPlacement
        ? {
            start: namedPlacement.row,
            span: namedPlacement.rowSpan,
          }
        : undefined),
    columnPlacement:
      explicitColumn ??
      shorthand.columnPlacement ??
      (namedPlacement
        ? {
            start: namedPlacement.column,
            span: namedPlacement.columnSpan,
          }
        : undefined),
  };
}

function resolveGridContainerSpec(
  parentFrame: Frame,
  options: Pick<
    ViewStyle,
    | "padding"
    | "rowGap"
    | "columnGap"
    | "gridTemplateAreas"
    | "gridTemplateColumns"
    | "gridTemplateRows"
    | "alignItems"
    | "alignContent"
    | "justifyContent"
    | "justifyItems"
    | "placeItems"
    | "placeContent"
  >,
  context?: LengthResolutionContext,
): ResolvedGridContainerSpec {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    options.padding,
    context,
  );
  const contentX = parentFrame.xEmu + paddingLeft;
  const contentY = parentFrame.yEmu + paddingTop;
  const contentWidth = Math.max(parentFrame.widthEmu - paddingLeft - paddingRight, 0);
  const contentHeight = Math.max(parentFrame.heightEmu - paddingTop - paddingBottom, 0);
  const contentFrame: Frame = {
    xEmu: contentX,
    yEmu: contentY,
    widthEmu: contentWidth,
    heightEmu: contentHeight,
  };
  const columnGapEmu = parseLength(options.columnGap ?? options.rowGap, 0, 0, context);
  const rowGapEmu = parseLength(options.rowGap ?? options.columnGap, 0, 0, context);
  const placeItems = parsePlaceItems(options.placeItems);
  const placeContent = parsePlaceContent(options.placeContent);
  const namedAreas = parseGridTemplateAreas(options.gridTemplateAreas);
  const columnTemplate = resolveGridTemplateTracks(
    options.gridTemplateColumns,
    contentWidth,
    columnGapEmu,
    context,
  );
  const rowTemplate = resolveGridTemplateTracks(
    options.gridTemplateRows,
    contentHeight,
    rowGapEmu,
    context,
  );

  return {
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    contentFrame,
    columnGapEmu,
    rowGapEmu,
    defaultAlignSelf: placeItems.alignItems ?? options.alignItems,
    defaultJustifySelf: placeItems.justifyItems ?? options.justifyItems,
    resolvedAlignContent: placeContent.alignContent ?? options.alignContent,
    resolvedJustifyContent: placeContent.justifyContent ?? options.justifyContent,
    namedAreas,
    columnTemplate,
    rowTemplate,
    areaColumnCount: Array.from(namedAreas.values()).reduce(
      (max, area) => Math.max(max, area.column + area.columnSpan - 1),
      0,
    ),
    areaRowCount: Array.from(namedAreas.values()).reduce(
      (max, area) => Math.max(max, area.row + area.rowSpan - 1),
      0,
    ),
  };
}

function compileGridChildren(
  authorChildren: LayoutChildNode[],
  parentFrame: Frame,
  idGenerator: IdGenerator,
  options: Pick<
    ViewStyle,
    | "padding"
    | "rowGap"
    | "columnGap"
    | "gridTemplateAreas"
    | "gridTemplateColumns"
    | "gridTemplateRows"
    | "gridAutoColumns"
    | "gridAutoRows"
    | "alignItems"
    | "alignContent"
    | "justifyContent"
    | "justifyItems"
    | "placeItems"
    | "placeContent"
    | "gridAutoFlow"
  >,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode[] {
  const spec = resolveGridContainerSpec(parentFrame, options, context);
  const orderedChildren = authorChildren
    .map((child, sourceIndex) => ({
      child,
      sourceIndex,
      order: child.props.order ?? 0,
      gridPlacementInfo: resolveChildGridPlacements(child, spec.namedAreas),
    }))
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
  const maxExplicitColumn = orderedChildren.reduce((max, { gridPlacementInfo }) => {
    const placement = gridPlacementInfo.columnPlacement;
    if (placement?.start === undefined) {
      return max;
    }

    return Math.max(max, placement.start + placement.span - 1);
  }, 0);
  const maxExplicitRow = orderedChildren.reduce((max, { gridPlacementInfo }) => {
    const placement = gridPlacementInfo.rowPlacement;
    if (placement?.start === undefined) {
      return max;
    }

    return Math.max(max, placement.start + placement.span - 1);
  }, 0);
  const resolvedColumnTemplate = [
    ...(spec.columnTemplate.tracks.length > 0 ? spec.columnTemplate.tracks : ["1fr"]),
    ...Array.from(
      {
        length: Math.max(
          Math.max(maxExplicitColumn, spec.areaColumnCount) -
            (spec.columnTemplate.tracks.length > 0 ? spec.columnTemplate.tracks.length : 1),
          0,
        ),
      },
      () =>
        typeof options.gridAutoColumns === "number"
          ? `${options.gridAutoColumns}in`
          : String(options.gridAutoColumns ?? "1fr"),
    ),
  ];
  const initialRowCount = Math.max(
    spec.rowTemplate.tracks.length > 0 ? spec.rowTemplate.tracks.length : 1,
    maxExplicitRow,
    spec.areaRowCount,
    1,
  );
  const initialColumnCount = resolvedColumnTemplate.length;
  const occupied: boolean[][] = [];
  const placements: Array<GridEntryPlacement<LayoutChildNode>> = [];
  let autoPlacementCursor: GridAutoPlacementCursor = { row: 1, column: 1 };

  for (const { child, gridPlacementInfo } of orderedChildren) {
    const placement = resolveAutoGridPlacement(
      occupied,
      gridPlacementInfo.rowPlacement,
      gridPlacementInfo.columnPlacement,
      initialColumnCount,
      initialRowCount,
      options.gridAutoFlow,
      autoPlacementCursor,
    );
    markGridItem(
      occupied,
      placement.row,
      placement.column,
      placement.rowSpan,
      placement.columnSpan,
    );
    placements.push({
      child,
      ...placement,
    });
    autoPlacementCursor = advanceGridAutoPlacementCursor(
      placement,
      initialColumnCount,
      initialRowCount,
      options.gridAutoFlow,
    );
  }

  const placementColumnCount = placements.reduce(
    (max, placement) => Math.max(max, placement.column + placement.columnSpan - 1),
    1,
  );
  const placementRowCount = placements.reduce(
    (max, placement) => Math.max(max, placement.row + placement.rowSpan - 1),
    1,
  );
  const columnCount = spec.columnTemplate.collapseTrailingAutoFitTracks
    ? Math.max(placementColumnCount, maxExplicitColumn, 1)
    : Math.max(placementColumnCount, initialColumnCount);
  const resolvedRowCount = spec.rowTemplate.collapseTrailingAutoFitTracks
    ? Math.max(placementRowCount, maxExplicitRow, 1)
    : Math.max(placementRowCount, initialRowCount);
  const fullyResolvedColumnTemplate =
    resolvedColumnTemplate.length >= columnCount
      ? resolvedColumnTemplate.slice(0, columnCount)
      : [
          ...resolvedColumnTemplate,
          ...Array.from({ length: columnCount - resolvedColumnTemplate.length }, () =>
            typeof options.gridAutoColumns === "number"
              ? `${options.gridAutoColumns}in`
              : String(options.gridAutoColumns ?? "1fr"),
          ),
        ];
  const resolvedRowTemplate =
    spec.rowTemplate.tracks.length >= resolvedRowCount
      ? spec.rowTemplate.tracks.slice(0, resolvedRowCount)
      : [
          ...spec.rowTemplate.tracks,
          ...Array.from({ length: resolvedRowCount - spec.rowTemplate.tracks.length }, () =>
            typeof options.gridAutoRows === "number"
              ? `${options.gridAutoRows}in`
              : String(options.gridAutoRows ?? "1fr"),
          ),
        ];
  const gridContentMetrics = {
    getMargin: getNodeMargin,
    estimateContentSize: (
      child: LayoutChildNode,
      dimension: "width" | "height",
      parent: Frame,
      metricContext?: LengthResolutionContext,
    ) => estimateChildContentSize(child, dimension, parent, undefined, metricContext),
  };
  const columnContentMinimums = resolveGridTrackContentMinimums(
    placements,
    fullyResolvedColumnTemplate,
    "column",
    spec.contentFrame,
    spec.columnGapEmu,
    gridContentMetrics,
    context,
  );
  const rowContentMinimums = resolveGridTrackContentMinimums(
    placements,
    resolvedRowTemplate.length > 0
      ? resolvedRowTemplate
      : Array.from({ length: resolvedRowCount }, () => "1fr"),
    "row",
    spec.contentFrame,
    spec.rowGapEmu,
    gridContentMetrics,
    context,
  );
  const columnTracks = resolveGridTracksWithContentMinimums(
    fullyResolvedColumnTemplate,
    spec.contentWidth,
    spec.columnGapEmu,
    columnContentMinimums,
    context,
  );
  const rowTracks = resolveGridTracksWithContentMinimums(
    resolvedRowTemplate.length > 0
      ? resolvedRowTemplate
      : Array.from({ length: resolvedRowCount }, () => "1fr"),
    spec.contentHeight,
    spec.rowGapEmu,
    rowContentMinimums,
    context,
  );
  const stretchedColumnTracks =
    spec.resolvedJustifyContent === "stretch"
      ? stretchTracksToFit(columnTracks, spec.contentWidth, spec.columnGapEmu)
      : columnTracks;
  const stretchedRowTracks =
    spec.resolvedAlignContent === "stretch"
      ? stretchTracksToFit(rowTracks, spec.contentHeight, spec.rowGapEmu)
      : rowTracks;
  const usedColumns =
    stretchedColumnTracks.reduce((sum, size) => sum + size, 0) +
    Math.max(stretchedColumnTracks.length - 1, 0) * spec.columnGapEmu;
  const usedRows =
    stretchedRowTracks.reduce((sum, size) => sum + size, 0) +
    Math.max(stretchedRowTracks.length - 1, 0) * spec.rowGapEmu;
  const inlinePacking = resolveJustifyOffset(
    spec.resolvedJustifyContent,
    spec.contentWidth,
    usedColumns,
    stretchedColumnTracks.length,
  );
  const blockPacking = resolveAlignContentOffset(
    spec.resolvedAlignContent,
    spec.contentHeight,
    usedRows,
    stretchedRowTracks.length,
  );
  const columnOffsets = resolveTrackOffsets(stretchedColumnTracks, spec.columnGapEmu).map(
    (offset) => offset + inlinePacking.offsetEmu,
  );
  const rowOffsets = resolveTrackOffsets(stretchedRowTracks, spec.rowGapEmu).map(
    (offset) => offset + blockPacking.offsetEmu,
  );

  return sortNodesForPaint(
    placements
      .map((placement) => {
        const { child, row, column, rowSpan, columnSpan } = placement;
        const [marginTop, marginRight, marginBottom, marginLeft] = getNodeMargin(child, context);
        const cellWidth =
          stretchedColumnTracks
            .slice(column - 1, column - 1 + columnSpan)
            .reduce((sum, size) => sum + size, 0) +
          Math.max(columnSpan - 1, 0) * spec.columnGapEmu;
        const cellHeight =
          stretchedRowTracks
            .slice(row - 1, row - 1 + rowSpan)
            .reduce((sum, size) => sum + size, 0) +
          Math.max(rowSpan - 1, 0) * spec.rowGapEmu;
        const innerFrame: Frame = {
          xEmu: spec.contentX + (columnOffsets[column - 1] ?? 0) + marginLeft,
          yEmu: spec.contentY + (rowOffsets[row - 1] ?? 0) + marginTop,
          widthEmu: Math.max(cellWidth - marginLeft - marginRight, 0),
          heightEmu: Math.max(cellHeight - marginTop - marginBottom, 0),
        };

        const justifySelf = resolveGridSelfAlignment(
          parsePlaceSelf(child.props.placeSelf).justifySelf ??
            child.props.justifySelf ??
            spec.defaultJustifySelf,
        );
        const alignSelf = resolveGridSelfAlignment(
          parsePlaceSelf(child.props.placeSelf).alignSelf ??
            child.props.alignSelf ??
            spec.defaultAlignSelf,
        );
        const naturalWidth = estimateChildContentSize(
          child,
          "width",
          innerFrame,
          undefined,
          context,
        );
        const naturalHeight = estimateChildContentSize(
          child,
          "height",
          innerFrame,
          undefined,
          context,
        );
        const stretchWidth =
          justifySelf === "stretch" && shouldStretchGridDimension(child, "width");
        const stretchHeight =
          alignSelf === "stretch" && shouldStretchGridDimension(child, "height");
        const renderWidth = stretchWidth ? innerFrame.widthEmu : naturalWidth;
        const renderHeight = stretchHeight ? innerFrame.heightEmu : naturalHeight;
        const xOffset = resolveCrossOffset(
          stretchWidth ? "start" : justifySelf,
          Math.max(innerFrame.widthEmu - renderWidth, 0),
        );
        const yOffset = resolveCrossOffset(
          stretchHeight ? "start" : alignSelf,
          Math.max(innerFrame.heightEmu - renderHeight, 0),
        );
        const placementOverride: Placement = {};
        if (stretchWidth || justifySelf !== "stretch") {
          placementOverride.widthEmu = renderWidth;
        }
        if (stretchHeight || alignSelf !== "stretch") {
          placementOverride.heightEmu = renderHeight;
        }
        if (!stretchWidth) {
          placementOverride.xEmu = innerFrame.xEmu + xOffset;
        }
        if (!stretchHeight) {
          placementOverride.yEmu = innerFrame.yEmu + yOffset;
        }

        return compileNode(
          child,
          innerFrame,
          idGenerator,
          placementOverride,
          clipRect,
          context,
          resolutionOptions,
        );
      })
      .filter((node): node is ProjectedLayoutNode => node !== null),
  );
}

function compileChildren(
  children: ReadonlyArray<JsxNode>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  layout: ViewStyle["layout"],
  options: Pick<
    ViewStyle,
    | "direction"
    | "gap"
    | "rowGap"
    | "columnGap"
    | "gridTemplateAreas"
    | "padding"
    | "alignItems"
    | "justifyContent"
    | "alignContent"
    | "flexWrap"
    | "gridTemplateColumns"
    | "gridTemplateRows"
    | "gridAutoColumns"
    | "gridAutoRows"
    | "gridAutoFlow"
    | "justifyItems"
    | "placeItems"
    | "placeContent"
  >,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode[] {
  const normalized = children.filter(
    (child) => child !== null && child !== undefined && child !== false && child !== true,
  );

  const authorChildren: LayoutChildNode[] = normalized
    .map((child): LayoutChildNode => {
      if (!isContentNode(child)) {
        if (isSlideNode(child)) {
          throw new Error("Slide cannot be nested inside another slide or view.");
        }

        throw new Error("Only deckjsx components can be children of View in structured layout.");
      }

      return layoutChildFromNode(child, context, resolutionOptions);
    })
    .filter((child) => child.props.display !== "none");

  if (layout === "grid") {
    return compileGridChildren(
      authorChildren,
      parentFrame,
      idGenerator,
      {
        padding: options.padding,
        rowGap: options.rowGap,
        columnGap: options.columnGap,
        gridTemplateAreas: options.gridTemplateAreas,
        gridTemplateColumns: options.gridTemplateColumns,
        gridTemplateRows: options.gridTemplateRows,
        gridAutoColumns: options.gridAutoColumns,
        gridAutoRows: options.gridAutoRows,
        alignItems: options.alignItems,
        alignContent: options.alignContent,
        justifyContent: options.justifyContent,
        justifyItems: options.justifyItems,
        placeItems: options.placeItems,
        placeContent: options.placeContent,
        gridAutoFlow: options.gridAutoFlow,
      },
      clipRect,
      context,
      resolutionOptions,
    );
  }

  if (layout !== "stack") {
    return sortNodesForPaint(
      authorChildren
        .map((child) =>
          compileNode(
            child,
            parentFrame,
            idGenerator,
            undefined,
            clipRect,
            context,
            resolutionOptions,
          ),
        )
        .filter((node): node is ProjectedLayoutNode => node !== null),
    );
  }

  const direction = options.direction ?? "vertical";
  const mainGapEmu = resolveMainGap(
    direction,
    options.gap,
    options.rowGap,
    options.columnGap,
    context,
  );
  const crossGapEmu = resolveCrossGap(
    direction,
    options.gap,
    options.rowGap,
    options.columnGap,
    context,
  );
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    options.padding,
    context,
  );
  const contentX = parentFrame.xEmu + paddingLeft;
  const contentY = parentFrame.yEmu + paddingTop;
  const contentWidth = Math.max(parentFrame.widthEmu - paddingLeft - paddingRight, 0);
  const contentHeight = Math.max(parentFrame.heightEmu - paddingTop - paddingBottom, 0);
  const contentFrame: Frame = {
    xEmu: contentX,
    yEmu: contentY,
    widthEmu: contentWidth,
    heightEmu: contentHeight,
  };
  const stackEntries: Array<StackEntry<LayoutChildNode>> = authorChildren.map(
    (child, sourceIndex) => ({
      child,
      sourceIndex,
      order: child.props.order ?? 0,
      position: child.props.position,
    }),
  );
  const stackMetrics: StackMetrics<LayoutChildNode> = {
    estimateMainSize: estimateChildMainSize,
    estimateCrossSize: estimateChildCrossSize,
    getMargin: getNodeMargin,
    getFlexGrow: (child) => child.props.flexGrow ?? 0,
    getFlexShrink: (child) => child.props.flexShrink ?? 1,
  };
  const flowEntries = stackEntries
    .filter((entry) => entry.position !== "absolute")
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
  const absoluteEntries = stackEntries.filter((entry) => entry.position === "absolute");
  const availableMain = direction === "horizontal" ? contentWidth : contentHeight;
  const availableCross = direction === "horizontal" ? contentHeight : contentWidth;
  const lines = buildStackLines(
    flowEntries,
    direction,
    parentFrame,
    availableMain,
    mainGapEmu,
    options.flexWrap,
    stackMetrics,
    context,
  );
  const usedCross =
    lines.reduce((sum, line) => sum + line.crossSizeEmu, 0) +
    Math.max(lines.length - 1, 0) * crossGapEmu;
  const contentPacking = resolveAlignContentOffset(
    options.alignContent,
    availableCross,
    usedCross,
    lines.length,
  );
  let crossCursor = contentPacking.offsetEmu;
  const flowNodes: ProjectedLayoutNode[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const mainAllocations = resolveFlexMainAllocations(
      line,
      direction,
      parentFrame,
      availableMain,
      mainGapEmu,
      stackMetrics,
      context,
    );
    const allocatedUsedMain =
      mainAllocations.reduce((sum, allocation) => sum + allocation.outerMainEmu, 0) +
      Math.max(line.entries.length - 1, 0) * mainGapEmu;
    const justify = resolveJustifyOffset(
      options.justifyContent,
      availableMain,
      allocatedUsedMain,
      line.entries.length,
    );
    let mainCursor = justify.offsetEmu;
    const lineCrossSize =
      lines.length === 1 ? availableCross : line.crossSizeEmu + contentPacking.extraSizeEmu;

    for (const [entryIndex, entry] of line.entries.entries()) {
      const mainAllocation = mainAllocations[entryIndex];
      if (mainAllocation === undefined) {
        throw new Error("Stack layout allocation count did not match line entry count.");
      }

      const { child } = entry;
      const childCross = estimateChildCrossSize(child, direction, parentFrame, context);
      const [marginTop, marginRight, marginBottom, marginLeft] = getNodeMargin(child, context);
      const alignSelf = parsePlaceSelf(child.props.placeSelf).alignSelf ?? child.props.alignSelf;
      let alignment = alignSelf ?? options.alignItems;
      if (alignment === "auto") {
        alignment = undefined;
      }
      if (alignment === "flex-start") {
        alignment = "start";
      }
      if (alignment === "flex-end") {
        alignment = "end";
      }
      const hasExplicitCrossSize =
        child.props[direction === "horizontal" ? "height" : "width"] !== undefined;
      const stretchedCross = Math.max(
        lineCrossSize -
          (direction === "horizontal" ? marginTop + marginBottom : marginLeft + marginRight),
        0,
      );
      const crossPlacement = resolveCrossPlacement(
        alignment,
        stretchedCross,
        Math.max(
          childCross -
            (direction === "horizontal" ? marginTop + marginBottom : marginLeft + marginRight),
          0,
        ),
        hasExplicitCrossSize,
      );

      const placement: Placement =
        direction === "horizontal"
          ? {
              xEmu: contentX + mainCursor + marginLeft,
              yEmu: contentY + crossCursor + crossPlacement.offsetEmu + marginTop,
              widthEmu: mainAllocation.contentMainEmu,
              heightEmu: crossPlacement.sizeEmu,
            }
          : {
              xEmu: contentX + crossCursor + crossPlacement.offsetEmu + marginLeft,
              yEmu: contentY + mainCursor + marginTop,
              heightEmu: mainAllocation.contentMainEmu,
              widthEmu: crossPlacement.sizeEmu,
            };

      mainCursor += mainAllocation.outerMainEmu + mainGapEmu;
      if (entryIndex < line.entries.length - 1) {
        mainCursor += justify.extraGapEmu;
      }

      const compiledNode = compileNode(
        child,
        parentFrame,
        idGenerator,
        placement,
        clipRect,
        context,
        resolutionOptions,
      );
      if (compiledNode) {
        flowNodes.push(compiledNode);
      }
    }

    crossCursor += lineCrossSize + crossGapEmu;
    if (lineIndex < lines.length - 1) {
      crossCursor += contentPacking.extraGapEmu;
    }
  }

  const absoluteNodes = absoluteEntries
    .map((entry) =>
      compileNode(
        entry.child,
        contentFrame,
        idGenerator,
        undefined,
        clipRect,
        context,
        resolutionOptions,
      ),
    )
    .filter((node): node is ProjectedLayoutNode => node !== null);

  return sortNodesForPaint([...flowNodes, ...absoluteNodes]);
}

function compileGroupNode(
  node: Extract<LayoutChildNode, { kind: "view" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutGroup | null {
  const { props } = node;
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const strokes = resolveNodeStrokes(props, context);
  const shadow = parseShadowShorthand(props.boxShadow);
  const originalFrame: Frame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }

  const childClipRect =
    props.overflow === "hidden" ? intersectClipRect(originalFrame, clipRect) : clipRect;
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    visibleFrame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, context),
  );
  const backgroundFill = resolveBackgroundLayers(
    props.backgroundColor ?? props.backgroundImage ?? props.background,
    props.backgroundTransparency,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );

  return {
    id: idGenerator.nextNode(),
    kind: "group",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    opacity: resolved.opacity,
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    fill: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(toStroke(
      props.outlineColor,
      props.outlineWidth,
      props.outlineStyle,
      undefined,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    )
      ? {
          outline: toStroke(
            props.outlineColor,
            props.outlineWidth,
            props.outlineStyle,
            undefined,
            parseStrokeLineCap(props.strokeLinecap),
            parseStrokeLineJoin(props.strokeLinejoin),
            undefined,
            context,
          ),
        }
      : {}),
    ...(shadow ? { shadow } : {}),
    radiusEmu: parseLength(props.borderRadius, 0, 0, context),
    children: compileChildren(
      node.source.children,
      originalFrame,
      idGenerator,
      props.layout,
      {
        direction: props.direction,
        gap: props.gap,
        rowGap: props.rowGap,
        columnGap: props.columnGap,
        padding: props.padding,
        alignItems: props.alignItems,
        justifyContent: props.justifyContent,
        alignContent: props.alignContent,
        flexWrap: props.flexWrap,
        gridTemplateAreas: props.gridTemplateAreas,
        gridTemplateColumns: props.gridTemplateColumns,
        gridTemplateRows: props.gridTemplateRows,
        gridAutoColumns: props.gridAutoColumns,
        gridAutoRows: props.gridAutoRows,
        gridAutoFlow: props.gridAutoFlow,
        justifyItems: props.justifyItems,
        placeItems: props.placeItems,
        placeContent: props.placeContent,
      },
      childClipRect,
      context,
      resolutionOptions,
    ),
  };
}

function textStyleFromProps(
  props: NormalizedTextProps,
  textLengthContext?: LengthResolutionContext,
): TextStyleIR {
  const list = resolveListStyle(props, textLengthContext);
  const lineHeight = resolveLineHeight(props.lineHeight, textLengthContext);
  const underlineStyle = resolveUnderlineStyle(props.textDecorationStyle);
  const underlineColor = normalizeColor(props.textDecorationColor);
  const textDirection = resolveTextDirection(props.writingMode);
  const tabStops = resolveTabStops(props.tabStops, textLengthContext);
  const fontSizePt =
    props.fontSize === undefined
      ? undefined
      : parsePointValue(props.fontSize, 0, textLengthContext);

  return {
    fontFamily: props.fontFamily,
    fontSizePt,
    fontWeight: props.fontWeight,
    italic: props.italic,
    underline: props.underline,
    ...(underlineStyle ? { underlineStyle } : {}),
    ...(underlineColor ? { underlineColor } : {}),
    strike: props.strike,
    color: normalizeColor(props.color),
    textAlign: props.textAlign,
    verticalAlign: props.verticalAlign,
    paddingPt: parseSpacingInPoints(props.padding, textLengthContext),
    lineSpacing: props.lineSpacing ?? lineHeight.lineSpacing,
    lineSpacingMultiple: props.lineSpacingMultiple ?? lineHeight.lineSpacingMultiple,
    paragraphSpacingBefore: props.paragraphSpacingBefore,
    paragraphSpacingAfter: props.paragraphSpacingAfter,
    ...(props.textIndent === undefined
      ? {}
      : { textIndentPt: parsePointValue(props.textIndent, 0, textLengthContext) }),
    ...(tabStops ? { tabStops } : {}),
    charSpacing: props.charSpacing,
    ...(list ? { list } : {}),
    fit: props.fit,
    wrap: props.wrap,
    ...(props.direction === "rtl" ? { rtlMode: true } : {}),
    ...(textDirection ? { textDirection } : {}),
    ...(props.superscript ? { superscript: true } : {}),
    ...(props.subscript ? { subscript: true } : {}),
  };
}

function isEmptyRunStyle(style: TextStyleIR): boolean {
  return Object.values(style).every((value) => value === undefined);
}

function flattenUnknownChildren(children: ReadonlyArray<unknown>): unknown[] {
  return children.flatMap((child): unknown[] =>
    Array.isArray(child) ? flattenUnknownChildren(child) : [child],
  );
}

function extractRichTextRuns(
  children: ReadonlyArray<unknown>,
  textTransform: NormalizedTextProps["textTransform"],
  textLengthContext?: LengthResolutionContext,
): TextRunIR[] {
  const runs: TextRunIR[] = [];

  for (const child of flattenUnknownChildren(children)) {
    if (child === null || child === undefined || child === false || child === true) {
      continue;
    }

    if (typeof child === "string" || typeof child === "number") {
      runs.push({ text: extractText([child], textTransform) });
      continue;
    }

    if (typeof child === "object" && child !== null && "kind" in child) {
      const authorNode = child as AuthorNode;
      if (authorNode.kind !== "text") {
        throw new Error("Text nodes can only contain primitive text or inline text runs.");
      }

      const props = normalizeTextProps(authorNode.props);
      const childLengthContext = getTextLengthContext(props, textLengthContext);
      const style = textStyleFromProps(props, childLengthContext);
      const text = extractRichTextRuns(
        authorNode.children as ReadonlyArray<unknown>,
        props.textTransform ?? textTransform,
        childLengthContext,
      )
        .map((run) => run.text)
        .join("");
      runs.push({
        text,
        ...(!isEmptyRunStyle(style) ? { style } : {}),
      });
    }
  }

  return runs;
}

function compileTextNode(
  node: Extract<LayoutChildNode, { kind: "text" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutText | null {
  const { props } = node;
  const textLengthContext = getTextLengthContext(props, context);
  const resolved = frameFromProps(props, parentFrame, placement, textLengthContext);
  const strokes = resolveNodeStrokes(props, textLengthContext);
  const shadow = parseShadowShorthand(props.textShadow ?? props.boxShadow);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;
  const style = textStyleFromProps(props, textLengthContext);
  const runs = extractRichTextRuns(
    node.source.children as ReadonlyArray<unknown>,
    props.textTransform,
    textLengthContext,
  );

  const visibleFrame = intersectClipRect(
    {
      xEmu: resolved.xEmu,
      yEmu: resolved.yEmu,
      widthEmu: resolved.widthEmu,
      heightEmu: resolved.heightEmu,
    },
    clipRect,
  );

  if (!visibleFrame) {
    return null;
  }

  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    visibleFrame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, textLengthContext),
  );
  const backgroundFill = resolveBackgroundLayers(
    props.backgroundColor ?? props.backgroundImage ?? props.background,
    props.backgroundTransparency,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );

  return {
    id: idGenerator.nextNode(),
    kind: "text",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    opacity: resolved.opacity,
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    content: {
      text: runs.map((run) => run.text).join(""),
      ...(runs.length > 1 || runs.some((run) => run.style) ? { runs } : {}),
    },
    style,
    fill: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(toStroke(
      props.outlineColor,
      props.outlineWidth,
      props.outlineStyle,
      undefined,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      textLengthContext,
    )
      ? {
          outline: toStroke(
            props.outlineColor,
            props.outlineWidth,
            props.outlineStyle,
            undefined,
            parseStrokeLineCap(props.strokeLinecap),
            parseStrokeLineJoin(props.strokeLinejoin),
            undefined,
            textLengthContext,
          ),
        }
      : {}),
    ...(shadow ? { shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: parseLength(props.borderRadius, 0, 0, textLengthContext),
  };
}

function compileImageNode(
  node: Extract<LayoutChildNode, { kind: "image" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutNode | null {
  const { props } = node;
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const shadow = parseShadowShorthand(props.boxShadow);
  const objectPosition = parseObjectPosition(props.objectPosition, {
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  });
  const crop = parseImageCrop(props.crop);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;

  if (!props.src && !props.data) {
    throw new Error("Image requires either src or data.");
  }

  const visibleFrame = intersectClipRect(
    {
      xEmu: resolved.xEmu,
      yEmu: resolved.yEmu,
      widthEmu: resolved.widthEmu,
      heightEmu: resolved.heightEmu,
    },
    clipRect,
  );

  if (!visibleFrame) {
    return null;
  }

  return {
    id: idGenerator.nextNode(),
    kind: "image",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    sourceFrame: {
      xEmu: resolved.xEmu,
      yEmu: resolved.yEmu,
      widthEmu: resolved.widthEmu,
      heightEmu: resolved.heightEmu,
    },
    opacity: resolved.opacity,
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    fit: props.fit ?? "contain",
    ...(objectPosition ? { objectPosition } : {}),
    ...(crop ? { crop } : {}),
    transparency: normalizeTransparency(props.transparency),
    rounding: props.rounding,
    ...(shadow ? { shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    source: imageSourceFromProps(props),
  };
}

function compileShapeNode(
  node: Extract<LayoutChildNode, { kind: "shape" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutShape | null {
  const { props } = node;
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const strokes = resolveNodeStrokes(props, context);
  const shadow = parseShadowShorthand(props.boxShadow);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;

  const visibleFrame = intersectClipRect(
    {
      xEmu: resolved.xEmu,
      yEmu: resolved.yEmu,
      widthEmu: resolved.widthEmu,
      heightEmu: resolved.heightEmu,
    },
    clipRect,
  );

  if (!visibleFrame) {
    return null;
  }

  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    visibleFrame,
    strokes.stroke,
    strokes.edgeStrokes,
  );
  const shapeFill = resolveBackgroundLayers(
    props.fill ?? props.backgroundImage ?? props.background,
    props.fillTransparency,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );

  return {
    id: idGenerator.nextNode(),
    kind: "shape",
    ...(node.origin ? { origin: node.origin } : {}),
    shape: props.shape,
    frame: visibleFrame,
    opacity: resolved.opacity,
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    fill: shapeFill.fill,
    ...(shapeFill.backgroundLayers ? { backgroundLayers: shapeFill.backgroundLayers } : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(toStroke(
      props.outlineColor,
      props.outlineWidth,
      props.outlineStyle,
      undefined,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    )
      ? {
          outline: toStroke(
            props.outlineColor,
            props.outlineWidth,
            props.outlineStyle,
            undefined,
            parseStrokeLineCap(props.strokeLinecap),
            parseStrokeLineJoin(props.strokeLinejoin),
            undefined,
            context,
          ),
        }
      : {}),
    ...(shadow ? { shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: parseLength(props.radius, 0, 0, context),
  };
}

function compileNode(
  child: LayoutChildNode,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode | null {
  switch (child.kind) {
    case "view":
      return compileGroupNode(
        child,
        parentFrame,
        idGenerator,
        placement,
        clipRect,
        context,
        resolutionOptions,
      );
    case "text":
      return compileTextNode(child, parentFrame, idGenerator, placement, clipRect, context);
    case "image":
      return compileImageNode(child, parentFrame, idGenerator, placement, clipRect, context);
    case "shape":
      return compileShapeNode(child, parentFrame, idGenerator, placement, clipRect, context);
  }
}

function compileSlide(
  root: JsxNode,
  context: { slideIndex: number },
  slideFrame: Frame,
  idGenerator: IdGenerator,
  lengthContext?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutSlide {
  if (!isSlideNode(root)) {
    throw new Error(`Slide factory at index ${context.slideIndex} must resolve to a slide node.`);
  }

  const slideProps = normalizeSlideProps(root.props);
  const backgroundBoxFrames = resolveBackgroundBoxFrames(slideFrame);
  const backgroundFill = resolveBackgroundLayers(
    slideProps.backgroundColor ?? slideProps.backgroundImage ?? slideProps.background,
    slideProps.backgroundTransparency,
    {
      widthEmu: slideFrame.widthEmu,
      heightEmu: slideFrame.heightEmu,
    },
    slideFrame,
    backgroundBoxFrames,
    slideProps.backgroundPosition,
    slideProps.backgroundSize,
    slideProps.backgroundRepeat,
    slideProps.backgroundOrigin,
    slideProps.backgroundClip,
  );
  const nodes = root.children
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true)
    .filter(isContentNode)
    .map((child): LayoutChildNode => layoutChildFromNode(child, lengthContext, resolutionOptions))
    .filter((child) => child.props.display !== "none")
    .map((child) =>
      compileNode(
        child,
        slideFrame,
        idGenerator,
        undefined,
        undefined,
        lengthContext,
        resolutionOptions,
      ),
    )
    .filter((node): node is ProjectedLayoutNode => node !== null);

  return {
    id: idGenerator.nextSlide(),
    name: slideProps.name,
    background: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    nodes: sortNodesForPaint(nodes),
  };
}

export function resolveProjectedLayout(
  options: DeckOptions,
  slides: ReadonlyArray<SlideFactory<void>>,
  resolutionOptions: ProjectedLayoutResolutionOptions = {},
): ProjectedLayoutDocument {
  const idGenerator = createIdGenerator();
  const slideSize =
    options.layout.unit === "in"
      ? {
          widthEmu: options.layout.width * EMU_PER_INCH,
          heightEmu: options.layout.height * EMU_PER_INCH,
        }
      : {
          widthEmu: (options.layout.width / POINTS_PER_INCH) * EMU_PER_INCH,
          heightEmu: (options.layout.height / POINTS_PER_INCH) * EMU_PER_INCH,
        };
  const slideFrame: Frame = {
    xEmu: 0,
    yEmu: 0,
    widthEmu: slideSize.widthEmu,
    heightEmu: slideSize.heightEmu,
  };
  const lengthContext: LengthResolutionContext = {
    viewportWidthEmu: slideFrame.widthEmu,
    viewportHeightEmu: slideFrame.heightEmu,
  };

  return {
    version: "layout-snapshot/0.6",
    meta: options.meta,
    size: slideSize,
    slides: slides.map((factory, slideIndex) => {
      return compileSlide(
        toAuthorJsxNode(
          factory({
            composition: {
              slideIndex,
              totalSlides: slides.length,
              deckSlideIndex: slideIndex,
              deckTotalSlides: slides.length,
            },
          }),
        ),
        {
          slideIndex,
        },
        slideFrame,
        idGenerator,
        lengthContext,
        resolutionOptions,
      );
    }),
  };
}

export function resolveProjectedLayoutFromRoots(
  options: DeckOptions,
  roots: readonly ComposedAuthorRoot[],
  resolutionOptions: ProjectedLayoutResolutionOptions = {},
): ProjectedLayoutDocument {
  const idGenerator = createIdGenerator();
  const slideSize =
    options.layout.unit === "in"
      ? {
          widthEmu: options.layout.width * EMU_PER_INCH,
          heightEmu: options.layout.height * EMU_PER_INCH,
        }
      : {
          widthEmu: (options.layout.width / POINTS_PER_INCH) * EMU_PER_INCH,
          heightEmu: (options.layout.height / POINTS_PER_INCH) * EMU_PER_INCH,
        };
  const slideFrame: Frame = {
    xEmu: 0,
    yEmu: 0,
    widthEmu: slideSize.widthEmu,
    heightEmu: slideSize.heightEmu,
  };
  const lengthContext: LengthResolutionContext = {
    viewportWidthEmu: slideFrame.widthEmu,
    viewportHeightEmu: slideFrame.heightEmu,
  };

  return {
    version: "layout-snapshot/0.6",
    meta: options.meta,
    size: slideSize,
    slides: roots.map((root, slideIndex) =>
      compileSlide(
        toAuthorNode(root.root),
        {
          slideIndex,
        },
        slideFrame,
        idGenerator,
        lengthContext,
        resolutionOptions,
      ),
    ),
  };
}

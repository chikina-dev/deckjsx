import type {
  CssAlignItems,
  CssFlexWrap,
  CssJustifyContent,
  DeckLength,
  StackAxis,
} from "../style/types";
import { parseLength, type LengthResolutionContext } from "../style/length";
import { type Frame } from "./frame";

export type StackEntry<TChild> = {
  child: TChild;
  sourceIndex: number;
  order: number;
  position: string | undefined;
};

export type StackLine<TChild> = {
  entries: Array<StackEntry<TChild>>;
  usedMainEmu: number;
  crossSizeEmu: number;
};

export type FlexMainAllocation = {
  contentMainEmu: number;
  outerMainEmu: number;
};

export type StackMetrics<TChild> = {
  estimateMainSize(
    child: TChild,
    direction: StackAxis,
    parentFrame: Frame,
    context?: LengthResolutionContext,
  ): number;
  estimateCrossSize(
    child: TChild,
    direction: StackAxis,
    parentFrame: Frame,
    context?: LengthResolutionContext,
  ): number;
  getMargin(child: TChild, context?: LengthResolutionContext): [number, number, number, number];
  getFlexGrow(child: TChild): number;
  getFlexShrink(child: TChild): number;
};

export function resolveJustifyOffset(
  justifyContent: CssJustifyContent | undefined,
  availableEmu: number,
  usedEmu: number,
  childCount: number,
) {
  const free = Math.max(availableEmu - usedEmu, 0);

  if (justifyContent === "center") {
    return { offsetEmu: free / 2, extraGapEmu: 0 };
  }

  if (justifyContent === "end" || justifyContent === "flex-end") {
    return { offsetEmu: free, extraGapEmu: 0 };
  }

  if (justifyContent === "space-between") {
    return {
      offsetEmu: 0,
      extraGapEmu: childCount > 1 ? free / (childCount - 1) : 0,
    };
  }

  if (justifyContent === "space-around") {
    const gap = childCount > 0 ? free / childCount : 0;
    return { offsetEmu: gap / 2, extraGapEmu: gap };
  }

  if (justifyContent === "space-evenly") {
    const gap = childCount > 0 ? free / (childCount + 1) : 0;
    return { offsetEmu: gap, extraGapEmu: gap };
  }

  return { offsetEmu: 0, extraGapEmu: 0 };
}

export function resolveCrossOffset(alignment: CssAlignItems | undefined, freeEmu: number) {
  if (alignment === "center") {
    return freeEmu / 2;
  }

  if (alignment === "end" || alignment === "flex-end") {
    return freeEmu;
  }

  return 0;
}

export function resolveCrossPlacement(
  alignment: CssAlignItems | undefined,
  availableCross: number,
  childCross: number,
  hasExplicitCrossSize: boolean,
) {
  const free = Math.max(availableCross - childCross, 0);

  if (alignment === "stretch" && !hasExplicitCrossSize) {
    return {
      offsetEmu: 0,
      sizeEmu: availableCross,
    };
  }

  return {
    offsetEmu: resolveCrossOffset(alignment, free),
    sizeEmu: childCross,
  };
}

export function resolveMainGap(
  direction: StackAxis,
  gap: DeckLength | undefined,
  rowGap: DeckLength | undefined,
  columnGap: DeckLength | undefined,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
) {
  return parseLength(
    direction === "horizontal" ? (columnGap ?? gap ?? rowGap) : (rowGap ?? gap ?? columnGap),
    percentageBaseEmu,
    0,
    context,
  );
}

export function resolveCrossGap(
  direction: StackAxis,
  gap: DeckLength | undefined,
  rowGap: DeckLength | undefined,
  columnGap: DeckLength | undefined,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
) {
  return parseLength(
    direction === "horizontal" ? (rowGap ?? gap ?? columnGap) : (columnGap ?? gap ?? rowGap),
    percentageBaseEmu,
    0,
    context,
  );
}

export function buildStackLines<TChild>(
  entries: Array<StackEntry<TChild>>,
  direction: StackAxis,
  parentFrame: Frame,
  availableMain: number,
  mainGapEmu: number,
  flexWrap: CssFlexWrap | undefined,
  metrics: StackMetrics<TChild>,
  context?: LengthResolutionContext,
): Array<StackLine<TChild>> {
  if (entries.length === 0) {
    return [];
  }

  const lines: Array<StackLine<TChild>> = [];
  let currentLine: StackLine<TChild> = {
    entries: [],
    usedMainEmu: 0,
    crossSizeEmu: 0,
  };

  for (const entry of entries) {
    const childMain = metrics.estimateMainSize(entry.child, direction, parentFrame, context);
    const childCross = metrics.estimateCrossSize(entry.child, direction, parentFrame, context);
    const nextUsedMain =
      currentLine.entries.length === 0
        ? childMain
        : currentLine.usedMainEmu + mainGapEmu + childMain;

    const shouldWrap =
      flexWrap === "wrap" && currentLine.entries.length > 0 && nextUsedMain > availableMain;

    if (shouldWrap) {
      lines.push(currentLine);
      currentLine = {
        entries: [entry],
        usedMainEmu: childMain,
        crossSizeEmu: childCross,
      };
      continue;
    }

    currentLine.entries.push(entry);
    currentLine.usedMainEmu = nextUsedMain;
    currentLine.crossSizeEmu = Math.max(currentLine.crossSizeEmu, childCross);
  }

  if (currentLine.entries.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export function resolveFlexMainAllocations<TChild>(
  line: StackLine<TChild>,
  direction: StackAxis,
  parentFrame: Frame,
  availableMain: number,
  mainGapEmu: number,
  metrics: StackMetrics<TChild>,
  context?: LengthResolutionContext,
): FlexMainAllocation[] {
  const itemCount = line.entries.length;
  const baseItems = line.entries.map((entry) => {
    const [marginTop, marginRight, marginBottom, marginLeft] = metrics.getMargin(
      entry.child,
      context,
    );
    const mainMarginEmu =
      direction === "horizontal" ? marginLeft + marginRight : marginTop + marginBottom;
    const contentMainEmu = Math.max(
      metrics.estimateMainSize(entry.child, direction, parentFrame, context) - mainMarginEmu,
      0,
    );

    return {
      contentMainEmu,
      mainMarginEmu,
      flexGrow: metrics.getFlexGrow(entry.child),
      flexShrink: metrics.getFlexShrink(entry.child),
    };
  });
  const gapTotal = Math.max(itemCount - 1, 0) * mainGapEmu;
  const baseOuterTotal =
    baseItems.reduce((sum, item) => sum + item.contentMainEmu + item.mainMarginEmu, 0) + gapTotal;
  const freeSpace = availableMain - baseOuterTotal;

  if (freeSpace > 0) {
    const totalGrow = baseItems.reduce((sum, item) => sum + item.flexGrow, 0);
    if (totalGrow > 0) {
      return baseItems.map((item) => {
        const contentMainEmu = item.contentMainEmu + (freeSpace * item.flexGrow) / totalGrow;
        return {
          contentMainEmu,
          outerMainEmu: contentMainEmu + item.mainMarginEmu,
        };
      });
    }
  }

  if (freeSpace < 0) {
    const totalShrinkWeight = baseItems.reduce(
      (sum, item) => sum + item.flexShrink * item.contentMainEmu,
      0,
    );
    if (totalShrinkWeight > 0) {
      return baseItems.map((item) => {
        const reduction = (-freeSpace * item.flexShrink * item.contentMainEmu) / totalShrinkWeight;
        const contentMainEmu = Math.max(item.contentMainEmu - reduction, 0);
        return {
          contentMainEmu,
          outerMainEmu: contentMainEmu + item.mainMarginEmu,
        };
      });
    }
  }

  return baseItems.map((item) => ({
    contentMainEmu: item.contentMainEmu,
    outerMainEmu: item.contentMainEmu + item.mainMarginEmu,
  }));
}

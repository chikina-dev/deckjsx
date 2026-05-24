import {
  type CssAlignSelf,
  type CssGridAutoFlow,
  type CssGridLine,
  type CssGridShorthand,
  type CssGridTrack,
  type CssGridTemplate,
  type CssGridTemplateAreas,
  type CssJustifySelf,
  type ViewStyle,
} from "../style/types";
import type { ViewProps } from "../authoring/index";
import {
  isDeckLengthString,
  parseLengthToken,
  type LengthResolutionContext,
} from "../style/length";
import { type Frame } from "./frame";

export type GridPlacement = {
  start?: number;
  span: number;
};

export type GridAutoPlacementCursor = {
  row: number;
  column: number;
};

export type GridEntryPlacement<TChild = unknown> = {
  child: TChild;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};

export type NamedGridArea = {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};

export type GridTrackDefinition =
  | {
      kind: "fixed";
      sizeEmu: number;
    }
  | {
      kind: "flex";
      minEmu: number;
      fr: number;
    };

export type GridTemplateResolution = {
  tracks: string[];
  collapseTrailingAutoFitTracks: boolean;
};

function parseGridTemplate(value: CssGridTemplate | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string") {
    return value
      .map((track) => (typeof track === "number" ? `${track}in` : String(track).trim()))
      .filter(Boolean);
  }

  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      current += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  const expanded: string[] = [];

  for (const token of tokens) {
    const repeatMatch = token.match(/^repeat\((\d+),(.*)\)$/i);
    if (!repeatMatch) {
      expanded.push(token);
      continue;
    }

    const count = Number.parseInt(repeatMatch[1] ?? "0", 10);
    const inner = parseGridTemplate(repeatMatch[2]?.trim());
    for (let index = 0; index < count; index += 1) {
      expanded.push(...inner);
    }
  }

  return expanded;
}

function parseAutoRepeatToken(token: string):
  | {
      mode: "auto-fit" | "auto-fill";
      innerTracks: string[];
    }
  | undefined {
  const match = token.match(/^repeat\((auto-fit|auto-fill),(.*)\)$/i);
  if (!match) {
    return undefined;
  }

  const mode = match[1]?.toLowerCase();
  if (mode !== "auto-fit" && mode !== "auto-fill") {
    return undefined;
  }

  return {
    mode,
    innerTracks: parseGridTemplate(match[2]?.trim()),
  };
}

function splitFunctionArguments(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function resolveGridTrackMinimum(
  track: string,
  availableEmu: number,
  context?: LengthResolutionContext,
): number {
  const minmaxMatch = track.match(/^minmax\((.*)\)$/i);
  if (minmaxMatch) {
    const [minToken] = splitFunctionArguments(minmaxMatch[1] ?? "");
    if (!minToken || minToken.toLowerCase() === "auto") {
      return 0;
    }

    return parseLengthToken(minToken, availableEmu, 0, context);
  }

  if (track.endsWith("fr")) {
    return 0;
  }

  return parseLengthToken(track, availableEmu, 0, context);
}

function isAutoMinGridTrack(track: string) {
  const minmaxMatch = track.match(/^minmax\((.*)\)$/i);
  if (!minmaxMatch) {
    return false;
  }

  const [minToken] = splitFunctionArguments(minmaxMatch[1] ?? "");
  return minToken?.toLowerCase() === "auto";
}

function resolveAutoRepeatCount(
  innerTracks: string[],
  availableEmu: number,
  gapEmu: number,
  context?: LengthResolutionContext,
): number {
  if (innerTracks.length === 0) {
    return 1;
  }

  const innerMinimum =
    innerTracks.reduce(
      (sum, track) => sum + resolveGridTrackMinimum(track, availableEmu, context),
      0,
    ) +
    Math.max(innerTracks.length - 1, 0) * gapEmu;

  if (innerMinimum <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor((availableEmu + gapEmu) / (innerMinimum + gapEmu)));
}

export function resolveGridTemplateTracks(
  value: CssGridTemplate | undefined,
  availableEmu: number,
  gapEmu: number,
  context?: LengthResolutionContext,
): GridTemplateResolution {
  const tokens = parseGridTemplate(value);
  if (tokens.length === 0) {
    return {
      tracks: [],
      collapseTrailingAutoFitTracks: false,
    };
  }

  const tracks: string[] = [];
  let collapseTrailingAutoFitTracks = false;

  for (const token of tokens) {
    const autoRepeat = parseAutoRepeatToken(token);
    if (!autoRepeat) {
      tracks.push(token);
      continue;
    }

    const count = resolveAutoRepeatCount(autoRepeat.innerTracks, availableEmu, gapEmu, context);
    for (let index = 0; index < count; index += 1) {
      tracks.push(...autoRepeat.innerTracks);
    }

    if (tokens.length === 1 && autoRepeat.mode === "auto-fit") {
      collapseTrailingAutoFitTracks = true;
    }
  }

  return {
    tracks,
    collapseTrailingAutoFitTracks,
  };
}

function parseGridTrackDefinition(
  track: string,
  availableEmu: number,
  contentMinEmu = 0,
  context?: LengthResolutionContext,
): GridTrackDefinition {
  const minmaxMatch = track.match(/^minmax\((.*)\)$/i);
  if (minmaxMatch) {
    const [minToken, maxToken] = splitFunctionArguments(minmaxMatch[1] ?? "");
    const minEmu =
      minToken?.toLowerCase() === "auto" || minToken === undefined
        ? contentMinEmu
        : parseLengthToken(minToken, availableEmu, 0, context);

    if (!maxToken || maxToken.toLowerCase() === "auto") {
      return {
        kind: "fixed",
        sizeEmu: minEmu,
      };
    }

    if (maxToken.endsWith("fr")) {
      return {
        kind: "flex",
        minEmu,
        fr: Number.parseFloat(maxToken.slice(0, -2)) || 0,
      };
    }

    return {
      kind: "fixed",
      sizeEmu: Math.max(minEmu, parseLengthToken(maxToken, availableEmu, minEmu, context)),
    };
  }

  if (track.endsWith("fr")) {
    return {
      kind: "flex",
      minEmu: 0,
      fr: Number.parseFloat(track.slice(0, -2)) || 0,
    };
  }

  return {
    kind: "fixed",
    sizeEmu: parseLengthToken(track, availableEmu, 0, context),
  };
}

export function resolveGridTracksWithContentMinimums(
  tracks: string[],
  availableEmu: number,
  gapEmu: number,
  contentMinimumsEmu?: number[],
  context?: LengthResolutionContext,
): number[] {
  if (tracks.length === 0) {
    return [availableEmu];
  }

  const gapTotal = Math.max(tracks.length - 1, 0) * gapEmu;
  const distributable = Math.max(availableEmu - gapTotal, 0);
  const definitions = tracks.map((track, index) =>
    parseGridTrackDefinition(track, distributable, contentMinimumsEmu?.[index] ?? 0, context),
  );
  const fixedTotal = definitions.reduce(
    (sum, definition) => sum + (definition.kind === "fixed" ? definition.sizeEmu : 0),
    0,
  );
  const flexMinTotal = definitions.reduce(
    (sum, definition) => sum + (definition.kind === "flex" ? definition.minEmu : 0),
    0,
  );
  const totalFr = definitions.reduce(
    (sum, definition) => sum + (definition.kind === "flex" ? definition.fr : 0),
    0,
  );
  const remaining = Math.max(distributable - fixedTotal - flexMinTotal, 0);

  return definitions.map((definition) => {
    if (definition.kind === "fixed") {
      return definition.sizeEmu;
    }

    return definition.minEmu + (totalFr > 0 ? (remaining * definition.fr) / totalFr : 0);
  });
}

export function resolveGridTrackContentMinimums<TChild>(
  placements: Array<GridEntryPlacement<TChild>>,
  tracks: string[],
  axis: "column" | "row",
  parentFrame: Frame,
  gapEmu: number,
  metrics: {
    getMargin(child: TChild, context?: LengthResolutionContext): [number, number, number, number];
    estimateContentSize(
      child: TChild,
      dimension: "width" | "height",
      parent: Frame,
      context?: LengthResolutionContext,
    ): number;
  },
  context?: LengthResolutionContext,
): number[] {
  const minimums = Array.from({ length: tracks.length }, () => 0);
  const availableEmu = axis === "column" ? parentFrame.widthEmu : parentFrame.heightEmu;

  for (const placement of placements) {
    const span = axis === "column" ? placement.columnSpan : placement.rowSpan;
    const startIndex = (axis === "column" ? placement.column : placement.row) - 1;
    const endIndex = startIndex + span;
    if (startIndex < 0 || endIndex > tracks.length) {
      continue;
    }

    const [marginTop, marginRight, marginBottom, marginLeft] = metrics.getMargin(
      placement.child,
      context,
    );
    const contentMinimum =
      axis === "column"
        ? metrics.estimateContentSize(placement.child, "width", parentFrame, context) +
          marginLeft +
          marginRight
        : metrics.estimateContentSize(placement.child, "height", parentFrame, context) +
          marginTop +
          marginBottom;
    const coveredTracks = tracks.slice(startIndex, endIndex);
    const autoTrackIndexes = coveredTracks
      .map((track, offset) => (isAutoMinGridTrack(track) ? startIndex + offset : undefined))
      .filter((index): index is number => index !== undefined);

    if (autoTrackIndexes.length === 0) {
      continue;
    }

    const fixedCoveredMinimum =
      coveredTracks.reduce((sum, track, offset) => {
        if (isAutoMinGridTrack(track)) {
          return sum;
        }

        return (
          sum +
          resolveGridTrackMinimum(track, availableEmu, context) +
          (minimums[startIndex + offset] ?? 0)
        );
      }, 0) +
      Math.max(span - 1, 0) * gapEmu;
    const distributedMinimum = Math.max(
      (contentMinimum - fixedCoveredMinimum) / autoTrackIndexes.length,
      0,
    );

    for (const index of autoTrackIndexes) {
      minimums[index] = Math.max(minimums[index] ?? 0, distributedMinimum);
    }
  }

  return minimums;
}

export function parseGridPlacement(value: string | number | undefined): GridPlacement | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return {
      start: Math.max(1, Math.floor(value)),
      span: 1,
    };
  }

  const normalized = value.replace(/\s+/g, "").toLowerCase();

  if (normalized.startsWith("span")) {
    return {
      span: Math.max(1, Number.parseInt(normalized.slice(4), 10) || 1),
    };
  }

  const [startPart, endPart] = normalized.split("/");
  const start = Math.max(1, Number.parseInt(startPart ?? "", 10) || 1);

  if (!endPart) {
    return { start, span: 1 };
  }

  if (endPart.startsWith("span")) {
    return {
      start,
      span: Math.max(1, Number.parseInt(endPart.slice(4), 10) || 1),
    };
  }

  const end = Math.max(start + 1, Number.parseInt(endPart, 10) || start + 1);
  return {
    start,
    span: end - start,
  };
}

export function resolveGridPlacementFromLonghands(
  startValue: CssGridLine | undefined,
  endValue: CssGridLine | undefined,
): GridPlacement | undefined {
  const start = startValue === "auto" ? undefined : startValue;
  const end = endValue === "auto" ? undefined : endValue;

  if (start === undefined && end === undefined) {
    return undefined;
  }

  if (typeof start === "string" && start.startsWith("span")) {
    return parseGridPlacement(start);
  }

  if (typeof end === "string" && end.startsWith("span")) {
    if (start === undefined) {
      return parseGridPlacement(end);
    }

    return parseGridPlacement(`${start} / ${end}`);
  }

  if (start !== undefined && end !== undefined) {
    return parseGridPlacement(`${start} / ${end}`);
  }

  if (start !== undefined) {
    return parseGridPlacement(start.toString());
  }

  return undefined;
}

export function parseGridAreaShorthand(value: string | undefined): {
  rowPlacement?: GridPlacement;
  columnPlacement?: GridPlacement;
} {
  if (!value || !value.includes("/")) {
    return {};
  }

  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const resolvePlacement = (start?: string, end?: string) => {
    if (!start || start === "auto") {
      return undefined;
    }

    if (!end || end === "auto") {
      return parseGridPlacement(start);
    }

    return parseGridPlacement(`${start} / ${end}`);
  };

  return {
    rowPlacement: resolvePlacement(parts[0], parts[2]),
    columnPlacement: resolvePlacement(parts[1], parts[3]),
  };
}

export function parseGridAutoFlow(value: CssGridAutoFlow | undefined): {
  axis: "row" | "column";
  dense: boolean;
} {
  if (value === "column") {
    return { axis: "column", dense: false };
  }

  if (value === "row dense") {
    return { axis: "row", dense: true };
  }

  if (value === "column dense") {
    return { axis: "column", dense: true };
  }

  return { axis: "row", dense: false };
}

export function parseGridTemplateAreas(
  value: CssGridTemplateAreas | undefined,
): Map<string, NamedGridArea> {
  if (value === undefined) {
    return new Map();
  }

  const rows = (typeof value === "string" ? value.split(/\n/) : value)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.replace(/^["']|["']$/g, ""));
  const matrix = rows.map((row) => row.split(/\s+/).filter(Boolean));

  if (matrix.length === 0) {
    return new Map();
  }

  const columnCount = matrix[0]?.length ?? 0;
  for (const row of matrix) {
    if (row.length !== columnCount) {
      throw new Error("gridTemplateAreas rows must all have the same number of columns.");
    }
  }

  const areas = new Map<string, NamedGridArea>();

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const token = matrix[rowIndex]?.[columnIndex];
      if (!token || token === ".") {
        continue;
      }

      const existing = areas.get(token);
      if (!existing) {
        areas.set(token, {
          row: rowIndex + 1,
          column: columnIndex + 1,
          rowSpan: 1,
          columnSpan: 1,
        });
        continue;
      }

      existing.rowSpan = Math.max(existing.rowSpan, rowIndex - (existing.row - 1) + 1);
      existing.columnSpan = Math.max(existing.columnSpan, columnIndex - (existing.column - 1) + 1);
    }
  }

  for (const [name, area] of areas) {
    for (let row = area.row; row < area.row + area.rowSpan; row += 1) {
      for (let column = area.column; column < area.column + area.columnSpan; column += 1) {
        if (matrix[row - 1]?.[column - 1] !== name) {
          throw new Error(`gridTemplateAreas area "${name}" must form a solid rectangle.`);
        }
      }
    }
  }

  return areas;
}
function splitGridTemplateShorthand(value: string): [string, string | undefined] {
  let quote: '"' | "'" | undefined;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      continue;
    }

    if (char === "/" && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }

  return [value.trim(), undefined];
}

function tokenizeCssShorthand(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let depth = 0;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      current += char;
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      current += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function tokenizeGridTemplateRows(value: string): string[] {
  return tokenizeCssShorthand(value);
}

export function parseGridTemplateShorthand(value: string | undefined): {
  gridTemplateAreas?: CssGridTemplateAreas;
  gridTemplateRows?: CssGridTemplate;
  gridTemplateColumns?: CssGridTemplate;
} {
  if (!value) {
    return {};
  }

  const [left, right] = splitGridTemplateShorthand(value);
  const gridTemplateColumns = right && right.length > 0 ? right : undefined;
  const rowTokens = tokenizeGridTemplateRows(left);

  if (!rowTokens.some((token) => token.startsWith('"') || token.startsWith("'"))) {
    return {
      gridTemplateRows: left || undefined,
      gridTemplateColumns,
    };
  }

  const areas: string[] = [];
  const rows: CssGridTrack[] = [];

  for (let index = 0; index < rowTokens.length; index += 1) {
    const token = rowTokens[index];
    if (token === undefined) {
      continue;
    }

    if (!(token.startsWith('"') || token.startsWith("'"))) {
      throw new Error(
        "gridTemplate shorthand with named areas must place each area row inside quotes.",
      );
    }

    areas.push(token);
    const next = rowTokens[index + 1];
    if (next && !(next.startsWith('"') || next.startsWith("'"))) {
      rows.push(parseGridTrackValue(next) ?? "1fr");
      index += 1;
      continue;
    }

    rows.push("1fr");
  }

  return {
    gridTemplateAreas: areas,
    gridTemplateRows: rows,
    gridTemplateColumns,
  };
}

function parseGridAutoFlowShorthandSegment(
  value: string | undefined,
  axis: "row" | "column",
): {
  gridAutoFlow?: CssGridAutoFlow;
  trackSize?: ViewStyle["gridAutoRows"];
} {
  if (!value) {
    return {};
  }

  const tokens = tokenizeCssShorthand(value);
  const autoFlowIndex = tokens.findIndex((token) => token.toLowerCase() === "auto-flow");
  if (autoFlowIndex === -1) {
    return {};
  }

  const denseTokens = tokens.filter((token) => token.toLowerCase() === "dense");
  const otherTokens = tokens.filter((token) => {
    const normalized = token.toLowerCase();
    return normalized !== "auto-flow" && normalized !== "dense";
  });
  const trackSize = parseGridTrackValue(otherTokens.join(" "));

  return {
    gridAutoFlow: resolveGridAutoFlow(axis, denseTokens.length > 0),
    trackSize,
  };
}

function resolveGridAutoFlow(axis: "row" | "column", dense: boolean): CssGridAutoFlow {
  if (!dense) {
    return axis;
  }

  return axis === "row" ? "row dense" : "column dense";
}

function isFractionalGridTrack(value: string): value is `${number}fr` {
  return /^-?\d*\.?\d+fr$/i.test(value);
}

function isMinmaxGridTrack(value: string): value is `minmax(${string})` {
  return /^minmax\(.+\)$/i.test(value);
}

function parseGridTrackValue(value: string): CssGridTrack | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isFractionalGridTrack(trimmed) || isMinmaxGridTrack(trimmed)) {
    return trimmed;
  }

  if (trimmed === "0") {
    return 0;
  }

  return isDeckLengthString(trimmed) ? trimmed : undefined;
}

export function parseGridShorthand(value: CssGridShorthand | undefined): {
  display?: ViewStyle["display"];
  gridTemplateAreas?: CssGridTemplateAreas;
  gridTemplateRows?: CssGridTemplate;
  gridTemplateColumns?: CssGridTemplate;
  gridAutoColumns?: ViewStyle["gridAutoColumns"];
  gridAutoRows?: ViewStyle["gridAutoRows"];
  gridAutoFlow?: CssGridAutoFlow;
} {
  if (!value) {
    return {};
  }

  const [left, right] = splitGridTemplateShorthand(value);
  if (right === undefined) {
    return {
      display: "grid",
      ...parseGridTemplateShorthand(left),
    };
  }

  const rowAutoFlow = parseGridAutoFlowShorthandSegment(left, "row");
  const columnAutoFlow = parseGridAutoFlowShorthandSegment(right, "column");

  if (rowAutoFlow.gridAutoFlow && columnAutoFlow.gridAutoFlow) {
    throw new Error('grid shorthand cannot contain "auto-flow" on both sides of "/".');
  }

  if (rowAutoFlow.gridAutoFlow) {
    return {
      display: "grid",
      gridAutoFlow: rowAutoFlow.gridAutoFlow,
      gridAutoRows: rowAutoFlow.trackSize,
      gridTemplateColumns: right,
    };
  }

  if (columnAutoFlow.gridAutoFlow) {
    return {
      display: "grid",
      gridTemplateRows: left,
      gridAutoFlow: columnAutoFlow.gridAutoFlow,
      gridAutoColumns: columnAutoFlow.trackSize,
    };
  }

  return {
    display: "grid",
    ...parseGridTemplateShorthand(value),
  };
}

export function resolveGridContainerAuthoring(
  props: ViewProps,
): Pick<
  ViewStyle,
  | "display"
  | "gridTemplateAreas"
  | "gridTemplateRows"
  | "gridTemplateColumns"
  | "gridAutoColumns"
  | "gridAutoRows"
  | "gridAutoFlow"
> {
  const gridShorthand = parseGridShorthand(props.grid);
  const templateShorthand = parseGridTemplateShorthand(props.gridTemplate);
  return {
    display: props.display ?? gridShorthand.display,
    gridTemplateAreas:
      props.gridTemplateAreas ??
      templateShorthand.gridTemplateAreas ??
      gridShorthand.gridTemplateAreas,
    gridTemplateRows:
      props.gridTemplateRows ??
      templateShorthand.gridTemplateRows ??
      gridShorthand.gridTemplateRows,
    gridTemplateColumns:
      props.gridTemplateColumns ??
      templateShorthand.gridTemplateColumns ??
      gridShorthand.gridTemplateColumns,
    gridAutoColumns: props.gridAutoColumns ?? gridShorthand.gridAutoColumns,
    gridAutoRows: props.gridAutoRows ?? gridShorthand.gridAutoRows,
    gridAutoFlow: props.gridAutoFlow ?? gridShorthand.gridAutoFlow,
  };
}

function canPlaceGridItem(
  occupied: boolean[][],
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
  columnCount: number,
) {
  if (column + columnSpan - 1 > columnCount) {
    return false;
  }

  for (let rowIndex = row; rowIndex < row + rowSpan; rowIndex += 1) {
    const rowSlots = occupied[rowIndex] ?? [];
    for (let columnIndex = column; columnIndex < column + columnSpan; columnIndex += 1) {
      if (rowSlots[columnIndex]) {
        return false;
      }
    }
  }

  return true;
}

export function markGridItem(
  occupied: boolean[][],
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
) {
  for (let rowIndex = row; rowIndex < row + rowSpan; rowIndex += 1) {
    const occupiedRow = (occupied[rowIndex] ??= []);
    for (let columnIndex = column; columnIndex < column + columnSpan; columnIndex += 1) {
      occupiedRow[columnIndex] = true;
    }
  }
}

export function resolveAutoGridPlacement(
  occupied: boolean[][],
  rowPlacement: GridPlacement | undefined,
  columnPlacement: GridPlacement | undefined,
  columnCount: number,
  rowCount: number,
  autoFlow: CssGridAutoFlow | undefined,
  cursor: GridAutoPlacementCursor,
) {
  const flow = parseGridAutoFlow(autoFlow);
  const rowSpan = rowPlacement?.span ?? 1;
  const columnSpan = columnPlacement?.span ?? 1;

  if (rowPlacement?.start !== undefined && columnPlacement?.start !== undefined) {
    return {
      row: rowPlacement.start,
      column: columnPlacement.start,
      rowSpan,
      columnSpan,
    };
  }

  if (rowPlacement?.start !== undefined) {
    for (let column = 1; column < 10_000; column += 1) {
      if (
        canPlaceGridItem(
          occupied,
          rowPlacement.start,
          column,
          rowSpan,
          columnSpan,
          Math.max(columnCount, column + columnSpan - 1),
        )
      ) {
        return {
          row: rowPlacement.start,
          column,
          rowSpan,
          columnSpan,
        };
      }
    }
  }

  if (columnPlacement?.start !== undefined) {
    for (let row = 1; row < 10_000; row += 1) {
      if (
        canPlaceGridItem(occupied, row, columnPlacement.start, rowSpan, columnSpan, columnCount)
      ) {
        return {
          row,
          column: columnPlacement.start,
          rowSpan,
          columnSpan,
        };
      }
    }
  }

  const startRow = flow.dense ? 1 : cursor.row;
  const startColumn = flow.dense ? 1 : cursor.column;

  if (flow.axis === "column") {
    for (let column = startColumn; column < 10_000; column += 1) {
      const rowStart = column === startColumn ? startRow : 1;
      for (let row = rowStart; row <= rowCount; row += 1) {
        if (row + rowSpan - 1 > rowCount) {
          continue;
        }

        if (
          canPlaceGridItem(
            occupied,
            row,
            column,
            rowSpan,
            columnSpan,
            Math.max(columnCount, column + columnSpan - 1),
          )
        ) {
          return {
            row,
            column,
            rowSpan,
            columnSpan,
          };
        }
      }
    }
  }

  for (let row = startRow; row < 10_000; row += 1) {
    const columnStart = row === startRow ? startColumn : 1;
    for (let column = columnStart; column <= columnCount; column += 1) {
      if (canPlaceGridItem(occupied, row, column, rowSpan, columnSpan, columnCount)) {
        return {
          row,
          column,
          rowSpan,
          columnSpan,
        };
      }
    }
  }

  throw new Error("Unable to place grid item.");
}

export function advanceGridAutoPlacementCursor(
  placement: Pick<GridEntryPlacement, "row" | "column">,
  columnCount: number,
  rowCount: number,
  autoFlow: CssGridAutoFlow | undefined,
): GridAutoPlacementCursor {
  const flow = parseGridAutoFlow(autoFlow);

  if (flow.axis === "column") {
    const nextRow = placement.row + 1;
    if (nextRow > rowCount) {
      return {
        row: 1,
        column: placement.column + 1,
      };
    }

    return {
      row: nextRow,
      column: placement.column,
    };
  }

  const nextColumn = placement.column + 1;
  if (nextColumn > columnCount) {
    return {
      row: placement.row + 1,
      column: 1,
    };
  }

  return {
    row: placement.row,
    column: nextColumn,
  };
}

export function resolveTrackOffsets(tracks: number[], gapEmu: number) {
  const offsets: number[] = [];
  let cursor = 0;

  for (const track of tracks) {
    offsets.push(cursor);
    cursor += track + gapEmu;
  }

  return offsets;
}

export function stretchTracksToFit(
  tracks: number[],
  availableEmu: number,
  gapEmu: number,
): number[] {
  if (tracks.length === 0) {
    return tracks;
  }

  const usedEmu =
    tracks.reduce((sum, size) => sum + size, 0) + Math.max(tracks.length - 1, 0) * gapEmu;
  const freeEmu = availableEmu - usedEmu;

  if (freeEmu <= 0) {
    return tracks;
  }

  const extraPerTrack = freeEmu / tracks.length;
  return tracks.map((track) => track + extraPerTrack);
}

export function resolveGridSelfAlignment(
  value: CssAlignSelf | CssJustifySelf | undefined,
): "start" | "center" | "end" | "stretch" {
  if (value === undefined || value === "auto" || value === "stretch") {
    return "stretch";
  }

  if (value === "flex-start") {
    return "start";
  }

  if (value === "flex-end") {
    return "end";
  }

  return value;
}

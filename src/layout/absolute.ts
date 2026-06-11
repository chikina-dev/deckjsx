import type {
  CssAspectRatio,
  CssBoxSizing,
  CssPosition,
  DeckLength,
  Spacing,
} from "../style/types";
import { isCssWideKeyword, parseLength, type LengthResolutionContext } from "../style/length";
import {
  applyAffineMatrix,
  matrixTranslatePxToEmu,
  normalizeRotation,
  parseTransformOrigin,
  parseTransformShorthand,
  rotateVectorClockwise,
  skewVector,
} from "../style/transform";
import { type Frame, type Placement } from "./frame";
import { parseSpacing, resolveInset } from "./spacing";

export function parseAspectRatio(value: CssAspectRatio | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return value > 0 ? value : undefined;
  }

  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (normalized === "auto") {
    return undefined;
  }

  if (!normalized.includes("/")) {
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const [widthPart, heightPart] = normalized.split("/");
  const width = Number.parseFloat(widthPart ?? "");
  const height = Number.parseFloat(heightPart ?? "");

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  return width / height;
}

function parseTransformShorthandOrIgnore(value?: string) {
  try {
    return parseTransformShorthand(value);
  } catch {
    return undefined;
  }
}

function parseTransformOriginOrCenter(
  value: string | undefined,
  context: { widthEmu: number; heightEmu: number },
  lengthContext?: LengthResolutionContext,
) {
  try {
    return parseTransformOrigin(value, context, lengthContext);
  } catch {
    return { x: 0.5, y: 0.5 };
  }
}

export function inflateSpecifiedBoxSize(
  valueEmu: number,
  boxSizing: CssBoxSizing | undefined,
  padding: [number, number, number, number],
  dimension: "width" | "height",
) {
  if (boxSizing !== "content-box") {
    return valueEmu;
  }

  return valueEmu + (dimension === "width" ? padding[1] + padding[3] : padding[0] + padding[2]);
}

function nonAutoLength(value: DeckLength | undefined): DeckLength | undefined {
  if (
    typeof value === "string" &&
    (value.trim().toLowerCase() === "auto" || isCssWideKeyword(value))
  ) {
    return undefined;
  }

  return value;
}

function specifiedLength(value: DeckLength | undefined): DeckLength | undefined {
  return nonAutoLength(value);
}

export function frameFromProps(
  props: {
    x?: DeckLength;
    y?: DeckLength;
    inset?: Spacing;
    left?: DeckLength;
    top?: DeckLength;
    right?: DeckLength;
    bottom?: DeckLength;
    width?: DeckLength;
    height?: DeckLength;
    aspectRatio?: CssAspectRatio;
    boxSizing?: CssBoxSizing;
    padding?: Spacing;
    minWidth?: DeckLength;
    minHeight?: DeckLength;
    maxWidth?: DeckLength;
    maxHeight?: DeckLength;
    position?: CssPosition;
    opacity?: number;
    rotation?: number;
    transform?: string;
    transformOrigin?: string;
    zIndex?: number;
    flipH?: boolean;
    flipV?: boolean;
  },
  parent: Frame,
  placement?: Placement,
  context?: LengthResolutionContext,
) {
  const transform = parseTransformShorthandOrIgnore(props.transform);
  const resolvedInset = resolveInset(props.inset, props.top, props.right, props.bottom, props.left);
  const isRelativePosition = props.position === "relative";
  const relativeLeft = nonAutoLength(props.x ?? resolvedInset?.left);
  const relativeTop = nonAutoLength(props.y ?? resolvedInset?.top);
  const relativeRight = nonAutoLength(resolvedInset?.right);
  const relativeBottom = nonAutoLength(resolvedInset?.bottom);
  const specifiedWidth = specifiedLength(props.width);
  const specifiedHeight = specifiedLength(props.height);
  const resolvedX = isRelativePosition ? undefined : relativeLeft;
  const resolvedY = isRelativePosition ? undefined : relativeTop;
  const resolvedRight = isRelativePosition ? undefined : relativeRight;
  const resolvedBottom = isRelativePosition ? undefined : relativeBottom;
  const aspectRatio = parseAspectRatio(props.aspectRatio);
  const padding = parseSpacing(props.padding, context, parent.widthEmu);
  const boxSizing = props.boxSizing ?? "border-box";
  const minWidthEmu = parseLength(props.minWidth, parent.widthEmu, 0, context);
  const minHeightEmu = parseLength(props.minHeight, parent.heightEmu, 0, context);
  const maxWidthEmu = parseLength(
    props.maxWidth,
    parent.widthEmu,
    Number.POSITIVE_INFINITY,
    context,
  );
  const maxHeightEmu = parseLength(
    props.maxHeight,
    parent.heightEmu,
    Number.POSITIVE_INFINITY,
    context,
  );

  const clampSize = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

  const baseWidth =
    placement?.widthEmu ??
    (specifiedWidth !== undefined
      ? parseLength(specifiedWidth, parent.widthEmu, 0, context)
      : resolvedX !== undefined && resolvedRight !== undefined
        ? Math.max(
            parent.widthEmu -
              parseLength(resolvedX, parent.widthEmu, 0, context) -
              parseLength(resolvedRight, parent.widthEmu, 0, context),
            0,
          )
        : 0);
  const baseHeight =
    placement?.heightEmu ??
    (specifiedHeight !== undefined
      ? parseLength(specifiedHeight, parent.heightEmu, 0, context)
      : resolvedY !== undefined && resolvedBottom !== undefined
        ? Math.max(
            parent.heightEmu -
              parseLength(resolvedY, parent.heightEmu, 0, context) -
              parseLength(resolvedBottom, parent.heightEmu, 0, context),
            0,
          )
        : 0);
  const aspectResolvedWidth =
    baseWidth === 0 && aspectRatio !== undefined && baseHeight > 0
      ? baseHeight * aspectRatio
      : baseWidth;
  const aspectResolvedHeight =
    baseHeight === 0 && aspectRatio !== undefined && aspectResolvedWidth > 0
      ? aspectResolvedWidth / aspectRatio
      : baseHeight;
  const clampedWidth = clampSize(aspectResolvedWidth, minWidthEmu, maxWidthEmu);
  const clampedHeight = clampSize(aspectResolvedHeight, minHeightEmu, maxHeightEmu);
  const widthUsesSpecifiedBox =
    specifiedWidth !== undefined ||
    (specifiedHeight !== undefined && aspectRatio !== undefined && baseWidth === 0);
  const heightUsesSpecifiedBox =
    specifiedHeight !== undefined ||
    (specifiedWidth !== undefined && aspectRatio !== undefined && baseHeight === 0);
  const resolvedWidth =
    placement?.widthEmu !== undefined || !widthUsesSpecifiedBox
      ? clampedWidth
      : inflateSpecifiedBoxSize(clampedWidth, boxSizing, padding, "width");
  const resolvedHeight =
    placement?.heightEmu !== undefined || !heightUsesSpecifiedBox
      ? clampedHeight
      : inflateSpecifiedBoxSize(clampedHeight, boxSizing, padding, "height");

  const absoluteX =
    resolvedX !== undefined
      ? parent.xEmu + parseLength(resolvedX, parent.widthEmu, 0, context)
      : resolvedRight !== undefined &&
          (props.width !== undefined || placement?.widthEmu !== undefined)
        ? parent.xEmu +
          parent.widthEmu -
          parseLength(resolvedRight, parent.widthEmu, 0, context) -
          resolvedWidth
        : parent.xEmu;

  const absoluteY =
    resolvedY !== undefined
      ? parent.yEmu + parseLength(resolvedY, parent.heightEmu, 0, context)
      : resolvedBottom !== undefined &&
          (props.height !== undefined || placement?.heightEmu !== undefined)
        ? parent.yEmu +
          parent.heightEmu -
          parseLength(resolvedBottom, parent.heightEmu, 0, context) -
          resolvedHeight
        : parent.yEmu;

  const relativeOffsetX =
    isRelativePosition && relativeLeft !== undefined
      ? parseLength(relativeLeft, parent.widthEmu, 0, context)
      : isRelativePosition && relativeRight !== undefined
        ? -parseLength(relativeRight, parent.widthEmu, 0, context)
        : 0;
  const relativeOffsetY =
    isRelativePosition && relativeTop !== undefined
      ? parseLength(relativeTop, parent.heightEmu, 0, context)
      : isRelativePosition && relativeBottom !== undefined
        ? -parseLength(relativeBottom, parent.heightEmu, 0, context)
        : 0;

  let transformedX = (placement?.xEmu ?? absoluteX) + relativeOffsetX;
  let transformedY = (placement?.yEmu ?? absoluteY) + relativeOffsetY;
  let transformedWidth = resolvedWidth;
  let transformedHeight = resolvedHeight;
  let transformRotation = 0;
  let transformFlipH = false;
  let transformFlipV = false;
  const transformOrigin = parseTransformOriginOrCenter(
    props.transformOrigin,
    {
      widthEmu: resolvedWidth,
      heightEmu: resolvedHeight,
    },
    context,
  );

  for (const operation of transform ?? []) {
    const currentCenterX = transformedX + transformedWidth / 2;
    const currentCenterY = transformedY + transformedHeight / 2;
    const currentOriginX = transformFlipH ? 1 - transformOrigin.x : transformOrigin.x;
    const currentOriginY = transformFlipV ? 1 - transformOrigin.y : transformOrigin.y;
    const currentOriginVector = {
      x: (currentOriginX - 0.5) * transformedWidth,
      y: (currentOriginY - 0.5) * transformedHeight,
    };
    const currentOriginOffset = rotateVectorClockwise(
      currentOriginVector.x,
      currentOriginVector.y,
      transformRotation,
    );
    const anchorX = currentCenterX + currentOriginOffset.x;
    const anchorY = currentCenterY + currentOriginOffset.y;

    if (operation.kind === "rotate") {
      transformRotation = normalizeRotation(transformRotation + operation.angle);
      const nextOriginOffset = rotateVectorClockwise(
        currentOriginVector.x,
        currentOriginVector.y,
        transformRotation,
      );
      transformedX = anchorX - nextOriginOffset.x - transformedWidth / 2;
      transformedY = anchorY - nextOriginOffset.y - transformedHeight / 2;
      continue;
    }

    if (operation.kind === "translate") {
      transformedX += parseLength(operation.x, transformedWidth, 0, context);
      transformedY += parseLength(operation.y, transformedHeight, 0, context);
      continue;
    }

    if (operation.kind === "skew") {
      const corners = [
        {
          x: -currentOriginX * transformedWidth,
          y: -currentOriginY * transformedHeight,
        },
        {
          x: (1 - currentOriginX) * transformedWidth,
          y: -currentOriginY * transformedHeight,
        },
        {
          x: -currentOriginX * transformedWidth,
          y: (1 - currentOriginY) * transformedHeight,
        },
        {
          x: (1 - currentOriginX) * transformedWidth,
          y: (1 - currentOriginY) * transformedHeight,
        },
      ].map((corner) => skewVector(corner.x, corner.y, operation.x, operation.y));
      const minX = Math.min(...corners.map((corner) => corner.x));
      const maxX = Math.max(...corners.map((corner) => corner.x));
      const minY = Math.min(...corners.map((corner) => corner.y));
      const maxY = Math.max(...corners.map((corner) => corner.y));
      const nextWidth = maxX - minX;
      const nextHeight = maxY - minY;
      const nextCenterLocal = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
      };
      const nextCenterOffset = rotateVectorClockwise(
        nextCenterLocal.x,
        nextCenterLocal.y,
        transformRotation,
      );
      transformedX = anchorX + nextCenterOffset.x - nextWidth / 2;
      transformedY = anchorY + nextCenterOffset.y - nextHeight / 2;
      transformedWidth = nextWidth;
      transformedHeight = nextHeight;
      continue;
    }

    if (operation.kind === "matrix") {
      const matrix = {
        a: operation.a,
        b: operation.b,
        c: operation.c,
        d: operation.d,
        txEmu: matrixTranslatePxToEmu(operation.txPx),
        tyEmu: matrixTranslatePxToEmu(operation.tyPx),
      };
      const corners = [
        {
          x: -currentOriginX * transformedWidth,
          y: -currentOriginY * transformedHeight,
        },
        {
          x: (1 - currentOriginX) * transformedWidth,
          y: -currentOriginY * transformedHeight,
        },
        {
          x: -currentOriginX * transformedWidth,
          y: (1 - currentOriginY) * transformedHeight,
        },
        {
          x: (1 - currentOriginX) * transformedWidth,
          y: (1 - currentOriginY) * transformedHeight,
        },
      ].map((corner) => applyAffineMatrix(corner.x, corner.y, matrix));
      const minX = Math.min(...corners.map((corner) => corner.x));
      const maxX = Math.max(...corners.map((corner) => corner.x));
      const minY = Math.min(...corners.map((corner) => corner.y));
      const maxY = Math.max(...corners.map((corner) => corner.y));
      const nextWidth = maxX - minX;
      const nextHeight = maxY - minY;
      const nextCenterLocal = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
      };
      const nextCenterOffset = rotateVectorClockwise(
        nextCenterLocal.x,
        nextCenterLocal.y,
        transformRotation,
      );
      transformedX = anchorX + nextCenterOffset.x - nextWidth / 2;
      transformedY = anchorY + nextCenterOffset.y - nextHeight / 2;
      transformedWidth = nextWidth;
      transformedHeight = nextHeight;
      continue;
    }

    const nextWidth = transformedWidth * Math.abs(operation.x);
    const nextHeight = transformedHeight * Math.abs(operation.y);
    const nextFlipH = operation.x < 0 ? !transformFlipH : transformFlipH;
    const nextFlipV = operation.y < 0 ? !transformFlipV : transformFlipV;
    const nextOriginX = nextFlipH ? 1 - transformOrigin.x : transformOrigin.x;
    const nextOriginY = nextFlipV ? 1 - transformOrigin.y : transformOrigin.y;
    const nextOriginVector = {
      x: (nextOriginX - 0.5) * nextWidth,
      y: (nextOriginY - 0.5) * nextHeight,
    };
    const nextOriginOffset = rotateVectorClockwise(
      nextOriginVector.x,
      nextOriginVector.y,
      transformRotation,
    );
    transformedX = anchorX - nextOriginOffset.x - nextWidth / 2;
    transformedY = anchorY - nextOriginOffset.y - nextHeight / 2;
    transformedWidth = nextWidth;
    transformedHeight = nextHeight;
    if (operation.x < 0) {
      transformFlipH = !transformFlipH;
    }
    if (operation.y < 0) {
      transformFlipV = !transformFlipV;
    }
  }

  return {
    xEmu: transformedX,
    yEmu: transformedY,
    widthEmu: transformedWidth,
    heightEmu: transformedHeight,
    opacity: props.opacity,
    rotation: props.rotation ?? (transformRotation !== 0 ? transformRotation : undefined),
    zIndex: props.zIndex,
    flipH: props.flipH ?? (transformFlipH ? true : undefined),
    flipV: props.flipV ?? (transformFlipV ? true : undefined),
  };
}

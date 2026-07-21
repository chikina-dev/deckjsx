import type { PdfContentOp, PdfPageAnnotation, PdfRectangle, PdfVisualElement } from "./model";

function generatedLayerWeight(visual: PdfVisualElement): number {
  if (
    visual.paintOrder.generatedLayerRole === "shadow" &&
    visual.paintOrder.generatedLayerPlacement === "aboveAuthored"
  ) {
    return 0.5;
  }
  if (
    visual.paintOrder.generatedLayerRole === "shadow" &&
    visual.paintOrder.generatedLayerPlacement === "aboveBackground"
  ) {
    return -1;
  }

  switch (visual.paintOrder.generatedLayerRole) {
    case "shadow":
      return -3;
    case "background":
    case "filter":
      return -2;
    case "border":
      return 1;
    case "outline":
      return 2;
    case "authored":
    case undefined:
      return 0;
  }
}

export function comparePdfVisualsByPaintOrder(
  left: PdfVisualElement,
  right: PdfVisualElement,
): number {
  const zIndexOrder = (left.paintOrder.zIndex ?? 0) - (right.paintOrder.zIndex ?? 0);
  if (zIndexOrder !== 0) {
    return zIndexOrder;
  }

  if (left.paintOrder.sequence !== undefined && right.paintOrder.sequence !== undefined) {
    return left.paintOrder.sequence - right.paintOrder.sequence;
  }

  const leftOwnerOrder = Math.round(left.paintOrder.siblingOrder);
  const rightOwnerOrder = Math.round(right.paintOrder.siblingOrder);
  return (
    leftOwnerOrder - rightOwnerOrder ||
    generatedLayerWeight(left) - generatedLayerWeight(right) ||
    left.paintOrder.siblingOrder - right.paintOrder.siblingOrder
  );
}

function combinedOpacity(
  inheritedOpacity: number | undefined,
  paintOpacity: number | undefined,
): number | undefined {
  const inherited = inheritedOpacity ?? 1;
  const paint = paintOpacity ?? 1;
  const opacity = inherited * paint;
  return opacity < 1 ? opacity : undefined;
}

function shapeTransform(visual: Extract<PdfVisualElement, { kind: "shape" }>): {
  readonly clipBox?: typeof visual.box;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: typeof visual.box;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
} {
  return {
    ...(visual.clipBox ? { clipBox: visual.clipBox } : {}),
    ...(visual.clipRadius !== undefined ? { clipRadius: visual.clipRadius } : {}),
    ...(visual.clipShape ? { clipShape: visual.clipShape } : {}),
    ...(visual.rotation !== undefined ? { rotation: visual.rotation } : {}),
    ...(visual.rotationBox ? { rotationBox: visual.rotationBox } : {}),
    ...(visual.flipH ? { flipH: visual.flipH } : {}),
    ...(visual.flipV ? { flipV: visual.flipV } : {}),
  };
}

export function linkAnnotationFromBox(input: {
  readonly box: PdfRectangle;
  readonly hyperlink?: { readonly url: string; readonly tooltip?: string };
}): PdfPageAnnotation | undefined {
  if (!input.hyperlink) {
    return undefined;
  }

  return {
    kind: "link",
    box: input.box,
    url: input.hyperlink.url,
    ...(input.hyperlink.tooltip ? { tooltip: input.hyperlink.tooltip } : {}),
  };
}

export function intersectPdfRectangles(
  left: PdfRectangle,
  right: PdfRectangle,
): PdfRectangle | undefined {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  if (maxX <= x || maxY <= y) {
    return undefined;
  }

  return { x, y, width: maxX - x, height: maxY - y };
}

export function transformedPdfRectangle(
  box: PdfRectangle,
  transformBox: PdfRectangle,
  transform: { readonly rotation?: number; readonly flipH?: boolean; readonly flipV?: boolean },
): PdfRectangle {
  if (!transform.rotation && !transform.flipH && !transform.flipV) {
    return box;
  }

  const centerX = transformBox.x + transformBox.width / 2;
  const centerY = transformBox.y + transformBox.height / 2;
  const radians = ((transform.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaleX = transform.flipH ? -1 : 1;
  const scaleY = transform.flipV ? -1 : 1;
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ].map(([x, y]) => {
    const offsetX = (x! - centerX) * scaleX;
    const offsetY = (y! - centerY) * scaleY;
    return {
      x: centerX + offsetX * cos - offsetY * sin,
      y: centerY + offsetX * sin + offsetY * cos,
    };
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export function annotationsFromPdfTextVisuals(
  visuals: readonly PdfVisualElement[],
): readonly PdfPageAnnotation[] {
  return visuals.flatMap((visual) => {
    if (visual.kind !== "text" || !visual.hyperlink) {
      return [];
    }

    const hyperlinkBox = transformedPdfRectangle(
      visual.hyperlinkBox ?? visual.box,
      visual.rotationBox ?? visual.box,
      { rotation: visual.rotation, flipH: visual.flipH, flipV: visual.flipV },
    );
    const annotationBox = visual.clipBox
      ? intersectPdfRectangles(hyperlinkBox, visual.clipBox)
      : hyperlinkBox;
    if (!annotationBox) {
      return [];
    }
    const annotation = linkAnnotationFromBox({
      box: annotationBox,
      hyperlink: visual.hyperlink,
    });
    return annotation ? [annotation] : [];
  });
}

export function contentOpsFromPdfVisuals(
  visuals: readonly PdfVisualElement[],
): readonly PdfContentOp[] {
  return [...visuals]
    .sort(comparePdfVisualsByPaintOrder)
    .flatMap((visual): readonly PdfContentOp[] => {
      switch (visual.kind) {
        case "image": {
          const graphicsState = visual.blendMode ? { blendMode: visual.blendMode } : {};
          return [
            {
              op: "image",
              imageId: visual.imageId,
              box: visual.box,
              ...(visual.clipBox ? { clipBox: visual.clipBox } : {}),
              ...(visual.clipRadius !== undefined ? { clipRadius: visual.clipRadius } : {}),
              ...(visual.rotation !== undefined ? { rotation: visual.rotation } : {}),
              ...(visual.rotationBox ? { rotationBox: visual.rotationBox } : {}),
              ...(visual.flipH ? { flipH: visual.flipH } : {}),
              ...(visual.flipV ? { flipV: visual.flipV } : {}),
              ...(visual.opacity !== undefined ? { opacity: visual.opacity } : {}),
              ...graphicsState,
            },
          ];
        }
        case "line": {
          const graphicsState = visual.blendMode ? { blendMode: visual.blendMode } : {};
          return [
            {
              op: "strokeLine",
              from: visual.from,
              to: visual.to,
              ...(visual.clipBox ? { clipBox: visual.clipBox } : {}),
              color: visual.stroke.color,
              lineWidth: visual.stroke.width,
              ...(visual.rotation !== undefined ? { rotation: visual.rotation } : {}),
              ...(visual.rotationBox ? { rotationBox: visual.rotationBox } : {}),
              ...(visual.flipH ? { flipH: visual.flipH } : {}),
              ...(visual.flipV ? { flipV: visual.flipV } : {}),
              ...(visual.stroke.dash ? { dash: visual.stroke.dash } : {}),
              ...(visual.stroke.lineCap ? { lineCap: visual.stroke.lineCap } : {}),
              ...(visual.stroke.lineJoin ? { lineJoin: visual.stroke.lineJoin } : {}),
              ...(combinedOpacity(visual.opacity, visual.stroke.opacity) !== undefined
                ? { opacity: combinedOpacity(visual.opacity, visual.stroke.opacity) }
                : {}),
              ...graphicsState,
            },
          ];
        }
        case "shape": {
          const ops: PdfContentOp[] = [];
          const graphicsState = visual.blendMode ? { blendMode: visual.blendMode } : {};
          if (visual.fill) {
            const opacity = combinedOpacity(visual.opacity, visual.fill.opacity);
            if (
              visual.fill.gradientId &&
              visual.fill.kind === "linear-gradient" &&
              visual.shape === "rect"
            ) {
              ops.push({
                op: "fillLinearGradientRect",
                gradientId: visual.fill.gradientId,
                box: visual.box,
                ...shapeTransform(visual),
                ...(opacity !== undefined ? { opacity } : {}),
                ...graphicsState,
              });
            } else if (
              visual.fill.gradientId &&
              visual.fill.kind === "linear-gradient" &&
              visual.shape === "ellipse"
            ) {
              ops.push({
                op: "fillLinearGradientEllipse",
                gradientId: visual.fill.gradientId,
                box: visual.box,
                ...shapeTransform(visual),
                ...(opacity !== undefined ? { opacity } : {}),
                ...graphicsState,
              });
            } else if (
              visual.fill.gradientId &&
              visual.fill.kind === "linear-gradient" &&
              visual.shape === "roundRect"
            ) {
              ops.push({
                op: "fillLinearGradientRoundRect",
                gradientId: visual.fill.gradientId,
                box: visual.box,
                radius: visual.radius ?? 0,
                ...shapeTransform(visual),
                ...(opacity !== undefined ? { opacity } : {}),
                ...graphicsState,
              });
            } else if (
              visual.fill.gradientId &&
              visual.fill.kind === "radial-gradient" &&
              visual.shape === "rect"
            ) {
              ops.push({
                op: "fillRadialGradientRect",
                gradientId: visual.fill.gradientId,
                box: visual.box,
                ...shapeTransform(visual),
                ...(opacity !== undefined ? { opacity } : {}),
                ...graphicsState,
              });
            } else if (
              visual.fill.gradientId &&
              visual.fill.kind === "radial-gradient" &&
              visual.shape === "ellipse"
            ) {
              ops.push({
                op: "fillRadialGradientEllipse",
                gradientId: visual.fill.gradientId,
                box: visual.box,
                ...shapeTransform(visual),
                ...(opacity !== undefined ? { opacity } : {}),
                ...graphicsState,
              });
            } else if (
              visual.fill.gradientId &&
              visual.fill.kind === "radial-gradient" &&
              visual.shape === "roundRect"
            ) {
              ops.push({
                op: "fillRadialGradientRoundRect",
                gradientId: visual.fill.gradientId,
                box: visual.box,
                radius: visual.radius ?? 0,
                ...shapeTransform(visual),
                ...(opacity !== undefined ? { opacity } : {}),
                ...graphicsState,
              });
            } else if (visual.fill.color) {
              ops.push({ op: "setFillColor", color: visual.fill.color });
              switch (visual.shape) {
                case "ellipse":
                  ops.push({
                    op: "fillEllipse",
                    box: visual.box,
                    ...shapeTransform(visual),
                    ...(opacity !== undefined ? { opacity } : {}),
                    ...graphicsState,
                  });
                  break;
                case "roundRect":
                  ops.push({
                    op: "fillRoundRect",
                    box: visual.box,
                    radius: visual.radius ?? 0,
                    ...shapeTransform(visual),
                    ...(opacity !== undefined ? { opacity } : {}),
                    ...graphicsState,
                  });
                  break;
                case "rect":
                  ops.push({
                    op: "fillRect",
                    box: visual.box,
                    ...shapeTransform(visual),
                    ...(opacity !== undefined ? { opacity } : {}),
                    ...graphicsState,
                  });
                  break;
              }
            }
          }
          if (visual.stroke) {
            const opacity = combinedOpacity(visual.opacity, visual.stroke.opacity);
            ops.push({ op: "setStrokeColor", color: visual.stroke.color });
            const stroke = {
              lineWidth: visual.stroke.width,
              ...(visual.stroke.dash ? { dash: visual.stroke.dash } : {}),
              ...(visual.stroke.lineCap ? { lineCap: visual.stroke.lineCap } : {}),
              ...(visual.stroke.lineJoin ? { lineJoin: visual.stroke.lineJoin } : {}),
              ...(opacity !== undefined ? { opacity } : {}),
              ...graphicsState,
            };
            switch (visual.shape) {
              case "ellipse":
                ops.push({
                  op: "strokeEllipse",
                  box: visual.box,
                  ...shapeTransform(visual),
                  ...stroke,
                });
                break;
              case "roundRect":
                ops.push({
                  op: "strokeRoundRect",
                  box: visual.box,
                  radius: visual.radius ?? 0,
                  ...shapeTransform(visual),
                  ...stroke,
                });
                break;
              case "rect":
                ops.push({
                  op: "strokeRect",
                  box: visual.box,
                  ...shapeTransform(visual),
                  ...stroke,
                });
                break;
            }
          }
          return ops;
        }
        case "text": {
          const graphicsState = visual.blendMode ? { blendMode: visual.blendMode } : {};
          return [
            {
              op: "text",
              text: visual.text,
              ...(visual.textEncoding ? { textEncoding: visual.textEncoding } : {}),
              ...(visual.actualText ? { actualText: visual.actualText } : {}),
              ...(visual.glyphs ? { glyphs: visual.glyphs } : {}),
              x: visual.box.x,
              y: visual.box.y,
              box: visual.box,
              ...(visual.clipBox ? { clipBox: visual.clipBox } : {}),
              fontId: visual.fontId,
              ...(visual.kerningAdjustments
                ? { kerningAdjustments: visual.kerningAdjustments }
                : {}),
              ...(visual.style.fontSize ? { fontSize: visual.style.fontSize } : {}),
              ...(visual.style.charSpacing !== undefined
                ? { charSpacing: visual.style.charSpacing }
                : {}),
              ...(visual.style.textRise !== undefined ? { textRise: visual.style.textRise } : {}),
              ...(visual.style.color ? { color: visual.style.color } : {}),
              ...(visual.rotation !== undefined ? { rotation: visual.rotation } : {}),
              ...(visual.rotationBox ? { rotationBox: visual.rotationBox } : {}),
              ...(visual.flipH ? { flipH: visual.flipH } : {}),
              ...(visual.flipV ? { flipV: visual.flipV } : {}),
              ...(visual.opacity !== undefined ? { opacity: visual.opacity } : {}),
              ...graphicsState,
            },
          ];
        }
      }
    });
}

import type { BackgroundLayerIR } from "../../layout/projected";
import type {
  PptxDrawingNode,
  PptxElement,
  PptxPaintOrderInput,
  PptxSlideDrawing,
  PptxSlidePart,
} from "./model";

export function walkElements(
  elements: readonly PptxElement[],
  visit: (element: PptxElement) => void,
): void {
  for (const element of elements) {
    visit(element);
    if (element.kind === "group") {
      walkElements(element.children, visit);
    }
  }
}

export function mapElements(
  elements: readonly PptxElement[],
  map: (element: PptxElement) => PptxElement,
): PptxElement[] {
  return elements.map((element) => {
    const mapped = map(element);

    if (mapped.kind !== "group") {
      return mapped;
    }

    return {
      ...mapped,
      children: mapElements(mapped.children, map),
    };
  });
}

function paintOrderForElement(element: PptxElement): PptxPaintOrderInput {
  const paintOrder = element.paintOrder;
  if (!paintOrder) {
    throw new Error(`Pptx element ${element.id} must carry projected paint order.`);
  }

  return paintOrder;
}

export function comparePptxElementsByPaintOrder(left: PptxElement, right: PptxElement): number {
  const leftPaintOrder = paintOrderForElement(left);
  const rightPaintOrder = paintOrderForElement(right);

  return (
    (leftPaintOrder.zIndex ?? 0) - (rightPaintOrder.zIndex ?? 0) ||
    leftPaintOrder.siblingOrder - rightPaintOrder.siblingOrder
  );
}

export function drawingFromElements(elements: readonly PptxElement[]): PptxSlideDrawing {
  const ordered = elements
    .map((element) => ({ element, paintOrder: paintOrderForElement(element) }))
    .sort((left, right) => comparePptxElementsByPaintOrder(left.element, right.element));

  return {
    children: ordered.map(({ element, paintOrder }, index) => ({
      ...element,
      emissionTarget: "slide",
      paintOrderIndex: index,
      paintOrder,
    })),
  };
}

export function slideDrawingChildren(slide: PptxSlidePart): readonly PptxDrawingNode[] {
  return slide.payload.drawing.children;
}

export function walkBackgroundLayers(
  elements: readonly PptxElement[],
  visit: (layer: BackgroundLayerIR, indexPath: readonly number[]) => void,
  parentPath: readonly number[] = [],
): void {
  for (const [index, element] of elements.entries()) {
    const path = [...parentPath, index];

    if ("backgroundLayers" in element) {
      element.backgroundLayers?.forEach((layer: BackgroundLayerIR, layerIndex: number) => {
        visit(layer, [...path, layerIndex]);
      });
    }

    if (element.kind === "group") {
      walkBackgroundLayers(element.children, visit, path);
    }
  }
}

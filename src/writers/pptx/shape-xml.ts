import type { PptxElement } from "../../projection/pptx/model";
import { writeBackgroundLayerElements, writeGeneratedStrokeElements } from "./drawing-layer-xml";
import { writeNonVisual, writeShapeProperties } from "./drawing-xml";
import type { SlideImageRenderContext } from "./picture-xml";
import { writePictureElement } from "./picture-xml";
import { requireSlideRelationshipId } from "./picture-xml";
import { writeTextBody } from "./text-xml";
import { XmlChunkWriter } from "./xml-writer";

function combineOpacity(parent: number | undefined, child: number | undefined): number | undefined {
  if (parent === undefined) {
    return child;
  }
  if (child === undefined) {
    return parent;
  }
  return parent * child;
}

function hyperlinkRelationshipIdFor(
  element: Extract<PptxElement, { kind: "image" | "shape" | "text" }>,
  context: SlideImageRenderContext,
): string | undefined {
  return element.hyperlink?.url
    ? requireSlideRelationshipId(element.serialized.hyperlinkRelationshipId, {
        context,
        label: `${element.kind} drawing element ${element.id}`,
        type: "hyperlink",
      })
    : undefined;
}

export type ShapeElementXmlInput = Pick<
  Extract<PptxElement, { kind: "shape" }>,
  | "fill"
  | "flipH"
  | "flipV"
  | "frame"
  | "hyperlink"
  | "kind"
  | "opacity"
  | "radiusEmu"
  | "rotation"
  | "serialized"
  | "shadow"
  | "shape"
  | "stroke"
> & {
  readonly id?: Extract<PptxElement, { kind: "shape" }>["id"];
};

function writeTextElement(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "text" }>,
  index: number,
  inheritedOpacity: number | undefined,
  context: SlideImageRenderContext,
): void {
  const opacity = combineOpacity(inheritedOpacity, element.opacity);
  const hyperlinkRelationshipId = hyperlinkRelationshipIdFor(element, context);
  writeBackgroundLayerElements(writer, {
    layers: element.backgroundLayers,
    startIndex: index * 10 + 1000,
    context,
    inheritedOpacity: opacity,
    writeShape: (layerWriter, layerElement, layerIndex, layerOpacity) => {
      writeShapeXmlElement(layerWriter, layerElement, layerIndex, layerOpacity, context);
    },
  });

  writer.open("p:sp");
  writeNonVisual(
    writer,
    "sp",
    element.serialized.shapeObjectId,
    `Text ${index}`,
    hyperlinkRelationshipId,
    element.hyperlink?.tooltip,
  );
  writeShapeProperties(writer, {
    frame: element.frame,
    geometry: "rect",
    radiusEmu: element.radiusEmu,
    fill: element.fill,
    stroke: element.stroke,
    shadow: element.shadow,
    opacity,
    rotation: element.rotation,
    flipH: element.flipH,
    flipV: element.flipV,
  });
  writeTextBody(writer, element.content.text, element.content.runs, element.style, opacity, {
    relationshipId: hyperlinkRelationshipId,
    tooltip: element.hyperlink?.tooltip,
  });
  writer.close("p:sp");
  writeGeneratedStrokeElements(writer, element, index);
}

export function writeShapeXmlElement(
  writer: XmlChunkWriter,
  element: ShapeElementXmlInput,
  index: number,
  inheritedOpacity: number | undefined,
  context: SlideImageRenderContext,
): void {
  const geometry = shapeGeometry(element.shape, element.id ?? `Shape ${index}`);
  const opacity = combineOpacity(inheritedOpacity, element.opacity);
  const hyperlinkRelationshipId = element.hyperlink?.url
    ? requireSlideRelationshipId(element.serialized.hyperlinkRelationshipId, {
        context,
        label: `shape drawing element Shape ${index}`,
        type: "hyperlink",
      })
    : undefined;

  writer.open("p:sp");
  writeNonVisual(
    writer,
    "sp",
    element.serialized.shapeObjectId,
    `Shape ${index}`,
    hyperlinkRelationshipId,
    element.hyperlink?.tooltip,
  );
  writeShapeProperties(writer, {
    frame: element.frame,
    geometry,
    radiusEmu: element.radiusEmu,
    fill: element.fill,
    stroke: element.stroke,
    shadow: element.shadow,
    opacity,
    rotation: element.rotation,
    flipH: element.flipH,
    flipV: element.flipV,
  });
  writer.close("p:sp");
}

export function writeShapeElement(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "shape" }>,
  index: number,
  inheritedOpacity: number | undefined,
  context: SlideImageRenderContext,
): void {
  writeBackgroundLayerElements(writer, {
    layers: element.backgroundLayers,
    startIndex: index * 10 + 1000,
    context,
    inheritedOpacity: combineOpacity(inheritedOpacity, element.opacity),
    writeShape: (layerWriter, layerElement, layerIndex, layerOpacity) => {
      writeShapeXmlElement(layerWriter, layerElement, layerIndex, layerOpacity, context);
    },
  });
  writeShapeXmlElement(writer, element, index, inheritedOpacity, context);
  writeGeneratedStrokeElements(writer, element, index);
}

function shapeGeometry(
  shape: Extract<PptxElement, { kind: "shape" }>["shape"],
  label: string,
): "rect" | "ellipse" | "line" {
  if (shape === "rect" || shape === "ellipse" || shape === "line") {
    return shape;
  }

  throw new Error(`Shape element ${label} is missing projected shape geometry`);
}

export function writeDrawingElement(
  writer: XmlChunkWriter,
  element: PptxElement,
  index: number,
  inheritedOpacity: number | undefined,
  context: SlideImageRenderContext,
): void {
  if (element.visibility === "hidden") {
    return;
  }

  switch (element.kind) {
    case "group": {
      const opacity = combineOpacity(inheritedOpacity, element.opacity);
      writeBackgroundLayerElements(writer, {
        layers: element.backgroundLayers,
        startIndex: index * 10 + 1000,
        context,
        inheritedOpacity: opacity,
        writeShape: (layerWriter, layerElement, layerIndex, layerOpacity) => {
          writeShapeXmlElement(layerWriter, layerElement, layerIndex, layerOpacity, context);
        },
      });
      if (element.fill || element.stroke || element.shadow) {
        writeShapeElement(
          writer,
          {
            ...element,
            kind: "shape",
            shape: "rect",
            backgroundLayers: undefined,
            edgeStrokes: undefined,
            outline: undefined,
            generatedStrokes: undefined,
          },
          index,
          inheritedOpacity,
          context,
        );
      }
      writeGeneratedStrokeElements(writer, element, index);
      element.children.forEach((child, childIndex) => {
        writeDrawingElement(writer, child, index * 100 + childIndex + 1, opacity, context);
      });
      return;
    }
    case "image":
      writePictureElement(writer, element, index, context, inheritedOpacity);
      return;
    case "shape":
      writeShapeElement(writer, element, index, inheritedOpacity, context);
      return;
    case "text":
      writeTextElement(writer, element, index, inheritedOpacity, context);
      return;
  }
}

import type {
  PptxBackgroundLayer,
  PptxElement,
  PptxGeneratedStrokeLayer,
} from "../../projection/pptx/model";
import type { FrameIR, StrokeIR } from "../../layout/projected";
import { writeNonVisual, writeShapeProperties } from "./drawing-xml";
import type { SlideImageRenderContext } from "./picture-xml";
import { writeBackgroundPictureElements } from "./picture-xml";
import type { ShapeElementXmlInput } from "./shape-xml";
import { XmlChunkWriter } from "./xml-writer";

function writeGeneratedStrokeShape(
  writer: XmlChunkWriter,
  input: {
    frame: FrameIR;
    stroke: StrokeIR;
    shapeObjectId: string | undefined;
    name: string;
    geometry: "line" | "rect";
  },
): void {
  writer.open("p:sp");
  writeNonVisual(writer, "sp", input.shapeObjectId, input.name);
  writeShapeProperties(writer, {
    frame: input.frame,
    geometry: input.geometry,
    fill: undefined,
    stroke: input.stroke,
  });
  writer.close("p:sp");
}

export function writeGeneratedStrokeElements(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "group" | "shape" | "text" }>,
  index: number,
): void {
  if ((element.edgeStrokes || element.outline) && !element.generatedStrokes?.length) {
    throw new Error(`Drawing element ${element.id} is missing projected generated stroke layers`);
  }

  for (const layer of element.generatedStrokes ?? []) {
    writeGeneratedStrokeShape(writer, {
      frame: layer.frame,
      stroke: layer.stroke,
      shapeObjectId: layer.serialized.shapeObjectId,
      name: generatedStrokeName(layer, index),
      geometry: generatedStrokeGeometry(layer),
    });
  }
}

function generatedStrokeGeometry(layer: PptxGeneratedStrokeLayer): "line" | "rect" {
  if (layer.shape === "line" || layer.shape === "rect") {
    return layer.shape;
  }

  throw new Error(`Generated stroke layer ${layer.id} is missing projected shape geometry`);
}

function generatedStrokeName(layer: PptxGeneratedStrokeLayer, index: number): string {
  if (layer.role === "outline") {
    return `Outline ${index}`;
  }

  return `${layer.edge ?? "border"} edge ${index}`;
}

export function writeBackgroundLayerElements(
  writer: XmlChunkWriter,
  input: {
    layers: readonly PptxBackgroundLayer[] | undefined;
    startIndex: number;
    context: SlideImageRenderContext;
    inheritedOpacity?: number;
    writeShape: (
      writer: XmlChunkWriter,
      element: ShapeElementXmlInput,
      index: number,
      inheritedOpacity: number | undefined,
    ) => void;
  },
): void {
  if (!input.layers || input.layers.length === 0) {
    return;
  }

  for (const [index, layer] of input.layers.entries()) {
    if (layer.kind === "background-image") {
      writeBackgroundPictureElements(
        writer,
        layer,
        input.startIndex + index * 100,
        input.context,
        input.inheritedOpacity,
      );
      continue;
    }

    const frame = layer.frame;
    if (!frame) {
      throw new Error(`Background layer ${input.startIndex + index} is missing projected frame`);
    }

    const shapeObjectId = "serialized" in layer ? layer.serialized?.shapeObjectId : undefined;
    if (!shapeObjectId) {
      throw new Error(
        `Background layer ${input.startIndex + index} must carry a projected shape object id`,
      );
    }

    input.writeShape(
      writer,
      {
        kind: "shape",
        serialized: { shapeObjectId },
        frame,
        shape: "rect",
        fill: layer,
      },
      input.startIndex + index,
      input.inheritedOpacity,
    );
  }
}

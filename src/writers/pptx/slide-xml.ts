import type { PptxPackageModel, PptxSlidePart } from "../../projection/pptx/model";
import type { FillIR } from "../../layout/projected";
import { writeBackgroundLayerElements } from "./drawing-layer-xml";
import { writeFill } from "./drawing-xml";
import { createSlideImageRenderContext } from "./picture-xml";
import { writeDrawingElement, writeShapeXmlElement } from "./shape-xml";
import { XmlChunkWriter } from "./xml-writer";

const PRESENTATION_ML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING_ML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function writeSlideBackground(writer: XmlChunkWriter, fill: FillIR | undefined): void {
  if (!fill) {
    return;
  }

  writer.open("p:bg").open("p:bgPr");
  writeFill(writer, fill);
  writer.empty("a:effectLst").close("p:bgPr");
  writer.close("p:bg");
}

function writeShapeTreeHeader(writer: XmlChunkWriter): void {
  writer
    .open("p:nvGrpSpPr")
    .empty("p:cNvPr", { id: 1, name: "" })
    .empty("p:cNvGrpSpPr")
    .empty("p:nvPr")
    .close("p:nvGrpSpPr")
    .open("p:grpSpPr")
    .open("a:xfrm")
    .empty("a:off", { x: 0, y: 0 })
    .empty("a:ext", { cx: 0, cy: 0 })
    .empty("a:chOff", { x: 0, y: 0 })
    .empty("a:chExt", { cx: 0, cy: 0 })
    .close("a:xfrm")
    .close("p:grpSpPr");
}

function writeColorMapOverride(writer: XmlChunkWriter): void {
  writer.open("p:clrMapOvr").empty("a:masterClrMapping").close("p:clrMapOvr");
}

export function slideBytes(slide: PptxSlidePart, projection: PptxPackageModel): Uint8Array {
  const context = createSlideImageRenderContext(slide, projection);
  const writer = new XmlChunkWriter()
    .declaration()
    .open("p:sld", {
      "xmlns:a": DRAWING_ML_NS,
      "xmlns:r": REL_NS,
      "xmlns:p": PRESENTATION_ML_NS,
    })
    .open("p:cSld");

  writeSlideBackground(writer, slide.payload.background);

  writer.open("p:spTree");
  writeShapeTreeHeader(writer);

  writeBackgroundLayerElements(writer, {
    layers: slide.payload.backgroundLayers,
    startIndex: 5000,
    context,
    writeShape: (layerWriter, layerElement, layerIndex, layerOpacity) => {
      writeShapeXmlElement(layerWriter, layerElement, layerIndex, layerOpacity, context);
    },
  });

  slide.payload.drawing.children.forEach((element, index) => {
    writeDrawingElement(writer, element, index + 2, undefined, context);
  });

  writer.close("p:spTree").close("p:cSld");
  writeColorMapOverride(writer);
  return writer.close("p:sld").bytes();
}

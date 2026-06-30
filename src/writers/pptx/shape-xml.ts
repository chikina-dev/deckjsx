import type { PptxElement } from "@/src/projection/pptx/model";
import { writeBackgroundLayerElements, writeGeneratedStrokeElements } from "./drawing-layer-xml";
import {
  alphaValue,
  pointToEmu,
  writeColor,
  writeFill,
  writeNonVisual,
  writeShadow,
  writeShapeProperties,
  writeTransform,
  writerShapeObjectNumericId,
} from "./drawing-xml";
import type { SlideImageRenderContext } from "./picture-xml";
import {
  imageSourceKey,
  resolveImageSrcRect,
  writePictureElement,
  writeSrcRect,
} from "./picture-xml";
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

function videoShapeObjectId(
  element: Extract<PptxElement, { kind: "video" }>,
  index: number,
): number {
  return writerShapeObjectNumericId(element.serialized.shapeObjectId, `Video ${index}`);
}

function writeVideoNonVisual(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "video" }>,
  index: number,
  videoRelationshipId: string,
  mediaRelationshipId: string,
): void {
  writer
    .open("p:nvPicPr")
    .open("p:cNvPr", { id: videoShapeObjectId(element, index), name: `Video ${index}` })
    .close("p:cNvPr")
    .open("p:cNvPicPr")
    .empty("a:picLocks", { noChangeAspect: 1 })
    .close("p:cNvPicPr")
    .open("p:nvPr")
    .empty("a:videoFile", { "r:link": videoRelationshipId })
    .open("p:extLst")
    .open("p:ext", { uri: "{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}" })
    .empty("p14:media", {
      "xmlns:p14": "http://schemas.microsoft.com/office/powerpoint/2010/main",
      "r:embed": mediaRelationshipId,
    })
    .close("p:ext")
    .close("p:extLst")
    .close("p:nvPr")
    .close("p:nvPicPr");
}

function writeVideoElement(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "video" }>,
  index: number,
  inheritedOpacity: number | undefined,
  context: SlideImageRenderContext,
): void {
  const videoRelationshipId = requireSlideRelationshipId(element.serialized.relationshipId, {
    context,
    label: `Video drawing element ${element.id}`,
    type: "video",
  });
  const mediaRelationshipId = requireSlideRelationshipId(element.serialized.mediaRelationshipId, {
    context,
    label: `Video drawing element ${element.id}`,
    type: "media",
  });
  const posterSource = element.posterSource;
  if (!posterSource) {
    throw new Error(`Video drawing element ${element.id} requires a projected poster source.`);
  }
  const posterRelationshipId = requireSlideRelationshipId(
    context.mediaRelationshipBySource.get(imageSourceKey(posterSource)),
    {
      context,
      label: `Video poster drawing element ${element.id}`,
      type: "image",
    },
  );
  const transparency = alphaValue(
    element.transparency,
    combineOpacity(inheritedOpacity, element.opacity),
  );

  writer.open("p:pic");
  writeVideoNonVisual(writer, element, index, videoRelationshipId, mediaRelationshipId);
  writer.open("p:blipFill").open("a:blip", { "r:embed": posterRelationshipId });
  if (transparency !== undefined && transparency !== 100000) {
    writer.empty("a:alphaModFix", { amt: transparency });
  }
  writer.close("a:blip");
  writeSrcRect(
    writer,
    resolveImageSrcRect(
      {
        ...element,
        source: posterSource,
        fit: "stretch",
      },
      context,
      "Video poster",
    ),
  );
  writer.close("p:blipFill");
  writer.open("p:spPr");
  writeTransform(writer, element.frame, element.rotation, element.flipH, element.flipV);
  writer
    .open("a:prstGeom", { prst: element.rounding ? "roundRect" : "rect" })
    .empty("a:avLst")
    .close("a:prstGeom");
  writeShadow(writer, element.shadow);
  writer.close("p:spPr").close("p:pic");
}

function tableShapeObjectId(
  element: Extract<PptxElement, { kind: "table" }>,
  index: number,
): number {
  return writerShapeObjectNumericId(element.serialized.shapeObjectId, `Table ${index}`);
}

function tableColumnWidths(element: Extract<PptxElement, { kind: "table" }>): readonly number[] {
  const cells = element.sections.flatMap((section) => section.rows.flatMap((row) => row.cells));
  if (cells.length === 0) {
    return [element.frame.widthEmu];
  }

  const columnCount = Math.max(
    1,
    ...cells.map((cell) => cell.gridColumnIndex + Math.max(1, cell.colSpan)),
  );
  const widths: Array<number | undefined> = Array.from({ length: columnCount }, () => undefined);

  for (const cell of cells) {
    const span = Math.max(1, cell.colSpan);
    const perColumnWidth = cell.frame.widthEmu / span;
    if (!Number.isFinite(perColumnWidth) || perColumnWidth <= 0) {
      continue;
    }
    for (
      let offset = 0;
      offset < span && cell.gridColumnIndex + offset < widths.length;
      offset += 1
    ) {
      widths[cell.gridColumnIndex + offset] ??= perColumnWidth;
    }
  }

  const fallbackWidth = element.frame.widthEmu / columnCount;
  const rawWidths = widths.map((width) => width ?? fallbackWidth);
  const rawTotal = rawWidths.reduce((total, width) => total + width, 0);
  if (!Number.isFinite(rawTotal) || rawTotal <= 0) {
    return Array.from({ length: columnCount }, () => fallbackWidth);
  }

  const scale = element.frame.widthEmu / rawTotal;
  return rawWidths.map((width) => width * scale);
}

type TableCellXmlInput = Extract<
  PptxElement,
  { kind: "table" }
>["sections"][number]["rows"][number]["cells"][number];

function tableTextAlign(
  value: TableCellXmlInput["style"]["textAlign"],
): "l" | "ctr" | "r" | "just" | undefined {
  switch (value) {
    case "left":
      return "l";
    case "center":
      return "ctr";
    case "right":
      return "r";
    case "justify":
      return "just";
    default:
      return undefined;
  }
}

function tableVerticalAlign(
  value: TableCellXmlInput["style"]["verticalAlign"],
): "t" | "ctr" | "b" | undefined {
  switch (value) {
    case "top":
      return "t";
    case "middle":
      return "ctr";
    case "bottom":
      return "b";
    default:
      return undefined;
  }
}

function writeTableCellBorder(
  writer: XmlChunkWriter,
  tag: "a:lnL" | "a:lnR" | "a:lnT" | "a:lnB",
  stroke: NonNullable<TableCellXmlInput["edgeStrokes"]>[keyof NonNullable<
    TableCellXmlInput["edgeStrokes"]
  >],
): void {
  if (!stroke) {
    return;
  }

  writer.open(tag, { w: pointToEmu(stroke.widthPt, "table cell border width") });
  writer.open("a:solidFill");
  writeColor(writer, stroke.color, stroke.transparency);
  writer.close("a:solidFill");
  if (stroke.style === "dash" || stroke.dashType) {
    writer.empty("a:prstDash", { val: stroke.dashType ?? "dash" });
  }
  writer.close(tag);
}

function writeTableCellProperties(writer: XmlChunkWriter, cell: TableCellXmlInput): void {
  writer.open("a:tcPr", {
    anchor: tableVerticalAlign(cell.style.verticalAlign),
    marL: pointToEmu(cell.style.paddingPt?.[3], "table cell left padding"),
    marR: pointToEmu(cell.style.paddingPt?.[1], "table cell right padding"),
    marT: pointToEmu(cell.style.paddingPt?.[0], "table cell top padding"),
    marB: pointToEmu(cell.style.paddingPt?.[2], "table cell bottom padding"),
  });
  writeFill(writer, cell.fill);
  writeTableCellBorder(writer, "a:lnL", cell.edgeStrokes?.left);
  writeTableCellBorder(writer, "a:lnR", cell.edgeStrokes?.right);
  writeTableCellBorder(writer, "a:lnT", cell.edgeStrokes?.top);
  writeTableCellBorder(writer, "a:lnB", cell.edgeStrokes?.bottom);
  writer.close("a:tcPr");
}

function writeTableCellText(writer: XmlChunkWriter, cell: TableCellXmlInput): void {
  writer.open("a:txBody").empty("a:bodyPr", { wrap: "square" }).empty("a:lstStyle").open("a:p");
  const align = tableTextAlign(cell.style.textAlign);
  if (align) {
    writer.empty("a:pPr", { algn: align });
  }

  if (cell.text.length > 0) {
    writer.open("a:r").open("a:rPr", {
      lang: "en-US",
      b: cell.style.fontWeight === "bold" || cell.style.fontWeight === 700 ? 1 : undefined,
      i: cell.style.italic ? 1 : undefined,
      sz: cell.style.fontSizePt === undefined ? undefined : Math.round(cell.style.fontSizePt * 100),
    });
    if (cell.style.color) {
      writer.open("a:solidFill");
      writeColor(writer, cell.style.color);
      writer.close("a:solidFill");
    }
    writer.close("a:rPr").element("a:t", {}, cell.text).close("a:r");
  }

  writer.close("a:p").close("a:txBody");
}

function writeMergedTableCell(writer: XmlChunkWriter, merge: "vMerge" | "hMerge"): void {
  writer
    .open("a:tc", { [merge]: 1 })
    .open("a:txBody")
    .empty("a:bodyPr", { wrap: "square" })
    .empty("a:lstStyle")
    .empty("a:p")
    .close("a:txBody")
    .empty("a:tcPr")
    .close("a:tc");
}

function writeEmptyTableCell(writer: XmlChunkWriter): void {
  writer
    .open("a:tc")
    .open("a:txBody")
    .empty("a:bodyPr", { wrap: "square" })
    .empty("a:lstStyle")
    .empty("a:p")
    .close("a:txBody")
    .empty("a:tcPr")
    .close("a:tc");
}

function writeTableElement(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "table" }>,
  index: number,
): void {
  const columns = tableColumnWidths(element);
  const activeVerticalMerges = Array.from({ length: columns.length }, () => 0);
  const hasHeaderRow = element.sections.some(
    (section) => section.sectionKind === "head" && section.rows.length > 0,
  );
  const hasMultipleBodyRows =
    element.sections
      .filter((section) => section.sectionKind === "body")
      .reduce((total, section) => total + section.rows.length, 0) > 1;

  writer
    .open("p:graphicFrame")
    .open("p:nvGraphicFramePr")
    .open("p:cNvPr", { id: tableShapeObjectId(element, index), name: `Table ${index}` })
    .close("p:cNvPr")
    .open("p:cNvGraphicFramePr")
    .empty("a:graphicFrameLocks", { noGrp: 1 })
    .close("p:cNvGraphicFramePr")
    .empty("p:nvPr")
    .close("p:nvGraphicFramePr");
  writeTransform(writer, element.frame, element.rotation, element.flipH, element.flipV);
  writer
    .open("a:graphic")
    .open("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/table" })
    .open("a:tbl")
    .open("a:tblPr", {
      firstRow: hasHeaderRow ? 1 : undefined,
      bandRow: hasMultipleBodyRows ? 1 : undefined,
    })
    .element("a:tableStyleId", {}, "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}")
    .close("a:tblPr")
    .open("a:tblGrid");

  columns.forEach((width) => {
    writer.empty("a:gridCol", { w: Math.round(width) });
  });
  writer.close("a:tblGrid");

  element.sections.forEach((section) => {
    section.rows.forEach((row) => {
      writer.open("a:tr", { h: Math.round(row.frame.heightEmu) });
      const cellsByColumn = new Map(row.cells.map((cell) => [cell.gridColumnIndex, cell]));
      let columnIndex = 0;
      while (columnIndex < columns.length) {
        const cell = cellsByColumn.get(columnIndex);
        if (cell) {
          const cellColumnSpan = Math.min(
            Math.max(1, cell.colSpan),
            Math.max(1, columns.length - columnIndex),
          );
          writer.open("a:tc", {
            gridSpan: cellColumnSpan > 1 ? cellColumnSpan : undefined,
            rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          });
          writeTableCellText(writer, cell);
          writeTableCellProperties(writer, cell);
          writer.close("a:tc");
          if (cell.rowSpan > 1) {
            for (
              let offset = 0;
              offset < cellColumnSpan && columnIndex + offset < activeVerticalMerges.length;
              offset += 1
            ) {
              activeVerticalMerges[columnIndex + offset] = Math.max(
                activeVerticalMerges[columnIndex + offset] ?? 0,
                cell.rowSpan,
              );
            }
          }
          for (let offset = 1; offset < cellColumnSpan; offset += 1) {
            writeMergedTableCell(writer, "hMerge");
          }
          columnIndex += cellColumnSpan;
          continue;
        }
        if ((activeVerticalMerges[columnIndex] ?? 0) > 0) {
          writeMergedTableCell(writer, "vMerge");
        } else {
          writeEmptyTableCell(writer);
        }
        columnIndex += 1;
      }
      for (let mergeIndex = 0; mergeIndex < activeVerticalMerges.length; mergeIndex += 1) {
        activeVerticalMerges[mergeIndex] = Math.max(0, (activeVerticalMerges[mergeIndex] ?? 0) - 1);
      }
      writer.close("a:tr");
    });
  });

  writer.close("a:tbl").close("a:graphicData").close("a:graphic").close("p:graphicFrame");
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
): "rect" | "ellipse" | "line" | "roundRect" {
  if (shape === "rect" || shape === "ellipse" || shape === "line" || shape === "roundRect") {
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
    case "video":
      writeVideoElement(writer, element, index, inheritedOpacity, context);
      return;
    case "shape":
      writeShapeElement(writer, element, index, inheritedOpacity, context);
      return;
    case "table":
      writeTableElement(writer, element, index);
      return;
    case "text":
      writeTextElement(writer, element, index, inheritedOpacity, context);
      return;
  }
}

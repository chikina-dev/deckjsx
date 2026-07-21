import type { GraphNodeId } from "@/src/graph";
import type {
  BackgroundLayerIR,
  EdgeStrokeIR,
  FrameIR,
  ImageSourceIR,
  ObjectPositionIR,
  ProjectedLayoutNode,
  ProjectedLayoutOrigin,
  ProjectedLayoutSlide,
  StrokeIR,
  TextStyleIR,
} from "@/src/layout/projected";
import type { TemplateAreaKind } from "@/src/templates";
import { drawingFromElements } from "./drawing";
import {
  createShapeObjectIdAllocator,
  elementIdentity,
  mediaPartIdForElement,
  packageIdentity,
  pptxElementId,
  serializedId,
  type ShapeObjectIdAllocator,
} from "./identity";
import { projectedRelationshipTarget } from "./relationships";
import type {
  PackagePartId,
  PptxBackgroundLayer,
  PptxElement,
  PptxElementOrigin,
  PptxGeneratedStrokeLayer,
  PptxLayoutAnchor,
  PptxPackagePart,
  PptxPaintOrderInput,
  PptxSlidePart,
  PptxTextBodyStyle,
  PptxUnsupportedSemantic,
} from "./model";
import {
  unsupportedCompositingSemantics,
  unsupportedGroupOpacitySemantics,
  unsupportedOpacityStackingContextSemantics,
} from "./style";

const BACKGROUND_LAYER_SHAPE_OBJECT_ID_OFFSET = 50;
const BACKGROUND_LAYER_SHAPE_OBJECT_ID_STRIDE = 100;
const BACKGROUND_LAYER_TILE_ID_HEADROOM = 65535;
const DEFAULT_OBJECT_POSITION: ObjectPositionIR = { x: 0.5, y: 0.5 };
const DEFAULT_VIDEO_POSTER_SOURCE: ImageSourceIR = {
  kind: "data",
  data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
};
const DEFAULT_TEXT_FIT: NonNullable<TextStyleIR["fit"]> = "none";
const DEFAULT_TEXT_DIRECTION: NonNullable<TextStyleIR["textDirection"]> = "horz";
const DEFAULT_TEXT_VERTICAL_ALIGN: NonNullable<TextStyleIR["verticalAlign"]> = "top";
const DEFAULT_TEXT_WRAP = true;

function layoutAnchorFor(input: {
  templateAreaRef?: { readonly template: string; readonly area: string };
  templateAreaKind?: TemplateAreaKind;
  frame: FrameIR;
  templateAreaFrame?: FrameIR;
}): PptxLayoutAnchor | undefined {
  return input.templateAreaRef
    ? {
        template: input.templateAreaRef.template,
        area: input.templateAreaRef.area,
        kind: input.templateAreaKind ?? "generic",
        frame: input.templateAreaFrame ?? input.frame,
      }
    : undefined;
}

function textBodyStyleFromProjected(style: TextStyleIR): PptxTextBodyStyle {
  return {
    ...style,
    fit: style.fit ?? DEFAULT_TEXT_FIT,
    textDirection: style.textDirection ?? DEFAULT_TEXT_DIRECTION,
    verticalAlign: style.verticalAlign ?? DEFAULT_TEXT_VERTICAL_ALIGN,
    wrap: style.wrap ?? DEFAULT_TEXT_WRAP,
  };
}

function authoredPaintOrder(input: { siblingOrder: number; zIndex?: number }): PptxPaintOrderInput {
  return {
    siblingOrder: input.siblingOrder,
    ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
    generatedLayerRole: "authored",
  };
}

function generatedPaintOrder(input: {
  siblingOrder: number;
  zIndex?: number;
  generatedLayerRole: "background" | "border" | "outline";
}): PptxPaintOrderInput {
  return {
    siblingOrder: input.siblingOrder,
    ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
    generatedLayerRole: input.generatedLayerRole,
  };
}

function generatedStrokeIdentity(input: {
  packagePartId: PackagePartId;
  graphNodeId?: GraphNodeId;
  indexPath: readonly number[];
  role: "border" | "outline";
  key: string;
}): PptxGeneratedStrokeLayer["id"] {
  return pptxElementId(
    `${elementIdentity({
      packagePartId: input.packagePartId,
      graphNodeId: input.graphNodeId,
      indexPath: input.indexPath,
    })}:generated:${input.role}:${input.key}`,
  );
}

function generatedStrokeLayers(input: {
  packagePartId: PackagePartId;
  graphNodeId?: GraphNodeId;
  indexPath: readonly number[];
  ownerShapeObjectId: string;
  shapeObjectIds: ShapeObjectIdAllocator;
  frame: FrameIR;
  siblingOrder: number;
  zIndex?: number;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
}): readonly PptxGeneratedStrokeLayer[] | undefined {
  const layers: PptxGeneratedStrokeLayer[] = [];
  const edgeEntries = [
    ["top", input.edgeStrokes?.top],
    ["right", input.edgeStrokes?.right],
    ["bottom", input.edgeStrokes?.bottom],
    ["left", input.edgeStrokes?.left],
  ] as const;

  for (const [edge, stroke] of edgeEntries) {
    if (!stroke) {
      continue;
    }

    const frame =
      edge === "top"
        ? { ...input.frame, heightEmu: 0 }
        : edge === "bottom"
          ? {
              ...input.frame,
              yEmu: input.frame.yEmu + input.frame.heightEmu,
              heightEmu: 0,
            }
          : edge === "left"
            ? { ...input.frame, widthEmu: 0 }
            : {
                ...input.frame,
                xEmu: input.frame.xEmu + input.frame.widthEmu,
                widthEmu: 0,
              };
    const localIndex = layers.length;
    layers.push({
      kind: "stroke",
      role: "border",
      edge,
      id: generatedStrokeIdentity({
        packagePartId: input.packagePartId,
        graphNodeId: input.graphNodeId,
        indexPath: input.indexPath,
        role: "border",
        key: edge,
      }),
      serialized: {
        shapeObjectId: input.shapeObjectIds.generatedShapeObjectId(
          serializedId(input.ownerShapeObjectId),
          localIndex,
        ),
      },
      frame,
      stroke,
      shape: "line",
      paintOrder: generatedPaintOrder({
        siblingOrder: input.siblingOrder,
        zIndex: input.zIndex,
        generatedLayerRole: "border",
      }),
    });
  }

  if (input.outline) {
    const localIndex = layers.length;
    layers.push({
      kind: "stroke",
      role: "outline",
      id: generatedStrokeIdentity({
        packagePartId: input.packagePartId,
        graphNodeId: input.graphNodeId,
        indexPath: input.indexPath,
        role: "outline",
        key: "outline",
      }),
      serialized: {
        shapeObjectId: input.shapeObjectIds.generatedShapeObjectId(
          serializedId(input.ownerShapeObjectId),
          localIndex,
        ),
      },
      frame: input.frame,
      stroke: input.outline,
      shape: "rect",
      paintOrder: generatedPaintOrder({
        siblingOrder: input.siblingOrder,
        zIndex: input.zIndex,
        generatedLayerRole: "outline",
      }),
    });
  }

  return layers.length > 0 ? layers : undefined;
}

function projectBackgroundLayers(input: {
  layers: readonly BackgroundLayerIR[] | undefined;
  ownerShapeObjectId: string;
  shapeObjectIds: ShapeObjectIdAllocator;
  zIndex?: number;
  siblingOrder: number;
}): readonly PptxBackgroundLayer[] | undefined {
  if (!input.layers || input.layers.length === 0) {
    return undefined;
  }

  return input.layers.map((layer, index) => {
    const paintOrder = generatedPaintOrder({
      siblingOrder: input.siblingOrder,
      zIndex: input.zIndex,
      generatedLayerRole: "background",
    });
    const reservedIdHeadroom =
      layer.kind === "background-image" && layer.repeat !== "no-repeat"
        ? BACKGROUND_LAYER_TILE_ID_HEADROOM
        : undefined;
    const serialized = {
      shapeObjectId: input.shapeObjectIds.generatedShapeObjectId(
        serializedId(input.ownerShapeObjectId),
        BACKGROUND_LAYER_SHAPE_OBJECT_ID_OFFSET + index * BACKGROUND_LAYER_SHAPE_OBJECT_ID_STRIDE,
        { reservedIdHeadroom },
      ),
    };

    if (layer.kind === "background-image") {
      return {
        ...layer,
        objectPosition: layer.objectPosition ?? DEFAULT_OBJECT_POSITION,
        paintOrder,
        serialized,
      };
    }

    return {
      ...layer,
      paintOrder,
      serialized,
    };
  });
}

function elementOriginFromLayoutOrigin(
  origin: ProjectedLayoutOrigin | undefined,
): PptxElementOrigin {
  return {
    ...(origin?.graphNodeIds ? { graphNodeIds: origin.graphNodeIds } : {}),
    ...(origin?.styleEntityIds ? { styleEntityIds: origin.styleEntityIds } : {}),
    ...(origin?.assetEntityIds ? { assetEntityIds: origin.assetEntityIds } : {}),
    ...(origin?.source ? { source: origin.source } : {}),
    ...(origin?.componentProvenance ? { componentProvenance: origin.componentProvenance } : {}),
  };
}

function textFromProjectedLayoutNode(node: ProjectedLayoutNode): string {
  switch (node.kind) {
    case "text":
      return node.content.text;
    case "group":
      return node.children.map((child) => textFromProjectedLayoutNode(child)).join("");
    case "table":
      return node.sections
        .flatMap((section) => section.rows)
        .flatMap((row) => row.cells)
        .map((cell) => cell.children.map((child) => textFromProjectedLayoutNode(child)).join(""))
        .join("");
    case "image":
    case "video":
    case "shape":
      return "";
  }
}

function unsupportedTableCellContentSemantics(
  children: readonly PptxElement[],
): readonly PptxUnsupportedSemantic[] {
  const unsupportedKinds = [
    ...new Set(children.filter((child) => child.kind !== "text").map((child) => child.kind)),
  ];
  if (unsupportedKinds.length === 0) {
    return [];
  }

  return [
    {
      feature: "content",
      property: "tableCell.children",
      value: unsupportedKinds.join(","),
      reason:
        "Native PPTX table cell projection is text-centric in v0.8.4; rich cell content is preserved in the projected model but omitted from the native table XML fallback.",
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["nativeTableStructure", "textContent", "projectedCellChildren"],
        missing: ["nativeRichCellContent"],
      },
    },
  ];
}

function mapProjectedLayoutNodeToElement(input: {
  node: ProjectedLayoutNode;
  packagePartId: PackagePartId;
  indexPath: readonly number[];
  shapeObjectIds: ShapeObjectIdAllocator;
}): PptxElement {
  const graphNodeId = input.node.origin?.graphNodeIds?.[0];
  const layoutAnchor = layoutAnchorFor({
    templateAreaRef: input.node.origin?.templateAreaRef,
    templateAreaKind: input.node.origin?.templateAreaKind,
    frame: input.node.frame,
    templateAreaFrame: input.node.origin?.templateAreaFrame,
  });
  const ownerShapeObjectId = input.shapeObjectIds.shapeObjectId(input.indexPath);
  const paintIntentUnsupportedSemantics = unsupportedCompositingSemantics({
    filter: input.node.paintIntent?.filter,
    mixBlendMode: input.node.paintIntent?.mixBlendMode,
    isolation: input.node.paintIntent?.isolation,
  });
  const opacityUnsupportedSemantics =
    input.node.kind === "group"
      ? unsupportedGroupOpacitySemantics({ opacity: input.node.opacity })
      : unsupportedOpacityStackingContextSemantics({ opacity: input.node.opacity });
  const unsupportedSemantics = [
    ...(input.node.unsupportedSemantics ?? [])
      .filter(
        (semantic) =>
          semantic.feature !== "filter" &&
          semantic.feature !== "blend" &&
          semantic.feature !== "isolation",
      )
      .map((semantic) => ({
        ...semantic,
        ...(semantic.fallback
          ? {
              fallback: {
                ...semantic.fallback,
                missing: semantic.fallback.missing.map((missing) => {
                  switch (missing) {
                    case "projectedStroke":
                      return "pptxStroke";
                    case "projectedOutline":
                      return "pptxOutline";
                    case "projectedBackgroundLayer":
                      return "pptxBackgroundLayer";
                    case "projectedObjectPosition":
                      return "pptxObjectPosition";
                    default:
                      return missing;
                  }
                }),
              },
            }
          : {}),
      })),
    ...paintIntentUnsupportedSemantics,
    ...opacityUnsupportedSemantics,
  ];
  const base = {
    id: elementIdentity({
      packagePartId: input.packagePartId,
      graphNodeId,
      indexPath: input.indexPath,
    }),
    packagePartId: input.packagePartId,
    serialized: { shapeObjectId: ownerShapeObjectId },
    origin: elementOriginFromLayoutOrigin(input.node.origin),
    frame: input.node.frame,
    measurement: { frame: input.node.frame },
    ...(layoutAnchor ? { layoutAnchor } : {}),
    opacity: input.node.opacity,
    rotation: input.node.rotation,
    zIndex: input.node.zIndex,
    paintOrder: authoredPaintOrder({
      siblingOrder: input.node.siblingOrder,
      zIndex: input.node.zIndex,
    }),
    visibility: input.node.visibility,
    flipH: input.node.flipH,
    flipV: input.node.flipV,
    clip: input.node.clip,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
  };

  switch (input.node.kind) {
    case "group": {
      const backgroundLayers = projectBackgroundLayers({
        layers: input.node.backgroundLayers,
        ownerShapeObjectId,
        shapeObjectIds: input.shapeObjectIds,
        zIndex: input.node.zIndex,
        siblingOrder: input.node.siblingOrder,
      });
      const generatedStrokes = generatedStrokeLayers({
        packagePartId: input.packagePartId,
        graphNodeId,
        indexPath: input.indexPath,
        ownerShapeObjectId,
        shapeObjectIds: input.shapeObjectIds,
        frame: input.node.frame,
        siblingOrder: input.node.siblingOrder,
        zIndex: input.node.zIndex,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
      });
      return {
        ...base,
        kind: "group",
        fill: input.node.fill,
        ...(backgroundLayers ? { backgroundLayers } : {}),
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        ...(generatedStrokes ? { generatedStrokes } : {}),
        shadow: input.node.shadow,
        radiusEmu: input.node.radiusEmu,
        children: input.node.children.map((child, index) =>
          mapProjectedLayoutNodeToElement({
            node: child,
            packagePartId: input.packagePartId,
            indexPath: [...input.indexPath, index],
            shapeObjectIds: input.shapeObjectIds,
          }),
        ),
      };
    }
    case "table": {
      return {
        ...base,
        kind: "table",
        sections: input.node.sections.map((section, sectionIndex) => ({
          kind: "tableSection",
          sectionKind: section.sectionKind,
          unsupportedSemantics: unsupportedCompositingSemantics({
            filter: section.paintIntent?.filter,
            mixBlendMode: section.paintIntent?.mixBlendMode,
            isolation: section.paintIntent?.isolation,
          }).concat(unsupportedOpacityStackingContextSemantics({ opacity: section.opacity })),
          rows: section.rows.map((row, rowIndex) => ({
            kind: "tableRow",
            frame: row.frame,
            unsupportedSemantics: unsupportedCompositingSemantics({
              filter: row.paintIntent?.filter,
              mixBlendMode: row.paintIntent?.mixBlendMode,
              isolation: row.paintIntent?.isolation,
            }).concat(unsupportedOpacityStackingContextSemantics({ opacity: row.opacity })),
            cells: row.cells.map((cell, cellIndex) => {
              const children = cell.children.map((child, childIndex) =>
                mapProjectedLayoutNodeToElement({
                  node: child,
                  packagePartId: input.packagePartId,
                  indexPath: [...input.indexPath, sectionIndex, rowIndex, cellIndex, childIndex],
                  shapeObjectIds: input.shapeObjectIds,
                }),
              );
              const unsupportedSemantics = [
                ...unsupportedCompositingSemantics({
                  filter: cell.paintIntent?.filter,
                  mixBlendMode: cell.paintIntent?.mixBlendMode,
                  isolation: cell.paintIntent?.isolation,
                }),
                ...unsupportedOpacityStackingContextSemantics({ opacity: cell.opacity }),
                ...unsupportedTableCellContentSemantics(children),
              ];
              return {
                kind: "tableCell",
                cellKind: cell.cellKind,
                gridColumnIndex: cell.gridColumnIndex,
                colSpan: cell.colSpan,
                rowSpan: cell.rowSpan,
                frame: cell.frame,
                fill: cell.fill,
                edgeStrokes: cell.edgeStrokes,
                style: cell.style,
                text: cell.children.map((child) => textFromProjectedLayoutNode(child)).join(""),
                children,
                ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
              };
            }),
          })),
        })),
      };
    }
    case "text": {
      const backgroundLayers = projectBackgroundLayers({
        layers: input.node.backgroundLayers,
        ownerShapeObjectId,
        shapeObjectIds: input.shapeObjectIds,
        zIndex: input.node.zIndex,
        siblingOrder: input.node.siblingOrder,
      });
      const textGeneratedStrokes = generatedStrokeLayers({
        packagePartId: input.packagePartId,
        graphNodeId,
        indexPath: input.indexPath,
        ownerShapeObjectId,
        shapeObjectIds: input.shapeObjectIds,
        frame: input.node.frame,
        siblingOrder: input.node.siblingOrder,
        zIndex: input.node.zIndex,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
      });
      return {
        ...base,
        kind: "text",
        content: input.node.content,
        style: textBodyStyleFromProjected(input.node.style),
        fill: input.node.fill,
        ...(backgroundLayers ? { backgroundLayers } : {}),
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        ...(textGeneratedStrokes ? { generatedStrokes: textGeneratedStrokes } : {}),
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
        radiusEmu: input.node.radiusEmu,
      };
    }
    case "image":
      return {
        ...base,
        kind: "image",
        mediaPartId: mediaPartIdForElement(base.id),
        sourceFrame: input.node.sourceFrame,
        source: input.node.source,
        fit: input.node.fit,
        objectPosition: input.node.objectPosition ?? DEFAULT_OBJECT_POSITION,
        crop: input.node.crop,
        transparency: input.node.transparency,
        rounding: input.node.rounding,
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
      };
    case "video": {
      const posterSource = input.node.posterSource ?? DEFAULT_VIDEO_POSTER_SOURCE;
      return {
        ...base,
        kind: "video",
        mediaPartId: mediaPartIdForElement(base.id),
        posterMediaPartId: packageIdentity("media", `${base.id}:poster`),
        sourceFrame: input.node.sourceFrame,
        source: input.node.source,
        posterSource,
        fit: input.node.fit,
        objectPosition: input.node.objectPosition ?? DEFAULT_OBJECT_POSITION,
        transparency: input.node.transparency,
        rounding: input.node.rounding,
        shadow: input.node.shadow,
      };
    }
    case "shape": {
      const backgroundLayers = projectBackgroundLayers({
        layers: input.node.backgroundLayers,
        ownerShapeObjectId,
        shapeObjectIds: input.shapeObjectIds,
        zIndex: input.node.zIndex,
        siblingOrder: input.node.siblingOrder,
      });
      const shapeGeneratedStrokes = generatedStrokeLayers({
        packagePartId: input.packagePartId,
        graphNodeId,
        indexPath: input.indexPath,
        ownerShapeObjectId,
        shapeObjectIds: input.shapeObjectIds,
        frame: input.node.frame,
        siblingOrder: input.node.siblingOrder,
        zIndex: input.node.zIndex,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
      });
      return {
        ...base,
        kind: "shape",
        shape: input.node.shape,
        fill: input.node.fill,
        ...(backgroundLayers ? { backgroundLayers } : {}),
        stroke: input.node.stroke,
        edgeStrokes: input.node.edgeStrokes,
        outline: input.node.outline,
        ...(shapeGeneratedStrokes ? { generatedStrokes: shapeGeneratedStrokes } : {}),
        shadow: input.node.shadow,
        hyperlink: input.node.hyperlink,
        radiusEmu: input.node.radiusEmu,
      };
    }
  }
}

export function pptxSlidePartFor(input: {
  layoutSlide: ProjectedLayoutSlide;
  slideIndex: number;
  slideFrame: FrameIR;
  slideLayoutPart: PptxPackagePart;
  slidePartId: PackagePartId;
}): PptxSlidePart {
  const slideNumber = input.slideIndex + 1;
  const partId = input.slidePartId;
  const shapeObjectIds = createShapeObjectIdAllocator();
  const slideBackgroundOwnerShapeObjectId = shapeObjectIds.shapeObjectId([5000 + input.slideIndex]);
  const backgroundLayers = projectBackgroundLayers({
    layers: input.layoutSlide.backgroundLayers,
    ownerShapeObjectId: slideBackgroundOwnerShapeObjectId,
    shapeObjectIds,
    siblingOrder: 0,
  });
  const origin = elementOriginFromLayoutOrigin(input.layoutSlide.origin);

  return {
    id: partId,
    category: "authored-content",
    kind: "slide",
    path: `ppt/slides/slide${slideNumber}.xml`,
    origin,
    relationships: [
      {
        id: serializedId("rId1"),
        target: projectedRelationshipTarget({
          ownerPath: `ppt/slides/slide${slideNumber}.xml`,
          targetPath: input.slideLayoutPart.path,
        }),
        targetPartId: input.slideLayoutPart.id,
        targetPath: input.slideLayoutPart.path,
        type: "slideLayout",
      },
    ],
    payload: {
      slideId: String(256 + input.slideIndex),
      name: input.layoutSlide.name,
      background: input.layoutSlide.background,
      ...(backgroundLayers ? { backgroundLayers } : {}),
      drawing: drawingFromElements(
        input.layoutSlide.nodes.map((node, index) =>
          mapProjectedLayoutNodeToElement({
            node,
            packagePartId: partId,
            indexPath: [index],
            shapeObjectIds,
          }),
        ),
      ),
    },
  };
}

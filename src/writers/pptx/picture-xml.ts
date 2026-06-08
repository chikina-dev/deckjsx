import type {
  PptxBackgroundImageLayer,
  PptxElement,
  PptxPackageModel,
  PptxSlidePart,
} from "../../projection/pptx/model";
import type { FrameIR, ImageSourceIR, ObjectPositionIR } from "../../layout/projected";
import { EMU_PER_INCH } from "../../types";
import {
  alphaValue,
  requireProjectedRelationshipId,
  writeNonVisual,
  writeShadow,
  writeTransform,
} from "./drawing-xml";
import { mediaPartPayload } from "./media";
import { XmlChunkWriter } from "./xml-writer";

type SrcRectImageLike = {
  readonly frame: FrameIR;
  readonly sourceFrame: FrameIR;
  readonly source: ImageSourceIR;
  readonly fit: "contain" | "cover" | "size" | "stretch";
  readonly objectPosition: ObjectPositionIR;
  readonly crop?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly size?: { readonly widthEmu?: number; readonly heightEmu?: number };
};

type ImageSrcRect = {
  readonly l: number;
  readonly r: number;
  readonly t: number;
  readonly b: number;
};

export type SlideImageRenderContext = {
  readonly mediaRelationshipBySource: ReadonlyMap<string, string>;
  readonly relationshipIds: ReadonlySet<string>;
  readonly intrinsicImageSizeBySource: ReadonlyMap<string, { width: number; height: number }>;
};

function emuToInches(value: number): number {
  return value / EMU_PER_INCH;
}

function combineOpacity(parent: number | undefined, child: number | undefined): number | undefined {
  if (parent === undefined) {
    return child;
  }
  if (child === undefined) {
    return parent;
  }
  return parent * child;
}

export function imageSourceKey(source: ImageSourceIR): string {
  switch (source.kind) {
    case "path":
      return `path:${source.path}`;
    case "url":
      return `url:${source.url}`;
    case "data":
      return `data:${source.data}`;
  }
}

function mediaRelationshipBySource(
  projection: PptxPackageModel,
  slide: PptxSlidePart,
): ReadonlyMap<string, string> {
  const mediaSourcesByPath = new Map<string, readonly ImageSourceIR[]>();
  for (const part of projection.parts) {
    if (part.kind !== "media") {
      continue;
    }
    const payload = mediaPartPayload(part);
    mediaSourcesByPath.set(part.path, payload.sources);
  }

  const relationships = new Map<string, string>();
  for (const relationship of slide.relationships ?? []) {
    if (relationship.type !== "image") {
      continue;
    }
    for (const source of mediaSourcesByPath.get(relationship.targetPath) ?? []) {
      relationships.set(imageSourceKey(source), relationship.id);
    }
  }

  return relationships;
}

function intrinsicImageSizeFromMediaMetadata(
  projection: PptxPackageModel,
): ReadonlyMap<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const part of projection.parts) {
    if (part.kind !== "media") {
      continue;
    }
    const payload = mediaPartPayload(part);
    const width = payload?.metadata?.widthPx;
    const height = payload?.metadata?.heightPx;
    if (payload.source && width && height) {
      for (const source of payload.sources) {
        sizes.set(imageSourceKey(source), { width, height });
      }
    }
  }
  return sizes;
}

export function createSlideImageRenderContext(
  slide: PptxSlidePart,
  projection: PptxPackageModel,
): SlideImageRenderContext {
  return {
    mediaRelationshipBySource: mediaRelationshipBySource(projection, slide),
    relationshipIds: new Set((slide.relationships ?? []).map((relationship) => relationship.id)),
    intrinsicImageSizeBySource: intrinsicImageSizeFromMediaMetadata(projection),
  };
}

export function requireSlideRelationshipId(
  relationshipId: string | undefined,
  input: {
    readonly context: SlideImageRenderContext;
    readonly label: string;
    readonly type: string;
  },
): string {
  const id = requireProjectedRelationshipId(relationshipId, {
    label: input.label,
    type: input.type,
  });
  if (!input.context.relationshipIds.has(id)) {
    throw new Error(
      `${input.label} must reference existing projected ${input.type} relationship ${id}.`,
    );
  }

  return id;
}

function intrinsicImageSize(
  source: ImageSourceIR,
  context?: SlideImageRenderContext,
): { width: number; height: number } | undefined {
  const projected = context?.intrinsicImageSizeBySource.get(imageSourceKey(source));
  if (projected && projected.width > 0 && projected.height > 0) {
    return projected;
  }

  return undefined;
}

function requireIntrinsicImageSize(
  source: ImageSourceIR,
  context: SlideImageRenderContext,
  label: string,
): { width: number; height: number } {
  const intrinsic = intrinsicImageSize(source, context);
  if (!intrinsic) {
    throw new Error(`${label} requires projected media metadata widthPx and heightPx.`);
  }

  return intrinsic;
}

function positiveEmu(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`PPTX picture XML requires positive ${path}.`);
  }

  return value;
}

function finiteRatio(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PPTX picture XML requires finite ${path}.`);
  }

  return value;
}

function cropRatio(value: number | undefined, path: string): number {
  const ratio = finiteRatio(value, path);
  if (ratio < 0 || ratio > 1) {
    throw new Error(`PPTX picture XML requires ${path} between 0 and 1.`);
  }

  return ratio;
}

function requireImageCrop(
  crop: NonNullable<SrcRectImageLike["crop"]>,
): NonNullable<SrcRectImageLike["crop"]> {
  const normalized = {
    top: cropRatio(crop.top, "image crop.top"),
    right: cropRatio(crop.right, "image crop.right"),
    bottom: cropRatio(crop.bottom, "image crop.bottom"),
    left: cropRatio(crop.left, "image crop.left"),
  };

  if (normalized.left + normalized.right >= 1) {
    throw new Error("PPTX picture XML requires image crop to leave positive source width.");
  }
  if (normalized.top + normalized.bottom >= 1) {
    throw new Error("PPTX picture XML requires image crop to leave positive source height.");
  }

  return normalized;
}

function requireObjectPosition(
  value: ObjectPositionIR | undefined,
  label: string,
): ObjectPositionIR {
  if (!value) {
    throw new Error(`${label} requires projected image objectPosition.`);
  }

  finiteRatio(value.x, `${label} objectPosition.x`);
  finiteRatio(value.y, `${label} objectPosition.y`);
  return value;
}

function intersectFrames(a: FrameIR, b: FrameIR): FrameIR | undefined {
  const xEmu = Math.max(a.xEmu, b.xEmu);
  const yEmu = Math.max(a.yEmu, b.yEmu);
  const rightEmu = Math.min(a.xEmu + a.widthEmu, b.xEmu + b.widthEmu);
  const bottomEmu = Math.min(a.yEmu + a.heightEmu, b.yEmu + b.heightEmu);

  if (rightEmu <= xEmu || bottomEmu <= yEmu) {
    return undefined;
  }

  return {
    xEmu,
    yEmu,
    widthEmu: rightEmu - xEmu,
    heightEmu: bottomEmu - yEmu,
  };
}

function resolveBackgroundImageTileSize(
  layer: PptxBackgroundImageLayer,
  context: SlideImageRenderContext,
) {
  const positioningFrame = layer.sourceFrame;

  if (layer.fit === "size") {
    const widthEmu = layer.size?.widthEmu;
    const heightEmu = layer.size?.heightEmu;

    if (widthEmu !== undefined && heightEmu !== undefined) {
      return {
        widthEmu: positiveEmu(widthEmu, "background image size.widthEmu"),
        heightEmu: positiveEmu(heightEmu, "background image size.heightEmu"),
      };
    }

    const intrinsic = requireIntrinsicImageSize(
      layer.source,
      context,
      "Background image size calculation",
    );
    const imageRatio = intrinsic.width / intrinsic.height;
    if (widthEmu !== undefined) {
      return {
        widthEmu: positiveEmu(widthEmu, "background image size.widthEmu"),
        heightEmu: positiveEmu(widthEmu, "background image size.widthEmu") / imageRatio,
      };
    }

    if (heightEmu !== undefined) {
      return {
        widthEmu: positiveEmu(heightEmu, "background image size.heightEmu") * imageRatio,
        heightEmu: positiveEmu(heightEmu, "background image size.heightEmu"),
      };
    }

    return {
      widthEmu: (intrinsic.width / 96) * EMU_PER_INCH,
      heightEmu: (intrinsic.height / 96) * EMU_PER_INCH,
    };
  }

  if (layer.fit === "stretch") {
    return {
      widthEmu: positiveEmu(positioningFrame.widthEmu, "background image sourceFrame.widthEmu"),
      heightEmu: positiveEmu(positioningFrame.heightEmu, "background image sourceFrame.heightEmu"),
    };
  }

  const intrinsic = requireIntrinsicImageSize(
    layer.source,
    context,
    `Background image ${layer.fit} fit`,
  );
  const imageRatio = intrinsic.width / intrinsic.height;
  const boxRatio =
    positiveEmu(positioningFrame.widthEmu, "background image sourceFrame.widthEmu") /
    positiveEmu(positioningFrame.heightEmu, "background image sourceFrame.heightEmu");

  if (layer.fit === "contain") {
    if (boxRatio > imageRatio) {
      return {
        widthEmu: positioningFrame.heightEmu * imageRatio,
        heightEmu: positioningFrame.heightEmu,
      };
    }

    return {
      widthEmu: positioningFrame.widthEmu,
      heightEmu: positioningFrame.widthEmu / imageRatio,
    };
  }

  if (boxRatio > imageRatio) {
    return {
      widthEmu: positioningFrame.widthEmu,
      heightEmu: positioningFrame.widthEmu / imageRatio,
    };
  }

  return {
    widthEmu: positioningFrame.heightEmu * imageRatio,
    heightEmu: positioningFrame.heightEmu,
  };
}

function expandBackgroundImageLayer(
  layer: PptxBackgroundImageLayer,
  context: SlideImageRenderContext,
): SrcRectImageLike[] {
  if (
    layer.repeat !== "no-repeat" &&
    layer.repeat !== "repeat" &&
    layer.repeat !== "repeat-x" &&
    layer.repeat !== "repeat-y"
  ) {
    throw new Error("PPTX picture XML requires supported background image repeat.");
  }
  if (layer.repeat === "no-repeat" && layer.fit !== "size") {
    return [layer];
  }

  const tileSize = resolveBackgroundImageTileSize(layer, context);
  const position = requireObjectPosition(layer.objectPosition, "Background image");
  const positioningFrame = layer.sourceFrame;
  const baseTile = {
    xEmu: positioningFrame.xEmu + (positioningFrame.widthEmu - tileSize.widthEmu) * position.x,
    yEmu: positioningFrame.yEmu + (positioningFrame.heightEmu - tileSize.heightEmu) * position.y,
    widthEmu: tileSize.widthEmu,
    heightEmu: tileSize.heightEmu,
  };
  const repeatX = layer.repeat === "repeat" || layer.repeat === "repeat-x";
  const repeatY = layer.repeat === "repeat" || layer.repeat === "repeat-y";
  const xIndices = repeatX
    ? (() => {
        const min =
          Math.floor((layer.frame.xEmu - (baseTile.xEmu + baseTile.widthEmu)) / baseTile.widthEmu) +
          1;
        const max =
          Math.ceil((layer.frame.xEmu + layer.frame.widthEmu - baseTile.xEmu) / baseTile.widthEmu) -
          1;
        return Array.from({ length: max - min + 1 }, (_, index) => min + index);
      })()
    : [0];
  const yIndices = repeatY
    ? (() => {
        const min =
          Math.floor(
            (layer.frame.yEmu - (baseTile.yEmu + baseTile.heightEmu)) / baseTile.heightEmu,
          ) + 1;
        const max =
          Math.ceil(
            (layer.frame.yEmu + layer.frame.heightEmu - baseTile.yEmu) / baseTile.heightEmu,
          ) - 1;
        return Array.from({ length: max - min + 1 }, (_, index) => min + index);
      })()
    : [0];
  const tiles: SrcRectImageLike[] = [];

  for (const yIndex of yIndices) {
    for (const xIndex of xIndices) {
      const sourceFrame = {
        xEmu: baseTile.xEmu + xIndex * baseTile.widthEmu,
        yEmu: baseTile.yEmu + yIndex * baseTile.heightEmu,
        widthEmu: baseTile.widthEmu,
        heightEmu: baseTile.heightEmu,
      };
      const frame = intersectFrames(sourceFrame, layer.frame);
      if (frame) {
        tiles.push({
          frame,
          sourceFrame,
          source: layer.source,
          fit: "stretch",
          objectPosition: position,
        });
      }
    }
  }

  return tiles;
}

function resolveImageSrcRect(
  node: SrcRectImageLike,
  context: SlideImageRenderContext,
  label = "Image",
): ImageSrcRect | undefined {
  const w = emuToInches(node.sourceFrame.widthEmu);
  const h = emuToInches(node.sourceFrame.heightEmu);
  positiveEmu(node.sourceFrame.widthEmu, "image sourceFrame.widthEmu");
  positiveEmu(node.sourceFrame.heightEmu, "image sourceFrame.heightEmu");
  const position = requireObjectPosition(node.objectPosition, label);
  const clipLeftRatio =
    node.sourceFrame.widthEmu === 0
      ? 0
      : (node.frame.xEmu - node.sourceFrame.xEmu) / node.sourceFrame.widthEmu;
  const clipRightRatio =
    node.sourceFrame.widthEmu === 0
      ? 0
      : (node.sourceFrame.xEmu +
          node.sourceFrame.widthEmu -
          (node.frame.xEmu + node.frame.widthEmu)) /
        node.sourceFrame.widthEmu;
  const clipTopRatio =
    node.sourceFrame.heightEmu === 0
      ? 0
      : (node.frame.yEmu - node.sourceFrame.yEmu) / node.sourceFrame.heightEmu;
  const clipBottomRatio =
    node.sourceFrame.heightEmu === 0
      ? 0
      : (node.sourceFrame.yEmu +
          node.sourceFrame.heightEmu -
          (node.frame.yEmu + node.frame.heightEmu)) /
        node.sourceFrame.heightEmu;

  const applyClipToSrcRect = (srcRect: ImageSrcRect | undefined): ImageSrcRect | undefined => {
    const left = (srcRect?.l ?? 0) / 100000;
    const right = 1 - (srcRect?.r ?? 0) / 100000;
    const top = (srcRect?.t ?? 0) / 100000;
    const bottom = 1 - (srcRect?.b ?? 0) / 100000;
    const clippedLeft = left + (right - left) * clipLeftRatio;
    const clippedRight = right - (right - left) * clipRightRatio;
    const clippedTop = top + (bottom - top) * clipTopRatio;
    const clippedBottom = bottom - (bottom - top) * clipBottomRatio;

    if (
      clipLeftRatio === 0 &&
      clipRightRatio === 0 &&
      clipTopRatio === 0 &&
      clipBottomRatio === 0 &&
      srcRect === undefined
    ) {
      return undefined;
    }

    return {
      l: Math.round(clippedLeft * 100000),
      r: Math.round((1 - clippedRight) * 100000),
      t: Math.round(clippedTop * 100000),
      b: Math.round((1 - clippedBottom) * 100000),
    };
  };

  if (node.crop) {
    const crop = requireImageCrop(node.crop);
    return applyClipToSrcRect({
      l: Math.round(crop.left * 100000),
      r: Math.round(crop.right * 100000),
      t: Math.round(crop.top * 100000),
      b: Math.round(crop.bottom * 100000),
    });
  }

  if (node.fit === "stretch" || node.fit === "size") {
    return applyClipToSrcRect(undefined);
  }

  if (node.fit !== "contain" && node.fit !== "cover") {
    throw new Error("PPTX picture XML requires supported image fit.");
  }

  const intrinsic = requireIntrinsicImageSize(node.source, context, `Image ${node.fit} fit`);
  const imageRatio = intrinsic.width / intrinsic.height;
  const boxRatio = w / h;

  if (node.fit === "contain") {
    if (boxRatio > imageRatio) {
      const renderedWidth = h * imageRatio;
      const padRatio = w / renderedWidth - 1;
      return applyClipToSrcRect({
        l: Math.round(-padRatio * position.x * 100000),
        r: Math.round(-padRatio * (1 - position.x) * 100000),
        t: 0,
        b: 0,
      });
    }

    const renderedHeight = w / imageRatio;
    const padRatio = h / renderedHeight - 1;
    return applyClipToSrcRect({
      l: 0,
      r: 0,
      t: Math.round(-padRatio * position.y * 100000),
      b: Math.round(-padRatio * (1 - position.y) * 100000),
    });
  }

  if (boxRatio > imageRatio) {
    const cropRatio = 1 - intrinsic.width / (intrinsic.height * boxRatio);
    return applyClipToSrcRect({
      l: 0,
      r: 0,
      t: Math.round(cropRatio * position.y * 100000),
      b: Math.round(cropRatio * (1 - position.y) * 100000),
    });
  }

  return applyClipToSrcRect({
    l: Math.round((1 - (intrinsic.height * boxRatio) / intrinsic.width) * position.x * 100000),
    r: Math.round(
      (1 - (intrinsic.height * boxRatio) / intrinsic.width) * (1 - position.x) * 100000,
    ),
    t: 0,
    b: 0,
  });
}

function writeSrcRect(writer: XmlChunkWriter, srcRect: ImageSrcRect | undefined): void {
  if (srcRect) {
    writer.empty("a:srcRect", { l: srcRect.l, r: srcRect.r, t: srcRect.t, b: srcRect.b });
    writer.empty("a:stretch");
    return;
  }

  writer.open("a:stretch").empty("a:fillRect").close("a:stretch");
}

function writeBackgroundPicture(
  writer: XmlChunkWriter,
  image: SrcRectImageLike,
  shapeObjectId: string,
  nameIndex: number,
  embed: string,
  context: SlideImageRenderContext,
  inheritedOpacity?: number,
): void {
  const transparency = alphaValue(undefined, inheritedOpacity);

  writer.open("p:pic");
  writeNonVisual(writer, "pic", shapeObjectId, `Background ${nameIndex}`);
  writer.open("p:blipFill").open("a:blip", { "r:embed": embed });
  if (transparency !== undefined && transparency !== 100000) {
    writer.empty("a:alphaModFix", { amt: transparency });
  }
  writer.close("a:blip");
  writeSrcRect(writer, resolveImageSrcRect(image, context, "Background image"));
  writer.close("p:blipFill");
  writer.open("p:spPr");
  writeTransform(writer, image.frame);
  writer.open("a:prstGeom", { prst: "rect" }).empty("a:avLst").close("a:prstGeom");
  writer.close("p:spPr").close("p:pic");
}

function backgroundPictureShapeObjectId(
  layer: PptxBackgroundImageLayer,
  tileIndex: number,
): string {
  const baseId = layer.serialized?.shapeObjectId;
  if (typeof baseId !== "string" || !/^[1-9]\d*$/.test(baseId)) {
    throw new Error("Background image layer must carry a projected shape object id.");
  }

  const value = Number.parseInt(baseId, 10) + tileIndex;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Background image layer projected shape object id is not writer-safe.");
  }

  return String(value);
}

export function writeBackgroundPictureElements(
  writer: XmlChunkWriter,
  layer: PptxBackgroundImageLayer,
  startIndex: number,
  context: SlideImageRenderContext,
  inheritedOpacity?: number,
): void {
  const sourceKey = imageSourceKey(layer.source);
  const embed = requireSlideRelationshipId(context.mediaRelationshipBySource.get(sourceKey), {
    context,
    label: `Background image layer ${sourceKey}`,
    type: "image",
  });

  for (const [tileIndex, tile] of expandBackgroundImageLayer(layer, context).entries()) {
    writeBackgroundPicture(
      writer,
      tile,
      backgroundPictureShapeObjectId(layer, tileIndex),
      startIndex + tileIndex,
      embed,
      context,
      inheritedOpacity,
    );
  }
}

export function writePictureElement(
  writer: XmlChunkWriter,
  element: Extract<PptxElement, { kind: "image" }>,
  index: number,
  context: SlideImageRenderContext,
  inheritedOpacity?: number,
): void {
  const embed = requireSlideRelationshipId(element.serialized.relationshipId, {
    context,
    label: `Image drawing element ${element.id}`,
    type: "image",
  });
  const hyperlinkRelationshipId = element.hyperlink?.url
    ? requireSlideRelationshipId(element.serialized.hyperlinkRelationshipId, {
        context,
        label: `Image drawing element ${element.id}`,
        type: "hyperlink",
      })
    : undefined;

  const transparency = alphaValue(
    element.transparency,
    combineOpacity(inheritedOpacity, element.opacity),
  );

  writer.open("p:pic");
  writeNonVisual(
    writer,
    "pic",
    element.serialized.shapeObjectId,
    `Picture ${index}`,
    hyperlinkRelationshipId,
    element.hyperlink?.tooltip,
  );
  writer.open("p:blipFill").open("a:blip", { "r:embed": embed });
  if (transparency !== undefined && transparency !== 100000) {
    writer.empty("a:alphaModFix", { amt: transparency });
  }
  writer.close("a:blip");
  writeSrcRect(writer, resolveImageSrcRect(element, context));
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

import { Buffer } from "node:buffer";
import { imageSize } from "image-size";
import JSZip from "jszip";
import type {
  BackgroundImageLayerIR,
  BackgroundLayerIR,
  FrameIR,
  GroupIR,
  ImageIR,
  NodeIR,
  PresentationIR,
  TextIR,
} from "../ir/index";
import { EMU_PER_INCH } from "../types";

export type SrcRectImageLike = {
  frame: ImageIR["frame"];
  sourceFrame: ImageIR["sourceFrame"];
  source: ImageIR["source"];
  fit: ImageIR["fit"] | BackgroundImageLayerIR["fit"];
  objectPosition?: ImageIR["objectPosition"];
  crop?: ImageIR["crop"];
  size?: BackgroundImageLayerIR["size"];
};

export type ImageSrcRect = {
  l: number;
  r: number;
  t: number;
  b: number;
};

type SlideXmlPatch<TPatch> = {
  pattern: RegExp;
  patches: Array<TPatch | undefined>;
  apply(block: string, patch: TPatch): string;
};

export type ShapeLinePatch = {
  cap?: "flat" | "rnd" | "sq";
  join?: "miter" | "round" | "bevel";
};

export type SlideXmlPatchPlan = {
  pictureSrcRects: Array<ImageSrcRect | undefined>;
  shapeFills: Array<string | undefined>;
  shapeLines: Array<ShapeLinePatch | undefined>;
  slideBackgroundFill?: string;
  textIndentsEmu: Array<number | undefined>;
};

// PptxGenJS can emit most presentation nodes directly, but a few features are
// only available by patching the generated slide XML. Keep those approximations
// in backend-local categories so compiler IR remains independent of OOXML shape
// ordering details.

function emuToInches(value: number): number {
  return value / EMU_PER_INCH;
}

function pointsToEmu(value: number): number {
  return (value / 72) * EMU_PER_INCH;
}

function combineTransparency(
  transparency: number | undefined,
  opacity: number | undefined,
): number | undefined {
  if (transparency === undefined && opacity === undefined) {
    return undefined;
  }

  const baseVisibleAlpha = 1 - (transparency ?? 0) / 100;
  const nodeOpacity = opacity ?? 1;
  const visibleAlpha = Math.max(0, Math.min(1, baseVisibleAlpha * nodeOpacity));

  return Math.round((1 - visibleAlpha) * 100);
}

function combineOpacities(parentOpacity: number | undefined, nodeOpacity: number | undefined) {
  const parent = parentOpacity ?? 1;
  const node = nodeOpacity ?? 1;
  return parent * node;
}

function buildGradientFillXml(fill: GroupIR["fill"], opacity?: number) {
  if (!fill || fill.kind === "solid") {
    return undefined;
  }

  const stopsXml = fill.stops
    .map((stop) => {
      const transparency = combineTransparency(stop.transparency, opacity);
      return `<a:gs pos="${Math.round(stop.position * 100000)}"><a:srgbClr val="${stop.color}">${
        transparency === undefined ? "" : `<a:alpha val="${(100 - transparency) * 1000}"/>`
      }</a:srgbClr></a:gs>`;
    })
    .join("");

  if (fill.kind === "linear-gradient") {
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stopsXml}</a:gsLst><a:lin ang="${Math.round(
      fill.angle * 60000,
    )}" scaled="1"/></a:gradFill>`;
  }

  return `<a:gradFill rotWithShape="1"><a:gsLst>${stopsXml}</a:gsLst><a:path path="circle"><a:fillToRect l="${Math.round(
    (fill.center.x - fill.radius.x) * 100000,
  )}" t="${Math.round((fill.center.y - fill.radius.y) * 100000)}" r="${Math.round(
    (1 - (fill.center.x + fill.radius.x)) * 100000,
  )}" b="${Math.round((1 - (fill.center.y + fill.radius.y)) * 100000)}"/></a:path></a:gradFill>`;
}

export function isBackgroundImageLayer(
  layer: BackgroundLayerIR | undefined,
): layer is BackgroundImageLayerIR {
  return layer !== undefined && typeof layer === "object" && "source" in layer;
}

function buildBackgroundLayerFillXml(layer: BackgroundLayerIR | undefined, opacity?: number) {
  return isBackgroundImageLayer(layer) ? undefined : buildGradientFillXml(layer, opacity);
}

function buildShapeLinePatch(stroke: GroupIR["stroke"]): ShapeLinePatch | undefined {
  if (!stroke) {
    return undefined;
  }

  const cap =
    stroke.lineCap === "butt"
      ? "flat"
      : stroke.lineCap === "round"
        ? "rnd"
        : stroke.lineCap === "square"
          ? "sq"
          : undefined;
  const join =
    stroke.lineJoin === "miter"
      ? "miter"
      : stroke.lineJoin === "round"
        ? "round"
        : stroke.lineJoin === "bevel"
          ? "bevel"
          : undefined;

  if (!cap && !join) {
    return undefined;
  }

  return {
    ...(cap ? { cap } : {}),
    ...(join ? { join } : {}),
  };
}

function decodeImageData(data: string): Uint8Array {
  if (data.startsWith("data:")) {
    const commaIndex = data.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Unsupported image data URI.");
    }

    const metadata = data.slice(0, commaIndex);
    const payload = data.slice(commaIndex + 1);

    if (metadata.endsWith(";base64")) {
      return Buffer.from(payload, "base64");
    }

    return Buffer.from(decodeURIComponent(payload), "utf8");
  }

  return Buffer.from(data, "base64");
}

function getIntrinsicImageSize(node: SrcRectImageLike) {
  const size =
    node.source.kind === "path"
      ? imageSize(node.source.path)
      : imageSize(decodeImageData(node.source.data));

  if (!size.width || !size.height) {
    throw new Error("Unable to determine intrinsic image size.");
  }

  return {
    width: size.width,
    height: size.height,
  };
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

function resolveBackgroundImageTileSize(layer: BackgroundImageLayerIR) {
  const intrinsic = getIntrinsicImageSize(layer);
  const imageRatio = intrinsic.width / intrinsic.height;
  const positioningFrame = layer.sourceFrame;

  if (layer.fit === "size") {
    const widthEmu = layer.size?.widthEmu;
    const heightEmu = layer.size?.heightEmu;

    if (widthEmu !== undefined && heightEmu !== undefined) {
      return { widthEmu, heightEmu };
    }

    if (widthEmu !== undefined) {
      return { widthEmu, heightEmu: widthEmu / imageRatio };
    }

    if (heightEmu !== undefined) {
      return { widthEmu: heightEmu * imageRatio, heightEmu };
    }

    return {
      widthEmu: (intrinsic.width / 96) * EMU_PER_INCH,
      heightEmu: (intrinsic.height / 96) * EMU_PER_INCH,
    };
  }

  if (layer.fit === "stretch") {
    return {
      widthEmu: positioningFrame.widthEmu,
      heightEmu: positioningFrame.heightEmu,
    };
  }

  const boxRatio = positioningFrame.widthEmu / positioningFrame.heightEmu;

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

export function expandBackgroundImageLayer(layer: BackgroundImageLayerIR): SrcRectImageLike[] {
  if (layer.repeat === "no-repeat" && layer.fit !== "size") {
    return [layer];
  }

  const tileSize = resolveBackgroundImageTileSize(layer);
  const position = layer.objectPosition ?? { x: 0.5, y: 0.5 };
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
        return Array.from({ length: max - min + 1 }, (_, i) => min + i);
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
        return Array.from({ length: max - min + 1 }, (_, i) => min + i);
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
      if (!frame) {
        continue;
      }

      tiles.push({
        frame,
        sourceFrame,
        source: layer.source,
        fit: "stretch",
      });
    }
  }

  return tiles;
}

function resolveImageSrcRect(node: SrcRectImageLike): ImageSrcRect | undefined {
  const intrinsic = getIntrinsicImageSize(node);
  const w = emuToInches(node.sourceFrame.widthEmu);
  const h = emuToInches(node.sourceFrame.heightEmu);
  const position = node.objectPosition ?? { x: 0.5, y: 0.5 };
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
    const left = (srcRect?.l ?? 0) / 100_000;
    const right = 1 - (srcRect?.r ?? 0) / 100_000;
    const top = (srcRect?.t ?? 0) / 100_000;
    const bottom = 1 - (srcRect?.b ?? 0) / 100_000;

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
      l: Math.round(clippedLeft * 100_000),
      r: Math.round((1 - clippedRight) * 100_000),
      t: Math.round(clippedTop * 100_000),
      b: Math.round((1 - clippedBottom) * 100_000),
    };
  };

  if (node.crop) {
    return applyClipToSrcRect({
      l: Math.round(node.crop.left * 100_000),
      r: Math.round(node.crop.right * 100_000),
      t: Math.round(node.crop.top * 100_000),
      b: Math.round(node.crop.bottom * 100_000),
    });
  }

  if (node.fit === "stretch") {
    return applyClipToSrcRect(undefined);
  }

  const imageRatio = intrinsic.width / intrinsic.height;
  const boxRatio = w / h;

  if (node.fit === "contain") {
    if (boxRatio > imageRatio) {
      const renderedWidth = h * imageRatio;
      const padRatio = w / renderedWidth - 1;
      return applyClipToSrcRect({
        l: Math.round(-padRatio * position.x * 100_000),
        r: Math.round(-padRatio * (1 - position.x) * 100_000),
        t: 0,
        b: 0,
      });
    }

    const renderedHeight = w / imageRatio;
    const padRatio = h / renderedHeight - 1;
    return applyClipToSrcRect({
      l: 0,
      r: 0,
      t: Math.round(-padRatio * position.y * 100_000),
      b: Math.round(-padRatio * (1 - position.y) * 100_000),
    });
  }

  if (boxRatio > imageRatio) {
    const cropRatio = 1 - intrinsic.width / (intrinsic.height * boxRatio);
    return applyClipToSrcRect({
      l: 0,
      r: 0,
      t: Math.round(cropRatio * position.y * 100_000),
      b: Math.round(cropRatio * (1 - position.y) * 100_000),
    });
  }

  return applyClipToSrcRect({
    l: Math.round((1 - (intrinsic.height * boxRatio) / intrinsic.width) * position.x * 100_000),
    r: Math.round(
      (1 - (intrinsic.height * boxRatio) / intrinsic.width) * (1 - position.x) * 100_000,
    ),
    t: 0,
    b: 0,
  });
}

function buildSrcRectXml(srcRect: ImageSrcRect) {
  return `<a:srcRect l="${srcRect.l}" r="${srcRect.r}" t="${srcRect.t}" b="${srcRect.b}"/><a:stretch/>`;
}

function patchPictureBlock(block: string, srcRect: ImageSrcRect) {
  return block.replace(
    /<a:srcRect [^>]*\/><a:stretch\/>|<a:stretch><a:fillRect\/><\/a:stretch>/,
    buildSrcRectXml(srcRect),
  );
}

function patchParagraphIndentBlock(block: string, textIndentEmu: number) {
  return block.replace(/<a:pPr\b([^>]*)>/g, (match, attrs: string) => {
    const indentMatch = attrs.match(/\sindent="(-?\d+)"/);
    const baseIndent = indentMatch ? Number.parseInt(indentMatch[1], 10) : 0;
    const nextIndent = baseIndent + textIndentEmu;
    const nextAttrs = indentMatch
      ? attrs.replace(/\sindent="-?\d+"/, ` indent="${nextIndent}"`)
      : `${attrs} indent="${nextIndent}"`;
    return `<a:pPr${nextAttrs}>`;
  });
}

function patchShapeFillBlock(block: string, fillXml: string) {
  return block.replace(/<a:noFill\/>|<a:solidFill>[\s\S]*?<\/a:solidFill>/, fillXml);
}

function patchSlideBackgroundBlock(block: string, fillXml: string) {
  return block.replace(/<a:noFill\/>|<a:solidFill>[\s\S]*?<\/a:solidFill>/, fillXml);
}

function patchShapeLineBlock(block: string, patch: ShapeLinePatch) {
  return block.replace(/<a:ln([^>]*)>([\s\S]*?)<\/a:ln>/, (_, attrs: string, inner: string) => {
    const nextAttrs = patch.cap
      ? /\scap="[^"]*"/.test(attrs)
        ? attrs.replace(/\scap="[^"]*"/, ` cap="${patch.cap}"`)
        : `${attrs} cap="${patch.cap}"`
      : attrs;
    const innerWithoutJoin = inner.replace(/<a:(?:round|bevel|miter)(?:\s[^>]*)?\/>/g, "");
    const nextInner =
      patch.join === undefined
        ? innerWithoutJoin
        : `${innerWithoutJoin}<a:${patch.join}${patch.join === "miter" ? ' lim="800000"' : ""}/>`;
    return `<a:ln${nextAttrs}>${nextInner}</a:ln>`;
  });
}

function collectShapeFillPatches(
  nodes: ReadonlyArray<NodeIR>,
  inheritedOpacity?: number,
): Array<string | undefined> {
  const patches: Array<string | undefined> = [];

  for (const node of nodes) {
    if (node.visibility === "hidden") {
      continue;
    }

    const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);

    if (node.kind === "group") {
      if (node.outline) patches.push(undefined);
      if (node.edgeStrokes?.top) patches.push(undefined);
      if (node.edgeStrokes?.right) patches.push(undefined);
      if (node.edgeStrokes?.bottom) patches.push(undefined);
      if (node.edgeStrokes?.left) patches.push(undefined);
      if (node.backgroundLayers) {
        patches.push(
          ...node.backgroundLayers.map((layer) =>
            buildBackgroundLayerFillXml(layer, effectiveOpacity),
          ),
        );
      }
      if (node.fill || node.stroke || node.shadow) {
        patches.push(buildGradientFillXml(node.fill, effectiveOpacity));
      }
      patches.push(...collectShapeFillPatches(node.children, effectiveOpacity));
      continue;
    }

    if (node.kind === "text") {
      if (node.outline) patches.push(undefined);
      if (node.edgeStrokes?.top) patches.push(undefined);
      if (node.edgeStrokes?.right) patches.push(undefined);
      if (node.edgeStrokes?.bottom) patches.push(undefined);
      if (node.edgeStrokes?.left) patches.push(undefined);
      if (node.backgroundLayers) {
        patches.push(
          ...node.backgroundLayers.map((layer) =>
            buildBackgroundLayerFillXml(layer, effectiveOpacity),
          ),
        );
      }
      patches.push(buildGradientFillXml(node.fill, effectiveOpacity));
      continue;
    }

    if (node.kind === "shape") {
      if (node.outline) patches.push(undefined);
      if (node.edgeStrokes?.top) patches.push(undefined);
      if (node.edgeStrokes?.right) patches.push(undefined);
      if (node.edgeStrokes?.bottom) patches.push(undefined);
      if (node.edgeStrokes?.left) patches.push(undefined);
      if (node.backgroundLayers) {
        patches.push(
          ...node.backgroundLayers.map((layer) =>
            buildBackgroundLayerFillXml(layer, effectiveOpacity),
          ),
        );
      }
      patches.push(buildGradientFillXml(node.fill, effectiveOpacity));
    }
  }

  return patches;
}

function collectShapeLinePatches(
  nodes: ReadonlyArray<NodeIR>,
  inheritedOpacity?: number,
): Array<ShapeLinePatch | undefined> {
  const patches: Array<ShapeLinePatch | undefined> = [];

  for (const node of nodes) {
    if (node.visibility === "hidden") {
      continue;
    }

    const effectiveOpacity = combineOpacities(inheritedOpacity, node.opacity);

    if (node.kind === "group") {
      if (node.outline) {
        patches.push(
          buildShapeLinePatch({
            ...node.outline,
            transparency: combineTransparency(node.outline.transparency, effectiveOpacity),
          }),
        );
      }
      if (node.edgeStrokes?.top) {
        patches.push(
          buildShapeLinePatch({
            ...node.edgeStrokes.top,
            transparency: combineTransparency(node.edgeStrokes.top.transparency, effectiveOpacity),
          }),
        );
      }
      if (node.edgeStrokes?.right) {
        patches.push(
          buildShapeLinePatch({
            ...node.edgeStrokes.right,
            transparency: combineTransparency(
              node.edgeStrokes.right.transparency,
              effectiveOpacity,
            ),
          }),
        );
      }
      if (node.edgeStrokes?.bottom) {
        patches.push(
          buildShapeLinePatch({
            ...node.edgeStrokes.bottom,
            transparency: combineTransparency(
              node.edgeStrokes.bottom.transparency,
              effectiveOpacity,
            ),
          }),
        );
      }
      if (node.edgeStrokes?.left) {
        patches.push(
          buildShapeLinePatch({
            ...node.edgeStrokes.left,
            transparency: combineTransparency(node.edgeStrokes.left.transparency, effectiveOpacity),
          }),
        );
      }
      if (node.backgroundLayers) {
        patches.push(...node.backgroundLayers.map(() => undefined));
      }
      if (node.fill || node.stroke || node.shadow) {
        patches.push(buildShapeLinePatch(node.stroke));
      }
      patches.push(...collectShapeLinePatches(node.children, effectiveOpacity));
      continue;
    }

    if (node.kind === "text") {
      if (node.outline) patches.push(buildShapeLinePatch(node.outline));
      if (node.edgeStrokes?.top) patches.push(buildShapeLinePatch(node.edgeStrokes.top));
      if (node.edgeStrokes?.right) patches.push(buildShapeLinePatch(node.edgeStrokes.right));
      if (node.edgeStrokes?.bottom) patches.push(buildShapeLinePatch(node.edgeStrokes.bottom));
      if (node.edgeStrokes?.left) patches.push(buildShapeLinePatch(node.edgeStrokes.left));
      if (node.backgroundLayers) {
        patches.push(...node.backgroundLayers.map(() => undefined));
      }
      patches.push(buildShapeLinePatch(node.stroke));
      continue;
    }

    if (node.kind === "shape") {
      if (node.outline) patches.push(buildShapeLinePatch(node.outline));
      if (node.edgeStrokes?.top) patches.push(buildShapeLinePatch(node.edgeStrokes.top));
      if (node.edgeStrokes?.right) patches.push(buildShapeLinePatch(node.edgeStrokes.right));
      if (node.edgeStrokes?.bottom) patches.push(buildShapeLinePatch(node.edgeStrokes.bottom));
      if (node.edgeStrokes?.left) patches.push(buildShapeLinePatch(node.edgeStrokes.left));
      if (node.backgroundLayers) {
        patches.push(...node.backgroundLayers.map(() => undefined));
      }
      patches.push(buildShapeLinePatch(node.stroke));
    }
  }

  return patches;
}

function collectBackgroundLayerImages(
  backgroundLayers: ReadonlyArray<BackgroundLayerIR> | undefined,
): SrcRectImageLike[] {
  if (!backgroundLayers) {
    return [];
  }

  return backgroundLayers.flatMap((layer) =>
    isBackgroundImageLayer(layer) ? expandBackgroundImageLayer(layer) : [],
  );
}

function collectRenderableImages(nodes: ReadonlyArray<NodeIR>): SrcRectImageLike[] {
  const images: SrcRectImageLike[] = [];

  for (const node of nodes) {
    if (node.visibility === "hidden") {
      continue;
    }

    if (node.kind === "group") {
      images.push(...collectBackgroundLayerImages(node.backgroundLayers));
      images.push(...collectRenderableImages(node.children));
      continue;
    }

    if (node.kind === "text" || node.kind === "shape") {
      images.push(...collectBackgroundLayerImages(node.backgroundLayers));
    }

    if (node.kind === "image") {
      images.push(node);
    }
  }

  return images;
}

function collectRenderableTextNodes(nodes: ReadonlyArray<NodeIR>): TextIR[] {
  const texts: TextIR[] = [];

  for (const node of nodes) {
    if (node.visibility === "hidden") {
      continue;
    }

    if (node.kind === "group") {
      texts.push(...collectRenderableTextNodes(node.children));
      continue;
    }

    if (node.kind === "text") {
      texts.push(node);
    }
  }

  return texts;
}

function patchSlideBlocks<TPatch>(xml: string, patch: SlideXmlPatch<TPatch>) {
  const matches = [...xml.matchAll(patch.pattern)];
  let patchedXml = xml;
  let offset = 0;

  for (let i = 0; i < Math.min(matches.length, patch.patches.length); i += 1) {
    const nextPatch = patch.patches[i];
    const match = matches[i];

    if (!nextPatch || !match || match.index === undefined) {
      continue;
    }

    const patchedBlock = patch.apply(match[0], nextPatch);
    const start = match.index + offset;
    const end = start + match[0].length;
    patchedXml = `${patchedXml.slice(0, start)}${patchedBlock}${patchedXml.slice(end)}`;
    offset += patchedBlock.length - match[0].length;
  }

  return patchedXml;
}

export function buildSlideXmlPatchPlan(
  slideIR: PresentationIR["slides"][number],
): SlideXmlPatchPlan {
  const images = [
    ...collectBackgroundLayerImages(slideIR.backgroundLayers),
    ...collectRenderableImages(slideIR.nodes),
  ];
  const texts = collectRenderableTextNodes(slideIR.nodes);

  return {
    pictureSrcRects: images.map((image) => resolveImageSrcRect(image)),
    shapeFills: [
      ...(slideIR.backgroundLayers?.map((layer) => buildBackgroundLayerFillXml(layer)) ?? []),
      ...collectShapeFillPatches(slideIR.nodes),
    ],
    shapeLines: collectShapeLinePatches(slideIR.nodes),
    slideBackgroundFill: buildGradientFillXml(slideIR.background),
    textIndentsEmu: texts.map((text) =>
      text.style.textIndentPt === undefined ? undefined : pointsToEmu(text.style.textIndentPt),
    ),
  };
}

function hasSlideXmlPatchPlan(plan: SlideXmlPatchPlan) {
  return (
    plan.pictureSrcRects.some((srcRect) => srcRect !== undefined) ||
    plan.shapeFills.some((patch) => patch !== undefined) ||
    plan.shapeLines.some((patch) => patch !== undefined) ||
    plan.slideBackgroundFill !== undefined ||
    plan.textIndentsEmu.some((textIndent) => textIndent !== undefined)
  );
}

function applySlideXmlPatchPlan(slideXml: string, plan: SlideXmlPatchPlan) {
  const patchedPictures = patchSlideBlocks(slideXml, {
    pattern: /<p:pic>[\s\S]*?<\/p:pic>/g,
    patches: plan.pictureSrcRects,
    apply(block, srcRect) {
      return patchPictureBlock(block, srcRect);
    },
  });
  const patchedShapes = patchSlideBlocks(patchedPictures, {
    pattern: /<p:sp>[\s\S]*?<\/p:sp>/g,
    patches: plan.shapeFills,
    apply(block, patchValue) {
      return patchShapeFillBlock(block, patchValue);
    },
  });
  const patchedShapeLines = patchSlideBlocks(patchedShapes, {
    pattern: /<p:sp>[\s\S]*?<\/p:sp>/g,
    patches: plan.shapeLines,
    apply(block, patch) {
      return patchShapeLineBlock(block, patch);
    },
  });
  const patchedBackground =
    plan.slideBackgroundFill === undefined
      ? patchedShapeLines
      : patchSlideBlocks(patchedShapeLines, {
          pattern: /<p:bgPr[^>]*>[\s\S]*?<\/p:bgPr>/g,
          patches: [plan.slideBackgroundFill],
          apply(block, patchValue) {
            return patchSlideBackgroundBlock(block, patchValue);
          },
        });

  return patchSlideBlocks(patchedBackground, {
    pattern: /<p:sp>[\s\S]*?<p:txBody>[\s\S]*?<\/p:sp>/g,
    patches: plan.textIndentsEmu,
    apply(block, textIndent) {
      return patchParagraphIndentBlock(block, textIndent);
    },
  });
}

export async function patchPresentationXml(data: Uint8Array, ir: PresentationIR) {
  const zip = await JSZip.loadAsync(data);

  for (const [slideIndex, slideIR] of ir.slides.entries()) {
    const patchPlan = buildSlideXmlPatchPlan(slideIR);

    if (!hasSlideXmlPatchPlan(patchPlan)) {
      continue;
    }

    const slidePath = `ppt/slides/slide${slideIndex + 1}.xml`;
    const slideFile = zip.file(slidePath);

    if (!slideFile) {
      continue;
    }

    const slideXml = await slideFile.async("string");
    zip.file(slidePath, applySlideXmlPatchPlan(slideXml, patchPlan));
  }

  return zip.generateAsync({ type: "uint8array" });
}

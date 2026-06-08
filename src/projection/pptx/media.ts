import type { AssetEntity } from "../../graph";
import type { ImageSourceIR } from "../../layout/projected";
import {
  drawingFromElements,
  mapElements,
  slideDrawingChildren,
  walkBackgroundLayers,
  walkElements,
} from "./drawing";
import { fingerprintString } from "./fingerprint";
import { mediaRelationshipId, packageIdentity } from "./identity";
import { projectedRelationshipTarget } from "./relationships";
import type {
  PackagePartId,
  PptxElement,
  PptxElementId,
  PptxMediaMetadata,
  PptxMediaPart,
  PptxMediaPartPayload,
  PptxProjectionAssetArtifact,
  PptxRelationship,
  PptxSlidePart,
} from "./model";

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

export function imageExtension(source: ImageSourceIR): string {
  switch (source.kind) {
    case "path": {
      const extension = source.path.split(".").pop();
      return extension && extension.length <= 5 ? extension : "bin";
    }
    case "url": {
      const path = source.url.split(/[?#]/, 1)[0] ?? source.url;
      const extension = path.split(".").pop();
      return extension && extension.length <= 8 && extension !== path ? extension : "bin";
    }
    case "data": {
      const mediaType = dataMediaType(source.data);
      return extensionFromMediaType(mediaType) ?? "bin";
    }
  }
}

function mediaTypeFromExtension(extension: string | undefined): string | undefined {
  switch (extension?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
}

function extensionFromMediaType(mediaType: string | undefined): string | undefined {
  switch (mediaType?.split(";")[0]?.trim().toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return undefined;
  }
}

function dataMediaType(value: string): string | undefined {
  const commaIndex = value.indexOf(",");
  if (!value.startsWith("data:") || commaIndex === -1) {
    return undefined;
  }

  const metadata = value.slice(5, commaIndex);
  return metadata ? metadata.replace(/;base64$/, "") : undefined;
}

export function mediaAllocationKey(input: {
  source: ImageSourceIR;
  assetEntityId?: AssetEntity["id"];
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
}): string {
  const asset = input.assetEntityId ? input.assets?.get(input.assetEntityId) : undefined;
  const hash = asset?.probe?.hash;
  if (hash) {
    return `hash:${hash}:${asset?.probe?.extension ?? asset?.probe?.mediaType ?? imageExtension(input.source)}`;
  }

  return `source:${asset?.resolverScope ?? "deckjsx:builtin"}:${imageSourceKey(input.source)}`;
}

export function mediaPartIdForSource(input: {
  source: ImageSourceIR;
  assetEntityId?: AssetEntity["id"];
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
}): PackagePartId {
  return packageIdentity("media", fingerprintString(mediaAllocationKey(input)));
}

export function mediaMetadataFromProbe(
  probe: PptxProjectionAssetArtifact["probe"] | undefined,
): PptxMediaMetadata | undefined {
  if (!probe) {
    return undefined;
  }

  const metadata = {
    ...(probe.mediaType ? { mediaType: probe.mediaType } : {}),
    ...(probe.extension ? { extension: probe.extension } : {}),
    ...(probe.width ? { widthPx: probe.width } : {}),
    ...(probe.height ? { heightPx: probe.height } : {}),
    ...(probe.byteLength ? { byteLength: probe.byteLength } : {}),
    ...(probe.hash ? { hash: probe.hash } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function dataPayloadText(metadata: string, payload: string): string {
  if (!metadata.endsWith(";base64")) {
    return decodeURIComponent(payload);
  }

  return globalThis.atob(payload);
}

function dataSourceMetadata(source: Extract<ImageSourceIR, { kind: "data" }>): PptxMediaMetadata {
  const commaIndex = source.data.indexOf(",");
  const metadata =
    source.data.startsWith("data:") && commaIndex !== -1 ? source.data.slice(5, commaIndex) : "";
  const mediaType = metadata ? metadata.replace(/;base64$/, "") : undefined;
  const extension = extensionFromMediaType(mediaType);
  const payload = commaIndex === -1 ? source.data : source.data.slice(commaIndex + 1);
  const byteLength = metadata.endsWith(";base64")
    ? Math.floor((payload.length * 3) / 4)
    : new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  const svg = mediaType === "image/svg+xml" ? dataPayloadText(metadata, payload) : "";
  const svgTag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  const dimension = (name: string): number | undefined => {
    const match = svgTag ? new RegExp(`\\b${name}=["']?([0-9.]+)`, "i").exec(svgTag) : undefined;
    return match ? Number.parseFloat(match[1] ?? "") : undefined;
  };
  const widthPx = dimension("width");
  const heightPx = dimension("height");

  return {
    ...(mediaType ? { mediaType } : {}),
    ...(extension ? { extension } : {}),
    ...(byteLength > 0 ? { byteLength } : {}),
    ...(widthPx ? { widthPx } : {}),
    ...(heightPx ? { heightPx } : {}),
  };
}

function mediaMetadataFromSource(source: ImageSourceIR): PptxMediaMetadata | undefined {
  if (source.kind === "data") {
    const metadata = dataSourceMetadata(source);
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  const sourcePath = source.kind === "url" ? source.url.split(/[?#]/, 1)[0] : source.path;
  const extension = sourcePath?.split(".").pop();
  const normalizedExtension =
    extension && extension.length <= 8 && extension !== sourcePath
      ? extension.toLowerCase()
      : undefined;
  const mediaType = mediaTypeFromExtension(normalizedExtension);

  if (!normalizedExtension && !mediaType) {
    return undefined;
  }

  return {
    ...(normalizedExtension ? { extension: normalizedExtension } : {}),
    ...(mediaType ? { mediaType } : {}),
  };
}

export function mediaExtension(input: {
  source: ImageSourceIR;
  assetEntityId?: AssetEntity["id"];
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
}): string {
  const extension = input.assetEntityId
    ? input.assets?.get(input.assetEntityId)?.probe?.extension
    : undefined;
  return extension ?? imageExtension(input.source);
}

export function mediaPayloadFor(input: {
  source: ImageSourceIR;
  elementId?: PptxElementId;
  assetEntityId?: AssetEntity["id"];
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
}): PptxMediaPartPayload {
  const sourceMetadata = mediaMetadataFromSource(input.source);
  const probeMetadata = mediaMetadataFromProbe(
    input.assetEntityId ? input.assets?.get(input.assetEntityId)?.probe : undefined,
  );
  const metadata =
    sourceMetadata || probeMetadata ? { ...sourceMetadata, ...probeMetadata } : undefined;
  const allocationKey = mediaAllocationKey(input);

  return {
    source: input.source,
    sources: [input.source],
    ...(input.elementId ? { elementId: input.elementId } : {}),
    ...(input.elementId ? { elementIds: [input.elementId] } : {}),
    ...(input.assetEntityId ? { assetEntityId: input.assetEntityId } : {}),
    ...(input.assetEntityId ? { assetEntityIds: [input.assetEntityId] } : {}),
    allocationKey,
    ...(metadata ? { metadata } : {}),
  };
}

function backgroundImageLayersForSlide(
  slide: PptxSlidePart,
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>,
): Array<{ readonly mediaPartId: PackagePartId; readonly source: ImageSourceIR }> {
  const layers: Array<{ mediaPartId: PackagePartId; source: ImageSourceIR }> = [];

  slide.payload.backgroundLayers?.forEach((layer) => {
    if (layer.kind === "background-image") {
      layers.push({
        mediaPartId: mediaPartIdForSource({ source: layer.source, assets }),
        source: layer.source,
      });
    }
  });

  walkBackgroundLayers(slideDrawingChildren(slide), (layer) => {
    if (layer.kind === "background-image") {
      layers.push({
        mediaPartId: mediaPartIdForSource({ source: layer.source, assets }),
        source: layer.source,
      });
    }
  });

  return layers;
}

function mergeUnique<T>(
  values: readonly T[] | undefined,
  value: T | undefined,
  key: (input: T) => string,
): readonly T[] | undefined {
  if (value === undefined) {
    return values;
  }

  const next = [...(values ?? [])];
  if (!next.some((item) => key(item) === key(value))) {
    next.push(value);
  }
  return next;
}

function mergeMediaPartPayload(
  current: PptxMediaPartPayload | undefined,
  next: PptxMediaPartPayload,
): PptxMediaPartPayload {
  if (!current) {
    return next;
  }

  const sources = mergeUnique(current.sources, next.source, imageSourceKey) ?? current.sources;
  const elementIds = mergeUnique(
    current.elementIds ?? (current.elementId ? [current.elementId] : undefined),
    next.elementId,
    (id) => id,
  );
  const assetEntityIds = mergeUnique(
    current.assetEntityIds ?? (current.assetEntityId ? [current.assetEntityId] : undefined),
    next.assetEntityId,
    (id) => id,
  );

  return {
    ...current,
    sources,
    ...(elementIds ? { elementIds } : {}),
    ...(assetEntityIds ? { assetEntityIds } : {}),
  };
}

function mergeMediaPackagePart(part: PptxMediaPart, payload: PptxMediaPartPayload): PptxMediaPart {
  return {
    ...part,
    payload: mergeMediaPartPayload(part.payload, payload),
  };
}

export function withCanonicalImageMediaPartIds(
  slides: readonly PptxSlidePart[],
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>,
): PptxSlidePart[] {
  return slides.map((slide) => ({
    ...slide,
    payload: {
      ...slide.payload,
      drawing: drawingFromElements(
        mapElements(slideDrawingChildren(slide), (element) => {
          if (element.kind !== "image") {
            return element;
          }

          const assetEntityId = element.origin.assetEntityIds?.[0];
          return {
            ...element,
            mediaPartId: mediaPartIdForSource({
              source: element.source,
              ...(assetEntityId ? { assetEntityId } : {}),
              assets,
            }),
          };
        }),
      ),
    },
  }));
}

export function mediaPartsFor(
  slides: readonly PptxSlidePart[],
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>,
): PptxMediaPart[] {
  const parts = new Map<PackagePartId, PptxMediaPart>();
  let mediaIndex = 1;

  for (const slide of slides) {
    for (const backgroundImage of backgroundImageLayersForSlide(slide, assets)) {
      const payload = mediaPayloadFor({
        source: backgroundImage.source,
        assets,
      });
      const current = parts.get(backgroundImage.mediaPartId);
      if (current) {
        parts.set(backgroundImage.mediaPartId, mergeMediaPackagePart(current, payload));
        continue;
      }

      parts.set(backgroundImage.mediaPartId, {
        id: backgroundImage.mediaPartId,
        category: "authored-content",
        kind: "media",
        path: `ppt/media/media${mediaIndex}.${mediaExtension({
          source: backgroundImage.source,
          assets,
        })}`,
        origin: slide.origin,
        payload,
      });
      mediaIndex += 1;
    }

    walkElements(slideDrawingChildren(slide), (element) => {
      if (element.kind !== "image" || !element.mediaPartId) {
        return;
      }
      const assetEntityId = element.origin.assetEntityIds?.[0];
      const payload = mediaPayloadFor({
        source: element.source,
        elementId: element.id,
        ...(assetEntityId ? { assetEntityId } : {}),
        assets,
      });
      const current = parts.get(element.mediaPartId);
      if (current) {
        parts.set(element.mediaPartId, mergeMediaPackagePart(current, payload));
        return;
      }

      parts.set(element.mediaPartId, {
        id: element.mediaPartId,
        category: "authored-content",
        kind: "media",
        path: `ppt/media/media${mediaIndex}.${mediaExtension({
          source: element.source,
          ...(assetEntityId ? { assetEntityId } : {}),
          assets,
        })}`,
        origin: {
          ...(element.origin.graphNodeIds ? { graphNodeIds: element.origin.graphNodeIds } : {}),
          ...(element.origin.source ? { source: element.origin.source } : {}),
        },
        payload,
      });
      mediaIndex += 1;
    });
  }

  return [...parts.values()];
}

function withHyperlinkRelationship(input: {
  element: PptxElement;
  ownerPath: string;
  relationships: PptxRelationship[];
}): PptxElement {
  const { element } = input;

  if (element.kind === "group" || !element.hyperlink) {
    return element;
  }

  const relationshipId = nextSlideRelationshipId(input.relationships);
  const serialized = {
    ...element.serialized,
    hyperlinkRelationshipId: relationshipId,
  };
  const relationship = {
    id: relationshipId,
    target: projectedRelationshipTarget({
      ownerPath: input.ownerPath,
      targetMode: "external",
      targetPath: element.hyperlink.url,
    }),
    targetMode: "external",
    targetPath: element.hyperlink.url,
    type: "hyperlink",
  } satisfies PptxRelationship;
  input.relationships.push(relationship);

  switch (element.kind) {
    case "image":
      return { ...element, serialized };
    case "shape":
      return { ...element, serialized };
    case "text":
      return { ...element, serialized };
  }
}

function nextSlideRelationshipId(relationships: readonly PptxRelationship[]) {
  return mediaRelationshipId(relationships.length + 1);
}

export function attachMediaRelationships(
  slides: readonly PptxSlidePart[],
  mediaParts: readonly PptxMediaPart[],
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>,
): PptxSlidePart[] {
  const mediaPartById = new Map(mediaParts.map((part) => [part.id, part]));

  return slides.map((slide) => {
    const relationships = [...(slide.relationships ?? [])];
    const relationshipByMediaPartId = new Map<PackagePartId, PptxRelationship>();

    for (const backgroundImage of backgroundImageLayersForSlide(slide, assets)) {
      const mediaPart = mediaPartById.get(backgroundImage.mediaPartId);
      if (!mediaPart || relationshipByMediaPartId.has(backgroundImage.mediaPartId)) {
        continue;
      }

      const relationship = {
        id: nextSlideRelationshipId(relationships),
        target: projectedRelationshipTarget({
          ownerPath: slide.path,
          targetPath: mediaPart.path,
        }),
        targetPartId: mediaPart.id,
        targetPath: mediaPart.path,
        type: "image",
      } satisfies PptxRelationship;
      relationshipByMediaPartId.set(backgroundImage.mediaPartId, relationship);
      relationships.push(relationship);
    }

    const children = mapElements(slideDrawingChildren(slide), (element) => {
      let nextElement = element;

      if (nextElement.kind === "image" && nextElement.mediaPartId) {
        const mediaPart = mediaPartById.get(nextElement.mediaPartId);
        if (mediaPart) {
          const relationship =
            relationshipByMediaPartId.get(nextElement.mediaPartId) ??
            ({
              id: nextSlideRelationshipId(relationships),
              target: projectedRelationshipTarget({
                ownerPath: slide.path,
                targetPath: mediaPart.path,
              }),
              targetPartId: mediaPart.id,
              targetPath: mediaPart.path,
              type: "image",
            } satisfies PptxRelationship);

          if (!relationshipByMediaPartId.has(nextElement.mediaPartId)) {
            relationshipByMediaPartId.set(nextElement.mediaPartId, relationship);
            relationships.push(relationship);
          }

          nextElement = {
            ...nextElement,
            serialized: {
              ...nextElement.serialized,
              relationshipId: relationship.id,
            },
          };
        }
      }

      return withHyperlinkRelationship({
        element: nextElement,
        ownerPath: slide.path,
        relationships,
      });
    });

    return {
      ...slide,
      relationships,
      payload: {
        ...slide.payload,
        drawing: drawingFromElements(children),
      },
    };
  });
}

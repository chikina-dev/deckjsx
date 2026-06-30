import type { AssetArtifact } from "@/src/pipeline/artifacts";
import { createDiagnostics, diagnostic, type Diagnostics } from "@/src/diagnostics";
import type { ImageSourceIR } from "@/src/layout/projected";
import type { PptxMediaPartPayload, PptxPackagePart } from "@/src/projection/pptx/model";
import { isPptxMediaPart } from "@/src/projection/pptx/model";

type PptxMediaContext = {
  readonly assetsById?: ReadonlyMap<
    NonNullable<PptxMediaPartPayload["assetEntityId"]>,
    AssetArtifact
  >;
};
type MediaSourceCandidate = PptxMediaPartPayload["source"] | string | undefined;

export function mediaPartPayload(part: PptxPackagePart): PptxMediaPartPayload {
  if (part.kind !== "media" || !isImageSourceCandidate(part.payload?.source)) {
    throw new Error("Media package parts must carry a structured media payload source.");
  }
  if (
    !Array.isArray(part.payload.sources) ||
    part.payload.sources.length === 0 ||
    !part.payload.sources.every(isImageSourceCandidate)
  ) {
    throw new Error("Media package parts must carry structured media payload sources.");
  }
  if (!isPptxMediaPart(part)) {
    throw new Error("Media package parts must carry structured media payload sources.");
  }
  return part.payload;
}

function isImageSourceCandidate(value: MediaSourceCandidate): value is ImageSourceIR {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  switch (value.kind) {
    case "data":
      return typeof value.data === "string";
    case "path":
      return typeof value.path === "string";
    case "url":
      return typeof value.url === "string";
  }
}

export function mediaMetadataFingerprint(part: PptxPackagePart): string | undefined {
  const hash = mediaPartPayload(part).metadata?.hash;
  return hash ? `asset:${hash}` : undefined;
}

export function mediaLoadFingerprint(artifact: AssetArtifact | undefined): string | undefined {
  const hash = artifact?.load?.hash;
  return hash ? `asset:${hash}` : undefined;
}

export function mediaPartArtifact(
  part: PptxPackagePart,
  context?: PptxMediaContext,
): AssetArtifact | undefined {
  const assetEntityId = mediaPartPayload(part).assetEntityId;
  return assetEntityId ? context?.assetsById?.get(assetEntityId) : undefined;
}

export function mediaBytes(
  source: ImageSourceIR,
  artifact?: AssetArtifact,
): Uint8Array | undefined {
  if (artifact?.load?.bytes) {
    return artifact.load.bytes;
  }

  if (source.kind === "path" || source.kind === "url") {
    return undefined;
  }

  const commaIndex = source.data.indexOf(",");
  if (!source.data.startsWith("data:") || commaIndex === -1) {
    return new TextEncoder().encode(source.data);
  }

  const metadata = source.data.slice(0, commaIndex);
  const payload = source.data.slice(commaIndex + 1);
  if (!metadata.endsWith(";base64")) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const decoded = globalThis.atob(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export function mediaDiagnostics(
  part: PptxPackagePart,
  context?: PptxMediaContext,
): Diagnostics | undefined {
  const source = mediaPartPayload(part).source;
  if (source?.kind !== "path" && source?.kind !== "url") {
    return undefined;
  }
  if (mediaPartArtifact(part, context)?.load?.bytes) {
    return undefined;
  }
  const label = source.kind === "path" ? source.path : source.url;

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_RENDER_MEDIA_LOAD_FAILED",
      title: "media source requires an asset loader",
      message:
        source.kind === "path"
          ? "The direct PPTX writer cannot load filesystem-like media paths from the multi-runtime core."
          : "The direct PPTX writer could not load this absolute media URL through the current asset boundary.",
      labels: [{ path: part.path, message: label }],
    }),
  ]);
}

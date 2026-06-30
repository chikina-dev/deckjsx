import { pptx, type WriterAdapter } from "@/src/adapter/index.ts";
import { createDiagnostics, type Diagnostic } from "@/src/diagnostics/index.ts";
import { StyleSheet, Theme, type DataUriString, type RenderResult } from "@/src/index.ts";
import { isPptxMediaPart, isPptxSlidePart, isPptxSupportPart } from "@/src/inspect.ts";
import {
  assetSourceCacheKey,
  PipelineArtifactCollection,
  type PptxPackageBuildArtifact,
} from "@/src/pipeline/artifacts.ts";
import { mediaSourceOrigins } from "@/src/integration.ts";
import { compileSource, projectSource, renderSource } from "@/src/pipeline/runner.ts";
import { withPackagePartFingerprints } from "@/src/projection/pptx/fingerprint.ts";
import {
  renderPptxPackage as renderPptxPackageBase,
  type PptxWriterContext,
  type PptxWriterOptions,
} from "@/src/writers/pptx.ts";
import type { AssetLoadResult, AssetLoader, AssetProbeResult } from "@/src/assets.ts";
import type {
  AssetEntityId,
  GraphNodeId,
  PackagePartId,
  PptxContentTypesPayload,
  PptxElementId,
  PptxMediaPartPayload,
  PptxPackageModel,
  PptxPackagePart,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSlideLayoutPartPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxSupportPartPayload,
  PptxThemePartPayload,
  SemanticAuthorGraph,
} from "@/src/inspect.ts";
import {
  expectPptxPart,
  expectPptxPartByPath,
  Deck,
  SAMPLE_SVG_DATA_URI,
  unzipSync,
} from "@/tests/helpers.ts";
export function testAssetLoader(input: {
  readonly resolverIdentity: string;
  readonly probe?: AssetLoaderProbe;
  readonly load?: AssetLoaderLoad;
}): AssetLoader {
  return {
    resolverIdentity: input.resolverIdentity,
    ...(input.probe
      ? {
          async probe(context) {
            const value = await input.probe?.(context);
            return value ? { ok: true, value } : undefined;
          },
        }
      : {}),
    ...(input.load
      ? {
          async load(context) {
            const value = await input.load?.(context);
            return value ? { ok: true, value } : undefined;
          },
        }
      : {}),
  };
}
export type AssetLoaderContextForTest = Parameters<NonNullable<AssetLoader["probe"]>>[0];
export type AssetLoaderProbe = (
  context: AssetLoaderContextForTest,
) => Promise<AssetProbeResult | undefined>;
export type AssetLoaderLoad = (
  context: AssetLoaderContextForTest,
) => Promise<AssetLoadResult | undefined>;
export type RenderInspectionSummary = NonNullable<RenderResult["summary"]>;
export function diagnosticCodeCount(items: readonly Diagnostic[], code: string): number {
  return items.filter((item) => item.code === code).length;
}
export function textNodeIdBy(graph: SemanticAuthorGraph, text: string): GraphNodeId | undefined {
  for (const node of graph.nodes.values()) {
    if (node.kind !== "text") {
      continue;
    }
    const inlineText = node.inlineChildren
      .map((childId) => graph.nodes.get(childId))
      .filter((child) => child?.kind === "textRun")
      .map((child) => child.text)
      .join("");
    if (inlineText === text) {
      return node.id;
    }
  }
  return undefined;
}
export function localZipCompressionMethod(bytes: Uint8Array, path: string): number | undefined {
  const decoder = new TextDecoder();
  for (let offset = 0; offset < bytes.byteLength - 30; offset += 1) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x03 ||
      bytes[offset + 3] !== 0x04
    ) {
      continue;
    }
    const method = bytes[offset + 8]! | (bytes[offset + 9]! << 8);
    const nameLength = bytes[offset + 26]! | (bytes[offset + 27]! << 8);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    if (name === path) {
      return method;
    }
  }
  return undefined;
}
export function slidePartPayload(part: PptxPackagePart): PptxSlidePart["payload"] {
  if (isPptxSlidePart(part)) {
    return part.payload;
  }
  throw new Error("Expected a slide part.");
}
export function presentationPayload(part: PptxPackagePart) {
  if (isPptxSupportPart(part) && part.payload.kind === "presentation") {
    return part.payload;
  }
  throw new Error("Expected a presentation support part.");
}
export function extendedDocumentPropertiesPayload(part: PptxPackagePart) {
  if (
    isPptxSupportPart(part) &&
    part.payload.kind === "document-properties" &&
    part.payload.propertyKind === "extended"
  ) {
    return part.payload;
  }
  throw new Error("Expected an extended document properties part.");
}
export function slideMasterPayload(part: PptxPackagePart): PptxSlideMasterPartPayload {
  if (isPptxSupportPart(part) && part.payload.kind === "slide-master") {
    return part.payload;
  }
  throw new Error("Expected a slide master part.");
}
export function slideLayoutPayload(part: PptxPackagePart): PptxSlideLayoutPartPayload {
  if (isPptxSupportPart(part) && part.payload.kind === "slide-layout") {
    return part.payload;
  }
  throw new Error("Expected a slide layout part.");
}
export function themePayload(part: PptxPackagePart): PptxThemePartPayload {
  if (isPptxSupportPart(part) && part.payload.kind === "theme") {
    return part.payload;
  }
  throw new Error("Expected a theme part.");
}
export function pngHeaderBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8,
    6,
    0,
    0,
    0,
  ]);
}
export function dataUriFromBytes(mediaType: string, bytes: Uint8Array): DataUriString {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${mediaType};base64,${btoa(binary)}` as DataUriString;
}
export function withFreshPackageFingerprints(projection: PptxPackageModel): PptxPackageModel {
  const parts = withPackagePartFingerprints(projection.parts);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  return {
    ...projection,
    parts,
    slides: projection.slides.map((slide) => {
      const part = partsById.get(slide.id);
      return part && isPptxSlidePart(part) ? part : slide;
    }),
  };
}
export type TestPptxWriterResult = Awaited<ReturnType<typeof renderPptxPackageBase>> & {
  readonly buildArtifacts?: readonly PptxPackageBuildArtifact[];
};
export async function renderPptxPackage(
  projection: PptxPackageModel,
  options?: PptxWriterOptions,
  context?: PptxWriterContext,
): Promise<TestPptxWriterResult> {
  let buildArtifacts: readonly PptxPackageBuildArtifact[] | undefined;
  const result = await renderPptxPackageBase(projection, options, {
    ...context,
    onBuildArtifacts: (artifacts) => {
      buildArtifacts = artifacts;
      context?.onBuildArtifacts?.(artifacts);
    },
  });
  return { ...result, ...(buildArtifacts ? { buildArtifacts } : {}) };
}

export {
  Deck,
  PipelineArtifactCollection,
  SAMPLE_SVG_DATA_URI,
  StyleSheet,
  Theme,
  assetSourceCacheKey,
  compileSource,
  createDiagnostics,
  expectPptxPart,
  expectPptxPartByPath,
  isPptxMediaPart,
  isPptxSlidePart,
  isPptxSupportPart,
  mediaSourceOrigins,
  pptx,
  projectSource,
  renderPptxPackageBase,
  renderSource,
  unzipSync,
  withPackagePartFingerprints,
};
export type {
  AssetEntityId,
  AssetLoadResult,
  AssetLoader,
  AssetProbeResult,
  Diagnostic,
  GraphNodeId,
  PackagePartId,
  PptxContentTypesPayload,
  PptxElementId,
  PptxMediaPartPayload,
  PptxPackageBuildArtifact,
  PptxPackageModel,
  PptxPackagePart,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSlideLayoutPartPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxSupportPartPayload,
  PptxThemePartPayload,
  PptxWriterContext,
  PptxWriterOptions,
  SemanticAuthorGraph,
  WriterAdapter,
};

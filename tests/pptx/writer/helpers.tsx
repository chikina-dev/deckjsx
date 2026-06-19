import { readFile } from "node:fs/promises";
import { expect } from "vite-plus/test";
import { Deck, Theme } from "../../../src/index.ts";
import { isPptxSlidePart, isPptxSupportPart } from "../../../src/inspect.ts";
import type {
  PptxBackgroundLayer,
  PptxContentTypesPayload,
  PptxMediaPartPayload,
  PptxPackageModel,
  PptxPackagePart,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxSupportPartPayload,
  PptxThemePartPayload,
} from "../../../src/inspect.ts";
import { withPackagePartFingerprints } from "../../../src/projection/pptx/fingerprint.ts";
import { expectedAssemblyEntryForPart } from "../../../src/writers/pptx/assembly.ts";
import { buildArtifactForPart } from "../../../src/writers/pptx/build.ts";
import {
  writeColor,
  writeFill,
  writeNonVisual,
  writeShadow,
  writeShapeProperties,
  writeTransform,
} from "../../../src/writers/pptx/drawing-xml.ts";
import { emitPartBytes } from "../../../src/writers/pptx/emit.ts";
import { mediaPartPayload } from "../../../src/writers/pptx/media.ts";
import { relationshipsBytes } from "../../../src/writers/pptx/package-xml.ts";
import { slideBytes } from "../../../src/writers/pptx/slide-xml.ts";
import { writeTextBody } from "../../../src/writers/pptx/text-xml.ts";
import {
  createCollectingPptxZipSink,
  createTeePptxZipSink,
} from "../../../src/writers/pptx/sinks.ts";
import {
  createPptxZipBytesFromEntries,
  writePptxZipEntriesToSink,
} from "../../../src/writers/pptx/zip.ts";
import { XmlChunkWriter } from "../../../src/writers/pptx/xml-writer.ts";
import {
  SAMPLE_SVG_DATA_URI,
  strFromU8,
  unzipSync,
  type Unzipped,
  WIDE_SVG_DATA_URI,
} from "../../helpers.ts";
export function malformedBackgroundLayer(
  layer: Partial<PptxBackgroundLayer> & {
    readonly kind: "solid";
    readonly color: string;
  },
): PptxBackgroundLayer {
  return layer as PptxBackgroundLayer;
}
export function coreDocumentPropertiesPayload(part: PptxPackagePart | undefined) {
  if (
    part &&
    isPptxSupportPart(part) &&
    part.payload.kind === "document-properties" &&
    part.payload.propertyKind === "core"
  ) {
    return part.payload;
  }
  throw new Error("Expected a core document properties part.");
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
export function zipEntry(zip: Unzipped, path: string): string | undefined {
  const content = zip[path];
  return content ? strFromU8(content) : undefined;
}
export function packagePaths(zip: Unzipped): readonly string[] {
  return Object.keys(zip).sort((left, right) => left.localeCompare(right));
}
export async function renderDeckBytes(deck: Deck): Promise<Uint8Array> {
  const result = await deck.render();
  expect(result.ok).toBe(true);
  expect(result.artifact?.format).toBe("pptx");
  expect(result.artifact?.bytes.byteLength).toBeGreaterThan(0);
  return result.artifact?.bytes ?? new Uint8Array();
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
export function relationshipOwnerPath(path: string): string {
  if (path === "_rels/.rels") {
    return "";
  }
  return path.replace(/_rels\/(.+)\.rels$/, "$1");
}
export function centralDirectoryEntries(bytes: Uint8Array): Array<{
  path: string;
  modifiedDate: number;
  modifiedTime: number;
}> {
  const decoder = new TextDecoder();
  const entries: Array<{
    path: string;
    modifiedDate: number;
    modifiedTime: number;
  }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      continue;
    }
    const modifiedTime = view.getUint16(offset + 12, true);
    const modifiedDate = view.getUint16(offset + 14, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    entries.push({
      path: decoder.decode(bytes.subarray(nameStart, nameEnd)),
      modifiedDate,
      modifiedTime,
    });
    offset = nameEnd + extraLength + commentLength - 1;
  }
  return entries;
}
export function localFileHeaderEntries(bytes: Uint8Array): Array<{
  path: string;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
}> {
  const decoder = new TextDecoder();
  const entries: Array<{
    path: string;
    flags: number;
    compressedSize: number;
    uncompressedSize: number;
  }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.byteLength - 30; ) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      break;
    }
    const flags = view.getUint16(offset + 6, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    entries.push({
      path: decoder.decode(bytes.subarray(nameStart, nameEnd)),
      flags,
      compressedSize,
      uncompressedSize,
    });
    offset = nameEnd + extraLength + compressedSize;
  }
  return entries;
}
export function relationshipsFor(part: PptxPackagePart): readonly PptxRelationship[] {
  return (
    part.relationships ??
    (part.payload as PptxRelationshipsPayload | undefined)?.relationships ??
    []
  );
}
export const MINIMAL_TEXT_BODY_STYLE = {
  fit: "none",
  textDirection: "horz",
  verticalAlign: "top",
  wrap: true,
} as const;

export {
  Deck,
  SAMPLE_SVG_DATA_URI,
  Theme,
  WIDE_SVG_DATA_URI,
  XmlChunkWriter,
  buildArtifactForPart,
  createCollectingPptxZipSink,
  createPptxZipBytesFromEntries,
  createTeePptxZipSink,
  emitPartBytes,
  expectedAssemblyEntryForPart,
  isPptxSlidePart,
  isPptxSupportPart,
  mediaPartPayload,
  readFile,
  relationshipsBytes,
  slideBytes,
  strFromU8,
  unzipSync,
  withPackagePartFingerprints,
  writeColor,
  writeFill,
  writeNonVisual,
  writePptxZipEntriesToSink,
  writeShadow,
  writeShapeProperties,
  writeTextBody,
  writeTransform,
};
export type {
  PptxBackgroundLayer,
  PptxContentTypesPayload,
  PptxMediaPartPayload,
  PptxPackageModel,
  PptxPackagePart,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxSupportPartPayload,
  PptxThemePartPayload,
  Unzipped,
};

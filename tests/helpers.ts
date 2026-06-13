import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isPptxContentTypesPart,
  isPptxMediaPart,
  isPptxRelationshipsPart,
  isPptxSlidePart,
  isPptxSupportPart,
} from "../src/inspect.ts";
import type {
  PptxElement,
  PptxKnownPackagePart,
  PptxPackagePart,
} from "../src/projection/pptx/model.ts";

export type RenderedNode = PptxElement;
export type Unzipped = Record<string, Uint8Array>;

const ZIP_TEXT_DECODER = new TextDecoder();

function assertZipRange(bytes: Uint8Array, offset: number, length: number, context: string): void {
  if (offset < 0 || length < 0 || offset > bytes.byteLength - length) {
    throw new Error(`Truncated ZIP archive while reading ${context}.`);
  }
}

function readUint16(bytes: Uint8Array, offset: number, context: string): number {
  assertZipRange(bytes, offset, 2, context);
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number, context: string): number {
  assertZipRange(bytes, offset, 4, context);
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

export function strFromU8(bytes: Uint8Array): string {
  return ZIP_TEXT_DECODER.decode(bytes);
}

export function unzipSync(bytes: Uint8Array): Unzipped {
  const entries: Unzipped = {};
  let offset = 0;

  while (offset + 4 <= bytes.byteLength) {
    const signature = readUint32(bytes, offset, `ZIP signature at offset ${offset}`);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }
    if (signature !== 0x04034b50) {
      throw new Error(`Unsupported ZIP local header signature at offset ${offset}.`);
    }

    assertZipRange(bytes, offset, 30, `local header at offset ${offset}`);
    const method = readUint16(bytes, offset + 8, `compression method at offset ${offset}`);
    const compressedSize = readUint32(bytes, offset + 18, `compressed size at offset ${offset}`);
    const uncompressedSize = readUint32(
      bytes,
      offset + 22,
      `uncompressed size at offset ${offset}`,
    );
    const pathLength = readUint16(bytes, offset + 26, `file name length at offset ${offset}`);
    const extraLength = readUint16(bytes, offset + 28, `extra field length at offset ${offset}`);
    const pathStart = offset + 30;
    const dataStart = pathStart + pathLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    assertZipRange(bytes, pathStart, pathLength, `file name at offset ${offset}`);
    assertZipRange(bytes, pathStart + pathLength, extraLength, `extra field at offset ${offset}`);
    const path = strFromU8(bytes.slice(pathStart, pathStart + pathLength));

    if (method !== 0) {
      throw new Error(`ZIP entry ${path} is not store-only.`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error(`ZIP entry ${path} has mismatched stored sizes.`);
    }
    assertZipRange(bytes, dataStart, compressedSize, `stored data for ZIP entry ${path}`);

    entries[path] = bytes.slice(dataStart, dataEnd);
    offset = dataEnd;
  }

  return entries;
}

export type PptxPartByKind<K extends PptxKnownPackagePart["kind"]> = Extract<
  PptxKnownPackagePart,
  { readonly kind: K }
>;

export type NodeSummary =
  | {
      kind: "group";
      frame: { xEmu: number; yEmu: number; widthEmu: number; heightEmu: number };
      children: NodeSummary[];
    }
  | {
      kind: "text";
      frame: { xEmu: number; yEmu: number; widthEmu: number; heightEmu: number };
      text: string;
      fontSizePt: number | undefined;
    }
  | {
      kind: "table";
      frame: { xEmu: number; yEmu: number; widthEmu: number; heightEmu: number };
      children: NodeSummary[];
    }
  | {
      kind: "image" | "shape" | "video";
      frame: { xEmu: number; yEmu: number; widthEmu: number; heightEmu: number };
    };

export const SAMPLE_SVG_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f97316"/></svg>',
).toString("base64")}`;

export const WIDE_SVG_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#2563eb"/></svg>',
).toString("base64")}`;

export function isPptxPartKind<K extends PptxKnownPackagePart["kind"]>(
  part: PptxPackagePart,
  kind: K,
): part is PptxPartByKind<K> {
  if (kind === "content-types") {
    return isPptxContentTypesPart(part);
  }
  if (kind === "media") {
    return isPptxMediaPart(part);
  }
  if (kind === "relationships") {
    return isPptxRelationshipsPart(part);
  }
  if (kind === "slide") {
    return isPptxSlidePart(part);
  }

  return isPptxSupportPart(part) && part.kind === kind;
}

export function findPptxPart<K extends PptxKnownPackagePart["kind"]>(
  parts: readonly PptxPackagePart[],
  kind: K,
): PptxPartByKind<K> | undefined {
  return parts.find((part): part is PptxPartByKind<K> => isPptxPartKind(part, kind));
}

export function findPptxPartByPath<K extends PptxKnownPackagePart["kind"]>(
  parts: readonly PptxPackagePart[],
  kind: K,
  path: string,
): PptxPartByKind<K> | undefined {
  return parts.find(
    (part): part is PptxPartByKind<K> => part.path === path && isPptxPartKind(part, kind),
  );
}

export function expectPptxPart<K extends PptxKnownPackagePart["kind"]>(
  parts: readonly PptxPackagePart[],
  kind: K,
): PptxPartByKind<K> {
  const part = findPptxPart(parts, kind);
  if (!part) {
    throw new Error(`Expected a PPTX package part with kind "${kind}".`);
  }
  return part;
}

export function expectPptxPartByPath<K extends PptxKnownPackagePart["kind"]>(
  parts: readonly PptxPackagePart[],
  kind: K,
  path: string,
): PptxPartByKind<K> {
  const part = findPptxPartByPath(parts, kind, path);
  if (!part) {
    throw new Error(`Expected a PPTX package part with kind "${kind}" at "${path}".`);
  }
  return part;
}

export function summarizeNodes(nodes: readonly PptxElement[]): NodeSummary[] {
  return nodes.map((node) => {
    if (node.kind === "group") {
      return {
        kind: node.kind,
        frame: node.frame,
        children: summarizeNodes(node.children),
      };
    }

    if (node.kind === "text") {
      return {
        kind: node.kind,
        frame: node.frame,
        text: node.content.text,
        fontSizePt: node.style.fontSizePt,
      };
    }

    if (node.kind === "table") {
      return {
        kind: node.kind,
        frame: node.frame,
        children: summarizeNodes(
          node.sections.flatMap((section) =>
            section.rows.flatMap((row) => row.cells.flatMap((cell) => cell.children)),
          ),
        ),
      };
    }

    return {
      kind: node.kind,
      frame: node.frame,
    };
  });
}

export async function withTempPptxPath<T>(
  basename: string,
  run: (output: string) => Promise<T>,
): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
  const output = join(tempDir, basename);

  try {
    return await run(output);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function readPptxSlideXml(
  output: string,
  slideNumber = 1,
): Promise<string | undefined> {
  const content = await readFile(output);
  const zip = unzipSync(content);
  const slide = zip[`ppt/slides/slide${slideNumber}.xml`];

  return slide ? strFromU8(slide) : undefined;
}

import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
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
      kind: "image" | "shape";
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

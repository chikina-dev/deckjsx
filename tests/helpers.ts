import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import type { Deck } from "../src/index.ts";

export type RenderedNode = ReturnType<Deck["render"]>["slides"][number]["nodes"][number];

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

export function summarizeNodes(
  nodes: ReturnType<Deck["render"]>["slides"][number]["nodes"],
): NodeSummary[] {
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
  const zip = await JSZip.loadAsync(content);

  return zip.file(`ppt/slides/slide${slideNumber}.xml`)?.async("string");
}

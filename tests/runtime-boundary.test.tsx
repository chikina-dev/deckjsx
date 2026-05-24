import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { Deck, Slide, Text } from "../src/index.ts";
import { outputPresentation } from "../src/node.ts";
import type { PresentationIR } from "../src/legacy.ts";

function emptyPresentation(): PresentationIR {
  return {
    version: "0.1",
    size: {
      widthEmu: 10 * 914_400,
      heightEmu: 5.625 * 914_400,
    },
    slides: [
      {
        id: "slide-1",
        name: "Runtime boundary",
        nodes: [],
      },
    ],
  };
}

describe("runtime boundary", () => {
  test("Deck output delegates rendered IR to the runtime output adapter", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "nested", "deck.pptx");

    deck.add(() => (
      <Slide name="Runtime output">
        <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Runtime</Text>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const [content, fileStat] = await Promise.all([readFile(output), stat(output)]);

      expect(content.subarray(0, 2).toString("utf8")).toBe("PK");
      expect(fileStat.size).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime output adapter writes an explicit PresentationIR through a backend", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "explicit-ir.pptx");

    try {
      await outputPresentation(emptyPresentation(), {
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);

      expect(content.subarray(0, 2).toString("utf8")).toBe("PK");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime output adapter rejects unsupported backend names before writing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "unsupported.pptx");
    const config = {
      backend: "ooxml",
      output,
    } as never;

    try {
      await expect(outputPresentation(emptyPresentation(), config)).rejects.toThrow(
        'Backend "ooxml" is not implemented yet.',
      );
      await expect(stat(output)).rejects.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

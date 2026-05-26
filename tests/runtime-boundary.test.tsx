import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { Deck, Text } from "../src/index.ts";

describe("runtime boundary", () => {
  test("Deck render writes a Rendered Artifact through the Output Writer", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "nested", "deck.pptx");

    deck.slide({ name: "Runtime output" }, () => (
      <>
        <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Runtime</Text>
      </>
    ));

    try {
      await deck.render({ output });

      const [content, fileStat] = await Promise.all([readFile(output), stat(output)]);

      expect(content.subarray(0, 2).toString("utf8")).toBe("PK");
      expect(fileStat.size).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("render returns artifact bytes without writing", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Runtime output" }, () => <></>);

    const result = await deck.render();

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
    expect(result.artifact?.extension).toBe("pptx");
    expect(result.artifact?.bytes.subarray(0, 2).toString()).toBe("80,75");
  });

  test("render preserves artifact bytes when file writing fails", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const blocker = join(tempDir, "blocker");
    const output = join(blocker, "deck.pptx");

    deck.slide({ name: "Runtime output" }, () => <></>);

    try {
      await writeFile(blocker, "not a directory");
      const result = await deck.render({ output });

      expect(result.ok).toBe(false);
      expect(result.artifact?.bytes.byteLength).toBeGreaterThan(0);
      expect(result.output).toBeUndefined();
      expect(result.diagnostics.items.some((item) => item.code === "E_RENDER_WRITE_FAILED")).toBe(
        true,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";

describe("runtime boundary", () => {
  test("pipeline runner does not import runtime output modules", async () => {
    const source = await readFile(new URL("../../src/pipeline-runner.ts", import.meta.url), "utf8");

    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("node:path");
    expect(source).not.toContain("./runtime/output");
    expect(source).not.toContain("./runtime/node-output");
  });

  test("render returns artifact bytes without path output side effects", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Bytes only" }, () => <></>);

    const result = await deck.render();

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
    expect(result.artifact?.extension).toBe("pptx");
    expect(result.artifact?.bytes.subarray(0, 2).toString()).toBe("80,75");
    expect("output" in result).toBe(false);
    expect(result.summary).not.toHaveProperty("output");
  });
});

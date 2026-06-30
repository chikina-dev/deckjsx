import { describe, expect, test } from "vite-plus/test";

describe("public surface", () => {
  test("built root entry can render through its lazy pipeline chunk", async () => {
    const rootEntryUrl = new URL("../../dist/index.mjs", import.meta.url).href;
    const { Deck } = (await import(rootEntryUrl)) as Pick<typeof import("@/src/index.ts"), "Deck">;

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Built runtime" }, () => null);

    const render = await deck.render();

    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.bytes.subarray(0, 2).toString()).toBe("80,75");
  });
});

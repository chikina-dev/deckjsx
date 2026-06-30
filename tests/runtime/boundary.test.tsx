import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src/index.ts";

describe("runtime boundary", () => {
  test("render returns an in-memory pptx artifact", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Bytes only" }, () => <></>);

    const result = await deck.render();

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
    expect(result.artifact?.extension).toBe("pptx");
    expect(result.artifact?.bytes.subarray(0, 2).toString()).toBe("80,75");
  });
});

import { describe, expect, test } from "vite-plus/test";
import { fontFamilyList } from "@/src/font/family";

describe("font family lists", () => {
  test("parses quoted and unquoted CSS family candidates", () => {
    expect(fontFamilyList('"Aptos Display", "Noto Sans JP", sans-serif')).toEqual([
      "Aptos Display",
      "Noto Sans JP",
      "sans-serif",
    ]);
  });

  test("rejects empty, malformed, and unclosed family candidates", () => {
    expect(fontFamilyList("Aptos, ")).toBeUndefined();
    expect(fontFamilyList("Aptos $$$")).toBeUndefined();
    expect(fontFamilyList('"Aptos')).toBeUndefined();
  });
});

import { describe, expect, test } from "vite-plus/test";
import { assetEntityId, graphNodeId, styleEntityId } from "@/src/graph/identity.ts";

describe("graph identity", () => {
  test("distinguishes lossy authored-key characters for every entity brand", () => {
    const material = [
      ["node", "key:a b"],
      ["node", "key:a@b"],
      ["node", "key:a_b"],
    ] as const;

    expect(new Set(material.map((value) => graphNodeId(value))).size).toBe(3);
    expect(new Set(material.map((value) => styleEntityId(value))).size).toBe(3);
    expect(new Set(material.map((value) => assetEntityId(value))).size).toBe(3);
  });

  test("distinguishes material boundaries from authored segment content", () => {
    expect(graphNodeId(["a", "b"])).not.toBe(graphNodeId(["a_b"]));
    expect(graphNodeId(["a", "b"])).not.toBe(graphNodeId(["a__b"]));
    expect(graphNodeId([])).not.toBe(graphNodeId([""]));
  });

  test("produces stable readable IDs for the same material", () => {
    const material = ["document", "slot:note", "key:a b"];

    expect(graphNodeId(material)).toBe(graphNodeId([...material]));
    expect(String(graphNodeId(material))).toContain("slot:note");
  });
});

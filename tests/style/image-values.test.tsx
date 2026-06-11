import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";
import { WIDE_SVG_DATA_URI } from "../helpers.ts";

describe("image-values", () => {
  test("render supports edge-offset objectPosition and radial-gradient positions", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Position offsets" }, () => (
      <>
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right 25% bottom 10%",
          }}
        />
        <div
          style={{
            x: 3,
            y: 1,
            width: 2,
            height: 2,
            background:
              "radial-gradient(circle 40% at right 0.5in bottom 0.25in, #EF4444 0%, #F59E0B 100%)",
          }}
        />
      </>
    ));

    const [imageNode, viewNode] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(imageNode?.kind).toBe("image");
    if (imageNode?.kind !== "image") {
      throw new Error("Expected image node.");
    }
    expect(imageNode.objectPosition).toEqual({ x: 0.75, y: 0.9 });

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toEqual({
      kind: "radial-gradient",
      shape: "circle",
      center: { x: 0.75, y: 0.875 },
      radius: { x: 0.4, y: 0.4 },
      stops: [
        { color: "EF4444", transparency: undefined, position: 0 },
        { color: "F59E0B", transparency: undefined, position: 1 },
      ],
    });
  });

  test("render reports unsupported objectPosition fallbacks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid image position" }, () => (
      <img
        data={WIDE_SVG_DATA_URI}
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          objectPosition: "somewhere else",
        }}
      />
    ));

    const [imageNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(imageNode?.kind).toBe("image");
    if (imageNode?.kind !== "image") {
      throw new Error("Expected image node.");
    }
    expect(imageNode.objectPosition).toEqual({ x: 0.5, y: 0.5 });
    expect(imageNode.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "image",
        property: "objectPosition",
        value: "somewhere else",
        fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
      }),
    );
  });

  test("render treats css objectFit fill as stretch", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Object fit fill" }, () => (
      <img
        data={WIDE_SVG_DATA_URI}
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
        }}
      />
    ));

    const [imageNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(imageNode?.kind).toBe("image");
    if (imageNode?.kind !== "image") {
      throw new Error("Expected image node.");
    }
    expect(imageNode.fit).toBe("stretch");
  });

  test("render reports unsupported css objectFit values with a safe fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Object fit unsupported" }, () => (
      <img
        data={WIDE_SVG_DATA_URI}
        style={
          {
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            objectFit: "none",
          } as never
        }
      />
    ));

    const [imageNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(imageNode?.kind).toBe("image");
    if (imageNode?.kind !== "image") {
      throw new Error("Expected image node.");
    }
    expect(imageNode.fit).toBe("contain");
    expect(imageNode.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "image",
        property: "objectFit",
        value: "none",
        fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
      }),
    );
  });
});

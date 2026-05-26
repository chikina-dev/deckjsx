import { describe, expect, test } from "vite-plus/test";
import { Deck, Image, Shape, Text, View } from "../src/index.ts";

describe("Deck", () => {
  test("render compiles multiple slides and passes composition context to factories", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Spec test", author: "deckjsx" },
    });

    deck.slide({ name: "Slide 1" }, ({ composition }) => (
      <>
        <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </Text>
      </>
    ));

    deck.slide({ name: "Slide 2" }, ({ composition }) => (
      <>
        <Text style={{ x: 2, y: 1.5, width: 3, height: 0.5, fontSize: 18 }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </Text>
      </>
    ));

    const ir = deck.project().projection!;

    expect({
      version: ir.version,
      meta: ir.meta,
      slideNames: ir.slides.map((slide) => slide.payload.name),
      textValues: ir.slides.map((slide) =>
        slide.payload.elements
          .filter((node) => node.kind === "text")
          .map((node) => node.content.text),
      ),
    }).toMatchInlineSnapshot(`
      {
        "meta": {
          "author": "deckjsx",
          "title": "Spec test",
        },
        "slideNames": [
          "Slide 1",
          "Slide 2",
        ],
        "textValues": [
          [
            "1 / 2",
          ],
          [
            "2 / 2",
          ],
        ],
        "version": "0.6",
      }
    `);
  });

  test("render preserves rich design props in the IR", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide(
      { name: "Design", style: { backgroundColor: "#112233", backgroundTransparency: 12 } },
      () => (
        <>
          <View
            style={{
              x: 1,
              y: 1,
              width: 5,
              height: 3,
              backgroundColor: "#F8E16C",
              backgroundTransparency: 15,
              borderColor: "#1F2937",
              borderWidth: "2pt",
              borderStyle: "dash",
              borderTransparency: 20,
              borderRadius: 0.2,
              rotation: 5,
              flipH: true,
            }}
          >
            <Text
              style={{
                x: 0.5,
                y: 0.5,
                width: 4,
                height: 0.9,
                fontFamily: "Aptos",
                fontSize: 22,
                fontWeight: 700,
                italic: true,
                underline: true,
                strike: true,
                color: "#0F172A",
                textAlign: "center",
                verticalAlign: "middle",
                backgroundColor: "#FFFFFF",
                backgroundTransparency: 25,
                borderColor: "#DC2626",
                borderWidth: "1pt",
                borderStyle: "solid",
                borderTransparency: 10,
                borderRadius: 0.1,
                padding: ["4pt", "8pt", "4pt", "8pt"],
                lineSpacing: 24,
                lineSpacingMultiple: 1.2,
                paragraphSpacingBefore: 2,
                paragraphSpacingAfter: 3,
                charSpacing: 1,
                fit: "shrink",
                wrap: false,
              }}
            >
              Styled
            </Text>
            <Shape
              shape="rect"
              style={{
                x: 0.5,
                y: 1.8,
                width: 1.5,
                height: 0.75,
                fill: "#2563EB",
                fillTransparency: 30,
                borderColor: "#1D4ED8",
                borderWidth: 2,
                borderStyle: "dash",
                borderTransparency: 5,
                radius: 0.15,
              }}
            />
            <Image
              src="/tmp/demo.png"
              style={{
                x: 2.5,
                y: 1.8,
                width: 1,
                height: 1,
                transparency: 35,
                rounding: true,
                flipV: true,
              }}
            />
          </View>
        </>
      ),
    );

    const ir = deck.project().projection!;
    const slide = ir.slides[0]?.payload;
    const group = slide?.elements[0];

    expect(ir.version).toBe("0.6");
    expect(ir.size).toEqual({ widthEmu: 9144000, heightEmu: 5143500 });
    expect(slide?.name).toBe("Design");
    expect(slide?.background).toEqual({ kind: "solid", color: "112233", transparency: 12 });

    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group element.");
    }
    expect(group.frame).toEqual({
      xEmu: 914400,
      yEmu: 914400,
      widthEmu: 4572000,
      heightEmu: 2743200,
    });
    expect(group.fill).toEqual({ kind: "solid", color: "F8E16C", transparency: 15 });
    expect(group.stroke).toEqual({
      color: "1F2937",
      style: "dash",
      transparency: 20,
      widthPt: 2,
    });
    expect(group.radiusEmu).toBe(182880);
    expect(group.rotation).toBe(5);
    expect(group.flipH).toBe(true);

    const [text, shape, image] = group.children;
    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text element.");
    }
    expect(text.content.text).toBe("Styled");
    expect(text.fill).toEqual({ kind: "solid", color: "FFFFFF", transparency: 25 });
    expect(text.stroke).toEqual({
      color: "DC2626",
      style: "solid",
      transparency: 10,
      widthPt: 1,
    });
    expect(text.radiusEmu).toBe(91440);
    expect(text.style).toMatchObject({
      charSpacing: 1,
      color: "0F172A",
      fit: "shrink",
      fontFamily: "Aptos",
      fontSizePt: 22,
      fontWeight: 700,
      italic: true,
      lineSpacing: 24,
      lineSpacingMultiple: 1.2,
      paddingPt: [4, 8, 4, 8],
      paragraphSpacingAfter: 3,
      paragraphSpacingBefore: 2,
      strike: true,
      textAlign: "center",
      underline: true,
      verticalAlign: "middle",
      wrap: false,
    });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.fill).toEqual({ kind: "solid", color: "2563EB", transparency: 30 });
    expect(shape.stroke).toEqual({
      color: "1D4ED8",
      style: "dash",
      transparency: 5,
      widthPt: 2,
    });
    expect(shape.radiusEmu).toBe(137160);

    expect(image?.kind).toBe("image");
    if (!image || image.kind !== "image") {
      throw new Error("Expected image element.");
    }
    expect(image.source).toEqual({ kind: "path", path: "/tmp/demo.png" });
    expect(image.transparency).toBe(35);
    expect(image.rounding).toBe(true);
    expect(image.flipV).toBe(true);
  });
});

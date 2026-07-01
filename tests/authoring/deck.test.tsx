import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src/index.ts";
import { expectPptxProjection } from "../helpers";

describe("Deck", () => {
  test("compile reports deck option containers outside the public authoring API", () => {
    const deck = new (Deck as { new (options: unknown): Deck })(null);
    deck.slide(() => <p>invalid options</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_DECK_INVALID_OPTIONS",
        title: "deck options are not part of the public authoring API",
        message: "Deck options must be an object in the public authoring API.",
      }),
    ]);
  });

  test("compile reports deck layout options outside the public authoring API", () => {
    const missingLayoutDeck = new Deck({ layout: null } as never);
    missingLayoutDeck.slide(() => <p>missing layout</p>);
    const invalidLayoutDeck = new Deck({
      layout: { width: 0, height: Number.NaN, unit: "px" },
    } as never);
    invalidLayoutDeck.slide(() => <p>invalid layout</p>);

    const missingLayoutResult = missingLayoutDeck.compile();
    const invalidLayoutResult = invalidLayoutDeck.compile();

    expect(missingLayoutResult.ok).toBe(false);
    expect(missingLayoutResult.graph).toBeUndefined();
    expect(missingLayoutResult.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_DECK_INVALID_LAYOUT",
        message: "Deck layout must be an object in the public authoring API.",
      }),
    ]);
    expect(invalidLayoutResult.ok).toBe(false);
    expect(invalidLayoutResult.graph).toBeUndefined();
    expect(invalidLayoutResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_DECK_INVALID_LAYOUT",
          message:
            "Deck layout width must be a positive finite number in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_LAYOUT",
          message:
            "Deck layout height must be a positive finite number in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_LAYOUT",
          message: 'Deck layout unit must be "in" or "pt" in the public authoring API.',
        }),
      ]),
    );
  });

  test("project reports deck layout options outside the public authoring API", async () => {
    const deck = new Deck({ layout: { width: -1, height: 5.625, unit: "in" } } as never);
    deck.slide(() => <p>invalid layout</p>);

    const result = await deck.project();

    expect(result.ok).toBe(false);
    expect(result.projection).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_DECK_INVALID_LAYOUT",
        message: "Deck layout width must be a positive finite number in the public authoring API.",
      }),
    ]);
    expect(result.stages.compile.artifact).toBe("missing");
    expect(result.stages.project.artifact).toBe("missing");
  });

  test("compile reports deck metadata outside the public authoring API", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: 1, author: null, subject: [], keywords: "private" },
    } as never);
    deck.slide(() => <p>invalid meta</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_DECK_INVALID_META",
          message: "Deck metadata title must be a string in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_META",
          message: "Deck metadata author must be a string in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_META",
          message: "Deck metadata subject must be a string in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_META",
          message: "Deck metadata keywords is not part of the public authoring API.",
        }),
      ]),
    );
  });

  test("project reports deck output options outside the public authoring API", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "odp", target: "deck.odp" },
    } as never);
    deck.slide(() => <p>invalid output</p>);

    const result = await deck.project();

    expect(result.ok).toBe(false);
    expect(result.projection).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_DECK_INVALID_OUTPUT",
          message:
            "Deck output format is no longer part of the public authoring API. Use output.formats instead.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_OUTPUT",
          message: "Deck output target is not part of the public authoring API.",
        }),
      ]),
    );
    expect(result.stages.compile.artifact).toBe("missing");
    expect(result.stages.project.artifact).toBe("missing");
  });

  test("project reports invalid deck output formats arrays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pptx", "odp", "pptx"] },
    } as never);
    deck.slide(() => <p>invalid formats</p>);

    const result = await deck.project();

    expect(result.ok).toBe(false);
    expect(result.projection).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_DECK_INVALID_OUTPUT",
          message: 'Deck output formats[1] must be "pptx" or "pdf" in the public authoring API.',
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_OUTPUT",
          message: 'Deck output formats must not contain duplicate format "pptx".',
        }),
      ]),
    );
  });

  test("project accepts an empty output formats array as the default pptx target", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: [] },
    });
    deck.slide(() => <p>empty formats</p>);

    const result = await deck.project({ inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("pptx");
    expect(result.projection?.format).toBe("pptx");
  });

  test("compile reports unknown deck options outside the public authoring API", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      defaults: { p: { fontSize: 18 } },
      styles: [],
    } as never);
    deck.slide(() => <p>unknown deck options</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_DECK_INVALID_OPTIONS",
          message: "Deck option defaults is not part of the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_DECK_INVALID_OPTIONS",
          message: "Deck option styles is not part of the public authoring API.",
        }),
      ]),
    );
  });

  test("render compiles multiple slides and passes composition context to factories", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Spec test", author: "deckjsx" },
    });

    deck.slide({ name: "Slide 1" }, ({ composition }) => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5, fontSize: 24 }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </>
    ));

    deck.slide({ name: "Slide 2" }, ({ composition }) => (
      <>
        <p style={{ position: "absolute", left: 2, top: 1.5, width: 3, height: 0.5, fontSize: 18 }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </>
    ));

    const ir = expectPptxProjection(await deck.project());

    expect({
      meta: ir.meta,
      slideNames: ir.slides.map((slide) => slide.payload.name),
      textValues: ir.slides.map((slide) =>
        slide.payload.drawing.children
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
      }
    `);
  });

  test("render preserves rich design props in the IR", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Design", style: { backgroundColor: "rgba(17, 34, 51, 0.88)" } }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 5,
            height: 3,
            backgroundColor: "rgba(248, 225, 108, 0.85)",
            borderColor: "rgba(31, 41, 55, 0.8)",
            borderWidth: "2pt",
            borderStyle: "dashed",
            borderRadius: 0.2,
            transform: "rotate(5deg) scaleX(-1)",
          }}
        >
          <p
            style={{
              position: "absolute",
              left: 0.5,
              top: 0.5,
              width: 4,
              height: 0.9,
              fontFamily: "Aptos",
              fontSize: 22,
              fontWeight: 700,
              fontStyle: "italic",
              textDecorationLine: "underline line-through",
              color: "#0F172A",
              textAlign: "center",
              verticalAlign: "middle",
              backgroundColor: "rgba(255, 255, 255, 0.75)",
              borderColor: "rgba(220, 38, 38, 0.9)",
              borderWidth: "1pt",
              borderStyle: "solid",
              borderRadius: 0.1,
              padding: ["4pt", "8pt", "4pt", "8pt"],
              lineHeight: "24pt",
              paragraphSpacingBefore: 2,
              paragraphSpacingAfter: 3,
              letterSpacing: 1,
              fit: "shrink",
              whiteSpace: "nowrap",
            }}
          >
            Styled
          </p>
          <shape
            shape="rect"
            style={{
              position: "absolute",
              left: 0.5,
              top: 1.8,
              width: 1.5,
              height: 0.75,
              fill: "rgba(37, 99, 235, 0.7)",
              borderColor: "rgba(29, 78, 216, 0.95)",
              borderWidth: 2,
              borderStyle: "dashed",
              borderRadius: 0.15,
            }}
          />
          <img
            src="/tmp/demo.png"
            style={{
              position: "absolute",
              left: 2.5,
              top: 1.8,
              width: 1,
              height: 1,
              opacity: 0.65,
              borderRadius: 0.2,
              transform: "scaleY(-1)",
            }}
          />
        </div>
      </>
    ));

    const ir = expectPptxProjection(await deck.project());
    const slide = ir.slides[0]?.payload;
    const group = slide?.drawing.children[0];

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
      dashType: "dash",
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
    expect(text.stroke).toEqual({ color: "DC2626", style: "solid", transparency: 10, widthPt: 1 });
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
      dashType: "dash",
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
    expect(image.opacity).toBe(0.65);
    expect(image.transparency).toBeUndefined();
    expect(image.rounding).toBe(true);
    expect(image.flipV).toBe(true);
  });
});

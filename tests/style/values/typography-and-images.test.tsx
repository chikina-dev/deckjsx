import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style value typography and images", () => {
  test("render normalizes typography aliases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Typography aliases" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1,
            fontSize: 20,
            fontStyle: "italic",
            letterSpacing: 1.5,
            lineHeight: "30pt",
            textDecoration: "underline line-through",
            textDecorationStyle: "wavy",
            textDecorationColor: "dodgerblue",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            direction: "rtl",
            writingMode: "vertical-rl",
          }}
        >
          typography
        </p>
        <p
          style={{
            x: 1,
            y: 2.25,
            width: 3,
            height: 1,
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          Wrap
        </p>
      </>
    ));

    const [decorated, wrapping] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(decorated?.kind).toBe("text");
    if (!decorated || decorated.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(decorated.content.text).toBe("TYPOGRAPHY");
    expect(decorated.style).toMatchObject({
      italic: true,
      underline: true,
      underlineStyle: "wavy",
      underlineColor: "1E90FF",
      strike: true,
      charSpacing: 1.5,
      lineSpacing: 30,
      wrap: false,
      rtlMode: true,
      textDirection: "vert270",
    });

    expect(wrapping?.kind).toBe("text");
    if (!wrapping || wrapping.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(wrapping.style.wrap).toBe(true);
  });

  test("render normalizes image value aliases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " aliases" }, () => (
      <>
        <img
          src="/tmp/demo.png"
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            objectFit: "cover",
            objectPosition: "right 25% bottom 10%",
            crop: { top: "10%", right: "20%", bottom: 0.3, left: 0.4 },
            borderRadius: "1px",
            opacity: 0.5,
            transparency: 25,
          }}
        />
      </>
    ));

    const image = (await deck.project()).projection!.slides[0].payload.drawing.children[0];

    expect(image?.kind).toBe("image");
    if (!image || image.kind !== "image") {
      throw new Error("Expected image node.");
    }
    expect(image.fit).toBe("cover");
    expect(image.objectPosition).toEqual({ x: 0.75, y: 0.9 });
    expect(image.crop).toEqual({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 });
    expect(image.rounding).toBe(true);
    expect(image.opacity).toBe(0.5);
    expect(image.transparency).toBe(25);
  });
});

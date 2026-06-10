import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";

function diagnosticPaths(result: ReturnType<Deck["compile"]>, code: string): string[] {
  return result.diagnostics.items
    .filter((item) => item.code === code)
    .flatMap((item) => item.labels.map((label) => label.path));
}

describe("unsupported authoring props", () => {
  test("reports unsupported JSX props per prop while preserving supported graph data", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <div
          // @ts-expect-error direct style props are not supported authoring props.
          x={1}
          foo="bar"
          style={{ y: 2, width: 4 }}
        >
          <p>kept</p>
        </div>
      </>
    ));

    const result = deck.compile();
    const unsupportedPaths = diagnosticPaths(result, "E_COMPILE_UNSUPPORTED_AUTHORING_PROP");
    const view = [...(result.graph?.nodes.values() ?? [])].find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );

    expect(result.ok).toBe(false);
    expect(unsupportedPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".props.x"),
        expect.stringContaining(".props.foo"),
      ]),
    );
    expect(view).toBeDefined();
    expect(result.graph?.styles.get(view?.styleRef ?? ("" as never))?.authored.style).toEqual({
      y: 2,
      width: 4,
    });
  });

  test("reports unsupported slide declaration options per option", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Options", background: "red", x: 1 } as never, () => <p>slide</p>);

    const result = deck.compile();
    expect(diagnosticPaths(result, "E_COMPILE_UNSUPPORTED_AUTHORING_PROP")).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".options.background"),
        expect.stringContaining(".options.x"),
      ]),
    );
  });

  test("validates supported prop values with prop-specific diagnostics", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: 12, template: 34 } as never, () => (
      <>
        <div style={null as never}>
          <shape shape={123 as never} />
          <img src={123 as never} />
          <img src="a.png" data="data:image/png;base64,AA==" />
        </div>
      </>
    ));

    const result = deck.compile();
    expect(result.diagnostics.items.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_COMPILE_INVALID_SLIDE_NAME_OPTION",
        "E_COMPILE_INVALID_SLIDE_TEMPLATE_OPTION",
        "E_COMPILE_INVALID_STYLE_PROP",
        "E_COMPILE_INVALID_SHAPE_PROP",
        "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        "E_COMPILE_AMBIGUOUS_IMAGE_SOURCE_PROP",
      ]),
    );
  });
});

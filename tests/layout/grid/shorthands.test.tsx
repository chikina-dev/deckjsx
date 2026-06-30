import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid shorthand authoring diagnostics", () => {
  test("compile rejects grid and gridTemplate shorthand style keys", () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid shorthand diagnostics" }, () => (
      <>
        <div
          style={
            {
              display: "grid",
              width: 6,
              height: 4,
              gridTemplate: '"hero hero aside" 1in "footer footer aside" 3in / 2in 1in 3in',
            } as never
          }
        />
        <div
          style={
            {
              width: 6,
              height: 4,
              grid: "auto-flow 1in / 2in 1in",
            } as never
          }
        />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.items.filter((item) => item.code === "E_COMPILE_NON_PUBLIC_STYLE_PROP"),
    ).toHaveLength(2);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "style property is not part of the public authoring API",
          message: expect.stringContaining(
            'Style property "gridTemplate" is not part of the public deckjsx authoring style API',
          ),
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".props.style.gridTemplate"),
            }),
          ]),
        }),
        expect.objectContaining({
          title: "style property is not part of the public authoring API",
          message: expect.stringContaining(
            'Style property "grid" is not part of the public deckjsx authoring style API',
          ),
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".props.style.grid"),
            }),
          ]),
        }),
      ]),
    );
  });
});

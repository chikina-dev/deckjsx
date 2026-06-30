import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render source diagnostics and assets", () => {
  test("defineGraph keeps the source stylesheet context for projection", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          title: {
            target: "p.title",
            style: {
              position: "absolute",
              left: 1,
              top: 1,
              width: 4,
              height: 0.5,
              color: "red",
              fontSize: 28,
            },
          },
        },
      }),
    );
    deck.slide({ name: "Styled graph" }, () => (
      <>
        <p className="title">Styled title</p>
      </>
    ));

    const graph = deck.compile().graph!;
    deck.defineGraph(graph);

    const project = await deck.project();
    const text = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(text?.kind).toBe("text");
    expect(text?.kind === "text" ? text.style.color : undefined).toBe("FF0000");
    expect(text?.kind === "text" ? text.style.fontSizePt : undefined).toBe(28);
  });

  test("defineProjection reports lightweight format diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Projection shape" }, () => <></>);

    const projection = (await deck.project()).projection!;
    deck.defineProjection({ ...projection, format: "pdf" as never });

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.stages.project.artifact).toBe("missing");
    expect(project.summary).toBeUndefined();
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_FORMAT" }),
    );
  });

  test("render loads Deck-owned asset bytes for media parts", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const loader = H.testAssetLoader({
      resolverIdentity: "test-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", bytes: pngBytes }
          : undefined;
      },
    });

    deck.slide({ name: "Loaded asset" }, () => (
      <>
        <img
          src="/public/chart.png"
          style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1 }}
        />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(pngBytes));
  });
});

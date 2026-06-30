import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration plugin lifecycle", () => {
  test("runs plugin hooks across the deck lifecycle cycle", async () => {
    const events: string[] = [];
    const loader = {
      resolverIdentity: "test:lifecycle-loader",
      async probe() {
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load() {
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:lifecycle-cycle",
      name: "test:lifecycle-cycle",
      integration: { id: H.integrationContextId("test:lifecycle-cycle"), assetLoaders: [loader] },
      hooks: {
        beforeTree: () => {
          events.push("beforeTree");
        },
        afterTree: () => {
          events.push("afterTree");
        },
        beforeGraph: () => {
          events.push("beforeGraph");
        },
        afterGraph: () => {
          events.push("afterGraph");
        },
        beforeAsset: (context) => {
          events.push(`beforeAsset:${context.operation}`);
        },
        afterAsset: (context) => {
          events.push(`afterAsset:${context.operation}`);
        },
        beforeProject: () => {
          events.push("beforeProject");
        },
        afterProject: () => {
          events.push("afterProject");
        },
        beforeRender: () => {
          events.push("beforeRender");
        },
        afterRender: () => {
          events.push("afterRender");
        },
      },
    });
    deck.slide({ name: "Lifecycle" }, () => (
      <img
        src="./asset.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
    expect(events).toEqual([
      "beforeTree",
      "afterTree",
      "beforeGraph",
      "afterGraph",
      "beforeAsset:probe",
      "afterAsset:probe",
      "beforeProject",
      "afterProject",
      "beforeRender",
      "beforeAsset:load",
      "afterAsset:load",
      "afterRender",
    ]);
  });

  test("tree lifecycle hooks can replace composed roots before graph projection", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:tree-transform",
      name: "test:tree-transform",
      hooks: {
        afterTree(context) {
          return {
            roots: context.roots.map((root) => ({
              ...root,
              root: {
                ...root.root,
                props: {
                  ...root.root.props,
                  name: "Tree Hook Slide",
                },
              } as typeof root.root,
            })),
          };
        },
      },
    });
    deck.slide({ name: "Original Slide" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        tree transformed
      </p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.expectPptxProjection(project).slides[0]?.payload.name).toBe("Tree Hook Slide");
  });

  test("project lifecycle hooks can replace projection models before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:project-transform",
      name: "test:project-transform",
      hooks: {
        afterProject(context) {
          return {
            projection: {
              ...context.projection,
              slides: context.projection.slides.map((slide, index) =>
                index === 0
                  ? {
                      ...slide,
                      payload: {
                        ...slide.payload,
                        name: "Project Hook Slide",
                      },
                    }
                  : slide,
              ),
              parts: context.projection.parts.map((part) =>
                part.kind === "slide" && part.id === context.projection.slides[0]?.id
                  ? {
                      ...part,
                      payload: {
                        ...part.payload,
                        name: "Project Hook Slide",
                      },
                    }
                  : part,
              ),
            },
          };
        },
      },
    });
    deck.slide({ name: "Original Slide" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        project transformed
      </p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.expectPptxProjection(project).slides[0]?.payload.name).toBe("Project Hook Slide");
  });

  test("render lifecycle hooks run around prototype writer adapter methods", async () => {
    const events: string[] = [];
    class PrototypeWriter implements H.WriterAdapter<H.PptxPackageModel, "pptx"> {
      readonly kind = "deckjsx.writerAdapter";
      readonly name = "test-prototype-writer";
      readonly projectionFormat = "pptx";
      readonly format = "pptx";
      readonly options = {};

      async render(_projection: H.PptxPackageModel, _context?: H.WriterRenderContext) {
        return {
          diagnostics: H.createDiagnostics(),
          artifact: {
            format: "pptx" as const,
            mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            extension: "pptx",
            bytes: new Uint8Array([1, 2, 3]),
          },
        };
      }
    }

    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:render-hooks",
      name: "test:render-hooks",
      hooks: {
        beforeRender() {
          events.push("beforeRender");
        },
        afterRender() {
          events.push("afterRender");
        },
      },
    });
    deck.slide({ name: "Prototype writer" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>prototype</p>
    ));

    const render = await deck.render(new PrototypeWriter());

    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(events).toEqual(["beforeRender", "afterRender"]);
  });
});

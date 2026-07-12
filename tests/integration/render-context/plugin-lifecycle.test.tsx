import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";
import type { PdfPageModel } from "@/src/projection/pdf/model";
import { Theme } from "@/src/style/theme/public";

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
          const projection = context.projection as H.PptxPackageModel;
          return {
            projection: {
              ...projection,
              slides: projection.slides.map((slide, index) =>
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
              parts: projection.parts.map((part) =>
                part.kind === "slide" && part.id === projection.slides[0]?.id
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

  test("project lifecycle hooks can replace pdf projection models", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:pdf-project-transform",
      name: "test:pdf-project-transform",
      hooks: {
        afterProject(context) {
          const projection = context.projection as unknown as PdfPageModel;
          return {
            projection: {
              ...projection,
              metadata: { ...projection.metadata, title: "PDF Hook Slide" },
              pages: projection.pages.map((page, index) =>
                index === 0
                  ? {
                      ...page,
                      mediaBox: { ...page.mediaBox, width: page.mediaBox.width + 1 },
                    }
                  : page,
              ),
            },
          };
        },
      },
    });
    deck.slide({ name: "Original PDF Slide" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        pdf project transformed
      </p>
    ));

    const project = await deck.project({ format: "pdf", inspection: "none" });

    expect(project.ok).toBe(true);
    expect(project.projection?.format).toBe("pdf");
    expect(project.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
    );
  });

  test("project lifecycle hooks accept every canonical pdf gradient content operation", async () => {
    const linearGradientId = "pdf:resource:gradient:linear" as const;
    const radialGradientId = "pdf:resource:gradient:radial" as const;
    const box = { x: 10, y: 10, width: 100, height: 80 };
    const stops = [
      { color: { r: 1, g: 0, b: 0 }, position: 0 },
      { color: { r: 0, g: 0, b: 1 }, position: 1 },
    ];
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:pdf-gradient-content-transform",
      name: "test:pdf-gradient-content-transform",
      hooks: {
        afterProject(context) {
          const projection = context.projection as unknown as PdfPageModel;
          return {
            projection: {
              ...projection,
              pages: projection.pages.map((page, index) =>
                index === 0
                  ? {
                      ...page,
                      resources: {
                        ...page.resources,
                        gradients: [linearGradientId, radialGradientId],
                      },
                      content: [
                        { op: "fillLinearGradientRect", gradientId: linearGradientId, box },
                        { op: "fillLinearGradientEllipse", gradientId: linearGradientId, box },
                        {
                          op: "fillLinearGradientRoundRect",
                          gradientId: linearGradientId,
                          box,
                          radius: 8,
                        },
                        { op: "fillRadialGradientRect", gradientId: radialGradientId, box },
                        { op: "fillRadialGradientEllipse", gradientId: radialGradientId, box },
                        {
                          op: "fillRadialGradientRoundRect",
                          gradientId: radialGradientId,
                          box,
                          radius: 8,
                        },
                      ],
                    }
                  : page,
              ),
              resources: {
                ...projection.resources,
                gradients: [
                  {
                    id: linearGradientId,
                    name: "Linear",
                    kind: "linear-gradient",
                    angle: 90,
                    box,
                    stops,
                  },
                  {
                    id: radialGradientId,
                    name: "Radial",
                    kind: "radial-gradient",
                    shape: "ellipse",
                    center: { x: 0.5, y: 0.5 },
                    radius: { x: 0.5, y: 0.5 },
                    box,
                    stops,
                  },
                ],
              },
            } satisfies PdfPageModel,
          };
        },
      },
    });
    deck.slide({ name: "Gradient operations" }, () => <p>gradient operations</p>);

    const project = await deck.project({ format: "pdf", inspection: "none" });

    expect(project.ok).toBe(true);
    expect(project.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
    );
  });

  test("project lifecycle hooks reject projection updates with the wrong active format", async () => {
    const pptxDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    pptxDeck.slide({ name: "PPTX Source" }, () => <p>pptx source</p>);
    const pptxProjection = H.expectPptxProjection(await pptxDeck.project({ inspection: "none" }));
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:wrong-format-project-transform",
      name: "test:wrong-format-project-transform",
      hooks: {
        afterProject() {
          return { projection: pptxProjection };
        },
      },
    });
    deck.slide({ name: "PDF Slide" }, () => <p>pdf source</p>);

    const project = await deck.project({ format: "pdf", inspection: "none" });

    expect(project.ok).toBe(false);
    expect(project.format).toBe("pdf");
    expect(project.projection?.format).toBe("pdf");
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE" }),
    );
  });

  test("project lifecycle hooks reject malformed pdf projection page updates", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:malformed-pdf-project-transform",
      name: "test:malformed-pdf-project-transform",
      hooks: {
        afterProject(context) {
          const projection = context.projection as unknown as PdfPageModel;
          return {
            projection: {
              ...projection,
              pages: [{}],
            } as unknown as PdfPageModel,
          };
        },
      },
    });
    deck.slide({ name: "Malformed PDF Slide" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        malformed pdf project update
      </p>
    ));

    const project = await deck.project({ format: "pdf", inspection: "none" });

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE" }),
    );
    expect(project.diagnostics.items.map((item) => item.code)).not.toContain("E_PROJECT_FAILED");
  });

  test("project lifecycle hooks reject malformed pdf projection content updates", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:malformed-pdf-content-transform",
      name: "test:malformed-pdf-content-transform",
      hooks: {
        afterProject(context) {
          const projection = context.projection as unknown as PdfPageModel;
          return {
            projection: {
              ...projection,
              pages: projection.pages.map((page, index) =>
                index === 0 ? { ...page, content: [{}] } : page,
              ),
            } as unknown as PdfPageModel,
          };
        },
      },
    });
    deck.slide({ name: "Malformed PDF Content" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        malformed pdf content update
      </p>
    ));

    const project = await deck.project({ format: "pdf", inspection: "none" });

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE" }),
    );
    expect(project.diagnostics.items.map((item) => item.code)).not.toContain("E_PROJECT_FAILED");
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

  test("afterRender artifact replacements clear metadata derived from the original bytes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:replace-render-artifact",
      hooks: {
        afterRender(context) {
          return context.artifact
            ? {
                artifact: {
                  ...context.artifact,
                  bytes: new Uint8Array([9, 8, 7]),
                },
              }
            : undefined;
        },
      },
    });
    deck.slide({ name: "Replacement" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>replacement</p>
    ));

    const render = await deck.render(H.pptx({ inspection: "summary" }));

    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes).toEqual(new Uint8Array([9, 8, 7]));
    expect(render.summary).toBeUndefined();
    expect(render.patchPlan).toBeUndefined();
  });

  test("plugin stage snapshots cannot mutate pipeline-owned graph nodes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:immutable-stage-snapshot",
      hooks: {
        beforeProject(context) {
          const textRun = [...context.graph.nodes.values()].find((node) => node.kind === "textRun");
          if (textRun?.kind === "textRun") {
            (textRun as { text: string }).text = "mutated by plugin";
          }
        },
      },
    });
    deck.slide({ name: "Immutable snapshot" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>original text</p>
    ));

    const project = await deck.project({ inspection: "none" });
    const projection = H.expectPptxProjection(project);
    const slide = projection.slides[0]?.payload;

    expect(project.ok).toBe(true);
    expect(JSON.stringify(slide)).toContain("original text");
    expect(JSON.stringify(slide)).not.toContain("mutated by plugin");
  });

  test("tree stage snapshots isolate composed roots and authored props", () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:immutable-tree-snapshot",
      hooks: {
        beforeGraph(context) {
          const root = context.roots[0]?.root;
          if (root) {
            (root.props as { name?: string }).name = "mutated by plugin";
            (root.children as unknown as unknown[]).length = 0;
          }
        },
      },
    });
    deck.slide({ name: "Original root" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>original</p>
    ));

    const compile = deck.compile();
    const slide = [...(compile.graph?.nodes.values() ?? [])].find((node) => node.kind === "slide");
    const textRun = [...(compile.graph?.nodes.values() ?? [])].find(
      (node) => node.kind === "textRun",
    );

    expect(compile.ok).toBe(true);
    expect(slide?.kind === "slide" ? slide.name : undefined).toBe("Original root");
    expect(textRun?.kind === "textRun" ? textRun.text : undefined).toBe("original");
  });

  test("tree stage snapshots preserve built-in value internal slots", () => {
    let observedByteLength = 0;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const theme = new Theme({
      defaults: {},
      bytes: new Uint8Array([1, 2, 3]),
    } as never);
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:tree-snapshot-builtins",
      hooks: {
        afterTree(context) {
          return {
            roots: context.roots.map((root) => ({
              ...root,
              theme,
            })),
          };
        },
        beforeGraph(context) {
          const theme = context.roots[0]?.theme as { bytes?: Uint8Array } | undefined;
          observedByteLength = theme?.bytes?.byteLength ?? 0;
        },
      },
    });
    deck.slide({ name: "Built-in snapshot" }, () => <p>snapshot</p>);

    const compile = deck.compile();

    expect(compile.ok).toBe(true);
    expect(observedByteLength).toBe(3);
  });

  test("deck preserves accessor-backed plugin instances", () => {
    const events: string[] = [];
    class AccessorPlugin {
      get kind() {
        return "deckjsx.plugin" as const;
      }

      get id() {
        return "test:accessor-plugin";
      }

      get hooks() {
        return {
          beforeTree() {
            events.push("beforeTree");
          },
        };
      }
    }

    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(new AccessorPlugin());
    deck.slide({ name: "Accessor plugin" }, () => <p>plugin</p>);

    const compile = deck.compile();

    expect(compile.ok).toBe(true);
    expect(events).toEqual(["beforeTree"]);
  });

  test("projection and artifact hook snapshots do not leak direct mutations", async () => {
    let writerProjectionName: string | undefined;
    class SnapshotWriter implements H.WriterAdapter<H.PptxPackageModel, "pptx"> {
      readonly kind = "deckjsx.writerAdapter";
      readonly name = "test-snapshot-writer";
      readonly projectionFormat = "pptx";
      readonly format = "pptx";
      readonly options = {};

      async render(projection: H.PptxPackageModel) {
        writerProjectionName = projection.slides[0]?.payload.name;
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
      id: "test:projection-artifact-snapshots",
      hooks: {
        beforeRender(context) {
          const projection = context.projection as H.PptxPackageModel;
          const slide = projection.slides[0] as { payload: { name?: string } } | undefined;
          if (slide) {
            slide.payload.name = "mutated by plugin";
          }
        },
        afterRender(context) {
          if (context.artifact) {
            context.artifact.bytes[0] = 99;
          }
        },
      },
    });
    deck.slide({ name: "Original slide" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>snapshot</p>
    ));

    const render = await deck.render(new SnapshotWriter());

    expect(render.ok).toBe(true);
    expect(writerProjectionName).toBe("Original slide");
    expect(render.artifact?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});

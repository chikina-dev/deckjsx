import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation render boundaries", () => {
  test("direct writer reports pre-render package validation failures as render diagnostics", async () => {
    const result = await H.renderPptxPackage({
      format: "pptx",
      size: { widthEmu: 10, heightEmu: 10 },
      slides: [],
      parts: [
        {
          id: "pptx:test:invalid-package" as H.PackagePartId,
          category: "manifest",
          kind: "content-types",
          path: "[Content_Types].xml",
          payload: { defaults: [], overrides: [] },
        },
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.buildArtifacts).toBeUndefined();
    expect(result.summary?.assembly).toMatchObject({
      entryCount: 0,
      failedCount: 0,
      missingCount: 0,
      rebuiltCount: 0,
      reusedCount: 0,
    });
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_MISSING_PART_REQUIREMENT"),
          expect.stringContaining("code=E_PPTX_PACKAGE_MISSING_REQUIRED_PART"),
        ]),
      }),
    );
  });

  test("project reports an error for unsupported video formats", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={H.dataUriFromBytes("video/webm", new Uint8Array([26, 69, 223, 163]))}
          posterData={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2.25 }}
        />
      </>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "E_PROJECT_VIDEO_FORMAT_UNSUPPORTED",
      }),
    );
  });

  test("defineProjection keeps invalid projection shapes as diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid projection shape" }, () => <></>);

    deck.defineProjection({
      format: "pptx",
      size: { widthEmu: 1, heightEmu: 1 },
      parts: undefined,
      slides: undefined,
    } as never);

    const project = await deck.project();
    const render = deck.render();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.summary).toBeUndefined();
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_PARTS" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_SLIDES" }),
    );
    const renderResult = await render;
    expect(renderResult.ok).toBe(false);
    expect(renderResult.artifact).toBeUndefined();
  });

  test("defineProjection diagnoses non-object runtime input", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.defineProjection(null as never);

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_SHAPE", severity: "error" }),
    );
  });

  test("project validates defined projection package consistency before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package" }, () => <></>);

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.filter((part) => part.path !== "ppt/presentation.xml"),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeDefined();
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_MISSING_REQUIRED_PART" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_BROKEN_RELATIONSHIP" }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("render validation requires projected text body root values", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing text body values" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}> body values</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "text") {
              return element;
            }
            const {
              fit: _fit,
              textDirection: _textDirection,
              verticalAlign: _verticalAlign,
              wrap: _wrap,
              ...style
            } = element.style;
            return { ...element, style };
          }),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.style.fit"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.style.textDirection"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.style.verticalAlign"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.style.wrap"),
          }),
        ]),
      }),
    );
  });

  test("render validation requires projected underline style for underlined text", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing underline style" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 0.5,
          textDecorationLine: "underline",
        }}
      >
        Underlined
      </p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "text") {
              return element;
            }

            const { underlineStyle: _underlineStyle, ...style } = element.style;
            return { ...element, style };
          }),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.style.underlineStyle"),
            message: "missing projected text underline style",
          }),
        ]),
      }),
    );
  });

  test("render validation requires projected stroke dash types for dashed strokes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing stroke dash type" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#F8FAFC",
          stroke: "1pt dashed #2563EB",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "shape" || !element.stroke) {
              return element;
            }
            const { dashType: _dashType, ...stroke } = element.stroke;
            return { ...element, stroke };
          }),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.stroke.dashType"),
          }),
        ]),
      }),
    );
  });

  test("render validation rejects negative projected stroke widths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Negative stroke width" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#F8FAFC",
          stroke: "1pt solid #2563EB",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "shape" && element.stroke
              ? { ...element, stroke: { ...element.stroke, widthPt: -1 } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.stroke.widthPt"),
          }),
        ]),
      }),
    );
  });

  test("render validation rejects out-of-range projected gradient stop positions", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Out of range gradient stop" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "linear-gradient(90deg, #2563EB 0%, #F97316 100%)",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "shape" && element.fill?.kind === "linear-gradient"
              ? {
                  ...element,
                  fill: {
                    ...element.fill,
                    stops: element.fill.stops.map((stop, index) =>
                      index === 0 ? { ...stop, position: 1.5 } : stop,
                    ),
                  },
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.fill.stops.0.position"),
          }),
        ]),
      }),
    );
  });

  test("render validation requires projected shadow opacity", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing shadow opacity" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          boxShadow: "3px 3px 6px #663399",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "group" || !element.shadow) {
              return element;
            }
            const { opacity: _opacity, ...shadow } = element.shadow;
            return { ...element, shadow };
          }),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.shadow.opacity"),
          }),
        ]),
      }),
    );
  });

  test("render validation requires projected shadow geometry", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing shadow geometry" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          boxShadow: "3px 3px 6px #663399",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "group" || !element.shadow) {
              return element;
            }
            const {
              blurPt: _blurPt,
              offsetPt: _offsetPt,
              angle: _angle,
              ...shadow
            } = element.shadow;
            return { ...element, shadow };
          }),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.shadow.blurPt"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.shadow.offsetPt"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.shadow.angle"),
          }),
        ]),
      }),
    );
  });

  test("project rejects duplicate presentation slide ids across referenced slide parts", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate slide id 1" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>One</p>
    ));
    deck.slide({ name: "Duplicate slide id 2" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>Two</p>
    ));

    const projection = (await deck.project()).projection!;
    const firstSlide = projection.slides[0]!;
    const secondSlide = {
      ...projection.slides[1]!,
      payload: { ...projection.slides[1]!.payload, slideId: firstSlide.payload.slideId },
    } satisfies H.PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) => (slide.id === secondSlide.id ? secondSlide : slide)),
      parts: projection.parts.map((part) => (part.id === secondSlide.id ? secondSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".slidePartIds.1"),
            message: `duplicate presentation slide id ${firstSlide.payload.slideId}`,
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project reports missing integration context when no loader handles a path source", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const unrelatedLoader = H.testAssetLoader({
      resolverIdentity: "unrelated-assets",
      async probe() {
        return undefined;
      },
    });
    deck.slide({ name: "Unhandled context" }, () => (
      <img
        src="./local.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [unrelatedLoader],
    });
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_CONTEXT_MISSING",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      message: "Project-local asset paths require an Integration Context.",
      labels: [expect.objectContaining({ message: "./local.png" })],
      notes: expect.arrayContaining(["phase=probe", "sourceKind=path", "sourceField=src"]),
    });
  });

  test("invalid resolved style updates are rejected at the plugin snapshot seam", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:project-boundary-invalid-resolved-style",
      name: "test:project-boundary-invalid-resolved-style",
      hooks: {
        beforeProject(context) {
          const textNodeId = H.textNodeIdBy(context.graph, "invalid style from plugin");
          const resolved = textNodeId ? context.resolvedStyles.get(textNodeId) : undefined;
          if (!textNodeId || !resolved) {
            return undefined;
          }

          return {
            resolvedStyles: new Map(context.resolvedStyles).set(textNodeId, {
              ...resolved,
              style: {
                ...resolved.style,
                superscript: true,
                subscript: true,
              },
            }),
          };
        },
      },
    });
    deck.slide({ name: "Project boundary", style: { backgroundColor: "#123456" } }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
        invalid style from plugin
      </p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
      }),
    );
    expect(project.stages.project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE" }),
    );
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.projection?.format).toBe("pptx");
    if (project.projection?.format === "pptx") {
      expect(project.projection.slides[0]?.payload.background).toMatchObject({
        kind: "solid",
        color: "123456",
      });
    }
  });

  test("adapter-like invalid writer values are render-blocking errors", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid adapter" }, () => <></>);
    const invalidAdapter = {
      kind: "deckjsx.writerAdapter",
      name: "missing-projection-format",
      format: "pptx",
      options: {},
      async render() {
        throw new Error("invalid adapter should not render");
      },
    } as never;

    const result = await deck.render(invalidAdapter);

    expect(result.ok).toBe(false);
    expect(result.artifact).toBeUndefined();
    expect(result.stages.compile.artifact).toBe("missing");
    expect(result.stages.project.artifact).toBe("missing");
    expect(result.stages.render.artifact).toBe("missing");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_RENDER_INVALID_WRITER_ADAPTER", severity: "error" }),
    );
  });

  test("custom writer adapters do not inherit built-in asset byte requirements", async () => {
    let called = false;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:probe-only-custom-adapter",
      integration: {
        id: "test:probe-only-custom-adapter" as never,
        assetLoaders: [
          {
            resolverIdentity: "test:probe-only",
            async probe() {
              return {
                ok: true as const,
                value: { mediaType: "image/png", width: 1, height: 1 },
              };
            },
          },
        ],
      },
    });
    deck.slide({ name: "Custom adapter assets" }, () => (
      <img
        src="./unresolved-custom-adapter.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));
    const adapter: H.WriterAdapter<H.PptxPackageModel, "pptx"> = {
      kind: "deckjsx.writerAdapter",
      name: "asset-independent",
      projectionFormat: "pptx",
      format: "pptx",
      options: {},
      async render() {
        called = true;
        return {
          diagnostics: H.createDiagnostics(),
          artifact: {
            format: "pptx",
            mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            extension: "pptx",
            bytes: new Uint8Array([1]),
          },
        };
      },
    };

    const result = await deck.render(adapter);

    expect(result.ok).toBe(true);
    expect(called).toBe(true);
  });

  test("malformed writer adapter results remain render diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Malformed adapter result" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
        malformed adapter result
      </p>
    ));
    const malformedAdapter: H.WriterAdapter = {
      kind: "deckjsx.writerAdapter",
      name: "test:malformed-result",
      projectionFormat: "pptx",
      format: "pptx",
      options: {},
      async render() {
        return undefined as never;
      },
    };

    const result = await deck.render(malformedAdapter);

    expect(result.ok).toBe(false);
    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_ADAPTER_RESULT_INVALID",
        severity: "error",
      }),
    );
    expect(result.stages.render.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_RENDER_ADAPTER_RESULT_INVALID" }),
    );
  });
});

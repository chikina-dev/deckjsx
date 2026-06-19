import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation slide and template support payloads", () => {
  test("project validates slide payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken slide payload" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2, backgroundColor: "#2563EB" }} />
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? {
              ...part,
              payload: {
                ...(part as H.PptxSlidePart).payload,
                slideId: "12",
                name: 42,
                background: { kind: "solid", color: "" },
                backgroundLayers: [
                  {
                    kind: "background-image",
                    frame: { xEmu: 0, yEmu: 0, widthEmu: 0, heightEmu: 914400 },
                    sourceFrame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                    source: { kind: "url", url: "" },
                    fit: "tile",
                    repeat: "sometimes",
                    size: { widthEmu: -1, heightEmu: Number.NaN },
                    transparency: 101,
                  },
                  { kind: "solid", color: "111111" },
                ],
                drawing: { children: "not-an-array" },
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.slideId") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.name") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.background.color") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.backgroundLayers.0.frame.widthEmu"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.backgroundLayers.0.source.url"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.backgroundLayers.0.fit"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.backgroundLayers.1.frame"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.drawing.children") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates notes placeholder support payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken notes payload" }, () => <></>);

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: [
        ...projection.parts,
        {
          id: "pptx:test:notes-master" as H.PackagePartId,
          category: "support",
          kind: "notes-master",
          path: "ppt/notesMasters/notesMaster1.xml",
          orderKey: {
            group: "other",
            groupOrder: 999,
            sequence: 999,
            path: "ppt/notesMasters/notesMaster1.xml",
            value: "999:000999:notes-master",
          },
          fingerprint: "test:notes-master",
          requirement: {
            status: "optional",
            required: false,
            reason: "notes placeholder payload validation test",
          },
          payload: {
            kind: "notes-slide",
            status: "ready",
            editable: false,
            role: "notes-slide",
            source: "external",
            settings: { enabled: true },
          },
        },
      ],
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.kind") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.status") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.editable") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.role") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.source") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".payload.settings") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates template slide layout anchor payloads", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          areas: { title: { kind: "title", frame: { x: 0.5, y: 0.5, width: 8, height: 1 } } },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title}>Broken anchor payload</h1>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide-layout" &&
        (part.payload as { template?: { name?: string } } | undefined)?.template?.name === "report"
          ? {
              ...part,
              payload: {
                ...H.slideLayoutPayload(part),
                layoutAnchors: [
                  {
                    template: "report",
                    area: "title",
                    kind: "headline",
                    frame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                    placeholderStrategy: "body",
                  },
                ],
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR" }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".layoutAnchors.0.kind") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".layoutAnchors.0.placeholderStrategy"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".layoutAnchors.0.frame.widthEmu"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates slide master and layout support payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken support payloads" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind === "slide-master") {
          return {
            ...part,
            payload: {
              ...H.slideMasterPayload(part),
              name: "",
              editable: false,
              themePartId: "pptx:missing-theme",
              slideLayoutPartIds: ["pptx:missing-layout"],
              colorMap: { bg1: 1 },
              textStyles: { title: "body", body: "empty", other: "empty" },
            } as never,
          };
        }

        if (part.path === "ppt/slideLayouts/slideLayout1.xml") {
          return {
            ...part,
            payload: {
              ...H.slideLayoutPayload(part),
              name: "",
              editable: false,
              layoutType: "title",
              preserve: false,
              slideMasterPartId: "pptx:missing-master",
              placeholderStrategy: "body",
              template: { sourceKey: "", name: "" },
            } as never,
          };
        }

        return part;
      }),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".themePartId") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".slideLayoutPartIds.0") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".colorMap.bg1") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".textStyles.title") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".layoutType") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".slideMasterPartId") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".placeholderStrategy") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates slide master and layout support payload reference part kinds", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrong support payload targets" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support targets</p>
    ));

    const projection = (await deck.project()).projection!;
    const themePart = H.expectPptxPart(projection.parts, "theme");
    const slideMasterPart = H.expectPptxPart(projection.parts, "slide-master");
    const slideLayoutPart = H.expectPptxPart(projection.parts, "slide-layout");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id === slideMasterPart.id) {
          return {
            ...part,
            payload: {
              ...H.slideMasterPayload(part),
              themePartId: slideLayoutPart.id,
              slideLayoutPartIds: [themePart.id],
            } as never,
          };
        }

        if (part.id === slideLayoutPart.id) {
          return {
            ...part,
            payload: {
              ...H.slideLayoutPayload(part),
              slideMasterPartId: themePart.id,
            } as never,
          };
        }

        return part;
      }),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(`${slideMasterPart.id}.payload.themePartId`),
              message: "slide master theme part id targets slide-layout",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(`${slideMasterPart.id}.payload.slideLayoutPartIds.0`),
              message: "slide master layout part id targets theme",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(`${slideLayoutPart.id}.payload.slideMasterPartId`),
              message: "slide layout master part id targets theme",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

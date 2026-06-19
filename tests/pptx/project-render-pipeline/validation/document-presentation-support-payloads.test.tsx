import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation document and presentation support payloads", () => {
  test("project validates document property support payloads before render", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Document properties" },
    });
    deck.slide({ name: "Broken doc props" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Document properties</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.path === "docProps/core.xml") {
          return {
            ...part,
            payload: {
              kind: "document-properties",
              propertyKind: "extended",
            } as H.PptxSupportPartPayload,
          };
        }

        if (part.path === "docProps/app.xml") {
          return {
            ...part,
            payload: {
              kind: "document-properties",
              propertyKind: "extended",
              application: "deckjsx",
              slideCount: Number.NaN,
            } as H.PptxSupportPartPayload,
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
            expect.objectContaining({ path: expect.stringContaining("document-properties-core") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".propertyKind") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".editable") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".source") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".meta"),
              message: "invalid core document properties metadata",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".slideCount") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates extended document property slide count against presentation payload", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Doc props slide count" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Document properties</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.path === "docProps/app.xml"
          ? {
              ...part,
              payload: {
                ...H.extendedDocumentPropertiesPayload(part),
                slideCount: 2,
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".slideCount"),
            message: "expected extended document properties slide count 1",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates presentation support payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken presentation payload" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Presentation</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "presentation"
          ? {
              ...part,
              payload: {
                kind: "presentation",
                size: { widthEmu: Number.NaN, heightEmu: -1 },
                slideMasterIds: (
                  part.payload as Extract<
                    H.PptxSupportPartPayload,
                    { readonly kind: "presentation" }
                  >
                ).slideMasterIds,
                defaultTextStyle: (
                  part.payload as Extract<
                    H.PptxSupportPartPayload,
                    { readonly kind: "presentation" }
                  >
                ).defaultTextStyle,
                slidePartIds: ["pptx:missing-slide" as H.PackagePartId],
              } satisfies H.PptxSupportPartPayload,
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
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".size.widthEmu") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".size.heightEmu") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".slidePartIds.0") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates presentation support payload slide references target slide parts", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrong presentation slide target" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Presentation</p>
    ));

    const projection = (await deck.project()).projection!;
    const themePart = H.expectPptxPart(projection.parts, "theme");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "presentation"
          ? {
              ...part,
              payload: {
                ...H.presentationPayload(part),
                slidePartIds: [themePart.id],
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".slidePartIds.0"),
            message: "presentation slide part id targets theme",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project rejects duplicate presentation support payload slide references", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate presentation slide" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Presentation</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "presentation"
          ? {
              ...part,
              payload: {
                ...H.presentationPayload(part),
                slidePartIds: [slidePart.id, slidePart.id],
              } as never,
            }
          : part,
      ),
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
            message: expect.stringContaining("duplicate presentation slide part"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates projected support numeric ids before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken support numeric ids" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support ids</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind === "presentation") {
          return {
            ...part,
            payload: {
              ...(part.payload as Extract<
                H.PptxSupportPartPayload,
                { readonly kind: "presentation" }
              >),
              slideMasterIds: [
                {
                  slideMasterPartId: projection.parts.find(
                    (candidate) => candidate.kind === "slide-master",
                  )!.id,
                  id: "1",
                },
              ],
            } satisfies H.PptxSupportPartPayload,
          };
        }

        if (part.kind === "slide-master") {
          return {
            ...part,
            payload: {
              ...(part.payload as H.PptxSlideMasterPartPayload),
              slideLayoutIds: (part.payload as H.PptxSlideMasterPartPayload).slideLayoutIds.map(
                (slideLayoutId) => ({ ...slideLayoutId, id: "1" }),
              ),
            } satisfies H.PptxSupportPartPayload,
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
              path: expect.stringContaining(".slideMasterIds.0.id"),
              message: "invalid presentation slide master numeric id",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".slideLayoutIds.0.id"),
              message: "invalid slide master layout numeric id",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates empty support property payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken support properties" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support properties</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind === "view-properties") {
          return {
            ...part,
            payload: {
              kind: "presentation-properties",
              editable: false,
              settings: {},
            } as never,
          };
        }

        if (part.kind === "presentation-properties") {
          return {
            ...part,
            payload: {
              kind: "presentation-properties",
              editable: true,
              settings: { unexpected: true },
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
            expect.objectContaining({ path: expect.stringContaining(".kind") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".editable") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".settings") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

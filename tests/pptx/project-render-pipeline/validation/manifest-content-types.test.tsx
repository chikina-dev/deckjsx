import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation manifest content types", () => {
  test("project validates manifest payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken manifest payload" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = H.expectPptxPart(projection.parts, "presentation");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind === "content-types") {
          return {
            ...part,
            payload: {
              defaults: [
                { extension: "", contentType: "" },
                { extension: "xml", contentType: "application/xml" },
                { extension: "XML", contentType: "application/xml" },
              ],
              overrides: [
                { partName: "ppt/presentation.xml", contentType: "" },
                {
                  partName: "/ppt/presentation.xml",
                  contentType: "application/vnd.deckjsx.duplicate+xml",
                },
                {
                  partName: "/ppt/presentation.xml",
                  contentType: "application/vnd.deckjsx.duplicate-again+xml",
                },
              ],
            } satisfies H.PptxContentTypesPayload,
          };
        }

        if (part.path === "_rels/.rels") {
          return {
            ...part,
            payload: {
              relationships: [
                {
                  id: "" as H.PptxRelationship["id"],
                  type: "",
                  target: "",
                  targetPath: "",
                  targetMode: "internal",
                } as never,
                {
                  id: "bad id" as H.PptxRelationship["id"],
                  type: "officeDocument",
                  target: presentationPart.path,
                  targetPath: presentationPart.path,
                  targetPartId: presentationPart.id,
                },
                {
                  id: "rIdDuplicate" as H.PptxRelationship["id"],
                  type: "officeDocument",
                  target: presentationPart.path,
                  targetPath: presentationPart.path,
                  targetPartId: presentationPart.id,
                },
                {
                  id: "rIdDuplicate" as H.PptxRelationship["id"],
                  type: "officeDocument",
                  target: presentationPart.path,
                  targetPath: presentationPart.path,
                  targetPartId: presentationPart.id,
                },
              ],
            } satisfies H.PptxRelationshipsPayload,
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
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".defaults.0.extension") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".defaults.2.extension"),
              message: "duplicate content type default XML",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".overrides.0.partName") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".overrides.2.partName"),
              message: "duplicate content type override /ppt/presentation.xml",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".relationships.0.id") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.0.targetMode"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.1.id"),
              message: "invalid relationship id",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.3.id"),
              message: "duplicate relationship id rIdDuplicate",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates content type override part names are canonical package paths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken content type part name" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest path</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const contentTypesPart = H.expectPptxPart(projection.parts, "content-types");
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id !== contentTypesPart.id) {
            return part;
          }

          const payload = part.payload as H.PptxContentTypesPayload;
          return {
            ...part,
            payload: {
              ...payload,
              overrides: payload.overrides.map((override) =>
                override.partName === `/${slidePart.path}`
                  ? { ...override, partName: "/ppt\\slides\\slide1.xml" }
                  : override,
              ),
            } satisfies H.PptxContentTypesPayload,
          };
        }),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.overrides"),
            message: "invalid content type part name",
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).not.toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_BROKEN_CONTENT_TYPE_OVERRIDE" }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates content type coverage before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing content type coverage" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const mediaExtension = mediaPart.path.split(".").pop();
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "content-types") {
          return part;
        }
        const payload = part.payload as H.PptxContentTypesPayload;
        return {
          ...part,
          payload: {
            defaults: payload.defaults.filter((item) => item.extension !== mediaExtension),
            overrides: payload.overrides.filter((item) => item.partName !== `/${slidePart.path}`),
          } satisfies H.PptxContentTypesPayload,
        };
      }),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_MISSING_CONTENT_TYPE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.defaults"),
              message: `missing default content type for ${mediaExtension}`,
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_MISSING_CONTENT_TYPE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.overrides"),
              message: `missing override content type for /${slidePart.path}`,
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates content type default extensions are canonical extension tokens", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken content type default extension" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const mediaExtension = mediaPart.path.split(".").pop()!;
    const contentTypesPart = H.expectPptxPart(projection.parts, "content-types");
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id !== contentTypesPart.id) {
            return part;
          }

          const payload = part.payload as H.PptxContentTypesPayload;
          return {
            ...part,
            payload: {
              ...payload,
              defaults: payload.defaults.map((item) =>
                item.extension === mediaExtension
                  ? { ...item, extension: `.${mediaExtension}` }
                  : item,
              ),
            } satisfies H.PptxContentTypesPayload,
          };
        }),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.defaults"),
            message: "invalid content type extension",
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_CONTENT_TYPE",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.defaults"),
            message: `missing default content type for ${mediaExtension}`,
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates content type values before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid content type values" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const mediaExtension = mediaPart.path.split(".").pop()!;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind !== "content-types") {
            return part;
          }
          const payload = part.payload as H.PptxContentTypesPayload;
          return {
            ...part,
            payload: {
              defaults: payload.defaults.map((item) => {
                if (item.extension === "rels") {
                  return { ...item, contentType: "application/xml" };
                }
                if (item.extension === "xml") {
                  return { ...item, contentType: "text/xml" };
                }
                if (item.extension === mediaExtension) {
                  return { ...item, contentType: "application/octet-stream" };
                }
                return item;
              }),
              overrides: payload.overrides.map((item) =>
                item.partName === `/${slidePart.path}`
                  ? { ...item, contentType: "application/vnd.deckjsx.invalid-slide+xml" }
                  : item,
              ),
            } satisfies H.PptxContentTypesPayload,
          };
        }),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_CONTENT_TYPE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.defaults"),
              message: expect.stringContaining("invalid default content type for rels"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_CONTENT_TYPE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.defaults"),
              message: expect.stringContaining("invalid default content type for xml"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_CONTENT_TYPE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.defaults"),
              message: expect.stringContaining(
                `invalid default content type for ${mediaExtension}`,
              ),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_CONTENT_TYPE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.overrides"),
              message: expect.stringContaining(
                `invalid override content type for /${slidePart.path}`,
              ),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

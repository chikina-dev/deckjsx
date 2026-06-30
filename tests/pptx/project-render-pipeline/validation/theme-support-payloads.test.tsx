import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation theme support payloads", () => {
  test("project validates theme support payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken theme payload" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>Theme payload</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "theme"
          ? {
              ...part,
              payload: {
                ...H.themePayload(part),
                name: "",
                editable: false,
                colorScheme: { name: "", colors: { dk1: "#123456" } },
                fontScheme: { name: "", majorLatin: "", minorLatin: "" },
                formatScheme: { name: "" },
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
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".name") }),
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
            expect.objectContaining({ path: expect.stringContaining(".colorScheme.name") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".colorScheme.colors.dk1") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".colorScheme.colors.lt1") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".fontScheme.majorLatin") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".formatScheme.name") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates theme projection trace payloads before render", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "#2563EB", fontFamily: "Aptos" } } }),
    });
    deck.slide({ name: "Broken theme trace" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>Theme trace</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "theme"
          ? {
              ...part,
              payload: {
                ...(part.payload as H.PptxThemePartPayload),
                projection: {
                  ...(part.payload as H.PptxThemePartPayload).projection,
                  id: "",
                  purpose: "print",
                  source: "themeDefault",
                  trace: {
                    ...(part.payload as H.PptxThemePartPayload).projection.trace,
                    wholeThemeMappings: [
                      {
                        source: "deckjsx-default",
                        projectedAs: "themePart",
                        purpose: "print",
                        themePartId: "pptx:missing-theme",
                        groups: ["themeDefaults", "unknown"],
                        fingerprint: "",
                      },
                    ],
                    supportMappings: [
                      {
                        source: "themeDefault",
                        projectedAs: "themePart",
                        groups: ["themeDefaults"],
                      },
                    ],
                    valueGroupFingerprints: [
                      {
                        group: "colors",
                        source: "deckjsx-default",
                        projectedAs: "themeSupport",
                        fingerprint: "",
                        itemCount: -1,
                      },
                    ],
                    defaultStyleDecisions: [
                      {
                        source: "deckjsx-default",
                        graphNodeId: "",
                        defaultKey: "p",
                        property: "zIndex",
                        resolvedValue: 10,
                        decision: "paintWithMagic",
                        projectedAs: "writerLocal",
                        reason: "",
                      },
                    ],
                    concreteDrawingProperties: [
                      {
                        graphNodeId: "",
                        defaultKey: "p",
                        property: "color",
                        projectedAs: "unprojected",
                      },
                    ],
                    unprojected: [
                      {
                        source: "deckjsx-default",
                        graphNodeId: "",
                        defaultKey: "p",
                        property: "filter",
                        projectedAs: "concreteDrawingProperty",
                        reason: "",
                      },
                    ],
                    effectiveInheritance: [
                      {
                        source: "deckjsx-default",
                        graphNodeId: "",
                        defaultKey: "p",
                        property: "color",
                        projectedAs: "magic",
                        resolvedValue: "#2563EB",
                        themePartId: "pptx:missing-theme",
                        inheritedThrough: ["themePart", "unknown"],
                        reason: "",
                      },
                    ],
                    referenceSerialization: [
                      {
                        source: "deckjsx-default",
                        graphNodeId: "",
                        defaultKey: "p",
                        property: "color",
                        resolvedValue: "#2563EB",
                        currentSerialization: "schemeClr",
                        decision: "alreadyThemeReference",
                        candidate: {
                          kind: "fontScheme",
                          value: "body",
                          themePartId: "pptx:missing-theme",
                        },
                        reason: "",
                      },
                    ],
                  },
                },
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE" }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".projection.id") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".projection.purpose") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".projection.source") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".wholeThemeMappings.0.themePartId"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".wholeThemeMappings.0.groups.1"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".supportMappings.0.projectedAs"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".supportMappings.0.groups.0"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".valueGroupFingerprints.0.group"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".defaultStyleDecisions.0.decision"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".defaultStyleDecisions.0.source"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".defaultStyleDecisions.0.projectedAs"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".concreteDrawingProperties.0.projectedAs"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".concreteDrawingProperties.0.resolvedValue"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".unprojected.0.source") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unprojected.0.projectedAs"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unprojected.0.resolvedValue"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.themePartId"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.source"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.inheritedThrough.1"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".referenceSerialization.0.currentSerialization"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".referenceSerialization.0.source"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".referenceSerialization.0.candidate.value"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates theme projection trace package references target expected part kinds", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrong theme trace references" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
        Theme trace refs
      </p>
    ));

    const projection = (await deck.project()).projection!;
    const themePart = H.expectPptxPart(projection.parts, "theme");
    const slideMasterPart = H.expectPptxPart(projection.parts, "slide-master");
    const slideLayoutPart = H.expectPptxPart(projection.parts, "slide-layout");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id !== themePart.id) {
          return part;
        }

        const payload = part.payload as H.PptxThemePartPayload;
        const trace = payload.projection.trace;
        return {
          ...part,
          payload: {
            ...payload,
            projection: {
              ...payload.projection,
              trace: {
                ...trace,
                wholeThemeMappings: [
                  {
                    source: "deckjsx-default",
                    projectedAs: "themePart",
                    purpose: "default",
                    themePartId: slideLayoutPart.id,
                    groups: ["colorScheme", "fontScheme", "formatScheme", "themeDefaults"],
                    fingerprint: "test:wrong-theme-mapping",
                  },
                ],
                effectiveInheritance: [
                  {
                    source: "themeDefault",
                    graphNodeId: "graph:test:theme-trace" as H.GraphNodeId,
                    defaultKey: "p",
                    property: "color",
                    projectedAs: "concreteDrawingProperty",
                    resolvedValue: "#2563EB",
                    themePartId: slideLayoutPart.id,
                    slideMasterPartId: themePart.id,
                    slideLayoutPartId: slideMasterPart.id,
                    slidePartId: themePart.id,
                    inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide"],
                    reason: "test trace reference kind validation",
                  },
                ],
                referenceSerialization: [
                  {
                    source: "themeDefault",
                    graphNodeId: "graph:test:theme-trace" as H.GraphNodeId,
                    defaultKey: "p",
                    property: "color",
                    resolvedValue: "#2563EB",
                    currentSerialization: "srgbClr",
                    decision: "deferThemeReferenceSerialization",
                    candidate: {
                      kind: "schemeColor",
                      value: "accent1",
                      themePartId: slideLayoutPart.id,
                    },
                    reason: "test theme reference candidate validation",
                  },
                ],
              },
            },
          } satisfies H.PptxThemePartPayload,
        };
      }),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".wholeThemeMappings.0.themePartId"),
              message: "expected theme package part but found slide-layout",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.themePartId"),
              message: "expected theme package part but found slide-layout",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.slideMasterPartId"),
              message: "expected slide-master package part but found theme",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.slideLayoutPartId"),
              message: "expected slide-layout package part but found slide-master",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".effectiveInheritance.0.slidePartId"),
              message: "expected slide package part but found theme",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".referenceSerialization.0.candidate.themePartId"),
              message: "expected theme package part but found slide-layout",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

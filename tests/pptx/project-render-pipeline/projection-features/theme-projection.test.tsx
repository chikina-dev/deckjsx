import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render theme projection features", () => {
  test("project records unprojected theme default mappings with warning diagnostics", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "#334155", filter: "blur(2px)" } } }),
    });
    deck.slide({ name: "Theme unsupported default" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Filtered default</p>
    ));

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as H.PptxThemePartPayload | undefined;
    const trace = themePayload?.projection.trace;
    const defaultGroup = trace?.valueGroupFingerprints.find(
      (fingerprint) => fingerprint.group === "themeDefaults",
    );

    expect(project.ok).toBe(true);
    expect(trace?.concreteDrawingProperties).toContainEqual(
      expect.objectContaining({
        defaultKey: "p",
        property: "color",
        projectedAs: "concreteDrawingProperty",
        resolvedValue: "#334155",
      }),
    );
    expect(trace?.concreteDrawingProperties).not.toContainEqual(
      expect.objectContaining({ property: "filter" }),
    );
    expect(trace?.unprojected).toContainEqual(
      expect.objectContaining({
        source: "themeDefault",
        defaultKey: "p",
        property: "filter",
        projectedAs: "unprojected",
        resolvedValue: "blur(2px)",
        reason: expect.stringContaining("CSS filter effects"),
      }),
    );
    expect(trace?.effectiveInheritance).toContainEqual(
      expect.objectContaining({
        source: "themeDefault",
        defaultKey: "p",
        property: "filter",
        projectedAs: "unprojected",
        resolvedValue: "blur(2px)",
        inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide", "drawing"],
        reason: expect.stringContaining("CSS filter effects"),
      }),
    );
    expect(defaultGroup).toEqual(
      expect.objectContaining({
        group: "themeDefaults",
        projectedAs: "themeProjectionTrace",
        itemCount: 2,
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNPROJECTED_PPTX_THEME_DEFAULT",
        severity: "warning",
        notes: expect.arrayContaining([
          "defaultKey=p",
          "property=filter",
          "projectedAs=unprojected",
          "value=blur(2px)",
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "feature=filter",
          "property=filter",
          "fallbackStrategy=dropFilterEffect",
        ]),
      }),
    );
  });

  test("project classifies theme default style decisions by projection destination", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({
        defaults: {
          p: {
            color: "#334155",
            display: "none",
            filter: "blur(2px)",
            whiteSpace: "pre",
            width: 4,
            x: 1,
            zIndex: 5,
          },
        },
      }),
    });
    deck.slide({ name: "Theme style decisions" }, () => <p>Theme decisions</p>);

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as H.PptxThemePartPayload | undefined;
    const decisions = themePayload?.projection.trace.defaultStyleDecisions ?? [];

    expect(project.ok).toBe(true);
    expect(decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "color",
          decision: "projectConcreteDrawingProperty",
          projectedAs: "concreteDrawingProperty",
        }),
        expect.objectContaining({
          property: "display",
          decision: "projectFilteredState",
          projectedAs: "filteredProjectionInput",
        }),
        expect.objectContaining({
          property: "filter",
          decision: "preserveUnsupportedSemantic",
          projectedAs: "unsupportedSemanticFallback",
        }),
        expect.objectContaining({
          property: "whiteSpace",
          decision: "preserveAsStyleInput",
          projectedAs: "styleInput",
        }),
        expect.objectContaining({
          property: "width",
          decision: "projectLayoutInput",
          projectedAs: "layoutInput",
        }),
        expect.objectContaining({
          property: "x",
          decision: "projectLayoutInput",
          projectedAs: "layoutInput",
        }),
        expect.objectContaining({
          property: "zIndex",
          decision: "projectDrawingMetadata",
          projectedAs: "drawingMetadata",
        }),
      ]),
    );
    expect(themePayload?.projection.trace.concreteDrawingProperties).toContainEqual(
      expect.objectContaining({ property: "color" }),
    );
    expect(themePayload?.projection.trace.concreteDrawingProperties).not.toContainEqual(
      expect.objectContaining({ property: "zIndex" }),
    );
    expect(themePayload?.projection.trace.unprojected).toContainEqual(
      expect.objectContaining({ property: "filter", projectedAs: "unprojected" }),
    );
  });

  test("project records theme-reference serialization choices for theme defaults", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({
        defaults: { p: { color: "#2563EB", fontFamily: "Aptos", fontSize: 20 } },
      }),
    });
    deck.slide({ name: "Theme reference choices" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme reference</p>
    ));

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as H.PptxThemePartPayload | undefined;
    const trace = themePayload?.projection.trace;
    const themePartId = project.projection?.parts.find((part) => part.kind === "theme")?.id;

    expect(project.ok).toBe(true);
    expect(trace?.referenceSerialization).toContainEqual(
      expect.objectContaining({
        source: "themeDefault",
        defaultKey: "p",
        property: "color",
        resolvedValue: "#2563EB",
        currentSerialization: "srgbClr",
        decision: "deferThemeReferenceSerialization",
        candidate: expect.objectContaining({ kind: "schemeColor", value: "accent1", themePartId }),
      }),
    );
    expect(trace?.referenceSerialization).toContainEqual(
      expect.objectContaining({
        source: "themeDefault",
        defaultKey: "p",
        property: "fontFamily",
        resolvedValue: "Aptos",
        currentSerialization: "latinTypeface",
        decision: "deferThemeReferenceSerialization",
        candidate: expect.objectContaining({
          kind: "fontScheme",
          value: "minorLatin",
          themePartId,
        }),
      }),
    );
    expect(trace?.referenceSerialization).toContainEqual(
      expect.objectContaining({
        source: "themeDefault",
        defaultKey: "p",
        property: "fontSize",
        resolvedValue: 20,
        currentSerialization: "concreteDrawingValue",
        decision: "emitConcreteValue",
      }),
    );
  });

  test("project derives detailed theme projection provenance only when requested", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({
        defaults: { p: { color: "#2563EB", filter: "blur(2px)", fontFamily: "Aptos" } },
      }),
    });
    deck.slide({ name: "Theme detail" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme detail</p>
    ));

    const summaryProject = await deck.project();
    const detailedProject = await deck.project({ inspection: "details" });
    const themePart = detailedProject.projection?.parts.find((part) => part.kind === "theme");
    const themePayload = themePart?.payload as H.PptxThemePartPayload | undefined;
    const themeProjection = detailedProject.summary?.details?.themeProjections.entries[0];

    expect(summaryProject.ok).toBe(true);
    expect(summaryProject.summary?.details).toBeUndefined();
    expect(detailedProject.ok).toBe(true);
    expect(themeProjection).toEqual(
      expect.objectContaining({
        partId: themePart?.id,
        path: "ppt/theme/theme1.xml",
        name: "deckjsx",
        projectionId: themePayload?.projection.id,
        purpose: "default",
        source: "deckjsx-default",
        colorSchemeName: "deckjsx",
        fontSchemeName: "deckjsx",
        formatSchemeName: "deckjsx",
        wholeThemeMappings: themePayload?.projection.trace.wholeThemeMappings,
        valueGroupFingerprints: themePayload?.projection.trace.valueGroupFingerprints,
        supportMappings: themePayload?.projection.trace.supportMappings,
        defaultStyleDecisionCount: themePayload?.projection.trace.defaultStyleDecisions.length,
        concreteDrawingPropertyCount:
          themePayload?.projection.trace.concreteDrawingProperties.length,
        unprojectedCount: themePayload?.projection.trace.unprojected.length,
        effectiveInheritanceCount: themePayload?.projection.trace.effectiveInheritance.length,
        referenceSerializationCount: themePayload?.projection.trace.referenceSerialization.length,
      }),
    );
    expect(themeProjection?.defaultStyleDecisions).toContainEqual(
      expect.objectContaining({
        defaultKey: "p",
        property: "filter",
        projectedAs: "unsupportedSemanticFallback",
      }),
    );
    expect(themeProjection?.unprojected).toContainEqual(
      expect.objectContaining({ property: "filter", projectedAs: "unprojected" }),
    );
    expect(themeProjection?.referenceSerialization).toContainEqual(
      expect.objectContaining({
        property: "color",
        decision: "deferThemeReferenceSerialization",
        candidate: expect.objectContaining({ kind: "schemeColor", value: "accent1" }),
      }),
    );
  });
});

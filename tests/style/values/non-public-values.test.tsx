import { describe, expect, test } from "vite-plus/test";
import { WIDE_SVG_DATA_URI } from "@/tests/helpers.ts";
import * as H from "./helpers.tsx";

describe("style values outside the public authoring API", () => {
  test("compile rejects empty hyperlink tooltips", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid tooltip" }, () => (
      <>
        <p style={{ href: "https://example.com", tooltip: "" as never }}>Empty tooltip</p>
        <img src="image.png" style={{ href: "https://example.com", tooltip: "   " as never }} />
        <shape shape="rect" style={{ href: "https://example.com", tooltip: "\t" as never }} />
      </>
    ));

    const result = await deck.project();

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.items.filter((item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE"),
    ).toHaveLength(3);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("tooltip value is not part of the public authoring API"),
        }),
      ]),
    );
  });

  test("compile rejects shadow inset outside the public shadow syntax", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid shadow inset" }, () => (
      <>
        <div style={{ boxShadow: "1px inset 2px #111111" as never, width: 2, height: 1 }} />
      </>
    ));

    const result = await deck.project();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message: expect.stringContaining("boxShadow value is not part of the public authoring API"),
      }),
    );
  });

  test("render rejects ambiguous or non-public style values", async () => {
    const nonPublicLength = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    nonPublicLength.slide({ name: "Non-public length" }, () => (
      <>
        <div style={{ position: "absolute", left: "1qu" as never, top: 1, width: 2, height: 1 }} />
      </>
    ));
    const nonPublicLengthResult = await nonPublicLength.project();
    expect(nonPublicLengthResult.ok).toBe(false);
    expect(nonPublicLengthResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message: expect.stringContaining("left value is not part of the public authoring API"),
      }),
    );

    const invalidSpacing = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidSpacing.slide({ name: "Invalid spacing" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            inset: "auto 0" as never,
            width: "-1px" as never,
            height: "initial" as never,
            gap: "-0.25in" as never,
            padding: "-1px 2px" as never,
            borderRadius: "-1px" as never,
            margin: "1px 2banana" as never,
          }}
        />
      </>
    ));
    const invalidSpacingResult = await invalidSpacing.project();
    expect(invalidSpacingResult.ok).toBe(false);
    expect(
      invalidSpacingResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(7);
    expect(invalidSpacingResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("inset value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("width value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("height value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("gap value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("padding value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderRadius value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("margin value is not part of the public authoring API"),
        }),
      ]),
    );

    const nonPublicRepeat = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    nonPublicRepeat.slide({ name: "Non-public repeat" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundRepeat: "space" as never,
          }}
        />
      </>
    ));
    const nonPublicRepeatResult = await nonPublicRepeat.project();
    expect(nonPublicRepeatResult.ok).toBe(false);
    expect(nonPublicRepeatResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message:
          "backgroundRepeat value is not part of the public authoring API. Use one of: no-repeat, repeat-x, repeat-y, repeat.",
      }),
    );

    const unsupportedGradient = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    unsupportedGradient.slide({ name: "Unsupported gradient" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "repeating-linear-gradient(90deg, #FFFFFF 0%, #000000 0%)",
          }}
        />
      </>
    ));
    const unsupportedGradientResult = await unsupportedGradient.project();
    const [unsupportedGradientNode] =
      unsupportedGradientResult.projection!.slides[0].payload.drawing.children;
    expect(unsupportedGradientResult.ok).toBe(true);
    expect(unsupportedGradientResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        message: "repeating-linear-gradient() requires a positive repeat span.",
      }),
    );
    expect(unsupportedGradientNode?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredBackgroundInput"]),
          missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        }),
      }),
    );

    const invalidGrid = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidGrid.slide({ name: "Invalid grid shorthand" }, () => (
      <>
        <div
          style={
            {
              position: "absolute",
              left: 1,
              top: 1,
              width: 6,
              height: 4,
              grid: "auto-flow 1in / auto-flow 2in" as never,
            } as never
          }
        />
        <div
          style={
            {
              position: "absolute",
              left: 1,
              top: 1,
              width: 6,
              height: 4,
              gridTemplate: "1banana / 1fr" as never,
            } as never
          }
        />
        <div
          style={
            {
              position: "absolute",
              left: 1,
              top: 1,
              width: 6,
              height: 4,
              grid: "auto-flow 1banana / 1fr" as never,
            } as never
          }
        />
      </>
    ));
    const invalidGridResult = await invalidGrid.project();
    expect(invalidGridResult.ok).toBe(false);
    expect(
      invalidGridResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_NON_PUBLIC_STYLE_PROP",
      ),
    ).toHaveLength(3);
    expect(invalidGridResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'Style property "grid" is not part of the public deckjsx authoring style API',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style property "gridTemplate" is not part of the public deckjsx authoring style API',
          ),
        }),
      ]),
    );

    const invalidGridArea = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidGridArea.slide({ name: "Invalid grid area" }, () => (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateAreas: ['"hero"'],
            gridTemplateColumns: ["1fr"],
            gridTemplateRows: ["1fr"],
            width: 6,
            height: 4,
          }}
        >
          <div style={{ gridArea: "123bad" as never }} />
          <div style={{ gridArea: "hero footer" as never }} />
          <div style={{ gridArea: "hero / header" as never }} />
        </div>
      </>
    ));
    const invalidGridAreaResult = await invalidGridArea.project();
    expect(invalidGridAreaResult.ok).toBe(false);
    expect(
      invalidGridAreaResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(3);

    const invalidGridTemplateAreas = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidGridTemplateAreas.slide({ name: "Invalid grid template areas" }, () => (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateAreas: '""' as never,
            gridTemplateColumns: ["1fr"],
            gridTemplateRows: ["1fr"],
            width: 6,
            height: 4,
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateAreas: ['"   "'] as never,
            gridTemplateColumns: ["1fr"],
            gridTemplateRows: ["1fr"],
            width: 6,
            height: 4,
          }}
        />
      </>
    ));
    const invalidGridTemplateAreasResult = await invalidGridTemplateAreas.project();
    expect(invalidGridTemplateAreasResult.ok).toBe(false);
    expect(
      invalidGridTemplateAreasResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(2);
    expect(invalidGridTemplateAreasResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "gridTemplateAreas value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidZeroGridArea = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidZeroGridArea.slide({ name: "Invalid zero grid area" }, () => (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: ["1fr"],
            gridTemplateRows: ["1fr"],
            width: 6,
            height: 4,
          }}
        >
          <div style={{ gridArea: "0" as never }} />
          <div style={{ gridArea: "span 0" as never }} />
        </div>
      </>
    ));
    const invalidZeroGridAreaResult = await invalidZeroGridArea.project();
    expect(invalidZeroGridAreaResult.ok).toBe(false);
    expect(
      invalidZeroGridAreaResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(2);

    const invalidGridPlacement = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidGridPlacement.slide({ name: "Invalid grid placement" }, () => (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: ["1fr"],
            gridTemplateRows: ["1fr"],
            width: 6,
            height: 4,
          }}
        >
          <div style={{ gridColumn: "span 0" as never }} />
          <div style={{ gridRow: "1 / header" as never }} />
          <div style={{ gridColumnStart: "0" as never }} />
          <div style={{ gridRowEnd: "span -1" as never }} />
        </div>
      </>
    ));
    const invalidGridPlacementResult = await invalidGridPlacement.project();
    expect(invalidGridPlacementResult.ok).toBe(false);
    expect(
      invalidGridPlacementResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(4);
    expect(invalidGridPlacementResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "gridColumn value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("gridRow value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "gridColumnStart value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "gridRowEnd value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidGridTemplateTracks = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidGridTemplateTracks.slide({ name: "Invalid grid template tracks" }, () => (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "nonsense" as never,
            gridTemplateRows: "1fr 1banana" as never,
            gridAutoColumns: "-1fr" as never,
            gridAutoRows: "repeat(auto-fit, nonsense)" as never,
            width: 6,
            height: 4,
          }}
        />
      </>
    ));
    const invalidGridTemplateTracksResult = await invalidGridTemplateTracks.project();
    expect(invalidGridTemplateTracksResult.ok).toBe(false);
    expect(
      invalidGridTemplateTracksResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(4);
    expect(invalidGridTemplateTracksResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "gridTemplateColumns value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "gridTemplateRows value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "gridAutoColumns value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "gridAutoRows value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidClosedLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidClosedLiteral.slide({ name: "Invalid closed literals" }, () => (
      <>
        <div
          style={{
            display: "inline-block" as never,
            visibility: "collapse" as never,
            position: "fixed" as never,
            overflow: "scroll" as never,
            boxSizing: "padding-box" as never,
            flexWrap: "wrap-reverse" as never,
            // @ts-expect-error runtime diagnostics still reject direction when JS/casts bypass public types.
            direction: "diagonal" as never,
            aspectRatio: "wide" as never,
            flexBasis: "1banana" as never,
            flexGrow: -1 as never,
            flexShrink: -0.5 as never,
            zIndex: Number.NaN as never,
            order: 1.5 as never,
            rotation: 15 as never,
            flipH: true as never,
            flipV: true as never,
            transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)" as never,
            transformOrigin: "left top center" as never,
            filter: "sparkle(1)" as never,
            alignSelf: "baseline" as never,
            justifySelf: "safe center" as never,
            justifyItems: "baseline" as never,
            alignContent: "baseline" as never,
            placeSelf: "center baseline" as never,
            placeItems: "center baseline" as never,
            placeContent: "baseline center" as never,
            gridAutoFlow: "dense row" as never,
            isolation: "separate" as never,
            mixBlendMode: "brighten" as never,
            opacity: 2,
            backgroundTransparency: -1,
            borderTransparency: 101,
            boxShadow: "1px 2px -3px #111111" as never,
            border: "2pt groove #111111" as never,
            borderWidth: -1 as never,
            borderTop: "-1pt solid #111111" as never,
            borderTopWidth: "-1pt" as never,
            borderLeft: "2pt solid definitely-not-a-color" as never,
            outline: "1pt groove #222222" as never,
            outlineWidth: "initial" as never,
            borderStyle: "dash" as never,
            strokeLinecap: "flat" as never,
            strokeLinejoin: "arcs" as never,
            width: 6,
            height: 4,
          }}
        />
      </>
    ));
    const invalidClosedLiteralResult = await invalidClosedLiteral.project();
    expect(invalidClosedLiteralResult.ok).toBe(false);
    expect(
      invalidClosedLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(35);
    expect(invalidClosedLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "direction"'),
        }),
      ]),
    );
    expect(invalidClosedLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("display value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "visibility value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "position value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "overflow value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "flexWrap value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "aspectRatio value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "flexBasis value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "flexGrow value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "flexShrink value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("zIndex value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("order value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "rotation"'),
          help: expect.arrayContaining([expect.stringContaining("transform")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "flipH"'),
          help: expect.arrayContaining([expect.stringContaining("scaleX")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "flipV"'),
          help: expect.arrayContaining([expect.stringContaining("scaleY")]),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "transform value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "transformOrigin value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("filter value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "alignSelf value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "justifySelf value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "justifyItems value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "alignContent value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "placeSelf value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "placeItems value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "placeContent value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "gridAutoFlow value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "boxSizing value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "isolation value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "mixBlendMode value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("opacity value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "backgroundTransparency"'),
          help: expect.arrayContaining([expect.stringContaining("backgroundColor")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "borderTransparency"'),
          help: expect.arrayContaining([expect.stringContaining("borderColor")]),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "boxShadow value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("border value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderWidth value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderTop value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderTopWidth value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderLeft value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("outline value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "outlineWidth value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderStyle value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "strokeLinecap"'),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "strokeLinejoin"'),
        }),
      ]),
    );

    const invalidStrokeLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidStrokeLiteral.slide({ name: "Invalid stroke literals" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "definitely-not-background" as never,
            fill: "definitely-not-paint" as never,
            // @ts-expect-error runtime diagnostics still reject fillTransparency when JS/casts bypass public types.
            fillTransparency: 101,
            stroke: "1pt groove #2563EB" as never,
            strokeWidth: "3pt" as never,
            strokeOpacity: 2,
            strokeDasharray: "4 var(--gap)" as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 2.1,
            top: 2.25,
            width: 1,
            height: 1,
            fill: "#F8FAFC",
            stroke: "#2563EB",
            strokeDasharray: "-1 4" as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 2.1,
            top: 3.5,
            width: 1,
            height: 1,
            fill: "#F8FAFC",
            stroke: "#2563EB",
            strokeDasharray: "1 2 3" as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 3.25,
            top: 1,
            width: 2,
            height: 1,
            fill: "#F8FAFC",
            stroke: "1pt solid definitely-not-a-color" as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 5.5,
            top: 1,
            width: 2,
            height: 1,
            fill: "#F8FAFC",
            // @ts-expect-error runtime diagnostics still reject radius when JS/casts bypass public types.
            radius: 0.15 as never,
          }}
        />
      </>
    ));
    const invalidStrokeLiteralResult = await invalidStrokeLiteral.project();
    expect(invalidStrokeLiteralResult.ok).toBe(false);
    expect(
      invalidStrokeLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(7);
    expect(invalidStrokeLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "background value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("fill value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "fillTransparency"'),
          help: expect.arrayContaining([expect.stringContaining("fill")]),
        }),
        expect.objectContaining({
          message: expect.stringContaining("stroke value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "strokeWidth"'),
          help: expect.arrayContaining([expect.stringContaining("stroke")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "strokeOpacity"'),
          help: expect.arrayContaining([expect.stringContaining("stroke")]),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "strokeDasharray value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "radius"'),
          help: expect.arrayContaining([expect.stringContaining("borderRadius")]),
        }),
      ]),
    );

    const invalidTableLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidTableLiteral.slide({ name: "Invalid table literals" }, () => (
      <>
        <table
          style={{
            width: 4,
            height: 2,
            tableLayout: "intrinsic" as never,
            borderCollapse: "merge" as never,
          }}
        >
          <tbody>
            <tr>
              <td>A</td>
            </tr>
          </tbody>
        </table>
      </>
    ));
    const invalidTableLiteralResult = await invalidTableLiteral.project();
    expect(invalidTableLiteralResult.ok).toBe(false);
    expect(
      invalidTableLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(2);
    expect(invalidTableLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "tableLayout value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "borderCollapse value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidBackgroundLiteral = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidBackgroundLiteral.slide({ name: "Invalid background literals" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundImage: "image.png" as never,
            backgroundPosition: "somewhere else" as never,
            backgroundSize: "giant" as never,
            backgroundClip: "margin-box" as never,
            backgroundOrigin: "padding-box, margin-box" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4.25,
            top: 1,
            width: 3,
            height: 2,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundSize: "stretch" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.25,
            width: 3,
            height: 2,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundSize: "initial" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4.25,
            top: 3.25,
            width: 3,
            height: 2,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundSize: "auto -1px" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 5.5,
            width: 3,
            height: 2,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundPosition: "initial" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4.25,
            top: 5.5,
            width: 3,
            height: 2,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundPosition: "right initial" as never,
          }}
        />
      </>
    ));
    const invalidBackgroundLiteralResult = await invalidBackgroundLiteral.project();
    expect(invalidBackgroundLiteralResult.ok).toBe(false);
    expect(
      invalidBackgroundLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(10);
    expect(invalidBackgroundLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundImage value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundPosition value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundSize value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundClip value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundOrigin value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidEmptyUrlLiteral = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidEmptyUrlLiteral.slide({ name: "Invalid empty url literals" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            backgroundImage: 'url("")' as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 3,
            height: 1,
            backgroundImage: "url()" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 3.5,
            width: 3,
            height: 1,
            background: "url()" as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4.25,
            top: 1,
            width: 1,
            height: 1,
            fill: 'url("")' as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4.25,
            top: 3.5,
            width: 1,
            height: 1,
            fill: "url(   )" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 1,
            width: 3,
            height: 2,
            backgroundImage: 'url(" image.png")' as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 1,
            height: 1,
            fill: 'url(" image.png")' as never,
          }}
        />
      </>
    ));
    const invalidEmptyUrlLiteralResult = await invalidEmptyUrlLiteral.project();
    expect(invalidEmptyUrlLiteralResult.ok).toBe(false);
    expect(
      invalidEmptyUrlLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(7);
    expect(invalidEmptyUrlLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundImage value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("fill value is not part of the public authoring API"),
        }),
      ]),
    );

    const invalidFilterLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidFilterLiteral.slide({ name: "Invalid filter literals" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            filter: "blur()" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4.25,
            top: 1,
            width: 3,
            height: 2,
            filter: "opacity(   )" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 3,
            height: 2,
            filter: "blur(1banana)" as never,
          }}
        />
      </>
    ));
    const invalidFilterLiteralResult = await invalidFilterLiteral.project();
    expect(invalidFilterLiteralResult.ok).toBe(false);
    expect(
      invalidFilterLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(3);
    expect(invalidFilterLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining("filter value is not part of the public authoring API"),
        }),
      ]),
    );

    const invalidTransformLiteral = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidTransformLiteral.slide({ name: "Invalid transform literals" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            transform: "rotate()" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4.25,
            top: 1,
            width: 3,
            height: 2,
            transform: "scale(   )" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 3,
            height: 2,
            transform: "rotate(1banana)" as never,
          }}
        />
      </>
    ));
    const invalidTransformLiteralResult = await invalidTransformLiteral.project();
    expect(invalidTransformLiteralResult.ok).toBe(false);
    expect(
      invalidTransformLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(3);
    expect(invalidTransformLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "transform value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidColorFunctionLiteral = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidColorFunctionLiteral.slide({ name: "Invalid empty color functions" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 1,
            color: "rgb()" as never,
            backgroundColor: "rgba(   )" as never,
          }}
        >
          Empty color functions
        </p>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4.25,
            top: 1,
            width: 1,
            height: 1,
            fill: "hsla(   )" as never,
          }}
        />
      </>
    ));
    const invalidColorFunctionLiteralResult = await invalidColorFunctionLiteral.project();
    expect(invalidColorFunctionLiteralResult.ok).toBe(false);
    expect(
      invalidColorFunctionLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(3);
    expect(invalidColorFunctionLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("color value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "backgroundColor value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("fill value is not part of the public authoring API"),
        }),
      ]),
    );

    const invalidGradientFunctionLiteral = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidGradientFunctionLiteral.slide({ name: "Invalid empty gradient functions" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            background: "linear-gradient()" as never,
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4.25,
            top: 1,
            width: 1,
            height: 1,
            fill: "radial-gradient(   )" as never,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 1,
            width: 3,
            height: 2,
            background: "#ffffff sparkle" as never,
          }}
        />
      </>
    ));
    const invalidGradientFunctionLiteralResult = await invalidGradientFunctionLiteral.project();
    expect(invalidGradientFunctionLiteralResult.ok).toBe(false);
    expect(
      invalidGradientFunctionLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(3);
    expect(invalidGradientFunctionLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "background value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("fill value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "background value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidTextLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidTextLiteral.slide({ name: "Invalid text literals" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 1,
            color: "definitely-not-a-color" as never,
            fontFamily: "123bad" as never,
            fontSize: "10%" as never,
            fontWeight: 950 as never,
            fontStyle: "oblique" as never,
            // @ts-expect-error runtime diagnostics still reject italic when JS/casts bypass public types.
            italic: true as never,
            underline: true as never,
            strike: true as never,
            charSpacing: 1.5 as never,
            lineSpacing: 21 as never,
            lineSpacingMultiple: 1.4 as never,
            lineHeight: "1banana" as never,
            letterSpacing: "1banana" as never,
            textIndent: "initial" as never,
            textAlign: "start" as never,
            textDecoration: "blink" as never,
            textDecorationLine: "overline" as never,
            textDecorationStyle: "groove" as never,
            textShadow: "1px 2px definitely-not-a-color" as never,
            whiteSpace: "break-spaces" as never,
            wordBreak: "break-word-all" as never,
            overflowWrap: "normal anywhere" as never,
            wrap: false as never,
            textTransform: "small-caps" as never,
            direction: "auto" as never,
            writingMode: "sideways-rl" as never,
            verticalAlign: "baseline" as never,
            href: "javascript:alert(1)" as never,
            listStyleType: "armenian" as never,
            listStart: 0 as never,
            tabStops: [
              { position: "1banana", alignment: "sideways" },
              { position: "-1pt", alignment: "left" },
            ] as never,
          }}
        >
          Text literals
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2.25,
            width: 3,
            height: 1,
            fontFamily: '"   "' as never,
            fontSize: -1 as never,
            lineHeight: 0 as never,
            paragraphSpacingBefore: -1 as never,
            listIndent: "initial" as never,
            letterSpacing: "initial" as never,
          }}
        >
          Whitespace font family
        </p>
        <p
          style={{
            position: "absolute",
            left: 4.25,
            top: 2.25,
            width: 3,
            height: 1,
            fontFamily: "Aptos $$$" as never,
          }}
        >
          Symbol font family
        </p>
      </>
    ));
    const invalidTextLiteralResult = await invalidTextLiteral.project();
    expect(invalidTextLiteralResult.ok).toBe(false);
    expect(
      invalidTextLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(31);
    expect(invalidTextLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "italic"'),
          help: expect.arrayContaining([expect.stringContaining("fontStyle")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "underline"'),
          help: expect.arrayContaining([expect.stringContaining("textDecorationLine")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "strike"'),
          help: expect.arrayContaining([expect.stringContaining("textDecorationLine")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "charSpacing"'),
          help: expect.arrayContaining([expect.stringContaining("letterSpacing")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "lineSpacing"'),
          help: expect.arrayContaining([expect.stringContaining("lineHeight")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "lineSpacingMultiple"'),
          help: expect.arrayContaining([expect.stringContaining("lineHeight")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "wrap"'),
          help: expect.arrayContaining([expect.stringContaining("whiteSpace")]),
        }),
      ]),
    );
    expect(invalidTextLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("color value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "fontFamily value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "fontSize value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "fontStyle value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "fontWeight value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "lineHeight value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "paragraphSpacingBefore value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "listIndent value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "letterSpacing value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textIndent value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textAlign value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textDecoration value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textDecorationLine value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textDecorationStyle value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textShadow value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "whiteSpace value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "wordBreak value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "overflowWrap value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "textTransform value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "direction value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "writingMode value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "verticalAlign value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("href value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "listStyleType value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "listStart value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "tabStops value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidHrefLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidHrefLiteral.slide({ name: "Invalid href literals" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 1,
            href: "https://" as never,
          }}
        >
          Empty https link
        </p>
        <span style={{ href: "mailto:" as never }}>empty mailto link</span>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2.25,
            width: 4,
            height: 1,
            href: " https://example.com" as never,
          }}
        >
          Leading whitespace https link
        </p>
        <span style={{ href: "mailto: deckjsx@example.com" as never }}>
          leading whitespace mailto link
        </span>
      </>
    ));
    const invalidHrefLiteralResult = await invalidHrefLiteral.project();
    expect(invalidHrefLiteralResult.ok).toBe(false);
    expect(
      invalidHrefLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(4);
    expect(invalidHrefLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining("href value is not part of the public authoring API"),
        }),
      ]),
    );

    const invalidFitLiteral = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidFitLiteral.slide({ name: "Invalid fit literals" }, () => (
      <>
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            objectFit: "none" as never,
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 3.25,
            top: 1,
            width: 2,
            height: 1,
            // @ts-expect-error runtime diagnostics still reject media fit when JS/casts bypass public types.
            fit: "scale-down" as never,
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 5.5,
            top: 1,
            width: 2,
            height: 1,
            objectFit: "stretch" as never,
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 1,
            top: 2.25,
            width: 2,
            height: 1,
            crop: { left: "70%", right: "40%" },
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 7.75,
            top: 1,
            width: 2,
            height: 1,
            // @ts-expect-error runtime diagnostics still reject transparency when JS/casts bypass public types.
            transparency: 35 as never,
            rounding: true as never,
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 4,
            height: 1,
            fit: "cover" as never,
          }}
        >
          Text fit literal
        </p>
      </>
    ));
    const invalidFitLiteralResult = await invalidFitLiteral.project();
    expect(invalidFitLiteralResult.ok).toBe(false);
    expect(
      invalidFitLiteralResult.diagnostics.items.filter(
        (item) => item.code === "E_COMPILE_INVALID_STYLE_VALUE",
      ),
    ).toHaveLength(4);
    expect(invalidFitLiteralResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "objectFit value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "fit"'),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "transparency"'),
          help: expect.arrayContaining([expect.stringContaining("opacity")]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
          message: expect.stringContaining('Style property "rounding"'),
          help: expect.arrayContaining([expect.stringContaining("borderRadius")]),
        }),
        expect.objectContaining({
          message: expect.stringContaining("crop value is not part of the public authoring API"),
        }),
      ]),
    );

    const invalidScriptFlagValues = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    invalidScriptFlagValues.slide({ name: "Invalid text script flag values" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 1,
            superscript: "yes" as never,
          }}
        >
          Invalid superscript
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 1,
            subscript: 1 as never,
          }}
        >
          Invalid subscript
        </p>
      </>
    ));
    const invalidScriptFlagValuesResult = await invalidScriptFlagValues.project();
    expect(invalidScriptFlagValuesResult.ok).toBe(false);
    expect(invalidScriptFlagValuesResult.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "superscript value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            "subscript value is not part of the public authoring API",
          ),
        }),
      ]),
    );

    const invalidScript = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidScript.slide({ name: "Invalid text script" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 1,
            superscript: true,
            subscript: true,
          }}
        >
          Script
        </p>
      </>
    ));
    const invalidScriptResult = await invalidScript.project();
    expect(invalidScriptResult.ok).toBe(false);
    expect(invalidScriptResult.diagnostics.items[0]?.message).toContain(
      " cannot be both superscript and subscript.",
    );
  });
});

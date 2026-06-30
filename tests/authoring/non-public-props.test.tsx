import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src/index.ts";

function diagnosticPaths(result: ReturnType<Deck["compile"]>, code: string): string[] {
  return result.diagnostics.items
    .filter((item) => item.code === code)
    .flatMap((item) => item.labels.map((label) => label.path));
}

describe("non-public authoring props", () => {
  test("reports non-public JSX props per prop while preserving public graph data", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <div
          // @ts-expect-error direct style props are not public authoring props.
          x={1}
          foo="bar"
          style={{ position: "absolute", top: 2, width: 4 }}
        >
          <p>kept</p>
        </div>
      </>
    ));

    const result = deck.compile();
    const nonPublicPaths = diagnosticPaths(result, "E_COMPILE_NON_PUBLIC_AUTHORING_PROP");
    const view = [...(result.graph?.nodes.values() ?? [])].find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );

    expect(result.ok).toBe(false);
    expect(nonPublicPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".props.x"),
        expect.stringContaining(".props.foo"),
      ]),
    );
    expect(view).toBeDefined();
    expect(result.graph?.styles.get(view?.styleRef ?? ("" as never))?.authored.style).toEqual({
      position: "absolute",
      top: 2,
      width: 4,
    });
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "authoring prop is not part of the public authoring API",
          message: expect.stringContaining("x is not part of the public authoring API"),
          help: expect.arrayContaining([
            expect.stringContaining("normal flow, flex, grid, or Template Areas"),
            expect.stringContaining('style={{ position: "absolute", left: 1, top: 1 }}'),
          ]),
        }),
      ]),
    );
  });

  test("reports x and y style keys that bypass TypeScript", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <div style={{ x: 1, y: 2, width: 4 } as never}>
          <p>kept</p>
        </div>
      </>
    ));

    const result = deck.compile();
    const nonPublicPaths = diagnosticPaths(result, "E_COMPILE_NON_PUBLIC_STYLE_PROP");

    expect(result.ok).toBe(false);
    expect(nonPublicPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".style.x"),
        expect.stringContaining(".style.y"),
      ]),
    );
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "style property is not part of the public authoring API",
          help: expect.arrayContaining([
            expect.stringContaining('position: "absolute"'),
            expect.stringContaining("left"),
            expect.stringContaining("top"),
          ]),
        }),
      ]),
    );
  });

  test("reports positioning style props without an explicit positioning mode", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          style: { display: "grid", gridTemplateAreas: ['"title"'] },
          areas: {
            title: { style: { gridArea: "title" } },
          },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <>
        <p style={{ left: 1, top: 1 } as never}>Ambiguous</p>
        <p style={{ position: "relative", left: 0.1 }}>Relative</p>
        <p style={{ position: "absolute", left: 1, top: 2 }}>Absolute</p>
        <h1 area={template.title} style={{ left: 1.1 }}>
          Template override
        </h1>
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, "E_COMPILE_POSITIONING_REQUIRES_POSITION")).toEqual([
      expect.stringContaining(".style.left"),
      expect.stringContaining(".style.top"),
      expect.stringContaining(".style.left"),
    ]);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "positioning style requires an explicit positioning mode",
          message: expect.stringContaining("left requires position"),
          help: expect.arrayContaining([
            expect.stringContaining('position: "absolute"'),
            expect.stringContaining('position: "relative"'),
            expect.stringContaining("Template Area"),
          ]),
        }),
      ]),
    );
  });

  test("does not treat an invalid area prop as a Template Area positioning override", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <h1 area={"title" as never} style={{ left: 1 } as never}>
        Invalid area
      </h1>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, "E_TEMPLATE_AREA_REF_INVALID")).toEqual([
      expect.stringContaining(".props.area"),
    ]);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_TEMPLATE_AREA_REF_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
      ]),
    );
    expect(diagnosticPaths(result, "E_COMPILE_POSITIONING_REQUIRES_POSITION")).toEqual([
      expect.stringContaining(".style.left"),
    ]);
  });

  test("reports deckjsx internal layout style keys that bypass TypeScript", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <div style={{ layout: "stack", direction: "vertical" } as never}>
        <p>kept</p>
      </div>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, "E_COMPILE_NON_PUBLIC_STYLE_PROP")).toEqual(
      expect.arrayContaining([expect.stringContaining(".style.layout")]),
    );
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Style property "layout"'),
          help: expect.arrayContaining([
            expect.stringContaining('display: "flex"'),
            expect.stringContaining('position: "absolute"'),
          ]),
        }),
      ]),
    );
  });

  test("reports common element/style mismatches with authoring guidance", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img src="logo.png" style={{ fontSize: 18 } as never} />
        <p style={{ objectFit: "cover" } as never}>Caption</p>
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Style property "fontSize"'),
          help: expect.arrayContaining([
            expect.stringContaining("fontSize belongs on text elements"),
          ]),
        }),
        expect.objectContaining({
          message: expect.stringContaining('Style property "objectFit"'),
          help: expect.arrayContaining([
            expect.stringContaining("objectFit belongs on media elements"),
          ]),
        }),
      ]),
    );
  });

  test("reports invalid className values instead of silently ignoring them", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <p className={1 as never}>Numeric class</p>
        <p className={"" as never}>Empty class</p>
        <p className={"   " as never}>Whitespace class</p>
        <div
          className={
            {
              selected: 1,
              kept: true,
              "": true,
              "   ": true,
              "bad class": true,
            } as never
          }
        >
          <p>Object class</p>
        </div>
        <img src="logo.png" className={["image", 2, "", "   "] as never} />
      </>
    ));

    const result = deck.compile();
    const invalidPaths = diagnosticPaths(result, "E_COMPILE_INVALID_CLASS_NAME_PROP");
    const invalidClassNameDiagnostics = result.diagnostics.items.filter(
      (item) => item.code === "E_COMPILE_INVALID_CLASS_NAME_PROP",
    );
    const view = [...(result.graph?.nodes.values() ?? [])].find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );
    const image = [...(result.graph?.nodes.values() ?? [])].find((node) => node.kind === "image");

    expect(result.ok).toBe(false);
    expect(invalidPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".props.className"),
        expect.stringContaining(".props.className.selected"),
        expect.stringContaining(".props.className[1]"),
        expect.stringContaining('.props.className[""]'),
        expect.stringContaining('.props.className["   "]'),
        expect.stringContaining('.props.className["bad class"]'),
        expect.stringContaining(".props.className[2]"),
        expect.stringContaining(".props.className[3]"),
      ]),
    );
    expect(invalidClassNameDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "className prop is not part of the public authoring API",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
      ]),
    );
    expect(result.graph?.styles.get(view?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "kept", index: 0 },
    ]);
    expect(result.graph?.styles.get(image?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "image", index: 0 },
    ]);
  });

  test("reports non-public slide declaration options per option", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Options", background: "red", x: 1 } as never, () => <p>slide</p>);

    const result = deck.compile();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "slide declaration option is not part of the public authoring API",
          message: expect.stringContaining("background is not part of the public authoring API"),
        }),
      ]),
    );
    expect(diagnosticPaths(result, "E_COMPILE_NON_PUBLIC_AUTHORING_PROP")).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".options.background"),
        expect.stringContaining(".options.x"),
      ]),
    );
  });

  test("validates supported prop values with prop-specific diagnostics", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: 12, template: 34 } as never, () => (
      <>
        <div style={null as never}>
          <shape shape={123 as never} />
          <img src={123 as never} />
          <img src={"" as never} />
          <img src={"   " as never} />
          {/* @ts-expect-error image source props are mutually exclusive in public TSX. */}
          <img src="a.png" data="data:image/png;base64,AA==" />
          <img data={"data:" as never} />
          <img data={"image.png" as never} />
          {/* @ts-expect-error image source is required by the public authoring type. */}
          <img />
          <video src={" " as never} poster={"" as never} />
          <video data={"clip.mp4" as never} posterData={"poster.png" as never} />
          {/* @ts-expect-error video source is required by the public authoring type. */}
          <video />
          <table>
            <tbody>
              <tr>
                <td colspan={0 as never}>Zero</td>
                <td rowspan={1.5 as never}>Fraction</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ));

    const result = deck.compile();
    expect(result.diagnostics.items.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_COMPILE_INVALID_SLIDE_NAME_OPTION",
        "E_COMPILE_INVALID_SLIDE_TEMPLATE_OPTION",
        "E_COMPILE_INVALID_STYLE_PROP",
        "E_COMPILE_INVALID_SHAPE_PROP",
        "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        "E_COMPILE_AMBIGUOUS_IMAGE_SOURCE_PROP",
        "E_COMPILE_VIDEO_SOURCE_INVALID",
        "E_COMPILE_VIDEO_POSTER_INVALID",
        "E_COMPILE_INVALID_TABLE_SPAN_PROP",
      ]),
    );
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_SLIDE_NAME_OPTION",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_SLIDE_TEMPLATE_OPTION",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("non-empty"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          message: expect.stringContaining("non-empty"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.poster") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_POSTER_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.poster") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          title: "image source is missing",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          title: "video source is missing",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("data URI"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.data") }),
          ]),
        }),
        expect.objectContaining({
          message: expect.stringContaining("data URI"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.posterData") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_SHAPE_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.shape") }),
          ]),
        }),
        expect.objectContaining({
          message: expect.stringContaining("positive integer"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.colspan") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_TABLE_SPAN_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.colspan") }),
          ]),
        }),
        expect.objectContaining({
          message: expect.stringContaining("positive integer"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.rowspan") }),
          ]),
        }),
      ]),
    );
  });

  test("rejects malformed inline data URI media types that bypass TypeScript", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img data={"data:image/,AAAA" as never} />
        <img data={"data:/png,AAAA" as never} />
        <video data={"data:video/,AAAA" as never} posterData={"data:image/,AAAA" as never} />
      </>
    ));

    const result = deck.compile();
    const mediaSourceDiagnostics = result.diagnostics.items.filter((item) =>
      [
        "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        "E_COMPILE_VIDEO_SOURCE_INVALID",
        "E_COMPILE_VIDEO_POSTER_INVALID",
      ].includes(item.code),
    );

    expect(result.ok).toBe(false);
    expect(mediaSourceDiagnostics).toHaveLength(4);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          message: expect.stringContaining("public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.data") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          message: expect.stringContaining("public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.data") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_POSTER_INVALID",
          message: expect.stringContaining("public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.posterData") }),
          ]),
        }),
      ]),
    );
  });

  test("rejects inline data URI payloads that start with whitespace when TypeScript is bypassed", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img data={"data:image/png;base64, AAAA" as never} />
        <video
          data={"data:video/mp4;base64, AAAA" as never}
          posterData={"data:image/png;base64, AAAA" as never}
        />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          message: expect.stringContaining("public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.data") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          message: expect.stringContaining("public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.data") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_POSTER_INVALID",
          message: expect.stringContaining("public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.posterData") }),
          ]),
        }),
      ]),
    );
  });

  test("rejects inline data URIs passed through path source props", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img src={"data:image/png;base64,AAAA" as never} />
        <video src={"data:video/mp4;base64,AAAA" as never} />
        <video src="clip.mp4" poster={"data:image/png;base64,AAAA" as never} />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_POSTER_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.poster") }),
          ]),
        }),
      ]),
    );
  });

  test("rejects path source props that start with whitespace when TypeScript is bypassed", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img src={" image.png" as never} />
        <video src={" clip.mp4" as never} poster={" poster.png" as never} />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_POSTER_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.poster") }),
          ]),
        }),
      ]),
    );
  });

  test("rejects media source URL schemes outside the public authoring API when TypeScript is bypassed", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img src={"ftp://example.test/image.png" as never} />
        <video src={"https://example.test/clip.mp4" as never} />
        <video src={"ftp://example.test/clip.mp4" as never} />
        <video src="clip.mp4" poster={"ftp://example.test/poster.png" as never} />
      </>
    ));

    const result = deck.compile();
    const mediaSourceDiagnostics = result.diagnostics.items.filter((item) =>
      [
        "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        "E_COMPILE_VIDEO_SOURCE_INVALID",
        "E_COMPILE_VIDEO_POSTER_INVALID",
      ].includes(item.code),
    );

    expect(result.ok).toBe(false);
    expect(mediaSourceDiagnostics).toHaveLength(4);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_SOURCE_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.src") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_COMPILE_VIDEO_POSTER_INVALID",
          message: expect.stringContaining("not part of the public authoring API"),
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".props.poster") }),
          ]),
        }),
      ]),
    );
  });

  test("accepts Windows drive paths as local media source paths", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <img src={"C:\\assets\\logo.png" as never} />
        <video src={"C:\\assets\\clip.mp4" as never} poster={"C:\\assets\\poster.png" as never} />
      </>
    ));

    const result = deck.compile();
    const mediaSourceDiagnostics = result.diagnostics.items.filter((item) =>
      [
        "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        "E_COMPILE_VIDEO_SOURCE_INVALID",
        "E_COMPILE_VIDEO_POSTER_INVALID",
      ].includes(item.code),
    );

    expect(mediaSourceDiagnostics).toEqual([]);
  });
});

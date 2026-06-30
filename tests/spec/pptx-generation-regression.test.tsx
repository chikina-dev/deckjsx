import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../helpers.ts";
import { isPptxRelationshipsPart, isPptxSupportPart } from "@/src/inspect.ts";
import type { PptxPackagePart, PptxRelationship } from "@/src/inspect.ts";
import { SAMPLE_SVG_DATA_URI, strFromU8, unzipSync, type Unzipped } from "../helpers.ts";

function zipEntry(zip: Unzipped, path: string): string {
  const content = zip[path];
  if (!content) {
    throw new Error(`Expected PPTX zip entry at ${path}.`);
  }

  return strFromU8(content);
}

function partPaths(parts: readonly PptxPackagePart[]): readonly string[] {
  return parts.map((part) => part.path).sort((left, right) => left.localeCompare(right));
}

function supportPartPayload(part: PptxPackagePart | undefined, kind: string) {
  if (part && isPptxSupportPart(part) && part.payload.kind === kind) {
    return part.payload;
  }

  throw new Error(`Expected support part payload kind "${kind}".`);
}

function relationshipsFor(part: PptxPackagePart | undefined): readonly PptxRelationship[] {
  if (part && isPptxRelationshipsPart(part)) {
    return part.payload.relationships;
  }

  throw new Error("Expected relationships part.");
}

describe("ADR 0006 PPTX generation regression spec", () => {
  test("rendered package preserves projected topology, relationships, media, and hyperlinks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Regression topology" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 0.5,
            top: 0.4,
            width: 3,
            height: 0.5,
            href: "https://example.com/spec",
          }}
        >
          Spec link
        </p>
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{ position: "absolute", left: 0.5, top: 1.2, width: 1, height: 1 }}
        />
      </>
    ));

    const project = await deck.project();
    const render = await deck.render();
    const projection = project.projection!;
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const emittedPaths = Object.keys(zip).filter(
      (path) => path !== "ppt/deckjsx/patch-manifest.json",
    );
    const contentTypesXml = zipEntry(zip, "[Content_Types].xml");
    const slideRelsXml = zipEntry(zip, "ppt/slides/_rels/slide1.xml.rels");

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(emittedPaths.sort((left, right) => left.localeCompare(right))).toEqual(
      partPaths(projection.parts),
    );
    expect(projection.parts.some((part) => part.kind === "media")).toBe(true);
    expect(contentTypesXml).toContain(
      'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"',
    );
    expect(slideRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"',
    );
    expect(slideRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"',
    );
    expect(slideRelsXml).toContain('TargetMode="External"');
    expect(slideRelsXml).toContain('Target="https://example.com/spec"');
  });

  test("template area anchors reach template-derived PPTX slide layout topology", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          style: {
            display: "grid",
            gridTemplateAreas: ['"title"', '"body"'],
            gridTemplateRows: ["0.7in", "1fr"],
            rowGap: 0.2,
            padding: 0.7,
          },
          areas: {
            title: { kind: "title", style: { gridArea: "title" } },
            body: { kind: "body", style: { gridArea: "body" } },
          },
        },
      },
    });
    deck.slide({ name: "Template regression", template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Template title</h1>
        <section area={template.body}>
          <p>Template body</p>
        </section>
      </>
    ));

    const project = await deck.project();
    const projection = project.projection!;
    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const templateLayout = projection.parts.find(
      (part) =>
        isPptxSupportPart(part) &&
        part.payload.kind === "slide-layout" &&
        part.payload.template?.name === "report",
    );
    const slideMaster = supportPartPayload(
      projection.parts.find(
        (part) => isPptxSupportPart(part) && part.payload.kind === "slide-master",
      ),
      "slide-master",
    );
    const slide = projection.slides[0];
    const slideRelationships = relationshipsFor(
      projection.parts.find((part) => part.path === "ppt/slides/_rels/slide1.xml.rels"),
    );

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(templateLayout).toMatchObject({
      path: "ppt/slideLayouts/slideLayout2.xml",
      payload: {
        layoutAnchors: expect.arrayContaining([
          expect.objectContaining({ area: "title", kind: "title" }),
          expect.objectContaining({ area: "body", kind: "body" }),
        ]),
      },
    });
    expect(slide).toMatchObject({ path: "ppt/slides/slide1.xml" });
    expect(slideRelationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPartId: templateLayout?.id,
          targetPath: "ppt/slideLayouts/slideLayout2.xml",
          type: "slideLayout",
        }),
      ]),
    );
    expect(slideMaster).toMatchObject({
      slideLayoutPartIds: expect.arrayContaining([templateLayout?.id]),
    });
    expect(zip["ppt/slideLayouts/slideLayout2.xml"]).toBeDefined();
    expect(zip["ppt/slideLayouts/_rels/slideLayout2.xml.rels"]).toBeDefined();
    expect(zipEntry(zip, "ppt/slideMasters/slideMaster1.xml")).toContain(
      '<p:sldLayoutId id="2147483649" r:id="rId1"/>',
    );
  });
});

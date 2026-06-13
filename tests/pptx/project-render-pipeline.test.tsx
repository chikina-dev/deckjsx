import { describe, expect, test } from "vite-plus/test";
import { pptx, type WriterAdapter } from "../../src/adapter.ts";
import { createDiagnostics } from "../../src/diagnostics/index.ts";
import { Deck, StyleSheet, Theme, type RenderInspectionSummary } from "../../src/index.ts";
import { isPptxMediaPart, isPptxSlidePart, isPptxSupportPart } from "../../src/inspect.ts";
import {
  PipelineArtifactCollection,
  type PptxPackageBuildArtifact,
} from "../../src/pipeline-artifacts.ts";
import { compileSource, projectSource, renderSource } from "../../src/pipeline-runner.ts";
import { withPackagePartFingerprints } from "../../src/projection/pptx/fingerprint.ts";
import {
  renderPptxPackage as renderPptxPackageBase,
  type PptxWriterContext,
  type PptxWriterOptions,
} from "../../src/writers/pptx.ts";
import type { AssetLoader } from "../../src/assets.ts";
import type {
  AssetEntityId,
  GraphNodeId,
  PackagePartId,
  PptxContentTypesPayload,
  PptxElementId,
  PptxMediaPartPayload,
  PptxPackageModel,
  PptxPackagePart,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSlideLayoutPartPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxSupportPartPayload,
  PptxThemePartPayload,
  SemanticAuthorGraph,
} from "../../src/inspect.ts";
import {
  expectPptxPart,
  expectPptxPartByPath,
  SAMPLE_SVG_DATA_URI,
  unzipSync,
} from "../helpers.ts";

function textNodeIdBy(graph: SemanticAuthorGraph, text: string): GraphNodeId | undefined {
  for (const node of graph.nodes.values()) {
    if (node.kind !== "text") {
      continue;
    }

    const inlineText = node.inlineChildren
      .map((childId) => graph.nodes.get(childId))
      .filter((child) => child?.kind === "textRun")
      .map((child) => child.text)
      .join("");

    if (inlineText === text) {
      return node.id;
    }
  }

  return undefined;
}

function localZipCompressionMethod(bytes: Uint8Array, path: string): number | undefined {
  const decoder = new TextDecoder();
  for (let offset = 0; offset < bytes.byteLength - 30; offset += 1) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x03 ||
      bytes[offset + 3] !== 0x04
    ) {
      continue;
    }

    const method = bytes[offset + 8]! | (bytes[offset + 9]! << 8);
    const nameLength = bytes[offset + 26]! | (bytes[offset + 27]! << 8);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    if (name === path) {
      return method;
    }
  }

  return undefined;
}

function slidePartPayload(part: PptxPackagePart): PptxSlidePart["payload"] {
  if (isPptxSlidePart(part)) {
    return part.payload;
  }

  throw new Error("Expected a slide part.");
}

function presentationPayload(part: PptxPackagePart) {
  if (isPptxSupportPart(part) && part.payload.kind === "presentation") {
    return part.payload;
  }

  throw new Error("Expected a presentation support part.");
}

function extendedDocumentPropertiesPayload(part: PptxPackagePart) {
  if (
    isPptxSupportPart(part) &&
    part.payload.kind === "document-properties" &&
    part.payload.propertyKind === "extended"
  ) {
    return part.payload;
  }

  throw new Error("Expected an extended document properties part.");
}

function slideMasterPayload(part: PptxPackagePart): PptxSlideMasterPartPayload {
  if (isPptxSupportPart(part) && part.payload.kind === "slide-master") {
    return part.payload;
  }

  throw new Error("Expected a slide master part.");
}

function slideLayoutPayload(part: PptxPackagePart): PptxSlideLayoutPartPayload {
  if (isPptxSupportPart(part) && part.payload.kind === "slide-layout") {
    return part.payload;
  }

  throw new Error("Expected a slide layout part.");
}

function themePayload(part: PptxPackagePart): PptxThemePartPayload {
  if (isPptxSupportPart(part) && part.payload.kind === "theme") {
    return part.payload;
  }

  throw new Error("Expected a theme part.");
}

function pngHeaderBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8,
    6,
    0,
    0,
    0,
  ]);
}

function dataUriFromBytes(mediaType: string, bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${mediaType};base64,${btoa(binary)}`;
}

function withFreshPackageFingerprints(projection: PptxPackageModel): PptxPackageModel {
  const parts = withPackagePartFingerprints(projection.parts);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  return {
    ...projection,
    parts,
    slides: projection.slides.map((slide) => {
      const part = partsById.get(slide.id);
      return part && isPptxSlidePart(part) ? part : slide;
    }),
  };
}

type TestPptxWriterResult = Awaited<ReturnType<typeof renderPptxPackageBase>> & {
  readonly buildArtifacts?: readonly PptxPackageBuildArtifact[];
};

async function renderPptxPackage(
  projection: PptxPackageModel,
  options?: PptxWriterOptions,
  context?: PptxWriterContext,
): Promise<TestPptxWriterResult> {
  let buildArtifacts: readonly PptxPackageBuildArtifact[] | undefined;
  const result = await renderPptxPackageBase(projection, options, {
    ...context,
    onBuildArtifacts: (artifacts) => {
      buildArtifacts = artifacts;
      context?.onBuildArtifacts?.(artifacts);
    },
  });

  return { ...result, ...(buildArtifacts ? { buildArtifacts } : {}) };
}

describe("project/render pipeline", () => {
  test("compile, project, and render return result-first stage shapes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "pptx" },
    });

    deck.slide({ name: "Pipeline" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 4, height: 2 }}>
          <p style={{ width: "100%", height: 0.5, fontSize: 24 }}>Hello pipeline</p>
        </div>
      </>
    ));

    const compile = deck.compile();
    expect(compile.ok).toBe(true);
    expect(compile.graph).toBeDefined();
    expect(compile.stages.compile.artifact).toBe("available");

    const project = await deck.project();
    expect(project.ok).toBe(true);
    expect(project.format).toBe("pptx");
    expect(project.projection?.format).toBe("pptx");
    expect(project.summary?.pptx.packageParts.length).toBeGreaterThan(0);
    expect(project.stages.compile.artifact).toBe("available");
    expect(project.stages.project.artifact).toBe("available");

    const parts = project.projection?.parts ?? [];
    const presentationPartSummary = project.summary?.parts.find(
      (part) => part.path === "ppt/presentation.xml",
    );
    expect(parts.some((part) => part.path === "[Content_Types].xml")).toBe(true);
    expect(parts.some((part) => part.path === "ppt/presentation.xml")).toBe(true);
    expect(parts.some((part) => part.path === "ppt/slides/slide1.xml")).toBe(true);
    expect(new Set(parts.map((part) => part.category))).toEqual(
      new Set(["authored-content", "manifest", "support"]),
    );
    expect(presentationPartSummary).toMatchObject({
      hasStructuredPayload: true,
      payloadKind: "presentation",
      requirement: expect.objectContaining({ status: "required", required: true }),
      orderKey: expect.objectContaining({ group: "presentation", path: "ppt/presentation.xml" }),
    });

    const firstElement = project.projection?.slides[0]?.payload.drawing.children[0];
    const nestedElement = firstElement?.kind === "group" ? firstElement.children[0] : undefined;
    const firstSlide = project.projection?.slides[0];
    const firstSummaryElement = project.summary?.slides[0]?.elements[0];
    expect(firstSlide?.id).not.toBe(firstSlide?.path);
    expect(firstElement?.id).not.toContain("ppt/slides/slide1");
    expect(firstElement?.serialized.shapeObjectId).toBe("1");
    expect(nestedElement?.serialized.shapeObjectId).toBe("1001");
    expect(firstElement?.measurement?.frame).toEqual(firstElement?.frame);
    expect(firstElement?.emissionTarget).toBe("slide");
    expect(firstElement?.paintOrderIndex).toBe(0);
    expect(firstElement?.paintOrder).toMatchObject({
      siblingOrder: 0,
      generatedLayerRole: "authored",
    });
    expect(firstSummaryElement).toMatchObject({
      id: firstElement?.id,
      emissionTarget: "slide",
      paintOrderIndex: 0,
      paintOrder: expect.objectContaining({ siblingOrder: 0, generatedLayerRole: "authored" }),
      measurement: firstElement?.measurement,
      resolvedValues: expect.objectContaining({ measurement: firstElement?.measurement }),
    });

    const render = await deck.render();
    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.mediaType).toContain("presentationml.presentation");
    expect(render.artifact?.extension).toBe("pptx");
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.stages.render.artifact).toBe("available");
    expect(render.summary?.assembly?.entryCount).toBeGreaterThan(0);
    expect(render.summary?.assembly?.missingCount).toBe(0);
  });

  test("render emits authored tables as native pptx table graphic frames", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Table" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 6, height: 2, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th colspan={2}>Metric</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Revenue</td>
              <td>$10M</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);

    expect(render.ok).toBe(true);
    expect(slideXml).toContain("<p:graphicFrame>");
    expect(slideXml).toContain('uri="http://schemas.openxmlformats.org/drawingml/2006/table"');
    expect(slideXml).toContain("<a:tbl>");
    expect(slideXml).toContain('gridSpan="2"');
    expect(slideXml).toContain('hMerge="1"');
    expect(slideXml).toContain("<a:t>Metric</a:t>");
    expect(slideXml).toContain("<a:t>Revenue</a:t>");
  });

  test("render projects rowspan with occupied grid cells in native pptx table XML", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Row span table" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 6, height: 2, tableLayout: "fixed" }}>
          <tbody>
            <tr>
              <td rowspan={2}>Region</td>
              <td>Q1</td>
            </tr>
            <tr>
              <td>Q2</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const project = await deck.project();
    const table = project.projection?.slides[0]?.payload.drawing.children[0];
    const firstRowFirstCell =
      table?.kind === "table" ? table.sections[0]?.rows[0]?.cells[0] : undefined;
    const secondRowFirstAuthoredCell =
      table?.kind === "table" ? table.sections[0]?.rows[1]?.cells[0] : undefined;
    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(firstRowFirstCell?.rowSpan).toBe(2);
    expect(secondRowFirstAuthoredCell?.text).toBe("Q2");
    expect(secondRowFirstAuthoredCell?.gridColumnIndex).toBe(1);
    expect(slideXml).toContain('rowSpan="2"');
    expect(slideXml).toContain('vMerge="1"');
    expect(slideXml.indexOf('vMerge="1"')).toBeLessThan(slideXml.indexOf("<a:t>Q2</a:t>"));
  });

  test("render sizes pptx table grid from every projected table row", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Row span expands columns" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 6, height: 2, tableLayout: "fixed" }}>
          <tbody>
            <tr>
              <td rowspan={2}>Region</td>
              <td>Q1</td>
            </tr>
            <tr>
              <td>Q2</td>
              <td>Q3</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);

    expect(render.ok).toBe(true);
    expect(slideXml.match(/<a:gridCol\b/g)?.length).toBe(3);
    expect(slideXml).toContain('vMerge="1"');
    expect(slideXml).toContain("<a:t>Q3</a:t>");
  });

  test("project preserves table cells and warns when rich cell content falls back to text-centric native table output", async () => {
    const image =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23ff0000%22%2F%3E%3C%2Fsvg%3E";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Rich cell" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 6, height: 2 }}>
          <tbody>
            <tr>
              <td>
                Revenue
                <img data={image} style={{ width: 0.2, height: 0.2 }} />
              </td>
              <td>$10M</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const project = await deck.project();
    const table = project.projection?.slides[0]?.payload.drawing.children[0];
    const firstCell = table?.kind === "table" ? table.sections[0]?.rows[0]?.cells[0] : undefined;

    expect(project.ok).toBe(true);
    expect(table?.kind).toBe("table");
    expect(firstCell?.text).toBe("Revenue");
    expect(firstCell?.children.some((child) => child.kind === "image")).toBe(true);
    expect(firstCell?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "content",
        property: "tableCell.children",
        value: "image",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["nativeTableStructure", "textContent"]),
          missing: expect.arrayContaining(["nativeRichCellContent"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "elementKind=table",
          "feature=content",
          "property=tableCell.children",
          "value=image",
          "fallbackMissing=nativeRichCellContent",
        ]),
      }),
    );
  });

  test("project reports table layout approximations as pptx diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Approximate table layout" }, () => (
      <>
        <table
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 1,
            tableLayout: "auto",
            borderCollapse: "collapse",
          }}
        >
          <tbody>
            <tr>
              <td>A</td>
              <td>B</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const project = await deck.project();
    const table = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(table?.kind).toBe("table");
    expect(table?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "tableLayout",
        value: "auto",
      }),
    );
    expect(table?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "borderCollapse",
        value: "collapse",
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "elementKind=table",
          "feature=layout",
          "property=tableLayout",
          "value=auto",
          "fallbackMissing=browserAutoTableLayout",
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "elementKind=table",
          "feature=layout",
          "property=borderCollapse",
          "value=collapse",
          "fallbackMissing=cssBorderConflictResolution",
        ]),
      }),
    );
  });

  test("project reports unset table layout as an auto-layout approximation", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unset table layout" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 4, height: 1 }}>
          <tbody>
            <tr>
              <td>A</td>
              <td>B</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const project = await deck.project();
    const table = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(table?.kind).toBe("table");
    expect(table?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "tableLayout",
        value: "auto",
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "elementKind=table",
          "feature=layout",
          "property=tableLayout",
          "value=auto",
          "fallbackMissing=browserAutoTableLayout",
        ]),
      }),
    );
  });

  test("render projects table cell fill, border, padding, and text style into native table XML", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Styled table" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 4, height: 1 }}>
          <tbody>
            <tr>
              <td
                style={{
                  backgroundColor: "#112233",
                  border: "1pt solid #445566",
                  color: "#FFFFFF",
                  fontWeight: "bold",
                  textAlign: "center",
                  verticalAlign: "middle",
                  padding: 0.1,
                }}
              >
                Styled
              </td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);

    expect(render.ok).toBe(true);
    expect(slideXml).toContain("<a:tcPr");
    expect(slideXml).toContain('anchor="ctr"');
    expect(slideXml).toContain('marL="91440"');
    expect(slideXml).toContain('<a:solidFill><a:srgbClr val="112233"/></a:solidFill>');
    expect(slideXml).toContain("<a:lnL");
    expect(slideXml).toContain('<a:srgbClr val="445566"/>');
    expect(slideXml).toContain('algn="ctr"');
    expect(slideXml).toContain('b="1"');
    expect(slideXml).toContain('<a:srgbClr val="FFFFFF"/>');
  });

  test("project and render expose structured table style support payload", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Table styles" }, () => (
      <>
        <table style={{ x: 1, y: 1, width: 4, height: 1 }}>
          <thead>
            <tr>
              <th>Header</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Body</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const project = await deck.project();
    const tableStylesPart = expectPptxPart(project.projection?.parts ?? [], "table-styles");
    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const tableStylesXml = new TextDecoder().decode(zip["ppt/tableStyles.xml"]);

    expect(project.ok).toBe(true);
    expect(tableStylesPart.payload).toMatchObject({
      kind: "table-styles",
      editable: true,
      defaultStyleId: "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}",
      slots: expect.objectContaining({
        wholeTable: expect.objectContaining({
          status: "supported",
          fill: expect.objectContaining({ themeReference: "bg1" }),
          text: expect.objectContaining({ themeReference: "tx1" }),
        }),
        headerRow: expect.objectContaining({
          status: "supported",
          text: expect.objectContaining({ bold: true }),
        }),
        firstColumn: expect.objectContaining({ status: "placeholder" }),
        bandedRows: expect.objectContaining({ status: "placeholder" }),
      }),
    });
    expect(render.ok).toBe(true);
    expect(tableStylesXml).toContain("<a:tblStyleLst");
    expect(tableStylesXml).toContain("<a:tblStyle ");
    expect(tableStylesXml).toContain("<a:wholeTbl>");
    expect(tableStylesXml).toContain("<a:firstRow>");
    expect(tableStylesXml).toContain("<a:band1H>");
    expect(tableStylesXml).not.toContain("</a:fontRef><a:schemeClr");
    expect(tableStylesXml).not.toContain("<a:solidFill/>");
  });

  test("project and render expose structured default text style support payload", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Default text style" }, () => <></>);

    const project = await deck.project();
    const presentationPart = expectPptxPart(project.projection?.parts ?? [], "presentation");
    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const presentationXml = new TextDecoder().decode(zip["ppt/presentation.xml"]);

    expect(project.ok).toBe(true);
    expect(presentationPart.payload).toMatchObject({
      kind: "presentation",
      defaultTextStyle: expect.objectContaining({
        source: "themeProjection",
        levels: expect.arrayContaining([
          expect.objectContaining({
            level: 1,
            colorThemeReference: "tx1",
            latinTypeface: "+mn-lt",
          }),
        ]),
      }),
    });
    expect(
      presentationPart.payload.kind === "presentation"
        ? presentationPart.payload.defaultTextStyle.levels.length
        : undefined,
    ).toBe(9);
    expect(render.ok).toBe(true);
    expect(presentationXml).toContain("<p:defaultTextStyle>");
    expect(presentationXml).toContain('<a:schemeClr val="tx1"/>');
    expect(presentationXml).toContain('<a:latin typeface="+mn-lt"/>');
  });

  test("project assigns deterministic package part order keys", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Order" }, () => <></>);

    const project = await deck.project();
    const parts = project.projection?.parts ?? [];
    const orderedPaths = [...parts]
      .sort((a, b) => (a.orderKey?.value ?? "").localeCompare(b.orderKey?.value ?? ""))
      .map((part) => part.path);

    expect(project.ok).toBe(true);
    expect(parts.every((part) => typeof part.orderKey?.value === "string")).toBe(true);
    expect(parts.find((part) => part.path === "[Content_Types].xml")?.orderKey).toMatchObject({
      group: "contentTypes",
      groupOrder: 0,
      sequence: 0,
      path: "[Content_Types].xml",
    });
    expect(parts.find((part) => part.path === "ppt/slides/slide1.xml")?.orderKey).toMatchObject({
      group: "slide",
      groupOrder: 80,
      path: "ppt/slides/slide1.xml",
    });
    expect(parts.every((part) => part.requirement?.status)).toBe(true);
    expect(parts.every((part) => typeof part.requirement?.required === "boolean")).toBe(true);
    expect(parts.every((part) => typeof part.fingerprint === "string")).toBe(true);
    expect(parts.find((part) => part.path === "[Content_Types].xml")?.requirement).toMatchObject({
      status: "required",
      required: true,
      condition: "minimalPackage",
    });
    expect(
      parts.find((part) => part.path === "ppt/slides/_rels/slide1.xml.rels")?.requirement,
    ).toMatchObject({ status: "conditional", required: true, condition: "hasRelationships" });
    expect(
      parts.find((part) => part.path === "ppt/slides/slide1.xml")?.dependencyFingerprints,
    ).toContainEqual(
      expect.objectContaining({
        packagePartId: parts.find((part) => part.path === "ppt/slideLayouts/slideLayout1.xml")?.id,
      }),
    );
    expect(
      parts.find((part) => part.path === "ppt/presentation.xml")?.dependencyFingerprints,
    ).toContainEqual(
      expect.objectContaining({
        packagePartId: parts.find((part) => part.path === "ppt/_rels/presentation.xml.rels")?.id,
      }),
    );
    expect(
      parts.find((part) => part.path === "ppt/slideMasters/slideMaster1.xml")
        ?.dependencyFingerprints,
    ).toContainEqual(
      expect.objectContaining({
        packagePartId: parts.find(
          (part) => part.path === "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        )?.id,
      }),
    );
    expect(orderedPaths).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "docProps/app.xml",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/theme/theme1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      "ppt/viewProps.xml",
      "ppt/presProps.xml",
      "ppt/tableStyles.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/_rels/slide1.xml.rels",
    ]);
  });

  test("project inspection summarizes generated stroke layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Generated stroke inspection" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${SAMPLE_SVG_DATA_URI}")`,
            outline: "2pt solid #FF0000",
          }}
        />
        <p
          style={{
            x: 1,
            y: 2,
            width: 2,
            height: 0.5,
            borderTop: "1pt solid #111111",
            borderRight: "2pt dashed #222222",
          }}
        >
          Borders
        </p>
      </>
    ));

    const project = await deck.project({ inspection: "details" });
    const [view, text] = project.projection?.slides[0]?.payload.drawing.children ?? [];
    const [viewSummary, textSummary] = project.summary?.slides[0]?.elements ?? [];
    const generatedEntries =
      project.summary?.details?.composedPaintOrder[0]?.entries.filter(
        (entry) => entry.source === "generatedStroke",
      ) ?? [];
    const elementBackgroundEntries =
      project.summary?.details?.composedPaintOrder[0]?.entries.filter(
        (entry) => entry.source === "backgroundLayer" && entry.elementId === view?.id,
      ) ?? [];

    expect(project.ok).toBe(true);
    expect(view?.kind).toBe("group");
    expect(text?.kind).toBe("text");
    if (!view || view.kind !== "group" || !text || text.kind !== "text") {
      throw new Error("Expected projected group and text nodes.");
    }

    expect(viewSummary).toMatchObject({
      id: view.id,
      backgroundLayers: expect.any(Array),
      outline: view.outline,
      generatedStrokes: view.generatedStrokes,
      resolvedValues: expect.objectContaining({
        backgroundLayers: expect.any(Array),
        outline: view.outline,
        generatedStrokes: view.generatedStrokes,
      }),
    });
    expect(view.backgroundLayers?.[0]?.kind).toBe("background-image");
    expect(
      view.backgroundLayers?.[0]?.kind === "background-image"
        ? view.backgroundLayers[0].objectPosition
        : undefined,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(viewSummary?.backgroundLayers?.[0]?.kind).toBe("background-image");
    expect(
      viewSummary?.backgroundLayers?.[0]?.kind === "background-image"
        ? viewSummary.backgroundLayers[0].objectPosition
        : undefined,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(elementBackgroundEntries).toEqual([
      expect.objectContaining({
        elementId: view.id,
        kind: "group",
        backgroundLayerIndex: 0,
        backgroundLayer: viewSummary?.backgroundLayers?.[0],
        frame: viewSummary?.backgroundLayers?.[0]?.frame,
        paintOrder: expect.objectContaining({ generatedLayerRole: "background" }),
      }),
    ]);
    expect(viewSummary?.generatedStrokes?.map((layer) => layer.role)).toEqual(["outline"]);
    expect(viewSummary?.generatedStrokes?.[0]?.paintOrder.generatedLayerRole).toBe("outline");

    expect(textSummary).toMatchObject({
      id: text.id,
      edgeStrokes: text.edgeStrokes,
      generatedStrokes: text.generatedStrokes,
      resolvedValues: expect.objectContaining({
        edgeStrokes: text.edgeStrokes,
        generatedStrokes: text.generatedStrokes,
      }),
    });
    expect(textSummary?.generatedStrokes?.map((layer) => layer.edge)).toEqual(["top", "right"]);
    expect(
      textSummary?.generatedStrokes?.map((layer) => layer.paintOrder.generatedLayerRole),
    ).toEqual(["border", "border"]);
    expect(generatedEntries.map((entry) => entry.generatedStroke?.role)).toEqual([
      "outline",
      "border",
      "border",
    ]);
    expect(generatedEntries.map((entry) => entry.generatedLayerIndex)).toEqual([0, 0, 1]);
    expect(generatedEntries.map((entry) => entry.paintOrder?.generatedLayerRole)).toEqual([
      "outline",
      "border",
      "border",
    ]);
    expect(generatedEntries[0]).toEqual(
      expect.objectContaining({
        elementId: view.id,
        frame: view.generatedStrokes?.[0]?.frame,
        generatedStroke: view.generatedStrokes?.[0],
      }),
    );
  });

  test("project can skip inspection summary while preserving projection result shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "No project summary" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Projected</p>
    ));

    const project = await deck.project({ inspection: "none" });

    expect(project.ok).toBe(true);
    expect(project.projection?.format).toBe("pptx");
    expect(project.summary).toBeUndefined();
    expect(project.stages.project.artifact).toBe("available");
  });

  test("project derives detailed composed paint order only when requested", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Detailed inspection" }, () => (
      <div style={{ x: 1, y: 1, width: 4, height: 2, zIndex: 2 }}>
        <p style={{ x: 0.25, y: 0.25, width: 2, height: 0.5, fontSize: 18, zIndex: 3 }}>
          Nested detail
        </p>
      </div>
    ));

    const summaryProject = await deck.project();
    const detailedProject = await deck.project({ inspection: "details" });
    const entries = detailedProject.summary?.details?.composedPaintOrder[0]?.entries ?? [];
    const styleEntries =
      detailedProject.summary?.details?.effectiveProjectedStyles[0]?.entries ?? [];
    const groupEntry = entries.find((entry) => entry.kind === "group");
    const textEntry = entries.find((entry) => entry.kind === "text");
    const textStyleEntry = styleEntries.find((entry) => entry.kind === "text");

    expect(summaryProject.ok).toBe(true);
    expect(summaryProject.summary?.details).toBeUndefined();
    expect(detailedProject.ok).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(groupEntry).toEqual(
      expect.objectContaining({
        source: "drawingNode",
        depth: 0,
        siblingPath: [0],
        paintOrder: expect.objectContaining({ zIndex: 2 }),
      }),
    );
    expect(textEntry).toEqual(
      expect.objectContaining({
        source: "drawingNode",
        parentElementId: groupEntry?.elementId,
        depth: 1,
        siblingPath: [0, 0],
        paintOrder: expect.objectContaining({ zIndex: 3 }),
      }),
    );
    expect(styleEntries.length).toBeGreaterThanOrEqual(2);
    expect(textStyleEntry).toEqual(
      expect.objectContaining({
        parentElementId: groupEntry?.elementId,
        depth: 1,
        siblingPath: [0, 0],
        paintOrder: expect.objectContaining({ zIndex: 3 }),
        values: expect.objectContaining({
          frame: expect.objectContaining({ widthEmu: expect.any(Number) }),
          textStyle: expect.objectContaining({ fontSizePt: 18 }),
          zIndex: 3,
        }),
      }),
    );
  });

  test("project derives detailed paint fallback aggregation only when requested", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Paint fallback aggregation" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 3,
          height: 2,
          background: `url("/public/texture.png")`,
          backgroundRepeat: "space",
          filter: "blur(2px)",
        }}
      />
    ));

    const summaryProject = await deck.project();
    const detailedProject = await deck.project({ inspection: "details" });
    const fallbackEntries =
      detailedProject.summary?.details?.paintFallbackAggregation.entries ?? [];
    const backgroundFallback = fallbackEntries.find(
      (entry) => entry.feature === "background" && entry.property === "background",
    );
    const filterFallback = fallbackEntries.find(
      (entry) => entry.feature === "filter" && entry.property === "filter",
    );

    expect(summaryProject.ok).toBe(true);
    expect(summaryProject.summary?.details).toBeUndefined();
    expect(detailedProject.ok).toBe(true);
    expect(backgroundFallback).toEqual(
      expect.objectContaining({
        fallbackStrategy: "preserveAuthoredValueOnly",
        count: 1,
        slidePartIds: [detailedProject.projection?.slides[0]?.id],
        slideIds: [detailedProject.projection?.slides[0]?.payload.slideId],
        kinds: ["group"],
        values: [`url("/public/texture.png")`],
        preserves: expect.arrayContaining(["authoredBackgroundInput"]),
        missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        recordIndexes: expect.arrayContaining([expect.any(Number)]),
      }),
    );
    expect(filterFallback).toEqual(
      expect.objectContaining({
        fallbackStrategy: "dropFilterEffect",
        count: 1,
        kinds: ["group"],
        values: ["blur(2px)"],
        preserves: expect.arrayContaining(["authoredFilter"]),
        missing: expect.arrayContaining(["filterEffect"]),
      }),
    );
  });

  test("render can skip inspection summary while preserving artifact result shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "No render summary" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Rendered</p>
    ));

    const render = await deck.render({ inspection: "none" });

    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.summary).toBeUndefined();
    expect(render.stages.render.artifact).toBe("available");
  });

  test("render details do not eagerly expose project-derived inspection views", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render detail boundary" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2, zIndex: 5 }}>
        <p style={{ x: 0.25, y: 0.25, width: 2, height: 0.5, fontSize: 18 }}>Rendered detail</p>
      </div>
    ));

    const render = await deck.render({ inspection: "details" });
    const summary = render.summary as RenderInspectionSummary | undefined;

    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(summary?.assembly).toBeDefined();
    expect(Object.hasOwn(summary ?? {}, "details")).toBe(false);
  });

  test("direct writer reports missing required assembly entries from package requirements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing media" }, () => (
      <>
        <img
          src="/public/missing.png"
          style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = projection.parts.find((part) => part.kind === "media");
    const slideRelationshipPart = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );

    expect(mediaPart?.requirement).toMatchObject({
      status: "conditional",
      required: true,
      condition: "referencedByRelationship",
      dependencies: [slideRelationshipPart?.id],
    });
    expect(slideRelationshipPart?.requirement).toMatchObject({
      status: "conditional",
      required: true,
      condition: "hasRelationships",
      dependencies: expect.arrayContaining([mediaPart?.id]),
    });

    const render = await renderPptxPackage(projection);
    const assemblyDiagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_PACKAGE_ASSEMBLY_FAILED",
    );
    const mediaDiagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_MEDIA_LOAD_FAILED",
    );

    expect(render.artifact).toBeUndefined();
    expect(mediaDiagnostic).toMatchObject({
      code: "E_RENDER_MEDIA_LOAD_FAILED",
      labels: [
        expect.objectContaining({ path: "ppt/media/media1.png", message: "/public/missing.png" }),
      ],
    });
    expect(assemblyDiagnostic).toMatchObject({ code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED" });
    expect(assemblyDiagnostic?.labels).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.png",
        message: "conditional package entry is missing: mediaBytesMissing",
      }),
    );
    expect(
      assemblyDiagnostic?.notes?.some((note) => note.includes("packagePartId=pptx:media:")),
    ).toBe(true);
    expect(
      assemblyDiagnostic?.notes?.some(
        (note) =>
          note.includes("path=ppt/media/media1.png") &&
          note.includes("requirement=conditional") &&
          note.includes("required=true") &&
          note.includes(`requirementReason=${mediaPart?.requirement?.reason}`) &&
          note.includes("reason=mediaBytesMissing"),
      ),
    ).toBe(true);
    expect(
      assemblyDiagnostic?.help?.some((item) => item.includes("render.summary.assembly.entries")),
    ).toBe(true);
    expect(render.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.png",
        status: "missing",
        requirement: "conditional",
        required: true,
        requirementCondition: "referencedByRelationship",
        requirementDependencies: [slideRelationshipPart?.id],
        requirementReason: mediaPart?.requirement?.reason,
        reason: "mediaBytesMissing",
        expected: expect.objectContaining({
          path: "ppt/media/media1.png",
          requirement: "conditional",
          required: true,
          requirementReason: mediaPart?.requirement?.reason,
        }),
        reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        final: expect.objectContaining({
          status: "missing",
          reason: "mediaBytesMissing",
          reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        }),
      }),
    );
  });

  test("direct writer keeps missing optional assembly entries non-blocking", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Optional media" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>optional still renders</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const optionalMediaPartId = "pptx:test:optional-media" as PackagePartId;
    const optionalMediaPath = "ppt/media/optional.png";
    const render = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: [
          ...projection.parts.map((part) =>
            part.kind === "content-types"
              ? {
                  ...part,
                  payload: {
                    ...(part.payload as PptxContentTypesPayload),
                    defaults: [
                      ...((part.payload as PptxContentTypesPayload).defaults ?? []),
                      { extension: "png", contentType: "image/png" },
                    ],
                  } satisfies PptxContentTypesPayload,
                }
              : part,
          ),
          {
            id: optionalMediaPartId,
            category: "authored-content",
            kind: "media",
            path: optionalMediaPath,
            orderKey: {
              group: "media",
              groupOrder: 90,
              sequence: 999,
              path: optionalMediaPath,
              value: `090:000999:${optionalMediaPath}`,
            },
            fingerprint: "test:optional-media",
            requirement: {
              status: "optional",
              required: false,
              reason: "optional media part is not referenced by any drawing relationship",
            },
            payload: {
              source: { kind: "path", path: "/public/optional-missing.png" },
              sources: [{ kind: "path", path: "/public/optional-missing.png" }],
            },
          },
        ],
      }),
    );

    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.diagnostics.hasErrors).toBe(false);
    expect(render.diagnostics.items).not.toContainEqual(
      expect.objectContaining({ code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED" }),
    );
    expect(render.summary?.assembly).toMatchObject({ failedCount: 0, missingCount: 1 });
    expect(render.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: optionalMediaPath,
        packagePartId: optionalMediaPartId,
        status: "missing",
        requirement: "optional",
        required: false,
        reason: "mediaBytesMissing",
        expected: expect.objectContaining({
          path: optionalMediaPath,
          packagePartId: optionalMediaPartId,
          requirement: "optional",
          required: false,
        }),
        reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        final: expect.objectContaining({
          status: "missing",
          reason: "mediaBytesMissing",
          reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        }),
      }),
    );
    expect(render.buildArtifacts?.some((artifact) => artifact.path === optionalMediaPath)).toBe(
      false,
    );
    expect(
      unzipSync(render.artifact?.bytes ?? new Uint8Array())[optionalMediaPath],
    ).toBeUndefined();
  });

  test("render reuses matching package part build artifacts on warm path without leaking artifacts into summary", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Warm path" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>warm</p>
      </>
    ));

    const cold = await deck.render();
    const warm = await deck.render();

    expect(cold.ok).toBe(true);
    expect(cold.summary?.assembly?.rebuiltCount).toBeGreaterThan(0);
    expect(cold.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "missingArtifact",
        status: "rebuilt",
        build: expect.objectContaining({
          partFingerprint: expect.stringMatching(/^fnv1a32:/),
          writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          emitterFingerprint: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          dependencyFingerprintCount: expect.any(Number),
          diagnosticCodes: [],
        }),
      }),
    );
    expect(warm.ok).toBe(true);
    expect(warm.summary?.assembly?.reusedCount).toBeGreaterThan(0);
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "buildArtifactFingerprintMatched",
        status: "reused",
        expected: expect.objectContaining({
          path: "ppt/slides/slide1.xml",
        }),
        final: expect.objectContaining({
          status: "reused",
          reason: "buildArtifactFingerprintMatched",
          reasonDetails: expect.objectContaining({
            kind: "buildArtifactFingerprintMatched",
            matchedBuild: expect.objectContaining({
              partFingerprint: expect.stringMatching(/^fnv1a32:/),
            }),
          }),
        }),
        reasonDetails: expect.objectContaining({
          kind: "buildArtifactFingerprintMatched",
          matchedBuild: expect.objectContaining({
            writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          }),
        }),
        build: expect.objectContaining({
          partFingerprint: expect.stringMatching(/^fnv1a32:/),
          writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          emitterFingerprint: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          dependencyFingerprintCount: expect.any(Number),
          diagnosticCodes: [],
        }),
      }),
    );
    const warmAssemblyEntries = warm.summary?.assembly?.entries ?? [];
    expect(warmAssemblyEntries.length).toBeGreaterThan(0);
    for (const entry of warmAssemblyEntries) {
      expect(entry).not.toHaveProperty("bytes");
      expect(entry).not.toHaveProperty("buildArtifact");
      expect(entry).not.toHaveProperty("zipEntry");
      expect(entry.expected).not.toHaveProperty("part");
      expect(entry.final).not.toHaveProperty("bytes");
      expect(entry.build).not.toHaveProperty("bytes");
    }
  });

  test("render explains rebuilds when a defined projection changes a package part fingerprint", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Original" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>same bytes</p>
      </>
    ));

    const cold = await deck.render();
    const projection = (await deck.project()).projection!;
    const changedSlideParts = projection.slides.map((slide) => ({
      ...slide,
      payload: { ...slide.payload, name: "Changed metadata" },
    }));
    const changedProjection = withFreshPackageFingerprints({
      ...projection,
      slides: changedSlideParts,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? (changedSlideParts.find((slide) => slide.id === part.id) ?? part)
          : part,
      ),
    });

    deck.defineProjection(changedProjection);
    const changed = await deck.render();
    const coldSlideBuild = cold.summary?.assembly?.entries.find(
      (entry) => entry.path === "ppt/slides/slide1.xml",
    )?.build;

    expect(cold.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(coldSlideBuild?.partFingerprint).toMatch(/^fnv1a32:/);
    expect(changed.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "partFingerprintChanged",
        status: "rebuilt",
        previousBuild: expect.objectContaining({
          partFingerprint: coldSlideBuild?.partFingerprint,
          writerFingerprint: coldSlideBuild?.writerFingerprint,
          emitterFingerprint: coldSlideBuild?.emitterFingerprint,
        }),
        reasonDetails: expect.objectContaining({
          kind: "partFingerprintChanged",
          partFingerprint: {
            previous: coldSlideBuild?.partFingerprint,
            current: expect.not.stringMatching(coldSlideBuild?.partFingerprint ?? ""),
          },
        }),
        build: expect.objectContaining({
          partFingerprint: expect.not.stringMatching(coldSlideBuild?.partFingerprint ?? ""),
          writerFingerprint: coldSlideBuild?.writerFingerprint,
          emitterFingerprint: coldSlideBuild?.emitterFingerprint,
        }),
      }),
    );
  });

  test("render invalidates owner XML when its relationship part fingerprint changes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship dependency" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>relationship dependency</p>
      </>
    ));

    const cold = await deck.render();
    const projection = (await deck.project()).projection!;
    const presentationRelationshipsPart = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const changedPresentationRelationshipId =
      "rIdModelChangedSlideMaster" as PptxRelationship["id"];
    const changedProjection = withFreshPackageFingerprints({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id === presentationRelationshipsPart?.id) {
          const relationships = (
            part.relationships ??
            (part.payload as PptxRelationshipsPayload | undefined)?.relationships ??
            []
          ).map((relationship) =>
            relationship.type === "slideMaster"
              ? { ...relationship, id: changedPresentationRelationshipId }
              : relationship,
          );
          return {
            ...part,
            relationships,
            payload: { relationships } satisfies PptxRelationshipsPayload,
          };
        }

        return part;
      }),
    });

    deck.defineProjection(changedProjection);
    const changed = await deck.render();
    const zip = unzipSync(changed.artifact?.bytes ?? new Uint8Array());
    const presentationXml = new TextDecoder().decode(
      zip["ppt/presentation.xml"] ?? new Uint8Array(),
    );
    const coldPresentationBuild = cold.summary?.assembly?.entries.find(
      (entry) => entry.path === "ppt/presentation.xml",
    )?.build;
    const changedPresentationEntry = changed.summary?.assembly?.entries.find(
      (entry) => entry.path === "ppt/presentation.xml",
    );

    expect(cold.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(coldPresentationBuild?.dependencyFingerprints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packagePartId: presentationRelationshipsPart?.id,
          fingerprint: expect.stringMatching(/^fnv1a32:/),
        }),
      ]),
    );
    expect(changed.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/presentation.xml",
        reason: "dependencyFingerprintChanged",
        status: "rebuilt",
        previousBuild: expect.objectContaining({
          dependencyFingerprints: coldPresentationBuild?.dependencyFingerprints,
        }),
        reasonDetails: expect.objectContaining({
          kind: "dependencyFingerprintChanged",
          dependencyFingerprints: expect.objectContaining({
            previous: coldPresentationBuild?.dependencyFingerprints,
            current: expect.any(Array),
          }),
        }),
        build: expect.objectContaining({ dependencyFingerprints: expect.any(Array) }),
      }),
    );
    expect(changedPresentationEntry?.build?.dependencyFingerprints).not.toEqual(
      coldPresentationBuild?.dependencyFingerprints,
    );
    expect(presentationXml).toContain(`r:id="${changedPresentationRelationshipId}"`);
  });

  test("direct writer invalidates build artifacts when the part emitter fingerprint changes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Emitter fingerprint" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>emitter</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const staleArtifacts = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [
        artifact.packagePartId,
        artifact.path === "ppt/slides/slide1.xml"
          ? { ...artifact, emitterFingerprint: "test:old-slide-emitter" }
          : artifact,
      ]),
    );
    const warm = await renderPptxPackage(
      projection,
      {},
      { pptxBuildArtifactsByPartId: staleArtifacts },
    );

    expect(cold.artifact).toBeDefined();
    expect(
      cold.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml")
        ?.emitterFingerprint,
    ).toMatch(/^deckjsx:pptx-emitter:slide:/);
    expect(
      cold.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml"),
    ).toMatchObject({
      buildNotes: [
        expect.objectContaining({
          kind: "packagePartBytesBuilt",
          reason: "missingArtifact",
          partKind: "slide",
          byteLength: expect.any(Number),
          partFingerprint: expect.stringMatching(/^fnv1a32:/),
          writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          emitterFingerprint: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          dependencyFingerprintCount: expect.any(Number),
          diagnosticCodes: [],
        }),
      ],
    });
    expect(warm.artifact).toBeDefined();
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "emitterFingerprintChanged",
        status: "rebuilt",
        reasonDetails: expect.objectContaining({
          kind: "emitterFingerprintChanged",
          emitterFingerprint: expect.objectContaining({
            previous: "test:old-slide-emitter",
            current: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          }),
        }),
      }),
    );
    expect(
      warm.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml"),
    ).toMatchObject({
      buildNotes: [
        expect.objectContaining({
          kind: "packagePartBytesBuilt",
          reason: "emitterFingerprintChanged",
          partKind: "slide",
        }),
      ],
    });
  });

  test("direct writer records document property emitter fingerprints at core and app granularity", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "DocProps emitter" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>docprops</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const coreArtifact = cold.buildArtifacts?.find(
      (artifact) => artifact.path === "docProps/core.xml",
    );
    const appArtifact = cold.buildArtifacts?.find(
      (artifact) => artifact.path === "docProps/app.xml",
    );

    expect(coreArtifact?.emitterFingerprint).toMatch(/^deckjsx:pptx-emitter:docprops-core:/);
    expect(appArtifact?.emitterFingerprint).toMatch(/^deckjsx:pptx-emitter:docprops-app:/);
    expect(coreArtifact?.emitterFingerprint).not.toBe(appArtifact?.emitterFingerprint);
  });

  test("direct writer records relationship emitter fingerprints by owner path family", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship emitters" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>relationships</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const emitterFingerprintByPath = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [artifact.path, artifact.emitterFingerprint]),
    );

    expect(emitterFingerprintByPath.get("_rels/.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-root:/,
    );
    expect(emitterFingerprintByPath.get("ppt/_rels/presentation.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-presentation:/,
    );
    expect(emitterFingerprintByPath.get("ppt/slides/_rels/slide1.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-slide:/,
    );
    expect(emitterFingerprintByPath.get("ppt/slideMasters/_rels/slideMaster1.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-slide-master:/,
    );
    expect(emitterFingerprintByPath.get("ppt/slideLayouts/_rels/slideLayout1.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-slide-layout:/,
    );
    expect(
      new Set([
        emitterFingerprintByPath.get("_rels/.rels"),
        emitterFingerprintByPath.get("ppt/_rels/presentation.xml.rels"),
        emitterFingerprintByPath.get("ppt/slides/_rels/slide1.xml.rels"),
        emitterFingerprintByPath.get("ppt/slideMasters/_rels/slideMaster1.xml.rels"),
        emitterFingerprintByPath.get("ppt/slideLayouts/_rels/slideLayout1.xml.rels"),
      ]).size,
    ).toBe(5);
  });

  test("direct writer records support and manifest emitter fingerprints by package part family", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Support emitters" }, () => (
      <>
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const emitterFingerprintByPath = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [artifact.path, artifact.emitterFingerprint]),
    );
    const expected = [
      ["[Content_Types].xml", /^deckjsx:pptx-emitter:content-types:/],
      ["ppt/presentation.xml", /^deckjsx:pptx-emitter:presentation:/],
      ["ppt/theme/theme1.xml", /^deckjsx:pptx-emitter:theme:/],
      ["ppt/slideMasters/slideMaster1.xml", /^deckjsx:pptx-emitter:slide-master:/],
      ["ppt/slideLayouts/slideLayout1.xml", /^deckjsx:pptx-emitter:slide-layout:/],
      ["ppt/viewProps.xml", /^deckjsx:pptx-emitter:view-properties:/],
      ["ppt/presProps.xml", /^deckjsx:pptx-emitter:presentation-properties:/],
      ["ppt/media/media1.svg", /^deckjsx:pptx-emitter:media-copy:/],
    ] as const;

    expected.forEach(([path, pattern]) => {
      expect(emitterFingerprintByPath.get(path)).toMatch(pattern);
    });
    expect(new Set(expected.map(([path]) => emitterFingerprintByPath.get(path))).size).toBe(
      expected.length,
    );
  });

  test("direct writer invalidates build artifacts when the artifact package part id changes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Artifact identity" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>identity</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const slidePart = projection.parts.find((part) => part.path === "ppt/slides/slide1.xml")!;
    const staleArtifacts = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [
        artifact.packagePartId,
        artifact.packagePartId === slidePart.id
          ? { ...artifact, packagePartId: "pptx:test:wrong-artifact-part" as PackagePartId }
          : artifact,
      ]),
    );
    const warm = await renderPptxPackage(
      projection,
      {},
      { pptxBuildArtifactsByPartId: staleArtifacts },
    );

    expect(cold.artifact).toBeDefined();
    expect(warm.artifact).toBeDefined();
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "packagePartIdChanged",
        status: "rebuilt",
        reasonDetails: expect.objectContaining({
          kind: "packagePartIdChanged",
          packagePartId: { previous: "pptx:test:wrong-artifact-part", current: slidePart.id },
        }),
      }),
    );
    expect(
      warm.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml"),
    ).toMatchObject({
      packagePartId: slidePart.id,
      buildNotes: [expect.objectContaining({ reason: "packagePartIdChanged" })],
    });
  });

  test("direct writer invalidates media build artifacts when media bytes change", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Media bytes" }, () => (
      <>
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const staleArtifacts = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [
        artifact.packagePartId,
        artifact.path.startsWith("ppt/media/")
          ? { ...artifact, mediaByteFingerprint: "test:old-media-bytes" }
          : artifact,
      ]),
    );
    const warm = await renderPptxPackage(
      projection,
      {},
      { pptxBuildArtifactsByPartId: staleArtifacts },
    );

    expect(cold.artifact).toBeDefined();
    expect(
      cold.buildArtifacts?.find((artifact) => artifact.path.startsWith("ppt/media/"))
        ?.mediaByteFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(warm.artifact).toBeDefined();
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.svg",
        reason: "mediaBytesChanged",
        status: "rebuilt",
        previousBuild: expect.objectContaining({ mediaByteFingerprint: "test:old-media-bytes" }),
        reasonDetails: expect.objectContaining({
          kind: "mediaBytesChanged",
          mediaByteFingerprint: expect.objectContaining({
            previous: "test:old-media-bytes",
            current: expect.stringMatching(/^fnv1a32:/),
          }),
        }),
        build: expect.objectContaining({
          mediaByteFingerprint: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
    expect(
      warm.buildArtifacts?.find((artifact) => artifact.path === "ppt/media/media1.svg"),
    ).toMatchObject({
      buildNotes: [
        expect.objectContaining({
          kind: "packagePartBytesBuilt",
          reason: "mediaBytesChanged",
          partKind: "media",
          mediaByteFingerprint: expect.stringMatching(/^fnv1a32:/),
        }),
      ],
    });
  });

  test("render reuses package part build artifacts across store-only renders", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Store reuse" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>store</p>
      </>
    ));

    const first = await deck.render();
    const second = await deck.render();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.artifact?.bytes).toEqual(second.artifact?.bytes);
    expect(second.summary?.assembly?.reusedCount).toBeGreaterThan(0);
    expect(second.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        status: "reused",
      }),
    );
  });

  test("render emits store-only ZIP entries", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Store entries" }, () => (
      <>
        <img
          data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
        />
      </>
    ));

    const render = await deck.render();
    const bytes = render.artifact?.bytes ?? new Uint8Array();

    expect(render.ok).toBe(true);
    expect(render.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({ path: "ppt/media/media1.png" }),
    );
    expect(localZipCompressionMethod(bytes, "ppt/slides/slide1.xml")).toBe(0);
    expect(localZipCompressionMethod(bytes, "ppt/media/media1.png")).toBe(0);
  });

  test("direct writer reports pre-render package validation failures as render diagnostics", async () => {
    const result = await renderPptxPackage({
      format: "pptx",
      size: { widthEmu: 10, heightEmu: 10 },
      slides: [],
      parts: [
        {
          id: "pptx:test:invalid-package" as PackagePartId,
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

  test("direct writer validates package part requirement metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid requirement" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const requiredPart = expectPptxPart(projection.parts, "presentation");
    const conditionalPart = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    const optionalPartId = "pptx:test:optional-requirement" as PackagePartId;
    const optionalPath = "ppt/optional/optional.xml";
    const result = await renderPptxPackage({
      ...projection,
      parts: [
        ...(projection.parts.map((part, index): PptxPackageModel["parts"][number] => {
          if (index === 0) {
            return {
              ...part,
              ...(part.kind === "content-types"
                ? {
                    payload: {
                      ...(part.payload as PptxContentTypesPayload),
                      overrides: [
                        ...((part.payload as PptxContentTypesPayload).overrides ?? []),
                        {
                          partName: `/${optionalPath}`,
                          contentType: "application/vnd.openxmlformats-package.core-properties+xml",
                        },
                      ],
                    } satisfies PptxContentTypesPayload,
                  }
                : {}),
              requirement: {
                status: "conditional",
                reason: "missing evaluated requirement metadata",
              } as never,
            };
          }
          if (part.id === requiredPart.id) {
            return { ...part, requirement: { ...part.requirement!, required: false } };
          }
          if (part.id === conditionalPart.id) {
            return {
              ...part,
              requirement: {
                ...part.requirement!,
                condition: "explicit" as const,
                dependencies: [],
              },
            };
          }
          if (part.kind === "content-types") {
            return {
              ...part,
              payload: {
                ...(part.payload as PptxContentTypesPayload),
                overrides: [
                  ...((part.payload as PptxContentTypesPayload).overrides ?? []),
                  {
                    partName: `/${optionalPath}`,
                    contentType: "application/vnd.openxmlformats-package.core-properties+xml",
                  },
                ],
              } satisfies PptxContentTypesPayload,
            };
          }
          return part;
        }) satisfies PptxPackageModel["parts"][number][]),
        {
          id: optionalPartId,
          category: "support",
          kind: "document-properties",
          path: optionalPath,
          orderKey: {
            group: "other",
            groupOrder: 900,
            sequence: 999,
            path: optionalPath,
            value: `900:000999:${optionalPath}`,
          },
          fingerprint: "test:optional-requirement",
          requirement: {
            status: "optional" as const,
            required: true,
            reason: "invalid optional requirement evaluation",
          },
          payload: {
            kind: "document-properties",
            propertyKind: "core",
            editable: true,
            source: "deckjsx-meta",
          },
        } satisfies PptxPackageModel["parts"][number],
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".requirement.required") }),
          expect.objectContaining({ path: expect.stringContaining(".requirement.condition") }),
          expect.objectContaining({
            path: `projection.parts.${requiredPart.id}.requirement.required`,
            message: "required status must evaluate to true",
          }),
          expect.objectContaining({
            path: `projection.parts.${conditionalPart.id}.requirement.condition`,
            message: "conditional status cannot use explicit condition",
          }),
          expect.objectContaining({
            path: `projection.parts.${conditionalPart.id}.requirement.dependencies`,
            message: "missing conditional requirement dependencies",
          }),
          expect.objectContaining({
            path: `projection.parts.${optionalPartId}.requirement.required`,
            message: "optional status must evaluate to false",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part requirement dependency uniqueness", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate requirement dependency" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const dependencies = mediaPart.requirement?.dependencies ?? [];
    expect(dependencies[0]).toBeDefined();
    const dependency = dependencies[0]!;
    const malformedMediaPart = {
      ...mediaPart,
      requirement: { ...mediaPart.requirement!, dependencies: [dependency, dependency] },
    } satisfies PptxPackageModel["parts"][number];
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => (part.id === mediaPart.id ? malformedMediaPart : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${mediaPart.id}.requirement.dependencies.1`,
            message: `duplicate dependency ${dependency}`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part order key metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid order key" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part, index) =>
        index === 0 ? { ...part, orderKey: "000:legacy-string-order-key" as never } : part,
      ),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".orderKey") }),
        ]),
      }),
    );
  });

  test("direct writer validates package part order key semantic group", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid order key group" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const malformedMediaPart = {
      ...mediaPart,
      orderKey: {
        ...mediaPart.orderKey!,
        group: "contentTypes",
        groupOrder: 0,
        value: `000:000999:${mediaPart.path}`,
      },
    } satisfies PptxPackageModel["parts"][number];
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => (part.id === mediaPart.id ? malformedMediaPart : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.group"),
            message: "expected media",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.groupOrder"),
            message: "expected 90",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.value"),
            message: `expected 090:${String(mediaPart.orderKey!.sequence).padStart(6, "0")}:${mediaPart.path}`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part order key encoded value", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid order key value" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>order</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const malformedSlidePart = {
      ...slidePart,
      orderKey: {
        ...slidePart.orderKey!,
        value: `${String(slidePart.orderKey!.groupOrder).padStart(3, "0")}:999999:${slidePart.path}`,
      },
    } satisfies PptxPackageModel["parts"][number];
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlidePart : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.value"),
            message: `expected ${String(slidePart.orderKey!.groupOrder).padStart(3, "0")}:${String(slidePart.orderKey!.sequence).padStart(6, "0")}:${slidePart.path}`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part base metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part base" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const result = await renderPptxPackage({
      ...projection,
      parts: [
        ...projection.parts,
        { id: "", category: "runtime", kind: "legacy-slide", path: "" } as never,
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringMatching(/^projection\.parts\.\d+\.id$/) }),
          expect.objectContaining({
            path: expect.stringMatching(/^projection\.parts\.\d+\.category$/),
          }),
          expect.objectContaining({
            path: expect.stringMatching(/^projection\.parts\.\d+\.kind$/),
          }),
          expect.objectContaining({
            path: expect.stringMatching(/^projection\.parts\.\d+\.path$/),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part category-kind compatibility", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part category" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind === "content-types") {
          return { ...part, category: "support" };
        }
        if (part.kind === "media") {
          return { ...part, category: "manifest" };
        }
        return part;
      }),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: "projection.parts.pptx:manifest:content-types.category",
            message: "category support is not compatible with content-types",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".category"),
            message: "category manifest is not compatible with media",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part dependency fingerprint metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid dependency fingerprints" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>dependency</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const dependencyPartId =
      projection.parts.find((part) => part.kind === "slide-layout")?.id ?? projection.parts[0]!.id;
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) =>
        part.id === slidePart.id
          ? {
              ...part,
              dependencyFingerprints: [
                { packagePartId: "pptx:test:missing" as PackagePartId, fingerprint: "" },
                { packagePartId: dependencyPartId, fingerprint: "valid" },
                { packagePartId: dependencyPartId, fingerprint: "duplicate" },
              ],
            }
          : part,
      ),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.0.packagePartId"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.0.fingerprint"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.1.fingerprint"),
            message: expect.stringContaining("expected fnv1a32:"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.2.packagePartId"),
          }),
        ]),
      }),
    );
  });

  test("direct writer rejects self-referential package dependencies", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Self dependencies" }, () => (
      <img
        data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
        style={{ x: 1, y: 1, width: 1, height: 1, objectFit: "stretch" }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const contentTypesPart = expectPptxPart(projection.parts, "content-types");
    const presentationPart = expectPptxPart(projection.parts, "presentation");
    const slideMasterPart = expectPptxPart(projection.parts, "slide-master");
    const mediaPart = expectPptxPart(projection.parts, "media");
    const result = await renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id === contentTypesPart.id) {
          return {
            ...part,
            payload: {
              ...(part.payload as PptxContentTypesPayload),
              overrides: [
                ...(part.payload as PptxContentTypesPayload).overrides,
                { partName: "/[Content_Types].xml", contentType: "application/xml" },
              ],
            },
          };
        }

        if (part.id === presentationPart.id) {
          return {
            ...part,
            dependencyFingerprints: [
              ...(part.dependencyFingerprints ?? []),
              { packagePartId: part.id, fingerprint: part.fingerprint ?? "test:self" },
            ],
          };
        }

        if (part.id === slideMasterPart.id) {
          return {
            ...part,
            relationships: [
              ...(part.relationships ?? []),
              {
                id: "rIdSelf" as PptxRelationship["id"],
                type: "slideMaster",
                target: part.path,
                targetPath: part.path,
                targetPartId: part.id,
              },
            ],
          };
        }

        if (part.id === mediaPart.id) {
          return { ...part, requirement: { ...part.requirement!, dependencies: [part.id] } };
        }

        return part;
      }),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PACKAGE_DEPENDENCY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              `projection.parts.${contentTypesPart.id}.payload.overrides.`,
            ),
            message: expect.stringContaining("contentTypeOverride cannot reference"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(
              `projection.parts.${presentationPart.id}.dependencyFingerprints.`,
            ),
            message: expect.stringContaining("dependencyFingerprint cannot reference"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(`projection.parts.${slideMasterPart.id}.relationships.`),
            message: expect.stringContaining("relationshipTarget cannot reference"),
          }),
          expect.objectContaining({
            path: `projection.parts.${mediaPart.id}.requirement.dependencies.0`,
            message: expect.stringContaining("requirementDependency cannot reference"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part relationship metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const slideLayoutPartId =
      projection.parts.find((part) => part.kind === "slide-layout")?.id ?? projection.parts[0]!.id;
    const malformedSlide: PptxSlidePart = {
      ...slidePart,
      relationships: [
        null,
        { id: "", type: "", targetPath: "", targetMode: "internal" },
        {
          id: "bad id" as PptxRelationship["id"],
          type: "slideLayout",
          targetPath: "ppt/slideLayouts/slideLayout1.xml",
          targetPartId: slideLayoutPartId,
        },
        {
          id: "rIdDuplicate" as PptxRelationship["id"],
          type: "slideLayout",
          targetPath: "ppt/slideLayouts/slideLayout1.xml",
          targetPartId: slideLayoutPartId,
        },
        {
          id: "rIdDuplicate" as PptxRelationship["id"],
          type: "slideLayout",
          targetPath: "ppt/slideLayouts/slideLayout1.xml",
          targetPartId: slideLayoutPartId,
        },
      ] as never,
    };
    const result = await renderPptxPackage({
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
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".relationships.0") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.id") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.type") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.targetPath") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.targetMode") }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships.1.targetPartId"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships.2.id"),
            message: "invalid relationship id",
          }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.4.id") }),
        ]),
      }),
    );
  });

  test("direct writer validates internal relationship target paths are canonical package paths", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship target path" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>target path</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationshipsPart = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const brokenRelationships = (rootRelationshipsPart.payload.relationships ?? []).map(
      (relationship) =>
        relationship.type === "officeDocument"
          ? { ...relationship, targetPath: "/ppt/presentation.xml" }
          : relationship,
    );
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationshipsPart.id
            ? {
                ...part,
                relationships: brokenRelationships,
                payload: { relationships: brokenRelationships } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.payload.relationships.0.targetPath`,
            message: "invalid relationship target path",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.relationships.0.targetPath`,
            message: "invalid relationship target path",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates projected relationship targets match target paths", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Mismatched relationship target" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>target</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationshipsPart = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const brokenRelationships = (rootRelationshipsPart.payload.relationships ?? []).map(
      (relationship) =>
        relationship.type === "officeDocument"
          ? { ...relationship, target: "ppt/not-presentation.xml" }
          : relationship,
    );
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationshipsPart.id
            ? {
                ...part,
                relationships: brokenRelationships,
                payload: { relationships: brokenRelationships } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.payload.relationships.0.target`,
            message: "relationship target must match projected relationship target path",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.relationships.0.target`,
            message: "relationship target must match projected relationship target path",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates relationship target part identities stay in the pptx namespace", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship target identity" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>target id</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationshipsPart = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const brokenRelationships = (rootRelationshipsPart.payload.relationships ?? []).map(
      (relationship) =>
        relationship.type === "officeDocument"
          ? { ...relationship, targetPartId: "ppt/presentation.xml" as PackagePartId }
          : relationship,
    );
    const brokenRelationshipIndex = brokenRelationships.findIndex(
      (relationship) => relationship.type === "officeDocument",
    );
    expect(brokenRelationshipIndex).toBeGreaterThanOrEqual(0);
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationshipsPart.id
            ? {
                ...part,
                relationships: brokenRelationships,
                payload: { relationships: brokenRelationships } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.payload.relationships.${brokenRelationshipIndex}.targetPartId`,
            message: "invalid relationship target part id",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.relationships.${brokenRelationshipIndex}.targetPartId`,
            message: "invalid relationship target part id",
          }),
        ]),
      }),
    );
    const validationDiagnostic = result.diagnostics.items.find(
      (item) => item.code === "E_RENDER_PACKAGE_VALIDATION_FAILED",
    );
    expect(validationDiagnostic?.notes ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("code=E_PPTX_PACKAGE_BROKEN_RELATIONSHIP")]),
    );
  });

  test("direct writer validates package relationship type targets", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship targets" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>targets</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const slidePart = expectPptxPart(projection.parts, "slide");
    const slideLayoutPart = expectPptxPart(projection.parts, "slide-layout");
    const slideMasterPart = expectPptxPart(projection.parts, "slide-master");
    const viewPropertiesPart = projection.parts.find((part) => part.kind === "view-properties")!;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === rootRelationships.id) {
            const relationships = (
              (part.payload as PptxRelationshipsPayload | undefined)?.relationships ?? []
            )
              .map((relationship) =>
                relationship.type === "officeDocument"
                  ? {
                      ...relationship,
                      target: slidePart.path,
                      targetPartId: slidePart.id,
                      targetPath: slidePart.path,
                    }
                  : relationship,
              )
              .concat({
                id: "rIdInvalidRootOwner" as PptxRelationship["id"],
                type: "viewProperties",
                target: viewPropertiesPart.path,
                targetPartId: viewPropertiesPart.id,
                targetPath: viewPropertiesPart.path,
              });
            return {
              ...part,
              relationships,
              payload: { relationships } satisfies PptxRelationshipsPayload,
            };
          }

          if (part.id === slidePart.id) {
            return {
              ...part,
              relationships: [
                ...(part.relationships ?? []),
                {
                  id: "rIdInvalidTarget" as PptxRelationship["id"],
                  type: "officeDocument",
                  target: "../slideLayouts/slideLayout1.xml",
                  targetPartId: slideLayoutPart.id,
                  targetPath: slideLayoutPart.path,
                },
                {
                  id: "rIdInvalidSlideOwner" as PptxRelationship["id"],
                  type: "slideMaster",
                  target: "../slideMasters/slideMaster1.xml",
                  targetPartId: slideMasterPart.id,
                  targetPath: slideMasterPart.path,
                },
                {
                  id: "rIdUnsupportedInternal" as PptxRelationship["id"],
                  type: "https://deckjsx.dev/relationships/internal-test",
                  target: "../slideLayouts/slideLayout1.xml",
                  targetPartId: slideLayoutPart.id,
                  targetPath: slideLayoutPart.path,
                },
              ],
            };
          }

          return part;
        }),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.relationships"),
            message: "officeDocument relationship cannot target slide",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships"),
            message: "officeDocument relationship cannot target slide-layout",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".payload.relationships"),
            message: "viewProperties relationship is not valid for root relationship owner",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships"),
            message: "slideMaster relationship is not valid for slide relationship owner",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships"),
            message:
              "unsupported internal relationship type https://deckjsx.dev/relationships/internal-test",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates relationship metadata and payload stay synchronized", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship payload mismatch" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>mismatch</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const payload = rootRelationships.payload;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: payload.relationships.map((relationship) =>
                  relationship.type === "officeDocument"
                    ? { ...relationship, id: "rIdMetadataOnly" as PptxRelationship["id"] }
                    : relationship,
                ),
                payload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_RELATIONSHIP_PAYLOAD_MISMATCH"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.payload.relationships`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates owner relationships and relationship parts stay synchronized", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Owner relationship mismatch" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const relationshipPart = projection.parts.find(
      (part) => part.kind === "relationships" && part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const changedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.map((relationship) =>
        relationship.type === "image"
          ? { ...relationship, id: "rIdOwnerOnly" as PptxRelationship["id"] }
          : relationship,
      ),
    } satisfies PptxSlidePart;

    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? changedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? changedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: `projection.parts.${slidePart.id}.relationships` }),
          expect.objectContaining({
            path: `projection.parts.${relationshipPart.id}.payload.relationships`,
          }),
        ]),
      }),
    );
  });

  test("direct writer rejects missing owner relationship metadata when a relationship part exists", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing owner relationships" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const relationshipPart = projection.parts.find(
      (part) => part.kind === "relationships" && part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const changedSlide = { ...slidePart, relationships: undefined } as PptxSlidePart;

    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? changedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? changedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slidePart.id}.relationships`,
            message: "owner relationship metadata is missing",
          }),
          expect.objectContaining({
            path: `projection.parts.${relationshipPart.id}.payload.relationships`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates relationship part categories match their owner family", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship categories" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const presentationRelationships = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    const slideRelationships = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === rootRelationships.id || part.id === presentationRelationships.id) {
            return { ...part, category: "authored-content" };
          }
          if (part.id === slideRelationships.id) {
            return { ...part, category: "manifest" };
          }
          return part;
        }),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_RELATIONSHIPS_PART_CATEGORY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.category`,
            message: "expected manifest for _rels/.rels",
          }),
          expect.objectContaining({
            path: `projection.parts.${presentationRelationships.id}.category`,
            message: "expected manifest for ppt/_rels/presentation.xml.rels",
          }),
          expect.objectContaining({
            path: `projection.parts.${slideRelationships.id}.category`,
            message: "expected authored-content for ppt/slides/_rels/slide1.xml.rels",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part paths match their OOXML kind family", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Path families" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>paths</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = expectPptxPart(projection.parts, "presentation");
    const themePart = expectPptxPart(projection.parts, "theme");
    const slideRelationships = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === presentationPart.id) {
            return { ...part, path: "ppt/slides/presentation.xml" };
          }
          if (part.id === themePart.id) {
            return { ...part, path: "ppt/not-theme/theme1.xml" };
          }
          if (part.id === slideRelationships.id) {
            return { ...part, path: "ppt/relationships/slide1.xml.rels" };
          }
          return part;
        }),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_PATH_FAMILY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.path`,
            message: "expected ppt/presentation.xml, received ppt/slides/presentation.xml",
          }),
          expect.objectContaining({
            path: `projection.parts.${themePart.id}.path`,
            message: "expected ppt/theme/themeN.xml, received ppt/not-theme/theme1.xml",
          }),
          expect.objectContaining({
            path: `projection.parts.${slideRelationships.id}.path`,
            message:
              "expected _rels/.rels or known ppt/*/_rels/*.xml.rels, received ppt/relationships/slide1.xml.rels",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part identities stay in the pptx namespace", async () => {
    const result = await renderPptxPackage({
      format: "pptx",
      size: { widthEmu: 10, heightEmu: 10 },
      slides: [],
      parts: [
        {
          id: "ppt/presentation.xml" as PackagePartId,
          category: "support",
          kind: "presentation",
          path: "ppt/presentation.xml",
          payload: {
            kind: "presentation",
            size: { widthEmu: 10, heightEmu: 10 },
            slideMasterIds: [],
            slidePartIds: [],
          },
        },
        {
          id: "pptx:bad identity" as PackagePartId,
          category: "manifest",
          kind: "relationships",
          path: "_rels/.rels",
          payload: { relationships: [] } satisfies PptxRelationshipsPayload,
        },
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: "projection.parts.ppt/presentation.xml.id",
            message: "invalid package part id",
          }),
          expect.objectContaining({
            path: "projection.parts.pptx:bad identity.id",
            message: "invalid package part id",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part paths are canonical zip entry paths", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid package paths" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>paths</p>
    ));

    const projection = (await deck.project()).projection!;
    const contentTypesPart = expectPptxPart(projection.parts, "content-types");
    const presentationPart = expectPptxPart(projection.parts, "presentation");
    const rootRelationshipsPart = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === contentTypesPart.id) {
            return { ...part, path: "/[Content_Types].xml" };
          }
          if (part.id === presentationPart.id) {
            return { ...part, path: "ppt\\presentation.xml" };
          }
          if (part.id === rootRelationshipsPart.id) {
            return { ...part, path: "_rels/../.rels" };
          }
          return part;
        }),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${contentTypesPart.id}.path`,
            message: "invalid package part path",
          }),
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.path`,
            message: "invalid package part path",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.path`,
            message: "invalid package part path",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part origin metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part origin" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>origin</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide: PptxSlidePart = {
      ...slidePart,
      origin: {
        graphNodeIds: ["", "graph:test:duplicate-part-origin", "graph:test:duplicate-part-origin"],
        source: { kind: "mounted", sourceKey: "", sourceIdentity: "" },
      } as never,
    };
    const result = await renderPptxPackage({
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
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORIGIN"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".origin.graphNodeIds.0") }),
          expect.objectContaining({
            path: expect.stringContaining(".origin.graphNodeIds.2"),
            message: expect.stringContaining("duplicate graph node ids entry"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".origin.source.sourceKey") }),
          expect.objectContaining({
            path: expect.stringContaining(".origin.source.sourceIdentity"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates drawing origin metadata shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid drawing origin" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>origin</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const [firstChild, ...remainingChildren] = slidePart.payload.drawing.children;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: [
            {
              ...firstChild!,
              origin: {
                graphNodeIds: ["", "graph:test:duplicate", "graph:test:duplicate"],
                styleEntityIds: ["style:test:duplicate", "style:test:duplicate"],
                assetEntityIds: ["", "asset:test:duplicate", "asset:test:duplicate"],
                source: { kind: "mounted", sourceKey: "", sourceIdentity: "" },
              },
            },
            ...remainingChildren,
          ],
        },
      },
    } as PptxSlidePart;
    const result = await renderPptxPackage({
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
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_ORIGIN"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.graphNodeIds.0"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.graphNodeIds.2"),
            message: expect.stringContaining("duplicate graph node ids entry"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.styleEntityIds.1"),
            message: expect.stringContaining("duplicate style entity ids entry"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.assetEntityIds.0"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.assetEntityIds.2"),
            message: expect.stringContaining("duplicate asset entity ids entry"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.source.sourceKey"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.source.sourceIdentity"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates drawing element payload shape", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid drawing payload" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>payload</p>
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind === "text") {
              return {
                ...element,
                content: { text: 42, runs: [{ text: 7, style: "invalid" }] },
                style: "invalid",
                hyperlink: { url: "", tooltip: 3 },
              };
            }
            if (element.kind === "image") {
              return {
                ...element,
                mediaPartId: 7,
                sourceFrame: { xEmu: Number.NaN, yEmu: 0, widthEmu: 0, heightEmu: -1 },
                source: { kind: "url", url: "" },
                fit: "tile",
                objectPosition: { x: Number.NaN, y: 0.5 },
                crop: { top: 0, right: "bad", bottom: 0, left: 0 },
                transparency: "transparent",
                rounding: "yes",
                hyperlink: { url: "javascript:alert(1)" },
              };
            }
            return element;
          }),
        },
      },
    } as PptxSlidePart;
    const result = await renderPptxPackage({
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
            path: expect.stringContaining(".drawing.children.0.content.text"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.content.runs.0.text"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.content.runs.0.style"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".drawing.children.0.style") }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.hyperlink.url"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.mediaPartId"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.sourceFrame.xEmu"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.sourceFrame.widthEmu"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.sourceFrame.heightEmu"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.source.url"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".drawing.children.1.fit") }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.objectPosition.x"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.crop.right"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.transparency"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.rounding"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.hyperlink.url"),
          }),
        ]),
      }),
    );
  });

  test("render validation requires projected image objectPosition values", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing objectPosition" }, () => (
      <>
        <div
          style={{
            x: 0,
            y: 0,
            width: 2,
            height: 1,
            background: `url("${SAMPLE_SVG_DATA_URI}")`,
            backgroundRepeat: "no-repeat",
          }}
        />
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 3, y: 0, width: 1, height: 1 }} />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind === "group") {
              return {
                ...element,
                backgroundLayers: element.backgroundLayers?.map((layer) => {
                  if (layer.kind !== "background-image") {
                    return layer;
                  }
                  const { objectPosition: _objectPosition, ...rest } = layer;
                  return rest;
                }),
              };
            }
            if (element.kind === "image") {
              const { objectPosition: _objectPosition, ...rest } = element;
              return rest;
            }
            return element;
          }),
        },
      },
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
            path: expect.stringContaining(".drawing.children.0.backgroundLayers.0.objectPosition"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.objectPosition"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates malformed group drawing children before recursion", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid group payload" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1 }}>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>group child</p>
      </div>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const [groupElement, ...remainingChildren] = slidePart.payload.drawing.children;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: [{ ...groupElement!, children: "invalid" }, ...remainingChildren],
        },
      },
    } as PptxSlidePart;
    const result = await renderPptxPackage({
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
            path: expect.stringContaining(".drawing.children.0.children"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates projected image crop ratios before source-rect emission", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid crop payload" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 2, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, crop: { top: -0.1, right: 0.7, bottom: 0, left: 0.4 } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
            path: expect.stringContaining(".drawing.children.0.crop.top"),
            message: "invalid image crop top",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.crop"),
            message: "image crop left and right must leave positive source width",
          }),
        ]),
      }),
    );
  });

  test("direct writer reports ZIP source failures as package assembly diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "ZIP source failure" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const tooLongPath = `ppt/media/${"a".repeat(70_000)}.png`;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        parts: [
          ...projection.parts.map((part) =>
            part.kind === "content-types"
              ? {
                  ...part,
                  payload: {
                    ...(part.payload as PptxContentTypesPayload),
                    defaults: [
                      ...((part.payload as PptxContentTypesPayload).defaults ?? []),
                      { extension: "png", contentType: "image/png" },
                    ],
                  } satisfies PptxContentTypesPayload,
                }
              : part,
          ),
          {
            id: "pptx:test:too-long-path" as PackagePartId,
            category: "authored-content",
            kind: "media",
            path: tooLongPath,
            orderKey: {
              group: "media",
              groupOrder: 90,
              sequence: 999,
              path: tooLongPath,
              value: `090:000999:${tooLongPath}`,
            },
            fingerprint: "test:too-long-path",
            requirement: { status: "required", required: true, reason: "zip filename length test" },
            payload: {
              source: { kind: "data", data: dataUriFromBytes("image/png", pngHeaderBytes(1, 1)) },
              sources: [
                { kind: "data", data: dataUriFromBytes("image/png", pngHeaderBytes(1, 1)) },
              ],
            } satisfies PptxMediaPartPayload,
          },
        ],
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED",
        labels: expect.arrayContaining([expect.objectContaining({ path: "render.assembly.zip" })]),
        notes: expect.arrayContaining([expect.stringContaining("reason=zipSourceFailed")]),
      }),
    );
  });

  test("direct writer validates malformed drawing fill before part emission", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Emitter failure" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>emitter failure</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? { ...element, fill: { kind: "solid", color: Symbol("emitter failure") } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        slides: [malformedSlide],
        parts: projection.parts.map((part) => (part.kind === "slide" ? malformedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.buildArtifacts).toBeUndefined();
    expect(result.summary?.assembly).toMatchObject({
      entries: [],
      failedCount: 0,
      missingCount: 0,
      rebuiltCount: 0,
      reusedCount: 0,
    });
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.fill.color"),
          }),
        ]),
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
      }),
    );
  });

  test("direct writer rejects stale package fingerprints before warm artifact reuse", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale fingerprint" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>stale slide</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await renderPptxPackage(projection);
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? { ...element, fill: { kind: "solid", color: Symbol("reuse skips emitter") } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;
    const stale = await renderPptxPackage(
      {
        ...projection,
        slides: [malformedSlide],
        parts: projection.parts.map((part) => (part.kind === "slide" ? malformedSlide : part)),
      },
      {},
      {
        pptxBuildArtifactsByPartId: new Map(
          (cold.buildArtifacts ?? []).map((artifact) => [artifact.packagePartId, artifact]),
        ),
      },
    );

    expect(cold.artifact).toBeDefined();
    expect(stale.artifact).toBeUndefined();
    expect(stale.buildArtifacts).toBeUndefined();
    expect(stale.summary?.assembly).toMatchObject({
      entries: [],
      missingCount: 0,
      rebuiltCount: 0,
      reusedCount: 0,
    });
    expect(stale.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_STALE_PART_FINGERPRINT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slidePart.id}.fingerprint`,
            message: expect.stringContaining("expected fnv1a32:"),
          }),
        ]),
      }),
    );
  });

  test("render produces deterministic PPTX bytes for the same input", async () => {
    function buildDeck() {
      const deck = new Deck({
        layout: { width: 10, height: 5.625, unit: "in" },
        meta: { title: "Deterministic", author: "deckjsx" },
      });
      deck.slide({ name: "Deterministic bytes" }, () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 4,
              height: 2,
              backgroundColor: "#E0F2FE",
              border: "2pt solid #0369A1",
            }}
          >
            <p style={{ x: 0.25, y: 0.25, width: 3, height: 0.5, fontSize: 20 }}>Stable</p>
          </div>
        </>
      ));
      return deck;
    }

    const first = await buildDeck().render();
    const second = await buildDeck().render();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.artifact?.bytes).toEqual(second.artifact?.bytes);
  });

  test("render produces deterministic PPTX bytes for fixed data-uri media", async () => {
    function buildDeck() {
      const deck = new Deck({
        layout: { width: 10, height: 5.625, unit: "in" },
        meta: { title: "Deterministic media", author: "deckjsx" },
      });
      deck.slide({ name: "Deterministic media bytes" }, () => (
        <>
          <img
            data={SAMPLE_SVG_DATA_URI}
            style={{ x: 1, y: 1, width: 1.25, height: 1.25, fit: "stretch" }}
          />
          <div
            style={{
              x: 2.75,
              y: 1,
              width: 3,
              height: 1.25,
              background: `url("${SAMPLE_SVG_DATA_URI}")`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
          />
        </>
      ));
      return deck;
    }

    const first = await buildDeck().render();
    const second = await buildDeck().render();
    const firstZip = unzipSync(first.artifact?.bytes ?? new Uint8Array());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.artifact?.bytes).toEqual(second.artifact?.bytes);
    expect(
      Object.keys(firstZip)
        .filter((path) => path.startsWith("ppt/media/"))
        .sort(),
    ).toEqual(["ppt/media/media1.svg"]);
    expect(first.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.svg",
        status: "rebuilt",
        reason: "missingArtifact",
        build: expect.objectContaining({
          mediaByteFingerprint: expect.stringMatching(/^fnv1a32:/),
          mediaByteFingerprintSource: "byteHash",
        }),
      }),
    );
  });

  test("render emits core and extended document properties", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Doc props", author: "deckjsx" },
    });
    deck.slide({ name: "First" }, () => <></>);
    deck.slide({ name: "Second" }, () => <></>);

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const appProps = new TextDecoder().decode(zip["docProps/app.xml"]);
    const coreProps = new TextDecoder().decode(zip["docProps/core.xml"]);

    expect(render.ok).toBe(true);
    expect(appProps).toContain("<Application>deckjsx</Application>");
    expect(appProps).toContain("<Slides>2</Slides>");
    expect(coreProps).toContain("<dc:title>Doc props</dc:title>");
    expect(coreProps).toContain("<dc:creator>deckjsx</dc:creator>");
    expect(coreProps).not.toContain("<dcterms:created");
    expect(coreProps).not.toContain("<dcterms:modified");
  });

  test("explicit pptx adapter renders the current projection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter" }, () => <></>);

    const result = await deck.render(pptx());

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
  });

  test("defineProjection supplies the next project/render source", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Original" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const renamedSlideParts = projection.slides.map((slide) => ({
      ...slide,
      payload: { ...slide.payload, name: "Defined projection" },
    }));
    const renamedProjection = withFreshPackageFingerprints({
      ...projection,
      slides: renamedSlideParts,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? (renamedSlideParts.find((slide) => slide.id === part.id) ?? part)
          : part,
      ),
    });

    deck.defineProjection(renamedProjection);

    const project = await deck.project();
    expect(project.projection?.slides[0]?.payload.name).toBe("Defined projection");
    expect(project.stages.project.artifact).toBe("available");
  });

  test("defineGraph supplies a graph-resolved package skeleton", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Graph source" }, () => <></>);

    const graph = deck.compile().graph!;
    deck.defineGraph(graph);

    const project = await deck.project();
    expect(project.ok).toBe(true);
    expect(project.projection?.slides).toHaveLength(1);
    expect(project.projection?.parts.some((part) => part.path === "ppt/slides/slide1.xml")).toBe(
      true,
    );
  });

  test("projected package identities remain distinct from package paths", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Identity" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Stable</p>
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const text = slide?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(slide?.id).toMatch(/^pptx:slide:/);
    expect(slide?.id).not.toBe(slide?.path);
    expect(text?.id).toMatch(/^pptx:slide:.*:element:graph%3A/);
    expect(text?.id).not.toContain("slide1.xml");
  });

  test("projected media parts are connected through slide relationships", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Media" }, () => (
      <>
        <img
          data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
        />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const image = slide?.payload.drawing.children[0];
    const mediaRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "image",
    );
    const mediaPart = project.projection?.parts.find(
      (part) => part.kind === "media" && part.id === mediaRelationship?.targetPartId,
    );
    const slideRelationshipPart = project.projection?.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );

    expect(project.ok).toBe(true);
    expect(image?.kind).toBe("image");
    expect(image?.kind === "image" ? image.mediaPartId : undefined).toBeDefined();
    expect(mediaRelationship?.targetPartId).toBe(
      image?.kind === "image" ? image.mediaPartId : undefined,
    );
    expect(mediaRelationship?.id).toBe(image?.serialized.relationshipId);
    expect(
      project.projection?.parts.some((part) => part.kind === "media" && part.id === mediaPart?.id),
    ).toBe(true);
    expect(project.summary?.pptx.relationshipCount).toBeGreaterThan(1);
    expect(project.summary?.media[0]?.partId).toBe(mediaRelationship?.targetPartId);
    expect(project.summary?.media[0]?.partPath).toBe("ppt/media/media1.png");
    expect(project.summary?.media[0]?.metadata).toMatchObject({
      mediaType: "image/png",
      extension: "png",
    });
    expect(project.summary?.parts).toContainEqual(
      expect.objectContaining({ path: "ppt/media/media1.png", hasStructuredPayload: true }),
    );
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: mediaPart?.id,
        ownerPath: "ppt/media/media1.png",
        targetPartId: slideRelationshipPart?.id,
        targetPath: "ppt/slides/_rels/slide1.xml.rels",
        reason: "requirementDependency",
        requirementStatus: "conditional",
        requirementCondition: "referencedByRelationship",
      }),
    );
  });

  test("projected video parts keep playable mp4 media and poster image relationships", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          posterData={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 4, height: 2.25, objectFit: "contain" }}
        />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const video = slide?.payload.drawing.children.find((element) => element.kind === "video");
    const videoRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "video",
    );
    const embeddedMediaRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "media",
    );
    const posterRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "image",
    );
    const mediaParts = project.projection?.parts.filter(isPptxMediaPart) ?? [];
    const videoPart = mediaParts.find((part) => part.payload.mediaKind === "video");
    const posterPart = mediaParts.find((part) => part.payload.mediaKind === "image");

    expect(project.ok).toBe(true);
    expect(video?.kind).toBe("video");
    expect(video?.kind === "video" ? video.mediaPartId : undefined).toBe(videoPart?.id);
    expect(video?.kind === "video" ? video.posterMediaPartId : undefined).toBe(posterPart?.id);
    expect(videoPart?.path).toBe("ppt/media/media1.mp4");
    expect(videoPart?.payload.metadata).toMatchObject({
      mediaType: "video/mp4",
      extension: "mp4",
    });
    expect(posterPart?.path).toBe("ppt/media/media2.png");
    expect(videoRelationship?.targetPartId).toBe(videoPart?.id);
    expect(embeddedMediaRelationship?.targetPartId).toBe(videoPart?.id);
    expect(video?.kind === "video" ? video.serialized.mediaRelationshipId : undefined).toBe(
      embeddedMediaRelationship?.id,
    );
    expect(posterRelationship?.targetPartId).toBe(posterPart?.id);
  });

  test("project validates video poster image relationships before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken video poster relationship" }, () => (
      <>
        <video
          data={dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          posterData={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 4, height: 2.25 }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.filter(
        (relationship) => relationship.type !== "image",
      ),
    } satisfies PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.posterMediaPartId"),
            message: expect.stringContaining("missing video poster image relationship"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("render emits playable video xml with poster and embedded media relationships", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          style={{ x: 1, y: 1, width: 4, height: 2.25 }}
        />
      </>
    ));

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);
    const relsXml = new TextDecoder().decode(zip["ppt/slides/_rels/slide1.xml.rels"]);

    expect(render.ok).toBe(true);
    expect(render.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_COMPILE_VIDEO_POSTER_MISSING",
      }),
    );
    expect(slideXml).toContain("<a:videoFile");
    expect(slideXml).toContain("<p14:media");
    expect(slideXml).toContain('r:embed="rId3"');
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"',
    );
    expect(relsXml).toContain(
      'Type="http://schemas.microsoft.com/office/2007/relationships/media"',
    );
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"',
    );
  });

  test("project synthesizes a fallback frame for video without authored size", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          posterData={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
        />
      </>
    ));

    const project = await deck.project();
    const video = project.projection?.slides[0]?.payload.drawing.children.find(
      (element) => element.kind === "video",
    );

    expect(project.ok).toBe(true);
    expect(video?.frame).toMatchObject({
      xEmu: 0,
      yEmu: 0,
      widthEmu: 4572000,
      heightEmu: 2571750,
    });
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
      }),
    );
    expect(
      project.diagnostics.items.some((item) =>
        item.notes?.some((note) => note === "fallbackStrategy=synthesizeFallbackFrame"),
      ),
    ).toBe(true);
  });

  test("project reports an error for unsupported video formats", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={dataUriFromBytes("video/webm", new Uint8Array([26, 69, 223, 163]))}
          posterData={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 4, height: 2.25 }}
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

  test("project reuses one media part for repeated authored media sources", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Repeated media" }, () => (
      <>
        <img
          data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 1, height: 1, objectFit: "stretch" }}
        />
        <img
          data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 2, y: 1, width: 1, height: 1, objectFit: "stretch" }}
        />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const images = slide?.payload.drawing.children.filter((element) => element.kind === "image");
    const mediaParts = project.projection?.parts.filter((part) => part.kind === "media") ?? [];
    const mediaRelationships =
      slide?.relationships?.filter((relationship) => relationship.type === "image") ?? [];

    expect(project.ok).toBe(true);
    expect(images).toHaveLength(2);
    expect(images?.[0]?.kind === "image" ? images[0].mediaPartId : undefined).toBe(
      images?.[1]?.kind === "image" ? images[1].mediaPartId : undefined,
    );
    expect(mediaParts).toHaveLength(1);
    expect(mediaParts[0]?.path).toBe("ppt/media/media1.png");
    expect(mediaRelationships).toHaveLength(1);
    expect(images?.[0]?.kind === "image" ? images[0].serialized.relationshipId : undefined).toBe(
      mediaRelationships[0]?.id,
    );
    expect(images?.[1]?.kind === "image" ? images[1].serialized.relationshipId : undefined).toBe(
      mediaRelationships[0]?.id,
    );
  });

  test("project assigns deterministic slide relationship ids across shared media and hyperlinks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Deterministic relationships" }, () => (
      <>
        <div
          style={{
            x: 0,
            y: 0,
            width: 10,
            height: 5.625,
            background: `url("${SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        />
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image",
          }}
        />
        <p style={{ x: 3, y: 1, width: 2, height: 0.5, href: "https://example.com/text" }}>Link</p>
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const relationships = slide?.relationships ?? [];
    const [background, image, text] = slide?.payload.drawing.children ?? [];
    const mediaRelationships = relationships.filter(
      (relationship) => relationship.type === "image",
    );
    const hyperlinkRelationships = relationships.filter(
      (relationship) => relationship.type === "hyperlink",
    );

    expect(project.ok).toBe(true);
    expect(relationships.map((relationship) => relationship.id)).toEqual([
      "rId1",
      "rId2",
      "rId3",
      "rId4",
    ]);
    expect(relationships.map((relationship) => relationship.type)).toEqual([
      "slideLayout",
      "image",
      "hyperlink",
      "hyperlink",
    ]);
    expect(background?.kind).toBe("group");
    expect(image?.kind).toBe("image");
    expect(text?.kind).toBe("text");
    expect(
      background?.kind === "group" && background.backgroundLayers?.[0]?.kind === "background-image"
        ? background.backgroundLayers[0].objectPosition
        : undefined,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(image?.kind === "image" ? image.objectPosition : undefined).toEqual({ x: 0.5, y: 0.5 });
    expect(mediaRelationships).toHaveLength(1);
    expect(project.projection?.parts.filter((part) => part.kind === "media")).toHaveLength(1);
    expect(image?.kind === "image" ? image.serialized.relationshipId : undefined).toBe(
      mediaRelationships[0]?.id,
    );
    expect(image?.kind === "image" ? image.serialized.hyperlinkRelationshipId : undefined).toBe(
      hyperlinkRelationships[0]?.id,
    );
    expect(text?.kind === "text" ? text.serialized.hyperlinkRelationshipId : undefined).toBe(
      hyperlinkRelationships[1]?.id,
    );
  });

  test("project assigns and validates background layer shape object ids", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Background layer ids" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            background:
              "linear-gradient(90deg, #111111 0%, #333333 100%), linear-gradient(180deg, #444444 0%, #666666 100%)",
          }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const group = slide.payload.drawing.children[0];
    const backgroundLayer = group?.kind === "group" ? group.backgroundLayers?.[0] : undefined;

    expect(backgroundLayer?.kind).toBe("linear-gradient");
    expect(backgroundLayer && "serialized" in backgroundLayer).toBe(true);
    expect(
      backgroundLayer && "serialized" in backgroundLayer
        ? backgroundLayer.serialized.shapeObjectId
        : undefined,
    ).toMatch(/^[1-9]\d*$/);
    expect(backgroundLayer?.paintOrder).toMatchObject({
      siblingOrder: 0,
      generatedLayerRole: "background",
    });

    const malformedSlide = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  backgroundLayers: element.backgroundLayers?.map((layer) =>
                    layer.kind === "background-image"
                      ? layer
                      : { ...layer, paintOrder: undefined, serialized: undefined },
                  ),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;
    const result = await renderPptxPackage(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((candidate) =>
          candidate.id === slide.id ? malformedSlide : candidate,
        ),
        parts: projection.parts.map((part) => (part.id === slide.id ? malformedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.backgroundLayers.0.serialized"),
            message: "invalid background layer serialized identity metadata",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.backgroundLayers.0.paintOrder"),
            message: "invalid background paint order",
          }),
        ]),
      }),
    );
  });

  test("project reuses media parts by loader-provided content hash", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "hashed-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: 1,
              height: 1,
              hash: "sha256:same-content",
            }
          : undefined;
      },
    });
    deck.slide({ name: "Hashed media" }, () => (
      <>
        <img src="/public/a.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
        <img src="/public/b.png" style={{ x: 2, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const images = slide?.payload.drawing.children.filter((element) => element.kind === "image");
    const mediaParts = project.projection?.parts.filter((part) => part.kind === "media") ?? [];
    const payload = mediaParts[0]?.payload as PptxMediaPartPayload | undefined;

    expect(project.ok).toBe(true);
    expect(images).toHaveLength(2);
    expect(images?.[0]?.kind === "image" ? images[0].mediaPartId : undefined).toBe(
      images?.[1]?.kind === "image" ? images[1].mediaPartId : undefined,
    );
    expect(mediaParts).toHaveLength(1);
    expect(payload?.metadata?.hash).toBe("sha256:same-content");
    expect(project.summary?.media[0]?.metadata).toMatchObject({
      mediaType: "image/png",
      extension: "png",
      widthPx: 1,
      heightPx: 1,
      hash: "sha256:same-content",
    });
    expect(payload?.sources).toHaveLength(2);
    expect(payload?.assetEntityIds).toHaveLength(2);
  });

  test("projected package manifest carries content types and root relationships", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "#334155", fontSize: 20 } } }),
    });
    deck.slide({ name: "Manifest" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme default</p>
    ));

    const project = await deck.project();
    const parts = project.projection?.parts ?? [];
    const contentTypes = parts.find((part) => part.kind === "content-types");
    const rootRelationships = parts.find((part) => part.path === "_rels/.rels");
    const presentationRelationships = parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const presentationPart = parts.find((part) => part.kind === "presentation");
    const slide = project.projection?.slides[0];
    const themePayload = parts.find((part) => part.kind === "theme")?.payload as
      | PptxThemePartPayload
      | undefined;

    expect(project.ok).toBe(true);
    expect(contentTypes?.payload).toEqual(
      expect.objectContaining({
        defaults: expect.arrayContaining([expect.objectContaining({ extension: "rels" })]),
        overrides: expect.arrayContaining([
          expect.objectContaining({ partName: "/ppt/presentation.xml" }),
          expect.objectContaining({ partName: "/ppt/slides/slide1.xml" }),
        ]),
      }),
    );
    expect(rootRelationships?.relationships).toContainEqual(
      expect.objectContaining({ targetPath: "ppt/presentation.xml", type: "officeDocument" }),
    );
    expect(project.summary?.relationships).toContainEqual(
      expect.objectContaining({
        ownerPartId: rootRelationships?.id,
        ownerPath: "_rels/.rels",
        targetPath: "ppt/presentation.xml",
        type: "officeDocument",
      }),
    );
    expect(presentationRelationships?.relationships).toContainEqual(
      expect.objectContaining({ targetPartId: slide?.id, type: "slide" }),
    );
    expect(project.summary?.relationships).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentationRelationships?.id,
        ownerPath: "ppt/_rels/presentation.xml.rels",
        targetPartId: slide?.id,
        type: "slide",
      }),
    );
    expect(project.summary?.pptx.relationshipCount).toBe(project.summary?.relationships.length);
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: rootRelationships?.id,
        ownerPath: "_rels/.rels",
        targetPartId: presentationPart?.id,
        targetPath: "ppt/presentation.xml",
        reason: "relationshipTarget",
        relationshipType: "officeDocument",
      }),
    );
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: contentTypes?.id,
        ownerPath: "[Content_Types].xml",
        targetPartId: slide?.id,
        targetPath: "ppt/slides/slide1.xml",
        reason: "contentTypeOverride",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
      }),
    );
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentationPart?.id,
        ownerPath: "ppt/presentation.xml",
        targetPartId: presentationRelationships?.id,
        targetPath: "ppt/_rels/presentation.xml.rels",
        reason: "dependencyFingerprint",
        fingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
    expect(project.summary?.pptx.packageDependencyCount).toBe(
      project.summary?.packageDependencies.length,
    );
    expect(project.summary?.pptx.packageDependencyCount).toBeGreaterThan(0);
    expect(project.summary?.parts).toContainEqual(
      expect.objectContaining({
        id: presentationPart?.id,
        path: "ppt/presentation.xml",
        fingerprint: presentationPart?.fingerprint,
      }),
    );
    expect(
      project.summary?.parts.find((part) => part.id === presentationPart?.id)?.fingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(parts.find((part) => part.kind === "presentation")?.payload).toEqual(
      expect.objectContaining({
        kind: "presentation",
        slidePartIds: expect.arrayContaining([slide?.id]),
      }),
    );
    expect(themePayload).toEqual(
      expect.objectContaining({
        kind: "theme",
        name: "deckjsx",
        editable: true,
        projection: expect.objectContaining({
          purpose: "default",
          trace: expect.objectContaining({
            wholeThemeMappings: expect.arrayContaining([
              expect.objectContaining({
                projectedAs: "themePart",
                purpose: "default",
                themePartId: parts.find((part) => part.kind === "theme")?.id,
                groups: ["colorScheme", "fontScheme", "formatScheme", "themeDefaults"],
                fingerprint: expect.stringMatching(/^fnv1a32:/),
              }),
            ]),
            valueGroupFingerprints: expect.arrayContaining([
              expect.objectContaining({
                group: "colorScheme",
                projectedAs: "themeSupport",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 12,
              }),
              expect.objectContaining({
                group: "fontScheme",
                projectedAs: "themeSupport",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 2,
              }),
              expect.objectContaining({
                group: "formatScheme",
                projectedAs: "themeSupport",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 1,
              }),
              expect.objectContaining({
                group: "themeDefaults",
                projectedAs: "themeProjectionTrace",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 2,
              }),
            ]),
            supportMappings: expect.arrayContaining([
              expect.objectContaining({ projectedAs: "themeSupport" }),
            ]),
            defaultStyleDecisions: expect.arrayContaining([
              expect.objectContaining({
                defaultKey: "p",
                property: "color",
                decision: "projectConcreteDrawingProperty",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: "#334155",
              }),
              expect.objectContaining({
                defaultKey: "p",
                property: "fontSize",
                decision: "projectConcreteDrawingProperty",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: 20,
              }),
            ]),
            effectiveInheritance: expect.arrayContaining([
              expect.objectContaining({
                source: "themeDefault",
                defaultKey: "p",
                property: "color",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: "#334155",
                themePartId: parts.find((part) => part.kind === "theme")?.id,
                slideMasterPartId: parts.find((part) => part.kind === "slide-master")?.id,
                slideLayoutPartId: parts.find((part) => part.kind === "slide-layout")?.id,
                slidePartId: slide?.id,
                inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide", "drawing"],
                reason: expect.stringContaining("Theme Default won"),
              }),
            ]),
            concreteDrawingProperties: expect.arrayContaining([
              expect.objectContaining({
                defaultKey: "p",
                property: "color",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: "#334155",
              }),
              expect.objectContaining({ defaultKey: "p", property: "fontSize", resolvedValue: 20 }),
            ]),
          }),
        }),
        colorScheme: expect.objectContaining({
          colors: expect.objectContaining({ accent1: "2563EB" }),
        }),
      }),
    );
    const trace = themePayload?.kind === "theme" ? themePayload.projection.trace : undefined;
    const defaultGroup = trace?.valueGroupFingerprints.find(
      (fingerprint) => fingerprint.group === "themeDefaults",
    );
    const supportGroups = trace?.valueGroupFingerprints.filter(
      (fingerprint) => fingerprint.projectedAs === "themeSupport",
    );
    const controlDeck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "#0F172A", fontSize: 24 } } }),
    });
    controlDeck.slide({ name: "Manifest" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme default</p>
    ));
    const controlProject = await controlDeck.project();
    const controlThemePayload = controlProject.projection?.parts.find(
      (part) => part.kind === "theme",
    )?.payload as PptxThemePartPayload | undefined;
    const controlTrace =
      controlThemePayload?.kind === "theme" ? controlThemePayload.projection.trace : undefined;
    const controlDefaultGroup = controlTrace?.valueGroupFingerprints.find(
      (fingerprint) => fingerprint.group === "themeDefaults",
    );

    expect(defaultGroup?.fingerprint).not.toBe(controlDefaultGroup?.fingerprint);
    expect(supportGroups?.map((fingerprint) => fingerprint.fingerprint)).toEqual(
      controlTrace?.valueGroupFingerprints
        .filter((fingerprint) => fingerprint.projectedAs === "themeSupport")
        .map((fingerprint) => fingerprint.fingerprint),
    );
    expect(parts.find((part) => part.kind === "slide-master")?.payload).toEqual(
      expect.objectContaining({
        kind: "slide-master",
        themePartId: parts.find((part) => part.kind === "theme")?.id,
        slideLayoutPartIds: expect.arrayContaining([
          parts.find((part) => part.kind === "slide-layout")?.id,
        ]),
      }),
    );
    expect(parts.find((part) => part.kind === "slide-layout")?.payload).toEqual(
      expect.objectContaining({
        kind: "slide-layout",
        layoutType: "blank",
        slideMasterPartId: parts.find((part) => part.kind === "slide-master")?.id,
        placeholderStrategy: "none",
      }),
    );
    expect(project.summary?.parts.find((part) => part.kind === "content-types")).toEqual(
      expect.objectContaining({ contentTypeCount: expect.any(Number) }),
    );
    expect(project.summary?.parts.find((part) => part.path === "_rels/.rels")).toEqual(
      expect.objectContaining({ relationshipCount: 3 }),
    );
  });

  test("project records unprojected theme default mappings with warning diagnostics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "#334155", filter: "blur(2px)" } } }),
    });
    deck.slide({ name: "Theme unsupported default" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Filtered default</p>
    ));

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as PptxThemePartPayload | undefined;
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
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({
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
      ?.payload as PptxThemePartPayload | undefined;
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
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({
        defaults: { p: { color: "#2563EB", fontFamily: "Aptos", fontSize: 20 } },
      }),
    });
    deck.slide({ name: "Theme reference choices" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme reference</p>
    ));

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as PptxThemePartPayload | undefined;
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
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({
        defaults: { p: { color: "#2563EB", filter: "blur(2px)", fontFamily: "Aptos" } },
      }),
    });
    deck.slide({ name: "Theme detail" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme detail</p>
    ));

    const summaryProject = await deck.project();
    const detailedProject = await deck.project({ inspection: "details" });
    const themePart = detailedProject.projection?.parts.find((part) => part.kind === "theme");
    const themePayload = themePart?.payload as PptxThemePartPayload | undefined;
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

  test("defineGraph keeps the source stylesheet context for projection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: {
            target: "p.title",
            style: { x: 1, y: 1, width: 4, height: 0.5, color: "red", fontSize: 28 },
          },
        },
      }),
    );
    deck.slide({ name: "Styled graph" }, () => (
      <>
        <p className="title">Styled title</p>
      </>
    ));

    const graph = deck.compile().graph!;
    deck.defineGraph(graph);

    const project = await deck.project();
    const text = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(text?.kind).toBe("text");
    expect(text?.kind === "text" ? text.style.color : undefined).toBe("FF0000");
    expect(text?.kind === "text" ? text.style.fontSizePt : undefined).toBe(28);
  });

  test("defineProjection reports lightweight format diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Projection shape" }, () => <></>);

    const projection = (await deck.project()).projection!;
    deck.defineProjection({ ...projection, format: "pdf" as never });

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.stages.project.artifact).toBe("missing");
    expect(project.summary).toBeUndefined();
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_FORMAT" }),
    );
  });

  test("defineProjection keeps invalid projection shapes as diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

  test("project validates defined projection package consistency before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

  test("project validates text drawing style payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken text style" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}> style</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? {
                  ...element,
                  content: {
                    ...element.content,
                    runs: [
                      {
                        text: "run",
                        style: {
                          textAlign: "middle",
                          tabStops: [{ positionIn: Number.NaN, alignment: "center" }],
                          list: { type: "number", style: "decimal", startAt: -1 },
                          fontWeight: 0,
                        },
                      },
                    ],
                  },
                  style: {
                    ...element.style,
                    fontSizePt: Number.NaN,
                    fontWeight: 2000,
                    underlineColor: "#123456",
                    underlineStyle: "wave",
                    textDirection: "vertical",
                    verticalAlign: "center",
                    paddingPt: [0, 1, "bad", 3],
                    lineSpacing: -1,
                    lineSpacingMultiple: 0,
                    paragraphSpacingBefore: Number.NaN,
                    paragraphSpacingAfter: -1,
                    charSpacing: "wide",
                    list: { type: "bullet", characterCode: "1" },
                    fit: "stretch",
                    wrap: "yes",
                  },
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    for (const path of [
      ".drawing.children.0.content.runs.0.style.textAlign",
      ".drawing.children.0.content.runs.0.style.tabStops.0.positionIn",
      ".drawing.children.0.content.runs.0.style.tabStops.0.alignment",
      ".drawing.children.0.content.runs.0.style.list.style",
      ".drawing.children.0.content.runs.0.style.list.startAt",
      ".drawing.children.0.content.runs.0.style.fontWeight",
      ".drawing.children.0.style.fontSizePt",
      ".drawing.children.0.style.fontWeight",
      ".drawing.children.0.style.underlineColor",
      ".drawing.children.0.style.underlineStyle",
      ".drawing.children.0.style.textDirection",
      ".drawing.children.0.style.verticalAlign",
      ".drawing.children.0.style.paddingPt.2",
      ".drawing.children.0.style.lineSpacing",
      ".drawing.children.0.style.lineSpacingMultiple",
      ".drawing.children.0.style.paragraphSpacingBefore",
      ".drawing.children.0.style.paragraphSpacingAfter",
      ".drawing.children.0.style.charSpacing",
      ".drawing.children.0.style.list.characterCode",
      ".drawing.children.0.style.fit",
      ".drawing.children.0.style.wrap",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path) }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("render validation requires projected text body root values", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing text body values" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}> body values</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing underline style" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5, underline: true }}>Underlined</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing stroke dash type" }, () => (
      <shape
        shape="rect"
        style={{ x: 1, y: 1, width: 2, height: 1, fill: "#F8FAFC", stroke: "1pt dashed #2563EB" }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Negative stroke width" }, () => (
      <shape
        shape="rect"
        style={{ x: 1, y: 1, width: 2, height: 1, fill: "#F8FAFC", stroke: "1pt solid #2563EB" }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Out of range gradient stop" }, () => (
      <shape
        shape="rect"
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          fill: "linear-gradient(90deg, #2563EB 0%, #F97316 100%)",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing shadow opacity" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1, boxShadow: "3px 3px 6px rebeccapurple" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing shadow geometry" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1, boxShadow: "3px 3px 6px rebeccapurple" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
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
    } as PptxSlidePart;

    const result = await renderPptxPackage({
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

  test("project validates drawing paint and effect payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken drawing paint" }, () => (
      <>
        <div style={{ x: 0.5, y: 0.5, width: 4, height: 2 }}>
          <p style={{ x: 0.25, y: 0.25, width: 2, height: 0.5 }}>Paint</p>
        </div>
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 5, y: 0.5, width: 1, height: 1 }} />
        <shape shape="rect" style={{ x: 6.5, y: 0.5, width: 1, height: 1 }} />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind === "group") {
              return {
                ...element,
                fill: { kind: "solid", color: "#111111", transparency: -1 },
                backgroundLayers: [
                  {
                    kind: "background-image",
                    frame: { xEmu: 0, yEmu: 0, widthEmu: 0, heightEmu: 914400 },
                    sourceFrame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                    source: { kind: "url", url: "" },
                    fit: "tile",
                    repeat: "sometimes",
                    size: { widthEmu: -1 },
                    objectPosition: { x: Number.NaN, y: 0.5 },
                    transparency: 101,
                  },
                  { kind: "linear-gradient", angle: Number.NaN, stops: [] },
                ],
                stroke: {
                  color: "not-a-color",
                  widthPt: Number.NaN,
                  style: "double",
                  dashType: "dots",
                  lineCap: "flat",
                  lineJoin: "curve",
                  transparency: 101,
                },
                edgeStrokes: { left: { color: "not-a-color", widthPt: Number.NaN } },
                outline: { color: "not-a-color", widthPt: Number.NaN },
                generatedStrokes: [
                  {
                    kind: "stroke",
                    role: "border",
                    id: "",
                    serialized: { shapeObjectId: "9007199254740991" },
                    frame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 0 },
                    stroke: { color: "not-a-color", widthPt: Number.NaN },
                    shape: "curve",
                    paintOrder: {
                      siblingOrder: -1,
                      zIndex: Number.NaN,
                      generatedLayerRole: "outline",
                    },
                  },
                ],
                shadow: {
                  type: "drop",
                  color: "not-a-color",
                  opacity: 2,
                  blurPt: Number.NaN,
                  offsetPt: Number.NaN,
                  angle: Number.NaN,
                },
                radiusEmu: -1,
              };
            }
            if (element.kind === "image") {
              return { ...element, shadow: { type: "drop", color: "not-a-color", opacity: -0.1 } };
            }
            if (element.kind === "shape") {
              return {
                ...element,
                fill: {
                  kind: "radial-gradient",
                  shape: "square",
                  center: { x: Number.NaN, y: 0.5 },
                  radius: { x: -1, y: Number.NaN },
                  stops: [{ color: "not-a-color", position: Number.NaN, transparency: -1 }],
                },
                stroke: { color: "not-a-color", widthPt: Number.NaN },
                radiusEmu: Number.NaN,
              };
            }
            return element;
          }),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    for (const path of [
      ".drawing.children.0.fill.color",
      ".drawing.children.0.fill.transparency",
      ".drawing.children.0.backgroundLayers.0.frame.widthEmu",
      ".drawing.children.0.backgroundLayers.0.sourceFrame.widthEmu",
      ".drawing.children.0.backgroundLayers.0.source.url",
      ".drawing.children.0.backgroundLayers.0.fit",
      ".drawing.children.0.backgroundLayers.0.repeat",
      ".drawing.children.0.backgroundLayers.0.size.widthEmu",
      ".drawing.children.0.backgroundLayers.0.objectPosition.x",
      ".drawing.children.0.backgroundLayers.0.transparency",
      ".drawing.children.0.backgroundLayers.1.frame",
      ".drawing.children.0.backgroundLayers.1.angle",
      ".drawing.children.0.backgroundLayers.1.stops",
      ".drawing.children.0.stroke.color",
      ".drawing.children.0.stroke.widthPt",
      ".drawing.children.0.stroke.style",
      ".drawing.children.0.stroke.dashType",
      ".drawing.children.0.stroke.lineCap",
      ".drawing.children.0.stroke.lineJoin",
      ".drawing.children.0.stroke.transparency",
      ".drawing.children.0.edgeStrokes.left.color",
      ".drawing.children.0.edgeStrokes.left.widthPt",
      ".drawing.children.0.outline.color",
      ".drawing.children.0.outline.widthPt",
      ".drawing.children.0.generatedStrokes.0.id",
      ".drawing.children.0.generatedStrokes.0.serialized.shapeObjectId",
      ".drawing.children.0.generatedStrokes.0.frame.widthEmu",
      ".drawing.children.0.generatedStrokes.0.stroke.color",
      ".drawing.children.0.generatedStrokes.0.stroke.widthPt",
      ".drawing.children.0.generatedStrokes.0.shape",
      ".drawing.children.0.generatedStrokes.0.paintOrder.siblingOrder",
      ".drawing.children.0.generatedStrokes.0.paintOrder.zIndex",
      ".drawing.children.0.generatedStrokes.0.paintOrder.generatedLayerRole",
      ".drawing.children.0.shadow.type",
      ".drawing.children.0.shadow.color",
      ".drawing.children.0.shadow.opacity",
      ".drawing.children.0.shadow.blurPt",
      ".drawing.children.0.shadow.offsetPt",
      ".drawing.children.0.shadow.angle",
      ".drawing.children.0.radiusEmu",
      ".drawing.children.1.shadow.type",
      ".drawing.children.1.shadow.color",
      ".drawing.children.1.shadow.opacity",
      ".drawing.children.2.fill.shape",
      ".drawing.children.2.fill.center.x",
      ".drawing.children.2.fill.radius.x",
      ".drawing.children.2.fill.radius.y",
      ".drawing.children.2.fill.stops.0.color",
      ".drawing.children.2.fill.stops.0.position",
      ".drawing.children.2.fill.stops.0.transparency",
      ".drawing.children.2.stroke.color",
      ".drawing.children.2.stroke.widthPt",
      ".drawing.children.2.radiusEmu",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path) }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke paint order against owner paint order", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Generated stroke order" }, () => (
      <div
        style={{ x: 0.5, y: 0.5, width: 4, height: 2, borderTop: "2pt solid #ff0000", zIndex: 4 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "group" || !element.generatedStrokes?.[0]) {
              return element;
            }

            return {
              ...element,
              generatedStrokes: element.generatedStrokes.map((layer, index) =>
                index === 0
                  ? {
                      ...layer,
                      paintOrder: {
                        ...layer.paintOrder,
                        siblingOrder: layer.paintOrder.siblingOrder + 1,
                        zIndex: (layer.paintOrder.zIndex ?? 0) + 1,
                      },
                    }
                  : layer,
              ),
            };
          }),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    for (const path of [
      ".drawing.children.0.generatedStrokes.0.paintOrder.siblingOrder",
      ".drawing.children.0.generatedStrokes.0.paintOrder.zIndex",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path) }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates required generated stroke layers before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing generated strokes" }, () => (
      <div
        style={{
          x: 0.5,
          y: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "group" ? { ...element, generatedStrokes: undefined } : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    for (const message of [
      "missing generated border stroke layer for top edge",
      "missing generated outline stroke layer",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.generatedStrokes"),
              message,
            }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates partially missing generated stroke layers before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Partially missing generated strokes" }, () => (
      <div
        style={{
          x: 0.5,
          y: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.filter(
                    (layer) => layer.role !== "outline",
                  ),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes"),
            message: "missing generated outline stroke layer",
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).not.toContainEqual(
      expect.objectContaining({
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes"),
            message: "missing generated border stroke layer for top edge",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke layers against owner stroke semantics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale generated stroke payloads" }, () => (
      <div
        style={{
          x: 0.5,
          y: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer) => {
                    if (layer.role === "border" && layer.edge === "top") {
                      return { ...layer, shape: "rect", frame: { ...layer.frame, heightEmu: 1 } };
                    }
                    if (layer.role === "outline") {
                      return {
                        ...layer,
                        frame: { ...layer.frame, xEmu: layer.frame.xEmu + 1 },
                        stroke: { ...layer.stroke, color: "000000" },
                      };
                    }
                    return layer;
                  }),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    for (const [path, message] of [
      [
        ".drawing.children.0.generatedStrokes.0.shape",
        "generated border stroke shape must be line",
      ],
      [
        ".drawing.children.0.generatedStrokes.0.frame",
        "generated border stroke frame must match owner top edge frame",
      ],
      [
        ".drawing.children.0.generatedStrokes.1.frame",
        "generated outline stroke frame must match owner frame",
      ],
      [
        ".drawing.children.0.generatedStrokes.1.stroke",
        "generated outline stroke must match owner outline stroke",
      ],
    ] as const) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path), message }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke element ids against owner identity", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale generated stroke identity" }, () => (
      <div
        style={{
          x: 0.5,
          y: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer) =>
                    layer.role === "outline"
                      ? { ...layer, id: `${element.id}:generated:outline:stale` }
                      : layer,
                  ),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes.1.id"),
            message: "generated stroke id must be derived from owner element id and layer role",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke shape object ids against owner identity", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale generated shape id" }, () => (
      <div
        style={{
          x: 0.5,
          y: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer) =>
                    layer.role === "outline"
                      ? { ...layer, serialized: { ...layer.serialized, shapeObjectId: "99999" } }
                      : layer,
                  ),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              ".drawing.children.0.generatedStrokes.1.serialized.shapeObjectId",
            ),
            message:
              "generated stroke shape object id must be derived from owner shape object id and layer index",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke shape object ids stay derivable in writer-safe range", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Overflow generated shape id" }, () => (
      <div style={{ x: 0.5, y: 0.5, width: 4, height: 2, borderTop: "2pt solid #ff0000" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  serialized: { ...element.serialized, shapeObjectId: "90071992547410" },
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              ".drawing.children.0.generatedStrokes.0.serialized.shapeObjectId",
            ),
            message:
              "generated stroke shape object id must be derived from owner shape object id within the writer-safe range",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates serialized shape object id uniqueness across generated strokes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate generated shape id" }, () => (
      <div style={{ x: 0.5, y: 0.5, width: 4, height: 2, outline: "2pt solid #00aa66" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "group" || !element.generatedStrokes?.[0]) {
              return element;
            }

            return {
              ...element,
              generatedStrokes: element.generatedStrokes.map((layer, index) =>
                index === 0
                  ? {
                      ...layer,
                      serialized: {
                        ...layer.serialized,
                        shapeObjectId: element.serialized.shapeObjectId,
                      },
                    }
                  : layer,
              ),
            };
          }),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        title: "pptx drawing serialized identity is duplicated",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              ".drawing.children.0.generatedStrokes.0.serialized.shapeObjectId",
            ),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.serialized.shapeObjectId"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing element id uniqueness across generated strokes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate generated element id" }, () => (
      <div style={{ x: 0.5, y: 0.5, width: 4, height: 2, outline: "2pt solid #cc5500" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "group" || !element.generatedStrokes?.[0]) {
              return element;
            }

            return {
              ...element,
              generatedStrokes: element.generatedStrokes.map((layer, index) =>
                index === 0 ? { ...layer, id: element.id } : layer,
              ),
            };
          }),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        title: "pptx drawing element identity is duplicated",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes.0.id"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".drawing.children.0.id") }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates duplicate package paths and relationship target path mismatches", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package paths" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const firstPart = projection.parts[0]!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    deck.defineProjection({
      ...projection,
      parts: [
        ...projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: (
                  part.relationships ??
                  (part.payload as PptxRelationshipsPayload | undefined)?.relationships ??
                  []
                ).map((relationship, index) =>
                  index === 0
                    ? { ...relationship, targetPath: "ppt/incorrect-presentation.xml" }
                    : relationship,
                ),
                payload: {
                  relationships: (
                    (part.payload as PptxRelationshipsPayload | undefined)?.relationships ??
                    part.relationships ??
                    []
                  ).map((relationship, index) =>
                    index === 0
                      ? { ...relationship, targetPath: "ppt/incorrect-presentation.xml" }
                      : relationship,
                  ),
                } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
        { ...firstPart, id: `${firstPart.id}:duplicate-path` as never },
      ],
    });

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_DUPLICATE_PART_PATH" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_RELATIONSHIP_TARGET_PATH_MISMATCH" }),
    );
  });

  test("project validates support XML relationship ids required from relationship payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing support relationship" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const presentationRelationships = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.id === presentationRelationships.id
          ? {
              ...part,
              payload: {
                relationships: (
                  (part.payload as PptxRelationshipsPayload | undefined)?.relationships ?? []
                ).filter((relationship) => relationship.type !== "slideMaster"),
              } satisfies PptxRelationshipsPayload,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Presentation XML requires a projected slideMaster relationship id.",
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates presentation support relationships required by package topology", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing presentation support relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>support</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = expectPptxPart(projection.parts, "presentation");
    const presentationRelationships = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    const strippedRelationships = (
      (presentationRelationships.payload as PptxRelationshipsPayload | undefined)?.relationships ??
      []
    ).filter(
      (relationship) =>
        relationship.type !== "theme" &&
        relationship.type !== "viewProperties" &&
        relationship.type !== "presentationProperties",
    );
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === presentationRelationships.id
            ? {
                ...part,
                relationships: strippedRelationships,
                payload: {
                  relationships: strippedRelationships,
                } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Presentation relationships require projected theme relationship ids.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.relationships`,
            message: expect.stringContaining("missing theme relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Presentation relationships require a projected viewProperties relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.relationships`,
            message: expect.stringContaining("missing viewProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message:
          "Presentation relationships require a projected presentationProperties relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.relationships`,
            message: expect.stringContaining("missing presentationProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates slide master and layout support relationships required by package topology", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing master layout relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>support</p>
    ));

    const projection = (await deck.project()).projection!;
    const slideMaster = expectPptxPart(projection.parts, "slide-master");
    const slideLayout = expectPptxPart(projection.parts, "slide-layout");
    const slideMasterRelationships = projection.parts.find(
      (part) => part.path === "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    )!;
    const slideLayoutRelationships = projection.parts.find(
      (part) => part.path === "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    )!;
    const stripRelationships = (
      part: PptxPackageModel["parts"][number],
      types: readonly string[],
    ): PptxPackageModel["parts"][number] => {
      const relationships = (
        (part.payload as PptxRelationshipsPayload | undefined)?.relationships ?? []
      ).filter((relationship) => !types.includes(relationship.type));
      return {
        ...part,
        relationships,
        payload: { relationships } satisfies PptxRelationshipsPayload,
      };
    };

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === slideMasterRelationships.id) {
            return stripRelationships(part, ["slideLayout", "theme"]);
          }
          if (part.id === slideLayoutRelationships.id) {
            return stripRelationships(part, ["slideMaster"]);
          }
          return part;
        }),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Slide master XML requires projected slideLayout relationship ids.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slideMaster.id}.relationships`,
            message: expect.stringContaining("missing slideLayout relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Slide master XML requires a projected theme relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slideMaster.id}.relationships`,
            message: expect.stringContaining("missing theme relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Slide layout XML requires a projected slideMaster relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slideLayout.id}.relationships`,
            message: expect.stringContaining("missing slideMaster relationship to "),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates root package relationships required to open the PPTX package", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing root relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>root</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const strippedRelationships = (rootRelationships.payload.relationships ?? []).filter(
      (relationship) =>
        relationship.type !== "officeDocument" &&
        relationship.type !== "coreProperties" &&
        relationship.type !== "extendedProperties",
    );
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: strippedRelationships,
                payload: {
                  relationships: strippedRelationships,
                } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Root relationships require a projected officeDocument relationship.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
            message: expect.stringContaining("missing officeDocument relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Root relationships require a projected coreProperties relationship.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
            message: expect.stringContaining("missing coreProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Root relationships require a projected extendedProperties relationship.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
            message: expect.stringContaining("missing extendedProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates manifest payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken manifest payload" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = expectPptxPart(projection.parts, "presentation");
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
            } satisfies PptxContentTypesPayload,
          };
        }

        if (part.path === "_rels/.rels") {
          return {
            ...part,
            payload: {
              relationships: [
                {
                  id: "" as PptxRelationship["id"],
                  type: "",
                  target: "",
                  targetPath: "",
                  targetMode: "internal",
                } as never,
                {
                  id: "bad id" as PptxRelationship["id"],
                  type: "officeDocument",
                  target: presentationPart.path,
                  targetPath: presentationPart.path,
                  targetPartId: presentationPart.id,
                },
                {
                  id: "rIdDuplicate" as PptxRelationship["id"],
                  type: "officeDocument",
                  target: presentationPart.path,
                  targetPath: presentationPart.path,
                  targetPartId: presentationPart.id,
                },
                {
                  id: "rIdDuplicate" as PptxRelationship["id"],
                  type: "officeDocument",
                  target: presentationPart.path,
                  targetPath: presentationPart.path,
                  targetPartId: presentationPart.id,
                },
              ],
            } satisfies PptxRelationshipsPayload,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken content type part name" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest path</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const contentTypesPart = expectPptxPart(projection.parts, "content-types");
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id !== contentTypesPart.id) {
            return part;
          }

          const payload = part.payload as PptxContentTypesPayload;
          return {
            ...part,
            payload: {
              ...payload,
              overrides: payload.overrides.map((override) =>
                override.partName === `/${slidePart.path}`
                  ? { ...override, partName: "/ppt\\slides\\slide1.xml" }
                  : override,
              ),
            } satisfies PptxContentTypesPayload,
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

  test("project rejects known package relationships marked as external", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "External package relationship" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const externalOfficeDocument = (rootRelationships.payload.relationships ?? []).map(
      (relationship, index) =>
        index === 0
          ? { ...relationship, targetMode: "external", targetPartId: undefined }
          : relationship,
    ) as PptxRelationship[];
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.id === rootRelationships.id
          ? {
              ...part,
              relationships: externalOfficeDocument,
              payload: { relationships: externalOfficeDocument } satisfies PptxRelationshipsPayload,
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
          code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.0.targetMode"),
              message: "officeDocument relationships must target package parts",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.0.targetMode"),
              message: "officeDocument relationships must target package parts",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates external relationship targets use supported URL schemes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "External target URL" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const payload = rootRelationships.payload;
    const relationships = [
      ...(payload.relationships ?? []),
      {
        id: "rIdInvalidExternal" as PptxRelationship["id"],
        type: "https://deckjsx.dev/relationships/external-test",
        target: "javascript:alert(1)",
        targetMode: "external",
        targetPath: "javascript:alert(1)",
      },
    ] satisfies PptxRelationshipsPayload["relationships"];
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships,
                payload: { relationships } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.relationships"),
              message: "invalid relationship target path",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships"),
              message: "invalid relationship target path",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates relationship types are known tokens or relationship URIs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship type" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const payload = rootRelationships.payload;
    const relationships = [
      ...(payload.relationships ?? []),
      {
        id: "rIdInvalidType" as PptxRelationship["id"],
        type: "not a relationship uri",
        target: "https://example.test/target",
        targetMode: "external",
        targetPath: "https://example.test/target",
      },
    ] satisfies PptxRelationshipsPayload["relationships"];
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships,
                payload: { relationships } satisfies PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.relationships"),
              message: "invalid relationship type",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships"),
              message: "invalid relationship type",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates relationships part owners before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Orphan relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const orphanRelationshipsPath = "ppt/orphan/_rels/missing.xml.rels";
    const orphanRelationshipsPart = {
      id: "pptx:test:orphan-relationships" as PackagePartId,
      category: "manifest",
      kind: "relationships",
      path: orphanRelationshipsPath,
      orderKey: {
        group: "other",
        groupOrder: 999,
        sequence: 999,
        path: orphanRelationshipsPath,
        value: `999:000999:${orphanRelationshipsPath}`,
      },
      fingerprint: "test:orphan-relationships",
      requirement: {
        status: "optional",
        required: false,
        reason: "orphan relationship part topology test",
      },
      payload: { relationships: [] } satisfies PptxRelationshipsPayload,
    } satisfies PptxPackageModel["parts"][number];
    deck.defineProjection({ ...projection, parts: [...projection.parts, orphanRelationshipsPart] });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_ORPHAN_RELATIONSHIPS_PART",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${orphanRelationshipsPart.id}.path`,
            message: "missing relationship owner ppt/orphan/missing.xml",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates content type coverage before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing content type coverage" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const mediaExtension = mediaPart.path.split(".").pop();
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "content-types") {
          return part;
        }
        const payload = part.payload as PptxContentTypesPayload;
        return {
          ...part,
          payload: {
            defaults: payload.defaults.filter((item) => item.extension !== mediaExtension),
            overrides: payload.overrides.filter((item) => item.partName !== `/${slidePart.path}`),
          } satisfies PptxContentTypesPayload,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken content type default extension" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const mediaExtension = mediaPart.path.split(".").pop()!;
    const contentTypesPart = expectPptxPart(projection.parts, "content-types");
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id !== contentTypesPart.id) {
            return part;
          }

          const payload = part.payload as PptxContentTypesPayload;
          return {
            ...part,
            payload: {
              ...payload,
              defaults: payload.defaults.map((item) =>
                item.extension === mediaExtension
                  ? { ...item, extension: `.${mediaExtension}` }
                  : item,
              ),
            } satisfies PptxContentTypesPayload,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid content type values" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const mediaExtension = mediaPart.path.split(".").pop()!;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind !== "content-types") {
            return part;
          }
          const payload = part.payload as PptxContentTypesPayload;
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
            } satisfies PptxContentTypesPayload,
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

  test("project validates media payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken media payload" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "media"
          ? {
              ...part,
              payload: {
                ...(part.payload as PptxMediaPartPayload),
                source: { kind: "file", path: "" },
                sources: [{ kind: "url", url: "" }],
                elementId: "",
                elementIds: [""],
                assetEntityId: "",
                assetEntityIds: [""],
                allocationKey: "",
                metadata: {
                  mediaType: "",
                  extension: "",
                  widthPx: 0,
                  heightPx: Number.NaN,
                  byteLength: -1,
                  hash: "",
                },
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
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".source.kind") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".sources.0.url") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".elementId") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".assetEntityIds.0") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".metadata.widthPx") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".metadata.byteLength") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project requires media payload source aliases before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing media sources" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "media") {
          return part;
        }

        const payload = part.payload as PptxMediaPartPayload;
        const { sources: _sources, ...payloadWithoutSources } = payload;
        return { ...part, payload: payloadWithoutSources as PptxMediaPartPayload };
      }),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.sources"),
            message: "invalid media sources",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates media dimensions required by image fitting before render", async () => {
    const withoutMediaDimensions = (projection: PptxPackageModel): PptxPackageModel =>
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind !== "media") {
            return part;
          }

          const payload = part.payload as PptxMediaPartPayload;
          const { widthPx: _widthPx, heightPx: _heightPx, ...metadata } = payload.metadata ?? {};
          return {
            ...part,
            payload: {
              ...payload,
              ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: undefined }),
            },
          };
        }),
      });

    const imageDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    imageDeck.slide({ name: "Missing image dimensions" }, () => (
      <img
        data={SAMPLE_SVG_DATA_URI}
        style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "contain" }}
      />
    ));
    const imageProjection = (await imageDeck.project()).projection!;
    imageDeck.defineProjection(withoutMediaDimensions(imageProjection));

    const imageProject = await imageDeck.project();
    const imageRender = await imageDeck.render();
    expect(imageProject.ok).toBe(false);
    expect(imageProject.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.mediaPartId"),
            message: "image contain requires projected media metadata widthPx and heightPx",
          }),
        ]),
      }),
    );
    expect(imageRender.ok).toBe(false);
    expect(imageRender.artifact).toBeUndefined();

    const backgroundDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    backgroundDeck.slide({ name: "Missing background dimensions" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 4,
          height: 2,
          background: `url("${SAMPLE_SVG_DATA_URI}")`,
          backgroundSize: "auto auto",
        }}
      />
    ));
    const backgroundProjection = (await backgroundDeck.project()).projection!;
    backgroundDeck.defineProjection(withoutMediaDimensions(backgroundProjection));

    const backgroundProject = await backgroundDeck.project();
    const backgroundRender = await backgroundDeck.render();
    expect(backgroundProject.ok).toBe(false);
    expect(backgroundProject.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".backgroundLayers.0.source"),
            message: "background image size requires projected media metadata widthPx and heightPx",
          }),
        ]),
      }),
    );
    expect(backgroundRender.ok).toBe(false);
    expect(backgroundRender.artifact).toBeUndefined();
  });

  test("project validates media payload cross-field consistency before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Inconsistent media payload" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const mediaPayload = mediaPart.payload;
    const sourceAlias = { kind: "url" as const, url: "https://assets.example.test/chart.png" };
    const primaryElementId = "pptx:test:primary-element" as PptxElementId;
    const otherElementId = "pptx:test:other-element" as PptxElementId;
    const primaryAssetId = "asset:test:primary" as AssetEntityId;
    const otherAssetId = "asset:test:other" as AssetEntityId;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  sources: [sourceAlias, sourceAlias],
                  elementId: primaryElementId,
                  elementIds: [otherElementId, otherElementId],
                  assetEntityId: primaryAssetId,
                  assetEntityIds: [otherAssetId, otherAssetId],
                  allocationKey: "source:test:media",
                  metadata: {
                    mediaType: "image/png",
                    extension: "png",
                    hash: "sha256:inconsistent-media",
                  },
                } satisfies PptxMediaPartPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".metadata.extension"),
              message: expect.stringContaining("package path extension"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".metadata.mediaType"),
              message: expect.stringContaining("manifest default"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".sources"),
              message: "media sources do not include primary source",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".sources.1"),
              message: "duplicate media source entry",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementIds"),
              message: expect.stringContaining("primary value"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementIds.1"),
              message: expect.stringContaining("duplicate media element ids entry"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityIds"),
              message: expect.stringContaining("primary value"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityIds.1"),
              message: expect.stringContaining("duplicate media asset ids entry"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".allocationKey"),
              message: "media allocation key does not include metadata hash",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates media payload element references against drawing ids", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Orphan media element" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const mediaPayload = mediaPart.payload;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  elementId: "pptx:test:missing-media-owner" as PptxElementId,
                  elementIds: [
                    mediaPayload.elementId!,
                    "pptx:test:missing-media-owner" as PptxElementId,
                  ],
                } satisfies PptxMediaPartPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementId"),
              message: expect.stringContaining("does not reference a projected drawing element"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementIds.1"),
              message: expect.stringContaining("does not reference a projected drawing element"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates media payload asset references against drawing origins", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "asset-reference-test",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1, byteLength: 8 }
          : undefined;
      },
    });
    deck.slide({ name: "Orphan media asset" }, () => (
      <img src="/public/chart.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = expectPptxPart(projection.parts, "media");
    const mediaPayload = mediaPart.payload;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  assetEntityId: "asset:test:missing-media-origin" as AssetEntityId,
                  assetEntityIds: [
                    mediaPayload.assetEntityId!,
                    "asset:test:missing-media-origin" as AssetEntityId,
                  ],
                } satisfies PptxMediaPartPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityId"),
              message: expect.stringContaining("does not reference a projected drawing origin"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityIds.1"),
              message: expect.stringContaining("does not reference a projected drawing origin"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates image drawing relationships before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken image relationships" }, () => (
      <>
        <img
          data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 1, height: 1, objectFit: "stretch" }}
        />
        <img
          data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
          style={{ x: 2, y: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element, index) => {
            if (element.kind !== "image") {
              return element;
            }
            if (index === 0) {
              return {
                ...element,
                serialized: { ...element.serialized, relationshipId: "rIdMissing" },
              };
            }
            return { ...element, mediaPartId: slidePart.id };
          }),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.serialized.relationshipId"),
              message: "missing image relationship rIdMissing",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.1.mediaPartId"),
              message: expect.stringContaining("does not match relationship"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.1.mediaPartId"),
              message: "image media part id targets slide",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates background image relationships before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken background image relationship" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          background: "url(data:image/png;base64,iVBORw0KGgo=)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.filter(
        (relationship) => relationship.type !== "image",
      ),
    } satisfies PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".backgroundLayers.0.source"),
            message: expect.stringContaining("missing background image relationship"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing hyperlink relationships before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken hyperlink relationships" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, href: "https://example.test/one" }}>One</p>
        <p style={{ x: 1, y: 2, width: 2, height: 0.5, href: "https://example.test/two" }}>Two</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const second = slidePart.payload.drawing.children[1];
    const secondRelationshipId =
      second?.kind === "text" ? second.serialized.hyperlinkRelationshipId : undefined;
    const malformedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.map((relationship) =>
        relationship.id === secondRelationshipId
          ? { ...relationship, targetPath: "https://example.test/wrong" }
          : relationship,
      ),
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element, index) => {
            if (element.kind !== "text" || index !== 0) {
              return element;
            }
            return {
              ...element,
              serialized: { ...element.serialized, hyperlinkRelationshipId: "rIdMissing" },
            };
          }),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(
                ".drawing.children.0.serialized.hyperlinkRelationshipId",
              ),
              message: "missing hyperlink relationship rIdMissing",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.1.hyperlink.url"),
              message: expect.stringContaining("does not match relationship"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates package model size and slides index before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package model" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Package model</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    deck.defineProjection({
      ...projection,
      size: { widthEmu: Number.NaN, heightEmu: -1 },
      slides: [
        {
          ...slidePart,
          path: "ppt/slides/not-slide1.xml",
          fingerprint: "test:stale-slide-index",
          payload: { ...slidePart.payload, name: "Slides index only edit" },
        },
      ],
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MODEL_SIZE",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "projection.size.widthEmu" }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MODEL_SIZE",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "projection.size.heightEmu" }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "projection.slides.0" }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project rejects duplicate package model slide index entries before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate slide index" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Slide index</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    deck.defineProjection({ ...projection, slides: [slidePart, slidePart] });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: "projection.slides.1.id",
            message: expect.stringContaining("duplicate slide part"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates slide payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
                ...(part as PptxSlidePart).payload,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken notes payload" }, () => <></>);

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: [
        ...projection.parts,
        {
          id: "pptx:test:notes-master" as PackagePartId,
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
    const deck = new Deck({
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
                ...slideLayoutPayload(part),
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
              ...slideMasterPayload(part),
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
              ...slideLayoutPayload(part),
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrong support payload targets" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support targets</p>
    ));

    const projection = (await deck.project()).projection!;
    const themePart = expectPptxPart(projection.parts, "theme");
    const slideMasterPart = expectPptxPart(projection.parts, "slide-master");
    const slideLayoutPart = expectPptxPart(projection.parts, "slide-layout");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id === slideMasterPart.id) {
          return {
            ...part,
            payload: {
              ...slideMasterPayload(part),
              themePartId: slideLayoutPart.id,
              slideLayoutPartIds: [themePart.id],
            } as never,
          };
        }

        if (part.id === slideLayoutPart.id) {
          return {
            ...part,
            payload: {
              ...slideLayoutPayload(part),
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

  test("project validates drawing unsupported semantic fallback payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken unsupported fallback" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5, opacity: 0.4 }}>Faded</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? {
              ...part,
              payload: {
                ...slidePartPayload(part),
                drawing: {
                  ...slidePartPayload(part).drawing,
                  children: slidePartPayload(part).drawing.children.map((element) => ({
                    ...element,
                    unsupportedSemantics: [
                      {
                        feature: "opacity",
                        property: "stackingContext",
                        value: "0.4",
                        reason: "opacity fallback",
                        fallback: {
                          strategy: "paintWithMagic",
                          preserves: ["projectedOpacity", ""],
                          missing: "cssStackingContext",
                        },
                      },
                    ],
                  })),
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
      expect.objectContaining({ code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC" }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.0.fallback.strategy"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.0.fallback.preserves.1"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.0.fallback.missing"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project rejects non-object unsupported semantic records and empty fallback lists", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Malformed unsupported semantic" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5, opacity: 0.4 }}>Faded</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? {
              ...part,
              payload: {
                ...slidePartPayload(part),
                drawing: {
                  ...slidePartPayload(part).drawing,
                  children: slidePartPayload(part).drawing.children.map((element) => ({
                    ...element,
                    unsupportedSemantics: [
                      null,
                      {
                        feature: "opacity",
                        property: "stackingContext",
                        value: "0.4",
                        reason: "opacity fallback",
                        fallback: {
                          strategy: "preserveOpacityWithoutCompositedSubtree",
                          preserves: [],
                          missing: [],
                        },
                      },
                    ],
                  })),
                },
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
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".unsupportedSemantics.0") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.1.fallback.preserves"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.1.fallback.missing"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("defined projection reports valid model-owned unsupported semantic records as warnings", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Defined unsupported semantic" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>Defined fallback</p>
    ));

    const projection = (await deck.project()).projection!;
    const changedProjection = withFreshPackageFingerprints({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? {
              ...part,
              payload: {
                ...slidePartPayload(part),
                drawing: {
                  ...slidePartPayload(part).drawing,
                  children: slidePartPayload(part).drawing.children.map((element) => ({
                    ...element,
                    unsupportedSemantics: [
                      {
                        feature: "background",
                        property: "background",
                        value: "paint(deckjsx-custom)",
                        reason: "custom background fallback",
                        fallback: {
                          strategy: "preserveAuthoredValueOnly",
                          preserves: ["authoredBackgroundInput"],
                          missing: ["pptxBackgroundLayer"],
                        },
                      },
                    ],
                  })),
                },
              } as never,
            }
          : part,
      ),
    });
    deck.defineProjection(changedProjection);

    const project = await deck.project();
    const element = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        message: "custom background fallback",
        notes: expect.arrayContaining([
          `elementId=${element?.id}`,
          "feature=background",
          "property=background",
          "value=paint(deckjsx-custom)",
          "fallbackStrategy=preserveAuthoredValueOnly",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        value: "paint(deckjsx-custom)",
        elementId: element?.id,
        fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
      }),
    );
  });

  test("project validates drawing metadata payloads before render", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          areas: { title: { kind: "title", frame: { x: 0.5, y: 0.5, width: 8, height: 1 } } },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <p area={template.title}>Broken drawing metadata</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? {
              ...part,
              payload: {
                ...slidePartPayload(part),
                drawing: {
                  ...slidePartPayload(part).drawing,
                  children: slidePartPayload(part).drawing.children.map((element) => ({
                    ...element,
                    id: "",
                    kind: "magic",
                    frame: { xEmu: Number.NaN, yEmu: 0, widthEmu: -1, heightEmu: 914400 },
                    opacity: 1.5,
                    rotation: Number.POSITIVE_INFINITY,
                    zIndex: "front",
                    flipH: "yes",
                    flipV: 1,
                    visibility: "collapse",
                    serialized: { shapeObjectId: "9007199254740991" },
                    emissionTarget: "notes",
                    paintOrderIndex: -1,
                    paintOrder: {
                      siblingOrder: -1,
                      zIndex: Number.NaN,
                      generatedLayerRole: "magic",
                    },
                    layoutAnchor: {
                      template: "",
                      area: "",
                      kind: "headline",
                      frame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                    },
                    clip: {
                      strategy: "magicClip",
                      originalFrame: "missing",
                      clipFrame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                      visibleFrame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
                    },
                    measurement: {
                      frame: { xEmu: 0, yEmu: Number.NaN, widthEmu: 914400, heightEmu: 914400 },
                      overflow: "scroll",
                    },
                  })),
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
      expect.objectContaining({ code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA" }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".id") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".kind") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".frame.xEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".frame.widthEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".opacity") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".rotation") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".zIndex") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".flipH") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".flipV") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".visibility") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".serialized.shapeObjectId") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".emissionTarget") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".paintOrderIndex") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".paintOrder.generatedLayerRole"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".layoutAnchor.kind") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".layoutAnchor.frame.widthEmu"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".clip.strategy") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".clip.originalFrame") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".clip.clipFrame.widthEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".measurement.frame.yEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".measurement.overflow") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project inspection summary exposes top-level clipping metadata", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Summary clip" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>Clipped summary</p>
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const element = slide.payload.drawing.children[0]!;
    const originalFrame = element.frame;
    const clipFrame = {
      ...originalFrame,
      widthEmu: Math.max(1, Math.floor(originalFrame.widthEmu / 2)),
    };
    const clip = {
      strategy: "intersectParentOverflow",
      originalFrame,
      clipFrame,
      visibleFrame: clipFrame,
    } as const;
    const drawing = {
      ...slide.payload.drawing,
      children: slide.payload.drawing.children.map((drawingElement, index) =>
        index === 0 ? { ...drawingElement, clip } : drawingElement,
      ),
    };
    const parts = withPackagePartFingerprints(
      projection.parts.map((part) =>
        part.id === slide.id ? { ...part, payload: { ...slide.payload, drawing } as never } : part,
      ),
    );
    const updatedSlidePart =
      parts.find(
        (part): part is (typeof parts)[number] & PptxSlidePart =>
          part.id === slide.id && isPptxSlidePart(part),
      ) ?? slide;

    deck.defineProjection({
      ...projection,
      parts,
      slides: projection.slides.map((projectedSlide) =>
        projectedSlide.id === slide.id
          ? { ...updatedSlidePart, payload: { ...projectedSlide.payload, drawing } }
          : projectedSlide,
      ),
    });

    const project = await deck.project();
    const summaryElement = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(summaryElement?.clip).toEqual(clip);
    expect(summaryElement?.resolvedValues?.clip).toEqual(clip);
  });

  test("project validates drawing node package part ownership before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken drawing ownership" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>ownership</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const presentationPart = expectPptxPart(projection.parts, "presentation");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => ({
            ...element,
            packagePartId: presentationPart.id,
          })),
        },
      },
    } satisfies PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.packagePartId"),
            message: `drawing node does not belong to ${slidePart.id}`,
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates root drawing order metadata before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken root drawing order" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>One</p>
        <p style={{ x: 1, y: 2, width: 2, height: 0.5 }}>Two</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element, index) =>
            index === 0
              ? {
                  ...element,
                  emissionTarget: "slideLayout",
                  paintOrderIndex: 1,
                  paintOrder: undefined,
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.emissionTarget"),
              message: "emission target does not match slide",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.paintOrderIndex"),
              message: "paint order index does not match drawing order 0",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.paintOrder"),
              message: "invalid paint order",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates document property support payloads before render", async () => {
    const deck = new Deck({
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
            } as PptxSupportPartPayload,
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
            } as PptxSupportPartPayload,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
                ...extendedDocumentPropertiesPayload(part),
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
                  part.payload as Extract<PptxSupportPartPayload, { readonly kind: "presentation" }>
                ).slideMasterIds,
                defaultTextStyle: (
                  part.payload as Extract<PptxSupportPartPayload, { readonly kind: "presentation" }>
                ).defaultTextStyle,
                slidePartIds: ["pptx:missing-slide" as PackagePartId],
              } satisfies PptxSupportPartPayload,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrong presentation slide target" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Presentation</p>
    ));

    const projection = (await deck.project()).projection!;
    const themePart = expectPptxPart(projection.parts, "theme");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "presentation"
          ? {
              ...part,
              payload: {
                ...presentationPayload(part),
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
                ...presentationPayload(part),
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
                PptxSupportPartPayload,
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
            } satisfies PptxSupportPartPayload,
          };
        }

        if (part.kind === "slide-master") {
          return {
            ...part,
            payload: {
              ...(part.payload as PptxSlideMasterPartPayload),
              slideLayoutIds: (part.payload as PptxSlideMasterPartPayload).slideLayoutIds.map(
                (slideLayoutId) => ({ ...slideLayoutId, id: "1" }),
              ),
            } satisfies PptxSupportPartPayload,
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

  test("project rejects duplicate presentation slide ids across referenced slide parts", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate slide id 1" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>One</p>
    ));
    deck.slide({ name: "Duplicate slide id 2" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Two</p>
    ));

    const projection = (await deck.project()).projection!;
    const firstSlide = projection.slides[0]!;
    const secondSlide = {
      ...projection.slides[1]!,
      payload: { ...projection.slides[1]!.payload, slideId: firstSlide.payload.slideId },
    } satisfies PptxSlidePart;

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

  test("project validates empty support property payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

  test("project validates theme support payloads before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken theme payload" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme payload</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "theme"
          ? {
              ...part,
              payload: {
                ...themePayload(part),
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
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "#2563EB", fontFamily: "Aptos" } } }),
    });
    deck.slide({ name: "Broken theme trace" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme trace</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "theme"
          ? {
              ...part,
              payload: {
                ...(part.payload as PptxThemePartPayload),
                projection: {
                  ...(part.payload as PptxThemePartPayload).projection,
                  id: "",
                  purpose: "print",
                  source: "themeDefault",
                  trace: {
                    ...(part.payload as PptxThemePartPayload).projection.trace,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrong theme trace references" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme trace refs</p>
    ));

    const projection = (await deck.project()).projection!;
    const themePart = expectPptxPart(projection.parts, "theme");
    const slideMasterPart = expectPptxPart(projection.parts, "slide-master");
    const slideLayoutPart = expectPptxPart(projection.parts, "slide-layout");
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id !== themePart.id) {
          return part;
        }

        const payload = part.payload as PptxThemePartPayload;
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
                    graphNodeId: "graph:test:theme-trace" as GraphNodeId,
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
                    graphNodeId: "graph:test:theme-trace" as GraphNodeId,
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
          } satisfies PptxThemePartPayload,
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

  test("project summary does not expose default adapter limitations for the direct writer", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter limitations" }, () => <></>);

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(project.summary?.adapterLimitations).toEqual([]);
  });

  test("pipeline artifact collection keeps keyed snapshots behind whole-artifact defines", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Artifacts" }, () => <></>);
    const graph = deck.compile().graph!;
    const projection = (await deck.project()).projection!;
    const artifacts = new PipelineArtifactCollection();

    artifacts.replaceGraphArtifact(deck, graph);

    expect(artifacts.sourcesByKey.get("deck:root")?.rootCount).toBe(1);
    expect(artifacts.graph?.sourceKey).toBe("deck:root");
    expect(artifacts.graphsBySourceKey.get("deck:root")?.graph).toBe(graph);
    expect(artifacts.projection).toBeUndefined();

    artifacts.replaceProjectionArtifact(projection);

    expect(artifacts.graph).toBeUndefined();
    expect(artifacts.projection?.projection).toBe(projection);
    expect(artifacts.projection?.partsById.get(projection.parts[0]!.id)).toBe(projection.parts[0]);
    expect(artifacts.projection?.packageDependencies.dependenciesByPartId.size).toBeGreaterThan(0);
  });

  test("pipeline artifact invalidation clears stale package part build artifacts", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Build artifact lifecycle" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>lifecycle</p>
    ));
    const graph = deck.compile().graph!;
    const projection = (await deck.project()).projection!;
    const render = await renderPptxPackage(projection);
    const artifacts = new PipelineArtifactCollection();

    const materializeBuildArtifacts = () => {
      artifacts.materializePptxBuildArtifacts(render.buildArtifacts ?? []);
      expect(artifacts.pptxBuildArtifactsByPartId.size).toBeGreaterThan(0);
    };

    expect(render.artifact).toBeDefined();

    materializeBuildArtifacts();
    artifacts.invalidateFromSource();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.replaceGraphArtifact(deck, graph);
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.invalidateFromProjection();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.invalidateAssets();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.replaceProjectionArtifact(projection);
    expect(artifacts.projection?.projection).toBe(projection);
    expect(artifacts.graph).toBeUndefined();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBeGreaterThan(0);
  });

  test("stage operations materialize source graph and package part snapshots", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Materialized" }, () => <></>);
    const artifacts = new PipelineArtifactCollection();

    const compile = compileSource(deck, artifacts);
    const project = await projectSource({
      source: deck,
      options: deck.options,
      definedGraph: artifacts.graph,
      artifacts,
    });

    expect(compile.ok).toBe(true);
    expect(artifacts.sourcesByKey.get("deck:root")?.rootCount).toBe(1);
    expect(artifacts.graphsBySourceKey.get("deck:root")?.graph).toBe(compile.graph);
    expect(project.ok).toBe(true);
    expect(artifacts.projection?.projection).toBe(project.projection);
    expect(artifacts.projection?.partsById.size).toBe(project.projection?.parts.length);
  });

  test("stage artifacts keep mounted source and package part indexes", async () => {
    const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();

    parent.slide({ name: "Root" }, () => <></>);
    child.slide({ name: "Child" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Mounted source</p>
      </>
    ));
    parent.mount("child", child);

    const compile = compileSource(parent, artifacts);
    const project = await projectSource({
      source: parent,
      options: parent.options,
      definedGraph: artifacts.graph,
      artifacts,
    });

    expect(compile.ok).toBe(true);
    expect(artifacts.sourcesByKey.get("deck:root")?.rootCount).toBe(1);
    expect(artifacts.sourcesByKey.get("child")?.rootCount).toBe(1);
    expect(artifacts.graphsBySourceKey.get("deck:root")?.graphNodeIds.length).toBeGreaterThan(0);
    expect(artifacts.graphsBySourceKey.get("child")?.graphNodeIds.length).toBeGreaterThan(0);
    expect(artifacts.graphsBySourceKey.get("child")?.graphSlice.nodes.size).toBe(
      artifacts.graphsBySourceKey.get("child")?.graphNodeIds.length,
    );
    expect(
      [...(artifacts.graphsBySourceKey.get("child")?.graphSlice.nodes.values() ?? [])].every(
        (node) => node.origin.source?.kind === "mounted",
      ),
    ).toBe(true);
    expect(project.ok).toBe(true);
    expect(artifacts.projection?.partsBySourceKey.get("child")?.length).toBeGreaterThan(0);
  });

  test("projection artifacts expose package dependency snapshots", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();
    deck.slide({ name: "Package dependencies" }, () => (
      <img
        data={dataUriFromBytes("image/png", pngHeaderBytes(2, 1))}
        style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
      />
    ));

    const project = await projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "details" },
      artifacts,
    });
    const slide = project.projection?.slides[0];
    const contentTypes = project.projection?.parts.find(
      (part) => part.path === "[Content_Types].xml",
    );
    const presentation = project.projection?.parts.find((part) => part.kind === "presentation");
    const presentationRels = project.projection?.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const slideRels = project.projection?.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");
    const dependencyDetails = project.summary?.details?.packageDependencyInvalidation.entries ?? [];
    const detailEntryFor = (id: PackagePartId | undefined) =>
      dependencyDetails.find((entry) => entry.partId === id);

    expect(project.ok).toBe(true);
    expect(slide).toBeDefined();
    expect(contentTypes).toBeDefined();
    expect(presentation).toBeDefined();
    expect(presentationRels).toBeDefined();
    expect(slideRels).toBeDefined();
    expect(mediaPart).toBeDefined();
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(presentationRels!.id),
    ).toContain(slide!.id);
    expect(artifacts.projection?.packageDependencies.dependentsByPartId.get(slide!.id)).toContain(
      presentationRels!.id,
    );
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(contentTypes!.id),
    ).toContain(slide!.id);
    expect(artifacts.projection?.packageDependencies.dependentsByPartId.get(slide!.id)).toContain(
      contentTypes!.id,
    );
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(presentation!.id),
    ).toContain(presentationRels!.id);
    expect(
      artifacts.projection?.packageDependencies.dependentsByPartId.get(presentationRels!.id),
    ).toContain(presentation!.id);
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(slideRels!.id),
    ).toContain(mediaPart!.id);
    expect(
      artifacts.projection?.packageDependencies.dependentsByPartId.get(mediaPart!.id),
    ).toContain(slideRels!.id);
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(mediaPart!.id),
    ).toContain(slideRels!.id);
    expect(
      artifacts.projection?.packageDependencies.dependentsByPartId.get(slideRels!.id),
    ).toContain(mediaPart!.id);
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentationRels!.id,
        targetPartId: slide!.id,
        reason: "relationshipTarget",
        relationshipType: "slide",
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: contentTypes!.id,
        targetPartId: slide!.id,
        reason: "contentTypeOverride",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentation!.id,
        targetPartId: presentationRels!.id,
        reason: "dependencyFingerprint",
        fingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: mediaPart!.id,
        targetPartId: slideRels!.id,
        reason: "requirementDependency",
        requirementStatus: "conditional",
        requirementCondition: "referencedByRelationship",
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toEqual(
      project.summary?.packageDependencies,
    );
    expect(dependencyDetails.length).toBe(project.projection?.parts.length);
    expect(detailEntryFor(presentation!.id)).toEqual(
      expect.objectContaining({
        path: "ppt/presentation.xml",
        kind: "presentation",
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: presentation!.id,
            targetPartId: presentationRels!.id,
            reason: "dependencyFingerprint",
          }),
        ]),
        dependencyReasons: expect.arrayContaining(["dependencyFingerprint"]),
      }),
    );
    expect(detailEntryFor(slideRels!.id)).toEqual(
      expect.objectContaining({
        path: "ppt/slides/_rels/slide1.xml.rels",
        kind: "relationships",
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: slideRels!.id,
            targetPartId: mediaPart!.id,
            reason: "relationshipTarget",
          }),
        ]),
        dependents: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: mediaPart!.id,
            targetPartId: slideRels!.id,
            reason: "requirementDependency",
          }),
        ]),
        dependencyReasons: expect.arrayContaining(["relationshipTarget"]),
        dependentReasons: expect.arrayContaining(["requirementDependency"]),
      }),
    );
    expect(detailEntryFor(slide!.id)).toEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        kind: "slide",
        dependents: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: contentTypes!.id,
            targetPartId: slide!.id,
            reason: "contentTypeOverride",
          }),
          expect.objectContaining({
            ownerPartId: presentationRels!.id,
            targetPartId: slide!.id,
            reason: "relationshipTarget",
          }),
        ]),
        dependentReasons: expect.arrayContaining(["contentTypeOverride", "relationshipTarget"]),
      }),
    );
  });

  test("project probes Deck-owned asset loaders into asset artifacts", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();
    const probedSources: string[] = [];
    const loader = {
      name: "test-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }

        probedSources.push(source.path);
        return {
          mediaType: "image/png",
          extension: "png",
          width: 640,
          height: 360,
          byteLength: 1024,
        };
      },
    } satisfies AssetLoader;

    deck.useAssets(loader);
    deck.slide({ name: "Assets" }, () => (
      <>
        <img src="/public/chart.png" style={{ x: 1, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await projectSource({
      source: deck,
      options: deck.options,
      artifacts,
      assetLoaders: deck.assetLoaders,
    });
    const [asset] = [...artifacts.assetsById.values()];
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");

    expect(project.ok).toBe(true);
    expect(probedSources).toEqual(["/public/chart.png"]);
    expect(asset?.resolverScope).toBe("test-assets");
    expect(asset?.source).toEqual({ kind: "path", path: "/public/chart.png" });
    expect(asset?.probe).toMatchObject({
      mediaType: "image/png",
      width: 640,
      height: 360,
      byteLength: 1024,
    });
    expect(mediaPart?.path).toBe("ppt/media/media1.png");
    expect(mediaPart?.payload).toMatchObject({
      assetEntityId: asset?.assetEntityId,
      metadata: {
        mediaType: "image/png",
        extension: "png",
        widthPx: 640,
        heightPx: 360,
        byteLength: 1024,
      },
    });
  });

  test("render loads Deck-owned asset bytes for media parts", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const loader = {
      name: "test-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", bytes: pngBytes }
          : undefined;
      },
    } satisfies AssetLoader;

    deck.useAssets(loader);
    deck.slide({ name: "Loaded asset" }, () => (
      <>
        <img src="/public/chart.png" style={{ x: 1, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(pngBytes));
  });

  test("asset artifacts reuse loader probe and load results by source cache key", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    let probeCount = 0;
    let loadCount = 0;
    const loader = {
      name: "shared-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        probeCount += 1;
        return { mediaType: "image/png", extension: "png", width: 1, height: 1 };
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return { mediaType: "image/png", extension: "png", bytes: pngBytes };
      },
    } satisfies AssetLoader;

    deck.useAssets(loader);
    deck.slide({ name: "Shared assets" }, () => (
      <>
        <img src="/public/shared.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
        <img src="/public/shared.png" style={{ x: 2, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await deck.render();

    expect(render.ok).toBe(true);
    expect(probeCount).toBe(1);
    expect(loadCount).toBe(1);
  });

  test("render skips media asset loading when a hashed media build artifact can be reused", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    let loadCount = 0;
    const loader = {
      name: "hashed-reuse-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: 1,
              height: 1,
              hash: "sha256:stable-media",
            }
          : undefined;
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          mediaType: "image/png",
          extension: "png",
          hash: "sha256:stable-media",
          bytes: pngBytes,
        };
      },
    } satisfies AssetLoader;
    const firstArtifacts = new PipelineArtifactCollection();
    const secondArtifacts = new PipelineArtifactCollection();

    deck.slide({ name: "Hashed media reuse" }, () => (
      <>
        <img src="/public/hashed-media.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const cold = await renderSource({
      source: deck,
      options: deck.options,
      artifacts: firstArtifacts,
      assetLoaders: [loader],
    });
    secondArtifacts.materializePptxBuildArtifacts([
      ...firstArtifacts.pptxBuildArtifactsByPartId.values(),
    ]);
    const warm = await renderSource({
      source: deck,
      options: deck.options,
      definedProjection: firstArtifacts.projection,
      artifacts: secondArtifacts,
      assetLoaders: [loader],
    });

    expect(cold.ok).toBe(true);
    expect(loadCount).toBe(1);
    expect(
      [...firstArtifacts.pptxBuildArtifactsByPartId.values()].find((artifact) =>
        artifact.path.startsWith("ppt/media/"),
      )?.mediaByteFingerprint,
    ).toBe("asset:sha256:stable-media");
    expect(warm.ok).toBe(true);
    expect(loadCount).toBe(1);
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.png",
        status: "reused",
        reason: "buildArtifactFingerprintMatched",
        build: expect.objectContaining({
          mediaByteFingerprint: "asset:sha256:stable-media",
          mediaByteFingerprintSource: "projectedMetadataHash",
        }),
      }),
    );
  });

  test("registered asset loaders resolve in order before the built-in boundary", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();
    const loader = {
      name: "signed-url-assets",
      async probe({ source, scope }) {
        if (source.kind !== "url" || scope !== "signed-url-assets") {
          return undefined;
        }
        return {
          mediaType: "image/png",
          extension: "png",
          width: 320,
          height: 180,
          byteLength: 4096,
        };
      },
    } satisfies AssetLoader;

    deck.useAssets(loader);
    deck.slide({ name: "Signed URL" }, () => (
      <>
        <img
          src="https://assets.example.test/chart.png"
          style={{ x: 1, y: 1, width: 2, height: 1 }}
        />
      </>
    ));

    const project = await projectSource({
      source: deck,
      options: deck.options,
      artifacts,
      assetLoaders: deck.assetLoaders,
    });
    const [asset] = [...artifacts.assetsById.values()];
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");

    expect(project.ok).toBe(true);
    expect(asset?.resolverScope).toBe("signed-url-assets");
    expect(mediaPart?.payload).toMatchObject({
      metadata: { mediaType: "image/png", widthPx: 320, heightPx: 180, byteLength: 4096 },
    });
  });

  test("render loads asset bytes from the resolver that won Project probing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);
    const calls: string[] = [];

    deck.useAssets({
      name: "first-assets",
      async probe({ source }) {
        calls.push(`first:probe:${source.kind}`);
        return undefined;
      },
      async load({ source }) {
        calls.push(`first:load:${source.kind}`);
        return { mediaType: "image/png", extension: "png", bytes: new Uint8Array([0]) };
      },
    });
    deck.useAssets({
      name: "second-assets",
      async probe({ source }) {
        calls.push(`second:probe:${source.kind}`);
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source, scope }) {
        calls.push(`second:load:${scope}:${source.kind}`);
        return source.kind === "path" && scope === "second-assets"
          ? { mediaType: "image/png", extension: "png", bytes: pngBytes }
          : undefined;
      },
    });
    deck.slide({ name: "Resolver scoped load" }, () => (
      <>
        <img src="/public/scoped.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(calls).toEqual([
      "first:probe:path",
      "second:probe:path",
      "second:load:second-assets:path",
    ]);
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(pngBytes));
  });

  test("render reports missing bytes from the Project-winning asset resolver", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "probe-only-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
    });
    deck.slide({ name: "Missing load" }, () => (
      <>
        <img src="/public/missing-load.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await deck.render();
    const diagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_ASSET_LOAD_FAILED",
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(diagnostic).toMatchObject({
      message: "No asset loader returned bytes for this media source.",
      labels: [
        expect.objectContaining({
          path: "ppt/media/media1.png",
          message: "/public/missing-load.png",
        }),
      ],
      notes: expect.arrayContaining([
        "phase=load",
        "resolverScope=probe-only-assets",
        "packagePartPath=ppt/media/media1.png",
        "sourceKind=path",
      ]),
    });
  });

  test("project asset probe failures identify source, scope, phase, and asset entity", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "broken-probe",
      async probe({ source }) {
        if (source.kind === "path") {
          throw new Error("probe exploded");
        }
        return undefined;
      },
    });
    deck.slide({ name: "Broken probe" }, () => (
      <>
        <img src="/public/broken.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_PROBE_FAILED",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      labels: [expect.objectContaining({ message: "/public/broken.png" })],
      notes: expect.arrayContaining([
        "phase=probe",
        "resolverScope=broken-probe",
        "sourceKind=path",
      ]),
    });
    expect(diagnostic?.notes?.some((note) => note.startsWith("assetEntityId="))).toBe(true);
  });

  test("project reports invalid asset probe result shapes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "invalid-probe",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "", extension: "", width: 0, height: Number.NaN, byteLength: -1 }
          : undefined;
      },
    });
    deck.slide({ name: "Invalid probe" }, () => (
      <>
        <img src="/public/invalid-probe.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_PROBE_INVALID",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      message: "Asset loader returned an invalid result shape.",
      labels: [expect.objectContaining({ message: "/public/invalid-probe.png" })],
      notes: expect.arrayContaining([
        "phase=probe",
        "resolverScope=invalid-probe",
        "invalidFields=mediaType,extension,width,height,byteLength",
        "sourceKind=path",
      ]),
    });
  });

  test("project reports incomplete asset probe result shapes when image dimensions are missing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "dimensionless-probe",
      async probe({ source }) {
        return source.kind === "path" ? { mediaType: "image/png", extension: "png" } : undefined;
      },
    });
    deck.slide({ name: "Incomplete probe" }, () => (
      <>
        <img src="/public/dimensionless.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_PROBE_INCOMPLETE",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      message: "Asset probe did not return metadata required by the projected package model.",
      labels: [expect.objectContaining({ message: "/public/dimensionless.png" })],
      notes: expect.arrayContaining([
        "phase=probe",
        "resolverScope=dimensionless-probe",
        "missingFields=width,height",
        "sourceKind=path",
      ]),
    });
  });

  test("render asset load failures identify package part path and source details", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "broken-load",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        if (source.kind === "path") {
          throw new Error("load exploded");
        }
        return undefined;
      },
    });
    deck.slide({ name: "Broken load" }, () => (
      <>
        <img src="/public/broken.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await deck.render();
    const diagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_ASSET_LOAD_FAILED",
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(diagnostic).toMatchObject({
      labels: [
        expect.objectContaining({ path: "ppt/media/media1.png", message: "/public/broken.png" }),
      ],
      notes: expect.arrayContaining([
        "phase=load",
        "resolverScope=broken-load",
        "packagePartPath=ppt/media/media1.png",
        "sourceKind=path",
      ]),
    });
    expect(diagnostic?.notes?.some((note) => note.startsWith("assetEntityId="))).toBe(true);
  });

  test("render reports invalid asset load result shapes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useAssets({
      name: "invalid-load",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        return source.kind === "path"
          ? ({
              mediaType: "image/png",
              extension: "png",
              width: Number.POSITIVE_INFINITY,
              bytes: "not bytes",
            } as never)
          : undefined;
      },
    });
    deck.slide({ name: "Invalid load" }, () => (
      <>
        <img src="/public/invalid-load.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await deck.render();
    const diagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_ASSET_LOAD_INVALID",
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(diagnostic).toMatchObject({
      message: "Asset loader returned an invalid result shape.",
      labels: [
        expect.objectContaining({
          path: "ppt/media/media1.png",
          message: "/public/invalid-load.png",
        }),
      ],
      notes: expect.arrayContaining([
        "phase=load",
        "resolverScope=invalid-load",
        "invalidFields=width,bytes",
        "packagePartPath=ppt/media/media1.png",
        "sourceKind=path",
      ]),
    });
  });

  test("built-in asset probe extracts image dimensions into Project media metadata", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngDataUri = dataUriFromBytes("image/png", pngHeaderBytes(12, 7));

    deck.slide({ name: "Built-in image dimensions" }, () => (
      <>
        <img data={pngDataUri} style={{ x: 1, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");

    expect(project.ok).toBe(true);
    expect(mediaPart?.payload).toMatchObject({
      metadata: {
        mediaType: "image/png",
        extension: "png",
        widthPx: 12,
        heightPx: 7,
        byteLength: 29,
      },
    });
  });

  test("built-in asset boundary probes and fetches absolute http media URLs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = pngHeaderBytes(24, 13);
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchedUrls.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      return new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch;

    try {
      deck.slide({ name: "URL asset" }, () => (
        <>
          <img
            src="https://cdn.example.test/chart.png"
            style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
          />
        </>
      ));

      const project = await deck.project();
      const mediaPart = project.projection?.parts.find((part) => part.kind === "media");
      const render = await deck.render();
      const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());

      expect(project.ok).toBe(true);
      expect(mediaPart?.path).toBe("ppt/media/media1.png");
      expect(mediaPart?.payload).toMatchObject({
        source: { kind: "url", url: "https://cdn.example.test/chart.png" },
        metadata: {
          mediaType: "image/png",
          extension: "png",
          widthPx: 24,
          heightPx: 13,
          byteLength: pngBytes.byteLength,
        },
      });
      expect(render.ok).toBe(true);
      expect(fetchedUrls).toEqual(["https://cdn.example.test/chart.png"]);
      expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(pngBytes));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("explicit writer adapter format mismatches are warnings", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter mismatch" }, () => <></>);
    const adapter: WriterAdapter<PptxPackageModel, "pdf"> = {
      kind: "deckjsx.writerAdapter",
      name: "fake-pdf",
      projectionFormat: "pptx",
      format: "pdf",
      options: {},
      async render() {
        return {
          diagnostics: createDiagnostics(),
          artifact: {
            format: "pdf",
            mediaType: "application/pdf",
            extension: "pdf",
            bytes: new Uint8Array([1, 2, 3]),
          },
        };
      },
    };

    const result = await deck.render(adapter);

    expect(result.ok).toBe(true);
    expect(result.artifact?.extension).toBe("pdf");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_RENDER_ADAPTER_FORMAT_MISMATCH", severity: "warning" }),
    );
  });

  test("adapter-like invalid writer values are render-blocking errors", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

  test("render blocks artifacts when project has error diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid" }, () => (
      <>
        <div style={{ x: "1qu" as never, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    expect(project.ok).toBe(false);
    expect(project.projection).toBeDefined();
    expect(project.stages.project.artifact).toBe("partial");

    const render = await deck.render();
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.stages.render.artifact).toBe("missing");
  });

  test("partial projection keeps computable elements for inspection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Partially invalid" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 1, opacity: 0.4, filter: "blur(2px)" }}>Kept</p>
        <div
          style={{
            x: 3,
            y: 1,
            width: 2,
            height: 1,
            background: `url("/public/texture.png")`,
            backgroundRepeat: "space",
            boxShadow: "1px 1px 2px red, 2px 2px 4px blue",
          }}
        />
        <div style={{ x: "1qu" as never, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.projection?.slides[0]?.payload.drawing.children).toHaveLength(2);
    const [text, view] = project.projection?.slides[0]?.payload.drawing.children ?? [];
    expect(project.summary?.slides[0]?.elements[0]?.textPreview).toBe("Kept");
    expect(project.summary?.slides[0]?.elements[0]?.resolvedValues?.frame).toBeDefined();
    expect(text?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "blur(2px)",
          fallback: expect.objectContaining({ strategy: "dropFilterEffect" }),
        }),
        expect.objectContaining({
          feature: "opacity",
          property: "stackingContext",
          value: "0.4",
          fallback: expect.objectContaining({
            strategy: "preserveOpacityWithoutCompositedSubtree",
          }),
        }),
      ]),
    );
    expect(view?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "background",
          property: "background",
          fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
        }),
        expect.objectContaining({ feature: "shadow", property: "boxShadow" }),
      ]),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            `elementId=${view?.id}`,
            "feature=background",
            "property=background",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            `elementId=${view?.id}`,
            "feature=shadow",
            "property=boxShadow",
          ]),
        }),
      ]),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "filter", property: "filter", elementId: text?.id }),
        expect.objectContaining({
          feature: "opacity",
          property: "stackingContext",
          elementId: text?.id,
        }),
        expect.objectContaining({
          feature: "background",
          property: "background",
          elementId: view?.id,
        }),
        expect.objectContaining({ feature: "shadow", property: "boxShadow", elementId: view?.id }),
      ]),
    );
  });

  test("projected element origins survive layout filtering and paint ordering", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Origin stability" }, () => (
      <>
        <p style={{ display: "none", x: 1, y: 1, width: 2, height: 1 }}>Hidden</p>
        <p style={{ zIndex: 10, x: 1, y: 1, width: 2, height: 1 }}>First</p>
        <p style={{ zIndex: 0, x: 1, y: 2, width: 2, height: 1 }}>Second</p>
      </>
    ));

    const compile = deck.compile();
    const hiddenId = textNodeIdBy(compile.graph!, "Hidden");
    const firstId = textNodeIdBy(compile.graph!, "First");
    const secondId = textNodeIdBy(compile.graph!, "Second");
    const project = await deck.project();
    const elements = project.projection?.slides[0]?.payload.drawing.children ?? [];
    const summaryElements = project.summary?.slides[0]?.elements ?? [];
    const filtered = project.summary?.filtered ?? [];

    expect(project.ok).toBe(true);
    expect(
      elements.map((element) => (element.kind === "text" ? element.content.text : "")),
    ).toEqual(["Second", "First"]);
    expect(elements.map((element) => element.zIndex)).toEqual([0, 10]);
    expect(elements[0]?.paintOrder).toMatchObject({ zIndex: 0, siblingOrder: 1 });
    expect(elements[1]?.paintOrder).toMatchObject({ zIndex: 10, siblingOrder: 0 });
    expect(summaryElements.map((element) => element.zIndex)).toEqual([0, 10]);
    expect(summaryElements.map((element) => element.resolvedValues?.zIndex)).toEqual([0, 10]);
    expect(elements[0]?.origin.graphNodeIds).toContain(secondId);
    expect(elements[0]?.origin.graphNodeIds).not.toContain(firstId);
    expect(elements[0]?.origin.graphNodeIds).not.toContain(hiddenId);
    expect(elements[1]?.origin.graphNodeIds).toContain(firstId);
    expect(filtered).toContainEqual(
      expect.objectContaining({
        reason: "displayNone",
        kind: "text",
        graphNodeId: hiddenId,
        textPreview: "Hidden",
        slidePartId: project.projection?.slides[0]?.id,
      }),
    );
  });

  test("project preserves source sibling order as the zIndex tie breaker", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Sibling order" }, () => (
      <>
        <p style={{ zIndex: 1, x: 1, y: 1, width: 2, height: 1 }}>One</p>
        <p style={{ zIndex: 1, x: 1, y: 2, width: 2, height: 1 }}>Two</p>
        <p style={{ zIndex: 1, x: 1, y: 3, width: 2, height: 1 }}>Three</p>
      </>
    ));

    const project = await deck.project();
    const elements = project.projection?.slides[0]?.payload.drawing.children ?? [];

    expect(project.ok).toBe(true);
    expect(
      elements.map((element) => (element.kind === "text" ? element.content.text : "")),
    ).toEqual(["One", "Two", "Three"]);
    expect(elements.map((element) => element.paintOrder.siblingOrder)).toEqual([0, 1, 2]);
    expect(elements.map((element) => element.paintOrderIndex)).toEqual([0, 1, 2]);
    expect(
      project.summary?.slides[0]?.elements.map((element) => element.paintOrder?.siblingOrder),
    ).toEqual([0, 1, 2]);
  });

  test("project summary aggregates unsupported CSS-like semantics with drawing context", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unsupported paint summary" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: `url("/public/texture.png")`,
            backgroundRepeat: "space",
          }}
        />
      </>
    ));

    const project = await deck.project();
    const element = project.projection?.slides[0]?.payload.drawing.children[0];
    const unsupported = project.summary?.unsupportedSemantics ?? [];

    expect(project.ok).toBe(true);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC", severity: "warning" }),
    );
    expect(unsupported).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        value: `url("/public/texture.png")`,
        elementId: element?.id,
        kind: "group",
        packagePartId: element?.packagePartId,
        slidePartId: project.projection?.slides[0]?.id,
        slideId: project.projection?.slides[0]?.payload.slideId,
        origin: element?.origin,
        emissionTarget: "slide",
        paintOrderIndex: 0,
        paintOrder: expect.objectContaining({ siblingOrder: 0, generatedLayerRole: "authored" }),
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredBackgroundInput"]),
          missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        }),
      }),
    );
  });

  test("project warns and summarizes group opacity compositing fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Group opacity" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 3, height: 2, opacity: 0.5 }}>
          <p style={{ x: 0.2, y: 0.2, width: 2, height: 0.4 }}>Child</p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "opacity",
        value: "0.5",
        fallback: expect.objectContaining({
          strategy: "cascadeOpacityToChildren",
          preserves: expect.arrayContaining(["projectedOpacity", "childDrawingValues"]),
          missing: expect.arrayContaining(["compositedSubtree", "cssStackingContext"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "feature=opacity",
          "property=opacity",
          "value=0.5",
          "fallbackStrategy=cascadeOpacityToChildren",
          "fallbackPreserves=projectedOpacity,childDrawingValues",
          "fallbackMissing=compositedSubtree,cssStackingContext",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "opacity",
        value: "0.5",
        elementId: group?.id,
        kind: "group",
        emissionTarget: "slide",
        paintOrderIndex: 0,
        fallback: expect.objectContaining({ strategy: "cascadeOpacityToChildren" }),
      }),
    );
  });

  test("project warns and summarizes opacity stacking-context fallback on drawing nodes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Opacity stacking context" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, opacity: 0.4 }}>Faded</p>
      </>
    ));

    const project = await deck.project();
    const text = project.projection?.slides[0]?.payload.drawing.children[0];
    const summary = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(text?.kind).toBe("text");
    expect(text?.opacity).toBe(0.4);
    expect(summary?.opacity).toBe(0.4);
    expect(summary?.resolvedValues?.opacity).toBe(0.4);
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "stackingContext",
        value: "0.4",
        fallback: expect.objectContaining({
          strategy: "preserveOpacityWithoutCompositedSubtree",
          preserves: expect.arrayContaining(["projectedOpacity", "drawingNode"]),
          missing: expect.arrayContaining(["compositedSubtree", "cssStackingContext"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${text?.id}`,
          "elementKind=text",
          "feature=opacity",
          "property=stackingContext",
          "value=0.4",
          "fallbackStrategy=preserveOpacityWithoutCompositedSubtree",
          "fallbackMissing=compositedSubtree,cssStackingContext",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "stackingContext",
        value: "0.4",
        elementId: text?.id,
        kind: "text",
        fallback: expect.objectContaining({ strategy: "preserveOpacityWithoutCompositedSubtree" }),
      }),
    );
  });

  test("project warns and summarizes transform stacking-context fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Transform stacking context" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 3, height: 2, transform: "rotate(8deg)" }}>
          <p style={{ x: 0.2, y: 0.2, width: 2, height: 0.4, zIndex: 2 }}>Front</p>
          <p style={{ x: 0.2, y: 0.7, width: 2, height: 0.4, zIndex: -1 }}>Back</p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const summaryGroup = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.rotation).toBe(8);
    expect(summaryGroup?.rotation).toBe(8);
    expect(summaryGroup?.resolvedValues?.rotation).toBe(8);
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "transform",
        property: "stackingContext",
        value: "rotate(8deg)",
        fallback: expect.objectContaining({
          strategy: "preserveTransformWithoutStackingContext",
          preserves: expect.arrayContaining(["projectedTransform", "paintOrderInputs"]),
          missing: expect.arrayContaining(["cssStackingContext"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${group?.id}`,
          "elementKind=group",
          "feature=transform",
          "property=stackingContext",
          "value=rotate(8deg)",
          "fallbackStrategy=preserveTransformWithoutStackingContext",
          "fallbackMissing=cssStackingContext",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "transform",
        property: "stackingContext",
        value: "rotate(8deg)",
        elementId: group?.id,
        kind: "group",
        emissionTarget: "slide",
        fallback: expect.objectContaining({ strategy: "preserveTransformWithoutStackingContext" }),
      }),
    );
  });

  test("project warns and summarizes filter, blend, and isolation fallbacks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Compositing fallbacks" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            filter: "blur(2px)",
            mixBlendMode: "multiply",
            isolation: "isolate",
          }}
        >
          <p style={{ x: 0.2, y: 0.2, width: 2, height: 0.4 }}>Composite</p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "blur(2px)",
          fallback: expect.objectContaining({
            strategy: "dropFilterEffect",
            preserves: expect.arrayContaining(["authoredFilter"]),
            missing: expect.arrayContaining(["filterEffect"]),
          }),
        }),
        expect.objectContaining({
          feature: "blend",
          property: "mixBlendMode",
          value: "multiply",
          fallback: expect.objectContaining({
            strategy: "dropBlendMode",
            preserves: expect.arrayContaining(["authoredBlendMode"]),
            missing: expect.arrayContaining(["blendCompositing"]),
          }),
        }),
        expect.objectContaining({
          feature: "isolation",
          property: "isolation",
          value: "isolate",
          fallback: expect.objectContaining({
            strategy: "dropIsolationGroup",
            preserves: expect.arrayContaining(["authoredIsolation"]),
            missing: expect.arrayContaining(["isolatedCompositingGroup"]),
          }),
        }),
      ]),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=filter",
            "property=filter",
            "value=blur(2px)",
            "fallbackStrategy=dropFilterEffect",
            "fallbackMissing=filterEffect",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=blend",
            "property=mixBlendMode",
            "value=multiply",
            "fallbackStrategy=dropBlendMode",
            "fallbackMissing=blendCompositing",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=isolation",
            "property=isolation",
            "value=isolate",
            "fallbackStrategy=dropIsolationGroup",
            "fallbackMissing=isolatedCompositingGroup",
          ]),
        }),
      ]),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "blur(2px)",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "dropFilterEffect" }),
        }),
        expect.objectContaining({
          feature: "blend",
          property: "mixBlendMode",
          value: "multiply",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "dropBlendMode" }),
        }),
        expect.objectContaining({
          feature: "isolation",
          property: "isolation",
          value: "isolate",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "dropIsolationGroup" }),
        }),
      ]),
    );
  });

  test("project warns and summarizes stroke, border, and outline fallbacks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stroke fallbacks" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            border: "2pt groove #111111",
            outline: "1pt groove #222222",
          }}
        />
        <shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            fill: "#F8FAFC",
            stroke: "#334155",
            strokeWidth: "2pt",
            strokeDasharray: "4 var(--gap)",
          }}
        />
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const shape = project.projection?.slides[0]?.payload.drawing.children[1];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(shape?.kind).toBe("shape");
    expect(group?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "border",
          property: "border",
          value: "2pt groove #111111",
          fallback: expect.objectContaining({
            strategy: "preserveAuthoredValueOnly",
            preserves: expect.arrayContaining(["authoredStrokeInput"]),
            missing: expect.arrayContaining(["pptxStroke"]),
          }),
        }),
        expect.objectContaining({
          feature: "outline",
          property: "outline",
          value: "1pt groove #222222",
          fallback: expect.objectContaining({
            strategy: "preserveAuthoredValueOnly",
            preserves: expect.arrayContaining(["authoredOutlineInput"]),
            missing: expect.arrayContaining(["pptxOutline"]),
          }),
        }),
      ]),
    );
    expect(shape?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "stroke",
        property: "strokeDasharray",
        value: "4 var(--gap)",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredStrokeInput"]),
          missing: expect.arrayContaining(["pptxStroke"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=border",
            "property=border",
            "value=2pt groove #111111",
            "fallbackStrategy=preserveAuthoredValueOnly",
            "fallbackMissing=pptxStroke",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=outline",
            "property=outline",
            "value=1pt groove #222222",
            "fallbackStrategy=preserveAuthoredValueOnly",
            "fallbackMissing=pptxOutline",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=stroke",
            "property=strokeDasharray",
            "value=4 var(--gap)",
            "fallbackStrategy=preserveAuthoredValueOnly",
            "fallbackMissing=pptxStroke",
          ]),
        }),
      ]),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "border",
          property: "border",
          value: "2pt groove #111111",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
        }),
        expect.objectContaining({
          feature: "outline",
          property: "outline",
          value: "1pt groove #222222",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
        }),
        expect.objectContaining({
          feature: "stroke",
          property: "strokeDasharray",
          value: "4 var(--gap)",
          elementId: shape?.id,
          kind: "shape",
          fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
        }),
      ]),
    );
  });

  test("project summarizes nested unsupported semantics with the child paint context", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Nested unsupported semantics" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 4, height: 2, zIndex: 7 }}>
          <p style={{ x: 0.25, y: 0.25, width: 2, height: 0.5, zIndex: 2, filter: "blur(3px)" }}>
            Child fallback
          </p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const child = group?.kind === "group" ? group.children[0] : undefined;
    const record = project.summary?.unsupportedSemantics.find(
      (item) => item.elementId === child?.id && item.property === "filter",
    );

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.paintOrder?.zIndex).toBe(7);
    expect(child?.kind).toBe("text");
    expect(child?.paintOrder?.zIndex).toBe(2);
    expect(record).toEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "blur(3px)",
        elementId: child?.id,
        kind: "text",
        paintOrder: expect.objectContaining({ siblingOrder: 0, zIndex: 2 }),
        fallback: expect.objectContaining({ strategy: "dropFilterEffect" }),
      }),
    );
    expect(record).not.toHaveProperty("emissionTarget");
    expect(record).not.toHaveProperty("paintOrderIndex");
  });

  test("project warns and summarizes clipped transform fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Clipped transform" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 2, height: 1, overflow: "hidden" }}>
          <p style={{ x: 1.6, y: 0.2, width: 1, height: 0.4, transform: "rotate(15deg)" }}>
            Clipped transform
          </p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const child = group?.kind === "group" ? group.children[0] : undefined;

    expect(project.ok).toBe(true);
    expect(child?.kind).toBe("text");
    expect(child?.clip?.strategy).toBe("intersectParentOverflow");
    expect(child?.rotation).toBe(15);
    expect(child?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "overflow",
        value: "hidden + transform:intersectParentOverflow",
        fallback: expect.objectContaining({
          strategy: "axisAlignedClipWithoutTransformedMask",
          preserves: expect.arrayContaining([
            "originalFrame",
            "clipFrame",
            "visibleFrame",
            "projectedTransform",
          ]),
          missing: expect.arrayContaining(["transformedClipMask"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${child?.id}`,
          "elementKind=text",
          "feature=clipping",
          "property=overflow",
          "value=hidden + transform:intersectParentOverflow",
          "fallbackStrategy=axisAlignedClipWithoutTransformedMask",
          "fallbackMissing=transformedClipMask",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "overflow",
        value: "hidden + transform:intersectParentOverflow",
        elementId: child?.id,
        kind: "text",
        slidePartId: project.projection?.slides[0]?.id,
        fallback: expect.objectContaining({ strategy: "axisAlignedClipWithoutTransformedMask" }),
      }),
    );
  });

  test("project warns and summarizes clipped image source-rect transform fallback", async () => {
    const image =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22200%22%3E%3Crect%20width%3D%22400%22%20height%3D%22200%22%20fill%3D%22%230EA5E9%22%2F%3E%3C%2Fsvg%3E";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Clipped image transform" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 2, height: 1, overflow: "hidden" }}>
          <img
            data={image}
            style={{
              x: 0.5,
              y: 0,
              width: 2,
              height: 1,
              objectFit: "cover",
              crop: { left: "10%", right: "5%" },
              rotation: 12,
            }}
          />
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const child = group?.kind === "group" ? group.children[0] : undefined;
    const imageChild = child?.kind === "image" ? child : undefined;

    expect(project.ok).toBe(true);
    expect(child?.kind).toBe("image");
    expect(imageChild?.clip?.strategy).toBe("intersectParentOverflow");
    expect(imageChild?.rotation).toBe(12);
    expect(imageChild?.sourceFrame).toBeDefined();
    expect(imageChild?.crop).toEqual(expect.objectContaining({ left: 0.1, right: 0.05 }));
    expect(imageChild?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "imageSourceRect",
        value: "clip:intersectParentOverflow+transform+fit:cover+crop",
        fallback: expect.objectContaining({
          strategy: "sourceRectBeforeTransform",
          preserves: expect.arrayContaining([
            "sourceFrame",
            "crop",
            "objectPosition",
            "projectedTransform",
          ]),
          missing: expect.arrayContaining(["transformedImageClip"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${imageChild?.id}`,
          "elementKind=image",
          "feature=clipping",
          "property=imageSourceRect",
          "value=clip:intersectParentOverflow+transform+fit:cover+crop",
          "fallbackStrategy=sourceRectBeforeTransform",
          "fallbackMissing=transformedImageClip",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "imageSourceRect",
        value: "clip:intersectParentOverflow+transform+fit:cover+crop",
        elementId: imageChild?.id,
        kind: "image",
        fallback: expect.objectContaining({ strategy: "sourceRectBeforeTransform" }),
      }),
    );
  });

  test("project reports unsupported semantics for filtered nodes without adding drawing records", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Filtered unsupported paint" }, () => (
      <>
        <p style={{ display: "none", transform: "warp(12deg)", x: 1, y: 1, width: 2, height: 1 }}>
          Hidden transform
        </p>
      </>
    ));

    const compile = deck.compile();
    const hiddenId = textNodeIdBy(compile.graph!, "Hidden transform");
    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(project.projection?.slides[0]?.payload.drawing.children).toHaveLength(0);
    expect(project.summary?.filtered).toContainEqual(
      expect.objectContaining({
        reason: "displayNone",
        graphNodeId: hiddenId,
        textPreview: "Hidden transform",
      }),
    );
    expect(project.summary?.unsupportedSemantics).toEqual([]);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `graphNodeId=${hiddenId}`,
          "nodeKind=text",
          "feature=transform",
          "property=transform",
        ]),
      }),
    );
  });
});

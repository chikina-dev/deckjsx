import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render table output", () => {
  test("render emits authored tables as native pptx table graphic frames", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Table" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 2,
            tableLayout: "fixed",
          }}
        >
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
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Row span table" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 2,
            tableLayout: "fixed",
          }}
        >
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
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Row span expands columns" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 2,
            tableLayout: "fixed",
          }}
        >
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
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);

    expect(render.ok).toBe(true);
    expect(slideXml.match(/<a:gridCol\b/g)?.length).toBe(3);
    expect(slideXml).toContain('vMerge="1"');
    expect(slideXml).toContain("<a:t>Q3</a:t>");
  });

  test("project rejects unsafe table grid ranges before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unsafe table" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 1,
            tableLayout: "fixed",
          }}
        >
          <tbody>
            <tr>
              <td>Safe</td>
            </tr>
          </tbody>
        </table>
      </>
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
            element.kind === "table"
              ? {
                  ...element,
                  sections: element.sections.map((section, sectionIndex) =>
                    sectionIndex === 0
                      ? {
                          ...section,
                          rows: section.rows.map((row, rowIndex) =>
                            rowIndex === 0
                              ? {
                                  ...row,
                                  cells: row.cells.map((cell, cellIndex) =>
                                    cellIndex === 0
                                      ? { ...cell, gridColumnIndex: Number.MAX_SAFE_INTEGER }
                                      : cell,
                                  ),
                                }
                              : row,
                          ),
                        }
                      : section,
                  ),
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;
    const malformedProjection = H.withFreshPackageFingerprints({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    deck.defineProjection(malformedProjection);

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".sections.0.rows.0.cells.0"),
            message: "invalid table cell",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project preserves table cells and warns when rich cell content falls back to text-centric native table output", async () => {
    const image =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23ff0000%22%2F%3E%3C%2Fsvg%3E";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Rich cell" }, () => (
      <>
        <table style={{ position: "absolute", left: 1, top: 1, width: 6, height: 2 }}>
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Approximate table layout" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unset table layout" }, () => (
      <>
        <table style={{ position: "absolute", left: 1, top: 1, width: 4, height: 1 }}>
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Styled table" }, () => (
      <>
        <table style={{ position: "absolute", left: 1, top: 1, width: 4, height: 1 }}>
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
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Table styles" }, () => (
      <>
        <table style={{ position: "absolute", left: 1, top: 1, width: 4, height: 1 }}>
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
    const tableStylesPart = H.expectPptxPart(project.projection?.parts ?? [], "table-styles");
    const render = await deck.render();
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
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
});

import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src/index.ts";
import { isAuthorTreeNode } from "@/src/authoring/tree.ts";
import { withAuthoringRuntimeObservers } from "@/src/authoring-runtime-observer.ts";
import { authoringMetadata } from "@/src/integration.ts";
import { jsxDEV } from "@/src/jsx-dev-runtime.ts";
import { Fragment, jsx } from "@/src/jsx-runtime.ts";
import { createElementWithMetadata } from "@/src/jsx.ts";
import { expectPptxProjection } from "../helpers";

describe("authoring and JSX runtime", () => {
  test("JSX primitives produce nested Author Tree nodes", async () => {
    const node = (
      <div key="outer" style={{ position: "absolute", left: 1, top: 2 }}>
        <>
          <p key={1}>First</p>
          {[<p>Second</p>, false, null]}
        </>
      </div>
    );

    expect(isAuthorTreeNode(node)).toBe(true);
    if (!isAuthorTreeNode(node) || node.kind !== "element") {
      throw new Error("Expected author tree element.");
    }

    expect(node.source).toEqual({ kind: "tag", tag: "div" });
    expect(node.props).toEqual({ style: { position: "absolute", left: 1, top: 2 } });
    expect(node.children).toHaveLength(1);
    expect(node.children[0]).toMatchObject({ kind: "fragment" });
    if (node.children[0]?.kind !== "fragment") {
      throw new Error("Expected fragment child.");
    }
    expect(node.children[0].children).toHaveLength(2);
    expect(node.children[0].children[0]).toMatchObject({
      kind: "element",
      source: { kind: "tag", tag: "p" },
    });
  });

  test("Fragment forwards children when called directly", async () => {
    const fragment = Fragment({ children: [<p>First</p>, <p>Second</p>] });

    expect(fragment).toMatchObject({ kind: "fragment" });
    if (!isAuthorTreeNode(fragment) || fragment.kind !== "fragment") {
      throw new Error("Expected fragment node.");
    }

    expect(fragment.children).toHaveLength(2);
    expect(fragment.children[0]).toMatchObject({
      kind: "element",
      source: { kind: "tag", tag: "p" },
    });
  });

  test("authoring metadata carrier transports media source origins", async () => {
    const origin = { importer: "/project/src/components/Logo.tsx", source: "./logo.png" };
    const node = (
      <img {...authoringMetadata({ mediaSourceOrigins: { src: origin } })} src="./logo.png" />
    );

    if (!isAuthorTreeNode(node) || node.kind !== "element") {
      throw new Error("Expected author tree element.");
    }

    expect(node.mediaSourceOrigins).toEqual({ src: origin });
    expect(node.props).toEqual({ src: "./logo.png" });
  });

  test("authoring metadata carrier transports component provenance", async () => {
    const componentProvenance = {
      stack: [
        {
          name: "MetricCard",
          moduleId: "/project/src/components/MetricCard.tsx",
          sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
          key: "metric-card",
        },
      ],
    };
    const node = <p {...authoringMetadata({ componentProvenance })}>Revenue</p>;

    if (!isAuthorTreeNode(node) || node.kind !== "element") {
      throw new Error("Expected author tree element.");
    }

    expect(node.componentProvenance).toEqual(componentProvenance);
    expect(node.props).toEqual({});
  });

  test("internal authoring runtime observers see function component props", async () => {
    const invocations: unknown[] = [];
    function MetricCard(props: { readonly title: string }) {
      return <p>{props.title}</p>;
    }

    const node = withAuthoringRuntimeObservers(
      [
        {
          componentInvoked(invocation) {
            invocations.push(invocation);
          },
        },
      ],
      () => <MetricCard title="Revenue" />,
    );

    expect(isAuthorTreeNode(node)).toBe(true);
    expect(invocations).toEqual([
      expect.objectContaining({
        name: "MetricCard",
        props: expect.objectContaining({ title: "Revenue" }),
      }),
    ]);
  });

  test("empty injected component provenance falls back to the runtime component frame", async () => {
    const invocations: unknown[] = [];
    function MetricCard(props: { readonly title: string }) {
      return <p>{props.title}</p>;
    }

    const node = withAuthoringRuntimeObservers(
      [
        {
          componentInvoked(invocation) {
            invocations.push(invocation);
          },
        },
      ],
      () =>
        createElementWithMetadata(
          MetricCard,
          {
            ...authoringMetadata({ componentProvenance: { stack: [] } }),
            title: "Revenue",
          } as { readonly title: string },
          undefined,
          { file: "/project/src/slides.tsx", line: 12, column: 5 },
        ),
    );

    expect(isAuthorTreeNode(node)).toBe(true);
    expect(invocations).toEqual([
      expect.objectContaining({
        name: "MetricCard",
        stack: [
          expect.objectContaining({
            name: "MetricCard",
            sourceSpan: { file: "/project/src/slides.tsx", line: 12, column: 5 },
          }),
        ],
      }),
    ]);
  });

  test("function components add component provenance without replacing intrinsic source span", async () => {
    function MetricCard() {
      return jsxDEV("p", { children: "Revenue" }, undefined, false, {
        fileName: "/project/src/components/MetricCard.tsx",
        lineNumber: 7,
        columnNumber: 10,
      });
    }

    const node = jsxDEV(MetricCard, {}, "metric-card", false, {
      fileName: "/project/src/slides/Overview.tsx",
      lineNumber: 12,
      columnNumber: 5,
    });

    if (!isAuthorTreeNode(node) || node.kind !== "element") {
      throw new Error("Expected author tree element.");
    }

    expect(node.sourceSpan).toEqual({
      file: "/project/src/components/MetricCard.tsx",
      line: 7,
      column: 10,
    });
    expect(node.componentProvenance).toEqual({
      stack: [
        {
          name: "MetricCard",
          sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
          key: "metric-card",
        },
      ],
    });
  });

  test("unkeyed function components merge injected component provenance", async () => {
    const injected = {
      stack: [
        {
          name: "MetricCard",
          moduleId: "/project/src/slides/Overview.tsx",
          sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
        },
      ],
    };
    function MetricCard() {
      return jsxDEV("p", { children: "Revenue" }, undefined, false, {
        fileName: "/project/src/components/MetricCard.tsx",
        lineNumber: 7,
        columnNumber: 10,
      });
    }

    const node = jsx(MetricCard, authoringMetadata({ componentProvenance: injected }));

    if (!isAuthorTreeNode(node) || node.kind !== "element") {
      throw new Error("Expected author tree element.");
    }

    expect(node.componentProvenance).toEqual({
      stack: [
        {
          name: "MetricCard",
          moduleId: "/project/src/slides/Overview.tsx",
          sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
        },
        {
          name: "MetricCard",
        },
      ],
    });
  });

  test("component provenance reaches projected elements", async () => {
    function MetricCard() {
      return jsxDEV(
        "p",
        {
          children: "Revenue",
          style: { position: "absolute", left: 1, top: 1, width: 3, height: 1 },
        },
        undefined,
        false,
        { fileName: "/project/src/components/MetricCard.tsx", lineNumber: 7, columnNumber: 10 },
      );
    }
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Projected component provenance" }, () =>
      jsxDEV(MetricCard, {}, "metric-card", false, {
        fileName: "/project/src/slides/Overview.tsx",
        lineNumber: 12,
        columnNumber: 5,
      }),
    );

    const projection = expectPptxProjection(await deck.project());
    const [element] = projection.slides[0]?.payload.drawing.children ?? [];

    expect(element?.origin.componentProvenance).toEqual({
      stack: [
        {
          name: "MetricCard",
          sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
          key: "metric-card",
        },
      ],
    });
  });

  test("lowercase div reports primitive children that bypass public JSX types", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Intrinsic content" }, () =>
      jsx("div", {
        style: { position: "absolute", left: 1, top: 1, width: 6, height: 3 },
        children: [
          "Title",
          jsx("p", {
            style: { position: "absolute", left: 0, top: 0.5, width: 4, height: 0.5 },
            children: "Paragraph",
          }),
          jsx("img", {
            src: "/tmp/demo.png",
            style: { position: "absolute", left: 0, top: 1.1, width: 1, height: 1 },
          }),
          42,
        ],
      } as never),
    );

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_SEMANTIC_STRUCTURE",
          title: "primitive text is not part of the public authoring API here",
          message: expect.stringContaining("Primitive text is public content only inside"),
          help: expect.arrayContaining([expect.stringContaining("<p>Text</p>")]),
        }),
      ]),
    );
  });

  test("table cells reject inline spans that bypass public JSX child types", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid table span" }, () => (
      <table style={{ position: "absolute", left: 1, top: 1, width: 6, height: 1 }}>
        <tbody>
          <tr>
            <td>{jsx("span", { children: "inline" } as never) as never}</td>
          </tr>
        </tbody>
      </table>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_SEMANTIC_STRUCTURE",
        title: "inline span is not part of the public authoring API here",
        message: expect.stringContaining("outside a text-like element"),
      }),
    );
  });

  test("table cells still accept primitive text as authored cell content", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Explicit spaces" }, () => (
      <>
        <table style={{ position: "absolute", left: 1, top: 1, width: 6, height: 1 }}>
          <tbody>
            <tr>
              <td>{"Hello "}</td>
              <td>there</td>
              <td>{" again"}</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const ir = expectPptxProjection(await deck.project());
    const [table] = ir.slides[0]?.payload.drawing.children ?? [];
    if (!table || table.kind !== "table") {
      throw new Error("Expected intrinsic table to compile to a table.");
    }

    expect(
      table.sections.flatMap((section) =>
        section.rows.flatMap((row) =>
          row.cells.flatMap((cell) =>
            cell.children
              .filter((child) => child.kind === "text")
              .map((child) => child.content.text),
          ),
        ),
      ),
    ).toEqual(["Hello ", "there", " again"]);
  });

  test("semantic view-like intrinsics compile to groups and heading intrinsics compile to text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Semantic intrinsics" }, () => (
      <>
        <main style={{ position: "absolute", left: 0.5, top: 0.5, width: 9, height: 4 }}>
          <header style={{ position: "absolute", left: 0, top: 0, width: 9, height: 1 }}>
            <h1 style={{ position: "absolute", left: 0, top: 0, width: 8, height: 0.6 }}>Report</h1>
          </header>
          <section style={{ position: "absolute", left: 0, top: 1.1, width: 9, height: 2 }}>
            <p style={{ position: "absolute", left: 0, top: 0, width: 8, height: 0.5 }}>Body</p>
          </section>
          <footer style={{ position: "absolute", left: 0, top: 3.4, width: 9, height: 0.5 }}>
            <p>Footer</p>
          </footer>
        </main>
      </>
    ));

    const ir = expectPptxProjection(await deck.project());
    const [main] = ir.slides[0]?.payload.drawing.children ?? [];
    if (!main || main.kind !== "group") {
      throw new Error("Expected main to compile to a group.");
    }

    expect(main.children.map((child) => child.kind)).toEqual(["group", "group", "group"]);
    const [header, section, footer] = main.children;
    if (header?.kind !== "group" || section?.kind !== "group" || footer?.kind !== "group") {
      throw new Error("Expected semantic containers to compile to groups.");
    }

    expect(header.children[0]).toMatchObject({ kind: "text", content: { text: "Report" } });
    expect(section.children[0]).toMatchObject({ kind: "text", content: { text: "Body" } });
    expect(footer.children[0]).toMatchObject({ kind: "text", content: { text: "Footer" } });
  });

  test("span compiles to rich text runs while preserving aggregate text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Rich text" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 6, height: 1, fontSize: 20 }}>
          Sales <span style={{ color: "#DC2626", fontWeight: 700 }}>grew</span> YoY
        </p>
      </>
    ));

    const ir = expectPptxProjection(await deck.project());
    const [text] = ir.slides[0]?.payload.drawing.children ?? [];
    if (!text || text.kind !== "text") {
      throw new Error("Expected rich paragraph to compile to a text node.");
    }

    expect(text.content.text).toBe("Sales grew YoY");
    expect(text.content.runs).toEqual([
      { text: "Sales " },
      { text: "grew", style: expect.objectContaining({ color: "DC2626", fontWeight: 700 }) },
      { text: " YoY" },
    ]);
  });

  test("slide factory content projects into the declared slide", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Content slide" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 1, fontSize: 20 }}>
        Valid
      </p>
    ));

    const result = await deck.project();
    expect(result.ok).toBe(true);
    expect(expectPptxProjection(result).slides[0]?.payload.name).toBe("Content slide");
  });
});

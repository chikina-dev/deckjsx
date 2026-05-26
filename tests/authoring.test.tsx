import { describe, expect, test } from "vite-plus/test";
import { Deck, Fragment, Text, View } from "../src/index.ts";
import { isAuthorTreeNode } from "../src/authoring/tree.ts";

describe("authoring and JSX runtime", () => {
  test("JSX primitives produce author nodes with flattened children outside props", () => {
    const node = (
      <View key="outer" style={{ x: 1, y: 2 }}>
        <Fragment>
          <Text key={1}>First</Text>
          {[<Text>Second</Text>, false, null]}
        </Fragment>
      </View>
    );

    expect(isAuthorTreeNode(node)).toBe(true);
    if (!isAuthorTreeNode(node) || node.kind !== "element") {
      throw new Error("Expected author tree element.");
    }

    expect(node.source).toEqual({ kind: "component", component: "View" });
    expect(Object.hasOwn(node.props, "children")).toBe(false);
    expect(Object.hasOwn(node.props, "key")).toBe(false);
    expect(node.children).toHaveLength(1);
    expect(node.children[0]).toMatchObject({ kind: "fragment" });
    if (node.children[0]?.kind !== "fragment") {
      throw new Error("Expected fragment child.");
    }
    expect(node.children[0].children).toHaveLength(2);
    expect(node.children[0].children[0]).toMatchObject({
      kind: "element",
      source: { kind: "component", component: "Text" },
    });
  });

  test("Fragment forwards children when called directly", () => {
    const fragment = Fragment({
      children: [<Text>First</Text>, <Text>Second</Text>],
    });

    expect(fragment).toMatchObject({ kind: "fragment" });
    if (fragment.kind !== "fragment") {
      throw new Error("Expected fragment node.");
    }

    expect(fragment.children).toHaveLength(2);
    expect(fragment.children[0]).toMatchObject({
      kind: "element",
      source: { kind: "component", component: "Text" },
    });
  });

  test("lowercase div normalizes primitive children to implicit text nodes", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Intrinsic content" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 3 }}>
          Title
          <p style={{ x: 0, y: 0.5, width: 4, height: 0.5 }}>Paragraph</p>
          <img src="/tmp/demo.png" style={{ x: 0, y: 1.1, width: 1, height: 1 }} />
          42
        </div>
      </>
    ));

    const ir = deck.project().projection!;
    const [group] = ir.slides[0]?.payload.elements ?? [];
    if (!group || group.kind !== "group") {
      throw new Error("Expected intrinsic div to compile to a group.");
    }

    expect(group.children.map((child) => child.kind)).toEqual(["text", "text", "image", "text"]);
    expect(
      group.children.filter((child) => child.kind === "text").map((child) => child.content.text),
    ).toEqual(["Title", "Paragraph", "42"]);
  });

  test("implicit text nodes preserve explicit edge spaces", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Explicit spaces" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 3 }}>
          {"Hello "}
          <p>there</p>
          {" again"}
        </div>
      </>
    ));

    const ir = deck.project().projection!;
    const [group] = ir.slides[0]?.payload.elements ?? [];
    if (!group || group.kind !== "group") {
      throw new Error("Expected intrinsic div to compile to a group.");
    }

    expect(
      group.children.filter((child) => child.kind === "text").map((child) => child.content.text),
    ).toEqual(["Hello ", "there", " again"]);
  });

  test("semantic view-like intrinsics compile to groups and heading intrinsics compile to text", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Semantic intrinsics" }, () => (
      <>
        <main style={{ x: 0.5, y: 0.5, width: 9, height: 4 }}>
          <header style={{ x: 0, y: 0, width: 9, height: 1 }}>
            <h1 style={{ x: 0, y: 0, width: 8, height: 0.6 }}>Report</h1>
          </header>
          <section style={{ x: 0, y: 1.1, width: 9, height: 2 }}>
            <p style={{ x: 0, y: 0, width: 8, height: 0.5 }}>Body</p>
          </section>
          <footer style={{ x: 0, y: 3.4, width: 9, height: 0.5 }}>Footer</footer>
        </main>
      </>
    ));

    const ir = deck.project().projection!;
    const [main] = ir.slides[0]?.payload.elements ?? [];
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

  test("span compiles to rich text runs while preserving aggregate text", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Rich text" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 6, height: 1, fontSize: 20 }}>
          Sales <span style={{ color: "#DC2626", fontWeight: 700 }}>grew</span> YoY
        </p>
      </>
    ));

    const ir = deck.project().projection!;
    const [text] = ir.slides[0]?.payload.elements ?? [];
    if (!text || text.kind !== "text") {
      throw new Error("Expected rich paragraph to compile to a text node.");
    }

    expect(text.content.text).toBe("Sales grew YoY");
    expect(text.content.runs).toEqual([
      { text: "Sales " },
      {
        text: "grew",
        style: expect.objectContaining({ color: "DC2626", fontWeight: 700 }),
      },
      { text: " YoY" },
    ]);
  });

  test("slide factories return slide content without a public Slide root", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Content slide" }, () => (
      <Text style={{ x: 1, y: 1, width: 3, height: 1, fontSize: 20 }}>Valid</Text>
    ));

    const result = deck.project();
    expect(result.ok).toBe(true);
    expect(result.projection?.slides[0]?.payload.name).toBe("Content slide");
  });
});

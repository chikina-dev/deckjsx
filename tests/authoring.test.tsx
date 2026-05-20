import { describe, expect, test } from "vite-plus/test";
import { Deck, Fragment, Slide, Text, View } from "../src/index.ts";
import { isAuthorNode } from "../src/jsx.ts";

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

    expect(isAuthorNode(node)).toBe(true);
    if (!isAuthorNode(node)) {
      throw new Error("Expected author node.");
    }

    expect(node.kind).toBe("view");
    expect(Object.hasOwn(node.props, "children")).toBe(false);
    expect(Object.hasOwn(node.props, "key")).toBe(false);
    expect(node.children).toHaveLength(4);
    expect(node.children[0]).toMatchObject({ kind: "text" });
    expect(node.children[1]).toMatchObject({ kind: "text" });
    expect(node.children[2]).toBe(false);
    expect(node.children[3]).toBe(null);
  });

  test("lowercase div normalizes primitive children to implicit text nodes", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Intrinsic content">
        <div style={{ x: 1, y: 1, width: 6, height: 3 }}>
          Title
          <p style={{ x: 0, y: 0.5, width: 4, height: 0.5 }}>Paragraph</p>
          <img src="/tmp/demo.png" style={{ x: 0, y: 1.1, width: 1, height: 1 }} />
          42
        </div>
      </Slide>
    ));

    const ir = deck.render();
    const [group] = ir.slides[0]?.nodes ?? [];
    if (!group || group.kind !== "group") {
      throw new Error("Expected intrinsic div to compile to a group.");
    }

    expect(group.children.map((child) => child.kind)).toEqual(["text", "text", "image", "text"]);
    expect(
      group.children.filter((child) => child.kind === "text").map((child) => child.content.text),
    ).toEqual(["Title", "Paragraph", "42"]);
  });

  test("semantic view-like intrinsics compile to groups and heading intrinsics compile to text", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Semantic intrinsics">
        <main style={{ x: 0.5, y: 0.5, width: 9, height: 4 }}>
          <header style={{ x: 0, y: 0, width: 9, height: 1 }}>
            <h1 style={{ x: 0, y: 0, width: 8, height: 0.6 }}>Report</h1>
          </header>
          <section style={{ x: 0, y: 1.1, width: 9, height: 2 }}>
            <p style={{ x: 0, y: 0, width: 8, height: 0.5 }}>Body</p>
          </section>
          <footer style={{ x: 0, y: 3.4, width: 9, height: 0.5 }}>Footer</footer>
        </main>
      </Slide>
    ));

    const ir = deck.render();
    const [main] = ir.slides[0]?.nodes ?? [];
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

  test("render rejects slide factories that do not return a Slide root", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => <Text style={{ x: 1, y: 1, width: 3, height: 1, fontSize: 20 }}>Invalid</Text>);

    expect(() => deck.render()).toThrowError(
      "Slide factory at index 0 must return a <Slide /> root.",
    );
  });

  test("render rejects nested slides inside views", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Nested slide">
        <View style={{ x: 1, y: 1, width: 3, height: 2 }}>
          <Slide name="Invalid nested slide" />
        </View>
      </Slide>
    ));

    expect(() => deck.render()).toThrowError(
      "Slide cannot be nested inside another slide or view.",
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck, Fragment, Slide, Text, View, createElement } from "../src/index.ts";
import { isAuthorNode } from "../src/jsx.ts";

void createElement;

describe("authoring and JSX runtime", () => {
  test("createElement rejects intrinsic elements", () => {
    expect(() => createElement("div", null)).toThrowError(
      "Intrinsic elements are not supported: <div>.",
    );
  });

  test("JSX primitives produce author nodes with flattened children outside props", () => {
    const node = (
      <View style={{ x: 1, y: 2 }}>
        <Fragment>
          <Text>First</Text>
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
    expect(node.children).toHaveLength(4);
    expect(node.children[0]).toMatchObject({ kind: "text" });
    expect(node.children[1]).toMatchObject({ kind: "text" });
    expect(node.children[2]).toBe(false);
    expect(node.children[3]).toBe(null);
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

  test("render rejects non-deckjsx children inside structured views", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Invalid view child">
        {/* @ts-expect-error View children must be deckjsx components, not raw text. */}
        <View style={{ x: 1, y: 1, width: 3, height: 2 }}>Plain child</View>
      </Slide>
    ));

    expect(() => deck.render()).toThrowError(
      "Only deckjsx components can be children of View in structured layout.",
    );
  });

  test("render rejects non-text children inside text nodes", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Invalid text child">
        <Text style={{ x: 1, y: 1, width: 3, height: 1 }}>
          {/* @ts-expect-error Text children must be text-like values, not structured nodes. */}
          <View style={{ width: 1, height: 1 }} />
        </Text>
      </Slide>
    ));

    expect(() => deck.render()).toThrowError(
      "Text nodes can only contain string or number children.",
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import {
  CompositionDiagnosticError,
  Deck,
  Image,
  SemanticGraphDiagnosticError,
  Slide,
  Text,
  View,
  type ContentJsxChild,
  type TextJsxChild,
} from "../src/index.ts";

function values<T>(map: ReadonlyMap<unknown, T>): T[] {
  return [...map.values()];
}

describe("Semantic Author Graph", () => {
  test("compile returns a graph with semantic roles, inline children, styles, and assets", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Graph">
        <main style={{ x: 1, y: 1, width: 8, height: 4 }}>
          <h1 style={{ fontSize: 28 }}>
            Sales <span style={{ color: "red" }}>grew</span>
          </h1>
          <figure>
            <img src="chart.png" />
          </figure>
        </main>
      </Slide>
    ));

    const graph = deck.compile();
    const nodes = values(graph.nodes);
    const heading = nodes.find((node) => node.kind === "text" && node.role?.kind === "heading");
    const image = nodes.find((node) => node.kind === "image");

    expect(graph.nodes.get(graph.documentId)).toMatchObject({
      kind: "document",
      role: { kind: "document" },
    });
    expect(heading).toMatchObject({
      kind: "text",
      authoredTag: "h1",
      role: { kind: "heading", level: 1 },
    });
    expect(heading && "inlineChildren" in heading ? heading.inlineChildren : []).toHaveLength(2);
    expect(image).toMatchObject({
      kind: "image",
      authoredTag: "img",
      role: { kind: "image" },
    });
    expect(graph.styles.size).toBeGreaterThanOrEqual(2);
    expect(graph.assets.size).toBe(1);
  });

  test("captures className as ordered style class references without resolving classes", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Classes" className="deck-slide">
        <View
          className={[
            "card",
            false,
            ["selected", { active: true, disabled: false, "": true, "   ": true }],
            "wide card",
          ]}
          x={1}
        >
          <Text className={{ title: true, muted: null }}>
            Hello <span className="accent">world</span>
          </Text>
          <Image src="chart.png" className="chart-image" />
        </View>
      </Slide>
    ));

    const graph = deck.compile();
    const view = values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredComponent === "View",
    );
    const slide = values(graph.nodes).find((node) => node.kind === "slide");
    const image = values(graph.nodes).find((node) => node.kind === "image");
    const span = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "world",
    );

    expect(view?.styleRef).toBeDefined();
    expect(graph.styles.get(view?.styleRef ?? ("" as never))?.authored).toEqual({
      direct: { x: 1 },
      classRefs: [
        { name: "card", index: 0 },
        { name: "selected", index: 1 },
        { name: "active", index: 2 },
        { name: "wide", index: 3 },
        { name: "card", index: 4 },
      ],
    });
    expect(graph.styles.get(slide?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "deck-slide", index: 0 },
    ]);
    expect(graph.styles.get(image?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "chart-image", index: 0 },
    ]);
    expect(graph.styles.get(span?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "accent", index: 0 },
    ]);
    expect(graph.styles.get(view?.styleRef ?? ("" as never))?.authored.direct).not.toHaveProperty(
      "className",
    );
    expect(graph.styles.get(view?.styleRef ?? ("" as never))).not.toHaveProperty("resolved");
  });

  test("inspect mode returns diagnostics for invalid inline structure without throwing", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Invalid">
        <div>
          <span>orphan inline</span>
        </div>
      </Slide>
    ));

    const result = deck.compile({ mode: "inspect" });

    expect(result.graph).toBeDefined();
    expect(result.diagnostics.hasErrors).toBe(true);
    expect(result.diagnostics.items[0]).toMatchObject({
      severity: "error",
      code: "E_SEMANTIC_STRUCTURE",
      title: "span cannot appear here",
    });
    expect(() => deck.compile()).toThrowError(SemanticGraphDiagnosticError);
  });

  test("fragments are transparent and preserve multiple graph children", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Fragment children">
        <View>
          <>
            <Text>First</Text>
            <Text>Second</Text>
          </>
        </View>
      </Slide>
    ));

    const graph = deck.compile();
    const view = values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredComponent === "View",
    );

    expect(view && "children" in view ? view.children : []).toHaveLength(2);
  });

  test("compile reports invalid slide factory roots as composition diagnostics", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => "not a slide");

    const result = deck.compile({ mode: "inspect" });

    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      hasErrors: true,
      items: [
        {
          code: "E_COMPOSITION_INVALID_ROOT",
          title: "slide factory must return a <Slide /> root",
        },
      ],
    });
    expect(() => deck.compile()).toThrowError(CompositionDiagnosticError);
  });

  test("composes mounted sources in registration order with source-aware origins", () => {
    const section = new Deck<{ sectionTitle: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    section.add(({ context, composition }) => (
      <Slide name={context.sectionTitle}>
        <Text>
          {context.sectionTitle}:{composition.sourceKey}:{composition.slideIndex}/
          {composition.totalSlides}:{composition.deckSlideIndex}/{composition.deckTotalSlides}
        </Text>
      </Slide>
    ));

    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.add(({ composition }) => (
      <Slide name="Root">
        <Text>root:{composition.deckSlideIndex}</Text>
      </Slide>
    ));
    deck.mount("peer-comparison", section, { sectionTitle: "Peer" });
    deck.add(({ composition }) => (
      <Slide name="Tail">
        <Text>tail:{composition.deckSlideIndex}</Text>
      </Slide>
    ));

    const graph = deck.compile();
    const runs = values(graph.nodes).filter((node) => node.kind === "textRun");
    const peerRun = runs.find((node) => node.text.includes("Peer"));

    expect(runs.map((node) => node.text).join("")).toContain("root:0");
    expect(runs.map((node) => node.text).join("")).toContain("Peer:peer-comparison:0/1:1/3");
    expect(runs.map((node) => node.text).join("")).toContain("tail:2");
    expect(peerRun?.origin.source).toEqual({
      kind: "mounted",
      sourceKey: "peer-comparison",
      sourceIdentity: "peer-comparison",
    });
  });

  test("nested mounts resolve through source context mappers", () => {
    const metrics = new Deck<{ companyId: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    metrics.add(({ context, composition }) => (
      <Slide name="Metrics">
        <Text>
          metrics:{context.companyId}:{composition.sourceKey}:{composition.deckSlideIndex}
        </Text>
      </Slide>
    ));

    const company = new Deck<{ company: { id: string; name: string } }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    company.add(({ context }) => (
      <Slide name="Company">
        <Text>{context.company.name}</Text>
      </Slide>
    ));
    company.mount("metrics", metrics, (context) => ({ companyId: context.company.id }));

    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.mount("company-a", company, { company: { id: "c-a", name: "Company A" } });

    const graph = deck.compile();
    const allText = values(graph.nodes)
      .filter((node) => node.kind === "textRun")
      .map((node) => node.text)
      .join("");
    const metricsRun = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text.includes("metrics"),
    );

    expect(allText).toContain("Company A");
    expect(allText).toContain("metrics:c-a:metrics:1");
    expect(metricsRun?.origin.source).toEqual({
      kind: "mounted",
      sourceKey: "metrics",
      sourceIdentity: "company-a/metrics",
    });
  });

  test("composition diagnostics prevent graph construction in inspect mode", () => {
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.add(() => <Slide name="Child" />);

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("duplicate", child);
    deck.mount("duplicate", child);
    deck.mount("invalid/key", child);

    const result = deck.compile({ mode: "inspect" });

    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_COMPOSITION_DUPLICATE_SOURCE_KEY",
      "E_COMPOSITION_INVALID_SOURCE_KEY",
    ]);
    expect(() => deck.compile()).toThrowError(CompositionDiagnosticError);
  });

  test("composition detects mapper failures, async mappers, and cycles", () => {
    const child = new Deck<{ value: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    child.add(({ context }) => (
      <Slide>
        <Text>{context.value}</Text>
      </Slide>
    ));

    const cycle = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    cycle.mount("self", cycle);

    const mapperFailures = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    mapperFailures.mount("throws", child, () => {
      throw new Error("no value");
    });
    mapperFailures.mount("async", child, () => Promise.resolve({ value: "later" }) as never);

    expect(cycle.compile({ mode: "inspect" }).diagnostics.items[0]).toMatchObject({
      code: "E_COMPOSITION_CYCLE",
    });
    expect(
      mapperFailures.compile({ mode: "inspect" }).diagnostics.items.map((item) => item.code),
    ).toEqual(["E_COMPOSITION_CONTEXT_MAPPER_FAILED", "E_COMPOSITION_CONTEXT_MAPPER_ASYNC"]);
  });

  test("source slot origin keeps caller source while identity includes slot field", () => {
    const section = new Deck<{ note: ContentJsxChild }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    section.add(({ context }) => (
      <Slide name="Section">
        <View>
          <Text>child</Text>
          {context.note}
        </View>
      </Slide>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("section", section, {
      note: <Text key="caller-note">Caller note</Text>,
    });

    const graph = deck.compile();
    const noteRun = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "Caller note",
    );

    expect(noteRun?.origin.source).toEqual({ kind: "root" });
    expect(String(noteRun?.id)).toContain("slot:note");
  });

  test("source slot fragment origin is preserved inside text-like nodes", () => {
    const section = new Deck<{ note: TextJsxChild }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    section.add(({ context }) => (
      <Slide name="Section">
        <Text>{context.note}</Text>
      </Slide>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("section", section, {
      note: (
        <>
          Caller <span>note</span>
        </>
      ),
    });

    const graph = deck.compile();
    const callerRun = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "Caller ",
    );
    const spanRun = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "note",
    );

    expect(callerRun?.origin.source).toEqual({ kind: "root" });
    expect(spanRun?.origin.source).toEqual({ kind: "root" });
    expect(String(callerRun?.id)).toContain("slot:note");
    expect(String(spanRun?.id)).toContain("slot:note");
  });

  test("legacy render and output reject decks with mounted sources", async () => {
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.add(() => <Slide name="Child" />);

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("child", child);

    expect(() => deck.render()).toThrowError("Mounted sources are supported by compile() only");
    await expect(deck.output({ backend: "pptxgenjs", output: "unused.pptx" })).rejects.toThrow(
      "Mounted sources are supported by compile() only",
    );
  });
});

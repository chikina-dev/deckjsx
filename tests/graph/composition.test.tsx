import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";
import type { ContentJsxChild, TextJsxChild } from "../../src/index.ts";

function values<T>(map: ReadonlyMap<PropertyKey, T>): T[] {
  return [...map.values()];
}

describe("composition", () => {
  test("compile wraps slide factory content in slide declarations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => "slide text");

    const result = deck.compile();

    expect(result.graph).toBeDefined();
    expect(result.ok).toBe(true);
  });

  test("composes mounted sources in registration order with source-aware origins", async () => {
    const section = new Deck<{ sectionTitle: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    section.slide(({ context, composition }) => (
      <>
        <p>
          {context.sectionTitle}:{composition.sourceKey}:{composition.slideIndex}/
          {composition.totalSlides}:{composition.deckSlideIndex}/{composition.deckTotalSlides}
        </p>
      </>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Root" }, ({ composition }) => (
      <>
        <p>root:{composition.deckSlideIndex}</p>
      </>
    ));
    deck.mount("peer-comparison", section, { sectionTitle: "Peer" });
    deck.slide({ name: "Tail" }, ({ composition }) => (
      <>
        <p>tail:{composition.deckSlideIndex}</p>
      </>
    ));

    const graph = deck.compile().graph!;
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

  test("nested mounts resolve through source context mappers", async () => {
    const metrics = new Deck<{ companyId: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    metrics.slide({ name: "Metrics" }, ({ context, composition }) => (
      <>
        <p>
          metrics:{context.companyId}:{composition.sourceKey}:{composition.deckSlideIndex}
        </p>
      </>
    ));

    const company = new Deck<{ company: { id: string; name: string } }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    company.slide({ name: "Company" }, ({ context }) => (
      <>
        <p>{context.company.name}</p>
      </>
    ));
    company.mount("metrics", metrics, (context) => ({ companyId: context.company.id }));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("company-a", company, { company: { id: "c-a", name: "Company A" } });

    const graph = deck.compile().graph!;
    const all = values(graph.nodes)
      .filter((node) => node.kind === "textRun")
      .map((node) => node.text)
      .join("");
    const metricsRun = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text.includes("metrics"),
    );

    expect(all).toContain("Company A");
    expect(all).toContain("metrics:c-a:metrics:1");
    expect(metricsRun?.origin.source).toEqual({
      kind: "mounted",
      sourceKey: "metrics",
      sourceIdentity: "company-a/metrics",
    });
  });

  test("composition diagnostics prevent graph construction in inspect mode", async () => {
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.slide({ name: "Child" }, () => <></>);

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("duplicate", child);
    deck.mount("duplicate", child);
    deck.mount("invalid/key", child);

    const result = deck.compile();

    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_COMPOSITION_DUPLICATE_SOURCE_KEY",
      "E_COMPOSITION_INVALID_SOURCE_KEY",
    ]);
    expect(result.ok).toBe(false);
  });

  test("composition detects mapper failures, async mappers, and cycles", async () => {
    const child = new Deck<{ value: string }>({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.slide(({ context }) => (
      <>
        <p>{context.value}</p>
      </>
    ));

    const cycle = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    cycle.mount("self", cycle);

    const mapperFailures = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    mapperFailures.mount("throws", child, () => {
      throw new Error("no value");
    });
    mapperFailures.mount("async", child, () => Promise.resolve({ value: "later" }) as never);

    expect(cycle.compile().diagnostics.items[0]).toMatchObject({ code: "E_COMPOSITION_CYCLE" });
    expect(mapperFailures.compile().diagnostics.items.map((item) => item.code)).toEqual([
      "E_COMPOSITION_CONTEXT_MAPPER_FAILED",
      "E_COMPOSITION_CONTEXT_MAPPER_ASYNC",
    ]);
  });

  test("source slot origin keeps caller source while identity includes slot field", async () => {
    const section = new Deck<{ note: ContentJsxChild }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    section.slide({ name: "Section" }, ({ context }) => (
      <>
        <div>
          <p>child</p>
          {context.note}
        </div>
      </>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("section", section, { note: <p key="caller-note">Caller note</p> });

    const graph = deck.compile().graph!;
    const noteRun = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "Caller note",
    );

    expect(noteRun?.origin.source).toEqual({ kind: "root" });
    expect(String(noteRun?.id)).toContain("slot:note");
  });

  test("source slot fragment origin is preserved inside text-like nodes", async () => {
    const section = new Deck<{ note: TextJsxChild }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    section.slide({ name: "Section" }, ({ context }) => (
      <>
        <p>{context.note}</p>
      </>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("section", section, {
      note: (
        <>
          Caller <span>note</span>
        </>
      ),
    });

    const graph = deck.compile().graph!;
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

  test("mounted source graph identities distinguish source keys with slug collisions", async () => {
    const spaced = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    spaced.slide({ name: "Spaced" }, () => (
      <>
        <p>SPACED</p>
      </>
    ));

    const underscored = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    underscored.slide({ name: "Underscored" }, () => (
      <>
        <p>UNDERSCORED</p>
      </>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("a b", spaced);
    deck.mount("a_b", underscored);

    const graph = deck.compile().graph!;
    const document = graph.nodes.get(graph.documentId)!;
    if (document.kind !== "document") {
      throw new Error("Expected document node");
    }
    const documentChildren = document.children;
    const runs = values(graph.nodes)
      .filter((node) => node.kind === "textRun")
      .map((node) => node.text);

    expect(new Set(documentChildren).size).toBe(2);
    expect(runs).toContain("SPACED");
    expect(runs).toContain("UNDERSCORED");
  });

  test("project and render support decks with mounted sources", async () => {
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.slide({ name: "Child" }, () => <></>);

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("child", child);

    const project = await deck.project();
    expect(project.ok).toBe(true);
    expect(project.projection?.slides).toHaveLength(1);

    const render = await deck.render();
    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src/index.ts";
import type { ContentJsxChild, TextJsxChild } from "@/src/index.ts";
import { jsx } from "@/src/jsx-runtime.ts";
import { expectPptxProjection } from "../helpers.ts";

function values<T>(map: ReadonlyMap<PropertyKey, T>): T[] {
  return [...map.values()];
}

describe("composition", () => {
  test("compile wraps slide factory content in slide declarations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => <p>slide text</p>);

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

  test("the same child Deck can be mounted more than once with independent contexts", async () => {
    const child = new Deck<{ label: string }>({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.slide(({ context, composition }) => (
      <p>
        {context.label}:{composition.sourceKey}:{composition.slideIndex}/{composition.totalSlides}:
        {composition.deckSlideIndex}/{composition.deckTotalSlides}
      </p>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>root</p>);
    deck.mount("north", child, { label: "North" });
    deck.mount("south", child, { label: "South" });

    const graph = deck.compile().graph!;
    const runs = values(graph.nodes).filter((node) => node.kind === "textRun");
    const allText = runs.map((node) => node.text).join("");
    const northRun = runs.find((node) => node.text.includes("North"));
    const southRun = runs.find((node) => node.text.includes("South"));

    expect(allText).toContain("North:north:0/1:1/3");
    expect(allText).toContain("South:south:0/1:2/3");
    expect(northRun?.origin.source).toEqual({
      kind: "mounted",
      sourceKey: "north",
      sourceIdentity: "north",
    });
    expect(southRun?.origin.source).toEqual({
      kind: "mounted",
      sourceKey: "south",
      sourceIdentity: "south",
    });
  });

  test("the same child Deck can be mounted through multiple BoundSources", async () => {
    const child = new Deck<{ label: string }>({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.slide(({ context, composition }) => (
      <p>
        {context.label}:{composition.sourceKey}:{composition.slideIndex}/{composition.totalSlides}:
        {composition.deckSlideIndex}/{composition.deckTotalSlides}
      </p>
    ));

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount("north", child.withSource({ label: "North" }));
    deck.mount("south", child.withSource({ label: "South" }));

    const graph = deck.compile().graph!;
    const allText = values(graph.nodes)
      .filter((node) => node.kind === "textRun")
      .map((node) => node.text)
      .join("");

    expect(allText).toContain("North:north:0/1:0/2");
    expect(allText).toContain("South:south:0/1:1/2");
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
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_SOURCE_KEY",
        title: "source key is not part of the public authoring API",
        message: expect.stringContaining("public authoring API"),
      }),
    );
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
    const mapperDiagnostics = mapperFailures.compile().diagnostics.items;
    expect(mapperDiagnostics.map((item) => item.code)).toEqual([
      "E_COMPOSITION_CONTEXT_MAPPER_FAILED",
      "E_COMPOSITION_CONTEXT_MAPPER_ASYNC",
    ]);
    expect(mapperDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPOSITION_CONTEXT_MAPPER_ASYNC",
          title: "source context mapper return value is not part of the public authoring API",
          message: expect.stringContaining("public authoring API"),
        }),
      ]),
    );
  });

  test("composition reports slide factory failures as diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken" }, () => {
      throw new Error("bad child");
    });

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_SLIDE_FACTORY_FAILED",
        message: "bad child",
      }),
    ]);
  });

  test("composition reports JSX runtime authoring value failures as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <div style={(<p>not style</p>) as never} />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_PROP_VALUE",
        title: "authoring prop value is not part of the public authoring API",
        message: expect.stringContaining('JSX prop "style"'),
      }),
    ]);
  });

  test("composition reports non-plain JSX prop values as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => (
      <>
        <div style={new Date("2026-06-28T00:00:00.000Z") as never} />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_PROP_VALUE",
        title: "authoring prop value is not part of the public authoring API",
        message: expect.stringContaining('JSX prop "style"'),
      }),
    ]);
  });

  test("composition reports JSX runtime child failures as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>{{ value: "not text" } as never}</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_CHILD",
        title: "authoring child is not part of the public authoring API",
        message: expect.stringContaining("JSX children"),
      }),
    ]);
  });

  test("composition reports non-finite numeric JSX children as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>{Number.NaN as never}</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_CHILD",
        title: "authoring child is not part of the public authoring API",
        message: expect.stringContaining("finite"),
      }),
    ]);
  });

  test("composition reports cyclic JSX child arrays as public API diagnostics", async () => {
    const children: unknown[] = [];
    children.push(children);

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("p", { children } as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_CHILD",
        title: "authoring child is not part of the public authoring API",
        message: expect.stringContaining("cyclic"),
      }),
    ]);
  });

  test("composition reports non-public JSX intrinsic tags as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("button" as never, { children: "bad" } as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_NON_PUBLIC_AUTHORING_TAG",
        title: "JSX intrinsic tag is not part of the public authoring API",
        message: expect.stringMatching(
          /<button> is not part of the public deckjsx JSX authoring API/,
        ),
      }),
    ]);
  });

  test("composition reports invalid JSX element types as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx(null as never, null as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_ELEMENT_TYPE",
        title: "JSX element type is not part of the public authoring API",
        message: expect.stringContaining("function component"),
      }),
    ]);
  });

  test("composition reports invalid JSX props objects as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("p", 123 as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_PROPS",
        title: "JSX props are not part of the public authoring API",
        message: expect.stringContaining("plain object or null"),
      }),
    ]);
  });

  test("composition reports JSX array props as invalid props objects", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("p", [] as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_PROPS",
        title: "JSX props are not part of the public authoring API",
        message: expect.stringContaining("plain object or null"),
      }),
    ]);
  });

  test("composition reports non-plain JSX props objects as invalid props objects", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("p", new Date("2026-06-28T00:00:00.000Z") as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_PROPS",
        title: "JSX props are not part of the public authoring API",
        message: expect.stringContaining("plain object or null"),
      }),
    ]);
  });

  test("composition reports invalid JSX keys as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("p", { children: "keyed" }, { id: "bad" } as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_KEY",
        title: "JSX key is not part of the public authoring API",
        message: expect.stringContaining("string, number, or bigint"),
      }),
    ]);
  });

  test("composition reports non-finite numeric JSX keys as public API diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx("p", { children: "keyed" }, Number.NaN as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_KEY",
        title: "JSX key is not part of the public authoring API",
        message: expect.stringContaining("finite"),
      }),
    ]);
  });

  test("composition reports invalid JSX component returns as public API diagnostics", async () => {
    function BadComponent() {
      return "not an element" as never;
    }

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => jsx(BadComponent as never, {} as never));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_AUTHORING_COMPONENT_RETURN",
        title: "JSX component return is not part of the public authoring API",
        message: expect.stringContaining("Function components"),
      }),
    ]);
  });

  test("composition reports slide declaration inputs outside the public authoring API", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(null as never, () => <p>invalid options</p>);
    deck.slide({ name: "Not a function" }, "plain text" as never);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPOSITION_INVALID_SLIDE_OPTIONS",
          title: "slide declaration options are not part of the public authoring API",
          message: "deck.slide() options must be an object in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_COMPOSITION_INVALID_SLIDE_FACTORY",
          title: "slide factory is not part of the public authoring API",
          message: "deck.slide() factory must be a function.",
        }),
      ]),
    );
  });

  test("composition reports invalid slide option values instead of throwing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ style: (<p>not style</p>) as never }, () => <p>ok</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPOSITION_INVALID_SLIDE_OPTION_VALUE",
        title: "slide option value is not part of the public authoring API",
        message: expect.stringContaining('slide option "style"'),
      }),
    ]);
  });

  test("composition reports mount inputs outside the public authoring API", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.mount(123 as never, new Deck({ layout: { width: 10, height: 5.625, unit: "in" } }));
    deck.mount("not-a-source", null as never);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPOSITION_INVALID_SOURCE_KEY",
          message: "Source Key must be a string in the public authoring API.",
        }),
        expect.objectContaining({
          code: "E_COMPOSITION_INVALID_MOUNT_SOURCE",
          title: "mounted source is not part of the public authoring API",
          message: "deck.mount() child must be a Deck or BoundSource.",
        }),
      ]),
    );
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
    expect(expectPptxProjection(project).slides).toHaveLength(1);

    const render = await deck.render();
    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
  });
});

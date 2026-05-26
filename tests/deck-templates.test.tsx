import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, StyleSheet, Text } from "../src/index.ts";
import type { ContentJsxChild } from "../src/index.ts";
import { createTemplateAreaRef } from "../src/templates.ts";

const layout = { width: 10, height: 5.625, unit: "in" as const };

describe("Deck slide templates", () => {
  test("compile exposes slide template and template area references", () => {
    const deck = new Deck({
      layout,
      templates: {
        titleSlide: {
          areas: {
            title: { frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
          },
        },
      },
    });

    deck.slide({ name: "Title", template: "titleSlide" }, ({ template }) => (
      <h1 area={template.title}>Quarterly Review</h1>
    ));

    const graph = deck.compile().graph!;
    const slide = [...graph.nodes.values()].find((node) => node.kind === "slide");
    const title = [...graph.nodes.values()].find((node) => node.kind === "text");

    expect(slide).toMatchObject({
      kind: "slide",
      name: "Title",
      templateRef: { name: "titleSlide" },
    });
    expect(title).toMatchObject({
      kind: "text",
      templateAreaRef: { template: "titleSlide", area: "title" },
    });
  });

  test("project resolves template area frames below inline positional style", () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          areas: {
            title: { frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
          },
        },
      },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: {
            style: { x: 2, y: 2, width: 2, height: 2 },
          },
        },
      }),
    );

    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title} className="title" style={{ x: 1.1 }}>
        Quarterly Review
      </h1>
    ));

    const [title] = deck.project().projection!.slides[0]?.payload.elements ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(1.1 * EMU_PER_INCH);
    expect(title?.frame.yEmu).toBeCloseTo(0.6 * EMU_PER_INCH);
    expect(title?.frame.widthEmu).toBeCloseTo(8 * EMU_PER_INCH);
    expect(title?.frame.heightEmu).toBeCloseTo(0.8 * EMU_PER_INCH);
  });

  test("project resolves template area frames from the enclosing slide scope", () => {
    const childTemplates = {
      report: {
        areas: {
          title: { frame: { x: 1.25, y: 0.75, width: 7, height: 1 } },
        },
      },
    } as const;
    const child = new Deck<{ title: ContentJsxChild }, typeof childTemplates>({
      layout,
      templates: childTemplates,
    });

    child.slide({ template: "report" }, ({ context }) => <>{context.title}</>);

    const deck = new Deck({ layout });
    deck.mount("child", child, {
      title: <h1 area={createTemplateAreaRef("report", "title")}>Slotted Title</h1>,
    });

    const [title] = deck.project().projection!.slides[0]?.payload.elements ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(1.25 * EMU_PER_INCH);
    expect(title?.frame.yEmu).toBeCloseTo(0.75 * EMU_PER_INCH);
    expect(title?.frame.widthEmu).toBeCloseTo(7 * EMU_PER_INCH);
    expect(title?.frame.heightEmu).toBeCloseTo(1 * EMU_PER_INCH);
  });

  test("compile reports invalid template area relationships", () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          areas: {
            title: { frame: { x: 0, y: 0, width: 5, height: 1 } },
            body: { frame: { x: 0, y: 1, width: 5, height: 3 } },
          },
        },
        other: {
          areas: {
            title: { frame: { x: 1, y: 1, width: 5, height: 1 } },
          },
        },
      },
    });

    let leakedTitle: unknown;
    deck.slide({ template: "other" }, ({ template }) => {
      leakedTitle = template.title;
      return <Text>Other</Text>;
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Title</h1>
        <p area={template.title}>Duplicate</p>
        <section>
          <p area={template.body}>Nested</p>
        </section>
        <p area={leakedTitle as never}>Mismatch</p>
      </>
    ));
    deck.slide(() => <p area={leakedTitle as never}>No template</p>);

    const diagnostics = deck.compile().diagnostics.items.map((item) => item.code);
    expect(diagnostics).toEqual([
      "E_TEMPLATE_AREA_DUPLICATE",
      "E_TEMPLATE_AREA_NESTED",
      "E_TEMPLATE_AREA_REF_MISMATCH",
      "E_TEMPLATE_AREA_WITHOUT_TEMPLATE",
    ]);
  });

  test("compile validates the whole Deck template set", () => {
    const deck = new Deck({
      layout,
      templates: {
        $reserved: {
          areas: {
            title: { frame: { x: 0, y: 0, width: 5, height: 1 } },
          },
        },
        broken: {
          areas: {
            $area: { frame: { x: 0, y: 0, width: 5, height: 1 } },
            body: { frame: { x: 0, y: 1, width: 5 } as never },
          },
        },
      },
    });

    deck.slide(() => <Text>Validation</Text>);

    expect(deck.compile().diagnostics.items.map((item) => item.code)).toEqual([
      "E_TEMPLATE_RESERVED_NAME",
      "E_TEMPLATE_AREA_RESERVED_NAME",
      "E_TEMPLATE_AREA_FRAME_INCOMPLETE",
    ]);
  });

  test("compile reports unsupported template frame length strings", () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          areas: {
            title: { frame: { x: "oops", y: 0, width: "50%", height: "1in" } as never },
          },
        },
      },
    });

    deck.slide(() => <Text>Validation</Text>);

    expect(deck.compile().diagnostics.items.map((item) => item.code)).toEqual([
      "E_TEMPLATE_AREA_FRAME_INCOMPLETE",
    ]);
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, StyleSheet } from "../../src/index.ts";
import type { ContentJsxChild } from "../../src/index.ts";
import { createTemplateAreaRef } from "../../src/templates.ts";
import type { TemplateAreaRef } from "../../src/templates.ts";
import type { PptxSupportPart } from "../../src/inspect.ts";

const layout = { width: 10, height: 5.625, unit: "in" as const };

describe("Deck slide templates", () => {
  test("compile exposes slide template and template area references", async () => {
    const deck = new Deck({
      layout,
      templates: {
        titleSlide: { areas: { title: { frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } } } },
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

  test("project resolves template area frames below inline positional style", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          areas: { title: { kind: "title", frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } } },
        },
      },
    });
    deck.useStyles(
      new StyleSheet({ classes: { title: { style: { x: 2, y: 2, width: 2, height: 2 } } } }),
    );

    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title} className="title" style={{ x: 1.1 }}>
        Quarterly Review
      </h1>
    ));

    const [title] = (await deck.project()).projection!.slides[0]?.payload.drawing.children ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(1.1 * EMU_PER_INCH);
    expect(title?.frame.yEmu).toBeCloseTo(0.6 * EMU_PER_INCH);
    expect(title?.frame.widthEmu).toBeCloseTo(8 * EMU_PER_INCH);
    expect(title?.frame.heightEmu).toBeCloseTo(0.8 * EMU_PER_INCH);
    expect(title?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
      frame: title?.frame,
    });
  });

  test("project resolves template area frames from the enclosing slide scope", async () => {
    const childTemplates = {
      report: {
        areas: { title: { kind: "title", frame: { x: 1.25, y: 0.75, width: 7, height: 1 } } },
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

    const [title] = (await deck.project()).projection!.slides[0]?.payload.drawing.children ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(1.25 * EMU_PER_INCH);
    expect(title?.frame.yEmu).toBeCloseTo(0.75 * EMU_PER_INCH);
    expect(title?.frame.widthEmu).toBeCloseTo(7 * EMU_PER_INCH);
    expect(title?.frame.heightEmu).toBeCloseTo(1 * EMU_PER_INCH);
    expect(title?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
      frame: title?.frame,
    });
  });

  test("project summary exposes template area layout anchors", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: { areas: { title: { frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } } } },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title}>Quarterly Review</h1>
    ));

    const project = await deck.project();
    const element = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.summary?.slides[0]?.elements[0]?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "generic",
      frame: element?.frame,
    });
  });

  test("project preserves template area anchors on template-derived slide layouts", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          areas: {
            title: { kind: "title", frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
            body: { frame: { x: 0.7, y: 1.7, width: 8, height: 3.2 } },
          },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Quarterly Review</h1>
        <section area={template.body}>Body</section>
      </>
    ));

    const project = await deck.project();
    const templateLayout = project.projection?.parts.find(
      (part) =>
        part.kind === "slide-layout" &&
        (part.payload as { template?: { name?: string } } | undefined)?.template?.name === "report",
    );
    const slide = project.projection?.slides[0];

    expect(templateLayout?.payload).toMatchObject({
      kind: "slide-layout",
      name: "report",
      template: { sourceKey: "root", name: "report" },
      placeholderStrategy: "none",
      layoutAnchors: [
        { template: "report", area: "title", kind: "title", placeholderStrategy: "none" },
        { template: "report", area: "body", kind: "generic", placeholderStrategy: "none" },
      ],
    });
    expect(
      (
        templateLayout as
          | Extract<PptxSupportPart, { readonly payload: { readonly kind: "slide-layout" } }>
          | undefined
      )?.payload.layoutAnchors?.[0]?.frame,
    ).toEqual(slide?.payload.drawing.children[0]?.layoutAnchor?.frame);
    expect(slide?.relationships?.[0]).toMatchObject({
      type: "slideLayout",
      targetPartId: templateLayout?.id,
      targetPath: templateLayout?.path,
    });
  });

  test("template area anchor changes invalidate dependent slide fingerprints", async () => {
    const projectWithTitleX = async (x: number) => {
      const deck = new Deck({
        layout,
        templates: {
          report: {
            areas: { title: { kind: "title", frame: { x, y: 0.6, width: 8, height: 0.8 } } },
          },
        },
      });
      deck.slide({ template: "report" }, ({ template }) => (
        <h1 area={template.title}>Quarterly Review</h1>
      ));

      const projection = (await deck.project()).projection!;
      const layoutPart = projection.parts.find(
        (part) =>
          part.kind === "slide-layout" &&
          (part.payload as { template?: { name?: string } } | undefined)?.template?.name ===
            "report",
      )!;
      const slide = projection.slides[0]!;
      const slideLayoutDependency = slide.dependencyFingerprints?.find(
        (dependency) => dependency.packagePartId === layoutPart.id,
      );

      return { layoutPart, slide, slideLayoutDependency };
    };

    const before = await projectWithTitleX(0.7);
    const after = await projectWithTitleX(1.2);

    expect(before.slide.relationships?.[0]).toMatchObject({
      type: "slideLayout",
      targetPartId: before.layoutPart.id,
    });
    expect(before.slideLayoutDependency).toMatchObject({
      packagePartId: before.layoutPart.id,
      fingerprint: before.layoutPart.fingerprint,
    });
    expect(after.slideLayoutDependency).toMatchObject({
      packagePartId: after.layoutPart.id,
      fingerprint: after.layoutPart.fingerprint,
    });
    expect(before.layoutPart.fingerprint).not.toBe(after.layoutPart.fingerprint);
    expect(before.slideLayoutDependency?.fingerprint).not.toBe(
      after.slideLayoutDependency?.fingerprint,
    );
  });

  test("compile reports invalid template area relationships", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          areas: {
            title: { frame: { x: 0, y: 0, width: 5, height: 1 } },
            body: { frame: { x: 0, y: 1, width: 5, height: 3 } },
          },
        },
        other: { areas: { title: { frame: { x: 1, y: 1, width: 5, height: 1 } } } },
      },
    });

    let leakedTitle: TemplateAreaRef | undefined;
    deck.slide({ template: "other" }, ({ template }) => {
      leakedTitle = template.title;
      return <p>Other</p>;
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

  test("compile validates the whole Deck template set", async () => {
    const deck = new Deck({
      layout,
      templates: {
        $reserved: { areas: { title: { frame: { x: 0, y: 0, width: 5, height: 1 } } } },
        broken: {
          areas: {
            $area: { frame: { x: 0, y: 0, width: 5, height: 1 } },
            body: { frame: { x: 0, y: 1, width: 5 } as never },
            subtitle: { kind: "headline", frame: { x: 0, y: 4, width: 5, height: 1 } } as never,
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    expect(deck.compile().diagnostics.items.map((item) => item.code)).toEqual([
      "E_TEMPLATE_RESERVED_NAME",
      "E_TEMPLATE_AREA_RESERVED_NAME",
      "E_TEMPLATE_AREA_FRAME_INCOMPLETE",
      "E_TEMPLATE_AREA_KIND_INVALID",
    ]);
  });

  test("compile reports unsupported template frame length strings", async () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          areas: { title: { frame: { x: "oops", y: 0, width: "50%", height: "1in" } as never } },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    expect(deck.compile().diagnostics.items.map((item) => item.code)).toEqual([
      "E_TEMPLATE_AREA_FRAME_INCOMPLETE",
    ]);
  });
});

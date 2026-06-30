import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, StyleSheet } from "@/src/index.ts";
import type { ContentJsxChild } from "@/src/index.ts";
import { createTemplateAreaRef } from "@/src/templates.ts";
import type { TemplateAreaRef } from "@/src/templates.ts";
import type { PptxSupportPart } from "@/src/inspect.ts";
import type { InternalProjectResult } from "@/src/pipeline/results.ts";
import { expectPptxProjection } from "../helpers";

const layout = { width: 10, height: 5.625, unit: "in" as const };

describe("Deck slide templates", () => {
  test("compile reports template sets outside the public authoring API", async () => {
    const deck = new Deck({ layout, templates: null } as never);
    deck.slide(() => <p>Invalid templates</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_TEMPLATE_SET_INVALID",
        title: "slide templates are not part of the public authoring API",
        message:
          "Slide Template definitions must be an object keyed by template names in the public authoring API.",
      }),
    ]);
  });

  test("compile exposes slide template and template area references", async () => {
    const deck = new Deck({
      layout,
      templates: {
        titleSlide: {
          style: { display: "grid", gridTemplateAreas: ['"title"'] },
          areas: { title: { style: { gridArea: "title" } } },
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

  test("project resolves template grid styles without template frames", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          style: {
            display: "grid",
            gridTemplateAreas: ['"title"', '"body"'],
            gridTemplateRows: ["1fr", "3fr"],
            rowGap: 0,
            padding: 0,
          },
          areas: {
            title: { kind: "title", style: { gridArea: "title" } },
            body: { style: { gridArea: "body" } },
          },
        },
      },
    });

    deck.slide({ template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Quarterly Review</h1>
        <section area={template.body}>
          <p>Body</p>
        </section>
      </>
    ));

    const result = await deck.project();
    expect(result.diagnostics.items).toEqual([]);
    const [title, body] = expectPptxProjection(result).slides[0]?.payload.drawing.children ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(0);
    expect(title?.frame.yEmu).toBeCloseTo(0);
    expect(title?.frame.widthEmu).toBeCloseTo(10 * EMU_PER_INCH);
    expect(title?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
    });
    expect(body?.frame.xEmu).toBeCloseTo(0);
    expect(body?.frame.yEmu).toBeGreaterThan(title?.frame.yEmu ?? 0);
    expect(body?.layoutAnchor).toMatchObject({
      template: "report",
      area: "body",
      kind: "generic",
    });
  });

  test("project resolves template area grid styles as structural anchors", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          style: {
            display: "grid",
            gridTemplateAreas: ['"title aside"'],
            gridTemplateColumns: "1fr 1fr",
            padding: 0.7,
          },
          areas: {
            title: { kind: "title", style: { gridArea: "title" } },
            aside: { style: { gridArea: "aside" } },
          },
        },
      },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: {
            target: "h1.title",
            style: { color: "#111827", gridArea: "aside" },
          },
        },
      }),
    );

    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title} className="title">
        Quarterly Review
      </h1>
    ));

    const [title] =
      expectPptxProjection(await deck.project()).slides[0]?.payload.drawing.children ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(0.7 * EMU_PER_INCH);
    expect(title?.frame.yEmu).toBeCloseTo(0.7 * EMU_PER_INCH);
    expect(title?.frame.widthEmu).toBeCloseTo(4.3 * EMU_PER_INCH);
    expect(title?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
      frame: title?.frame,
    });
  });

  test("compile rejects template area positioning offsets without explicit position", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          style: { display: "grid", gridTemplateAreas: ['"title"'] },
          areas: {
            title: { kind: "title", style: { gridArea: "title" } },
          },
        },
      },
    });

    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title} style={{ left: 1.1 } as never}>
        Quarterly Review
      </h1>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_POSITIONING_REQUIRES_POSITION",
        message: expect.stringContaining('left requires position: "absolute"'),
      }),
    );
  });

  test("project resolves template area flow styles from the enclosing slide scope", async () => {
    const childTemplates = {
      report: {
        style: {
          display: "grid",
          gridTemplateAreas: ['"title"'],
          padding: 1.25,
        },
        areas: { title: { kind: "title", style: { gridArea: "title" } } },
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

    const [title] =
      expectPptxProjection(await deck.project()).slides[0]?.payload.drawing.children ?? [];

    expect(title?.frame.xEmu).toBeCloseTo(1.25 * EMU_PER_INCH);
    expect(title?.frame.yEmu).toBeCloseTo(1.25 * EMU_PER_INCH);
    expect(title?.frame.widthEmu).toBeCloseTo(7.5 * EMU_PER_INCH);
    expect(title?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
      frame: title?.frame,
    });
  });

  test("same-named parent and child templates stay source-local", async () => {
    const parentTemplates = {
      report: {
        style: {
          display: "grid",
          gridTemplateAreas: ['"title"'],
          padding: 0.25,
        },
        areas: { title: { kind: "title", style: { gridArea: "title" } } },
      },
    } as const;
    const childTemplates = {
      report: {
        style: {
          display: "grid",
          gridTemplateAreas: ['"title"'],
          padding: 1.25,
        },
        areas: { title: { kind: "title", style: { gridArea: "title" } } },
      },
    } as const;
    const parent = new Deck({ layout, templates: parentTemplates });
    const child = new Deck({ layout, templates: childTemplates });

    parent.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title}>Parent Template</h1>
    ));
    child.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title}>Child Template</h1>
    ));
    parent.mount("child", child);

    const projection = expectPptxProjection(await parent.project());
    const [parentTitle] = projection.slides[0]?.payload.drawing.children ?? [];
    const [childTitle] = projection.slides[1]?.payload.drawing.children ?? [];

    expect(parentTitle?.frame.xEmu).toBeCloseTo(0.25 * EMU_PER_INCH);
    expect(parentTitle?.frame.widthEmu).toBeCloseTo(9.5 * EMU_PER_INCH);
    expect(parentTitle?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
      frame: parentTitle?.frame,
    });
    expect(childTitle?.frame.xEmu).toBeCloseTo(1.25 * EMU_PER_INCH);
    expect(childTitle?.frame.widthEmu).toBeCloseTo(7.5 * EMU_PER_INCH);
    expect(childTitle?.layoutAnchor).toMatchObject({
      template: "report",
      area: "title",
      kind: "title",
      frame: childTitle?.frame,
    });
  });

  test("same templated child Deck mounted twice gets source-local slide layouts", async () => {
    const childTemplates = {
      report: {
        style: {
          display: "grid",
          gridTemplateAreas: ['"title"'],
          padding: 0.5,
        },
        areas: { title: { kind: "title", style: { gridArea: "title" } } },
      },
    } as const;
    const child = new Deck<{ title: string }, typeof childTemplates>({
      layout,
      templates: childTemplates,
    });
    child.slide({ template: "report" }, ({ context, template }) => (
      <h1 area={template.title}>{context.title}</h1>
    ));

    const parent = new Deck({ layout });
    parent.mount("north", child, { title: "North" });
    parent.mount("south", child, { title: "South" });

    const projection = expectPptxProjection(await parent.project());
    const layoutParts = projection.parts.filter(
      (part) =>
        part.kind === "slide-layout" &&
        (part.payload as { template?: { name?: string } } | undefined)?.template?.name === "report",
    );
    const [northSlide, southSlide] = projection.slides;

    expect(layoutParts).toHaveLength(2);
    expect(
      layoutParts.map(
        (part) => (part.payload as { template?: { sourceKey?: string } }).template?.sourceKey,
      ),
    ).toEqual(["north", "south"]);
    expect(northSlide?.relationships?.[0]?.targetPartId).toBe(layoutParts[0]?.id);
    expect(southSlide?.relationships?.[0]?.targetPartId).toBe(layoutParts[1]?.id);
    expect(northSlide?.payload.drawing.children[0]).toMatchObject({
      kind: "text",
      content: { text: "North" },
    });
    expect(southSlide?.payload.drawing.children[0]).toMatchObject({
      kind: "text",
      content: { text: "South" },
    });
  });

  test("project summary exposes template area layout anchors", async () => {
    const deck = new Deck({
      layout,
      templates: {
        report: {
          style: { display: "grid", gridTemplateAreas: ['"title"'], padding: 0.7 },
          areas: { title: { style: { gridArea: "title" } } },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <h1 area={template.title}>Quarterly Review</h1>
    ));

    const project = await deck.project();
    const detailedProject = project as InternalProjectResult;
    const projection = expectPptxProjection(project);
    const element = projection.slides[0]?.payload.drawing.children[0];

    expect(detailedProject.summary?.slides[0]?.elements[0]?.layoutAnchor).toMatchObject({
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
          style: {
            display: "grid",
            gridTemplateAreas: ['"title"', '"body"'],
            gridTemplateRows: ["1fr", "3fr"],
            rowGap: 0.4,
            padding: 0.7,
          },
          areas: {
            title: { kind: "title", style: { gridArea: "title" } },
            body: { style: { gridArea: "body" } },
          },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Quarterly Review</h1>
        <section area={template.body}>
          <p>Body</p>
        </section>
      </>
    ));

    const project = await deck.project();
    const projection = expectPptxProjection(project);
    const templateLayout = projection.parts.find(
      (part) =>
        part.kind === "slide-layout" &&
        (part.payload as { template?: { name?: string } } | undefined)?.template?.name === "report",
    );
    const slide = projection.slides[0];

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
    ).toBeUndefined();
    expect(slide?.relationships?.[0]).toMatchObject({
      type: "slideLayout",
      targetPartId: templateLayout?.id,
      targetPath: templateLayout?.path,
    });
  });

  test("template area flow style changes invalidate dependent slide fingerprints", async () => {
    const projectWithTitlePadding = async (padding: number) => {
      const deck = new Deck({
        layout,
        templates: {
          report: {
            style: {
              display: "grid",
              gridTemplateAreas: ['"title"'],
              padding,
            },
            areas: {
              title: { kind: "title", style: { gridArea: "title" } },
            },
          },
        },
      });
      deck.slide({ template: "report" }, ({ template }) => (
        <h1 area={template.title}>Quarterly Review</h1>
      ));

      const projection = expectPptxProjection(await deck.project());
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

    const before = await projectWithTitlePadding(0.7);
    const after = await projectWithTitlePadding(1.2);

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
          style: {
            display: "grid",
            gridTemplateAreas: ['"title"', '"body"'],
            gridTemplateRows: ["1fr", "3fr"],
          },
          areas: {
            title: { style: { gridArea: "title" } },
            body: { style: { gridArea: "body" } },
          },
        },
        other: {
          style: { display: "grid", gridTemplateAreas: ['"title"'] },
          areas: { title: { style: { gridArea: "title" } } },
        },
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
        $reserved: {
          areas: { title: { style: { gridArea: "title" } } },
        },
        broken: {
          areas: {
            $area: { style: { gridArea: "body" } },
            body: {},
            subtitle: {
              kind: "headline",
              style: { gridArea: "subtitle" },
            } as never,
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    const result = deck.compile();
    const diagnostics = result.diagnostics.items;

    expect(diagnostics.map((item) => item.code)).toEqual([
      "E_TEMPLATE_RESERVED_NAME",
      "E_TEMPLATE_AREA_RESERVED_NAME",
      "E_TEMPLATE_AREA_PLACEMENT_MISSING",
      "E_TEMPLATE_AREA_KIND_INVALID",
    ]);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "slide template name is not part of the public authoring API",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          title: "template area name is not part of the public authoring API",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
        expect.objectContaining({
          title: "template area kind is not part of the public authoring API",
          message: expect.stringContaining("not part of the public authoring API"),
        }),
      ]),
    );
  });

  test("compile reports malformed template containers as public authoring diagnostics", async () => {
    const deck = new Deck({
      layout,
      templates: {
        notObject: null,
        noAreas: { areas: null },
        invalidArea: { areas: { title: null } },
        invalidRootStyle: { style: null, areas: { title: { style: { gridArea: "title" } } } },
        invalidAreaStyle: { areas: { title: { style: null } } },
      },
    } as never);

    deck.slide(() => <p>Validation</p>);

    const result = deck.compile();
    const diagnostics = result.diagnostics.items;

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_TEMPLATE_INVALID",
          title: "slide template is not part of the public authoring API",
        }),
        expect.objectContaining({
          code: "E_TEMPLATE_AREAS_INVALID",
          title: "template areas are not part of the public authoring API",
        }),
        expect.objectContaining({
          code: "E_TEMPLATE_AREA_INVALID",
          title: "template area is not part of the public authoring API",
        }),
        expect.objectContaining({
          code: "E_TEMPLATE_STYLE_INVALID",
          title: "slide template style is not part of the public authoring API",
        }),
        expect.objectContaining({
          code: "E_TEMPLATE_AREA_STYLE_INVALID",
          title: "template area style is not part of the public authoring API",
        }),
      ]),
    );
    expect(result.ok).toBe(false);
  });

  test("compile reports template frames outside the public authoring API", async () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          areas: {
            title: { frame: { left: 0, top: 0, width: 5, height: 1 } } as never,
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    expect(deck.compile().diagnostics.items.map((item) => item.code)).toEqual([
      "E_TEMPLATE_AREA_FRAME_NON_PUBLIC",
      "E_TEMPLATE_AREA_PLACEMENT_MISSING",
    ]);
  });

  test("compile reports missing template area style", async () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          areas: {
            title: {},
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    const diagnostics = deck.compile().diagnostics.items;
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_TEMPLATE_AREA_PLACEMENT_MISSING",
        message: "Template Area must define a public template-area style.",
      }),
    );
  });

  test("compile reports non-public template frame coordinate object", async () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          areas: {
            title: { frame: { x: 0, y: 0, width: 5, height: 1 } } as never,
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    const diagnostics = deck.compile().diagnostics.items;
    expect(diagnostics.map((item) => item.code)).toEqual([
      "E_TEMPLATE_AREA_FRAME_NON_PUBLIC",
      "E_TEMPLATE_AREA_PLACEMENT_MISSING",
    ]);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "Template Area frame is not part of the public authoring API",
          ),
        }),
      ]),
    );
  });

  test("compile reports non-public template area style keys", async () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          areas: {
            title: { style: { left: 1 } as never },
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    expect(deck.compile().diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_TEMPLATE_AREA_STYLE_NON_PUBLIC_PROP",
        message: expect.stringContaining(
          "Template Area style property left is not part of the public authoring API",
        ),
      }),
    );
  });

  test("compile reports non-public slide template root style keys", async () => {
    const deck = new Deck({
      layout,
      templates: {
        broken: {
          style: { left: 1 } as never,
          areas: {
            title: { style: { gridArea: "title" } },
          },
        },
      },
    });

    deck.slide(() => <p>Validation</p>);

    expect(deck.compile().diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_TEMPLATE_STYLE_NON_PUBLIC_PROP",
        message: expect.stringContaining(
          "Slide Template style property left is not part of the public authoring API",
        ),
      }),
    );
  });
});

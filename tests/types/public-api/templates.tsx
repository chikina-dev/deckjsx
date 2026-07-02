import { Deck } from "deckjsx";
import type {
  SlideTemplateSet,
  SlideTemplateStyle,
  TemplateAreaKind,
  TemplateAreaRef,
  TemplateAreaStyle,
} from "deckjsx";

const templateRootStyle = {
  display: "grid",
  gridTemplateAreas: ['"title"'],
  padding: 0.5,
} as const satisfies SlideTemplateStyle;
void templateRootStyle;

const invalidTemplateRootStyle = {
  // @ts-expect-error Slide Template root style is for flow layout, not fixed positioning.
  left: 1,
} satisfies SlideTemplateStyle;
void invalidTemplateRootStyle;

const templateAreaStyle = { gridArea: "title" } as const satisfies TemplateAreaStyle;
void templateAreaStyle;

const reportTemplates = {
  report: {
    style: {
      display: "grid",
      gridTemplateAreas: ['"title"', '"body"'],
      gridTemplateRows: ["1fr", "3fr"],
      rowGap: 0.2,
      padding: 0.5,
    },
    areas: {
      title: { kind: "title", style: { gridArea: "title" } },
      body: { style: { gridArea: "body" } },
    },
  },
  twoColumn: {
    style: {
      display: "grid",
      gridTemplateAreas: ['"left right"'],
      gridTemplateColumns: "1fr 1fr",
      columnGap: 0.4,
    },
    areas: {
      left: { style: { gridArea: "left" } },
      right: { style: { gridArea: "right" } },
    },
  },
} as const satisfies SlideTemplateSet;

const templateAreaKind = "slideNumber" satisfies TemplateAreaKind;
void templateAreaKind;

const invalidTemplateAreaKind = {
  report: {
    areas: {
      // @ts-expect-error Template Area kind is a narrow authoring vocabulary.
      title: { kind: "headline", style: { gridArea: "title" } },
    },
  },
} satisfies SlideTemplateSet;
void invalidTemplateAreaKind;

const invalidTemplateFrame = {
  report: {
    areas: {
      // @ts-expect-error Template Area frames are not part of the public authoring API.
      title: { frame: { left: 0, top: 0, width: 1, height: 1 } },
    },
  },
} satisfies SlideTemplateSet;
void invalidTemplateFrame;

const invalidTemplateAreaStyle = {
  report: {
    areas: {
      // @ts-expect-error Template Area styles only accept the public template-area style subset.
      title: { style: { left: 1 } },
    },
  },
} satisfies SlideTemplateSet;
void invalidTemplateAreaStyle;

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  templates: reportTemplates,
});

function slideBackgroundColor(): string {
  return "#F8FAFC";
}

deck.slide({ template: "report" }, ({ template }) => {
  const templateRef = template.title;
  templateRef satisfies TemplateAreaRef<"report", "title">;
  templateRef.template satisfies "report";
  templateRef.area satisfies "title";

  return (
    <>
      <h1 area={templateRef}>Title</h1>
      <section area={template.body}>
        <p>Body</p>
      </section>
    </>
  );
});

deck.slide(
  { template: "report", style: { backgroundColor: slideBackgroundColor() } },
  ({ template }) => <h1 area={template.title}>Dynamic background</h1>,
);

deck.slide({ template: "twoColumn" }, ({ template }) => (
  <>
    <section area={template.left}>
      <p>Left</p>
    </section>
    <section area={template.right}>
      <p>Right</p>
    </section>
  </>
));

deck.slide({ template: Math.random() > 0.5 ? "report" : "twoColumn" }, ({ template }) => {
  if (template.$name === "report") {
    return <h1 area={template.title}>Report</h1>;
  }

  return (
    <section area={template.left}>
      <p>Column</p>
    </section>
  );
});

// @ts-expect-error Template names are constrained by the Deck template set.
deck.slide({ template: "missing" }, () => <p>Missing</p>);

deck.slide({ template: "report" }, ({ template }) => (
  // @ts-expect-error Template areas are constrained by the selected template.
  <h1 area={template.missing}>Missing</h1>
));

// @ts-expect-error Untemplated slide factories do not receive a template handle.
deck.slide(({ template }) => <p>{template.title}</p>);

// @ts-expect-error Template Area Reference creation is library-owned.
export type NoPublicTemplateRefFactory = typeof import("deckjsx").createTemplateAreaRef;

// @ts-expect-error Template Area Reference runtime branding is library-owned.
export type NoPublicTemplateRefGuard = typeof import("deckjsx").isTemplateAreaRef;

// @ts-expect-error TemplateFrame is not a root public authoring type; prefer SlideTemplateStyle and TemplateAreaStyle.
export type NoPublicTemplateFrame = import("deckjsx").TemplateFrame;

type SourceContext = { sectionTitle: string };
const contextualDeck = new Deck<SourceContext, typeof reportTemplates>({
  layout: { width: 10, height: 5.625, unit: "in" },
  templates: reportTemplates,
});

contextualDeck.slide({ template: "report" }, ({ context, template }) => (
  <h1 area={template.title}>{context.sectionTitle}</h1>
));

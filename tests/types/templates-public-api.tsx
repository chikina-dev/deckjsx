import { Deck } from "deckjsx";
import type { SlideTemplateSet, TemplateAreaKind, TemplateAreaRef } from "deckjsx";

const reportTemplates = {
  report: {
    areas: {
      title: { kind: "title", frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
      body: { frame: { x: 0.7, y: 1.7, width: 8, height: 3.8 } },
    },
  },
  twoColumn: {
    areas: {
      left: { frame: { x: 0.7, y: 1, width: 4, height: 4 } },
      right: { frame: { x: 5.2, y: 1, width: 4, height: 4 } },
    },
  },
} as const satisfies SlideTemplateSet;

const templateAreaKind = "slideNumber" satisfies TemplateAreaKind;
void templateAreaKind;

const invalidTemplateAreaKind = {
  report: {
    areas: {
      // @ts-expect-error Template Area kind is a narrow authoring vocabulary.
      title: { kind: "headline", frame: { x: 0, y: 0, width: 1, height: 1 } },
    },
  },
} satisfies SlideTemplateSet;
void invalidTemplateAreaKind;

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  templates: reportTemplates,
});

deck.slide({ template: "report" }, ({ template }) => {
  const templateRef = template.title;
  templateRef satisfies TemplateAreaRef<"report", "title">;
  templateRef.template satisfies "report";
  templateRef.area satisfies "title";

  return (
    <>
      <h1 area={templateRef}>Title</h1>
      <section area={template.body}>Body</section>
    </>
  );
});

deck.slide({ template: "twoColumn" }, ({ template }) => (
  <>
    <section area={template.left}>Left</section>
    <section area={template.right}>Right</section>
  </>
));

deck.slide({ template: Math.random() > 0.5 ? "report" : "twoColumn" }, ({ template }) => {
  if (template.$name === "report") {
    return <h1 area={template.title}>Report</h1>;
  }

  return <section area={template.left}>Column</section>;
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

type SourceContext = { sectionTitle: string };
const contextualDeck = new Deck<SourceContext, typeof reportTemplates>({
  layout: { width: 10, height: 5.625, unit: "in" },
  templates: reportTemplates,
});

contextualDeck.slide({ template: "report" }, ({ context, template }) => (
  <h1 area={template.title}>{context.sectionTitle}</h1>
));

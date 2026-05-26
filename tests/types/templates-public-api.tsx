import { Deck, Text } from "deckjsx";
import type { SlideTemplateSet, TemplateAreaRef } from "deckjsx";

const reportTemplates = {
  report: {
    areas: {
      title: { frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
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

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  templates: reportTemplates,
});

deck.slide({ template: "report" }, ({ template }) => (
  <>
    <h1 area={template.title}>Title</h1>
    <section area={template.body}>Body</section>
  </>
));

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
deck.slide({ template: "missing" }, () => <Text>Missing</Text>);

deck.slide({ template: "report" }, ({ template }) => (
  // @ts-expect-error Template areas are constrained by the selected template.
  <h1 area={template.missing}>Missing</h1>
));

// @ts-expect-error Untemplated slide factories do not receive a template handle.
deck.slide(({ template }) => <Text>{template.title}</Text>);

const templateRef = null as unknown as TemplateAreaRef<"report", "title">;
templateRef.template satisfies "report";
templateRef.area satisfies "title";

type SourceContext = { sectionTitle: string };
const contextualDeck = new Deck<SourceContext, typeof reportTemplates>({
  layout: { width: 10, height: 5.625, unit: "in" },
  templates: reportTemplates,
});

contextualDeck.slide({ template: "report" }, ({ context, template }) => (
  <h1 area={template.title}>{context.sectionTitle}</h1>
));

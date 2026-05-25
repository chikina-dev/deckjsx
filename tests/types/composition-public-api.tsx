import { Deck, Slide, Text } from "deckjsx";
import type {
  BoundSource,
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SourceContextMapper,
} from "deckjsx";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const compositionTypeAssertions = {
  rootFactoryOmitsContext: true,
  sourceFactoryHasContext: true,
} satisfies {
  rootFactoryOmitsContext: Assert<
    IsAssignable<"context", keyof SlideFactoryInput<void>> extends true ? false : true
  >;
  sourceFactoryHasContext: Assert<
    IsAssignable<"context", keyof SlideFactoryInput<{ sectionTitle: string }>>
  >;
};
void compositionTypeAssertions;

const root = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
root.add(({ composition }) => (
  <Slide>
    <Text>{composition.slideIndex}</Text>
  </Slide>
));

root.add((input) => {
  input.composition satisfies CompositionContext;
  return <Slide />;
});

// @ts-expect-error Root slide factories do not receive Source Context.
root.add(({ context }) => <Slide>{context}</Slide>);

const section = new Deck<{ sectionTitle: string }>({
  layout: { width: 10, height: 5.625, unit: "in" },
});

section.add(({ context, composition }) => (
  <Slide name={context.sectionTitle}>
    <Text>
      {context.sectionTitle}:{composition.slideIndex}
    </Text>
  </Slide>
));

// @ts-expect-error A Deck with required Source Context cannot compile as a root.
void section.compile().graph!;

// @ts-expect-error Deck<void> has no Source Context to bind.
root.withSource({});

const bound = section.withSource({ sectionTitle: "Section" });
bound satisfies BoundSource<{ sectionTitle: string }>;
void bound.compile().graph!;

// @ts-expect-error Bound Source is not an authoring registration API.
bound.add(() => <Slide />);

// @ts-expect-error Bound Source is not an authoring registration API.
bound.mount("child", root);

root.mount("section", section, { sectionTitle: "Section" });
root.mount("section-from-root-mapper", section, () => ({ sectionTitle: "Mapped" }));
root.mount("bound-section", bound);

// @ts-expect-error A Deck with required Source Context needs Source Context or a mapper.
root.mount("missing-context", section);

// @ts-expect-error A Bound Source cannot receive additional Source Context.
root.mount("extra-bound-context", bound, { sectionTitle: "Extra" });

const childRoot = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
root.mount("child-root", childRoot);

// @ts-expect-error Deck<void> children do not receive Source Context.
root.mount("child-root-extra", childRoot, {});

const childWithContext = new Deck<{ source: string }>({
  layout: { width: 10, height: 5.625, unit: "in" },
});
section.mount("nested", childWithContext, (context) => ({ source: context.sectionTitle }));

const mapper = ((context) => ({ source: context.sectionTitle })) satisfies SourceContextMapper<
  { sectionTitle: string },
  { source: string }
>;
void mapper;

const factory = (({ composition }) => (
  <Slide name={`Slide ${composition.slideIndex + 1}`} />
)) satisfies SlideFactory;
void factory;

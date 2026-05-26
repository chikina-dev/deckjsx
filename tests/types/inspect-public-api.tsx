import { Deck, Text, View } from "deckjsx";
import type {
  GraphNodeId,
  ResolvedStyleMap,
  SemanticAuthorGraph,
  StyleClassRef,
  StyleEntity,
} from "deckjsx/inspect";
import type { CompileResult } from "deckjsx";

const styleClassRef = { name: "card", index: 0 } satisfies StyleClassRef;
const styleEntityWithClassRefs = {
  id: "style/test" as StyleEntity["id"],
  target: "container",
  authored: { classRefs: [styleClassRef] },
} satisfies StyleEntity;
void styleEntityWithClassRefs;

const styleEntityWithResolved = {
  id: "style/resolved" as StyleEntity["id"],
  target: "text",
  authored: {},
  // @ts-expect-error StyleEntity does not carry resolved concrete style values.
  resolved: {},
} satisfies StyleEntity;
void styleEntityWithResolved;

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
deck.slide(() => (
  <>
    <View>
      <Text>Inspect me</Text>
    </View>
  </>
));

const graph = deck.compile().graph!;
graph satisfies SemanticAuthorGraph;
graph.documentId satisfies GraphNodeId;

const inspect = deck.compile();
inspect satisfies CompileResult;
inspect.graph satisfies SemanticAuthorGraph | undefined;
inspect.resolvedStyles satisfies ResolvedStyleMap | undefined;

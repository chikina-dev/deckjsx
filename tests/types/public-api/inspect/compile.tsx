import { Deck } from "deckjsx";
import type { CompileResult } from "deckjsx";
import type * as I from "deckjsx/inspect";

// @ts-expect-error Package Part identity construction is library-owned.
export type NoPublicPackagePartIdFactory = typeof import("deckjsx/inspect").packagePartId;

// @ts-expect-error Graph identity construction is library-owned.
export type NoPublicGraphNodeIdFactory = typeof import("deckjsx/inspect").graphNodeId;

// @ts-expect-error Style identity construction is library-owned.
export type NoPublicStyleEntityIdFactory = typeof import("deckjsx/inspect").styleEntityId;

// @ts-expect-error Asset identity construction is library-owned.
export type NoPublicAssetEntityIdFactory = typeof import("deckjsx/inspect").assetEntityId;

// @ts-expect-error Relationship identity construction is library-owned.
export type NoPublicSerializedIdFactory = typeof import("deckjsx/inspect").serializedId;

declare const styleTestId: I.StyleEntity["id"];
declare const styleResolvedId: I.StyleEntity["id"];

const styleClassRef = { name: "card", index: 0 } satisfies I.StyleClassRef;
const styleEntityWithClassRefs = {
  id: styleTestId,
  target: "container",
  authored: { classRefs: [styleClassRef] },
} satisfies I.StyleEntity;
void styleEntityWithClassRefs;

const styleEntityWithResolved = {
  id: styleResolvedId,
  target: "text",
  authored: {},
  // @ts-expect-error I.StyleEntity does not carry resolved concrete style values.
  resolved: {},
} satisfies I.StyleEntity;
void styleEntityWithResolved;

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
deck.slide(() => (
  <>
    <div>
      <p>Inspect me</p>
    </div>
  </>
));

const graph = deck.compile().graph!;
graph satisfies NonNullable<CompileResult["graph"]>;
graph.documentId satisfies string;
const forgedGraphFacade = {
  documentId: "graph:document",
  nodes: [],
  styles: new Map<PropertyKey, never>(),
  assets: new Map<PropertyKey, never>(),
  templates: new Map<string, unknown>(),
};
// @ts-expect-error defineGraph requires the complete compiled graph facade, including map-backed nodes.
deck.defineGraph(forgedGraphFacade);
deck.defineGraph(graph);
// @ts-expect-error root CompileResult graph is a public compile summary, not the detailed inspect graph.
graph satisfies I.SemanticAuthorGraph;
// @ts-expect-error root CompileResult graph ids are public strings, not inspect-owned branded ids.
graph.documentId satisfies I.GraphNodeId;

const inspect = deck.compile();
inspect satisfies CompileResult;
inspect.graph satisfies CompileResult["graph"];
inspect.resolvedStyles satisfies CompileResult["resolvedStyles"];
// @ts-expect-error detailed graph traversal types live under deckjsx/inspect, not root CompileResult.
inspect.graph satisfies I.SemanticAuthorGraph | undefined;
// @ts-expect-error detailed resolved style maps live under deckjsx/inspect, not root CompileResult.
inspect.resolvedStyles satisfies I.ResolvedStyleMap | undefined;

# Implementation Roadmap

This document outlines separately versioned implementation milestones for the next deckjsx updates.
The goal is to keep each release useful on its own while moving the compiler toward a JSX-first,
output-agnostic architecture:

```text
JSX authoring
  -> Author Tree
  -> Semantic Author Graph
  -> Output Projection
  -> Output Writer
```

The Semantic Author Graph is the canonical internal model. Output-specific models such as a PPTX
package model should be projected from the graph rather than reading the Author Tree directly.
`PresentationIR` is part of the current rendering path, but it should not be treated as the
long-term center of the architecture.

## Versioning Strategy

The current package is `0.3.1`. Until the API is stable enough for `1.0`, each new feature family
should land as a separate minor version:

- `0.2`: HTML-like authoring syntax, followed by the first Semantic Author Graph work
- `0.3.0`: graph composition across multiple authoring sources
- `0.3.1`: inspect, diagnostics, documentation, and Semantic Author Graph readiness review
- `0.4`: class-like style reuse
- `0.5`: theme support
- `0.6`: Output Projection boundary and build/project/write API shape
- `0.7`: layout templates
- `0.8`: direct PPTX output projection and writer, replacing the required `pptxgenjs` path
- `0.9`: HMR-oriented compilation/runtime

Patch releases should be reserved for bug fixes, compatibility fixes, and documentation updates
within the latest minor line.

## Type-First User Experience

deckjsx should treat strong TypeScript types as part of the product experience, not just an
implementation detail. Users should get useful editor autocomplete, narrow prop suggestions,
element-specific child rules, and early feedback before running a deck build.

Guidelines:

- Prefer explicit discriminated types over broad `Record<string, unknown>` or index signatures.
- Model supported JSX intrinsic elements directly instead of accepting arbitrary HTML tags.
- Keep prop types specific to each element. For example, `img` should expose image source props but
  not text typography props.
- Avoid accepting values in the type system that the compiler cannot meaningfully support.
- Add negative type tests for intentionally unsupported authoring patterns.
- Preserve runtime validation for JavaScript users and unsafe casts, but do not rely on runtime
  errors as the primary developer feedback path.
- When a feature cannot be typed precisely yet, narrow the initial scope instead of shipping a loose
  API that will be hard to tighten later.

## 0.2 HTML-Like Authoring Syntax

### Goal

Make authoring feel closer to HTML while keeping deck semantics explicit. A `div`-like primitive is
important because it lets users group multiple elements and apply layout/style boundaries without
thinking about PowerPoint-specific terms.

The first `0.2` releases should prioritize a narrow, strongly typed authoring surface over broad
HTML compatibility. The user experience should feel guided by TypeScript: unsupported tags,
unsupported props, invalid child placement, invalid style values, and missing required props should
fail at type-check time whenever practical, with runtime validation as a secondary safety net.

### Version Split

`0.2.0` should introduce a focused HTML-like surface:

- view-like grouping and sectioning elements: `div`, `section`, `article`, `main`, `header`,
  `footer`, `aside`, `nav`, and `figure`.
- text-like block elements: `p` and `h1`-`h6`.
- `img` as an `Image`-like element.
- primitive string and number children inside view-like elements should normalize to implicit
  `p`/`Text` nodes.
- no semantic metadata needs to be added to the IR in `0.2.0`; these tags are authoring aliases over
  the current `View`, `Text`, and `Image` model.

`0.2.1` should introduce the minimum Semantic Author Graph through inline rich text:

- JSX should produce an explicit Author Tree before semantic resolution.
- The Author Tree should be raised into a Semantic Author Graph that downstream output projections
  consume instead of reading the Author Tree directly.
- `Deck.compile()` should return the Semantic Author Graph as the primary inspection API.
- Graph construction should produce Diagnostics with warnings and errors. Default compile behavior
  can throw on errors, while `compile({ mode: "inspect" })` should expose diagnostics for debugging.
- Graph Identity should be separated from output-specific identity. JSX `key` should act as a
  Graph Identity Hint within its authoring scope.
- `span` should become an inline text run, not a standalone text box.
- Text-like semantic nodes should support rich text runs.
- `<p>Sales grew <span style={{ color: "red" }}>12%</span> YoY</p>` should compile to one text box
  with multiple styled runs.

### Proposed API

Keep current components available while lower-case JSX intrinsics provide the HTML-like authoring
surface:

```tsx
deck.add(() => (
  <Slide name="Intro">
    <div className="hero">
      Hello
      <img src="./logo.png" />
    </div>
  </Slide>
));
```

Initial intrinsic mapping:

- `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure` map to
  `View` in `0.2.0`.
- `p` and `h1`-`h6` map to `Text` in `0.2.0`.
- `img` maps to `Image`.
- list/link/inline/control elements such as `ul`, `ol`, `li`, `a`, `br`, `hr`, `shape`, and `slide`
  should wait until their semantics and typings are explicit.
- `span` should wait until `0.2.1` and should mean an inline rich text run, not a `Text` alias.

When a view-like intrinsic node contains primitive string or number children, compile those children
as implicit `Text` nodes. Mixed children should preserve order:

```tsx
<div>
  Title
  <img src="./chart.png" />
  Caption
</div>
```

This should normalize to a view with `Text("Title")`, image, and `Text("Caption")` in `0.2.0`.

### Implementation Notes

- Extend JSX typings in `src/index.ts` to define only the supported view-like, text-like, and `img`
  intrinsic elements for `0.2.0`.
- Use strict intrinsic prop types instead of catch-all string index props.
- Keep children typed by element kind:
  - view-like tags accept content nodes and primitive text.
  - text-like tags accept primitive text and, starting in `0.2.1`, inline text runs.
  - `img` does not accept children and requires either `src` or `data`.
- Update `createElement` in `src/jsx.ts` to accept supported intrinsic string tags instead of
  rejecting all intrinsic elements.
- Add an authoring normalization step that converts primitive children under content containers
  into `text` author nodes.
- Keep current capitalized components exported and tested for compatibility.
- For `0.2.1`, split JSX structure capture from semantic graph construction:
  - Build an explicit Author Tree from JSX.
  - Preserve primitive text as Author Tree leaves instead of immediately converting it to `Text`
    nodes.
  - Preserve the original Authored Tag, such as `h1`, `p`, `section`, or `span`, as primary Author
    Tree data.
  - Preserve Fragment nodes in the Author Tree so key scopes and future source spans are not lost.
    Fragments should not become renderable Semantic Graph nodes.
  - Drop `null`, `undefined`, and boolean children from the Author Tree as intentional empty
    children.
  - Flatten array children for semantic traversal, but leave room for Author Path or origin metadata
    to record that a child came from an expanded array.
  - Keep the JSX runtime focused on Author Tree construction. Move implicit text conversion,
    tag/component semantic interpretation, rich text placement checks, and image source validation
    into graph construction so diagnostics can explain them consistently.
  - Raise the Author Tree into the Semantic Author Graph.
  - Translate Authored Tags into Semantic Roles such as heading, paragraph, figure, and sectioning
    content where supported.
  - Validate `span` during graph construction: it should become a text run only inside text-like
    elements and should not become a standalone text box.
  - Return warnings and errors as structured Diagnostics; keep runtime validation even when TypeScript
    also catches the same pattern.
  - Model Diagnostics after compiler diagnostics: include a stable code, title, labels, notes, help
    text, Author Tree paths, and an optional source span.
  - Preserve a path for future file/line/column reporting through the dev JSX runtime.
  - Add graph nodes for text runs and preserve run-level styles.
  - Include non-renderable graph entities from the start, at least document, asset, and style
    entities, so the graph can represent relationships instead of only renderable output nodes.
  - Keep Style Entities split between authored `style` and style references.
    Resolved concrete values belong to a later Resolved Style Inspection View.
  - Give Asset Entities metadata slots such as media type, byte length, dimensions, content hash, and
    resolution status, but avoid heavy file IO, image decoding, or hashing during `0.2.1` graph
    construction.
  - Model text nodes with `inlineChildren` rather than a runs-only field. `0.2.1` only needs
    `textRun` inline nodes, but the shape should leave room for future inline links, line breaks, or
    other inline semantics.
  - Keep `slide` as its own semantic node kind rather than treating it as a generic container.
  - Keep source composition mostly out of the `0.2.1` graph shape. A root source identity is enough;
    source entities can be added in `0.3`.
  - Keep slide factory context minimal in `0.2.1`: add a `context` object for future Composition
    Context while preserving top-level `slideIndex` and `totalSlides` aliases. Defer Source Context
    support to `0.3`.
  - Return the graph as an immutable snapshot by type, using `ReadonlyMap` for node and entity
    lookup. Do not require runtime freezing in the initial implementation.
  - Keep Diagnostics outside the graph model; inspect mode returns `{ graph?, diagnostics }`.
  - Give semantic nodes a lightweight `origin` that carries Author Path and optional Source Span.
    Use `origin.kind = "implicit"` for nodes created during semantic resolution, such as implicit
    text boxes from primitive text in containers.
  - Keep Graph Identity separate from PPTX or other output identifiers.
  - Derive Graph Identity from lightweight structural material: Source Identity, semantic parent
    identity, Authored Tag or semantic kind, and key-or-index.
  - Treat content, style, layout, media sources, and resolved measurements as payload changes rather
    than identity material.
  - Add `Deck.compile()` and remove `render()` as the primary inspection surface.
  - Type `compile()` by mode:
    - `compile()` and `compile({ mode: "strict" })` return `SemanticAuthorGraph` and throw on error
      diagnostics.
    - `compile({ mode: "inspect" })` returns `{ graph?: SemanticAuthorGraph; diagnostics }` without
      throwing for semantic diagnostics.
  - Throw specific `Error` subclasses that carry Diagnostics so callers can branch on failure
    category without parsing strings.

Initial graph type sketch:

```ts
type AuthorTreeNode = AuthorElementNode | AuthorFragmentNode | AuthorTextLeaf;

type AuthorElementNode = {
  readonly kind: "element";
  readonly source:
    | { readonly kind: "tag"; readonly tag: AuthoredTag }
    | { readonly kind: "component"; readonly component: AuthoredComponent };
  readonly key?: JsxKey;
  readonly props: unknown;
  readonly children: readonly AuthorTreeNode[];
  readonly sourceSpan?: SourceSpan;
};

type AuthorTextLeaf = {
  readonly kind: "text";
  readonly value: string | number;
  readonly sourceSpan?: SourceSpan;
};

type AuthorFragmentNode = {
  readonly kind: "fragment";
  readonly key?: JsxKey;
  readonly children: readonly AuthorTreeNode[];
  readonly sourceSpan?: SourceSpan;
};

type SemanticAuthorGraph = {
  readonly documentId: GraphNodeId;
  readonly nodes: ReadonlyMap<GraphNodeId, SemanticNode>;
  readonly styles: ReadonlyMap<StyleEntityId, StyleEntity>;
  readonly assets: ReadonlyMap<AssetEntityId, AssetEntity>;
};

type SemanticOrigin = {
  readonly kind: "authored" | "implicit";
  readonly path: AuthorPath;
  readonly sourceSpan?: SourceSpan;
  readonly reason?: "primitive-text-in-container";
};

type BaseSemanticNode = {
  readonly id: GraphNodeId;
  readonly kind: SemanticNodeKind;
  readonly origin: SemanticOrigin;
  readonly authoredTag?: AuthoredTag;
  readonly authoredComponent?: AuthoredComponent;
  readonly role?: SemanticRole;
  readonly key?: JsxKey;
  readonly styleRef?: StyleEntityId;
};

type SemanticRole =
  | { readonly kind: "document" }
  | { readonly kind: "slide" }
  | { readonly kind: "genericContainer" }
  | { readonly kind: "sectioning"; readonly tag: SectioningTag }
  | { readonly kind: "figure" }
  | { readonly kind: "paragraph" }
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { readonly kind: "image" }
  | { readonly kind: "shape" };

type SemanticDocumentNode = BaseSemanticNode & {
  readonly kind: "document";
  readonly children: readonly GraphNodeId[];
};

type SemanticSlideNode = BaseSemanticNode & {
  readonly kind: "slide";
  readonly children: readonly GraphNodeId[];
};

type SemanticContainerNode = BaseSemanticNode & {
  readonly kind: "container";
  readonly children: readonly GraphNodeId[];
};

type SemanticTextNode = BaseSemanticNode & {
  readonly kind: "text";
  readonly inlineChildren: readonly GraphNodeId[];
};

type SemanticTextRunNode = BaseSemanticNode & {
  readonly kind: "textRun";
  readonly text: string;
};

type StyleEntity = {
  readonly id: StyleEntityId;
  readonly target: SemanticNodeKind;
  readonly authored: {
    readonly style?: unknown;
    readonly classRefs?: readonly StyleClassRef[];
  };
};

type StyleClassRef = {
  readonly name: string;
  readonly index: number;
};

type AssetEntity = {
  readonly id: AssetEntityId;
  readonly kind: "image";
  readonly source:
    | { readonly kind: "path"; readonly path: string }
    | { readonly kind: "data"; readonly data: string };
  readonly metadata: {
    readonly mediaType?: string;
    readonly byteLength?: number;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly contentHash?: string;
  };
  readonly resolution: "unresolved" | "resolved" | "failed";
};

type CompileInspectResult = {
  readonly graph?: SemanticAuthorGraph;
  readonly diagnostics: Diagnostics;
};
```

Recommended `0.2.1` file boundaries:

```text
src/
  authoring/
    index.ts
    children.ts
    components.ts
    style.ts
    tree.ts
    tags.ts
  diagnostics/
    index.ts
    errors.ts
    format.ts
  graph/
    index.ts
    types.ts
    identity.ts
    roles.ts
    build.ts
  jsx.ts
  jsx-runtime.ts
  jsx-dev-runtime.ts
  deck.ts
```

Boundary intent:

- `authoring/tree.ts` owns Author Tree snapshots and constructors.
  Author Tree types are internal implementation snapshots and should not be exported from the package
  public API.
- `authoring/tags.ts` owns Authored Tag and Authored Component vocabularies.
- `authoring/style.ts` owns authoring style value types such as length, box, text, image, shape, and
  slide style vocabularies. It should stay a pure type vocabulary node.
- `authoring/children.ts` owns JSX child type vocabulary.
- `authoring/components.ts` owns `Slide`, `View`, `Text`, `Image`, and `Shape` constructors that
  produce Author Tree elements.
- `diagnostics/*` owns structured diagnostics, diagnostic formatting, and diagnostic error classes.
  It is a shared node for graph construction, output projection, writers, and future asset/template
  resolution. It must not import `graph/*`.
  Keep the diagnostic model, human-readable formatter, and `Error` subclasses separate so structured
  diagnostics do not collapse into string-only errors.
- `graph/` is the Semantic Author Graph composite node. It owns graph types, identity generation,
  semantic role mapping, and Author Tree to Semantic Author Graph construction.
  Semantic graph and diagnostic result types should be public because `compile()` returns them, but
  graph builders, Author Tree details, and identity constructors should remain internal.
  `graph/index.ts` may act as the folder boundary, but it should export only the graph contract and
  graph build entry point, not low-level identity or role helpers.
  Start with `types.ts`, `identity.ts`, `roles.ts`, and `build.ts`. Add files such as `text.ts` only
  after a subgraph becomes large enough to carry its own meaning.
- `jsx.ts` and JSX runtime files construct Author Tree snapshots only. They must not import graph
  construction.
- Move capitalized authoring component constructors such as `Slide`, `View`, `Text`, `Image`, and
  `Shape` out of `jsx.ts` into `authoring/components.ts`, so JSX runtime glue and authoring
  component construction remain separate nodes.
- `deck.ts` orchestrates authoring inputs and pipeline calls without hiding compiled graph state as
  mutable instance state.
  It should depend on graph folder entry points, diagnostics, and output pipeline entry points, not
  low-level graph helpers such as identity generation or role mapping.
- Tests may use dedicated test helpers for internal graph construction and assertions instead of
  broadening the package public API.

Expected dependency direction:

```text
authoring/tree, authoring/tags
  -> graph/build
  -> deck

diagnostics
  -> graph/build
  -> deck

graph/types, graph/identity, graph/roles
  -> graph/build
  -> deck

jsx-runtime
  -> jsx
  -> authoring/tree
```

Avoid cycles such as `jsx.ts -> graph/build -> jsx.ts`. Avoid wrapper files that only rename or
forward calls unless they define a real public boundary.

### Risks

- Primitive text currently throws inside `View` structured layout. The new behavior must be scoped
  carefully so invalid text inside unsupported places still errors clearly.
- `span` semantics are ambiguous if it is shipped as a text box alias. Do not ship `span` until it
  can behave as inline rich text.

### Validation

- Add authoring tests for intrinsic tags.
- Add render tests for implicit text nodes.
- Add type tests for JSX public API.
- Add negative type tests for unsupported tags, invalid children, and missing `img` source props.
- In `0.2.1`, add Semantic Author Graph tests for JSX structure, stable graph identity, text runs,
  and styled inline spans.
- Add diagnostics tests for semantic errors and warnings, including inspect mode behavior.

## 0.3 Graph Composition

### Goal

Support splitting large decks into multiple authoring sources and composing them into one Semantic
Author Graph while preserving Source Identity and Graph Identity.

```tsx
type PeerComparisonSource = {
  sectionTitle: string;
  companies: Company[];
  period: FiscalPeriod;
  note?: JsxNode;
};

const title = new Deck({ layout });
const peerComparison = new Deck<PeerComparisonSource>({ layout });
const industryTrends = new Deck({ layout });

const report = new Deck({ layout });

report.mount("title", title);
report.mount("peer-comparison", peerComparison, {
  sectionTitle: "同業他社比較",
  companies,
  period,
});
report.mount("industry-trends", industryTrends);
```

The Source Key identifies a meaningful composition section. It is not a displayed title, although
the Source Context can contain displayed authoring values such as `sectionTitle`.

### Proposed API

```ts
const child = new Deck<ChildSourceContext>({ layout });
const root = new Deck({ layout });

root.mount("child-section", child, sourceContext);

const bound = child.withSource(sourceContext);
const graph = bound.compile();
```

Recommended semantics:

- `Deck<TSourceContext = void>` uses `void` as the only marker for "no Source Context".
  `Deck<undefined>` and `Deck<{}>` still have Source Context.
- Deck authoring registration APIs should be fluent and return `this`, including `add()` and
  `mount()`.
- A `Deck<void>` is a Root Deck and can compile directly. A `Deck<TSourceContext>` requires Source
  Context before it can act as a root.
- Root-like operations such as `compile()` should be type-constrained to `Deck<void>` or a
  `BoundSource`.
- `withSource(sourceContext)` creates a `BoundSource` for a Deck with required Source Context.
  `Deck<void>` should not expose `withSource()`.
- `BoundSource` exposes root-like operations such as `compile()` but does not expose authoring
  registration APIs such as `add()` or `mount()`.
- `mount(sourceKey, childDeck, sourceContext)` composes a child source under a Source Key.
- `mount(sourceKey, childDeck, mapper)` derives child Source Context from the parent Source
  Context.
- `mount(sourceKey, childDeck)` is valid only when the child is `Deck<void>` or a fully specified
  `BoundSource`.
- Passing Source Context or a Source Context Mapper to `Deck<void>` or to a `BoundSource` should be
  rejected by types where practical and by runtime validation for JavaScript callers.
- Source Context is authored input. It should not include bindings, environment, or global config.
- Slide factory input separates user-authored Source Context from deckjsx-generated Composition
  Context.
- JSX children should not be injected into the top of a child Deck through `mount()`.
- If a child Deck wants caller-provided JSX, it should expose an explicit Source Slot inside Source
  Context, such as `note?: JsxNode`.

Slide factories should receive Source Context through `context` and generated composition values
through `composition`:

```tsx
const section = new Deck<{ sectionTitle: string }>({ layout });

section.add(({ context, composition }) => (
  <Slide name={context.sectionTitle}>
    <h1>{context.sectionTitle}</h1>
    <p>
      {composition.deckSlideIndex + 1} / {composition.deckTotalSlides}
    </p>
  </Slide>
));
```

Root Deck slide factories have no `context` field:

```tsx
const root = new Deck({ layout });

root.add(({ composition }) => (
  <Slide>
    <p>{composition.slideIndex + 1}</p>
  </Slide>
));
```

Source Context Mappers receive only the parent Source Context, not Composition Context:

```ts
const company = new Deck<{ company: Company; period: FiscalPeriod }>({ layout });
const metrics = new Deck<{ companyId: string; period: FiscalPeriod }>({ layout });

company.mount("metrics", metrics, (context) => ({
  companyId: context.company.id,
  period: context.period,
}));
```

When the parent source is `Deck<void>`, the mapper receives no argument:

```ts
root.mount("summary", summary, () => ({
  title: "Summary",
}));
```

Composition Context should expose:

- `sourceKey` only for mounted sources. Root-level slide factories omit it.
- Nested sources receive the local Source Key assigned by their immediate parent, not the full
  Source Identity path.
- `slideIndex` and `totalSlides` as source-local numbering.
- `deckSlideIndex` and `deckTotalSlides` as whole-deck numbering, computed after composition is
  resolved.
- No public `sourceIdentity`; Source Identity is visible through graph origin and diagnostics.

### Implementation Notes

- Replace merge-oriented flattening with ordered composition entries:
  - direct slide entries from `add()`
  - mounted source entries from `mount()`
- Preserve registration order across `add()` and `mount()`. A mounted source expands at the point
  where it was registered.
- Add a `composition/` layer that resolves Deck authoring registration into source-aware author
  roots for graph construction.
- Keep composition resolver functions internal. Export only authoring-facing composition types that
  users need for TypeScript.
  - Public: `CompositionContext`, `SlideFactoryInput<TSourceContext = void>`,
    `SlideFactory<TSourceContext = void>`, `SourceContextMapper<TParentContext, TChildContext>`,
    and `BoundSource<TSourceContext>`.
  - Internal by default: Source Identity implementation types, Source Origin resolver internals, and
    composed author root records.
- Compose Author Trees and raise them into one Semantic Author Graph with source-aware Graph
  Identity. The graph builder should consume source-aware author roots rather than reading Deck
  instances directly.
- Support nested mounts in `0.3.0`, including Source Context Mappers.
- Allow the same child Deck instance to be mounted multiple times under different Source Keys.
- Detect duplicate Source Keys within the same parent source during compile diagnostics.
- Detect source cycles and include an internal maximum composition depth guard.
- Source Keys are public strings, but compile should diagnose empty keys, whitespace-only keys,
  `.`, `..`, and keys containing `/`.
- Source Identity is path-like for mounted sources, derived from parent Source Identity plus Source
  Key, such as `company-a/metrics`.
- The root source has internal Source Identity but no user-facing Source Identity path string.
- Add Source Origin to graph node origins so inspection and diagnostics can explain whether a node
  came from the root source or a mounted source.
- Source Identity must affect Graph Identity, but it can flow through source root identity or
  semantic parent identity rather than being repeated in every node's raw identity material.
- Source Context values are payload, not Graph Identity material. Changing Source Key changes
  Source Identity and therefore Graph Identity.
- Use source position plus Graph Identity Hints such as JSX `key` to preserve semantic identity
  across changes.
- Keep JSX `key` and Source Key separate. Source Key identifies a composition boundary; JSX `key`
  is a Graph Identity Hint inside Author Tree sibling scope.
- Keep `0.3` focused on `compile()` and the Semantic Author Graph. Do not add a separate
  composition path to legacy `render()` or `output()`.
- Legacy `render()` and `output()` should throw if called on a Deck containing mounted sources, so
  composed content is not silently omitted.
- In `0.3`, child Decks may continue to carry the current Deck configuration. Broader root-owned
  final build configuration belongs to the later configuration and output pipeline work.
- Use branded types or equivalent constraints to prevent Graph Identity, Source Identity, and output
  identity from being mixed.

Source Slots should be handled as explicit Source Context fields, not as `mount()` children:

- A Source Slot value may be a single JSX node or a normalized JSX child array.
- Source Slot JSX preserves the caller source as origin even when a child source decides where to
  place it.
- Source Slot Graph Identity should account for both caller slot origin and child placement
  identity.
- The Source Slot field name, such as `context.note`, is authored meaning and should contribute to
  slot origin and identity material.
- Do not mutate source origin into Author Tree nodes. Resolve Source Slot origin and placement
  through composition and graph-building traversal context.

Composition diagnostics should be separate from Semantic Graph diagnostics:

- Composition failures should use a separate Diagnostic Error subclass from Semantic Graph
  construction failures.
- Composition diagnostic codes should use an `E_COMPOSITION_*` family. Initial codes can include
  `E_COMPOSITION_INVALID_SOURCE_KEY`, `E_COMPOSITION_DUPLICATE_SOURCE_KEY`,
  `E_COMPOSITION_CYCLE`, `E_COMPOSITION_DEPTH_EXCEEDED`,
  `E_COMPOSITION_CONTEXT_MAPPER_FAILED`, `E_COMPOSITION_CONTEXT_MAPPER_ASYNC`,
  `E_COMPOSITION_INVALID_MOUNT`, and `E_COMPOSITION_INVALID_ROOT`.
- If composition diagnostics contain errors, `compile({ mode: "inspect" })` should return
  diagnostics without a Semantic Author Graph.
- Semantic graph diagnostics may still return a graph when graph construction can continue.
- Source Context Mapper failures should be wrapped in composition diagnostics.
- Source Context Mappers are synchronous in `0.3`; Promise-like returns should be diagnosed.
- Mapper return values are not runtime type-checked as Source Context. TypeScript owns that
  contract; runtime validation should focus on structural failures.

### Validation

- Tests for mounting sources by Source Key.
- Tests that Source Context is required for `Deck<TSourceContext>`.
- Tests that `Deck<TSourceContext>` can still register `add()` and nested `mount()` entries before
  being bound.
- Tests that root-like `compile()` is type-constrained to `Deck<void>` or `BoundSource`.
- Tests that `Deck<void>` does not expose `withSource()` and does not receive a `context` field in
  slide factories.
- Tests that `BoundSource` can compile directly and can be mounted as a fully specified source.
- Tests that `BoundSource` does not expose `add()` or `mount()`.
- Keep composition public API type assertions in a dedicated type test file, separate from the JSX
  public API type tests.
- Tests that invalid extra context for `Deck<void>` and `BoundSource` is rejected by types and
  runtime validation.
- Tests that Composition Context provides local `sourceKey`, source-local `slideIndex` /
  `totalSlides`, and whole-deck `deckSlideIndex` / `deckTotalSlides`.
- Tests that Source Context Mappers receive only parent Source Context, and root parent mappers
  receive no argument.
- Tests that nested mounts resolve through Source Context Mappers.
- Tests that duplicate Source Keys, invalid Source Keys, mapper failures, Promise-like mapper
  returns, cycles, and excessive composition depth produce composition diagnostics.
- Tests that composition errors in inspect mode return diagnostics without a graph.
- Tests that Graph Identity survives insertion or reordering where Source Key and JSX `key` allow it.
- Tests that Source Slots are explicit Source Context fields, not implicit top-level children.
- Tests that Source Slot origin preserves caller source while identity accounts for child placement
  and slot field name.
- Tests that legacy `render()` and `output()` throw for Decks with mounted sources.

### v0.3.0 Completion Line

`0.3.0` is complete when graph composition is visible and inspectable through `compile()` without
adding a separate composed-output path to legacy `render()` or `output()`.

The minimum completed surface is:

- `Deck<TSourceContext = void>` with `void` as the no-source-context marker.
- Slide factory input uses the new `composition` field for all Decks, even when no mounted sources
  are present. Legacy top-level `slideIndex` and `totalSlides` are removed.
- Source-aware `add()` and `mount()` registration order.
- `withSource()` and `BoundSource` for compiling a source with required Source Context.
- Nested mounts with synchronous Source Context Mappers.
- Source Identity paths and Source Origin in Semantic Author Graph origins.
- Composition diagnostics and a separate composition Diagnostic Error class.
- Source Slot origin and identity handling.
- Legacy `render()` and `output()` throwing when mounted sources are present.

## 0.3.1 Inspectability And Graph Readiness

### Goal

Stabilize the `0.3.0` graph composition surface before adding output projection work. The release
should make compile results, diagnostics, and the Semantic Author Graph easier to inspect, then
review whether the graph is ready to act as the input to Output Projection.

This is not a new output feature release. It should strengthen the contract that `compile()` exposes
and reduce ambiguity before `build()`, `project()`, `write()`, and output-format models are added.

### Scope

- Improve `compile({ mode: "inspect" })` usability without adding hidden Deck output state.
- Keep `compile({ mode: "inspect" })` result shape as `{ graph?, diagnostics }` in `0.3.1`.
  Resolved Style Inspection View should be named and bounded now, but its public API shape should
  wait until class/theme resolution work begins.
- Improve composition and semantic graph diagnostic messages, labels, help text, and test coverage.
- Review graph node shape, Style Entities, Asset Entities, Source Origin, Graph Identity, and
  diagnostics as the input contract for Output Projection.
- Define where upcoming Style Class and Theme resolution plug into the graph pipeline.
- Add the graph-side extension points needed for style resolution, such as authored style inputs,
  class references, Deck-level Theme configuration, and a resolved style inspection boundary.
- Keep Style Entities focused on authored inputs and references. Resolved concrete style values
  should be exposed through a Resolved Style Inspection View rather than treated as the primary
  Style Entity payload.
- Add minimal graph types for unresolved style references:
  - `StyleEntity.authored.classRefs` should be the only new graph-side style reference in `0.3.1`.
  - `classRefs` should preserve the class name and normalized token index for provenance at the graph
    stage. This index is not CSS cascade precedence.
  - Theme should not be stored as `StyleEntity.authored` payload; it belongs to Deck configuration
    and should appear in resolved inspection output as applied values or trace.
- Remove the existing `StyleEntity.resolved` field in `0.3.1`; resolved concrete styles belong to
  the future Resolved Style Inspection View.
- Capture authored `className` props into `StyleEntity.authored.classRefs`, but do not resolve
  classes, check class existence, add stylesheet registration, or merge class style values until
  `0.4`.
- Accept clsx-like `className` values in `0.3.1`: strings, nested arrays, object maps, and falsey
  entries. Normalize them into ordered `StyleClassRef` records.
- Exclude numbers from the `className` type. deckjsx Style Class names are authored style names, not
  arbitrary DOM class tokens.
- Restrict object-map `className` values to `boolean | null | undefined` values. Broader truthy or
  falsy payloads should not be accepted by the TypeScript API.
- Ignore empty and whitespace-only class names, including empty object-map keys, during `classRefs`
  normalization.
- Assign `StyleClassRef.index` after normalization as provenance order. Do not use original input
  positions, and do not leave index gaps for omitted falsey or empty entries. This order must not be
  treated as stylesheet cascade order once CSS-like style resolution lands.
- Add `className` to all style-capable authoring node props, including `Slide`, component nodes,
  and intrinsic HTML-like tags. Fragments and primitive text leaves remain outside this surface.
- Create a Style Entity when a node has only `className` and no inline `style` or direct style props,
  so the graph preserves class references for later resolution.
- Exclude `className` from `StyleEntity.authored.direct`; `className` should only appear as
  normalized `classRefs`.
- Do not make `className` affect legacy `render()` or `output()` in `0.3.1`; it is visible through
  compile and graph inspection only until class resolution lands.
- Add or adjust tests for composition edge cases found during review.
- Add practical documentation examples for Graph Composition and inspect mode.
- Record readiness findings in this roadmap, separating immediate fixes from v0.4 work.

### Objective Review Method

`0.3.1` should include a docs-blind codebase review before finalizing the readiness summary. The
goal is to test whether the project can be understood from its code and tests before relying on
CONTEXT, roadmap, or ADR documents.

Recommended review phases:

1. Docs-blind codebase review:
   - Read `src/` and `tests/` without consulting `CONTEXT.md`, roadmap, or ADRs.
   - Infer the public API, graph/composition boundaries, diagnostics model, and output boundary from
     code alone.
   - Record what is clear, what is discoverable only by convention, and what cannot be inferred.
2. Documentation cross-check:
   - Read `CONTEXT.md`, this roadmap, and ADRs.
   - Compare the docs-blind understanding with the documented domain language and planned
     architecture.
   - Classify mismatches as terminology drift, missing docs, missing code structure, overbuilt code,
     or missing tests.
3. Readiness summary:
   - Record what is ready before v0.4.
   - Record what must be fixed in v0.3.1.
   - Record what belongs to v0.4 Style Classes, v0.5 Theme Support, or v0.6 Output Projection.

The review record should live at `docs/reviews/v0.3.1-graph-readiness.md`. It should use an
ADR-like structure with status, context, review method, findings, remediation, and outcome sections.
Unlike an ADR, it records objective review findings and the v0.3.1 improvements made in response.

### Non-Goals

- Do not add `project()`, `build()`, or `write()`.
- Do not introduce Pptx Package Model or PDF/PPTX format branching.
- Do not implement layout templates, class-like styles, themes, or direct OOXML writing.
- Do not fully resolve Style Classes or Theme values in `0.3.1`; only define and prepare the graph
  boundary they will use.

### Validation

- Tests for inspect-mode result shape and diagnostic content.
- Additional composition edge-case tests where the review finds gaps.
- Documentation examples showing how to inspect graph, diagnostics, source origin, and composition
  context.
- A written readiness summary identifying what must change before Output Projection and what can
  wait.
- A graph-readiness checklist for style resolution insertion points before `0.4` and `0.5`.
- Tests or snapshots that distinguish authored style inputs from resolved style inspection output
  once the boundary exists.
- Type-level or graph-shape tests for `StyleClassRef` placement on `StyleEntity.authored`, and for
  keeping Theme as Deck-level configuration.
- Tests that authored `className` props are captured as ordered `classRefs` without changing current
  inline style behavior.
- Tests for clsx-like `className` normalization: whitespace splitting, nested arrays, object maps,
  falsey omission, empty-name omission, order preservation, and duplicate preservation.

### v0.3.1 Readiness Summary

- Ready before v0.4:
  - Graph Composition remains compile-first and source-aware.
  - Style Entities now preserve authored style inputs and ordered Style Class References.
  - Resolved concrete style values are kept out of the primary graph payload.
  - `className` can be inspected through `compile()` without affecting legacy output.
- Completed in v0.3.1:
  - Docs-blind graph readiness review record.
  - `StyleClassRef` and `StyleEntity.authored.classRefs`.
  - clsx-like `className` capture on style-capable authoring nodes.
  - Removal of `StyleEntity.resolved`.
- Deferred to v0.4:
  - `StyleSheet`, Deck stylesheet registration, class lookup, missing class diagnostics, and
    style merge behavior.
- Deferred to v0.5:
  - Theme configuration, typed design values, authored-tag Theme defaults, and resolved-style
    provenance for the Theme layer.
- Deferred to v0.6:
  - Output Projection and build/project/write API.

## 0.4 Class-Like Style Reuse

### Goal

Add a class-like style mechanism to avoid repeating large inline style objects.

### Proposed API

```tsx
// report.styles.ts
import { StyleSheet } from "deckjsx";

export const reportStyles = new StyleSheet({
  classes: {
    title: {
      target: "p.title",
      style: { fontSize: 32, fontWeight: 700 },
    },
    card: {
      target: "div.card",
      style: { backgroundColor: "#fff", borderRadius: 0.12 },
    },
  },
});
```

```tsx
// report.deck.tsx
import { reportStyles } from "./report.styles";

const deck = new Deck({
  layout,
});

deck.useStyles(reportStyles);

<p className="title">Revenue</p>
<div className={["card", active && "selected"]} />
```

Style dictionaries should be easy to author in separate files and register on a Deck instance.
`new StyleSheet(...)` should be the standard authoring entry point because it can preserve literal
class names, improve target inference, and provide a runtime validation entry point without adding
another top-level helper. The registration method name should be `deck.useStyles(stylesheet)`.
Stylesheet registration should support class dictionaries now and a future CSS-like selector target
path over authored tags/classes, rather than forcing the long-term design into flat class-name
lookup. Future selector support should extend the existing `target` concept instead of adding a
separate `rules` array.

Supported names:

- `className` is the primary and only class-like authoring prop in `0.4`.
- Do not add a `class` alias in `0.4`. The release should focus on making `className` highly usable
  through strong typing, clsx-like inputs, source-local lookup, diagnostics, and inspection.

### Semantics

`0.4` should make class resolution part of the Semantic Author Graph / `compile()` path only.
Legacy `render()` and `output()` should continue to ignore `className`; `0.4` should not expand the
legacy `PresentationIR` path or make class-like styles observable through legacy output.

`StyleEntity.authored` should remain the source-of-truth for what the user wrote: inline `style` and
ordered `classRefs`. Resolved class output should live in a separate resolved style view or lookup
structure, not by reintroducing `StyleEntity.resolved`. This keeps authored style provenance
inspectable while giving future Theme, token, and Output Projection work a concrete resolved-style
surface to consume.

Resolved class output should be exposed as an inspection view instead of being embedded into the
Semantic Author Graph itself. `compile({ mode: "inspect" })` may return a resolved style lookup
alongside the graph and diagnostics, while `graph.styles` continues to represent authored style
entities only. This avoids making the graph model a mixed authored/resolved container.
Strict compile mode should keep returning only `SemanticAuthorGraph`; resolved style inspection is an
inspect-mode affordance, not part of the normal graph return value.
Strict compile mode should still run style resolution rules and fail on style diagnostics such as
missing classes or target mismatches. It should not return the resolved style view; the resolved view
is exposed only through inspect mode.
Style resolution failures should throw a dedicated `StyleDiagnosticError` that extends
`DeckDiagnosticError`, rather than being folded into `SemanticGraphDiagnosticError`.
Inspect mode should return a single combined `diagnostics` collection that includes composition,
semantic graph, and style diagnostics. Internally those diagnostics may be produced by separate
phases, but users should not need to inspect multiple diagnostic collections.
Style diagnostic codes should use the `E_STYLE_*` prefix, such as `E_STYLE_INVALID_CLASS_NAME`,
`E_STYLE_UNKNOWN_CLASS`, `E_STYLE_TARGET_MISMATCH`, and `E_STYLE_INVALID_CLASS_DEFINITION`.
Style diagnostics should include both the semantic node kind and the authored tag when available.
For example, a target mismatch should explain that an authored `div` is a view-like node and cannot
receive a text-only class, rather than only mentioning the internal `view` kind.
Inline text runs should participate in style resolution and target mismatch diagnostics. Public
stylesheet `target` values should be CSS-like selector strings over authored tags and classes rather
than deckjsx-specific semantic targets such as `"text"` or `"view"`. Internal style classification
may still distinguish text boxes, view-like containers, inline text runs, images, shapes, and slides
for typing and diagnostics, but those categories should not be the public target vocabulary.
`textRun` should use an inline typography style vocabulary rather than the full text-box style
surface. It should allow run-level text styling such as color, font size, weight, emphasis,
decoration, links, and related inline typography, while excluding frame, box, layout, and positioning
properties.
`TextRunStyle` should be part of the public style vocabulary so authors can type targeted inline
style classes explicitly.
The `span` intrinsic should use text-run authoring props backed by `TextRunStyle`, not full
`TextNodeProps`/`TextStyle`. This is an acceptable breaking change because `span` represents inline
text runs rather than standalone text boxes.
`TextRunStyle` should not include `backgroundColor` in `0.4`. Inline highlight-like behavior can be
introduced later as a text-run-specific property, such as `highlightColor`, once the output semantics
are clear.
`TextRunStyle` should include run-level link semantics such as `href` and `tooltip`.
`TextRunStyle` should exclude paragraph-level properties such as `textAlign`, `lineHeight`,
`listStyleType`, `textIndent`, and `tabStops`; those belong to text boxes or paragraphs rather than
inline runs.
Initial `TextRunStyle` should stay close to inline text semantics:

```ts
type TextRunStyle = {
  fontFamily?: string;
  fontSize?: DeckPointLength;
  fontWeight?: number | "normal" | "bold";
  italic?: boolean;
  fontStyle?: "normal" | "italic";
  underline?: boolean;
  strike?: boolean;
  textDecoration?: string;
  textDecorationLine?: string;
  textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
  textDecorationColor?: string;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  color?: string;
  charSpacing?: number;
  letterSpacing?: number;
  superscript?: boolean;
  subscript?: boolean;
  href?: string;
  tooltip?: string;
};
```

The resolved style inspection shape should be public because it appears in inspect-mode return types.
Resolver functions and low-level merge helpers should remain internal implementation details.
Resolved style inspection should include minimal provenance, not just the final merged style object.
It should expose enough information to answer which active classes were applied and whether inline
`style` overrode class values, without trying to become a full cascade debugger in `0.4`.
Property-level winner provenance should be included. The inspection view does not need to keep a full
history of every overwritten value, but each resolved property should identify the winning source,
such as a specific class, inline `style`, or an element default.
Style resolution should be modeled around a CSS-like cascade. Defaults are the lowest-priority
cascade layer: they provide the baseline values for semantic node kinds when nothing else supplies a
value. Higher-priority layers, such as future Theme support, should sit above defaults instead of
being treated as the same concept. Defaults should be modeled as a first-class resolution layer from
`0.4.0`, even if the actual default values are minimal or empty at first. The resolver and provenance
types should reserve this layer so `0.4.x` can deepen node-kind defaults without reshaping the class
resolution pipeline.

`className` should keep the clsx-like authoring experience established in `0.3.1` as the standard
operation model: strings, whitespace-separated tokens, nested arrays, object maps with boolean-like
values, and ignored falsey entries. `0.4` should improve this experience by adding class definition
types, source-local lookup, target-aware diagnostics, and resolved style inspection.
Class lookup and diagnostics should run after clsx-like normalization. Falsey branches are ignored;
only active class tokens should participate in missing-class errors, target compatibility checks, and
style merging.
CSS allows class tokens without matching stylesheet rules. To stay CSS-compatible, an active class
token without a matching Style Class definition should not be a compile error. deckjsx may report it
as a warning to catch likely typos, but strict compile should continue unless other style errors are
present.
Undefined active class token warnings should be suppressed when that class token appears in any
registered selector target as a selector condition. Warn only for active class tokens that have no
Style Class definition and are not referenced by any selector target in the source-local stylesheet.
Style warnings alone should not make strict `compile()` throw. A future lint or strictness
configuration may promote warnings to errors, but that is out of scope for `0.4.1`.
`className` token order should not affect style precedence. CSS-like cascade behavior is the primary
design axis: class dictionary entries should behave like simple `.className` stylesheet rules, and
precedence should come from specificity and stylesheet source order rather than the order of tokens
inside a node's `className` prop.
For the supported selector subset, specificity should follow CSS specificity: class selectors add to
the class column, authored tag/type selectors add to the type column, compound and descendant
selectors sum their parts, and no hidden Style Class key specificity is added beyond the actual
selector.
When specificity ties, stylesheet source order wins: later `deck.useStyles()` registrations override
earlier registrations, and later class entries by object insertion order override earlier entries
inside the same stylesheet.
Duplicate active class tokens should not increase specificity or apply a class more than once. They
may remain visible in authored `classRefs` for provenance, but resolved style behavior should match
CSS class semantics.
Stylesheets should leave room for CSS-like selector targets such as `.a .b` and `header.a`, but
selector matching does not need to ship in `0.4.0`. Selector targets are future graph-matching style
targets that match authored tags, normalized active classes, and ancestry relationships. The v0.4
stylesheet shape should avoid blocking that future path, even though the initial implementation can
focus on registered class dictionaries.
Unused class definitions in registered stylesheets should not produce diagnostics in `0.4`. The
compiler should focus on active class usages; unused style cleanup can be handled later by an
optional lint-like mode if needed.
Duplicate class definition keys do not need special handling in `0.4`; normal JavaScript object
semantics apply, so the final property value is what the compiler sees.
Invalid class definition names, such as empty strings or names that cannot be matched by normalized
`className` tokens, should be reported as compile diagnostics rather than throwing from the `Deck`
constructor. `compile({ mode: "inspect" })` should be able to report these configuration problems
alongside class usage diagnostics.
Style Class names are authored class tokens. Empty names and names containing whitespace are
invalid. Other characters are allowed in Style Class names, but characters that are not directly
writable in CSS class selector syntax must be escaped when referenced from a Stylesheet Target.
Stylesheet Targets should resolve CSS-escaped class selectors back to the authored Style Class name.
Registered stylesheets should be treated as readonly authored resources for `0.4`. Runtime freezing
is not required, but public types should communicate that a stylesheet is an authored snapshot. Future
mutable editing or sandbox-style APIs can be added as explicit update mechanisms rather than relying
on direct mutation of the original stylesheet object.
Imported style dictionaries and inline `new StyleSheet(...)` calls should behave the same after
registration. Source-local lookup is defined by the stylesheets registered on the Deck instance.
Composition should pass only the source-local style metadata needed for class lookup into graph
construction, not the entire `DeckOptions` object. Graph construction should not become coupled to
layout or presentation metadata just because class resolution needs source-local style dictionaries.

Class lookup should be source-local. Stylesheets registered on a Deck instance belong to the source
authored by that Deck, and `className` inside that source should resolve against that same Deck
instance's registered stylesheets. Parent Deck stylesheets should not implicitly flow into mounted
child Decks. Shared cross-source design language should be handled later through Theme support
instead of class scope inheritance.

Class definitions should be type-checked against deckjsx style vocabularies. Unsupported style keys
should fail at type-check time when authored through `new StyleSheet(...)`. Element/class target mismatch
should be reported as compile error diagnostics rather than requiring a more complex scoped JSX type
system in `0.4`. For example, a text-only class applied to a `div`/`View` should produce an error
diagnostic that names the class, the receiving semantic node, and the unsupported properties.

Style class definitions may optionally carry explicit selector targets. Targeted definitions enable
stronger typing and clearer diagnostics without forcing all classes into a verbose shape. Untargeted
definitions should stay lightweight and infer compatibility from the authored style keys where
practical.
When a Style Class definition has a `target`, that target is a CSS selector and must explicitly
include the class selector for the Style Class key. For example, `classes.title.target` may be
`"p.title"` or `".card .title"`, but not `"p"`. A selector that omits its own class selector is a
style target definition error rather than an implicit `p.title` shorthand.
The required self class selector must appear in the rightmost compound selector, because that is the
CSS selector subject. For `classes.title`, `.card .title` and `p.title` are valid, but
`.title .caption` is invalid.

```ts
const reportStyles = new StyleSheet({
  classes: {
    card: { borderWidth: 1, padding: 12 },
    title: {
      target: "p.title",
      style: { fontSize: 32, fontWeight: 700 },
    },
    surface: {
      target: ["div.surface", "p.surface"],
      style: { backgroundColor: "#fff", padding: 12 },
    },
    headerTitle: {
      target: "header.title",
      style: { fontSize: 36 },
    },
  },
});
```

The future selector subset should be deliberately small. The likely first selector target should
include class selectors, authored tag selectors, compound tag/class selectors such as `header.a`, and
descendant selectors such as `.a .b`. Avoid full CSS selector parity; pseudo-classes,
pseudo-elements, sibling combinators, attribute selectors, and media/page rules should wait for later
work.
CSS escape syntax is in scope for `0.4.1` for class selectors. A Style Class such as
`"report/title"` may be referenced from a Stylesheet Target as `.report\\/title`.
Descendant selectors should follow CSS semantics: whitespace means any-depth ancestor matching, not
direct-parent matching.
Selector diagnostics should distinguish Style Class contract errors from unsupported selector
features. A selector that omits the Style Class key from the rightmost compound selector, such as
`classes.title.target = "p"`, is `E_STYLE_INVALID_CLASS_TARGET`. A selector that includes the class
key but uses an out-of-subset selector feature, such as `.title:hover` or `.card > .title`, is
`E_STYLE_UNSUPPORTED_SELECTOR`.
Selector syntax and Style Class target contract diagnostics should run for registered stylesheet
definitions even when the class is unused. This is separate from unused-class linting: an unused but
invalid selector is still an authored stylesheet error.

The v0.4.1 selector implementation should be CSS-compatible for the supported subset, not a custom
selector language. The supported subset is:

- class selectors, including CSS-escaped class identifiers
- authored tag/type selectors for deckjsx intrinsic tags
- compound tag/class selectors such as `p.title` or `header.report\\/title`
- descendant combinators using CSS whitespace semantics

CSS type selectors outside the deckjsx authored intrinsic tag vocabulary, such as `button.title`, are
outside the v0.4.1 subset and should produce `E_STYLE_UNSUPPORTED_SELECTOR`.
Class selectors used only as selector conditions, such as `.card` in `.card .caption`, do not require
their own Style Class definition. Undefined selector-condition classes should behave as empty style
matches: they can participate in selector matching as authored class tokens, but they do not produce
resolved style properties. Undefined active class tokens may produce warnings for likely typos, but
they are not errors.
Style Class definitions are still resolved through active `className` references in `0.4.1`: a rule
under `classes.title` is considered only for nodes that actively reference `title`. The selector
target further constrains those candidate nodes. Future global stylesheet rules may require matching
all rules against all graph nodes, but that is outside the class dictionary model for `0.4.1`.
CSS selector matching and CSS inheritance are separate concerns. v0.4.1 should not implement style
inheritance from ancestor nodes to implicit text nodes or descendants. Resolved style inspection
should remain scoped to nodes with explicit Style Entities; inheritance can be designed later as part
of the broader cascade/defaults/theme work.

The following CSS selector features are intentionally not implemented in `0.4.1` and should produce
`E_STYLE_UNSUPPORTED_SELECTOR` when used:

- selector lists with commas, such as `p.title, h1.title`; use `target: [...]` instead
- ID selectors
- attribute selectors
- pseudo-classes and pseudo-elements
- child, sibling, column, and namespace combinators
- universal selectors
- `:is()`, `:where()`, `:not()`, `:has()`, and other functional selector syntax
- CSS nesting, scoping, media, or page-rule selector contexts

Selector targets should integrate with the existing `target` field rather than introducing a separate
`rules` collection. `target` should be a CSS selector string, and it should continue to accept
multiple entries when a style applies to more than one selector target. Avoid exposing semantic
targets such as `"text"` or `"view"` as public stylesheet vocabulary; authored tags such as `p`,
`div`, `span`, `img`, and `header` should carry that intent in a CSS-compatible way.

Targeted class definitions should use the `{ target, style }` shape. Do not mix `target` into the
same object level as style properties; keeping target metadata outside the style object preserves a
clean CSS-like style key space.
Targeted class definitions must include the class selector for their Style Class key in every target
selector string's rightmost compound selector. Missing self class selectors should be reported as
`E_STYLE_INVALID_CLASS_TARGET`.
For multi-target arrays, every selector entry must include the Style Class key in the rightmost
compound selector. A single valid selector does not make the whole target list valid.
`target` and `style` should be reserved as style class definition metadata keys. Lightweight class
definitions should not treat those names as style properties, which keeps detection between
lightweight and targeted definitions unambiguous.
Targeted class definitions with an empty `style` object should be allowed. They may not be useful in
simple cases, but they are not harmful and can remain valid marker-like definitions.
Lightweight class definitions may also be empty objects. They should behave as no-op classes unless a
future lint-like mode chooses to report them.
An untargeted lightweight class definition behaves as a `.className` selector for the Style Class key
with normal class selector specificity.
Resolved style provenance should report the effective selector as a CSS selector string. For
untargeted lightweight class definitions, that selector should be the escaped class selector for the
Style Class name, such as `.report\\/title`.

`target` should accept either a single selector target or an ordered readonly list of selector
targets. A single selector target is not a CSS selector list; comma-separated selector lists such as
`"p.title, h1.title"` are invalid in `0.4.1`. Use `target: ["p.title", "h1.title"]` for multiple
selectors. Multi-selector classes should be valid only when their style keys are supported by every
listed target.
Applying a targeted class to a node kind outside its target set should be a compile error diagnostic.
At the type level, multi-selector class definitions should expose only the shared style surface of all
listed targets when those targets can be inferred from authored tags. For example,
`target: ["div.surface", "p.surface"]` should allow shared box keys such as `backgroundColor` and
`padding`, but reject text-only keys such as `fontSize`.
An empty target list does not need a dedicated invalid-definition diagnostic in `0.4`. Type-level
helpers may prefer non-empty target tuples, but if an empty list reaches runtime it can be interpreted
as a class that is applicable to no targets, so any active use should fail through the normal target
mismatch path.
Unused classes with empty target lists should remain silent, matching the general rule that unused
class definitions do not produce diagnostics.

Untargeted class compatibility should be inferred only where the style keys make the target clear.
For example, typography-only keys such as `fontSize` or `fontWeight` can make a class text-oriented,
so applying it to a `div`/`View` should produce an error diagnostic. Shared box keys such as
`padding` or `backgroundColor` should remain usable across compatible node kinds unless the class
author opts into an explicit `target`.
At the type level, untargeted lightweight class definitions should be accepted as a union of known
deckjsx style vocabularies. They should reject unsupported style keys, but they do not need to prove
compatibility with every possible receiving node until compile-time diagnostics run.

Style resolution order before Theme support should be:

1. Element defaults
2. Stylesheet classes by CSS-like specificity and source order
3. Inline `style`

This order is the Semantic Author Graph / inspect-mode source of truth for `0.4`. Style-capable
direct props should not be preserved as a deckjsx-specific cascade layer. Structural props such as
`children`, `className`, `src`, `data`, `shape`, and `name` remain direct props, but style values
should be authored through `style` or stylesheets. While legacy direct style props remain accepted,
graph construction must normalize them into `authored.style` with explicit `style` object values
taking precedence, so accepted authoring values are not silently dropped.
User-configurable defaults should not be introduced as a public `DeckOptions.defaults` API in `0.4`.
The initial release should add the internal default layer, merge slot, and provenance kind, but
author-configurable element or component defaults belong to Theme support rather than to a separate
Deck-level defaults concept.
Future Theme support should be added as a higher-priority cascade layer than defaults, not as a
replacement for defaults.
The intended future cascade order is: defaults, theme, stylesheet rules by CSS-like specificity and
source order, then inline `style`. `0.4` should implement the default and class-rule portions while
reserving a clear slot for Theme support in `0.5`.
Resolved style provenance types should include a `theme` origin kind from `0.4.0` even though Theme
does not produce values until `0.5`. This keeps the inspect API aligned with the intended cascade
model before Theme support is implemented.
Public provenance layer names should stay short and cascade-oriented:
`"default" | "theme" | "class" | "style"`.
`StyleEntity.authored.direct` should stop carrying style-capable direct props in `0.4`. Direct style
props accepted for legacy compatibility should be normalized into `authored.style`; they should not
appear as a separate cascade/provenance layer.
Runtime style classification is still required for compile diagnostics, target compatibility, and
direct style capture, but it should be designed to coexist with strong types. Runtime key sets should
be derived from or checked against the public style vocabularies where practical so the implementation
does not drift into a weaker `Record<string, unknown>` model.

### Implementation Notes

Version split inside `0.4`:

- `0.4.0`: ship `StyleSheet({ classes })`, `deck.useStyles()`, CSS-like cascade/source-order
  foundations, class dictionary resolution, diagnostics, resolved style inspection, and internal
  semantic style classification. Public `target` should already be shaped as an optional CSS-like
  selector string, but selector matching beyond simple class dictionary sugar can remain deferred.
- `0.4.1`: deepen `target` into selector matching for authored tag selectors, class selectors,
  compound tag/class selectors such as `header.title`, and descendant selectors such as `.card
.caption`. Add selector specificity, selector diagnostics, and provenance for selector-targeted
  matches.
- `0.4.2`: keep the internal default cascade layer reserved, but do not add a public
  `DeckOptions.defaults` API. Use this release to close the remaining pre-Theme style-resolution
  gaps that are still needed after selector targets.
- `0.4.3`: polish resolved style inspection, diagnostics, examples, and optional lint-like checks if
  they are still needed.

- Add `new StyleSheet(...)` as the recommended stylesheet authoring entry point.
- Add `deck.useStyles(stylesheet)` as the Deck stylesheet registration API.
- Do not make `DeckOptions.styles` the primary v0.4 API. Constructor config can remain focused on
  structural Deck configuration such as layout and metadata.
- Support importable stylesheets so authors can split class definitions into separate files and
  register them on a Deck instance.
- Split authoring style vocabulary and style-key classification into an `authoring/style/` folder
  rather than continuing to grow `authoring/index.ts`.
  Start with:
  - `types.ts` for public style vocabularies such as `ViewStyle` and `TextStyle`.
  - `targets.ts` for selector target typing helpers and target/style relationships.
  - `keys.ts` for runtime style-key sets and classifiers.
  - `classes.ts` for `StyleSheet` and `StyleClassDefinition` typing.
  - Reserve room for a future `selectors.ts` when selector-rule vocabulary becomes an implemented
    feature.
  - `index.ts` as the style folder boundary.
    Keep cascade and resolved-style logic outside `authoring/style/`; those belong to graph
    resolution/inspection rather than authoring vocabulary.
- Add a top-level `src/style/` domain for cascade resolution and resolved-style inspection. This
  keeps input style vocabulary in `authoring/style/`, semantic structure in `graph/`, and reusable
  style resolution available to future Output Projection work.
  Keep `src/diagnostics/` as the generic diagnostic model, formatter, and error boundary. Style-
  specific rules and diagnostic factories, such as missing class names, invalid class definition
  names, and target mismatch, should live in `src/style/` and produce generic `Diagnostic` values.
  This prevents the diagnostics package from becoming a domain-rule registry.
  Start with:
  - `cascade.ts` for layer order and provenance helpers.
  - `types.ts` for public resolved-style inspection types.
  - `rules.ts` for invalid class name, missing class, and target mismatch checks.
  - `diagnostics.ts` for converting style rule violations into `Diagnostic` values.
  - `resolve.ts` for turning graph style entities plus source-local class dictionaries into resolved
    style inspection.
  - Reserve room for a future `selectors.ts` when selector parsing/matching is implemented.
  - `index.ts` as the style domain boundary.
- Resolve the `className` references captured in `0.3.1` during semantic graph construction or graph
  resolution, before shorthand parsing and output projection.
  Resolution should run after Semantic Author Graph construction rather than inside
  `buildSemanticAuthorGraph()`. Graph construction owns authored semantic structure; `src/style/`
  owns cascade resolution and inspect-only resolved style views.
- Do not apply resolved class styles to legacy `render()` or `output()`. The first output path that
  consumes resolved classes should be the future Output Projection boundary.
- Keep authored style data and resolved style data separate. Do not add a `resolved` field back to
  `StyleEntity`.
- Expose resolved class output through an inspect-only view or lookup, not by expanding the core
  graph shape.
- Export public types for the resolved style inspection result, but keep resolver functions internal.
- Include minimal provenance in resolved style inspection, such as applied class names and local
  override sources.
- Track property-level winner provenance for resolved styles without retaining full overwrite
  history.
- Add an internal element-default resolution layer and provenance kind, even if default values are
  initially minimal or empty.
- Do not add public user-configurable defaults in `0.4.x`; author-configurable defaults belong to
  Theme support.
- Treat defaults as the bottom layer of a CSS-like cascade, with future Theme support layered above
  defaults.
- Reserve the future Theme cascade slot between defaults and classes.
- Include a `theme` provenance kind in resolved style inspection types, even though `0.4.0` does not
  produce theme-origin values.
- Use public provenance layer names `"default" | "theme" | "class" | "style"`.
- Remove `StyleEntity.authored.direct`. Legacy direct style props that are still accepted by public
  authoring types should normalize into `authored.style` instead of being dropped or represented as
  a separate cascade layer.
- Add runtime style-key classification for graph construction and diagnostics while keeping it
  aligned with the strongly typed style vocabularies.
- Keep `compile()` and `compile({ mode: "strict" })` returning only `SemanticAuthorGraph`.
- Run style diagnostics in strict compile mode even though resolved style inspection is returned only
  in inspect mode.
- Add `StyleDiagnosticError` for style-resolution diagnostics.
- Combine composition, semantic graph, and style diagnostics into the single inspect-mode
  `diagnostics` result.
- Use `E_STYLE_*` diagnostic codes for style resolution errors.
- Include authored tag information in style diagnostics when available.
- Include inline text runs in style resolution and target compatibility checks.
- Keep semantic style target classification internal. Public stylesheet targets should be CSS-like
  selector strings over authored tags and classes, not `"slide" | "view" | "text" | "textRun" |
"image" | "shape"` string literals.
- Define `TextRunStyle` as an inline typography subset, not an alias of full `TextStyle`.
- Export `TextRunStyle` as a public type.
- Change `span` intrinsic props to use text-run authoring props backed by `TextRunStyle`.
- Exclude `backgroundColor` from `TextRunStyle` in `0.4`.
- Include `href` and `tooltip` in `TextRunStyle`.
- Exclude paragraph-level properties from `TextRunStyle`.
- Apply the graph-side style merge order as element defaults, stylesheet class rules by CSS-like
  specificity/source order, then inline `style`.
- Treat registered stylesheets as source-local Deck resources. Mounted child Decks resolve their own
  class names against their own registered stylesheets.
- Keep the stylesheet model compatible with a future CSS-like selector target path for class, authored
  tag, compound tag/class, and descendant selectors, without implementing selector matching in
  `0.4.0`.
- Support the clsx-like input shape captured in `0.3.1` as the normal class authoring model.
- Resolve and diagnose only normalized active class tokens. Falsey class branches should be ignored.
- Preserve duplicate active class tokens in authored provenance if useful, but do not let duplicates
  affect CSS-like resolved style precedence.
- Do not report unused class definitions.
- Do not add custom duplicate class definition detection beyond normal JavaScript object semantics.
- Report invalid class definition names as compile diagnostics, not constructor-time exceptions.
- Treat empty class names and names containing whitespace as invalid. Allow class names containing
  selector-special characters such as `/` when the corresponding Stylesheet Target uses CSS escaping.
- Type stylesheets as readonly authored resources; do not add direct mutation APIs in `0.4`.
- Ensure inline `new StyleSheet(...)` calls and imported stylesheets share the same typing, source-local
  lookup, and diagnostics behavior after registration.
- Pass source-local style metadata into graph construction without coupling graph construction to the
  full `DeckOptions` shape.
- Support lightweight style class definitions plus explicit single-selector and multi-selector target
  definitions.
- Use `{ target, style }` for targeted class definitions.
- Reserve `target` and `style` as class definition metadata keys rather than lightweight style keys.
- Allow targeted class definitions with empty `style` objects.
- Allow empty lightweight class definitions as no-op classes.
- Prefer type-level guidance for empty target lists; at runtime, an empty target list should behave as
  a class that matches no selector targets rather than requiring a separate definition diagnostic.
- Do not report unused empty-target class definitions.
- Type multi-selector class definitions as the shared style surface of every listed selector target
  when tag inference makes that possible.
- Type untargeted lightweight class definitions as a union of known deckjsx style vocabularies.
- Infer untargeted class compatibility only from unambiguous style keys. Ambiguous shared keys should
  remain allowed.
- Add warnings for missing class definitions and compile error diagnostics for invalid selector
  targets and target-incompatible class properties.

### Validation

- Tests for class lookup, CSS-like specificity, and stylesheet source order.
- Tests for missing class error messages.
- Tests for target-incompatible class diagnostics, such as applying text-only class properties to a
  view-like node.
- Type tests that `new StyleSheet(...)` rejects unsupported style keys.
- Tests that clsx-like `className` inputs continue to normalize in order.
- Tests that existing inline style behavior is unchanged.

### Out of Scope

- Applying resolved classes to legacy `render()` or `output()`.
- Supporting a `class` alias.
- Public user-configurable defaults.
- Theme value resolution.
- Output Projection and `build()` / `project()` / `write()` APIs.
- Full cascade debugging with complete overwrite history.
- Unused class linting.
- Paged Media / Print CSS features such as `@page`-like rules and page breaks.
- Full CSS selector parity beyond the v0.4.1 subset of tag, class, compound tag/class, and
  descendant selectors.
- Direct PPTX writer style application.

## 0.5 Theme Support

### Goal

Introduce reusable named design values and semantic defaults so decks can share colors, typography, and
authoring-language defaults.

Theme support should build on Style Classes and Style Entities before Output Projection begins, so
projection code can consume concrete style information instead of owning theme semantics.

### Proposed API

```ts
const theme = new Theme({
  colors: {
    text: "#0F172A",
    primary: "#2563EB",
  },
  fonts: {
    body: "Aptos",
    heading: "Aptos Display",
  },
  defaults: {
    p: {
      color: "#0F172A",
      fontSize: 18,
      fontFamily: "Aptos",
    },
    h1: {
      color: "#0F172A",
      fontSize: 32,
      fontFamily: "Aptos Display",
      fontWeight: 700,
    },
  },
});

const reportTheme = theme.extend({
  colors: {
    primary: "#DC2626",
  },
}).extend((theme) => ({
  defaults: {
    p: {
      color: theme.colors.text,
      fontFamily: theme.fonts.body,
    },
  },
});

const styles = reportTheme.defineStyles((theme) => ({
  classes: {
    title: {
      target: "h1.title",
      style: {
        color: theme.colors.text,
        fontFamily: theme.fonts.heading,
      },
    },
  },
}));

const deck = new Deck({ layout, theme: reportTheme });
deck.useStyles(styles);
```

### Semantics

- Theme values should be consumed through typed TypeScript access rather than string token paths.
- Prefer constructor/object APIs over adding more top-level public helper functions. Theme should be
  authored with `new Theme(...)` rather than a new `defineTheme(...)` helper.
- Move StyleSheet authoring toward `new StyleSheet(...)` and remove the top-level `defineStyles(...)`
  API in `0.5.0`. Breaking public API changes are acceptable before the future HMR-oriented authoring
  surface stabilizes.
  `new StyleSheet(...)` should accept a stylesheet object only. Theme-aware callback authoring should
  be limited to `theme.defineStyles(...)`.
  Theme and StyleSheet instances should be immutable-ish authored snapshots. Public types should be
  readonly, and authors should create a new Theme via `theme.extend(...)` or a new StyleSheet rather
  than mutating existing instances. Runtime freezing is not required.
  `Deck.useStyles(...)` should remain a fluent API that returns the Deck instance.
  `DeckOptions.theme` should accept a `Theme` instance only, not a raw Theme object. Raw objects are
  accepted by `new Theme(...)` and `theme.extend(...)`.
- Theme-bound stylesheets may be authored through the Theme instance, such as
  `theme.defineStyles(...)`, so callback parameters preserve the concrete Theme type.
- `theme.defineStyles(...)` should produce a `StyleSheet` instance with concrete style values.
  deckjsx should not implement `$token.path` resolution or token provenance in `0.5.0`.
- Because `theme.defineStyles(...)` resolves immediately to concrete StyleSheet values, active Theme
  composition inside mounted Decks should not retroactively rewrite those StyleSheets.
  By default, `theme.defineStyles(...)` should not materialize Theme defaults into class style
  definitions. Theme defaults remain a separate active Deck Theme layer during resolved style
  calculation. A targeted class definition may later expose explicit metadata near `target` to opt
  into composing with Theme defaults, but that behavior is a design note only and should not ship in
  `0.5.0`.
- Theme defaults should use a direct element-to-style map. Do not wrap each default in `{ style }`
  unless Theme defaults later need metadata beyond the style object.
- Theme default keys in `0.5.0` should be authored tags only. Do not expose `Slide`, `View`, `Text`,
  `Shape`, graph semantic kinds, or roles as public Theme default keys.
  Theme default style values should be typed by authored tag: text tags use `TextStyle`, `span` uses
  `TextRunStyle`, view-like tags use `ViewStyle`, and `img` uses `ImageStyle`.
  Theme defaults should apply only to graph nodes that preserve a matching authored tag. Do not treat
  implicit text runs created from primitive text leaves as `span` for Theme default purposes in
  `0.5.0`.
  Runtime validation should also exist for Theme defaults because styles are created when the Theme is
  defined or extended. Start with clear diagnostics for invalid default style keys for a tag; full
  value validation can remain incremental.
  Runtime Theme validation should collect diagnostics on the Theme and report them during
  `compile({ mode: "inspect" })` or strict compile rather than throwing from `new Theme(...)` or
  `theme.extend(...)`.
  Theme diagnostics should use `E_THEME_*` codes so Theme authoring problems are distinguishable from
  StyleSheet and style-resolution diagnostics.
- Supplying a Theme to `new Deck({ theme })` should mean the Theme is active for that Deck's own
  default-like style behavior. It should not be required merely to use concrete Theme values inside a
  StyleSheet.
- Theme defaults are part of `0.5.0`; an active Deck Theme should apply them before class styles and
  inline styles.
  Theme defaults should merge at the property level with the rest of resolved style resolution:
  class styles override individual Theme default properties, and inline `style` overrides individual
  Theme or class properties.
  Resolved style provenance for Theme defaults should include the Theme default key, such as
  `{ layer: "theme", defaultKey: "p" }`, rather than only `{ layer: "theme" }`. This is Theme default
  provenance, not token provenance.
  The active Theme should be treated as a merged snapshot for provenance purposes. Do not track which
  parent or child Theme fragment supplied an individual property in `0.5.0`.
- Theme composition across mounted Decks should differ from StyleSheet lookup. StyleSheets remain
  source-local class/rule resources, but an active parent Theme should provide the base Theme for a
  mounted child source. A child Theme deep-merges over that parent Theme, overriding selected design
  values and defaults at the property path level while inheriting unspecified values.
  Deep merge should recurse into plain objects only. Arrays and primitive values are replaced by the
  child Theme value.
  In `0.5.0`, this automatic composition affects Theme Defaults. StyleSheets produced from
  `theme.defineStyles(...)` are already concrete and should only use merged Theme values if the author
  explicitly creates a merged Theme before defining those styles.
  A mounted child without its own Theme should still receive the parent active Theme defaults. A
  mounted child with its own Theme should receive `parentActiveTheme.extend(childTheme)` defaults.
  A child Deck compiled on its own should use only its own Theme. The active Theme snapshot may differ
  between standalone compile and mounted compile because mounted composition supplies a parent Theme.
  Theme values and active Theme composition should not participate in Graph Node ID or Source
  Identity material. Theme changes are resolved-style payload changes, not authoring identity changes.
- Expose `theme.extend(childTheme)` as the public Theme composition API. It should use the same merge
  semantics as mounted Deck active Theme composition.
  `extend(...)` should accept a Theme instance, a raw partial Theme input, or a callback from the
  current Theme to a raw partial Theme input. This allows authors to derive defaults or additional
  values from an already-typed Theme without string token references. Mounted Deck Theme composition
  should be implemented as if the parent active Theme calls `baseTheme.extend(childTheme)`.
  Theme typing should preserve literal values through `new Theme(...)` and `theme.extend(...)`
  where TypeScript can reasonably infer them.
  Theme top-level keys should be open-ended so authors can model project-specific design vocabulary
  such as `colors`, `fonts`, `spacing`, `radii`, or `chart`. deckjsx may reserve specific keys, such
  as `defaults`, for behavior it interprets directly. `0.5.0` should only treat `defaults` as a
  reserved interpreted key; do not reserve `tokens`, `vars`, `metadata`, or `name` ahead of need.
- Theme values should be resolved into the Semantic Author Graph or its resolved inspection view, so
  output projections receive concrete values without making the graph output-format-specific.
- Style resolution order after Theme support should be:
  1. Element defaults
  2. Theme defaults
  3. Stylesheet rules by CSS-like specificity and source order
  4. Inline `style`
     The cascade pipeline should exist even when a Deck has no Theme. The internal element default layer
     provides the CSS-like baseline, then Theme defaults apply when an active Theme contributes values,
     then stylesheet classes and inline style override property-by-property. Empty layers should not
     appear in resolved-style provenance unless they contribute a value.
     Internal element defaults should contain real baseline values for properties that output projection
     needs to behave predictably, such as text font size. Projection code should consume resolved style
     values rather than inventing separate fallback style semantics.
     These baseline defaults should be broad enough to keep style fallback responsibility inside style
     resolution rather than scattering fallback decisions across projection code. Text, text-run,
     view/box, image, and other authored-tag style defaults should be centralized here where applicable.
     Initial default values should be based on CSS initial/user-agent behavior, then adjusted where raw
     CSS defaults are awkward for presentation authoring. Treat this as deckjsx's internal UA stylesheet
     for presentation documents.
     Resolved style inspection should include default-layer values and provenance. The inspect
     experience should be closer to browser DevTools computed styles than to a view of only the
     author-written style values.
     The normal resolved style view may expose the default properties that deckjsx defines as its active
     baseline. A fuller DevTools-like mode that expands every known style property with its default value
     should remain possible as a later inspection feature; do not implement that full computed mode in
     `0.5.0`.
     Design note for a future sandbox/debugger: graph output alone is not enough for a useful inspection
     experience. The sandbox should be able to expose the final artifact size, such as deck width and
     height, the active Theme snapshot for each source, internal element defaults, Theme defaults, and
     resolved style values so authors can understand why the final output looks the way it does.

### Implementation Notes

- Add `theme` to `DeckOptions` together with active Theme defaults.
- Move Theme and StyleSheet authoring classes into the top-level `src/style/` domain alongside
  cascade resolution. The style domain should own `Theme`, `StyleSheet`, element defaults, and
  resolved-style logic; `authoring/index.ts` should avoid continuing to accumulate style
  implementation details.
  Public style vocabularies such as `TextStyle`, `ViewStyle`, `TextRunStyle`, `ImageStyle`, and
  related style value types should also move into `src/style/`, with public re-exports preserved from
  the package entrypoint.
  Export `Theme` and `StyleSheet` from the package root.
- Apply element defaults and Theme defaults in style resolution, not during graph construction.
  `StyleEntity` should continue to represent authored inputs and references only; resolved concrete
  values belong to the resolved style view.
  Because defaults apply even when a node has no authored Style Entity, resolved style lookup should
  be node-oriented rather than StyleEntity-only. `0.5.0` may change `ResolvedStyleMap` to key by
  `GraphNodeId` so style-capable nodes can expose default-only computed styles.
  `ResolvedStyle` does not need to duplicate the node's `styleRef`; callers can inspect the graph
  node when they need the authored Style Entity reference.
  Resolved styles should be produced for style-capable renderable nodes, not for non-renderable graph
  nodes such as the document node.
- Do not add a string token resolver in semantic graph construction or graph resolution.
- Keep Output Projection values concrete.
- Document precedence with style classes because the two features interact.
- Do not apply Theme defaults or new resolved default behavior to legacy `render()` / `output()` in
  `0.5.0`; keep the canonical behavior visible through compile/inspect until Output Projection owns
  the concrete output path.

### Validation

- Tests that `theme.defineStyles(...)` preserves concrete typed theme values in registered
  stylesheets.
- Tests for Theme defaults.
- Do not add unknown token diagnostics; string token paths are not part of the `0.5.0` model.
- Snapshot tests showing graph/resolved inspection values and Output Projection values contain
  resolved values where appropriate.

## 0.6 Output Projection And Build Pipeline

### Goal

Introduce the output boundary that turns the Semantic Author Graph into an explicit
output-format-specific projection, without making the graph output-specific. This milestone should
shape the user-facing pipeline API before direct PPTX OOXML ownership expands in a later release.

`Deck` should own pipeline configuration and authoring inputs, but it should not hide compiled or
projected results as implicit mutable state.

Paged Media / Print CSS support should be considered near this boundary, not inside `0.4` element
style classes. `@page`-like rules, page size, page margins, bleed, page counters, and
`break-before`/`break-after`/`break-inside` are output-surface and pagination semantics. They should
remain output-agnostic at the graph or projection-input level, then be interpreted by PDF, PPTX, or
other output projections according to each format's capabilities.

### Proposed API

```ts
const deck = new Deck({
  layout,
  output: { format: "pptx" },
});

const graph = deck.compile();
const build = deck.build();

build.graph;
build.diagnostics;
build.projection; // PptxPackageModel when output.format is "pptx"

await build.write({ output: "deck.pptx" });
await deck.output({ output: "deck.pptx" });
```

Recommended API shape:

- `compile()` returns the Semantic Author Graph.
- `build()` returns an explicit Build object with the graph, diagnostics, and the configured Output
  Projection.
- `output.format` defaults to `"pptx"`.
- `Build` is typed by Output Format, so a PPTX build exposes a PPTX projection and writer.
- `output()` remains the convenience API for `compile -> project -> write`.
- `project()` and `write()` may exist as lower-level operations, but their core implementations
  should be independent functions so tests, HMR, and tooling can reuse them.
- The first projection may adapt through the existing rendering path where necessary, but the API
  boundary should not require Output Projections to read the Author Tree.

### Implementation Notes

- Add Output Format configuration to `DeckOptions`, defaulting to PPTX.
- Add the typed Build result and explicit graph/projection/diagnostics fields.
- Keep Output Projection separate from Output Writer.
- Keep Graph Identity distinct from output object ids, relationship ids, package paths, and other
  Output Identity.
- Keep the Semantic Author Graph output-agnostic. Projection-specific resolved values should belong
  to the projection or an explicit resolved inspection view.
- Reserve a future extension point for output-surface style rules and pagination semantics without
  mixing them into element-level class resolution.

### Validation

- Tests that `build()` return types follow `output.format`.
- Tests that output convenience APIs do not depend on hidden mutable compile/project state.
- Tests that Projection and Writer boundaries are independently callable.
- Tests that Output Projection consumes the Semantic Author Graph rather than Author Tree nodes.

## 0.7 Layout Templates

### Goal

Provide reusable layout definitions that can be applied to slides or views. Templates should reduce
manual `x`, `y`, `width`, and `height` repetition while keeping semantic layout relationships
visible in the graph.

By this milestone, the output pipeline boundary should already exist. Layout templates should add
semantic layout relationships and resolved layout inspection data without redefining the
build/project/write API.

### Proposed API

```ts
const deck = new Deck({
  layout,
  templates: {
    titleSlide: {
      areas: {
        title: { x: 0.7, y: 0.6, width: 12, height: 0.8 },
        body: { x: 0.7, y: 1.7, width: 12, height: 4.8 },
      },
    },
  },
});
```

```tsx
<Slide template="titleSlide">
  <Text area="title">Quarterly Review</Text>
  <View area="body">...</View>
</Slide>
```

### Semantics

- A template defines named areas.
- A child with `area` links to a template area in the Semantic Author Graph.
- Inline `style` can still override dimensions if needed.
- Templates should work independently from CSS grid. They are named layout slots, not full layout
  engines.
- Template areas are semantic relationships first. Concrete coordinates are resolved before or
  during Output Projection, depending on which inspection view is needed.

### Implementation Notes

- Add `templates` to `DeckOptions`.
- Add `template` to `SlideStyle` or `SlideProps`.
- Add `area` to content node props.
- Represent template-area relationships in the Semantic Author Graph.
- Add resolved layout/style inspection data without making PPTX-specific values part of the graph.

### Validation

- Tests for slide templates.
- Tests for missing template and missing area errors.
- Tests for inline overrides.
- Tests that `compile()` exposes graph relationships before output projection.

## Future Paged Media And Print CSS

### Goal

Support page-oriented authoring semantics inspired by Print CSS and tools such as WeasyPrint, while
keeping deckjsx output-agnostic until projection. This area should cover pagination and output-surface
rules, not ordinary element class reuse.

### Scope

- `@page`-like page rules for page or slide surface properties.
- Page size, margins, bleed, and page backgrounds where the output format supports them.
- Page breaks such as `break-before`, `break-after`, and `break-inside`.
- Potential page counters, headers, footers, and generated page metadata.

### Boundaries

- Do not model these as `className` classes in `0.4`; they are not element-local style reuse.
- Keep the semantic representation output-agnostic so PDF and PPTX projections can interpret the
  same authored intent differently when needed.
- Connect this work to Output Projection and Layout Templates rather than to legacy
  `render()`/`output()`.
- Treat WeasyPrint-style CSS support as a useful reference point, not as a requirement to implement
  the full CSS Paged Media spec.

## 0.8 Direct PPTX Output Projection And Writer

### Goal

Remove the required runtime dependency on `pptxgenjs` by introducing a direct PPTX Output Projection
and Output Writer. This also reduces transitive dependency weight, enables browser-compatible output
paths, and is a prerequisite for fast save-to-output feedback during development.

### Proposed Direction

Add PPTX as the default output format:

```ts
await deck.output({ output: "deck.pptx" });
```

Then transition package dependencies:

1. Add `SemanticAuthorGraph -> PptxPackageModel` projection.
2. Add a PPTX writer that serializes the package model to OOXML ZIP entries.
3. Remove the required `pptxgenjs` runtime dependency as soon as the supported feature surface has a
   direct writer path.
4. Keep any compatibility path temporary and explicitly separate from the new projection/writer
   architecture.

The dependency goal is not "no dependencies at any cost." deckjsx should own PPTX and OOXML
semantics itself, while allowing a very small set of low-level infrastructure dependencies when they
keep the package smaller and easier to maintain.

Preferred dependency shape:

- ZIP writing: use a small dependency that works in Node and browsers. `fflate` is the leading
  candidate because it has no runtime dependencies and supports browser-compatible ZIP generation.
- Image size detection: keep this behind an adapter boundary. Node can use `image-size`; browser
  builds may use browser image decoding APIs instead.
- XML emission: prefer a tiny deckjsx-owned XML emitter/escape helper over a general XML builder.
- XML parsing: keep parser dependencies out of runtime. If useful, use them only in tests.

Avoid introducing another high-level PowerPoint generation dependency. That would recreate the same
control, dependency, and HMR limitations that motivate moving away from `pptxgenjs`.

### Implementation Notes

- Create PPTX projection and writer modules separate from author graph construction.
- Generate required PPTX ZIP entries directly:
  - `[Content_Types].xml`
  - `_rels/.rels`
  - `docProps/*`
  - `ppt/presentation.xml`
  - `ppt/_rels/presentation.xml.rels`
  - `ppt/slides/slideN.xml`
  - `ppt/slides/_rels/slideN.xml.rels`
  - media files
  - theme and layout XML
- Move current OOXML patch knowledge into first-class XML emitters.
- Do not make the OOXML writer read the Author Tree directly.
- Add a package-model boundary before ZIP writing:

```text
Semantic Author Graph
  -> PptxPackageModel
       entries: Map<pptx path, bytes>
       relationships
       contentTypes
       mediaManifest
  -> PptxZipWriter
```

- Keep ZIP writing as a replaceable adapter so Node, browser, and future dev-server outputs can use
  the same package model.
- Keep Graph Identity distinct from PPTX relationship ids, object ids, part paths, and other Output
  Identity.
- Do not make HMR depend on mutating an existing `.pptx` ZIP in place. PPTX ZIP files have a central
  directory at the end, so the practical fast path is to avoid recompiling unchanged slides and then
  quickly re-emit the package.

### Risks

- Full PPTX compatibility is larger than the current feature surface.
- Image relationship management and media deduplication need deterministic IDs.
- Existing tests mostly validate current IR and zip structure; direct XML needs deeper fixture tests.
- Browser compatibility can be lost if Node-only APIs leak into the PPTX projection or writer. Keep
  file system, path, image probing, and ZIP writing behind adapters.

### Validation

- Projection tests from Semantic Author Graph to PptxPackageModel.
- ZIP structure tests.
- XML snapshot tests for slides.
- Render verification through `scripts/verify-render.ts`.

## 0.9 Hot Module Replacement

### Goal

Support a fast authoring loop where saving a source file quickly updates the generated output. The
main objective is immediate feedback after save, not preserving long-lived runtime state inside the
deck compiler.

### Preconditions

HMR should come after the Semantic Author Graph, Graph Composition, and at least one output
projection/writer path can preserve source and graph identity. `pptxgenjs` is built around
whole-presentation generation, which limits meaningful HMR.

For the first implementation, "HMR" can mean watch-mode incremental rebuild rather than a browser UI
with stateful module replacement. The important behavior is that editing a slide module should update
the output quickly.

### Proposed Architecture

- Track authoring sources by Source Identity, including source keys and module/export identity where
  available.
- Compile changed sources to updated Author Trees and raise them into updated Semantic Author Graph
  branches.
- Preserve Graph Identity where Source Identity, JSX position, and Graph Identity Hints allow it.
- Rebuild only affected package entries:
  - changed slide XML
  - changed slide relationships
  - changed media entries
  - presentation manifest if slide order changed
- Expose a dev server integration through Vite+ tasks or a dedicated CLI.
- Re-project changed graph branches into the output projection, then re-emit the PPTX from the
  package model. Avoid depending on low-level ZIP entry patching for correctness.
- Keep browser support in mind by separating:
  - source/module watching
  - compilation
  - semantic graph construction
  - output projection
  - output writing

### Proposed API

```bash
vp dev
```

or:

```bash
deckjsx dev src/deck.tsx --outdir .deckjsx
```

The first implementation can write updated PPTX artifacts to disk. A later implementation can add a
preview UI if needed.

### Validation

- Unit tests for Source Identity, Graph Identity, and Graph Identity Hints.
- Integration tests for changing one slide and regenerating only expected outputs.
- Smoke test through a Vite+ dev task.

## Suggested Release Order

1. `0.3.1` should stabilize inspect mode, diagnostics, documentation, and Semantic Author Graph
   readiness before output work starts.
2. `0.4` should add Style Classes because they strengthen Style Entity semantics without requiring
   output projection.
3. `0.5` should add Theme Support before projection work so token and default resolution stay in
   graph/style semantics rather than leaking into PPTX or PDF projection code.
4. `0.6` should establish Output Projection and build/project/write boundaries while keeping the
   Semantic Author Graph output-agnostic.
5. `0.7` should follow the output boundary because template relationships need clear inspection and
   projection behavior.
6. `0.8` should add the direct PPTX projection and writer after the public output pipeline shape is
   already clear.
7. `0.9` should come after source-aware graph compilation and at least one output projection/writer
   path can preserve identity well enough for incremental rebuilds.

## Compatibility Policy Before 1.0

- Prefer correcting core model boundaries early over preserving APIs that make the wrong internal
  model hard to remove.
- Keep existing `Slide`, `View`, `Text`, `Image`, and `Shape` authoring components working where
  practical, but do not keep `render()` or `PresentationIR` as primary API commitments.
- Prefer additive changes when they do not preserve the wrong architecture.
- Document migration examples when introducing intrinsic JSX tags, classes, themes, and the OOXML
  writer path.
- Make `compile()` the primary inspection API and let `build()` expose graph, diagnostics, and
  configured Output Projection results.

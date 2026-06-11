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
As of `0.6`, the current output path is `Semantic Author Graph -> Output Projection -> Output
Writer`; the earlier Presentation IR path is not part of the active architecture.

## Versioning Strategy

The current package is `0.8.0`. Until the API is stable enough for `1.0`, each new feature family
should land as a separate minor version:

- `0.2`: HTML-like authoring syntax, followed by the first Semantic Author Graph work
- `0.3.0`: graph composition across multiple authoring sources
- `0.3.1`: inspect, diagnostics, documentation, and Semantic Author Graph readiness review
- `0.4`: class-like style reuse
- `0.5`: theme support
- `0.6`: Project/Render pipeline, result-first stage APIs, and Pptx Package Model
- `0.7`: slide declarations and Deck templates
- `0.8`: direct PPTX output projection and writer, replacing the required `pptxgenjs` path
- `0.8.1`: writer responsibility cleanup after the direct PPTX writer migration, keeping public APIs
  stable while deepening internal writer Modules
- `0.8.x`: deckjsx-owned layout solver hardening for CSS-like layout correctness, with external
  engines used only as optional verification oracles
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

Historical `0.2.x` examples used `deck.add()` and a public `<Slide>` root. These are superseded by
the `0.7` Slide Declaration API; current authoring examples should use `deck.slide(...)` instead.

```tsx
deck.slide({ name: "Intro" }, () => (
  <div className="hero">
    Hello
    <img src="./logo.png" />
  </div>
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

section.slide(({ context, composition }) => (
  <>
    <h1>{context.sectionTitle}</h1>
    <p>
      {composition.deckSlideIndex + 1} / {composition.deckTotalSlides}
    </p>
  </>
));
```

Root Deck slide factories have no `context` field:

```tsx
const root = new Deck({ layout });

root.slide(({ composition }) => (
  <>
    <p>{composition.slideIndex + 1}</p>
  </>
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

`0.4` should make class resolution part of the Semantic Author Graph / `compile()` path only. It
should not expand the pre-`0.6` renderer-command path or make class-like styles observable through
the old output API.

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

- `0.4.0`: ship `new StyleSheet({ classes })`, `deck.useStyles()`, CSS-like cascade/source-order
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

## 0.6 Project/Render Pipeline And Pptx Package Model

### Goal

Introduce the output boundary that turns the Semantic Author Graph into an explicit
output-format-specific Projected Document Model, without making the graph output-specific. This
milestone should establish Project and Render as the user-facing pipeline stages and introduce an
HMR-friendly Pptx Package Model before direct PPTX OOXML ownership expands in a later release.

`Deck` should own pipeline configuration, authoring inputs, and explicitly defined Pipeline
Artifacts. Stage operations should materialize pending work rather than hide compiled or projected
results as implicit mutable cache.

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

const compileResult = deck.compile();
compileResult.ok;
compileResult.graph;
compileResult.diagnostics;
compileResult.stages.compile;

const projectResult = await deck.project();
projectResult.ok;
projectResult.projection; // Pptx Package Model when output.format is "pptx"
projectResult.summary;
projectResult.diagnostics;
projectResult.stages.compile;
projectResult.stages.project;

const renderResult = await deck.render({ output: "deck.pptx" });
renderResult.ok;
renderResult.artifact;
renderResult.diagnostics;
renderResult.stages.render;
```

Advanced/sandbox flow:

```ts
const compileResult = deck.compile();
const graph = editGraph(compileResult.graph);
deck.defineGraph(graph);

const projectResult = await deck.project();
const projection = editProjection(projectResult.projection);
deck.defineProjection(projection);

await deck.render({ output: "deck.pptx" });
```

Render without a file write:

```ts
const result = await deck.render();

if (result.ok && result.artifact) {
  result.artifact.bytes; // Uint8Array
  result.artifact.mediaType;
  result.artifact.extension;
}
```

Recommended API shape:

- `compile()` returns `CompileResult`, not a raw `SemanticAuthorGraph`.
- `project()` returns `ProjectResult`, not a raw projection.
- `render()` returns `RenderResult`, not `void` or a raw artifact.
- Stage options may change detail or policy, but should not change the top-level result shape.
- Stage results expose `ok`, flat diagnostics, stage-grouped summaries, and artifact presence
  (`available`, `partial`, or `missing`) where relevant.
- `ok` is derived from error diagnostics; warning diagnostics do not make a result unsuccessful.
- `project()` and `render()` may materialize earlier unresolved stages, but their results should keep
  the prior-stage diagnostics visible.
- `output.format` defaults to `"pptx"` and drives `project()` when no explicit format or Writer
  Adapter is provided.
- `build()` and `output()` are not part of the primary `0.6` API.
- `project(graph)` and `render(projection, ...)` should be avoided; edited Pipeline Artifacts should
  be supplied with `defineGraph()` or `defineProjection()`.
- In `0.6`, `deckjsx/adapter` exposed Writer Adapters such as `pptxgenjs`; `0.8.0` supersedes this
  with the core `pptx()` adapter and moves any future `pptxgenjs` bridge outside the core package.
- `render({ output })` uses the default Writer Adapter for the Deck output format.
- In `0.6`, `render(pptxgenjs({ output }))` used the explicit Writer Adapter and warned if its
  required format differed from the Deck default Output Format. In `0.8.0`, the equivalent core
  explicit adapter path is `render(pptx({ output }))`.
- Writer Adapters declare the Projection Format they consume separately from the Output Format they
  return, so a future adapter can produce a different artifact format without redefining the
  Projected Document Model.
- `render(adapter, options)` should not be added in `0.6`; adapter-specific options belong to the
  adapter factory.
- `render()` without `output` still returns a `RenderResult` with `artifact.bytes` when rendering
  succeeds.
- `render({ output })` accepts a string path only in `0.6`; streams, blobs, and browser filesystem
  handles should consume `RenderedArtifact.bytes` outside the core API.

### Implementation Notes

- Add Output Format configuration to `DeckOptions`, defaulting to PPTX.
- Add `CompileResult`, `ProjectResult`, `RenderResult`, `RenderedArtifact`, and `OutputFormat` to the
  Authoring Interface.
- Add detailed Pptx Package Model and project inspection summary types to the Inspection Interface.
  In `0.6`, expose read-only data model types rather than mutation helpers or builders.
- Add `deckjsx/adapter` as the Adapter Interface.
- Remove `deckjsx/legacy`, old `Deck.render(): PresentationIR`, and `Deck.output()`.
- Add `defineGraph()` and `defineProjection()` as whole-artifact public APIs.
- Treat `defineGraph()` and `defineProjection()` as explicit artifact redefinition, while
  `compile()`, `project()`, and `render()` materialize pending stage work.
- Let `defineProjection()` perform only lightweight artifact-shape checks. Deeper package consistency
  checks belong to project or pre-render validation.
- Keep Output Projection separate from Output Writer.
- Make the Pptx Package Model a structured package-part graph keyed by Package Part Identity rather
  than raw XML bytes or package paths.
- Project the smallest useful complete PPTX package skeleton before Render, including required
  manifest parts, support parts, authored-content parts, and relationships.
- Project image media relationships into slide relationship parts, and attach the deterministic
  relationship identity to the corresponding projected image element.
- Project content type entries, root relationships, and presentation relationships as structured
  manifest payloads rather than leaving those parts as path-only placeholders.
- Treat manifest payload types, including content-type defaults/overrides and relationship payloads,
  as Pptx Package Model inspection types. Internal manifest assembly helpers may build and re-export
  those shapes, but `deckjsx/inspect` should expose the Pptx Package Model vocabulary rather than a
  writer or helper-module vocabulary.
- Distinguish manifest parts, support parts, and authored-content parts. Root/presentation
  relationships are manifest parts, slide relationships are authored-content parts, and
  layout/master/notes relationships are support parts.
- Give support parts thin structured payloads in `0.6` when the real OOXML domain is not modeled
  yet. Placeholder support payloads should still communicate their package role and editable intent
  instead of leaving support parts as path-only entries.
- Allow PPTX slide payloads to be close to OOXML/XML structure, while preserving structured data,
  deckjsx-readable element kinds, and provenance instead of raw XML strings.
- Add Pptx Element Identity distinct from Graph Identity and OOXML object identifiers.
- Assign deterministic PPTX serialized identities, such as relationship ids and shape object ids,
  during Project so inspection and future HMR are not dependent on writer-local counters.
- Include origin/dependency links from package parts back to Graph Identity and Source Origin where
  relevant.
- Let projected PPTX elements carry writer-needed concrete values and provenance links to graph
  nodes, style entities, resolved styles, assets, and source origins where relevant.
- Include project-time layout and measurement results needed for inspection, such as resolved frames,
  text fitting, overflow, and constraint results. Values only known after a writer runs remain Render
  concerns.
- Allow `ProjectResult` to contain a partial Pptx Package Model when projection produced error
  diagnostics. Render must not write or return a rendered artifact when project has error
  diagnostics.
- Add a thin derived project summary for sandbox/debug use. It should show package parts, slides,
  projected elements, origins, basic resolved values, diagnostics, and known default-adapter
  limitations. The summary is derived from the projection, not an independent Pipeline Artifact.
- Let stage operations materialize source, graph, projection, and package-part snapshots into the
  Pipeline Artifact Collection. Public `defineGraph()` and `defineProjection()` remain whole-artifact
  APIs in `0.6`.
- Materialized source and graph artifacts should include mounted Source Identity keys, not only a
  root whole-deck slot. Projection artifacts should include Package Part Identity indexes and
  source/graph-origin indexes for future HMR invalidation.
- Treat `0.6` as incremental-ready rather than fully incremental. Stage operations should use
  explicit stage invalidation vocabulary, but authoring mutations may still rematerialize whole
  snapshots. Source-entry dirty tracking and package-part incremental projection belong to the HMR
  milestone.
- Keep Deck as the public authoring owner, but move stage execution policy into an internal Pipeline
  Runner module.
- Keep `deckjsx/adapter` focused on author-facing adapter factories and types; default writer lookup,
  known default-adapter limitations, and runtime adapter detection belong to an internal Adapter
  Registry.
- Add `RenderedArtifact` metadata: `format`, `mediaType`, `extension`, and `bytes: Uint8Array`.
- If artifact generation succeeds but writing to `output` fails, return the artifact bytes and report
  the write failure in diagnostics.
- In `0.6`, the pptxgenjs Writer Adapter may be the default adapter, but it must adapt to the Pptx
  Package Model instead of shaping the model around pptxgenjs. `0.8.0` replaces this default with
  the direct PPTX writer and removes the core runtime dependency.
- Temporary Writer Adapter limitations should be diagnostics. Nonbreaking unsupported details are
  warnings; model inconsistencies or adapter gaps that would produce a broken artifact are
  render-blocking errors.
- Keep Graph Identity distinct from output object ids, relationship ids, package paths, and other
  Output Identity.
- Keep the Semantic Author Graph output-agnostic. Projection-specific resolved values should belong
  to the projection or an explicit resolved inspection view.
- Preserve enough asset identity and media-part references for HMR and inspection, but defer deep
  image processing, conversion, compression, and deduplication to the direct OOXML writer milestone.
- Keep Project's Projection Format vocabulary aligned with implemented Projected Document Models.
  Custom Writer Adapters may return broader Rendered Artifact formats before those formats have a
  first-class projection.
- Keep direct OOXML serialization out of `0.6`; it remains a later version concern.
- Reserve a future extension point for output-surface style rules and pagination semantics without
  mixing them into element-level class resolution.

### Validation

- Tests that `compile()`, `project()`, and `render()` return stable result shapes.
- Tests that `ok` is false only when error diagnostics exist and remains true for warning-only
  diagnostics.
- Tests that flat diagnostics and stage-grouped diagnostics agree.
- Tests that stage summaries report artifact availability, partial artifacts, and missing artifacts.
- Tests that `project()` materializes Pptx Package Model parts from compiled graph artifacts.
- Tests that `project()` can return a partial Pptx Package Model with error diagnostics for
  inspection.
- Tests that Pptx Package Model parts use Package Part Identity distinct from package paths.
- Tests that Pptx Element Identity is distinct from Graph Identity and deterministic serialized PPTX
  ids.
- Tests that projected relationship ids and shape object ids are stable across equivalent projects.
- Tests that projected media parts are connected through slide relationships before Render.
- Tests that content types, root relationships, and presentation relationships are visible in the
  projected package model before Render.
- Tests that `defineGraph()` and `defineProjection()` supply the next stage's artifact source.
- Tests that `defineProjection()` performs lightweight definition checks and leaves deeper
  relationship/package errors to project or pre-render validation.
- Tests that `render()` accepts default options and explicit Writer Adapters.
- Tests that `render()` without `output` returns a `RenderedArtifact` with `Uint8Array` bytes,
  media type, extension, and format.
- Tests that file write failures preserve artifact bytes and report diagnostics.
- Tests that render does not write or return an artifact when project has error diagnostics.
- Tests that explicit Writer Adapter format mismatches produce warnings.
- Tests that project summaries expose known default-adapter limitations, and temporary Writer Adapter
  limitations produce warnings or render-blocking errors
  according to whether the artifact would be broken.
- Historical `0.6` tests asserted that the pptxgenjs Writer Adapter consumed the Pptx Package Model
  rather than reading the Author Tree; `0.8.0` replaces this with direct writer and isolated
  regression-oracle coverage.

## 0.7 Slide Declarations and Deck Templates

### Goal

Make `deck.slide()` the single author-facing way to declare a slide, and add Deck-owned Slide
Templates for reusable page structure. This milestone should remove the split between `deck.add()`
and a public `<Slide>` root while keeping slide identity, template selection, and Template Area
relationships visible before output projection.

By this milestone, the output pipeline boundary already exists. Slide Templates should add
output-agnostic page-structure relationships to the Semantic Author Graph, then let layout/project
resolve concrete frames for PPTX or future outputs.

### Proposed API

```ts
const deck = new Deck({
  layout,
  theme,
  templates: {
    titleSlide: {
      areas: {
        title: { frame: { x: 0.7, y: 0.6, width: 12, height: 0.8 } },
        body: { frame: { x: 0.7, y: 1.7, width: 12, height: 4.8 } },
      },
    },
  },
});
```

```tsx
deck.slide({ name: "title", template: "titleSlide" }, ({ composition, template }) => (
  <>
    <h1 area={template.title}>Quarterly Review</h1>
    <section area={template.body}>
      <p>Slide {composition.deckSlideIndex + 1}</p>
    </section>
  </>
));
```

```tsx
deck.slide(() => <h1>Untemplated slide</h1>);
```

### Semantics

- `deck.slide(factory)` and `deck.slide(options, factory)` are the only public slide declaration
  APIs. `deck.add()` is removed.
- A slide factory returns the slide content JSX, not a public `<Slide>` root. Slide-level `name`,
  `template`, `className`, and `style` live in `SlideOptions`.
- Public `<Slide>` is removed from the Authoring Interface. Internal slide nodes may remain as the
  bridge from Slide Declaration to the Semantic Author Graph.
- `templates` belongs to `DeckOptions`, not to `Theme`. Theme remains the visual vocabulary;
  Deck-owned templates are page-structure vocabulary.
- Child Decks do not inherit parent templates. Template names are Deck/source-local, so parent and
  child Decks may use the same template name with different definitions.
- A Slide Template defines named Template Areas under `areas`. Each Template Area has a complete
  `frame` using the same frame value system as inline positional style.
- `area` takes a Template Area Reference object, not a string. Authors obtain references from the
  typed slide factory `template` handle, such as `area={template.title}`.
- The slide factory receives `template` as a top-level field only when a `template` option is used.
  `composition` remains top-level and always available; `context` remains Source Context only.
- The template handle includes a public `$name` discriminant so template unions can be narrowed
  without reserving ordinary area names.
- Template names and Template Area names starting with `$` are invalid; `$` is reserved for
  deckjsx-owned handle metadata.
- Template Area names and Style Class names are separate namespaces.
- `area` is allowed on style/layout capable authored nodes, but an effective Template Area Reference
  must appear on a direct slide child. Nested area references are compile errors.
- One Template Area may be referenced by at most one direct authored node in a slide. Multiple
  elements in the same area should be wrapped in a container carrying the area reference.
- Nodes with `area` are placed by the Template Area frame and removed from the normal sibling layout
  flow. Nodes without `area` continue to use normal layout flow even on templated slides.
- Template Area frame values override default, theme-default, and stylesheet positional values for
  that placement. Inline positional style remains the author escape hatch and overrides
  corresponding Template Area frame properties.
- Template relationships are graph semantics first. Concrete coordinates are resolved in
  layout/project artifacts, with enough inspection data to explain area-derived values and inline
  overrides when possible.

### Implementation Notes

- Replace the public slide authoring path with `deck.slide(...)`; remove `Deck.add()` and remove
  `Slide` from root JSX exports and public JSX authoring types.
- Keep `SlideDeclaration` as the public concept and continue using internal slide author nodes or
  graph nodes where they make the pipeline simpler.
- Add `SlideOptions` with `name`, `template`, `className`, and `style`.
- Add `SlideTemplateSet`, `SlideTemplate`, `TemplateArea`, and `TemplateAreaRef` as root authoring
  type exports. Do not export a public constructor or helper for creating Template Area References.
- Type `Deck` so literal `templates` are preserved. `deck.slide({ template })` should complete and
  constrain template names from the Deck template set.
- Type the slide factory `template` handle from the selected template. Literal selections should
  expose exact areas; union selections should produce a discriminated union via `$name`.
- Preserve the existing `new Deck<TSourceContext>(...)` source-context authoring experience as much
  as TypeScript allows. If inference cannot cover every case, support explicit template generics and
  external `as const satisfies SlideTemplateSet` definitions.
- Build Template Area References with an internal runtime brand plus a readable tag string for
  diagnostics/inspection. Public code should only receive them from the factory template handle.
- Add runtime validation for the whole Deck template set, including complete `frame` values and
  reserved `$` prefixes. Templates may be defined without a layout; final frame interpretation follows
  the same stage as existing positional layout/style values.
- Add graph fields for slide template references and node Template Area References without turning
  the graph into a resolved layout model.
- Resolve Template Area frame placement in layout/project artifacts. Keep PPTX-specific values out of
  the Semantic Author Graph.

### Validation

- Type tests that `template` names are completed from `new Deck({ templates })`.
- Type tests that `area={template.title}` is accepted and unknown areas are rejected for literal
  templates.
- Type tests for `$name` narrowing when the template option is a union.
- Type tests that `template` is not available in the factory input for untemplated slides.
- Runtime diagnostics for missing templates, area references without an active template, mismatched
  Template Area Reference objects, unknown areas, nested area references, duplicate direct area use,
  incomplete frames, and reserved `$` prefixes.
- Tests that `deck.add()` and public `<Slide>` are removed from the public API.
- Tests that same-named parent and child Deck templates are source-local and do not conflict.
- Tests that area-bound direct children are removed from normal flow while unbound children remain in
  normal flow.
- Tests that Template Area frame values override class/default positional values and inline
  positional style overrides corresponding area frame values.
- Tests that `compile()` exposes template and area graph relationships before output projection.

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
await deck.render({ output: "deck.pptx" });
```

`project()` becomes asynchronous in `0.8.0` so media metadata can participate in the projected model:

```ts
const projectResult = await deck.project();
```

For `0.8.0`, transition package dependencies all the way to the direct writer:

1. Add `SemanticAuthorGraph -> PptxPackageModel` projection.
2. Add a PPTX writer that serializes the package model to OOXML ZIP entries.
3. Make the direct OOXML writer the default for `deck.render({ output })`.
4. Remove `pptxgenjs` as a runtime dependency in `0.8.0` instead of carrying it as the compatibility
   writer.
5. Remove the public `pptxgenjs()` adapter export from the core package; if a compatibility adapter
   is needed later, publish it outside the core deckjsx package.
6. Expose the direct PPTX writer adapter as `pptx()` from `deckjsx/adapter`; default render options
   should internally select the same writer.

The dependency goal is not "no dependencies at any cost." deckjsx should own PPTX and OOXML
semantics itself, while allowing a very small set of low-level infrastructure dependencies when they
keep the package smaller and easier to maintain.

Preferred dependency shape for `0.8.0`:

- ZIP writing: use `fflate` as the built-in ZIP writer dependency because it works across runtimes,
  is small, and keeps final package emission fast enough for HMR and sandbox feedback loops.
- Image size detection: keep this behind an adapter boundary. Node can use `image-size`; browser
  builds may use browser image decoding APIs instead.
- XML emission: use a deckjsx-owned byte/chunk-oriented XML writer rather than a general XML builder
  or DOM-like XML tree. The writer should avoid creating a full XML node tree or relying on a
  second structured model after the Pptx Package Model.
- Prefer pre-encoded static XML chunks for common OOXML tags, namespace blocks, and templates, with
  dynamic numeric and escaped string values appended by the writer. Avoid building whole-slide XML
  strings before encoding, avoid per-node XML object trees, and keep readable semantic emit helpers
  such as text box, picture, shape properties, fill, and relationship emitters above the low-level
  byte writer.
- XML parsing: keep parser dependencies out of runtime. If useful, use them only in tests.

Avoid introducing another high-level PowerPoint generation dependency. That would recreate the same
control, dependency, and HMR limitations that motivate moving away from `pptxgenjs`.

The v0.8.0 design should be driven by the question "what declarative meaning from JSX and the
Semantic Author Graph is needed to construct a PPTX package?" rather than by data flow alone. JSX and
the graph are declarative inputs; Pptx Package Model is the projected PPTX answer. When the
projection encounters authoring meaning that the current direct writer cannot fully render yet, the
important v0.8.0 responsibility is to preserve or report that meaning instead of collapsing it into
opaque writer commands.

### Implementation Notes

Implement the `0.8.0` release as one completed migration, but split the work internally into these
phases:

1. Break and reshape the public/API boundary: remove `pptxgenjs()`, add `pptx()`, make `project()`
   async, add Deck-owned asset loader registration, and introduce `PptxRenderOptions`.
2. Add the asset pipeline: AssetLoader `probe`/`load`, Asset Artifacts, built-in multi-runtime-safe
   source handling, and asset diagnostics.
3. Rewrite the Pptx Package Model: remove the version field, add Package Part Fingerprints and
   dependency fingerprints, structured support payloads, relationship target modeling, and Pptx Slide
   Drawing. Split the current monolithic PPTX projection module into focused modules for model
   types, identities, fingerprints, manifest/support parts, drawing projection, media projection,
   summaries, and validation.
4. Rewrite projection: map graph, resolved styles, layout, media metadata, z-order, generated
   drawing nodes, fills, strokes, effects, text bodies, and relationships into PPTX-domain model
   properties.
5. Add build artifacts and direct writing: materialize Pptx Package Build Artifacts, implement the
   byte/chunk XML writer, part emitters, media part builder, fflate ZIP writer, compression modes,
   and deterministic bytes. Keep direct writer modules separate from projection modules.
6. Add validation: semantic writer tests, visual/rendering tests, generation regression workflows,
   render verification, and documentation/type-test updates that remove the old pptxgenjs-as-core
   writer guidance.

Current implementation progress:

- Public/API boundary migration has started: core exposes `pptx()`, default render uses the direct
  PPTX writer, `project()` is async, and Deck owns `useAssets(loader)` registration.
- Asset Artifacts now carry probe metadata and optional loaded bytes. Project copies available
  media metadata into PPTX media part payloads, while Render loads bytes through Asset Artifacts and
  keeps those bytes out of Pptx Package Model.
- `PptxPackageModel.version` has been removed. `defineProjection()` now validates the current shape
  instead of model-version compatibility.
- Package parts now carry deterministic `orderKey` values. Render builds initial package-part Build
  Artifacts, creates a lightweight Assembly Plan summary, and reuses matching part bytes on warm
  renders before final ZIP assembly.
- The direct writer now treats the ordered Assembly Plan as the source for a ZIP entry stream. The
  internal ZIP module consumes ordered entries through fflate's streaming `Zip` API and a collecting
  sink rather than making the writer build a second whole-package entry map.
- ZIP compression policy and fflate integration now live in an internal `writers/pptx/zip` module.
  The writer composite consumes semantic compression modes and per-entry Assembly Plan compression
  decisions, stores media entries when requested by the plan, and no longer imports fflate directly
  from the main PPTX writer entry point.
- Runtime-neutral ZIP sink interfaces now live under the PPTX writer internals. Public artifact
  bytes are produced by a collecting sink, and direct PPTX path output can now tee the same ZIP
  generation into an internal Node file sink. The public API still exposes only collected artifact
  bytes and output side-effect summaries, not streaming ZIP controls.
- Node filesystem path output now lives behind `runtime/node-output`; the pipeline runner no longer
  statically imports `node:fs` or `node:path`, keeping the core project/render pipeline friendlier to
  web and edge runtimes while preserving path output as a Node side effect. The Node runtime can also
  create a byte sink for the direct PPTX writer, while the older write-after-artifact path remains as
  a fallback for non-direct adapters.
- The built-in Asset Loading Boundary now handles `data:` sources, byte sources, and absolute
  `http:`/`https:` media URLs. Absolute URL images are preserved as URL sources in graph/projection,
  Project can infer extension/media type without a custom loader, and Render fetches bytes through
  `fetch` when the runtime provides it. Filesystem-like and app-public relative paths still remain
  outside core behind `deck.useAssets(loader)`.
- Asset Artifacts are now keyed by Asset Entity identity and indexed by normalized media source plus
  resolver scope. Project and Render can reuse probe/load results for repeated authored media
  sources, such as multiple images pointing at the same loader-resolved public path, without making
  the Pptx Package Model store media bytes.
- Media part payload validation now checks the source shape, merged source list, associated element
  and asset identities, duplicate ownership-list entries, allocation key, and probe-derived metadata
  before Render. This keeps PptxPackageModel responsible for media topology and metadata while
  keeping actual media bytes in Asset Artifacts or render-time source decoding.
- Media part payload validation also checks associated element identities against the projected
  slide drawing tree and associated asset identities against projected drawing origins, so media
  topology cannot point at arbitrary or stale Pptx Element Identity or Asset Entity values that are
  absent from the current PptxPackageModel.
- Asset loader failure diagnostics now preserve the source value, resolver scope, probe/load phase,
  affected Asset Entity, and affected media package part path where applicable. Probe failures are
  reported as Project diagnostics, while load failures are reported as Render diagnostics before the
  writer attempts package assembly.
- A small byte/chunk XML writer now backs the manifest, relationship, document-property,
  presentation, theme, slide master, slide layout, and slide-part XML paths. Slide drawing object
  emitters now write text boxes, shapes, pictures, generated strokes, background layers, and group
  children directly into `XmlChunkWriter` instead of building one large `map().join("")` slide
  drawing string before serialization.
- Lower-level slide drawing fill, stroke, shadow, gradient color-stop, and rich-text color emission
  now use PPTX-domain `XmlChunkWriter` emitters instead of building raw XML fragments and then
  re-inserting them into the slide writer. Bullet marker emission also uses the chunk writer with
  UTF-8 marker characters instead of raw entity snippets. Slide part XML emission no longer uses
  `raw()`; fixed slide skeleton and color-map override markup are emitted through named chunk-writer
  helpers.
- Slide master and slide layout support XML now emit their fixed shape-tree skeleton and color-map
  override markup through `XmlChunkWriter` helpers as well. The package/support/slide XML writer
  modules no longer rely on raw XML snippets for these fixed structures.
- Package topology XML emission has started moving under the PPTX writer composite. Content type and
  relationship XML now live in the internal `writers/pptx/package-xml` module, including root
  relationship owner-path handling, while the public adapter surface remains unchanged.
- Content type and relationship XML now have regression coverage proving emitted manifest XML comes
  from structured Pptx Package Model manifest payloads. The writer rejects malformed content-type
  and relationship payloads instead of silently emitting empty package topology XML or falling back
  to writer-adjacent metadata.
- Support-part XML emission has also moved under the PPTX writer composite. Presentation, theme,
  slide master, slide layout, core/app document properties, view properties, and presentation
  properties now serialize through the internal `writers/pptx/support-xml` module, leaving the main
  writer entry point focused on slide drawing emission, package validation, and high-level render
  orchestration.
- Core and extended document-property XML now require structured `docProps` support payloads from
  Pptx Package Model instead of falling back to projection-global metadata. This keeps
  sandbox/defineProjection edits to support parts observable in the emitted package and avoids making
  docProps a writer-invented side channel.
- Presentation XML now requires the structured presentation support payload for slide size and
  presentation slide membership instead of deriving those values directly from projection globals.
  Sandbox/defineProjection edits to `ppt/presentation.xml` intent are therefore visible in emitted
  OOXML without a writer fallback masking malformed payloads.
- Presentation XML now also consumes each referenced slide part's projected numeric `payload.slideId`
  for `p:sldId/@id` instead of deriving `256 + index` inside the writer. Slide graph/source identity
  remains available through drawing/package origin metadata, while the slide payload field describes
  the OOXML presentation slide id that will be serialized.
- View and presentation property XML now require their empty structured support payload kind. The
  emitted XML remains intentionally minimal in v0.8.0, but the support payload is still validated and
  connected so future structured settings do not have to reopen the writer seam.
- Slide master and slide layout support XML now have regression coverage proving emitted color map
  and layout name values come from structured support payloads. This keeps master/layout support
  parts as projected package intent rather than writer-local defaults.
- Theme support XML now has regression coverage proving emitted theme name, color scheme, font
  scheme, and format scheme values come from the structured theme payload. Theme Projection trace
  validation remains separate from writer-consumed theme support payload validation. The theme
  emitter now rejects missing or malformed required color/font/format scheme values instead of
  substituting black colors or empty font metadata inside the writer.
- Theme, slide master, and slide layout support XML emitters now reject malformed support payloads
  instead of silently substituting bootstrap defaults inside the writer. Normal Render still fails
  earlier through package consistency validation, but direct emitter regression coverage keeps the
  writer from hiding malformed PptxPackageModel support parts behind writer-local defaults.
- Media copy and render-time media failure handling have moved under the PPTX writer composite as
  well. The internal `writers/pptx/media` module owns media part payload lookup, Asset Artifact byte
  access, data URI decoding, and `E_RENDER_MEDIA_LOAD_FAILED` diagnostics for media sources that
  require a loader. Media writer helpers now reject malformed media payload sources instead of
  treating them as missing bytes, keeping media topology errors attached to PptxPackageModel payload
  shape rather than to a later byte-copy failure.
- PPTX projection internals now have a candidate-reading Module,
  `projection/pptx/package-candidates`, for broad record and payload guards used by validation and
  inspection. The public validation Interface remains `validatePptxPackageModel()`, but the
  Implementation no longer keeps the first candidate payload readers inside the large package
  consistency composite.
- The v0.8 public surface review now records the candidate/known package part type policy:
  `PptxPackagePart` preserves malformed snapshots for diagnostics, while valid payload-bearing
  package parts are read through `PptxKnownPackagePart`, exact part aliases, and public
  `isPptx*Part()` guards. Type tests cover broad-part narrowing so ordinary inspection callers do not
  need `as`, `Record<string, unknown>`, or `as unknown as` to read valid payloads.
- Assembly Plan construction has moved under the PPTX writer composite. The internal
  `writers/pptx/assembly` module owns expected-entry creation from Pptx Package Model part metadata,
  final-entry wrapping, summary counters, required-entry diagnostics, and ZIP entry projection from
  the successful plan. The main writer remains the orchestrator for package validation, part byte
  emission, Build Artifact reuse, and final ZIP assembly.
- Build Artifact reuse and invalidation policy has moved under the PPTX writer composite. The
  internal `writers/pptx/build` module owns writer/emitter fingerprints, fallback part
  fingerprinting, media byte fingerprints, reuse/rebuild reasons, and Pptx Package Build Artifact
  construction with build notes. A tiny `writers/pptx/package-part` helper owns shared package-part
  metadata access, such as stable order keys, so Assembly Plan and Build Artifact logic do not import
  each other.
- Build Artifact creation now requires projected package part order keys and package part
  fingerprints instead of sorting by package path or recomputing a writer-local fallback
  fingerprint. Validation still rejects missing metadata before Render, while the writer/build seam
  keeps HMR-critical package identity data owned by PptxPackageModel.
- Part emission dispatch has moved under the PPTX writer composite. The internal `writers/pptx/emit`
  module owns package-part kind to byte-emitter routing for content types, relationships,
  presentation support parts, document properties, theme/master/layout parts, and slide parts.
- Presentation and slide-master support XML now consumes relationship ids from projected
  relationship parts instead of reconstructing `rId` values from slide or layout positions. This
  keeps support XML emission aligned with the Pptx Package Model and prevents the writer from
  inventing package relationships that Project did not assign. The same emitters now reject missing
  projected relationship ids for presentation slide masters/slides and slide-master layouts instead
  of emitting support XML with omitted `r:id` attributes.
- Presentation and slide-master support payloads now also carry the serialized numeric ids emitted
  as `p:sldMasterId/@id` and `p:sldLayoutId/@id`. Project assigns the default PPTX numeric id
  sequence, package validation checks range, duplication, and part-id alignment before Render, and
  the support XML writer consumes those payload fields instead of hardcoding `2147483648 + n`
  locally. This keeps future multi-master/layout support and sandbox `defineProjection()` edits from
  losing OOXML-visible support identities during emission.
- Relationship ids are committed package identity fields, not writer-local strings. Package
  consistency validation now requires relationship ids to be XML ID-safe ASCII identifiers before
  relationship XML emission, and the relationship XML emitter also rejects invalid ids when called
  directly. This keeps sandbox `defineProjection()` edits from producing `.rels` files with invalid
  `Id` attributes while still allowing deterministic ids such as `rId1` and remapped ids such as
  `rIdModelMaster`.
- Relationship records now carry both `targetPath`, the canonical target package part path used for
  topology validation, and `target`, the exact OOXML `.rels` `Target` attribute emitted by the
  writer. Project computes relative internal relationship targets and external URL targets during
  projection, package validation rejects mismatches before Render, and relationship XML emission no
  longer computes relative paths from owner paths. This keeps emitted package topology visible in
  PptxPackageModel snapshots instead of hiding it behind writer-local path arithmetic.
- Bullet list markers now carry their projected Unicode code point in `TextStyleIR.list.characterCode`
  for every bullet style, including the default CSS-like `disc` marker. Text XML emission no longer
  substitutes `•` when the marker is missing; missing or invalid marker values are treated as broken
  projected drawing payloads. This keeps list rendering intent visible in PptxPackageModel instead
  of leaving the default marker hidden inside the writer.
- Image and background-image drawing payloads now carry projected `objectPosition` values in
  PptxPackageModel, including the CSS-like default center position `{ x: 0.5, y: 0.5 }`. Projection
  computes this value for ordinary images and background image layers before Render, Project
  Inspection Summary exposes it, package validation rejects missing values, and `picture-xml` no
  longer substitutes a writer-local center fallback. This keeps image source-rectangle, crop, tiling,
  and future sandbox edits tied to model data rather than hidden XML-emission defaults.
- Text body root values are also projected model data rather than writer defaults. `PptxTextElement`
  root styles now require `style.fit`, `style.textDirection`, `style.verticalAlign`, and
  `style.wrap`, with CSS-like defaults resolving to `fit: "none"`, `textDirection: "horz"`,
  `verticalAlign: "top"`, and `wrap: true` before Render. Run-level text styles may still omit these
  fields because they describe inline decoration rather than the text body. Package validation
  rejects missing root text-body values, and `text-xml` no longer treats omitted values as OOXML body
  defaults such as `wrap="square"` or omitted vertical anchor/direction/fit. This keeps text-body
  layout intent visible to PptxPackageModel inspection and sandbox edits.
- Underline serialization values are projected model data rather than writer defaults as well. When
  authors set `underline: true` without a decoration style, projection stores the PowerPoint
  single-underline value as `underlineStyle: "sng"` on the relevant text style. Package validation
  rejects underlined root or run styles that omit `underlineStyle`, and `text-xml` no longer supplies
  `sng` as a writer-local fallback.
- Slide drawing XML emission has moved under the PPTX writer composite. The internal
  `writers/pptx/slide-xml` module owns slide-part skeleton, shape-tree setup, drawing traversal, and
  slide XML namespace/root serialization. The main writer entry point is now focused on package
  validation, Render Assembly Plan orchestration, Build Artifact reuse, and ZIP assembly.
- Shape drawing XML emission has moved under the PPTX writer composite. The internal
  `writers/pptx/shape-xml` module owns shape, text-box, image, and group drawing-node dispatch,
  inherited opacity composition, generated layer calls, shape property calls, text body calls,
  picture calls, and recursive group children emission.
- Generated drawing-layer emission has moved under the PPTX writer composite. The internal
  `writers/pptx/drawing-layer-xml` module owns generated outline/edge stroke emission, background
  layer routing, and the conversion from projected solid/gradient background layers into synthetic
  shape emission callbacks while delegating background-image tiles to `picture-xml`.
- Shared drawing-property XML emission has moved under the PPTX writer composite as well. The
  internal `writers/pptx/drawing-xml` module owns concrete drawing serialization helpers for colors,
  fills, strokes, shadows, transforms, non-visual properties, hyperlinks, and shape properties.
  `slide-xml` consumes those helpers instead of carrying low-level paint/effect/property emitters
  inline, keeping slide emission focused on slide structure and drawing-node dispatch.
- Drawing-property XML helpers now reject missing projected frame and color values instead of
  defaulting frame coordinates to `0` or colors to white inside the writer. Presentation support XML
  likewise rejects missing projected slide size values instead of emitting zero-sized support XML.
  Non-visual drawing helpers also reject missing, non-positive, non-canonical, or writer-unsafe
  serialized shape object ids instead of inventing fallback OOXML object ids or accepting values that
  only parse partially. The writer-safe domain leaves room for the emitted OOXML `cNvPr id` value,
  which is derived as `shapeObjectId + 1`. Package validation remains the primary pre-render guard,
  and these writer-level checks keep direct emitter use from hiding malformed PptxPackageModel
  drawing/support payloads.
- Picture XML emission has also moved under the PPTX writer composite. The internal
  `writers/pptx/picture-xml` module owns image relationship lookup from projected media topology,
  projected intrinsic image-size lookup, image crop/source-rectangle calculation, background image
  tiling, and picture/background-picture XML emission. SVG data URI dimension extraction now happens
  in the Project/media metadata path before Render, so `picture-xml` consumes projected
  `widthPx`/`heightPx` values instead of reparsing media bytes or SVG text inside the writer.
  `slide-xml` now consumes this helper instead of carrying media lookup and image fitting policy
  inline.
- Slide drawing XML emitters now reject missing or stale projected image and hyperlink relationship
  ids instead of silently omitting pictures, background-image tiles, or hyperlink markup. Package
  validation still reports these model errors before Render, while the writer-level guard keeps
  direct emitter use from hiding broken drawing payloads.
- Text XML emission has also moved under the PPTX writer composite. The internal
  `writers/pptx/text-xml` module owns text body, paragraph property, rich text run property,
  hyperlink, bullet/numbering, tab-stop, font, color, underline, baseline, wrap/direction, paragraph
  spacing, character spacing, text fit, vertical text-body alignment, text-body inset/padding, and
  CSS-to-PPTX paragraph alignment XML emission. `slide-xml` now consumes this helper instead of
  carrying rich-text OOXML details inline.
- Project now computes package part fingerprints and relationship-derived dependency fingerprints
  on Pptx Package Model parts. Render consumes those projected fingerprints when deciding whether a
  package-part Build Artifact can be reused.
- Package part dependency fingerprints now also include owner relationship parts. For example,
  `ppt/presentation.xml` depends on `ppt/_rels/presentation.xml.rels`, and slide master XML depends
  on its `.rels` part, because those XML payloads consume projected relationship ids even though the
  relationships are stored in separate package parts.
- PPTX projection identity and package-part fingerprint policy now have focused internal modules.
  `projection/pptx/identity` owns deterministic package part ids, element ids, serialized object ids,
  and relationship ids; `projection/pptx/fingerprint` owns stable JSON serialization and the
  non-cryptographic package-part fingerprint policy plus dependency fingerprint attachment. This
  keeps HMR/sandbox invalidation semantics visible without burying them inside graph-to-package
  projection traversal.
- PPTX package part ordering and requirement evaluation now have a focused internal module.
  `projection/pptx/package-parts` owns stable package part order keys, package part group ordering,
  relationship target extraction, and required/optional/conditional requirement evaluation. Project
  consumes this boundary before package part fingerprints are attached, and Render consumes the
  resulting model metadata through the Assembly Plan.
- PPTX package model types now have a focused internal module. `projection/pptx/model` owns
  `PptxPackageModel`, package part, relationship, drawing node, media payload, theme/layout support,
  manifest payload, and inspection summary type shapes. Projection, writer, validation, artifacts,
  and adapter type surfaces can import stable snapshots from this model node without depending on the
  main `projection/pptx` orchestration entry point.
- Public inspection types now treat `projection/pptx/model` as the source of truth for PPTX package
  payload vocabulary. Manifest helper modules may assemble content-type and relationship payloads,
  but the public `deckjsx/inspect` surface should not make those helper modules appear to own the
  package model shape. This prevents future HMR/sandbox tooling from depending on writer-adjacent
  helper boundaries instead of the projected document model.
- `deckjsx/inspect` now includes PPTX media payload and media metadata types as part of the
  PptxPackageModel inspection vocabulary. Root authoring and adapter entry points continue to reject
  those detailed PPTX payload types so media projection details stay out of ordinary authoring and
  adapter APIs.
- `deckjsx/inspect` now also exposes concrete PPTX drawing element types, projected measurement
  metadata, and empty support-part payload types that appear inside `PptxPackageModel`. Projection
  asset artifacts remain internal pipeline inputs rather than public inspection model types.
- Template Area placement is now preserved in projected PPTX drawing nodes through `layoutAnchor`
  metadata containing the Template name, Template Area name, and resolved anchor frame. Project
  Inspection Summary exposes the same anchor on element summaries. The anchor intentionally does not
  claim a source identity until graph Template Area references can distinguish authored content
  source from template-owner source.
- Implemented for the current v0.8.0 slice: Template Area Kind is connected to this same anchor
  path. `TemplateArea.kind` is an optional authoring-level hint, missing kind projects as `generic`,
  and `PptxLayoutAnchor` / Project Inspection Summary preserve the resulting kind without inferring
  it from the area name. This is the v0.8.0 connection point for future PPTX placeholder projection;
  richer placeholder serialization remains separate from the authoring kind.
- Implemented for the current v0.8.0 slice: templated slides now target template-derived slide
  layout parts instead of only the default blank layout. Those layout payloads preserve
  `layoutAnchors` with Template name, area name, Template Area Kind, resolved frame, and
  `placeholderStrategy: "none"`. This keeps deckjsx Template Area meaning inspectable in the
  PptxPackageModel while avoiding visible PowerPoint editing prompts or false body/title placeholder
  semantics.
- PPTX inspection summary construction now has a focused internal module. `projection/pptx/inspect`
  owns Project Inspection Summary shaping for package parts, media references, slide drawing element
  summaries, filtered `display: none` records, diagnostic summaries, and adapter limitation summaries.
  This keeps sandbox/debug views separate from graph-to-package projection traversal while preserving
  the existing `deckjsx/inspect` public type surface.
- PPTX CSS-like style projection helpers now have a focused internal module. `projection/pptx/style`
  owns resolved-style input selection, background/fill fallback probing, transform and shadow
  unsupported semantic preservation, and graph-wide unsupported semantic diagnostic construction.
  This keeps the main PptxPackageModel projection entry point focused on graph-to-package assembly
  rather than duplicating style fallback policy inside package orchestration.
- PPTX slide-part projection now has a focused internal module. `projection/pptx/slide` owns
  Semantic Author Graph or Projected Layout drawing-node conversion into `PptxSlidePart` payloads,
  including element identity, text run/style projection, frame calculation, image crop/object
  position projection, z-index ordering, partial-projection fallback behavior, and slide background
  projection. The main PptxPackageModel projection entry point now orchestrates support parts,
  slide parts, media topology, manifest assembly, order keys, requirements, and fingerprints.
- Project now marks package parts as required, optional, or conditional with requirement reasons.
  Render consumes that metadata in the Assembly Plan, and missing required or conditionally-required
  entries produce `E_RENDER_PACKAGE_ASSEMBLY_FAILED` instead of a writer-local interpretation.
- The required document property support now includes both structured `docProps/core.xml` metadata
  and `docProps/app.xml` extended properties, with content types, root relationships, deterministic
  output, and slide-count metadata emitted by the direct writer.
- Document property support payloads now identify editability and provenance. Core properties use
  `editable: true` with `source: "deckjsx-meta"` because they project Deck metadata, while extended
  properties use `editable: true` with `source: "deckjsx-projection"` because they project
  package-level slide/application facts.
- Slide master and slide layout relationship files are now first-class `relationships` package
  parts in the Pptx Package Model. The writer serializes those projected parts through the normal
  Assembly Plan instead of inventing `ppt/slideMasters/_rels/slideMaster1.xml.rels` and
  `ppt/slideLayouts/_rels/slideLayout1.xml.rels` as implicit ZIP entries.
- Slide parts now use `PptxSlideDrawing.children` as the canonical drawing order and preserve
  initial drawing-node metadata for emission target, paint order index, z-index input, sibling
  order, and generated layer role.
- Project Inspection Summary now exposes `filtered` records for graph content that projection
  intentionally omitted from drawing nodes. `display: none` content is reported with graph/source
  origin, slide/package context, semantic kind, text preview when available, and reason
  `displayNone`, while remaining outside Pptx Package Model drawing ownership.
- Overflow clipping now preserves projection metadata on layout and PPTX drawing nodes. Children
  clipped by an `overflow: hidden` ancestor retain their original frame, clip frame, visible frame,
  and clipping strategy so sandbox/HMR tooling can distinguish authored geometry from the visible
  PPTX frame.
- Theme, slide master, slide layout, view properties, and presentation properties support parts now
  use minimal structured payloads instead of generic placeholder payloads. The default Pptx Theme
  Part records theme projection identity, color scheme, font scheme, and format scheme data; slide
  master/layout payloads record their theme/master/layout relationships and editable support
  semantics.
- The direct writer now serializes theme, slide master, and slide layout XML from those structured
  support payloads and rejects malformed theme/master/layout support payloads instead of substituting
  bootstrap defaults inside the writer.
- The default Pptx Theme Projection now records a minimal trace. It lists required theme-support
  groups and property-level Theme default winners from resolved style provenance that were projected
  as concrete drawing properties, giving sandbox/HMR tools a bridge from deckjsx Theme Defaults to
  PPTX drawing output even before richer theme-reference serialization exists.
- Unsupported-but-nonbreaking CSS-like projection semantics now use warning diagnostics instead of
  blocking Project for representative paint/transform cases. Unsupported transform functions,
  multi-layer shadows, unsupported background repeat values, and unsupported gradient descriptors are
  preserved on affected layout/PPTX drawing nodes as `unsupportedSemantics` and reported through
  `W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC`, while the projection falls back to renderable geometry or
  omits only the unsupported paint effect.
- Group/container opacity compositing is also preserved as a nonblocking unsupported semantic when
  `opacity` is between `0` and `1`. The current direct writer cascades alpha to child drawing values
  instead of reproducing CSS subtree compositing exactly, so Project records the fallback on the
  affected Pptx Drawing Node and in diagnostics/summary rather than silently treating it as exact CSS
  behavior.
- Direct writer tests now assert deterministic PPTX byte output for equivalent cold renders with the
  same compression policy. This covers fixed ZIP metadata, Assembly Plan ordering, deterministic
  support parts, and document property stability at the public Render API level.
- Direct writer tests now also assert deterministic PPTX byte output when fixed data URI media is
  present in both image elements and background image layers. The test checks that media deduplication
  still produces the same media ZIP entry and media byte fingerprint source, so deterministic output
  coverage includes media relationships and media package parts, not only text/shape/support XML.
- Direct writer semantic package topology tests now compare emitted ZIP entries against the Render
  Assembly Plan and projected Pptx Package Model paths. They also verify projected content-type
  defaults/overrides, relationship ids and targets, repeated media reuse, and external hyperlink
  relationships in the generated package. This caught and fixed the root `_rels/.rels` target-base
  bug where root relationships were emitted as `../ppt/...` instead of package-root-relative
  `ppt/...`.
- Render tests now assert that changing only the semantic compression option reassembles ZIP bytes
  without invalidating otherwise matching package-part Build Artifacts. This keeps compression policy
  separate from uncompressed package-part byte reuse.
- Render now checks matching non-media package-part Build Artifacts before invoking XML/support
  emitters. Warm reuse can therefore skip package-part byte emission instead of only discarding newly
  emitted bytes after a fingerprint match. A regression test proves this by reusing a valid slide
  Build Artifact from a projection whose slide payload would fail if the slide emitter were invoked.
- Assembly Plan entries now include reuse/rebuild reasons for normal package parts, including
  `missingArtifact`, `partFingerprintChanged`, and `buildArtifactFingerprintMatched`, so warm-path
  and sandbox inspection can explain why a part was rebuilt or reused instead of reporting only the
  final status.
- Assembly Plan entries now preserve the compatibility `reason` string and also expose structured
  `reasonDetails` for reuse/rebuild/missing/failure cases. These details include matched build
  summaries, previous/current part fingerprints, dependency fingerprints, writer/emitter
  fingerprints, media byte fingerprints, package part identity/path/order-key deltas, and
  emitter-failure messages where applicable. This makes future HMR invalidation tooling able to read
  the exact rebuild cause without parsing reason strings.
- Pptx Package Build Artifacts now carry part-emitter fingerprints in addition to the global writer
  fingerprint. Render invalidates stale part bytes with `emitterFingerprintChanged`, which keeps the
  cache model ready for future slide XML, relationship XML, docProps, media-copy, and theme emitter
  versioning without forcing every writer change to rebuild every package part forever.
- Document-property Build Artifacts now record emitter fingerprints at the actual core/app emitter
  granularity instead of the coarser `document-properties` package-part kind. This keeps future
  `docProps/app.xml` emitter changes from invalidating reusable `docProps/core.xml` bytes, and vice
  versa, while preserving the same package-model part kind.
- Relationship Build Artifacts now record emitter fingerprints by relationship owner path family:
  package root, presentation, slide, slide master, slide layout, and a generic fallback. Relationship
  parts share the same package-model kind, but their target-base semantics differ by owner path, so
  this avoids invalidating every `.rels` part when only one owner-family emission policy changes.
- Pptx Package Build Artifact reuse now validates the artifact identity stored inside the artifact,
  not only the reuse-map key. If the map points a package part id at bytes whose
  `packagePartId` belongs to another part, Render rebuilds that entry with
  `packagePartIdChanged`. This keeps HMR/sandbox artifact exchange from accidentally reusing bytes
  across package parts that happen to share compatible path, order, and fingerprint metadata.
- Render tests now also assert media-byte fingerprint invalidation. A stale media Build Artifact with
  matching Package Part Identity, path, order key, package fingerprint, dependency fingerprints, and
  writer/emitter fingerprints is still rebuilt with `mediaBytesChanged` when its stored media byte
  fingerprint no longer matches the bytes available to Render.
- Media Build Artifact reuse now uses trusted projected media metadata hashes when available. If a
  media package part carries `metadata.hash`, Render can prove a matching media Build Artifact before
  loading bytes, so loader `load()` and media byte copying are skipped on the warm path. Media without
  a trusted projected hash still falls back to byte fingerprinting after bytes are available.
- Missing required Assembly Plan entries now report `E_RENDER_PACKAGE_ASSEMBLY_FAILED` with entry
  path labels plus notes containing package part identity, evaluated requirement, required flag, and
  missing reason. This keeps the diagnostic code taxonomy small while preserving enough detail for
  sandbox and HMR inspection.
- Missing required media entries now also preserve the media-load diagnostic produced by the direct
  writer media boundary, such as `E_RENDER_MEDIA_LOAD_FAILED`, alongside the Assembly Plan failure.
  This keeps the package-entry explanation and the underlying data-acquisition failure visible
  without turning optional media entries into render-blocking errors.
- Missing optional Assembly Plan entries now remain non-blocking. Render keeps the missing optional
  entry in `summary.assembly.entries`, increments `missingCount`, omits the ZIP entry and reusable
  Build Artifact, and still returns the PPTX artifact when all required entries are available.
- Assembly Plan entries now distinguish `missing` from `failed`. A part emitter failure is recorded
  as a failed entry with `partEmitterFailed` or `mediaEmitterFailed`, an optional failure message,
  and a `failedCount` in the Render summary. Failed required entries use the same
  `E_RENDER_PACKAGE_ASSEMBLY_FAILED` family and do not create reusable Build Artifacts.
- Pipeline runner tests now assert successful package-part Build Artifacts survive an overall Render
  failure caused by path-output side effects. A failed path output render can still collect artifact
  bytes, materialize package-part Build Artifacts into the Pipeline Artifact Collection, and reuse
  those parts on the next warm render after the side-effect failure is removed.
- Pipeline Artifact Collection invalidation now clears package-part Build Artifacts when source,
  graph, projection, or asset artifacts are explicitly invalidated. `defineProjection()` /
  `replaceProjectionArtifact()` keeps existing Asset Artifacts and Build Artifacts so Render can
  reuse matching package parts against the defined projection, while stale or mismatched artifacts
  still rebuild through the normal fingerprint checks. This prevents stale package parts from
  lingering across upstream edits while preserving reuse across deliberate projection edits and
  downstream output side-effect failures.
- The direct writer now runs lightweight Pptx Package Model consistency validation before building
  package-part bytes. Direct writer calls that receive an invalid or stale defined projection return
  `E_RENDER_PACKAGE_VALIDATION_FAILED` with the underlying package-validation codes preserved in
  notes, an empty Assembly Plan summary, and no final artifact.
- ZIP source failures after Assembly Plan validation, such as fflate filename or emission errors, are
  also reported through `E_RENDER_PACKAGE_ASSEMBLY_FAILED` instead of escaping as thrown writer
  exceptions. The Render Result keeps the Assembly Plan summary and omits the final artifact.
- Path-output side-effect failures now use the `E_RENDER_OUTPUT_WRITE_FAILED` diagnostic family,
  preserving generated artifact bytes while making the failed output side effect render-blocking via
  `RenderResult.ok`.
- Path-output runtime unavailability now uses the same `E_RENDER_OUTPUT_WRITE_FAILED` diagnostic
  family with `reason=runtimeOutputUnavailable` and `runtimeReason=nodeRuntimeUnavailable`, preserving
  generated artifact bytes while omitting written output metadata.
- A local PPTX writer hot-path benchmark now exists at `scripts/benchmark-pptx-writer.tsx`, exposed
  through `bun run benchmark:pptx`. It measures representative minimal, text-heavy, image-heavy,
  template/layout, and mixed CSS-like paint fixtures across Project, warm Project cache, cold direct
  writer, ZIP assembly, warm Build Artifact reuse, and path-output render paths. It records loose
  baseline budgets in the benchmark file, reports ZIP entry counts, reports first-project and
  warm-project asset probe/load call counts, reports warm Assembly Plan reused/rebuilt/missing/failed
  counts, and does not require PowerPoint, LibreOffice, or GUI tooling.
- The benchmark now separates default Project summary cost from the no-inspection Project hot path.
  The `projectSummary` metric measures the default inspection summary path, while the `project`
  metric uses `deck.project({ inspection: "none" })`; warm Project cache checks also use
  no-inspection Project so asset and projection reuse are measured without summary materialization
  noise.
- Project Inspection Summary now aggregates unsupported CSS-like semantics observed on projected
  drawing nodes. Each record keeps the unsupported feature/property/value/reason plus slide,
  package-part, element, origin, emission target, and paint-order context, so sandbox/HMR tooling can
  enumerate projection fidelity gaps without walking every Pptx Drawing Node itself.
- Project Inspection Element summaries now expose projected `emissionTarget`, `paintOrderIndex`,
  `paintOrder`, and `visibility` where available. This keeps z-index, generated layer role, sibling
  order, and visibility state observable from the Inspection Interface rather than requiring
  sandbox tooling to reinterpret writer order.
- Project Inspection Element summaries now also expose projected `edgeStrokes`, `outline`, and
  `generatedStrokes` where available. This keeps CSS-like border/outline semantic inputs and the
  writer-consumed generated stroke layer plan observable without exposing XML emitter internals.
- The first detail-gated Derived Projection Inspection View now exists behind
  `project({ inspection: "details" })`. `ProjectInspectionSummary.details.composedPaintOrder`
  flattens each slide's slide-level background layers, element-owned generated background layers,
  drawing-node, and generated-stroke order, including nested group children, generated
  border/outline layers, parent element ids, depth, sibling paths, generated layer indexes,
  paint-order inputs, visibility, layout anchors, and origin metadata. The same detail gate also exposes
  `ProjectInspectionSummary.details.effectiveProjectedStyles`, a flat per-slide view of projected
  drawing values such as frames, measurement, clipping, fill/stroke, text style, image source,
  unsupported semantic fallbacks, paint-order metadata, layout anchors, and origin. The default
  `summary` path does not build these derived views.
- The same detail gate also exposes
  `ProjectInspectionSummary.details.packageDependencyInvalidation`, a byte-free package-part view
  that groups each part's package dependencies, dependents, dependency reasons, requirement,
  order-key, fingerprint, and dependency-fingerprint count. This keeps HMR/sandbox invalidation
  tooling from having to rebuild inverse dependency maps from the flat summary edge list on hot
  paths where detailed inspection is explicitly requested.
- The detail gate now also exposes
  `ProjectInspectionSummary.details.paintFallbackAggregation`, a byte-free aggregation of projected
  unsupported CSS-like paint/compositing semantics by feature, property, and fallback strategy. Each
  entry records counts, affected slides/elements, element kinds, values, preserved semantics,
  missing rendering capabilities, reasons, and indexes back into the flat unsupported semantic
  summary. This preserves future-facing CSS-like rendering intent without making default Project
  summaries pay for rollups.
- The detail gate now also exposes
  `ProjectInspectionSummary.details.themeProjections`, a byte-free theme-part provenance view. It
  lists each theme part's projection id, purpose, source, scheme names, whole-theme mappings,
  value-group fingerprints, support mappings, Theme Default decisions, concrete drawing mappings,
  unprojected mappings, effective inheritance links, and reference-serialization choices. This makes
  deckjsx Theme -> PPTX Theme Projection -> drawing/default decisions inspectable without requiring
  sandbox tooling to scan every package part payload.
- Remaining model rewrite work still includes richer projected drawing-node types, deeper Theme
  Projection provenance, deeper Assembly Plan status/reason coverage for future partial-render
  workflows, and deeper byte/chunk XML emission for any future support-part payloads that need richer
  structured emitters.

Current public/performance review findings:

- Package exports should stay intentionally small: `deckjsx` for the Authoring Interface,
  `deckjsx/adapter` for writer adapter factories and public adapter option/result types, and
  `deckjsx/inspect` for detailed graph/projection inspection types. Additional package entry points
  should be treated as new public interfaces and require the same review discipline.
- The root `deckjsx` export may include `AssetLoader` and related authoring/resource-boundary types
  because authors configure loaders through `deck.useAssets(loader)`. It should not export
  `PptxPackageModel`, drawing-node model types, Build Artifact types, byte writer helpers, ZIP
  helpers, fflate-specific settings, sink implementations, or projection internals.
- Root stage-result types may include byte-free summary DTOs that are directly reachable from
  `ProjectResult` or `RenderResult`, such as package assembly summaries and build/reuse explanation
  summaries. These summaries are public result contracts only when they contain stable diagnostic
  facts, ids, fingerprints, statuses, and reasons. They must not expose Build Artifact storage
  shapes, sink topology, XML emitter state, media bytes, or fflate configuration by becoming
  convenient aliases for writer internals.
- `deckjsx/adapter` exposes `pptx()`, `PptxRenderOptions`, `WriterAdapter`, and public adapter
  result types. `WriterRenderContext` is intentionally opaque to public adapter authors, so internal
  `AssetArtifact` and `PptxPackageBuildArtifact` storage shapes do not become adapter-author
  contract by accident.
- `deckjsx/inspect` is the right place for detailed `PptxPackageModel`, package part requirement,
  dependency fingerprint, paint-order, drawing-node, and projection summary types. Derived views that
  are expensive to compute should remain inspection/detail-level data, not mandatory root exports.
- The writer split is moving in the right direction for performance: ZIP policy is isolated behind
  `writers/pptx/zip`, Node path output is isolated behind `runtime/node-output`, and the byte/chunk
  XML writer is now used for package metadata parts and slide drawing object traversal.
- The largest raw-fragment XML performance risk has been reduced for the primary package, support,
  and slide XML emitters. Direct writer tests now guard that `package-xml`, `support-xml`, and
  `slide-xml` do not call `XmlChunkWriter.raw()` directly; future raw fragment use should be a
  deliberate XML-writer-level concern rather than ordinary PPTX emission style.
- Build Artifact reuse, Assembly Plan ordering, and per-entry compression are now meaningful enough
  to support warm-path tests, but the public API must not expose a streaming ZIP mode toggle.
  Streaming-first ZIP is an internal writer strategy; callers receive artifact bytes and optional
  output side effects.
- Render Assembly Plan summaries are the allowed public/debug view of writer assembly state. They
  should stay byte-free, deterministic, and bounded to the explanation needed for diagnostics,
  sandbox/HMR invalidation, and regression review: package part identity, package path, requirement
  classification, status, reuse/rebuild reason, compression mode, current build fingerprint summary,
  and previous build fingerprint summary when a stale artifact was considered.
- Public seam type tests now cover the root Authoring Interface, the Adapter Interface, and the
  Inspection Interface. They fail if writer internals, ZIP helpers, XML helpers, or Build Artifacts
  leak through root/adapter/inspect, and they positively assert that `deckjsx/inspect` carries
  PptxPackageModel, package requirement, dependency fingerprint, paint-order, emission-target,
  relationship, drawing, and projection summary vocabulary.
- Public/performance review identified projection-locality risk in the main `src/projection/pptx/index.ts`
  entry point, and the current slice has addressed the first boundary split. `src/projection/pptx/index.ts`
  is now a thin compatibility barrel. Project orchestration lives in
  `src/projection/pptx/project.ts`, drawing traversal/reconstruction sits behind a focused Pptx
  Drawing Projection helper boundary, and media allocation, media part creation, background/image
  traversal, canonical image media part assignment, media package part merging, and slide
  relationship attachment sit behind a focused Pptx Media Projection helper boundary. HMR/sandbox
  invalidation can now reason by drawing, media, model, validation, and project responsibility
  instead of by one large projection file.
- Default support package part creation has also moved out of the main PPTX projection entry point.
  `src/projection/pptx/support.ts` now owns the default content-types/root-relationship seeds,
  presentation support part, document properties, default theme part, default slide master/layout
  parts, and their relationship parts. This keeps required support topology and default theme/master
  policy Project-owned without making the graph-to-package orchestration function carry every
  support payload literal inline.
- Media/assets validation has been deepened along the public/performance review boundary.
  `src/projection/pptx/media.ts` remains the Project-owned place for media source keys, allocation
  identity, metadata projection, media part creation, and relationship attachment.
  `src/writers/pptx/media.ts` remains the Render-owned place for Asset Artifact byte lookup, data URI
  decoding, and media-load diagnostics. Package consistency validation now checks media part path
  extension, manifest content type, payload metadata, source/sources, element/asset ids, and
  allocation key consistency without moving bytes into PptxPackageModel.
- Package dependency validation now rejects self-referential package dependencies for the same
  dependency reasons exposed by Project Inspection Summary and Pipeline Artifact snapshots:
  relationship targets, content-type overrides, dependency fingerprints, and requirement
  dependencies. This keeps malformed defined projections from silently disappearing from the
  cross-part dependency graph that sandbox/HMR tooling uses for invalidation explanations.
- Regression coverage must track the public/performance boundary as well as package validity. The
  pinned pptxgenjs oracle is allowed to use a workflow-local dependency because it is not part of the
  runtime package, and it now observes hyperlink, image, paint-order, rich-text, effects, and
  crop/source-rectangle signals. `.github/render/verify-render.tsx` remains the deckjsx-owned release-gate
  fixture path and should mirror those same semantic classes where practical so CI can catch
  regressions without treating pptxgenjs as the source of the implementation.

v0.8.0 implementation backlog from the current design checkpoint:

- Project inspection summaries:
  - Implemented: explicit Filtered Projection Records exist on Project Inspection Summary.
    `display: none`
    graph content must not become Pptx Drawing Nodes, but the summary should report the filtered
    graph/source origin, slide/package context, semantic kind, text preview when available, and
    reason such as `displayNone`.
  - Keep filtered records out of Pptx Package Model drawing ownership. The current implementation
    derives them from graph/resolved-style inputs during summary construction rather than storing
    them as package content.
  - Implemented: unsupported CSS-like paint semantics already stored on affected Pptx Drawing Nodes
    are aggregated into Project Inspection Summary records with feature/property/value/reason,
    package, slide, element, origin, emission-target, and paint-order context.
  - Implemented: projection-wide unsupported CSS-like semantics that do not have an affected drawing
    node, such as unsupported transform semantics on `display: none` content, are still reported as
    warning diagnostics while the filtered content remains outside Pptx Package Model drawing
    ownership.
- CSS-like drawing semantics:
  - Continue replacing legacy element payloads with richer Pptx Drawing Node fields for fill,
    stroke, generated background/border/outline layers, opacity/transparency, transform, clipping,
    image crop/source rect, hyperlinks, text body, typography, effects, and fallback reasons.
  - Implemented for the current v0.8.0 slice: shape `stroke` accepts simple CSS-like shorthand such
    as `"1pt solid #2563EB"` or `"1.5pt dashed #1D4ED8"` and projects it into concrete
    PptxPackageModel stroke color, width, and style fields during normalization/projection. Explicit
    `strokeWidth`, `borderColor`, `borderWidth`, and `borderStyle` inputs still take precedence, and
    unsupported stroke details continue to use structured fallback warnings instead of forcing the
    writer to reinterpret authored CSS-like strings.
  - Implemented for the current v0.8.0 slice: dashed stroke, border, side-border, and outline
    shorthand now project to structured `dashType: "dash"` stroke payloads. Direct slide XML emission
    consumes the projected preset dash value instead of deriving it from `stroke.style`, and package
    validation rejects `style: "dash"` strokes that do not carry `dashType`. This keeps dashed
    border/stroke shorthand visible in PptxPackageModel and prevents writer-local dash defaults from
    hiding malformed sandbox projections.
  - Implemented for the current v0.8.0 slice: CSS-like dotted stroke, border, side-border, and
    outline shorthand now project to structured `dashType: "sysDot"` stroke payloads instead of
    falling back as unsupported paint semantics. The direct writer emits the same PPTX preset dash,
    so dotted authoring intent survives both PptxPackageModel inspection and OOXML generation.
  - Implemented for the current v0.8.0 slice: projected `radiusEmu` values for View/Text/rect Shape
    nodes now serialize as PPTX `roundRect` preset geometry with deterministic adjustment guides.
    This keeps CSS-like `borderRadius` / shape `radius` from remaining inspection-only metadata after
    PptxPackageModel projection. Package consistency validation and direct emitter checks now require
    `radiusEmu` to be finite and non-negative, so malformed sandbox projections cannot silently
    collapse rounded geometry back to a plain rectangle.
  - Preserve z-index input, graph/layout sibling order, generated layer role, layout-anchor relation,
    visibility state, and final `paintOrderIndex` as distinct data. The goal is not perfect CSS
    rendering in v0.8.0, but the projection must not crush these meanings into writer-local order.
  - Implemented: Project Inspection Element summaries expose projected emission target,
    `paintOrderIndex`, paint-order inputs, and visibility state so inspection/debug views can observe
    CSS-like stacking inputs without depending on writer XML order.
  - Implemented for the current v0.8.0 slice: Project Inspection Element summaries and resolved
    values expose projected `edgeStrokes`, `outline`, and `generatedStrokes`, so sandbox/HMR tools
    can inspect generated border/outline layer plans from the public Inspection Interface instead of
    reverse-engineering generated shape XML.
  - Implemented for the current v0.8.0 slice: the detail-gated composed paint-order view now includes
    generated border/outline stroke entries as `source: "generatedStroke"` records with the
    generated layer payload, generated layer index, frame, and paint-order inputs. This keeps
    generated CSS-like paint layers visible in ordered inspection without exposing XML emitter
    internals.
  - Implemented for the current v0.8.0 slice: the same composed paint-order view now includes
    element-owned generated background layer entries as `source: "backgroundLayer"` records with the
    owning element, background layer summary, background layer index, frame, and background
    paint-order input. This mirrors the direct writer's element background-before-self ordering for
    sandbox/HMR inspection.
  - Implemented: projected layout nodes and Pptx Drawing Nodes now preserve projected sibling order
    separately from final z-index-sorted paint order. `zIndex` decides stacking first, while
    `siblingOrder` remains the tie breaker and explanation input for sandbox/HMR tooling.
  - Keep `visibility: hidden` as projected drawing nodes with visibility state, distinct from
    filtered `display: none` records.
  - Implemented: `overflow: hidden` clipping metadata is preserved as original frame, clip frame,
    visible frame, and clipping strategy on affected projected layout/PPTX drawing nodes.
  - Implemented: group/container `opacity` compositing fallback is aggregated into Project warning
    diagnostics and Project Inspection Summary records while preserving the projected opacity value
    on the affected drawing node.
  - Implemented: non-group drawing nodes with `opacity < 1` now record an
    `opacity`/`stackingContext` warning. Text, image, and shape nodes preserve their concrete
    projected opacity while Project records that v0.8 does not yet evaluate the complete CSS
    stacking-context subtree created by opacity.
  - Implemented for the current v0.8.0 slice: package consistency validation now treats projected
    alpha inputs as concrete domains instead of writer-clamped hints. Drawing-node `opacity` and
    shadow `opacity` must be finite `0..1` values, while fill/stroke/image/background/gradient
    `transparency` must be finite `0..100` percent values before Render.
  - Implemented: `overflow: hidden` clipping combined with projected rotation/flip is aggregated into
    Project warning diagnostics and Project Inspection Summary records. Affected drawing nodes keep
    the axis-aligned clipping metadata plus projected transform values, while the warning records
    that exact CSS transformed clipping may require a transformed clip mask.
  - Implemented: clipped image source-rectangle fallbacks combined with projected rotation/flip are
    also aggregated as `clipping` warnings. Image nodes preserve their `sourceFrame`, `crop`,
    `objectPosition`, `fit`, `clip`, and transform fields, while Project records that v0.8 folds
    axis-aligned clipping into the PPTX image source rectangle before applying transform.
  - Implemented for the current v0.8.0 slice: package consistency validation now treats image
    drawing `sourceFrame` as concrete picture-emission input and requires positive finite width and
    height before Render. This keeps malformed sandbox/defined projections from reaching image
    source-rectangle XML emission with invalid dimensions.
  - Implemented for the current v0.8.0 slice: package consistency validation now treats projected
    image `crop` as normalized source-rectangle ratios. Each edge must be a finite `0..1` value, and
    left+right or top+bottom must leave positive source area, matching the authoring crop semantics
    before picture XML emission.
  - Implemented: transformed layout containers now record a `transform`/`stackingContext` warning.
    Group nodes preserve the projected transform and paint-order inputs, while Project records that
    v0.8 does not yet evaluate the complete CSS stacking-context subtree created by `transform`.
  - Implemented: authoring style accepts CSS-like `filter`, `mixBlendMode`, and `isolation` inputs
    on frame-bearing elements. v0.8.0 records non-default values as nonblocking unsupported paint or
    compositing semantics on affected drawing nodes and in Project diagnostics/summary, preserving
    the connection point without claiming the current PPTX writer can reproduce those effects.
  - Implemented for the current v0.8.0 slice: observed transform/compositing fallback aggregation now
    carries explicit fallback strategy metadata in Pptx Package Model unsupported semantics,
    diagnostics, and Project Inspection Summary records. Filter, blend, isolation, opacity-created
    compositing contexts, transform-created stacking contexts, transformed clipping, and image
    source-rect clipping fallbacks record which projected/authored values are preserved and which
    CSS-like behavior is still missing.
  - Implemented for the current v0.8.0 slice: package consistency validation now checks unsupported
    semantic fallback payloads before Render. Unknown unsupported features, unknown fallback
    strategies, non-object semantic records, missing property/value/reason fields, empty
    preserved/missing fallback lists, and malformed preserved/missing fallback entries become
    `E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC` diagnostics instead of reaching XML emission.
  - Deliberately post-v0.8: implement the heavier rendering strategies for those warnings, such as
    real PPTX groups, vector masks, rasterized subtrees, blend/isolation emulation, or cross-output
    stacking-context evaluation. v0.8.0 must keep the connection points and warnings, not silently
    flatten the meanings away.
- Theme, layout, and support parts:
  - Implemented: default Pptx Theme Projection, Pptx Theme Part, slide master, slide layout, view
    properties, and presentation properties now have minimal structured payloads instead of generic
    placeholders.
  - Implemented: default Pptx Theme Projection trace records theme-support groups and property-level
    Theme default winners that projected as concrete drawing properties.
  - Implemented for the current v0.8.0 slice: Pptx Theme Projection trace records whole-theme
    mapping summaries and value-group fingerprints for color scheme, font scheme, format scheme, and
    Theme Defaults. The Theme Defaults fingerprint changes when Theme-derived concrete drawing
    mappings change, while default support-group fingerprints remain stable.
  - Implemented for the current v0.8.0 slice: Theme Default values that remain resolved-style inputs
    but are not projected into PPTX theme support or concrete drawing-property mappings are recorded
    as `unprojected` Theme Projection trace entries with graph node, default key, property, resolved
    value, and reason. Non-default filter, blend-mode, and isolation Theme Defaults also produce
    nonblocking `W_PROJECT_UNPROJECTED_PPTX_THEME_DEFAULT` diagnostics.
  - Implemented for the current v0.8.0 slice: Theme Projection trace records effective inheritance
    links for Theme Default winners and unprojected Theme mappings. Each link preserves graph node,
    default key, property, resolved value, projection decision, and the known PPTX package chain
    through theme part, slide master, slide layout, slide part, and drawing value.
  - Implemented for the current v0.8.0 slice: Theme Projection trace records theme-reference
    serialization choices for Theme Default concrete drawing properties. Color and font defaults
    preserve their current writer serialization (`srgbClr` or `latinTypeface`), the decision to emit
    concrete values in v0.8, and any matching PPTX scheme-color or font-scheme candidate such as
    `accent1` or `minorLatin`.
  - Implemented for the current v0.8.0 slice: Theme Projection trace records
    `defaultStyleDecisions` for Theme Default winners, classifying each resolved property as a
    concrete drawing property, drawing metadata, layout input, filtered projection input, style
    input, or unsupported semantic fallback. `concreteDrawingProperties` now stays scoped to
    properties that actually project as concrete drawing values instead of swallowing layout or
    paint-order metadata.
  - Remaining: expand the decision vocabulary only when new authoring properties or richer output
    inheritance destinations require it.
  - Preserve the possibility of multiple PPTX theme parts even if v0.8.0 emits one default theme
    part. Theme projection identity should keep source/origin and projected purpose so future
    mounted-source, imported-template, or master-specific themes fit the same model.
  - Implemented for the current v0.8.0 slice: explicit Template Area Kind authoring and projection
    metadata exists. The root authoring surface accepts a narrow kind vocabulary on `TemplateArea`,
    template validation rejects unknown kinds, projection defaults missing kinds to `generic`, and
    `PptxLayoutAnchor.kind` preserves that authoring-level kind for inspection, diagnostics, HMR
    dependency explanations, and future placeholder projection.
  - Implemented for the current v0.8.0 slice: template-derived Slide Layout Parts preserve
    `layoutAnchors` for Template Areas. Generic areas remain generic anchors with
    `placeholderStrategy: "none"`, and templated slides relate to their template-derived layout part.
  - Deliberately post-v0.8: richer PPTX placeholder projection/fallback behavior, source-local
    layout identity deepening, and layout-anchor fingerprint dependencies beyond the basic
    authoring-kind/frame anchor connection. v0.8.0 should keep the data connection without pretending
    generic anchors are title/body/picture placeholders.
- Asset and media pipeline:
  - Resolved: `AssetLoader` probe results may provide non-empty `mediaType`, `extension`, and
    `hash`, positive finite `width`/`height`, finite non-negative `byteLength`, and diagnostics.
    Load results use the same metadata shape and must also provide `bytes: Uint8Array`.
    Invalid probe/load result fields are reported as `E_PROJECT_ASSET_PROBE_INVALID` or
    `E_RENDER_ASSET_LOAD_INVALID` at the asset boundary.
  - Resolved: the built-in multi-runtime asset boundary now probes PNG, GIF, JPEG, and SVG
    dimensions for data sources, byte sources, and absolute URL-like sources during Project. URL
    probing may fetch the resource to compute metadata, but only metadata is copied into
    PptxPackageModel. When built-in probing already obtained bytes, those bytes are cached only in
    Asset Artifacts so Render can emit media without fetching the same source again.
  - Resolved: media part allocation uses a projected Media Allocation Key. Loader-provided content
    hashes share a media part across authored sources with the same bytes; sources without hashes
    share a media part by resolver scope plus Authored Media Source. Package paths remain
    deterministic first-use names such as `ppt/media/media1.png`.
  - Resolved: loader composition order is registered loaders first, in `deck.useAssets()` call order,
    followed by the built-in boundary. The first successful Project probe owns the resolver scope,
    and Render loads from that same resolver scope.
  - Keep filesystem paths, app-public relative URLs, authenticated URLs, and framework-specific
    resolution outside core behind loaders. Core built-ins remain data/bytes and absolute
    `http:`/`https:` URL handling when runtime `fetch` exists.
  - Implemented: benchmarks and tests cover repeated-source probe/load cache hits, failed
    probe/load diagnostics, resolver-scope reuse, media-byte fingerprint invalidation, and hashed
    media Build Artifact reuse that skips warm-path byte loading when projected metadata already
    proves the media bytes.
- Writer, build artifacts, and ZIP assembly:
  - Implemented: lower-level slide fill, stroke, shadow, gradient color-stop, and text color XML
    fragments now emit through PPTX-domain byte/chunk helpers. Those shared color/fill/stroke/
    shadow/transform/non-visual/hyperlink/shape-property helpers now live in
    `src/writers/pptx/drawing-xml.ts`, while `slide-xml.ts` stays responsible for slide structure,
    shape-tree setup, drawing traversal, and slide relationships. Shape/text/image/group drawing-node
    dispatch and recursive group children emission now live in `src/writers/pptx/shape-xml.ts`.
    Generated outline/edge stroke emission and background layer routing now live in
    `src/writers/pptx/drawing-layer-xml.ts`. Image relationship lookup, background image tiling,
    crop/source-rectangle calculation, and picture XML emission now live in
    `src/writers/pptx/picture-xml.ts`. Text body, paragraph properties, rich text run properties,
    bullets/numbering, tab stops, hyperlink, typography, paragraph spacing, character spacing, text
    fit, vertical text-body alignment, text-body inset/padding, and CSS-to-PPTX paragraph alignment
    XML emission now live in `src/writers/pptx/text-xml.ts`. Bullet marker emission uses
    chunk-writer attributes with UTF-8 marker characters, and slide fixed skeleton markup no longer
    uses `raw()`. Slide master/layout fixed skeleton and color-map override markup also emit through
    chunk-writer helpers.
  - Implemented: part-emitter fingerprints are split by package part family. Document properties use
    core/app-specific fingerprints, relationship parts use owner-path-family fingerprints, and
    manifest, presentation, theme, slide master, slide layout, view properties, presentation
    properties, slide XML, media copy, and placeholder note parts carry their own emitter
    fingerprints so HMR/build reuse can invalidate only the affected part families.
  - Implemented for the current v0.8.0 slice: generated border/outline drawing now preserves a
    CSS-like paint order in the direct writer. Background layers and element fill/stroke are emitted
    before generated edge strokes, generated edge strokes are emitted before outline, and parent
    generated strokes are emitted before child drawing nodes. Group fill/stroke emission also avoids
    duplicating generated background, border, and outline shapes.
  - Implemented: direct writer source tests guard the primary XML emitter modules against direct
    `.raw()` fragment insertion. `XmlChunkWriter` remains the only owner of raw byte/string
    appending for these emitters.
  - Implemented for the current v0.8.0 slice: the expected-entry/final-entry Assembly Plan split,
    build-note shape, optional-entry reporting, and file/path sink readiness details are covered by
    the writer summary and regression tests.
  - Implemented: the direct PPTX writer can tee ZIP chunks into a Node file output sink and the
    collecting artifact sink from one ZIP generation. Path side-effect failures use
    `E_RENDER_OUTPUT_WRITE_FAILED`, preserve collected artifact bytes when collection succeeds, and
    avoid surfacing partial ZIP bytes when collecting ZIP assembly itself fails.
  - Keep streaming-first ZIP internal. Do not expose a public streaming output toggle or fflate
    configuration surface.
- Module boundaries:
  - Move the current large `src/projection/pptx/index.ts` compatibility surface toward the documented
    projection composite shape: `model`, `identity`, `fingerprint`, `project`, `inspect`, and
    `validate` nodes with explicit public exports.
  - Continue splitting projection internals by ownership before adding more fidelity fields.
    Implemented for the current slice: drawing traversal, drawing-node mapping, and slide drawing
    reconstruction sit behind a Pptx Drawing Projection helper boundary; media source normalization,
    Media Allocation Key calculation, media package part construction, background/image media
    discovery, canonical image media part assignment, media package part merging, and per-slide media
    relationship attachment sit behind a Pptx Media Projection helper boundary.
  - Keep the main PPTX projection entry point as the orchestration layer that combines graph, layout,
    resolved style, theme, drawing, media, manifest/support assembly, package order, requirements,
    and fingerprints into a PptxPackageModel. It should not accumulate reusable traversal or
    relationship policy as local helper functions.
  - Implemented for the current slice: `src/projection/pptx/project.ts` owns graph/resolved-style/
    layout/support/media/manifest/order/requirement/fingerprint orchestration into a
    PptxPackageModel. `src/projection/pptx/index.ts` is the explicit projection entry barrel for the
    registry, pipeline, inspection type surface, and tests.
  - Implemented for the current slice: `src/projection/pptx/model.ts` is the package-model snapshot
    type node for Pptx Package Model, drawing, relationship, media, support, manifest payload, and
    inspection summary shapes. Internal projection/writer modules can depend on it without creating
    type-only dependencies on the main `src/projection/pptx/index.ts` orchestrator.
  - Implemented for the current slice: `src/projection/pptx/validation.ts` is now the package
    consistency validation composite and the narrow validation entry point consumed by pipeline and
    writer code. It owns package snapshot checks for required parts, duplicate ids/paths,
    relationship targets, content type overrides, package part requirements, order keys, and
    fingerprints. It also validates support XML relationship
    requirements from the same relationship payloads the writer consumes, so presentation, slide
    master, and slide layout XML cannot silently lose required projected relationship ids. This keeps
    validation policy attached to the model snapshot rather than to projection construction.
  - Keep writer internals under the PPTX writer composite: build/reuse policy, XML emission,
    assembly planning, ZIP, sinks, and runtime output boundaries. Writers may consume
    PptxPackageModel snapshots and validation results, not projection internals.
  - Preserve `src/pipeline-runner.ts` as stage orchestration rather than a home for PPTX-specific
    invalidation, ZIP, XML, or package validation policy.
- Validation and regression:
  - Add semantic projection tests for Project summary filtered records, unsupported paint warning
    aggregation, richer drawing nodes, theme/layout support parts, media relationships, and package
    fingerprints.
  - Add writer tests for remaining XML emitters, relationship targets, media parts, deterministic
    package output, part-emitter invalidation, sink failure behavior, and optional/missing Assembly
    Plan entries.
  - Implemented: writer semantic topology assertions compare generated ZIP paths to Assembly Plan
    entries and projected package paths, check content type payload serialization, verify internal
    and external relationship targets, and assert same-slide repeated media references share a single
    media relationship.
  - Implemented: `.github/workflows/pptx-generation-regression.yml` installs the workflow-local
    `.github/compat/pptxgenjs/` package, builds the direct writer package, generates a direct deck and
    a pinned `pptxgenjs` oracle deck, compares required package topology and semantic slide signals,
    and uploads comparison artifacts.
  - Implemented for the current v0.8.0 slice: render verification now generates a second
    `v0.8-generation-regression` fixture with template-derived slide layout topology, image
    relationships, external hyperlinks, z-index paint-order signals, rich text run signals, and image
    crop/source-rectangle signals, shape shadow signals, gradient fill signals, and text-body
    semantic signals. Its manifest records per-fixture semantic package assertions plus
    category-specific raster artifact expectations. The gradient assertion checks `a:gradFill` plus
    expected color-stop signals. The text-body assertion checks RTL paragraph, superscript/subscript
    baseline, underline style/color, bullet, and numbering signals. The crop assertion checks the
    generated image relationship path class and OOXML `a:srcRect` signal through
    `.github/render/verify-render.tsx`, keeping crop regression coverage available even when the pinned
    oracle is used only as a compatibility comparison. The shadow assertion checks `a:outerShdw` and
    the expected shadow color through the same deckjsx-owned fixture path. Crop, shadow, gradient,
    and text-body package assertions are tied to their expected v0.8 fixture slide XML instead of the
    concatenated deck XML, so a later slide cannot accidentally satisfy a signal that belongs to a
    different semantic class. The v0.8 fixture also adds its crop, shadow, gradient, and text-body
    slides to the manifest as `imageCrop`, `shadowEffect`, `colorFill`, and `text` raster
    expectations so rendered-artifact baselines can observe crop/source-rectangle, shadow/effect,
    gradient/fill, and typography output separately from generic layout pages.
  - Implemented for the current v0.8.0 slice: `.github/render/verify-render.tsx --baseline <manifest>`
    compares generated fixture names, semantic package assertion names, raster expectation categories,
    raster tolerance contracts, raster artifact presence, and PNG byte length tolerance when a
    baseline manifest includes PNG artifacts. When both baseline and current PNGs are available, it
    also runs ImageMagick `compare -metric AE` and checks category-specific different-pixel budgets,
    writing diff PNGs next to the current raster artifacts.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    rich text run preservation, including leading/trailing run text, a colored run, and a bold run
    signal.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    shape effect signals for rotation, transparent fill/stroke, and dashed stroke output.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    image crop/source-rectangle signals. The fixture renders a sixth crop slide through both
    deckjsx's direct writer and the pinned pptxgenjs oracle, then checks the image relationship and
    `a:srcRect` semantic XML signal in both packages.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    shape shadow output. The fixture renders a seventh shadow slide through both deckjsx's direct
    writer and the pinned pptxgenjs oracle, then checks `a:outerShdw` and the expected shadow color
    signal in both packages.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    text-body semantics. The fixture renders an eighth text-body slide through both deckjsx's direct
    writer and the pinned pptxgenjs oracle, then checks RTL paragraph mode, superscript/subscript
    baseline signals, wavy underline color, bullet character, and numbering XML signals in both
    packages.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    paragraph text-layout semantics. The fixture renders a ninth paragraph slide through both
    deckjsx's direct writer and the pinned pptxgenjs oracle, then checks vertical text direction and
    left/center/decimal tab-stop XML signals, point and percentage line spacing, and paragraph
    spacing-before/after XML signals, character spacing, text fit, and vertical text-body alignment
    plus text-body inset/padding and paragraph alignment signals in both packages.
  - Implemented for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers
    image-underlay drawing order. The fixture renders an eleventh slide through both deckjsx's direct
    writer and the pinned pptxgenjs oracle, then checks the image relationship, foreground text, and
    XML drawing order signal that keeps foreground text after the underlay picture.
  - Remaining: continue expanding the pinned pptxgenjs oracle only for additional migration
    scenarios that `pptxgenjs` can express cleanly beyond the current multi-slide
    hyperlink/image/paint-order/rich-text/effects/crop/image-effects/shadow/text-body/text-layout/
    image-underlay fixture. Gradient output remains covered by direct OOXML/render verification
    because the pinned `pptxgenjs` API does not expose an equivalent gradient-fill authoring surface.
- Implemented: `scripts/benchmark-pptx-writer.tsx` now includes template/layout fixtures, repeated
  asset probe cache-hit observation, path-output render measurement, ZIP assembly measurement,
  cold writer timing, warm writer timing, and warm Build Artifact reuse counts with loose budgets
  visible in the benchmark file.
  - Implemented: the benchmark now tracks Project summary overhead separately from
    `inspection: "none"` Project hot-path timing, and warm Project cache metrics use the
    no-inspection path.
  - Implemented: the benchmark now tracks `projectDetails` separately from `projectSummary` and
    no-inspection Project timing. `projectDetails` measures
    `deck.project({ inspection: "details" })` with composed paint order, effective projected style,
    package dependency invalidation, paint fallback aggregation, and theme projection provenance
    views enabled.
- Public documentation and seams:
  - Keep README, skill docs, type tests, and release notes aligned with the direct PPTX writer as the
    core path. `pptxgenjs` should appear only as historical context, an isolated regression oracle,
    or a future external compatibility package.
  - Keep `deckjsx`, `deckjsx/adapter`, and `deckjsx/inspect` seam tests current as implementation
    files move. New direct writer helpers, ZIP helpers, sinks, build artifacts, and Derived
    Projection Inspection Views must not leak through the wrong entry point.
  - Classify every exported stage-result summary type separately from the writer internals that feed
    it. A summary type may be public from root only when callers can already observe it through
    `ProjectResult` or `RenderResult` and it is byte-free, deterministic, and phrased in diagnostic
    or inspection vocabulary. A cache/storage type, emitter helper, ZIP sink, or Build Artifact type
    remains internal even if a public summary reports selected facts derived from it.

Public and performance review constraints:

- Keep the root `deckjsx` Authoring Interface narrow. It should expose authoring vocabulary,
  diagnostics, and stage result contracts, but not detailed Pptx Package Model internals, paint
  inputs, Assembly Plan entries, emitters, ZIP adapters, sinks, or build artifact managers.
- Stage result contracts may expose bounded summary objects when those objects are necessary to read
  `ProjectResult` or `RenderResult`. This is not a license to expose the underlying internal objects:
  `RenderAssemblyPlanSummary` and build/reuse summary DTOs describe what happened, while Pptx Package
  Build Artifacts, Assembly Plan builders, byte buffers, sinks, and emitter state stay internal.
- Keep detailed projection and render explanation behind the Inspection Interface. Pptx Package
  Model types, Package Part Order Keys, paint inputs, Effective Projected Style View, Composed Visual
  Paint Order View, Pptx Package Assembly Plan debug summaries, and build/reuse explanations belong
  in `deckjsx/inspect` or result debug/inspection summaries rather than the root authoring surface.
- Treat heavy inspection data as Derived Projection Inspection Views. `project()` returns a thin
  summary by default; expensive effective-style, composed-paint-order, unsupported-paint rollups,
  and package/reuse explanations should be derived on demand or gated by explicit detail collection
  options. HMR and sandbox workflows need these views, but ordinary Project and Render calls should
  not always pay for every explanation. The first implemented detail gate is
  `inspection: "details"` for composed paint order, effective projected styles, package dependency
  invalidation, paint fallback aggregation, and theme projection provenance.
- Keep Project's hot path focused on producing the Pptx Package Model, package fingerprints,
  dependency fingerprints, order keys, and required diagnostics. Do not make Project eagerly build
  every sandbox/debug view just because those views can be derived from the same data.
- Keep Render's hot path focused on reusable package-part bytes, Assembly Plan validation, streaming
  ZIP assembly, and sinks. Do not make Render rebuild XML, regenerate the ZIP, or rederive package
  semantics when Package Part Fingerprints, writer/emitter fingerprints, media byte fingerprints, and
  the existing build artifacts prove reuse is valid.
- Keep public writer options semantic. The public compression values are `store`, `fast`, `balanced`,
  and `small`; fflate numeric levels, streaming ZIP toggles, sink graphs, emitter fingerprints, and
  byte/chunk writer details are internal implementation vocabulary.
- Add public seam tests or type tests for `deckjsx`, `deckjsx/adapter`, and `deckjsx/inspect` so a
  future implementation does not accidentally turn inspection/debug or direct-writer internals into
  ordinary authoring vocabulary.
- Treat public API review as a release gate, not as a cleanup task. v0.8.0 is allowed to change
  public APIs because `1.0` has not shipped, but every exposed name should still belong to one of
  the defined interfaces: Authoring Interface, Adapter Interface, Inspection Interface, or Legacy
  Interface being removed.
- Treat performance review as a release gate, not as an after-the-fact benchmark. The writer design
  should be rejected if it requires always rebuilding all XML parts, always collecting all derived
  inspection views, introducing a public streaming/ZIP mode toggle, or moving media bytes into the
  Pptx Package Model to make Render convenient.

- Create PPTX projection and writer modules separate from author graph construction.
- Treat `src/projection/pptx/` as a PPTX Projection Composite Node. Keep its external contract on the
  package-model snapshot, projection entry points, inspection summaries, and validation helpers
  exposed through `src/projection/pptx/index.ts` or `src/projection/pptx/index.ts`. Internal submodules
  should not become casual import targets for writers or unrelated pipeline code.
- Keep `src/projection/pptx/model.ts` as a snapshot type node. It should define PptxPackageModel,
  package parts, drawing nodes, theme/layout projections, relationships, fingerprints, and inspection
  data shapes without importing graph construction, style resolution, layout resolution, asset
  loading, or projection process modules. Allow only narrow identity/provenance types needed to
  describe origins.
- Permit the PPTX model node to reference upstream identity/provenance identifiers such as
  GraphNodeId, SourceOrigin, StyleEntityId, or AssetEntityId where needed for origins. Do not embed
  upstream payload structures such as SemanticNode, ResolvedStyle, ProjectedLayoutNode, or asset
  loader data as PptxPackageModel payloads.
- Keep PPTX identity helpers as a sibling node such as `src/projection/pptx/identity.ts`, not buried
  under `model/`. Package Part Identity, Package Part Order Key, Pptx Element Identity, serialized
  ids, and fingerprint helper vocabulary are shared by model, projection, inspection, validation, and
  writer/build artifact code.
- Keep package fingerprinting as a separate node such as `src/projection/pptx/fingerprint.ts`.
  Identity defines stable names and ids; fingerprinting defines invalidation/hash policy, dependency
  fingerprints, and algorithm/version markers. Fingerprinting may depend on identity and model
  snapshots, but identity and model should not depend on fingerprint implementation policy.
- Treat `src/projection/pptx/project.ts` as a projection orchestration node. It may call sibling
  drawing, theme, template/layout, media, manifest, support-part, relationship, paint-order, and
  summary preparation helpers, but its external contract should be the projection entry point that
  turns upstream snapshots into a PptxPackageModel. Pipeline and writer code should not import
  project internals.
- Implemented for the current slice: `src/projection/pptx/project.ts` is that project orchestration
  node, and `src/projection/pptx/index.ts` re-exports only the intended projection entry points
  without owning the projection process itself.
- Keep project internals flowing downward: input snapshots -> theme projection -> template/layout
  projection -> media metadata projection -> drawing projection and Projected Paint Order ->
  relationships/manifest/support assembly -> package part order keys and fingerprints ->
  PptxPackageModel. Avoid reverse edges such as drawing projection mutating manifest state or
  manifest/support builders creating drawing content.
- Keep `src/projection/pptx/inspect/` independent from `project/`. Inspection should derive Project
  summaries, Effective Projected Style View, Composed Visual Paint Order View, diagnostics summaries,
  and package/drawing explanations from a PptxPackageModel snapshot plus diagnostics. Project may
  produce the model; pipeline or projection public entry points may call inspect to build result
  summaries.
- Keep `src/projection/pptx/inspect/` deep enough that callers can request explanation without
  learning project internals. Its interface should accept stable snapshots such as PptxPackageModel,
  Diagnostics, and selected Pipeline Artifacts, then derive the requested inspection views. Avoid
  exporting many small projection helper functions just so tests or sandbox tools can reconstruct
  those views themselves.
- Distinguish default summaries from detailed Derived Projection Inspection Views. Default Project
  summaries should stay cheap enough for normal rendering and HMR loops; detailed views such as full
  effective projected styles, composed visual paint order, paint fallback aggregation, and package
  dependency explanations may be opt-in or lazily materialized.
- Put package-model consistency validation under the PPTX projection composite node, such as
  `src/projection/pptx/validate/`. It should validate PptxPackageModel shape, package consistency,
  relationships, requirements, content types, and serializable payload shapes. Render should call this
  validation before writing. Avoid a second deep validation owner inside `writers/pptx/`; emitters
  should keep only local invariant checks.
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
- Rewrite the internal shape of the Pptx Package Model as needed so it is precise enough for direct
  OOXML writing, sandbox inspection, and future HMR. Do not introduce a richer XML-shaped structured
  model after the Pptx Package Model; render-stage build artifacts may contain part bytes, but they
  should not replace the Pptx Package Model as the meaningful output model.
- In relationship payloads, distinguish dependency-oriented package part identity/package path from
  the actual OOXML `.rels` target path. Project should compute relationship ids and relative target
  strings; the writer should serialize them without inventing relationship targets.
- Project external hyperlink relationships for text, picture, and shape drawing nodes during
  projection. Drawing nodes should reference projected hyperlink relationship ids rather than making
  the writer create hyperlink relationships.
- Assign relationship ids as deterministic per-part `rId1..N` values from a stable projected order.
  Assign drawing object ids as deterministic numeric ids from slide drawing order. Preserve semantic
  and HMR identity through Pptx Element Identity and origins rather than relying on OOXML object ids
  to stay stable across insertions.
- Make `PptxSlideDrawing.children` the final PPTX drawing/paint order. Project should resolve
  z-index, generated background layers, borders, outlines, and authored children into that order so
  the writer only serializes drawing nodes sequentially.
- Compute a Projected Paint Order from deckjsx's CSS-like rendering semantics before assigning PPTX
  emission targets. This order is the source of truth for visual stacking; OOXML package structure
  is the target representation, not the definition of deckjsx paint semantics.
- Treat CSS-like rendering fidelity as a long-term compatibility goal, not as something v0.8.0 must
  completely finish. v0.8.0 should still preserve the connection points: keep z-index, graph order,
  generated paint layers, template common drawing order, visibility/display effects, and projection
  fallback reasons in the Pptx Package Model instead of dropping them just because direct PPTX
  serialization only implements a subset at first.
- For CSS-like paint semantics in v0.8.0, prioritize observability and preservation over deciding
  whether the final rendering is visually perfect. Project should map the supported parameters it
  can observe, such as size, position, color, visibility, z-index inputs, generated layer roles, and
  paint-order inputs, into distinct Pptx Package Model fields. Parameters that are not observed or
  not yet represented should be enumerated as diagnostic warnings. Render-blocking errors should be
  rare here; the main failure to avoid is crushing separate authoring/projection parameters into an
  opaque shape where future fidelity work cannot recover them.
- Store paint-order inputs on projected drawing nodes in addition to the final `paintOrderIndex`.
  Include at least z-index input, graph or layout sibling order, generated layer role, template/common
  drawing source, layout-anchor relation where relevant, visibility/display filtering result, and
  any projection fallback reason. The final order alone is not enough for sandbox explanation, HMR
  dependency tracking, or future CSS fidelity improvements.
- Keep graph/layout sibling order as the pre-z-index projected sibling input, not as an alias for the
  final `paintOrderIndex`. When z-index sorting changes visual order, the model must still explain
  the sibling order that participated in the paint-order decision.
- Preserve the CSS-like distinction between `display: none` and `visibility: hidden`. Content with
  `display: none` should not become Pptx Drawing Nodes, but Project should expose filtered records in
  diagnostics or summaries for inspection. Content with `visibility: hidden` should remain a Pptx
  Drawing Node carrying visibility state, because it still participates in layout and paint-order
  reasoning.
- Store `display: none` traces as Project Result inspection summary records, not as Pptx Package
  Model drawing nodes. The Pptx Package Model describes output package structure, while the summary
  explains why authored or graph content was filtered before package projection.
- Preserve opacity and transparency as drawing paint data in v0.8.0, including fill transparency,
  stroke transparency, image transparency, and node-level opacity where authored. Do not require
  v0.8.0 to fully reproduce CSS group compositing semantics for `opacity < 1`; instead, keep
  observed stacking-context/compositing inputs in paint metadata and report not-yet-implemented
  compositing behavior as diagnostic warnings.
- Apply the same split to transforms. Project PPTX-representable geometric transforms, such as
  rotation, flip, scale, and translated frames, into drawing-node transform data. Keep observed
  CSS-like transform semantics that affect stacking or compositing as paint metadata and diagnostic
  warnings when the direct PPTX projection cannot implement them yet.
- Treat `paintInputs` and related observed CSS-like metadata as explanation and dependency data for
  inspection, diagnostics, HMR, and future projection improvements. The direct writer should not
  read paint inputs to reinterpret authoring semantics; it should serialize concrete projected
  fields such as paint order, emission target, transform, fill, stroke, text body, and relationships.
- Expose projected drawing paint inputs through the Inspection Interface, such as `deckjsx/inspect`,
  alongside detailed Pptx Package Model types. Do not expose them as ordinary authoring vocabulary
  from the root authoring API.
- Store node-local unobserved or unsupported paint semantics on the affected Pptx Drawing Node,
  while also aggregating them into Project Result diagnostics or summaries for whole-deck inspection.
  This lets sandbox tooling explain both "what happened to this node" and "which unsupported paint
  semantics exist in this project."
- Treat unsupported or unobserved CSS-like paint semantics as Project warning diagnostics that do not
  make `ProjectResult.ok` false. They report fidelity or observability gaps, not projection failure.
  Keep this separate from Render errors where the writer cannot serialize a concrete projected field
  that the Pptx Package Model already committed to.
- Treat Projected Paint Order as a cross-output projection concept, but keep the concrete paint input
  shape owned by each Projected Document Model. PPTX can expose `PptxDrawingNode.paintInputs`; a
  future PDF projection can define its own equivalent without forcing a premature shared drawing-node
  base type.
- Require origin information on projected drawing, support, and media nodes where relevant. Generated
  drawing nodes should retain the graph/source origins that caused them to be generated.
- Give generated drawing nodes deterministic Pptx Element Identity derived from source graph identity,
  generated role, and local index/key. Store the generated role in the model so sandbox tooling can
  explain why background, border, outline, or other generated drawing objects exist.
- Treat CSS-like `overflow: hidden` as a feature to reproduce, not as an unsupported authoring error.
  Project should choose and record clipping strategy/results in the Pptx Package Model, preferring
  PPTX-native or vector-preserving strategies such as source rectangle adjustment or geometry
  clipping. More expensive fallbacks such as rasterizing clipped subtrees may be deferred only as an
  explicit future strategy, not as a silent writer limitation.
- If a slide requires a deferred clipping strategy that v0.8.0 cannot faithfully emit but the current
  Pptx Package Model still contains a structurally valid fallback, report a Project warning and keep
  Render nonblocking. Treat this as a projection fidelity gap rather than an authoring misuse error.
  Render should be blocked only when the projected package would be structurally invalid or a writer
  cannot serialize a concrete field the Pptx Package Model already committed to.
- Project slide backgrounds to native PPTX slide background payloads when they map cleanly, such as
  simple solid or gradient backgrounds. Project layered, repeated, clipped, or otherwise unsupported
  slide backgrounds into generated drawing nodes at the beginning of the slide drawing order, and
  make the chosen representation visible in the Pptx Package Model.
- Preserve Deck Template Area origins and resolved placement in projected drawing nodes or summaries,
  but do not confuse deckjsx Template Areas with PowerPoint placeholders. Emit real PPTX placeholder
  semantics only when the Pptx Package Model explicitly represents them.
- Add a `Pptx Slide Layout Projection` concept inside the Pptx Package Model for projecting
  Deck-owned Slide Templates into PPTX layout structure. Template-derived slides should have
  corresponding layout relationships, and the PPTX package should preserve deckjsx's page-structure
  vocabulary without making Slide Templates identical to PowerPoint slide masters/layouts.
- In Pptx Slide Layout Projection, represent Template Areas as placeholder-like layout anchors with
  area identity, authoring-level area kind, frame, and origin. Keep authored area-bound content in
  slide drawing parts, linked back to the Template Area or layout anchor as needed.
- Preserve `generic` Template Areas as layout anchors even when they do not map to a strong
  PowerPoint placeholder type. The anchor still carries deckjsx template meaning, origin, frame, and
  sandbox/HMR traceability.
- Derive template layout Package Part Identity from Source Identity plus Slide Template name. Same
  template names in different sources produce distinct layout projections, while slides using the
  same template in one source share the layout part.
- Fingerprint template-derived layout parts from template structure and projected layout anchor data,
  including Template Area frame, Template Area Kind, origin links, and PPTX fallback placeholder
  details. Do not include authored slide content from slides that use the template in the layout
  part fingerprint; that content belongs to each slide part's fingerprint.
- For authored content placed by a Template Area, store both provenance and a direct projected
  layout-anchor relationship on the resulting Pptx Drawing Nodes. Origin explains why the node
  exists; the layout-anchor reference explains which projected template anchor constrains it.
- Treat Template Area frame or constraint changes as dependencies of slide parts that place content
  through that area. Such a change invalidates both the template-derived layout part and every
  affected slide part whose drawing node frames are recalculated from that anchor.
- Store layout identity and relevant layout fingerprint dependencies on slide parts that use a
  template-derived layout. Include layout-anchor fingerprints when slide drawing values, such as
  frames for area-bound content, are derived from those anchors. This lets HMR and partial rebuild
  tooling distinguish "layout relationship changed" from "slide drawing must be recalculated."
- Shape Pptx Slide Layout Projection so it can hold template-owned common drawing structure, such as
  future template backgrounds, rules, logos, or repeated visual scaffolding, in addition to Template
  Area anchors. This is a model capability; v0.8.0 does not have to expose every corresponding
  authoring API immediately.
- Prefer emitting template-owned common drawing into the PPTX Slide Layout Part instead of
  duplicating it into every slide. When PPTX rendering order, clipping, or compatibility constraints
  require slide-level expansion, Project should record that fallback explicitly so sandbox tooling
  can explain why common template drawing became slide drawing content.
- For template-owned common drawing, choose an emission target after Projected Paint Order is known:
  use `slideLayout` when placing it in the layout part preserves the intended CSS-like stacking, and
  use `slide` expansion when slide content must interleave with it or appear behind it. Store the
  emission target and fallback reason in the Pptx Package Model rather than making the writer infer
  this from OOXML limitations.
- Store a Pptx Emission Target on projected drawing nodes so Project records whether a drawing object
  should be serialized into the slide part, slide layout part, or a future support part such as a
  slide master. In v0.8.0, the main concrete targets are `slide` and `slideLayout`; keep `slideMaster`
  as a deliberate future-facing target only if the type shape needs it.
- Do not duplicate `emissionTarget: "slideLayout"` drawing nodes into each slide part's
  `PptxSlideDrawing.children`. They belong to the layout part for package emission. For sandbox and
  inspection, expose a composed per-slide visual paint-order view that includes layout-emitted and
  slide-emitted drawing nodes in their projected visual order.
- Keep the composed per-slide visual paint-order view as a derived inspection view, not as package
  ownership. The Pptx Package Model's canonical drawing ownership follows emission target and
  package part identity; the composed view exists to explain final visual stacking to sandbox and
  debugging tools.
- Generate a default blank PPTX Slide Layout Part for untemplated slides. Use a single slide master
  with the default blank layout and template-derived layouts attached to it unless a later release
  introduces richer master/theme ownership.
- Ensure every slide has a slide layout relationship in the Pptx Package Model. Untemplated slides
  point to the default blank layout; templated slides point to the template-derived layout projection.
- For v0.8.0, emit a single default slide master by default. Still shape Pptx Package Model
  identities and relationships so multiple slide masters can be represented later, rather than
  baking single-master assumptions into package part identity or relationship types.
- Extend Template Areas with an optional authoring-level area kind, such as title, body, picture,
  footer, date, slide number, or generic. Use that kind to project PPTX placeholder semantics in
  template-derived slide layouts without requiring authors to spell PowerPoint placeholder ids.
- Keep Template Area Kind separate from PPTX placeholder data. Template Area Kind remains
  authoring-level semantic vocabulary; Pptx Slide Layout Projection stores the PPTX-specific
  placeholder or placeholder-like result.
- Do not semantically disguise `generic` Template Areas as `body`, `title`, or another PowerPoint
  placeholder kind. If PPTX compatibility requires emitting a concrete placeholder type for a
  generic area, store that as a PPTX fallback serialization detail separate from the projected
  deckjsx area kind.
- Do not emit visible PowerPoint editing prompt text for layout anchors that exist only to preserve
  deckjsx template structure. Authored area-bound content belongs in slide drawing parts, so empty
  layout anchors should not invite manual editing in PowerPoint.
- Do not infer Template Area kind from the area name. Missing kind defaults to generic; authors can
  opt into title/body/picture/footer/date/slide-number semantics explicitly, with helper APIs
  considered only to make explicit kind authoring easier.
- Store fill, stroke, effects, gradient, picture fill, and transparency values as PPTX-domain
  properties in the Pptx Package Model rather than CSS-like IR that the writer must reinterpret.
  The writer should map these properties to OOXML markup directly.
- For text fitting, project supported behavior to PPTX-native text body auto-fit properties and make
  that delegation explicit in measurement metadata. Do not require v0.8.0 to implement full
  cross-runtime text measurement just to compute final rendered font sizes.
- Report unsupported authoring-to-PPTX mapping as Project diagnostics. Treat a valid Pptx Package
  Model property that the direct writer cannot serialize as a Render error and implementation gap,
  not as an opportunity for the writer to reinterpret authoring semantics.
- Remove the current `PptxPackageModel.version` field in `0.8.0`. The projected model is not a
  standalone long-term interchange format; `defineProjection()` should validate the current model
  shape and required PPTX fields rather than supporting old model-version compatibility.
- Keep `defineProjection()` as the explicit projection artifact override API. It should accept only
  the current Pptx Package Model, not media bytes or build artifacts; Render reports diagnostics if
  media parts in a defined projection cannot be resolved through existing Asset Artifacts or
  registered asset loaders.
- When rendering after `defineProjection()`, do not automatically invalidate every existing build
  artifact just because the projection was defined externally. Reuse package-part build artifacts
  only when their Package Part Identity, package part fingerprint, dependency fingerprints,
  writer/emitter fingerprints, and media byte fingerprints still match the defined projection.
- Implemented: replace v0.6 placeholder support payloads with minimal structured payloads for direct
  PPTX output support parts, including presentation, document properties, theme, slide master, slide
  layout, view properties, presentation properties, relationships, and content types as needed.
- Include structured `docProps/core.xml` and `docProps/app.xml` payloads. Keep document property
  timestamps deterministic or omitted by default so equivalent projects do not produce different
  package fingerprints or bytes merely because of render time.
- Make direct writer output deterministic where practical: stable ZIP entry order, fixed ZIP
  metadata/timestamps, stable compression settings, stable relationship and attribute ordering,
  stable generated ids, stable media part paths, and deterministic document properties.
- Expose `render({ compression })` with `"store" | "fast" | "balanced" | "small"` and default to
  `"fast"`. Keep the option semantic rather than exposing library-specific numeric compression
  levels.
- Introduce `PptxRenderOptions` for the direct PPTX writer options, including `output` and
  `compression`; in `0.8.0`, the public default `RenderOptions` may alias `PptxRenderOptions` while
  PPTX remains the only built-in projection format.
- Keep Writer Adapter, Projection Format, Output Format, Adapter Registry, and Render option typing
  shaped for future formats even though `pptx()` is the only built-in writer in `0.8.0`. Do not
  turn the pipeline contracts into PPTX-only APIs.
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

- Keep ZIP writing behind an internal replaceable adapter so Node, browser, and future dev-server
  outputs can use the same package model. Do not expose a public `zipWriter` option in `0.8.0`; use
  the built-in multi-runtime ZIP writer by default.
- Add a Deck-owned Asset Loading Boundary registration API, such as `deck.useAssets(loader)`, so
  filesystem-like, framework-public, authenticated, or otherwise runtime-specific Authored Media
  Sources can be resolved outside the multi-runtime core. Project should use registered asset
  loaders for metadata needed by the Pptx Package Model, and Render should use the same boundary for
  media bytes.
- Registered asset loaders are tried before the built-in multi-runtime boundary and in registration
  order. The first loader that returns a probe result owns the Asset Artifact resolver scope, and
  Render loads bytes from that same resolver scope so Project metadata and Render bytes do not come
  from different runtime assumptions.
- Split Asset Loading Boundary work into metadata probing and byte loading. Project should use
  `probe(source)` to obtain media type, extension, dimensions, byte length, or hash when available;
  Render should use `load(source)` to obtain bytes for Media Parts. Implementations may share caches
  internally, but the contract should not require Project to load every media byte.
- The built-in multi-runtime probe path is allowed to fetch absolute URL-like image sources during
  Project to derive PNG/GIF/JPEG/SVG dimensions and byte length. Those bytes are not stored in
  PptxPackageModel; they may be materialized as Asset Artifact `load` data so Render can reuse the
  Project probe result instead of repeating the fetch.
- Treat missing image probe dimensions as an asset data retrieval failure reported during Project,
  even when the immediate writer path could stretch the image without intrinsic sizing. Render should
  not repair or reinterpret missing media metadata later.
- Materialize asset probe/load results as Asset Artifacts in the Pipeline Artifact Collection so
  Project, Render, sandbox tooling, and future HMR can reuse media metadata and bytes without storing
  raw media bytes in the Semantic Author Graph or making the Pptx Package Model a media cache.
- Key Asset Artifacts primarily by Asset Entity identity, and maintain a reuse index by normalized
  Authored Media Source plus resolver scope. Do not require content hashing for cache identity;
  hashes can strengthen deduplication when an asset loader already provides them.
- Preserve the existing staged materialization policy: Project and Render should materialize missing
  or invalidated source, graph, asset, projection, or build artifacts instead of blindly recomputing
  the whole pipeline when valid artifacts already exist.
- Materialize Pptx Package Build Artifacts into the Pipeline Artifact Collection keyed by Package
  Part Identity. Render should reuse valid built parts, emit missing or invalidated parts, then write
  the final ZIP from the current built part set.
- Add Package Part Fingerprints to projected package parts. Build artifacts should use the projected
  part fingerprint together with a writer fingerprint, and media byte fingerprints where needed, to
  decide whether a part can be reused.
- Use a deckjsx-owned deterministic non-cryptographic fingerprint algorithm for Package Part
  Fingerprints, and include a fingerprint algorithm/version marker so future algorithm changes
  invalidate affected build artifacts intentionally.
- Make `Deck#project()` and `BoundSource#project()` async in `0.8.0`; `compile()` can remain
  synchronous, while `render()` materializes the async project stage internally.
- Keep the built-in asset loading behavior multi-runtime safe: decode data or byte sources and fetch
  absolute `http:`/`https:` URLs when `fetch` is available. Filesystem-like paths, app-public relative
  URLs, authenticated URLs, and framework-specific asset rules require a registered asset loader.
- Keep Graph Identity distinct from PPTX relationship ids, object ids, part paths, and other Output
  Identity.
- Do not make HMR depend on mutating an existing `.pptx` ZIP in place. PPTX ZIP files have a central
  directory at the end, so the practical fast path is to avoid recompiling unchanged slides and then
  quickly re-emit the package.

### v0.8.0 Implementation Inventory

This inventory turns the resolved design into implementation work. It is not a smaller scope than
the notes above; it is the checklist future implementation should be able to follow.

Public API and package boundary:

- Remove `pptxgenjs` from runtime dependencies and remove the core `pptxgenjs()` adapter export.
- Add the direct PPTX adapter factory `pptx()` and make default `deck.render({ output })` use the
  same writer internally.
- Make `Deck#project()` and `BoundSource#project()` asynchronous while keeping `compile()` synchronous.
- Add Deck-owned asset loader registration as `deck.useAssets(loader)` rather than a render option.
  It should be chainable like the other Deck configuration APIs and should register pipeline
  resources on the Deck/BoundSource state that Project and Render both consume.
- Introduce `PptxRenderOptions` with `output` and semantic
  `compression: "store" | "fast" | "balanced" | "small"`.
- In v0.8.0, let public `RenderOptions` alias `PptxRenderOptions` while PPTX remains the only built-in
  writer, but keep the type positioned as a default-writer convenience rather than a permanent
  PPTX-only render contract.
- Keep `RenderOptions`, Writer Adapter, Output Format, Projection Format, and Adapter Registry shaped
  for later non-PPTX formats.
- Keep `defineProjection()` as the explicit projection override and validate only the current
  `PptxPackageModel` shape.
- Add public seam regression tests:
  - root `deckjsx` should expose authoring vocabulary, diagnostics, and stage result types only;
  - `deckjsx/adapter` should expose `pptx()` and writer-adapter option/result types, but not writer
    internals;
  - `deckjsx/inspect` should expose detailed Pptx Package Model, paint/order/fingerprint, and
    derived inspection types needed by tools.
- Current v0.8.0 slice: public-surface tests now pin the exact package export-map targets, published
  `files` allowlist, root dependency shape, source-level `pptxgenjs` absence, and generated public
  declaration output. Adapter public type tests also pin `PptxCompressionMode` as a semantic adapter
  option and reject direct access to Asset Artifacts, Build Artifacts, XML helpers, and ZIP helpers.
- Keep writer internals unexported from public package entry points: XML emitters, byte writers, ZIP
  adapters, fflate configuration, sinks, build artifact managers, and Assembly Plan construction
  helpers stay internal even when tests cover them through internal module paths.
- Export byte-free stage-result summary types from root only when the public result shape requires
  them. These types should describe diagnostics and observable stage facts, not writer/cache
  ownership. For example, render assembly/build summaries can report package part ids, package paths,
  status, reason, fingerprints, dependency fingerprint summaries, media-byte fingerprint source, and
  diagnostic codes, but must not carry package-part bytes, Asset Artifact storage, sink handles, XML
  chunks, or emitter implementation state.
- Preserve result-first behavior for public calls. `project()` and `render()` may become async, but
  they should still return stage results with diagnostics rather than switching to thrown errors for
  ordinary projection or render failures.
- Keep path-based output as a convenience side effect. Runtimes without path-based file writing
  should still be able to obtain artifact bytes and should report output-write diagnostics when the
  path side effect cannot run.

Asset pipeline:

- Define the Asset Loading Boundary with separate `probe(source)` and `load(source)` responsibilities.
- Implemented: registered loaders are evaluated before the built-in boundary and in registration
  order. The Project-winning resolver scope is preserved on Asset Artifacts and reused by Render
  when loading bytes for that media source.
- Implemented: built-in multi-runtime-safe handling for data/byte sources and absolute
  `http:`/`https:` URLs when `fetch` exists.
- Keep filesystem-like paths, app-public relative URLs, authenticated URLs, and framework-specific
  rules outside core behind registered loaders.
- Materialize Asset Artifacts with resolved metadata and optional loaded source bytes.
- Implemented: key Asset Artifacts by Asset Entity identity and maintain a reuse index by normalized
  Authored Media Source plus resolver scope.
- Treat missing required probe metadata as Project diagnostics; Render should not repair missing
  projection metadata.
- Keep loaded media bytes in Asset Artifacts and Render/build artifacts, not inside the Semantic
  Author Graph or Pptx Package Model. The package model may reference media part identity,
  relationship identity, metadata, and required byte fingerprints, but it should not become the media
  byte cache.
- Implemented: asset loader failures identify the source, resolver scope, probe/load phase, affected
  Asset Entity, affected media package part when available, and whether the failure blocks Project or
  Render.
- Implemented: if the Project-winning resolver scope cannot provide bytes for a media part during
  Render, the pipeline reports `E_RENDER_ASSET_LOAD_FAILED` at the asset boundary instead of letting
  the writer turn it into a later package assembly failure.
- Implemented: repeated media references now share PPTX Media Parts by Media Allocation Key. Hash
  metadata from `probe()` wins when available; otherwise resolver scope plus Authored Media Source is
  used. Same-slide drawing nodes that share a media part also share the same slide image
  relationship id.

Pptx Package Model rewrite:

- Remove `PptxPackageModel.version`.
- Replace slide `payload.elements` with `PptxSlideDrawing` and projected drawing nodes.
- Model manifest, support, authored-content, media, relationship, slide, slide-layout, slide-master,
  theme, docProps, presentation, and view/presentation property parts as structured package parts.
- Add Package Part Identity, Package Part Fingerprint, dependency fingerprints, Pptx Element
  Identity, Pptx Serialized Identity, and deterministic relationship/object id assignments.
- Model relationship ids and `.rels` target strings during Project.
- Include support-part relationship files, such as presentation, slide master, slide layout, and
  slide relationship parts, in the Pptx Package Model rather than letting the writer create hidden
  relationship ZIP entries.
- Model Media Parts as metadata/relationship/package-path records, not byte storage.
- Keep the model close enough to PPTX/OOXML package structure to explain content types,
  relationships, support parts, layout/master/theme parts, and media parts, but do not turn it into
  raw XML tag data. The model should stay practical to project from graph/style/layout/theme/asset
  snapshots.
- Preserve CSS-like rendering connection points even when v0.8.0 cannot yet render every case
  perfectly: z-index inputs, generated layer roles, visibility/display distinction, opacity,
  transform inputs, clipping strategy, background-layer strategy, Template Area anchor references,
  and fallback reasons should not be collapsed into writer-local ordering.
- Current v0.8.0 slice: package consistency validation now checks drawing clipping metadata,
  measurement metadata, top-level z-index, flip flags, and known visibility values before Render,
  alongside the existing paint-order, layout-anchor, unsupported-semantic, fill/stroke/effect, and
  text payload validation. This keeps sandbox/defineProjection edits from passing malformed
  CSS-like projection connection points into the writer.
- Current v0.8.0 slice: the Inspection Interface now exposes `PptxVisibility` for projected drawing
  visibility instead of a broad `string`, so PptxPackageModel and Project Inspection Summary keep the
  CSS-like `"visible" | "hidden"` vocabulary aligned with authoring, layout, and package validation.
- Current v0.8.0 slice: Project Inspection Summary now carries drawing `measurement` metadata on
  element summaries and resolved values, so sandbox/HMR tools can read projected measurement/frame
  explanations without traversing the full PptxPackageModel drawing tree.
- Current v0.8.0 slice: Project Inspection Summary also carries top-level drawing `clip` metadata on
  element summaries and resolved values, keeping overflow-clipping explanations visible in the
  lightweight inspection path as well as in the full PptxPackageModel.
- Current v0.8.0 slice: Project Inspection Summary now also carries projected opacity and transform
  metadata (`rotation`, `flipH`, and `flipV`) on element summaries and resolved values. This keeps
  CSS-like opacity/transform connection points visible for sandbox/HMR tools even when the current
  writer uses fallback warnings for exact CSS stacking-context behavior.
- Current v0.8.0 slice: Project Inspection Summary now carries byte-free background-layer summaries
  for slide backgrounds and drawing elements. The summary exposes projected layer kind, frames,
  gradient stops, repeat/fit/object-position, and image `sourceKind`, while keeping authored source
  payloads, media bytes, media part storage, and writer state in PptxPackageModel/asset/render
  boundaries.
- Remaining: continue applying the same byte-free summary rule to any new drawing summary fields.
  Project Inspection Summary should show whether authored background/paint semantics were preserved,
  warned, or approximated, but it must not become a second drawing tree or a writer input.
- Add Pptx Package Build Artifact as a render-stage artifact keyed by Package Part Identity.
- Keep Pptx Package Build Artifact bytes out of the primary inspection model.
- Keep Pptx Package Build Artifact strictly in the Render stage. Project should produce structured
  package data, package identities, relationships, and fingerprints; Render should use those
  fingerprints plus writer/media-byte fingerprints to decide which package-part bytes to reuse or
  rebuild.
- Store final package path on each Pptx Package Build Artifact while keeping Package Part Identity as
  the artifact key. Identity answers "which conceptual package part is this"; path answers "where
  does this byte payload go in the ZIP." Keep identity, path, bytes, and build fingerprints separate
  so final ZIP assembly and future streaming ZIP output do not infer one concern from another.
- Introduce a Pptx Package Assembly Plan in the Render stage. The plan should list final ZIP entries
  in deterministic order and connect each entry to a Package Part Identity, final package path, build
  artifact, compression policy, and required/missing status. Final ZIP assembly and future streaming
  ZIP output should consume this ordered plan rather than iterating an unordered build artifact map.
- Build the Pptx Package Assembly Plan during Render. Its package paths and entry ordering should be
  derived from PptxPackageModel package structure, while Render adds build artifact availability,
  writer fingerprint validity, media byte fingerprint validity, compression decisions, and
  missing/required status.
- Add deterministic Package Part Order Keys to PptxPackageModel package parts. Render should use
  these keys when building the Assembly Plan so final ZIP entry ordering is stable and not invented
  by the ZIP writer or by JavaScript `Map` iteration.
- Store part requirement metadata, such as `required`, `optional`, or `conditional`, on
  PptxPackageModel package parts. Requirement status is package semantics decided by Project; Render
  should consume it when validating the Assembly Plan rather than inventing required/optional policy
  locally.
- Store condition reasons and dependencies for conditional package part requirements. For example, a
  part can explain that it is required because a slide has notes, a picture uses a media
  relationship, or a feature needs a support part. Render should consume the evaluated requirement
  and reason rather than re-evaluating package semantics.
- Shape Package Part Order Keys around meaningful PPTX package convention and deckjsx projection
  order rather than lexical path sorting alone. A stable order should place package manifests first,
  then root relationships, document properties, presentation/support parts, slide masters/layouts,
  slides in slide order, slide relationship parts near their owning slides, and media in deterministic
  media part order.
- Expose Package Part Order Keys through the Inspection Interface so deterministic output order,
  package diffs, HMR explanations, and future streaming ZIP behavior can be inspected. Do not expose
  them through ordinary authoring APIs.
- Expose Pptx Package Assembly Plan through Render Result inspection/debug summaries rather than
  through Project Result's primary Pptx Package Model inspection. The pipeline should become more
  concrete as it moves downward: Project exposes structured package model and order keys; Render
  exposes assembly plan, build artifact reuse/rebuild status, compression decisions, and missing
  entry diagnostics.
- Include build artifact status on each Assembly Plan entry, such as `reused`, `rebuilt`, `missing`,
  or `failed`, plus structured reasons like `partFingerprintChanged`, `writerFingerprintChanged`,
  `emitterFingerprintChanged`, `mediaBytesChanged`, `packagePartIdChanged`, `missingArtifact`, or
  `compressionChanged`.
- Include current and previous build summaries on Assembly Plan entries when they help explain warm
  reuse or invalidation. The summaries should expose the exact fingerprint domains used by the
  reuse decision, including package part, writer, part-emitter, dependency, and media-byte
  fingerprints. Preserve the media-byte fingerprint source, such as projected metadata hash,
  loaded-asset hash, or byte hash, so sandbox/HMR tooling can distinguish "trusted metadata reuse"
  from "bytes were loaded and compared."
- Keep these build summaries derived views, not cache records. They should remain small enough for
  diagnostics and HMR explanations, and they should not duplicate Build Artifact bytes or media bytes
  into the public result.
- Separate package-part byte reuse from ZIP compression decisions. Pptx Package Build Artifact bytes
  are uncompressed XML/media payloads and can be reused when only the render compression mode changes.
  A compression change should force final ZIP reassembly, not invalidate otherwise valid part bytes.
- Support both a global direct-writer fingerprint and more specific part-emitter fingerprints. The
  initial implementation may invalidate broadly when the writer changes, but the build artifact model
  should allow future reuse when only one emitter family changes, such as slide XML, relationship
  XML, docProps XML, media copying, or theme XML.
- Include XML serialization formatting policy in relevant emitter fingerprints. Attribute order,
  namespace declaration order, numeric formatting, empty-element style, and escaping policy can change
  bytes without changing PptxPackageModel meaning, so build artifact reuse must account for them
  through writer/emitter fingerprints rather than package part fingerprints.
- Treat XML escaping and serialization of concrete projected fields as writer responsibilities. If a
  valid PptxPackageModel field cannot be serialized by the direct writer, report a Render error
  rather than downgrading it to a Project warning or asking the writer to reinterpret authoring
  semantics.
- Avoid deep validation inside XML emitters for speed. Project and pre-Render validation should check
  package structure, required fields, relationships, and supported payload shapes. Emitters may keep
  lightweight invariant checks that produce Render errors when an impossible state reaches
  serialization.
- Run lightweight pre-Render package consistency validation before XML emission, especially when
  consuming a cached or `defineProjection()`-provided PptxPackageModel. This validation should check
  package parts, required/conditional requirements, relationships, content types, serializable payload
  shapes, and media/build prerequisites without redoing authoring or projection semantics.
- Report pre-Render package consistency validation failures as `E_RENDER_*` diagnostics because they
  describe whether the projected package model can be serialized in Render, not whether authoring
  semantics could be projected.
- Allow Pptx Package Build Artifacts to carry part-local build notes or diagnostic references, such
  as emitter fallback notes or media copy details. Aggregate diagnostics and stage success/failure in
  Render Result so callers do not have to scan the build artifact collection to understand render
  diagnostics.
- Create Pptx Package Build Artifacts only for successfully materialized package-part bytes. If a
  part emitter fails or required media bytes are missing, do not create a reusable failed artifact;
  report the failure in Render Result diagnostics and mark the Assembly Plan entry as missing or
  failed with a structured reason.
- Preserve successfully built Pptx Package Build Artifacts in the Pipeline Artifact Collection even
  when the overall Render fails and no final PPTX artifact is returned. A later Render should be able
  to reuse completed parts after the missing or failed entries are fixed.
- Treat the final PPTX ZIP bytes as a Rendered Artifact returned by Render, not as the primary cached
  Pipeline Artifact. In v0.8.0, reuse should happen at package-part build artifact granularity, and
  final ZIP bytes should be assembled from the current Assembly Plan for each successful Render.
- Make ZIP assembly streaming-first internally. The public Render API can still return `Uint8Array`
  bytes or write to an output path, but the ZIP writer should consume the ordered Assembly Plan entry
  stream instead of first building a second unordered whole-package byte map. Do not expose
  "streaming ZIP" as a separate author-facing mode merely because the implementation is streaming.
- Separate streaming ZIP assembly from rendered-artifact collection. The ZIP writer should consume
  Assembly Plan entries and write chunks to a sink. A `Uint8Array` Rendered Artifact should be
  produced by a collecting sink, while output-path or future stream/file-handle integrations can use
  different sinks without changing package assembly semantics.
- Keep ZIP/artifact sinks runtime-neutral in core. A collecting `Uint8Array` sink can live in core;
  Node filesystem output should be isolated behind a thin runtime boundary or adapter so fs APIs do
  not leak into the PPTX package writer core.
- Preserve the existing `render({ output: "deck.pptx" })` API as an optional path-based file-write
  side effect. Render should still produce `RenderResult.artifact.bytes` as the primary output. In
  runtimes without path-based file writing, a string `output` should produce an output-write
  diagnostic while successful package generation can still return artifact bytes.
- Keep `RenderResult.ok` derived only from error diagnostics; do not add separate `artifactOk` or
  `outputOk` booleans. If package generation succeeds but an explicit output write fails or is
  unsupported, return artifact bytes, omit written output info, add an output-write error diagnostic,
  and set `ok: false`.
- If the rendered-artifact sink fails while ZIP bytes are being written, do not return partial ZIP
  bytes as a Rendered Artifact. Keep successfully materialized package-part build artifacts reusable,
  report the sink failure in Render Result diagnostics, and only return final artifact bytes when the
  ZIP sink completed successfully.
- When Render needs both `RenderResult.artifact.bytes` and a path-based output side effect, generate
  the ZIP once and tee chunks to both a collecting sink and a file sink. If the file sink fails after
  the collecting sink completes, return the artifact bytes, omit written output info, report the
  file-write error, and set `ok: false`.
- Distinguish ZIP source failures from individual sink failures. A file sink failure should be
  recorded and should not automatically abort an independent collecting sink, so Render can still
  return artifact bytes when the ZIP source and collecting sink complete. A source failure, such as a
  missing required entry or ZIP generation error, still prevents a final Rendered Artifact.
- Keep Render diagnostic code taxonomy small for assembly/output failures. Use one package assembly
  error family such as `E_RENDER_PACKAGE_ASSEMBLY_FAILED` for ZIP source problems that prevent a
  final Rendered Artifact, and one output write error family such as `E_RENDER_OUTPUT_WRITE_FAILED`
  for side-effect sink failures where artifact bytes may still exist. Store detailed reasons such as
  missing build artifact, assembly plan inconsistency, unsupported path output, or file permission
  failure in Assembly Plan entry reasons, diagnostic labels, notes, or help rather than multiplying
  diagnostic codes.
- Model Assembly Plan entry status reasons as typed debug/reuse reasons with structured details, not
  as public diagnostic code families. Keep entry status and reasons separate: status values describe
  the result, such as `reused`, `rebuilt`, `missing`, or `failed`; reason values
  explain why, such as `missingArtifact`, `partFingerprintChanged`, `writerFingerprintChanged`,
  `emitterFingerprintChanged`, `mediaBytesChanged`, `packagePartIdChanged`, `compressionChanged`, or
  `sinkFailed`, with
  details such as part identity, package path, and fingerprint comparisons attached as data.
- Distinguish `missing` from `failed` in Assembly Plan entry status. `missing` means a required
  input was not available before execution, such as a missing build artifact or media bytes.
  `failed` means Render attempted an emitter, ZIP source, or sink operation and that operation
  failed.
- Validate the Assembly Plan for required missing entries before starting streaming ZIP output.
  Required missing entries should produce `E_RENDER_PACKAGE_ASSEMBLY_FAILED` without writing partial
  ZIP bytes. Streaming-time failures should be limited to operations that cannot be known before
  execution, such as sink or ZIP emission failures.
- Include the evaluated requirement classification on Assembly Plan entries. Missing required or
  conditionally-required entries block Render; missing optional entries may appear in Render
  inspection or warnings without producing a corrupted package. This keeps room for future optional
  support parts such as notes, comments, custom XML, or compatibility-only entries.
- Add Pptx Theme Part and Pptx Theme Projection model slots so deckjsx Theme-derived defaults can
  later flow into PPTX theme support structure without conflating Theme with raw PowerPoint theme
  XML. v0.8.0 can start with minimal structured theme support while preserving the projection bridge.
- Keep theme, slide master, and slide layout support parts as minimal structured payloads rather than
  placeholders. Theme Projection needs concrete support-part destinations even when v0.8.0 does not
  implement the full richness of PowerPoint theme/master/layout XML.
- Store Pptx Theme Projection trace data showing which deckjsx Theme values were projected into PPTX
  theme support, which were resolved into concrete drawing properties, and which remain unprojected
  warnings. This makes v0.8.0 a stable bridge for later richer theme generation rather than a
  dead-end minimal theme part.
- Keep theme projection trace at two levels: a whole-theme mapping summary on Pptx Theme Projection,
  and property-level provenance on projected drawing values such as fill, stroke, typography, and
  defaults. Sandbox tooling should be able to distinguish Theme-derived values from StyleSheet,
  inline, or output-default values.
- Represent Theme-derived drawing values with room for both resolved concrete values and PPTX theme
  references, such as scheme color or font scheme references. The v0.8.0 writer may serialize the
  concrete value first where that is safer, but the Pptx Package Model should not erase the theme
  reference needed for richer PowerPoint theme behavior later.
- Treat unprojected or partially projected Theme values as Project warning diagnostics that do not
  make `ProjectResult.ok` false. Keep these distinct from package-structure errors, such as a
  required Pptx Theme Part being structurally invalid or missing from a package that needs it.
- Use Theme design/default vocabulary as the candidate source for Pptx Theme Projection. Do not
  promote local StyleSheet rule results into PPTX Theme Parts merely because they resolved to common
  colors, fonts, or fills. StyleSheet-derived values should remain drawing-property provenance unless
  a later explicit authoring feature says otherwise.
- Include Theme Defaults as Pptx Theme Projection candidates. Projection should decide whether a
  given default maps to PPTX theme support data, default text/body style, layout/master defaults, or
  concrete drawing properties, and record that decision in the theme projection trace.
- When Theme-derived defaults are projected through layout or master inheritance instead of written
  directly on a drawing node, expose effective/provenance inspection data on affected drawing values.
  Sandbox tooling should be able to trace a value through Theme -> Pptx Theme Projection ->
  layout/master default -> effective drawing value.
- Keep package-owned defaults and concrete drawing properties in the Pptx Package Model, while
  exposing effective projected style/provenance as a derived Project Result inspection view. Do not
  duplicate every inherited effective value into drawing nodes just to make inspection easier; preserve
  PPTX package ownership and explain the composed result through the inspection view.
- Keep Effective Projected Style View separate from Resolved Style Inspection View. Resolved style
  explains CSS-like authoring style resolution before output projection; effective projected style
  explains PPTX-specific theme/layout/master/default inheritance and concrete projected drawing
  values after projection.
- Treat Effective Projected Style View as a cross-output projection concept, but keep concrete view
  shapes owned by each Projected Document Model. PPTX can expose a PPTX-specific effective style
  view without forcing PDF or later formats into the same inheritance model.
- The direct writer should not read Effective Projected Style View. HMR, sandbox, and inspection
  tooling may read it to explain effective values or why a part changed, but dirty decisions should
  remain grounded in Pptx Package Model fingerprints and dependency fingerprints.
- Fingerprint Theme projection dependencies at both whole-theme and value-group granularity where
  practical. Preserve room for groups such as color scheme, font scheme, format scheme, and defaults
  so a color-only Theme change does not have to invalidate typography-only package parts once HMR
  becomes more precise.
- Keep deckjsx Theme groups and PPTX theme groups distinct in the projection trace. Fingerprint
  input groups according to deckjsx Theme vocabulary, such as colors, typography, shape defaults, or
  text defaults, then record how those groups map into PPTX color schemes, font schemes, format
  schemes, default text styles, layout/master defaults, or concrete drawing properties. Do not assume
  the mapping is one-to-one.
- Create a default Pptx Theme Projection even when the Deck has no authored Theme. PPTX still needs
  required theme support parts, and Effective Projected Style View should be able to explain
  deckjsx/PPTX default colors, fonts, and defaults rather than treating them as provenance-free
  writer behavior.
- In v0.8.0, the concrete writer may emit a single default PPTX theme part, but the Pptx Package
  Model should allow multiple Pptx Theme Parts. Multiple theme part operation is a realistic future
  need for multiple slide masters, mounted child Deck themes, source-specific branding, imported PPTX
  templates, or compatibility adapters.
- Give Pptx Theme Projection identity enough information to evolve beyond `theme1.xml`, such as
  theme source/origin and projected theme role. Even when v0.8.0 coalesces everything into one default
  theme part, the trace should preserve which source/theme inputs contributed to it.
- Model theme projection identity with source/theme origin and an extensible purpose rather than a
  narrowly closed role enum. The v0.8.0 default theme projection is one purpose; future source-theme,
  imported-template, compatibility, or master-specific projections should fit without renaming the
  identity model.
- Store dependencies from slide master and slide layout parts to the Pptx Theme Projection they use.
  In v0.8.0 these may all point at the default theme projection, but the relationship should be
  explicit so future multiple-theme packages can choose theme ownership per master/layout.
- Invalidate package parts on Theme changes according to dependency kind, not by marking every slide
  dirty. A change that only updates PPTX theme XML may dirty the theme part and dependent summaries;
  a change projected as concrete drawing properties dirties the affected slide/layout/master parts;
  a value serialized by theme reference should leave room for the referencing drawing parts to remain
  reusable when their XML does not change.
- Feed Pptx Theme Projection from Theme Snapshot, Theme Defaults, and resolved style provenance, not
  from JSX authoring directly. The flow should remain declarative authoring -> graph/style resolution
  -> PPTX projection, with Theme Projection deciding what theme/default information the PPTX package
  needs.
- Use the active Theme Snapshot after Deck composition and theme merging as the projection input for
  a given source/slide context. Preserve source, merge, and original theme provenance in the trace so
  sandbox and HMR tools can explain where a projected theme value came from.
- Reuse provenance vocabulary where helpful, but keep Theme Projection trace distinct from resolved
  style winner provenance. Resolved style provenance answers which CSS-like authoring source won a
  property; Theme Projection trace answers how Theme groups and defaults map into PPTX theme support,
  layout/master defaults, or concrete drawing properties.

Drawing and CSS-like paint projection:

- Compute Projected Paint Order before choosing PPTX emission targets.
- Preserve supported CSS-like paint inputs as distinct model fields, including z-index, graph/layout
  order, generated layer role, template/common drawing source, layout-anchor relation,
  visibility/display filtering result, opacity/transparency inputs, transform inputs, and fallback
  reasons.
- Store final `paintOrderIndex` and paint-order inputs on projected drawing nodes.
- Treat `paintOrderIndex` and `paintOrder.siblingOrder` as separate facts: `paintOrderIndex` is the
  final PPTX drawing order, while `siblingOrder` is the graph/layout order used as a z-index
  tie-breaker and HMR/sandbox explanation input.
- Expose paint inputs through `deckjsx/inspect`, not the root authoring API.
- Store node-local unsupported or unobserved paint semantics on the affected drawing node and
  aggregate them into Project Result warnings/summaries.
- Keep unsupported/unobserved paint semantics as warnings that do not make `ProjectResult.ok` false.
- Preserve `display: none` as Filtered Projection Records in Project Result inspection summaries,
  not drawing nodes.
- Preserve `visibility: hidden` as drawing nodes with visibility state.
- Project concrete PPTX-domain transform, fill, stroke, picture fill, transparency, text body,
  hyperlink, geometry, and effect data for the writer to serialize without reinterpreting authoring
  styles.

Template, layout, and composed visual order:

- Add Pptx Slide Layout Projection for each Deck-owned Slide Template and a default blank layout for
  untemplated slides.
- Ensure every slide has a slide layout relationship.
- Emit a single default slide master in v0.8.0 while keeping the model capable of multiple masters.
- Represent Template Areas as layout anchors with area identity, Template Area Kind, frame, origin,
  and PPTX placeholder projection/fallback data.
- Preserve generic Template Areas as anchors without semantically disguising them as body/title
  placeholders.
- Avoid visible PowerPoint editing prompt text for anchors that exist only to preserve deckjsx
  template structure.
- Derive template layout Package Part Identity from Source Identity plus Slide Template name.
- Fingerprint layout parts from template structure and projected anchors, not slide authored content.
- Store layout anchor references on area-bound drawing nodes separately from origin.
- Store layout identity and relevant layout/anchor fingerprint dependencies on slide parts.
- Allow template-owned common drawing in the model. Prefer layout-part emission, but expand to slide
  emission when required to preserve Projected Paint Order.
- Store Pptx Emission Target on drawing nodes and expose a derived Composed Visual Paint Order View
  for inspection without duplicating layout-owned drawing nodes into slide drawing ownership.

Direct writer and package emission:

- Implement direct generation of required PPTX ZIP entries, including content types, root rels,
  docProps, presentation, presentation rels, slides, slide rels, media, theme, slide master, slide
  layout, view properties, and presentation properties.
- Move current OOXML patch knowledge into first-class XML part emitters.
- Implement a deckjsx-owned byte/chunk-oriented XML writer with pre-encoded static chunks and
  dynamic escaping/numeric append helpers.
- Treat XML emission as a direct writer serialization procedure, not as a second structured model
  below PptxPackageModel. Do not introduce an XML IR, XML DOM, or sandbox-editable XML-shaped tree
  that would make PptxPackageModel a redundant intermediate layer.
- Organize XML emission as PPTX-domain emitter helpers over a low-level byte/chunk writer. Helpers
  should follow PptxPackageModel concepts such as text boxes, pictures, shape properties,
  relationships, theme, slide layouts, and package manifests, while raw tag/attribute writing stays
  below that layer.
- Optimize XML generation for speed: prefer pre-encoded static chunks for common OOXML tags,
  namespace blocks, and fixed markup; avoid allocating XML node objects; avoid building large
  whole-slide strings before encoding; use stable attribute order; and append escaped strings and
  numeric values directly into byte chunks where practical.
- Treat the early direct writer as a bootstrap only if it temporarily builds strings. The v0.8.0
  completion target is the byte/chunk-oriented emitter path above, with benchmarks guarding against
  accidentally preserving a slow XML-string architecture.
- Keep writer modules separate from projection modules.
- Treat `src/writers/pptx/` as a PPTX Writer Composite Node. It may contain internal build-artifact,
  XML emission, package assembly, ZIP, and sink/effect-boundary graphs, but its external contract
  should be the direct PPTX writer adapter/render function. It should consume PptxPackageModel
  snapshots and projection validation results, not projection internals.
- Put build artifact reuse and invalidation policy in `src/writers/pptx/build.ts` or an equivalent
  focused internal module. It should compare
  package part fingerprints, writer/emitter fingerprints, media byte fingerprints, and existing build
  artifacts, then decide whether to reuse or call an emitter. Keep `src/writers/pptx/emit/` focused
  on generating bytes for a requested part without knowing cache policy.
- Split writer assembly internally into expected entry planning and final assembly planning.
  Expected entry planning derives ordered entries, paths, requirement classification, and package
  semantics from PptxPackageModel before build/reuse. Final assembly planning combines expected
  entries with build artifact availability, status, reasons, compression decisions, and sink
  readiness. Expose only the final Pptx Package Assembly Plan through Render inspection/debug output.
- Keep `src/writers/pptx/zip/` as the owner of ZIP format policy, fflate integration, and conversion
  from semantic compression modes such as `fast` or `small` into library-specific settings. Build,
  emit, and projection nodes should not import fflate or know numeric compression levels.
- Keep runtime-neutral sink interfaces, collecting sinks, and tee sinks in `src/writers/pptx/sinks/`.
  Put Node filesystem output behind a separate thin runtime boundary, such as `src/runtime/node/` or a
  clearly isolated Node output module, so fs imports do not leak into the PPTX writer core.
- Keep `src/adapter.ts` as the public writer adapter factory boundary. Export the direct `pptx()`
  factory and shared adapter/result option types there, remove the core `pptxgenjs()` factory, and do
  not re-export direct writer internals such as emitters, ZIP adapters, sinks, or build artifact
  managers.
- Keep the Adapter Interface small enough that adding future output writers does not expose PPTX
  writer implementation details as public contract. `pptx()` may configure semantic writer options,
  but build artifact reuse, Assembly Plan internals, fflate settings, sink topology, byte writer
  helpers, emitter fingerprints, and runtime-specific file output modules stay behind the writer
  composite node.
- Treat public package exports as an implementation review target. `deckjsx` should remain the
  Authoring Interface, `deckjsx/adapter` should remain the writer adapter factory seam, and
  `deckjsx/inspect` should remain the Inspection Interface. Add tests that fail when direct writer
  internals, projection project internals, or debug-only derived views leak through the wrong seam.
- Keep `src/projection/registry.ts` as the format-to-projection dispatch node for future output
  formats. It should call only public entry points of the PPTX Projection Composite Node and should
  not own PPTX model logic, package validation, summary construction, or shape-specific rules.
- Keep `src/pipeline-runner.ts` as the compile/project/render orchestration node. It owns stage
  materialization, diagnostics composition, artifact collection policy, and writer adapter dispatch,
  but it should not own PPTX-specific build artifact reuse, Assembly Plan construction, XML emission,
  ZIP policy, or package validation details.
- Keep Pipeline Artifact Collection as a storage/snapshot collection node. It may store graph,
  projection, asset, and Pptx Package Build Artifact entries, but it should not own PPTX-specific
  invalidation policy, Assembly Plan status, ZIP policy, or build reuse decisions. Those remain in
  the PPTX writer build/assembly nodes.
- Implemented evidence: the Pptx Projection Artifact package dependency snapshot records a
  reason-bearing dependency edge list plus dependency/dependent indexes for the same dependency
  classes that Project Inspection Summary exposes: relationship targets, content-type overrides,
  requirement dependencies, and dependency-fingerprint targets. This keeps future HMR and sandbox
  invalidation readers grounded in the projected PptxPackageModel snapshot rather than a thinner
  artifact index that forgets required-part or fingerprint-derived dependencies.
- Implemented evidence: Project Inspection Summary and Pptx Projection Artifact dependency edges
  now come from the same package-part topology helper. This keeps public inspection explanations and
  internal artifact indexes from drifting into different dependency vocabularies as future package
  requirements, media topology, or fingerprint policies change.
- Delete the `pptxgenjs` XML patching layer rather than porting it as a new monolithic patch node.
  Move the knowledge it contains into proper owners: projection should compute concrete fill, stroke,
  effect, crop/source-rect, opacity, line-cap/join/dash, and relationship data in PptxPackageModel;
  XML emitters should serialize those concrete fields directly; XML ordering details belong to
  emitter formatting policy; ZIP patching disappears into direct package assembly.
- Keep existing manifest construction logic, such as `src/projection/pptx/manifest.ts`, inside the
  PPTX projection module set and have `src/projection/pptx/project.ts` call it directly. Manifest
  payload types belong to the model node; manifest construction logic belongs to the projection
  process and should not be imported directly by writers or registry code.
- Remove `src/writers/pptxgenjs.ts` from the v0.8.0 core source tree rather than keeping it as a
  temporary internal adapter. Any pptxgenjs-based comparison should live in isolated CI/test helper
  code, such as `.github/compat/pptxgenjs/`, or in a future separate compatibility package.
- Keep `src/projection/pptx/index.ts` as the projection entry barrel, but use explicit exports rather than
  `export *` from every internal submodule. Export the public projection/model/inspection/validation
  surface needed by registry, pipeline, inspect, and tests without leaking internal project, emit, or
  helper modules.
- Keep detailed projection inspection exports, including PptxPackageModel, paint inputs, Package Part
  Order Keys, Effective Projected Style View, Composed Visual Paint Order View, and package
  summaries, behind a dedicated inspection entry such as `deckjsx/inspect`. Do not add them to the
  root authoring export surface.
- Use `fflate` through an internal replaceable ZIP writer, without exposing a public `zipWriter`
  option.
- Reuse valid Pptx Package Build Artifacts by package part fingerprint, writer fingerprint, and media
  byte fingerprints where needed.
- Make output deterministic where practical: ZIP order, ZIP metadata/timestamps, compression mode,
  relationship and attribute order, generated ids, media paths, and docProps timestamps.
- Add writer hot-path benchmarks before treating v0.8.0 as complete. Benchmarks should separately
  measure projection, asset probing/loading cache hits, package-part XML emission, media part
  copying, build artifact reuse decisions, ZIP assembly, collecting sink output, path side-effect
  writing, and detailed Derived Projection Inspection View generation.
- Measure both cold and warm paths. The cold path proves direct generation is fast enough without
  `pptxgenjs`; the warm path proves package-part fingerprints, Asset Artifacts, and build artifacts
  are useful for sandbox and future HMR loops.
- Keep benchmark fixtures representative rather than tiny only: at least a minimal deck, a text-heavy
  deck, an image-heavy deck, a template/layout deck, and a mixed CSS-like paint deck with backgrounds,
  strokes, opacity, and z-order.
- Record benchmark budgets in the test or benchmark file once baseline numbers are known, and make
  regressions visible in CI or required local checks. Exact budgets can be tuned after the first
  direct writer implementation, but the benchmark categories are part of v0.8.0 scope.

Validation and generation regression safety:

- Add semantic projection tests from Semantic Author Graph to PptxPackageModel.
- Add writer unit tests for XML parts, relationships, content types, media parts, deterministic ids,
  fingerprints, and deterministic ZIP bytes.
- Add visual/rendering regression tests for geometry, z-order, layout, overflow, images, fills,
  gradients, strokes, effects, typography, lists, RTL/vertical/baseline, docProps, and raster output.
- Use category-specific tolerances for visual regression tests rather than a single pixel-perfect
  threshold. Geometry, text, color/fill, and image-crop fixtures should each combine semantic
  assertions and raster tolerances appropriate to the risk they cover.
- Add required GitHub Actions generation regression coverage. A pinned `pptxgenjs` installed in
  `.github/compat/pptxgenjs/` can be used as one regression oracle because it represents the previous
  output path, but the purpose is validating direct writer output quality rather than preserving
  pptxgenjs compatibility as a product goal.
- Treat PPTX generation validation as a multi-oracle strategy: direct OOXML fixtures, semantic
  package assertions, rendered raster comparisons, and pinned `pptxgenjs` comparisons can each cover
  different risks. `pptxgenjs` is useful because it is easy to wire into CI for concrete migration
  regression cases, not because it is the only or final definition of correct deckjsx output.
- Upload generation regression failure artifacts from CI so visual or package regressions are
  inspectable.
- Update README, public docs, skill docs, and type tests so core no longer presents `pptxgenjs` as
  the built-in or temporary writer.
- Add a public API export audit test that imports from package entry points the same way users do.
  The test should fail when `pptxgenjs`, writer internals, fflate settings, XML emitter helpers,
  Assembly Plan builders, or Derived Projection Inspection Views leak through the wrong entry point.
- Add a root package surface guard that checks the package export map, root runtime dependencies, and
  core source tree for accidental `pptxgenjs` reintroduction. This is separate from the isolated
  `.github/compat/pptxgenjs/` oracle package, which is allowed to depend on `pptxgenjs`.
- Add performance regression coverage that can run locally and in CI without requiring PowerPoint.
  Visual/raster checks can use LibreOffice where available, but XML emission, ZIP assembly,
  deterministic bytes, and artifact reuse benchmarks should not depend on GUI tooling.

v0.8.0 public and performance architecture review:

- Public surface review result: the design remains acceptable only if ordinary users can stay on the
  `deckjsx` Authoring Interface. Root exports should contain Deck authoring, stage result contracts,
  diagnostics, styles, themes, assets, and JSX types that authors need, while Pptx Package Model
  inspection stays behind `deckjsx/inspect` and writer selection stays behind `deckjsx/adapter`.
- `pptx()` is the built-in adapter factory, but it should not make PPTX writer internals public.
  XML emitters, byte/chunk writers, fflate settings, ZIP adapters, sink interfaces, build artifact
  reuse policy, Assembly Plan builders, and runtime path-output modules remain internal modules.
- `WriterRenderContext` should stay an opaque public context. The direct writer can receive internal
  Render context data through it, but adapter authors should not have to understand Asset Artifact or
  Pptx Package Build Artifact storage shapes just to implement a writer.
- `PptxPackageModel` remains an Inspection Interface data model, not a mutation API and not an XML
  emission model. It should be concrete enough to explain PPTX package structure and graph-derived
  drawing decisions, but public users should not be asked to construct raw OOXML-like trees.
- Result-first stage APIs are part of the public contract. Adding async Project, direct PPTX output,
  path-output side effects, or package assembly diagnostics should not create mode-dependent result
  shapes or extra `ok` variants. Diagnostics remain the source of truth, and `ok` remains derived
  from error diagnostics.
- `deck.useAssets(loader)` is public because it is author/runtime configuration. Asset Artifacts are
  not public authoring vocabulary. This keeps filesystem, framework-public URL, authenticated URL,
  and app media behavior outside core while preserving a multi-runtime core contract.
- Performance review result: the architecture is acceptable only if hot-path work moves downward and
  stays keyed. Compile produces graph snapshots, Project produces structured package parts and
  fingerprints, Render produces reusable package-part bytes and an Assembly Plan, and ZIP assembly
  consumes that plan. Rebuilding a final PPTX should not imply re-projecting or re-serializing every
  part when fingerprints prove reuse is valid.
- XML emission must be treated as serialization, not as a new model layer. A second XML IR, DOM, or
  sandbox-editable XML tree below Pptx Package Model would make the Pptx Package Model shallow and
  would add avoidable allocation cost. The desired implementation is PPTX-domain emitters over a
  byte/chunk writer with pre-encoded static chunks, deterministic formatting, direct escaping, and
  lightweight invariant checks.
- ZIP generation should be streaming-first internally and Assembly Plan driven. The public API may
  return `Uint8Array` bytes and optionally write a path, but the implementation should avoid
  building a separate whole-package byte map as the primary abstraction. The ZIP module should
  consume ordered entries and collect ZIP chunks internally when the public result needs bytes.
- Compression is assembly policy, not package-part byte policy. Changing compression should reassemble
  the final ZIP while reusing package-part Build Artifacts whose package fingerprints,
  writer/emitter fingerprints, and media byte fingerprints still match.
- Derived Projection Inspection Views, composed paint explanations, and detailed reuse explanations
  are valuable for sandbox and future HMR, but they should be lazy, detail-gated, or summary-based
  on default paths. Debug visibility must not become mandatory render cost.
- Project and Render now have a concrete detail gate:
  `inspection: "summary" | "none" | "details"`. `deck.project()` keeps the current summary by
  default, `deck.project({ inspection: "none" })` skips Project Inspection Summary materialization,
  and `deck.project({ inspection: "details" })` adds detail-gated Derived Projection Inspection
  Views such as composed paint order, effective projected styles, package dependency invalidation,
  paint fallback aggregation, and theme projection provenance. Render's internal Project step uses
  `inspection: "none"` because Render does not expose the Project summary, and
  `deck.render({ inspection: "none" })` omits the Render inspection summary while preserving the
  artifact/result/diagnostic shape.
- Performance gates should measure cold and warm paths separately. Cold-path checks protect direct
  writer replacement quality; warm-path checks protect artifact reuse, asset reuse, Assembly Plan
  stability, and future sandbox/HMR loops.

v0.8.0 implementation checkpoints already reflected in the current code:

- Project inspection summaries now preserve `display: none` filtering as filtered projection records
  instead of turning those nodes into hidden PPTX drawing nodes.
- Projected PPTX drawing values can carry overflow clipping metadata: authored/original frame, clip
  frame, visible frame, and clipping strategy.
- CSS-like clipping fidelity gaps are warning-first. v0.8.0 should preserve clipped geometry and any
  observed transform/compositing inputs in the Pptx Package Model or Project summary, then warn when
  the current writer can only emit an approximation. Exact vector-mask or rasterized-subtree
  strategies are post-v0.8 work unless the package would otherwise be structurally invalid.
- Clipping + projected transform now has the first warning connection point: affected nodes keep
  `clip`, `rotation`, `flipH`, and `flipV` where applicable, and Project diagnostics/summary records
  the `clipping` unsupported semantic instead of treating the fallback as exact CSS rendering.
- Clipped image source-rectangle projection now has the same warning connection point when projected
  rotation/flip is present. This keeps image-specific `sourceFrame`, explicit `crop`,
  `objectPosition`, and `fit` data inspectable while warning that the writer currently applies
  source-rectangle clipping before the transform rather than clipping the transformed visual image.
- Transform-created stacking context now has a warning connection point on transformed group nodes.
  Project preserves the concrete transform and paint-order inputs while making the missing full CSS
  stacking-context evaluation visible to diagnostics and summary consumers.
- CSS-like `filter`, `mixBlendMode`, and `isolation` inputs now have typed authoring and warning
  connection points. Non-default values are preserved as unsupported semantics so future compositing
  work can decide between native PPTX effects, grouped vector expansion, or rasterized subtree
  fallback.
- Opacity-created stacking context now has a warning connection point on non-group drawing nodes.
  Project preserves the concrete opacity value for writer emission while making the missing full CSS
  stacking-context evaluation visible to diagnostics and summary consumers.
- Required PPTX support parts are no longer opaque placeholders only. Theme, slide master, slide
  layout, presentation properties, and view properties use structured support payloads that writers
  can serialize without inventing package semantics.
- Pptx Theme Projection now records a first concrete trace: default theme support groups plus
  property-level Theme Default winners that were projected as concrete drawing properties.
- Template-derived slide layouts are now projected as package parts, not only as slide-local frame
  resolution. Each deckjsx Slide Template gets a template-owned slide layout part with
  `layoutAnchors`, untemplated slides use the default blank layout, and slides using a template point
  at the corresponding layout relationship.
- Slides now retain dependency fingerprints for the slide layout parts that supplied their layout
  anchors, so changing a Template Area frame or kind invalidates both the layout part and dependent
  slide package parts for future HMR/build artifact reuse.
- Project now preserves representative unsupported CSS-like paint/transform semantics as node-local
  `unsupportedSemantics` plus nonblocking Project warnings instead of turning the whole projection
  into an error.
- The direct writer has an internal fflate ZIP module with collecting, side-effect tee, and Node file
  output sinks. Public Render still returns `RenderedArtifact.bytes`; path output remains a runtime
  side effect and should not expose streaming ZIP as a public mode.
- The isolated pinned `pptxgenjs` generation regression oracle now lives under
  `.github/compat/pptxgenjs/`, with a required workflow that compares semantic PPTX package signals
  against deckjsx's direct writer without adding `pptxgenjs` to root runtime dependencies.
- Public surface regression coverage now locks the root package export map to `deckjsx`,
  `deckjsx/adapter`, `deckjsx/inspect`, the JSX runtimes, and `package.json`; it also verifies that
  the root package has no `pptxgenjs` dependency and that the core source tree has no `pptxgenjs`
  writer import path.
- The public sample now depends on the local package with `deckjsx: "file:.."`, its lockfile no
  longer resolves the historical registry `deckjsx@0.2.0` package or its `pptxgenjs` dependency, and
  CI/release gates run the sample smoke after `bun run build` so it exercises the built direct-writer
  package.
- Asset loader composition, invalid probe/load result handling, Media Allocation Key reuse, and
  same-slide media relationship reuse are now part of the Project/Render path. Registered loaders run
  before the built-in multi-runtime fallback, Render uses the Project-winning resolver scope, and
  invalid loader fields become stage-specific diagnostics.
- Runtime path output is now isolated behind a runtime output boundary. Node filesystem imports do
  not sit in the PPTX writer core, and unavailable path-output runtimes use
  `E_RENDER_OUTPUT_WRITE_FAILED` with `reason=runtimeOutputUnavailable`.
- Package Part Requirement metadata now belongs to PptxPackageModel parts. Projection records the
  status, evaluated `required` boolean, stable reason, condition key, and dependency references, and
  Render Assembly Plan summaries consume that projected metadata instead of recomputing requirement
  policy locally.
- Package Part Order Key metadata now belongs to PptxPackageModel parts as structured projection
  data: package order group, numeric group order, projection sequence, package path, and stable
  encoded value. Render sorts by the projected encoded value instead of deriving writer-local order.
- Render Assembly Plan entries now preserve both expected-entry metadata and final-entry build
  result metadata. The public summary keeps flat compatibility fields while also exposing nested
  `expected` and `final` records for sandbox, diagnostics, and future HMR reuse explanations.
- Pptx Package Build Artifacts now carry structured `buildNotes` for successful package-part byte
  materialization. Notes record rebuild reason, part kind, byte length, writer/emitter/part
  fingerprints, dependency fingerprint count, optional media byte fingerprint, and diagnostic code
  references.
- Render Assembly Plan entry summaries now expose a byte-free `build` explanation derived from the
  matched or newly created Build Artifact. It includes part, writer, emitter, dependency, media-byte,
  and diagnostic-code fingerprints without exposing Build Artifact bytes or storage internals, so
  HMR/sandbox callers can explain reuse/rebuild decisions from `render.summary.assembly.entries`.
- The `build` and `previousBuild` summaries include dependency fingerprint details, not only a count,
  so dependency-driven rebuilds can identify which package part dependency changed without scanning
  the internal Build Artifact collection.
- Media Build Artifact summaries also record the media byte fingerprint source:
  `projectedMetadataHash`, `loadedAssetHash`, or `byteHash`. This lets warm renders explain whether a
  media part was reused from trusted projected metadata without calling `load()`, from loader-provided
  loaded metadata, or from direct byte hashing.
- Rebuilt Assembly Plan entry summaries now also expose a byte-free `previousBuild` explanation when
  a stale Build Artifact existed. This lets HMR/sandbox callers compare previous and current part,
  writer, emitter, dependency, and media-byte fingerprints for invalidation reasons such as
  `partFingerprintChanged`, `dependencyFingerprintChanged`, `emitterFingerprintChanged`, and
  `mediaBytesChanged` without exposing stale artifact bytes.
- `RenderAssemblyBuildSummary` is exported through the root stage-result type surface because it is
  part of the public Render Result explanation contract. The underlying Pptx Package Build Artifact
  storage type remains an internal pipeline artifact and must not be exported from root, adapter, or
  inspection entry points.
- Render summary now includes output side-effect readiness/result metadata. `summary.output` records
  whether path output was requested, skipped because artifact bytes were unavailable, unavailable
  because the runtime cannot write paths, failed during writing, or completed successfully.

v0.8.0 completion gates:

- Core package has no runtime `pptxgenjs` dependency and no public `pptxgenjs()` adapter export.
- `pptx()` is the default built-in writer path and produces valid PPTX packages without delegating
  package generation to another presentation library.
- `project()` is async and asset-aware, with `deck.useAssets(loader)` feeding Project and Render.
- Pptx Package Model has been rewritten around package parts, drawing nodes, relationships, media
  parts, theme/layout/master support, identities, fingerprints, order keys, and diagnostics rather
  than the current writer-shaped payload.
- Slide Template projection preserves Template Area meaning through template-derived slide layout
  parts, non-visible layout anchors, slide layout relationships, and dependency fingerprints. Generic
  areas remain generic anchors instead of being disguised as title/body placeholders.
- Render builds reusable package-part bytes, creates an Assembly Plan, assembles ZIP output through
  the internal fflate-backed writer, and keeps path output as a side effect.
- Public seam tests, generation regression tests, deterministic byte tests, and writer hot-path
  benchmarks exist and are documented.
- Release workflow runs package version validation, check, test, build, strict direct PPTX writer
  benchmark, and the isolated pinned `pptxgenjs` oracle comparison before pack/publish.
- Known unsupported or unobserved CSS-like/PPTX fidelity gaps are represented as diagnostics,
  fallback reasons, or post-v0.8 follow-up items rather than being silently erased from projection.
- Public and performance architecture review stays documented as a release gate: newly exposed names
  must belong to the Authoring Interface, Adapter Interface, or Inspection Interface, and hot-path
  changes must preserve keyed Project/Render reuse instead of adding eager debug or XML-model work.

### v0.8.0 Implementation Backlog

This backlog is the concrete implementation inventory for finishing v0.8.0. It exists so the large
writer replacement does not get simplified by accidentally dropping connection points that future
HMR, sandbox, or CSS-like rendering work needs.

When this section is updated, keep each item in one of three states: implemented for the current
v0.8.0 slice, remaining before the v0.8.0 release, or deliberately post-v0.8 follow-up. Do not
resolve an item by deleting the connection point; preserve the projected data, warning, fallback
reason, or follow-up note that keeps future HMR, sandbox, and CSS-like rendering work possible.

- Finish PptxPackageModel schema exactness:
  - Keep Package Part Requirement projection-owned and covered by validation/tests as new package
    part kinds are added. Requirement metadata should continue to include status, evaluated
    `required`, stable reason, condition key, and dependency references, with Render Assembly Plan
    entries consuming the projected value rather than recomputing policy locally.
  - Keep Package Part Order Key projection-owned and covered by validation/tests as new package part
    kinds are added. Order keys should continue to expose package order group, numeric group order,
    projection sequence, package path, and stable encoded value so Render never invents package order
    locally.
  - Deepen discriminated payloads for support parts enough that theme, master, layout, docProps,
    view properties, presentation properties, relationships, content types, slides, and media are
    inspectable without introducing a separate XML model.
- Preserve drawing-node extension points for emission target, layout anchor reference, generated
  role, serialized PPTX identity, paint inputs, unsupported semantics, and fallback reasons even
  where v0.8.0 only emits a subset of those values.
- Treat committed drawing-node fields as pre-Render package consistency inputs. `kind`, `frame`,
  `opacity`, `rotation`, `visibility`, serialized PPTX identity, paint order, emission target,
  layout anchors, and unsupported semantic fallback records must be validated before writer
  emission so sandbox/defineProjection edits cannot leak invalid OOXML writer state.
  Image drawing `sourceFrame` dimensions are part of this committed writer-input surface because
  PPTX image source-rectangle emission cannot recover from missing, zero, negative, or non-finite
  dimensions without changing the projected image semantics. Projected image `crop` ratios are also
  part of this surface: validation should reject out-of-range ratios and crop sums that leave no
  source width or height instead of relying on picture XML emission to clamp them. Projected alpha
  inputs should likewise stay explicit: opacity is `0..1`, and transparency is `0..100`, with direct
  XML emitters rejecting out-of-domain values instead of silently clamping them.
- Treat committed text-style fields as concrete projected text domains before text XML emission.
  Numeric `fontWeight` should remain a CSS-compatible `1..1000` value; the text XML writer may map it
  to PPTX bold on/off output, but invalid projected weights should be validation/render errors rather
  than being collapsed to normal/bold by the writer. Text spacing should preserve its projected
  domain as well: point-based line and paragraph spacing are non-negative values, while
  `lineSpacingMultiple` is a positive multiplier before it becomes PPTX percentage spacing. Bullet
  `characterCode` is optional for the default bullet; when present, it must be an XML-writable
  Unicode code point written as hex so text XML emission cannot silently replace an invalid
  projected bullet with a fallback glyph.
- Keep slide package part payloads as their own validation boundary before drawing-node validation.
  `slideId`, optional `name`, native slide background, background layer list, and the drawing root
  should remain checked as slide payload structure; `slideId` is the projected OOXML presentation
  slide id and must stay in the `p:sldId/@id` numeric domain. Drawing-node metadata remains a nested
  validation concern. Broken slide payloads should become slide-payload package diagnostics instead
  of falling through to writer emitter failures.
- Keep notes master/notes slide placeholder payloads explicit until richer notes projection exists.
  Placeholder support parts should still state their role, placeholder status, and editability so a
  future notes writer can deepen the payload without changing package part identity or silently
  inventing missing support structure.

- Finish direct writer architecture:
  - Keep XML emission as serialization from PptxPackageModel, not a new XML IR or editable DOM layer.
  - Move toward byte/chunk-oriented PPTX-domain emitters with stable namespace/attribute ordering,
    direct escaping, and pre-encoded static OOXML chunks where practical.
  - Implemented for the current v0.8.0 slice: `XmlChunkWriter` reuses encoded static chunks for the
    XML declaration and repeated no-attribute open/empty/close tags, while dynamic text and
    attributes still flow through the escaping path. Writer tests pin deterministic escaping for the
    repeated static-tag path so the optimization cannot change emitted XML semantics.
  - Split writer work internally into build artifact reuse, part emission, expected entry planning,
    final Assembly Plan construction, ZIP emission, and sink/output side effects. These can live in
    one composite node while their control ownership remains clear.
  - Keep the Assembly Plan expected/final split covered as entry fields grow. Expected entries should
    describe projected package intent; final entries should describe build, reuse, missing, or
    failure result.
  - Keep Pptx Package Build Artifact `buildNotes` focused on successful package-part byte
    materialization. Build notes explain reusable artifact provenance; Render diagnostics and
    Assembly Plan entries remain the source for failed or missing entries.
  - Keep path output as a Render Output Side Effect. `summary.output` should explain readiness and
    result status without adding a second public success boolean or public sink selection API.

- Finish public and multi-runtime boundaries:
  - Keep `deckjsx` as the Authoring Interface, `deckjsx/adapter` as the writer-adapter factory seam,
    and `deckjsx/inspect` as the detailed inspection seam.
  - Keep `pptx()` as the default direct writer adapter and keep any `pptxgenjs` bridge outside the
    core package.
  - Keep filesystem, framework-public URL, authenticated URL, and app media behavior outside core
    through `deck.useAssets(loader)` and optional external adapters or recipes.
  - Keep streaming ZIP, fflate configuration, XML emitters, sink topology, Assembly Plan builders,
    and runtime path-output modules internal.
  - Treat public API review as a concrete checklist when adding or moving exports:
    - root exports are authoring, diagnostics, assets, JSX, and stage result contracts;
    - adapter exports are writer factories and stable adapter option/result types;
    - inspect exports are detailed graph/projection/PptxPackageModel inspection types;
    - writer internals, XML emitters, ZIP helpers, sinks, Build Artifacts, and Assembly Plan builders
      stay private unless a later external-writer use case proves a stable seam is needed.

- Finish performance and regression coverage:
  - Keep writer hot-path benchmarks covering representative Project, warm Project cache, asset
    probe/load cache observation, cold writer, ZIP assembly, warm artifact reuse, path-output render,
    minimal, text-heavy, image-heavy, template/layout, and mixed CSS-like paint fixtures.
  - Implemented: detailed Derived Projection Inspection View generation benchmarks measure
    `inspection: "details"` composed paint order, effective projected styles, package dependency
    invalidation, paint fallback aggregation, and theme projection provenance separately from default
    summary and no-inspection Project timing.
  - Keep the performance review checklist explicit in benchmark/test updates: no whole-package XML
    object tree, no second XML emission model under PptxPackageModel, no eager derived inspection
    views on the default path, no media bytes inside PptxPackageModel, and no public streaming ZIP or
    fflate configuration surface.
  - Keep deterministic byte tests and semantic package assertions covering content types,
    relationships, package paths, media entries, ids, order keys, requirement metadata, fingerprints,
    drawing order, geometry, image crop/source rectangles, and support parts.
  - Keep template/layout package topology covered by direct writer assertions: generated PPTX ZIPs
    should contain content type overrides for every projected slide layout, slide master
    relationships to each layout, slide relationships to the selected template-derived layout, and
    slide layout relationship parts pointing back to the slide master.
  - Expand CI generation regression fixtures beyond the initial pinned `pptxgenjs` oracle by adding
    direct OOXML fixtures, semantic package assertions, and rendered raster checks where tooling is
    available.
  - Use `.github/render/verify-render.tsx --baseline <manifest>` as a manifest-shape regression guard for
    render verification artifacts. It should catch missing fixtures, missing package assertions,
    missing or loosened raster tolerance contracts, missing raster artifacts, large PNG byte-size
    shifts, and rendered PNG pixel differences when ImageMagick comparison tooling is available.
  - Implemented for the current v0.8.0 slice: render verification defines category-specific raster
    tolerances for geometry, text, color/fill, image crop, shadow/effect, and complex layout fixtures
    instead of relying on one global pixel threshold. Baseline comparison now checks the tolerance
    kind, budget, and note recorded in the manifest so release-candidate baselines catch accidental
    tolerance loosening, not only missing raster artifacts.

- Finish docs and migration surface:
  - Update README, release notes/process docs, skill docs, and public API examples so direct PPTX
    output and `deck.useAssets(loader)` are the normal documented path.
  - Keep historical `pptxgenjs` mentions only where they explain ADR context, isolated CI oracles, or
    a possible future external compatibility package.
  - Document which unsupported CSS-like/PPTX fidelity gaps are warnings, which are post-v0.8
    follow-up work, and which would block Render because the package would be structurally invalid.

### Open Design Questions Before Implementation

These questions should be resolved close to implementation time. They should not reopen the main
v0.8.0 direction; they are the remaining places where concrete type shapes, file ownership, or test
fixtures need final names.

- Public API details:
  - Resolved: the public package seam is `deckjsx` for authoring/stage result vocabulary,
    `deckjsx/adapter` for `pptx()` and writer-adapter option/result types, and `deckjsx/inspect` for
    detailed graph/projection inspection vocabulary.
  - Resolved: `pptx()` is the core direct writer adapter; `pptxgenjs()` is removed from the core
    public surface.
  - Resolved for the current v0.8.0 slice: package export map and root dependency guards are covered
    by `tests/pptx/public-surface.test.ts`, in addition to seam-specific type tests for `deckjsx`,
    `deckjsx/adapter`, and `deckjsx/inspect`.
  - Resolved: `deck.useAssets(loader)` is the asset registration point; Project and Render both
    consume Deck-owned loaders rather than taking asset loaders as render-only options.
  - Resolved: output path side-effect failures use `E_RENDER_OUTPUT_WRITE_FAILED`; Render preserves
    `artifact.bytes`, omits `output`, and sets `ok: false` through diagnostics.
  - Resolved: when `render({ output })` is used where the Node output runtime boundary is unavailable,
    Render preserves `artifact.bytes`, omits `output`, sets `ok: false`, and reports
    `E_RENDER_OUTPUT_WRITE_FAILED` with `reason=runtimeOutputUnavailable`.
  - Resolved: multiple `deck.useAssets(loader)` calls compose deterministically in registration
    order before the built-in boundary, and Render uses the Project-winning resolver scope.
  - Resolved: `WriterRenderContext` is public but opaque; Render can pass internal context data to
    built-in writers without exposing Asset Artifact or Pptx Package Build Artifact fields as public
    adapter contract.
  - Resolved for the current v0.8.0 slice: the public detail option is
    `inspection: "summary" | "none" | "details"`. Project defaults to `summary`; Render suppresses
    its internal Project summary and can suppress its own Render inspection summary with
    `inspection: "none"`. `inspection: "details"` adds opt-in Derived Projection Inspection Views to
    Project summaries without making them eager default result payload. The first v0.8 detail views
    are composed paint order, effective projected styles, package dependency invalidation, paint
    fallback aggregation, and theme projection provenance.

- PptxPackageModel schema details:
  - Resolved for the current v0.8.0 slice: package parts distinguish manifest, support,
    authored-content, media, relationship, theme, layout, master, and docProps-oriented support
    payloads enough for projection inspection and direct writer serialization.
  - Remaining: deepen exact discriminated unions where future support parts need richer payloads,
    especially comments, richer document properties, and externally imported package parts.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks structured
    document-property support payloads before Render. Malformed `docProps/core.xml` metadata,
    mismatched core/extended property kinds, missing editability/provenance, invalid extended
    application names, invalid extended slide counts, or extended slide counts that diverge from the
    structured presentation slide list become `E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD` instead of
    silently falling back to writer defaults.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks structured
    presentation support payloads before Render. Invalid presentation size values, duplicate slide
    part references, slide part ids that do not point at slide package parts, and duplicate projected
    OOXML slide ids across the ordered presentation slide list become
    `E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD`, and writer regression coverage verifies emitted
    `ppt/presentation.xml` consumes the payload size and `slidePartIds`.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks empty support
    property payloads before Render. Mismatched `view-properties` / `presentation-properties` kinds,
    non-editable payloads, or non-empty placeholder settings become
    `E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD` until richer structured settings exist.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks slide master
    and slide layout support payloads before Render. Invalid names, editability, master/theme/layout
    references, color-map entries, text-style placeholders, layout type, preserve flag, placeholder
    strategy, or template metadata become `E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD` before writer
    fallback can hide malformed model data. The validation also checks that existing referenced
    package ids point at the expected part kind: slide-master theme references must target theme
    parts, slide-master layout references must target slide-layout parts, and slide-layout master
    references must target slide-master parts.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks writer-consumed
    theme support payload fields before Render, separately from Theme Projection trace validation.
    Invalid theme names, editability, color scheme names/colors, font scheme names/typefaces, or
    format scheme names become `E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD`.
  - Resolved for the current v0.8.0 slice: Theme Projection trace validation also checks that
    package references and mapping groups preserve their intended support topology. Whole-theme
    mappings must point at theme parts and list known theme value groups; support mappings must list
    theme support groups; effective-inheritance trace `themePartId`, `slideMasterPartId`,
    `slideLayoutPartId`, and `slidePartId` must point at theme, slide-master, slide-layout, and slide
    parts respectively; and theme-reference serialization candidates must point at theme parts.
  - Resolved for the current v0.8.0 slice: Theme Projection trace validation now checks concrete and
    unprojected Theme Default mapping arrays directly. `concreteDrawingProperties` entries must
    remain concrete drawing-property projections with graph/default/property provenance and a
    resolved value, while `unprojected` entries must remain Theme Default sourced unprojected
    mappings with graph/default/property provenance, a resolved value, and a reason. This prevents
    sandbox-supplied `defineProjection()` payloads from mixing the two trace channels before Render.
  - Resolved for the current v0.8.0 slice: Theme Projection validation now also checks the projection
    identity and source discriminators. Theme projection payloads must keep a non-empty projection
    id, `purpose: "default"`, and `source: "deckjsx-default"`; Theme Default trace records must
    remain `source: "themeDefault"`; and value-group fingerprints must keep the deckjsx-default
    support groups separate from Theme Default projection-trace fingerprints.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks structured
    manifest payloads before Render. Malformed content-type defaults/overrides or relationship
    records, duplicate content-type default extensions, and duplicate content-type override part
    names become `E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD` before package XML emission can silently
    fall back to empty or ambiguous manifest payloads.
  - Resolved for the current v0.8.0 slice: relationship manifest payload validation now rejects
    duplicate relationship ids, and package topology validation rejects owner-scoped `.rels` parts
    whose owner package part is missing. Duplicate `rId` values remain
    `E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD`; orphan relationship package parts become
    `E_PPTX_PACKAGE_ORPHAN_RELATIONSHIPS_PART`.
  - Resolved for the current v0.8.0 slice: relationship manifest payload validation now checks
    internal relationship type/target compatibility for known PPTX package relationships, such as
    `officeDocument -> presentation`, `slide -> slide`, `slideLayout -> slide-layout`,
    `slideMaster -> slide-master`, `theme -> theme`, `image -> media`, and document-property
    relationships. Unknown internal relationship types or known types pointing at the wrong package
    part kind become `E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD`; external relationship types remain
    an extension path.
  - Resolved for the current v0.8.0 slice: root `_rels/.rels` package topology validation now
    requires projected `officeDocument`, `coreProperties`, and `extendedProperties` relationships to
    the corresponding presentation and document-property parts. Missing root package entry
    relationships become `E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP`, so sandbox/defineProjection
    edits cannot create a package whose support parts exist but are no longer reachable from the
    package root.
  - Resolved for the current v0.8.0 slice: presentation-scoped relationship topology validation now
    also requires projected `theme`, `viewProperties`, and `presentationProperties` relationships in
    `ppt/_rels/presentation.xml.rels` for the current support parts, in addition to the writer-used
    slide master and slide relationships. Theme checks are tied to slide-master `themePartId`
    references rather than all theme parts, leaving room for future multiple-theme operation without
    making every theme package part presentation-scoped by default.
  - Resolved for the current v0.8.0 slice: slide-master and slide-layout relationship topology is
    now covered by Project-level regression tests as well as writer emitter checks. Slide masters
    must keep projected `slideLayout` relationships for their payload layout ids and a projected
    `theme` relationship for their payload theme id; slide layouts must keep a projected
    `slideMaster` relationship for their payload master id. Missing support topology relationships
    become `E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP` before Render reaches support XML
    emission.
  - Resolved for the current v0.8.0 slice: known package relationship types cannot be marked
    external. Hyperlinks remain the external relationship path, while known package relationships
    such as `officeDocument`, `slide`, `slideLayout`, `slideMaster`, `theme`, and `image` must target
    package parts. Invalid external package relationships become relationship metadata or manifest
    payload diagnostics before Render.
  - Resolved for the current v0.8.0 slice: external relationship targets must be supported absolute
    URL targets (`http:`, `https:`, or `mailto:`). Unsupported schemes or relative strings become
    relationship metadata, manifest payload, or drawing hyperlink diagnostics before package XML or
    drawing XML can emit an external target that the core writer does not intentionally support.
  - Resolved for the current v0.8.0 slice: relationship `type` values must be either known
    deckjsx/PPTX relationship tokens, such as `officeDocument`, `slide`, `image`, and `hyperlink`,
    or custom relationship type URIs using `http:` or `https:`. Arbitrary non-URI strings become
    relationship metadata or manifest payload diagnostics, and the package XML emitter also rejects
    them when called directly.
  - Resolved for the current v0.8.0 slice: relationship package parts now validate that
    `part.relationships` and `payload.relationships` stay synchronized when both are present.
    Divergence becomes `E_PPTX_PACKAGE_RELATIONSHIP_PAYLOAD_MISMATCH`, preventing package XML,
    support XML, inspection summaries, and fingerprint/dependency logic from reading different
    relationship records from the same package part.
  - Resolved for the current v0.8.0 slice: relationship package part categories now have to match
    the owner family encoded by their package path. Root, presentation, slide-master, and
    slide-layout relationship parts remain `manifest` package parts, while slide relationship parts
    remain `authored-content`. Mismatched categories become
    `E_PPTX_PACKAGE_INVALID_RELATIONSHIPS_PART_CATEGORY`, preventing sandbox edits from making
    inspection and HMR tooling explain support/package topology as authored slide content or vice
    versa.
  - Resolved for the current v0.8.0 slice: owner-scoped relationship parts for authored-content
    owners with relationship records now require matching owner `relationships` metadata. Missing
    slide-owner metadata or divergent owner metadata becomes
    `E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH`, so HMR/inspection tooling can treat authored slide
    owners and their `.rels` parts as one coherent package-topology explanation while support parts
    continue to carry their own structured reference payloads.
  - Resolved for the current v0.8.0 slice: owner package parts that also carry explicit
    `relationships` metadata now validate against their corresponding owner-scoped `.rels` package
    part. Divergence becomes `E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH`, preventing slide XML,
    package relationship XML, inspection, and package-part dependency fingerprints from consuming
    different relationship records for the same owner package part.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks content-type
    manifest coverage before Render. Missing relationship defaults, missing media extension defaults,
    or missing explicit overrides for non-media XML package parts become
    `E_PPTX_PACKAGE_MISSING_CONTENT_TYPE`, so `[Content_Types].xml` cannot silently omit an emitted
    package part from the final PPTX package.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks expected
    content type values for relationship defaults, XML defaults, media defaults, and known PPTX
    support/authored-content overrides. Mismatched MIME values become
    `E_PPTX_PACKAGE_INVALID_CONTENT_TYPE`, so `defineProjection()` cannot make the direct writer
    emit a structurally misleading `[Content_Types].xml` manifest.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks media part
    payloads before Render. Malformed source records, merged source arrays, element/asset identity
    lists, allocation keys, or media metadata become `E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD` before
    media byte emission can fail or silently use the wrong source. The same validation now also
    checks cross-field consistency between media part path extension, content-type manifest default,
    metadata extension/media type/hash, primary source inclusion in `sources`, primary id inclusion
    in merged id lists, and duplicate merged source/id entries without probing or storing bytes.
  - Resolved for the current v0.8.0 slice: media part payload `sources` is required Pptx Package
    Model data, not a writer convenience fallback. Project rejects media payloads that only carry
    the primary `source`, and `picture-xml` uses the projected alias list for image relationship and
    intrinsic-size lookup instead of reconstructing `[source]` during XML emission.
  - Resolved for the current v0.8.0 slice: drawing element `paintOrder` is required Pptx Package
    Model metadata, and projected background layers now carry `paintOrder` with
    `generatedLayerRole: "background"`. The drawing projection helper no longer reconstructs paint
    order from array index and `zIndex` when the field is missing, so sandbox/defineProjection edits
    cannot lose the CSS-like paint-order connection point and still emit reordered drawing XML.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks slide package
    part payloads before drawing-node validation and Render. Invalid slide ids, optional names,
    native slide background fills, background image layers, background layer source/frame values, or
    missing drawing roots become `E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD` before slide XML emission or
    writer fallback can hide malformed model data. Image drawing nodes are also checked against the
    slide's projected image relationships: missing media part ids, missing serialized relationship
    ids, relationship id mismatches, non-image relationships, target part mismatches, or media path
    mismatches become `E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD` before picture XML can silently omit or
    embed the wrong media relationship. Background image layers are checked through the same
    projected media topology by source key, so missing media parts, ambiguous media parts, missing
    slide image relationships, or relationship target-path mismatches are reported before background
    image XML can silently disappear. Drawing hyperlinks are checked against slide external
    hyperlink relationships as well, so missing serialized hyperlink relationship ids, missing
    relationship records, non-hyperlink relationship types, non-external targets, or URL/relationship
    target mismatches are reported before `<a:hlinkClick>` can silently disappear or point at the
    wrong target.
  - Resolved for the current v0.8.0 slice: media part payloads now cross-check `elementId` and
    `elementIds` against the projected slide drawing tree, and `assetEntityId` / `assetEntityIds`
    against projected drawing origins. Orphaned media ownership references in `defineProjection()`
    become `E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD`, preserving the link between media topology,
    Pptx Element Identity, and Asset Entity provenance for sandbox inspection and future HMR
    invalidation.
  - Resolved for the current v0.8.0 slice: image fitting and background-image tiling now require
    projected media dimensions when the calculation needs intrinsic size. Built-in Project/media
    metadata extraction records SVG data URI `widthPx`/`heightPx`, including base64 SVG payloads and
    style-derived background image sources that do not have a graph Asset Entity. `picture-xml`
    rejects missing projected dimensions for `contain`/`cover` image fitting and intrinsic
    background-size calculations instead of reparsing SVG data URIs or falling back to a 1:1 ratio in
    the writer.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks the same
    intrinsic-size requirement before Render. Image drawing nodes using `contain` or `cover`, and
    background image layers using `contain`, `cover`, or intrinsic `size` calculations, must point to
    a media part whose payload metadata includes positive `widthPx` and `heightPx`; otherwise Project
    reports `E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD` and Render does not reach picture XML emission.
  - Resolved for the current v0.8.0 slice: non-image `backgroundLayers` now carry their projected
    drawing frame in the Pptx Package Model whenever they remain as generated background shapes.
    Single top-level fills may still use the native `fill`/`background` slot without a frame, but
    every solid/gradient layer consumed as an ordered background layer must describe the concrete
    rectangle Project chose from the slide or drawing box. Package consistency validation rejects
    missing background-layer frames before Render, and `drawing-layer-xml` no longer repairs them with
    slide/node-local fallback frames.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks notes master
    and notes slide placeholder support payloads before Render. Mismatched placeholder kinds,
    non-placeholder statuses, non-editable placeholder records, role/kind mismatches, non-deckjsx
    placeholder sources, or non-empty placeholder settings become
    `E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD` until richer notes projection exists. The placeholder
    payload now records `role`, `source: "deckjsx-placeholder"`, and empty `settings` so future notes
    projection can deepen the payload without changing package part identity or asking the writer to
    infer placeholder meaning from part kind alone.
  - Resolved for the current v0.8.0 slice: Package Part Requirement contains the status (`required`,
    `optional`, or `conditional`), the evaluated `required` boolean for this package snapshot, a
    stable reason, an optional condition key, and dependency references to the parts or relationships
    that caused the evaluation. The projection type, package validation, Assembly Plan summaries,
    and tests now align to this shape. Package validation rejects semantic mismatches such as
    required parts that evaluate to false, optional parts that evaluate to true, conditional parts
    that use the generic `explicit` condition, and required conditional parts without dependency
    references. Requirement dependency references are also validated as unique causal package-part
    links so inspection summaries and future HMR invalidation do not need to deduplicate projected
    requirement explanations.
  - Resolved for the current v0.8.0 slice: Assembly Plan expected-entry construction now requires
    projected Package Part Requirement metadata instead of treating missing requirements as
    `required`. Missing requirement metadata is already a package consistency error, and the writer
    helper now preserves that contract when exercised directly by tests or future internal callers.
  - Resolved for the current v0.8.0 slice: Package Part Order Key is structured metadata with
    package order group, numeric group order, projection sequence, package path, and stable encoded
    value. Render sorts by the projected encoded value, and package validation rejects missing,
    malformed, or semantically mismatched order keys whose group/group order no longer match the
    package part kind and path. Validation also checks that the encoded value exactly matches the
    projected group order, sequence, and package path, so Render ordering and inspection metadata
    cannot diverge.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks top-level
    PptxPackageModel size and `slides` index alignment before Render. Non-finite or non-positive
    model size values become `E_PPTX_PACKAGE_INVALID_MODEL_SIZE`, and `PptxPackageModel.slides`
    entries that diverge from the fingerprinted slide package parts in `PptxPackageModel.parts`
    become `E_PPTX_PACKAGE_INVALID_SLIDES_INDEX`. The slides index also rejects duplicate slide
    package part entries, so inspection and HMR tooling receive a single unambiguous sequence for
    each projected slide part.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks package part
    base metadata before relationship, payload, order-key, requirement, or writer validation.
    Malformed part records, missing/empty ids or paths, unknown categories, unknown kinds, and
    incompatible category/kind pairings become `E_PPTX_PACKAGE_INVALID_PART` before Render can crash
    while normalizing paths or dispatching emitters.
  - Resolved for the current v0.8.0 slice: package part identities must stay in the `pptx:`
    namespace and cannot be package paths, Graph Identity strings, or whitespace-bearing ad hoc
    values. Invalid identities become `E_PPTX_PACKAGE_INVALID_PART`, preserving the distinction
    between Package Part Identity, package path, relationship id, and graph/source identity for
    inspection, sandbox editing, and build-artifact reuse.
  - Resolved for the current v0.8.0 slice: package part paths must be canonical ZIP entry paths,
    not absolute paths, backslash paths, trailing-slash directories, or paths containing empty,
    `.` or `..` segments. Invalid paths become `E_PPTX_PACKAGE_INVALID_PART` before kind-family
    validation, content-type lookup, relationship-owner lookup, Assembly Plan ordering, or ZIP
    emission can normalize away the malformed package topology.
  - Resolved for the current v0.8.0 slice: internal relationship `targetPath` values must also be
    canonical package paths in PptxPackageModel. Relationship emitters may turn those package paths
    into owner-relative OOXML `Target` attributes later, but projection, inspection, fingerprints,
    sandbox edits, and relationship payload validation should not store absolute, backslash, or
    `.`/`..` target paths that only become valid after writer-side normalization. Malformed
    `targetPath` values are diagnosed as relationship shape errors and are not used for target-path
    mismatch lookup.
  - Resolved for the current v0.8.0 slice: internal relationship `targetPartId` values must stay
    in the `pptx:` Package Part Identity namespace, not package paths, relationship ids, or
    Graph/source identities. Invalid target identities become relationship metadata or manifest
    payload diagnostics before broken-target lookup, keeping missing-target diagnostics reserved
    for valid-looking package identities that are absent from the package model.
  - Resolved for the current v0.8.0 slice: content-type override `partName` values keep the OOXML
    leading slash form, but the wrapped package path must still be canonical. Malformed overrides
    become `E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD`, and dependency/broken-target validation skips
    those malformed entries instead of treating writer-normalized path strings as package topology.
  - Resolved for the current v0.8.0 slice: content-type default `extension` values must be canonical
    extension tokens without a leading dot, slash, backslash, or path segment syntax. Malformed
    default extensions become `E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD` and are excluded from
    coverage/value maps, so `[Content_Types].xml` cannot satisfy media or relationship coverage with
    a writer-normalized extension string.
  - Resolved for the current v0.8.0 slice: package consistency validation now also checks package
    part path families against the part kind. Presentation, theme, slide master/layout, slide,
    document-property, view/presentation property, notes placeholder, media, relationship, and
    content-type parts must use the OOXML path family their kind describes. Mismatches become
    `E_PPTX_PACKAGE_INVALID_PART_PATH_FAMILY`, so sandbox/defineProjection edits cannot move a part
    into another package family and leave only indirect order-key, content-type, or relationship
    diagnostics to explain the problem.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks package part
    fingerprints against the current projected package part payload and metadata before Render.
    Edited or sandbox-supplied projections whose payload, relationships, requirement, order key, or
    path no longer match their fingerprint become `E_PPTX_PACKAGE_STALE_PART_FINGERPRINT`, so warm
    Build Artifact reuse cannot trust stale package-part identity data.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks package part
    dependency fingerprint metadata before Render. Non-array dependency fingerprint fields, malformed
    records, missing target package parts, duplicate dependency targets, empty fingerprint strings,
    or fingerprints that do not match the referenced package part's current fingerprint become
    `E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT` before warm Build Artifact reuse can trust
    invalid dependency data.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks package part
    relationship metadata before relationship target traversal and Render. Non-array relationship
    fields, malformed records, missing ids/types/targets, invalid target modes, missing internal
    target package part ids, or duplicate relationship ids become
    `E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP` before writer relationship lookup or dependency
    indexing can trust invalid records.
  - Resolved for the current v0.8.0 slice: direct package part relationship metadata now shares the
    same internal relationship type/target compatibility checks as relationship manifest payloads.
    This prevents Package Part Fingerprints, dependency fingerprints, and support XML relationship
    lookup from trusting relationship records whose target part exists but has the wrong package kind.
  - Resolved for the current v0.8.0 slice: known PPTX relationship types are also checked against
    their relationship owner family. Root relationships are limited to package-entry/document
    property relationships; presentation relationships cover slides, slide master, theme, and
    presentation/view property support; slide relationships cover layout, image, and hyperlink
    records; slide-master and slide-layout relationship parts only accept their support-topology
    relationship types. Owner/type mismatches become relationship metadata or manifest payload
    diagnostics even when the target part kind itself is valid.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks package part
    origin metadata before Render. Malformed origin records, non-array/empty graph node ids, and
    malformed `root`/`mounted` Source Origin records become `E_PPTX_PACKAGE_INVALID_PART_ORIGIN`
    before inspection, sandbox, artifact indexing, or future HMR invalidation logic can trust broken
    provenance.
  - Resolved for the current v0.8.0 slice: Pptx Drawing Nodes preserve concrete frame/style values,
    origins, paint order, z-index inputs, visibility semantics, and overflow clipping metadata needed
    by Project inspection and writer emission.
  - Resolved for the current v0.8.0 slice: authored `Shape` geometry is writer-safe in the Pptx
    Package Model. The direct slide writer consumes projected `shape` values (`rect`, `ellipse`, or
    `line`) directly and rejects malformed shape geometry instead of falling back to a rectangle.
  - Resolved for the current v0.8.0 slice: generated border and outline strokes are now projected
    as `generatedStrokes` on the owning group/text/shape element. Each generated stroke layer carries
    a stable generated id, serialized shape object id, role (`border` or `outline`), optional edge,
    concrete frame, stroke payload, shape kind, and generated paint-order input. `edgeStrokes` and
    `outline` remain the semantic paint inputs, while `generatedStrokes` is the writer-consumed
    generated layer plan, so HMR/sandbox tooling can inspect the generated drawing work without
    forcing a second XML model. The direct writer consumes the projected `shape` geometry directly
    and rejects malformed generated stroke shapes instead of silently coercing unknown values to a
    rectangle.
  - Resolved for the current v0.8.0 slice: serialized shape object ids for nested drawing elements
    are now numeric and deterministic rather than dotted index paths. This avoids PPTX non-visual id
    collisions caused by writers parsing values such as `1.1` as `1`, and generated stroke layers use
    their own deterministic numeric ids derived from the owning element.
  - Resolved for the current v0.8.0 slice: package consistency validation now requires serialized
    shape object ids on drawing nodes and generated stroke layers to be positive writer-safe integer
    strings. Malformed values such as `1.1`, `0`, empty strings, unsafe integer strings, values that
    would overflow the writer's emitted `shapeObjectId + 1` id, or non-string projection edits fail
    before drawing XML emission, so the writer no longer needs to parse or normalize ambiguous
    non-visual object ids at the output boundary.
  - Resolved for the current v0.8.0 slice: package consistency validation now also requires
    serialized shape object ids to be unique across each slide part's drawing tree, including
    generated stroke layers. A `defineProjection()` edit that gives an authored node and a generated
    border/outline layer the same positive id now fails before Render, preserving the PPTX
    non-visual identity invariant instead of asking the writer to invent replacements.
  - Resolved for the current v0.8.0 slice: package consistency validation now requires drawing
    element ids to be non-empty and unique across each slide part's drawing tree, including generated
    border/outline stroke layers. This keeps the HMR/sandbox-facing Pptx Element Identity distinct
    from serialized OOXML object ids, and prevents inspection/invalidation maps from trusting a
    projected drawing tree with duplicate logical element keys.
  - Resolved for the current v0.8.0 slice: generated stroke layers now validate their generated
    paint order against the owning drawing element. Their sibling order and z-index input must match
    the owner, while `generatedLayerRole` must match the layer role. This keeps CSS-like border and
    outline layer plans coupled to the element paint order that created them, instead of allowing a
    stale HMR/sandbox projection edit to emit plausible but wrong drawing order.
  - Resolved for the current v0.8.0 slice: package consistency validation now requires drawing
    nodes with projected `edgeStrokes` or `outline` semantics to carry matching generated
    border/outline stroke layer records. Missing generated layer plans become
    `E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD` during Project, so `defineProjection()` edits cannot
    silently drop CSS-like border/outline semantics and leave the writer to infer replacement
    shapes.
  - Resolved for the current v0.8.0 slice: generated border/outline stroke layers are now checked
    against the owning drawing node's identity, serialized shape object id, frame, and stroke
    semantics. Border layers must keep owner-derived generated element and shape object ids, remain
    line-shaped, match the owner-derived edge frame, and match the corresponding owner edge stroke
    payload; outline layers must keep owner-derived generated element and shape object ids, remain
    rect-shaped, match the owner frame, and match the owner outline payload. This catches stale
    partial sandbox/HMR edits where the semantic paint input remains but the writer-consumed
    generated layer plan has drifted. Owner-derived generated shape object ids must also remain
    within the writer-safe serialized id range so a valid-looking owner id cannot force generated
    stroke XML to emit an unsafe non-visual id.
  - Resolved for the current v0.8.0 slice: unsupported CSS-like paint/transform/opacity semantics
    can be attached to affected drawing nodes and surfaced as nonblocking Project warnings.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks drawing
    metadata required by inspection and writer emission, including drawing node kind, finite frame
    values, finite opacity/rotation values, visibility shape, package part ownership, serialized
    shape object identity, root drawing emission target, paint-order index, paint-order
    sibling/z-index/generated-layer inputs, and layout-anchor provenance/frame. Invalid
    `defineProjection()` drawing metadata becomes `E_PPTX_PACKAGE_INVALID_DRAWING_METADATA` before
    Render emits bytes. Root slide drawing nodes must now also keep `emissionTarget: "slide"` and
    `paintOrderIndex` aligned with their actual `PptxSlideDrawing.children` order, so inspection/HMR
    does not explain a different drawing order than the direct writer emits.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks drawing
    kind-specific payloads before Render. Malformed group child arrays, text content/runs/style,
    image media/source/source-frame/fit/crop/object-position/transparency/rounding, shape kind/radius,
    or drawing hyperlinks become `E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD` before drawing XML
    emission can trust writer-consumed fields or silently invent fallback drawing data.
  - Resolved for the current v0.8.0 slice: text drawing payload validation now checks the
    writer-consumed `TextStyleIR` shape for text nodes and rich-text runs. Malformed font sizing,
    underline style, direction, text alignment, vertical alignment, padding/insets, line and
    paragraph spacing, tab stops, character spacing, list settings, fit, or wrap values fail package
    consistency validation before `text-xml` emission.
  - Resolved for the current v0.8.0 slice: direct `text-xml` emission also treats projected text
    content/style as required writer input instead of a best-effort hint. Malformed text values,
    non-finite font size, character spacing, indentation, padding, paragraph spacing, tab-stop
    positions, unsupported text direction/alignment/vertical alignment/fit, malformed tab-stop
    alignment, unsupported numbering style, and malformed list type now throw before XML attributes
    can silently disappear or serialize as `NaN`.
  - Resolved for the current v0.8.0 slice: drawing paint/effect payload validation now checks
    writer-consumed fill, background layer, stroke, edge stroke, outline, shadow, and radius fields
    on group/text/shape nodes, plus image shadows. Malformed drawing color, transparency, gradient,
    missing non-image background-layer frames, malformed generated stroke layers, background-image
    frame/source/fit/repeat/size, stroke style/dash/cap/join, shadow type/color, or radius values become
    `E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD` before shape/picture XML emission.
  - Resolved for the current v0.8.0 slice: projected drawing color values must be normalized
    six-digit RGB strings (`RRGGBB`) inside Pptx Package Model. Fill, gradient stop, stroke, shadow,
    text color, and underline color validation rejects authored-style values such as `#112233` or
    named colors after projection, and `writeColor()` no longer strips `#` or serializes arbitrary
    non-empty strings into `a:srgbClr`.
  - Resolved for the current v0.8.0 slice: theme support payload color-scheme values follow the same
    projected six-digit RGB contract. `colorScheme.colors.*` is validated as `RRGGBB`, so sandboxed
    `defineProjection()` edits cannot pass authored-style `#112233` values into theme XML emission.
  - Resolved for the current v0.8.0 slice: projected shadows now carry explicit `opacity`, `blurPt`,
    `offsetPt`, and `angle` in the Pptx Package Model. CSS colors without alpha project to
    `opacity: 1`, shadow shorthand offsets project to concrete PPTX distance/direction values,
    package consistency validation rejects missing or malformed projected shadow values, and the
    direct writer no longer relies on OOXML's implicit fully opaque shadow color behavior or omitted
    shadow distance/direction defaults.
  - Resolved for the current v0.8.0 slice: direct drawing XML emission now also validates
    writer-consumed numeric and enum paint/effect inputs before writing attributes. Malformed
    transparency/opacity, gradient stop positions, gradient angle, radial-gradient center/radius,
    stroke width/style/dash/cap/join, shadow type/angle/blur/offset, and transform rotation now fail
    inside `drawing-xml` instead of producing missing, arbitrary, or `NaN` OOXML attributes if a
    malformed projected model reaches the writer. Stroke width is required writer input whenever a
    stroke payload exists, so direct XML emission no longer omits `a:ln/@w` and relies on a
    PowerPoint default width for malformed projected strokes. Negative projected stroke widths are
    rejected by package consistency validation and direct XML emission instead of being coerced to a
    no-line stroke.
  - Resolved for the current v0.8.0 slice: direct radial-gradient emission now validates projected
    `shape` values before writing the OOXML path shade. Valid `circle` and `ellipse` gradients still
    use the current PPTX radial path representation with projected center/radius values, but malformed
    shapes are no longer silently emitted as circular gradients.
  - Resolved for the current v0.8.0 slice: direct gradient emission now rejects missing or empty
    projected stop lists, matching package consistency validation instead of writing an empty
    `<a:gsLst>` from a malformed Pptx Package Model.
  - Resolved for the current v0.8.0 slice: projected gradient stop positions are validated as
    normalized `0..1` values by both package consistency validation and direct XML emission. A
    malformed sandbox/HMR edit can no longer emit negative or greater-than-100% OOXML gradient stop
    positions.
  - Resolved for the current v0.8.0 slice: root drawing-node frames now require non-negative
    `widthEmu`/`heightEmu` during package consistency validation. Direct shape XML emission rejects
    negative non-line frame sizes, while preserving CSS-like zero-size authored nodes and the
    generated-stroke line case where one axis may be zero and the other axis carries the projected
    border/outline length.
  - Resolved for the current v0.8.0 slice: direct picture XML emission now validates projected image
    crop ratios before source-rectangle serialization. Crop edges must be normalized `0..1` ratios
    and the left/right or top/bottom crop pairs must leave positive source area, matching package
    consistency validation instead of allowing malformed crop values to become invalid `a:srcRect`
    attributes.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks drawing origin
    metadata separately from general drawing metadata. Malformed graph/style/asset id arrays or
    malformed Source Origin records become `E_PPTX_PACKAGE_INVALID_DRAWING_ORIGIN`, so generated
    background/border/template drawing nodes can still be explained without collapsing provenance
    into writer-only shape data.
  - Resolved for the current v0.8.0 slice: drawing and package origin id arrays now reject duplicate
    graph, style, and asset identity entries. Provenance lists remain compact identity sets for
    inspection and future HMR invalidation rather than lossy bags that can inflate dependency
    explanations.
  - Resolved for the current v0.8.0 slice: partial projection now preserves the same representative
    CSS-like fallback metadata as the normal layout-to-PPTX projection path for computable drawing
    nodes. When another node makes Project partial, retained text/image/shape/group nodes still keep
    observed filter/blend/isolation, opacity stacking-context, transform stacking-context, shadow,
    and background fallback records in PptxPackageModel and Project Inspection Summary rather than
    losing those meanings in the graph-to-PPTX recovery path.
  - Resolved for the current v0.8.0 slice: `defineProjection()` and partial projection now report
    all valid drawing-node `unsupportedSemantics` records from the PptxPackageModel as nonblocking
    `W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC` diagnostics. The normal graph-to-layout projection path
    still avoids duplicate graph/model warnings, while sandbox-supplied or partial model-owned
    background, shadow, filter, blend, isolation, opacity, transform, and clipping fallback records
    remain observable through diagnostics and Project Inspection Summary.
  - Resolved for the current v0.8.0 slice: unsupported paint warning coverage now includes
    CSS-like border, outline, and stroke fallback records. Unsupported border/outline styles and
    stroke dash patterns can remain structurally valid projections: Project reports nonblocking
    warnings, PptxPackageModel keeps the authored paint input in `unsupportedSemantics`, and Project
    Inspection Summary exposes the same fallback metadata instead of letting the parser failure erase
    the CSS-like meaning or block the whole deck.
  - Remaining: continue expanding unsupported-paint warning shapes only when new CSS-like authoring
    properties enter the supported style vocabulary.

- Theme/layout/template projection details:
  - Resolved for the current v0.8.0 slice: Pptx Theme Part, Slide Master, and Slide Layout have
    structured payloads with serializable defaults instead of path-only placeholder status.
  - Resolved for the current v0.8.0 slice: `Pptx Theme Projection` trace records default support
    mappings and property-level Theme Default winners projected as concrete drawing properties.
  - Resolved for the current v0.8.0 slice: `Pptx Theme Projection` trace now includes
    `wholeThemeMappings` plus `valueGroupFingerprints` for default color, font, format, and
    Theme-default groups. This keeps whole-theme and group-level HMR/inspection dependencies visible
    without making deckjsx Theme identical to PowerPoint theme XML.
  - Resolved for the current v0.8.0 slice: `Pptx Theme Projection` trace now records unprojected
    Theme Default mappings for CSS-like semantics that the current PPTX writer preserves only as
    unsupported semantic fallback data, including filter, blend mode, and isolation defaults. The
    trace records graph node, default key, property, resolved value, and reason, and Project emits
    nonblocking warnings for these unprojected mappings.
  - Resolved for the current v0.8.0 slice: `Pptx Theme Projection` trace now includes
    `effectiveInheritance` records that connect Theme Default projection decisions through known
    theme part, slide master, slide layout, slide part, and drawing-value identities. This gives HMR
    and inspection tooling a package-chain explanation without requiring a separate eager Effective
    Projected Style View.
  - Resolved for the current v0.8.0 slice: `Pptx Theme Projection` trace now includes
    `referenceSerialization` records. These records distinguish current concrete writer output from
    preserved PPTX theme-reference candidates, so a value matching `accent1` or `minorLatin` is not
    silently treated as either permanently concrete or already emitted as a theme reference.
  - Resolved for the current v0.8.0 slice: package consistency validation now checks structured
    Pptx Theme Projection trace payloads before Render. Invalid value-group fingerprints, effective
    inheritance package-part references or steps, theme-reference serialization decisions or
    candidates, concrete drawing-property mappings, unprojected mapping records, projection
    identity fields, or source discriminators become
    `E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE` diagnostics for `defineProjection()` payloads.
  - Resolved for the current v0.8.0 slice: `Pptx Theme Projection` trace now includes
    `defaultStyleDecisions`, so Theme Default winners such as layout dimensions, z-index, display
    filtering, text wrapping inputs, concrete color/font values, and unsupported filter/blend/isolate
    semantics do not collapse into one generic concrete-drawing bucket.
  - Remaining: expand the decision vocabulary only when new authoring properties or richer output
    inheritance destinations require it.
  - Resolved and implemented for the current v0.8.0 slice: Template Area Kind is authoring-level,
    optional on `TemplateArea`, defaults to `generic` when absent, and is never inferred from the
    area name. Project carries the resolved kind on layout-origin/anchor metadata and exposes it
    through `PptxLayoutAnchor.kind` and Project Inspection Summary.
  - Resolved and implemented for the current v0.8.0 slice: template-derived slide layout payloads
    now carry explicit `layoutAnchors` for Template Areas, including resolved frame, authoring-level
    kind, and `placeholderStrategy: "none"`. This is the non-visible anchor representation for
    deckjsx Template Area meaning.
  - Resolved for the current v0.8.0 slice: slides using a template-derived layout point at the
    matching slide layout package part instead of the default blank layout, and slide dependency
    fingerprints include the layout part fingerprint when drawing frames are derived from layout
    anchors.
  - Resolved for the current v0.8.0 slice: package consistency validation checks slide layout
    `layoutAnchors` before Render, including Template/Area names, known Template Area Kind, finite
    resolved frame values, and the current `placeholderStrategy: "none"` constraint. Invalid
    `defineProjection()` payloads become `E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR` diagnostics
    instead of reaching XML emission.
  - Resolved for the current v0.8.0 slice: package consistency validation checks Pptx Drawing Node
    unsupported semantic records, including known feature names, required property/value/reason
    fields, known fallback strategies, and structured preserved/missing fallback metadata. Invalid
    `defineProjection()` payloads become `E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC` diagnostics
    before Render can emit bytes.
  - Resolved for the current v0.8.0 slice: Project Inspection Summary preserves nested unsupported
    semantic paint context without borrowing parent drawing order. Top-level drawing nodes keep
    `emissionTarget` and `paintOrderIndex` in unsupported semantic records, while nested group
    children report their own `paintOrder` inputs and omit parent-only final order fields. This keeps
    sandbox/HMR explanations from attributing a child fallback to the parent's z-index or final
    slide-level drawing index.
  - Resolved for the current v0.8.0 slice: unsupported background-layer parsing now carries
    structured fallback metadata instead of only a warning string. Unsupported background inputs such
    as unsupported repeat values or malformed repeating gradients use
    `fallback.strategy: "preserveAuthoredValueOnly"` with preserved authored background input and
    missing PPTX background-layer behavior, so sandbox and future CSS-like rendering work can see
    what was retained and what still needs a richer strategy.
  - Remaining: richer PPTX placeholder-like serialization for Template Areas where it improves
    PowerPoint editing. This is separate from preserving the deckjsx Template Area Kind itself and
    must not semantically disguise generic anchors as body/title placeholders.
  - Resolved for the current v0.8.0 slice: Composed Visual Paint Order View and Effective Projected
    Style View live under `ProjectInspectionSummary.details` and are generated only for
    `deck.project({ inspection: "details" })`. They are byte-free views over PptxPackageModel slide
    drawing nodes, generated background/stroke layers, paint-order inputs, resolved projected
    values, layout anchors, visibility, and origins; they are not writer input and do not become a
    second drawing tree.
  - Resolved for the current v0.8.0 slice: the derived-inspection cost model is Project-only and
    detail-gated. Default Project returns the cheap summary without `details`, Project with
    `inspection: "none"` skips summary materialization, and Render runs its internal Project with
    `inspection: "none"` even when Render itself asks for detailed assembly/output inspection. Render
    summaries therefore remain assembly/output summaries and do not eagerly compute composed paint
    order, effective projected styles, package dependency invalidation, paint fallback aggregation,
    or theme projection detail views.

- Asset and media details:
  - Resolved: `AssetLoader` `probe`/`load` result fields are validated at the asset boundary:
    `mediaType`, `extension`, and `hash` are non-empty strings when present; `width` and `height`
    are positive finite numbers; `byteLength` is finite and non-negative; `load.bytes` is a
    `Uint8Array`; invalid results become stage-specific diagnostics.
  - Resolved: loader composition order is deterministic: registered loaders run first in call order,
    built-in data/bytes/URL handling runs as fallback, and Render reuses the Project-winning
    resolver scope for byte loading.
  - Resolved: Asset Artifacts are keyed by Asset Entity identity and indexed by normalized Authored
    Media Source plus resolver scope for repeated-source probe/load reuse.
  - Resolved: asset loader failure diagnostics preserve source, resolver scope, phase, Asset Entity,
    and media package part context.
  - Resolved: repeated media references use one PPTX Media Part when their Media Allocation Key
    matches. Content hash is preferred when available; otherwise resolver scope plus authored source
    is used. Per-slide image relationships are still deterministic `rIdN` values assigned from
    projected drawing/background order, and repeated use of the same media part on one slide reuses
    the same relationship id.

- Writer/build/assembly details:
  - Resolved: final ZIP entry order comes from the Assembly Plan, and the ZIP module consumes ordered
    entries through fflate's streaming `Zip` API instead of requiring the writer to build an
    unordered entry map.
  - Resolved: ZIP compression policy and fflate integration stay internal to the PPTX writer ZIP
    module; public options remain semantic compression modes.
  - Resolved: Assembly Plan entry compression is applied at ZIP entry emission time, so media entries
    can be stored while XML entries use the selected semantic compression mode.
  - Resolved: Node path output belongs behind a runtime output boundary rather than the PPTX writer
    core or pipeline runner static imports.
  - Resolved: slide master and slide layout relationship files are projected package parts with
    package identity, order keys, fingerprints, relationships, and Assembly Plan entries; the direct
    writer no longer creates them as implicit ZIP entries.
  - Resolved: package validation now treats missing support relationships required by presentation,
    slide master, and slide layout XML as model errors before Render emits bytes.
  - Resolved: direct writer pre-render package consistency validation reports
    `E_RENDER_PACKAGE_VALIDATION_FAILED`, preserves underlying package validation codes in notes,
    returns no artifact, and avoids starting Assembly Plan byte emission for invalid package models.
  - Resolved for the current v0.8.0 slice: Pptx Package Build Artifacts carry structured
    `buildNotes`. Resolved payload fields now include Package Part Identity, final path, bytes, part
    fingerprint, dependency fingerprints, writer fingerprint, part-emitter fingerprint, media byte
    fingerprint, diagnostics, and build notes with rebuild reason, part kind, byte length,
    fingerprint references, dependency fingerprint count, optional media byte fingerprint, and
    diagnostic code references.
  - Resolved for the current v0.8.0 slice: Assembly Plan entries expose nested `expected` and
    `final` records while retaining flat summary fields for current callers. Expected entries carry
    projected path, package part id, order key, requirement, evaluated required flag, requirement
    condition/dependencies/reason, and compression; final entries carry status, byte length, reason,
    and message. The requirement reason is byte-free projected metadata and keeps sandbox/HMR
    summaries from losing why Project marked a part required, optional, or conditional. Assembly
    failure diagnostics also include this requirement reason in their notes so CI and sandbox error
    views do not have to inspect the full summary to explain why the missing entry was required.
  - Resolved for the current v0.8.0 slice: output side-effect readiness/result is exposed through
    `summary.output`, including not-requested, skipped, unavailable, failed, and written states.
  - Resolved for the current v0.8.0 slice: direct PPTX path output uses an internal file sink tee
    with the collecting artifact sink, lowering duplicate ZIP work while keeping streaming ZIP out
    of the public API. Final entry status now includes `reused`, `rebuilt`, `missing`, and `failed`;
    failed part emitter entries carry structured reason/message details and block required package
    assembly.
  - Resolved: output side-effect failure diagnostics use `E_RENDER_OUTPUT_WRITE_FAILED` rather than a
    separate writer-specific code.
  - Resolved: missing required Assembly Plan entries use `E_RENDER_PACKAGE_ASSEMBLY_FAILED` with
    entry path labels, packagePartId/requirement/required/reason notes, and help pointing callers to
    `render.summary.assembly.entries`.
  - Resolved for the current v0.8.0 slice: missing optional Assembly Plan entries are covered as
    non-blocking assembly results. They stay visible in the Assembly Plan summary, do not emit ZIP
    entries or Build Artifacts, and do not create `E_RENDER_PACKAGE_ASSEMBLY_FAILED` while every
    required part is available.
  - Resolved: ZIP source failures after Assembly Plan validation also use
    `E_RENDER_PACKAGE_ASSEMBLY_FAILED`, keep the Assembly Plan summary, and omit the rendered
    artifact.
  - Resolved: collecting and tee ZIP sink interfaces are internal writer boundaries. Public Render
    collects artifact bytes and keeps path output as a runtime side effect rather than introducing a
    public streaming or sink mode.
  - Resolved: path side-effect failures attach `E_RENDER_OUTPUT_WRITE_FAILED` diagnostics to Render
    while preserving collected artifact bytes and omitting written output metadata.
  - Resolved: unavailable path-output runtime boundaries are distinguished from filesystem write
    failures with `reason=runtimeOutputUnavailable`; ordinary file write failures use
    `reason=outputWriteFailed`.
  - Resolved: Node path output now has a true internal file sink for the direct PPTX writer. The
    public Render API remains artifact/result based, and benchmarks continue measuring path output as
    a side-effect path.
  - Resolved for the current v0.8.0 slice: path-output regression coverage now verifies that bytes
    written through the Node file side-effect sink are exactly the same bytes returned on
    `RenderResult.artifact.bytes`. This guards the single-ZIP-generation tee design and keeps path
    output from becoming a second, divergent package generation path.
  - Resolved: local benchmark script and loose baseline budgets now cover representative projection,
    warm Project cache, first-project and warm-project asset probe/load counts, cold writer, ZIP byte
    output, warm writer reuse, path-output render, template/layout fixtures, and Build Artifact reuse
    counts plus warm Assembly Plan reused/rebuilt/missing/failed counts without requiring PowerPoint
    or GUI tooling.
  - Resolved for the current v0.8.0 slice: detailed Derived Projection Inspection View generation
    benchmarks cover `inspection: "details"` composed paint order, effective projected styles,
    package dependency invalidation, paint fallback aggregation, and theme projection provenance.

- Module boundary details:
  - Resolved: `src/adapter.ts` is the public adapter factory boundary, and direct writer internals
    should not be re-exported through it.
  - Resolved: `src/runtime/node-output.ts` or an equivalent runtime module owns Node filesystem path
    output; the pipeline runner may dynamically call that boundary only when a path side effect is
    requested.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/package-xml.ts` owns content type and
    relationship XML emission, including package-root relationship targets. This keeps package
    topology serialization below the PPTX writer composite instead of growing the main writer entry
    point.
  - Resolved for the current v0.8.0 slice: package XML regression coverage verifies
    `defineProjection()` edits to content-type defaults/overrides and relationship payload records
    are reflected in emitted `[Content_Types].xml` and `.rels` XML.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/support-xml.ts` owns presentation,
    theme, slide master, slide layout, docProps, view properties, and presentation properties XML
    emission. These support emitters remain internal and are not exported through the public adapter
    seam.
  - Resolved for the current v0.8.0 slice: document-property support XML requires structured
    `docProps/core.xml` and `docProps/app.xml` payloads from PptxPackageModel rather than reading
    projection-level metadata as a fallback. Direct writer regression coverage verifies
    `defineProjection()` edits to those payloads are reflected in emitted XML.
  - Resolved for the current v0.8.0 slice: `docProps/core.xml` always carries projected `meta`
    metadata in its support payload, using an empty object when the deck declares no metadata.
    The writer rejects missing `meta` instead of substituting `{}` so HMR/sandbox checks can observe
    a broken PptxPackageModel before serialization.
  - Resolved for the current v0.8.0 slice: presentation support XML requires structured
    `ppt/presentation.xml` payload fields for size and slide membership rather than reading
    projection globals as fallback data. Direct writer regression coverage verifies
    `defineProjection()` edits to the payload alter emitted presentation size and slide ids.
  - Resolved for the current v0.8.0 slice: presentation support XML no longer accepts a missing
    support part and recovers it from `projection.parts`. The emitter must receive the current
    package part so malformed or absent `ppt/presentation.xml` entries remain observable as
    PptxPackageModel errors.
  - Resolved for the current v0.8.0 slice: view/presentation property support XML accepts the
    structured empty support payload as its input and regression coverage verifies the emitted root
    elements for `ppt/viewProps.xml` and `ppt/presProps.xml`.
  - Resolved for the current v0.8.0 slice: slide master/layout support XML regression coverage
    verifies `defineProjection()` edits to slide-master color maps and slide-layout names are
    reflected in emitted OOXML.
  - Resolved for the current v0.8.0 slice: theme support XML regression coverage verifies
    `defineProjection()` edits to theme name, color-scheme name/colors, font-scheme name/typefaces,
    and format-scheme name are reflected in emitted OOXML. The emitter also rejects missing or
    malformed required theme scheme values instead of substituting fallback colors or font metadata.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/media.ts` owns media payload lookup,
    byte extraction from Asset Artifacts or data URIs, and render-time media-load diagnostics. The
    main writer entry point consumes that internal boundary while keeping media bytes out of
    PptxPackageModel.
  - Resolved for the current v0.8.0 slice: media writer regression coverage verifies
    `defineProjection()` edits to a media part payload source are reflected in emitted media entry
    bytes, while the model still stores only source/metadata and not loaded bytes.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/assembly.ts` owns Assembly Plan
    expected/final entry shaping, summary generation, required-entry diagnostics, and conversion
    from successful plan entries to ZIP entries. The direct writer consumes this boundary instead of
    carrying Assembly Plan policy inline.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/build.ts` owns Pptx Package Build
    Artifact reuse/invalidation, writer and part-emitter fingerprints, media byte fingerprints,
    projected part fingerprint consumption, rebuild reasons, and build-note construction. The direct
    writer now asks this boundary whether bytes can be reused rather than carrying cache policy
    inline, and build helpers reject missing projected order keys or part fingerprints instead of
    inventing writer-local replacements.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/package-part.ts` owns shared
    package-part metadata helpers, starting with stable order-key access used by both Assembly Plan
    construction and Build Artifact reuse.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/emit.ts` owns package-part emission
    dispatch and keeps package/support XML byte routing out of the direct writer entry point.
  - Resolved for the current v0.8.0 slice: presentation and slide-master support XML consume
    projected relationship ids from PptxPackageModel relationship parts. Support XML may still emit
    deterministic non-relationship numeric ids, but it must not recreate `rId` values from local
    assumptions when Project has already assigned them. Missing projected `r:id` values now fail the
    support emitter instead of producing incomplete presentation or slide-master XML. The same
    support emitter paths also require projected package part paths for their relationship owner
    lookup instead of falling back to `ppt/presentation.xml` or `ppt/slideMasters/slideMaster1.xml`.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/slide-xml.ts` owns slide drawing XML
    emission, including slide skeleton, shape tree setup, drawing traversal, and slide relationship
    id consumption. The package writer now injects this focused emitter into package-part dispatch.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/shape-xml.ts` owns shape, text-box,
    image, and group drawing-node dispatch; inherited opacity composition; generated layer calls;
    shape property calls; text body calls; picture calls; and recursive group children emission. It
    consumes projected drawing nodes and helper emitters without reading graph or layout state.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/drawing-layer-xml.ts` owns generated
    outline and edge stroke emission plus background layer routing. It delegates background-image
    tiles to `picture-xml` and asks `slide-xml` to serialize synthetic solid/gradient background
    shapes through a callback. Solid/gradient background layers must already carry their projected
    frame, and generated border/outline strokes must already carry projected generated stroke layer
    records; this emitter routes and serializes the Pptx Package Model, but does not infer missing
    slide/node fallback rectangles, generated stroke frames, or generated shape identities.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/drawing-xml.ts` owns shared
    drawing-property XML emission for colors, fills, strokes, shadows, transforms, non-visual
    properties, hyperlinks, and shape properties. It is an internal PPTX writer helper consumed by
    `slide-xml.ts`, not a second XML model layer or public extension point.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/picture-xml.ts` owns image relationship
    lookup, projected intrinsic size lookup, crop/source-rectangle calculation, background image
    tiling, and picture/background-picture XML emission. It consumes projected media topology,
    projected media dimensions, and drawing nodes but does not own media byte loading, SVG data URI
    measurement, or hidden package relationships.
  - Resolved for the current v0.8.0 slice: `src/writers/pptx/text-xml.ts` owns text body, paragraph
    property, rich text run property, hyperlink, bullet/numbering, tab-stop, font, color, underline,
    baseline, wrap, and direction XML emission. It consumes projected text content/style data and
    does not read graph or resolved-style state directly.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/identity.ts` owns deterministic PPTX
    package part, element, serialized object, and relationship identity helpers. Projection consumes
    this boundary instead of defining output-specific identity inline.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/fingerprint.ts` owns stable JSON,
    deterministic fingerprint strings, Pptx Package Part Fingerprint construction, and dependency
    fingerprint attachment. Projection consumes this boundary after order/requirement metadata is
    evaluated.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/model.ts` owns the stable
    PptxPackageModel-related type graph, including package parts, drawing nodes, relationships,
    support payloads, manifest payloads, media payloads, theme/layout payloads, and inspection
    summary records. `src/projection/pptx/index.ts` re-exports these types for projection-entry
    compatibility while internal modules import the snapshot types directly from the model node.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/project.ts` owns the PPTX projection
    orchestration path from graph/resolved styles/layout/support/media/manifest/order/requirements/
    fingerprints into a PptxPackageModel. `src/projection/pptx/index.ts` re-exports this entry point
    instead of owning the projection process itself.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/package-parts.ts` owns package part
    order key construction, package part group order, relationship target extraction, and package
    part requirement evaluation. This keeps Render Assembly Plan requirement policy grounded in
    PptxPackageModel metadata rather than writer-local inference.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/media.ts` owns media source keys,
    media allocation keys, media package part ids, loader-probe metadata projection, deterministic
    media extensions, Pptx media payload construction, background/image media discovery, canonical
    image media part assignment, media package part merging, and slide media relationship attachment.
    Media topology is now Project-owned instead of writer-local or main-entry-point-local.
  - Resolved for the current v0.8.0 slice: slide relationship ids for background media, drawing
    media, and external hyperlinks are allocated by Project in stable per-slide `rId1..N` order.
    Same-slide background/image media reuse keeps a single image relationship, while image/text/shape
    hyperlinks receive their own projected relationship records and serialized drawing references.
    The direct writer consumes these ids instead of inventing relationship ids during XML emission.
  - Resolved for the current v0.8.0 slice: background layers now carry projected serialized shape
    object ids in PptxPackageModel. Slide-level and element-level image, gradient, and solid
    background layers are validated in the same writer-safe shape-object-id space as drawing nodes
    and generated stroke layers, so the direct writer no longer allocates fallback non-visual id
    bases for background layer shapes or background pictures during XML emission.
  - Resolved for the current v0.8.0 slice: drawing traversal and drawing reconstruction are a
    projection concern, not a writer concern. `src/projection/pptx/drawing.ts` owns slide drawing
    children access, recursive drawing walks, drawing-node mapping, and `PptxSlideDrawing`
    reconstruction while the main projection entry point calls it as orchestration.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/theme.ts` owns default PPTX theme
    colors, default color mapping, and Pptx Theme Projection trace construction. The main projection
    entry point consumes that boundary instead of embedding theme-support mapping logic inline.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/support.ts` owns default support
    package part creation for content types, root/presentation relationships, presentation, document
    properties, default theme, default slide master, default slide layout, view properties, and
    presentation properties. The main projection entry point now receives these seed package parts
    as a support topology bundle before manifest assembly, slide projection, media projection, order
    keys, requirements, and fingerprints are attached.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/inspect.ts` owns Pptx Project
    Inspection Summary construction, including package part summaries, media summaries, filtered
    records, slide element summaries, diagnostic summaries, adapter limitation summaries, and
    unsupported semantic rollups. It consumes the shared Pptx Drawing Projection traversal helper
    rather than defining its own recursive drawing walk.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/style.ts` owns PPTX projection
    style helpers that choose resolved style inputs, safely probe CSS-like background/fill,
    transform, and shadow semantics, and produce `W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC` diagnostics
    for graph nodes whose meaning can be preserved for inspection even when the direct writer uses a
    fallback.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/slide.ts` owns slide-part drawing
    projection from Semantic Author Graph and Projected Layout nodes into `PptxSlidePart` payloads.
    It keeps text, image, shape, group, background, z-index ordering, generated drawing identity, and
    partial-projection element fallback policy out of the main package projection orchestrator.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/validation.ts` is the package
    consistency validation entry consumed by pipeline and writer code, and it owns detailed
    PptxPackageModel package consistency validation against the stable model snapshot.
  - Resolved for the current v0.8.0 slice: the package-model snapshot node is
    `src/projection/pptx/model.ts`.
  - Resolved for the current v0.8.0 slice: `deckjsx/inspect` now exposes typed
    `PptxMediaPart` and `PptxSupportPart` aliases that bind package part `kind` / `category` to the
    expected structured payloads. The base `PptxPackagePart` remains available for package-wide
    indexing and malformed `defineProjection()` validation, while typed media/support parts make the
    intended PptxPackageModel payload contract visible to sandbox and inspection tooling.
  - Remaining: decide whether remaining flat writer helper files should become folders once
    part-emitter-specific fingerprint granularity settles.
  - Resolved for published entry points: the root export map is intentionally limited to `deckjsx`,
    `deckjsx/adapter`, `deckjsx/inspect`, JSX runtimes, and `package.json`.
  - Resolved for the current v0.8.0 slice: `src/projection/pptx/index.ts` is now an explicit compatibility
    barrel for PPTX projection commands and named model snapshot types instead of `export type *`.
    Internal tests and helpers import model snapshot types from `src/projection/pptx/model.ts` or the
    public `deckjsx/inspect` surface rather than using the projection command barrel as an implicit
    type source.
  - Resolved for the current v0.8.0 slice: `deckjsx/inspect` has seam-specific type tests for the
    PptxPackageModel inspection vocabulary, while root authoring and adapter type tests reject
    detailed PPTX model and payload exports that should not leak through those surfaces.
  - Resolved for the current v0.8.0 slice: public seam type tests now also reject deep package
    subpath imports for direct-writer, projection-validation, ZIP, and runtime-output internals.
    This complements export-map/declaration-output checks by proving TypeScript package resolution
    cannot treat implementation folders as public adapter, authoring, or inspection entry points.
  - Remaining: keep projection helper modules flat until a boundary has multiple cohesive files with
    independent tests or ownership. Do not create folders only for ceremony.

- Validation fixture details:
  - Resolved for the current v0.8.0 slice: the initial pinned pptxgenjs oracle package lives under
    `.github/compat/pptxgenjs/` and is invoked by `.github/workflows/pptx-generation-regression.yml`.
  - Resolved for the current v0.8.0 slice: `.github/workflows/release.yml` also runs the strict
    direct PPTX writer benchmark, render fixture verification, and the pinned oracle compare before
    packing or publishing, so the release path enforces the same core generation gates as local
    release checks.
  - Resolved for the current v0.8.0 slice: direct writer semantic package assertions now cover
    package topology, content types, relationship targets, same-slide media reuse, and Assembly Plan
    to ZIP entry consistency for a mixed package fixture.
  - Resolved for the current v0.8.0 slice: direct writer ZIP/XML regression coverage now verifies
    template-derived slide layout topology: content type overrides for default and template-derived
    slide layouts, slide master relationships to both layouts, slide relationships targeting the
    selected template layout, slide layout relationship parts pointing to the slide master, and the
    emitted `p:sldLayout` payload name for the template.
  - Resolved for the current v0.8.0 slice: direct writer ZIP tests now verify deterministic central
    directory metadata for fixed entry ordering and the fixed ZIP/DOS `1980-01-01 00:00:00`
    timestamp policy that supports repeatable PPTX bytes across time zones.
  - Resolved for the current v0.8.0 slice: document-property regression tests now assert that
    `docProps/core.xml` omits volatile `dcterms:created` and `dcterms:modified` timestamps by
    default, keeping equivalent projects byte-stable unless authors provide explicit metadata in a
    later API.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers a
    multi-slide fixture and verifies both image relationships and external hyperlink relationships,
    so CI catches more migration regressions than the initial single-slide geometry/color smoke.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers a
    paint-order fixture. deckjsx uses intentionally out-of-source-order `zIndex` values while the
    oracle uses insertion order, and both generated packages are checked for the same Back → Middle →
    Front XML order signal plus the expected fill color.
  - This paint-order oracle is specifically a graph-to-PptxPackageModel-to-writer regression guard:
    it proves that authored z-index input is not flattened away during projection, and that the
    direct writer consumes `PptxSlideDrawing.children` as the final PPTX drawing order instead of
    silently falling back to JSX/source order.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers rich text
    runs. Both the direct writer fixture and the pinned oracle emit leading, styled, and trailing text
    runs, and CI checks the styled run's color and bold signal so migration regressions in text-body
    run XML are caught without relying on raw byte equality.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers shape
    effects that are easy to regress during direct writer migration: rotation, transparent fill,
    transparent stroke, and dashed stroke XML signals. This keeps geometry/color/image/hyperlink/
    paint-order/rich-text checks from being the only migration oracle signals.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers image
    crop/source-rectangle output. Both direct and oracle fixtures include a crop slide, and CI checks
    the image relationship plus `a:srcRect` signal so image fitting/cropping regressions do not hide
    behind generic image-relationship coverage.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now also covers image
    transform/effect output that the pinned oracle can express cleanly. Both direct and oracle
    fixtures include an image-effects slide, and CI checks the image relationship, rotation,
    horizontal/vertical flip, and transparency signals so image emission regressions are not limited
    to crop/source-rectangle coverage.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers shape
    shadow output. Both direct and oracle fixtures include a shadow slide, and CI checks the
    `a:outerShdw` effect plus expected shadow color so direct writer effect-list regressions are not
    limited to rotation/transparency/dash coverage.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers text-body
    semantics. Both direct and oracle fixtures include a text-body slide, and CI checks RTL paragraph
    mode, superscript/subscript baseline signals, wavy underline color, bullet character, and
    numbering XML signals so typography/list migration regressions do not rely only on unit tests.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers paragraph
    text-layout semantics. Both direct and oracle fixtures include a paragraph slide, and CI checks
    vertical text direction, left/center/decimal tab-stop XML signals, point and percentage line
    spacing, paragraph spacing-before/after XML signals, character spacing, text fit, and vertical
    text-body alignment, plus text-body inset/padding and paragraph alignment signals so
    paragraph-layout regressions are covered by the migration oracle.
  - Resolved for the current v0.8.0 slice: direct writer source assertions now verify that primary
    package/support/slide XML emitters avoid direct raw XML fragment insertion.
  - Resolved for the current v0.8.0 slice: direct writer Assembly Plan tests now cover missing
    optional entries as non-blocking package assembly results.
  - Resolved for the current v0.8.0 slice: render verification has a concrete command,
    `bun run .github/render/verify-render.tsx --strict`, and `.github/workflows/render-verification.yml`
    runs it inside `.github/render/Dockerfile` with LibreOffice and ImageMagick available. The script always
    writes a manifest and verifies PPTX package structure; when render tools are enabled it also
    emits PDF/PNG artifacts for inspection.
  - Resolved for the current v0.8.0 slice: render verification uses the existing `fflate`
    dependency to inspect generated PPTX ZIP entries rather than adding a separate ZIP parser
    dependency.
  - Resolved for the current v0.8.0 slice: render verification now includes direct OOXML and semantic
    package assertions for a dedicated v0.8 generation-regression fixture covering template-derived
    slide layout topology, image relationships, external hyperlinks, z-index paint order, rich text
    run color/bold signals, image crop/source-rectangle output, shape shadow output, and gradient
    fill output, plus text-body semantics for RTL, baseline, underline, bullets, numbering, line
    spacing, paragraph spacing, character spacing, text fit, vertical text-body alignment, and
    text-body inset/padding, with CSS text-align values mapped to PPTX paragraph alignment values.
    The generated manifest records category-specific raster artifact expectations even when raster
    tools are disabled, including `imageCrop`, `shadowEffect`, `colorFill`, and `text` expectations
    for the v0.8 crop, shadow, gradient, and typography slides. The package assertions for these
    v0.8-only semantic classes are tied to the expected fixture slide XML rather than the
    concatenated deck XML.
  - Resolved for the current v0.8.0 slice: render verification accepts `--baseline <manifest>` and
    compares manifest-level fixture/package/raster expectations. When the baseline includes raster
    PNGs, the comparison checks artifact presence, tolerance contracts, byte length tolerance, and
    ImageMagick `compare -metric AE` different-pixel counts against category-specific budgets. Diff
    PNGs are recorded in the current manifest when pixel comparison runs.
  - Resolved for the current v0.8.0 slice: render verification and the isolated pinned oracle now
    report full diagnostics details when the direct deckjsx render fails, not only diagnostic codes.
    Their fixtures also avoid asking the Project/media path for intrinsic dimensions when the test is
    only checking media topology by using explicit stretch fitting for dimensionless PNG data images.
    This keeps the release gates aligned with the v0.8 requirement that fitting modes needing
    intrinsic media size must receive projected metadata before Render.
  - Resolved for the current v0.8.0 slice: the pinned pptxgenjs oracle compare now covers an
    eleventh image-underlay slide, checking that both deckjsx's direct writer and the pinned oracle
    preserve the image relationship and keep foreground text after the underlay picture in drawing
    XML order.
  - Remaining: continue adding richer pinned pptxgenjs oracle checks only for migration scenarios
    that `pptxgenjs` can express cleanly beyond the current multi-slide
    hyperlink/image/paint-order/rich-text/effects/crop/image-effects/shadow/text-body/text-layout/
    image-underlay fixture. Gradient output remains covered by direct OOXML/render verification
    because the pinned `pptxgenjs` API does not expose an equivalent gradient-fill authoring surface.

### v0.8 Public Surface and Performance Review Notes

These notes are release-review checkpoints for v0.8.0. They are not a smaller scope than the
implementation plan above; they describe which public contracts and hot-path properties must remain
true while finishing the direct PPTX writer.

Review conclusion:

- The current v0.8.0 design is acceptable from a public-surface perspective only if the direct PPTX
  writer remains an implementation behind the existing stage APIs. The release should not create a
  new writer-control surface to make the implementation feel easier to explain.
- The current design is acceptable from a performance perspective only if PptxPackageModel stays the
  Project-owned package snapshot and Render owns byte materialization through reusable Build
  Artifacts. A design that becomes fast by pushing XML bytes, media bytes, sink handles, or ZIP state
  into PptxPackageModel fails the review even if benchmarks look good for small decks.
- The main remaining review risk is evidence, not direction. Before v0.8.0 is released, tests and
  docs must prove that public exports are classified, writer internals are not importable, root
  dependencies do not reintroduce `pptxgenjs`, cold and warm timings are tracked separately, and
  CSS-like unsupported semantics survive projection as diagnostics/fallback metadata.
- Repeat this review whenever a new public type, writer helper, render summary field, asset
  boundary, benchmark fixture, or generated package part is added. Every addition should have an
  owning model, writer module, or inspection summary instead of becoming a convenient cross-layer
  helper.

Review follow-up status:

- Implemented evidence: `tests/pptx/public-surface.test.ts` now guards the published `files` allowlist,
  exact export-map targets, export-map target file existence in `dist`, root runtime dependency
  shape, absence of core `pptxgenjs` source imports, public sample dependency shape, absence of
  `pptxgenjs` from the public sample lockfile, and generated public declaration output. The test
  reports a build-first error when `dist` is missing, keeping the release/public-surface gate tied to
  generated declarations rather than stale local state. Seam-specific type tests also verify that
  `deckjsx/adapter` exposes semantic `PptxCompressionMode` rather than low-level ZIP/fflate
  configuration, that the removed `pptxgenjs` adapter export is not importable from root or adapter
  seams, and that Asset Artifacts, Build Artifacts, XML helpers, ZIP helpers, and writer internals
  are not importable through public seams.
- Implemented evidence: CI and release gates now run `bun run build` before `bun run test` so the
  public-surface tests inspect fresh generated declarations in `dist` instead of stale local output
  or a missing clean-checkout directory. They also install and run the public sample smoke after the
  build, proving that `sample` consumes the local built direct-writer package instead of a stale npm
  release. Local release docs and README development checks use the same order.
- Implemented evidence: PPTX writer and project/render pipeline tests no longer use `as unknown as`,
  broad `Record<string, unknown>` payload spreading, or `as object` to read package model payloads.
  Valid fixture mutations now narrow through exported package-part guards and payload discriminants;
  intentionally malformed validation fixtures mark only the broken field with `as never`.
- Implemented evidence: unnecessary `unknown` widening has been reduced across the authoring and
  projection pipeline. Author Tree child collection now uses `AuthorTreeChild`, graph construction
  reads `AuthorElementProps`, layout rich-text extraction reads `JsxNode`, composition plans store a
  typed slide factory bridge, and PPTX slide/style projection reads concrete crop, text-transform,
  and style declaration value types. Remaining `unknown` usage is reserved for real runtime
  boundaries such as JSX entrypoints, thrown errors, user-provided malformed projection snapshots,
  and package consistency validators.
- Implemented evidence: package consistency validation now checks the CSS-like projection
  connection points that are easy to accidentally flatten during direct writer migration, including
  clipping metadata, measurement metadata, top-level z-index, flip flags, known visibility values,
  paint-order metadata, unsupported semantic records, fill/stroke/effect payloads, and text payloads.
- Implemented evidence: `deckjsx/inspect` and Project Inspection Summary now expose byte-free
  drawing summaries for visibility, z-index, paint order, measurement, clipping, opacity, rotation,
  flip flags, and background layers, so sandbox/HMR tooling can inspect those projected values
  without traversing writer internals or reading serialized bytes. Public type tests verify that
  background-layer summaries expose `sourceKind` rather than authored source payloads, and that
  z-index remains available as projected drawing metadata rather than only as an XML order side
  effect.
- Implemented evidence: Project media inspection summaries now expose media package part identity,
  package path, source kind, and projected media metadata such as media type, extension, dimensions,
  byte length, and hash. They deliberately do not expose media bytes or authored/resolved source
  payloads, keeping Asset Artifacts and loader-specific data outside the public inspection contract.
- Implemented evidence: typed media/support package-part aliases are exposed from `deckjsx/inspect`
  only as PptxPackageModel inspection vocabulary. They strengthen the structured payload contract
  for sandbox tooling without exposing Build Artifacts, XML chunks, ZIP entries, sink handles, or
  render-time media byte stores.
- Implemented evidence: Project package-part summaries now expose whether a part carries structured
  payload data and, for discriminated payloads, the payload kind. This gives sandbox/HMR tooling a
  byte-free package overview without exposing raw support/media payload objects through the summary
  layer.
- Implemented evidence: Project package-part summaries now also expose projected requirement
  metadata, projected order keys, stable package part fingerprints, and dependency-fingerprint
  counts. This keeps package intent and invalidation inputs visible at Project time without making
  callers wait for Render Assembly Plan output or exposing package-part Build Artifact storage.
- Implemented evidence: Project Inspection Summary now exposes a byte-free relationship overview
  with owner part identity/path, relationship id/type, target path, optional target part id, and
  external target mode. This lets sandbox/HMR tooling inspect package relationship topology at
  Project time without reading `.rels` XML or writer Assembly Plan entries.
- Implemented evidence: Project Inspection Summary now also exposes a byte-free package dependency
  overview. Each dependency edge records owner/target package part ids and paths plus whether the
  edge came from a relationship target, content-type override, requirement dependency, or dependency
  fingerprint. Requirement dependency edges also preserve the requirement status/condition that made
  the referenced part relevant. This gives HMR/sandbox tooling a direct explanation of package
  invalidation inputs and required-part evaluation, while
  `summary.pptx.packageDependencyCount` gives a cheap aggregate topology signal without exposing
  Build Artifacts, XML bytes, ZIP entries, or writer reuse maps.
- Implemented evidence: Project Inspection Summary derives relationship summaries, package
  dependency edges, and their aggregate counts from the same package-topology pass. This keeps the
  expanded inspection surface aligned with the v0.8.0 performance rule that summary data should not
  repeatedly walk package topology when one projected snapshot already contains the required facts.
- Implemented evidence: root public type tests now classify Render Assembly reuse summaries as
  byte-free projected result vocabulary. `RenderAssemblyPlanEntrySummary` is guarded against exposing
  internal build artifacts, ZIP entries, or XML payload slots, and `RenderAssemblyBuildSummary` is
  guarded against exposing serialized bytes, serialized XML, or low-level ZIP compression options.
- Implemented evidence: public-surface tests now also pin the multi-runtime output boundary by
  allowing Node filesystem/path imports only in `src/runtime/node-output.ts`. PPTX projection,
  direct writer, asset probing, package validation, and ZIP assembly must stay free of static Node
  builtin imports so browser and Edge-like runtimes can still use the collected-byte render path.
  The same test suite also checks the generated public entry files so `deckjsx`,
  `deckjsx/adapter`, `deckjsx/inspect`, and JSX runtime entry points do not gain static Node builtin
  imports through bundling drift.
- Remaining evidence: continue adding explicit public-surface tests whenever a new public entry,
  generated declaration reference, or result-summary field is introduced. In particular, background
  layer summary regressions and any future detail-gated inspection view should prove that they expose
  projected meaning rather than Asset Artifact storage, Pptx Package Build Artifact storage, XML
  chunks, ZIP/sink handles, or fflate settings.
- Implemented evidence: benchmark reports now separate cold Project summary cost, `inspection:
"none"` Project hot-path cost, warm Project cache timing, first-project and warm-project asset
  probe/load counts, cold writer time, ZIP assembly time, warm writer reuse time with
  reused/rebuilt/missing/failed Assembly Plan counts, and path-output side-effect timing. A faster
  result is not accepted unless the report shows that required package validation, unsupported-
  semantic diagnostics, and projected fallback metadata stayed on the observed contract.
- Implemented evidence: release documentation now treats warm Assembly Plan
  reused/rebuilt/missing/failed counts as review evidence. Unexpected warm `missing` or `failed`
  entries are release blockers unless the benchmark fixture is intentionally exercising that
  diagnostic path and asserts the corresponding failure explanation.
- Implemented evidence: strict benchmark failure handling now enforces the same structure contract,
  not only timing budgets. It fails if warm Assembly Plan output has unexpected missing or failed
  entries, if no package entries are reused, if Project calls asset `load()` during metadata
  projection, if cached warm Project repeats probe/load work, if ZIP entry materialization is empty,
  or if path-output render does not report `written`.
- Implemented evidence: direct writer XML chunk reuse is covered as an internal writer test rather
  than a public API. The public-surface rules still keep XML helpers, ZIP/sink handles, fflate
  settings, and Build Artifact storage out of `deckjsx`, `deckjsx/adapter`, and `deckjsx/inspect`.

Public surface review:

- `deckjsx` remains the authoring interface. It should expose Deck, JSX authoring primitives,
  diagnostics, graph/theme/style inspection vocabulary, and stage commands, but not direct writer
  internals.
- `deckjsx/adapter` remains the writer-adapter interface. In v0.8.0 it may expose `pptx()`,
  semantic render options, adapter result/context types, and output format vocabulary. It must not
  expose XML helpers, Assembly Plan builders, ZIP sinks, fflate settings, media byte stores, or Pptx
  Package Build Artifact storage as ordinary adapter-authoring API.
- `deckjsx/inspect` remains the inspection interface for projected PPTX data. It may expose
  PptxPackageModel and related projected package, drawing, media, theme, layout, diagnostic, and
  unsupported-semantic types. It must not turn PptxPackageModel into a mutable OOXML builder, XML
  emission layer, or writer extension API.
- The package export map should stay limited to `deckjsx`, `deckjsx/adapter`, `deckjsx/inspect`, JSX
  runtimes, and `package.json`. New public entry points require an explicit seam classification
  before publication.
- Export-map review must check both keys and targets. Wildcard subpaths, deep internal paths, and
  generated chunk targets are not acceptable public API even if the exported names look classified.
  Published targets should resolve only to the intentional built entry files for the three public
  seams, JSX runtimes, and `package.json`.
- The default render path is the direct PPTX writer, internally equivalent to `pptx()`. Public docs
  should not reintroduce `pptxgenjs` as a built-in, temporary runtime path, adapter example, or root
  dependency. `pptxgenjs` may appear only in isolated regression-oracle tooling.
- Public behavior for CSS-like values should stay HTML/CSS-like in spirit: observable values should
  project into model metadata, fallback records, and diagnostics where possible. Unsupported
  projection should warn and preserve structured data unless the projected package would be invalid
  or a committed field cannot be serialized.
- Pre-Render package consistency validation is part of the public stage contract, not a writer
  implementation detail. Invalid `defineProjection()` edits should fail Project/Render with
  diagnostics that point at PptxPackageModel paths, while valid but unsupported CSS-like meanings
  should remain warnings with structured fallback metadata.
- Graph-to-PptxPackageModel conversion must preserve future-facing drawing metadata such as
  z-index/paint-order inputs, clipping metadata, template layout anchors, theme projection traces,
  unsupported semantic records, and media allocation identity even where v0.8.0 cannot perfectly
  reproduce every visual behavior yet.

Public surface review failure conditions:

- Adding a new export because an internal direct-writer module is convenient is a failure unless the
  export is first classified as Authoring Interface, Adapter Interface, or Inspection Interface.
- Exposing streaming ZIP, sink selection, XML emitters, fflate configuration, Assembly Plan builders,
  Build Artifact storage, or media byte artifacts as ordinary user-facing controls is a failure for
  v0.8.0.
- Adding extra public success booleans or output-state shortcuts beside the existing result-first
  `ok`/diagnostics/artifact shape is a failure unless a later API decision proves that the current
  result contract cannot express the state.
- Reintroducing `pptxgenjs` as a built-in adapter, runtime dependency, README example, or public
  compatibility path is a failure. It may remain only in isolated oracle tooling or future external
  packages.
- Treating valid but unsupported CSS-like meaning as an authoring error is a failure when the value
  can be preserved as projected metadata, warning diagnostics, or structured fallback records.

Public surface review implementation gates:

- Every new exported type, value, or subpath added during v0.8.0 must be assigned to exactly one
  public seam before it is merged:
  - Authoring Interface: Deck, JSX/runtime authoring vocabulary, stage commands, diagnostics, and
    author-facing style/theme/template types.
  - Adapter Interface: `pptx()` adapter selection, semantic adapter options, output format
    vocabulary, and opaque writer context/result contracts.
  - Inspection Interface: read-only PptxPackageModel, projected package/drawing/media/theme/layout
    types, warnings, fallback metadata, package requirements, fingerprints, and summaries that tools
    inspect.
- Internal modules are allowed to be deep, but not public. `src/writers/pptx/assembly`,
  `src/writers/pptx/build`, `src/writers/pptx/zip`, `src/writers/pptx/sinks`, XML emitters,
  byte/chunk writers, fflate integration, runtime output modules, and package consistency helpers
  should stay reachable only through Render/Project behavior or `deckjsx/inspect` data types where
  explicitly classified.
- Public-surface tests should guard four different leaks: export-map expansion, export-map target
  drift, root dependency drift, and source-level `pptxgenjs` reintroduction. Type tests should
  separately guard that writer internals, ZIP helpers, fflate settings, Build Artifacts, Assembly
  Plan builders, and XML emitter helpers are not importable as public API.
- Declaration output should be treated as part of the public surface. The generated `.d.ts` files
  for `deckjsx`, `deckjsx/adapter`, and `deckjsx/inspect` must not expose imports from writer chunk
  modules, ZIP modules, sink modules, XML emitter modules, Build Artifact storage, Asset Artifact
  storage, or fflate configuration types. Semantic adapter options such as a named compression mode
  may be public only when they do not reveal the underlying ZIP library configuration.
- README, release notes, skill docs, and examples should describe `pptx()` and default
  `deck.render({ output })` as the direct writer path. Historical `pptxgenjs` mentions should stay
  limited to ADR context, isolated CI oracle tooling, or a future external compatibility package.
- Stage result shape should be reviewed whenever Render or Project gains new inspection fields:
  diagnostics remain the source of truth, `ok` remains derived from diagnostics, artifact presence
  describes graph/projection/rendered-artifact availability, and output metadata describes runtime
  side effects. The public result types should express this as artifact-bearing and missing variants
  rather than adding parallel success booleans or asking callers to use assertions for ordinary
  result reads.
- `defineProjection()` and sandbox-like artifact injection should be treated as public behavior even
  when the caller is advanced tooling. Broken projected package data should fail through structured
  diagnostics with PptxPackageModel paths; unsupported but structurally valid authored meaning should
  warn and preserve structured fallback data.
- `AssetLoader` and authored media source vocabulary may remain public authoring/resource-boundary
  types because authors configure them through `deck.useAssets(loader)`. `AssetArtifact`,
  resolver-cache internals, media byte fingerprints, and render-time byte stores should stay internal
  pipeline artifacts. Inspection may expose projected media metadata and media part topology, not the
  loaded byte payload itself.
- Maintain an export classification note during the release branch review. The note can be brief,
  but it should list each exported name or subpath that changed, its public seam, and why it does not
  expose direct-writer storage, XML emission, ZIP/sink configuration, or Asset Artifact internals.
- Public result-summary additions must include an explicit byte-free rationale. A summary may expose
  package paths, identities, statuses, reasons, fingerprints, dependency summaries, and diagnostic
  codes only when those fields explain an already-public Project/Render result. It should not expose
  the underlying cache object, writer entry object, emitted XML chunk, or loaded media payload.

Performance review:

- PptxPackageModel is the Project-owned projected document model. It should contain computed package
  topology, drawing order, relationships, requirements, order keys, fingerprints, theme/layout/media
  metadata, and diagnostics needed for sandbox/HMR inspection. It should not own media bytes, ZIP
  writer state, XML chunks, sink instances, or a second lower-level XML model.
- PptxPackageModel validation should stay cheap and structural on the hot path. It should reject
  non-finite numbers, malformed identifiers, impossible package relationships, missing required
  fields, and malformed fallback records before XML emission, but it should not perform expensive
  derived inspection, raster comparison, or full OOXML semantic reconstruction during default
  Project/Render.
- Asset bytes belong to Asset Artifacts in the pipeline/render context. Project should finish media
  metadata and topology, and Render should reuse the same artifact boundary for byte loading and
  media-copy decisions.
- Built-in URL probing may read bytes transiently to compute image dimensions, but that is metadata
  probing, not PptxPackageModel byte ownership. If those bytes are retained, they belong only to
  Asset Artifacts. The persisted model remains source/topology/metadata only.
- Media payload validation should be structural and cross-field rather than byte-oriented. It should
  prove that the projected media package part explains its source, source aliases, allocation key,
  asset/entity ids, media type, extension, hash, and package path coherently enough for Render to
  either copy bytes or report an asset-load diagnostic. It should not probe, fetch, decode, hash, or
  store media bytes during package validation.
- XML emission should stay a direct writer concern that consumes PptxPackageModel package parts and
  writes ordered bytes. Adding a separate public XML emission model below PptxPackageModel is a
  performance smell and would make the model a wasteful intermediate layer.
- ZIP assembly should stay ordered and streaming internally. The public Render result remains a
  collected `Uint8Array` artifact plus optional runtime output side effects; streaming ZIP and sink
  selection are implementation strategy, not public output modes.
- Warm render paths should reuse Pptx Package Build Artifacts by package-part fingerprint,
  dependency fingerprints, writer/emitter fingerprints, and media byte fingerprints. A change should
  rebuild only affected package parts where the model and artifact boundary make that possible.
- Default Project/Render hot paths should not eagerly compute every sandbox/debug explanation view.
  Rich inspection views should be detail-gated and derived from Project/Render artifacts when asked
  for.
- Benchmarks should keep measuring cold generation and warm reuse separately across Project,
  `inspection: "none"` Project, asset probe/load cache behavior, cold writer, ZIP assembly, warm
  writer reuse, path-output side effects, and representative template/media/CSS-like fixtures.
- Deterministic output is part of performance, not just correctness: stable IDs, stable entry order,
  deterministic ZIP metadata, omitted volatile docProps timestamps, and fixed-input asset loading
  make warm rebuilds, sandbox comparison, and regression review cheaper.

Performance review failure conditions:

- Introducing a second XML-shaped model, editable XML tree, or general XML DOM below
  PptxPackageModel is a failure. XML emission should remain serialization from package part payloads
  into bytes.
- Making default Project or Render eagerly compute derived sandbox explanation views is a failure.
  Composed paint-order views, effective projected style views, and detailed reuse explanations should
  stay detail-gated or summary-based.
- Putting media bytes into PptxPackageModel is a failure. Project owns media topology and metadata;
  Asset Artifacts and Render own byte loading and media byte fingerprints.
- Reassembling warm renders by re-projecting the deck or rebuilding every package part despite
  unchanged package, dependency, writer/emitter, and media byte fingerprints is a performance
  regression.
- Building the final ZIP from an unordered whole-package byte map as the primary abstraction is a
  regression. The writer should assemble ordered entries from the Assembly Plan and collect bytes
  only as the public artifact sink requires.

Performance review implementation gates:

- Benchmark and test updates should report cold and warm behavior separately. Cold checks protect the
  direct writer replacement quality; warm checks protect package-part fingerprints, dependency
  fingerprints, Asset Artifact reuse, media byte fingerprints, writer/emitter fingerprints, and Build
  Artifact reuse.
- The hot path should be measured by stage, not only by final Render time: Compile/Project,
  `project({ inspection: "none" })`, asset probe/load, XML/support/media part emission, Assembly
  Plan construction, ZIP assembly, collected-artifact sink, path-output side effect, and warm reuse
  should remain separable signals.
- Package consistency validation may deepen, but it should stay linear over projected package parts
  and drawing nodes where practical. Expensive checks such as raster rendering, whole-package semantic
  comparison, and detailed derived inspection should live in validation scripts, CI oracles, or
  opt-in inspection paths rather than the default writer hot path.
- Fingerprints must protect reuse boundaries at the same granularity as rebuild decisions. A package
  part fingerprint change, dependency fingerprint mismatch, writer fingerprint change, part-emitter
  fingerprint change, or media byte fingerprint change should explain which part rebuilt instead of
  collapsing into a whole-deck rebuild reason.
- Media warm-path gates should distinguish metadata reuse from byte reuse. A stable
  `metadata.hash` may allow Render to trust a previous media Build Artifact without calling
  `load()`, but missing or untrusted hashes should fall back to Asset Artifact loading and
  media-byte fingerprint comparison rather than forcing whole-package invalidation.
- Compression policy should remain Assembly Plan/ZIP policy. Changing compression mode can require
  ZIP reassembly, but should not invalidate package-part Build Artifact bytes whose projected
  payload, dependencies, and emitter fingerprints still match.
- Public compression vocabulary should remain semantic and small. The hot path may translate it into
  fflate or other ZIP-library settings internally, but public options should not expose numeric
  compression levels, per-entry writer handles, stream callbacks, or sink topology unless a later
  adapter decision creates a separate seam.
- Path output should not require a second full ZIP generation. If byte artifact collection and file
  output are both requested, the implementation should prefer a shared internal sink/tee topology
  while keeping that topology outside the public API.
- Performance regressions should be investigated first at the deepest owning module: projection
  topology/fingerprint regressions in the PPTX Projection Composite Node; XML/support/media byte
  emission regressions in the PPTX Writer Composite Node; final package ordering/compression
  regressions in Assembly Plan or ZIP modules; runtime path-write regressions in the runtime output
  boundary.
- Benchmark reports should preserve enough phase detail to explain a regression without adding a
  public profiling API: fixture name, iteration count, cold Project time, `inspection: "none"`
  Project time where measured, cold writer time, ZIP assembly time where measured, warm writer time,
  reused/rebuilt/missing/failed Assembly Plan entry counts, asset probe/load counts, and path-output
  timing when exercised.
- A benchmark improvement is not acceptable if it comes from skipping required package consistency
  validation, hiding unsupported semantic records, disabling diagnostics on the default path, or
  moving expensive work into an unmeasured public API call. Performance work should deepen the owning
  module rather than changing the observed contract.

### Post-v0.8 Follow-up Inventory

These items should remain visible while implementing v0.8.0. v0.8.0 should create the model
connection points for them, but it does not have to complete every behavior listed here before the
direct writer can replace `pptxgenjs`.

PPTX theme and master depth:

- Map deckjsx Theme defaults, color vocabulary, typography vocabulary, and document-level defaults
  into richer PPTX Theme Parts where that improves PowerPoint editing and compatibility.
- Deepen Pptx Theme Projection so deckjsx Theme and PPTX theme support stay connected through an
  explicit bridge rather than through ad hoc resolved inline styles only.
- Decide how deckjsx Theme composition relates to PPTX color schemes, font schemes, format schemes,
  and default text/body styles without making authoring Theme identical to PowerPoint theme XML.
- Support multiple PPTX theme parts when multiple slide masters, mounted child Deck themes,
  source-specific branding, imported templates, or compatibility adapters need separate theme
  ownership. v0.8.0 may emit one default theme part, but the model should not make single-theme
  operation a permanent assumption.
- Support multiple slide masters when theme, template, source, or editing semantics require separate
  master ownership.
- Add explicit ownership rules for how Slide Templates, future template-owned common drawing, and
  deckjsx Theme-derived defaults attach to slide layouts, slide masters, and theme parts.

CSS-like rendering fidelity:

- Extend Projected Paint Order toward fuller CSS stacking-context behavior as authoring features
  require it, including opacity-created stacking contexts, transform-created stacking contexts,
  filters, blend modes, isolation, and nested compositing groups.
- Expand z-index and generated-layer handling into a complete cross-output paint-order model once
  more CSS-like rendering semantics exist. v0.8.0 preserves flat sibling z-index inputs through
  projection and direct PPTX drawing order, but later releases should decide exact nested
  stacking-context behavior.
- Implement group compositing strategies for cases where PPTX cannot directly represent CSS-like
  subtree opacity or transforms. Possible future strategies include real PPTX groups, vector
  expansion, and rasterized subtree fallback.
- Implement deferred clipping strategies that v0.8.0 may only model or warn about, especially
  clipping combinations that require subtree rasterization or complex vector masks.
- Expand support for CSS-like background layering and clipping when the direct PPTX representation
  cannot preserve all authored background-origin/background-clip/repeat interactions.

Text measurement and typography:

- Add cross-runtime text measurement or a pluggable measurement boundary for cases where PPTX-native
  auto-fit delegation is not enough.
- Improve fidelity for line breaking, font fallback, baseline variants, vertical text, RTL shaping,
  bullets/numbering, tab stops, paragraph spacing, and PowerPoint text-body defaults.
- Decide how measured text results should participate in Package Part Fingerprints and HMR
  invalidation.

Template authoring and layout evolution:

- Expose authoring APIs for template-owned common drawing once the model path is proven, such as
  template backgrounds, logos, repeated rules, page numbers, or other shared scaffolding.
- Add richer Template Area authoring helpers if explicit Template Area Kind authoring is too verbose.
  The basic `TemplateArea.kind` field and `PptxLayoutAnchor.kind` preservation are v0.8.0 work; the
  post-v0.8 helper question is only about improving ergonomics after that connection exists.
- Add richer placeholder projection behavior only where it improves PowerPoint editing without
  corrupting deckjsx Template Area meaning.
- Decide whether and how template-owned common drawing can be edited by sandbox tools and then
  round-tripped through defineProjection or a later edit API.

Asset and runtime adapters:

- Provide separate optional packages or recipes for Node filesystem asset loading, framework-public
  asset resolution, authenticated URL loading, and app-specific media probing.
- Add stronger media deduplication using content hashes when loaders can provide bytes or hashes
  cheaply.
- Add image conversion or normalization boundaries if PPTX compatibility requires converting formats
  that PowerPoint does not reliably accept.
- If large decks expose memory pressure after the v0.8 internal file-sink tee, consider an internal
  non-collecting sink strategy for specialized runtime paths. This should not change the public
  Render API or expose streaming ZIP/sink selection as ordinary authoring surface.

Sandbox and HMR tooling:

- Add detail-gated Derived Projection Inspection Views for composed visual paint order, effective
  projected styles, build/reuse explanations, and dependency invalidation without making default
  Project or Render paths pay for every explanation.
- Define how sandbox edits to PptxPackageModel snapshots or future edit APIs round-trip back into
  deckjsx concepts, especially for template-owned common drawing and package support parts.
- Add watch-mode/HMR orchestration that reuses Semantic Author Graph identity, Package Part
  Fingerprints, Asset Artifacts, and Pptx Package Build Artifacts to rebuild only changed package
  parts where possible.

Compatibility and ecosystem:

- Publish a separate compatibility adapter package only if users need a `pptxgenjs` bridge after it
  is removed from core.
- Use the isolated `pptxgenjs` regression workflow as migration safety, then decide later whether the
  matrix should remain pinned, expand across versions, or be replaced by direct OOXML fixtures.
- Extend the Projected Document Model pattern to future outputs such as PDF without forcing a shared
  drawing-node base type before those outputs prove their own requirements.

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
- Semantic generation regression tests for package structure, relationships, ids, drawing order, frame
  values, image source rectangles, text runs, hyperlinks, and supported PPTX-domain properties.
- Visual/rendering generation regression tests through rendered artifacts to verify positions, sizes, color,
  image crop, text appearance, and overlap behavior against expected output within documented
  tolerances.
- Add required GitHub Actions generation regression coverage. A pinned pptxgenjs dependency installed
  in an isolated workflow-local package, not the root package dependencies, may be used as one oracle
  because it represents the previous output path. These checks should compare semantic and
  visual/rendering behavior closely enough to catch small writer regressions that would cause large
  output problems.
- Use pptxgenjs-based checks where they make CI scenarios easier to author, while keeping direct
  OOXML fixtures, semantic package assertions, and rendered-raster checks as independent oracles for
  direct writer correctness.
- Do not compare direct writer output to pptxgenjs output by raw byte equality. The direct writer
  should have its own deterministic byte tests, but pptxgenjs oracle checks should compare semantic
  package behavior, geometry, z-order, relationships, media crop, colors, typography, and rendered
  appearance because XML ordering, ids, and support parts may legitimately differ.
- Add deterministic byte tests for the direct writer itself: render the same input with the same
  options, environment, and compression policy multiple times and assert byte equality. Do not expect
  byte equality across different compression modes or between direct writer and pptxgenjs output.
- Keep deterministic byte tests on fixed inputs, such as fixture bytes or data URIs, rather than
  remote asset fetches. Test remote or runtime-specific asset resolution separately so network or
  loader variability does not obscure direct writer byte determinism.
- Use a reproducible headless renderer, such as LibreOffice in CI, for raster generation regression
  checks. Treat PowerPoint-specific rendering differences as manual or separate-environment
  verification supported by uploaded artifacts rather than making CI depend on PowerPoint itself.
- Place the isolated pptxgenjs regression-oracle package under `.github/compat/pptxgenjs/` because
  it is used only by GitHub Actions generation regression workflows and should not become part of
  normal package development dependencies.
- Cover the generation regression matrix across package topology, content types, root/presentation/slide
  relationships, media entries, external hyperlink relationships, deterministic ZIP metadata,
  geometry, transforms, z-order, visibility, absolute/flex/grid layout projection, overflow
  clipping, image fit/position/crop/source rectangles, background images and repeated layers,
  background origin/clip, solid and gradient fills, transparency, borders, outlines, dash/cap/join,
  shadows, opacity cascade, rich text runs, typography, paragraph spacing, indentation, tab stops,
  bullets/numbering, RTL and vertical text, baseline variants, document properties, support parts,
  deterministic ids/fingerprints, and representative raster rendering.
- Use category-specific visual tolerances rather than one global pixel-perfect threshold. Geometry
  fixtures should have strict position tolerances, color/fill fixtures should use channel/pixel
  tolerances, text fixtures should rely more heavily on semantic XML assertions with looser raster
  tolerance, and CI should upload failure artifacts for inspection.
- Render verification through `.github/render/verify-render.tsx`. The current script writes a fixture
  manifest and can compare a previous manifest through `--baseline <manifest>`; this comparison is
  based on fixture/package assertion shape, raster artifact metadata, and ImageMagick different-pixel
  counts when both baseline and current PNGs exist.
- Documentation and public type tests updated for the v0.8 direct PPTX writer: README, deckjsx skill
  docs in English and Japanese, adapter public API type tests, and any release guidance should no
  longer describe `pptxgenjs` as the built-in or temporary core writer.
- Public surface regression tests should keep checking the package export map, root runtime
  dependencies, and core source tree so `pptxgenjs` can remain an isolated CI oracle without
  returning to the published product surface.

## 0.8.x Layout Solver Ownership

### Goal

Harden CSS-like layout correctness while keeping layout as a deckjsx-owned projection concern.
deckjsx should not make `typeflex`, `flexily`, Taffy, Yoga, Crater, or another external layout engine
the main runtime implementation. External engines may be useful as verification oracles, but they
must not define the public authoring vocabulary, the durable projection shape, or the package's
runtime dependency graph.

The active layout direction is:

```text
Semantic Author Graph
  + Resolved Styles
  + Template Area Anchors
  + Asset Metadata
  -> deckjsx-owned Projected Layout
  -> PptxPackageModel / future PdfDocumentModel
```

Do not introduce a solver-oriented Layout IR. A layout solver may create short-lived working
structures while computing a slide, but those structures are implementation details and should be
discarded after producing deckjsx-owned projected layout nodes. HMR and sandbox invalidation should
continue to key off graph node identity, style entity identity, template area identity, asset
metadata, and projected layout fingerprints rather than off an external solver tree.

### Ownership Rules

- Keep the runtime layout solver self-owned in TypeScript. The deckjsx solver is responsible for the
  supported CSS-like subset: absolute/local containing blocks, flex, grid, stack-like flow,
  percentages, gaps, padding, min/max constraints, paint order, and projected fallback metadata.
- Keep cascade, theme defaults, stylesheet class resolution, template placement, z-index-like paint
  order, diagnostics, asset probing, and output-specific projection outside any external solver
  vocabulary.
- Do not add `typeflex`, `flexily`, Taffy, Yoga, Crater, or similar engines as root runtime
  dependencies for core layout.
- Do not expose a public `layoutEngine`, `solver`, `taffy`, `yoga`, `typeflex`, `flexily`, or
  solver-specific option.
- Do not shape `ProjectedLayout*`, `PptxPackageModel`, or a future `PdfDocumentModel` around an
  external engine's node ids, style enums, rounding behavior, or unsupported-feature vocabulary.
- If an experiment adapter is created, keep it in test/dev tooling or a clearly isolated internal
  comparison harness. It should consume existing graph/resolved-style/template/asset context,
  produce comparable frame snapshots, and then disappear from the production projection path.

### Verification Strategy

CSS-like layout bugs are expected unless the supported subset is tested as a product contract. The
main solver should be deckjsx-owned, but verification can use multiple independent signals:

- Add focused fixtures for each supported layout behavior: local containing blocks, percentage
  frames, inset frames, flex direction/wrap/grow/shrink/order, grid tracks/spans, gap/padding,
  absolute children inside flow containers, z-index-like paint order, and template area placement.
- Compare projected frames semantically, not by serialized object equality. Use stable tolerances for
  unit conversion and rounding so PPTX and future PDF projection can share expectations without
  hiding meaningful geometry drift.
- Use Taffy or another independent engine only as an optional oracle for cases it can express
  cleanly. Oracle checks should live in CI/test tooling, not in runtime code, and should document
  when deckjsx intentionally differs because of PPTX/PDF semantics, template anchors, source-local
  cascade, or unsupported fallback behavior.
- When an oracle requires WASM, keep that dependency workflow-local or dev-only. It should not affect
  multi-runtime guarantees for the published package.
- Keep direct deckjsx fixtures as the source of truth. If Taffy, typeflex, flexily, or another oracle
  disagrees, the test should force a review of the supported-subset expectation rather than
  automatically treating the oracle as correct.
- Preserve diagnostics for supported-but-degraded CSS-like behavior. If Project can still produce a
  structurally valid PPTX/PDF projection, unsupported fidelity should be reported as warning metadata
  rather than a render blocker.

### Non-Goals

- Do not replace the deckjsx layout solver with Taffy, Yoga, typeflex, flexily, Crater, browser DOM
  layout, or any other external engine.
- Do not add a solver-specific persistent IR between Semantic Author Graph and projected layout.
- Do not make external-engine compatibility a public product goal. The product goal is correct
  deckjsx projection for its documented CSS-like subset.
- Do not treat the external oracle as a reason to loosen deckjsx tests. The oracle is a second pair
  of eyes; the self-owned solver still needs explicit regression coverage.

## 0.8.1 Writer Architecture Cleanup

### Goal

Make the direct PPTX writer easier to reason about, test, and evolve after the v0.8.0 migration.
The goal is not to add a new output model or revive Presentation IR as a required stage. The active
architecture remains:

```text
Semantic Author Graph
  -> shared projected snapshots
  -> Pptx Package Model
  -> Output Writer
```

Future output formats such as PDF should get their own Projected Document Model, such as a
`PdfDocumentModel`, rather than forcing PPTX and PDF through a single Presentation IR. Shared
projection work should live in reusable projected snapshots, such as resolved layout, paint order,
asset metadata, and unsupported-semantic fallback metadata, when those snapshots have a clear
cross-output meaning.

v0.8.1 should focus on turning the current writer implementation into deeper internal Modules with
small Interfaces. It should keep public Authoring Interface, Adapter Interface, and Inspection
Interface behavior stable.

v0.8.1 should also clean up the HTML/CSS-like authoring surface by removing direct style props from
public JSX intrinsic elements. Structural and semantic props such as `className`, `style`,
`children`, `area`, `src`, `data`, and `shape` remain direct props, but style and layout values
should be authored through `style`, `StyleSheet` classes, `Theme` defaults, or Template Areas.

Compression is explicitly deferred from the v0.8.1 cleanup. The core writer should prefer a
store-only ZIP path over retaining a runtime compression dependency for a small slice of functionality.
Future compression can be reintroduced behind an internal compression adapter or optional package once
size/performance trade-offs are measured against real decks.

### Architecture Review Findings

- The direct writer now follows the right direction for ZIP compatibility: deckjsx owns ZIP package
  structure instead of letting a generic ZIP streaming class decide Office-facing metadata. The
  remaining runtime `fflate` usage is small enough that v0.8.1 should remove it from the core writer
  rather than preserve compression as an implementation dependency.
- `fflate.Zip` should not be used for final PPTX output because its streaming ZIP path emits data
  descriptors that can be valid ZIP but unreliable for LibreOffice PPTX media import.
- The current `renderPptxPackage()` function is too large as an internal composite node. It owns
  package validation, package-part ordering, Build Artifact reuse, media byte resolution, XML/media
  part materialization, Assembly Plan construction, ZIP emission, sink topology, output side-effect
  handling, and Render Result shaping.
- This is not primarily a problem with `PptxPackageModel`. The model can stay the PPTX Projected
  Document Model. The main problem is that the Output Writer Composite Node has not yet been split
  into meaningful internal nodes.
- Avoid introducing a generic Presentation IR between Semantic Author Graph and Pptx Package Model
  just to reduce writer complexity. That would likely become a shallow pass-through or force
  PPTX-specific package topology, relationships, theme/layout parts, media reuse, and z-order back
  into writer-side reinterpretation.

### Required Cleanup

- Treat `src/writers/pptx/` as the public-internal PPTX Writer Composite Node. Its external
  identity remains the writer adapter implementation that consumes `PptxPackageModel` and returns a
  Render Result artifact. Its internal files should own separate semantic graphs rather than making
  `renderPptxPackage()` the only control point.
- Split package validation and render blocking from package-part materialization. Validation should
  produce a package validation snapshot or diagnostics before any writer effect starts.
- Split package-part materialization from Assembly Plan construction. A materialization pass should
  turn each package part into a materialized result: rebuilt bytes, reused Build Artifact, missing
  required bytes, failed emitter, or media-byte failure. Assembly Plan construction should then map
  those results plus projected order, path, requirement, and ZIP entry policy into final entries.
- Keep package-part Build Artifact reuse independent from future ZIP compression policy. v0.8.1 can
  store entries without compression; a later compression change may force ZIP reassembly but should
  not invalidate reusable XML/support/media part bytes by itself.
- Keep media byte handling at the Asset Loading Boundary and writer media materialization seam.
  `PptxPackageModel` should continue to carry media identity, metadata, relationships, paths, and
  dependency fingerprints, not raw media bytes.
- Keep Render Result shaping separate from ZIP emission. ZIP source failures, collecting sink
  failures, and runtime output side-effect failures should remain distinguishable.
- Remove public direct style props from JSX intrinsic element types in v0.8.1. Examples that should
  become invalid include `<div x={1}>`, `<p color="red">`, and
  `<section display="grid" columnGap={0.3}>`. Keep the same values valid through
  `style={{ ... }}` and `StyleSheet` class definitions.
- Update normalization so runtime JavaScript inputs no longer treat style-capable direct props as
  authored style. Runtime validation should diagnose or ignore them consistently according to the
  public authoring contract, while TypeScript users should get type errors.
- Update README, skill docs, type tests, and fixtures so normal authoring uses `Theme`,
  `StyleSheet`/`className`, `style`, and Template Areas rather than direct style props.

### ZIP Module Cleanup

- Make the PPTX ZIP writer a deep internal Module instead of a tactical compatibility patch.
- Keep ZIP structure policy in deckjsx-owned code: local headers, central directory entries,
  end-of-central-directory records, fixed metadata, CRC values, ZIP32 limits, offsets, and file name
  encoding.
- Remove runtime `fflate` usage from the core writer in v0.8.1 if ZIP entries are store-only. Use
  the platform `TextEncoder` for ZIP path encoding and keep CRC32 in deckjsx-owned code.
- Defer DEFLATE compression. Do not implement a custom DEFLATE encoder in v0.8.1, and do not keep
  `fflate` solely to preserve compressed XML entries before compression has proven product value.
- Future compression, if needed, should live behind an internal adapter or optional package. It must
  not expose numeric compression levels, stream classes, or library-specific configuration through
  public options or inspection DTOs.
- Keep streaming ZIP as an internal implementation strategy. The ZIP module should consume ordered
  Assembly Plan entries and write chunks to sinks, while the public Render API still returns artifact
  bytes and optional output metadata.
- Make ZIP tests assert Office-compatible structure, including absence of data descriptors for final
  PPTX entries, fixed deterministic metadata, correct CRC/size fields in local headers and central
  directory entries, and stable store-only behavior for XML and media entries.

### Writer Module Shape

The v0.8.1 refactor should prefer meaningful internal Modules over ceremony. A likely shape is:

```text
src/writers/pptx/
  index or adapter entry
  render-orchestrator
  validation-gate
  materialize/
    package-part-materializer
    media-materializer
    xml-part-materializer
    build-artifact-reuse
  assembly/
    assembly-plan
    assembly-diagnostics
    assembly-summary
  zip/
    zip32-emitter
    crc32
    sinks
  xml/
    part-emission-dispatch
    slide/support/package/text/picture/shape emitters
```

This folder sketch is not a required file list. It is a responsibility map. Do not create wrapper
files that only forward calls. A file should exist only when it owns a real snapshot, command,
effect boundary, validation rule, serialization policy, or failure boundary.

### Layered DAG Constraints

- Keep the external graph acyclic:

```text
Semantic Author Graph
  -> PPTX Projection Composite Node
  -> Pptx Package Model
  -> PPTX Writer Composite Node
  -> Rendered Artifact
```

- Internal cycles are allowed only if contained inside the PPTX Writer Composite Node and hidden
  behind snapshots, commands, or effects.
- For one concern, keep one final control owner:
  - package-part requirement and order policy belong to projection/package metadata;
  - materialization status belongs to the writer materialization node;
  - ZIP entry storage policy belongs to Assembly Plan/ZIP policy;
  - future compression policy belongs to an internal compression adapter, not to projection or
    package-part byte generation;
  - output side-effect policy belongs to the runtime output/sink boundary;
  - public success remains derived from diagnostics and artifact availability.
- Do not let writer internals import projection helper modules in ways that make projection policy
  run during Render. Writers serialize projected fields; they should not reinterpret graph, layout,
  CSS-like paint, template, or media topology.
- Do not expose ZIP sinks, XML emitters, Build Artifact storage, Assembly Plan builders, compression
  adapters, or `fflate` settings through `deckjsx`, `deckjsx/adapter`, or `deckjsx/inspect`.

### Validation

- Keep the v0.8.0 public-surface guards passing. Generated declarations must not expose writer
  internals, ZIP helpers, sink topology, XML emitters, Build Artifacts, Asset Artifacts, or low-level
  `fflate` vocabulary.
- Add focused unit tests for the deepened internal writer Modules:
  - package validation gate returns Render diagnostics before any ZIP/sink write;
  - part materialization reports rebuilt, reused, missing, and failed entries without constructing
    final ZIP bytes;
  - Assembly Plan construction is deterministic and uses projected Package Part Order Keys;
  - ZIP32 emitter writes Office-compatible local headers and central directory records without a
    runtime ZIP/compression dependency;
  - sink topology preserves artifact bytes when a path side-effect sink fails after ZIP source
    success.
- Keep GitHub Actions render verification as a required regression gate. LibreOffice conversion
  failures should fail at the conversion step with a clear diagnostic rather than surfacing later as
  rasterization errors.
- Keep benchmark categories separate enough to explain performance: cold Project, asset probe/load,
  cold materialization, warm Build Artifact reuse, ZIP assembly, collecting sink, and runtime path
  side effect.

### Non-Goals

- Do not add a public streaming ZIP mode.
- Do not add a public `zipWriter`, `sink`, `compressionLevel`, or `fflate` option.
- Do not keep direct style props as an alternate public spelling for CSS-like values after v0.8.1.
- Do not preserve `fast`, `balanced`, or `small` as no-op compression behavior. Either remove or
  narrow public compression vocabulary during v0.8.1 while the package is still pre-1.0, or keep only
  a truthful store-only option if compatibility requires an option shape.
- Do not implement DEFLATE compression in deckjsx core during v0.8.1.
- Do not implement ZIP64 in deckjsx core during v0.8.1.
- Do not make a generic Presentation IR the required route to `PptxPackageModel` or future
  `PdfDocumentModel`.
- Do not move media bytes into `PptxPackageModel`.
- Do not introduce an XML-shaped model below `PptxPackageModel`.
- Do not expose public `LayoutInputSnapshot` or `ProjectedLayoutSnapshot` inspection APIs in v0.8.1.
- Do not add public HMR APIs in v0.8.1; only preserve internal invalidation boundaries that make
  later HMR work cleaner.
- Do not add Direct Style Prop migration aliases, compatibility flags, or no-op compatibility paths.
- Do not preserve AuthorNode compatibility APIs, runtime markers, or conversion helpers.
- Do not add a PDF projection in v0.8.1.
- Do not chase full CSS layout parity in v0.8.1; preserve unsupported semantics through diagnostics
  and layout/project inspection rollups where practical.
- Do not refactor by folder shape alone. Split only when the new Module has a meaningful Interface
  and improves locality or leverage.

### Resolved v0.8.1 cleanup decisions

- Remove the public `compression` render option, the `PptxCompressionMode` public type, and
  compression/storage fields from public Render Assembly summaries. v0.8.1 should not report an
  always-`store` field just to preserve a shape that no longer carries useful information.
- Treat the direct PPTX writer's ZIP output as store-only in v0.8.1. Remove the runtime `fflate`
  dependency, use deckjsx-owned ZIP32 local headers, central directory records, EOCD records, CRC32,
  deterministic metadata, fixed sizes, and platform `TextEncoder` path encoding. ZIP64 and DEFLATE
  compression are non-goals.
- Accept larger PPTX artifacts in v0.8.1 as the cost of deterministic store-only ZIP output,
  simpler failure boundaries, and a smaller dependency graph. Record benchmark and artifact-size
  observations, but do not make size growth alone a release blocker.
- Remove public Direct Style Props from JSX intrinsic element types and Slide Declaration options.
  Slide Declaration options should be limited to `name`, `template`, `className`, and `style`; slide
  appearance belongs in `style`, StyleSheet classes, Theme Defaults, or Template Areas.
- Fix the `span` intrinsic typing while tightening Direct Style Props. `span` should use
  `IntrinsicSpanProps`, support only `className` and `style`, reject `area` and Direct Style Props,
  and leave span placement validation to graph construction.
- Runtime JavaScript inputs that use props outside the current authoring contract should produce
  Compile diagnostics rather than JSX-runtime throws when the value can still be preserved in the
  Author Tree. Use `E_COMPILE_UNSUPPORTED_AUTHORING_PROP` for unsupported props and describe them as
  unsupported in the current authoring interface, not as migration-only removed props.
- Emit unsupported authoring prop diagnostics per prop, not as one node-level aggregate. A node with
  `x`, `y`, and `foo` should produce three `E_COMPILE_UNSUPPORTED_AUTHORING_PROP` diagnostics with
  paths pointing at `.props.x`, `.props.y`, and `.props.foo`.
- Apply the same per-key diagnostic rule to Slide Declaration options. Unsupported options such as
  `background` or `x` should each produce `E_COMPILE_UNSUPPORTED_AUTHORING_PROP` with paths pointing
  at the slide declaration option, such as `.options.background`; wording may say unsupported slide
  declaration option while using the same diagnostic code.
- Validate supported Slide Declaration option values separately from unsupported options. `name`
  accepts missing/default handling and strings, with explicit non-string values reported through a
  slide-name option diagnostic such as `E_COMPILE_INVALID_SLIDE_NAME_OPTION`; `template` accepts
  missing/undefined and valid template references, with invalid values reported through existing
  template diagnostics or `E_COMPILE_INVALID_SLIDE_TEMPLATE_OPTION`; `style` uses the same style-prop
  validation as JSX nodes; and `className` uses the same className validation as JSX nodes.
- Supported prop names should continue to use prop-specific validation. Use
  `E_COMPILE_INVALID_STYLE_PROP` for non-object `style` values, including `null`, while treating an
  absent `style` prop or explicit `style={undefined}` as no authored inline style; use
  `E_COMPILE_INVALID_SHAPE_PROP` for unsupported `shape` values; and use
  `E_COMPILE_INVALID_IMAGE_SOURCE_PROP` for explicit non-string `img` `src` or `data` values.
- Treat explicit `img` `src` and `data` together as ambiguous image source input. Use a dedicated
  diagnostic such as `E_COMPILE_AMBIGUOUS_IMAGE_SOURCE_PROP`, treat `src={undefined}` and
  `data={undefined}` as absent, and avoid choosing a priority that would make Asset Identity or Media
  Allocation Key depend on an implicit conflict rule.
- Treat `shape` as a supported structural prop. Missing `shape` or explicit `shape={undefined}`
  should use the existing default shape, while unsupported strings or non-string values should
  produce `E_COMPILE_INVALID_SHAPE_PROP`.
- Treat `area` as a supported structural prop. Missing `area` or explicit `area={undefined}` means no
  Template Area Reference. Strings, `null`, plain objects, numbers, wrong-deck references, or other
  invalid values should use the existing Template Area Reference diagnostics such as
  `E_TEMPLATE_AREA_REF_INVALID` rather than unsupported-prop diagnostics.
- Treat `children` as Author Tree child shape rather than as a style/structural prop. Prop validation
  should not emit unsupported-prop diagnostics for `children`; child placement, primitive text, empty
  values, arrays, fragments, or unsupported child objects belong to JSX normalization and graph
  construction diagnostics.
- Treat `className` as a supported prop with its existing clsx-like normalization and validation,
  not as an unsupported prop. `undefined`, `null`, `false`, and empty strings are empty class input;
  strings, arrays, and boolean object maps are supported; invalid className value shapes should use
  className-specific validation rather than `E_COMPILE_UNSUPPORTED_AUTHORING_PROP`.
- Keep `StyleEntity.authored` shape stable. Stop merging Direct Style Props into
  `StyleEntity.authored.style`; only the `style` prop should populate authored style, while
  `className` continues to populate Style Class References.
- Keep partial Semantic Author Graph construction where possible after authoring diagnostics, but do
  not feed invalid style, shape, image source, or unsupported direct props into downstream style,
  asset, or projection state.
- When an authoring node has unsupported props, keep the node and its children in the partial graph
  when the supported portion is still meaningful. Drop only the unsupported prop values from graph,
  style, layout, and asset state, while preserving supported props such as `style` and `className`.
- Treat the current AuthorNode-based layout bridge as a v0.8.0 migration artifact. v0.8.1 should
  move toward `Semantic Author Graph + Resolved Style Snapshot + Template Area relationships + deck
size -> Projected Layout Snapshot` without replaying authoring-shaped props through internal
  AuthorNodes.
- Remove the legacy AuthorNode representation instead of merely avoiding it in the main
  Project/Render path. Keeping AuthorNode helpers or guards in the codebase creates another internal
  authoring-shaped entry point that future cleanup would have to delete again.
- Narrow JSX runtime marker state to Author Tree only. Remove `"deckjsx.author-node"` from
  `DeckJsxElement.$$typeof`, remove AuthorNode guards such as `isAuthorNode`, `isSlideNode`, and
  `isContentNode`, remove conversion helpers such as `toAuthorNode` and `toAuthorJsxNode`, and treat
  invalid slide roots as Author Tree or component-return validation diagnostics instead of
  AuthorNode-specific cases.
- Keep composition resolution focused on normalizing slide factory results into Author
  Tree-compatible slide children. `resolveComposition` should not contain AuthorNode checks; it may
  accept fragments, arrays, primitive text leaves, and empty values according to the Author Tree
  contract, while unsupported plain objects, Promises, or other non-JSX objects become Compile
  diagnostics. Semantic placement and implicit text conversion should remain graph-builder
  responsibilities.
- Keep Projected Layout Snapshot as a shared internal node under `layout/`, not a PPTX-specific
  helper hidden inside `projection/pptx`. PPTX projection consumes the layout snapshot; it should not
  make PDF or future formats depend on PPTX internals.
- Introduce an internal Layout Input Snapshot between graph/style/asset/template state and Projected
  Layout Snapshot. This input snapshot should carry only semantic node kind, graph/source
  provenance, layout-relevant resolved style values, structural layout data such as area/shape/image
  references, template area frame/kind, asset probe dimensions, and ordered child/text-run inputs.
  It should not carry Author Tree props, AuthorNode values, public NodeProps, unresolved
  `className`, or live `ResolvedStyleMap` references.
- Split layout modules by ownership rather than by historical helper names. Candidate shape:
  `layout/input.ts` owns Layout Input Snapshot types and construction inputs; `layout/projected.ts`
  owns Projected Layout Snapshot types and solver results; `layout/values.ts` or
  `layout/visual-values.ts` owns shared value objects such as `FrameIR`, `FillIR`, `TextStyleIR`,
  and `ImageSourceIR` while keeping their existing names for v0.8.1. `projection/pptx/model.ts` may
  reference shared value types, but should continue to own PPTX identities, relationships, package
  parts, and drawing payloads rather than embedding `ProjectedLayoutNode` as its primary payload.
- Put Layout Input Snapshot construction in the layout module, such as `layout/input.ts` or
  `layout/build-input.ts`, behind a single entry point like `buildLayoutInputSnapshot({ graph,
resolvedStyles, templates, assetProbeArtifacts, deckSize, diagnostics })`. This builder should map
  graph nodes to layout input nodes, copy only needed resolved style values, resolve Template Area
  frames and kinds, attach image probe dimensions, block invalid authoring data from flowing into
  layout, and return layout-stage diagnostics. PPTX project orchestration should call this boundary
  rather than constructing layout inputs itself.
- Preserve explicit bypass semantics for predefined artifacts. The normal `Deck.project()` path runs
  composition/compile -> graph -> resolved styles -> asset probe -> Layout Input Snapshot ->
  Projected Layout Snapshot -> Pptx Package Model. A `defineGraph()` artifact starts from the
  predefined graph and recomputes resolved styles, asset probe, layout input, projected layout, and
  package projection downstream. A `defineProjection()` artifact starts from the predefined Pptx
  Package Model, bypasses graph/style/asset/layout construction, runs package/render validation, and
  may omit layout rollup summary fields.
- Keep Project Result layout summary minimal while Projected Layout Snapshot remains internal. A
  summary may include slide count, projected node count, filtered node count, generated layer count,
  and unsupported-semantics count. Do not expose the full Projected Layout Snapshot, per-node frames,
  rich text run payloads, asset dimensions, layout version fields, or Projected Layout Identity lists
  through ordinary Project Result fields in v0.8.1.
- Move cross-output visual layer generation upstream into Projected Layout Snapshot. PPTX projection
  should map layout nodes and generated visual layers into Pptx Drawing Nodes, placeholder/layout
  parts, relationships, and package identities; it should not re-run style normalization, layout
  resolution, paint-layer generation, visibility filtering, rich-text run construction, or media
  topology discovery from graph/authoring props.
- Use the layered-DAG cleanup to strengthen types rather than merely move files. Authoring props,
  Author Tree props, resolved style values, layout input snapshots, Projected Layout results, Pptx
  Package Model payloads, writer materialization results, and final Render artifacts should be
  distinct typed boundaries when their lifecycle, invalidation trigger, failure boundary, or reuse
  value differs.
- Preserve separate invalidation key spaces for future HMR even though v0.8.1 does not implement HMR
  itself. Author Tree changes are keyed by source/factory execution and JSX structural identity;
  Semantic Author Graph changes by Graph Identity and semantic payload; Resolved Style changes by
  Style Entity, Theme, StyleSheet, defaults, and inline style inputs; Layout Input Snapshot changes by
  graph node, layout-relevant resolved style, Template Area, asset probe dimensions, and deck size;
  Projected Layout Snapshot changes by layout input identity and solver result payload; Pptx Package
  Model changes by Package Part Identity, layout snapshot identities, media allocation keys, and PPTX
  projection payload; writer materialization changes by package-part fingerprint and XML/media/support
  materialization inputs.
- Stop making layout normalization depend on public `SlideProps`, `ViewProps`, `TextProps`,
  `ImageProps`, or `ShapeProps`. Normalization should consume internal resolved style/layout inputs
  plus explicit structural data such as image source or shape kind.
- Retire or rename the ambiguous `compiler/normalization` ownership. Split normalization by
  meaningful node responsibility, such as style value normalization and layout input normalization,
  rather than keeping a broad compiler utility that accepts both authoring props and resolved style
  snapshots.
- Split diagnostics by the same stage boundaries. Authoring prop validation produces Compile
  diagnostics; style value validation and style resolution produce Compile/style-resolution
  diagnostics; layout capability or CSS-like layout semantics produce Project diagnostics attached to
  Layout Input Snapshot or Projected Layout Snapshot context; PPTX expressibility produces Project
  diagnostics attached to Pptx Package Model paths. PPTX projection should not validate authoring
  props, and layout should not validate public NodeProps.
- Keep one PPTX render orchestrator as the control owner for stage ordering and Render Result
  shaping, while splitting validation, package-part materialization, Build Artifact reuse,
  Assembly Plan construction, ZIP emission, sinks, and output side effects into smaller internal
  nodes.
- Run the validation gate before materialization, media loading, ZIP emission, or sink/output side
  effects. Validation errors should return diagnostics, an empty assembly summary, no artifact, and
  no writer effects.
- Keep Build Artifact reuse decisions inside materialization. Assembly should consume
  materialization results and produce deterministic entries and summaries; ZIP should serialize final
  entries only.
- Allow tests to source-deep-import internal writer modules to verify responsibility boundaries, but
  keep those modules out of the published package export map and generated public declarations.
- Required v0.8.1 gates include `vp check`, `vp test`, public-surface guards for export map,
  generated declarations, dependencies, and `fflate` absence, focused ZIP32 structure tests, focused
  authoring prop diagnostics tests, sample smoke, and the render verification gate. Benchmarks should
  be recorded, with only obvious regressions treated as blockers.
- Strengthen public-surface guards for the cleanup. Generated declarations and public barrels should
  not expose `AuthorNode`, `PptxCompressionMode`, the public `compression` render option,
  `ProjectedLayoutDocument`, `LayoutInputSnapshot`, ZIP helpers, sink topology, XML emitters, writer
  materialization helpers, or Build Artifact storage helpers. Dependency/source guards should verify
  that `fflate` is absent and that `deckjsx.author-node` no longer appears in `src/**`. Historical
  mentions in `docs/**` and roadmap context may remain.
- Add focused v0.8.1 tests by boundary: authoring unsupported-prop tests for Direct Style Props,
  unknown props, per-prop diagnostics, partial graph behavior, Slide Declaration options, `style`,
  `className`, `area`, `shape`, `img` source props, and `children`; layout input snapshot tests that
  prove graph/style/template/assets can become layout input without AuthorNode, public props,
  unresolved class names, or live ResolvedStyleMap references; projected layout snapshot tests for
  display-none filtering, visibility-hidden retention, generated visual layers, and rich text runs;
  PPTX projection-from-layout-snapshot tests that prove projection consumes layout snapshots instead
  of returning to AuthorNode or broad normalization helpers; public-surface guards for `fflate`,
  compression, AuthorNode, and layout snapshots; and writer/ZIP tests for store-only ZIP32, CRC32,
  validation gates, and sink failure behavior.
- Recommended implementation order: remove public compression and Direct Style Prop type surface;
  add authoring prop diagnostics; build the Layout Input Snapshot footing; remove AuthorNode types,
  guards, and the graph-to-AuthorNode layout bridge; reconnect the existing layout solver as Layout
  Input Snapshot -> Projected Layout Snapshot; move visual layer generation, rich text construction,
  visibility filtering, and layout-derived paint data into Projected Layout Snapshot; make PPTX
  projection consume Projected Layout Snapshot instead of re-running style/layout normalization;
  retire or split `compiler/normalization`; move ZIP to store-only without `fflate`; split PPTX writer
  responsibilities; then update docs, release review, and version metadata.

## 0.8.2 DoS Report Feedback Triage

### Goal

Use the 26-slide DoS report production feedback from v0.8.0 as the next patch-line compatibility
pass. The main theme is not full browser parity; it is making the CSS-like subset behave like CSS
where deckjsx exposes CSS names. v0.8.2 should prioritize defaults, auto sizing, normal-flow block
layout, degenerate frame prevention, diagnostics, numeric/unit parsing, and image positioning
ergonomics. Requiring explicit sizes to avoid empty output is not an acceptable fix for a CSS-like
default. First-class video support is intentionally moved to v0.8.3 so v0.8.2 can finish the
non-video compatibility work.

The detailed HTML/CSS compatibility audit for this scope is recorded in
`docs/reviews/v0.8.2-html-css-compatibility-audit.md`.

### Current Code Findings

- View-like elements still default to `display: "block"` plus `layout: "absolute"` through
  `ELEMENT_DEFAULTS.container` and `normalizeViewProps()`, but the current v0.8.2 slice now treats
  unpositioned block children as normal-flow entries through `compileBlockFlowChildren()`. Explicit
  frame props remain the slide-oriented opt-in for local absolute placement.
- Implemented in the current v0.8.2 preparation slice: `display: "flex"` maps to stack layout while
  defaulting to row direction and cross-axis stretch. A column flex child without an authored
  `width` now stretches to the available content width unless explicit cross-size or self-alignment
  says otherwise. Grid item self-alignment already defaults to stretch through
  `resolveGridSelfAlignment()`.
- Implemented in the current v0.8.2 preparation slice: `display: "flex"` now defaults to row
  direction when neither `direction` nor `flexDirection` is authored, and its cross-axis alignment
  defaults to stretch. The older `layout: "stack"` default remains vertical so deck-specific stack
  authoring is not silently reinterpreted as CSS flexbox.
- Text measurement is not an auto-layout input yet. Stack and grid placement use declared
  width/height, flex basis, aspect-ratio derivation, tracks, and gaps. They do not measure wrapped
  text and then push following siblings by the realized text height.
- Numeric `lineHeight` has already moved in the right direction: `resolveLineHeight()` treats a
  number as `lineSpacingMultiple`, and tests cover percentage line-spacing XML. v0.8.2 should keep
  this as a regression guard and update any stale docs/skills that imply numeric line height is
  points.
- The README `AssetLoader.load()` example now matches `AssetLoadResult` by returning top-level
  `bytes`. The deckjsx skill docs still need the same audit because stale skill examples are a
  product bug for agent-authored decks.
- Implemented in the current v0.8.2 preparation slice: Direct render now avoids opening path output
  before the writer produces artifact bytes, and Node path output writes through a temporary file
  before replacing the requested path. The regression test covers an existing non-empty output file
  plus a render failure with no artifact, proving the file remains untouched.
- Implemented in the current v0.8.2 preparation slice: rounded-rectangle emission still clamps PPTX
  `roundRect` adjustment to `50000`, and `borderRadius` / shape `radius` now resolve percentage
  values against the projected short side. This makes CSS-like `borderRadius: "50%"` produce the
  expected capsule-style geometry instead of falling through a zero base.
- Frame defaults are still zero-sized for explicit/local absolute boxes unless placement, explicit
  `width`/`height`, both-side insets, or a layout algorithm supplies a size. Implemented in the
  current v0.8.2 preparation slice: block-flow text receives available inline size and a
  line-height-based block size, and images can derive a missing axis from probed natural aspect
  ratio. Exact wrapped text measurement and full intrinsic sizing remain future work.
- `boxSizing` defaults to `border-box` for containers, text, and shapes. That is useful for slide
  geometry, but it differs from the CSS initial `content-box` value and should be called out as a
  deliberate deckjsx default.
- `position` is not full CSS positioned layout. Implemented in the current v0.8.2 preparation slice:
  element defaults now use CSS-like `position: "static"`, and `position: "absolute"` removes an entry
  from normal stack flow. Implemented in the current slice: `position: "relative"` now keeps the node
  in block/flex/grid flow and applies `top` / `right` / `bottom` / `left` / `inset` / `x` / `y` as a
  visual offset without changing the sibling flow position.
- Grid defaults are deck-oriented. Missing templates resolve to tracks that fill the available grid
  content frame, and implicit `gridAutoRows` / `gridAutoColumns` fall back to `1fr`-like behavior
  rather than CSS `auto` tracks. Grid item stretch is implemented, but the track defaults should be
  documented as deckjsx semantics.
- Image and background defaults are presentation-oriented, not CSS initial values. `img` defaults to
  `fit: "contain"` / centered object position; element background images default to no-repeat and
  stretch when no `backgroundSize` is provided; slide backgrounds default to cover/no-repeat. CSS
  authors may expect intrinsic image sizing, `background-repeat: repeat`, and
  `background-size: auto`.
- Shape defaults are visible by default: `shape` uses white fill with zero stroke unless styled.
  That is reasonable for a PowerPoint shape primitive, but differs from a transparent CSS box and
  can surprise users using `shape` as a layout/debug primitive.
- Numeric length defaults are intentionally split by domain: `DeckLength` numbers are inches, while
  point-like text values remain points. Existing docs mention this, but v0.8.2 docs should place it
  near the other non-CSS gotchas because most CSS lengths are unitless only for special properties.
- Implemented in the current v0.8.2 preparation slice: CSS-wide keywords (`initial`, `inherit`,
  `unset`, `revert`, and `revert-layer`) are accepted by length-capable public style types and do
  not become explicit zero sizes. The projection fallback uses the supported-subset initial/default
  behavior and records `layout` unsupported semantics with `missing: ["cssWideKeywordCascade"]` for
  layout and text length-like properties. Full CSS inheritance/reset semantics remain follow-up work.
- Implemented in the current v0.8.2 preparation slice: resolved styles now inherit text-related
  properties from parent text nodes into inline `span` / text-run nodes. The inherited values are
  visible in resolved-style inspection while layout projection avoids duplicating inherited-only run
  style when the parent text box already carries the concrete PPTX text body style.
- Implemented in the current v0.8.2 preparation slice: shared CSS length parsing now supports common
  absolute units `cm`, `mm`, `Q`, and `pc`, plus viewport `vmin` and `vmax`, across layout lengths,
  point-like text values, stroke widths/dash arrays, and shadow lengths. CSS math functions and the
  remaining font-relative units such as `lh`, `rlh`, `ex`, `cap`, and `ic` are still out of scope for
  this slice.
- `zIndex` is a simple projected paint-order number with effective default `0`; it is not CSS
  `z-index: auto` and does not model browser stacking contexts except for the explicit fallback
  warnings already recorded for opacity/transform/compositing cases.
- Implemented in the current v0.8.2 preparation slice: `letterSpacing` accepts CSS-like point
  lengths such as `pt`, `px`, `em`, `rem`, `vh`, `vw`, and `ch`, plus `normal`. Numeric values remain
  point values for backward compatibility, and the resolved value is emitted as PPTX character
  spacing.
- Implemented in the current v0.8.2 preparation slice: `paragraphSpacingBefore` and
  `paragraphSpacingAfter` now accept the same point-like length vocabulary as other text spacing
  controls. Numeric values remain points for backward compatibility; CSS-like `pt`, `px`, `in`,
  `em`, `rem`, `vh`, `vw`, and `ch` values are resolved before PPTX text XML emission.
- Numeric public style audit: the remaining number-only fields are intentionally numeric domains
  rather than missed CSS lengths. `fontWeight`, `zIndex`, `order`, `flexGrow`, `flexShrink`, grid
  line/span placement, `listStart`, `rotation`, opacity/transparency fields, `lineSpacing`, and
  `lineSpacingMultiple` should stay numeric in v0.8.2. CSS-like length-capable fields now include
  layout lengths, border/outline/stroke widths, font size, line height, text indent, tab stops,
  letter spacing, and paragraph spacing before/after.
- Implemented in the current v0.8.2 preparation slice: invalid authored `objectPosition` values on
  foreground images preserve the centered fallback but now carry an unsupported-semantic record so
  inspection can show the fallback instead of silently hiding the authored value.
- Implemented in the current v0.8.2 preparation slice: layout projection now records
  unsupported-but-valid CSS layout values as `layout` unsupported semantics instead of silently
  reducing them to the nearest supported behavior. Covered properties include display values outside
  `block` / `flex` / `grid` / `none`, overflow values outside `visible` / `hidden`, positioned
  values outside `static` / `relative` / `absolute`, reverse flex direction/wrap values,
  baseline/safe/unsafe alignment grammar, and named or negative CSS grid line placement.

### Required Fixes

- Completed for the current slice: implement CSS-like defaulting for the supported subset instead of
  treating missing layout values as deck-specific zeroes. Element defaults now behave more like a
  small UA stylesheet for the supported subset: supported view-like tags create block boxes, `p` and
  headings have readable text defaults, and inherited text properties such as color, font family,
  font size, line height, direction, and letter spacing flow into text runs.
- Completed for the current slice: implement normal-flow block layout for unpositioned block
  children. A plain nested `<div><p>...</p><p>...</p></div>` now produces vertically flowing,
  non-overlapping frames without explicit child `x`, `y`, `width`, or `height`. `layout: "absolute"`
  and explicit frame props remain the slide-oriented opt-in for local absolute positioning.
- Completed for the current slice: add the v0.8.2 `auto`/intrinsic sizing subset. Unspecified block
  inline size stretches to available content width; simple text has a line-height based intrinsic
  block size; images use probed intrinsic dimensions and natural aspect ratio where available.
  Exact wrapped text measurement, full CSS intrinsic keywords, and intrinsic contribution to every
  layout mode remain future work.
- Completed for the current slice: audit numeric public style handling against CSS. Unitless numbers
  remain valid for numeric CSS domains such as `lineHeight`, `flexGrow`, `flexShrink`, opacity,
  order, and ratios. CSS-like length-capable fields now share the documented legacy compatibility
  policy: layout numbers remain inches, point-like text numbers remain points, and string values
  provide the CSS-like unit path.
- Completed for the current slice: support CSS-like spacing shorthand strings for `margin`,
  `padding`, and `inset`: one-, two-, three-, and four-value forms. `auto` margins no longer fail
  spacing parsing; deckjsx uses a zero fallback and records `layout` unsupported semantics until full
  CSS auto-margin distribution is implemented.
- Completed for the current slice: fix property-specific percentage bases. `padding`, `margin`,
  `gap`, `rowGap`, and `columnGap` now resolve percentages against real containing dimensions in the
  active layout paths rather than a silent zero base.
- Completed for the current slice: reconcile CSS positioning semantics. `static` is the conceptual
  default, `absolute` removes entries from flow, and `relative` is in-flow layout plus visual offset.
  `auto` inset values no longer fail length parsing; deckjsx treats them as unspecified in the
  supported layout fallback and records `layout` unsupported semantics. Docs keep `x` / `y`
  documented as deck-specific frame aliases rather than browser CSS properties.
- Completed for the current slice: define the v0.8.2 logical-axis scope. `writingMode` and
  `direction` remain text-body projection inputs only; text nodes with `direction: "rtl"` or
  vertical `writingMode` preserve PPTX text-body direction while recording `layout` unsupported
  semantics for missing logical layout-axis and logical start/end mapping.
- Completed for the current slice: make flex/stack cross-axis default behavior match the documented
  CSS-like expectation where practical. A column flex child without explicit `width` stretches to
  the available content width unless an explicit cross size, aspect-ratio dependency, or
  self-alignment says otherwise. Focused layout tests cover text, view, image, and shape children in
  row and column flex containers.
- Completed for the current slice: add a CSS grammar diagnostic pass for supported property names
  with unsupported valid values:
  display values outside the v0.8.2 subset, overflow `auto` / `scroll` / `clip`, alignment
  `normal` / baseline / safe / unsafe values, flex reverse directions and shorthands, grid named or
  negative lines, and lossy shadow forms such as spread or multiple layers. The layout subset now
  emits projected `layout` unsupported-semantic records for display, overflow, position,
  flex-direction, flex-wrap, alignment, grid placement, auto insets, auto margins, and text logical
  layout axes. The same diagnostic path now records CSS-wide keyword fallback for layout and text
  length-like properties. Compile now also emits nonblocking warnings for unsupported CSS-like style
  property names such as `flex`, `flexFlow`, and logical spacing keys when they arrive through
  JavaScript or unsafe casts. Shadow spread radius now preserves the projected offset/blur/color
  shadow while recording missing `cssShadowSpreadRadius`; background/text-decoration lossy-value
  coverage remains in their existing style-specific fallback paths or follow-up diagnostics.
- Completed for the current slice: add degenerate frame diagnostics before writer emission. Zero
  width/height for non-line drawings is a package validation error; line shapes may keep one zero
  axis but not both. Render blocks artifact creation before any output side effect when these errors
  are present.
- Completed for the current slice: add an output safety regression test that renders to an existing
  non-empty file, forces a render failure with no artifact, and proves the file is left untouched
  while the result has error diagnostics and no artifact.
- Completed for the current slice: update README and repo skill docs with a compatibility table that
  names the supported CSS subset, documented deckjsx extensions, remaining diagnostics, text-run
  inheritance, CSS-wide keyword fallback, expanded units, image positioning guidance, and shadow
  spread fallback metadata.
- Completed for the current slice: audit README and repo skill asset-loader snippets so
  `AssetLoader.load()` returns `AssetLoadResult` with top-level `bytes`, not a nested `source`
  object.
- Completed for the current slice: tighten `borderRadius` behavior by resolving percentage radius
  values against the projected short side and covering capsule clamp output in writer tests.
- Completed for the current slice: broaden `letterSpacing` to CSS-like point lengths and `normal`,
  add public type coverage, and cover emitted PPTX character spacing XML.
- Completed for the current slice: broaden `paragraphSpacingBefore` and `paragraphSpacingAfter` to
  CSS-like point lengths, add public type coverage, and cover emitted PPTX paragraph spacing XML.
- Completed for the current slice: add default-semantics audit guidance to README and repo skill
  docs, covering frame sizing, block layout, flex stretch, grid tracks, box sizing, image/background
  sizing, shape fill, units, CSS-wide keyword fallback, shadow spread fallback, and z-index.
- Completed for the current slice: audit image positioning ergonomics. Current support is meaningful
  but intentionally split:
  authored `img` accepts `fit` / `objectFit`, `objectPosition`, and explicit `crop`; background
  image layers accept CSS-like `backgroundSize`, `backgroundPosition`, `backgroundRepeat`,
  `backgroundClip`, `backgroundOrigin`, and shorthand layer lists. README and repo skill docs now
  document natural aspect images, cover/focal-point style placement, foreground `img` controls, and
  background-layer controls.
- Completed for the current slice: tighten the `img` versus `background-image` vocabulary split.
  `img` uses `objectFit` / `objectPosition` plus `crop`, while background layers use
  `backgroundSize` / `backgroundPosition` and repeat/origin/clip semantics. Docs explain when to use
  each rather than implying they are interchangeable.
- Completed for the current slice: invalid authored foreground `objectPosition` values now preserve
  a centered fallback and carry an unsupported-semantic record. Further crop/focal-point helper
  aliases remain future v0.8.x ergonomics work.
- Completed for the current slice: keep object-position parsing consistent across foreground images
  and background helpers for the supported forms, including `right 25% bottom 10%`, percentages,
  keywords, and length offsets. Invalid foreground `objectPosition` values now preserve a centered
  fallback with unsupported-semantic metadata.
- Implemented in the current v0.8.2 preparation slice: `img` layout now derives a missing projected
  axis from probed intrinsic `width` / `height` when the author has not supplied `aspectRatio`.
  Authored `aspectRatio` still wins for deliberate overrides.
- Completed for the current slice: add image sizing presets or examples for common cases:
  "natural aspect with fixed width",
  "natural aspect with fixed height", "fill this box with cover", "fit this box with contain",
  "crop to focal point", and "use as background layer behind text". README and both repo skill docs
  now carry the common image positioning patterns so agent-authored decks do not need to improvise
  them.
- Completed for the current slice: decide the public authoring model for automatic aspect ratio.
  `aspectRatio: "auto"` is accepted as the CSS-like spelling for no authored ratio, while
  `style={{ width: 4 }}` derives height for images after v0.8.2 intrinsic sizing and
  `style={{ width: 4, aspectRatio: "16 / 9" }}` remains the explicit non-image/override pattern.
- Completed in the current slice: accept `objectFit: "fill"` as the CSS spelling for deckjsx's
  existing `stretch` image projection. CSS `object-fit: none` and `scale-down` now preserve the
  authored value as unsupported semantic metadata and fall back to `contain`; exact projection
  remains future work because it needs natural-size comparison and a precise PPTX source-rectangle
  policy.
- Completed for the current slice: add diagnostics for image layout when intrinsic size is required
  but unavailable. Project/media validation already reports missing projected dimensions for image
  and background `contain` / `cover` calculations before Render.
- Future v0.8.x: review whether `crop` should get friendlier aliases. The current explicit-edge crop
  model is precise, but users often think in focal point plus zoom. A future-friendly v0.8.x API
  could keep `crop` as the low-level source-rectangle input while adding documented recipes or
  aliases for `zoom`, `focalPoint`, or `objectPosition`-driven cover crops if those map cleanly to
  PPTX `srcRect`.
- Future v0.8.x: revisit element background defaults separately from slide background defaults. CSS
  element backgrounds default to natural sizing and repeat behavior, while current deckjsx image
  layers default toward presentation-style stretch/no-repeat. v0.8.2 documents this as a
  deck-specific default; changing defaults or adding explicit presets should be a separate
  compatibility decision.

### Validation

- Completed for the current slice: focused layout tests cover:
  - normal-flow block children lay out vertically without explicit child coordinates or sizes;
  - plain text in a block container gets a non-zero projected frame from defaults;
  - percentage padding, margin, and gaps resolve against documented non-zero bases;
  - CSS `position` defaults keep nodes in normal flow, while `absolute` removes them from flow;
  - `position: relative` offsets visual frames without moving later flow siblings;
  - `auto` insets and margins do not crash length parsing and emit fallback diagnostics;
  - `writingMode` / `direction` limitations are diagnosed or documented in inspection output;
    completed for text nodes whose text-body direction is projected but logical layout axes are not;
  - column flex text without width stretches to parent content width;
  - row flex text without height stretches to parent content height when appropriate;
  - grid default stretch remains intact while flex default stretch is added;
  - unsupported exact wrapped text measurement produces a clear diagnostic instead of a zero frame or
    a false claim of exact browser layout.
- Completed for the current slice: value-grammar tests cover unsupported-but-valid CSS inputs in the
  v0.8.2 scope: display values outside the supported subset, overflow `auto` / `scroll` / `clip`,
  baseline and safe/unsafe alignment, flex reverse and shorthand/property-name values, grid
  named/negative line placement, auto insets and margins, text `writingMode` / `direction`
  logical-axis limitations, and shadow spread fallback metadata.
- Completed for the current slice: render tests cover:
  - degenerate projected frames produce element-origin diagnostics;
  - failed render does not create or truncate `output`;
  - numeric `lineHeight` stays `lineSpacingMultiple`;
  - `letterSpacing`, `paragraphSpacingBefore` / `paragraphSpacingAfter`, and `borderRadius`
    unsupported/supported inputs follow the documented policy.
- Required release gates before cutting v0.8.2: `vp check`, `vp test`, sample smoke, strict PPTX
  benchmark, and render verification.

### Non-Goals

- Do not implement full browser parity in v0.8.2. The scope is the CSS-like subset deckjsx already
  exposes: defaults, normal-flow block layout, supported flex/grid behavior, supported values/units,
  and diagnostics for unsupported valid CSS.
- Do not build a browser engine or full text shaping engine in v0.8.2. Implement enough intrinsic
  sizing to avoid empty default frames, and diagnose the cases that need exact wrapped text
  measurement beyond the supported subset.
- Do not expose public layout snapshots or solver internals while adding diagnostics. The user-facing
  contract remains stage results, diagnostics, summaries, and inspection surfaces already planned for
  the 0.8 line.
- Do not implement first-class video in v0.8.2. Video belongs to the dedicated v0.8.3 media slice
  below.

## 0.8.3 Video Media Support

### Goal

Add first-class video authoring and PPTX output support without weakening the existing image/media
pipeline. The initial target should be practical slide-deck video embedding: an authored video box
with deterministic package parts, relationships, optional poster/fallback image, diagnostics, and
render verification. This should not be treated as a background-image variant or an `img` alias.

### Current Code Findings

- The authoring surface has no `video` intrinsic. `AuthoredTag`, JSX prop types, semantic graph
  roles, layout input, projected layout nodes, and PPTX drawing elements currently distinguish only
  view/text/image/shape content.
- `AssetSource`, `AssetProbeResult`, and `AssetLoadResult` are generic enough to carry video bytes,
  media type, extension, byte length, and hashes, but the Project pipeline currently interprets media
  through `ImageSourceIR` and image dimensions. There is no duration, poster frame, codec, or
  playable-media metadata shape.
- PPTX media package parts are currently image-oriented. `PptxMediaPartPayload.source` and
  `sources` are typed around `ImageSourceIR`; `isPptxMediaPart()` validates image sources; media
  allocation keys, extension inference, and metadata inference know image MIME types.
- Slide relationships currently attach `image` and `hyperlink` relationships for drawing content.
  Package relationship XML can serialize additional relationship types once modeled, but the
  projection/writer layers do not yet create video/movie/media relationships or connect them to slide
  drawing XML.
- Slide XML emission has a picture path for `PptxPictureElement`; there is no video drawing element,
  movie non-visual property emission, poster image relationship, or playback-related XML emission.
- README and deckjsx skill docs describe image assets only. Agent-authored decks therefore have no
  supported pattern for videos, posters, fallbacks, or "link instead of embed" behavior.

### Proposed Authoring Scope

- Add a lowercase `video` intrinsic rather than overloading `img`. Initial props should be narrow:
  `src` or `data`, `style`, `className`, `area`, optional `poster`, optional `posterData`, and a
  small playback-policy shape only when the PPTX mapping is verified. Avoid broad HTML media props
  until their PPTX behavior is understood.
- Keep the first supported runtime sources aligned with the asset loader boundary: `data:`,
  `bytes`, absolute URL-like sources when fetch is available, and loader-resolved paths/app assets.
  Filesystem and authenticated media remain outside core behind `deck.useAssets(loader)`.
- Prefer `video/mp4` with `.mp4` as the first compatibility target. Add MIME/extension hooks for
  other formats only after generated PPTX files open correctly in PowerPoint, Keynote, and
  LibreOffice or are documented as best-effort.
- Require or strongly recommend a poster/fallback image for v0.8.x. If poster generation is not in
  scope, support an authored poster source and produce diagnostics when a playable video has no
  visible fallback.
- Decide whether unsupported runtimes should embed video bytes, link to an external video, or render
  a poster-only fallback. The behavior must be explicit in diagnostics and summaries; it should not
  silently degrade to a static image.

### Implementation Notes

- Split image-specific vocabulary into media-neutral and image-specific pieces. Candidate shapes:
  `MediaSourceIR` for data/path/url/bytes-like authored media, `ImageSourceIR` for still images, and
  `VideoSourceIR` for playable video. Preserve compatibility for existing image APIs.
- Extend Asset metadata carefully. Image `width`/`height` can stay, but video likely needs optional
  `durationMs`, `posterWidth`, `posterHeight`, `codec`, and `container` only when a loader can
  provide them. Do not require core to parse MP4 boxes in the first slice unless needed for package
  correctness.
- Add `video` semantic/layout/projected node kinds, or introduce a media node with a discriminant,
  only if it improves type boundaries. Do not make video masquerade as `image` internally just to
  reuse drawing code; the writer needs distinct relationship and XML behavior.
- Extend `PptxElementKind`, `PptxElement`, package media payloads, allocation keys, and media part
  validation so image and video media parts can share the media package directory while preserving
  kind-specific metadata and diagnostics.
- Add PPTX relationship and content-type modeling for video based on real OOXML fixtures generated
  from PowerPoint/LibreOffice/Keynote, not guessed XML. Keep the relationship type names and slide
  XML shape as projected package intent before the writer emits bytes.
- Model poster images as separate image media parts related to the video element when PPTX requires
  them. Reuse the existing image media pipeline for poster bytes rather than storing poster data
  inside the video payload.
- Add writer support behind a focused module, such as `video-xml.ts`, with direct tests for missing
  relationship ids, malformed video payloads, poster fallback behavior, and stable object ids.
- Extend render verification with a tiny video fixture and package-level semantic assertions. Raster
  verification may only see the poster frame, so package/XML assertions are required to prove the
  embedded playable video is present.

### Validation

- Type tests reject unsupported broad HTML video props until they are intentionally modeled.
- Asset loader tests cover video probe/load metadata, invalid MIME/extension combinations, byte-load
  failures, and repeated-source media-part reuse.
- Projection tests cover video element identity, package part allocation, content-type defaults,
  slide relationships, poster image relationships, and fallback diagnostics.
- Writer tests cover emitted relationships/content types, video XML, poster XML, missing relationship
  failures, and deterministic package output.
- Manual/opening verification should include at least PowerPoint and LibreOffice for an `.mp4`
  fixture before calling video support release-ready. Keynote compatibility can be recorded as a
  separate observation if available.

### Non-Goals

- Do not implement video editing, trimming, transcoding, thumbnail extraction, or codec conversion in
  core deckjsx.
- Do not add browser-like `<source>` selection, captions/subtitles, tracks, or streaming controls in
  the first video slice.
- Do not silently convert video to a static image. Poster-only fallback is acceptable only when the
  result diagnostics and docs clearly say the video was not embedded/playable.
- Do not expose low-level OOXML media controls as public props before there is a stable deckjsx
  semantic model for them.

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
4. `0.6` should establish Project/Render boundaries, result-first stage APIs, and the Pptx Package
   Model while keeping the Semantic Author Graph output-agnostic.
5. `0.7` should follow the output boundary because template relationships need clear inspection and
   projection behavior.
6. `0.8` should add the direct PPTX projection and writer after the public output pipeline shape is
   already clear.
7. `0.8.1` should clean up writer responsibility after the direct PPTX writer migration, especially
   Output Writer internal nodes, ZIP structure ownership, Assembly Plan construction, and
   materialization/reuse seams.
8. `0.9` should come after source-aware graph compilation and at least one output projection/writer
   path can preserve identity well enough for incremental rebuilds.

## Compatibility Policy Before 1.0

- Prefer correcting core model boundaries early over preserving APIs that make the wrong internal
  model hard to remove.
- Keep `Deck` as the public authoring entry point, and prefer removing capitalized intermediate
  authoring components early when the HTML-like JSX surface can express the same slide intent.
  Do not keep pre-`0.6` render/output architecture as API commitments.
- Prefer additive changes when they do not preserve the wrong architecture.
- Document migration examples when introducing intrinsic JSX tags, classes, themes, and the OOXML
  writer path.
- Make `compile()` and `project()` the primary inspection APIs for authoring semantics and
  output-facing computed state, with render reserved for Writer Adapter execution.

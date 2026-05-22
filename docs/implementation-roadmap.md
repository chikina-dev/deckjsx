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
  - Keep Style Entities split between authored `style`, authored direct props, and style references.
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
    readonly direct?: unknown;
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
  - `classRefs` should preserve only the class name and merge-order index at the graph stage.
  - Theme should not be stored as `StyleEntity.authored` payload; it belongs to Deck configuration
    and should appear in resolved inspection output as applied values or trace.
- Remove the existing `StyleEntity.resolved` field in `0.3.1`; resolved concrete styles belong to
  the future Resolved Style Inspection View.
- Capture authored `className` props into `StyleEntity.authored.classRefs`, but do not resolve
  classes, check class existence, add `DeckOptions.styles`, or merge class style values until `0.4`.
- Accept clsx-like `className` values in `0.3.1`: strings, nested arrays, object maps, and falsey
  entries. Normalize them into ordered `StyleClassRef` records.
- Exclude numbers from the `className` type. deckjsx Style Class names are authored style names, not
  arbitrary DOM class tokens.
- Restrict object-map `className` values to `boolean | null | undefined` values. Broader truthy or
  falsy payloads should not be accepted by the TypeScript API.
- Ignore empty and whitespace-only class names, including empty object-map keys, during `classRefs`
  normalization.
- Assign `StyleClassRef.index` after normalization as merge order. Do not use original input
  positions, and do not leave index gaps for omitted falsey or empty entries.
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
  inline style/direct prop behavior.
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
  - `DeckOptions.styles`, class lookup, missing class diagnostics, and style merge behavior.
- Deferred to v0.5:
  - Theme configuration, tokens, component defaults, and theme application trace.
- Deferred to v0.6:
  - Output Projection and build/project/write API.

## 0.4 Class-Like Style Reuse

### Goal

Add a class-like style mechanism to avoid repeating large inline style objects.

### Proposed API

```tsx
const deck = new Deck({
  layout,
  styles: {
    title: { fontSize: 32, fontWeight: 700 },
    card: { backgroundColor: "#fff", borderRadius: 0.12 },
  },
});

<Text className="title">Revenue</Text>
<View className={["card", active && "selected"]} />
```

Supported names:

- `className` for HTML familiarity.
- `class` may be supported for intrinsic tags, but `className` should be preferred in TSX.

### Semantics

Style resolution order before Theme support should be:

1. Element defaults
2. Classes in order
3. Inline `style`
4. Direct props outside `style`

This preserves current behavior where direct props and inline style are local overrides.

### Implementation Notes

- Add `styles` to `DeckOptions`.
- Resolve the `className` references captured in `0.3.1` during semantic graph construction or graph
  resolution, before shorthand parsing and output projection.
- Support the clsx-like input shape captured in `0.3.1`.

### Validation

- Tests for class lookup and merge order.
- Tests for missing class error messages.
- Tests that existing inline style behavior is unchanged.

## 0.5 Theme Support

### Goal

Introduce reusable design tokens and semantic defaults so decks can share colors, typography, and
component-level defaults.

Theme support should build on Style Classes and Style Entities before Output Projection begins, so
projection code can consume concrete style information instead of owning theme or token semantics.

### Proposed API

```ts
const deck = new Deck({
  layout,
  theme: {
    colors: {
      primary: "#2563EB",
      text: "#0F172A",
      surface: "#FFFFFF",
    },
    fonts: {
      body: "Aptos",
      heading: "Aptos Display",
    },
    components: {
      Text: {
        style: { fontFamily: "$fonts.body", color: "$colors.text" },
      },
      Slide: {
        style: { backgroundColor: "$colors.surface" },
      },
    },
  },
});
```

### Semantics

- Token references use a predictable string form such as `$colors.primary`.
- Theme component defaults apply before class styles and inline styles.
- Theme values should be resolved into the Semantic Author Graph or its resolved inspection view, so
  output projections receive concrete values without making the graph output-format-specific.
- Style resolution order after Theme support should be:
  1. Theme defaults
  2. Element defaults
  3. Classes in order
  4. Inline `style`
  5. Direct props outside `style`

### Implementation Notes

- Add `theme` to `DeckOptions`.
- Add a token resolver in semantic graph construction or graph resolution.
- Keep Output Projection values concrete, not tokenized.
- Document precedence with style classes because the two features interact.

### Validation

- Tests for token resolution.
- Tests for component defaults.
- Tests for unknown token diagnostics.
- Snapshot tests showing graph/resolved inspection values and Output Projection values contain
  resolved values where appropriate.

## 0.6 Output Projection And Build Pipeline

### Goal

Introduce the output boundary that turns the Semantic Author Graph into an explicit
output-format-specific projection, without making the graph output-specific. This milestone should
shape the user-facing pipeline API before direct PPTX OOXML ownership expands in a later release.

`Deck` should own pipeline configuration and authoring inputs, but it should not hide compiled or
projected results as implicit mutable state.

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

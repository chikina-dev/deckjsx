# Implementation Roadmap

This document outlines separately versioned implementation milestones for the next deckjsx updates.
The goal is to keep each release useful on its own while preserving the compiler architecture:

```text
JSX authoring
  -> normalized author tree
  -> Presentation IR
  -> backend emission
```

## Versioning Strategy

The current package is `0.1.x`. Until the API is stable enough for `1.0`, each new feature family
should land as a separate minor version:

- `0.2`: HTML-like authoring syntax, starting with a small intrinsic set
- `0.3`: deck composition and merge
- `0.4`: class-like style reuse
- `0.5`: layout templates
- `0.6`: theme support
- `0.7`: direct OOXML backend and removal path for the required `pptxgenjs` runtime dependency
- `0.8`: HMR-oriented compilation/runtime

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

`0.2.1` should add inline rich text:

- `span` as an inline text run, not a standalone text box.
- `TextIR` should evolve from plain text content to rich text runs.
- `<p>Sales grew <span style={{ color: "red" }}>12%</span> YoY</p>` should compile to one text box
  with multiple styled runs.

### Proposed API

Keep current components as compatibility aliases, and introduce lower-case JSX intrinsics:

```tsx
<deck layout={{ width: 13.333, height: 7.5, unit: "in" }}>
  <slide name="Intro">
    <div className="hero">
      Hello
      <img src="./logo.png" />
    </div>
  </slide>
</deck>
```

Initial intrinsic mapping:

- `deck` maps to a declarative deck root only if a declarative root API is introduced.
- `slide` maps to `Slide`.
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
- For `0.2.1`, add a `TextRunIR` or equivalent and update the text extractor/compiler path so rich
  inline children preserve run-level styles.

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
- In `0.2.1`, add rich text IR tests and backend tests for styled runs.

## 0.3 Deck Composition And Merge

### Goal

Support splitting large decks into multiple files and composing them:

```tsx
const intro = new Deck(options);
const appendix = new Deck(options);

intro.merge(appendix);
await intro.output({ backend: "pptxgenjs", output: "deck.pptx" });
```

Default merge behavior inserts slides at the end.

### Proposed API

```ts
deck.merge(otherDeck);
deck.merge(otherDeck, { at: 3 });
deck.merge([deckA, deckB]);
```

Open decisions:

- Whether mismatched layout sizes should throw by default.
- Whether metadata from merged decks should be ignored, merged, or accepted via option.

Recommended defaults:

- Throw on layout mismatch unless `allowLayoutMismatch: true`.
- Keep receiver metadata.
- Insert at the end unless `at` is provided.

### Implementation Notes

- Add an internal slide-source abstraction so a `Deck` can store both local slide factories and
  merged deck references or flattened factories.
- Prefer flattening factories at merge time for predictable `slideIndex` and `totalSlides`.
- Preserve the receiver deck's options as the rendering authority.

### Validation

- Tests for append merge.
- Tests for insertion index.
- Tests for slide context after merge.
- Tests for layout mismatch errors.

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

Style resolution order should be:

1. Theme defaults
2. Element defaults
3. Classes in order
4. Inline `style`
5. Direct props outside `style`

This preserves current behavior where direct props and inline style are local overrides.

### Implementation Notes

- Add `styles` to `DeckOptions`.
- Add `className` to authoring props.
- Resolve classes during normalization, before current shorthand parsing.
- Support string, string array, and conditional falsey entries.

### Validation

- Tests for class lookup and merge order.
- Tests for missing class error messages.
- Tests that existing inline style behavior is unchanged.

## 0.5 Layout Templates

### Goal

Provide reusable layout definitions that can be applied to slides or views. Templates should reduce
manual `x`, `y`, `width`, and `height` repetition without hiding the IR model.

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
- A child with `area` receives a placement override from the template.
- Inline `style` can still override dimensions if needed.
- Templates should work independently from CSS grid. They are named layout slots, not full layout
  engines.

### Implementation Notes

- Add `templates` to `DeckOptions`.
- Add `template` to `SlideStyle` or `SlideProps`.
- Add `area` to content node props.
- Resolve template placement in `compileSlide` before normal layout compilation.

### Validation

- Tests for slide templates.
- Tests for missing template and missing area errors.
- Tests for inline overrides.

## 0.6 Theme Support

### Goal

Introduce reusable design tokens and semantic defaults so decks can share colors, typography, and
component-level defaults.

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
- Theme values should be resolved before the IR is created, so the IR remains backend-independent.

### Implementation Notes

- Add `theme` to `DeckOptions`.
- Add a token resolver in the normalization layer.
- Keep IR values concrete, not tokenized.
- Document precedence with style classes because the two features interact.

### Validation

- Tests for token resolution.
- Tests for component defaults.
- Tests for unknown token diagnostics.
- Snapshot tests showing final IR contains resolved values.

## 0.7 Direct OOXML Backend

### Goal

Remove the required runtime dependency on `pptxgenjs` by introducing a direct OOXML backend. This
also reduces transitive dependency weight, enables browser-compatible output paths, and is a
prerequisite for fast save-to-output feedback during development.

### Proposed Direction

Keep `pptxgenjs` as a temporary compatibility backend while adding:

```ts
await deck.output({ backend: "ooxml", output: "deck.pptx" });
```

Then transition package dependencies:

1. Add direct OOXML backend.
2. Make `pptxgenjs` optional or move it behind a peer/compat package.
3. Change default backend after parity is sufficient.
4. Remove the required `pptxgenjs` dependency in a later minor or `1.0`.

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

- Create `src/backends/ooxml/*`.
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
- Preserve the backend boundary: the compiler still outputs `PresentationIR`.
- Add a package-model boundary before ZIP writing:

```text
PresentationIR
  -> PptxPackageModel
       entries: Map<pptx path, bytes>
       relationships
       contentTypes
       mediaManifest
  -> ZipWriter
```

- Keep ZIP writing as a replaceable adapter so Node, browser, and future dev-server outputs can use
  the same package model.
- Do not make HMR depend on mutating an existing `.pptx` ZIP in place. PPTX ZIP files have a central
  directory at the end, so the practical fast path is to avoid recompiling unchanged slides and then
  quickly re-emit the package.

### Risks

- Full PPTX compatibility is larger than the current feature surface.
- Image relationship management and media deduplication need deterministic IDs.
- Existing tests mostly validate IR and zip structure; direct XML needs deeper fixture tests.
- Browser compatibility can be lost if Node-only APIs leak into the core OOXML backend. Keep file
  system, path, image probing, and ZIP writing behind adapters.

### Validation

- Backend parity tests against current `pptxgenjs` behavior for supported IR.
- ZIP structure tests.
- XML snapshot tests for slides.
- Render verification through `scripts/verify-render.ts`.

## 0.8 Hot Module Replacement

### Goal

Support a fast authoring loop where saving a source file quickly updates the generated output. The
main objective is immediate feedback after save, not preserving long-lived runtime state inside the
deck compiler.

### Preconditions

HMR should come after direct OOXML or at least after an incremental backend abstraction exists.
`pptxgenjs` is built around whole-presentation generation, which limits meaningful HMR.

For the first implementation, "HMR" can mean watch-mode incremental rebuild rather than a browser UI
with stateful module replacement. The important behavior is that editing a slide module should update
the output quickly.

### Proposed Architecture

- Track slide factories by stable module and export identity.
- Compile changed slide modules to updated `SlideIR`.
- Preserve stable slide IDs where possible.
- Rebuild only affected package entries:
  - changed slide XML
  - changed slide relationships
  - changed media entries
  - presentation manifest if slide order changed
- Expose a dev server integration through Vite+ tasks or a dedicated CLI.
- Re-emit the PPTX from the package model after incremental compilation. Avoid depending on
  low-level ZIP entry patching for correctness.
- Keep browser support in mind by separating:
  - source/module watching
  - compilation
  - package model generation
  - ZIP/blob/file output

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

- Unit tests for stable slide identity.
- Integration tests for changing one slide and regenerating only expected outputs.
- Smoke test through a Vite+ dev task.

## Suggested Release Order

1. Ship `0.2` first because it changes authoring ergonomics without requiring backend work.
2. Ship `0.3` next because file splitting helps larger decks immediately.
3. Ship `0.4` and `0.6` close together, but keep them separate because style classes and themes
   have different compatibility risks.
4. Ship `0.5` after classes, because templates will likely use class/theme defaults in examples.
5. Ship `0.7` before `0.8`, because HMR depends on incremental backend behavior.

## Compatibility Policy Before 1.0

- Keep existing `Deck`, `Slide`, `View`, `Text`, `Image`, and `Shape` APIs working unless a release
  explicitly marks a breaking change.
- Prefer additive changes for `0.x` minors.
- Document migration examples when introducing intrinsic JSX tags, classes, themes, and the OOXML
  backend.
- Keep `render()` returning backend-independent IR so tests and tooling do not depend on PowerPoint
  output details.

# Type Strengthening Plan

This document summarizes the type-safety gaps found in the current codebase and proposes a concrete strengthening plan.

## Goals

- Keep the public authoring API ergonomic for TSX users.
- Make compiler stages explicit: authoring props -> normalized props -> resolved layout/style -> IR.
- Reduce unchecked casts in the compiler core.
- Keep backend-specific looseness behind one typed adapter boundary.
- Add type-level regression tests so the public API does not drift accidentally.

## Progress

Implemented so far:

- JSX child contracts now distinguish text-like children from structured component children.
- `AuthorNode` is now a discriminated union where `kind` and `props` stay correlated.
- `createElement` overloads preserve component return types for direct factory calls.
- `isAuthorNode`, `isSlideNode`, and `isContentNode` provide stronger runtime and type guards.
- Compiler node traversal now uses those guards instead of repeated `AuthorNode` casts.
- Normalizer return values are named as internal `Normalized*Props` aliases.
- `SolidFillIR` now has `kind: "solid"`, making `FillIR` fully discriminated.
- `FrameIR` and `SizeIR` now remove repeated anonymous EMU frame object types from IR.
- PptxGenJS backend emission now uses deckjsx-owned option types instead of raw `Record<string, unknown>`.
- Text list IR is now split into bullet, numbered, and none variants.
- XML patch application now carries typed patch values directly instead of JSON string round-tripping.
- `OutputConfig` now accepts only implemented backends, while `BackendName` can still model planned backends.
- PptxGenJS node and fill emission now uses exhaustive union switches.
- Public compile-only JSX type tests cover accepted and rejected child relationships.
- IR arrays and author node children are now readonly at the type level.
- CSS length parser call sites now validate string tokens before parsing instead of casting to `DeckLength` / `DeckPointLength`.
- `AuthorNode.props` now models the runtime shape after `children` is removed, so JSX node creation no longer lies about `children` living in both places.
- JSX runtime child values are normalized through a runtime/type guard instead of broad props casts.
- Style merging no longer uses a generic `resolveStyle<T>` assertion; each component family now has an explicit normalized return type and resolver.
- Compiler `placeSelf`, `placeItems`, and `placeContent` parsing now uses token type guards instead of casting split strings into CSS alignment unions.
- Background layer resolution now uses typed layer guards to choose between `fill` and `backgroundLayers`.
- Grid shorthand parsing now routes internal strings through typed parser helpers for placement, auto-flow, and track-size values.
- Background parser literal outputs now use named result types for box keywords, gradient stop entries, radial descriptors, and image sizing instead of `as const`.
- The remaining production cast is isolated to the PptxGenJS constructor import boundary; runtime construction works, but the package import type does not expose a construct signature in this project setup.
- Transform parsing now validates argument cardinality through tuple-returning helpers, removing non-null assertions from transform shorthand and origin parsing.
- `color`, `shadow`, and `stroke` parser assertions have been replaced with local destructuring and guards.
- Stack layout and grid occupancy/index assertions have been replaced with iteration/local row guards.
- Background parser assertions have been removed from gradient stop interpolation, gradient argument parsing, background-size parsing, object-position parsing, radial descriptor parsing, and image-layer frame fallbacks.
- Public authoring types now accept readonly tuples/arrays for common constant values such as spacing, grid templates, grid areas, JSX child arrays, and text tab stops.
- The root package export now exposes the CSS-style value union types needed to annotate reusable style constants.

## Current State

The project now has a strong baseline:

- `tsconfig.json` enables `strict`, `noUnusedLocals`, `isolatedModules`, and declaration output.
- `src/authoring/index.ts` exposes typed component props and CSS-like value unions.
- JSX authoring has distinct child contracts for text nodes, content nodes, and leaf nodes.
- Runtime author nodes are discriminated by `kind`, with `children` stored outside `props`.
- `src/ir/index.ts` defines a backend-agnostic `PresentationIR`.
- `src/compiler.ts` lowers authoring nodes into IR using normalized prop aliases and kind-aware node guards.
- `src/backends/pptxgenjs.ts` isolates the first backend from the compiler core with deckjsx-owned option types.

The remaining weakness is narrower now. It is mostly about proving local parser invariants to TypeScript without making the parser harder to read.

The current residual hotspots are:

- Public API usability should stay the main priority: reusable `as const` style values, exported style helper types, and type tests for user-authored constants are more valuable than deeper internal cleanup unless the internal cleanup directly improves the authoring experience.
- `src/style/background.ts`: the main non-null assertion cleanup is complete. Future work should focus on whether any parsed background value objects should become more exact domain types.
- `src/style/color.ts`, `src/style/shadow.ts`, and `src/style/stroke.ts`: small parser assertion cleanup is complete.
- `src/compiler.ts`: stack layout no longer indexes lines/allocations with non-null assertions.
- `src/layout/grid.ts`: row token and occupancy matrix assertions have been removed.
- `src/backends/pptxgenjs.ts`: one production cast remains at the PptxGenJS constructor import boundary because the runtime default export is constructable, but the imported TypeScript type does not expose a construct signature in this setup.

Tests intentionally keep a few `as never` values to exercise runtime rejection paths, and type tests intentionally use `satisfies`.

## Findings

### 0. JSX typing has a usable contract

The JSX layer is no longer just a thin runtime helper. It now rejects many common authoring mistakes before the compiler runs:

- `View` and `Slide` children are component-like nodes, booleans, null, undefined, or arrays of those values.
- `Text` children are text-like values.
- `Image` and `Shape` are leaf components with `children?: never`.
- intrinsic JSX elements remain unsupported.
- runtime node detection validates the deckjsx tag, node kind, props shape, and children array.

One important TypeScript limitation remains: with the current classic JSX factory setup, a TSX expression is normalized to `JSX.Element`, so `<Slide />` does not reliably preserve the expression type `AuthorNode<"slide">` at every call site. Because of that, `Deck#add(() => <Text />)` still needs a runtime root check unless the project adopts a different JSX typing strategy or a non-JSX slide factory helper.

### 1. Normalized props are explicit, but still broad

The compiler now has `NormalizedSlideProps`, `NormalizedViewProps`, `NormalizedTextProps`, `NormalizedImageProps`, and `NormalizedShapeProps`, and style merging uses explicit component-specific resolver functions instead of a generic `resolveStyle<T>` assertion.

The remaining issue is that these normalized types are still mostly structural combinations of public props and style props. They do not yet distinguish every canonical compiler field from every public authoring alias.

Still worth improving later:

- make canonical fields more exact where the compiler really depends on them,
- move resolved shorthand output into dedicated internal types,
- avoid repeatedly re-normalizing node props in layout helper functions when a resolved node model would be clearer.

### 2. Author node narrowing is mostly complete

`AuthorNode` is now correlated by `kind` and `props`, `AuthorNode.props` models the runtime shape after `children` is removed, and `isSlideNode` / `isContentNode` are available.

Remaining work here is not about casts. It is mostly about ergonomics:

- reduce repeated normalization during layout,
- consider internal resolved-node types if compiler stages start to blur again.

### 3. CSS-like parser output still needs local proof

The authoring layer intentionally accepts CSS-like strings such as:

- `background`
- `backgroundImage`
- `backgroundPosition`
- `backgroundSize`
- `grid`
- `gridTemplate`
- `placeItems`
- `placeContent`
- `placeSelf`
- `transform`
- `boxShadow`
- `textDecoration`

This is fine at the public API boundary. The weak spot is that parser code sometimes proves conditions at runtime, then accesses arrays with `!` because TypeScript cannot see the invariant.

Important style constraint:

- Do not remove assertions by hiding everything behind generic helpers.
- Prefer local guards close to the array access:
  - `const [first, second] = tokens;`
  - `if (first === undefined) throw ...;`
  - then use `first` directly.
- Add a helper only when it names a real domain concept that repeats, such as "one or two transform args". Avoid generic `firstOrThrow()` style helpers unless the local code is clearly improved.

Completed small targets:

- `src/style/color.ts`: RGB/HSL tuple cleanup.
- `src/style/shadow.ts`: `layers[0]!` replaced with local destructuring.
- `src/style/stroke.ts`: dash fallback made explicit after checking positive segments.

Done parser target:

- `src/style/background.ts`: larger parser assertion cleanup completed in focused passes.

### 4. Unit values still need branded internal types

Required strengthening:

- Add internal branded numeric types:
  - `type Emu = number & { readonly __unit: "emu" }`
  - `type Points = number & { readonly __unit: "pt" }`
  - `type Inches = number & { readonly __unit: "in" }`
  - `type Percent = number & { readonly __unit: "percent" }`
  - `type Fraction = number & { readonly __unit: "fraction" }`
- Return branded values from conversion helpers:
  - `parseLength(...): Emu`
  - `parsePointValue(...): Points`
  - `pointsToEmu(...): Emu`
  - `emuToInches(...): Inches`
- Keep the brand internal at first. Public authoring types should stay simple.

Recommended order:

1. Brand `Frame` and layout helpers first, because they handle the most unit-sensitive math.
2. Brand text/stroke point values second.
3. Brand transparency/fraction values last, because backend conversion may need careful compatibility checks.

This is still the largest remaining type-safety project. It should not be mixed into parser cleanup.

### 5. IR is much more exact, with a few possible refinements

Completed:

- `FillIR` is fully discriminated.
- `FrameIR` and `SizeIR` exist.
- Text list IR is split into bullet, numbered, and none variants.
- IR arrays use readonly contracts.
- Backend fill and node emission use exhaustive switches.

Possible later refinements:

- `ColorIR`
- `TransparencyIR`
- `NodeTransformIR`
- a clearer distinction between framed fill layers and unframed fill layers inside `BackgroundLayerIR`

### 6. Backend adapter boundary is typed except for constructor import

Completed:

- deckjsx-owned Pptx option types exist.
- mapper functions return those local types.
- `Record<string, unknown>` is not used for deckjsx-owned option construction.
- PptxGenJS-specific looseness is isolated to the constructor import boundary.

The remaining cast should stay unless the import style or upstream type shape changes.

### 7. XML patch values are typed directly

`src/backends/pptxgenjs-xml-patches.ts` previously serialized patch plans through JSON and parsed them back with casts such as `JSON.parse(...) as ImageSrcRect`.

Patch application now carries typed patch values directly through a generic `patchSlideBlocks<TPatch>` helper, so this JSON boundary no longer exists.

### 8. Public type tests exist, but can be broadened

`tests/types/jsx-public-api.tsx` now covers core JSX and backend-name behavior.

Useful additions:

- more accepted/rejected authoring prop examples,
- unsupported length unit failures,
- component-specific CSS alias coverage,
- reusable readonly style constants,
- tests documenting the current classic JSX limitation around `Deck#add` root types.

## Proposed Implementation Phases

### Phase 1: Finish local parser proof cleanup

Scope:

- Done: remove non-null assertions in small parser modules first.
- Done: prefer local destructuring and local guards over generic helper abstraction.
- Done: move to `background` in smaller passes.

Why first now:

It improves local type soundness without changing public API or IR shape. It is also easier to review than unit branding.

Exit criteria:

- Done: `src/style/color.ts`, `src/style/shadow.ts`, and `src/style/stroke.ts` no longer need non-null assertions.
- Done: `src/style/background.ts` no longer needs parser index non-null assertions in the targeted cleanup areas.
- `vp check` and `vp test` pass.

### Phase 2: Reduce compiler and grid index assertions

Scope:

- Done: replace stack layout index loops with iteration patterns that keep line entries and allocations correlated.
- Done: replace grid row/occupancy assertions with local row guards or row construction that proves the matrix exists.

Why second:

These assertions are not parser-specific, and the fixes may touch layout behavior. They should be reviewed separately from style parser cleanup.

Exit criteria:

- Done: `src/compiler.ts` stack layout no longer indexes parallel arrays with `!`.
- Done: `src/layout/grid.ts` no longer indexes row matrices with `!`.
- Layout tests pass.

### Phase 3: Make background parser output more exact

Scope:

- Keep this focused on `src/style/background.ts`.
- Split large improvements by sub-area:
  - gradient stop interpolation,
  - radial gradient descriptors,
  - background image sizing,
  - object position parsing,
  - frame fallback handling.
- Avoid helper proliferation; use small local guards where that is clearer.

Why third:

Background is the largest remaining parser surface. It deserves its own pass after smaller parser cleanup has set the style.

Exit criteria:

- Background parser non-null assertions are substantially reduced.
- Existing gradient/background tests pass.

### Phase 4: Brand internal units

Scope:

- Add branded unit aliases in an internal module such as `src/internal/units.ts` or `src/ir/units.ts`.
- Brand `Frame` and `FrameIR` first.
- Brand point conversion helpers next.
- Update arithmetic helpers deliberately, with small conversion functions where brands meet raw math.

Why fourth:

This is the most invasive remaining phase. It should happen after parser and layout assertions are lower, otherwise brands will be erased immediately.

Exit criteria:

- Layout frame APIs distinguish EMU values from point and inch values.
- Backend conversion helpers accept branded values.
- No new broad casts are added to bypass unit errors.

### Phase 5: Add remaining IR value objects

Scope:

- Consider `ColorIR`, `TransparencyIR`, and `NodeTransformIR`.
- Revisit whether framed fill layers should be a distinct IR variant.

Why fifth:

IR changes affect backend emission, XML patching, and exported declaration shape. They should remain deliberate.

Exit criteria:

- New IR value objects remove meaningful duplication.
- Backend switches remain exhaustive.
- Snapshot/runtime tests are updated intentionally if output shape changes.

### Phase 6: Broaden public API type tests

Scope:

- Add compile-only examples for component-specific props, length units, and public IR/backend exports.
- Document expected TSX root limitations with `@ts-expect-error` only where TypeScript can actually enforce them.

Why sixth:

Type tests are now useful as regression protection for the strengthened API, but should not over-assert private implementation details.

Exit criteria:

- Accepted examples compile.
- Rejected examples are protected by `@ts-expect-error`.
- Type fixtures run in CI or through the normal local validation path.

## Suggested File Ownership

- `src/authoring/index.ts`: public authoring types only. Avoid adding internal normalized state here unless it is intentionally exported.
- `src/compiler.ts`: may import normalized internal types, but should stop owning every intermediate shape directly over time.
- `src/style/*`: parser modules should export precise parser result types.
- `src/layout/*`: layout should consume normalized props and branded layout units.
- `src/ir/index.ts`: backend-stable IR contract. Changes here should be deliberate and covered by snapshot/test updates.
- `src/backends/pptxgenjs.ts`: typed Pptx option mapping and a narrow third-party boundary.
- `tests/type/*` or `tests/types/*`: compile-only public API fixtures.

## Risks And Mitigations

- Risk: branded units create a lot of friction in arithmetic-heavy layout code.
  Mitigation: brand conversion boundaries first, then selectively brand deeper layout APIs.

- Risk: normalized prop types duplicate public prop types.
  Mitigation: use focused internal types that represent canonical compiler state, not a mirror of every public prop.

- Risk: making `FillIR` fully discriminated changes exported declaration shape.
  Mitigation: treat this as a minor breaking API change unless the package is still pre-release and no compatibility promise exists.

- Risk: type tests may become brittle if they assert too much internal shape.
  Mitigation: keep type tests focused on public imports and TSX authoring behavior.

## Recommended Next PR

Recommended next PR:

1. Decide whether to continue with more exact background domain types, or move to internal unit branding.
2. If continuing background work, review parsed value objects rather than adding more guards.
3. If moving to units, start with `Frame` / `FrameIR` and EMU-only layout helpers.
4. Keep runtime output unchanged.
5. Run `vp check` and `vp test`.

The assertion cleanup pass has reached a good stopping point. The next meaningful type-safety gain is either better domain modeling for background values or internal unit branding.

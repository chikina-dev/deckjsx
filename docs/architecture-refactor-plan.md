# Architecture Refactor Plan

Version: `0.1-draft`

This plan turns the current architecture review into a practical refactor sequence.
It assumes the compiler direction in [compiler-spec.md](./compiler-spec.md), the CSS growth path in
[css-completion-plan.md](./css-completion-plan.md), and the type-safety work already captured in
[type-strengthening-plan.md](./type-strengthening-plan.md).

## Why This Exists

The codebase already communicates the high-level pipeline clearly:

```text
JSX
  -> AuthorNode
  -> compiler
  -> Presentation IR
  -> backend
```

The main problem is not that the architecture is unclear. The problem is that `src/compiler.ts`
currently owns too much of the middle of the graph:

- public authoring prop merging
- CSS-like shorthand normalization
- child layout metric extraction
- stack and grid orchestration
- node frame resolution
- IR construction
- paint-order sorting

That shape still works, but it makes every new style or layout capability pass through the same
large file. The specification already says parsing and normalization should stay isolated from tree
walking and IR construction; this plan makes that separation concrete.

## Goals

- Make compiler stages explicit without changing public API behavior.
- Keep `PresentationIR` as the stable boundary between compiler and backend.
- Move CSS-like parsing and authoring normalization out of tree traversal code.
- Reduce repeated prop normalization during layout.
- Keep backend-specific approximations behind the backend boundary.
- Preserve the current test surface while moving code in reviewable slices.

## Non-Goals

- Do not redesign the public `Deck`, JSX, or `style` API in this refactor.
- Do not add new CSS features while moving boundaries.
- Do not introduce branded units in the same PR series unless a phase explicitly reaches for it.
- Do not rewrite the PptxGenJS backend as direct OOXML.
- Do not make browser CSS parity a goal.

## Target Module Shape

The intended dependency direction should become:

```text
authoring
  -> jsx
  -> compiler
       -> normalizer
       -> layout
       -> ir-builders
  -> ir
  -> backends
  -> node
```

More concretely:

- `src/authoring` owns public props and public style value types.
- `src/style` owns CSS-like value parsers and low-level style lowering.
- `src/compiler/normalization` should own component-specific normalized props.
- `src/layout` should own frame, stack, and grid resolution over normalized child inputs.
- `src/compiler` should orchestrate traversal and stage calls, not implement every stage inline.
- `src/compiler/ir-builders` should own conversion from resolved nodes to IR nodes.
- `src/backends/*` should consume only IR and backend-local options.
- `src/node` remains the runtime adapter for file writing.

## Proposed Internal Stages

### Stage 1: Authoring Node Validation

Input: `JsxNode`

Output: validated `AuthorNode` tree shape, with invalid child relationships rejected.

Current owner: `src/jsx.ts` plus checks inside `src/compiler.ts`.

Target owner: keep runtime guards in `src/jsx.ts`; keep compiler traversal errors in a small
compiler validation helper.

### Stage 2: Prop Normalization

Input: public props from `Slide`, `View`, `Text`, `Image`, and `Shape`.

Output: canonical normalized prop objects.

Current owner: `normalizeViewProps`, `normalizeTextProps`, `normalizeImageProps`,
`normalizeShapeProps`, and `normalizeSlideProps` inside `src/compiler.ts`.

Target owner: `src/compiler/normalization.ts` or `src/normalization/*`.

This stage should absorb:

- top-level prop plus `style` merging
- CSS alias precedence
- shorthand expansion for values already parsed by `src/style` and `src/layout`
- canonical layout hints such as `display -> layout` and `flexDirection -> direction`

### Stage 3: Resolved Layout Tree

Input: normalized content nodes and parent frames.

Output: resolved node placements and inherited layout context.

Current owner: layout helpers in `src/layout/*` plus orchestration in `src/compiler.ts`.

Target owner: keep mathematical solvers in `src/layout/*`; move child metric adapters and layout
dispatch out of the main compiler file.

The key design change is to normalize each child once before layout, then pass a resolved child
adapter into stack and grid. Today, helper functions such as `getChildSizeProp`, `getChildMargin`,
and `getChildAlignSelf` repeatedly re-normalize the same node.

### Stage 4: IR Construction

Input: resolved node placement, normalized props, and child IR.

Output: `SlideIR` and `NodeIR`.

Current owner: `compileGroupNode`, `compileTextNode`, `compileImageNode`, `compileShapeNode`, and
`compileSlide` inside `src/compiler.ts`.

Target owner: `src/compiler/ir-builders.ts` or per-node files such as
`src/compiler/build-text.ts`.

This stage should own:

- background layer resolution into IR fields
- stroke, outline, shadow, hyperlink, and text style IR construction
- visibility/display behavior that affects emitted IR
- recursive group construction

### Stage 5: Backend Emission

Input: `PresentationIR`

Output: `BackendArtifact`

Current owner: `src/backends/pptxgenjs.ts` and `src/backends/pptxgenjs-xml-patches.ts`.

Target owner: same files, with shared backend-local helpers for duplicated conversions.

This is already reasonably isolated. The main improvement is to prevent conversion helpers such as
opacity and unit conversion from drifting between direct PptxGenJS emission and XML patch planning.

## Refactor Phases

### Phase 1: Extract Normalization

Move normalized prop types and normalization functions out of `src/compiler.ts`.

Scope:

- `NormalizedSlideProps`
- `NormalizedViewProps`
- `NormalizedTextProps`
- `NormalizedImageProps`
- `NormalizedShapeProps`
- style merging helpers
- `resolveLayout`
- `resolveGap`
- `resolveFlexDirection`
- `parsePlaceSelf`, `parsePlaceItems`, and `parsePlaceContent` if they are only normalization concerns

Exit criteria:

- `src/compiler.ts` imports normalized props from the new module.
- Runtime output is unchanged.
- Existing tests pass.

### Phase 2: Add Resolved Child Adapters

Create an internal resolved child representation so layout code no longer repeatedly normalizes
author nodes.

Example shape:

```ts
type NormalizedContentNode =
  | { kind: "view"; source: AuthorNode<"view">; props: NormalizedViewProps }
  | { kind: "text"; source: AuthorNode<"text">; props: NormalizedTextProps }
  | { kind: "image"; source: AuthorNode<"image">; props: NormalizedImageProps }
  | { kind: "shape"; source: AuthorNode<"shape">; props: NormalizedShapeProps };
```

Scope:

- replace `getChildSizeProp`, `getChildPosition`, `getChildDisplay`, `getChildOrder`,
  `getChildGridItemAuthoring`, `getChildAlignSelf`, and related helpers with adapter reads
- keep stack/grid math behavior unchanged
- keep public `AuthorNode` untouched

Exit criteria:

- layout helpers consume normalized children.
- compiler traversal normalizes each content node at most once per pass.
- layout tests pass.

### Phase 3: Extract Layout Dispatch

Move `compileChildren`, `compileGridChildren`, and stack orchestration out of the main compiler file.

Scope:

- keep low-level math in `src/layout/grid.ts`, `src/layout/stack.ts`, and `src/layout/absolute.ts`
- create a higher-level layout resolver module that returns placements or positioned child entries
- keep recursive IR building in compiler/IR builder code

Exit criteria:

- `src/compiler.ts` no longer contains full stack/grid orchestration.
- layout module exports reflect layout concepts rather than compiler tree traversal.
- no new dependency from `src/layout` to `src/ir`.

### Phase 4: Extract IR Builders

Move node-specific IR construction into dedicated builder functions.

Scope:

- group builder
- text builder
- image builder
- shape builder
- slide builder
- shared helpers for background boxes, outlines, hyperlinks, and paint sorting

Exit criteria:

- `src/compiler.ts` reads like pipeline orchestration.
- node-specific style-to-IR logic is easy to locate.
- IR shape remains unchanged unless tests are intentionally updated.

### Phase 5: Backend Helper Consolidation

Deduplicate backend-local conversions that exist in both PptxGenJS emission and XML patch planning.

Scope:

- `emuToInches`
- `pointsToEmu`
- `combineTransparency`
- `combineOpacities`
- shape/fill-related backend-local helpers where duplication is clear

Exit criteria:

- shared helpers live under `src/backends/pptxgenjs-*` or a backend-local utility file.
- compiler and IR modules do not import backend helper files.
- backend tests continue to pass.

### Phase 6: Public Boundary Polish

After the structural split, make the codebase easier to understand without reading docs.

Scope:

- update `package.json` starter metadata
- consider splitting `src/authoring/index.ts` into public value types, component props, and runtime options
- keep `src/index.ts` export behavior stable
- add a short architecture note to `README.md` if desired

Exit criteria:

- docs are no longer required to identify the package purpose and module ownership.
- public exports remain compatible or changes are explicitly documented.

## Suggested File Ownership After Refactor

- `src/compiler.ts`: top-level `renderPresentation` orchestration only.
- `src/compiler/ids.ts`: slide and node id generation.
- `src/compiler/normalization.ts`: public props to normalized props.
- `src/compiler/content-node.ts`: normalized child representation and adapters.
- `src/compiler/layout.ts`: layout dispatch over normalized children.
- `src/compiler/ir-builders.ts`: normalized node to IR conversion.
- `src/layout/*`: frame and layout math.
- `src/style/*`: CSS-like parsing and lower-level value normalization.
- `src/backends/pptxgenjs.ts`: direct PptxGenJS mapping.
- `src/backends/pptxgenjs-xml-patches.ts`: XML patch planning and application.
- `src/backends/pptxgenjs-utils.ts`: backend-local unit/opacity helpers if needed.

The exact filenames can change. The important rule is that files should be named after the
semantic node they own, not after the convenience of where the code used to live.

## Dependency Rules

- `src/compiler/*` may depend on `src/authoring`, `src/jsx`, `src/style`, `src/layout`, and `src/ir`.
- `src/layout/*` should not depend on `src/ir` or concrete backends.
- `src/style/*` should not depend on concrete backends.
- `src/backends/*` should not depend on `src/authoring` or `src/jsx`.
- `src/node` may depend on backend registry and IR output, but compiler core must not depend on `src/node`.
- `src/types.ts` remains a compatibility export surface; new internal imports should prefer owning modules.

## Review Checklist For Each Phase

- Does the moved file own a real semantic boundary, or is it only a forwarding wrapper?
- Did dependency direction remain acyclic?
- Did the phase avoid changing behavior unless explicitly stated?
- Are tests still covering the same user-visible behavior?
- Did the public API remain stable?
- Did the change reduce repeated normalization or repeated backend conversion?

## Validation

For every phase:

```bash
vp check
vp test
```

For phases touching backend emission:

```bash
vp run build
```

If a phase changes exported declarations or package metadata, also check generated package output.

## Recommended First PR

Start with Phase 1 only.

Reasoning:

- it directly implements the compiler spec's separation rule
- it is behavior-preserving
- it reduces the size and import surface of `src/compiler.ts`
- it creates a natural home for the more exact normalized prop types described in
  `type-strengthening-plan.md`

Suggested PR title:

```text
Extract compiler prop normalization
```

Suggested PR scope:

- add the new normalization module
- move normalized prop aliases and normalizer functions
- update compiler imports
- keep snapshots and runtime output unchanged

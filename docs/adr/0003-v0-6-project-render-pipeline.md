# v0.6 project/render pipeline

## Status

Accepted

## Context

deckjsx needs an output pipeline that can turn the Semantic Author Graph into output-specific
documents without making the graph specific to PPTX, PDF, or any writer library.

The previous output path was intentionally separated into the Legacy Interface, but that path is too
renderer-shaped to become the next model:

- `PresentationIR` is closer to a simplified renderer command shape than an HMR-friendly projected
  document model.
- `Deck.render()` returned legacy IR, which overloaded "render" with authoring-to-output behavior.
- `Deck.output()` skipped the explicit projection stage and kept the writer path coupled to
  pptxgenjs.
- Passing `deck.project(graph)` would create two sources of truth: Deck configuration and an
  arbitrary graph argument.

The v0.6 model should support future sandbox inspection and HMR. That means the main projected model
must be structured around output package parts and their origins, not a slide-content tree that must
be converted again later.

## Decision

v0.6 will introduce a result-first staged pipeline:

- `compile()` returns a `CompileResult`, not a raw `SemanticAuthorGraph`.
- `project()` returns a `ProjectResult`, not a raw projection.
- `render()` returns a `RenderResult`, not `void` or a raw artifact.
- Stage options may change collected detail or processing policy, but they must not change the
  top-level result shape.
- Stage results expose a Result-like `ok` flag derived from error diagnostics. Warnings do not make
  `ok` false.
- Stage results expose diagnostics both as a flat list and as stage-grouped summaries. Stage
  summaries also indicate whether the stage artifact is available, partial, or missing.

`CompileResult`, `ProjectResult`, `RenderResult`, `RenderedArtifact`, and `OutputFormat` belong to
the Authoring Interface because they are public stage contracts. Detailed graph and projected model
types belong to the Inspection Interface.

v0.6 will add Project and Render as the public output stages:

- Project turns the Semantic Author Graph into a Projected Document Model.
- Render turns the current Projected Document Model into an artifact or file through a Writer
  Adapter.
- Project and Render may materialize unresolved earlier stages, but their results must preserve
  prior-stage diagnostics and summaries so callers can see where failures came from.
- `build()` and `output()` are not the primary v0.6 API.
- The old `deckjsx/legacy` surface can be removed once Project, Render, the Pptx Package Model, and
  the Adapter Interface exist.

Deck owns authoring inputs, pipeline configuration, and explicitly defined Pipeline Artifacts.
Advanced users and sandboxes can provide artifacts with:

- `defineGraph(graph)`
- `defineProjection(projection)`

These define operations are whole-artifact public APIs in v0.6. They mark the pipeline as resolved
up to that stage and clear incompatible artifacts so later stages have a single declared source of
truth. Stage operations such as compile, project, and render resolve pending work rather than
blindly replacing all pipeline state.

`project(graph)` and `render(projection, ...)` are avoided because they introduce a second source of
truth beside Deck. Edited graphs and projections should be supplied through define operations before
the next stage runs.

The first PPTX Projected Document Model is the Pptx Package Model:

- It is a structured package-part graph, not raw XML bytes.
- It is keyed primarily by Package Part Identity, not package path.
- Package parts retain origin and dependency links back to Graph Identity and Source Origin where
  relevant.
- Projection should materialize the smallest useful complete package skeleton before Render. Required
  manifest parts, support parts, authored-content parts, and relationships should be visible to
  diagnostics, sandbox tooling, and future HMR.
- Image elements should receive projected media relationships during Project, and the corresponding
  slide relationship parts should point at media parts before any Writer Adapter runs.
- Package manifest data, including content type entries, root relationships, and presentation
  relationships, should be projected as structured package-part payloads rather than path-only
  placeholders.
- It distinguishes manifest parts, support parts, and authored-content parts.
- Support parts may carry thin placeholder payloads in v0.6 when deckjsx has not yet modeled the
  corresponding OOXML domain, but they should still expose structured payload status rather than
  path-only package entries.
- Slide payloads may be close to OOXML/XML structure, but they remain structured data with
  deckjsx-readable element kinds and provenance rather than raw XML bytes.
- Projected PPTX elements have Pptx Element Identity distinct from Graph Identity and OOXML object
  identifiers.
- PPTX/OOXML serialized identities such as relationship ids and shape object ids are assigned
  deterministically during Project so sandbox inspection and future HMR do not depend on writer-local
  counters.
- Projected elements carry writer-needed concrete values and provenance links to graph nodes,
  styles, assets, and source origins where relevant.
- Projected elements may carry project-time layout and measurement results, such as resolved frames,
  text fitting, overflow, and constraints. Values only known after a specific writer runs remain
  Render concerns.
- It should be the main model future HMR inspects to decide which output parts changed.

`ProjectResult` may contain a partial Projected Document Model when projection produced error
diagnostics. This is an inspection feature: sandbox tooling can show what was computed and where the
projection failed. `render()` must not write or return a rendered artifact when the relevant Project
Result contains error diagnostics. Warnings remain non-blocking.

`ProjectResult` should expose both the detailed Projected Document Model and a derived inspection
summary. The summary is not a second source of truth; it is a lighter view over the projection. It
contains a shared cross-format portion plus format-specific details, so tooling can share basic UI
while still showing PPTX package parts, relationships, slides, media, element origins, basic
resolved values, diagnostics, and known default-adapter limitations as PPTX concepts.

Render accepts either a default render options object or an explicit Writer Adapter:

```ts
await deck.render({ output: "deck.pptx" });
await deck.render(pptxgenjs({ output: "deck.pptx" }));
```

Writer Adapters declare the Projection Format they consume and the Output Format they return. An
explicit adapter can override the Deck default Output Format, but render should report that mismatch
as a warning. In v0.6, the default Writer Adapter may be pptxgenjs, but the Pptx Package Model must
not be shaped around pptxgenjs convenience.

In v0.6, Project has a narrower Projection Format vocabulary than Rendered Artifact formats. PPTX is
the implemented Projection Format; custom Writer Adapters may still return other artifact formats
while the matching Projected Document Model is deferred.

Render supports either default-adapter options or a fully configured Writer Adapter value. It does
not support a separate adapter-plus-options overload. Adapter-specific options belong to the adapter
factory.

`RenderResult` returns a `RenderedArtifact` when bytes were produced. A rendered artifact includes:

- `format`
- `mediaType`
- `extension`
- `bytes` as a runtime-neutral `Uint8Array`

When an output path is supplied, file writing is an additional side effect. In v0.6, the output
option is a string path only. If artifact generation succeeds but file writing fails, Render returns
the artifact bytes and reports the write failure in diagnostics. Written output information appears
only when the side effect succeeds.

Temporary Writer Adapters report their limitations as diagnostics instead of pulling the Projected
Document Model toward their capabilities. Unsupported-but-nonbreaking gaps are warnings. Model
inconsistencies or adapter gaps that would produce a broken artifact are render-blocking errors.

The direct OOXML writer is a later-version concern. v0.6 establishes Project, Render, the Pptx
Package Model, and the temporary pptxgenjs Writer Adapter without including direct OOXML
serialization in the milestone.

The adapter public surface is `deckjsx/adapter`, for example:

```ts
import { pptxgenjs } from "deckjsx/adapter";
```

Detailed Pptx Package Model and inspection summary types are exported from `deckjsx/inspect` as
read-only data model types. Mutation helpers and builders are deferred until sandbox and HMR
workflows prove the required operations.

Deck remains the public owner of authoring inputs and explicit Pipeline Artifacts, but stage
execution policy belongs to an internal Pipeline Runner module. Pipeline stages materialize source,
graph, projection, and package-part indexes into the Pipeline Artifact Collection so future HMR and
sandbox tooling can reason about source and package-part invalidation before Render. Default writer
lookup and known default-adapter limitations belong to an internal Adapter Registry rather than the
public Adapter Interface.

v0.6 establishes keyed snapshots and stage invalidation vocabulary, but it does not implement a
fully incremental HMR engine. Authoring mutations may still rematerialize whole source, graph, or
projection snapshots. The important contract for this milestone is that the snapshots are
source/package-part keyed, have provenance and dependency indexes, and are not hidden writer caches.
Source-entry dirty tracking and package-part incremental projection are future HMR work.

## Consequences

- The v0.6 API is breaking: compile no longer returns a raw graph, old render/output behavior is
  replaced, and the Legacy Interface can be removed.
- Tooling and sandboxes can inspect the same result shapes as ordinary callers.
- Tooling can inspect partial Projected Document Models and stage-grouped diagnostics without using
  Render as the inspection API.
- The Pptx Package Model can evolve toward direct OOXML output and HMR without being constrained by
  pptxgenjs.
- The first pptxgenjs Writer Adapter may be slower and more complex because it must adapt to the
  Pptx Package Model rather than defining it.
- Public partial artifact definition is deferred; v0.6 define operations accept whole graph or whole
  projection values, while internal pipeline state can still be collection-aware.
- Full source-entry incremental invalidation is deferred; v0.6 uses stage-scoped invalidation and
  keyed snapshots as the foundation for later HMR.
- Direct OOXML serialization, deeper image processing, and richer sandbox UI are intentionally
  deferred so v0.6 can stabilize the pipeline boundary first.

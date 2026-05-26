# deckjsx

deckjsx is a JSX authoring system for presentations. Its language centers on author intent first, then projects that intent into concrete presentation outputs such as PPTX.

## Language

**Semantic Author Graph**:
The canonical output-agnostic internal model raised from the Author Tree after resolving semantic relationships. It is the model that downstream output projections should consume instead of reading the Author Tree directly.
_Avoid_: treating Presentation IR as the main product model

**Author Tree**:
The structural tree produced from JSX authoring. It preserves JSX parent-child shape and primitive text leaves before semantic resolution, and is the source for detecting authoring changes, but it is not the model that backends should consume directly.
Composition-specific source metadata should not be mutated into Author Tree nodes; source origin is resolved by composition and graph-building context.
_Avoid_: backend input model

**Authoring Interface**:
The user-facing vocabulary for writing decks with deckjsx, including Deck, JSX authoring elements, Theme, StyleSheet, diagnostics that authors handle, and the type helpers needed to author slides. It should not make graph internals, legacy output projections, or concrete output adapters look like ordinary authoring concepts.
It is not a public surface for directly constructing or inspecting Author Tree nodes.
_Avoid_: root export as every public type, graph inspection surface, legacy output surface

**Slide Declaration**:
The author-facing page boundary created by a Deck when an author declares one slide and supplies its content factory. Slide identity, slide-level metadata, and active Slide Template selection belong to the Slide Declaration rather than to a public JSX `Slide` root element.
_Avoid_: Deck.add, public Slide component, slide root wrapper

**Authored Tag**:
The original JSX tag preserved in the Author Tree, such as `h1`, `p`, `section`, or `figure`. It is the input for semantic interpretation and should not be erased by early aliasing.
_Avoid_: sourceTag as incidental metadata

**Semantic Role**:
The meaning raised from an Authored Tag into the Semantic Author Graph, such as heading, paragraph, figure, or sectioning content. Output projections may use or ignore roles depending on the format, but the graph should preserve them.
_Avoid_: style default only

**Style Entity**:
A graph entity that represents authored style inputs and style references separately from renderable node hierarchy. Renderable semantic nodes reference Style Entities instead of treating styles as child nodes. Fully resolved concrete style values belong to a Resolved Style Inspection View rather than becoming the main meaning of the Style Entity.
Style Entity should not carry its own resolved concrete style payload.
A node may reference a Style Entity even when its only style-related input is a Style Class Reference.
_Avoid_: style child node

**Style Class**:
An author-defined reusable style name that participates in deckjsx's CSS-like cascade. A Style Class is referenced from JSX `className`, usually defined inside a registered StyleSheet, and should behave like a CSS class selector rather than like an output-format style id.
Style Classes are authoring semantics and should not be confused with PPTX style identifiers or package-specific class concepts.
Style Class names are authored class tokens. When a Style Class name contains characters that are not directly writable in CSS selector class syntax, Stylesheet Targets should refer to it with CSS escaping rather than changing the Style Class name.
_Avoid_: PPTX style id, output-format class

**Style Class Reference**:
An unresolved reference from a Style Entity to an authored Style Class. It records the requested class name and normalized token position for provenance without containing the resolved style values for that class.
Style Class References are produced from clsx-like `className` authoring values by dropping falsey and empty entries, expanding arrays and boolean object maps, splitting whitespace in strings, and preserving the resulting authored token order for inspection. That order is provenance, not cascade precedence; resolved style precedence should follow CSS-like specificity and stylesheet source order.
Any style-capable authoring node may carry Style Class References; fragments and primitive text leaves do not.
`className` is not a direct style prop; once normalized, it should appear as Style Class References rather than inside authored direct props.
_Avoid_: resolved class style, merge-order precedence

**StyleSheet**:
An author-defined collection of reusable style classes registered on a Deck instance, created with `new StyleSheet(...)` or `theme.defineStyles(...)` and attached with `deck.useStyles()`. StyleSheets are source-local authored resources; parent Deck stylesheets do not implicitly flow into mounted child Decks.
StyleSheet class entries are CSS-like stylesheet rules. A class dictionary entry behaves like a `.className` rule, and selector targets extend the same stylesheet model rather than introducing a separate non-CSS rule system.
_Avoid_: DeckOptions.styles as primary API, global style registry, output stylesheet

**Stylesheet Target**:
A CSS selector string attached to a StyleSheet class definition to constrain where that Style Class applies, such as `p.title`, `div.card`, `header.title`, or descendant selectors like `.card .caption`.
Public Stylesheet Targets should be authored-tag and class selector language, not deckjsx-specific semantic target strings such as `"text"` or `"view"`. A Stylesheet Target belongs to its Style Class, so it must include the selector for that Style Class rather than relying on implicit class injection.
_Avoid_: public semantic target, PPTX target

**Theme**:
A reusable design vocabulary for a deck, including named design values and semantic defaults. Theme values inform style resolution before output projection and should not make the Semantic Author Graph specific to PPTX, PDF, or any other output format.
Theme belongs to Deck-level configuration rather than to individual Style Entities as authored payload.
When Decks are mounted, a child Deck's Theme deep-merges over the active parent Theme so the child can override selected design values while inheriting the rest.
Author-configurable defaults belong to Theme, not to a separate public Deck-level defaults concept.
Public Theme defaults should be expressed in authoring-language terms rather than exposing graph-only semantic kinds or roles.
Theme authoring should preserve TypeScript access to theme values instead of relying on string token paths.
Styles authored from Theme values should receive concrete style values directly; deckjsx should not implement string token path resolution or token provenance for every class or inline style property.
Theme composition should not retroactively affect already-authored concrete StyleSheets; active Theme composition applies to Theme Defaults unless an author explicitly creates a merged Theme with `theme.extend(childTheme)` before deriving styles from it.
_Avoid_: output template, PowerPoint theme XML, string token reference

**Theme Snapshot**:
The immutable-ish authored Theme value visible to Deck composition and style resolution. A Theme Snapshot owns typed value access, Theme Default diagnostics, and Theme composition policy, while exposing only a fixed snapshot to downstream modules.
Theme Snapshot internals may clone, validate, or merge values, but callers should not observe mutable Theme state.
Internal helper types for representing Theme implementation state should not become ordinary authoring vocabulary.
_Avoid_: live theme object, token resolver, theme provenance graph

**Theme Default**:
A Theme-provided style baseline that applies to authored elements before StyleSheet classes and inline styles. Theme Defaults are active only when a Theme is attached to a Deck, and they are distinct from StyleSheet rules because they express the deck's design vocabulary rather than selector-authored local overrides.
Theme Defaults should use authored tag vocabulary and should not expose graph-only semantic kinds, roles, or component names.
_Avoid_: DeckOptions.defaults, global style rule, semantic kind default, component default

**Slide Template**:
A Deck-owned named slide structure that defines reusable Template Areas for placing authored slide content. Slide Templates belong to a Deck's page-structure vocabulary and may coexist with Theme-driven visual vocabulary without being stored inside Theme.
Slide Template references should be type-guided by the active Deck template set when possible; authoring a template reference without a matching Deck template set is a type-level mismatch rather than an ordinary unresolved reference.
_Avoid_: Theme.templates, layout utility, PowerPoint slide master

**Template Area**:
A named frame inside a Slide Template that describes where authored content belongs on a slide. Template Areas are referenced by authored content before layout/projection resolves concrete output coordinates.
_Avoid_: CSS grid area, arbitrary coordinate alias, output placeholder

**Template Area Reference**:
An authored relationship object from content to a Template Area in the active Slide Template. Authors should obtain Template Area References from the slide factory's typed template handle rather than spelling area names as strings.
It should preserve author intent for inspection and diagnostics instead of becoming only resolved coordinates.
_Avoid_: string area name, direct x/y replacement, style property, output placeholder id

**Resolved Style Inspection View**:
An inspectable view of style values after deckjsx has applied CSS-like style resolution rules such as element defaults, Theme defaults, registered StyleSheet rules, and inline style. It exists to show what output projections will consume without turning the Semantic Author Graph itself into a PPTX- or PDF-specific model. It may expose theme application trace, stylesheet source order, specificity, and property-level winner provenance, but Theme itself remains Deck-level configuration.
_Avoid_: output style model, PPTX shape properties

**Inspection Interface**:
The explicit public surface for inspecting compiled deck meaning, including the Semantic Author Graph and inspection-only views such as resolved styles. It is separate from the Authoring Interface so graph internals and debug-oriented payloads do not look like everyday authoring vocabulary.
The public result contract for inspect-mode compile may be reachable from the Authoring Interface, but detailed graph and resolved-style vocabulary belongs to the Inspection Interface.
In v0.6, detailed Projected Document Model types such as the Pptx Package Model also belong to the Inspection Interface, while stage Result types remain available from the Authoring Interface.
Detailed inspection exports may include Pptx Package Model, package parts, PPTX element identities, and project inspection summaries, while root authoring exports should keep only the stage result types and common authoring vocabulary.
In v0.6, Inspection Interface exports for projected models should be read-only data model types rather than mutation helpers or builder APIs. Editing helpers can wait until sandbox and HMR workflows prove the needed operations.
_Avoid_: root authoring export, output projection surface, legacy output surface

**Asset Entity**:
A graph entity that represents reusable media or external content such as an image source. Renderable nodes reference Asset Entities instead of embedding output-specific media paths.
In v0.6, projection should preserve enough asset identity and media-part references for HMR and inspection, but deep image processing, conversion, compression, and deduplication belong to the direct OOXML writer phase rather than the Pptx Package Model's core responsibilities.
_Avoid_: PPTX media path

**Presentation IR**:
A legacy backend-independent projection used by the current rendering path. It is not the canonical model of author intent and should not be assumed as a required step for future OOXML output.
_Avoid_: canonical IR, semantic model, required backend boundary

**Legacy Interface**:
The temporary explicit public surface for the current legacy rendering path and Presentation IR related adapters. It exists to quarantine older output machinery while testing how cleanly it can be separated from the Authoring Interface and Inspection Interface. It is not a long-term compatibility commitment; once v0.6 introduces Project, Render, the Pptx Package Model, and the Adapter Interface, the Legacy Interface should be removed rather than preserved beside the new pipeline.
_Avoid_: Authoring Interface, canonical graph model, future output projection surface, compatibility guarantee

**Adapter Interface**:
The explicit public surface for Writer Adapters used by Render, such as a pptxgenjs adapter. It is separate from the Authoring Interface so render-time adapter selection does not become ordinary deck authoring vocabulary.
_Avoid_: root authoring export, backend registry, legacy output surface

**Pptx Package Model**:
The PPTX-specific Projected Document Model produced from the Semantic Author Graph. It is a structured package-part graph shaped around OOXML package structure: presentation parts, slide parts, relationship parts, media parts, theme/layout parts, content types, package paths, and PowerPoint identifiers. Package parts should preserve structured data that can be turned into XML or writer calls rather than becoming raw XML bytes too early. It should be friendly to future incremental rebuilds by making changed package parts and their graph/source origins explicit, and it is the primary model future HMR should inspect when deciding what output parts changed.
Its primary key space is Package Part Identity rather than Graph Identity, while each package part should retain origin and dependency links back to Graph Identity and Source Origin where relevant.
Its shape should be derived from PPTX/OOXML package structure itself rather than from the legacy Presentation IR or the needs of a specific writer adapter such as pptxgenjs.
Projecting to the Pptx Package Model should materialize a complete package skeleton rather than leaving required package structure to Writer Adapters. In v0.6, this may be the smallest useful skeleton, but manifest parts, required support parts, authored-content parts, and their relationships should be visible to sandbox, diagnostics, and future HMR before Render runs.
Image-bearing slide elements should be connected to media parts through projected slide relationships during Project, not left for a Writer Adapter to invent invisibly during Render.
It should distinguish manifest parts, support parts, and authored-content parts. Manifest parts include content types and relationship manifests. Support parts include document properties, presentation properties, view properties, themes, slide masters, slide layouts, notes masters, and notes slides. Authored-content parts include slides, slide relationships, and media. Support parts may be user- or sandbox-editable even when deckjsx has no first-class authoring syntax for them yet. Authored-content changes should not force unrelated manifest or support parts to be treated as changed unless their manifests or dependencies actually change.
In v0.6, support parts may use thin placeholder payloads when deckjsx has not yet modeled the corresponding OOXML domain. They should still carry structured payload status and editable intent rather than being path-only package entries.
Relationship parts should generally follow the category of the part they describe: root and presentation relationships are manifest parts, slide relationships are authored-content parts, and layout/master/notes relationships are support parts.
Slide part payloads may be close to the final OOXML/XML structure because the pipeline intentionally moves from HTML-like JSX, through the Semantic Author Graph, toward output-specific package structure. The model should still preserve structured projected data and provenance instead of becoming raw XML bytes too early.
PPTX slide payloads may use OOXML-like structure and names internally, but public inspection should also expose deckjsx-readable element kinds, such as shape, text body, run, text, picture, and group. Similar projected element vocabulary may be reused by other output models such as PDF, while each Projected Document Model still owns its format-specific interpretation.
Projected PPTX elements should carry the concrete values needed by Writer Adapters, such as frame, fill, stroke, text, and picture information, while retaining provenance links to graph nodes, style entities, resolved styles, assets, and source origins where relevant.
The Pptx Package Model should also carry project-time layout and measurement results that sandbox and inspection tools need to understand output, such as resolved frames, text fitting, overflow, and constraint results. These are distinct from final serialized values that only Render or a specific Writer Adapter can know.
_Avoid_: semantic graph, generic presentation model, slide content tree as the primary model, raw XML bytes as the primary model, Presentation IR

**Package Manifest Projection**:
The PPTX projection sub-module that constructs package-level manifest data for the Pptx Package Model, including content type entries, root relationships, presentation relationships, slide relationships, and media relationship references. It exists so sandbox and future HMR tools can inspect package dependencies before Render.
Package Manifest Projection should own deterministic package relationship records, while Writer Adapters consume or report limitations against those records.
_Avoid_: writer-invented package manifests, path-only support parts

**Package Part Identity**:
Stable identity for a part in a Projected Document Model, especially a PPTX package part. It is distinct from the package path because paths can change due to slide ordering, media placement, or writer layout decisions while the conceptual output part remains the same.
_Avoid_: package path, relationship id, graph id

**Pptx Element Identity**:
Stable identity for a projected element inside a Pptx Package Model slide part. It is distinct from Graph Identity and from OOXML object identifiers because the same authored graph node may project into output-specific elements, while OOXML shape ids and relationship ids may be assigned later by writer or serialization concerns.
Pptx elements should retain origin links to graph nodes and package parts where relevant, but their own identity belongs to the Projected Document Model.
_Avoid_: graph node id, OOXML shape id, relationship id

**Pptx Serialized Identity**:
Deterministic PPTX/OOXML-facing identifiers assigned during Project, such as relationship ids and shape object ids. They are separate from Pptx Element Identity, but should be stable enough for sandbox inspection, diffing, and future HMR. Writer Adapters should use projected serialized identities when available and report diagnostics when they must diverge.
_Avoid_: projected element identity, graph identity, writer-local counter only

**Projected Document Model**:
The output-facing document model produced from the Semantic Author Graph before bytes, files, ZIP entries, or renderer-specific calls are written. It is more concrete than the Semantic Author Graph because it chooses an output surface, but it is still a structured model rather than a serialized artifact. Each output format should have its own Projected Document Model, such as the Pptx Package Model for PPTX.
Different output formats may use similar projected vocabulary, but deckjsx should not introduce a shared format-neutral Projected Element layer merely to reuse names. Each output format should project directly from the Semantic Author Graph into the structure it needs.
_Avoid_: Semantic Author Graph, writer bytes, legacy Presentation IR, renderer command stream

**Output Projection**:
The transformation from the Semantic Author Graph into an output-format-specific Projected Document Model. Each output format owns its own projection, such as the projection into the Pptx Package Model for PPTX.
_Avoid_: backend

**Output Writer**:
The output-format-specific writer that turns a Projected Document Model into bytes or files. It owns serialization and file/package writing concerns, not authoring semantics or graph interpretation.
_Avoid_: backend

**Writer Adapter**:
A concrete Output Writer implementation that may target a library, runtime, or direct file format writer. A Writer Adapter must adapt itself to the Projected Document Model rather than pulling the model toward the adapter's preferred input shape, even when that makes the adapter slower or more complex. Temporary writer adapters can be removed once a better direct writer exists.
A Writer Adapter declares both the Projection Format it consumes and the Output Format it returns, allowing render to choose or compute the correct Projected Document Model before invoking the adapter. Authors may pass explicit Writer Adapters such as a pptxgenjs adapter, while render may also provide a default adapter.
In v0.6, the default Writer Adapter may be the pptxgenjs adapter, but the Pptx Package Model should still be shaped for deckjsx's projection and HMR needs rather than for pptxgenjs convenience.
Calling Render without an explicit Writer Adapter should use the package default adapter for the Deck's selected Output Format, while explicit adapter selection should be imported from the Adapter Interface. This keeps ordinary rendering concise while preserving an extension point for temporary or future writers.
When a temporary Writer Adapter cannot faithfully express all projected package information, it should report that limitation as diagnostics instead of pulling the Projected Document Model toward the adapter. Unsupported-but-nonbreaking adapter gaps may be warnings, while model inconsistencies or adapter gaps that would produce a broken artifact should be render-blocking errors.
The direct OOXML writer is a later version concern. v0.6 establishes the Project/Render boundary, Pptx Package Model, and temporary pptxgenjs Writer Adapter without treating direct OOXML serialization as part of the same milestone.
_Avoid_: model-defining backend, renderer-shaped document model, long-term compatibility promise

**Project**:
The operation that turns the Semantic Author Graph into a Projected Document Model, such as the Pptx Package Model. Project is the primary API for inspecting output-facing computed state before any writer adapter runs, and it is the stage a sandbox should use to show computed projection results.
Project may use the default Output Format when no format is provided, and it may accept an explicit format when tooling or a sandbox wants a specific Projected Document Model without invoking a Writer Adapter.
Project may have a strict mode that returns the Projected Document Model or throws a Diagnostic Error, and an inspect mode that returns diagnostics and any projection artifacts that could be computed for sandbox/tooling inspection.
In v0.6, Project should be result-first: it returns a Project Result containing diagnostics, the selected Output Format, and any Projected Document Model that could be materialized.
_Avoid_: hidden build state, writer execution, legacy render

**Project Result**:
The result of Project, containing diagnostics, the selected Projection Format, and a Projected Document Model such as the Pptx Package Model when available. It is the main sandbox-facing result for inspecting output-facing computed state before Render.
Stage results should provide a Result-like `ok` flag derived from error diagnostics so callers can branch without manually scanning diagnostics. Warnings do not make `ok` false. Diagnostics remain the source of truth, and type narrowing should only promise values that the stage can guarantee.
Project may materialize earlier unresolved stages such as Compile when needed, and Project Result should make those prior-stage diagnostics or stage summaries visible so callers can tell whether a failure came from authoring compilation or output projection.
Stage results should expose diagnostics both as a flat list for simple consumers and as stage-grouped summaries for inspection tools. Individual diagnostics should carry enough stage information to remain meaningful when flattened. Stage summaries should also indicate artifact presence, such as whether graph, projection, or rendered artifact output is available, partial, or missing.
Project Result may contain a partial Projected Document Model when diagnostics prevented a complete projection. This allows sandbox and inspection tools to show what was computed, where projection failed, and which parts are affected instead of losing context to a thrown error.
Project Result should expose both the detailed Projected Document Model and a lighter inspection summary when available. The detailed model preserves output-facing structure, while the summary helps sandbox and debugging tools show package parts, slide elements, resolved values, origins, diagnostics, and adapter limitations without requiring users to read the full model. Inspection summaries should distinguish a shared cross-format portion from format-specific details, so sandbox tooling can share basic UI while still showing PPTX package parts, relationships, slides, and media as PPTX concepts rather than flattening them into a generic view. A summary is a derived inspection view of the projection rather than an independent Pipeline Artifact or second source of truth.
In v0.6, adapter limitations in the project summary describe known limitations of the default Writer Adapter for the selected Projection Format. Explicit Writer Adapter diagnostics remain part of Render Result diagnostics.
In v0.6, the summary only needs to be a thin inspection foundation, not a complete sandbox model. It should prioritize package parts, slides, projected elements, origins, basic resolved values, diagnostics, and adapter limitations.
Project options may change the selected format, collected detail, or processing policy, but they should not change the top-level Project Result shape.
_Avoid_: raw projection-only return, writer artifact, mode-dependent return shape

**Render**:
The operation that turns a Projected Document Model into an output artifact or file through a Writer Adapter. Render is downstream of Project and should not compile authoring inputs, read the Author Tree, or own semantic validation. In v0.6, render may use a pptxgenjs Writer Adapter even if that adapter is slower or more complex.
Render should return a Render Result containing diagnostics and the rendered artifact for tests, tooling, and sandbox inspection; when an output path is provided, writing the artifact to that path is an additional side effect.
Render can accept an explicit Writer Adapter or use the default adapter. When an adapter declares its required output format, render should ensure the matching Projected Document Model exists before invoking the adapter.
Render should support either default-adapter options or a fully configured Writer Adapter value, rather than accepting a separate adapter-plus-options overload. Adapter-specific options belong to the adapter factory so the Render API stays narrow.
When an explicit Writer Adapter requires a different format than the Deck default Output Format, render should use the adapter-required format and report a warning rather than silently using the Deck default.
Render should read the Deck's current Pipeline Artifact Collection rather than accepting an arbitrary projection value as a positional input; edited projections should be supplied with defineProjection before rendering.
Render should not write or return a rendered artifact when the Project Result contains error diagnostics. Partial projections remain available for inspection through Project, while Render treats warnings as non-blocking and errors as blocking.
_Avoid_: compile, project, authoring-to-output shortcut, semantic validation stage

**Render Result**:
The result of Render, containing diagnostics, the rendered artifact when available, and output information when the artifact was written. It is the final stage result for tooling and sandbox inspection.
Stage results should provide a Result-like `ok` flag derived from error diagnostics so callers can branch without manually scanning diagnostics. Warnings do not make `ok` false. Diagnostics remain the source of truth, and type narrowing should only promise values that the stage can guarantee.
Render may materialize earlier unresolved stages such as Compile and Project when needed, and Render Result should make those prior-stage diagnostics or stage summaries visible so callers can tell which stage blocked or warned.
Stage results should expose diagnostics both as a flat list for simple consumers and as stage-grouped summaries for inspection tools. Individual diagnostics should carry enough stage information to remain meaningful when flattened. Stage summaries should also indicate artifact presence, such as whether graph, projection, or rendered artifact output is available, partial, or missing.
Render Result is still returned when no output path is provided; in that case the rendered artifact should carry bytes as a runtime-neutral `Uint8Array` so tests, browser tooling, and sandbox flows can consume the result without writing a file. Providing an output path adds file writing as a side effect and records output information, but it does not replace the result-first return shape.
In v0.6, Render's file output option should be a string path only. Other destinations such as streams, browser blobs, or filesystem handles can consume Rendered Artifact bytes outside the core API.
When artifact generation succeeds but file writing fails, Render Result should retain the artifact bytes and report the write failure as diagnostics rather than discarding the rendered artifact. Written output information should only be present when the side effect succeeded.
Render options or Writer Adapters may change writer behavior or output detail, but they should not change the top-level Render Result shape.
_Avoid_: void file write, raw artifact-only return, semantic validation result

**Rendered Artifact**:
The bytes produced by Render together with enough metadata for tooling to consume them without external knowledge. A rendered artifact should include the Output Format, media type, file extension, and runtime-neutral bytes.
_Avoid_: raw byte array, writer-local return value, file-only output

**Compile**:
The operation that turns deck authoring into the Semantic Author Graph. It replaces the older idea of rendering as the primary inspection API.
Graph Composition is introduced through compile first. Legacy render and output paths should not receive separate composition support merely to preserve old output behavior.
New graph-only authored metadata, such as unresolved Style Class References, may be visible through compile before legacy output paths understand it.
In v0.6, Compile should be result-first: it returns a Compile Result containing diagnostics, graph artifacts that could be materialized, and the Semantic Author Graph when available, rather than changing return shape between strict and inspect modes.
_Avoid_: project, render

**Compile Result**:
The result of Compile, containing diagnostics and the Semantic Author Graph or graph Pipeline Artifacts that could be materialized. Callers should inspect diagnostics instead of relying on Compile to throw for ordinary authoring errors.
Stage results should provide a Result-like `ok` flag derived from error diagnostics so callers can branch without manually scanning diagnostics. Warnings do not make `ok` false. Diagnostics remain the source of truth, and type narrowing should only promise values that the stage can guarantee.
Compile Result should also expose stage-grouped summaries even when only the compile stage ran, keeping the result shape aligned with Project Result and Render Result. Stage summaries should indicate whether the graph artifacts are available, partial, or missing.
Compile options may change the amount of information collected or the processing policy, but they should not change the top-level Compile Result shape.
_Avoid_: raw graph-only return, hidden diagnostics, mode-dependent return shape

**Diagnostics**:
Warnings and errors produced while constructing or projecting the Semantic Author Graph. Diagnostics should explain problems with compiler-style detail, including codes, labels, notes, help text, author paths, and eventually file/line/column spans.
Composition problems that require resolving authoring sources, such as duplicate Source Keys within a parent source, should be reported during compile diagnostics. Misuse that TypeScript can prevent should still be constrained by types.
When composition diagnostics contain errors, inspect compile should return diagnostics without a Semantic Author Graph because the graph input sources were not resolved. Semantic graph diagnostics may still return a graph when the graph can be constructed with errors.
_Avoid_: string-only thrown errors

**Diagnostic Error**:
An `Error` subclass that carries structured Diagnostics for a specific failure category. Diagnostic Errors let callers branch on error classes while still receiving the full diagnostic report.
Composition failures and Semantic Graph construction failures should have separate Diagnostic Error subclasses.
In v0.6 result-first stage APIs should return ordinary authoring, projection, and render diagnostics in Compile Result, Project Result, or Render Result rather than throwing for expected diagnostics. Diagnostic Errors remain for API misuse, invalid adapters, unsupported stage configuration, internal invariants, or runtime failures that cannot be represented as a normal stage result.
_Avoid_: one generic Error class for all compile failures

**Deck**:
The owner of pipeline configuration and authoring inputs. It should orchestrate compilation, projection, and writing, but should not hide compiled or projected results as implicit mutable state.
Deck configuration may choose the default Output Format for projection, but writer adapter selection and file output options belong to Render rather than long-lived Deck configuration.
Deck may carry explicitly defined pipeline artifacts supplied by an authoring tool or advanced user, such as a compiled Semantic Author Graph or a Projected Document Model. These artifacts are authored pipeline state rather than hidden caches, and later stages may consume them instead of recomputing earlier stages.
A Deck with Source Context is still a source definition and may register slides or nested mounts before it is bound or composed.
In v0.3, child Decks may continue to carry the existing Deck configuration. Consolidating root-owned final build configuration is a later configuration-design concern.
_Avoid_: output state cache

**Pipeline Artifact**:
An explicit intermediate result in the authoring pipeline, such as a Semantic Author Graph or Projected Document Model, that can be inspected, edited, and supplied to later stages. Pipeline Artifacts are values with provenance and diagnostics expectations, not implicit mutable cache entries.
Defining a Pipeline Artifact on a Deck is trust-based: deckjsx should validate whether that artifact can be consumed by the next stage, but it should not require the artifact to be byte-for-byte or revision-token identical to the current JSX authoring inputs. Stronger source/revision consistency checks belong to future HMR-oriented work.
Pipeline Artifacts are collections keyed by source, graph identity, projection identity, or output package part rather than a single whole-deck slot. Pipeline stages materialize pending authoring inputs or prior-stage artifacts into the next artifact collection; this is a core part of the v0.6 model rather than merely a future optimization.
Different stages may use different key spaces: compile-oriented artifacts can be keyed by Source Identity or Graph Identity, while PPTX projection artifacts should be keyed by Package Part Identity with links back to graph and source origins.
Stage operations such as Compile, Project, and Render resolve pending work in their stage rather than replacing the whole pipeline state by default. A stage may preserve already-materialized artifacts and materialize only inputs or prior-stage artifacts that have not yet been processed. Explicit define operations are different: they redefine the relevant Pipeline Artifact Collection and clear incompatible downstream or parallel artifacts so the next stage has a single declared source of truth.
Defining a Pipeline Artifact marks work as resolved up to that artifact's stage. For example, defining a graph means the relevant authoring inputs are treated as compiled, while defining a projection means the relevant graph inputs are treated as projected. In v0.6, the minimum pending-work unit can be a source entry registered through add or mount.
Defining a projected artifact should perform only lightweight artifact-shape checks at the definition boundary, relying on typed model shapes and branded identities for ordinary correctness. Deeper package consistency checks, such as missing required parts, broken relationships, unsupported payloads, and render-blocking diagnostics, belong to Project or pre-Render validation.
_Avoid_: hidden build state, single cache slot, writer output, renderer command stream

**Pipeline Runner**:
The internal module that executes Compile, Project, and Render stage policy for a Deck or Bound Source. Deck owns authoring inputs, configuration, and Pipeline Artifact Collection, while Pipeline Runner owns stage materialization, default writer selection, stage diagnostics, render blocking, and file-write side effects.
_Avoid_: making Deck own every stage policy detail

**Adapter Registry**:
The internal module that maps Projection Format to the default Writer Adapter and known default-adapter limitations. The public Adapter Interface exposes author-facing adapter factories and types, while Adapter Registry owns runtime adapter detection and default policy.
_Avoid_: exposing default adapter policy as authoring vocabulary

**Build**:
An older proposed name for explicit pipeline orchestration. The preferred v0.6 vocabulary is Project for computing the Projected Document Model and Render for writer execution, rather than a Build API that hides the stage distinction.
_Avoid_: primary pipeline API, hidden project/render state

**Output Format**:
The configured target format for Project when no explicit format or Writer Adapter is provided, defaulting to PPTX. Output Format chooses the Projected Document Model family; it is distinct from the Writer Adapter used by Render.
An explicit Writer Adapter may override the Deck default Output Format for Render, but that mismatch should be visible as a diagnostic warning.
When a format has no Projected Document Model yet, it may exist only as a Rendered Artifact format for custom Writer Adapters. The narrower Projection Format names formats that Project can materialize in the current version.
_Avoid_: backend name, writer adapter option

**Graph Identity**:
Stable identity used inside the Semantic Author Graph for authoring concepts such as nodes, slides, and assets. It is derived from lightweight structural material such as Source Identity, semantic parent identity, Authored Tag or semantic kind, and key-or-index; content, style, layout, and output identifiers are payload changes, not identity material.
Source Identity must affect Graph Identity so equivalent nodes from different mounted sources do not collide. This may happen through the source root or semantic parent identity rather than repeating Source Identity in every node's raw identity material.
_Avoid_: PPTX object id, package path, relationship id, content hash, style hash

**Author Path**:
The structural location of a node or text leaf inside the Author Tree, used for traversal and diagnostics. It is not stable identity and should not be used as Graph Identity.
_Avoid_: graph id

**Source Span**:
Optional file, line, and column information associated with an Author Tree node or Diagnostic label. Source Span improves diagnostics when available, but Author Path remains required.
_Avoid_: required identity

**Graph Identity Hint**:
An author-provided hint, such as JSX `key`, that helps preserve Graph Identity across authoring changes. It is scoped by the surrounding authoring position rather than by an output format.
Graph Identity Hints are distinct from Source Keys. JSX `key` affects identity within an Author Tree sibling scope, while Source Key identifies a composition boundary.
_Avoid_: React render hint

**Source Identity**:
Stable identity for an authoring source such as a deck, slide module, route-like composition branch, or imported slide set. It helps preserve Graph Identity when multiple authoring sources are composed.
For mounted sources, Source Identity is path-like and derived from the parent Source Identity plus Source Key, such as `company-a/metrics`. It is distinct from Author Path.
The root source has internal Source Identity but should not be exposed as a user-facing path string.
_Avoid_: flattened factory index

**Source Origin**:
The source portion of a graph node's origin, identifying whether the node came from the root source or a mounted Source Identity. Source Origin belongs in Semantic Origin alongside Author Path and Source Span.
_Avoid_: output identity, author path

**Source Key**:
An author-provided key that identifies a meaningful composition section, such as a title section, company metrics section, peer comparison section, or industry trends section. It contributes to Source Identity but is separate from displayed section titles.
Root Deck slide factories do not receive a Source Key unless they are themselves mounted as a child source.
Within the same parent source, Source Keys must be unique. Reusing the same child Deck instance with different Source Keys is allowed.
Source Keys are accepted as strings at the API boundary, then validated during compile. Empty keys, whitespace-only keys, `.`, `..`, and keys containing `/` are invalid.
Changing a Source Key changes Source Identity and therefore Graph Identity for that source.
_Avoid_: mount path, displayed title

**Source Context**:
Typed inputs required by a child Deck when it is composed into another Deck. Source Context is a type-level authoring contract and should not include bindings, environment, or global configuration.
When a slide factory receives a field named `context`, that field means Source Context.
`void` is the type-level marker for a Deck that does not require Source Context.
Only `void` means no Source Context; other types, including `undefined` and empty object types, are Source Context types.
Providing Source Context or a Source Context Mapper to a Deck<void> child or to a Bound Source is invalid and should be prevented by types where practical.
Source Context values are authored payload and should not be used directly as Graph Identity material.
_Avoid_: props, defaults, global config, bindings, deckjsx-generated composition values

**Source Context Mapper**:
A mapping function registered on a mount that derives a child source's Source Context from the parent source's Source Context. It is authored composition logic, not global configuration or output projection logic.
It receives only the parent Source Context. When the parent source has no Source Context, the mapper receives no argument.
In v0.3, Source Context Mappers are synchronous. Asynchronous source resolution is a separate future concern.
Mapper failures should be reported as composition diagnostics rather than leaking raw thrown errors.
Mapper return values are not runtime type-checked as Source Context; TypeScript owns that contract. Structural failures such as thrown errors or Promise-like returns should still be diagnosed.
_Avoid_: defaults, bindings, output projection, composition context

**Source Slot**:
An explicit Source Context field whose value is JSX or an authoring node to be placed by the child Deck. Source Slots are allowed only when the child Deck declares them as part of its Source Context.
Source Slots do not require a special API in v0.3; they are Source Context values. JSX passed through a Source Slot should preserve the caller source as its origin even when placed by the child source.
Source Slot Graph Identity should account for both the caller slot origin and the child placement identity.
The Source Slot field name is authored meaning and should contribute to slot origin and identity material.
Source Slot values may be single nodes or arrays and should follow normal JSX child normalization.
_Avoid_: implicit composition children

**Root Deck**:
A Deck with no required Source Context that can be built or output directly. A Deck with Source Context must be composed or bound before it can act as a root.
Slide factories in a Root Deck should not receive a `context` field, because no Source Context exists.
Root-like operations such as compile and output should be type-constrained to Deck<void> or Bound Source.
_Avoid_: child deck with missing source context

**Bound Source**:
A source Deck whose Source Context has been supplied, allowing it to be built or output directly or mounted as a fully specified source.
Bound Source is a distinct concept from Deck, but it should expose the same root-like compile and output operations rather than a special authoring API.
A Bound Source may be mounted as a fully specified source. Supplying additional Source Context when mounting a Bound Source is invalid.
withSource exists to bind required Source Context and should not be exposed for Deck<void>.
Bound Source should not expose authoring registration APIs such as add or mount.
_Avoid_: global defaults

**Composition Context**:
Values supplied by composition when building a source, such as slide index, total slides, and source key. These values are contextual build inputs produced by deckjsx rather than authored source inputs.
In slide factory inputs, Composition Context should be exposed separately from Source Context, such as through a `composition` field.
The public `sourceKey` exists only for mounted sources; root-level slide factories should omit it. For nested sources, public `sourceKey` is the local key assigned by the immediate parent source.
Public Composition Context should not expose Source Identity. Source Identity remains available through graph origin and diagnostics.
`slideIndex` and `totalSlides` are local to the current source. Whole-deck numbering should use separate Composition Context fields such as `deckSlideIndex` and `deckTotalSlides`.
Slide factories should access these values through the `composition` field, not as top-level factory input fields.
Whole-deck numbering is computed after source composition is resolved. Source Context Mappers should not receive deckSlideIndex or deckTotalSlides.
_Avoid_: deck defaults, source context, `context`

**Graph Composition**:
The act of combining multiple authoring sources into one Semantic Author Graph while preserving Source Identity and Graph Identity. It is the internal meaning behind user-facing deck composition APIs.
When `add()` and `mount()` are both used on a Deck, their registration order determines slide order.
Graph Composition supports nested mounts. A child source may mount further child sources, and each level contributes to Source Identity.
A mount may provide child Source Context as either a concrete value or a Source Context Mapper. Mounting a child source with no Source Context does not require a context argument.
Graph Composition should detect source cycles and also guard against excessive composition depth.
The composition depth guard should remain an internal safety limit in v0.3 rather than a public configuration field.
Composition resolution should produce source-aware author roots for graph construction rather than making the graph builder read Deck instances directly.
Composition should be modeled as its own layer between Deck authoring registration and Semantic Author Graph construction.
Only composition types needed for authoring should be public. Composition resolver functions should remain internal.
_Avoid_: flattening slide factories

**Output Identity**:
Identity owned by an Output Projection or Output Writer, such as a PPTX relationship id, object id, or package path. It must not be reused as Semantic Author Graph identity.
_Avoid_: graph id

## Example Dialogue

Developer: Should rich text be modeled as PowerPoint text boxes first?

Domain expert: No. JSX is the source of truth. Build the Semantic Author Graph from the JSX structure, then project it into OOXML package structures as needed.

Developer: Can the OOXML backend walk the JSX tree and emit slide XML directly?

Domain expert: No. The JSX creates an Author Tree, the Author Tree is raised into the Semantic Author Graph, and backend projections read the graph so tree changes and semantic dependencies remain explicit.

Developer: Should primitive JSX text become a Text node immediately?

Domain expert: No. Primitive text remains an Author Tree leaf. The Semantic Author Graph decides whether it becomes an implicit text box, a text run, or an error based on its parent.

Developer: Can h1 and p both become generic Text nodes before graph construction?

Domain expert: No. Preserve the Authored Tag in the Author Tree, then raise it into a Semantic Role such as heading or paragraph.

Developer: Should styles and assets be children in the renderable graph tree?

Domain expert: No. Keep them as Style Entities and Asset Entities referenced by semantic nodes.

Developer: Should PDF output reuse the Pptx Package Model?

Domain expert: No. The Semantic Author Graph should stay independent from PPTX and PDF. Each output format gets its own projection from the graph.

Developer: Is the backend responsible for resolving classes and template areas?

Domain expert: Avoid saying backend here. Semantic resolution happens before Output Projection; the Output Writer only serializes the projected model.

Developer: Should I call render() to inspect what deckjsx understood?

Domain expert: Prefer compile() for authoring semantics and project() for output-facing computed state. Render is the writer-adapter stage and should not be the primary inspection API.

Developer: Should v0.3 make legacy render() and output() understand mounted sources?

Domain expert: No. v0.3 should focus composition on compile and the Semantic Author Graph. Adding separate composition behavior to legacy render/output would make the transition to build/project/write harder to keep clean.

Developer: Should legacy render() or output() ignore mounted sources until output pipeline support exists?

Domain expert: No. If a Deck contains mounted sources, legacy render() and output() should throw rather than silently omit composed content.

Developer: Should invalid authoring always fail while building the Author Tree?

Domain expert: No. Preserve JSX structure where possible, then report semantic warnings and errors as Diagnostics in the Compile Result during graph construction.

Developer: Should duplicate Source Keys throw immediately from mount()?

Domain expert: No. Type-level misuse should be prevented where practical, but composition problems that require resolving sources belong to compile diagnostics.

Developer: Should inspect compile return a partial graph when composition fails?

Domain expert: No. Composition errors mean graph input sources were not resolved. Compile Result should return diagnostics without a Semantic Author Graph.

Developer: Is one generic compile Error enough?

Domain expert: No. Throw specific Diagnostic Error subclasses so callers can branch by failure category, while the attached Diagnostics explain every problem in detail.

Developer: Can project() just use the last graph that compile() produced?

Domain expert: Project should use the Deck's explicit Pipeline Artifact Collection, not hidden output state or a positional graph argument. Use defineGraph() when a caller wants to supply an edited graph before project().

Developer: Can we use the graph node id as the PowerPoint shape id?

Domain expert: No. Graph Identity and Output Identity are separate. The graph tracks authoring stability; PPTX identifiers belong to the PPTX projection.

Developer: Can Author Path be the graph node id?

Domain expert: No. Author Path is a structural location for diagnostics and traversal. Graph Identity is the stable semantic identity used for diffing and HMR.

Developer: Should every graph node repeat Source Identity in its raw id material?

Domain expert: Not necessarily. Source Identity must affect Graph Identity, but it can flow through source root identity or semantic parent identity. Semantic Origin carries Source Origin for inspection.

Developer: Is JSX key only a React-style rendering optimization?

Domain expert: No. In deckjsx, key is a Graph Identity Hint used to keep semantic nodes stable as the Author Tree changes.

Developer: Can Source Key double as JSX key?

Domain expert: No. Source Key identifies composition boundaries. JSX key is a Graph Identity Hint inside an Author Tree sibling scope.

Developer: Should merging decks flatten all slide factories immediately?

Domain expert: No. Composition should preserve Source Identity so the Semantic Author Graph can explain where nodes came from and detect source-level changes.

Developer: Should the graph builder read Deck instances to resolve mounted sources?

Domain expert: No. Composition resolution should happen before graph construction and should pass source-aware author roots into the Semantic Author Graph builder.

Developer: Should Source Slot origin be written into the Author Tree node when it is passed through Source Context?

Domain expert: No. Author Tree nodes preserve JSX shape. Source Slot origin and placement should be resolved by composition and graph-building context.

Developer: Is Source Identity just the local sourceKey?

Domain expert: No. Mounted Source Identity is path-like: parent Source Identity plus Source Key. This allows nested sources such as `company-a/metrics` without colliding with `company-b/metrics`.

Developer: Should the root Source Identity be exposed as a string like root or dot?

Domain expert: No. The root source has internal Source Identity, but user-facing Source Identity strings are for mounted sources.

Developer: Should Source Identity be recoverable only from Graph Identity?

Domain expert: No. Semantic Origin should explicitly carry Source Origin so diagnostics, inspection, and source-level change tracking can explain where a graph node came from.

Developer: Should mounted sources render after every direct slide added to the root?

Domain expert: No. `add()` and `mount()` share one authoring registration order. A mounted source expands at the point where it was registered.

Developer: Is source key the title shown in the deck?

Domain expert: No. Source Key identifies the composition section. A displayed title can be stored separately.

Developer: Should a child deck store sectionTitle as a default config value?

Domain expert: No. Section title is authored meaning, so it belongs in Source Context. Slide index and total slides are Composition Context.

Developer: Should Source Context values contribute to Graph Identity?

Domain expert: No. Source Context values are authored payload. Source Key and authoring structure preserve identity; context-derived content changes should update payload without changing identity.

Developer: Should slideIndex, totalSlides, and sourceKey live under the slide factory's context field?

Domain expert: No. The context field means Source Context. Deck-generated values such as slideIndex, totalSlides, and sourceKey belong to Composition Context, exposed separately.

Developer: Should a Root Deck slide factory receive context as undefined?

Domain expert: No. A Root Deck has no Source Context, so its slide factories should omit the context field entirely and receive Composition Context separately.

Developer: Should Deck use undefined or an empty object to mean no Source Context?

Domain expert: No. `void` is the type-level marker for no required Source Context. It should not be confused with an authored undefined value or an empty Source Context object.

Developer: Does Deck<undefined> mean no Source Context?

Domain expert: No. Only Deck<void> means no Source Context. Deck<undefined> has Source Context whose value is undefined.

Developer: Can mount() ignore extra context passed to a Deck<void> child?

Domain expert: No. Extra Source Context for a Deck<void> child or a Bound Source is invalid and should be rejected rather than ignored.

Developer: Can mount() accept a Source Context Mapper for a Deck<void> child?

Domain expert: No. A Deck<void> child requires no Source Context, so a mapper is invalid and should be rejected by types where practical.

Developer: Should Root Deck slide factories receive an implicit sourceKey?

Domain expert: No. Public sourceKey is the user-provided key of a mounted source. Root-level slide factories omit sourceKey even though the graph may still use an internal root Source Identity.

Developer: Should direct root slides get synthetic Source Keys for identity?

Domain expert: No. Direct root slides belong to the internal root Source Identity and use their normal authoring position or Graph Identity Hints.

Developer: Can the same child Deck instance be mounted multiple times?

Domain expert: Yes, when each mount uses a different Source Key within the same parent source. Source Identity comes from composition position and Source Key, not from Deck object identity alone.

Developer: Should Source Key be a branded type at the public API boundary?

Domain expert: Not initially. Source Key is accepted as a string, then validated during compile. Invalid keys such as empty strings, `.`, `..`, and keys containing `/` become diagnostics.

Developer: Should changing Source Key preserve Graph Identity?

Domain expert: No. Source Key is identity material. Renaming it means the mounted source has a different Source Identity.

Developer: Should nested mounts wait until after v0.3?

Domain expert: No. Nested mounts and Source Context Mappers are part of the v0.3 graph composition foundation. A source can compose further sources as long as Source Identity remains explicit at every level.

Developer: Can graph composition assume source graphs are acyclic?

Domain expert: No. Composition should detect cycles and report them as diagnostics. It should also include a maximum depth guard for unusually deep source graphs.

Developer: Should a Source Context Mapper receive a different input shape from a slide factory?

Domain expert: Yes. Slide factories receive Source Context and Composition Context, but Source Context Mappers receive only the parent Source Context. Composition Context is produced and tracked by deckjsx rather than exposed to mappers.

Developer: Should a Source Context Mapper receive composition values such as sourceKey or slideIndex?

Domain expert: No. A mapper's responsibility is to derive child Source Context from parent Source Context. Composition values are maintained separately by deckjsx.

Developer: Should a Root parent Source Context Mapper receive undefined?

Domain expert: No. If the parent source has no Source Context, the Source Context Mapper receives no argument.

Developer: Should Source Context Mappers be async?

Domain expert: Not in v0.3. Source Context Mappers are synchronous composition logic. Async source resolution may be introduced later as a separate concept.

Developer: Should a Source Context Mapper failure throw the user's raw error?

Domain expert: No. Mapper failures should be wrapped in composition diagnostics. Strict compile throws a composition Diagnostic Error, while inspect mode returns the diagnostics.

Developer: Should undefined returned from a Source Context Mapper always be invalid?

Domain expert: No. Source Context types are erased at runtime, and Deck<undefined> is a valid source-context type. Mapper result values are not runtime type-checked beyond structural failures.

Developer: Should mount() have a separate API for context mapper mounts?

Domain expert: No. `mount()` can accept either a concrete child Source Context value or a Source Context Mapper. A child source with no Source Context can be mounted without a context argument.

Developer: Should slideIndex count within the current source or across the whole deck?

Domain expert: slideIndex and totalSlides are source-local. Whole-deck numbering is different composition data and should be exposed separately, such as deckSlideIndex and deckTotalSlides.

Developer: Should Source Context Mappers receive deckSlideIndex or deckTotalSlides?

Domain expert: No. Whole-deck numbering is computed after source composition is resolved, so it is not available to Source Context Mappers.

Developer: Should slide factories receive sourceIdentity in Composition Context?

Domain expert: No. Source Identity is for graph origin, diagnostics, and source-level change tracking. User-authored slide content should use Source Context or Source Key instead.

Developer: Should nested sources receive the full source path as sourceKey?

Domain expert: No. Public sourceKey is local to the immediate parent source. The full path-like value is Source Identity and is not part of public Composition Context.

Developer: Should v0.3 preserve top-level slideIndex and totalSlides in slide factory inputs?

Domain expert: No. v0.3 may break compatibility to keep the model clear. Generated values belong under Composition Context.

Developer: Can a Deck with required Source Context output by itself?

Domain expert: Not until its source context is bound. A Root Deck has no required Source Context; a Bound Source supplies it explicitly.

Developer: Should Deck<T> with required Source Context expose compile() as a root operation?

Domain expert: No. Root-like operations should be type-constrained to Deck<void> or Bound Source. Use withSource() to compile a source Deck by itself.

Developer: Can a Deck with required Source Context register slides and nested mounts before it is bound?

Domain expert: Yes. It is a source definition. Source Context is required for root-like compile/output, not for authoring registration.

Developer: Should Bound Source have its own special authoring API?

Domain expert: No. Bound Source is distinct because Source Context has been supplied, but it should expose root-like compile and output operations rather than special authoring behavior.

Developer: Should Bound Source expose add() or mount()?

Domain expert: No. Authoring registration belongs to Deck. Bound Source is a context-bound view for root-like operations.

Developer: Can a Bound Source be mounted into another Deck?

Domain expert: Yes. A Bound Source is fully specified and can be mounted without additional Source Context. Passing extra Source Context to a Bound Source mount is invalid.

Developer: Should Deck<void> expose withSource()?

Domain expert: No. Deck<void> has no Source Context to bind and is already root-like.

Developer: Should mount() pass JSX children into the top of a child Deck?

Domain expert: No. Composition connects sources and supplies Source Context and Composition Context; it should not inject top-level children into a child Deck.

Developer: Can a child Deck expose a place for caller-provided JSX?

Domain expert: Yes, but only as an explicit Source Slot declared in Source Context. The child Deck decides where that authoring structure is placed.

Developer: Does Source Slot JSX belong to the caller source or child source?

Domain expert: Its origin belongs to the caller source because that is where the JSX was authored, even if the child source decides where to place it.

Developer: Should Source Slot identity come only from the caller source?

Domain expert: No. Source Slot Graph Identity should mix caller slot origin with child placement identity so the graph preserves both authorship and semantic placement.

Developer: Should Source Slot field names matter for identity?

Domain expert: Yes. A Source Slot field name, such as context.note, is authored meaning and should be part of slot origin and identity material.

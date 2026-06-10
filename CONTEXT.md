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

**AuthorNode**:
A legacy internal authoring-shaped node representation distinct from the Author Tree. AuthorNode values are not the canonical JSX capture model and should not be used as a bridge from the Semantic Author Graph back into layout or projection.
Author Tree is the valid JSX-to-graph input; AuthorNode should be removed during v0.8.1 cleanup rather than kept as an alternate internal authoring node.
_Avoid_: Author Tree, layout input snapshot, public authoring model

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

**Direct Style Prop**:
A legacy authoring spelling where CSS-like layout or visual style values are written as JSX element props, such as `x`, `color`, or `display`, instead of inside `style`, a StyleSheet, a Theme Default, or a Template Area relationship.
Direct Style Props are not structural or semantic props; `children`, `className`, `style`, `area`, `src`, `data`, and `shape` remain ordinary authoring props.
Slide Declaration options follow the same rule: slide-level appearance belongs to `style`, StyleSheet classes, Theme Defaults, or Template Areas rather than standalone background or layout options.
After v0.8.1, Direct Style Props are invalid authoring input rather than deprecated aliases. Diagnostics should describe them as unsupported authoring props in the current interface, not as migration-only removed props.
_Avoid_: alternate inline style spelling, structural prop

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
Theme can be projected into output-specific theme structures, but it is not itself an output theme file.
_Avoid_: output template, string token reference

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
Output projections may preserve Slide Template structure in format-specific ways, but a Slide Template remains deckjsx authoring vocabulary rather than being identical to a PowerPoint slide master or layout.
_Avoid_: Theme.templates, layout utility, PowerPoint slide master

**Template Area**:
A named frame inside a Slide Template that describes where authored content belongs on a slide. Template Areas are referenced by authored content before layout/projection resolves concrete output coordinates.
Template Areas may carry an authoring-level area kind, such as title, body, picture, footer, date, slide number, or generic, so output projections can choose appropriate format-specific semantics without making authors write output-specific placeholder identifiers.
_Avoid_: CSS grid area, arbitrary coordinate alias, output placeholder

**Template Area Kind**:
An authoring-level semantic hint on a Template Area, such as title, body, picture, footer, date, slide number, or generic. It is not itself a PowerPoint placeholder type; output projections translate it into format-specific layout or placeholder data when useful.
When no kind is authored, the Template Area kind is generic. It should not be inferred from the Template Area name, because area names are local authoring labels while kind is an explicit semantic hint.
_Avoid_: PPTX placeholder type, inferred area name, output id

**Template Area Reference**:
An authored relationship object from content to a Template Area in the active Slide Template. Authors should obtain Template Area References from the slide factory's typed template handle rather than spelling area names as strings.
It should preserve author intent for inspection and diagnostics instead of becoming only resolved coordinates.
_Avoid_: string area name, direct x/y replacement, style property, output placeholder id

**Resolved Style Inspection View**:
An inspectable view of style values after deckjsx has applied CSS-like style resolution rules such as element defaults, Theme defaults, registered StyleSheet rules, and inline style. It exists to show what output projections will consume without turning the Semantic Author Graph itself into a PPTX- or PDF-specific model. It may expose theme application trace, stylesheet source order, specificity, and property-level winner provenance, but Theme itself remains Deck-level configuration.
_Avoid_: output style model, PPTX shape properties

**Layout Input Snapshot**:
An internal input snapshot prepared for layout from the Semantic Author Graph, Resolved Style Inspection View, Template Area relationships, Asset probe metadata, deck size, and ordered semantic children.
It should contain only the semantic node kind, graph/source provenance, layout-relevant resolved style values, paint/text-construction inputs, structural layout data such as Template Area Reference, shape kind, image source reference, template area frame/kind, image probe dimensions, and child/text-run order needed by the layout solver.
It is distinct from Projected Layout Snapshot: Layout Input Snapshot describes what the solver consumes, while Projected Layout Snapshot describes the concrete frames, filtering, clipping, generated visual layers, and layout results that downstream output projections consume.
It should not contain Author Tree props, AuthorNode values, public NodeProps, unresolved class names, or live references to the full Resolved Style Map.
_Avoid_: authoring props replay, resolved style map passthrough, layout result

**Projected Layout Snapshot**:
An internal snapshot of concrete layout frames, flow results, paint-order inputs, clipping, and layout-derived visual data computed from the Semantic Author Graph, Resolved Style Inspection View, Template Area relationships, and deck size before output-specific package projection.
It is not an Author Tree, AuthorNode tree, or public authoring props replay; layout should consume graph and resolved-style snapshots rather than converting semantic nodes back into authoring-shaped nodes.
Its boundary should make types stronger by separating authoring props, resolved style values, layout inputs, projected layout results, and output package payloads instead of using one broad prop shape across multiple stages.
In v0.8.1 it is an internal stage boundary, not a public define API, Project Result artifact, or persisted schema requiring its own version field.
Cross-output visual layering such as generated backgrounds, borders, outlines, clipping, visibility, and rich text run content belongs here before output-specific package projection chooses how to serialize it.
_Avoid_: authoring-shaped layout bridge, solver IR, PPTX package model

**Projected Layout Identity**:
Stable identity for a node inside a Projected Layout Snapshot. It is distinct from Graph Identity because one semantic graph node may produce multiple layout nodes or generated layout artifacts.
Projected Layout nodes should retain Graph Identity and Style Entity provenance, but their own identity belongs to the layout snapshot.
_Avoid_: graph node id, PPTX element identity, PowerPoint shape id

**Inspection Interface**:
The explicit public surface for inspecting compiled deck meaning, including the Semantic Author Graph and inspection-only views such as resolved styles. It is separate from the Authoring Interface so graph internals and debug-oriented payloads do not look like everyday authoring vocabulary.
The public result contract for inspect-mode compile may be reachable from the Authoring Interface, but detailed graph and resolved-style vocabulary belongs to the Inspection Interface.
In v0.6, detailed Projected Document Model types such as the Pptx Package Model also belong to the Inspection Interface, while stage Result types remain available from the Authoring Interface.
Detailed inspection exports may include Pptx Package Model, package parts, package order keys, PPTX element identities, projected drawing paint inputs, and project inspection summaries, while root authoring exports should keep only the stage result types and common authoring vocabulary.
In v0.6, Inspection Interface exports for projected models should be read-only data model types rather than mutation helpers or builder APIs. Editing helpers can wait until sandbox and HMR workflows prove the needed operations.
In v0.8, expensive projection explanation data should stay behind the Inspection Interface and should not become mandatory Authoring Interface or Project cost merely because sandbox and HMR tooling can use it.
_Avoid_: root authoring export, output projection surface, legacy output surface

**Derived Projection Inspection View**:
An inspection-only view computed from a Projected Document Model, diagnostics, and related Pipeline Artifacts to explain output-facing state without becoming the primary projected model. Examples include Effective Projected Style View, Composed Visual Paint Order View, Project Result warning rollups, and build/reuse explanations exposed through Render inspection summaries.
Derived Projection Inspection Views may be materialized lazily or by detail level so ordinary Project and Render calls do not pay for every sandbox explanation. They must not be writer input and must not duplicate ownership from the Pptx Package Model or Pptx Package Assembly Plan.
_Avoid_: Projected Document Model, writer input, eager debug payload, root authoring export

**Asset Entity**:
A graph entity that represents reusable media or external content such as an image source. Renderable nodes reference Asset Entities instead of embedding output-specific media paths.
Asset Entities describe authored media relationships; they are not output package parts or media byte caches.
_Avoid_: PPTX media path

**Authored Media Source**:
The media reference supplied by authoring, such as a data URI, bytes, an absolute URL, an app-public URL, or a filesystem-like path. It is distinct from a PPTX Media Part, and resolving it into bytes belongs to a multi-runtime asset-loading boundary rather than to graph construction or package projection.
_Avoid_: media part, package path, resolved image bytes

**Asset Loading Boundary**:
The pipeline resource boundary that resolves Authored Media Sources into reusable metadata and bytes without making deckjsx core depend on one runtime's file system or asset APIs.
Registered loaders are evaluated before built-in multi-runtime handling and in Deck registration order. The resolver scope that wins Project probing should also be used by Render loading so metadata and bytes are not mixed across different runtime assumptions.
Loader result fields are validated at the boundary: media type, extension, and hash must be non-empty strings when present; width and height must be positive finite numbers; byteLength must be a finite non-negative number; and load bytes must be a Uint8Array.
For image sources, Project probing must produce width and height. Missing dimensions are data retrieval failure, not a writer fallback.
_Avoid_: graph asset resolution, Project-time file IO, core fs dependency

**Asset Artifact**:
A Pipeline Artifact that records resolved media metadata and optionally loaded source bytes for an Asset Entity or Authored Media Source.
_Avoid_: Asset Entity, Media Part, graph payload, package projection

**Media Allocation Key**:
The projected key used to decide whether authored media references share one PPTX Media Part. When an Asset Artifact has a content hash, the key is hash-based; otherwise it is based on resolver scope plus Authored Media Source. The key controls Package Part Identity and media part reuse, while package paths such as `ppt/media/media1.png` remain deterministic assembly names assigned from first projected use.
_Avoid_: graph node id, drawing element id, ZIP path as identity, byte cache key

**Pptx Media Projection**:
The PPTX projection responsibility that turns graph asset references, Authored Media Sources, and Asset Artifacts into media package part identity, media part payloads, slide relationship references, and deterministic reuse decisions.
Pptx Media Projection may use probe metadata and resolver scope from Asset Artifacts, but it does not own media byte loading or byte caches. Media bytes belong to Asset Artifacts and Render-time media emission.
It should assign media package parts and drawing/background relationship ids during Project so the Output Writer can serialize concrete projected relationships instead of rediscovering media topology.
_Avoid_: media byte store, writer-local media relationship creation, filesystem loader

**Presentation IR**:
A legacy backend-independent projection used by the current rendering path. It is not the canonical model of author intent and should not be assumed as a required step for future OOXML output.
_Avoid_: canonical IR, semantic model, required backend boundary

**Legacy Interface**:
The temporary explicit public surface for the current legacy rendering path and Presentation IR related adapters. It exists to quarantine older output machinery while testing how cleanly it can be separated from the Authoring Interface and Inspection Interface. It is not a long-term compatibility commitment; once v0.6 introduces Project, Render, the Pptx Package Model, and the Adapter Interface, the Legacy Interface should be removed rather than preserved beside the new pipeline.
_Avoid_: Authoring Interface, canonical graph model, future output projection surface, compatibility guarantee

**Adapter Interface**:
The explicit public surface for Writer Adapters used by Render, such as the built-in `pptx()` adapter. It is separate from the Authoring Interface so render-time adapter selection does not become ordinary deck authoring vocabulary.
_Avoid_: root authoring export, backend registry, legacy output surface

**Pptx Package Model**:
The PPTX-specific Projected Document Model produced from the Semantic Author Graph. It is a structured package-part graph shaped around OOXML package structure: presentation parts, slide parts, relationship parts, media parts, theme/layout parts, content types, package paths, and PowerPoint identifiers. Package parts should preserve structured data that can be turned into XML or writer calls rather than becoming raw XML bytes too early. It should be friendly to future incremental rebuilds by making changed package parts and their graph/source origins explicit, and it is the primary model future HMR should inspect when deciding what output parts changed.
Its primary key space is Package Part Identity rather than Graph Identity, while each package part should retain origin and dependency links back to Graph Identity and Source Origin where relevant.
Its shape should be derived from PPTX/OOXML package structure itself rather than from the legacy Presentation IR or the needs of a specific writer adapter such as pptxgenjs.
It is both an abstraction of OOXML package structure and the result of projecting from the Semantic Author Graph, so it should stay practical to derive from graph concepts instead of mirroring OOXML so literally that projection becomes unnatural.
It distinguishes manifest parts, support parts, and authored-content parts so package structure, authored meaning, and support metadata can be inspected separately.
Package parts should carry Package Part Requirement metadata because requirement status is package semantics rather than ZIP assembly policy.
Slide part payloads may be close to PPTX drawing structure, but they should use deckjsx-readable projected PPTX terms rather than raw OOXML tag names when a clearer term exists.
Pptx Package Model owns output-facing relationships, identities, calculated drawing properties, and provenance needed by inspection, sandbox, and future HMR workflows.
_Avoid_: semantic graph, generic presentation model, slide content tree as the primary model, raw XML bytes as the primary model, Presentation IR

**Package Part Requirement**:
The Pptx Package Model metadata that explains whether a package part is required, optional, or conditional for a projected PPTX package. It should include the requirement status, the evaluated `required` boolean for the current package snapshot, a stable reason, the condition that was evaluated when the requirement is conditional, and dependency references to the package parts or relationships that caused the evaluation.
Render may use Package Part Requirement when building an Assembly Plan, but it should not invent package requirement policy that was missing from projection.
_Avoid_: ZIP entry status, writer-local required flag, validation diagnostic only

**Package Manifest Projection**:
The package-level projection concept that describes content type entries, package relationships, and media relationship references in the Pptx Package Model.
Support XML should consume projected relationship records, including relationship ids, instead of recomputing `rId` values from package positions. Numeric support ids that are not relationship ids may still be emitted deterministically by the support XML writer.
Package validation should check the relationship payloads consumed by writers, including required presentation, slide master, and slide layout relationships, so broken support XML relationship ids fail before Render emits bytes.
_Avoid_: writer-invented package manifests, path-only support parts

**PPTX Projection Composite Node**:
The internal module boundary that owns projection from graph/style/layout/theme/asset snapshots into the Pptx Package Model, plus PPTX projection inspection and validation helpers. It may contain multiple internal graphs, but externally it should expose coherent projection snapshots and commands through its public barrel rather than leaking internal submodule dependencies.
Its model subgraph may reference upstream identity and provenance identifiers, but should not import upstream payload structures as model payload.
_Avoid_: direct writer import of projection internals, file split by ceremony, project/model cycle

**Package Part Identity**:
Stable identity for a part in a Projected Document Model, especially a PPTX package part. It is distinct from the package path because paths can change due to slide ordering, media placement, or writer layout decisions while the conceptual output part remains the same.
_Avoid_: package path, relationship id, graph id

**Package Part Order Key**:
A deterministic package-part ordering value produced by projection so Render can assemble ZIP entries consistently without making the ZIP writer invent package ordering policy.
It should reflect meaningful PPTX package convention and deckjsx projection order rather than arbitrary lexical path sorting alone.
It carries structured ordering metadata, including a package order group, numeric group order, projection sequence, package path, and stable encoded value for comparison.
_Avoid_: Map iteration order, writer-local sort, package identity

**Package Part Fingerprint**:
A deterministic fingerprint for a package part's meaningful projected payload and dependencies.
Dependency fingerprints should include both relationship targets owned by a part and owner relationship parts whose projected relationship ids are consumed by that part's XML. This lets HMR/build-artifact reuse invalidate owner XML when a `.rels` part changes.
_Avoid_: package path, ZIP timestamp, rendered bytes hash, graph identity

**Pptx Element Identity**:
Stable identity for a projected element inside a Pptx Package Model slide part. It is distinct from Graph Identity and from OOXML object identifiers because the same authored graph node may project into output-specific elements.
Pptx elements should retain origin links to graph nodes and package parts where relevant, but their own identity belongs to the Projected Document Model.
_Avoid_: graph node id, OOXML shape id, relationship id

**Pptx Slide Drawing**:
The structured drawing payload of a PPTX slide part, made of projected drawing nodes such as text boxes, pictures, shapes, and groups. It expands authored content into the drawing-object units that PPTX output will contain, while preserving origins back to graph nodes.
_Avoid_: slide elements, shapeTree, raw OOXML tree, renderer commands

**Pptx Package Model Type Surface**:
The read-only public inspection type surface for PPTX projection snapshots, exported through `deckjsx/inspect`.
Package model payload types, including content types, relationships, support payloads, media payloads, and drawing payloads, belong to the Pptx Package Model type vocabulary even when internal projection helpers assemble them.
Internal helpers such as manifest projection, support XML emission, package validation, and writer build artifacts may re-export or consume these types, but they should not become independent public sources of truth.
This keeps public inspection aligned with the graph-to-PptxPackageModel projection result while leaving helper modules free to change for performance, HMR invalidation, or writer assembly.
_Avoid_: helper-module type source of truth, writer-owned public model, duplicated manifest payload vocabulary

**Pptx Package Part Payload**:
The structured projected data carried by a Pptx Package Model package part. It describes what the part means for PPTX package generation, inspection, sandbox edits, and future HMR invalidation before the Output Writer serializes it.
A package part payload may be close to PPTX/OOXML package structure, but it should stay in deckjsx-readable projected terms rather than becoming raw XML, an XML node tree, writer-local options, or media byte storage.
Package part payloads are part of the inspection type vocabulary. They should be validated structurally before Render so invalid defined projections fail with diagnostics that point at the Pptx Package Model path instead of being hidden by writer fallbacks.
_Avoid_: XML emission model, writer command payload, media byte cache, path-only placeholder

**Pptx Drawing Projection**:
The PPTX projection responsibility that turns Projected Layout Snapshot nodes and generated visual layers into Pptx Slide Drawing nodes.
It owns PPTX-specific drawing traversal and reconstruction policy for projection, including flattening or grouping choices, placeholder/layout-part placement, relationship references, object identity, and package-facing drawing payloads.
Cross-output visual semantics such as generated background/border/outline layers, visibility/display filtering, clipping, rich text run construction, and media topology should already be present in the Projected Layout Snapshot; Pptx Drawing Projection maps those values into PPTX terms rather than regenerating them from graph or authoring props.
It should preserve projected drawing meaning for inspection and HMR without forcing the Output Writer to reinterpret graph, layout, or CSS-like authoring semantics.
_Avoid_: writer drawing traversal, raw OOXML shape tree builder, graph authoring model

**Projected Paint Order**:
The output-facing paint order computed from deckjsx's CSS-like rendering semantics, including z-index, generated backgrounds, outlines, template-owned drawing, and authored slide content. It preserves intended visual stacking before the PPTX projection chooses whether each drawing object can live in a slide layout part or must be expanded into a slide part.
Projected Paint Order is a cross-output projection concept, but each Projected Document Model owns its concrete representation instead of sharing a premature common drawing-node base type.
Projected Paint Order is an extension point for improving CSS-like rendering fidelity over time; v0.8 does not have to reproduce every CSS stacking-context rule, but it should not discard authored paint semantics that future projections need.
Projection should preserve supported CSS-like paint parameters as distinct projected values and report unobserved or unsupported paint semantics as diagnostic warnings rather than silently collapsing them away.
`display: none` and `visibility: hidden` have different projected meanings: display-none content is filtered out of drawing nodes with inspection trace, while visibility-hidden content remains a projected drawing node with visibility state.
Opacity should be preserved as paint data even when CSS-style group compositing or stacking-context behavior is not fully implemented yet.
_Avoid_: raw OOXML order only, package-part order, ignoring CSS-like stacking

**Projected Fallback Strategy**:
The inspection-facing explanation of how a Projected Document Model preserved an authored or CSS-like meaning that the current writer cannot reproduce exactly. It names the fallback strategy, the projected or authored values that remain preserved, and the CSS-like behavior that is still missing.
Projected Fallback Strategy should appear with unsupported semantic warnings and inspection summaries so sandbox and future HMR tooling can distinguish "value was erased" from "value was preserved but emitted through an approximation."
Fallback payloads are structured projected data, not free-form prose. Package consistency validation should reject unknown fallback strategies or malformed preserved/missing value lists before Render emits bytes, especially for `defineProjection()` payloads supplied by tests, tooling, or future sandbox workflows.
_Avoid_: authoring error, writer command, silent approximation

**Filtered Projection Record**:
An inspection-only Project Result record for authored or graph content that was intentionally not projected into output package structure, such as `display: none` content. It explains projection filtering without pretending the filtered content is part of the Pptx Package Model.
_Avoid_: Pptx Drawing Node, hidden output shape, package part payload

**Project Inspection Summary**:
A lightweight derived inspection view attached to Project Result that summarizes projected package structure, slide drawing, media, diagnostics, adapter limitations, and projection filtering without requiring tools to traverse the full Projected Document Model.
Project Inspection Summary may include Filtered Projection Records and aggregate warnings, but it should not become a second package model or a storage location for data that belongs to the Pptx Package Model.
It may expose byte-free copies of projected drawing connection points that sandbox and HMR tools need to read quickly, such as projected visibility, measurement, clipping, opacity, transform flags, z-index/paint-order summaries, layout anchors, and unsupported/fallback semantic records. These fields summarize values already owned by the Pptx Package Model rather than creating new projection authority.
Default Project summaries should remain cheap enough for normal Project/Render and HMR loops; more expensive explanation views should stay detail-gated Derived Projection Inspection Views.
_Avoid_: Pptx Package Model replacement, writer input, eager sandbox-only payload, media bytes, XML chunks, Build Artifact storage

**Pptx Drawing Node**:
A projected PPTX drawing object inside a Pptx Slide Drawing. It carries PPTX-domain structure such as non-visual properties, transform, geometry, shape properties, picture fill, and text body while avoiding raw OOXML tag names as the primary model vocabulary.
Every Pptx Drawing Node should carry origin information. Generated drawing nodes, such as background layers, edge strokes, outlines, or support visuals, should preserve the graph/source origin that caused them to exist.
A drawing node placed by a Template Area should carry a direct layout-anchor relationship in addition to origin information, because provenance and projected layout constraint are different meanings.
When authored content is passed into a mounted source and placed by that source's Template Area, authored origin and template-owner source can differ. Do not store a layout-anchor source identity unless the graph reference can prove the template-owner source; preserve template name, area name, and resolved anchor frame instead of guessing.
Drawing nodes should preserve CSS-like paint semantics even when PPTX package-part boundaries require the projection to choose different emission targets.
Drawing nodes should retain the paint-order inputs that produced their final paint order, not only the final order index.
`paintOrder.siblingOrder` is the graph/layout sibling order before z-index sorting; it is not an alias for `paintOrderIndex`, which is the final PPTX drawing order. In structured layout, this is the projected sibling order after layout filtering and CSS `order` handling. This distinction lets inspection, sandbox, and HMR tooling explain why visual order changed without reconstructing the author graph.
When a drawing node preserves CSS-like `edgeStrokes` or `outline`, the Pptx Package Model should also preserve the generated border/outline layer plan that the writer consumes. Losing those generated layer records, or letting their element identity, serialized shape object id, frame, stroke payload, or shape plan drift from the owning paint semantics, is a projection consistency failure rather than a writer fallback.
Drawing metadata such as serialized object identity, root emission target, paint-order inputs, final paint-order index, and layout-anchor provenance is structured package data. Broken metadata should fail package consistency validation before Render emits bytes.
PPTX geometric transform data and observed CSS-like transform semantics should remain distinguishable when they are not equivalent.
When CSS-like overflow clipping affects a drawing node, the projected node should preserve authored/original frame, clip frame, visible frame, and clipping strategy separately from the final visible frame.
When clipping interacts with transforms or compositing in a way the current PPTX writer cannot faithfully reproduce, Project should preserve the observed inputs and report a nonblocking warning when a structurally valid fallback exists. Blocking Render is reserved for structurally invalid package projections or concrete projected fields that the writer cannot serialize.
Paint inputs are explanation and dependency data for inspection, diagnostics, HMR, and future projection improvements; writers should serialize concrete projected fields rather than reinterpret paint inputs.
Node-local unobserved or unsupported paint semantics should remain attached to the drawing node, while Project Result diagnostics or summaries may aggregate them across the deck.
Representative nonbreaking unsupported CSS-like semantics, such as unsupported transform functions, unsupported background descriptors, or unsupported multi-layer shadows, should project with fallback behavior plus warning diagnostics rather than blocking the entire Project Result.
_Avoid_: authored node, raw OOXML tag, writer command

**Pptx Emission Target**:
The projected decision about which PPTX package part should serialize a drawing object, such as a slide part or slide layout part. It is chosen after Projected Paint Order is known and explains package placement without making the writer infer projection policy.
Drawing objects emitted into a slide layout part belong to that layout part, while slide-level inspection may still show them in a composed visual paint-order view for slides that use the layout.
_Avoid_: writer-local placement, raw package path, paint order itself

**Composed Visual Paint Order View**:
A derived inspection view that combines layout-emitted and slide-emitted drawing nodes for a specific slide in projected visual order. It does not change package part ownership and should not be treated as a second drawing tree.
_Avoid_: package model ownership, duplicated slide drawing, writer input

**Pptx Drawing Group**:
A projected PPTX drawing node that represents an actual PowerPoint group object when group semantics are needed. Authored layout containers should not automatically become Pptx Drawing Groups; they may flatten into the drawing objects they produce while preserving container origins.
_Avoid_: authored container, layout group, implicit View wrapper

**Pptx Slide Layout Projection**:
The projected PPTX layout structure derived from a deckjsx Slide Template. It may become a PPTX Slide Layout Part with placeholder-like anchors derived from Template Areas, while authored slide content remains slide drawing content that can retain links back to those Template Areas.
Every PPTX slide should relate to a slide layout projection; untemplated slides use the default blank layout projection.
Slide layouts relate to slide masters, but the model should not assume there can only ever be one slide master.
Slide layouts and slide masters should retain dependencies on the Pptx Theme Projection they use.
Even generic Template Areas should remain as layout anchors when projected, because the anchor preserves deckjsx template meaning, origin, and frame even when it has no strong PowerPoint placeholder type.
A template-derived slide layout's package identity is source-local: it is based on Source Identity and Slide Template name, so same-named templates in different sources project to distinct layout parts while slides using the same template in one source share the layout projection.
Its fingerprint describes template layout structure, not the authored slide content of slides that use the template.
Slides that place content through a layout anchor depend on that anchor's projected frame and constraints.
A slide layout projection may include template-owned common drawing structure in addition to Template Area anchors; this keeps Slide Template from collapsing into area frame resolution only.
Template-owned common drawing should prefer layout-part representation, while slide-level expansion is a projected fallback when PPTX rendering constraints would otherwise break the Projected Paint Order.
Slides that use a slide layout should retain layout identity and relevant layout fingerprint dependencies, especially when slide drawing values are derived from layout anchors.
_Avoid_: Slide Template itself, frame resolver only, moving authored slide content into a layout part

**Pptx Placeholder Projection**:
The PPTX-specific placeholder or placeholder-like data projected from a Template Area and its Template Area Kind. It belongs to Pptx Slide Layout Projection and should not be confused with the authoring-level Template Area Kind.
Generic Template Areas should not be semantically disguised as body/title placeholders. If PPTX serialization needs a concrete placeholder type for compatibility, that fallback type is separate from the projected deckjsx area kind.
Placeholder projections used only as deckjsx layout anchors should not create visible PowerPoint editing prompts that imply authors should manually type into them.
_Avoid_: Template Area Kind, area name, authored content

**Pptx Theme Part**:
The PPTX package support part that stores PowerPoint theme data such as color schemes, font schemes, format schemes, and related defaults. It is distinct from deckjsx Theme even when it represents similar design-default concepts.
PPTX packages may contain multiple theme parts when multiple masters, imported sources, or future source-specific theme ownership require them, even if an initial projection emits a single default theme part.
_Avoid_: Theme itself, StyleSheet, resolved style view

**Pptx Theme Projection**:
The output projection bridge that maps deckjsx Theme vocabulary and defaults into PPTX theme-support structure when useful. It allows Theme and Pptx Theme Part to stay distinct without pretending they are unrelated concepts.
It should be inspectable enough to explain which Theme values reached PPTX theme support, which were projected into concrete drawing properties, and which remained unprojected.
Unprojected Theme mappings should preserve the resolved value, graph/default provenance, and reason so inspection and HMR tooling can distinguish unsupported projection decisions from lost Theme data.
Even the default theme projection should be structured enough to record projected purpose, source, color scheme, font scheme, and format scheme data rather than treating the theme part as an opaque placeholder.
Theme projection should support both whole-theme mapping summaries and property-level provenance on projected drawing values.
When a Theme Default wins resolved style resolution and is projected as a concrete drawing value, Pptx Theme Projection trace should record the graph node, authored tag/default key, property, resolved value, and projection decision.
Projected drawing values may carry both resolved concrete values and PPTX theme references when a Theme-derived value can be represented either way.
Theme reference serialization choice should be explicit: v0.8 may emit concrete sRGB colors or concrete latin typefaces while preserving matching PPTX color-scheme or font-scheme candidates in Theme Projection trace for future serialization and HMR decisions.
Theme Projection trace is structured Pptx Package Model data. Invalid trace discriminants, package-part references, inheritance steps, or serialization choices should fail package consistency validation before Render emits bytes.
Theme Projection candidates should come from Theme design/default vocabulary rather than from local StyleSheet rules.
Theme Defaults are projection candidates, but Pptx Theme Projection decides whether they become theme support data, layout/master defaults, or concrete drawing properties.
Theme Default style decisions should classify resolved winners by projection destination, such as concrete drawing property, drawing metadata, layout input, filtered projection input, style input, or unsupported semantic fallback, instead of treating every Theme Default winner as a concrete drawing property.
Theme-derived defaults that project through layout or master inheritance should remain visible through effective/provenance inspection on affected drawing values.
Effective Theme inheritance trace should connect Theme Default projection decisions through the PPTX package chain that made them effective, including theme part, slide master, slide layout, slide part, and drawing value where those identities are known.
Theme projection dependencies should support both whole-theme and value-group fingerprints, such as color, font, format, and defaults groups.
Theme projection should trace mappings between deckjsx Theme groups and PPTX theme groups instead of assuming they are identical or one-to-one.
A default theme projection exists even when no author Theme is configured, because PPTX required theme support and effective defaults still need provenance.
Theme projection identity should preserve theme source or origin and projected theme role so a single-theme initial projection can evolve into multiple PPTX theme parts later.
Theme projection purpose should stay extensible rather than being limited to a closed set of early role names.
Theme changes should invalidate dependent package parts according to how the theme value is used, not by forcing every slide to rebuild.
Theme projection consumes Theme Snapshot, Theme Defaults, and resolved style provenance rather than reading JSX authoring directly.
Theme projection should use the active Theme Snapshot after composition, while retaining source and merge provenance for inspection and future HMR.
Theme projection trace may share provenance vocabulary with resolved style inspection, but it remains a distinct trace because it explains output theme mapping rather than CSS-like cascade winners.
_Avoid_: Theme itself, raw theme XML, resolved inline style only

**Effective Projected Style View**:
A derived inspection view that explains effective projected drawing values after package-owned defaults, theme projection, layout/master inheritance, and concrete drawing properties are considered. It should not replace package-owned defaults or duplicate every effective value into the Pptx Package Model.
It is distinct from Resolved Style Inspection View: resolved style explains authoring/graph style resolution before output projection, while effective projected style explains output-specific inheritance and defaults after projection.
Effective Projected Style View is a cross-output projection concept, but each Projected Document Model owns its concrete view shape.
Writers should not use it as input. HMR and sandbox tooling may read it for explanation, while dirty decisions should remain grounded in package fingerprints and dependencies.
_Avoid_: package ownership, raw resolved style only, writer input

**Pptx Serialized Identity**:
Deterministic PPTX/OOXML-facing identifiers, such as relationship ids and shape object ids. They are separate from Pptx Element Identity.
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

**XML Emission**:
The direct writer's serialization procedure for turning Pptx Package Model structured data into OOXML bytes. XML Emission is not a second structured document model, XML IR, or sandbox-editable tree below the Pptx Package Model.
It should use PPTX-domain emitter helpers above a byte/chunk writer so serialization stays fast without introducing an XML-shaped intermediate model.
Serialization formatting policy, such as attribute order, namespace order, numeric formatting, and empty-element style, belongs to emitter fingerprinting because it affects bytes without changing projected meaning.
Escaping and serialization of concrete projected fields are writer responsibilities; failure to serialize a valid Pptx Package Model field is a Render error.
XML emitters should rely on Project/pre-Render validation for structural consistency and perform only lightweight invariant checks during serialization.
_Avoid_: XML-shaped Projected Document Model, raw XML tree as inspection model, writer-side semantic projection

**PPTX Writer Composite Node**:
The internal module boundary that turns Pptx Package Model snapshots into package-part build artifacts, assembly plans, ZIP bytes, rendered artifacts, and optional output side effects. It may contain build, XML emission, assembly, ZIP, and sink graphs, but externally it should expose the PPTX writer adapter contract rather than leaking writer internals.
The composite may keep one render orchestrator as the control owner for stage ordering and Render Result shaping while delegating validation, materialization, assembly, ZIP emission, sinks, and output side effects to smaller internal nodes.
_Avoid_: writer-side projection, direct imports of projection internals, public ZIP implementation surface

**Render Output Side Effect**:
The optional runtime action that writes a produced Rendered Artifact to an output path after artifact bytes exist. It is separate from package generation: Rendered Artifact bytes remain the primary output, while path writing reports requested, skipped, unavailable, failed, or written status through Render inspection summary and diagnostics.
_Avoid_: primary artifact, writer package assembly, public streaming mode

**Pptx Package Build Artifact**:
A render-stage Pipeline Artifact that materializes a Pptx Package Model into package-part bytes before the final PPTX ZIP bytes are assembled. It is keyed by Package Part Identity, but it is not the Projected Document Model or the primary inspection model.
Project owns structured package data and fingerprints; Render owns build artifacts and serialized bytes.
Build artifacts should keep Package Part Identity, final package path, serialized bytes, and build fingerprints distinct so ZIP assembly and future streaming output do not infer package data from the wrong field.
ZIP compression policy belongs to assembly, not to package-part byte generation, so compression changes should not invalidate reusable part bytes by themselves.
Build invalidation should allow both global writer fingerprints and more specific part-emitter fingerprints.
Render should decide reusable non-media package-part Build Artifacts before invoking XML/support emitters when package fingerprints and writer/emitter fingerprints prove a match. Media parts may still require byte fingerprint evaluation unless the projection or Asset Artifact provides a trusted byte hash. A media byte fingerprint may therefore be derived from trusted projected media metadata, such as loader-provided content hash, rather than from reading the bytes again on every warm render.
Build artifacts should carry part-local Build Notes that explain the successful materialization of package-part bytes, including rebuild reason, part kind, byte length, writer/emitter/part fingerprints, dependency fingerprint count, media byte fingerprint when relevant, and diagnostic code references. Render Result remains the source of truth for stage diagnostics.
Only successfully materialized package-part bytes should become build artifacts; failed or missing entries belong in Render diagnostics and the Assembly Plan.
Successful build artifacts may be retained even when the overall Render fails, so a later Render can reuse the completed parts.
_Avoid_: Pptx Package Model, Projected Document Model, raw projection, final rendered artifact

**Pptx Package Build Note**:
Part-local metadata inside a Pptx Package Build Artifact that explains why package-part bytes were successfully built or rebuilt. It is useful for sandbox and HMR reuse explanations, but it is not a diagnostic result and should not replace Render Result diagnostics.
_Avoid_: Render diagnostic, Assembly Plan final entry, Projected Document Model

**Pptx Package Assembly Plan**:
A render-stage plan for assembling package-part build artifacts into the final PPTX ZIP. It defines deterministic entry order, package paths, source build artifact identities, ZIP entry storage policy, and missing/required entry status before ZIP bytes are written.
Its package structure comes from the Pptx Package Model, while Render adds build artifact availability, writer/media fingerprints, and storage decisions.
It should use Package Part Order Keys from the Pptx Package Model rather than relying on writer-local ordering.
It belongs to Render Result inspection/debug output rather than Project Result's primary Pptx Package Model inspection.
Assembly entries should explain build artifact reuse, rebuild, invalidation, or missing status and the reason for that status.
The ZIP writer should consume the Assembly Plan in streaming order internally; streaming ZIP is an implementation strategy, not a separate authoring-facing output mode.
Assembly entry status reasons are typed debug/reuse reasons, not public diagnostic code families.
Assembly entries should distinguish required package entries from optional entries so missing required parts can block Render while optional parts can be reported without corrupting the package.
_Avoid_: unordered build artifact map, Projected Document Model, ZIP writer implementation detail

**Pptx ZIP Sink**:
An internal writer boundary that receives final PPTX ZIP chunks while the ZIP module consumes the Assembly Plan. Collecting sinks materialize the public `RenderedArtifact.bytes`; tee sinks may fan out chunks to multiple internal consumers, but sink topology is not public API.
Path output may be implemented as a runtime side effect over produced artifact bytes or as an internal sink when the runtime boundary supports it. Either way, it must not change the public Render Result shape or expose streaming ZIP as a user-facing mode.
Sink failures that prevent artifact byte collection are Render assembly failures. Path-output side-effect failures after artifact bytes exist should preserve `RenderedArtifact.bytes`, omit written output metadata, and report `E_RENDER_OUTPUT_WRITE_FAILED`.
When path output is requested in a runtime without the Node output boundary, Render should use the same diagnostic family with `reason=runtimeOutputUnavailable` and keep the produced artifact bytes.
_Avoid_: public stream mode, adapter option surface, runtime filesystem dependency in writer core

**Writer Adapter**:
A concrete Output Writer implementation that may target a library, runtime, or direct file format writer. A Writer Adapter must adapt itself to the Projected Document Model rather than pulling the model toward the adapter's preferred input shape, even when that makes the adapter slower or more complex. Temporary writer adapters can be removed once a better direct writer exists.
A Writer Adapter declares both the Projection Format it consumes and the Output Format it returns, allowing Render to choose or compute the correct Projected Document Model before invoking the adapter.
When a Writer Adapter cannot faithfully express projected package information, that mismatch should be visible as diagnostics instead of reshaping the Projected Document Model around the adapter.
_Avoid_: model-defining backend, renderer-shaped document model, long-term compatibility promise

**Project**:
The operation that turns the Semantic Author Graph into a Projected Document Model, such as the Pptx Package Model. Project is the primary API for inspecting output-facing computed state before any writer adapter runs, and it is the stage a sandbox should use to show computed projection results.
Project may use the default Output Format when no format is provided, and it may accept an explicit format when tooling or a sandbox wants a specific Projected Document Model without invoking a Writer Adapter.
Project is a result-first stage: it returns diagnostics, selected output information, and any Projected Document Model that could be materialized.
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
The operation that turns a Projected Document Model into an output artifact or file through a Writer Adapter. Render is downstream of Project and should not compile authoring inputs, read the Author Tree, or own semantic validation.
Render should return a Render Result containing diagnostics and the rendered artifact for tests, tooling, and sandbox inspection; when an output path is provided, writing the artifact to that path is an additional side effect.
Render can accept an explicit Writer Adapter or use the default adapter. When an adapter declares its required output format, render should ensure the matching Projected Document Model exists before invoking the adapter.
Render should support either default-adapter options or a fully configured Writer Adapter value, rather than accepting a separate adapter-plus-options overload. Adapter-specific options belong to the adapter factory so the Render API stays narrow.
When an explicit Writer Adapter requires a different format than the Deck default Output Format, render should use the adapter-required format and report a warning rather than silently using the Deck default.
Render should read the Deck's current Pipeline Artifact Collection rather than accepting an arbitrary projection value as a positional input; edited projections should be supplied with defineProjection before rendering.
Render should not write or return a rendered artifact when the Project Result contains error diagnostics. Partial projections remain available for inspection through Project, while Render treats warnings as non-blocking and errors as blocking.
Render may run lightweight pre-Render package consistency validation, especially for defined or cached projections, without taking over authoring or projection semantics.
_Avoid_: compile, project, authoring-to-output shortcut, semantic validation stage

**Render Result**:
The result of Render, containing diagnostics, the rendered artifact when available, and output information when the artifact was written. It is the final stage result for tooling and sandbox inspection.
Stage results should provide a Result-like `ok` flag derived from error diagnostics so callers can branch without manually scanning diagnostics. Warnings do not make `ok` false. Diagnostics remain the source of truth, and type narrowing should only promise values that the stage can guarantee.
Render may materialize earlier unresolved stages such as Compile and Project when needed, and Render Result should make those prior-stage diagnostics or stage summaries visible so callers can tell which stage blocked or warned.
Stage results should expose diagnostics both as a flat list for simple consumers and as stage-grouped summaries for inspection tools. Individual diagnostics should carry enough stage information to remain meaningful when flattened. Stage summaries should also indicate artifact presence, such as whether graph, projection, or rendered artifact output is available, partial, or missing.
Render Result is still returned when no output path is provided; in that case the rendered artifact should carry bytes as a runtime-neutral `Uint8Array` so tests, browser tooling, and sandbox flows can consume the result without writing a file. Providing an output path adds file writing as a side effect and records output information, but it does not replace the result-first return shape.
Render's file output option may remain a string path convenience. Runtimes without path-based file writing should report output-write diagnostics while still returning artifact bytes when rendering succeeds.
When artifact generation succeeds but file writing fails, Render Result should retain the artifact bytes and report the write failure as error diagnostics rather than discarding the rendered artifact. Written output information should only be present when the side effect succeeded.
Render Result should not expose separate streaming, sink, or file-handle modes. The implementation may optimize output side effects internally, but public callers receive the same result-first shape whether they render to bytes only or also request an output path.
Render options or Writer Adapters may change writer behavior or output detail, but they should not change the top-level Render Result shape.
_Avoid_: void file write, raw artifact-only return, semantic validation result

**Rendered Artifact**:
The bytes produced by Render together with enough metadata for tooling to consume them without external knowledge. A rendered artifact should include the Output Format, media type, file extension, and runtime-neutral bytes.
The final PPTX ZIP is a Rendered Artifact output, while pipeline reuse should primarily happen at package-part build artifact granularity.
Collecting streamed ZIP chunks into a `Uint8Array` is a rendered-artifact sink concern rather than the core ZIP assembly policy.
Rendered-artifact sinks should keep the core runtime-neutral; runtime-specific file writing belongs to a thin boundary rather than the PPTX package writer core.
Partial ZIP bytes from a failed sink should not become a Rendered Artifact.
When bytes collection and file writing are both requested, Render should prefer one ZIP generation feeding multiple sinks rather than generating the ZIP twice.
Side-effect sink failures should not automatically abort independent collecting sinks; ZIP source failures and individual sink failures are different concerns.
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

Developer: Are Author Tree nodes and AuthorNode values the same thing?

Domain expert: No. Author Tree is the JSX capture model that feeds graph construction. AuthorNode is a legacy internal authoring-shaped representation and should not be used as a post-graph layout bridge.

Developer: Can h1 and p both become generic Text nodes before graph construction?

Domain expert: No. Preserve the Authored Tag in the Author Tree, then raise it into a Semantic Role such as heading or paragraph.

Developer: Should styles and assets be children in the renderable graph tree?

Domain expert: No. Keep them as Style Entities and Asset Entities referenced by semantic nodes.

Developer: Can authors write layout or visual style values directly as JSX props?

Domain expert: No. Style and layout values belong in `style`, StyleSheet classes, Theme Defaults, or Template Area relationships. Direct JSX props are reserved for structural and semantic authoring inputs.

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

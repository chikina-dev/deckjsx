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
An author-defined reusable style name that can be referenced from JSX authoring and resolved into Style Entities before output projection. Style Classes are part of authoring semantics, not output-format classes.
_Avoid_: CSS class, PPTX style id

**Style Class Reference**:
An unresolved reference from a Style Entity to an authored Style Class. It records the requested class name and merge-order index without containing the resolved style values for that class.
Style Class References are produced from clsx-like `className` authoring values by dropping falsey and empty entries, expanding arrays and boolean object maps, splitting whitespace in strings, and preserving the resulting order. The merge-order index is assigned after normalization, not from the original input position.
Any style-capable authoring node may carry Style Class References; fragments and primitive text leaves do not.
`className` is not a direct style prop; once normalized, it should appear as Style Class References rather than inside authored direct props.
_Avoid_: resolved class style

**Theme**:
A reusable design vocabulary for a deck, including design tokens and semantic defaults. Theme values inform style resolution before output projection and should not make the Semantic Author Graph specific to PPTX, PDF, or any other output format.
Theme belongs to Deck-level configuration rather than to individual Style Entities as authored payload.
_Avoid_: output template, PowerPoint theme XML

**Resolved Style Inspection View**:
An inspectable view of style values after deckjsx has applied style resolution rules such as Theme defaults, element defaults, Style Classes, inline style, and direct props. It exists to show what output projections will consume without turning the Semantic Author Graph itself into a PPTX- or PDF-specific model. It may expose theme application trace, but Theme itself remains Deck-level configuration.
_Avoid_: output style model, PPTX shape properties

**Asset Entity**:
A graph entity that represents reusable media or external content such as an image source. Renderable nodes reference Asset Entities instead of embedding output-specific media paths.
_Avoid_: PPTX media path

**Presentation IR**:
A legacy backend-independent projection used by the current rendering path. It is not the canonical model of author intent and should not be assumed as a required step for future OOXML output.
_Avoid_: canonical IR, semantic model, required backend boundary

**Pptx Package Model**:
The PPTX-specific output model projected from the Semantic Author Graph. It owns OOXML package structure concerns such as slide parts, relationships, content types, media entries, package paths, and PowerPoint identifiers.
_Avoid_: semantic graph, generic presentation model

**Output Projection**:
The transformation from the Semantic Author Graph into an output-format-specific document model. Each output format owns its own projection, such as the Pptx Package Model for PPTX.
_Avoid_: backend

**Output Writer**:
The output-format-specific writer that turns an Output Projection into bytes or files. It owns serialization and file/package writing concerns, not authoring semantics.
_Avoid_: backend

**Compile**:
The operation that turns deck authoring into the Semantic Author Graph. It replaces the older idea of rendering as the primary inspection API.
Graph Composition is introduced through compile first. Legacy render and output paths should not receive separate composition support merely to preserve old output behavior.
New graph-only authored metadata, such as unresolved Style Class References, may be visible through compile before legacy output paths understand it.
_Avoid_: render

**Diagnostics**:
Warnings and errors produced while constructing or projecting the Semantic Author Graph. Diagnostics should explain problems with compiler-style detail, including codes, labels, notes, help text, author paths, and eventually file/line/column spans.
Composition problems that require resolving authoring sources, such as duplicate Source Keys within a parent source, should be reported during compile diagnostics. Misuse that TypeScript can prevent should still be constrained by types.
When composition diagnostics contain errors, inspect compile should return diagnostics without a Semantic Author Graph because the graph input sources were not resolved. Semantic graph diagnostics may still return a graph when the graph can be constructed with errors.
_Avoid_: string-only thrown errors

**Diagnostic Error**:
An `Error` subclass that carries structured Diagnostics for a specific failure category. Diagnostic Errors let callers branch on error classes while still receiving the full diagnostic report.
Composition failures and Semantic Graph construction failures should have separate Diagnostic Error subclasses.
_Avoid_: one generic Error class for all compile failures

**Deck**:
The owner of pipeline configuration and authoring inputs. It should orchestrate compilation, projection, and writing, but should not hide compiled or projected results as implicit mutable state.
A Deck with Source Context is still a source definition and may register slides or nested mounts before it is bound or composed.
In v0.3, child Decks may continue to carry the existing Deck configuration. Consolidating root-owned final build configuration is a later configuration-design concern.
_Avoid_: output state cache

**Build**:
An explicit orchestration result that exposes the major pipeline artifacts, such as the Semantic Author Graph, diagnostics, and the configured Output Projection. Its type follows the Deck output format.
_Avoid_: render

**Output Format**:
The configured target format for a deck build, defaulting to PPTX. The Output Format determines which Output Projection and writer types are exposed by Build.
_Avoid_: backend name

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

Domain expert: Prefer compile(). Compiling returns the Semantic Author Graph, which is the primary model for inspection and later output projection.

Developer: Should v0.3 make legacy render() and output() understand mounted sources?

Domain expert: No. v0.3 should focus composition on compile and the Semantic Author Graph. Adding separate composition behavior to legacy render/output would make the transition to build/project/write harder to keep clean.

Developer: Should legacy render() or output() ignore mounted sources until output pipeline support exists?

Domain expert: No. If a Deck contains mounted sources, legacy render() and output() should throw rather than silently omit composed content.

Developer: Should invalid authoring always fail while building the Author Tree?

Domain expert: No. Preserve JSX structure where possible, then report semantic warnings and errors as Diagnostics during graph construction. Use `compile({ mode: "inspect" })` when the caller needs diagnostics without immediately throwing.

Developer: Should duplicate Source Keys throw immediately from mount()?

Domain expert: No. Type-level misuse should be prevented where practical, but composition problems that require resolving sources belong to compile diagnostics.

Developer: Should inspect compile return a partial graph when composition fails?

Domain expert: No. Composition errors mean graph input sources were not resolved. Inspect mode should return diagnostics without a Semantic Author Graph.

Developer: Is one generic compile Error enough?

Domain expert: No. Throw specific Diagnostic Error subclasses so callers can branch by failure category, while the attached Diagnostics explain every problem in detail.

Developer: Can project() just use the last graph that compile() produced?

Domain expert: No. Deck owns configuration and authoring inputs, not hidden output state. Use build() when you want a convenient object that exposes graph, projection, diagnostics, and write behavior together.

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

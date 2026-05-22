# deckjsx

deckjsx is a JSX authoring system for presentations. Its language centers on author intent first, then projects that intent into concrete presentation outputs such as PPTX.

## Language

**Semantic Author Graph**:
The canonical output-agnostic internal model raised from the Author Tree after resolving semantic relationships. It is the model that downstream output projections should consume instead of reading the Author Tree directly.
_Avoid_: treating Presentation IR as the main product model

**Author Tree**:
The structural tree produced from JSX authoring. It preserves JSX parent-child shape and primitive text leaves before semantic resolution, and is the source for detecting authoring changes, but it is not the model that backends should consume directly.
_Avoid_: backend input model

**Authored Tag**:
The original JSX tag preserved in the Author Tree, such as `h1`, `p`, `section`, or `figure`. It is the input for semantic interpretation and should not be erased by early aliasing.
_Avoid_: sourceTag as incidental metadata

**Semantic Role**:
The meaning raised from an Authored Tag into the Semantic Author Graph, such as heading, paragraph, figure, or sectioning content. Output projections may use or ignore roles depending on the format, but the graph should preserve them.
_Avoid_: style default only

**Style Entity**:
A graph entity that represents authored or resolved styling separately from renderable node hierarchy. Renderable semantic nodes reference Style Entities instead of treating styles as child nodes.
_Avoid_: style child node

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
_Avoid_: render

**Diagnostics**:
Warnings and errors produced while constructing or projecting the Semantic Author Graph. Diagnostics should explain problems with compiler-style detail, including codes, labels, notes, help text, author paths, and eventually file/line/column spans.
_Avoid_: string-only thrown errors

**Diagnostic Error**:
An `Error` subclass that carries structured Diagnostics for a specific failure category. Diagnostic Errors let callers branch on error classes while still receiving the full diagnostic report.
_Avoid_: one generic Error class for all compile failures

**Deck**:
The owner of pipeline configuration and authoring inputs. It should orchestrate compilation, projection, and writing, but should not hide compiled or projected results as implicit mutable state.
_Avoid_: output state cache

**Build**:
An explicit orchestration result that exposes the major pipeline artifacts, such as the Semantic Author Graph, diagnostics, and the configured Output Projection. Its type follows the Deck output format.
_Avoid_: render

**Output Format**:
The configured target format for a deck build, defaulting to PPTX. The Output Format determines which Output Projection and writer types are exposed by Build.
_Avoid_: backend name

**Graph Identity**:
Stable identity used inside the Semantic Author Graph for authoring concepts such as nodes, slides, and assets. It is derived from lightweight structural material such as Source Identity, semantic parent identity, Authored Tag or semantic kind, and key-or-index; content, style, layout, and output identifiers are payload changes, not identity material.
_Avoid_: PPTX object id, package path, relationship id, content hash, style hash

**Author Path**:
The structural location of a node or text leaf inside the Author Tree, used for traversal and diagnostics. It is not stable identity and should not be used as Graph Identity.
_Avoid_: graph id

**Source Span**:
Optional file, line, and column information associated with an Author Tree node or Diagnostic label. Source Span improves diagnostics when available, but Author Path remains required.
_Avoid_: required identity

**Graph Identity Hint**:
An author-provided hint, such as JSX `key`, that helps preserve Graph Identity across authoring changes. It is scoped by the surrounding authoring position rather than by an output format.
_Avoid_: React render hint

**Source Identity**:
Stable identity for an authoring source such as a deck, slide module, route-like composition branch, or imported slide set. It helps preserve Graph Identity when multiple authoring sources are composed.
_Avoid_: flattened factory index

**Source Key**:
An author-provided key that identifies a meaningful composition section, such as a title section, company metrics section, peer comparison section, or industry trends section. It contributes to Source Identity but is separate from displayed section titles.
_Avoid_: mount path, displayed title

**Source Context**:
Typed inputs required by a child Deck when it is composed into another Deck. Source Context is a type-level authoring contract and should not include bindings, environment, or global configuration.
_Avoid_: props, defaults, global config, bindings

**Source Slot**:
An explicit Source Context field whose value is JSX or an authoring node to be placed by the child Deck. Source Slots are allowed only when the child Deck declares them as part of its Source Context.
_Avoid_: implicit composition children

**Root Deck**:
A Deck with no required Source Context that can be built or output directly. A Deck with Source Context must be composed or bound before it can act as a root.
_Avoid_: child deck with missing source context

**Bound Source**:
A source Deck whose Source Context has been supplied, allowing it to be built or output directly or mounted as a fully specified source.
_Avoid_: global defaults

**Composition Context**:
Values supplied by composition when building a source, such as slide index, total slides, and source key. These values are contextual build inputs produced by deckjsx rather than authored source inputs.
_Avoid_: deck defaults

**Graph Composition**:
The act of combining multiple authoring sources into one Semantic Author Graph while preserving Source Identity and Graph Identity. It is the internal meaning behind user-facing deck composition APIs.
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

Developer: Should invalid authoring always fail while building the Author Tree?

Domain expert: No. Preserve JSX structure where possible, then report semantic warnings and errors as Diagnostics during graph construction. Use `compile({ mode: "inspect" })` when the caller needs diagnostics without immediately throwing.

Developer: Is one generic compile Error enough?

Domain expert: No. Throw specific Diagnostic Error subclasses so callers can branch by failure category, while the attached Diagnostics explain every problem in detail.

Developer: Can project() just use the last graph that compile() produced?

Domain expert: No. Deck owns configuration and authoring inputs, not hidden output state. Use build() when you want a convenient object that exposes graph, projection, diagnostics, and write behavior together.

Developer: Can we use the graph node id as the PowerPoint shape id?

Domain expert: No. Graph Identity and Output Identity are separate. The graph tracks authoring stability; PPTX identifiers belong to the PPTX projection.

Developer: Can Author Path be the graph node id?

Domain expert: No. Author Path is a structural location for diagnostics and traversal. Graph Identity is the stable semantic identity used for diffing and HMR.

Developer: Is JSX key only a React-style rendering optimization?

Domain expert: No. In deckjsx, key is a Graph Identity Hint used to keep semantic nodes stable as the Author Tree changes.

Developer: Should merging decks flatten all slide factories immediately?

Domain expert: No. Composition should preserve Source Identity so the Semantic Author Graph can explain where nodes came from and detect source-level changes.

Developer: Is source key the title shown in the deck?

Domain expert: No. Source Key identifies the composition section. A displayed title can be stored separately.

Developer: Should a child deck store sectionTitle as a default config value?

Domain expert: No. Section title is authored meaning, so it belongs in Source Context. Slide index and total slides are Composition Context.

Developer: Can a Deck with required Source Context output by itself?

Domain expert: Not until its source context is bound. A Root Deck has no required Source Context; a Bound Source supplies it explicitly.

Developer: Should mount() pass JSX children into the top of a child Deck?

Domain expert: No. Composition connects sources and supplies Source Context and Composition Context; it should not inject top-level children into a child Deck.

Developer: Can a child Deck expose a place for caller-provided JSX?

Domain expert: Yes, but only as an explicit Source Slot declared in Source Context. The child Deck decides where that authoring structure is placed.

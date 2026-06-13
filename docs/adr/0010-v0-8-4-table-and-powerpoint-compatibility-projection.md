# v0.8.4 table and PowerPoint compatibility projection

v0.8.4 should implement an authoring-facing table slice and deepen PowerPoint compatibility projection together. The goal is not only to add a `table` tag, but to connect table-related CSS-like semantics and internal table settings into structured PPTX table projection, while also improving related PPTX support structures such as theme projection, default text style, table styles, and relationship scaffolding so generated packages are closer to PowerPoint-native output.

This keeps table work aligned with the Pptx Package Model instead of treating tables as grouped shapes or one-off writer XML. It also clarifies that "PowerPoint compatibility" in this slice means projecting deckjsx table/theme/support meaning into PPTX structures, not adding a broad renderer compatibility layer.

The authoring table structure should cover at least `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, and `td`, including `colspan` and `rowspan` on cells. v0.8.4 should treat HTML-like structure projection separately from CSS-like table projection: table structure should be preserved completely in the Semantic Author Graph and Pptx Table Projection, while CSS table layout and styling may start with a documented subset and diagnostics for unsupported semantics. Cell spans should project to native PPTX table merge semantics when possible.

Table hierarchy should be validated more strictly than ordinary flow layout because a slightly malformed table can break PPTX-native table projection abruptly. `table` should contain table sections or rows, table sections should contain rows, rows should contain cells, and cells should contain ordinary deckjsx content. Invalid table hierarchy should produce table-structure diagnostics rather than silent auto-correction or writer-side repair.

Invalid authored table hierarchy is a Compile error because it prevents deckjsx from constructing a valid Semantic Author Graph Table Node. Output-specific limitations, such as unsupported CSS-like table style projection or PPTX merge constraints, should be Project diagnostics.

Rows may appear directly under `table` as authoring shorthand. The compiler should treat those rows as belonging to an implicit body section for downstream projection. This shorthand does not extend to cells or stray text directly under `table`, which remain invalid table hierarchy.

Table section cardinality and order should be strict: `thead` appears at most once, `tfoot` appears at most once, `tbody` may appear multiple times, and valid section order is `thead`, then zero or more `tbody` sections, then `tfoot`. Violations are Compile errors rather than warnings or implicit reordering.

`th` and `td` should remain distinct in the Semantic Author Graph. In v0.8.4, `th` can drive PPTX header-cell default styling such as fill, bold text, or alignment, but deckjsx does not need to implement the broader HTML table accessibility surface such as `scope`.

Table cells may preserve ordinary deckjsx authored content in the Semantic Author Graph, but the initial PPTX table projection can be text-centric. Text-like content should project into native PPTX table cell text bodies. Richer nested block, media, or shape content may produce Project diagnostics or explicit fallbacks until deckjsx defines native table-cell projection semantics for those cases.

The v0.8.4 CSS-like table projection subset should include table width and height, row height, column width, cell padding, text alignment, vertical alignment, background/fill, border projection at table or cell level, and font/text style inheritance into table cell text.

The v0.8.4 table slice explicitly does not include the full CSS table layout algorithm, generalized `display: table-*` behavior for arbitrary elements, exact browser `border-collapse` semantics, intrinsic auto layout beyond the existing layout capabilities, captions, `colgroup`, or native projection for rich media/shape content inside table cells. These exclusions should remain documented so table work does not accidentally expand beyond the PowerPoint-native table slice.

`caption` is excluded as both authoring tag and projection feature in v0.8.4. Adding caption would make an authored `table` represent more than one native PPTX table object because caption placement affects outer size and surrounding layout, so it should be designed separately if deckjsx later supports it.

`colgroup` and `col` are also excluded from v0.8.4. Column width should come from supported CSS-like table styles for now, rather than introducing non-CSS authoring fields or additional HTML column-structure nodes before the PPTX table grid model is fully designed.

v0.8.4 may add CSS-like `tableLayout: "auto" | "fixed"`. With `tableLayout: "fixed"`, PPTX table projection can treat effective cell `width` values, especially from the first effective row, as column-grid hints. Row heights should come from row `height`. deckjsx should avoid custom authoring fields such as `columnWidths`.

`tableLayout: "auto"` or an unset table layout should be a best-effort approximation in v0.8.4, not the full browser auto table layout algorithm. Projection may distribute available width evenly or use simple available-width rules, and should report a warning or inspection record when auto layout semantics are approximated.

v0.8.4 may accept CSS-like `borderCollapse: "collapse" | "separate"` as table author intent. `collapse` should project as shared-border-like PPTX table borders where practical, but deckjsx does not attempt exact browser border conflict resolution in this slice. `borderSpacing` remains outside the v0.8.4 table subset.

Theme work in v0.8.4 is not table-specific. Theme is one lower layer of the cascade, so Pptx Theme Projection should deepen how resolved Theme defaults and design values become PowerPoint-native theme/support structures across text, shapes, tables, layout/master defaults, and `p:defaultTextStyle` where appropriate. Table styles may consume those projected theme defaults, but they should not create a separate table-only theme application path.

The v0.8.4 theme projection completion target is to project resolved Theme Default effects into PPTX theme/support structures where there is a native PowerPoint concept, and to preserve unprojected mappings for inspection where there is not. Theme colors and fonts should become color-scheme and font-scheme candidates; text defaults should connect to `p:defaultTextStyle` or text body defaults where appropriate; shape and table defaults may project as concrete drawing/table properties while preserving theme-reference candidates. Unsupported mappings should remain visible as unprojected inspection records, while structurally invalid mappings or mappings that v0.8.4 claims to support should produce diagnostics.

`ppt/tableStyles.xml` should move from fixed compatibility placeholder toward a structured Pptx Table Style payload. v0.8.4 should model the default table style id and the basic style slots it actually supports, such as header row, first column, banded rows, fills, borders, text style values, and theme-reference candidates. Style slots or PowerPoint table-style features outside the v0.8.4 coverage may remain explicit placeholders, but they should be represented as deliberate compatibility scaffolding rather than silent writer-only XML.

PowerPoint table-style flags such as first row, first column, or banded rows should not become PPTX-specific public authoring props in v0.8.4. Header-row meaning can come from table structure such as `thead`. v0.8.4 should not add pseudo-class selector support just for tables; when deckjsx later adds pseudo-classes such as `:nth-child`, table projection can map the resulting CSS-like table styling into native PPTX table style slots where appropriate.

The v0.8.4 table style inputs are table structure (`thead`, `th`, `td`), explicit `className` values matched by the existing selector subset, inline `style`, and Theme Defaults. Do not add pseudo-classes or PPTX-specific table-style flags in this slice.

Tables should stay table-specific through layout. Semantic Author Graph should contain table, section, row, and cell nodes; Layout Input Snapshot should preserve table structure, spans, and supported table styles; Projected Layout Snapshot should carry table frame, row geometry, column geometry, cell geometry, and projected text-centric cell content. Pptx Table Projection should consume those table-specific layout snapshots rather than rebuilding a table from generic view/drawing nodes.

The Pptx Package Model should add a dedicated projected table element or drawing kind for native PPTX tables. Tables should not be modeled as generic grouped drawings by default, because Pptx Package Model is already the PPTX projection layer and should preserve PPTX-native table meaning, including grid, merge, cell, and style payloads, even if serialization uses graphic-frame XML.

Unsupported rich content inside a table cell should not make the whole table disappear. v0.8.4 should keep the table structure, attach a cell-level unsupported-content or fallback record, and report a Project warning when the writer can still emit a structurally valid native PPTX table. Blocking Render should be reserved for invalid table structure or projected table payload that cannot be serialized safely.

deckjsx may later support a visual or flattened table projection mode where authored table structure is drawn as text boxes, shapes, and lines instead of a native PPTX table object. That mode could prioritize visual fidelity or richer cell content at the cost of PowerPoint-native table editability. It is not part of the v0.8.4 completion target, whose default table projection is native PPTX table output.

v0.8.4 is complete when the table and compatibility slice satisfies these checks:

- authoring tags include `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, and `td`
- cells support `colspan` and `rowspan`
- table hierarchy is strictly validated as Compile errors
- `table > tr` is accepted as shorthand and normalized to an implicit body section
- `caption`, `colgroup`, and `col` are not authoring tags in this slice
- pseudo-class selector support is not added in this slice
- PPTX-specific table flags are not added as authoring props
- CSS-like table projection includes width, height, row height, cell width hints, padding, text alignment, vertical alignment, fill/background, borders, font/text inheritance, `tableLayout`, and `borderCollapse`
- unsupported CSS table semantics remain documented non-goals with diagnostics or inspection records where relevant
- tables remain table-specific through Semantic Author Graph, Layout Input Snapshot, Projected Layout Snapshot, and Pptx Table Projection
- Pptx Package Model has a dedicated native table element or drawing kind
- native PPTX table cell projection is text-centric in this slice
- visual or flattened table projection mode is not implemented in this slice
- unsupported rich cell content produces cell-level fallback or unsupported-content records plus Project warnings when safe
- Theme Projection is cascade-wide, not table-only
- `ppt/tableStyles.xml`, `p:defaultTextStyle`, and PPTX theme support payloads become structured where v0.8.4 covers them, with explicit placeholders where coverage is intentionally incomplete

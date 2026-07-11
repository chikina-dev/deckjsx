# PDF parameter-loss register

This document tracks authored parameters whose visual semantics are dropped, substituted, or
approximated before or during direct PDF generation. It is a reduction ledger, not a list of every
supported PDF feature.

## Scope and terminology

The direct PDF path has two relevant boundaries:

1. Shared layout projection converts authored CSS-like values into `ProjectedLayoutNode` values.
2. PDF projection and writing convert those nodes into PDF drawing operations and objects.

A loss in the shared layout projection affects PDF even when the PDF writer could theoretically
represent the original behavior. Therefore this register includes both boundaries and labels the
owner of each loss.

- **Dropped**: the authored value remains inspectable, but has no visual effect.
- **Substituted**: a deterministic default or fallback value replaces the authored or omitted value.
- **Approximated**: the visual effect is represented, but not with the authored semantics.
- **Conditional**: the exact path works for a supported subset; other inputs fall back.
- **Diagnosed**: the loss is represented by `unsupportedSemantics` and reaches PDF diagnostics as
  `W_PDF_UNSUPPORTED_SEMANTIC`.

An authored value preserved only as metadata still counts as visually lost.

## Baseline

Baseline date: 2026-07-12.

| Metric                                                      | Current |                Target |
| ----------------------------------------------------------- | ------: | --------------------: |
| Open capability gaps listed below                           |      26 |                     0 |
| Loss families                                               |      18 |                     0 |
| Known loss families with structured diagnostics             | 18 / 18 | 18 / 18 until removed |
| Families covered by a named parity fixture in this register |  0 / 18 |               18 / 18 |

The capability count uses distinct entries in the **Missing capability** column. It is more stable
than counting emitted diagnostics because one document can trigger the same loss many times.
Update this baseline in the same change that closes, adds, splits, or merges a row.

## Active register

| ID     | Boundary       | Authored parameter or condition                                         | Current behavior                                                               | Loss                                                          | Missing capability                                                                          | Diagnostic                                     | Priority |
| ------ | -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| PL-001 | Shared layout  | Group `opacity` between 0 and 1                                         | Cascades opacity to child drawings                                             | Approximated; overlapping children are composited differently | `compositedSubtree`, `cssStackingContext`                                                   | Yes, `cascadeOpacityToChildren`                | P0       |
| PL-002 | Shared layout  | Drawing opacity that creates a stacking context                         | Keeps drawing opacity without a composited subtree                             | Approximated paint and overlap behavior                       | Same capabilities as PL-001                                                                 | Yes, `preserveOpacityWithoutCompositedSubtree` | P0       |
| PL-003 | PDF projection | Gradient stops with different opacity values                            | Keeps geometry, colors, positions, and alpha metadata                          | Dropped variable stop opacity                                 | `variableGradientStopOpacity`                                                               | Yes, `preserveAuthoredValueOnly`               | P0       |
| PL-004 | Shared layout  | `overflow: hidden` combined with rotation or flip                       | Uses an axis-aligned clip while preserving transform                           | Approximated clip geometry                                    | `transformedClipMask`                                                                       | Yes, `axisAlignedClipWithoutTransformedMask`   | P0       |
| PL-005 | Shared layout  | Cropped/fitted image combined with clipping and transform               | Resolves source rectangle before transform                                     | Approximated image crop                                       | `transformedImageClip`                                                                      | Yes, `sourceRectBeforeTransform`               | P0       |
| PL-006 | Shared layout  | Non-`none` `filter` outside the directly supported PDF subset           | Keeps authored filter metadata and drops the effect                            | Dropped                                                       | `filterEffect`                                                                              | Yes, `dropFilterEffect`                        | P1       |
| PL-007 | Shared layout  | Non-`normal` `mixBlendMode` outside the supported subset                | Keeps authored blend metadata and drops compositing                            | Dropped                                                       | `blendCompositing`                                                                          | Yes, `dropBlendMode`                           | P1       |
| PL-008 | Shared layout  | `isolation: isolate`                                                    | Keeps authored isolation metadata and drops the group                          | Dropped                                                       | `isolatedCompositingGroup`                                                                  | Yes, `dropIsolationGroup`                      | P1       |
| PL-009 | Shared layout  | Transform that should establish CSS paint isolation                     | Preserves transform and paint-order inputs                                     | Approximated stacking behavior                                | `cssStackingContext`                                                                        | Yes, `preserveTransformWithoutStackingContext` | P1       |
| PL-010 | PDF projection | Inset `boxShadow` or `textShadow` outside the directly projected subset | Keeps shadow metadata only                                                     | Conditional/drop                                              | `innerShadow`                                                                               | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-011 | Shared layout  | Shadow spread radius                                                    | Projects the shadow without spread                                             | Approximated                                                  | `cssShadowSpreadRadius`                                                                     | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-012 | Shared layout  | Unsupported `display`, `overflow`, or `position` keyword                | Keeps authored value only                                                      | Dropped layout behavior                                       | `cssDisplayBehavior`, `cssOverflowBehavior`, `cssPositionBehavior`                          | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-013 | Shared layout  | Reverse flex direction/wrapping                                         | Uses the supported non-reverse layout subset                                   | Approximated ordering/packing                                 | `reverseFlexOrdering`, `reverseFlexLinePacking`                                             | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-014 | Shared layout  | Unsupported self/item/content alignment and distribution                | Uses supported alignment subset                                                | Approximated layout                                           | `cssBoxAlignment`, `cssContentDistribution`                                                 | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-015 | Shared layout  | Named/negative grid lines, `auto` inset, or `auto` margin               | Keeps authored value without full CSS resolution                               | Dropped/approximated layout                                   | `cssGridNamedOrNegativeLineResolution`, `cssAutoInsetResolution`, `cssAutoMarginResolution` | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-016 | Shared layout  | RTL or vertical `writingMode` used for logical layout                   | Preserves text-body direction; resolves spacing and alignment on physical axes | Approximated layout                                           | `logicalLayoutAxes`, `cssLogicalStartEndMapping`                                            | Yes, `preserveAuthoredValueOnly`               | P1       |
| PL-017 | Shared layout  | Text auto-height without exact font metrics/shaping                     | Uses deterministic glyph-width estimates                                       | Approximated wrapping and frame height                        | `fontSpecificGlyphMetrics`, `exactTextShaping`                                              | Yes, `synthesizeFallbackFrame`                 | P1       |
| PL-018 | Shared layout  | `tableLayout: auto` or `borderCollapse: collapse`                       | Distributes available width and projects native cell borders                   | Approximated table geometry/borders                           | `browserAutoTableLayout`, `cssBorderConflictResolution`                                     | Yes, `preserveAuthoredValueOnly`               | P1       |

The following diagnosed substitutions are tracked separately because they do not correspond to an
authored visual parameter that the PDF writer can recover:

- Omitted video width/height produces a deterministic 16:9 fallback frame.
- An unsupported `objectPosition` syntax preserves the input but cannot produce a resolved source
  rectangle.
- Unparseable stroke, outline, background, and shadow syntax preserves authored metadata but cannot
  produce projection data. These are input/subset failures and should eventually become earlier,
  property-specific authoring diagnostics rather than writer work.
- A missing font or glyph may use an explicit font fallback or fail PDF generation, depending on the
  registered assets and encoding requirements. It must never silently substitute a glyph.

## Reduction order

1. **PDF transparency primitives**: implement reusable transparency groups and soft masks. This can
   close PL-001 through PL-003 and provides infrastructure for later effects.
2. **Transformed clipping**: represent clip paths in transformed user space and apply the same model
   to image source clipping. This closes PL-004 and PL-005.
3. **Compositing and effects**: map supported blend modes, isolation groups, filters, and inner
   shadows to explicit PDF IR rather than branching directly on layout nodes. This addresses PL-006
   through PL-011 without coupling the writer to authored CSS syntax.
4. **Shared layout fidelity**: improve the layout engine for PL-012 through PL-018. These are not PDF
   writer defects and should be fixed before projection, with both PPTX and PDF regression coverage.

External libraries may parse fonts or images, but their objects must be converted at the integration
boundary into deckjsx-owned IR. Expected unsupported input must produce diagnosis/result values; it
must not be implemented as a broad `try/catch` that logs and continues.

## Definition of closed

A row can be removed from the active register only when all of the following are true:

1. The authored value survives in deckjsx-owned IR with no backend-library object leakage.
2. Direct PDF output applies the value with the documented semantics for the supported input range.
3. A semantic unit test proves the projected model or emitted PDF operators/resources.
4. A named raster parity fixture compares direct PDF output with the PPTX-derived oracle.
5. The fixture threshold is documented and passes for overlap/edge cases, not only a happy path.
6. `W_PDF_UNSUPPORTED_SEMANTIC` is no longer emitted for that supported case.
7. Unsupported values still return a precise diagnostic or error instead of silently degrading.

When only part of a row is implemented, split it into supported and remaining subsets. Do not mark a
row closed merely because the diagnostic disappeared.

## Progress reporting

For each implementation change, report:

- capability gaps before and after;
- register rows closed, split, or added;
- semantic tests added;
- raster parity fixtures added and their thresholds;
- any diagnostic removed or narrowed.

The primary progress percentage is:

`closed baseline capabilities / 26 * 100`

Also report parity-fixture coverage separately. A capability is closed only under the definition
above, so adding a diagnostic improves observability but does not increase the closure percentage.

## Source anchors

- Shared unsupported-semantic model: `src/layout/projected.ts`
- Shared layout fallback construction: `src/layout/resolve.ts`
- PDF-specific fallback construction: `src/projection/pdf/project.ts`
- PDF diagnostic lowering: `src/projection/pdf/lower.ts`
- PDF model validation: `src/projection/pdf/validation.ts`
- Direct writer: `src/writers/pdf/`
- Semantic tests: `tests/pdf/public-surface.test.tsx`, `tests/pdf/pdf-model.test.ts`
- Raster parity oracle: `tests/pdf/verification.test.tsx`,
  `tests/render-confidence/pdf-raster-oracle.ts`

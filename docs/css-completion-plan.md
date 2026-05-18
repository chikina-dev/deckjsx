# CSS Completion Plan

Version: `0.1-draft`

This document describes how CSS-shaped authoring should grow in `deckjsx`.

## Direction

CSS support should stay practical and presentation-oriented. The goal is not browser parity; the
goal is predictable authoring that compiles into stable presentation IR and backend output.

New CSS-shaped features should fit the existing compiler boundaries:

- authoring types define the public surface
- style modules parse and lower CSS-shaped values
- layout modules resolve frames and placement
- IR stores backend-agnostic resolved semantics
- backends own PowerPoint and OOXML-specific approximations

## Acceptance Bar

A property should be documented as supported only when it has:

- public authoring coverage
- parser or normalization coverage when relevant
- IR coverage for resolved semantics
- backend coverage when it affects emitted output
- documented caveats for behavior that differs from browser CSS

## Roadmap

### Priority A

- Keep [css-support-matrix.md](css-support-matrix.md) synchronized with the implementation.
- Decide canonical naming for layout aliases such as `x` / `left`, `direction` / `flexDirection`,
  and text aliases such as `lineSpacing` / `lineHeight`.
- Tighten compatibility tests for deck-native props and CSS-facing aliases.
- Keep unsupported or ambiguous CSS values explicit with failure tests.

### Priority B

- Improve typography fidelity where PowerPoint uses a different text model from browser CSS.
- Refine clipping, overflow, and transform caveats.
- Expand backend parity for fields that are present in IR.

### Priority C

- Add theme token expansion.
- Add `className` or style composition support.
- Consider selector-aware styling after the style object API is stable.

## Decision Log

Before claiming broad CSS compatibility, answer these explicitly:

- Which CSS-facing aliases are canonical public names?
- Which deck-native names remain first-class because they map better to presentation authoring?
- Which browser CSS behaviors are intentionally approximated?
- Which backend limitations should remain visible in docs instead of hidden behind CSS names?

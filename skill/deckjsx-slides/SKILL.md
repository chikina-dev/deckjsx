---
name: deckjsx-slides
description: Use this skill when creating, editing, or reviewing PowerPoint slide decks with the deckjsx library, especially html-like TSX/JSX slides that compile to PPTX through Deck, Slide, semantic lowercase tags, Shape, and the pptxgenjs writer adapter.
---

# deckjsx Slides

Use `deckjsx` as a compiler for presentation documents, not as a direct `pptxgenjs` wrapper. Prefer html-like TSX/JSX authoring: `Slide` stays the slide root, while lowercase semantic tags describe slide structure. Inspect authoring semantics with `Deck#compile()`, inspect output-facing state with `Deck#project()`, and emit PowerPoint files with `Deck#render({ output })`.

For Japanese guidance, read `SKILL-ja.md` in this skill folder. Keep both files aligned when updating examples or workflow.

## Example Files

Concrete TSX examples live in `examples/`. Load the specific file that matches the task instead of retyping large examples:

- `examples/minimal-output.tsx`: minimal `.pptx` output through the `pptxgenjs` writer adapter.
- `examples/multi-slide-report.tsx`: a two-slide executive report with metadata, page numbers, grid cards, and repeated data.
- `examples/layout-patterns.tsx`: absolute, flex/stack, grid, and overlay positioning patterns.
- `examples/visual-effects.tsx`: background layers, gradients, shadows, image fit/position, and shape stroke effects.

These files import from `deckjsx` so they are directly usable in package consumers and sample projects. Inside the deckjsx repository, prefer the repo's existing test imports when adding compiler tests.

## Core Workflow

1. Create a `Deck` with an explicit slide layout.
2. Add slides with `deck.add((context) => <Slide>...</Slide>)`.
3. Prefer html-like tags for authoring: `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure` are view-like containers; `p` and `h1`-`h6` are text-like; `img` is a leaf image element.
4. Put layout/container styles on view-like tags and typography styles on text-like tags. For example, put `fontSize` on `<h1>` or `<p>`, not on `<header>` or `<footer>`.
5. Use `Shape`, and the capitalized `View`, `Text`, and `Image` components when they make code clearer or when updating older decks.
6. Use `deck.project()` when inspecting, testing, or snapshotting output-facing computed state.
7. Use `await deck.render({ output: "deck.pptx" })` to write a `.pptx`.
8. Validate library changes with `vp check` and `vp test`; for output-specific work, inspect generated PPTX contents or render/open the result when possible.

## Minimal PPTX Output

```tsx
import { Deck, Slide } from "deckjsx";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
});

deck.add(() => (
  <Slide name="File output">
    <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</p>
  </Slide>
));

await deck.render({ output: "sample.pptx" });
```

This pattern is based on the PPTX writer coverage in `tests/writer-pptxgenjs.test.tsx`.

## Full Slide Pattern

```tsx
import { Deck, Shape, Slide } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
});

deck.add(({ composition }) => (
  <Slide name={`Slide ${composition.slideIndex + 1}`} style={{ backgroundColor: "#F8FAFC" }}>
    <header
      style={{
        x: 0.7,
        y: 0.5,
        width: 8.5,
        height: 0.6,
      }}
    >
      <h1
        style={{
          fontFamily: "Aptos Display",
          fontSize: 28,
          fontWeight: 700,
          color: "#0F172A",
        }}
      >
        Quarterly Review
      </h1>
    </header>
    <main
      style={{
        x: 0.7,
        y: 1.4,
        width: 11.9,
        height: 5.2,
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr",
        columnGap: 0.35,
      }}
    >
      <p style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
        Keep each slide focused on one message. Use the layout primitives to make the hierarchy
        explicit.
      </p>
      <Shape
        shape="rect"
        style={{
          fill: "#2563EB",
          borderRadius: 0.16,
          boxShadow: "3px 3px 8px rgba(15, 23, 42, 0.22)",
        }}
      />
    </main>
    <footer
      style={{
        x: 11.2,
        y: 7,
        width: 1.4,
        height: 0.25,
      }}
    >
      <p style={{ fontSize: 9, color: "#64748B", textAlign: "right" }}>
        {composition.slideIndex + 1} / {composition.totalSlides}
      </p>
    </footer>
  </Slide>
));

await deck.render({ output: "quarterly-review.pptx" });
```

## Tested Sample Patterns

Use these patterns as reliable starting points because they mirror repository tests.

### Multiple Slides And Page Numbers

Based on `tests/deck.test.tsx`.

```tsx
const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "Spec test", author: "deckjsx" },
});

deck.add(({ composition }) => (
  <Slide name={`Slide ${composition.slideIndex + 1}`}>
    <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>
      {composition.slideIndex + 1} / {composition.totalSlides}
    </p>
  </Slide>
));
```

### Exact Absolute Layout

Use for polished PowerPoint composition where placement must be predictable.

```tsx
<Slide name="Absolute">
  <h1 style={{ x: 0.75, y: 0.6, width: 8, height: 0.55, fontSize: 26 }}>Executive Summary</h1>
  <section
    style={{
      x: 0.75,
      y: 1.4,
      width: 5.5,
      height: 4.5,
      backgroundColor: "#E0F2FE",
      borderRadius: 0.12,
    }}
  />
</Slide>
```

### Stack Or Flex Layout

Based on `tests/layout-stack.test.tsx`.

```tsx
<section
  style={{
    x: 1,
    y: 1,
    width: 6,
    height: 3,
    display: "flex",
    flexDirection: "column",
    gap: 0.25,
    padding: 0.5,
  }}
>
  <p style={{ width: 2, height: 0.5, fontSize: 18, order: -1 }}>First</p>
  <p style={{ width: 2, height: 0.5, fontSize: 18 }}>Second</p>
  <p
    style={{
      position: "absolute",
      left: 1,
      top: 0.25,
      width: 1.5,
      height: 0.5,
      fontSize: 16,
    }}
  >
    Overlay
  </p>
</section>
```

### Grid Layout

Based on `tests/layout-grid.test.tsx`.

```tsx
<section
  style={{
    x: 1,
    y: 1,
    width: 8,
    height: 5,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "1fr 1fr",
    columnGap: 0.5,
    rowGap: 0.5,
    padding: 0.5,
  }}
>
  <div style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
  <div style={{ placeSelf: "start center", width: 1, height: 0.5, backgroundColor: "#CBD5E1" }} />
</section>
```

### Image Fit, Crop, And Position

Based on `tests/image-values.test.tsx`.

```tsx
<img
  data={WIDE_SVG_DATA_URI}
  style={{
    x: 1,
    y: 1,
    width: 1,
    height: 2,
    objectFit: "cover",
    objectPosition: "right 25% bottom 10%",
  }}
/>
```

### Background Layers

Based on `tests/background-layers.test.tsx`.

```tsx
<Slide
  name="Background"
  style={{
    background:
      `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, ` +
      "linear-gradient(180deg, #111111 0%, #333333 100%)",
  }}
>
  <div
    style={{
      x: 1,
      y: 1,
      width: 2,
      height: 1,
      background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
    }}
  />
</Slide>
```

### Gradients And Shadows

Based on `tests/gradient-values.test.tsx` and `tests/writer-pptxgenjs.test.tsx`.

```tsx
<Slide
  name="Effects"
  style={{
    backgroundImage:
      "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
  }}
>
  <Shape
    shape="rect"
    style={{
      x: 1,
      y: 1,
      width: 2,
      height: 1,
      fill: "#F97316",
      boxShadow: "6px 6px 10px rgba(15, 23, 42, 0.35)",
      stroke: "dodgerblue",
      strokeWidth: "3pt",
      strokeDasharray: "1 4",
    }}
  />
</Slide>
```

### Typography, Links, And Lists

Based on `tests/typography-values.test.tsx` and `tests/style-values.test.tsx`.

```tsx
<p
  style={{
    x: 1,
    y: 1,
    width: 4,
    height: 0.75,
    fontSize: "2rem",
    color: "#0F172A",
    href: "https://example.com/docs",
    tooltip: "Open docs",
    listStyleType: "circle",
    listIndent: "3ch",
    fit: "shrink",
  }}
>
  Linked bullet text
</p>
```

## Design Rules For Decks

- Build the real slides first; avoid landing-page or explanatory scaffolding.
- Prefer 16:9 layouts with `{ width: 13.333, height: 7.5, unit: "in" }` unless the user specifies another size.
- Use absolute placement for presentation-critical layouts where exact alignment matters.
- Use `display: "flex"` or `layout: "stack"` for simple rows/columns and repeated content.
- Use `display: "grid"` for dashboards, comparisons, matrices, or dense analytic slides.
- Keep slide text short. Use hierarchy through size, weight, color, spacing, and alignment rather than long paragraphs.
- Place repeated furniture such as page numbers, section labels, or small metadata consistently.
- Use `fit: "shrink"` or controlled `height` for text boxes that may vary, then inspect the generated output.

## deckjsx API Notes

- Preferred authoring surface: `Slide` plus lowercase html-like tags. View-like tags are `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure`; text-like tags are `p` and `h1`-`h6`; image tags are `img`.
- Public component fallbacks remain available: `View`, `Text`, `Image`, and `Shape`.
- `Deck#add()` receives `{ composition }`; use `composition.slideIndex` and `composition.totalSlides`.
- Geometry numbers default to inches; font-size numbers default to points.
- View-like tags accept view/layout styles. Text styles belong on `p`, `h1`-`h6`, or `Text`.
- Use `span` inside text-like elements for rich inline text runs.
- Supported length strings include units such as `"in"`, `"pt"`, `"px"`, and `"%"`.
- Prefer CSS-like aliases where available: `left`, `top`, `display`, `flexDirection`, `objectFit`, `objectPosition`, `background`, `border`, `boxShadow`, `textDecoration`, and grid properties.
- `img` and `Image` accept `src` for paths and `data` for data URIs. They are leaf elements and do not accept children.
- `Shape` currently supports `shape="rect"`, `"ellipse"`, or `"line"`.
- The implemented writer adapter is `pptxgenjs`; direct OOXML writing is future work, not the output path to choose today.

## Visual Styling

- Use `backgroundColor`, `background`, or `backgroundImage` on slides and view-like tags.
- Use `border`, per-side borders, `borderRadius`, `outline`, `boxShadow`, `opacity`, `rotation`, `flipH`, and `flipV` when useful.
- For text, use `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`/`italic`, `color`, `textAlign`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textTransform`, bullets through `listStyleType`, and links through `href`/`tooltip`.
- For images, set `objectFit: "cover"` or `"contain"` and refine with `objectPosition` or `crop`.
- Use PowerPoint-safe fonts unless the user has provided a target environment.

## Testing And Review

- When changing compiler behavior, add or update tests that assert authoring semantics through
  `deck.compile()` or output-facing computed state through `deck.project()`.
- When changing writer output, create a temporary `.pptx`, unzip/inspect XML when needed, and assert meaningful emitted markup.
- Keep Node-only file writing in output/runtime code, not core compiler normalization.
- If a generated deck looks wrong, check resolved frames in `deck.project()` first; most visual bugs are layout or unit normalization issues before writer emission.

---
name: deckjsx-slides
description: Use this skill when creating, editing, or reviewing PowerPoint slide decks with the deckjsx library, especially TSX/JSX slides that compile to PPTX through Deck, Slide, View, Text, Image, Shape, and the pptxgenjs backend.
---

# deckjsx Slides

Use `deckjsx` as a compiler for presentation documents, not as a direct `pptxgenjs` wrapper. Author slides in TSX/JSX, compile to IR with `Deck#render()`, and emit PowerPoint files with `Deck#output({ backend: "pptxgenjs", output })`.

For Japanese guidance, read `SKILL-ja.md` in this skill folder. Keep both files aligned when updating examples or workflow.

## Example Files

Concrete TSX examples live in `examples/`. Load the specific file that matches the task instead of retyping large examples:

- `examples/minimal-output.tsx`: minimal `.pptx` output through the `pptxgenjs` backend.
- `examples/multi-slide-report.tsx`: a two-slide executive report with metadata, page numbers, grid cards, and repeated data.
- `examples/layout-patterns.tsx`: absolute, flex/stack, grid, and overlay positioning patterns.
- `examples/visual-effects.tsx`: background layers, gradients, shadows, image fit/position, and shape stroke effects.

These files import from `../../../src/index.ts` so they are useful inside this repository. When adapting them for an external project, change the import to `from "deckjsx"`.

## Core Workflow

1. Create a `Deck` with an explicit slide layout.
2. Add slides with `deck.add((context) => <Slide>...</Slide>)`.
3. Prefer component `style` objects for layout and visual styling.
4. Use `deck.render()` when inspecting, testing, or snapshotting the compiler IR.
5. Use `await deck.output({ backend: "pptxgenjs", output: "deck.pptx" })` to write a `.pptx`.
6. Validate library changes with `vp check` and `vp test`; for output-specific work, inspect generated PPTX contents or render/open the result when possible.

## Minimal PPTX Output

```tsx
import { Deck, Slide, Text } from "deckjsx";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
});

deck.add(() => (
  <Slide name="File output">
    <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</Text>
  </Slide>
));

await deck.output({
  backend: "pptxgenjs",
  output: "sample.pptx",
});
```

This pattern is based on `tests/backend-pptxgenjs.test.tsx`.

## Full Slide Pattern

```tsx
import { Deck, Shape, Slide, Text, View } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
});

deck.add(({ slideIndex, totalSlides }) => (
  <Slide name={`Slide ${slideIndex + 1}`} style={{ backgroundColor: "#F8FAFC" }}>
    <Text
      style={{
        x: 0.7,
        y: 0.5,
        width: 8.5,
        height: 0.6,
        fontFamily: "Aptos Display",
        fontSize: 28,
        fontWeight: 700,
        color: "#0F172A",
      }}
    >
      Quarterly Review
    </Text>
    <View
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
      <Text style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
        Keep each slide focused on one message. Use the layout primitives to make the hierarchy
        explicit.
      </Text>
      <Shape
        shape="rect"
        style={{
          fill: "#2563EB",
          borderRadius: 0.16,
          boxShadow: "3px 3px 8px rgba(15, 23, 42, 0.22)",
        }}
      />
    </View>
    <Text
      style={{
        x: 11.2,
        y: 7,
        width: 1.4,
        height: 0.25,
        fontSize: 9,
        color: "#64748B",
        textAlign: "right",
      }}
    >
      {slideIndex + 1} / {totalSlides}
    </Text>
  </Slide>
));

await deck.output({ backend: "pptxgenjs", output: "quarterly-review.pptx" });
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

deck.add(({ slideIndex, totalSlides }) => (
  <Slide name={`Slide ${slideIndex + 1}`}>
    <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>
      {slideIndex + 1} / {totalSlides}
    </Text>
  </Slide>
));
```

### Exact Absolute Layout

Use for polished PowerPoint composition where placement must be predictable.

```tsx
<Slide name="Absolute">
  <Text style={{ x: 0.75, y: 0.6, width: 8, height: 0.55, fontSize: 26 }}>Executive Summary</Text>
  <View
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
<View
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
  <Text style={{ width: 2, height: 0.5, fontSize: 18, order: -1 }}>First</Text>
  <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>Second</Text>
  <Text
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
  </Text>
</View>
```

### Grid Layout

Based on `tests/layout-grid.test.tsx`.

```tsx
<View
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
  <View style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
  <View style={{ placeSelf: "start center", width: 1, height: 0.5, backgroundColor: "#CBD5E1" }} />
</View>
```

### Image Fit, Crop, And Position

Based on `tests/image-values.test.tsx`.

```tsx
<Image
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
  <View
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

Based on `tests/gradient-values.test.tsx` and `tests/backend-pptxgenjs.test.tsx`.

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
<Text
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
</Text>
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

- Public components: `Slide`, `View`, `Text`, `Image`, and `Shape`.
- `Deck#add()` receives `{ slideIndex, totalSlides }`.
- Geometry numbers default to inches; font-size numbers default to points.
- Supported length strings include units such as `"in"`, `"pt"`, `"px"`, and `"%"`.
- Prefer CSS-like aliases where available: `left`, `top`, `display`, `flexDirection`, `objectFit`, `objectPosition`, `background`, `border`, `boxShadow`, `textDecoration`, and grid properties.
- `Image` accepts `src` for paths and `data` for data URIs.
- `Shape` currently supports `shape="rect"`, `"ellipse"`, or `"line"`.
- The implemented backend is `"pptxgenjs"`; `"ooxml"` is a future backend name, not the output path to choose today.

## Visual Styling

- Use `backgroundColor`, `background`, or `backgroundImage` on slides and views.
- Use `border`, per-side borders, `borderRadius`, `outline`, `boxShadow`, `opacity`, `rotation`, `flipH`, and `flipV` when useful.
- For text, use `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`/`italic`, `color`, `textAlign`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textTransform`, bullets through `listStyleType`, and links through `href`/`tooltip`.
- For images, set `objectFit: "cover"` or `"contain"` and refine with `objectPosition` or `crop`.
- Use PowerPoint-safe fonts unless the user has provided a target environment.

## Testing And Review

- When changing compiler behavior, add or update tests that assert the IR through `deck.render()`.
- When changing backend output, create a temporary `.pptx`, unzip/inspect XML when needed, and assert meaningful emitted markup.
- Keep Node-only file writing in output/runtime code, not core compiler normalization.
- If a generated deck looks wrong, check resolved frames in IR first; most visual bugs are layout or unit normalization issues before backend emission.

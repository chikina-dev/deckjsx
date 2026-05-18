# deckjsx

`deckjsx` is a TypeScript library for generating presentation files from JSX through a compiler pipeline.

The intended architecture is:

```text
JSX
  -> Presentation IR
  -> Backend
       |- PptxGenJS backend
       `- OOXML direct backend (future)
```

This project is being designed as a compiler, not as a thin `PptxGenJS` wrapper.
The current API direction is a class-based compiler with callback-based `.add()`, `.render()`, and `.output()`, and JSX authoring centered on a `style` object prop.

The implementation preserves the compiler model with explicit module boundaries for authoring,
style normalization, layout, IR, backend emission, and Node runtime output.

## Install

```bash
npm install deckjsx
```

The package currently targets Node.js output and ships a `pptxgenjs` backend.

## Usage

```tsx
import { Deck, Slide, Text, View } from "deckjsx";

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
        height: 4.8,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 0.35,
      }}
    >
      <Text style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
        Author slides with TSX primitives, inspect the generated IR, and emit PPTX files through the
        backend boundary.
      </Text>
      <Text style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
        {slideIndex + 1} / {totalSlides}
      </Text>
    </View>
  </Slide>
));

const ir = deck.render();
await deck.output({ backend: "pptxgenjs", output: "quarterly-review.pptx" });
```

Use `deck.render()` for tests, snapshots, and backend-independent inspection. Use
`deck.output({ backend: "pptxgenjs", output })` when writing a PowerPoint file.

## Spec

The current draft specification is here:

- [docs/compiler-spec.md](docs/compiler-spec.md)
- [docs/css-support-matrix.md](docs/css-support-matrix.md)
- [docs/css-completion-plan.md](docs/css-completion-plan.md)

## Development

```bash
vp install
vp check
vp test
vp pack
```

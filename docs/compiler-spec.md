# deckjsx Compiler Specification

Version: `0.1-draft`

This specification describes the compiler architecture and public authoring model.

## 1. Overview

`deckjsx` is a TypeScript library for generating presentation files from JSX through a compiler pipeline.

The intended architecture is:

```text
JSX
  -> Frontend normalization
  -> Presentation IR
  -> Backend
       |- PptxGenJS backend
       `- OOXML direct backend (future)
```

This project is explicitly a compiler, not a thin wrapper around `PptxGenJS`.
`PptxGenJS` is treated as one backend implementation behind a stable intermediate representation.

The initial runtime target is Node.js. Even so, the final generation step must stay isolated enough that a browser or serverless runtime can be added later without redesigning the core compiler.

## 2. Goals

- Accept presentation documents authored in TSX/JSX.
- Compile authored JSX into a backend-agnostic `Presentation IR`.
- Emit `.pptx` through a `PptxGenJS` backend as the first concrete target.
- Keep compiler stages pure and decoupled from filesystem concerns.
- Make the future addition of a direct OOXML backend possible without changing authored JSX.
- Start with explicit parameters for layout and styling, while preserving a clean path to CSS-style control later.

## 3. Non-goals for the first phase

- Full CSS support.
- Browser-first runtime support.
- Perfect layout parity with HTML/CSS.
- Smart text reflow that matches PowerPoint exactly in all fonts.
- Direct OOXML emission.
- A React renderer or live DOM-like runtime.

## 4. Design principles

### 4.1 Compiler-first

The authored slide factory callback is input to a compilation pipeline. The public mental model is:

1. Create a compiler instance with presentation-level options.
2. Add slides one by one with `.add()`.
3. Compile the accumulated document to `Presentation IR` with `.render()`.
4. Emit and write an artifact with `.output()`.

### 4.2 Backend isolation

The compiler core must not depend on `PptxGenJS` types or APIs.

### 4.3 Runtime isolation

Core compilation must not require `fs`, `path`, or Node-only globals. Node-specific file writing should live in a thin adapter layer.

### 4.4 Serializable IR

`Presentation IR` should be JSON-serializable so it can be inspected, snapshotted, cached, and later transported across processes or runtimes.

### 4.5 CSS-compatible direction

Even though the first phase uses explicit parameters, property names and value modeling should be chosen so a future CSS resolver can target the same internal style system.

## 5. High-level architecture

### 5.1 Layers

### Authoring layer

The author creates a compiler class instance, then registers slide factory callbacks that return TSX using components such as:

- `Slide`
- `View`
- `Text`
- `Image`
- `Shape`

Presentation-level configuration such as page size, metadata, theme defaults, and output options is owned by the class instance rather than a root JSX component.

### Frontend normalization layer

The compiler validates JSX props, applies defaults, resolves units, and lowers authoring components into a normalized tree.

This layer also includes CSS-shaped aliases and shorthands such as `display`, `flexDirection`, grid
props, backgrounds, gradients, transforms, and typography aliases. Those capabilities are compiler
concerns, but their parsing and normalization should stay isolated from tree walking and IR
construction.

### Presentation IR

The normalized document is compiled into a backend-agnostic intermediate representation that expresses slides, positioned nodes, text runs, images, shapes, and resolved styles.

### Backend layer

A backend consumes `Presentation IR` and produces a concrete output artifact. The first backend uses `PptxGenJS`. A future backend may write OOXML directly.

### Host/runtime adapter layer

Node-specific helpers handle writing buffers to disk or reading local assets when needed. This layer is intentionally separate from the compiler core.

The `Deck#output()` convenience method may remain public, but its file-writing behavior should
delegate to this layer rather than living inside compiler core.

### 5.2 Compilation pipeline

```text
slide factory added through compiler instance
  -> JSX runtime output
  -> element validation
  -> prop/style normalization
  -> default/theme resolution
  -> layout resolution
  -> Presentation IR
  -> backend emission
  -> artifact result
```

The stable external boundary is the `Presentation IR`. Internal sub-stages may evolve as long as the IR contract stays stable.

## 6. Runtime model

### 6.1 Primary target

The first supported runtime is Node.js.

Expected initial usage:

```ts
import { Deck } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
});

deck.add(({ slideIndex }) => (
  <Slide name={`Title ${slideIndex + 1}`}>
    <Text style={{ x: 1, y: 1, width: 11.333, height: 0.8, fontSize: 28 }}>
      Hello
    </Text>
  </Slide>
));

const ir = deck.render();

await deck.output({
  backend: "pptxgenjs",
  output: "sample.pptx",
});
```

### 6.2 Separation rules

- `.render()` must be pure from the caller's perspective.
- Backend emission should return memory artifacts such as `Uint8Array`, `ArrayBuffer`, strings, or backend handles.
- `.output()` is a Node-oriented convenience API layered on top of IR generation, backend selection, and file writing.
- File writing should remain outside the compiler core even if it is exposed through a method on the public class.

This separation keeps future web support realistic.

## 7. Authoring model

### 7.1 Initial authoring style

The first phase uses a `style` object prop instead of external CSS stylesheets.
Presentation-level settings are passed to the class constructor, while slide content is produced through `.add()` callbacks.

Examples:

- frame props inside `style`: `x`, `y`, `width`, `height`
- box props inside `style`: `padding`, `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`
- text props inside `style`: `fontFamily`, `fontSize`, `fontWeight`, `color`, `textAlign`
- layout props inside `style`: `direction`, `gap`, `alignItems`, `justifyContent`

This keeps authoring closer to future CSS resolution, because styling concerns are grouped under one object rather than spread across top-level component props.

### 7.2 Component set for MVP

The initial compiler should target a small primitive set:

- `Slide`
- `View`
- `Text`
- `Image`
- `Shape`

An explicit `Presentation` JSX root is not required for the first public API.
Optional convenience primitives may be layered on top later, but the IR should only need a small number of structural node kinds.

### 7.3 Slide factory callback

`.add()` should accept a callback instead of a raw JSX element.

Reasoning:

- it gives the compiler room to pass slide metadata such as slide index
- it supports future data-driven authoring without redesigning the API
- it keeps slide generation lazy and explicit

The callback should receive a small context object in the first phase, for example:

- `slideIndex`
- `totalSlides` if known at render time
- future user-defined data bindings

The first release should keep this context minimal and stable.

### 7.4 Layout expectations

The first phase should support two layout modes:

- `absolute`
- `stack`

`absolute` is the baseline for PowerPoint-friendly placement.

`stack` is a convenience layout that resolves child positions during compilation. It should support:

- `direction: "horizontal" | "vertical"`
- `gap`
- `padding`
- `alignItems`
- `justifyContent`

The result after layout resolution is still absolute frames in `Presentation IR`.

## 8. Units and values

### 8.1 Authoring values

To keep the first phase ergonomic for presentation generation:

- geometric numbers default to inches
- font size numbers default to points
- percentages are accepted where the parent frame is known

Accepted value shapes should eventually include:

- `number`
- unit strings such as `"1in"`, `"24pt"`, `"50%"`

### 8.2 Internal normalization

The compiler should normalize values into explicit internal units:

- geometry: EMU or another precise presentation unit
- typography: points

Public authoring ergonomics and internal storage do not need to use the same unit.

## 9. Presentation IR

### 9.1 IR requirements

`Presentation IR` must:

- be backend-agnostic
- be serializable
- use resolved frames after layout
- preserve enough semantic information for multiple emitters
- avoid leaking `PptxGenJS` names or enums

### 9.2 Draft shape

```ts
type PresentationIR = {
  version: "0.1";
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
  size: {
    widthEmu: number;
    heightEmu: number;
  };
  slides: SlideIR[];
};

type SlideIR = {
  id: string;
  name?: string;
  background?: FillIR;
  nodes: NodeIR[];
};

type NodeIR = GroupIR | TextIR | ImageIR | ShapeIR;

type BaseNodeIR = {
  id: string;
  frame: {
    xEmu: number;
    yEmu: number;
    widthEmu: number;
    heightEmu: number;
  };
  opacity?: number;
  rotation?: number;
  zIndex?: number;
};

type GroupIR = BaseNodeIR & {
  kind: "group";
  children: NodeIR[];
};

type TextIR = BaseNodeIR & {
  kind: "text";
  content: TextContentIR;
  style: TextStyleIR;
};

type ImageIR = BaseNodeIR & {
  kind: "image";
  source: ImageSourceIR;
  fit: "contain" | "cover" | "stretch";
};

type ShapeIR = BaseNodeIR & {
  kind: "shape";
  shape: "rect" | "ellipse" | "line";
  fill?: FillIR;
  stroke?: StrokeIR;
  radius?: number;
};
```

This shape is deliberately small. Additional features should be added only when two or more use cases require them.

### 9.3 Text model

The initial text model may start simple:

- plain string children
- optional inline runs later
- paragraph-level alignment

The IR should still leave room for a future richer structure:

- text runs
- paragraph blocks
- bullet lists
- hyperlinks

## 10. Backend contract

### 10.1 Backend interface

The backend boundary should be explicit and narrow.

```ts
type BackendArtifact =
  | { kind: "buffer"; mimeType: string; data: Uint8Array; extension: string }
  | { kind: "text"; mimeType: string; data: string; extension: string };

type CompileBackend = {
  name: string;
  emit(ir: PresentationIR, options?: BackendOptions): Promise<BackendArtifact>;
};
```

The public class may resolve a backend from a string key such as `"pptxgenjs"`, but that lookup is only a convenience wrapper over this backend contract.

### 10.2 PptxGenJS backend responsibilities

The `PptxGenJS` backend should:

- create a `PptxGenJS` document from `Presentation IR`
- map frames, text, images, shapes, and slide metadata
- own all translation from IR concepts to `PptxGenJS` APIs
- hide `PptxGenJS` quirks from the compiler core

### 10.3 Future OOXML backend responsibilities

The direct OOXML backend should:

- consume the exact same `Presentation IR`
- generate `.pptx` package contents without `PptxGenJS`
- remain swappable without authoring-layer changes

## 11. Public API draft

The first public API should be small, class-based, and compiler-oriented.

```ts
type DeckOptions = {
  layout: {
    width: number;
    height: number;
    unit: "in" | "pt";
  };
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
};

type OutputConfig = {
  backend: "pptxgenjs" | "ooxml";
  output: string;
};

type SlideContext = {
  slideIndex: number;
  totalSlides?: number;
};

type SlideFactory = (context: SlideContext) => JSX.Element;

declare class Deck {
  constructor(options: DeckOptions);

  add(slide: SlideFactory): this;
  render(): PresentationIR;
  output(config: OutputConfig): Promise<void>;
}
```

Semantics:

- `.add()` registers exactly one slide factory in the presentation.
- `.render()` returns backend-agnostic `Presentation IR`.
- `.render()` invokes registered slide factories with a per-slide context and compiles the returned JSX.
- `.output()` resolves the selected backend, emits an artifact, and writes it to the configured destination.

The implementation should still be structured internally as IR generation plus backend emission, even though the public API is exposed through one class.

## 12. Module boundaries

Even if the repository begins as a single package, code should be separated as if these modules may later split:

- `src/jsx`
- `src/authoring`
- `src/style`
- `src/layout`
- `src/compiler`
- `src/ir`
- `src/backends/pptxgenjs`
- `src/backends/ooxml`
- `src/node`

Rules:

- `src/authoring` owns public JSX props, style authoring types, CSS-like authoring aliases, deck
  options, slide factories, and output configuration.
- `src/ir` owns backend-agnostic compiler output contracts: presentation, slide, node, fill,
  background layer, stroke, text, image, shape, artifact, and backend interfaces.
- `src/types` is a compatibility surface for constants and type re-exports; new internal code should
  prefer the owning boundary modules directly.
- `src/compiler` depends on `src/ir`, not on concrete backends.
- `src/compiler` orchestrates authoring validation, style normalization, layout, and IR creation,
  but should not contain the full implementation of each stage.
- `src/style` owns CSS-like value parsing and style lowering.
- `src/layout` owns absolute, stack, and grid frame resolution.
- `src/backends/*` depend on `src/ir`, not on JSX authoring internals.
- `src/node` may depend on compiler and backends, but compiler core must not depend on `src/node`.
- the public `Deck#output()` method should delegate into `src/node` or an equivalent runtime adapter rather than inlining file I/O into core compilation code.

## 13. CSS migration path

The long-term direction is CSS-style control, but the first phase should not paint the project into a corner.

To support that:

- prefer CSS-like property names now
- normalize all styling through one internal style model
- avoid backend-specific style names in public props
- keep specificity/cascade concerns out of the backend layer

Future style precedence can be:

1. component defaults
2. theme defaults
3. class-based styles
4. inline explicit props

The compiler should be able to add this later without changing `Presentation IR` radically.

## 14. MVP scope

The first implementation milestone should be intentionally narrow.

### Must have

- TSX authoring for `Slide`, `View`, `Text`, `Image`, `Shape`
- class-based public API with `new Deck()`, callback-based `.add()`, `.render()`, and `.output()`
- compile to `Presentation IR`
- `PptxGenJS` backend
- Node helper to write `.pptx`
- basic absolute layout
- basic stack layout
- solid fill, stroke, text color, font size, alignment

### Nice to have

- themes
- reusable component abstractions
- image sizing helpers
- speaker notes

### Deferred

- CSS files and selectors
- OOXML backend
- advanced typography
- charts, tables, and SmartArt-like abstractions

## 15. Testing strategy

The compiler should be testable in layers:

- JSX to normalized tree tests
- normalized tree to `Presentation IR` snapshot tests
- backend mapping tests
- end-to-end artifact smoke tests

The most important early snapshot target is `Presentation IR`, because it is the contract that protects backend independence.

## 16. Open questions

- Should authored geometry numbers default to inches or points, or should numbers be disallowed in favor of explicit unit strings?
- Should text support inline rich runs in the first public release, or can that wait until after plain-string text stabilizes?
- Should layout remain minimal and PowerPoint-oriented, or should it move earlier toward flex-like behavior?
- Should local image loading happen in a Node adapter before IR generation, or should IR allow unresolved asset references?

## 17. Recommended next step

After this specification, the next implementation step should be a thin vertical slice:

1. JSX runtime primitives
2. `Deck#add()`
3. minimal `Presentation IR`
4. `Deck#render()`
5. `Deck#output()` through the `PptxGenJS` backend
6. a single end-to-end test that writes one slide with one text box

This keeps the initial implementation honest while preserving the architecture needed for future expansion.

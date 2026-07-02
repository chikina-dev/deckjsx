# Output Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single `output.format` deck configuration with `output.formats`, allowing a deck to declare multiple valid artifact formats while keeping `deck.render()` and `deck.project()` as single-target calls.

**Architecture:** Add a small output-format normalization helper and make all implicit projection/render decisions go through it. Explicit writer adapters choose their own projection format; deck output configuration only validates whether that adapter format belongs to the declared format set. No `renderAll()` or `renderMany()` API is added.

**Tech Stack:** TypeScript, deckjsx pipeline/adapter APIs, Vite+ tests, Vitest-style `vite-plus/test`.

---

## File Structure

- Modify `src/authoring/options/public.ts`
  Public `DeckOptions.output` type changes from `format?: ProjectionFormat` to `formats?: readonly ProjectionFormat[]`.
- Create `src/authoring/options/output-formats.ts`
  Owns runtime-neutral helper functions for reading configured formats, selecting the implicit first target, and checking explicit adapter membership.
- Modify `src/authoring/options/validation.ts`
  Validate `output.formats`, reject `output.format`, unsupported values, and duplicates.
- Modify `src/deck.ts`
  Use the helper when `BoundSource` and `Deck` decide implicit projection/render formats.
- Modify `src/pipeline/runner.ts`
  Use the helper for implicit projection/render target selection, multi-format warnings, and explicit adapter membership diagnostics.
- Modify `tests/authoring/deck.test.tsx`
  Add runtime validation coverage for `formats`.
- Modify `tests/pdf/public-surface.test.tsx`
  Replace `output.format` usage and add multi-format implicit behavior tests.
- Modify `tests/pptx/project-render-pipeline/fallback-summaries/inspection-and-origin.test.tsx`
  Update the format mismatch warning test to the new adapter-not-in-formats warning.
- Create `tests/types/public-api/deck-options.ts`
  Add type-level coverage for `output.formats` and removal of `output.format`.
- Modify `docs/superpowers/specs/2026-07-01-output-formats-design.md`
  Mark the design implemented after the final task.

---

### Task 1: Public Type And Validation Red Tests

**Files:**

- Modify: `tests/authoring/deck.test.tsx`
- Modify: `tests/pdf/public-surface.test.tsx`
- Create: `tests/types/public-api/deck-options.ts`

- [ ] **Step 1: Add runtime validation tests that currently fail**

In `tests/authoring/deck.test.tsx`, update the existing invalid output test and add explicit
`formats` validation cases near it:

```tsx
test("project reports deck output options outside the public authoring API", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { format: "odp", target: "deck.odp" },
  } as never);
  deck.slide(() => <p>invalid output</p>);

  const result = await deck.project();

  expect(result.ok).toBe(false);
  expect(result.projection).toBeUndefined();
  expect(result.diagnostics.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "E_DECK_INVALID_OUTPUT",
        message:
          "Deck output format is no longer part of the public authoring API. Use output.formats instead.",
      }),
      expect.objectContaining({
        code: "E_DECK_INVALID_OUTPUT",
        message: "Deck output target is not part of the public authoring API.",
      }),
    ]),
  );
  expect(result.stages.compile.artifact).toBe("missing");
  expect(result.stages.project.artifact).toBe("missing");
});

test("project reports invalid deck output formats arrays", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { formats: ["pptx", "odp", "pptx"] },
  } as never);
  deck.slide(() => <p>invalid formats</p>);

  const result = await deck.project();

  expect(result.ok).toBe(false);
  expect(result.projection).toBeUndefined();
  expect(result.diagnostics.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "E_DECK_INVALID_OUTPUT",
        message: 'Deck output formats[1] must be "pptx" or "pdf" in the public authoring API.',
      }),
      expect.objectContaining({
        code: "E_DECK_INVALID_OUTPUT",
        message: 'Deck output formats must not contain duplicate format "pptx".',
      }),
    ]),
  );
});

test("project accepts an empty output formats array as the default pptx target", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { formats: [] },
  });
  deck.slide(() => <p>empty formats</p>);

  const result = await deck.project({ inspection: "none" });

  expect(result.ok).toBe(true);
  expect(result.format).toBe("pptx");
  expect(result.projection?.format).toBe("pptx");
});
```

- [ ] **Step 2: Replace the existing PDF output preference test with `formats`**

In `tests/pdf/public-surface.test.tsx`, change:

```tsx
test("projects pdf for deck output preference", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { formats: ["pdf"] },
  });
  deck.slide({ name: "PDF" }, () => <p>PDF</p>);

  const result = await deck.project({ inspection: "none" });

  expectPdfProjectionAvailable(result);
});
```

- [ ] **Step 3: Add type-level public API tests**

Create `tests/types/public-api/deck-options.ts`:

```ts
import type { DeckOptions } from "deckjsx";

const multiOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: ["pptx", "pdf"] },
} satisfies DeckOptions;
void multiOutput;

const pdfOnlyOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: ["pdf"] },
} satisfies DeckOptions;
void pdfOnlyOutput;

const emptyFormatsOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: [] },
} satisfies DeckOptions;
void emptyFormatsOutput;

const removedFormatOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: {
    // @ts-expect-error output.format has been replaced by output.formats.
    format: "pdf",
  },
} satisfies DeckOptions;
void removedFormatOutput;
```

- [ ] **Step 4: Run focused tests to verify red**

Run:

```bash
./node_modules/.bin/vp test tests/authoring/deck.test.tsx tests/pdf/public-surface.test.tsx
./node_modules/.bin/vp check
```

Expected:

- Runtime tests fail because `output.formats` is not in the public API yet.
- Type check fails because `DeckOptions.output.formats` does not exist yet.

- [ ] **Step 5: Commit red tests**

```bash
git add tests/authoring/deck.test.tsx tests/pdf/public-surface.test.tsx tests/types/public-api/deck-options.ts
git commit -m "test: specify output formats option"
```

---

### Task 2: Output Formats Type And Validation Implementation

**Files:**

- Modify: `src/authoring/options/public.ts`
- Create: `src/authoring/options/output-formats.ts`
- Modify: `src/authoring/options/validation.ts`
- Test: `tests/authoring/deck.test.tsx`
- Test: `tests/types/public-api/deck-options.ts`

- [ ] **Step 1: Update the public type**

In `src/authoring/options/public.ts`, replace the output type with:

```ts
  /** Output artifact formats this Deck is expected to produce. */
  output?: {
    formats?: readonly ProjectionFormat[];
  };
```

- [ ] **Step 2: Add the shared helper**

Create `src/authoring/options/output-formats.ts`:

```ts
import type { ProjectionFormat } from "../../pipeline/contract";

export const DEFAULT_OUTPUT_FORMATS = ["pptx"] as const satisfies readonly ProjectionFormat[];

type OutputFormatSource = {
  readonly output?: {
    readonly formats?: readonly ProjectionFormat[];
  };
};

export function configuredOutputFormats(options: OutputFormatSource): readonly ProjectionFormat[] {
  const formats = options.output?.formats;
  return formats && formats.length > 0 ? formats : DEFAULT_OUTPUT_FORMATS;
}

export function implicitOutputFormat(options: OutputFormatSource): ProjectionFormat {
  return configuredOutputFormats(options)[0] ?? "pptx";
}

export function hasMultipleConfiguredOutputFormats(options: OutputFormatSource): boolean {
  return configuredOutputFormats(options).length > 1;
}

export function outputFormatsInclude(
  options: OutputFormatSource,
  format: ProjectionFormat,
): boolean {
  return configuredOutputFormats(options).includes(format);
}
```

- [ ] **Step 3: Update runtime option validation**

In `src/authoring/options/validation.ts`:

1. Change:

```ts
const outputKeys = ["format"] as const;
```

to:

```ts
const outputKeys = ["formats"] as const;
```

2. Replace the old `options.output.format` validation block with:

```ts
if ("format" in options.output) {
  diagnostics.push(
    deckOptionDiagnostic({
      code: "E_DECK_INVALID_OUTPUT",
      section: "output",
      path: "deck.options.output.format",
      message:
        "Deck output format is no longer part of the public authoring API. Use output.formats instead.",
    }),
  );
}

if (options.output.formats !== undefined) {
  if (!Array.isArray(options.output.formats)) {
    diagnostics.push(
      deckOptionDiagnostic({
        code: "E_DECK_INVALID_OUTPUT",
        section: "output",
        path: "deck.options.output.formats",
        message: "Deck output formats must be an array in the public authoring API.",
      }),
    );
  } else {
    const seenFormats = new Set<string>();
    for (const [index, format] of options.output.formats.entries()) {
      if (format !== "pptx" && format !== "pdf") {
        diagnostics.push(
          deckOptionDiagnostic({
            code: "E_DECK_INVALID_OUTPUT",
            section: "output",
            path: `deck.options.output.formats.${index}`,
            message: `Deck output formats[${index}] must be "pptx" or "pdf" in the public authoring API.`,
          }),
        );
        continue;
      }

      if (seenFormats.has(format)) {
        diagnostics.push(
          deckOptionDiagnostic({
            code: "E_DECK_INVALID_OUTPUT",
            section: "output",
            path: `deck.options.output.formats.${index}`,
            message: `Deck output formats must not contain duplicate format "${format}".`,
          }),
        );
      }
      seenFormats.add(format);
    }
  }
}
```

Important: keep the generic unknown-output-key loop before this block. It should report `format`
as unknown because `outputKeys` no longer includes it, and the explicit `"format" in options.output`
diagnostic should provide the migration message.

- [ ] **Step 4: Run focused tests**

Run:

```bash
./node_modules/.bin/vp test tests/authoring/deck.test.tsx
./node_modules/.bin/vp check
```

Expected:

- Runtime validation tests pass.
- `vp check` still fails until pipeline code stops referencing `options.output.format`.

- [ ] **Step 5: Commit**

```bash
git add src/authoring/options/public.ts src/authoring/options/output-formats.ts src/authoring/options/validation.ts tests/authoring/deck.test.tsx tests/types/public-api/deck-options.ts
git commit -m "feat: validate output formats option"
```

---

### Task 3: Implicit Target Selection And Multi-Format Warnings

**Files:**

- Modify: `src/deck.ts`
- Modify: `src/pipeline/runner.ts`
- Modify: `tests/pdf/public-surface.test.tsx`

- [ ] **Step 1: Add red tests for implicit multi-format behavior**

In `tests/pdf/public-surface.test.tsx`, add near the output preference tests:

```tsx
test("uses the first configured output format for implicit project with a warning", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { formats: ["pdf", "pptx"] },
  });
  deck.slide({ name: "PDF first" }, () => <p>PDF first</p>);

  const result = await deck.project({ inspection: "none" });

  expectPdfProjectionAvailable(result);
  expect(result.diagnostics.items).toContainEqual(
    expect.objectContaining({
      code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
      severity: "warning",
    }),
  );
});

test("uses the first configured output format for implicit render with a warning", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { formats: ["pdf", "pptx"] },
  });
  deck.slide({ name: "PDF first" }, () => <p>PDF first</p>);

  const result = await deck.render({ inspection: "none" });

  expect(result.ok).toBe(true);
  expect(result.artifact).toMatchObject({ format: "pdf", mediaType: "application/pdf" });
  expect(result.diagnostics.items).toContainEqual(
    expect.objectContaining({
      code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
      severity: "warning",
    }),
  );
});
```

- [ ] **Step 2: Update `src/deck.ts` implicit format helpers**

Import the helper:

```ts
import { implicitOutputFormat } from "./authoring/options/output-formats";
```

Replace:

```ts
function projectionFormatForOptions(options: DeckOptions, projectOptions?: ProjectOptions) {
  return projectOptions?.format ?? options.output?.format ?? "pptx";
}
```

with:

```ts
function projectionFormatForOptions(options: DeckOptions, projectOptions?: ProjectOptions) {
  return projectOptions?.format ?? implicitOutputFormat(options);
}
```

- [ ] **Step 3: Add warning diagnostics in `src/pipeline/runner.ts`**

Import the helper:

```ts
import {
  hasMultipleConfiguredOutputFormats,
  implicitOutputFormat,
  outputFormatsInclude,
} from "../authoring/options/output-formats";
```

Replace `projectionFormatFor(options: unknown)` with a typed helper:

```ts
function projectionFormatFor(options: DeckOptions): ProjectionFormat {
  return implicitOutputFormat(options);
}
```

Add a diagnostic helper near `writerAdapterFormatDiagnostics`:

```ts
function implicitFirstOutputFormatDiagnostics(input: {
  options: DeckOptions;
  format: ProjectionFormat;
  path: "project.format" | "render.format";
}): Diagnostics {
  if (!hasMultipleConfiguredOutputFormats(input.options)) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
      title: "implicit output format selected the first configured format",
      message:
        "This Deck declares multiple output formats, so deckjsx used output.formats[0] for this single-format call.",
      labels: [
        {
          path: input.path,
          message: `selected ${input.format} from output.formats[0]`,
        },
      ],
    }),
  ]);
}
```

- [ ] **Step 4: Combine implicit warnings into project results**

In `projectSource`, compute:

```ts
const projectionFormat =
  input.projectionFormat ?? input.projectOptions?.format ?? projectionFormatFor(input.options);
const implicitFormatDiagnostics =
  input.projectionFormat || input.projectOptions?.format
    ? emptyDiagnostics()
    : implicitFirstOutputFormatDiagnostics({
        options: input.options,
        format: projectionFormat,
        path: "project.format",
      });
```

Then include `implicitFormatDiagnostics` in every diagnostics combination returned by `projectSource`,
including:

- option-validation early return diagnostics
- execution-diagnostics early return diagnostics
- defined-projection diagnostics
- normal projection diagnostics
- catch/partial projection diagnostics

For the normal projection path, the final diagnostics should include it like:

```ts
const diagnostics = combineDiagnostics(
  implicitFormatDiagnostics,
  compileResult.diagnostics,
  assetDiagnostics,
  beforeProjectDiagnostics,
  unsupportedProjectionDiagnostics,
  unsupportedProjectionModelDiagnostics,
  projectionDiagnostics,
  createDiagnostics(afterProject.diagnostics),
);
```

- [ ] **Step 5: Combine implicit warnings into render results**

In `renderSource`, after:

```ts
const projectionFormat = projectionFormatFor(input.options);
```

add:

```ts
const implicitFormatDiagnostics =
  input.renderInput === undefined
    ? implicitFirstOutputFormatDiagnostics({
        options: input.options,
        format: projectionFormat,
        path: "render.format",
      })
    : emptyDiagnostics();
```

Use `implicitFormatDiagnostics` in early render returns and in the final `projectDiagnostics`:

```ts
const projectDiagnostics = combineDiagnostics(
  projectResult.diagnostics,
  formatDiagnostics,
  implicitFormatDiagnostics,
);
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/public-surface.test.tsx
./node_modules/.bin/vp check
```

Expected: all focused tests and type checks pass except tests still expecting the old adapter mismatch behavior.

- [ ] **Step 7: Commit**

```bash
git add src/deck.ts src/pipeline/runner.ts tests/pdf/public-surface.test.tsx
git commit -m "feat: select implicit output format from formats"
```

---

### Task 4: Explicit Adapter Membership Diagnostics

**Files:**

- Modify: `src/pipeline/runner.ts`
- Modify: `tests/pptx/project-render-pipeline/fallback-summaries/inspection-and-origin.test.tsx`
- Modify: `tests/pdf/public-surface.test.tsx`

- [ ] **Step 1: Replace old mismatch test with new membership semantics**

In `tests/pptx/project-render-pipeline/fallback-summaries/inspection-and-origin.test.tsx`, replace
the expectation for `W_RENDER_ADAPTER_FORMAT_MISMATCH` with:

```tsx
expect(result.diagnostics.items).toContainEqual(
  expect.objectContaining({
    code: "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
    severity: "warning",
  }),
);
```

Also update the test setup to use:

```tsx
const deck = new H.Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: ["pptx"] },
});
```

The explicit adapter should still render successfully, but warn because `"pdf"` is not in
`output.formats`.

- [ ] **Step 2: Add positive no-warning test for multi-format explicit adapters**

In `tests/pdf/public-surface.test.tsx`, add:

```tsx
test("renders explicit pptx and pdf adapters without membership warnings when both formats are configured", async () => {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    output: { formats: ["pptx", "pdf"] },
  });
  deck.slide({ name: "Both formats" }, () => <p>Both formats</p>);

  const pptxResult = await deck.render(pptx({ inspection: "none" }));
  const pdfResult = await deck.render(pdf({ inspection: "none" }));

  expect(pptxResult.ok).toBe(true);
  expect(pdfResult.ok).toBe(true);
  expect(pptxResult.artifact?.format).toBe("pptx");
  expect(pdfResult.artifact?.format).toBe("pdf");
  expect(pptxResult.diagnostics.items.map((item) => item.code)).not.toContain(
    "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
  );
  expect(pdfResult.diagnostics.items.map((item) => item.code)).not.toContain(
    "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
  );
  expect(pdfResult.diagnostics.items.map((item) => item.code)).not.toContain(
    "W_RENDER_ADAPTER_FORMAT_MISMATCH",
  );
});
```

Replace the existing adapter import in `tests/pdf/public-surface.test.tsx` with:

```ts
import { pdf, pptx } from "@/src/adapter";
```

- [ ] **Step 3: Replace `writerAdapterFormatDiagnostics` implementation**

In `src/pipeline/runner.ts`, replace the old mismatch helper with:

```ts
function writerAdapterFormatDiagnostics(input: {
  adapter: WriterAdapter;
  options: DeckOptions;
}): Diagnostics {
  const adapterFormat = input.adapter.format;

  if (outputFormatsInclude(input.options, adapterFormat)) {
    return emptyDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "warning",
      code: "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
      title: "writer adapter format is not configured for deck output",
      message:
        "The selected Writer Adapter format is not listed in this Deck's output.formats configuration.",
      labels: [
        {
          path: "render.adapter.format",
          message: `adapter=${adapterFormat}, output.formats=${configuredOutputFormats(input.options).join(",")}`,
        },
      ],
    }),
  ]);
}
```

Import `configuredOutputFormats` from `../authoring/options/output-formats`.

Update the call site from:

```ts
const formatDiagnostics = writerAdapterFormatDiagnostics({
  adapter,
  deckFormat: projectionFormat,
});
```

to:

```ts
const formatDiagnostics = writerAdapterFormatDiagnostics({
  adapter,
  options: input.options,
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
./node_modules/.bin/vp test tests/pptx/project-render-pipeline/fallback-summaries/inspection-and-origin.test.tsx tests/pdf/public-surface.test.tsx
./node_modules/.bin/vp check
```

Expected: focused tests and type checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/runner.ts tests/pptx/project-render-pipeline/fallback-summaries/inspection-and-origin.test.tsx tests/pdf/public-surface.test.tsx
git commit -m "feat: validate explicit adapters against output formats"
```

---

### Task 5: Migration Cleanup And Documentation Alignment

**Files:**

- Modify: `docs/superpowers/specs/2026-07-01-output-formats-design.md`
- Modify: any tests still containing `output: { format: ... }`

- [ ] **Step 1: Find and remove old `output.format` references**

Run:

```bash
rg -n "output: \\{ format|output\\.format|W_RENDER_ADAPTER_FORMAT_MISMATCH" src tests plugins docs -g '*.ts' -g '*.tsx' -g '*.md'
```

Expected remaining references after cleanup:

- `docs/superpowers/specs/2026-07-01-output-formats-design.md` may mention `output.format` only as removed historical shape.
- `tests/authoring/deck.test.tsx` may mention `output.format` only in invalid migration diagnostics.

- [ ] **Step 2: Mark output formats design implemented**

In `docs/superpowers/specs/2026-07-01-output-formats-design.md`, change the status to:

```md
Implemented. Deck output configuration uses `output.formats`; no-arg `deck.project()` and
`deck.render()` select `formats[0]` and warn when multiple formats are configured, while explicit
writer adapters are valid when their format is included in the configured set.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
./node_modules/.bin/vp check
./node_modules/.bin/vp test
./node_modules/.bin/vp run build
git diff --check
```

Expected:

- `vp check` passes.
- `vp test` passes.
- `vp run build` passes. Do not use raw `vp build` for this repository; package build is wired through `vp run build`.
- `git diff --check` prints no output.

- [ ] **Step 4: Commit**

```bash
git add src tests docs
git commit -m "docs: align output formats migration"
```

---

## Self-Review Notes

- Spec coverage: `formats` public shape, removal of `format`, explicit adapter rendering, no
  `renderAll()` or `renderMany()`, no-arg first-format behavior, warnings, validation, and tests all
  have implementation tasks.
- Type consistency: the plan uses `output.formats`, `configuredOutputFormats`,
  `implicitOutputFormat`, `W_OUTPUT_FORMATS_IMPLICIT_FIRST`, and
  `W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED` consistently.
- Scope: this plan intentionally does not add a multi-artifact render API and does not change
  `deck.render(adapter)` return types.

# Node v0.1.4 Dev Console Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first vertical slice of the v0.1.4 human-first dev console: strict CLI parsing, separated help output, removal of `--short`, shared human renderers, stderr-oriented console output, and non-JSON interactive command rendering.

**Architecture:** Keep compiler/session behavior structured, but route user-visible text through focused renderer modules. This foundation does not implement the full component/props inspection store yet; it prepares the console and parser boundaries that later inspector work will use.

**Tech Stack:** TypeScript, Vite+ test runner (`vp test`), existing `@deckjsx/node` CLI and interactive session modules.

---

### Task 1: Strict Dev CLI Parsing And Help Modes

**Files:**

- Modify: `plugins/node/src/cli.ts`
- Modify: `plugins/node/tests/cli.test.ts`

- [x] **Step 1: Write the failing parser tests**

Replace the existing short-mode parser test in `plugins/node/tests/cli.test.ts` with tests that prove `--short` is gone, unknown flags are errors, extra positional outputs remain allowed, and help modes parse without requiring entry or `--out`.

```ts
test("parses dev entry, required out, extra output paths, and interactive mode", () => {
  expect(
    parseDeckjsxNodeCliArgs([
      "dev",
      "main.tsx",
      "--out",
      "output.pptx",
      "components.pptx",
      "--interactive",
    ]),
  ).toEqual({
    ok: true,
    command: "dev",
    entry: "main.tsx",
    out: "output.pptx",
    outputs: ["output.pptx", "components.pptx"],
    interactive: true,
  });
});

test("parses dev help modes without entry or out", () => {
  expect(parseDeckjsxNodeCliArgs(["dev", "--help"])).toEqual({
    ok: true,
    command: "dev.help",
  });
  expect(parseDeckjsxNodeCliArgs(["dev", "--interactive-help"])).toEqual({
    ok: true,
    command: "dev.interactiveHelp",
  });
});

test("rejects removed short mode and unknown dev options", () => {
  expect(parseDeckjsxNodeCliArgs(["dev", "main.tsx", "--out", "out.pptx", "--short"])).toEqual({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        code: "deckjsx.node.cli.unknownOption",
        title: "Unknown deckjsx dev option.",
        message: "--short",
      }),
    ],
  });
  expect(
    parseDeckjsxNodeCliArgs(["dev", "main.tsx", "--out", "out.pptx", "--interacitve"]),
  ).toEqual({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        code: "deckjsx.node.cli.unknownOption",
        message: "--interacitve",
        help: ["Did you mean --interactive?"],
      }),
    ],
  });
});
```

- [x] **Step 2: Run the parser tests and verify RED**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts
```

Expected: tests fail because `detail` and `--short` still exist, help modes are not parsed, and unknown options are not strict.

- [x] **Step 3: Implement CLI parse shape**

Update `DeckjsxNodeCliParseResult` in `plugins/node/src/cli.ts` so success can be `dev`, `dev.help`, or `dev.interactiveHelp`, and remove `DeckjsxNodeCliDetail` from the public parse result. Treat any token beginning with `--` other than `--out`, `--interactive`, `--help`, and `--interactive-help` as `deckjsx.node.cli.unknownOption`.

- [x] **Step 4: Run the parser tests and verify GREEN**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts
```

Expected: parser tests pass or remaining failures are from formatter/host expectations covered in later tasks.

### Task 2: Human Diagnostic And Help Rendering

**Files:**

- Create: `plugins/node/src/dev-console/render.ts`
- Modify: `plugins/node/src/cli.ts`
- Modify: `plugins/node/tests/cli.test.ts`

- [x] **Step 1: Write failing renderer tests**

Update the diagnostics formatting test to call a human renderer without summary mode:

```ts
expect(formatDeckjsxNodeDiagnostics(diagnostics)).toEqual([
  "error deckjsx.node.dev.failed",
  "  Render failed.",
  "  The generated entry could not be imported.",
  "  --> /project/src/main.tsx:12:7",
  "12 | const result = renderDeck();",
  "   |       ^^^^^^ while importing the generated entry module",
  "  phase       entry",
  "  compilation 2",
  "  note        The previous successful artifact state is still retained.",
  "  help        Fix the entry module and save again.",
]);
```

Add tests for help output:

```ts
expect(formatDeckjsxDevHelp()).toContain("Usage");
expect(formatDeckjsxDevHelp()).toContain(
  "deckjsx dev <entry> --out <path> [extra output paths...]",
);
expect(formatDeckjsxInteractiveHelp()).toContain("component inspect <target>");
```

- [x] **Step 2: Run renderer tests and verify RED**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts
```

Expected: tests fail because only the old diagnostic formatter exists.

- [x] **Step 3: Implement renderer module**

Create `plugins/node/src/dev-console/render.ts` with pure functions:

```ts
export function formatDeckjsxDevHelp(): readonly string[] { ... }
export function formatDeckjsxInteractiveHelp(): readonly string[] { ... }
export function formatDeckjsxNodeDiagnostics(diagnostics: readonly DeckjsxNodeCliDiagnostic[]): readonly string[] { ... }
export function renderInteractiveResponse(response: InteractiveResponse): readonly string[] { ... }
```

Keep color disabled in unit tests by making color an optional renderer concern later; this first slice locks text structure and alignment.

- [x] **Step 4: Wire CLI imports to renderer**

Move or re-export `formatDeckjsxNodeDiagnostics` from `cli.ts` so existing imports continue to work while implementation lives in `dev-console/render.ts`.

- [x] **Step 5: Run renderer tests and verify GREEN**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts
```

Expected: formatter/help tests pass.

### Task 3: Dev Compiler Host Uses Human Console Output

**Files:**

- Modify: `plugins/node/src/cli.ts`
- Modify: `plugins/node/tests/cli.test.ts`

- [x] **Step 1: Write failing host output tests**

Replace the short diagnostics host test with a human output expectation:

```ts
expect(lines).toEqual([
  "error deckjsx.node.dev.bundleFailed",
  "  Bundle failed.",
  "  bundle exploded",
]);
```

Add a successful lifecycle test that expects started/ready style lines after a successful compilation result:

```ts
expect(lines.some((line) => line.includes("[deckjsx] dev started"))).toBe(true);
expect(lines.some((line) => line.includes("[deckjsx] ready"))).toBe(true);
```

- [x] **Step 2: Run host tests and verify RED**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts
```

Expected: old host only prints diagnostic JSON summary and no lifecycle lines.

- [x] **Step 3: Implement minimal console event output**

In `runDeckjsxDevCompilerHost`, write a started line after `compiler.start()`, render diagnostic events with the new formatter, and render a concise ready/blocked line after each `runNextCompilation()` result. Keep the implementation small and pure enough to extract a full `ConsoleCoordinator` in later tasks.

- [x] **Step 4: Run host tests and verify GREEN**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts
```

Expected: host tests pass.

### Task 4: Interactive Loop Uses Human Rendering Instead Of JSON

**Files:**

- Modify: `plugins/node/src/interactive/repl.ts`
- Modify: `plugins/node/tests/interactive-repl.test.ts`
- Modify: `plugins/node/tests/cli.test.ts`

- [x] **Step 1: Write failing interactive rendering tests**

Change the interactive loop test to assert plain human lines:

```ts
expect(output).toEqual(["ok session.status", "ok selection.resolve"]);
```

Keep dispatch command expectations unchanged.

- [x] **Step 2: Run interactive tests and verify RED**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/interactive-repl.test.ts plugins/node/tests/cli.test.ts
```

Expected: tests fail because loop still writes `JSON.stringify`.

- [x] **Step 3: Implement response renderer injection**

Change `runInteractiveDevCommandLoop` to accept an optional `renderResponse` function and default to the shared human response renderer. For parse errors, render a human error line rather than JSON.

- [x] **Step 4: Run interactive tests and verify GREEN**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/interactive-repl.test.ts plugins/node/tests/cli.test.ts
```

Expected: interactive tests pass with human output.

### Task 5: Focused Validation

**Files:**

- No new files.

- [x] **Step 1: Run focused plugin tests**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/cli.test.ts plugins/node/tests/interactive-repl.test.ts plugins/node/tests/interactive-dev-session.test.ts plugins/node/tests/interactive-cli-smoke.test.ts
```

Expected: all focused tests pass.

- [x] **Step 2: Run type/lint check**

Run:

```bash
./node_modules/.bin/vp check
```

Expected: pass.

- [ ] **Step 3: Commit foundation slice**

```bash
git add plugins/node/src plugins/node/tests docs/superpowers/plans/2026-06-20-node-0-1-4-dev-console-foundation.md
git commit -m "feat(node): add human-first dev console foundation"
```

Expected: one implementation commit containing the first v0.1.4 foundation slice.

---

## Self-Review

- Spec coverage in this foundation slice: normal dev console output, `--short` removal, strict CLI options, separated help, stderr-oriented human output path, and JSON removal from interactive loop.
- Deferred to later plans: terminal raw-mode input highlighting, completion providers, Node Dev Inspection Store, Dev Instrumentation Runtime, component/props search/filter/diff, style cascade detail, impact tree.
- No placeholders remain in this plan; each task has concrete files, tests, commands, and expected outcomes.

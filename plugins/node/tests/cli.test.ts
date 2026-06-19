import { describe, expect, test } from "vite-plus/test";
import type { DeckjsxNodeCliDiagnostic } from "../src/cli.ts";
import type { DeckjsxDevCompilationResult } from "../src/dev-compilation.ts";
import type { IncrementalArtifactSession } from "deckjsx/integration";
import {
  devWatchFiles,
  devWriteRecords,
  formatDeckjsxNodeDiagnostics,
  parseDeckjsxNodeCliArgs,
  runDeckjsxDevCompilerHost,
} from "../src/cli.ts";

function asCompilationResult(value: unknown): DeckjsxDevCompilationResult {
  return value as DeckjsxDevCompilationResult;
}

describe("@deckjsx/node cli", () => {
  test("parses dev entry, required out, extra output paths, and short diagnostics", () => {
    const parsed = parseDeckjsxNodeCliArgs([
      "dev",
      "main.tsx",
      "--out",
      "output.pptx",
      "components.pptx",
      "--short",
      "--interactive",
    ]);

    expect(parsed).toEqual({
      ok: true,
      command: "dev",
      entry: "main.tsx",
      out: "output.pptx",
      outputs: ["output.pptx", "components.pptx"],
      detail: "summary",
      interactive: true,
    });
  });

  test("requires --out for dev", () => {
    expect(parseDeckjsxNodeCliArgs(["dev", "main.tsx"])).toEqual({
      ok: false,
      detail: "details",
      diagnostics: [
        {
          severity: "error",
          code: "deckjsx.node.cli.missingOut",
          title: "deckjsx dev requires --out <path>.",
        },
      ],
    });
  });

  test("formats detailed and short diagnostics", () => {
    const diagnostics = [
      {
        severity: "error" as const,
        code: "deckjsx.node.dev.failed",
        title: "Render failed.",
        message: "The generated entry could not be imported.",
        primary: {
          file: "/project/src/main.tsx",
          line: 12,
          column: 7,
          sourceLine: "const result = renderDeck();",
          spanLength: 6,
        },
        phase: "entry",
        compilation: 2,
        labels: [{ message: "while importing the generated entry module" }],
        notes: ["The previous successful artifact state is still retained."],
        help: ["Fix the entry module and save again."],
      },
    ] satisfies readonly DeckjsxNodeCliDiagnostic[];

    expect(formatDeckjsxNodeDiagnostics(diagnostics, "summary")).toEqual([
      '["deckjsx.node.dev.failed"]',
    ]);
    expect(formatDeckjsxNodeDiagnostics(diagnostics, "details")).toEqual([
      "error[deckjsx.node.dev.failed]: Render failed.",
      "  The generated entry could not be imported.",
      "  --> /project/src/main.tsx:12:7",
      "12 | const result = renderDeck();",
      "   |       ^^^^^^ while importing the generated entry module",
      "   = phase: entry",
      "   = compilation: 2",
      "   = note: The previous successful artifact state is still retained.",
      "   = help: Fix the entry module and save again.",
    ]);
  });

  test("filters generated outputs, lock files, and temp bundles from dev watch files", () => {
    expect(
      devWatchFiles({
        cwd: "/project",
        files: [
          "/project/src/main.tsx",
          "/project/output.pptx",
          "/project/.output.pptx.deckjsx-lock",
          "/project/.deckjsx/dev/bundle.mjs",
        ],
        outputs: ["output.pptx"],
      }),
    ).toEqual(["/project/src/main.tsx"]);
  });

  test("tracks only --out writes while allowing extra output writes", () => {
    expect(
      devWriteRecords({
        cwd: "/project",
        out: "output.pptx",
        writes: [
          { cycle: 1, slot: 0, path: "/project/output.pptx", result: { status: "created" } },
          { cycle: 1, slot: 1, path: "/project/components.pptx", result: { status: "created" } },
        ],
      }),
    ).toEqual([
      { path: "/project/output.pptx", tracked: true, result: { status: "created" } },
      { path: "/project/components.pptx", tracked: false, result: { status: "created" } },
    ]);
  });

  test("hosts the dev compiler and prints short diagnostics from compiler events", async () => {
    const lines: string[] = [];
    const calls: string[] = [];
    let listener:
      | ((event: {
          readonly type: "diagnostic";
          readonly diagnostic: DeckjsxNodeCliDiagnostic;
        }) => void)
      | undefined;

    await runDeckjsxDevCompilerHost({
      detail: "summary",
      maxCompilations: 1,
      writeLine(line) {
        lines.push(line);
      },
      compiler: {
        on(nextListener) {
          listener = nextListener as typeof listener;
          return () => undefined;
        },
        start() {
          calls.push("start");
        },
        invalidate() {},
        async runNextCompilation() {
          listener?.({
            type: "diagnostic",
            diagnostic: {
              severity: "error",
              code: "deckjsx.node.dev.bundleFailed",
              title: "Bundle failed.",
              message: "bundle exploded",
            },
          });
          return {
            ok: false,
            status: "bundleFailed",
            compilation: 1,
            sourceSnapshot: {
              status: "diagnostic",
              diagnostics: [
                {
                  severity: "error",
                  code: "deckjsx.node.dev.bundleFailed",
                  title: "Bundle failed.",
                  message: "bundle exploded",
                },
              ],
            },
            diagnostics: [
              {
                severity: "error",
                code: "deckjsx.node.dev.bundleFailed",
                title: "Bundle failed.",
                message: "bundle exploded",
              },
            ],
          };
        },
        async close() {
          calls.push("close");
        },
      },
    });

    expect(calls).toEqual(["start", "close"]);
    expect(lines).toEqual(['["deckjsx.node.dev.bundleFailed"]']);
  });

  test("hosts an interactive session alongside the dev compiler", async () => {
    const calls: string[] = [];

    await runDeckjsxDevCompilerHost({
      detail: "summary",
      interactive: true,
      maxCompilations: 1,
      createInteractiveSession() {
        calls.push("interactive:start");
        return {
          async dispatch() {
            return { ok: true, result: undefined };
          },
          close() {
            calls.push("interactive:close");
          },
        };
      },
      compiler: {
        on() {
          return () => undefined;
        },
        start() {
          calls.push("compiler:start");
        },
        invalidate() {},
        async runNextCompilation() {
          return asCompilationResult({
            ok: true,
            status: "artifactUpdated",
            compilation: 1,
            diagnostics: [],
          });
        },
        async close() {
          calls.push("compiler:close");
        },
      },
    });

    expect(calls).toEqual([
      "interactive:start",
      "compiler:start",
      "interactive:close",
      "compiler:close",
    ]);
  });

  test("dispatches interactive input lines through the compiler host", async () => {
    const output: string[] = [];
    const commands: unknown[] = [];

    await runDeckjsxDevCompilerHost({
      detail: "summary",
      interactive: true,
      interactiveLines: (async function* () {
        yield "status";
        yield "exit";
      })(),
      interactiveWriteLine(line) {
        output.push(line);
      },
      createInteractiveSession() {
        return {
          async dispatch(command) {
            commands.push(command);
            return { ok: true, result: { method: command.method } };
          },
          close() {},
        };
      },
      maxCompilations: 1,
      compiler: {
        on() {
          return () => undefined;
        },
        start() {},
        invalidate() {},
        async runNextCompilation() {
          return asCompilationResult({
            ok: true,
            status: "artifactUpdated",
            compilation: 1,
            diagnostics: [],
          });
        },
        async close() {},
      },
    });

    expect(commands).toEqual([{ method: "session.status" }]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { ok: true, result: { method: "session.status" } },
    ]);
  });

  test("passes artifact session to the default interactive session factory boundary", async () => {
    const artifactSession = {
      cycle: 0,
      beginCycle() {
        throw new Error("not used");
      },
      retainArtifactSlots() {},
      snapshot() {
        return { cycle: 0, writes: [] };
      },
      inspectArtifacts() {
        return {
          retainedSlots() {
            return [];
          },
          graphNode() {
            return undefined;
          },
          projectionForSlot() {
            return undefined;
          },
          firstProjection() {
            return undefined;
          },
        };
      },
    } as unknown as IncrementalArtifactSession;
    let receivedArtifactSession: IncrementalArtifactSession | undefined;

    await runDeckjsxDevCompilerHost({
      detail: "summary",
      interactive: true,
      artifactSession,
      maxCompilations: 1,
      createInteractiveSession(input) {
        receivedArtifactSession = input.artifactSession;
        return {
          async dispatch() {
            return { ok: true, result: undefined };
          },
          close() {},
        };
      },
      compiler: {
        on() {
          return () => undefined;
        },
        start() {},
        invalidate() {},
        async runNextCompilation() {
          return asCompilationResult({
            ok: true,
            status: "artifactUpdated",
            compilation: 1,
            diagnostics: [],
          });
        },
        async close() {},
      },
    });

    expect(receivedArtifactSession).toBe(artifactSession);
  });
});

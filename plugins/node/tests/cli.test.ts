import { styleText } from "node:util";
import { describe, expect, test, vi } from "vite-plus/test";
import type { DeckjsxNodeCliDiagnostic } from "@/src/cli.ts";
import type { DeckjsxDevCompilationResult } from "@/src/dev-compilation.ts";
import type { IncrementalArtifactSession } from "deckjsx/integration";
import {
  completionContextFromInspectionState,
  devWatchFiles,
  devWriteRecords,
  formatDeckjsxDevConsoleEvent,
  formatDeckjsxDevHelp,
  formatDeckjsxInteractiveHelp,
  formatDeckjsxNodeDiagnostics,
  parseDeckjsxNodeCliArgs,
  renderInteractiveResponse,
  runDeckjsxDevCompilerHost,
} from "@/src/cli.ts";

function asCompilationResult(value: unknown): DeckjsxDevCompilationResult {
  return value as DeckjsxDevCompilationResult;
}

function pendingInteractiveLines(): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          return new Promise<IteratorResult<string>>(() => undefined);
        },
      };
    },
  };
}

describe("@deckjsx/node cli", () => {
  test("parses config-driven dev and interactive mode", () => {
    expect(parseDeckjsxNodeCliArgs(["dev", "--interactive"])).toEqual({
      ok: true,
      command: "dev",
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
    expect(parseDeckjsxNodeCliArgs(["dev", "--short"])).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "deckjsx.node.cli.unknownOption",
          title: "Unknown deckjsx dev option.",
          message: "--short",
        }),
      ],
    });
    expect(parseDeckjsxNodeCliArgs(["dev", "--interacitve"])).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "deckjsx.node.cli.unknownOption",
          message: "--interacitve",
          help: ["Did you mean --interactive?"],
        }),
      ],
    });
    expect(parseDeckjsxNodeCliArgs(["dev", "--interactve"])).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "deckjsx.node.cli.unknownOption",
          message: "--interactve",
          help: ["Did you mean --interactive?"],
        }),
      ],
    });
    expect(parseDeckjsxNodeCliArgs(["dev", "--interactive-hepl"])).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "deckjsx.node.cli.unknownOption",
          message: "--interactive-hepl",
          help: ["Did you mean --interactive-help?"],
        }),
      ],
    });
    expect(parseDeckjsxNodeCliArgs(["dev", "-s"])).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "deckjsx.node.cli.unknownOption",
          title: "Unknown deckjsx dev option.",
          message: "-s",
        }),
      ],
    });
    expect(parseDeckjsxNodeCliArgs(["dev", "--help", "--badflag"])).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "deckjsx.node.cli.unknownOption",
          message: "--badflag",
        }),
      ],
    });
  });

  test("rejects positional entry and output arguments", () => {
    expect(parseDeckjsxNodeCliArgs(["dev", "main.tsx"])).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "deckjsx.node.cli.unexpectedArgument",
          title: "deckjsx dev reads entry and output from deckjsx.config.ts.",
        },
      ],
    });
  });

  test("formats human diagnostics and help output", () => {
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
    expect(formatDeckjsxDevHelp()).toEqual(
      expect.arrayContaining(["Usage", "  deckjsx dev [--interactive]"]),
    );
    expect(formatDeckjsxInteractiveHelp()).toEqual(
      expect.arrayContaining([
        "  component inspect <target>",
        "  props inspect <target> [path]",
        "  projection [@slot] [slideIndex] [elementIndex]",
      ]),
    );
  });

  test("formats dev console events with restrained ANSI colors when requested", () => {
    const lines = formatDeckjsxDevConsoleEvent(
      {
        kind: "dev.ready",
        compilation: 1,
        changedSourceIds: ["/project/src/main.tsx"],
        diagnostics: [],
        writes: [{ path: "/project/output.pptx", tracked: true, result: { status: "patched" } }],
      },
      { color: true, cwd: "/project" },
    );

    expect(lines[0]).toContain(styleText("cyan", "[deckjsx]", { validateStream: false }));
    expect(lines[0]).toContain(styleText("green", "ready", { validateStream: false }));
    expect(lines[0]).toContain("1 output");
    expect(lines[1]).toBe(
      `  ${styleText("dim", "changed     ", { validateStream: false })}src/main.tsx`,
    );
    expect(lines[2]).toBe(
      `  ${styleText("dim", "output", { validateStream: false })}  ${styleText("dim", "output.pptx", { validateStream: false })}    ${styleText("green", "patched", { validateStream: false })}`,
    );
  });

  test("does not render structurally similar interactive payloads without a result kind", () => {
    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          target: "component:Header:1",
          status: "available",
          changes: [{ path: "title", before: "A", after: "B" }],
        },
      }),
    ).toEqual(["ok"]);
  });

  test("renders interactive inspector payloads as readable command output", () => {
    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.tree",
          status: "partial",
          compilation: 2,
          items: [
            {
              id: "component:Deck:1",
              name: "Deck",
              childIds: ["component:Header:1"],
              propsSummary: {},
            },
            {
              id: "component:Header:1",
              name: "Header",
              parentId: "component:Deck:1",
              childIds: [],
              propsSummary: { title: "Q5" },
            },
          ],
        },
      }),
    ).toEqual([
      "ok component.tree",
      "  status      partial",
      "  compilation 2",
      "  Deck component:Deck:1",
      "    Header component:Header:1",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.tree",
          status: "unavailable",
          items: [],
        },
      }),
    ).toEqual(["ok component.tree", "  status      unavailable", "  components  0"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "diagnostics.explain",
          index: 0,
          diagnostic: {
            severity: "error",
            code: "E_HEADER",
            title: "Header failed",
            message: "bad header",
            primary: { file: "/project/src/slides.tsx", line: 12, column: 4 },
          },
          relatedComponents: [
            {
              id: "component:Header:1",
              name: "Header",
              impact: { status: "available", elementCount: 1 },
            },
          ],
          hints: ["component inspect component:Header:1", "component impact component:Header:1"],
        },
      }),
    ).toEqual([
      "ok diagnostics.explain",
      "  index       0",
      "error E_HEADER",
      "  Header failed",
      "  bad header",
      "  --> /project/src/slides.tsx:12:4",
      "  component   Header component:Header:1",
      "  impact      available, 1 element",
      "  see         component inspect component:Header:1",
      "  see         component impact component:Header:1",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.filter",
          items: [
            {
              id: "component:Header:1",
              name: "Header",
              childIds: [],
              propsSummary: { title: "Q5" },
            },
          ],
        },
      }),
    ).toEqual(["ok component.filter", "  Header component:Header:1"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.filter",
          items: [],
        },
      }),
    ).toEqual(["ok component.filter", "  results     0"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "diagnostics.list",
          compilation: 7,
          items: [
            {
              index: 0,
              severity: "error",
              code: "deckjsx.node.dev.entryFailed",
              title: "Entry failed.",
              phase: "entry",
            },
            {
              index: 1,
              severity: "warning",
              code: "deckjsx.node.dev.layoutFallback",
              title: "Layout fallback.",
            },
          ],
        },
      }),
    ).toEqual([
      "ok diagnostics.list",
      "  compilation 7",
      "  [0] error   deckjsx.node.dev.entryFailed Entry failed. (entry)",
      "  [1] warning deckjsx.node.dev.layoutFallback Layout fallback.",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "diagnostics.list",
          compilation: 8,
          items: [],
        },
      }),
    ).toEqual(["ok diagnostics.list", "  compilation 8", "  diagnostics 0"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "session.status",
          compilerStarted: true,
          compilerClosed: false,
          lastCompilation: 4,
          lastSuccessfulCompilation: 3,
          skippedFailedAttempts: 1,
        },
      }),
    ).toEqual([
      "ok session.status",
      "  compiler    running",
      "  last        compilation 4",
      "  success     compilation 3",
      "  skipped     1 failed attempt",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "session.timings",
          compilerUptimeMs: 1250,
          lastCompilationDurationMs: 84,
          commandCount: 3,
          lastCommandLatencyMs: 7,
        },
      }),
    ).toEqual([
      "ok session.timings",
      "  uptime      1250ms",
      "  compile     84ms",
      "  commands    3",
      "  latency     7ms",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "diagnostics.explain",
          index: 0,
          diagnostic: {
            severity: "error",
            code: "E_ENTRY",
            title: "Entry failed",
            message: "render exploded",
          },
          relatedComponents: [],
          inspection: {
            status: "partial",
            compilation: 7,
            devStatus: "entryFailed",
            boundary: "entry",
            componentCount: 0,
            reason: "No component inspection snapshots were recorded before the entry boundary.",
          },
          hints: [],
        },
      }),
    ).toEqual([
      "ok diagnostics.explain",
      "  index       0",
      "error E_ENTRY",
      "  Entry failed",
      "  render exploded",
      "  context     inspection partial at entry (entryFailed, compilation 7)",
      "  reason      No component inspection snapshots were recorded before the entry boundary.",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.inspect",
          id: "component:Header:1",
          name: "Header",
          source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
          propsSummary: { title: "Q5", items: { kind: "array", length: 3 } },
          childIds: ["component:Metric:1"],
          graphNodeIds: ["header-node"],
          diagnostics: [{ index: 0, code: "E_HEADER", title: "Header failed" }],
          impact: { status: "available", elementCount: 1 },
          hints: ["props inspect component:Header:1", "component impact component:Header:1"],
        },
      }),
    ).toEqual([
      "ok component.inspect",
      "  id          component:Header:1",
      "  name        Header",
      "  source      /project/src/slides.tsx:12:4",
      '  props       title=Q5, items={"kind":"array","length":3}',
      "  children    component:Metric:1",
      "  graph nodes header-node",
      "  diagnostic  [0] E_HEADER Header failed",
      "  impact      available, 1 element",
      "  see         props inspect component:Header:1",
      "  see         component impact component:Header:1",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.diff",
          target: "component:Header:1",
          changes: [{ path: "props.title", before: "Q4", after: "Q5" }],
        },
      }),
    ).toEqual([
      "ok component.diff",
      "  target component:Header:1",
      "  props.title",
      "    before Q4",
      "    after  Q5",
    ]);

    const circularValue: Record<string, unknown> = { name: "hero" };
    circularValue.self = circularValue;
    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "props.inspect",
          target: "component:Header:1",
          path: "theme",
          value: circularValue,
        },
      }),
    ).toEqual([
      "ok props.inspect",
      "  target component:Header:1",
      "  path   theme",
      '  value  {"name":"hero","self":"[Circular]"}',
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "props.inspect",
          target: "component:Header:1\u001b[31m",
          path: "title\u0007",
          value: "BEGIN\u001b]52;c;ZGVja2pzeA==\u0007\u001b[31mRED\u001b[0mEND",
        },
      }),
    ).toEqual([
      "ok props.inspect",
      "  target component:Header:1\\x1b[31m",
      "  path   title\\x07",
      "  value  BEGIN\\x1b]52;c;ZGVja2pzeA==\\x07\\x1b[31mRED\\x1b[0mEND",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.diff",
          target: "component:Header:1",
          changes: [],
        },
      }),
    ).toEqual(["ok component.diff", "  target component:Header:1", "  changes     0"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.impact",
          target: "projection:@0:0:0",
          status: "available",
          diagnostic: { index: 0, code: "E_HEADER", title: "Header failed" },
          graphNodeIds: ["header-node"],
          components: [{ id: "component:Header:1", name: "Header" }],
          elements: [
            {
              slot: 0,
              slideIndex: 0,
              elementIndex: 0,
              element: { id: "header-el", kind: "text" },
            },
          ],
        },
      }),
    ).toEqual([
      "ok component.impact",
      "  target      projection:@0:0:0",
      "  status      available",
      "  diagnostic  [0] E_HEADER Header failed",
      "  summary     1 graph node, 1 slide, 1 projection element",
      "  graph       header-node",
      "  component   Header component:Header:1",
      "  chain       projection:@0:0:0 -> header-node -> @0 slide 0 element 0",
      '  output      @0 slide 0 element 0 {"id":"header-el","kind":"text"}',
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "component.impact",
          target: "component:Deck:1",
          status: "available",
          graphNodeIds: ["header-node", "footer-node"],
          elements: [
            {
              slot: 0,
              slideIndex: 0,
              elementIndex: 0,
              element: { id: "header-el", origin: { graphNodeIds: ["header-node"] } },
            },
            {
              slot: 0,
              slideIndex: 0,
              elementIndex: 1,
              element: { id: "footer-el", origin: { graphNodeIds: ["footer-node"] } },
            },
          ],
        },
      }),
    ).toEqual([
      "ok component.impact",
      "  target      component:Deck:1",
      "  status      available",
      "  summary     2 graph nodes, 1 slide, 2 projection elements",
      "  graph       header-node, footer-node",
      "  chain       component:Deck:1 -> header-node -> @0 slide 0 element 0",
      "  chain       component:Deck:1 -> footer-node -> @0 slide 0 element 1",
      '  output      @0 slide 0 element 0 {"id":"header-el","origin":{"graphNodeIds":["header-node"]}}',
      '  output      @0 slide 0 element 1 {"id":"footer-el","origin":{"graphNodeIds":["footer-node"]}}',
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "props.diff",
          target: "component:Header:1",
          path: "title",
          changes: [{ path: "title", before: "Q4", after: "Q5" }],
        },
      }),
    ).toEqual([
      "ok props.diff",
      "  target component:Header:1",
      "  title",
      "    before Q4",
      "    after  Q5",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "props.diff",
          target: "component:Header:1",
          changes: [],
        },
      }),
    ).toEqual(["ok props.diff", "  target component:Header:1", "  changes     0"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "style.explain",
          nodeId: "node-1",
          sourceKey: "deck:root",
          slot: 0,
          property: "color",
          trace: {
            property: "color",
            candidates: [
              { value: "red", source: { layer: "class", className: "muted" }, applied: false },
              { value: "blue", source: { layer: "style" }, applied: true },
            ],
          },
        },
      }),
    ).toEqual([
      "ok style.explain",
      "  node        node-1",
      "  source      deck:root",
      "  slot        0",
      "  color",
      "    x red   class .muted",
      "    * blue  style",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "style.explain",
          nodeId: "node-1",
          sourceKey: "deck:root",
          slot: 0,
          style: { color: "blue", fontSize: 18 },
          properties: ["color", "fontSize"],
          hints: ["style node-1 color", "style node-1 fontSize"],
        },
      }),
    ).toEqual([
      "ok style.explain",
      "  node        node-1",
      "  source      deck:root",
      "  slot        0",
      "  style       color=blue, fontSize=18",
      "  properties  color, fontSize",
      "  see         style node-1 color",
      "  see         style node-1 fontSize",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "projection.inspect",
          slot: 0,
          format: "pptx",
          slides: [
            {
              slideIndex: 0,
              partId: "ppt/slide-1",
              path: "ppt/slides/slide1.xml",
              slideId: "256",
              name: "Overview",
              origin: { graphNodeIds: ["slide-node"] },
              elementCount: 1,
            },
          ],
        },
      }),
    ).toEqual([
      "ok projection.inspect",
      "  slot        0",
      "  format      pptx",
      "  slides      1",
      "  [0] Overview ppt/slides/slide1.xml 1 element",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "projection.inspect",
          slot: 0,
          slideIndex: 0,
          slide: {
            slideIndex: 0,
            partId: "ppt/slide-1",
            path: "ppt/slides/slide1.xml",
            slideId: "256",
            name: "Overview",
            origin: { graphNodeIds: ["slide-node"] },
            elementCount: 2,
          },
        },
      }),
    ).toEqual([
      "ok projection.inspect",
      "  slot        0",
      "  slide       0",
      "  name        Overview",
      "  path        ppt/slides/slide1.xml",
      "  elements    2",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "projection.inspect",
          slot: 0,
          slideIndex: 1,
          elementIndex: 2,
          element: {
            id: "title-el",
            kind: "text",
            origin: { graphNodeIds: ["title-node"] },
            textPreview: "Roadmap",
          },
        },
      }),
    ).toEqual([
      "ok projection.inspect",
      "  slot        0",
      "  slide       1",
      "  element     2",
      '  value       {"id":"title-el","kind":"text","origin":{"graphNodeIds":["title-node"]},"textPreview":"Roadmap"}',
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "selection.list",
          items: [
            {
              handle: "$0",
              available: true,
              value: { kind: "component.inspect", id: "component:Header:1", name: "Header" },
            },
            {
              handle: "$$",
              available: true,
              value: [
                { id: "component:Header:1", name: "Header" },
                { id: "component:Footer:1", name: "Footer" },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      "ok selection.list",
      "  $0          component.inspect Header component:Header:1",
      "  $$          2 items",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "selection.list",
          items: [],
        },
      }),
    ).toEqual(["ok selection.list", "  handles     0"]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "selection.resolve",
          handle: "$0",
          value: {
            kind: "component.inspect",
            id: "component:Header:1",
            name: "Header",
          },
        },
      }),
    ).toEqual([
      "ok selection.resolve",
      "  handle      $0",
      "  value       component.inspect Header component:Header:1",
    ]);

    expect(
      renderInteractiveResponse({
        ok: true,
        result: {
          kind: "history.changes",
          fromCompilation: 2,
          toCompilation: 4,
          skippedFailedAttempts: 1,
          changedSourceIds: ["/project/src/components/MetricCard.tsx", "/project/src/theme.ts"],
        },
      }),
    ).toEqual([
      "ok history.changes",
      "  from        compilation 2",
      "  to          compilation 4",
      "  skipped     1 failed attempt",
      "  changed     /project/src/components/MetricCard.tsx",
      "  changed     /project/src/theme.ts",
    ]);
  });

  test("filters generated outputs and write coordination files from dev watch files", () => {
    expect(
      devWatchFiles({
        cwd: "/project",
        files: [
          "/project/src/main.tsx",
          "/project/output.pptx",
          "/project/.deckjsx-lock",
          "/project/.output.pptx.deckjsx-lock",
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

  test("hosts the dev compiler and prints human diagnostics from compiler events", async () => {
    const lines: string[] = [];
    const calls: string[] = [];
    let listener:
      | ((event: {
          readonly type: "diagnostic";
          readonly diagnostic: DeckjsxNodeCliDiagnostic;
        }) => void)
      | undefined;

    await runDeckjsxDevCompilerHost({
      entry: "src/main.tsx",
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
    expect(lines).toEqual(
      expect.arrayContaining([
        "error deckjsx.node.dev.bundleFailed",
        "  Bundle failed.",
        "  bundle exploded",
      ]),
    );
    expect(lines.some((line) => line.includes("[deckjsx] dev started"))).toBe(true);
    expect(lines.some((line) => line.includes("[deckjsx] error"))).toBe(true);
  });

  test("does not emit ANSI colors when dev console stderr is not a TTY", async () => {
    const lines: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((line) => {
      lines.push(String(line));
    });
    const stderrDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: false,
    });

    try {
      await runDeckjsxDevCompilerHost({
        entry: "src/main.tsx",
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
              sourceSnapshot: {
                status: "executable",
                code: "",
                watchFiles: [],
                moduleIds: [],
                changedSourceIds: [],
              },
              artifactPlan: { status: "ready", writes: [], retainedSlots: [], diagnostics: [] },
              graph: { cwd: "/project", files: [], moduleIds: [], observedAssetFiles: [] },
              writes: [],
              retainedSlots: [],
            });
          },
          async close() {},
        },
      });
    } finally {
      consoleError.mockRestore();
      if (stderrDescriptor) {
        Object.defineProperty(process.stderr, "isTTY", stderrDescriptor);
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }
    }

    expect(lines.join("\n")).not.toContain("\u001b[");
  });

  test("flushes every stderr chunk before the compiler host exits under backpressure", async () => {
    const chunks: string[] = [];
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    let blockedCallback: ((error?: Error | null) => void) | undefined;
    let writeCount = 0;
    const outputStream = {
      isTTY: false,
      write(chunk: string, callback: (error?: Error | null) => void) {
        chunks.push(chunk);
        writeCount += 1;
        if (writeCount === 1) {
          blockedCallback = callback;
          return false;
        }
        queueMicrotask(callback);
        return true;
      },
      once(event: string, listener: (...args: unknown[]) => void) {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
        return outputStream;
      },
      off(event: string, listener: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(listener);
        return outputStream;
      },
    };
    let hostSettled = false;
    const host = runDeckjsxDevCompilerHost({
      entry: "src/main.tsx",
      maxCompilations: 1,
      outputStream,
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
            sourceSnapshot: {
              status: "executable",
              code: "",
              watchFiles: [],
              moduleIds: [],
              changedSourceIds: [],
            },
            writes: [],
            retainedSlots: [],
          });
        },
        async close() {},
      },
    }).finally(() => {
      hostSettled = true;
    });

    await Promise.resolve();
    expect(chunks).toHaveLength(1);
    expect(hostSettled).toBe(false);

    blockedCallback?.();
    for (const listener of listeners.get("drain") ?? []) {
      listener();
    }
    await host;

    expect(chunks.join("")).toContain("[deckjsx] dev started");
    expect(chunks.join("")).toContain("[deckjsx] ready");
    expect(chunks.every((chunk) => chunk.endsWith("\n"))).toBe(true);
  });

  test("hosts the dev compiler and prints concise lifecycle output", async () => {
    const lines: string[] = [];

    await runDeckjsxDevCompilerHost({
      entry: "src/main.tsx",
      maxCompilations: 1,
      writeLine(line) {
        lines.push(line);
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
            sourceSnapshot: {
              status: "executable",
              code: "",
              watchFiles: [],
              changedSourceIds: ["src/main.tsx"],
            },
            writes: [
              { path: "/project/output.pptx", tracked: true, result: { status: "patched" } },
            ],
            retainedSlots: [0],
          });
        },
        async close() {},
      },
    });

    expect(lines.some((line) => line.includes("[deckjsx] dev started"))).toBe(true);
    expect(lines.some((line) => line.includes("[deckjsx] dev started    src/main.tsx"))).toBe(true);
    expect(lines.some((line) => line.includes("[deckjsx] ready"))).toBe(true);
    expect(lines.some((line) => line.includes("[deckjsx] ready          1 output"))).toBe(true);
    expect(lines.some((line) => line.includes("changed     src/main.tsx"))).toBe(true);
    expect(lines.some((line) => line.includes("output.pptx"))).toBe(true);
  });

  test("hosts an interactive session alongside the dev compiler", async () => {
    const calls: string[] = [];

    await runDeckjsxDevCompilerHost({
      interactive: true,
      maxCompilations: 1,
      createInteractiveSession() {
        calls.push("interactive:start");
        return {
          async dispatch() {
            return { ok: true, result: {} };
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
    expect(output).toEqual(["ok session.status"]);
  });

  test("routes interactive output through the dev console writer by default", async () => {
    const lines: string[] = [];

    await runDeckjsxDevCompilerHost({
      interactive: true,
      interactiveLines: (async function* () {
        yield "status";
        yield "exit";
      })(),
      writeLine(line) {
        lines.push(line);
      },
      createInteractiveSession() {
        return {
          async dispatch(command) {
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

    expect(lines.some((line) => line.includes("[deckjsx] dev started"))).toBe(true);
    expect(lines.some((line) => line.includes("[deckjsx] ready"))).toBe(true);
    expect(lines).toContain("ok session.status");
  });

  test("interactive host exits cleanly when closing interrupts a pending compilation", async () => {
    const calls: string[] = [];
    let rejectCompilation: ((error: Error) => void) | undefined;

    await runDeckjsxDevCompilerHost({
      interactive: true,
      interactiveLines: (async function* () {
        yield "exit";
      })(),
      createInteractiveSession() {
        return {
          async dispatch() {
            return { ok: true, result: {} };
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
        runNextCompilation() {
          calls.push("compiler:runNextCompilation");
          return new Promise<DeckjsxDevCompilationResult>((_resolve, reject) => {
            rejectCompilation = reject;
          });
        },
        async close() {
          calls.push("compiler:close");
          rejectCompilation?.(new Error("compiler closed"));
          await Promise.resolve();
        },
      },
    });

    expect(calls).toEqual([
      "compiler:start",
      "compiler:runNextCompilation",
      "interactive:close",
      "compiler:close",
    ]);
  });

  test("interactive host does not render shutdown snapshots or spin after exit", async () => {
    const lines: string[] = [];
    let runCalls = 0;
    let resolveCompilation: ((result: DeckjsxDevCompilationResult) => void) | undefined;

    await runDeckjsxDevCompilerHost({
      interactive: true,
      interactiveLines: (async function* () {
        yield "exit";
      })(),
      writeLine(line) {
        lines.push(line);
      },
      createInteractiveSession() {
        return {
          async dispatch() {
            return { ok: true, result: {} };
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
        runNextCompilation() {
          runCalls += 1;
          return new Promise<DeckjsxDevCompilationResult>((resolve) => {
            resolveCompilation = resolve;
          });
        },
        async close() {
          resolveCompilation?.(
            asCompilationResult({
              ok: false,
              status: "bundleFailed",
              compilation: 1,
              sourceSnapshot: {
                status: "diagnostic",
                diagnostics: [
                  {
                    severity: "error",
                    code: "deckjsx.node.dev.closed",
                    title: "Dev source provider closed.",
                  },
                ],
              },
              diagnostics: [
                {
                  severity: "error",
                  code: "deckjsx.node.dev.closed",
                  title: "Dev source provider closed.",
                },
              ],
            }),
          );
        },
      },
    });
    await Promise.resolve();

    expect(runCalls).toBe(1);
    expect(lines.join("\n")).not.toContain("deckjsx.node.dev.closed");
  });

  test("interactive host still propagates compilation failures before shutdown", async () => {
    const error = new Error("compilation exploded");

    await expect(
      runDeckjsxDevCompilerHost({
        interactive: true,
        interactiveLines: pendingInteractiveLines(),
        createInteractiveSession() {
          return {
            async dispatch() {
              return { ok: true, result: {} };
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
            throw error;
          },
          async close() {},
        },
      }),
    ).rejects.toThrow(error);
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
    let receivedInspectionStore: unknown;
    let receivedDiagnostics: unknown;

    await runDeckjsxDevCompilerHost({
      interactive: true,
      artifactSession,
      maxCompilations: 1,
      createInteractiveSession(input) {
        receivedArtifactSession = input.artifactSession;
        receivedInspectionStore = input.inspectionStore;
        receivedDiagnostics = input.diagnostics;
        return {
          async dispatch() {
            return { ok: true, result: {} };
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
    expect(receivedInspectionStore).toEqual(expect.any(Object));
    expect(receivedDiagnostics).toEqual(
      expect.objectContaining({
        current: expect.any(Function),
      }),
    );
  });

  test("builds interactive completion context with latest diagnostics", () => {
    const context = completionContextFromInspectionState(undefined, undefined, [
      { severity: "error", code: "E_HEADER", title: "Header failed" },
      { severity: "warning", code: "W_LAYOUT", title: "Layout fallback" },
    ]);

    expect(context.diagnosticTargets).toEqual([
      { index: 0, code: "E_HEADER", title: "Header failed" },
      { index: 1, code: "W_LAYOUT", title: "Layout fallback" },
    ]);
  });

  test("builds PDF projection completion targets from page visuals", () => {
    const artifactSession = {
      inspectArtifacts() {
        return {
          retainedSlots() {
            return [2];
          },
          projectionForSlot() {
            return {
              format: "pdf",
              pages: [
                {
                  name: "Overview",
                  visuals: [
                    { id: "title", kind: "text" },
                    { id: "rule", kind: "line" },
                  ],
                },
              ],
            };
          },
        };
      },
    } as unknown as IncrementalArtifactSession;

    expect(
      completionContextFromInspectionState(undefined, artifactSession).projectionTargets,
    ).toEqual([
      { insert: "@2", description: "Projection slot 2" },
      { insert: "@2 0", description: "Page 0: Overview" },
      { insert: "@2 0 0", description: "Element 0: text title" },
      { insert: "@2 0 1", description: "Element 1: line rule" },
    ]);
  });
});

import { describe, expect, test } from "vite-plus/test";
import {
  completeInteractiveInput,
  completeInteractiveInputLine,
  createInteractivePromptState,
  formatHighlightedInteractiveInputLine,
  formatInteractiveCompletionMenu,
  highlightInteractiveInputLine,
  interactivePromptLinesFromKeys,
  parseInteractiveInputLine,
  runInteractiveDevCommandLoop,
  updateInteractivePromptState,
} from "../src/interactive/repl.ts";
import type { InteractiveDevSession } from "../src/interactive/session.ts";

async function* lines(input: readonly string[]): AsyncIterable<string> {
  for (const line of input) {
    yield line;
  }
}

async function* keys(
  input: readonly Parameters<typeof updateInteractivePromptState>[1][],
): AsyncIterable<Parameters<typeof updateInteractivePromptState>[1]> {
  for (const key of input) {
    yield key;
  }
}

describe("@deckjsx/node interactive repl", () => {
  test("parses shorthand commands into interactive protocol commands", () => {
    expect(parseInteractiveInputLine("help")).toEqual({ method: "session.help" });
    expect(parseInteractiveInputLine("status")).toEqual({ method: "session.status" });
    expect(parseInteractiveInputLine("timings")).toEqual({ method: "session.timings" });
    expect(parseInteractiveInputLine("history changes")).toEqual({ method: "history.changes" });
    expect(parseInteractiveInputLine("diagnostics")).toEqual({ method: "diagnostics.list" });
    expect(parseInteractiveInputLine("diagnostic 2")).toEqual({
      method: "diagnostics.explain",
      params: { index: 2 },
    });
    expect(parseInteractiveInputLine("style node-1 color")).toEqual({
      method: "style.explain",
      params: { nodeId: "node-1", property: "color" },
    });
    expect(parseInteractiveInputLine("component tree")).toEqual({
      method: "component.tree",
    });
    expect(parseInteractiveInputLine("component inspect $0")).toEqual({
      method: "component.inspect",
      params: { target: "$0" },
    });
    expect(parseInteractiveInputLine("component search Header")).toEqual({
      method: "component.search",
      params: { query: "Header" },
    });
    expect(parseInteractiveInputLine("component filter source:slides")).toEqual({
      method: "component.filter",
      params: { query: "source:slides" },
    });
    expect(parseInteractiveInputLine("component diff")).toEqual({
      method: "component.diff",
    });
    expect(parseInteractiveInputLine("component impact $0")).toEqual({
      method: "component.impact",
      params: { target: "$0" },
    });
    expect(parseInteractiveInputLine("props inspect $0 theme.colors.primary")).toEqual({
      method: "props.inspect",
      params: { target: "$0", path: "theme.colors.primary" },
    });
    expect(parseInteractiveInputLine("props diff $0 items")).toEqual({
      method: "props.diff",
      params: { target: "$0", path: "items" },
    });
    expect(parseInteractiveInputLine("selection")).toEqual({
      method: "selection.list",
    });
    expect(parseInteractiveInputLine("projection")).toEqual({ method: "projection.inspect" });
    expect(parseInteractiveInputLine("projection 0 2")).toEqual({
      method: "projection.inspect",
      params: { slideIndex: 0, elementIndex: 2 },
    });
    expect(parseInteractiveInputLine("projection @2 0 1")).toEqual({
      method: "projection.inspect",
      params: { slot: 2, slideIndex: 0, elementIndex: 1 },
    });
    expect(() => parseInteractiveInputLine("projection nope")).toThrow(
      "projection numeric arguments must be non-negative integers.",
    );
    expect(() => parseInteractiveInputLine("projection @2 0 1 extra")).toThrow(
      "projection accepts at most slot, slide index, and element index.",
    );
    expect(parseInteractiveInputLine("$0")).toEqual({
      method: "selection.resolve",
      params: { handle: "$0" },
    });
    expect(parseInteractiveInputLine("$$")).toEqual({
      method: "selection.resolve",
      params: { handle: "$$" },
    });
  });

  test("rejects incomplete component subcommands with parse spans", () => {
    expect(() => parseInteractiveInputLine("component inspect")).toThrow(
      "component inspect requires a target.",
    );
    expect(() => parseInteractiveInputLine("component search")).toThrow(
      "component search requires a query.",
    );
    expect(() => parseInteractiveInputLine("component filter")).toThrow(
      "component filter requires a query.",
    );
    expect(() => parseInteractiveInputLine("component impact")).toThrow(
      "component impact requires a target.",
    );
  });

  test("rejects incomplete props subcommands with parse spans", () => {
    expect(() => parseInteractiveInputLine("props inspect")).toThrow(
      "props inspect requires a target.",
    );
    expect(() => parseInteractiveInputLine("props diff")).toThrow("props diff requires a target.");
  });

  test("rejects incomplete style commands with parse spans", () => {
    expect(() => parseInteractiveInputLine("style")).toThrow("style requires a target.");
  });

  test("rejects extra arguments for fixed-arity commands", () => {
    expect(() => parseInteractiveInputLine("diagnostic 1 extra")).toThrow(
      "diagnostic accepts exactly one index.",
    );
    expect(() => parseInteractiveInputLine("style $0 color extra")).toThrow(
      "style accepts a target and optional property.",
    );
    expect(() => parseInteractiveInputLine("component tree extra")).toThrow(
      "component tree does not accept extra arguments.",
    );
    expect(() => parseInteractiveInputLine("component inspect $0 extra")).toThrow(
      "component inspect accepts exactly one target.",
    );
    expect(() => parseInteractiveInputLine("props inspect $0 title extra")).toThrow(
      "props inspect accepts a target and optional path.",
    );
  });

  test("parses JSON command lines for internal command coverage", () => {
    expect(
      parseInteractiveInputLine('{"method":"style.explain","params":{"nodeId":"n1"}}'),
    ).toEqual({
      method: "style.explain",
      params: { nodeId: "n1" },
    });
  });

  test("highlights interactive input by command grammar", () => {
    expect(highlightInteractiveInputLine("component inspect $0")).toEqual([
      { kind: "command", start: 0, end: 9, text: "component" },
      { kind: "subcommand", start: 10, end: 17, text: "inspect" },
      { kind: "selection", start: 18, end: 20, text: "$0" },
    ]);
    expect(highlightInteractiveInputLine("props inspect $0 theme.colors.primary")).toEqual([
      { kind: "command", start: 0, end: 5, text: "props" },
      { kind: "subcommand", start: 6, end: 13, text: "inspect" },
      { kind: "selection", start: 14, end: 16, text: "$0" },
      { kind: "path", start: 17, end: 37, text: "theme.colors.primary" },
    ]);
    expect(highlightInteractiveInputLine("style $0 color")).toEqual([
      { kind: "command", start: 0, end: 5, text: "style" },
      { kind: "selection", start: 6, end: 8, text: "$0" },
      { kind: "property", start: 9, end: 14, text: "color" },
    ]);
    expect(
      highlightInteractiveInputLine("component filter source:slides props.title~Road"),
    ).toEqual([
      { kind: "command", start: 0, end: 9, text: "component" },
      { kind: "subcommand", start: 10, end: 16, text: "filter" },
      { kind: "filter", start: 17, end: 30, text: "source:slides" },
      { kind: "filter", start: 31, end: 47, text: "props.title~Road" },
    ]);
    expect(
      highlightInteractiveInputLine("projection nope", { errorSpan: { start: 11, length: 4 } }),
    ).toEqual([
      { kind: "command", start: 0, end: 10, text: "projection" },
      { kind: "error", start: 11, end: 15, text: "nope" },
    ]);
    expect(highlightInteractiveInputLine("wat")).toEqual([
      { kind: "unknown", start: 0, end: 3, text: "wat" },
    ]);
  });

  test("formats highlighted interactive input with restrained ANSI colors", () => {
    expect(formatHighlightedInteractiveInputLine("component inspect $0")).toBe(
      "\u001b[36mcomponent\u001b[39m \u001b[36minspect\u001b[39m \u001b[33m$0\u001b[39m",
    );
    expect(
      formatHighlightedInteractiveInputLine("projection nope", {
        errorSpan: { start: 11, length: 4 },
      }),
    ).toBe("\u001b[36mprojection\u001b[39m \u001b[31mnope\u001b[39m");
  });

  test("renders parse errors with input spans", async () => {
    const output: string[] = [];
    const session: InteractiveDevSession = {
      async dispatch() {
        throw new Error("not reached");
      },
      close() {},
    };

    await runInteractiveDevCommandLoop({
      session,
      lines: lines(["projection nope", "diagnostic nope", '{"method":']),
      writeLine(line) {
        output.push(line);
      },
    });

    expect(output).toEqual([
      "error deckjsx.node.interactive.invalidInput",
      "  projection numeric arguments must be non-negative integers.",
      "  input projection nope",
      "                   ^^^^",
      "error deckjsx.node.interactive.invalidInput",
      "  diagnostic index must be a non-negative integer.",
      "  input diagnostic nope",
      "                   ^^^^",
      "error deckjsx.node.interactive.invalidInput",
      "  Invalid JSON command.",
      '  input {"method":',
      "        ^^^^^^^^^^",
    ]);
  });

  test("completes top-level and fixed interactive command vocabulary", () => {
    expect(completeInteractiveInputLine("sta")).toEqual(["status"]);
    expect(completeInteractiveInput("sta")).toEqual([
      { insertText: "status", description: "Show compiler and latest compilation status." },
    ]);
    expect(completeInteractiveInputLine("qu")).toEqual(["quit"]);
    expect(completeInteractiveInputLine(".e")).toEqual([".exit"]);
    expect(completeInteractiveInputLine("component ")).toEqual([
      "component tree",
      "component inspect ",
      "component search ",
      "component filter ",
      "component diff",
      "component impact ",
    ]);
    expect(completeInteractiveInput("component ")).toEqual([
      { insertText: "component tree", description: "Show component hierarchy." },
      { insertText: "component inspect ", description: "Inspect one component." },
      { insertText: "component search ", description: "Search latest components." },
      { insertText: "component filter ", description: "Filter the current component list." },
      { insertText: "component diff", description: "Compare component snapshots." },
      { insertText: "component impact ", description: "Show projected output impact." },
    ]);
    expect(completeInteractiveInputLine("props d")).toEqual(["props diff "]);
    expect(
      completeInteractiveInput("component inspect He", {
        componentTargets: [
          { label: "Header", detail: "component:Header:1", propsKeys: ["title", "items"] },
          { label: "Footer", detail: "component:Footer:1" },
        ],
      }),
    ).toEqual([
      {
        insertText: "component inspect Header",
        description: "Component Header (component:Header:1)",
      },
    ]);
    expect(completeInteractiveInputLine("component inspect $")).toEqual([
      "component inspect $0",
      "component inspect $1",
      "component inspect $2",
      "component inspect $$",
    ]);
    expect(
      completeInteractiveInput("props inspect component:H", {
        componentTargets: [
          { label: "Header", detail: "component:Header:1", propsKeys: ["title", "items"] },
          { label: "component:Header:1" },
        ],
      }),
    ).toEqual([
      {
        insertText: "props inspect component:Header:1",
        description: "Component Header (component:Header:1)",
      },
    ]);
    expect(
      completeInteractiveInput("props inspect Header ", {
        componentTargets: [
          { label: "Header", detail: "component:Header:1", propsKeys: ["title", "items"] },
        ],
      }),
    ).toEqual([
      { insertText: "props inspect Header title", description: "Prop title on Header" },
      { insertText: "props inspect Header items", description: "Prop items on Header" },
    ]);
    expect(
      completeInteractiveInput("props diff component:Header:1 i", {
        componentTargets: [
          { label: "Header", detail: "component:Header:1", propsKeys: ["title", "items"] },
        ],
      }),
    ).toEqual([
      {
        insertText: "props diff component:Header:1 items",
        description: "Prop items on Header",
      },
    ]);
    expect(completeInteractiveInputLine("style $")).toEqual([
      "style $0",
      "style $1",
      "style $2",
      "style $$",
    ]);
    expect(
      completeInteractiveInput("style met", {
        styleTargets: [
          { label: "metric-title", detail: "MetricCard", propertyKeys: ["color", "fontSize"] },
        ],
      }),
    ).toEqual([
      {
        insertText: "style metric-title",
        description: "Style target metric-title (MetricCard)",
      },
    ]);
    expect(
      completeInteractiveInput("style metric-title c", {
        styleTargets: [
          { label: "metric-title", detail: "MetricCard", propertyKeys: ["color", "fontSize"] },
        ],
      }),
    ).toEqual([
      {
        insertText: "style metric-title color",
        description: "Style property color on metric-title",
      },
    ]);
    expect(
      completeInteractiveInput("projection ", {
        projectionTargets: [
          { insert: "@0", description: "Projection slot 0" },
          { insert: "@0 0", description: "Slide 0: Overview" },
          { insert: "@0 0 1", description: "Element 1: text title-el" },
        ],
      }),
    ).toEqual([
      { insertText: "projection @0", description: "Projection slot 0" },
      { insertText: "projection @0 0", description: "Slide 0: Overview" },
      { insertText: "projection @0 0 1", description: "Element 1: text title-el" },
    ]);
    expect(
      completeInteractiveInput("projection @0 0 ", {
        projectionTargets: [
          { insert: "@0", description: "Projection slot 0" },
          { insert: "@0 0", description: "Slide 0: Overview" },
          { insert: "@0 0 1", description: "Element 1: text title-el" },
        ],
      }),
    ).toEqual([{ insertText: "projection @0 0 1", description: "Element 1: text title-el" }]);
    expect(completeInteractiveInput("projection ")).toEqual([
      {
        insertText: "projection @0",
        description: "Inspect a retained projection slot.",
      },
      {
        insertText: "projection 0",
        description: "Inspect slide 0 in the first retained projection.",
      },
    ]);
    expect(
      completeInteractiveInput("diagnostic ", {
        diagnosticTargets: [
          { index: 0, code: "E_HEADER", title: "Header failed" },
          { index: 1, code: "W_LAYOUT", title: "Layout fallback" },
        ],
      }),
    ).toEqual([
      {
        insertText: "diagnostic 0",
        description: "Diagnostic 0 E_HEADER Header failed",
      },
      {
        insertText: "diagnostic 1",
        description: "Diagnostic 1 W_LAYOUT Layout fallback",
      },
    ]);
    expect(
      completeInteractiveInput("diagnostic 1", {
        diagnosticTargets: [
          { index: 0, code: "E_HEADER", title: "Header failed" },
          { index: 1, code: "W_LAYOUT", title: "Layout fallback" },
        ],
      }),
    ).toEqual([
      {
        insertText: "diagnostic 1",
        description: "Diagnostic 1 W_LAYOUT Layout fallback",
      },
    ]);
    expect(completeInteractiveInput("diagnostic ")).toEqual([
      {
        insertText: "diagnostic 0",
        description: "Explain diagnostic 0 when diagnostics are available.",
      },
    ]);
    expect(completeInteractiveInput("component filter ")).toEqual([
      { insertText: "component filter source:", description: "Filter by source/module path." },
      { insertText: "component filter props.", description: "Filter by top-level prop path." },
      {
        insertText: "component filter has:diagnostic",
        description: "Filter components with related diagnostics.",
      },
      {
        insertText: "component filter impact:slide",
        description: "Filter components with slide projection impact.",
      },
    ]);
    expect(completeInteractiveInput("component search imp")).toEqual([
      {
        insertText: "component search impact:slide",
        description: "Search components with slide projection impact.",
      },
    ]);
    expect(
      completeInteractiveInput("component search props.t", {
        componentTargets: [
          { label: "Header", detail: "component:Header:1", propsKeys: ["title", "items"] },
          { label: "Footer", detail: "component:Footer:1", propsKeys: ["title", "count"] },
        ],
      }),
    ).toEqual([
      {
        insertText: "component search props.title:",
        description: "Search by top-level prop title exact value.",
      },
      {
        insertText: "component search props.title~",
        description: "Search by top-level prop title contains value.",
      },
    ]);
  });

  test("formats completion candidates with descriptions for prompt discovery", () => {
    expect(formatInteractiveCompletionMenu("component ")).toEqual([
      "completions",
      "  tree       Show component hierarchy.",
      "  inspect    Inspect one component.",
      "  search     Search latest components.",
      "  filter     Filter the current component list.",
      "  diff       Compare component snapshots.",
      "  impact     Show projected output impact.",
    ]);
    expect(formatInteractiveCompletionMenu("component inspect $")).toEqual([
      "completions",
      "  $0         Selection $0 (latest result).",
      "  $1         Selection $1 (previous result).",
      "  $2         Selection $2 (older result).",
      "  $$         Selection $$ (latest result list).",
    ]);
    expect(
      formatInteractiveCompletionMenu("props inspect Header ", {
        componentTargets: [
          { label: "Header", detail: "component:Header:1", propsKeys: ["title", "items"] },
        ],
      }),
    ).toEqual([
      "completions",
      "  title      Prop title on Header",
      "  items      Prop items on Header",
    ]);
    expect(formatInteractiveCompletionMenu("zz")).toEqual(["no completions"]);
  });

  test("updates prompt editor state with highlighted redraws and completion menus", () => {
    let state = createInteractivePromptState();
    let update = updateInteractivePromptState(state, { type: "insert", text: "component " });
    state = update.state;
    expect(update.outputs).toEqual([
      {
        type: "render",
        lines: ["deckjsx> \u001b[36mcomponent\u001b[39m "],
      },
    ]);

    update = updateInteractivePromptState(state, { type: "tab" });
    state = update.state;
    expect(update.outputs).toEqual([
      {
        type: "render",
        lines: [
          "completions",
          "  tree       Show component hierarchy.",
          "  inspect    Inspect one component.",
          "  search     Search latest components.",
          "  filter     Filter the current component list.",
          "  diff       Compare component snapshots.",
          "  impact     Show projected output impact.",
          "deckjsx> \u001b[36mcomponent\u001b[39m ",
        ],
      },
    ]);

    update = updateInteractivePromptState(state, { type: "insert", text: "inspect $0" });
    state = update.state;
    update = updateInteractivePromptState(state, { type: "enter" });
    expect(update.outputs).toEqual([{ type: "line", line: "component inspect $0" }]);
    state = update.state;

    update = updateInteractivePromptState(state, { type: "up" });
    state = update.state;
    expect(state.line).toBe("component inspect $0");
    expect(update.outputs).toEqual([
      {
        type: "render",
        lines: [
          "deckjsx> \u001b[36mcomponent\u001b[39m \u001b[36minspect\u001b[39m \u001b[33m$0\u001b[39m",
        ],
      },
    ]);
  });

  test("applies a single tab completion to the prompt input", () => {
    let state = createInteractivePromptState();
    let update = updateInteractivePromptState(state, { type: "insert", text: "sta" });
    state = update.state;

    update = updateInteractivePromptState(state, { type: "tab" });

    expect(update.state.line).toBe("status");
    expect(update.state.cursor).toBe("status".length);
    expect(update.outputs).toEqual([
      {
        type: "render",
        lines: ["deckjsx> \u001b[36mstatus\u001b[39m"],
      },
    ]);
  });

  test("applies tab completion at the cursor without dropping trailing input", () => {
    let state = createInteractivePromptState();
    let update = updateInteractivePromptState(state, {
      type: "insert",
      text: "component insp $0",
    });
    state = update.state;
    state = updateInteractivePromptState(state, { type: "left" }).state;
    state = updateInteractivePromptState(state, { type: "left" }).state;
    state = updateInteractivePromptState(state, { type: "left" }).state;

    update = updateInteractivePromptState(state, { type: "tab" });

    expect(update.state.line).toBe("component inspect $0");
    expect(update.state.cursor).toBe("component inspect ".length);
    expect(update.outputs).toEqual([
      {
        type: "render",
        lines: [
          "deckjsx> \u001b[36mcomponent\u001b[39m \u001b[36minspect\u001b[39m \u001b[33m$0\u001b[39m",
        ],
      },
    ]);
  });

  test("edits prompt text around the cursor", () => {
    let state = createInteractivePromptState();
    let update = updateInteractivePromptState(state, { type: "insert", text: "sttus" });
    state = update.state;
    state = updateInteractivePromptState(state, { type: "left" }).state;
    state = updateInteractivePromptState(state, { type: "left" }).state;
    state = updateInteractivePromptState(state, { type: "left" }).state;
    update = updateInteractivePromptState(state, { type: "insert", text: "a" });
    expect(update.state.line).toBe("status");
    expect(update.state.cursor).toBe(3);
    expect(update.outputs).toEqual([
      { type: "render", lines: ["deckjsx> \u001b[36mstatus\u001b[39m"] },
    ]);
  });

  test("turns prompt key input into rendered prompt output and command lines", async () => {
    const rendered: string[] = [];
    const commandLines: string[] = [];

    for await (const line of interactivePromptLinesFromKeys({
      keys: keys([
        { type: "insert", text: "component " },
        { type: "tab" },
        { type: "insert", text: "tree" },
        { type: "enter" },
      ]),
      writeLine(line) {
        rendered.push(line);
      },
    })) {
      commandLines.push(line);
    }

    expect(commandLines).toEqual(["component tree"]);
    expect(rendered).toEqual([
      "deckjsx> \u001b[36mcomponent\u001b[39m ",
      "completions",
      "  tree       Show component hierarchy.",
      "  inspect    Inspect one component.",
      "  search     Search latest components.",
      "  filter     Filter the current component list.",
      "  diff       Compare component snapshots.",
      "  impact     Show projected output impact.",
      "deckjsx> \u001b[36mcomponent\u001b[39m ",
      "deckjsx> \u001b[36mcomponent\u001b[39m \u001b[36mtree\u001b[39m",
    ]);
  });

  test("exposes grouped prompt renders and command-line submission hooks", async () => {
    const renders: (readonly string[])[] = [];
    const submitted: string[] = [];
    const commandLines: string[] = [];

    for await (const line of interactivePromptLinesFromKeys({
      keys: keys([{ type: "insert", text: "status" }, { type: "enter" }]),
      writeLine() {
        throw new Error("writeRender should handle prompt renders");
      },
      writeRender(lines) {
        renders.push(lines);
      },
      onCommandLine(line) {
        submitted.push(line);
      },
    })) {
      commandLines.push(line);
    }

    expect(renders).toEqual([["deckjsx> \u001b[36mstatus\u001b[39m"]]);
    expect(submitted).toEqual(["status"]);
    expect(commandLines).toEqual(["status"]);
  });

  test("runs command lines against the session and writes human responses", async () => {
    const commands: unknown[] = [];
    const output: string[] = [];
    const session: InteractiveDevSession = {
      async dispatch(command) {
        commands.push(command);
        return { ok: true, result: { method: command.method } };
      },
      close() {},
    };

    await runInteractiveDevCommandLoop({
      session,
      lines: lines(["status", "$0", "exit", "history changes"]),
      writeLine(line) {
        output.push(line);
      },
    });

    expect(commands).toEqual([
      { method: "session.status" },
      { method: "selection.resolve", params: { handle: "$0" } },
    ]);
    expect(output).toEqual(["ok session.status", "ok selection.resolve"]);
  });
});

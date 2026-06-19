import { describe, expect, test } from "vite-plus/test";
import {
  parseInteractiveInputLine,
  runInteractiveDevCommandLoop,
} from "../src/interactive/repl.ts";
import type { InteractiveDevSession } from "../src/interactive/session.ts";

async function* lines(input: readonly string[]): AsyncIterable<string> {
  for (const line of input) {
    yield line;
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
    expect(parseInteractiveInputLine("component node-1")).toEqual({
      method: "component.stack",
      params: { nodeId: "node-1" },
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
    expect(parseInteractiveInputLine("projection nope")).toEqual({
      method: "projection.inspect",
      params: { slideIndex: "nope" },
    });
    expect(parseInteractiveInputLine("$0")).toEqual({
      method: "selection.resolve",
      params: { handle: "$0" },
    });
    expect(parseInteractiveInputLine("$$")).toEqual({
      method: "selection.resolve",
      params: { handle: "$$" },
    });
  });

  test("parses JSON command lines for internal command coverage", () => {
    expect(
      parseInteractiveInputLine('{"method":"style.explain","params":{"nodeId":"n1"}}'),
    ).toEqual({
      method: "style.explain",
      params: { nodeId: "n1" },
    });
  });

  test("runs command lines against the session and writes JSON responses", async () => {
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
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { ok: true, result: { method: "session.status" } },
      { ok: true, result: { method: "selection.resolve" } },
    ]);
  });
});

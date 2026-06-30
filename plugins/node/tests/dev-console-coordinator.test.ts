import { describe, expect, test } from "vite-plus/test";
import { createDevConsoleCoordinator } from "@/src/dev-console/coordinator.ts";
import { runInteractiveDevCommandLoop } from "@/src/interactive/repl.ts";
import { interactivePromptLinesFromKeys } from "@/src/interactive/repl.ts";
import type { InteractiveDevSession } from "@/src/interactive/session.ts";
import type { InteractivePromptKey } from "@/src/interactive/repl.ts";

describe("@deckjsx/node dev console coordinator", () => {
  test("redraws the active prompt after dev and inspector output", () => {
    const lines: string[] = [];
    const coordinator = createDevConsoleCoordinator({
      writeLine(line) {
        lines.push(line);
      },
    });

    coordinator.writePromptRender(["deckjsx> \u001b[36mcomponent\u001b[39m "]);
    coordinator.writeConsole(["2:11:20 PM [deckjsx] ready          compilation 1"]);
    coordinator.writeInspector(["ok component.tree"]);

    expect(lines).toEqual([
      "deckjsx> \u001b[36mcomponent\u001b[39m ",
      "2:11:20 PM [deckjsx] ready          compilation 1",
      "deckjsx> \u001b[36mcomponent\u001b[39m ",
      "ok component.tree",
      "deckjsx> \u001b[36mcomponent\u001b[39m ",
    ]);
  });

  test("does not redraw a prompt after command submission clears it", () => {
    const lines: string[] = [];
    const coordinator = createDevConsoleCoordinator({
      writeLine(line) {
        lines.push(line);
      },
    });

    coordinator.writePromptRender(["deckjsx> \u001b[36mstatus\u001b[39m"]);
    coordinator.clearPrompt();
    coordinator.writeInspector(["ok session.status"]);

    expect(lines).toEqual(["deckjsx> \u001b[36mstatus\u001b[39m", "ok session.status"]);
  });

  test("redraws tty prompts in place without writing a new line per key", () => {
    const lines: string[] = [];
    const raw: string[] = [];
    const coordinator = createDevConsoleCoordinator({
      writeLine(line) {
        lines.push(line);
      },
      writeRaw(text) {
        raw.push(text);
      },
    });

    coordinator.writePromptRender(["deckjsx> \u001b[36ms\u001b[39m"]);
    coordinator.writePromptRender(["deckjsx> \u001b[36mst\u001b[39m"]);
    coordinator.writePromptRender(["deckjsx> \u001b[36msta\u001b[39m"]);
    coordinator.writeConsole(["2:11:20 PM [deckjsx] ready          compilation 1"]);
    coordinator.clearPrompt();
    coordinator.writeInspector(["ok session.status"]);

    expect(lines).toEqual([
      "2:11:20 PM [deckjsx] ready          compilation 1",
      "ok session.status",
    ]);
    expect(raw).toEqual([
      "\r\u001b[2Kdeckjsx> \u001b[36ms\u001b[39m",
      "\r\u001b[2Kdeckjsx> \u001b[36mst\u001b[39m",
      "\r\u001b[2Kdeckjsx> \u001b[36msta\u001b[39m",
      "\r\u001b[2K",
      "\r\u001b[2Kdeckjsx> \u001b[36msta\u001b[39m",
      "\r\u001b[2K",
    ]);
  });

  test("clears the active tty prompt before writing completion menu lines", () => {
    const lines: string[] = [];
    const raw: string[] = [];
    const coordinator = createDevConsoleCoordinator({
      writeLine(line) {
        lines.push(line);
      },
      writeRaw(text) {
        raw.push(text);
      },
    });

    coordinator.writePromptRender(["deckjsx> \u001b[36mcomp\u001b[39m"]);
    coordinator.writePromptRender([
      "  component tree",
      "  component inspect <target>",
      "deckjsx> \u001b[36mcomponent \u001b[39m",
    ]);

    expect(lines).toEqual(["  component tree", "  component inspect <target>"]);
    expect(raw).toEqual([
      "\r\u001b[2Kdeckjsx> \u001b[36mcomp\u001b[39m",
      "\r\u001b[2K",
      "\r\u001b[2Kdeckjsx> \u001b[36mcomponent \u001b[39m",
    ]);
  });

  test("keeps the inline prompt visible across typed commands and responses", async () => {
    const screen: string[] = [];
    const coordinator = createDevConsoleCoordinator({
      writeLine(line) {
        screen.push(`${line}\n`);
      },
      writeRaw(text) {
        screen.push(text);
      },
    });
    const session: InteractiveDevSession = {
      async dispatch(command) {
        return { ok: true, result: { method: command.method } };
      },
      close() {},
    };

    await runInteractiveDevCommandLoop({
      session,
      lines: interactivePromptLinesFromKeys({
        keys: promptKeys([
          { type: "insert", text: "status" },
          { type: "enter" },
          { type: "insert", text: "exit" },
          { type: "enter" },
        ]),
        writeLine(line) {
          coordinator.writePromptRender([line]);
        },
        writeRender(lines) {
          coordinator.writePromptRender(lines);
        },
        onCommandLine() {
          coordinator.clearPrompt();
        },
      }),
      writeLine(line) {
        coordinator.writeInspector([line]);
      },
    });

    expect(screen.join("")).toBe(
      [
        "\r\u001b[2Kdeckjsx> ",
        "\r\u001b[2Kdeckjsx> \u001b[36mstatus\u001b[39m",
        "\r\u001b[2K",
        "ok session.status\n",
        "\r\u001b[2Kdeckjsx> ",
        "\r\u001b[2Kdeckjsx> \u001b[36mexit\u001b[39m",
        "\r\u001b[2K",
      ].join(""),
    );
  });
});

async function* promptKeys(
  keys: readonly InteractivePromptKey[],
): AsyncIterable<InteractivePromptKey> {
  yield* keys;
}

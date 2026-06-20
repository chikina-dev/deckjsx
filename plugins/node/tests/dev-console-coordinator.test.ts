import { describe, expect, test } from "vite-plus/test";
import { createDevConsoleCoordinator } from "../src/dev-console/coordinator.ts";

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
});

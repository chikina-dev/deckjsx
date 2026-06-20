export type DevConsoleCoordinator = {
  writeConsole(lines: readonly string[]): void;
  writeInspector(lines: readonly string[]): void;
  writePromptRender(lines: readonly string[]): void;
  clearPrompt(): void;
};

export function createDevConsoleCoordinator(input: {
  readonly writeLine: (line: string) => void;
}): DevConsoleCoordinator {
  let activePromptLine: string | undefined;

  const writeWithPromptRedraw = (lines: readonly string[]) => {
    lines.forEach(input.writeLine);
    if (activePromptLine) {
      input.writeLine(activePromptLine);
    }
  };

  return {
    writeConsole(lines) {
      writeWithPromptRedraw(lines);
    },
    writeInspector(lines) {
      writeWithPromptRedraw(lines);
    },
    writePromptRender(lines) {
      lines.forEach(input.writeLine);
      activePromptLine = promptLineFromRender(lines);
    },
    clearPrompt() {
      activePromptLine = undefined;
    },
  };
}

function promptLineFromRender(lines: readonly string[]): string | undefined {
  return [...lines].reverse().find((line) => line.startsWith("deckjsx> "));
}

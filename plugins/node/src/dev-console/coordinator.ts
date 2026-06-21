export type DevConsoleCoordinator = {
  writeConsole(lines: readonly string[]): void;
  writeInspector(lines: readonly string[]): void;
  writePromptRender(lines: readonly string[]): void;
  clearPrompt(): void;
};

export function createDevConsoleCoordinator(input: {
  readonly writeLine: (line: string) => void;
  readonly writeRaw?: (text: string) => void;
}): DevConsoleCoordinator {
  let activePromptLine: string | undefined;

  const writeWithPromptRedraw = (lines: readonly string[]) => {
    if (activePromptLine && input.writeRaw) {
      input.writeRaw(clearCurrentLine());
    }
    lines.forEach(input.writeLine);
    if (activePromptLine) {
      writePromptLine(activePromptLine);
    }
  };
  const writePromptLine = (line: string) => {
    if (input.writeRaw) {
      input.writeRaw(`${clearCurrentLine()}${line}`);
      return;
    }
    input.writeLine(line);
  };

  return {
    writeConsole(lines) {
      writeWithPromptRedraw(lines);
    },
    writeInspector(lines) {
      writeWithPromptRedraw(lines);
    },
    writePromptRender(lines) {
      const nextPromptLine = promptLineFromRender(lines);
      if (activePromptLine && input.writeRaw && lines.some((line) => line !== nextPromptLine)) {
        input.writeRaw(clearCurrentLine());
      }
      activePromptLine = nextPromptLine;
      lines.forEach((line) => {
        if (line === activePromptLine) {
          writePromptLine(line);
          return;
        }
        input.writeLine(line);
      });
    },
    clearPrompt() {
      if (activePromptLine && input.writeRaw) {
        input.writeRaw(clearCurrentLine());
      }
      activePromptLine = undefined;
    },
  };
}

function clearCurrentLine(): string {
  return "\r\x1b[2K";
}

function promptLineFromRender(lines: readonly string[]): string | undefined {
  return [...lines].reverse().find((line) => line.startsWith("deckjsx> "));
}

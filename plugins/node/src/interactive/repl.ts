import type { InteractiveCommand, InteractiveDevSession, InteractiveResponse } from "./session";

export type InteractiveCommandLoopInput = {
  readonly session: InteractiveDevSession;
  readonly lines: AsyncIterable<string>;
  readonly writeLine: (line: string) => void;
};

export function parseInteractiveInputLine(line: string): InteractiveCommand | "exit" | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed === "exit" || trimmed === "quit" || trimmed === ".exit") {
    return "exit";
  }
  if (trimmed === "help" || trimmed === "?") {
    return { method: "session.help" };
  }
  if (trimmed === "status") {
    return { method: "session.status" };
  }
  if (trimmed === "timings") {
    return { method: "session.timings" };
  }
  if (trimmed === "history changes" || trimmed === "changes") {
    return { method: "history.changes" };
  }
  if (trimmed === "diagnostics") {
    return { method: "diagnostics.list" };
  }
  const tokens = trimmed.split(/\s+/);
  const [command, first, second] = tokens;
  if (command === "diagnostic" && first !== undefined && /^\d+$/.test(first)) {
    return { method: "diagnostics.explain", params: { index: Number(first) } };
  }
  if (command === "style" && first !== undefined) {
    return {
      method: "style.explain",
      params: { nodeId: first, ...(second !== undefined ? { property: second } : {}) },
    };
  }
  if (command === "component" && first !== undefined) {
    return { method: "component.stack", params: { nodeId: first } };
  }
  if (command === "projection") {
    const params = projectionParamsFromTokens(tokens.slice(1));
    return {
      method: "projection.inspect",
      ...(params ? { params } : {}),
    };
  }
  if (trimmed === "$0" || trimmed === "$1" || trimmed === "$2" || trimmed === "$$") {
    return { method: "selection.resolve", params: { handle: trimmed } };
  }
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isInteractiveCommand(parsed)) {
      return parsed;
    }
  }
  return {
    method: trimmed,
  };
}

function projectionParamsFromTokens(
  tokens: readonly string[],
): Record<string, unknown> | undefined {
  const params: Record<string, unknown> = {};
  let index = 0;
  const slotToken = tokens[index];
  if (slotToken?.startsWith("@")) {
    params.slot = numericToken(slotToken.slice(1), slotToken);
    index += 1;
  }
  const slideIndex = tokens[index];
  if (slideIndex !== undefined) {
    params.slideIndex = numericToken(slideIndex, slideIndex);
    index += 1;
  }
  const elementIndex = tokens[index];
  if (elementIndex !== undefined) {
    params.elementIndex = numericToken(elementIndex, elementIndex);
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function numericToken(value: string, fallback: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : fallback;
}

export async function runInteractiveDevCommandLoop(
  input: InteractiveCommandLoopInput,
): Promise<void> {
  for await (const line of input.lines) {
    let command: InteractiveCommand | "exit" | undefined;
    try {
      command = parseInteractiveInputLine(line);
    } catch (error) {
      input.writeLine(JSON.stringify(parseErrorResponse(error)));
      continue;
    }

    if (!command) {
      continue;
    }
    if (command === "exit") {
      return;
    }

    input.writeLine(JSON.stringify(await input.session.dispatch(command)));
  }
}

function isInteractiveCommand(value: unknown): value is InteractiveCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    typeof value.method === "string"
  );
}

function parseErrorResponse(error: unknown): InteractiveResponse {
  return {
    ok: false,
    error: {
      code: "deckjsx.node.interactive.invalidInput",
      message: error instanceof Error ? error.message : "Invalid interactive input.",
    },
  };
}

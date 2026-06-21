import { emitKeypressEvents } from "node:readline";
import type { InteractivePromptKey } from "./repl";

export function createTtyPromptKeySource(input: NodeJS.ReadStream): {
  readonly keys: AsyncIterable<InteractivePromptKey>;
  close(): void;
} {
  const pending: InteractivePromptKey[] = [];
  const previousRawMode = Boolean((input as { readonly isRaw?: boolean }).isRaw);
  let closed = false;
  let notify: (() => void) | undefined;
  const wake = () => {
    notify?.();
    notify = undefined;
  };
  const push = (key: InteractivePromptKey) => {
    pending.push(key);
    wake();
  };
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    input.off("keypress", handleKeypress);
    input.setRawMode(previousRawMode);
    input.pause();
    wake();
  };
  const handleKeypress = (sequence: string, key: Readonly<TtyKeypress>) => {
    if (key.ctrl && (key.name === "c" || key.name === "d")) {
      close();
      return;
    }
    const promptKey = interactivePromptKeyFromTtyKey(sequence, key);
    if (promptKey) {
      push(promptKey);
    }
  };
  emitKeypressEvents(input);
  input.on("keypress", handleKeypress);
  input.setRawMode(true);
  input.resume();

  return {
    keys: (async function* () {
      while (!closed || pending.length > 0) {
        const key = pending.shift();
        if (key) {
          yield key;
          continue;
        }
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    })(),
    close,
  };
}

type TtyKeypress = {
  readonly name?: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
};

function interactivePromptKeyFromTtyKey(
  sequence: string,
  key: Readonly<TtyKeypress>,
): InteractivePromptKey | undefined {
  switch (key.name) {
    case "return":
    case "enter":
      return { type: "enter" };
    case "tab":
      return { type: "tab" };
    case "backspace":
      return { type: "backspace" };
    case "left":
      return { type: "left" };
    case "right":
      return { type: "right" };
    case "up":
      return { type: "up" };
    case "down":
      return { type: "down" };
  }
  if (!key.ctrl && !key.meta && sequence && sequence >= " " && sequence !== "\u007f") {
    return { type: "insert", text: sequence };
  }
  return undefined;
}

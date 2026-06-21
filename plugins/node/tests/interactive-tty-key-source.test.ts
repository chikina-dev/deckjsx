import { EventEmitter } from "node:events";
import { describe, expect, test } from "vite-plus/test";
import { createTtyPromptKeySource } from "../src/interactive/tty-key-source.ts";

describe("@deckjsx/node interactive tty key source", () => {
  test("restores raw mode, pauses stdin, and closes pending reads", async () => {
    const input = new FakeTtyInput();
    const keySource = createTtyPromptKeySource(input.asReadStream());
    const iterator = keySource.keys[Symbol.asyncIterator]();
    const pending = iterator.next();

    keySource.close();
    keySource.close();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(input.rawModes).toEqual([true, false]);
    expect(input.resumeCount).toBe(1);
    expect(input.pauseCount).toBe(1);
    expect(input.listenerCount("keypress")).toBe(0);
  });

  test("maps tty keypress events into prompt keys until ctrl-c closes the source", async () => {
    const input = new FakeTtyInput();
    const keySource = createTtyPromptKeySource(input.asReadStream());
    const iterator = keySource.keys[Symbol.asyncIterator]();

    input.emit("keypress", "s", { name: "s" });
    input.emit("keypress", "", { name: "left" });
    input.emit("keypress", "\u0003", { name: "c", ctrl: true });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "insert", text: "s" },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "left" },
    });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(input.rawModes).toEqual([true, false]);
    expect(input.pauseCount).toBe(1);
  });

  test("restores the previous raw mode state when stdin was already raw", async () => {
    const input = new FakeTtyInput({ isRaw: true });
    const keySource = createTtyPromptKeySource(input.asReadStream());

    keySource.close();

    expect(input.rawModes).toEqual([true, true]);
    expect(input.isRaw).toBe(true);
  });
});

class FakeTtyInput extends EventEmitter {
  readonly isTTY = true;
  isRaw: boolean;
  readonly rawModes: boolean[] = [];
  resumeCount = 0;
  pauseCount = 0;

  constructor(input: { readonly isRaw?: boolean } = {}) {
    super();
    this.isRaw = input.isRaw ?? false;
  }

  setRawMode(value: boolean): this {
    this.isRaw = value;
    this.rawModes.push(value);
    return this;
  }

  resume(): this {
    this.resumeCount += 1;
    return this;
  }

  pause(): this {
    this.pauseCount += 1;
    return this;
  }

  asReadStream(): NodeJS.ReadStream {
    return this as unknown as NodeJS.ReadStream;
  }
}

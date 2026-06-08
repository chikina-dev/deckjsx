import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RenderedArtifact, WrittenOutput } from "../pipeline";
import type { OutputByteSink } from "./output";

export function createNodeOutputByteSink(input: { readonly output: string }): OutputByteSink {
  mkdirSync(dirname(input.output), { recursive: true });
  const fd = openSync(input.output, "w");
  let closed = false;

  return {
    name: "node-file-output",
    write(chunk) {
      if (closed) {
        throw new Error("Cannot write output bytes after the file sink is closed.");
      }
      writeSync(fd, chunk, 0, chunk.byteLength);
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      closeSync(fd);
    },
  };
}

export async function writeNodeOutput(input: {
  readonly output: string;
  readonly artifact: RenderedArtifact;
}): Promise<WrittenOutput> {
  await mkdir(dirname(input.output), { recursive: true });
  await writeFile(input.output, input.artifact.bytes);
  return { path: input.output };
}

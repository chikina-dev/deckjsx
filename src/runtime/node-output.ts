import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RenderedArtifact, WrittenOutput } from "../pipeline";
import type { OutputByteSink } from "./output";

function temporaryOutputPath(output: string): string {
  return join(
    dirname(output),
    `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.deckjsx.tmp`,
  );
}

function temporaryBackupPath(output: string): string {
  return join(
    dirname(output),
    `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.deckjsx.backup`,
  );
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function existingOutputIsFileSync(output: string): boolean {
  try {
    return statSync(output).isFile();
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

async function existingOutputIsFile(output: string): Promise<boolean> {
  try {
    return (await stat(output)).isFile();
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

function replaceOutputSync(tempOutput: string, output: string): void {
  if (!existingOutputIsFileSync(output)) {
    renameSync(tempOutput, output);
    return;
  }

  const backupOutput = temporaryBackupPath(output);
  renameSync(output, backupOutput);
  try {
    renameSync(tempOutput, output);
  } catch (error) {
    try {
      renameSync(backupOutput, output);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        "Failed to replace output and restore the previous output file.",
      );
    }
    throw error;
  }
  try {
    unlinkSync(backupOutput);
  } catch {
    // Best effort cleanup; the requested output path has already been replaced.
  }
}

async function replaceOutput(tempOutput: string, output: string): Promise<void> {
  if (!(await existingOutputIsFile(output))) {
    await rename(tempOutput, output);
    return;
  }

  const backupOutput = temporaryBackupPath(output);
  await rename(output, backupOutput);
  try {
    await rename(tempOutput, output);
  } catch (error) {
    try {
      await rename(backupOutput, output);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        "Failed to replace output and restore the previous output file.",
      );
    }
    throw error;
  }
  await unlink(backupOutput).catch(() => undefined);
}

export function createNodeOutputByteSink(input: { readonly output: string }): OutputByteSink {
  mkdirSync(dirname(input.output), { recursive: true });
  const tempOutput = temporaryOutputPath(input.output);
  const fd = openSync(tempOutput, "wx");
  let closed = false;
  let failed = false;

  const cleanup = (): void => {
    try {
      unlinkSync(tempOutput);
    } catch {
      // Best effort cleanup; the original output path has not been opened.
    }
  };

  const closeTemp = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    closeSync(fd);
  };

  return {
    name: "node-file-output",
    write(chunk) {
      if (closed) {
        throw new Error("Cannot write output bytes after the file sink is closed.");
      }
      try {
        writeSync(fd, chunk, 0, chunk.byteLength);
      } catch (error) {
        failed = true;
        try {
          closeTemp();
        } catch {
          // Preserve the original write error.
        }
        cleanup();
        throw error;
      }
    },
    close() {
      if (closed) {
        return;
      }
      try {
        closeTemp();
      } catch (error) {
        failed = true;
        cleanup();
        throw error;
      }
      if (failed) {
        cleanup();
        return;
      }
      try {
        replaceOutputSync(tempOutput, input.output);
      } catch (error) {
        cleanup();
        throw error;
      }
    },
  };
}

export async function writeNodeOutput(input: {
  readonly output: string;
  readonly artifact: RenderedArtifact;
}): Promise<WrittenOutput> {
  await mkdir(dirname(input.output), { recursive: true });
  const tempOutput = temporaryOutputPath(input.output);
  try {
    await writeFile(tempOutput, input.artifact.bytes, { flag: "wx" });
    await replaceOutput(tempOutput, input.output);
  } catch (error) {
    await unlink(tempOutput).catch(() => undefined);
    throw error;
  }
  return { path: input.output };
}

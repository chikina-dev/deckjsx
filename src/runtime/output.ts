import type { RenderedArtifact, WrittenOutput } from "../pipeline";

export type OutputRuntimeUnavailableReason = "nodeRuntimeUnavailable" | "nodeOutputImportFailed";

export type OutputByteSink = {
  readonly name: string;
  write(chunk: Uint8Array): void;
  close?(): void;
};

export type OutputRuntimeUnavailable = {
  readonly ok: false;
  readonly reason: OutputRuntimeUnavailableReason;
  readonly message: string;
  readonly error?: unknown;
};

export type OutputRuntimeAvailable = {
  readonly ok: true;
  createByteSink(input: { readonly output: string }): OutputByteSink;
  write(input: {
    readonly output: string;
    readonly artifact: RenderedArtifact;
  }): Promise<WrittenOutput>;
};

type RuntimeGlobal = {
  readonly process?: {
    readonly versions?: {
      readonly node?: string;
    };
  };
};

export function nodeOutputRuntimeStatus(
  runtime: RuntimeGlobal = globalThis as RuntimeGlobal,
): OutputRuntimeUnavailable | { readonly ok: true } {
  if (!runtime.process?.versions?.node) {
    return {
      ok: false,
      reason: "nodeRuntimeUnavailable",
      message:
        "Path output requires a Node-like runtime. Render without an output path to use artifact bytes.",
    };
  }

  return { ok: true };
}

export async function loadNodeOutputRuntime(): Promise<
  OutputRuntimeAvailable | OutputRuntimeUnavailable
> {
  const status = nodeOutputRuntimeStatus();
  if (!status.ok) {
    return status;
  }

  try {
    const { createNodeOutputByteSink, writeNodeOutput } = await import("./node-output");
    return {
      ok: true,
      createByteSink: createNodeOutputByteSink,
      write: writeNodeOutput,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "nodeOutputImportFailed",
      message:
        "The Node output runtime could not be loaded. Render without an output path to use artifact bytes.",
      error,
    };
  }
}

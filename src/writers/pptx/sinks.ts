export type PptxZipSink = {
  readonly name: string;
  write(chunk: Uint8Array): void;
  close?(): void;
};

export type CollectingPptxZipSink = PptxZipSink & {
  bytes(): Uint8Array;
};

export type CollectingPptxZipSinkWithSideEffect = CollectingPptxZipSink & {
  sideEffectError(): unknown;
};

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createCollectingPptxZipSink(): CollectingPptxZipSink {
  const chunks: Uint8Array[] = [];
  let closed = false;

  return {
    name: "collecting",
    write(chunk) {
      if (closed) {
        throw new Error("Cannot write PPTX ZIP chunk after sink close.");
      }
      chunks.push(chunk);
    },
    close() {
      closed = true;
    },
    bytes() {
      return concatChunks(chunks);
    },
  };
}

export function createTeePptxZipSink(sinks: readonly PptxZipSink[], name = "tee"): PptxZipSink {
  return {
    name,
    write(chunk) {
      const failures: unknown[] = [];
      for (const sink of sinks) {
        try {
          sink.write(chunk);
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length > 0) {
        throw failures[0];
      }
    },
    close() {
      const failures: unknown[] = [];
      for (const sink of sinks) {
        try {
          sink.close?.();
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length > 0) {
        throw failures[0];
      }
    },
  };
}

export function createCollectingPptxZipSinkWithSideEffect(
  sideEffectSink: PptxZipSink,
  name = "collecting-with-side-effect",
): CollectingPptxZipSinkWithSideEffect {
  const collecting = createCollectingPptxZipSink();
  let sideEffectError: unknown;

  const writeSideEffect = (chunk: Uint8Array): void => {
    if (sideEffectError) {
      return;
    }

    try {
      sideEffectSink.write(chunk);
    } catch (error) {
      sideEffectError = error;
    }
  };

  return {
    name,
    write(chunk) {
      collecting.write(chunk);
      writeSideEffect(chunk);
    },
    close() {
      collecting.close?.();
      if (sideEffectError) {
        return;
      }

      try {
        sideEffectSink.close?.();
      } catch (error) {
        sideEffectError = error;
      }
    },
    bytes() {
      return collecting.bytes();
    },
    sideEffectError() {
      return sideEffectError;
    },
  };
}

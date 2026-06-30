import path from "node:path";
import { rolldown, type OutputChunk, type Plugin } from "rolldown";
import { deckjsxJsxTransformOptionsForCwd } from "./jsx-transform-options";
import { transformDeckjsxMediaSourceOrigins } from "./media-source-transform";

export type DeckjsxBundleInput = {
  readonly entry: string;
  readonly cwd?: string;
};

export type DeckjsxBundleResult = {
  readonly code: string;
  readonly moduleIds: readonly string[];
  readonly watchFiles: readonly string[];
};

export function isDeckjsxRuntimeExternalId(id: string): boolean {
  return (
    id === "deckjsx" ||
    id.startsWith("deckjsx/") ||
    id === "@deckjsx/node" ||
    id.startsWith("@deckjsx/node/") ||
    id.startsWith("node:")
  );
}

export async function bundleDeckjsxEntry(input: DeckjsxBundleInput): Promise<DeckjsxBundleResult> {
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  const entry = path.resolve(cwd, input.entry);
  const bundle = await rolldown({
    input: entry,
    cwd,
    platform: "node",
    external: isDeckjsxRuntimeExternalId,
    plugins: [deckjsxMediaSourceOriginPlugin()],
    transform: {
      jsx: deckjsxJsxTransformOptionsForCwd(cwd),
    },
  });

  try {
    const generated = await bundle.generate({
      format: "esm",
      codeSplitting: false,
      sourcemap: false,
    });
    const chunk = generated.output.find((item): item is OutputChunk => item.type === "chunk");
    if (!chunk) {
      throw new Error("Rolldown did not generate an executable chunk for the deckjsx entry.");
    }

    const watchFiles = await bundle.watchFiles;
    return {
      code: chunk.code,
      moduleIds: chunk.moduleIds,
      watchFiles: [...new Set([...watchFiles, ...chunk.moduleIds])].sort(),
    };
  } finally {
    await bundle.close();
  }
}

function deckjsxMediaSourceOriginPlugin(): Plugin {
  return {
    name: "@deckjsx/node/media-source-origin",
    transform(code, id) {
      const transformed = transformDeckjsxMediaSourceOrigins(code, id);
      return transformed ? { code: transformed, map: null } : undefined;
    },
  };
}

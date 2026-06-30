import { readFileSync } from "node:fs";
import path from "node:path";

export type DeckjsxJsxTransformOptions = {
  readonly runtime: "automatic";
  readonly importSource?: "deckjsx";
};

export function deckjsxJsxTransformOptionsForCwd(cwd: string): DeckjsxJsxTransformOptions {
  return {
    runtime: "automatic",
    ...(nearestTsconfigUsesDeckjsxJsxImportSource(cwd) ? {} : { importSource: "deckjsx" }),
  };
}

function nearestTsconfigUsesDeckjsxJsxImportSource(cwd: string): boolean {
  let current = path.resolve(cwd);

  while (true) {
    try {
      if (
        /"jsxImportSource"\s*:\s*"deckjsx"/.test(
          readFileSync(path.join(current, "tsconfig.json"), "utf8"),
        )
      ) {
        return true;
      }
    } catch {
      // Keep walking to match Rolldown's parent tsconfig discovery.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

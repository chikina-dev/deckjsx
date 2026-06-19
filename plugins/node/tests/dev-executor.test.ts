import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { bundleDeckjsxEntry, isDeckjsxRuntimeExternalId } from "../src/dev-executor.ts";

describe("@deckjsx/node dev executor", () => {
  test("externalizes deckjsx runtime packages and node builtins", () => {
    expect(isDeckjsxRuntimeExternalId("deckjsx")).toBe(true);
    expect(isDeckjsxRuntimeExternalId("deckjsx/adapter")).toBe(true);
    expect(isDeckjsxRuntimeExternalId("@deckjsx/node")).toBe(true);
    expect(isDeckjsxRuntimeExternalId("@deckjsx/node/assets")).toBe(true);
    expect(isDeckjsxRuntimeExternalId("node:fs")).toBe(true);
    expect(isDeckjsxRuntimeExternalId("./local.ts")).toBe(false);
  });

  test("bundles a TSX entry with media origin annotation and runtime externals", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deckjsx-node-executor-"));
    const entry = path.join(root, "main.tsx");
    await writeFile(
      entry,
      [
        'import { Deck } from "deckjsx";',
        'import { pptx } from "deckjsx/adapter";',
        'import { write } from "@deckjsx/node";',
        "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
        'deck.slide({ name: "Media" }, () => <img src="./hero.png" />);',
        'await write(await deck.render(pptx()), "output.pptx");',
      ].join("\n"),
    );

    const result = await bundleDeckjsxEntry({ entry, cwd: root });

    expect(result.code).toContain('from "deckjsx"');
    expect(result.code).toContain('from "deckjsx/adapter"');
    expect(result.code).toContain('from "@deckjsx/node"');
    expect(result.code).toContain('from "deckjsx/integration"');
    expect(result.code).toContain("authoringMetadata({ mediaSourceOrigins: { src:");
    const bundledEntry = result.moduleIds.find((id) => id.endsWith("/main.tsx"));
    expect(bundledEntry).toBeDefined();
    expect(result.code).toContain(`importer: ${JSON.stringify(bundledEntry)}`);
    expect(result.watchFiles).toContain(bundledEntry);
  });
});

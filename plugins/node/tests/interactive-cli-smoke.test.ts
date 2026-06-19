import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { createIncrementalArtifactSession } from "deckjsx/integration";
import { runDeckjsxDevCompilerHost } from "../src/cli.ts";
import { createDeckjsxDevCompiler } from "../src/dev-compiler.ts";

async function* interactiveLines(): AsyncIterable<string> {
  yield "help";
  yield "status";
  yield "projection";
  yield "exit";
}

describe("@deckjsx/node interactive cli smoke", () => {
  test("runs a real dev compilation and answers interactive commands", async () => {
    const cwd = await mkdtemp(path.join(process.cwd(), ".deckjsx-interactive-smoke-"));
    const outputPath = path.join(cwd, "output.pptx");
    const output: unknown[] = [];
    await writeFile(
      path.join(cwd, "entry.cts"),
      [
        'import { writeFile } from "node:fs/promises";',
        'import { Deck } from "deckjsx";',
        'import { pptx } from "deckjsx/adapter";',
        'import { getArtifactWriteToken, recordArtifactWrite } from "deckjsx/integration";',
        'import { jsx } from "deckjsx/jsx-runtime";',
        "module.exports = (async () => {",
        '  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
        '  deck.slide({ name: "Interactive smoke" }, () => jsx("p", { style: { x: 1, y: 1, width: 5, height: 0.5 }, children: "interactive smoke" }));',
        "  const render = await deck.render(pptx());",
        "  if (!render.ok || !render.artifact) throw new Error('render failed');",
        '  await writeFile("output.pptx", render.artifact.bytes);',
        '  recordArtifactWrite(getArtifactWriteToken(render), { path: "output.pptx", result: { status: "created", strategy: "write-file", bytesWritten: render.artifact.bytes.byteLength, patchedParts: [], diagnostics: [] } });',
        "})();",
      ].join("\n"),
    );

    const artifactSession = createIncrementalArtifactSession();
    const compiler = createDeckjsxDevCompiler({
      cwd,
      entry: "entry.cts",
      out: "output.pptx",
      session: artifactSession,
    });
    try {
      await runDeckjsxDevCompilerHost({
        compiler,
        detail: "details",
        interactive: true,
        artifactSession,
        interactiveLines: interactiveLines(),
        interactiveWriteLine(line) {
          output.push(JSON.parse(line) as unknown);
        },
        maxCompilations: 1,
      });

      await expect(access(outputPath)).resolves.toBeUndefined();
      await expect(stat(outputPath)).resolves.toEqual(
        expect.objectContaining({ size: expect.any(Number) }),
      );
      expect(output).toEqual([
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            commands: expect.arrayContaining([
              expect.objectContaining({ method: "projection.inspect" }),
            ]),
          }),
        }),
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            compilerStarted: true,
            lastSuccessfulCompilation: 1,
          }),
        }),
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            format: "pptx",
            slides: [expect.objectContaining({ name: "Interactive smoke", elementCount: 1 })],
          }),
        }),
      ]);
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});

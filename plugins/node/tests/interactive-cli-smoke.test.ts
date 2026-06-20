import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { createIncrementalArtifactSession } from "deckjsx/integration";
import { runDeckjsxDevCompilerHost } from "../src/cli.ts";
import { createDeckjsxDevCompiler } from "../src/dev-compiler.ts";
import { createNodeDevInspectionStore } from "../src/dev-inspection-store.ts";

async function* interactiveLines(): AsyncIterable<string> {
  yield "help";
  yield "status";
  yield "component tree";
  yield "props inspect MetricCard title";
  yield "projection";
  yield "exit";
}

describe("@deckjsx/node interactive cli smoke", () => {
  test("runs a real dev compilation and answers interactive commands", async () => {
    const cwd = await mkdtemp(path.join(process.cwd(), ".deckjsx-interactive-smoke-"));
    const outputPath = path.join(cwd, "output.pptx");
    const output: string[] = [];
    await writeFile(
      path.join(cwd, "entry.cts"),
      [
        'import { writeFile } from "node:fs/promises";',
        'import { Deck } from "deckjsx";',
        'import { pptx } from "deckjsx/adapter";',
        'import { getArtifactWriteToken, recordArtifactWrite } from "deckjsx/integration";',
        'import { jsx } from "deckjsx/jsx-runtime";',
        "function MetricCard(props) {",
        '  return jsx("p", { style: { x: 1, y: 1, width: 5, height: 0.5 }, children: props.title });',
        "}",
        "module.exports = (async () => {",
        '  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
        '  deck.slide({ name: "Interactive smoke" }, () => jsx(MetricCard, { title: "interactive smoke" }));',
        "  const render = await deck.render(pptx());",
        "  if (!render.ok || !render.artifact) throw new Error('render failed');",
        '  await writeFile("output.pptx", render.artifact.bytes);',
        '  recordArtifactWrite(getArtifactWriteToken(render), { path: "output.pptx", result: { status: "created", strategy: "write-file", bytesWritten: render.artifact.bytes.byteLength, patchedParts: [], diagnostics: [] } });',
        "})();",
      ].join("\n"),
    );

    const artifactSession = createIncrementalArtifactSession();
    const inspectionStore = createNodeDevInspectionStore();
    const compiler = createDeckjsxDevCompiler({
      cwd,
      entry: "entry.cts",
      out: "output.pptx",
      session: artifactSession,
      inspectionStore,
    });
    try {
      await runDeckjsxDevCompilerHost({
        compiler,
        interactive: true,
        artifactSession,
        inspectionStore,
        interactiveLines: interactiveLines(),
        interactiveWriteLine(line) {
          output.push(line);
        },
        maxCompilations: 1,
      });

      await expect(access(outputPath)).resolves.toBeUndefined();
      await expect(stat(outputPath)).resolves.toEqual(
        expect.objectContaining({ size: expect.any(Number) }),
      );
      expect(output).toEqual([
        "ok session.help",
        "  Press Tab for contextual command completion.",
        "  Run deckjsx dev --interactive-help for the full command reference.",
        "ok session.status",
        "  compiler    running",
        "  last        compilation 1",
        "  success     compilation 1",
        "  skipped     0 failed attempts",
        "ok component.tree",
        "  status      complete",
        "  compilation 1",
        "  MetricCard component:MetricCard:unknown:0:0",
        "ok props.inspect",
        "  target component:MetricCard:unknown:0:0",
        "  path   title",
        "  value  interactive smoke",
        "ok projection.inspect",
        "  slot        0",
        "  format      pptx",
        "  slides      1",
        "  [0] Interactive smoke ppt/slides/slide1.xml 1 element",
      ]);
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});

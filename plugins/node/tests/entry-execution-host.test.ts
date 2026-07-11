import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEntryExecutionHost } from "@/src/entry-execution-host.ts";
import { describe, expect, test } from "vite-plus/test";

describe("@deckjsx/node entry execution host syntax transforms", () => {
  test("rewrites syntax imports without touching comments, strings, or template raw text", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-parser-aware-"));
    const report = path.join(project, "report.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        'import { Deck } from "deckjsx";',
        '// import { fake } from "deckjsx";',
        'const stringValue = \'from "deckjsx" and import("deckjsx")\';',
        'const templateValue = `raw import("deckjsx"):${typeof (await import("deckjsx")).Deck}`;',
        `await writeFile(${JSON.stringify(report)}, [stringValue, templateValue, typeof Deck].join("|"));`,
      ].join("\n"),
    });

    await expect(readFile(report, "utf8")).resolves.toBe(
      'from "deckjsx" and import("deckjsx")|raw import("deckjsx"):function|function',
    );
  });

  test("handles multiple imports and re-exports while ignoring similar package text", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-multiple-imports-"));
    const report = path.join(project, "report.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        'import { Deck } from "deckjsx";',
        'import { pdf, pptx } from "deckjsx/adapter";',
        'export { Deck as PublicDeck } from "deckjsx";',
        'export { pdf as publicPdf } from "deckjsx/adapter";',
        'const deckjsxSimilar = "deckjsxx";',
        `await writeFile(${JSON.stringify(report)}, [typeof Deck, typeof pdf, typeof pptx, deckjsxSimilar].join(","));`,
      ].join("\n"),
    });

    await expect(readFile(report, "utf8")).resolves.toBe("function,function,function,deckjsxx");
  });

  test("awaits a named default export without rewriting sibling exports", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-named-default-"));
    const report = path.join(project, "report.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        'const keep = "named export";',
        `const completion = Promise.resolve().then(() => writeFile(${JSON.stringify(report)}, keep));`,
        "export { keep, completion as default };",
      ].join("\n"),
    });

    await expect(readFile(report, "utf8")).resolves.toBe("named export");
  });
});

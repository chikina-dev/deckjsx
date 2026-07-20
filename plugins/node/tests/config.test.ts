import { mkdtemp, mkdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { defineConfig, resolveConfig, resolveEntries } from "@/src/index";
import { createRolldownWatchAdapter } from "@/src/rolldown-watch-adapter";
import { createHostSessionSourceProvider } from "@/src/host-session-source-provider";
import { createEntryExecutionHost } from "@/src/entry-execution-host";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("deckjsx Node configuration", () => {
  test("marks object and factory definitions without changing their identity", () => {
    const object = { entry: "slides.ts" };
    const factory = async () => object;

    expect(defineConfig(object)).toBe(object);
    expect(defineConfig(factory)).toBe(factory);
    expect(defineConfig(null as never)).toBeNull();
  });

  test("reports Host Package boundary failures distinctly", async () => {
    const outer = await realpath(await mkdtemp(path.join(os.tmpdir(), "deckjsx-boundary-test-")));
    temporaryDirectories.push(outer);
    const misplaced = path.join(outer, "nested");
    await mkdir(misplaced);
    await writeFile(path.join(misplaced, "deckjsx.config.ts"), "export default {};");

    const misplacedResult = await resolveConfig({ cwd: misplaced });
    expect(misplacedResult.ok).toBe(false);
    if (misplacedResult.ok) return;
    expect(misplacedResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_PACKAGE_MISSING" }),
    );

    await rm(path.join(misplaced, "deckjsx.config.ts"));
    const missingResult = await resolveConfig({ cwd: misplaced });
    expect(missingResult.ok).toBe(false);
    if (missingResult.ok) return;
    expect(missingResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_PACKAGE_NOT_FOUND" }),
    );
  });

  test("rejects cyclic extends and factory results that are not config objects", async () => {
    const root = await fixture();
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(
      configPath,
      `const cyclic = {}; cyclic.extends = cyclic; export default cyclic;`,
    );
    const cyclic = await resolveConfig({ cwd: root });
    expect(cyclic.ok).toBe(false);
    if (cyclic.ok) return;
    expect(cyclic.diagnostics[0]?.message).toContain("extends contains a cycle");

    await writeFile(configPath, `export default async () => 42;`);
    const primitive = await resolveConfig({ cwd: root });
    expect(primitive.ok).toBe(false);
    if (primitive.ok) return;
    expect(primitive.diagnostics[0]?.message).toContain("must resolve to an object");
  });

  test("loads relative, Node builtin, package export, and package subpath config dependencies", async () => {
    const root = await fixture();
    const dependency = path.join(root, "node_modules", "config-values");
    await mkdir(dependency, { recursive: true });
    await writeFile(
      path.join(dependency, "package.json"),
      JSON.stringify({
        type: "module",
        exports: {
          ".": { import: "./import.js", default: "./default.js" },
          "./sub": "./sub.js",
        },
      }),
    );
    await writeFile(path.join(dependency, "import.js"), `export const entry = "slides.ts";`);
    await writeFile(path.join(dependency, "default.js"), `export const entry = "wrong.ts";`);
    await writeFile(path.join(dependency, "sub.js"), `export const output = "slides.pdf";`);
    await writeFile(path.join(root, "local.ts"), `export const plugins = [];`);
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `import path from "node:path";
import { entry } from "config-values";
import { output } from "config-values/sub";
import { plugins } from "./local";
export default { entry: path.basename(entry), output, plugins };`,
    );

    const result = await resolveConfig({ cwd: root });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entry).toEqual(["slides.ts"]);
    expect(result.value.output).toEqual(["slides.pdf"]);
    expect(result.value.watchFiles).toContain(path.join(root, "local.ts"));
  });

  test("uses config-file import.meta.url semantics and Node wildcard/imports resolution", async () => {
    const root = await fixture();
    const dependency = path.join(root, "node_modules", "config-patterns");
    await mkdir(path.join(dependency, "dist"), { recursive: true });
    await writeFile(
      path.join(dependency, "package.json"),
      JSON.stringify({ type: "module", exports: { "./*": "./dist/*.js" } }),
    );
    await writeFile(path.join(dependency, "dist", "entry.js"), `export default "wildcard.ts";`);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ type: "module", imports: { "#output": "./output-name.ts" } }),
    );
    await writeFile(path.join(root, "output-name.ts"), `export default "slides.pdf";`);
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `import { fileURLToPath } from "node:url";
import entry from "config-patterns/entry";
import output from "#output";
if (fileURLToPath(import.meta.url) !== ${JSON.stringify(path.join(root, "deckjsx.config.ts"))}) throw new Error("wrong config URL");
export default { entry, output };`,
    );

    const result = await resolveConfig({ cwd: root });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entry).toEqual(["wildcard.ts"]);
    expect(result.value.output).toEqual(["slides.pdf"]);
  });

  test("rejects unknown config keys and keeps imported config dependencies watched", async () => {
    const root = await fixture();
    const basePath = path.join(root, "base.ts");
    await writeFile(basePath, `export default { entries: "slides.ts", output: 42 };`);
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `import base from "./base"; export default { extends: base };`,
    );

    const result = await resolveConfig({ cwd: root });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_CONFIG_INVALID",
          title: expect.stringContaining("entries"),
        }),
        expect.objectContaining({
          code: "E_CONFIG_INVALID",
          title: expect.stringContaining("output"),
        }),
      ]),
    );
    expect(result.watchFiles).toContain(basePath);
  });

  test("reports invalid default exports, fields, and unresolved package imports", async () => {
    const root = await fixture();
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(configPath, `export default 42;`);
    const invalidDefault = await resolveConfig({ cwd: root });
    expect(invalidDefault.ok).toBe(false);
    if (invalidDefault.ok) return;
    expect(invalidDefault.diagnostics[0]?.message).toContain("default export");

    await writeFile(configPath, `export default { entry: 1, output: {}, plugins: "invalid" };`);
    const invalidFields = await resolveConfig({ cwd: root });
    expect(invalidFields.ok).toBe(false);
    if (invalidFields.ok) return;
    expect(
      invalidFields.diagnostics.filter((item) => item.code === "E_CONFIG_INVALID"),
    ).toHaveLength(3);

    await writeFile(configPath, `import "package-that-does-not-exist"; export default {};`);
    const missingPackage = await resolveConfig({ cwd: root });
    expect(missingPackage.ok).toBe(false);
    if (missingPackage.ok) return;
    expect(missingPackage.diagnostics[0]?.message).toContain("Cannot resolve package import");
  });

  test("resolves async extends with child hints and slot-preserving Plugin overrides", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `
const base = async () => ({
  entry: "base.ts",
  plugins: [
    { kind: "deckjsx.plugin", id: "shared", consumer: { value: "base" } },
    { kind: "deckjsx.plugin", id: "after" },
  ],
});
const config = async ({ environment }) => ({
  extends: base,
  entry: environment === "test" ? "slides.ts" : "other.ts",
  output: ["dist/slides.pptx", "dist/slides.pdf"],
  plugins: [{ kind: "deckjsx.plugin", id: "shared", consumer: { value: "child" } }],
});
Object.defineProperty(config, Symbol.for("deckjsx.node.configDefinition"), { value: true });
export default config;
`,
    );

    const result = await resolveConfig({ cwd: root, environment: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entry).toEqual(["slides.ts"]);
    expect(result.value.output).toEqual(["dist/slides.pptx", "dist/slides.pdf"]);
    expect(result.value.plugins.map((plugin) => plugin.id)).toEqual(["shared", "after"]);
    expect(result.value.plugins[0]).toMatchObject({ consumer: { value: "child" } });
    expect(result.diagnostics).toEqual([]);
  });

  test("loads a valid raw config with a warning", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "deckjsx.config.ts"), `export default { entry: "slides.ts" };`);

    const result = await resolveConfig({ cwd: root });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_DEFINE_CONFIG_MISSING" }),
    );
  });

  test("rejects invalid nested Plugin contracts at the configuration seam", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { plugins: [{ kind: "deckjsx.plugin", id: "broken", authoring: { lower: 1 } }] };`,
    );

    const result = await resolveConfig({ cwd: root });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_INVALID" }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_LOAD_FAILED" }),
    );
  });

  test("resolves explicit entries relative to the consuming package", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), "export {};\n");
    await writeFile(path.join(root, "deckjsx.config.ts"), `export default { entry: "slides.ts" };`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
  });

  test("allows an ignored explicit entry with a warning", async () => {
    const root = await fixture();
    await writeFile(path.join(root, ".gitignore"), "ignored.ts\n");
    await writeFile(path.join(root, "ignored.ts"), "export {};\n");
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: "ignored.ts" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "ignored.ts")]);
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_ENTRY_IGNORED" }),
    );
  });

  test("diagnoses missing, non-file, and outside-package explicit entries with watch evidence", async () => {
    const root = await fixture();
    const directoryEntry = path.join(root, "directory-entry");
    await mkdir(directoryEntry);
    const outsideRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "deckjsx-outside-entry-test-")),
    );
    temporaryDirectories.push(outsideRoot);
    const outsideEntry = path.join(outsideRoot, "outside.ts");
    await writeFile(outsideEntry, "export {};\n");
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: ["missing.ts", "directory-entry", ${JSON.stringify(outsideEntry)}] };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(
      entries.diagnostics.filter((item) => item.code === "E_CONFIG_ENTRY_MISSING"),
    ).toHaveLength(2);
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_ENTRY_OUTSIDE_PACKAGE" }),
    );
    expect(entries.watchFiles).toContain(outsideEntry);
    expect(entries.watchDirectories).toContain(root);
  });

  test("invalidates an explicit entry snapshot when a new ignore rule is created", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), "export {};\n");
    await writeFile(path.join(root, "deckjsx.config.ts"), `export default { entry: "slides.ts" };`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const first = await resolveEntries(config.value);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_ENTRY_IGNORED" }),
    );

    await writeFile(path.join(root, ".gitignore"), "slides.ts\n");
    const second = await resolveEntries(config.value);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.diagnostics).toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_ENTRY_IGNORED" }),
    );
  });

  test("rejects an empty explicit entry set before Host Session construction", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "deckjsx.config.ts"), `export default { entry: [] };`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_EMPTY" }),
    );
  });

  test("discovers the execution root instead of the write helper and respects gitignore", async () => {
    const root = await fixture();
    await writeFile(path.join(root, ".gitignore"), "dist/\n");
    await writeFile(
      path.join(root, "output.ts"),
      `import { write } from "@deckjsx/node";
export async function emit(value) { await write(value, "dist/slides.pptx"); }
`,
    );
    await writeFile(
      path.join(root, "slides.ts"),
      `import { emit } from "./output";
await emit({ ok: false, diagnostics: { items: [] } });
`,
    );
    await mkdir(path.join(root, "dist"));
    await writeFile(
      path.join(root, "dist", "generated.js"),
      `import { write } from "@deckjsx/node"; await write({}, "dist/generated.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
    expect(entries.value.watchFiles).toContain(path.join(root, ".gitignore"));
  });

  test("uses an explicit output hint to disambiguate Entry Execution Roots", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "slides.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "dist/slides.pptx");`,
    );
    await writeFile(
      path.join(root, "notes.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "dist/notes.pdf");`,
    );
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: null, output: "dist/slides.pptx" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
  });

  test("matches configured outputs at write calls without substring false positives", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "slides.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "output.pptx");`,
    );
    await writeFile(
      path.join(root, "backup.ts"),
      `import { write } from "@deckjsx/node"; const note = "output.pptx"; await write({}, "backup-output.pptx");`,
    );
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: null, output: "output.pptx" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
  });

  test("discovers CommonJS destructured write imports", async () => {
    const root = await fixture();
    const entry = path.join(root, "slides.cts");
    await writeFile(entry, `const { write } = require("@deckjsx/node"); write({}, "slides.pptx");`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([entry]);
  });

  test("keeps discovery usable and warns when an output hint cannot narrow it", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "slides.ts"),
      `import { write as emit } from "@deckjsx/node"; await emit({}, "actual.pptx");`,
    );
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { output: "different.pdf" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_OUTPUT_STATIC_UNRESOLVED" }),
    );
  });

  test("recognizes namespace write provenance and ignores nested Host Packages", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "slides.ts"),
      `import * as node from "@deckjsx/node"; await node.write({}, "slides.pptx");`,
    );
    const nestedPackage = path.join(root, "examples", "nested-package");
    await mkdir(nestedPackage, { recursive: true });
    await writeFile(path.join(nestedPackage, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(
      path.join(nestedPackage, "other.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "other.pdf");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
  });

  test("follows aliased write provenance through a local re-export chain", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "write-boundary.ts"),
      `export { write as emit } from "@deckjsx/node";`,
    );
    await writeFile(path.join(root, "public.ts"), `export { emit } from "./write-boundary";`);
    await writeFile(
      path.join(root, "slides.ts"),
      `import { emit as output } from "./public"; await output({}, "slides.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(root, "slides.ts")]);
  });

  test("supports gitignore negation while traversing an ignored directory", async () => {
    const root = await fixture();
    const generated = path.join(root, "generated");
    await mkdir(generated);
    await writeFile(path.join(root, ".gitignore"), "generated/\n!generated/slides.ts\n");
    await writeFile(
      path.join(generated, "slides.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([path.join(generated, "slides.ts")]);
  });

  test("treats escaped gitignore comment and negation prefixes as literal patterns", async () => {
    const root = await fixture();
    await writeFile(path.join(root, ".gitignore"), "\\#slides.ts\n\\!notes.ts\n");
    await writeFile(
      path.join(root, "#slides.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    await writeFile(
      path.join(root, "!notes.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "notes.pdf");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("applies and watches gitignore rules inherited from the repository root", async () => {
    const repository = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "deckjsx-ancestor-ignore-test-")),
    );
    temporaryDirectories.push(repository);
    await mkdir(path.join(repository, ".git"));
    const root = path.join(repository, "packages", "slides");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    const ancestorIgnore = path.join(repository, ".gitignore");
    await writeFile(ancestorIgnore, "packages/slides/slides.ts\n");
    await writeFile(
      path.join(root, "slides.ts"),
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(entries.watchFiles).toContain(ancestorIgnore);
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("requires write call provenance from @deckjsx/node", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "unrelated.ts"),
      `import { nodeAssets } from "@deckjsx/node";
const write = globalThis.write;
globalThis.__nodeAssets = nodeAssets;
write();
`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("reports static Entry Execution analysis failures without collapsing them to not found", async () => {
    const root = await fixture();
    const broken = path.join(root, "broken.ts");
    await writeFile(
      broken,
      `import { write } from "@deckjsx/node"; const invalid = ; await write({}, "broken.pdf");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_CONFIG_ENTRY_ANALYSIS_FAILED",
        labels: [expect.objectContaining({ path: broken })],
      }),
    );
    expect(entries.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("invalidates cached dynamic discovery when a traversed source changes", async () => {
    const root = await fixture();
    const entry = path.join(root, "slides.ts");
    await writeFile(
      entry,
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const first = await resolveEntries(config.value);
    expect(first.ok).toBe(true);

    await writeFile(entry, `export const noLongerAnEntry = true;\n`);
    const second = await resolveEntries(config.value);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("invalidates cached dynamic discovery when an initially empty gitignore changes", async () => {
    const root = await fixture();
    const entry = path.join(root, "slides.ts");
    const ignore = path.join(root, ".gitignore");
    await writeFile(ignore, "");
    await writeFile(
      entry,
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const first = await resolveEntries(config.value);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.watchFiles).toContain(ignore);

    await writeFile(ignore, "slides.ts\n");
    const second = await resolveEntries(config.value);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("applies a root-anchored gitignore rule only at its declared base", async () => {
    const root = await fixture();
    const nested = path.join(root, "nested");
    await mkdir(nested);
    await writeFile(path.join(root, ".gitignore"), "/ignored.ts\n");
    await writeFile(path.join(nested, "ignored.ts"), "export {};\n");
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: "nested/ignored.ts" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "W_CONFIG_ENTRY_IGNORED" }),
    );
  });

  test("does not discover a file symlink whose real path is inside node_modules", async () => {
    const root = await fixture();
    const dependencyRoot = path.join(root, "node_modules", "generated-entry");
    await mkdir(dependencyRoot, { recursive: true });
    const dependencyEntry = path.join(dependencyRoot, "entry.ts");
    await writeFile(
      dependencyEntry,
      `import { write } from "@deckjsx/node"; await write({}, "dependency.pptx");`,
    );
    await symlink(dependencyEntry, path.join(root, "linked-entry.ts"));
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    expect(entries.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_CONFIG_ENTRY_NOT_FOUND" }),
    );
  });

  test("discovers an in-scope source through a file symlink and skips broken links", async () => {
    const root = await fixture();
    const hidden = path.join(root, "hidden");
    await mkdir(hidden);
    await writeFile(path.join(root, ".gitignore"), "hidden/\n");
    const target = path.join(hidden, "slides.ts");
    await writeFile(
      target,
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    await symlink(target, path.join(root, "slides-link.ts"));
    await symlink(path.join(root, "missing-target.ts"), path.join(root, "broken-link.ts"));
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    const entries = await resolveEntries(config.value);

    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    expect(entries.value.entries).toEqual([target]);
    expect(entries.value.watchFiles).toContain(target);
  });

  test("bundles multiple entries through one virtual Host execution root", async () => {
    const root = await fixture();
    const first = path.join(root, "first.ts");
    const second = path.join(root, "second.ts");
    await writeFile(
      first,
      `export default new Promise((resolve) => setTimeout(() => { globalThis.__deckjsxFirst = true; resolve(); }, 20));\n`,
    );
    await writeFile(
      second,
      `export default new Promise((resolve) => setTimeout(() => { globalThis.__deckjsxSecond = true; resolve(); }, 20));\n`,
    );
    const adapter = createRolldownWatchAdapter({ cwd: root, entry: [first, second] });

    try {
      adapter.start();
      const snapshot = await adapter.nextSourceSnapshot();

      expect(snapshot.status).toBe("executable");
      if (snapshot.status !== "executable") return;
      expect(snapshot.code).toContain("__deckjsxFirst");
      expect(snapshot.code).toContain("__deckjsxSecond");
      expect(snapshot.watchFiles).toEqual(expect.arrayContaining([first, second]));
      await createEntryExecutionHost({ cwd: root }).execute({ code: snapshot.code });
      expect((globalThis as Record<string, unknown>).__deckjsxFirst).toBe(true);
      expect((globalThis as Record<string, unknown>).__deckjsxSecond).toBe(true);
      delete (globalThis as Record<string, unknown>).__deckjsxFirst;
      delete (globalThis as Record<string, unknown>).__deckjsxSecond;
    } finally {
      await adapter.close();
    }
  });

  test("rebuilds the Host Session when deckjsx.config.ts changes", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(
      configPath,
      `export default { entry: "slides.ts", output: "first.pptx", plugins: [{ kind: "deckjsx.plugin", id: "session", consumer: { version: 1 } }] };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      expect(provider.executionSnapshot().outputs).toEqual(["first.pptx"]);
      const firstPlugin = provider.executionSnapshot().renderExecutionContext.plugins?.[0];

      await writeFile(
        configPath,
        `export default { entry: "slides.ts", output: "second.pdf", plugins: [{ kind: "deckjsx.plugin", id: "session", consumer: { version: 2 } }] };`,
      );
      const rebuilt = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(rebuilt.status).toBe("executable");
      expect(provider.executionSnapshot().outputs).toEqual(["second.pdf"]);
      const secondPlugin = provider.executionSnapshot().renderExecutionContext.plugins?.[0];
      expect(secondPlugin).not.toBe(firstPlugin);
      expect(secondPlugin).toMatchObject({ consumer: { version: 2 } });
    } finally {
      await provider.close();
    }
  });

  test("discards an older asynchronous Host Session rebuild", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(configPath, `export default { entry: "slides.ts", output: "initial.pdf" };`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      await writeFile(
        configPath,
        `export default async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return { entry: "slides.ts", output: "stale.pdf" }; };`,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      await writeFile(configPath, `export default { entry: "slides.ts", output: "latest.pdf" };`);

      const rebuilt = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(rebuilt.status).toBe("executable");
      expect(provider.executionSnapshot().outputs).toEqual(["latest.pdf"]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(provider.executionSnapshot().outputs).toEqual(["latest.pdf"]);
    } finally {
      await provider.close();
    }
  });

  test("does not rebuild the Host Session for configured outputs or writer locks", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: "slides.ts", output: "output.pptx" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      const execution = provider.executionSnapshot();
      await writeFile(path.join(root, ".deckjsx-lock"), "lock");
      await writeFile(path.join(root, "output.pptx"), "artifact");
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(provider.executionSnapshot()).toBe(execution);
    } finally {
      await provider.close();
    }
  });

  test("carries successful config warnings into the rebuilt executable generation", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(configPath, `export default { entry: "slides.ts" };`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      await writeFile(configPath, `export default { entry: "slides.ts" }; // rebuild\n`);
      const rebuilt = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(rebuilt.status).toBe("executable");
      if (rebuilt.status !== "executable") return;
      expect(rebuilt.diagnostics).toContainEqual(
        expect.objectContaining({ code: "W_CONFIG_DEFINE_CONFIG_MISSING" }),
      );
    } finally {
      await provider.close();
    }
  });

  test("preserves the normalized Environment Context across Host Session rebuilds", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "preview.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    const source = `
const config = ({ environment }) => ({ entry: environment + ".ts", output: environment + ".pdf" });
Object.defineProperty(config, Symbol.for("deckjsx.node.configDefinition"), { value: true });
export default config;
`;
    await writeFile(configPath, source);
    const config = await resolveConfig({ cwd: root, environment: "preview" });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      expect(provider.executionSnapshot().outputs).toEqual(["preview.pdf"]);

      await writeFile(configPath, `${source}\n// rebuild\n`);
      const rebuilt = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(rebuilt.status).toBe("executable");
      expect(provider.executionSnapshot().entries).toEqual([path.join(root, "preview.ts")]);
      expect(provider.executionSnapshot().outputs).toEqual(["preview.pdf"]);
    } finally {
      await provider.close();
    }
  });

  test("stays resident across an invalid config and recovers with a new Host Session", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(configPath, `export default { entry: "slides.ts" };`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      await writeFile(configPath, `export default { entry: ;`);
      const failed = await withTimeout(provider.nextSourceSnapshot(), 3_000);
      expect(failed.status).toBe("diagnostic");

      await writeFile(
        configPath,
        `export default { entry: "slides.ts", output: "recovered.pdf" };`,
      );
      const recovered = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(recovered.status).toBe("executable");
      expect(provider.executionSnapshot().outputs).toEqual(["recovered.pdf"]);
    } finally {
      await provider.close();
    }
  });

  test("starts resident from an initial config failure and recovers without restarting", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(configPath, `export default { entry: ;`);
    const failedConfig = await resolveConfig({ cwd: root, environment: "preview" });
    expect(failedConfig.ok).toBe(false);
    if (failedConfig.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initialFailure: {
        packageRoot: root,
        environment: "preview",
        diagnostics: failedConfig.diagnostics,
      },
      debounceMs: 5,
    });

    try {
      provider.start();
      const initial = await provider.nextSourceSnapshot();
      expect(initial.status).toBe("diagnostic");

      await writeFile(
        configPath,
        `export default { entry: "slides.ts", output: "recovered.pdf" };`,
      );
      const recovered = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(recovered.status).toBe("executable");
      expect(provider.executionSnapshot()?.outputs).toEqual(["recovered.pdf"]);
    } finally {
      await provider.close();
    }
  });

  test("retains config warnings when initial entry resolution fails", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "deckjsx.config.ts"),
      `export default { entry: "missing.ts" };`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(false);
    if (entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initialFailure: {
        packageRoot: root,
        environment: config.value.environment,
        diagnostics: [...config.diagnostics, ...entries.diagnostics],
        watchFiles: entries.watchFiles,
        watchDirectories: entries.watchDirectories,
      },
    });

    try {
      provider.start();
      const snapshot = await provider.nextSourceSnapshot();

      expect(snapshot.status).toBe("diagnostic");
      if (snapshot.status !== "diagnostic") return;
      expect(snapshot.diagnostics.map((item) => item.code)).toEqual([
        "W_CONFIG_DEFINE_CONFIG_MISSING",
        "E_CONFIG_ENTRY_MISSING",
      ]);
    } finally {
      await provider.close();
    }
  });

  test("keeps watching the Host Package config after a failure from a nested invocation cwd", async () => {
    const root = await fixture();
    const nested = path.join(root, "src", "talks");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, "slides.ts"), `export {};\n`);
    const configPath = path.join(root, "deckjsx.config.ts");
    await writeFile(configPath, `export default { entry: "slides.ts" };`);
    const config = await resolveConfig({ cwd: nested });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: nested,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      await writeFile(configPath, `export default { entry: ;`);
      const failed = await withTimeout(provider.nextSourceSnapshot(), 3_000);
      expect(failed.status).toBe("diagnostic");

      await writeFile(configPath, `export default { entry: "slides.ts", output: "nested.pdf" };`);
      const recovered = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(recovered.status).toBe("executable");
      expect(provider.executionSnapshot().outputs).toEqual(["nested.pdf"]);
    } finally {
      await provider.close();
    }
  });

  test("rediscovers a renamed Entry Execution Root from the traversed directory set", async () => {
    const root = await fixture();
    const firstEntry = path.join(root, "slides.ts");
    const secondEntry = path.join(root, "renamed.ts");
    await writeFile(
      firstEntry,
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      await rename(firstEntry, secondEntry);

      const rebuilt = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(rebuilt.status).toBe("executable");
      expect(provider.executionSnapshot().entries).toEqual([secondEntry]);
    } finally {
      await provider.close();
    }
  });

  test("recovers from ambiguous dynamic discovery when an existing candidate is edited", async () => {
    const root = await fixture();
    const firstEntry = path.join(root, "slides.ts");
    const secondEntry = path.join(root, "notes.ts");
    await writeFile(
      firstEntry,
      `import { write } from "@deckjsx/node"; await write({}, "slides.pptx");`,
    );
    await writeFile(secondEntry, `export const notes = true;\n`);
    const config = await resolveConfig({ cwd: root });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const entries = await resolveEntries(config.value);
    expect(entries.ok).toBe(true);
    if (!entries.ok) return;
    const provider = createHostSessionSourceProvider({
      cwd: root,
      initial: { config: config.value, entries: entries.value },
      debounceMs: 5,
    });

    try {
      provider.start();
      await provider.nextSourceSnapshot();
      await writeFile(
        secondEntry,
        `import { write } from "@deckjsx/node"; await write({}, "notes.pdf");`,
      );
      const failed = await withTimeout(provider.nextSourceSnapshot(), 3_000);
      expect(failed.status).toBe("diagnostic");

      await writeFile(secondEntry, `export const notes = true;\n`);
      const recovered = await withTimeout(provider.nextSourceSnapshot(), 3_000);

      expect(recovered.status).toBe("executable");
      expect(provider.executionSnapshot().entries).toEqual([firstEntry]);
    } finally {
      await provider.close();
    }
  });
});

async function fixture(): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "deckjsx-config-test-")));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
  return root;
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for Host Session rebuild")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";
import deckjsx, { createViteAssetLoader } from "../../plugins/vite/src/index.ts";
import { registerViteProjectAssetResolver } from "../../plugins/vite/src/project-integration.ts";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03,
]);

describe("@deckjsx/vite", () => {
  test("exposes a dev-only Vite plugin without depending on node runtime options", () => {
    const plugin = deckjsx();

    expect(plugin).toEqual(
      expect.objectContaining({
        name: "@deckjsx/vite",
        apply: "serve",
      }),
    );
    expect(plugin).not.toHaveProperty("options");
  });

  test("attaches module-local project integration to deck.render(pptx())", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");

    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const transformed = await transform?.(source, "/project/src/deck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code).toContain('from "deckjsx/integration"');
    expect(code).toContain('from "virtual:deckjsx/vite"');
    expect(code).toContain("deck.render(__deckjsxViteRenderIntegration(pptx()");
    expect(code).toContain("root: ");
    expect(code).toContain("resolverToken: ");
    expect(code).toContain('importer: "/project/src/deck.tsx"');
    expect(code).not.toContain(".plugin(");
  });

  test("honors include and exclude transform filters", async () => {
    const plugin = deckjsx({ include: /deck\.tsx$/, exclude: /skip/ });
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;

    const included = await transform?.(source, "/project/src/deck.tsx");
    const unmatched = await transform?.(source, "/project/src/other.tsx");
    const excluded = await transform?.(source, "/project/src/skip.deck.tsx");
    const includedCode = typeof included === "string" ? included : included?.code;

    expect(includedCode).toContain("deck.render(__deckjsxViteRenderIntegration(pptx()");
    expect(unmatched).toBeNull();
    expect(excluded).toBeNull();
  });

  test("honors glob-like include transform filters", async () => {
    const plugin = deckjsx({ include: "src/slides/**/*.tsx" });
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;

    const included = await transform?.(source, "/project/src/slides/deck.tsx");
    const unmatched = await transform?.(source, "/project/src/components/deck.tsx");
    const includedCode = typeof included === "string" ? included : included?.code;

    expect(includedCode).toContain("deck.render(__deckjsxViteRenderIntegration(pptx()");
    expect(unmatched).toBeNull();
  });

  test("serves transformed render integration through a Vite virtual module", () => {
    const plugin = deckjsx();
    const resolveId = plugin.resolveId as ((id: string) => string | null | undefined) | undefined;
    const load = plugin.load as ((id: string) => string | null | undefined) | undefined;
    const resolved = resolveId?.("virtual:deckjsx/vite");

    expect(resolved).toBe("\0virtual:deckjsx/vite");
    expect(load?.(resolved ?? "")).toContain(
      'export { withViteRenderIntegration } from "@deckjsx/vite";',
    );
  });

  test("wraps deck.render(pptx(options)) without changing the public render API", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      'await deck.render(pptx({ inspection: "summary" }));',
    ].join("\n");

    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const transformed = await transform?.(source, "/project/src/deck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code ?? "").toContain(
      'deck.render(__deckjsxViteRenderIntegration(pptx({ inspection: "summary" })',
    );
    expect(code ?? "").toContain('importer: "/project/src/deck.tsx"');
  });

  test("wraps render calls on expression receivers", async () => {
    const plugin = deckjsx();
    const source = [
      'import { pptx } from "deckjsx/adapter";',
      "function makeDeck() { return globalThis.deck; }",
      "await makeDeck().render(pptx());",
    ].join("\n");

    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const transformed = await transform?.(source, "/project/src/deck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code ?? "").toContain("makeDeck().render(__deckjsxViteRenderIntegration(pptx()");
    expect(code ?? "").toContain('importer: "/project/src/deck.tsx"');
  });

  test("does not wrap render-looking text in comments or strings", async () => {
    const plugin = deckjsx();
    const source = [
      'const example = "deck.render(pptx())";',
      "// await deck.render(pptx());",
      "/* deck.render(pptx()) */",
    ].join("\n");

    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const transformed = await transform?.(source, "/project/src/deck.tsx");

    expect(transformed).toBeNull();
  });

  test("does not annotate media-looking JSX in comments or strings", async () => {
    const plugin = deckjsx();
    const source = [
      'const example = "<img src=\\"./hero.png\\" />";',
      '// <video src="./clip.mp4" poster="./poster.png" />',
      '/* <Card src="./card.png" /> */',
    ].join("\n");

    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const transformed = await transform?.(source, "/project/src/deck.tsx");

    expect(transformed).toBeNull();
  });

  test("feeds in-memory HMR invalidation metadata into transformed render calls", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const handleHotUpdate = plugin.handleHotUpdate as
      | ((context: { file: string; modules: readonly unknown[] }) => void | readonly unknown[])
      | undefined;

    handleHotUpdate?.({ file: "/project/src/slide.tsx", modules: [] });
    const transformed = await transform?.(source, "/project/src/deck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code).toContain('changedModuleIds: ["/project/src/slide.tsx"]');
    expect(code).toContain('importer: "/project/src/deck.tsx"');
  });

  test("consumes HMR invalidation metadata after it is attached to a render module", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const handleHotUpdate = plugin.handleHotUpdate as
      | ((context: { file: string; modules: readonly unknown[] }) => void | readonly unknown[])
      | undefined;

    handleHotUpdate?.({ file: "/project/src/slide.tsx", modules: [] });
    const first = await transform?.(source, "/project/src/deck.tsx");
    const second = await transform?.(source, "/project/src/deck.tsx");
    handleHotUpdate?.({ file: "/project/src/next.tsx", modules: [] });
    const third = await transform?.(source, "/project/src/deck.tsx");
    const firstCode = typeof first === "string" ? first : first?.code;
    const secondCode = typeof second === "string" ? second : second?.code;
    const thirdCode = typeof third === "string" ? third : third?.code;

    expect(firstCode).toContain('changedModuleIds: ["/project/src/slide.tsx"]');
    expect(secondCode).not.toContain("hmrInvalidation");
    expect(thirdCode).toContain('changedModuleIds: ["/project/src/next.tsx"]');
    expect(thirdCode).not.toContain("/project/src/slide.tsx");
  });

  test("keeps HMR invalidation metadata until every tracked render module receives it", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const handleHotUpdate = plugin.handleHotUpdate as
      | ((context: { file: string; modules: readonly unknown[] }) => void | readonly unknown[])
      | undefined;

    await transform?.(source, "/project/src/deck-a.tsx");
    await transform?.(source, "/project/src/deck-b.tsx");

    handleHotUpdate?.({ file: "/project/src/shared.tsx", modules: [] });
    const first = await transform?.(source, "/project/src/deck-a.tsx");
    const second = await transform?.(source, "/project/src/deck-b.tsx");
    const third = await transform?.(source, "/project/src/deck-a.tsx");
    const firstCode = typeof first === "string" ? first : first?.code;
    const secondCode = typeof second === "string" ? second : second?.code;
    const thirdCode = typeof third === "string" ? third : third?.code;

    expect(firstCode).toContain('changedModuleIds: ["/project/src/shared.tsx"]');
    expect(secondCode).toContain('changedModuleIds: ["/project/src/shared.tsx"]');
    expect(thirdCode).not.toContain("hmrInvalidation");
  });

  test("returns tracked render modules from HMR updates so renders receive invalidation", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const renderModule = { id: "/project/src/deck.tsx" };
    const changedModule = { id: "/project/src/asset.png" };
    const invalidatedModules: unknown[] = [];
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const handleHotUpdate = plugin.handleHotUpdate as
      | ((context: {
          file: string;
          modules: readonly unknown[];
          server: {
            moduleGraph: {
              getModuleById(id: string): unknown;
              invalidateModule(module: unknown): void;
            };
          };
        }) => void | readonly unknown[])
      | undefined;

    await transform?.(source, "/project/src/deck.tsx");
    const modules = handleHotUpdate?.({
      file: "/project/src/asset.png",
      modules: [changedModule],
      server: {
        moduleGraph: {
          getModuleById(id) {
            return id === "/project/src/deck.tsx" ? renderModule : undefined;
          },
          invalidateModule(module) {
            invalidatedModules.push(module);
          },
        },
      },
    });

    expect(modules).toEqual([changedModule, renderModule]);
    expect(invalidatedModules).toContain(renderModule);
  });

  test("does not duplicate or invalidate a tracked render module already in the HMR update", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      "await deck.render(pptx());",
    ].join("\n");
    const renderModule = { id: "/project/src/deck.tsx" };
    const invalidatedModules: unknown[] = [];
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;
    const handleHotUpdate = plugin.handleHotUpdate as
      | ((context: {
          file: string;
          modules: readonly unknown[];
          server: {
            moduleGraph: {
              getModuleById(id: string): unknown;
              invalidateModule(module: unknown): void;
            };
          };
        }) => void | readonly unknown[])
      | undefined;

    await transform?.(source, "/project/src/deck.tsx");
    const modules = handleHotUpdate?.({
      file: "/project/src/deck.tsx",
      modules: [renderModule],
      server: {
        moduleGraph: {
          getModuleById(id) {
            return id === "/project/src/deck.tsx" ? renderModule : undefined;
          },
          invalidateModule(module) {
            invalidatedModules.push(module);
          },
        },
      },
    });

    expect(modules).toEqual([renderModule]);
    expect(invalidatedModules).toEqual([]);
  });

  test("annotates intrinsic media path literals with prop-level source origins", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      'deck.slide({ name: "Media" }, () => <div><img src="./hero.png" /><video src="./clip.mp4" poster="/poster.png" /></div>);',
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;

    const transformed = await transform?.(source, "/project/src/deck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code).toContain("mediaSourceOrigins as __deckjsxMediaSourceOrigins");
    expect(code).toContain(
      '<img {...__deckjsxMediaSourceOrigins({ src: { importer: "/project/src/deck.tsx", source: "./hero.png" } })} src="./hero.png" />',
    );
    expect(code).toContain(
      '<video {...__deckjsxMediaSourceOrigins({ src: { importer: "/project/src/deck.tsx", source: "./clip.mp4" }, poster: { importer: "/project/src/deck.tsx", source: "/poster.png" } })} src="./clip.mp4" poster="/poster.png" />',
    );
  });

  test("annotates component media props so forwarded props keep source origins", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "function Card(props: { src: string }) { return <img {...props} />; }",
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      'deck.slide({ name: "Media" }, () => <Card src="./card.png" />);',
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;

    const transformed = await transform?.(source, "/project/src/components/CardDeck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code).toContain(
      '<Card {...__deckjsxMediaSourceOrigins({ src: { importer: "/project/src/components/CardDeck.tsx", source: "./card.png" } })} src="./card.png" />',
    );
  });

  test("annotates component video props so forwarded src and poster keep source origins", async () => {
    const plugin = deckjsx();
    const source = [
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      "function VideoCard(props: { src: string; poster: string }) { return <video {...props} />; }",
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      'deck.slide({ name: "Media" }, () => <VideoCard src="./clip.mp4" poster="./poster.png" />);',
      "await deck.render(pptx());",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;

    const transformed = await transform?.(source, "/project/src/components/VideoDeck.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code).toContain(
      '<VideoCard {...__deckjsxMediaSourceOrigins({ src: { importer: "/project/src/components/VideoDeck.tsx", source: "./clip.mp4" }, poster: { importer: "/project/src/components/VideoDeck.tsx", source: "./poster.png" } })} src="./clip.mp4" poster="./poster.png" />',
    );
  });

  test("annotates media literals in component-only modules without injecting the Vite loader", async () => {
    const plugin = deckjsx();
    const source = [
      "export function Card() {",
      '  return <img src="./card-local.png" />;',
      "}",
    ].join("\n");
    const transform = plugin.transform as
      | ((
          code: string,
          id: string,
        ) => string | { code: string } | null | Promise<string | { code: string } | null>)
      | undefined;

    const transformed = await transform?.(source, "/project/src/components/Card.tsx");
    const code = typeof transformed === "string" ? transformed : transformed?.code;

    expect(code).toContain(
      '<img {...__deckjsxMediaSourceOrigins({ src: { importer: "/project/src/components/Card.tsx", source: "./card-local.png" } })} src="./card-local.png" />',
    );
    expect(code).toContain('from "deckjsx/integration"');
    expect(code).not.toContain("__deckjsxCreateViteAssetLoader");
    expect(code).not.toContain("deck.plugin(");
  });

  test("creates a Vite-aware AssetLoader for importer-relative and public-root paths", async () => {
    const root = path.join(tmpdir(), `deckjsx-vite-loader-${process.pid}-${Date.now()}`);
    const sourceDir = path.join(root, "src");
    const publicDir = path.join(root, "public");
    await mkdir(sourceDir, { recursive: true });
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(sourceDir, "local.png"), pngBytes);
    await writeFile(path.join(publicDir, "public.png"), pngBytes);

    const loader = createViteAssetLoader({ root, publicDir });
    const relativeLoad = await loader.load?.({
      source: { kind: "path", path: "./local.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:relative",
      origin: { importer: path.join(sourceDir, "deck.tsx") },
    });
    const publicProbe = await loader.probe?.({
      source: { kind: "path", path: "/public.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:public",
      origin: { importer: path.join(sourceDir, "deck.tsx") },
    });

    expect(relativeLoad).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          bytes: pngBytes,
          mediaType: "image/png",
          extension: "png",
          width: 2,
          height: 3,
        }),
      }),
    );
    expect(publicProbe).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          byteLength: pngBytes.byteLength,
          hash: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
  });

  test("scopes Vite AssetLoader resolverIdentity to resolver-affecting options", () => {
    const first = createViteAssetLoader({ root: "/project-a", publicDir: "/project-a/public" });
    const same = createViteAssetLoader({ root: "/project-a", publicDir: "/project-a/public" });
    const differentRoot = createViteAssetLoader({
      root: "/project-b",
      publicDir: "/project-b/public",
    });
    const differentPublicDir = createViteAssetLoader({
      root: "/project-a",
      publicDir: "/project-a/static",
    });
    const differentBase = createViteAssetLoader({
      root: "/project-a",
      publicDir: "/project-a/public",
      base: "/docs/",
    });
    const differentAlias = createViteAssetLoader({
      root: "/project-a",
      publicDir: "/project-a/public",
      aliases: [{ find: "@", replacement: "/project-a/src" }],
    });

    expect(first.resolverIdentity).toBe(same.resolverIdentity);
    expect(first.resolverIdentity).toMatch(/^@deckjsx\/vite:fnv1a32:[0-9a-f]{8}$/);
    expect(differentRoot.resolverIdentity).not.toBe(first.resolverIdentity);
    expect(differentPublicDir.resolverIdentity).not.toBe(first.resolverIdentity);
    expect(differentBase.resolverIdentity).not.toBe(first.resolverIdentity);
    expect(differentAlias.resolverIdentity).not.toBe(first.resolverIdentity);
  });

  test("resolves aliased Vite asset paths", async () => {
    const root = path.join(tmpdir(), `deckjsx-vite-loader-alias-${process.pid}-${Date.now()}`);
    const sourceDir = path.join(root, "src", "assets");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, "hero.png"), pngBytes);

    const loader = createViteAssetLoader({
      root,
      aliases: [{ find: "@", replacement: path.join(root, "src") }],
    });
    const probe = await loader.probe?.({
      source: { kind: "path", path: "@/assets/hero.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:alias",
      origin: { importer: path.join(root, "slides", "deck.tsx") },
    });

    expect(probe).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          mediaType: "image/png",
          width: 2,
          height: 3,
          hash: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
  });

  test("resolves plugin-owned Vite asset paths before fallback aliases", async () => {
    const root = path.join(
      tmpdir(),
      `deckjsx-vite-loader-project-resolver-${process.pid}-${Date.now()}`,
    );
    const resolvedDir = path.join(root, "resolved-by-vite");
    const fallbackDir = path.join(root, "fallback");
    await mkdir(resolvedDir, { recursive: true });
    await mkdir(fallbackDir, { recursive: true });
    await writeFile(path.join(resolvedDir, "hero.png"), pngBytes);

    const unregister = registerViteProjectAssetResolver("test:vite-resolver", async (input) =>
      input.sourcePath === "@assets/hero.png"
        ? { filePath: path.join(resolvedDir, "hero.png"), provenanceKind: "generatedAsset" }
        : undefined,
    );
    try {
      const loader = createViteAssetLoader({
        root,
        aliases: [{ find: "@assets", replacement: fallbackDir }],
        resolverToken: "test:vite-resolver",
      });
      const probe = await loader.probe?.({
        source: { kind: "path", path: "@assets/hero.png" },
        sourceField: "src",
        resolverIdentity: loader.resolverIdentity,
        assetEntityId: "asset:vite-resolver",
        origin: { importer: path.join(root, "slides", "deck.tsx") },
      });

      expect(probe).toEqual(
        expect.objectContaining({
          ok: true,
          value: expect.objectContaining({
            mediaType: "image/png",
            provenance: expect.objectContaining({ kind: "generatedAsset" }),
          }),
        }),
      );
    } finally {
      unregister();
    }
  });

  test("resolves overlapping Vite aliases by the most specific prefix", async () => {
    const root = path.join(
      tmpdir(),
      `deckjsx-vite-loader-overlapping-alias-${process.pid}-${Date.now()}`,
    );
    const broadDir = path.join(root, "src", "assets");
    const specificDir = path.join(root, "src", "asset-icons");
    await mkdir(path.join(broadDir, "icons"), { recursive: true });
    await mkdir(specificDir, { recursive: true });
    await writeFile(path.join(specificDir, "hero.png"), pngBytes);

    const loader = createViteAssetLoader({
      root,
      aliases: [
        { find: "@assets", replacement: broadDir },
        { find: "@assets/icons", replacement: specificDir },
      ],
    });
    const probe = await loader.probe?.({
      source: { kind: "path", path: "@assets/icons/hero.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:overlapping-alias",
      origin: { importer: path.join(root, "slides", "deck.tsx") },
    });

    expect(probe).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          mediaType: "image/png",
          hash: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
  });

  test("returns loader diagnostics for missing Vite-owned asset paths", async () => {
    const root = path.join(tmpdir(), `deckjsx-vite-loader-missing-${process.pid}-${Date.now()}`);
    const sourceDir = path.join(root, "src");
    await mkdir(sourceDir, { recursive: true });

    const loader = createViteAssetLoader({ root });
    const probe = await loader.probe?.({
      source: { kind: "path", path: "./missing.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:missing",
      origin: { importer: path.join(sourceDir, "deck.tsx") },
    });
    const load = await loader.load?.({
      source: { kind: "path", path: "./missing.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:missing",
      origin: { importer: path.join(sourceDir, "deck.tsx") },
    });

    expect(probe).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "E_VITE_ASSET_READ_FAILED",
          }),
        ]),
      }),
    );
    expect(load).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "E_VITE_ASSET_READ_FAILED",
          }),
        ]),
      }),
    );
  });

  test("returns loader diagnostics when relative Vite asset paths lack importer origin", async () => {
    const loader = createViteAssetLoader({ root: "/project" });
    const probe = await loader.probe?.({
      source: { kind: "path", path: "./missing-origin.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:missing-origin",
    });
    const load = await loader.load?.({
      source: { kind: "path", path: "./missing-origin.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:missing-origin",
    });

    expect(probe).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "E_VITE_ASSET_ORIGIN_MISSING",
          }),
        ]),
      }),
    );
    expect(load).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "E_VITE_ASSET_ORIGIN_MISSING",
          }),
        ]),
      }),
    );
  });
});

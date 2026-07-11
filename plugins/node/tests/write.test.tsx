import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { pdf, pptx, type WriterAdapter } from "deckjsx/adapter";
import { describe, expect, test, vi } from "vite-plus/test";
import { Deck, StyleSheet, type TextStyle } from "deckjsx";
import {
  createIncrementalArtifactSession,
  integrationContextId,
  runIncrementalArtifactCycle,
  type AssetLoader,
  type DeckPlugin,
} from "deckjsx/integration";
import type { PptxPackageModel } from "deckjsx/inspect";
import {
  createNodeFileAssetLoader,
  inspectPatchablePptx,
  nodeAssets,
  nodeFontAssets,
  write,
} from "@/src/index.ts";
import { withDeckjsxDevAssetObserver } from "@/src/dev-asset-observer.ts";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function createDiagnostics(
  items: readonly {
    readonly severity: "error" | "warning";
    readonly code: string;
    readonly title: string;
    readonly message?: string;
    readonly labels: readonly { readonly path: string; readonly message: string }[];
  }[] = [],
) {
  return {
    items,
    hasErrors: items.some((item) => item.severity === "error"),
    hasWarnings: items.some((item) => item.severity === "warning"),
  };
}

function createPptxZipBytesFromEntries(
  entries: readonly { readonly path: string; readonly bytes: Uint8Array }[],
): Uint8Array {
  return zipSync(Object.fromEntries(entries.map((entry) => [entry.path, entry.bytes])), {
    level: 0,
  });
}

function lockPathFor(outputPath: string): string {
  return path.join(path.dirname(outputPath), ".deckjsx-lock");
}

function outputScopedLockPathFor(outputPath: string): string {
  return path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.deckjsx-lock`);
}

function lockFileContentsFor(outputPath: string): string {
  return `deckjsx-lock-v1\n${process.pid}\n${path.resolve(outputPath)}\n`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function renderDeck(text: string) {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Write" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.15,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5 }}>{text}</p>
    </main>
  ));
  return deck.render({ inspection: "none" });
}

async function renderComposedStyledDeck(childColor: "#0000FF" | "#00AA00") {
  const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

  parent.useStyles(
    new StyleSheet({
      classes: { note: { target: "p.note", style: { color: "#FF0000" } } },
    }),
  );
  child.useStyles(
    new StyleSheet({
      classes: { note: { target: "p.note", style: { color: childColor } } },
    }),
  );

  parent.slide({ name: "Parent" }, () => (
    <p className="note" style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.6 }}>
      Parent note
    </p>
  ));
  child.slide({ name: "Child" }, () => (
    <p className="note" style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.6 }}>
      Child note
    </p>
  ));
  parent.mount("child", child);

  return parent.render(pptx({ inspection: "none" }));
}

async function renderHyperlinkDeck(url: NonNullable<TextStyle["href"]>) {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Hyperlink" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.15,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5, href: url }}>Link</p>
    </main>
  ));
  return deck.render({ inspection: "none" });
}

async function renderWithoutArtifact() {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const adapter = {
    kind: "deckjsx.writerAdapter",
    name: "test-missing-artifact",
    projectionFormat: "pptx",
    format: "pptx",
    options: {},
    async render() {
      return { diagnostics: createDiagnostics() };
    },
  } satisfies WriterAdapter<PptxPackageModel, "pptx">;

  deck.slide({ name: "Missing artifact" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.15,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5 }}>missing</p>
    </main>
  ));
  return deck.render(adapter);
}

async function renderPdfArtifact() {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const adapter = {
    kind: "deckjsx.writerAdapter",
    name: "test-pdf-artifact",
    projectionFormat: "pptx",
    format: "pdf",
    options: {},
    async render() {
      return {
        diagnostics: createDiagnostics(),
        artifact: {
          format: "pdf",
          mediaType: "application/pdf",
          extension: "pdf",
          bytes: textEncoder.encode("%PDF-1.7\n"),
        },
      };
    },
  } satisfies WriterAdapter<PptxPackageModel, "pdf">;

  deck.slide({ name: "PDF artifact" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.15,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5 }}>pdf</p>
    </main>
  ));
  return deck.render(adapter);
}

async function renderUnsupportedArtifact() {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const adapter = {
    kind: "deckjsx.writerAdapter",
    name: "test-unsupported-artifact",
    projectionFormat: "pptx",
    format: "html",
    options: {},
    async render() {
      return {
        diagnostics: createDiagnostics(),
        artifact: {
          format: "html",
          mediaType: "text/html",
          extension: "html",
          bytes: textEncoder.encode("<!doctype html>\n"),
        },
      };
    },
  } as unknown as WriterAdapter<PptxPackageModel>;

  deck.slide({ name: "Unsupported artifact" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.15,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5 }}>unsupported</p>
    </main>
  ));
  return deck.render(adapter);
}

async function renderErroredArtifact() {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const adapter = {
    kind: "deckjsx.writerAdapter",
    name: "test-errored-artifact",
    projectionFormat: "pptx",
    format: "pptx",
    options: {},
    async render() {
      return {
        diagnostics: createDiagnostics([
          {
            severity: "error",
            code: "E_TEST_RENDER_FAILED_WITH_ARTIFACT",
            title: "test render failed with artifact",
            message: "The writer returned bytes together with an error diagnostic.",
            labels: [{ path: "render", message: "partial artifact" }],
          },
        ]),
        artifact: {
          format: "pptx",
          mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          extension: "pptx",
          bytes: textEncoder.encode("partial pptx bytes"),
        },
      };
    },
  } satisfies WriterAdapter<PptxPackageModel, "pptx">;

  deck.slide({ name: "Errored artifact" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.15,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5 }}>errored</p>
    </main>
  ));
  return deck.render(adapter);
}

function pngHeaderBytes(width: number, height: number, marker: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    marker,
  ]);
}

async function replaceBytesInFile(
  filePath: string,
  search: string,
  replacement: string,
): Promise<void> {
  const searchBytes = textEncoder.encode(search);
  const replacementBytes = textEncoder.encode(replacement);
  if (searchBytes.byteLength !== replacementBytes.byteLength) {
    throw new Error("test replacement must preserve byte length");
  }

  const bytes = new Uint8Array(await readFile(filePath));
  const matchIndex = bytes.findIndex((byte, index) =>
    searchBytes.every((searchByte, searchIndex) => bytes[index + searchIndex] === searchByte),
  );
  if (matchIndex < 0) {
    throw new Error(`test fixture did not contain ${search}`);
  }

  bytes.set(replacementBytes, matchIndex);
  await writeFile(filePath, bytes);
}

async function renderMediaDeck(bytes: Uint8Array) {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const loader = {
    resolverIdentity: "test:node-media-loader",
    async probe(context) {
      return context.source.kind === "path"
        ? {
            ok: true,
            value: {
              mediaType: "image/png",
              extension: "png",
              width: 2,
              height: 2,
              byteLength: bytes.byteLength,
            },
          }
        : undefined;
    },
    async load(context) {
      return context.source.kind === "path"
        ? {
            ok: true,
            value: {
              mediaType: "image/png",
              extension: "png",
              width: 2,
              height: 2,
              byteLength: bytes.byteLength,
              bytes,
            },
          }
        : undefined;
    },
  } satisfies AssetLoader;
  deck.slide({ name: "Media" }, () => (
    <main
      style={{ width: 9, height: 4.5, display: "grid", gridTemplateColumns: "1fr", padding: 0.5 }}
    >
      <img src="./media.png" style={{ width: 1, height: 1 }} />
    </main>
  ));
  const plugin = {
    kind: "deckjsx.plugin",
    id: "test:node-media-extension",
    name: "test:node-media-extension",
    integration: {
      id: integrationContextId("test:node-media-extension"),
      assetLoaders: [loader],
      mediaSourceOrigin: { importer: "/project/src/deck.tsx" },
    },
  } satisfies DeckPlugin;
  deck.plugin(plugin);
  return deck.render(pptx({ inspection: "none" }));
}

test("nodeAssets resolves local media through the deck lifecycle", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "deckjsx-node-assets-"));
  const bytes = pngHeaderBytes(2, 2, 7);
  await writeFile(path.join(root, "media.png"), bytes);

  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.plugin(nodeAssets({ root }));
  deck.slide({ name: "Node assets" }, () => (
    <main
      style={{ width: 9, height: 4.5, display: "grid", gridTemplateColumns: "1fr", padding: 0.5 }}
    >
      <img src="media.png" style={{ width: 1, height: 1 }} />
    </main>
  ));

  const result = await deck.render(pptx({ inspection: "none" }));

  expect(result.ok).toBe(true);
  expect(result.artifact).toBeDefined();
  const zip = unzipSync(result.artifact!.bytes);
  expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(bytes));
});

test("nodeFontAssets resolves local font registrations for PDF projection", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "deckjsx-node-font-assets-"));
  const fontBytes = new Uint8Array([0, 1, 0, 0]);
  await writeFile(path.join(root, "Brand.ttf"), fontBytes);

  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.plugin(
    nodeFontAssets({
      root,
      fontAssets: [
        {
          key: "brand-regular",
          family: "Brand",
          source: { kind: "path", path: "./Brand.ttf" },
        },
      ],
    }),
  );
  deck.slide({ name: "Node font" }, () => (
    <p
      style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.6, fontFamily: "Brand" }}
    >
      Brand font
    </p>
  ));

  const result = await deck.project({ format: "pdf", inspection: "none" });

  expect(result.ok).toBe(true);
  expect(result.projection).toEqual(
    expect.objectContaining({
      resources: expect.objectContaining({
        fonts: expect.arrayContaining([
          expect.objectContaining({ family: "Brand", sourceKey: "brand-regular", data: fontBytes }),
        ]),
      }),
    }),
  );
});

test.each(["media-first", "font-first"] as const)(
  "nodeAssets and nodeFontAssets compose when registered %s",
  async (order) => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-asset-order-"));
    const mediaRoot = path.join(directory, "media");
    const fontRoot = path.join(directory, "fonts");
    const mediaBytes = pngHeaderBytes(3, 2, 17);
    const fontBytes = new Uint8Array([0, 1, 0, 0]);
    await mkdir(mediaRoot, { recursive: true });
    await mkdir(fontRoot, { recursive: true });
    await writeFile(path.join(mediaRoot, "chart.png"), mediaBytes);
    await writeFile(path.join(fontRoot, "Brand.ttf"), fontBytes);

    const mediaPlugin = nodeAssets({ root: mediaRoot });
    const fontPlugin = nodeFontAssets({
      root: fontRoot,
      fontAssets: [
        {
          key: "brand-regular",
          family: "Brand",
          source: { kind: "path", path: "./Brand.ttf" },
        },
      ],
    });
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    for (const plugin of order === "media-first"
      ? [mediaPlugin, fontPlugin]
      : [fontPlugin, mediaPlugin]) {
      deck.plugin(plugin);
    }
    deck.slide({ name: "Ordered node assets" }, () => (
      <main style={{ width: 9, height: 4.5, display: "flex", gap: 0.25 }}>
        <img src="chart.png" style={{ width: 1, height: 1 }} />
        <p style={{ width: 3, height: 0.5, fontFamily: "Brand" }}>Brand font</p>
      </main>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({ code: "W_FONT_SHAPING_FALLBACK", severity: "warning" }),
    ]);
    expect(result.projection).toEqual(
      expect.objectContaining({
        resources: expect.objectContaining({
          fonts: expect.arrayContaining([
            expect.objectContaining({
              family: "Brand",
              sourceKey: "brand-regular",
              data: fontBytes,
            }),
          ]),
        }),
      }),
    );
  },
);

test("node asset plugins decline unrelated source fields and report field-aware diagnostics", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-asset-fields-"));
  const mediaLoader = nodeAssets({ root: path.join(directory, "media") }).integration
    ?.assetLoaders?.[0];
  const fontLoader = nodeFontAssets({
    root: path.join(directory, "fonts"),
    fontAssets: [],
  }).integration?.assetLoaders?.[0];
  expect(mediaLoader).toBeDefined();
  expect(fontLoader).toBeDefined();

  const mediaContext = {
    source: { kind: "path", path: "./missing.png" },
    sourceField: "src",
    resolverIdentity: mediaLoader!.resolverIdentity,
    assetEntityId: "asset:missing",
  } as const;
  const fontContext = {
    source: { kind: "path", path: "./Missing.ttf" },
    sourceField: "font",
    resolverIdentity: fontLoader!.resolverIdentity,
    assetEntityId: "font:missing",
  } as const;

  expect(await mediaLoader!.load?.(fontContext)).toBeUndefined();
  expect(await fontLoader!.load?.(mediaContext)).toBeUndefined();

  const mediaFailure = await mediaLoader!.load?.(mediaContext);
  const fontFailure = await fontLoader!.load?.(fontContext);
  expect(mediaFailure).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "E_NODE_FILE_ASSET_READ_FAILED",
          message: expect.stringContaining("media source"),
          notes: expect.arrayContaining(["sourceField=src"]),
        }),
      ],
    }),
  );
  expect(fontFailure).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "E_NODE_FILE_ASSET_READ_FAILED",
          message: expect.stringContaining("font source"),
          notes: expect.arrayContaining(["sourceField=font"]),
        }),
      ],
    }),
  );
});

test("node file asset loader reports observed files only inside a dev asset observer scope", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "deckjsx-node-assets-observer-"));
  const mediaPath = path.join(root, "media.png");
  await writeFile(mediaPath, pngHeaderBytes(2, 2, 11));
  const loader = createNodeFileAssetLoader({ root });
  const observed: string[] = [];
  const context = {
    resolverIdentity: "test:node-file-loader",
    assetEntityId: "asset:test",
    sourceField: "src",
    source: { kind: "path", path: "media.png" },
  } as const;

  await loader.probe?.(context);
  await withDeckjsxDevAssetObserver(
    (filePath) => {
      observed.push(filePath);
    },
    async () => {
      await loader.load?.(context);
    },
  );

  expect(observed).toEqual([mediaPath]);
});

async function renderDeckWithOptionalMedia(includeMedia: boolean) {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  const loader = {
    resolverIdentity: "test:node-optional-media-loader",
    async probe(context) {
      return context.source.kind === "path"
        ? {
            ok: true,
            value: {
              mediaType: "image/png",
              extension: "png",
              width: 2,
              height: 2,
              byteLength: pngHeaderBytes(2, 2, 0xcc).byteLength,
            },
          }
        : undefined;
    },
    async load(context) {
      return context.source.kind === "path"
        ? {
            ok: true,
            value: {
              mediaType: "image/png",
              extension: "png",
              width: 2,
              height: 2,
              byteLength: pngHeaderBytes(2, 2, 0xcc).byteLength,
              bytes: pngHeaderBytes(2, 2, 0xcc),
            },
          }
        : undefined;
    },
  } satisfies AssetLoader;

  deck.slide({ name: "Optional media" }, () => (
    <main
      style={{
        width: 9,
        height: 4.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.2,
        padding: 0.5,
      }}
    >
      <p style={{ width: 3, height: 0.5 }}>optional media</p>
      {includeMedia ? <img src="./optional.png" style={{ width: 1, height: 1 }} /> : undefined}
    </main>
  ));
  const plugin = {
    kind: "deckjsx.plugin",
    id: "test:node-optional-media-extension",
    name: "test:node-optional-media-extension",
    integration: {
      id: integrationContextId("test:node-optional-media-extension"),
      assetLoaders: [loader],
      mediaSourceOrigin: { importer: "/project/src/deck.tsx" },
    },
  } satisfies DeckPlugin;
  deck.plugin(plugin);
  return deck.render(pptx({ inspection: "none" }));
}

describe("@deckjsx/node write", () => {
  test("creates a local file AssetLoader for importer-relative and absolute paths", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-assets-"));
    const sourceDir = path.join(directory, "src");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(directory, "absolute.png"), pngHeaderBytes(4, 5, 0xcc));
    await writeFile(path.join(sourceDir, "relative.png"), pngHeaderBytes(2, 3, 0xdd));

    const loader = createNodeFileAssetLoader();
    const relativeLoad = await loader.load?.({
      source: { kind: "path", path: "./relative.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:relative",
      origin: { importer: path.join(sourceDir, "deck.tsx") },
    });
    const absoluteProbe = await loader.probe?.({
      source: { kind: "path", path: path.join(directory, "absolute.png") },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:absolute",
    });

    expect(relativeLoad).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          bytes: pngHeaderBytes(2, 3, 0xdd),
          mediaType: "image/png",
          extension: "png",
          width: 2,
          height: 3,
          byteLength: pngHeaderBytes(2, 3, 0xdd).byteLength,
          hash: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
    expect(absoluteProbe).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          mediaType: "image/png",
          extension: "png",
          width: 4,
          height: 5,
          byteLength: pngHeaderBytes(4, 5, 0xcc).byteLength,
          hash: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
  });

  test("rejects node file assets that escape their allowed directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-assets-"));
    const root = path.join(directory, "root");
    const sourceDir = path.join(directory, "src");
    const secretPath = path.join(directory, "secret.png");
    await mkdir(root, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await writeFile(secretPath, pngHeaderBytes(9, 9, 0xee));
    await symlink(secretPath, path.join(root, "linked-secret.png"));

    const rootedLoader = createNodeFileAssetLoader({ root });
    const importerLoader = createNodeFileAssetLoader();
    const rootedTraversal = await rootedLoader.load?.({
      source: { kind: "path", path: "../secret.png" },
      sourceField: "src",
      resolverIdentity: rootedLoader.resolverIdentity,
      assetEntityId: "asset:rooted-traversal",
    });
    const rootedAbsolute = await rootedLoader.probe?.({
      source: { kind: "path", path: secretPath },
      sourceField: "src",
      resolverIdentity: rootedLoader.resolverIdentity,
      assetEntityId: "asset:rooted-absolute",
    });
    const importerTraversal = await importerLoader.load?.({
      source: { kind: "path", path: "../secret.png" },
      sourceField: "src",
      resolverIdentity: importerLoader.resolverIdentity,
      assetEntityId: "asset:importer-traversal",
      origin: { importer: path.join(sourceDir, "deck.tsx") },
    });
    const symlinkEscape = await rootedLoader.load?.({
      source: { kind: "path", path: "linked-secret.png" },
      sourceField: "src",
      resolverIdentity: rootedLoader.resolverIdentity,
      assetEntityId: "asset:symlink-escape",
    });

    for (const result of [rootedTraversal, rootedAbsolute, importerTraversal]) {
      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "E_NODE_FILE_ASSET_OUTSIDE_ROOT" }),
          ]),
        }),
      );
    }
    expect(symlinkEscape).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "E_NODE_FILE_ASSET_READ_FAILED" }),
        ]),
      }),
    );
  });

  test("returns local file AssetLoader diagnostics for missing files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-assets-"));
    const loader = createNodeFileAssetLoader({ root: directory });

    const probe = await loader.probe?.({
      source: { kind: "path", path: "./missing.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:missing",
    });
    const load = await loader.load?.({
      source: { kind: "path", path: "./missing.png" },
      sourceField: "src",
      resolverIdentity: loader.resolverIdentity,
      assetEntityId: "asset:missing",
    });

    expect(probe).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "E_NODE_FILE_ASSET_READ_FAILED" }),
        ]),
      }),
    );
    expect(load).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "E_NODE_FILE_ASSET_READ_FAILED" }),
        ]),
      }),
    );
  });

  test("writes a rendered pptx artifact to a new file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "created.pptx");
    const blockedOutputScopedLockPath = outputScopedLockPathFor(outputPath);
    const render = await renderDeck("created");
    await mkdir(blockedOutputScopedLockPath);

    const result = await write(render, outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);
    const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: outputPath,
        status: "created",
        strategy: "write-file",
      }),
    );
    expect(output.byteLength).toBe(render.artifact?.bytes.byteLength);
    expect(slideXml).toContain("created");
    expect(await fileExists(lockPathFor(outputPath))).toBe(false);
    expect(await fileExists(blockedOutputScopedLockPath)).toBe(true);
  });

  test("writes composed multi-Deck output with source-local styles", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "composed-styles.pptx");

    const result = await write(await renderComposedStyledDeck("#0000FF"), outputPath);
    const zip = unzipSync(await readFile(outputPath));
    const parentSlideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);
    const childSlideXml = textDecoder.decode(zip["ppt/slides/slide2.xml"]);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: outputPath,
        status: "created",
      }),
    );
    expect(parentSlideXml).toContain("Parent note");
    expect(parentSlideXml).toContain('<a:srgbClr val="FF0000"/>');
    expect(childSlideXml).toContain("Child note");
    expect(childSlideXml).toContain('<a:srgbClr val="0000FF"/>');
    expect(childSlideXml).not.toContain('<a:srgbClr val="FF0000"/>');
  });

  test("writes mounted child Deck media resolved by nodeAssets", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "mounted-child-media.pptx");
    const mediaBytes = pngHeaderBytes(3, 2, 0x44);
    await writeFile(path.join(directory, "child.png"), mediaBytes);

    const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    parent.plugin(nodeAssets({ root: directory }));
    child.slide({ name: "Child media" }, () => (
      <img src="child.png" style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1 }} />
    ));
    parent.mount("child", child);

    const result = await write(await parent.render(pptx({ inspection: "none" })), outputPath);
    const zip = unzipSync(await readFile(outputPath));
    const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);

    expect(result).toEqual(expect.objectContaining({ ok: true, status: "created" }));
    expect(slideXml).toContain('r:embed="rId2"');
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(mediaBytes));
  });

  test("records successful incremental artifact writes through the render token", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "session-write.pptx");
    const session = createIncrementalArtifactSession();
    let render = await renderDeck("outside");
    let result: Awaited<ReturnType<typeof write>> | undefined;

    await runIncrementalArtifactCycle(session, {}, async () => {
      render = await renderDeck("session");
      result = await write(render, outputPath);
    });

    expect(result).toEqual(
      expect.objectContaining({
        path: outputPath,
        status: "created",
      }),
    );
    expect(session.snapshot().writes).toEqual([
      {
        cycle: 1,
        slot: 0,
        path: outputPath,
        result,
      },
    ]);
  });

  test("incremental writes update composed child Deck style output", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "session-composed-styles.pptx");
    const session = createIncrementalArtifactSession();
    let first: Awaited<ReturnType<typeof write>> | undefined;
    let second: Awaited<ReturnType<typeof write>> | undefined;

    await runIncrementalArtifactCycle(session, {}, async () => {
      first = await write(await renderComposedStyledDeck("#0000FF"), outputPath);
    });
    await runIncrementalArtifactCycle(
      session,
      { sourceInvalidation: { changedSourceIds: ["/project/src/deck.tsx"] } },
      async () => {
        second = await write(await renderComposedStyledDeck("#00AA00"), outputPath);
      },
    );

    const zip = unzipSync(await readFile(outputPath));
    const childSlideXml = textDecoder.decode(zip["ppt/slides/slide2.xml"]);

    expect(first).toEqual(expect.objectContaining({ ok: true, status: "created" }));
    expect(second).toEqual(expect.objectContaining({ ok: true }));
    expect(session.snapshot().writes.map((writeRecord) => writeRecord.path)).toEqual([
      outputPath,
      outputPath,
    ]);
    expect(childSlideXml).toContain("Child note");
    expect(childSlideXml).toContain('<a:srgbClr val="00AA00"/>');
    expect(childSlideXml).not.toContain('<a:srgbClr val="0000FF"/>');
  });

  test("returns result-first diagnostics without touching the target when render has no artifact", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "missing-artifact.pptx");
    const existing = textEncoder.encode("existing pptx bytes");
    await writeFile(outputPath, existing);

    const result = await write(await renderWithoutArtifact(), outputPath);
    const output = await readFile(outputPath);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        path: outputPath,
        status: "failed",
        strategy: "write-file",
        bytesWritten: 0,
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.missingArtifact",
            path: outputPath,
          }),
        ]),
      }),
    );
    expect(Array.from(output)).toEqual(Array.from(existing));
    expect(await fileExists(lockPathFor(outputPath))).toBe(false);
  });

  test("writes a rendered pdf artifact to a new file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "out.pdf");
    const render = await renderPdfArtifact();

    const result = await write(render, outputPath);
    const output = await readFile(outputPath);

    expect(result).toEqual({
      ok: true,
      path: outputPath,
      status: "written",
      strategy: "write-file",
      bytesWritten: render.artifact?.bytes.byteLength,
      patchedParts: [],
      diagnostics: [],
    });
    expect(Array.from(output)).toEqual(Array.from(render.artifact?.bytes ?? []));
    expect(await fileExists(lockPathFor(outputPath))).toBe(false);
  });

  test("writes a real PDF render through the public Node API", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "real.pdf");
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Node PDF" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 5, height: 0.6 }}>Node PDF smoke</p>
    ));

    const render = await deck.render(pdf({ inspection: "none" }));
    const result = await write(render, outputPath);
    const output = await readFile(outputPath);

    expect(render.ok).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: outputPath,
        status: "written",
        strategy: "write-file",
      }),
    );
    expect(textDecoder.decode(output.subarray(0, 8))).toBe("%PDF-1.7");
    expect(textDecoder.decode(output)).toContain("Node PDF smoke");
  });

  test("returns result-first diagnostics without touching the target for unsupported artifact formats", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "unsupported-format.pptx");
    const existing = textEncoder.encode("existing pptx bytes");
    await writeFile(outputPath, existing);

    const result = await write(await renderUnsupportedArtifact(), outputPath);
    const output = await readFile(outputPath);

    expect(result).toEqual(
      expect.objectContaining({
        path: outputPath,
        status: "failed",
        strategy: "write-file",
        bytesWritten: 0,
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.unsupportedFormat",
            path: outputPath,
          }),
        ]),
      }),
    );
    expect(Array.from(output)).toEqual(Array.from(existing));
    expect(await fileExists(lockPathFor(outputPath))).toBe(false);
  });

  test("returns result-first diagnostics without touching the target when render has errors", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "errored-render.pptx");
    const existing = textEncoder.encode("existing pptx bytes");
    await writeFile(outputPath, existing);

    const render = await renderErroredArtifact();
    const result = await write(render, outputPath);
    const output = await readFile(outputPath);

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeDefined();
    expect(result).toEqual(
      expect.objectContaining({
        path: outputPath,
        status: "failed",
        strategy: "write-file",
        bytesWritten: 0,
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.renderFailed",
            path: outputPath,
          }),
        ]),
      }),
    );
    expect(Array.from(output)).toEqual(Array.from(existing));
    expect(await fileExists(lockPathFor(outputPath))).toBe(false);
  });

  test("inspects an existing Patchable PPTX manifest and package parts", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "inspectable.pptx");
    const render = await renderDeck("inspectable");
    await write(render, outputPath);

    const inspection = await inspectPatchablePptx(outputPath);
    const slidePart = inspection.parts.find((part) => part.path === "ppt/slides/slide1.xml");

    expect(inspection).toEqual(
      expect.objectContaining({
        path: outputPath,
        ok: true,
        patchable: true,
        manifestPath: "ppt/deckjsx/patch-manifest.json",
        partCount: expect.any(Number),
        diagnostics: [],
      }),
    );
    expect(inspection.partCount).toBe(inspection.parts.length);
    expect(slidePart).toEqual(
      expect.objectContaining({
        status: "verified",
        patchableKind: "xml",
        packagePartId: expect.any(String),
        currentFingerprint: render.patchPlan?.parts.find(
          (part) => part.path === "ppt/slides/slide1.xml",
        )?.fingerprint,
      }),
    );
  });

  test("reports result-first diagnostics for non-patchable PPTX inspection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "not-patchable.pptx");
    await writeFile(outputPath, new Uint8Array([0, 1, 2, 3]));

    const inspection = await inspectPatchablePptx(outputPath);

    expect(inspection).toEqual(
      expect.objectContaining({
        path: outputPath,
        ok: false,
        patchable: false,
        manifestPath: "ppt/deckjsx/patch-manifest.json",
        partCount: 0,
        parts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.inspect.unreadableZip",
            path: outputPath,
          }),
        ]),
      }),
    );
  });

  test("reports malformed patch manifest shapes as invalid instead of throwing", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "malformed-manifest.pptx");
    await writeFile(
      outputPath,
      createPptxZipBytesFromEntries([
        {
          path: "ppt/deckjsx/patch-manifest.json",
          bytes: textEncoder.encode(
            JSON.stringify({
              kind: "deckjsx.patchManifest",
              version: 1,
              parts: "not an array",
            }),
          ),
        },
      ]),
    );

    await expect(inspectPatchablePptx(outputPath)).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        patchable: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.inspect.invalidPatchManifest",
            path: "ppt/deckjsx/patch-manifest.json",
          }),
        ]),
      }),
    );
  });

  test("reports stale patch manifest parts during Patchable PPTX inspection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "inspect-stale.pptx");
    const render = await renderDeck("stable");

    await write(render, outputPath);
    await replaceBytesInFile(outputPath, "stable", "stalee");

    const inspection = await inspectPatchablePptx(outputPath);
    const slidePart = inspection.parts.find((part) => part.path === "ppt/slides/slide1.xml");

    expect(inspection).toEqual(
      expect.objectContaining({
        ok: false,
        patchable: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.inspect.patchManifestStale",
            path: "ppt/slides/slide1.xml",
          }),
        ]),
      }),
    );
    expect(slidePart).toEqual(
      expect.objectContaining({
        status: "stale",
        currentFingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
  });

  test("patches an existing Patchable PPTX in place when changed parts fit reserved capacity", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "patched.pptx");
    const first = await renderDeck("before");
    const second = await renderDeck("after");

    await write(first, outputPath);
    const beforeStat = await stat(outputPath);

    const result = await write(second, outputPath);
    const afterStat = await stat(outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);
    const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);
    const manifestXml = textDecoder.decode(zip["ppt/deckjsx/patch-manifest.json"]);
    const slidePart = second.patchPlan?.parts.find((part) => part.path === "ppt/slides/slide1.xml");

    expect(result).toEqual(
      expect.objectContaining({
        path: outputPath,
        status: "patched",
        strategy: "in-place",
        patchedParts: expect.arrayContaining([
          "ppt/slides/slide1.xml",
          "ppt/deckjsx/patch-manifest.json",
        ]),
      }),
    );
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.ino).toBe(beforeStat.ino);
    expect(slideXml).toContain("after");
    expect(slideXml).not.toContain("before");
    expect(manifestXml).toContain(slidePart?.fingerprint);
    await expect(inspectPatchablePptx(outputPath)).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        patchable: true,
        diagnostics: [],
      }),
    );
  });

  test("keeps patchability state inside the PPTX without sidecar cache files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "no-sidecar-cache.pptx");
    const first = await renderDeck("cache before");
    const second = await renderDeck("cache after");

    await write(first, outputPath);
    await write(second, outputPath);

    const entries = await readdir(directory);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);

    expect(entries).toEqual(["no-sidecar-cache.pptx"]);
    expect(zip["ppt/deckjsx/patch-manifest.json"]).toBeDefined();
  });

  test("patches changed slide relationship XML entries in place", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "relationships.pptx");
    const first = await renderHyperlinkDeck("https://example.com/before");
    const second = await renderHyperlinkDeck("https://example.com/after");

    await write(first, outputPath);
    const beforeStat = await stat(outputPath);

    const result = await write(second, outputPath);
    const afterStat = await stat(outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);
    const slideRelationships = textDecoder.decode(zip["ppt/slides/_rels/slide1.xml.rels"]);

    expect(result).toEqual(
      expect.objectContaining({
        status: "patched",
        strategy: "in-place",
        patchedParts: expect.arrayContaining([
          "ppt/slides/_rels/slide1.xml.rels",
          "ppt/deckjsx/patch-manifest.json",
        ]),
      }),
    );
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.ino).toBe(beforeStat.ino);
    expect(result.patchedParts).not.toContain("ppt/slides/slide1.xml");
    expect(slideRelationships).toContain("https://example.com/after");
    expect(slideRelationships).not.toContain("https://example.com/before");
  });

  test("replaces a stale Patchable PPTX when existing part bytes do not match its manifest", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "stale-manifest.pptx");
    const render = await renderDeck("stable");

    await write(render, outputPath);
    await replaceBytesInFile(outputPath, "stable", "stalee");

    const result = await write(render, outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);
    const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);

    expect(result).toEqual(
      expect.objectContaining({
        status: "replaced",
        strategy: "atomic-replace",
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.patchManifestStale",
            path: "ppt/slides/slide1.xml",
          }),
        ]),
      }),
    );
    expect(slideXml).toContain("stable");
    expect(slideXml).not.toContain("stalee");
  });

  test("stages atomic replacements through the lock path instead of deckjsx-tmp files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "lock-staged.pptx");
    const blockedLegacyTempPath = path.join(
      directory,
      `.lock-staged.pptx.${process.pid}.123.deckjsx-tmp`,
    );
    const first = await renderDeck("before staged");
    const second = { ...(await renderDeck("after staged")), patchPlan: undefined };
    await write(first, outputPath);
    await mkdir(blockedLegacyTempPath);
    const now = vi.spyOn(Date, "now").mockReturnValue(123);

    try {
      const result = await write(second, outputPath);
      const output = await readFile(outputPath);
      const zip = unzipSync(output);
      const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);

      expect(result).toEqual(
        expect.objectContaining({
          status: "replaced",
          strategy: "atomic-replace",
        }),
      );
      expect(slideXml).toContain("after staged");
      expect(slideXml).not.toContain("before staged");
      expect(await fileExists(lockPathFor(outputPath))).toBe(false);
      expect(await fileExists(blockedLegacyTempPath)).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  test("replaces the whole archive with a diagnostic when changed XML exceeds reserved capacity", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "fallback.pptx");
    const first = await renderDeck("small");
    const second = await renderDeck("large ".repeat(20_000));

    await write(first, outputPath);

    const result = await write(second, outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);
    const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);

    expect(result).toEqual(
      expect.objectContaining({
        path: outputPath,
        status: "replaced",
        strategy: "atomic-replace",
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.inPlacePatchExceededCapacity",
            path: "ppt/slides/slide1.xml",
          }),
        ]),
      }),
    );
    expect(slideXml).toContain("large large");
  });

  test("patches same-size changed media entries in place", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "media.pptx");
    const beforeMedia = pngHeaderBytes(2, 2, 0xaa);
    const afterMedia = pngHeaderBytes(2, 2, 0xbb);
    const first = await renderMediaDeck(beforeMedia);
    const second = await renderMediaDeck(afterMedia);

    await write(first, outputPath);
    const beforeStat = await stat(outputPath);

    const result = await write(second, outputPath);
    const afterStat = await stat(outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);

    expect(result).toEqual(
      expect.objectContaining({
        status: "patched",
        strategy: "in-place",
        patchedParts: expect.arrayContaining([
          "ppt/media/media1.png",
          "ppt/deckjsx/patch-manifest.json",
        ]),
      }),
    );
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.ino).toBe(beforeStat.ino);
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(afterMedia));
  });

  test("replaces the whole archive when a package part was removed", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "deleted-part.pptx");
    const first = await renderDeckWithOptionalMedia(true);
    const second = await renderDeckWithOptionalMedia(false);

    await write(first, outputPath);

    const result = await write(second, outputPath);
    const output = await readFile(outputPath);
    const zip = unzipSync(output);

    expect(result).toEqual(
      expect.objectContaining({
        status: "replaced",
        strategy: "atomic-replace",
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.patchManifestRemovedPart",
            path: "ppt/media/media1.png",
          }),
        ]),
      }),
    );
    expect(zip["ppt/media/media1.png"]).toBeUndefined();
  });

  test("returns result-first diagnostics when another write holds the lock", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const outputPath = path.join(directory, "locked.pptx");
    const lockPath = lockPathFor(outputPath);
    const render = await renderDeck("locked");
    await writeFile(lockPath, lockFileContentsFor(outputPath));

    const result = await write(render, outputPath);

    expect(result).toEqual(
      expect.objectContaining({
        path: outputPath,
        status: "failed",
        strategy: "write-file",
        bytesWritten: 0,
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.lockUnavailable",
            path: lockPath,
          }),
        ]),
      }),
    );
    expect(await fileExists(outputPath)).toBe(false);
    expect(await fileExists(lockPath)).toBe(true);
  });

  test("falls back to an output-scoped lock when the default lock belongs to another output", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const firstOutputPath = path.join(directory, "first.pptx");
    const secondOutputPath = path.join(directory, "second.pptx");
    const defaultLockPath = lockPathFor(firstOutputPath);
    const secondScopedLockPath = outputScopedLockPathFor(secondOutputPath);
    const render = await renderDeck("second");
    await writeFile(defaultLockPath, lockFileContentsFor(firstOutputPath));

    const result = await write(render, secondOutputPath);
    const output = await readFile(secondOutputPath);
    const zip = unzipSync(output);
    const slideXml = textDecoder.decode(zip["ppt/slides/slide1.xml"]);

    expect(result).toEqual(
      expect.objectContaining({
        path: secondOutputPath,
        status: "created",
        strategy: "write-file",
      }),
    );
    expect(slideXml).toContain("second");
    expect(await fileExists(defaultLockPath)).toBe(true);
    expect(await fileExists(secondScopedLockPath)).toBe(false);
  });

  test("returns result-first diagnostics when writing fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-"));
    const parentDirectory = path.dirname(directory);
    const tempPrefix = `.${path.basename(directory)}.`;
    const render = { ...(await renderDeck("failure")), patchPlan: undefined };

    const result = await write(render, directory);

    expect(result).toEqual(
      expect.objectContaining({
        path: directory,
        status: "failed",
        strategy: "write-file",
        bytesWritten: 0,
        patchedParts: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "deckjsx.node.write.failed",
            path: directory,
          }),
        ]),
      }),
    );
    await expect(
      readdir(parentDirectory).then((entries) =>
        entries.filter((entry) => entry.startsWith(tempPrefix) && entry.endsWith(".deckjsx-tmp")),
      ),
    ).resolves.toEqual([]);
  });
});

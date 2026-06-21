import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render built-in asset boundary", () => {
  test("built-in asset probe extracts image dimensions into Project media metadata", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngDataUri = H.dataUriFromBytes("image/png", H.pngHeaderBytes(12, 7));

    deck.slide({ name: "Built-in image dimensions" }, () => (
      <>
        <img data={pngDataUri} style={{ x: 1, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");

    expect(project.ok).toBe(true);
    expect(mediaPart?.payload).toMatchObject({
      metadata: {
        mediaType: "image/png",
        extension: "png",
        widthPx: 12,
        heightPx: 7,
        byteLength: 29,
      },
    });
  });

  test("built-in asset boundary does not fetch absolute http media URLs", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchedUrls.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      return new Response(H.pngHeaderBytes(24, 13), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    try {
      deck.slide({ name: "URL asset" }, () => (
        <>
          <img
            src="https://cdn.example.test/chart.png"
            style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
          />
        </>
      ));

      const project = await deck.project();
      const mediaPart = project.projection?.parts.find((part) => part.kind === "media");
      const diagnostic = project.diagnostics.items.find(
        (item) => item.code === "W_PROJECT_REMOTE_ASSET_FETCH_DISABLED",
      );

      expect(project.ok).toBe(false);
      expect(mediaPart?.path).toBe("ppt/media/media1.png");
      expect(mediaPart?.payload).toMatchObject({
        source: { kind: "url", url: "https://cdn.example.test/chart.png" },
        metadata: {
          extension: "png",
        },
      });
      expect(diagnostic).toMatchObject({
        severity: "warning",
        title: "built-in remote asset fetch is disabled",
        labels: [expect.objectContaining({ message: "https://cdn.example.test/chart.png" })],
      });
      expect(fetchedUrls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("project inspection exposes remote asset fetch disabled diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchedUrls.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      return new Response(H.pngHeaderBytes(8, 5), {
        status: 200,
        headers: { "content-type": "image/png; charset=utf-8" },
      });
    }) as typeof fetch;

    try {
      deck.slide({ name: "Inspect URL asset" }, () => (
        <img
          src="https://cdn.example.test/inspect.png"
          style={{ x: 1, y: 1, width: 2, height: 1 }}
        />
      ));

      const project = await H.projectSource({
        source: deck,
        options: deck.options,
        projectOptions: { inspection: "summary" },
      });

      expect(project.ok).toBe(false);
      expect(project.summary?.assetResolutions).toEqual([
        expect.objectContaining({
          sourceKind: "url",
          sourceField: "src",
          resolverIdentity: "deckjsx:builtin",
          diagnosticCodes: ["W_PROJECT_REMOTE_ASSET_FETCH_DISABLED"],
        }),
      ]);
      expect(fetchedUrls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("project inspection summarizes asset source identity without raw media source payloads", async () => {
    const child = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    child.slide({ name: "Child asset" }, () => (
      <img src="./child.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));
    const parent = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    parent.mount("child-source", child);
    const loader = H.testAssetLoader({
      resolverIdentity: "mounted-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: 1,
              height: 1,
              byteLength: H.pngHeaderBytes(1, 1).byteLength,
              hash: "fnv1a32:mounted",
            }
          : undefined;
      },
    });

    const project = await H.projectSource({
      source: parent,
      options: parent.options,
      projectOptions: { inspection: "summary" },
      assetLoaders: [loader],
    });
    const resolution = project.summary?.assetResolutions[0];

    expect(project.ok).toBe(true);
    expect(resolution).toEqual(
      expect.objectContaining({
        sourceKind: "path",
        sourceField: "src",
        sourceIdentity: "child-source",
      }),
    );
    expect(resolution).not.toHaveProperty("source", "./child.png");
  });

  test("project reports an asset boundary diagnostic when remote URL fetch is disabled", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchedUrls.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      return new Response(H.pngHeaderBytes(2, 2));
    }) as typeof fetch;

    try {
      deck.slide({ name: "Missing fetch URL asset" }, () => (
        <img
          src="https://cdn.example.test/missing-fetch.png"
          style={{ x: 1, y: 1, width: 2, height: 1 }}
        />
      ));

      const project = await H.projectSource({
        source: deck,
        options: deck.options,
      });
      const diagnostic = project.diagnostics.items.find(
        (item) => item.code === "W_PROJECT_REMOTE_ASSET_FETCH_DISABLED",
      );

      expect(project.ok).toBe(false);
      expect(diagnostic).toMatchObject({
        severity: "warning",
        title: "built-in remote asset fetch is disabled",
        labels: [
          expect.objectContaining({ message: "https://cdn.example.test/missing-fetch.png" }),
        ],
        notes: expect.arrayContaining([
          "phase=probe",
          "resolverIdentity=deckjsx:builtin",
          "sourceKind=url",
        ]),
      });
      expect(fetchedUrls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration execution contexts", () => {
  test("render execution plugins participate in lifecycle hooks", async () => {
    const events: string[] = [];
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render plugin context" }, () => <p>plugin context</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        plugins: [
          {
            kind: "deckjsx.plugin",
            id: "test:render-execution-plugin",
            hooks: {
              afterGraph() {
                events.push("afterGraph");
              },
            },
          },
        ],
      }),
    );

    expect(render.ok).toBe(true);
    expect(events).toEqual(["afterGraph"]);
  });

  test("render execution integration loaders participate in project asset probing", async () => {
    const events: string[] = [];
    const loader = {
      resolverIdentity: "test:render-execution-project-probe-loader",
      async probe() {
        events.push("probe");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            hash: "fnv1a32:render-execution-project-probe",
          },
        };
      },
      async load() {
        events.push("load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            hash: "fnv1a32:render-execution-project-probe",
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render integration loader" }, () => (
      <img
        {...H.mediaSourceOrigins({
          src: { importer: "/project/src/deck.tsx", source: "./asset.png" },
        })}
        src="./asset.png"
        style={{ x: 1, y: 1, width: 1, height: 1 }}
      />
    ));

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        integration: {
          id: H.integrationContextId("test:render-execution-project-probe"),
          assetLoaders: [loader],
        },
      }),
    );

    expect(render.ok).toBe(true);
    expect(events).toEqual(["probe", "load"]);
  });

  test("render execution integration contexts compose instead of replacing each other", async () => {
    const events: string[] = [];
    const firstLoader = {
      resolverIdentity: "test:first-render-execution-loader",
      async probe({ source }) {
        if (source.kind !== "path" || source.path !== "./first.png") {
          return undefined;
        }
        events.push("first:probe");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path" || source.path !== "./first.png") {
          return undefined;
        }
        events.push("first:load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const secondLoader = {
      resolverIdentity: "test:second-render-execution-loader",
      async probe({ source }) {
        if (source.kind !== "path" || source.path !== "./second.png") {
          return undefined;
        }
        events.push("second:probe");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path" || source.path !== "./second.png") {
          return undefined;
        }
        events.push("second:load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Composable render integrations" }, () => (
      <>
        <img src="./first.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
        <img src="./second.png" style={{ x: 2, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const input = H.withRenderExecutionContext(
      H.withRenderExecutionContext(H.pptx(), {
        integration: {
          id: H.integrationContextId("test:first-render-execution"),
          assetLoaders: [firstLoader],
        },
      }),
      {
        integration: {
          id: H.integrationContextId("test:second-render-execution"),
          assetLoaders: [secondLoader],
        },
      },
    );
    const render = await deck.render(input);

    expect(render.ok).toBe(true);
    expect(events).toEqual(["first:probe", "second:probe", "first:load", "second:load"]);
  });

  test("asset hooks wrap render-time byte loading as the load phase", async () => {
    const events: string[] = [];
    const loader = {
      resolverIdentity: "test:asset-hook-load-loader",
      async probe() {
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load() {
        events.push("load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:asset-load-hooks",
      integration: { id: H.integrationContextId("test:asset-load-hooks"), assetLoaders: [loader] },
      hooks: {
        beforeAsset(context) {
          events.push(`${context.phase}:${context.operation}`);
        },
        afterAsset(context) {
          events.push(`${context.phase}:${context.operation}`);
        },
      },
    });
    deck.slide({ name: "Asset load hooks" }, () => (
      <img src="./asset.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
    expect(events).toEqual(["before:probe", "after:probe", "before:load", "load", "after:load"]);
  });
});

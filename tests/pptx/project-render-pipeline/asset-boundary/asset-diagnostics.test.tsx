import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render asset diagnostics", () => {
  test("project asset probe failures identify source, resolver identity, phase, and asset entity", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "broken-probe",
      async probe({ source }) {
        if (source.kind === "path") {
          throw new Error("probe exploded");
        }
        return undefined;
      },
    });
    deck.slide({ name: "Broken probe" }, () => (
      <>
        <img
          src="/public/broken.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_PROBE_FAILED",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      labels: [expect.objectContaining({ message: "/public/broken.png" })],
      notes: expect.arrayContaining([
        "phase=probe",
        "resolverIdentity=broken-probe",
        "sourceKind=path",
      ]),
    });
    expect(diagnostic?.notes?.some((note) => note.startsWith("assetEntityId="))).toBe(true);
  });

  test("project reports missing integration context for project-local path sources", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing context" }, () => (
      <img
        src="./local.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
    });
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_CONTEXT_MISSING",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      message: "Project-local asset paths require an Integration Context.",
      labels: [expect.objectContaining({ message: "./local.png" })],
      notes: expect.arrayContaining(["phase=probe", "sourceKind=path", "sourceField=src"]),
    });
  });

  test("project reports invalid asset probe result shapes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "invalid-probe",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "", extension: "", width: 0, height: Number.NaN, byteLength: -1 }
          : undefined;
      },
    });
    deck.slide({ name: "Invalid probe" }, () => (
      <>
        <img
          src="/public/invalid-probe.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_PROBE_INVALID",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      message: "Asset loader returned an invalid result shape.",
      labels: [expect.objectContaining({ message: "/public/invalid-probe.png" })],
      notes: expect.arrayContaining([
        "phase=probe",
        "resolverIdentity=invalid-probe",
        "invalidFields=mediaType,extension,width,height,byteLength",
        "sourceKind=path",
      ]),
    });
  });

  test("project reports incomplete asset probe result shapes when image dimensions are missing", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "dimensionless-probe",
      async probe({ source }) {
        return source.kind === "path" ? { mediaType: "image/png", extension: "png" } : undefined;
      },
    });
    deck.slide({ name: "Incomplete probe" }, () => (
      <>
        <img
          src="/public/dimensionless.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const diagnostic = project.diagnostics.items.find(
      (item) => item.code === "E_PROJECT_ASSET_PROBE_INCOMPLETE",
    );

    expect(project.ok).toBe(false);
    expect(diagnostic).toMatchObject({
      message: "Asset probe did not return metadata required by the projected package model.",
      labels: [expect.objectContaining({ message: "/public/dimensionless.png" })],
      notes: expect.arrayContaining([
        "phase=probe",
        "resolverIdentity=dimensionless-probe",
        "missingFields=width,height",
        "sourceKind=path",
      ]),
    });
  });

  test("render asset load failures identify package part path and source details", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "broken-load",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        if (source.kind === "path") {
          throw new Error("load exploded");
        }
        return undefined;
      },
    });
    deck.slide({ name: "Broken load" }, () => (
      <>
        <img
          src="/public/broken.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const diagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_ASSET_LOAD_FAILED",
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(diagnostic).toMatchObject({
      labels: [
        expect.objectContaining({ path: "ppt/media/media1.png", message: "/public/broken.png" }),
      ],
      notes: expect.arrayContaining([
        "phase=load",
        "resolverIdentity=broken-load",
        "packagePartPath=ppt/media/media1.png",
        "sourceKind=path",
      ]),
    });
    expect(diagnostic?.notes?.some((note) => note.startsWith("assetEntityId="))).toBe(true);
  });

  test("a successful retry replaces transient asset load diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = H.pngHeaderBytes(1, 1);
    let loadAttempts = 0;
    const loader = H.testAssetLoader({
      resolverIdentity: "retry-load",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadAttempts += 1;
        if (loadAttempts === 1) {
          throw new Error("transient load failure");
        }
        return {
          mediaType: "image/png",
          extension: "png",
          width: 1,
          height: 1,
          bytes: pngBytes,
        };
      },
    });
    deck.slide({ name: "Retry load" }, () => (
      <img
        src="/public/retry.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));
    const artifacts = new H.PipelineArtifactCollection();

    const failed = await H.renderSource({
      source: deck,
      options: deck.options,
      artifacts,
      assetLoaders: [loader],
    });
    const recovered = await H.renderSource({
      source: deck,
      options: deck.options,
      artifacts,
      assetLoaders: [loader],
    });

    expect(failed.ok).toBe(false);
    expect(
      failed.diagnostics.items.some((item) => item.code === "E_RENDER_ASSET_LOAD_FAILED"),
    ).toBe(true);
    expect(recovered.ok).toBe(true);
    expect(
      recovered.diagnostics.items.some((item) => item.code === "E_RENDER_ASSET_LOAD_FAILED"),
    ).toBe(false);
    expect(
      [...artifacts.assetsById.values()][0]?.diagnostics.items.some(
        (item) => item.code === "E_RENDER_ASSET_LOAD_FAILED",
      ),
    ).toBe(false);
  });

  test("render reports invalid asset load result shapes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "invalid-load",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source }) {
        return source.kind === "path"
          ? ({
              mediaType: "image/png",
              extension: "png",
              width: Number.POSITIVE_INFINITY,
              bytes: "not bytes",
            } as never)
          : undefined;
      },
    });
    deck.slide({ name: "Invalid load" }, () => (
      <>
        <img
          src="/public/invalid-load.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const diagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_ASSET_LOAD_INVALID",
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(diagnostic).toMatchObject({
      message: "Asset loader returned an invalid result shape.",
      labels: [
        expect.objectContaining({
          path: "ppt/media/media1.png",
          message: "/public/invalid-load.png",
        }),
      ],
      notes: expect.arrayContaining([
        "phase=load",
        "resolverIdentity=invalid-load",
        "invalidFields=width,bytes",
        "packagePartPath=ppt/media/media1.png",
        "sourceKind=path",
      ]),
    });
  });

  test("project includes successful asset probe diagnostics once", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const probeWarning: H.Diagnostic = {
      severity: "warning",
      code: "W_TEST_ASSET_PROBE",
      title: "test asset probe warning",
      labels: [],
    };
    const loader: H.AssetLoader = {
      resolverIdentity: "probe-warning-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              ok: true,
              value: {
                mediaType: "image/png",
                extension: "png",
                width: 1,
                height: 1,
              },
              diagnostics: [{ ...probeWarning }],
            }
          : undefined;
      },
    };
    deck.slide({ name: "Probe warning" }, () => (
      <>
        <img
          src="/public/probe-warning.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });

    expect(project.ok).toBe(true);
    expect(H.diagnosticCodeCount(project.diagnostics.items, "W_TEST_ASSET_PROBE")).toBe(1);
  });

  test("render includes successful asset probe and load diagnostics once", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = H.pngHeaderBytes(1, 1);
    const probeWarning: H.Diagnostic = {
      severity: "warning",
      code: "W_TEST_ASSET_PROBE",
      title: "test asset probe warning",
      labels: [],
    };
    const loadWarning: H.Diagnostic = {
      severity: "warning",
      code: "W_TEST_ASSET_LOAD",
      title: "test asset load warning",
      labels: [],
    };
    const loader: H.AssetLoader = {
      resolverIdentity: "load-warning-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              ok: true,
              value: {
                mediaType: "image/png",
                extension: "png",
                width: 1,
                height: 1,
                byteLength: pngBytes.byteLength,
              },
              diagnostics: [probeWarning],
            }
          : undefined;
      },
      async load({ source }) {
        return source.kind === "path"
          ? {
              ok: true,
              value: {
                mediaType: "image/png",
                extension: "png",
                width: 1,
                height: 1,
                byteLength: pngBytes.byteLength,
                bytes: pngBytes,
              },
              diagnostics: [{ ...loadWarning }],
            }
          : undefined;
      },
    };
    deck.slide({ name: "Load warning" }, () => (
      <>
        <img
          src="/public/load-warning.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });

    expect(render.ok).toBe(true);
    expect(H.diagnosticCodeCount(render.diagnostics.items, "W_TEST_ASSET_PROBE")).toBe(1);
    expect(H.diagnosticCodeCount(render.diagnostics.items, "W_TEST_ASSET_LOAD")).toBe(1);
  });

  test("cached project and render reuse does not amplify asset diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = H.pngHeaderBytes(1, 1);
    const probeWarning: H.Diagnostic = {
      severity: "warning",
      code: "W_TEST_ASSET_CACHE",
      title: "test cached asset warning",
      labels: [],
    };
    const loadWarning: H.Diagnostic = {
      severity: "warning",
      code: "W_TEST_ASSET_CACHE_LOAD",
      title: "test cached asset load warning",
      labels: [],
    };
    const loader: H.AssetLoader = {
      resolverIdentity: "diagnostic-cache-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              ok: true,
              value: {
                mediaType: "image/png",
                extension: "png",
                width: 1,
                height: 1,
                byteLength: pngBytes.byteLength,
              },
              diagnostics: [probeWarning],
            }
          : undefined;
      },
      async load({ source }) {
        return source.kind === "path"
          ? {
              ok: true,
              value: {
                mediaType: "image/png",
                extension: "png",
                width: 1,
                height: 1,
                byteLength: pngBytes.byteLength,
                bytes: pngBytes,
              },
              diagnostics: [loadWarning],
            }
          : undefined;
      },
    };
    deck.slide({ name: "Cached warning" }, () => (
      <img
        src="/public/cache-warning.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projectArtifacts = new H.PipelineArtifactCollection();
    const projectWarningCounts: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const project = await H.projectSource({
        source: deck,
        options: deck.options,
        artifacts: projectArtifacts,
        assetLoaders: [loader],
      });
      projectWarningCounts.push(
        H.diagnosticCodeCount(project.diagnostics.items, "W_TEST_ASSET_CACHE"),
      );
    }

    const renderArtifacts = new H.PipelineArtifactCollection();
    const renderProbeWarningCounts: number[] = [];
    const renderLoadWarningCounts: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const render = await H.renderSource({
        source: deck,
        options: deck.options,
        artifacts: renderArtifacts,
        assetLoaders: [loader],
      });
      renderProbeWarningCounts.push(
        H.diagnosticCodeCount(render.diagnostics.items, "W_TEST_ASSET_CACHE"),
      );
      renderLoadWarningCounts.push(
        H.diagnosticCodeCount(render.diagnostics.items, "W_TEST_ASSET_CACHE_LOAD"),
      );
    }

    expect(projectWarningCounts).toEqual([1, 1, 1, 1]);
    expect(renderProbeWarningCounts).toEqual([1, 1, 1]);
    expect(renderLoadWarningCounts).toEqual([1, 1, 1]);
    expect(
      H.diagnosticCodeCount(
        [...projectArtifacts.assetsById.values()][0]?.diagnostics.items ?? [],
        "W_TEST_ASSET_CACHE",
      ),
    ).toBe(1);
    expect(
      H.diagnosticCodeCount(
        [...renderArtifacts.assetsById.values()][0]?.diagnostics.items ?? [],
        "W_TEST_ASSET_CACHE",
      ),
    ).toBe(1);
    expect(
      H.diagnosticCodeCount(
        [...renderArtifacts.assetsById.values()][0]?.diagnostics.items ?? [],
        "W_TEST_ASSET_CACHE_LOAD",
      ),
    ).toBe(1);
  });
});

import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import type { WriterAdapter } from "../../src/adapter.ts";
import { createDiagnostics, diagnostic } from "../../src/diagnostics/index.ts";
import { Deck } from "../../src/index.ts";
import { PipelineArtifactCollection } from "../../src/pipeline-artifacts.ts";
import { renderSource } from "../../src/pipeline-runner.ts";
import type { RenderedArtifact } from "../../src/pipeline.ts";
import type { PptxPackageModel } from "../../src/projection/pptx/model.ts";
import { createNodeOutputByteSink, writeNodeOutput } from "../../src/runtime/node-output.ts";
import { nodeOutputRuntimeStatus } from "../../src/runtime/output.ts";

describe("runtime boundary", () => {
  test("pipeline runner does not statically import Node filesystem APIs", async () => {
    const source = await readFile(new URL("../../src/pipeline-runner.ts", import.meta.url), "utf8");

    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("node:path");
    expect(source).toContain('from "./runtime/output"');
  });

  test("Node output runtime status reports unavailable non-Node runtimes", () => {
    expect(nodeOutputRuntimeStatus({})).toMatchObject({
      ok: false,
      reason: "nodeRuntimeUnavailable",
    });
  });

  test("Deck render writes a Rendered Artifact through the Output Writer", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "nested", "deck.pptx");

    deck.slide({ name: "Runtime output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Runtime</p>
      </>
    ));

    try {
      const result = await deck.render({ output });

      const [content, fileStat] = await Promise.all([readFile(output), stat(output)]);

      expect(result.ok).toBe(true);
      expect(result.output).toEqual({ path: output });
      expect(result.summary?.output).toMatchObject({
        requested: true,
        path: output,
        status: "written",
        runtime: { kind: "node", available: true },
      });
      expect(Array.from(content)).toEqual(Array.from(result.artifact?.bytes ?? []));
      expect(content.subarray(0, 2).toString("utf8")).toBe("PK");
      expect(fileStat.size).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("Node output writer replaces an existing output file without leaving backups", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "existing.pptx");
    const artifact: RenderedArtifact<"pptx"> = {
      format: "pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      bytes: new Uint8Array([80, 75, 3, 4]),
    };

    try {
      await writeFile(output, "previous");

      const written = await writeNodeOutput({ output, artifact });
      const [content, entries] = await Promise.all([readFile(output), readdir(tempDir)]);

      expect(written).toEqual({ path: output });
      expect(Array.from(content)).toEqual(Array.from(artifact.bytes));
      expect(entries).toEqual(["existing.pptx"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("Node output byte sink replaces an existing output file without leaving backups", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "existing-sink.pptx");
    const bytes = new Uint8Array([80, 75, 5, 6]);

    try {
      await writeFile(output, "previous");

      const sink = createNodeOutputByteSink({ output });
      sink.write(bytes);
      sink.close?.();

      const [content, entries] = await Promise.all([readFile(output), readdir(tempDir)]);
      expect(Array.from(content)).toEqual(Array.from(bytes));
      expect(entries).toEqual(["existing-sink.pptx"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("render failure does not truncate an existing output file", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "existing.pptx");
    const original = new TextEncoder().encode("existing output should survive");
    const adapter: WriterAdapter<PptxPackageModel, "pptx"> = {
      kind: "deckjsx.writerAdapter",
      name: "pptx",
      projectionFormat: "pptx",
      format: "pptx",
      options: { output },
      async render() {
        return {
          diagnostics: createDiagnostics([
            diagnostic({
              severity: "error",
              code: "E_TEST_RENDER_FAILED",
              title: "test render failed",
              labels: [],
            }),
          ]),
        };
      },
    };

    deck.slide({ name: "Runtime output" }, () => <></>);

    try {
      await writeFile(output, original);

      const result = await deck.render(adapter);
      const after = await readFile(output);

      expect(result.ok).toBe(false);
      expect(result.artifact).toBeUndefined();
      expect(result.output).toBeUndefined();
      expect(Array.from(after)).toEqual(Array.from(original));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("degenerate drawing frame diagnostics do not truncate an existing output file", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const output = join(tempDir, "existing-degenerate.pptx");
    const original = new TextEncoder().encode("existing output should survive degenerate frame");

    deck.slide({ name: "Degenerate frame" }, () => (
      <p style={{ x: 1, y: 1, width: 0, height: 0, fontSize: 18 }}>Invisible</p>
    ));

    try {
      await writeFile(output, original);

      const result = await deck.render({ output });
      const after = await readFile(output);

      expect(result.ok).toBe(false);
      expect(result.artifact).toBeUndefined();
      expect(result.output).toBeUndefined();
      expect(result.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          title: "pptx drawing frame is degenerate",
        }),
      );
      expect(Array.from(after)).toEqual(Array.from(original));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("render returns artifact bytes without writing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Runtime output" }, () => <></>);

    const result = await deck.render();

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
    expect(result.artifact?.extension).toBe("pptx");
    expect(result.artifact?.bytes.subarray(0, 2).toString()).toBe("80,75");
    expect(result.summary?.output).toEqual({
      requested: false,
      status: "notRequested",
      reason: "noOutputRequested",
    });
  });

  test("render preserves artifact bytes when file writing fails", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const blocker = join(tempDir, "blocker");
    const output = join(blocker, "deck.pptx");

    deck.slide({ name: "Runtime output" }, () => <></>);

    try {
      await writeFile(blocker, "not a directory");
      const result = await deck.render({ output });

      expect(result.ok).toBe(false);
      expect(result.artifact?.bytes.byteLength).toBeGreaterThan(0);
      expect(result.output).toBeUndefined();
      expect(result.summary?.output).toMatchObject({
        requested: true,
        path: output,
        status: "failed",
        reason: "outputWriteFailed",
        runtime: { kind: "node", available: true },
      });
      expect(
        result.diagnostics.items.some((item) => item.code === "E_RENDER_OUTPUT_WRITE_FAILED"),
      ).toBe(true);
      expect(result.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_RENDER_OUTPUT_WRITE_FAILED",
          title: "output write failed",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "render.output", message: output }),
          ]),
          notes: expect.arrayContaining(["reason=outputWriteFailed"]),
        }),
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("pipeline preserves build artifacts after path output failure for later warm reuse", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-runtime-"));
    const blocker = join(tempDir, "blocker");
    const output = join(blocker, "deck.pptx");

    deck.slide({ name: "Failed output reuse" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Reusable parts</p>
    ));

    try {
      await writeFile(blocker, "not a directory");
      const failed = await renderSource({
        source: deck,
        options: deck.options,
        renderInput: { output, inspection: "summary" },
        artifacts,
      });
      const warm = await renderSource({
        source: deck,
        options: deck.options,
        renderInput: { inspection: "summary" },
        definedProjection: artifacts.projection,
        artifacts,
      });

      expect(failed.ok).toBe(false);
      expect(failed.artifact?.bytes.byteLength).toBeGreaterThan(0);
      expect(artifacts.pptxBuildArtifactsByPartId.size).toBeGreaterThan(0);
      expect(
        [...artifacts.pptxBuildArtifactsByPartId.values()].some(
          (artifact) => artifact.path === "ppt/slides/slide1.xml",
        ),
      ).toBe(true);
      expect(warm.ok).toBe(true);
      expect(warm.summary?.assembly?.reusedCount).toBeGreaterThan(0);
      expect(warm.summary?.assembly?.entries).toContainEqual(
        expect.objectContaining({
          path: "ppt/slides/slide1.xml",
          status: "reused",
          reason: "buildArtifactFingerprintMatched",
        }),
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("render preserves artifact bytes when path output is unavailable in the runtime", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const originalProcessDescriptor = Object.getOwnPropertyDescriptor(globalThis, "process");

    deck.slide({ name: "Runtime unavailable" }, () => <></>);

    try {
      Object.defineProperty(globalThis, "process", { configurable: true, value: undefined });
      const result = await deck.render({ output: "deck.pptx" });

      expect(result.ok).toBe(false);
      expect(result.artifact?.bytes.byteLength).toBeGreaterThan(0);
      expect(result.output).toBeUndefined();
      expect(result.summary?.output).toMatchObject({
        requested: true,
        path: "deck.pptx",
        status: "unavailable",
        reason: "runtimeOutputUnavailable",
        runtime: { kind: "node", available: false, reason: "nodeRuntimeUnavailable" },
      });
      expect(result.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_RENDER_OUTPUT_WRITE_FAILED",
          title: "output runtime unavailable",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "render.output", message: "deck.pptx" }),
          ]),
          notes: expect.arrayContaining([
            "reason=runtimeOutputUnavailable",
            "runtimeReason=nodeRuntimeUnavailable",
          ]),
          help: expect.arrayContaining([
            "Render without an output path to use RenderResult.artifact.bytes in this runtime.",
          ]),
        }),
      );
    } finally {
      if (originalProcessDescriptor) {
        Object.defineProperty(globalThis, "process", originalProcessDescriptor);
      }
    }
  });
});

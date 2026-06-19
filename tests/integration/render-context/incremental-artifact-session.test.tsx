import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration incremental artifact session", () => {
  test("incremental artifact session attaches opaque write tokens to render results", async () => {
    const outsideDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    outsideDeck.slide({ name: "Outside" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>outside</p>
    ));
    const outsideRender = await outsideDeck.render(H.pptx());

    const session = H.createIncrementalArtifactSession();
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Inside" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>inside</p>
    ));

    let render = await deck.render(H.pptx());
    let token = H.getArtifactWriteToken(render);
    let record: ReturnType<typeof H.recordArtifactWrite> | undefined;
    await H.runIncrementalArtifactCycle(session, {}, async () => {
      render = await deck.render(H.pptx());
      token = H.getArtifactWriteToken(render);
      record = H.recordArtifactWrite(token, {
        path: "/project/output.pptx",
        result: { status: "created" },
      });
    });

    expect(H.getArtifactWriteToken(outsideRender)).toBeUndefined();
    expect(Object.keys(render)).not.toContain("artifactWriteToken");
    expect(token).toBeDefined();
    expect(record).toEqual({
      cycle: 1,
      slot: 0,
      path: "/project/output.pptx",
      result: { status: "created" },
    });
    expect(session.snapshot().writes).toEqual([record]);
    expect("artifactSlots" in session.snapshot()).toBe(false);
    expect(session.inspectArtifacts().retainedSlots()).toEqual([0]);
    const snapshot = session.snapshot();
    (snapshot.writes as H.IncrementalArtifactWriteRecord[]).push({
      cycle: 999,
      slot: 999,
      path: "/project/mutated.pptx",
      result: { status: "created" },
    });
    expect(session.snapshot().writes).toEqual([record]);
    const mutableWrite = snapshot.writes[0] as H.IncrementalArtifactWriteRecord<{
      status: string;
    }>;
    mutableWrite.result.status = "mutated";
    expect(session.snapshot().writes).toEqual([record]);
  });

  test("artifact inspection returns immutable snapshots of retained graph and projection data", async () => {
    const session = H.createIncrementalArtifactSession();

    await H.runIncrementalArtifactCycle(session, {}, async () => {
      const slot = H.claimIncrementalArtifactRenderSlot();
      slot?.artifacts.replaceProjectionArtifact({
        format: "pptx",
        size: { widthEmu: 9144000, heightEmu: 5143500 },
        parts: [],
        slides: [{ id: "ppt/slide-1", payload: { drawing: { children: [] } } }],
      } as never);
      slot?.artifacts.materializeGraph({
        sourceKey: H.ROOT_SOURCE_ARTIFACT_KEY,
        graph: {
          nodes: new Map([
            [
              "node-1",
              {
                id: "node-1",
                kind: "element",
                label: "original",
              },
            ],
          ]),
          styles: new Map(),
          assets: new Map(),
        } as never,
        resolvedStyles: new Map([
          [
            "node-1",
            {
              style: { color: "blue" },
              propertyTraces: {
                color: {
                  property: "color",
                  candidates: [{ value: "blue", source: { layer: "style" }, applied: true }],
                },
              },
            },
          ],
        ]) as never,
        diagnostics: H.createDiagnostics(),
      });
    });

    const firstNode = session.inspectArtifacts().graphNode("node-1");
    if (!firstNode) {
      throw new Error("Expected retained graph node.");
    }
    (firstNode.node as { label: string }).label = "mutated";
    const secondNode = session.inspectArtifacts().graphNode("node-1");
    if (!secondNode) {
      throw new Error("Expected retained graph node.");
    }
    expect((secondNode.node as { label: string }).label).toBe("original");

    const firstProjection = session.inspectArtifacts().firstProjection();
    if (!firstProjection) {
      throw new Error("Expected retained projection.");
    }
    (firstProjection.projection as { format: string }).format = "mutated";
    const secondProjection = session.inspectArtifacts().firstProjection();
    if (!secondProjection) {
      throw new Error("Expected retained projection.");
    }
    expect((secondProjection.projection as { format: string }).format).toBe("pptx");
  });

  test("incremental artifact cycle complete rejects active and repeated completion", async () => {
    const session = H.createIncrementalArtifactSession();
    const cycle = session.beginCycle();
    let completeWhileRunningError: unknown;

    await cycle.run(async () => {
      try {
        cycle.complete();
      } catch (error) {
        completeWhileRunningError = error;
      }
    });

    expect(completeWhileRunningError).toBeInstanceOf(Error);
    expect((completeWhileRunningError as Error).message).toBe(
      "Incremental artifact cycle 1 cannot complete while it is still running.",
    );
    expect(cycle.complete()).toEqual({
      cycle: 1,
      renderCount: 0,
      writes: [],
    });
    expect(() => cycle.complete()).toThrow("Incremental artifact cycle 1 has already completed.");
  });

  test("incremental artifact session rejects writes after a cycle completes", async () => {
    const session = H.createIncrementalArtifactSession();
    const cycle = session.beginCycle();
    let token = H.getArtifactWriteToken(
      await new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).render(H.pptx()),
    );

    await cycle.run(async () => {
      const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "Late write" }, () => (
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>late</p>
      ));
      token = H.getArtifactWriteToken(await deck.render(H.pptx()));
    });
    cycle.complete();

    expect(() =>
      H.recordArtifactWrite(token, {
        path: "/project/output.pptx",
        result: { status: "created" },
      }),
    ).toThrow("Incremental artifact cycle 1 has already completed.");
  });

  test("incremental artifact session rejects writes when another cycle is active", async () => {
    const session = H.createIncrementalArtifactSession();
    const outer = session.beginCycle();
    const inner = session.beginCycle();
    let outerToken: H.ArtifactWriteToken | undefined;
    let writeError: unknown;

    await outer.run(async () => {
      const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "Outer" }, () => (
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>outer</p>
      ));
      outerToken = H.getArtifactWriteToken(await deck.render(H.pptx()));
      await inner.run(async () => {
        try {
          H.recordArtifactWrite(outerToken, {
            path: "/project/output.pptx",
            result: { status: "created" },
          });
        } catch (error) {
          writeError = error;
        }
      });
    });

    expect(writeError).toBeInstanceOf(Error);
    expect((writeError as Error).message).toBe(
      "Incremental artifact cycle 1 is not the active artifact write cycle.",
    );
    expect(outer.complete().writes).toEqual([]);
    expect(inner.complete().writes).toEqual([]);
  });

  test("incremental artifact session scopes active cycles to async execution", async () => {
    const session = H.createIncrementalArtifactSession();
    const outer = session.beginCycle();
    const inner = session.beginCycle();
    let markInnerReady!: () => void;
    let releaseInner!: () => void;
    const innerReady = new Promise<void>((resolve) => {
      markInnerReady = resolve;
    });
    const keepInnerRunning = new Promise<void>((resolve) => {
      releaseInner = resolve;
    });
    let outerRecord: ReturnType<typeof H.recordArtifactWrite> | undefined;

    const outerRun = outer.run(async () => {
      await innerReady;
      const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "Outer async" }, () => (
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>outer async</p>
      ));
      outerRecord = H.recordArtifactWrite(H.getArtifactWriteToken(await deck.render(H.pptx())), {
        path: "/project/outer.pptx",
        result: { status: "created" },
      });
    });
    const innerRun = inner.run(async () => {
      markInnerReady();
      await keepInnerRunning;
    });

    await outerRun;
    releaseInner();
    await innerRun;

    expect(outerRecord).toEqual({
      cycle: outer.cycle,
      slot: 0,
      path: "/project/outer.pptx",
      result: { status: "created" },
    });
    expect(outer.complete().writes).toEqual([outerRecord]);
    expect(inner.complete().writes).toEqual([]);
  });

  test("runIncrementalArtifactCycle uses the public session interface", async () => {
    let beginOptions: unknown;
    let retainedSlots: readonly number[] = [];
    const cycle: H.IncrementalArtifactCycle = {
      cycle: 7,
      renderExecutionContext: {},
      renderCount: 2,
      async run(callback) {
        return callback();
      },
      complete() {
        return {
          cycle: 7,
          renderCount: 2,
          writes: [],
        };
      },
    };
    const session: H.IncrementalArtifactSession = {
      cycle: 6,
      beginCycle(options) {
        beginOptions = options;
        return cycle;
      },
      snapshot() {
        return { cycle: 6, writes: [] };
      },
      inspectArtifacts() {
        return {
          retainedSlots() {
            return [];
          },
          graphNode() {
            return undefined;
          },
          projectionForSlot() {
            return undefined;
          },
          firstProjection() {
            return undefined;
          },
        };
      },
      retainArtifactSlots(slots) {
        retainedSlots = slots;
      },
    };

    await expect(
      H.runIncrementalArtifactCycle(
        session,
        { sourceInvalidation: { changedSourceIds: ["/project/src/deck.tsx"] } },
        async () => "ok",
      ),
    ).resolves.toBe("ok");

    expect(beginOptions).toEqual({
      sourceInvalidation: { changedSourceIds: ["/project/src/deck.tsx"] },
    });
    expect(retainedSlots).toEqual([0, 1]);
  });

  test("runIncrementalArtifactCycle completes the cycle before resolving", async () => {
    const session = H.createIncrementalArtifactSession();
    let token = H.getArtifactWriteToken(
      await new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).render(H.pptx()),
    );

    await H.runIncrementalArtifactCycle(session, {}, async () => {
      const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "Helper cycle" }, () => (
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>helper</p>
      ));
      token = H.getArtifactWriteToken(await deck.render(H.pptx()));
    });

    expect(() =>
      H.recordArtifactWrite(token, {
        path: "/project/output.pptx",
        result: { status: "created" },
      }),
    ).toThrow("Incremental artifact cycle 1 has already completed.");
  });

  test("runIncrementalArtifactCycle completes the cycle before rejecting", async () => {
    const session = H.createIncrementalArtifactSession();
    let token = H.getArtifactWriteToken(
      await new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).render(H.pptx()),
    );

    await expect(
      H.runIncrementalArtifactCycle(session, {}, async () => {
        const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
        deck.slide({ name: "Rejected helper cycle" }, () => (
          <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>helper reject</p>
        ));
        token = H.getArtifactWriteToken(await deck.render(H.pptx()));
        throw new Error("helper cycle failed");
      }),
    ).rejects.toThrow("helper cycle failed");

    expect(() =>
      H.recordArtifactWrite(token, {
        path: "/project/output.pptx",
        result: { status: "created" },
      }),
    ).toThrow("Incremental artifact cycle 1 has already completed.");
  });

  test("failed incremental artifact cycles do not commit draft render slot artifacts", async () => {
    const session = H.createIncrementalArtifactSession();

    await H.runIncrementalArtifactCycle(session, {}, async () => {
      const slot = H.claimIncrementalArtifactRenderSlot();
      slot?.artifacts.materializeSource({
        sourceKey: H.ROOT_SOURCE_ARTIFACT_KEY,
        source: { kind: "root" },
        rootCount: 1,
        rootPaths: ["success"],
        diagnostics: H.createDiagnostics(),
      });
    });
    session.retainArtifactSlots([0]);

    await expect(
      H.runIncrementalArtifactCycle(session, {}, async () => {
        const slot = H.claimIncrementalArtifactRenderSlot();
        slot?.artifacts.materializeSource({
          sourceKey: H.ROOT_SOURCE_ARTIFACT_KEY,
          source: { kind: "root" },
          rootCount: 99,
          rootPaths: ["failed"],
          diagnostics: H.createDiagnostics(),
        });
        throw new Error("cycle failed after mutating draft artifacts");
      }),
    ).rejects.toThrow("cycle failed after mutating draft artifacts");

    await H.runIncrementalArtifactCycle(session, {}, async () => {
      const slot = H.claimIncrementalArtifactRenderSlot();
      expect(slot?.artifacts.sourcesByKey.get(H.ROOT_SOURCE_ARTIFACT_KEY)?.rootCount).toBe(1);
      expect(slot?.artifacts.sourcesByKey.get(H.ROOT_SOURCE_ARTIFACT_KEY)?.rootPaths).toEqual([
        "success",
      ]);
    });
  });

  test("incremental artifact session reuses render slot artifacts across fresh Deck instances", async () => {
    const session = H.createIncrementalArtifactSession();
    async function renderCycle(title: string, changedSourceIds: readonly string[] = []) {
      let render = await new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } }).render(
        H.pptx(),
      );
      await H.runIncrementalArtifactCycle(
        session,
        changedSourceIds.length > 0 ? { sourceInvalidation: { changedSourceIds } } : {},
        async () => {
          const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
          deck.slide({ name: "Edited" }, () => (
            <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>{title}</p>
          ));
          deck.slide({ name: "Stable" }, () => (
            <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>stable</p>
          ));
          render = await deck.render(H.pptx({ inspection: "none" }));
        },
      );
      return render;
    }

    const first = await renderCycle("before");
    const second = await renderCycle("after", ["/project/src/deck.tsx"]);
    const firstXml = H.textDecoder.decode(
      H.unzipSync(first.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const secondXml = H.textDecoder.decode(
      H.unzipSync(second.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );

    expect(firstXml).toContain("before");
    expect(secondXml).toContain("after");
    expect(second.patchPlan?.sourceInvalidation).toEqual({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    expect(second.patchPlan?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ buildStatus: "reused" })]),
    );
  });
});

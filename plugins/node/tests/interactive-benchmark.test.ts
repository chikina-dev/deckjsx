import { describe, expect, test } from "vite-plus/test";
import { runInteractiveDevBenchmark } from "../../../scripts/benchmark-interactive-dev.mjs";

describe("@deckjsx/node interactive benchmark", () => {
  test("measures a real interactive dev run", async () => {
    const result = await runInteractiveDevBenchmark({ iterations: 1 });

    expect(result).toEqual({
      fixture: "interactive-minimal",
      iterations: 1,
      metrics: expect.arrayContaining([
        expect.objectContaining({ name: "coldInteractiveDevMs", unit: "ms" }),
        expect.objectContaining({ name: "projectionCommandMs", unit: "ms" }),
      ]),
      runs: [
        expect.objectContaining({
          ok: true,
          outputBytes: expect.any(Number),
          projectionSlideCount: 1,
        }),
      ],
    });
  });
});

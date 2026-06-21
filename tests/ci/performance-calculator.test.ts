import { describe, expect, test } from "vite-plus/test";
import { metricSummary, summarizeMetricRuns } from "../../scripts/performance-calculator.tsx";

describe("performance calculator", () => {
  test("summarizes metric samples with average, min, max, and p95", () => {
    expect(metricSummary("renderMs", [10, 30, 20, 40])).toEqual({
      averageMs: 25,
      maxMs: 40,
      minMs: 10,
      name: "renderMs",
      p95Ms: 40,
      samples: [10, 30, 20, 40],
    });
  });

  test("groups repeated runs by metric name", () => {
    expect(
      summarizeMetricRuns([
        { name: "compileMs", valueMs: 2 },
        { name: "renderMs", valueMs: 10 },
        { name: "compileMs", valueMs: 4 },
      ]),
    ).toEqual([
      {
        averageMs: 3,
        maxMs: 4,
        minMs: 2,
        name: "compileMs",
        p95Ms: 4,
        samples: [2, 4],
      },
      {
        averageMs: 10,
        maxMs: 10,
        minMs: 10,
        name: "renderMs",
        p95Ms: 10,
        samples: [10],
      },
    ]);
  });
});

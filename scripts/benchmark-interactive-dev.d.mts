export type InteractiveDevBenchmarkMetric = {
  readonly name: string;
  readonly unit: "bytes" | "count" | "ms";
  readonly value: number;
};

export type InteractiveDevBenchmarkRun = {
  readonly ok: boolean;
  readonly coldInteractiveDevMs: number;
  readonly projectionCommandMs?: number;
  readonly outputBytes: number;
  readonly projectionSlideCount: number;
};

export type InteractiveDevBenchmarkResult = {
  readonly fixture: "interactive-minimal";
  readonly iterations: number;
  readonly metrics: readonly InteractiveDevBenchmarkMetric[];
  readonly runs: readonly InteractiveDevBenchmarkRun[];
};

export function runInteractiveDevBenchmark(options?: {
  readonly iterations?: number;
}): Promise<InteractiveDevBenchmarkResult>;

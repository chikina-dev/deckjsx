import type { RenderExecutionContext } from "./render-execution";
import type { RenderResult } from "./pipeline-runner";
import { PipelineArtifactCollection } from "./pipeline-artifacts";
import type { SourceInvalidation } from "./plugin";

const ARTIFACT_WRITE_TOKEN = Symbol.for("deckjsx.artifactWriteToken");
declare const ARTIFACT_WRITE_TOKEN_BRAND: unique symbol;

export type ArtifactWriteToken = {
  readonly [ARTIFACT_WRITE_TOKEN_BRAND]: never;
};

type ArtifactWriteTokenValue = ArtifactWriteToken & {
  readonly session: IncrementalArtifactSessionImpl;
  readonly cycle: number;
  readonly slot: number;
};

type RenderResultWithWriteToken = RenderResult & {
  readonly [ARTIFACT_WRITE_TOKEN]?: ArtifactWriteToken;
};

export type ArtifactWriteRecord<TWriteResult extends object = object> = {
  readonly path: string;
  readonly result: TWriteResult;
};

export type IncrementalArtifactWriteRecord<TWriteResult extends object = object> =
  ArtifactWriteRecord<TWriteResult> & {
    readonly cycle: number;
    readonly slot: number;
  };

export type IncrementalArtifactSessionSnapshot = {
  readonly cycle: number;
  readonly writes: readonly IncrementalArtifactWriteRecord[];
};

export type IncrementalArtifactCycleOptions = {
  readonly sourceInvalidation?: SourceInvalidation;
};

export type IncrementalArtifactCycleResult = {
  readonly cycle: number;
  readonly renderCount: number;
  readonly writes: readonly IncrementalArtifactWriteRecord[];
};

type IncrementalArtifactRenderSlot = {
  readonly cycle: number;
  readonly slot: number;
  readonly artifacts: PipelineArtifactCollection;
  readonly renderExecutionContext: RenderExecutionContext;
  readonly token: ArtifactWriteToken;
};

type IncrementalArtifactCycleState = {
  readonly session: IncrementalArtifactSessionImpl;
  readonly cycle: number;
  readonly renderExecutionContext: RenderExecutionContext;
  readonly slotArtifacts: Map<number, PipelineArtifactCollection>;
  renderCount: number;
  running: boolean;
  completed: boolean;
  readonly writes: IncrementalArtifactWriteRecord[];
};

const activeCycles: IncrementalArtifactCycleState[] = [];

export type IncrementalArtifactSession = {
  readonly cycle: number;
  beginCycle(options?: IncrementalArtifactCycleOptions): IncrementalArtifactCycle;
  snapshot(): IncrementalArtifactSessionSnapshot;
  retainArtifactSlots(slots: readonly number[]): void;
};

export type IncrementalArtifactCycle = {
  readonly cycle: number;
  readonly renderExecutionContext: RenderExecutionContext;
  readonly renderCount: number;
  run<T>(callback: () => T | Promise<T>): Promise<T>;
  complete(): IncrementalArtifactCycleResult;
};

class IncrementalArtifactSessionImpl {
  #cycle = 0;
  #slots = new Map<number, PipelineArtifactCollection>();
  #writes: IncrementalArtifactWriteRecord[] = [];
  #completedCycles = new Set<number>();
  #completedCycleSlots = new Map<number, Map<number, PipelineArtifactCollection>>();
  #latestCompletedCycle: number | undefined;

  get cycle(): number {
    return this.#cycle;
  }

  beginCycle(options: IncrementalArtifactCycleOptions = {}): IncrementalArtifactCycle {
    this.#cycle += 1;
    return new IncrementalArtifactCycleImpl({
      session: this,
      cycle: this.#cycle,
      renderExecutionContext: options.sourceInvalidation
        ? { sourceInvalidation: options.sourceInvalidation }
        : {},
    });
  }

  snapshot(): IncrementalArtifactSessionSnapshot {
    return {
      cycle: this.#cycle,
      writes: this.#writes,
    };
  }

  slotArtifactsForCycle(
    cycle: IncrementalArtifactCycleState,
    slot: number,
  ): PipelineArtifactCollection {
    const current = cycle.slotArtifacts.get(slot);
    if (current) {
      return current;
    }

    const artifacts = this.#slots.get(slot)?.clone() ?? new PipelineArtifactCollection();
    cycle.slotArtifacts.set(slot, artifacts);
    return artifacts;
  }

  retainArtifactSlots(slots: readonly number[]): void {
    const retained = new Set(slots);
    const completedSlots =
      this.#latestCompletedCycle !== undefined
        ? this.#completedCycleSlots.get(this.#latestCompletedCycle)
        : undefined;
    const nextSlots = new Map<number, PipelineArtifactCollection>();
    for (const slot of retained) {
      const artifacts = completedSlots?.get(slot) ?? this.#slots.get(slot);
      if (artifacts) {
        nextSlots.set(slot, artifacts);
      }
    }
    this.#slots = nextSlots;
    if (this.#latestCompletedCycle !== undefined) {
      this.#completedCycleSlots.delete(this.#latestCompletedCycle);
    }
  }

  recordWrite<TWriteResult extends object>(
    token: ArtifactWriteTokenValue,
    record: ArtifactWriteRecord<TWriteResult>,
  ): IncrementalArtifactWriteRecord<TWriteResult> {
    if (this.#completedCycles.has(token.cycle)) {
      throw new Error(`Incremental artifact cycle ${token.cycle} has already completed.`);
    }
    const active = activeCycles.at(-1);
    if (active?.session !== this || active.cycle !== token.cycle) {
      throw new Error(
        `Incremental artifact cycle ${token.cycle} is not the active artifact write cycle.`,
      );
    }
    const write = {
      cycle: token.cycle,
      slot: token.slot,
      path: record.path,
      result: record.result,
    };
    this.#writes = [...this.#writes, write];
    active.writes.push(write);
    return write;
  }

  completeCycle(
    cycle: number,
    slotArtifacts: ReadonlyMap<number, PipelineArtifactCollection>,
  ): void {
    this.#completedCycles.add(cycle);
    this.#completedCycleSlots.clear();
    this.#completedCycleSlots.set(cycle, new Map(slotArtifacts));
    this.#latestCompletedCycle = cycle;
  }
}

class IncrementalArtifactCycleImpl {
  readonly #state: IncrementalArtifactCycleState;

  constructor(input: {
    readonly session: IncrementalArtifactSessionImpl;
    readonly cycle: number;
    readonly renderExecutionContext: RenderExecutionContext;
  }) {
    this.#state = {
      session: input.session,
      cycle: input.cycle,
      renderExecutionContext: input.renderExecutionContext,
      slotArtifacts: new Map(),
      renderCount: 0,
      running: false,
      completed: false,
      writes: [],
    };
  }

  get cycle(): number {
    return this.#state.cycle;
  }

  get renderExecutionContext(): RenderExecutionContext {
    return this.#state.renderExecutionContext;
  }

  get renderCount(): number {
    return this.#state.renderCount;
  }

  async run<T>(callback: () => T | Promise<T>): Promise<T> {
    if (this.#state.completed) {
      throw new Error(`Incremental artifact cycle ${this.#state.cycle} has already completed.`);
    }
    activeCycles.push(this.#state);
    this.#state.running = true;
    try {
      return await callback();
    } finally {
      this.#state.running = false;
      activeCycles.pop();
    }
  }

  complete(): IncrementalArtifactCycleResult {
    if (this.#state.running) {
      throw new Error(
        `Incremental artifact cycle ${this.#state.cycle} cannot complete while it is still running.`,
      );
    }
    if (this.#state.completed) {
      throw new Error(`Incremental artifact cycle ${this.#state.cycle} has already completed.`);
    }
    this.#state.completed = true;
    this.#state.session.completeCycle(this.#state.cycle, this.#state.slotArtifacts);
    return {
      cycle: this.#state.cycle,
      renderCount: this.#state.renderCount,
      writes: this.#state.writes,
    };
  }
}

export function createIncrementalArtifactSession(): IncrementalArtifactSession {
  return new IncrementalArtifactSessionImpl();
}

export async function runIncrementalArtifactCycle<T>(
  session: IncrementalArtifactSession,
  options: IncrementalArtifactCycleOptions,
  callback: () => T | Promise<T>,
): Promise<T> {
  const cycle = (session as IncrementalArtifactSessionImpl).beginCycle(options);
  let completed = false;
  try {
    const result = await cycle.run(callback);
    const cycleResult = cycle.complete();
    completed = true;
    session.retainArtifactSlots(
      Array.from({ length: cycleResult.renderCount }, (_, index) => index),
    );
    return result;
  } catch (error) {
    if (!completed) {
      cycle.complete();
    }
    throw error;
  }
}

export function claimIncrementalArtifactRenderSlot(): IncrementalArtifactRenderSlot | undefined {
  const active = activeCycles.at(-1);
  if (!active) {
    return undefined;
  }

  const slot = active.renderCount;
  active.renderCount += 1;
  const token = {
    session: active.session,
    cycle: active.cycle,
    slot,
  } as ArtifactWriteTokenValue;

  return {
    cycle: active.cycle,
    slot,
    artifacts: active.session.slotArtifactsForCycle(active, slot),
    renderExecutionContext: active.renderExecutionContext,
    token,
  };
}

export function attachArtifactWriteToken<T extends RenderResult>(
  render: T,
  token: ArtifactWriteToken | undefined,
): T {
  if (!token) {
    return render;
  }

  Object.defineProperty(render, ARTIFACT_WRITE_TOKEN, {
    configurable: true,
    enumerable: false,
    value: token,
    writable: false,
  });
  return render;
}

export function getArtifactWriteToken(render: RenderResult): ArtifactWriteToken | undefined {
  return (render as RenderResultWithWriteToken)[ARTIFACT_WRITE_TOKEN];
}

export function recordArtifactWrite<TWriteResult extends object>(
  token: ArtifactWriteToken | undefined,
  record: ArtifactWriteRecord<TWriteResult>,
): IncrementalArtifactWriteRecord<TWriteResult> | undefined {
  const value = token as ArtifactWriteTokenValue | undefined;
  if (!value) {
    return undefined;
  }
  return value.session.recordWrite(value, record);
}

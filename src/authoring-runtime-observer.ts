import type { ComponentFrame } from "./authoring-metadata";
import type { JsxKey, SourceSpan } from "./authoring/tree";

export const AUTHORING_RUNTIME_OBSERVERS = Symbol.for("deckjsx.authoringRuntimeObservers");

export type AuthoringComponentInvocation = {
  readonly name: string;
  readonly key?: JsxKey;
  readonly sourceSpan?: SourceSpan;
  readonly stack: readonly ComponentFrame[];
  readonly props: unknown;
};

export type AuthoringRuntimeObserver = {
  componentInvoked?(invocation: AuthoringComponentInvocation): void;
};

export type AuthoringRuntimeObserverCarrier = {
  readonly [AUTHORING_RUNTIME_OBSERVERS]?: readonly AuthoringRuntimeObserver[];
};

let activeObservers: readonly AuthoringRuntimeObserver[] = [];

export function authoringRuntimeObserversFrom(
  value: unknown,
): readonly AuthoringRuntimeObserver[] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const observers = (value as AuthoringRuntimeObserverCarrier)[AUTHORING_RUNTIME_OBSERVERS];
  return observers && observers.length > 0 ? observers : undefined;
}

export function withAuthoringRuntimeObservers<T>(
  observers: readonly AuthoringRuntimeObserver[] | undefined,
  callback: () => T,
): T {
  if (!observers || observers.length === 0) {
    return callback();
  }
  const previous = activeObservers;
  activeObservers = [...previous, ...observers];
  try {
    return callback();
  } finally {
    activeObservers = previous;
  }
}

export function observeAuthoringComponentInvocation(
  invocation: AuthoringComponentInvocation,
): void {
  for (const observer of activeObservers) {
    observer.componentInvoked?.(invocation);
  }
}

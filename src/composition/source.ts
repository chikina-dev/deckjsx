import type { StyleSheetValue } from "../style/stylesheet/public";
import type { SlideTemplateSet } from "../templates";
import type { SourceContextInput, SourceContextValue } from "./public";

export const COMPOSITION_SOURCE = Symbol("deckjsx.compositionSource");

export type SourceContextBinding<TSourceContext = void> =
  | { readonly present: false }
  | { readonly present: true; readonly value: TSourceContext };

export type CompositionEntry<
  TSourceContext extends SourceContextValue | void = void,
  _TTemplates extends SlideTemplateSet = SlideTemplateSet,
> =
  | {
      readonly kind: "slide";
      readonly options?: unknown;
      readonly factory: unknown;
    }
  | {
      readonly kind: "mount";
      readonly sourceKey: unknown;
      readonly source: unknown;
      readonly contextProvider?: SourceContextInput<TSourceContext, SourceContextValue>;
      readonly invalidExtraContext?: boolean;
    };

export type CompositionSourceInternals<
  TSourceContext extends SourceContextValue | void = void,
  TTemplates extends SlideTemplateSet = SlideTemplateSet,
> = {
  readonly entries: readonly CompositionEntry<TSourceContext, TTemplates>[];
  readonly stylesheets: readonly StyleSheetValue[];
  readonly plugins: readonly unknown[];
  readonly theme?: unknown;
  readonly templates?: unknown;
  readonly cycleId: object;
  readonly revision?: number;
  readonly boundContext: SourceContextBinding<TSourceContext>;
};

export type CompositionSource<
  TSourceContext extends SourceContextValue | void = void,
  TTemplates extends SlideTemplateSet = SlideTemplateSet,
> = {
  readonly [COMPOSITION_SOURCE]: () => CompositionSourceInternals<TSourceContext, TTemplates>;
};

type AnyCompositionSource = CompositionSource<any, any>;

function isCompositionSource(value: unknown): value is AnyCompositionSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly [COMPOSITION_SOURCE]?: unknown })[COMPOSITION_SOURCE] === "function"
  );
}

/**
 * Revision fingerprint for a composed source tree.
 *
 * A root Deck may cache compiled graph artifacts, but mounted child Decks can change without
 * calling back into the parent instance. This fingerprint lets the parent detect child source
 * changes before reusing a cached graph.
 */
export function compositionRevisionForSource(
  source: AnyCompositionSource,
  stack = new WeakSet<object>(),
): string {
  const state = source[COMPOSITION_SOURCE]();
  const cycleObject = state.cycleId;
  if (stack.has(cycleObject)) {
    return JSON.stringify(["cycle"]);
  }

  stack.add(cycleObject);
  const entries = state.entries.map((entry) => {
    if (entry.kind === "slide") {
      return ["slide"];
    }

    return [
      "mount",
      entry.sourceKey,
      isCompositionSource(entry.source)
        ? compositionRevisionForSource(entry.source, stack)
        : "invalid-source",
    ];
  });
  stack.delete(cycleObject);

  return JSON.stringify(["source", state.revision ?? 0, entries]);
}

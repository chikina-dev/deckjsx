import { isLegacyAuthorNode } from "../authoring/legacy";
import { isAuthorTreeNode, type AuthorElementNode, type AuthorTreeNode } from "../authoring/tree";
import { createDiagnostics, diagnostic, type Diagnostic } from "../diagnostics";
import type { SourceOrigin } from "../graph/types";
import {
  sourceIdentity,
  COMPOSITION_SOURCE,
  type ComposedAuthorRoot,
  type CompositionEntry,
  type CompositionInspectResult,
  type CompositionSource,
  type SourceContextBinding,
  type SourceSlotOrigin,
} from "./types";

const MAX_COMPOSITION_DEPTH = 64;
const ROOT_SOURCE: SourceOrigin = { kind: "root" };

type SourcePlan = {
  readonly source: SourceOrigin;
  readonly sourceIdentityMaterial: readonly string[];
  readonly context: SourceContextBinding<unknown>;
  readonly entries: readonly PlanEntry[];
  readonly slideCount: number;
  readonly slotOrigins: WeakMap<AuthorTreeNode, SourceSlotOrigin>;
};

type PlanEntry =
  | {
      readonly kind: "slide";
      readonly factory: (input: unknown) => unknown;
      readonly path: string;
    }
  | {
      readonly kind: "source";
      readonly source: SourcePlan;
    };

type ResolveContext = {
  readonly diagnostics: Diagnostic[];
  readonly stack: readonly object[];
  readonly depth: number;
  readonly source: SourceOrigin;
  readonly sourceIdentityMaterial: readonly string[];
  readonly sourcePath: string;
  readonly context: SourceContextBinding<unknown>;
  readonly slotOwnerSource: SourceOrigin;
  readonly slotOwnerMaterial: readonly string[];
};

function addDiagnostic(context: ResolveContext, item: Diagnostic): void {
  context.diagnostics.push(item);
}

function compositionDiagnostic(input: {
  code: string;
  title: string;
  path: string;
  message: string;
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: input.code,
    title: input.title,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    ...(input.help ? { help: input.help } : {}),
  });
}

function sourcePathFor(parentPath: string, sourceKey: string): string {
  return parentPath === "root" ? sourceKey : `${parentPath}/${sourceKey}`;
}

function sourceOriginFor(parent: SourceOrigin, sourceKey: string): SourceOrigin {
  const parentPath = parent.kind === "root" ? "" : `${parent.sourceIdentity}/`;
  return {
    kind: "mounted",
    sourceKey,
    sourceIdentity: sourceIdentity(`${parentPath}${sourceKey}`),
  };
}

function sourceMaterialFor(source: SourceOrigin): readonly string[] {
  return source.kind === "root" ? ["source", "root"] : ["source", source.sourceIdentity];
}

function validateSourceKey(sourceKey: string): string | undefined {
  if (sourceKey.trim().length === 0) {
    return "Source Key must not be empty.";
  }

  if (sourceKey === "." || sourceKey === "..") {
    return "Source Key must not be dot or dot-dot.";
  }

  if (sourceKey.includes("/")) {
    return "Source Key must not contain /.";
  }

  return undefined;
}

function describeInvalidRoot(value: unknown): string {
  if (isLegacyAuthorNode(value)) {
    return "Slide factory returned a legacy author node.";
  }

  if (isAuthorTreeNode(value)) {
    return "Slide factory returned an author tree node that is not a <Slide /> root.";
  }

  if (value === null) {
    return "Slide factory returned null.";
  }

  return `Slide factory returned ${typeof value}.`;
}

function isSlideRoot(value: AuthorTreeNode): value is AuthorElementNode {
  return (
    value.kind === "element" &&
    value.source.kind === "component" &&
    value.source.component === "Slide"
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function mapSlotOrigins(
  value: unknown,
  origin: SourceSlotOrigin,
  targets: WeakMap<AuthorTreeNode, SourceSlotOrigin>,
  seen: WeakSet<object>,
): void {
  if (isAuthorTreeNode(value)) {
    targets.set(value, origin);
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);
  value.forEach((item) => mapSlotOrigins(item, origin, targets, seen));
}

function collectSourceSlots(
  context: SourceContextBinding<unknown>,
  parent: ResolveContext,
): WeakMap<AuthorTreeNode, SourceSlotOrigin> {
  const origins = new WeakMap<AuthorTreeNode, SourceSlotOrigin>();

  if (!context.present || typeof context.value !== "object" || context.value === null) {
    return origins;
  }

  Object.entries(context.value).forEach(([field, value]) => {
    mapSlotOrigins(
      value,
      {
        source: parent.slotOwnerSource,
        field,
        identityMaterial: [...parent.slotOwnerMaterial, `slot:${field}`],
      },
      origins,
      new WeakSet(),
    );
  });

  return origins;
}

function childContextFor(
  entry: Extract<CompositionEntry<unknown>, { kind: "mount" }>,
  context: ResolveContext,
  path: string,
): SourceContextBinding<unknown> | undefined {
  if (entry.invalidExtraContext) {
    addDiagnostic(
      context,
      compositionDiagnostic({
        code: "E_COMPOSITION_INVALID_MOUNT",
        title: "mount received invalid source context",
        path,
        message: "A Bound Source cannot receive additional Source Context.",
      }),
    );
    return undefined;
  }

  if (entry.contextProvider === undefined) {
    return { present: false };
  }

  if (typeof entry.contextProvider !== "function") {
    return { present: true, value: entry.contextProvider };
  }

  try {
    const value = context.context.present
      ? entry.contextProvider(context.context.value)
      : (entry.contextProvider as () => unknown)();

    if (isPromiseLike(value)) {
      addDiagnostic(
        context,
        compositionDiagnostic({
          code: "E_COMPOSITION_CONTEXT_MAPPER_ASYNC",
          title: "source context mapper returned a Promise",
          path,
          message: "Source Context Mappers must be synchronous in v0.3.",
        }),
      );
      return undefined;
    }

    return { present: true, value };
  } catch (error) {
    addDiagnostic(
      context,
      compositionDiagnostic({
        code: "E_COMPOSITION_CONTEXT_MAPPER_FAILED",
        title: "source context mapper failed",
        path,
        message: error instanceof Error ? error.message : "Source Context Mapper threw.",
      }),
    );
    return undefined;
  }
}

function resolveSource(
  source: CompositionSource<unknown>,
  context: ResolveContext,
): SourcePlan | undefined {
  const sourceState = source[COMPOSITION_SOURCE]();
  const effectiveContext = context.context.present ? context.context : sourceState.boundContext;

  if (context.depth > MAX_COMPOSITION_DEPTH) {
    addDiagnostic(
      context,
      compositionDiagnostic({
        code: "E_COMPOSITION_DEPTH_EXCEEDED",
        title: "composition depth exceeded",
        path: context.sourcePath,
        message: `Composition depth exceeded ${MAX_COMPOSITION_DEPTH}.`,
      }),
    );
    return undefined;
  }

  const cycleAt = context.stack.indexOf(sourceState.cycleId);
  if (cycleAt !== -1) {
    addDiagnostic(
      context,
      compositionDiagnostic({
        code: "E_COMPOSITION_CYCLE",
        title: "composition cycle detected",
        path: context.sourcePath,
        message: "A Deck cannot mount itself through its descendant sources.",
      }),
    );
    return undefined;
  }

  const entries: PlanEntry[] = [];
  let slideCount = 0;
  const sourceKeys = new Set<string>();
  const slotOrigins = collectSourceSlots(effectiveContext, context);

  const nextContextBase = {
    diagnostics: context.diagnostics,
    stack: [...context.stack, sourceState.cycleId],
    depth: context.depth + 1,
  };

  sourceState.entries.forEach((entry, index) => {
    if (entry.kind === "slide") {
      entries.push({
        kind: "slide",
        factory: entry.factory as (input: unknown) => unknown,
        path: `${context.sourcePath} > slideFactory[${index}]`,
      });
      slideCount += 1;
      return;
    }

    const mountPath = `${context.sourcePath} > mount[${entry.sourceKey}]`;
    const invalidKey = validateSourceKey(entry.sourceKey);
    if (invalidKey) {
      addDiagnostic(
        context,
        compositionDiagnostic({
          code: "E_COMPOSITION_INVALID_SOURCE_KEY",
          title: "invalid source key",
          path: mountPath,
          message: invalidKey,
        }),
      );
      return;
    }

    if (sourceKeys.has(entry.sourceKey)) {
      addDiagnostic(
        context,
        compositionDiagnostic({
          code: "E_COMPOSITION_DUPLICATE_SOURCE_KEY",
          title: "duplicate source key",
          path: mountPath,
          message: `Source Key "${entry.sourceKey}" is already used in this parent source.`,
        }),
      );
      return;
    }

    sourceKeys.add(entry.sourceKey);
    const childContext = childContextFor(entry, context, mountPath);
    if (!childContext) {
      return;
    }

    const childSource = sourceOriginFor(context.source, entry.sourceKey);
    const childPlan = resolveSource(entry.source, {
      ...nextContextBase,
      source: childSource,
      sourceIdentityMaterial: sourceMaterialFor(childSource),
      sourcePath: sourcePathFor(context.sourcePath, entry.sourceKey),
      context: childContext,
      slotOwnerSource: context.source,
      slotOwnerMaterial: context.sourceIdentityMaterial,
    });

    if (!childPlan) {
      return;
    }

    entries.push({ kind: "source", source: childPlan });
    slideCount += childPlan.slideCount;
  });

  return {
    source: context.source,
    sourceIdentityMaterial: context.sourceIdentityMaterial,
    context: effectiveContext,
    entries,
    slideCount,
    slotOrigins,
  };
}

function flattenPlan(
  plan: SourcePlan,
  deckTotalSlides: number,
  deckSlideIndex: number,
  roots: ComposedAuthorRoot[],
  diagnostics: Diagnostic[],
): number {
  let sourceSlideIndex = 0;
  let nextDeckSlideIndex = deckSlideIndex;

  for (const entry of plan.entries) {
    if (entry.kind === "source") {
      nextDeckSlideIndex = flattenPlan(
        entry.source,
        deckTotalSlides,
        nextDeckSlideIndex,
        roots,
        diagnostics,
      );
      sourceSlideIndex += entry.source.slideCount;
      continue;
    }

    const composition = {
      ...(plan.source.kind === "mounted" ? { sourceKey: plan.source.sourceKey } : {}),
      slideIndex: sourceSlideIndex,
      totalSlides: plan.slideCount,
      deckSlideIndex: nextDeckSlideIndex,
      deckTotalSlides,
    };
    const input = plan.context.present
      ? { context: plan.context.value, composition }
      : { composition };
    const root = entry.factory(input);

    if (!isAuthorTreeNode(root) || !isSlideRoot(root)) {
      diagnostics.push(
        compositionDiagnostic({
          code: "E_COMPOSITION_INVALID_ROOT",
          title: "slide factory must return a <Slide /> root",
          path: entry.path,
          message: describeInvalidRoot(root),
          help: ["Return <Slide>...</Slide> from the slide factory passed to deck.add()."],
        }),
      );
    } else {
      roots.push({
        root,
        source: plan.source,
        sourceIdentityMaterial: plan.sourceIdentityMaterial,
        path: entry.path,
        composition,
        slotOrigins: plan.slotOrigins,
      });
    }

    sourceSlideIndex += 1;
    nextDeckSlideIndex += 1;
  }

  return nextDeckSlideIndex;
}

export function resolveComposition(source: CompositionSource<any>): CompositionInspectResult {
  const diagnostics: Diagnostic[] = [];
  const rootPlan = resolveSource(source, {
    diagnostics,
    stack: [],
    depth: 0,
    source: ROOT_SOURCE,
    sourceIdentityMaterial: sourceMaterialFor(ROOT_SOURCE),
    sourcePath: "root",
    context: { present: false },
    slotOwnerSource: ROOT_SOURCE,
    slotOwnerMaterial: sourceMaterialFor(ROOT_SOURCE),
  });

  if (!rootPlan) {
    return { diagnostics: createDiagnostics(diagnostics) };
  }

  const roots: ComposedAuthorRoot[] = [];
  flattenPlan(rootPlan, rootPlan.slideCount, 0, roots, diagnostics);
  const resolvedDiagnostics = createDiagnostics(diagnostics);

  return {
    ...(resolvedDiagnostics.hasErrors ? {} : { roots }),
    diagnostics: resolvedDiagnostics,
  };
}

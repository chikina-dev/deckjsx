import { isAuthorNodeValue } from "../authoring/author-node";
import type { JsxNode } from "../authoring/index";
import {
  createAuthorElement,
  authorElementPropsFromEntries,
  isAuthorTreeChild,
  isAuthorTreeNode,
  type AuthorElementProps,
  type AuthorTreeNode,
} from "../authoring/tree";
import { createDiagnostics, diagnostic, type Diagnostic } from "../diagnostics";
import type { SourceOrigin } from "../graph/types";
import type { StyleSheet } from "../style/stylesheet";
import type { Theme } from "../style/theme";
import {
  createTemplateHandle,
  validateSlideTemplates,
  type SlideTemplateSet,
  type TemplateHandle,
  type TemplateName,
} from "../templates";
import {
  sourceIdentity,
  COMPOSITION_SOURCE,
  type ComposedAuthorRoot,
  type CompositionEntry,
  type CompositionInspectResult,
  type CompositionSource,
  type SlideFactoryInput,
  type SourceContextValue,
  type SlideOptions,
  type SourceContextBinding,
  type SourceSlotOrigin,
} from "./types";

const MAX_COMPOSITION_DEPTH = 64;
const ROOT_SOURCE: SourceOrigin = { kind: "root" };

type SourcePlan = {
  readonly source: SourceOrigin;
  readonly sourceIdentityMaterial: readonly string[];
  readonly stylesheets: readonly StyleSheet[];
  readonly theme?: Theme;
  readonly templates?: SlideTemplateSet;
  readonly context: SourceContextBinding<SourceContextValue | void>;
  readonly entries: readonly PlanEntry[];
  readonly slideCount: number;
  readonly slotOrigins: WeakMap<AuthorTreeNode, SourceSlotOrigin>;
};

type PlannedSlideFactoryInput =
  | (SlideFactoryInput<void> & { readonly template?: TemplateHandle<SlideTemplateSet, string> })
  | (SlideFactoryInput<SourceContextValue> & {
      readonly template?: TemplateHandle<SlideTemplateSet, string>;
    });

type PlannedSlideFactory = {
  bivarianceHack(input: PlannedSlideFactoryInput): JsxNode;
}["bivarianceHack"];

type PlanEntry =
  | {
      readonly kind: "slide";
      readonly factory: PlannedSlideFactory;
      readonly options?: SlideOptions<SlideTemplateSet, string>;
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
  readonly context: SourceContextBinding<SourceContextValue | void>;
  readonly activeTheme?: Theme;
  readonly slotOwnerSource: SourceOrigin;
  readonly slotOwnerMaterial: readonly string[];
};

function addDiagnostic(context: ResolveContext, item: Diagnostic): void {
  context.diagnostics.push(item);
}

function propsRecordForSlideOptions(
  options: SlideOptions<SlideTemplateSet, string> | undefined,
): AuthorElementProps {
  return options === undefined ? {} : authorElementPropsFromEntries(Object.entries(options));
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
  if (isAuthorNodeValue(value)) {
    return "Slide factory returned an AuthorNode value instead of an Author Tree node.";
  }

  if (isAuthorTreeNode(value)) {
    return "Slide factory returned an Author Tree node that cannot be used as slide content.";
  }

  if (value === null) {
    return "Slide factory returned null.";
  }

  return `Slide factory returned ${typeof value}.`;
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
  context: SourceContextBinding<SourceContextValue | void>,
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

function childContextFor<TParentContext extends SourceContextValue | void>(
  entry: Extract<CompositionEntry<TParentContext, SlideTemplateSet>, { kind: "mount" }>,
  context: ResolveContext,
  path: string,
): SourceContextBinding<SourceContextValue | void> | undefined {
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
      ? (
          entry.contextProvider as (context: SourceContextValue | void) => SourceContextValue | void
        )(context.context.value)
      : (entry.contextProvider as () => SourceContextValue | void)();

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

function resolveSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  context: ResolveContext,
): SourcePlan | undefined {
  const sourceState = source[COMPOSITION_SOURCE]();
  const effectiveContext = context.context.present ? context.context : sourceState.boundContext;
  const activeTheme =
    context.activeTheme && sourceState.theme
      ? context.activeTheme.extend(sourceState.theme)
      : (sourceState.theme ?? context.activeTheme);

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
  validateSlideTemplates(sourceState.templates, `${context.sourcePath} > templates`).forEach(
    (item) => addDiagnostic(context, item),
  );

  const nextContextBase = {
    diagnostics: context.diagnostics,
    stack: [...context.stack, sourceState.cycleId],
    depth: context.depth + 1,
  };

  sourceState.entries.forEach((entry, index) => {
    if (entry.kind === "slide") {
      entries.push({
        kind: "slide",
        factory: entry.factory,
        ...(entry.options ? { options: entry.options } : {}),
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
      activeTheme,
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
    stylesheets: sourceState.stylesheets,
    ...(activeTheme ? { theme: activeTheme } : {}),
    ...(sourceState.templates ? { templates: sourceState.templates } : {}),
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
    const slideTemplate = entry.options?.template;
    const factoryInput =
      typeof slideTemplate === "string" && plan.templates
        ? {
            ...input,
            template: createTemplateHandle(
              plan.templates,
              slideTemplate as TemplateName<typeof plan.templates>,
            ),
          }
        : input;
    const content = entry.factory(factoryInput);
    const root = isAuthorTreeChild(content)
      ? createAuthorElement({
          source: { kind: "slide" },
          props: propsRecordForSlideOptions(entry.options),
          children: [content],
        })
      : content;

    if (!isAuthorTreeNode(root) || root.kind !== "element") {
      diagnostics.push(
        compositionDiagnostic({
          code: "E_COMPOSITION_INVALID_ROOT",
          title: "slide factory must return slide content",
          path: entry.path,
          message: describeInvalidRoot(root),
          help: ["Return JSX content from the factory passed to deck.slide()."],
        }),
      );
    } else {
      roots.push({
        root,
        source: plan.source,
        sourceIdentityMaterial: plan.sourceIdentityMaterial,
        stylesheets: plan.stylesheets,
        ...(plan.theme ? { theme: plan.theme } : {}),
        ...(plan.templates ? { templates: plan.templates } : {}),
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

export function resolveComposition<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(source: CompositionSource<TSourceContext, TTemplates>): CompositionInspectResult {
  const diagnostics: Diagnostic[] = [];
  const rootPlan = resolveSource(source, {
    diagnostics,
    stack: [],
    depth: 0,
    source: ROOT_SOURCE,
    sourceIdentityMaterial: sourceMaterialFor(ROOT_SOURCE),
    sourcePath: "root",
    context: { present: false },
    activeTheme: undefined,
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

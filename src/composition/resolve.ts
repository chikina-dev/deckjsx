import type { JsxNode } from "../authoring/jsx-types";
import {
  authorElementPropsFromSlideOptions,
  isAuthoringOptionsRecord,
  slideTemplateOptionValue,
} from "../authoring/contract";
import {
  createAuthorElement,
  isAuthorElementPropValue,
  isAuthorTreeChild,
  isAuthorTreeNode,
  type AuthorTreeNode,
} from "../authoring/tree";
import { createDiagnostics, diagnostic, type Diagnostic } from "../diagnostics";
import type { SourceOrigin } from "../graph/types";
import type { StyleSheetValue } from "../style/stylesheet/public";
import { isTheme } from "../style/theme/runtime";
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
  type SourceContextBinding,
  type SourceSlotOrigin,
} from "./types";

const MAX_COMPOSITION_DEPTH = 64;
const ROOT_SOURCE: SourceOrigin = { kind: "root" };

type SourcePlan = {
  readonly source: SourceOrigin;
  readonly sourceIdentityMaterial: readonly string[];
  readonly stylesheets: readonly StyleSheetValue[];
  readonly theme?: unknown;
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
      readonly factory: unknown;
      readonly options?: unknown;
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
  readonly activeTheme?: unknown;
  readonly slotOwnerSource: SourceOrigin;
  readonly slotOwnerMaterial: readonly string[];
};

// Internal resolver boundary: public source generics are checked when authors build a source.
// Planning only needs the common source shape, and erasing here keeps style/template unions finite.
type ResolvableCompositionSource = CompositionSource<any, any>;

function isCompositionSource(value: unknown): value is ResolvableCompositionSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly [COMPOSITION_SOURCE]?: unknown })[COMPOSITION_SOURCE] === "function"
  );
}

function addDiagnostic(context: ResolveContext, item: Diagnostic): void {
  context.diagnostics.push(item);
}

function validateSlideOptions(options: unknown, path: string): Diagnostic | undefined {
  if (options === undefined || isAuthoringOptionsRecord(options)) {
    return undefined;
  }

  return compositionDiagnostic({
    code: "E_COMPOSITION_INVALID_SLIDE_OPTIONS",
    title: "slide declaration options are not part of the public authoring API",
    path,
    message: "deck.slide() options must be an object in the public authoring API.",
    help: ["Use deck.slide({ name, className, style, template }, factory) or deck.slide(factory)."],
  });
}

function validateSlideOptionValues(options: unknown, path: string): readonly Diagnostic[] {
  if (!isAuthoringOptionsRecord(options)) {
    return [];
  }

  return Object.entries(options).flatMap(([key, value]) =>
    isAuthorElementPropValue(value)
      ? []
      : [
          compositionDiagnostic({
            code: "E_COMPOSITION_INVALID_SLIDE_OPTION_VALUE",
            title: "slide option value is not part of the public authoring API",
            path: `${path}.${key}`,
            message: `deck.slide() slide option "${key}" received a value that is not part of the public authoring API.`,
            help: [
              "Use serializable authoring data for slide options. Slide visual values belong inside the style option object.",
            ],
          }),
        ],
  );
}

function compositionDiagnostic(input: {
  severity?: Diagnostic["severity"];
  code: string;
  title: string;
  path: string;
  message: string;
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: input.severity ?? "error",
    code: input.code,
    title: input.title,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    ...(input.help ? { help: input.help } : {}),
  });
}

function publicAuthoringRuntimeDiagnostic(error: unknown, path: string): Diagnostic | undefined {
  const message = error instanceof Error ? error.message : undefined;
  if (!message) {
    return undefined;
  }

  const invalidProp = /^JSX prop "([^"]+)" must be serializable authoring data\.$/.exec(message);
  if (invalidProp) {
    const propName = invalidProp[1]!;
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_PROP_VALUE",
      title: "authoring prop value is not part of the public authoring API",
      path,
      message: `JSX prop "${propName}" received a value that is not part of the public deckjsx authoring API.`,
      help: [
        "Use serializable authoring data for JSX props. Visual values belong in style, and children belong between tags.",
      ],
    });
  }

  const nonPublicIntrinsicTag =
    /^Intrinsic element is not part of the public authoring API: <([^>]+)>\.$/.exec(message);
  if (nonPublicIntrinsicTag) {
    const tagName = nonPublicIntrinsicTag[1]!;
    return compositionDiagnostic({
      code: "E_COMPOSITION_NON_PUBLIC_AUTHORING_TAG",
      title: "JSX intrinsic tag is not part of the public authoring API",
      path,
      message: `<${tagName}> is not part of the public deckjsx JSX authoring API.`,
      help: [
        "Use deckjsx authored tags such as div, main, section, p, h1-h6, span, img, video, shape, or table tags.",
      ],
    });
  }

  if (message === "JSX element type must be a function component.") {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_ELEMENT_TYPE",
      title: "JSX element type is not part of the public authoring API",
      path,
      message:
        "JSX element type must be a supported deckjsx intrinsic tag or a function component.",
      help: [
        "Use deckjsx authored tags or pass a function component that returns deckjsx slide content.",
      ],
    });
  }

  if (
    message === "JSX props must be an object or null." ||
    message === "JSX props must be a plain object or null."
  ) {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_PROPS",
      title: "JSX props are not part of the public authoring API",
      path,
      message: "JSX props must be a plain object or null in the public deckjsx authoring API.",
      help: ["Pass JSX props as a plain object, or pass null when the element has no props."],
    });
  }

  if (message === "JSX key must be a string, number, or bigint.") {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_KEY",
      title: "JSX key is not part of the public authoring API",
      path,
      message: "JSX key must be a string, number, or bigint in the public deckjsx authoring API.",
      help: [
        "Use stable primitive keys for repeated JSX elements. Objects and arrays are not public key values.",
      ],
    });
  }

  if (message === "JSX numeric key must be finite.") {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_KEY",
      title: "JSX key is not part of the public authoring API",
      path,
      message: "JSX numeric key must be finite in the public deckjsx authoring API.",
      help: [
        "Use stable primitive keys for repeated JSX elements. NaN and Infinity are not public key values.",
      ],
    });
  }

  if (message === "Function components must return a deckjsx author tree node.") {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_COMPONENT_RETURN",
      title: "JSX component return is not part of the public authoring API",
      path,
      message: "Function components must return deckjsx JSX content.",
      help: [
        "Return a deckjsx element or fragment from the component, and put primitive text inside a text element.",
      ],
    });
  }

  if (message === "JSX children must be deckjsx author tree nodes or primitive text values.") {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_CHILD",
      title: "authoring child is not part of the public authoring API",
      path,
      message:
        "JSX children must be deckjsx elements, strings, numbers, booleans, null, undefined, or arrays of those values.",
      help: [
        "Render data through text elements or map arrays into deckjsx JSX elements before returning slide content.",
      ],
    });
  }

  if (message === "JSX numeric children must be finite.") {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_CHILD",
      title: "authoring child is not part of the public authoring API",
      path,
      message: "JSX numeric children must be finite in the public deckjsx authoring API.",
      help: [
        "Render text as strings or finite numbers. NaN and Infinity are not public child values.",
      ],
    });
  }

  if (
    message === "JSX child arrays must not be cyclic." ||
    message === "JSX child arrays are too deeply nested."
  ) {
    return compositionDiagnostic({
      code: "E_COMPOSITION_INVALID_AUTHORING_CHILD",
      title: "authoring child is not part of the public authoring API",
      path,
      message: `${message} This is not part of the public deckjsx authoring API.`,
      help: [
        "Pass a finite tree of deckjsx elements, strings, numbers, booleans, null, undefined, or arrays of those values.",
      ],
    });
  }

  return undefined;
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

function sourceIdentitySegment(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sourceMaterialFor(source: SourceOrigin): readonly string[] {
  return source.kind === "root"
    ? ["source", "root"]
    : ["source", "mounted", sourceIdentitySegment(source.sourceIdentity)];
}

function sourceKeyLabel(sourceKey: unknown): string {
  return typeof sourceKey === "string" ? sourceKey : "<invalid>";
}

function validateSourceKey(sourceKey: unknown): string | undefined {
  if (typeof sourceKey !== "string") {
    return "Source Key must be a string in the public authoring API.";
  }

  if (sourceKey.trim().length === 0) {
    return "Source Key must not be empty in the public authoring API.";
  }

  if (sourceKey === "." || sourceKey === "..") {
    return "Source Key must not be dot or dot-dot in the public authoring API.";
  }

  if (sourceKey.includes("/")) {
    return "Source Key must not contain / in the public authoring API.";
  }

  return undefined;
}

function describeInvalidRoot(value: unknown): string {
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
        title: "mount source context is not part of the public authoring API",
        path,
        message:
          "A Bound Source cannot receive additional Source Context in the public authoring API.",
        help: [
          "Bind Source Context either with deck.withSource(value) or with deck.mount(..., context), not both.",
        ],
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
          title: "source context mapper return value is not part of the public authoring API",
          path,
          message:
            "Source Context Mappers must return Source Context synchronously in the public authoring API.",
          help: [
            "Resolve async data before mounting the child Deck, then pass the resolved Source Context value.",
          ],
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
        help: [
          "Fix the Source Context mapper passed to deck.mount(...); it must return child Source Context data.",
        ],
      }),
    );
    return undefined;
  }
}

function resolveSource(
  source: ResolvableCompositionSource,
  context: ResolveContext,
): SourcePlan | undefined {
  const sourceState = source[COMPOSITION_SOURCE]();
  const effectiveContext = context.context.present ? context.context : sourceState.boundContext;
  const sourceHasTheme = Object.hasOwn(sourceState, "theme");
  const sourceTheme = (sourceState as { readonly theme?: unknown }).theme;
  const activeTheme =
    context.activeTheme !== undefined &&
    sourceHasTheme &&
    isTheme(context.activeTheme) &&
    isTheme(sourceTheme)
      ? context.activeTheme.extend(sourceTheme)
      : sourceHasTheme
        ? sourceTheme
        : context.activeTheme;

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

  if (context.depth > 0 && sourceState.plugins.length > 0) {
    addDiagnostic(
      context,
      compositionDiagnostic({
        severity: "warning",
        code: "W_COMPOSITION_CHILD_PLUGIN_IGNORED",
        title: "child Deck plugins are ignored",
        path: context.sourcePath,
        message:
          "Mounted child sources cannot install Deck Plugins into the parent render execution.",
        help: [
          "Register Deck Plugins on the root Deck that owns compile(), project(), or render().",
        ],
      }),
    );
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
  const sourceTemplates = (sourceState as { readonly templates?: unknown }).templates;
  validateSlideTemplates(
    Object.hasOwn(sourceState, "templates") ? sourceTemplates : undefined,
    `${context.sourcePath} > templates`,
  ).forEach((item) => addDiagnostic(context, item));

  const nextStack: readonly object[] = [...context.stack, sourceState.cycleId as object];

  sourceState.entries.forEach((entry, index) => {
    if (entry.kind === "slide") {
      const optionsPath = `${context.sourcePath} > slideFactory[${index}].options`;
      const optionsDiagnostic = validateSlideOptions(entry.options, optionsPath);
      if (optionsDiagnostic) {
        addDiagnostic(context, optionsDiagnostic);
      }
      validateSlideOptionValues(entry.options, optionsPath).forEach((item) =>
        addDiagnostic(context, item),
      );
      entries.push({
        kind: "slide",
        factory: entry.factory,
        ...(Object.hasOwn(entry, "options") ? { options: entry.options } : {}),
        path: `${context.sourcePath} > slideFactory[${index}]`,
      });
      slideCount += 1;
      return;
    }

    const sourceKey = entry.sourceKey;
    const mountPath = `${context.sourcePath} > mount[${sourceKeyLabel(sourceKey)}]`;
    const invalidKey = validateSourceKey(sourceKey);
    if (invalidKey) {
      addDiagnostic(
        context,
        compositionDiagnostic({
          code: "E_COMPOSITION_INVALID_SOURCE_KEY",
          title: "source key is not part of the public authoring API",
          path: mountPath,
          message: invalidKey,
        }),
      );
      return;
    }

    const validSourceKey = sourceKey as string;

    if (sourceKeys.has(validSourceKey)) {
      addDiagnostic(
        context,
        compositionDiagnostic({
          code: "E_COMPOSITION_DUPLICATE_SOURCE_KEY",
          title: "duplicate source key",
          path: mountPath,
          message: `Source Key "${validSourceKey}" is already used in this parent source.`,
        }),
      );
      return;
    }

    if (!isCompositionSource(entry.source)) {
      addDiagnostic(
        context,
        compositionDiagnostic({
          code: "E_COMPOSITION_INVALID_MOUNT_SOURCE",
          title: "mounted source is not part of the public authoring API",
          path: mountPath,
          message: "deck.mount() child must be a Deck or BoundSource.",
          help: ["Pass a Deck or a Bound Source created by withSource()."],
        }),
      );
      return;
    }

    sourceKeys.add(validSourceKey);
    const childContext = childContextFor(entry, context, mountPath);
    if (!childContext) {
      return;
    }

    const childSource = sourceOriginFor(context.source, validSourceKey);
    const childResolveContext: ResolveContext = {
      diagnostics: context.diagnostics,
      stack: nextStack,
      depth: context.depth + 1,
      source: childSource,
      sourceIdentityMaterial: sourceMaterialFor(childSource),
      sourcePath: sourcePathFor(context.sourcePath, validSourceKey),
      context: childContext,
      activeTheme,
      slotOwnerSource: context.source,
      slotOwnerMaterial: context.sourceIdentityMaterial,
    };
    const childPlan = resolveSource(entry.source, childResolveContext);

    if (!childPlan) {
      return;
    }

    entries.push({ kind: "source", source: childPlan });
    slideCount += childPlan.slideCount;
  });

  const plan: SourcePlan = {
    source: context.source,
    sourceIdentityMaterial: context.sourceIdentityMaterial,
    stylesheets: sourceState.stylesheets,
    ...(activeTheme !== undefined ? { theme: activeTheme } : {}),
    ...(sourceTemplates && typeof sourceTemplates === "object" && !Array.isArray(sourceTemplates)
      ? { templates: sourceTemplates as SlideTemplateSet }
      : {}),
    context: effectiveContext,
    entries,
    slideCount,
    slotOrigins,
  };
  return plan;
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

    if (typeof entry.factory !== "function") {
      diagnostics.push(
        compositionDiagnostic({
          code: "E_COMPOSITION_INVALID_SLIDE_FACTORY",
          title: "slide factory is not part of the public authoring API",
          path: entry.path,
          message: "deck.slide() factory must be a function.",
          help: ["Pass a function that returns deckjsx slide content."],
        }),
      );
      sourceSlideIndex += 1;
      nextDeckSlideIndex += 1;
      continue;
    }

    const slideTemplate = slideTemplateOptionValue(entry.options);
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
    let content: ReturnType<PlannedSlideFactory>;
    try {
      content = entry.factory(factoryInput);
    } catch (error) {
      diagnostics.push(
        publicAuthoringRuntimeDiagnostic(error, entry.path) ??
          compositionDiagnostic({
            code: "E_COMPOSITION_SLIDE_FACTORY_FAILED",
            title: "slide factory failed",
            path: entry.path,
            message: error instanceof Error ? error.message : "Slide factory threw.",
            help: [
              "Fix the function passed to deck.slide(); it must return deckjsx slide content.",
            ],
          }),
      );
      sourceSlideIndex += 1;
      nextDeckSlideIndex += 1;
      continue;
    }

    const root = isAuthorTreeChild(content)
      ? createAuthorElement({
          source: { kind: "slide" },
          props: authorElementPropsFromSlideOptions(entry.options),
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
        ...(Object.hasOwn(plan, "theme") ? { theme: plan.theme } : {}),
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

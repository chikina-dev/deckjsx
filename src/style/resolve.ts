import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import type { ComposedAuthorRoot } from "../composition/types";
import type {
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SourceOrigin,
  StyleClassRef,
  StyleEntity,
} from "../graph";
import { elementDefaultsFor, userAgentDefaultsFor } from "./defaults";
import {
  registerStylesheets,
  resolveClassMatches,
  type StyleClassRegistry,
} from "./style-class-registry";
import type { SelectorContext } from "./selectors";
import type { StyleSheetValue } from "./stylesheet/public";
import { isTheme, themeDiagnostics, themeInput } from "./theme/runtime";
import type { StyleDeclaration, StyleDeclarationKey, StyleDeclarationValue } from "./declaration";

export type ResolvedStyleDeclaration = StyleDeclaration;
export type ResolvedStyleValue<TProperty extends StyleDeclarationKey = StyleDeclarationKey> =
  StyleDeclarationValue<TProperty>;

export type ResolvedStyleLayer = "default" | "inherited" | "theme" | "class" | "style";

export type ResolvedStyleSource =
  | { readonly layer: "default"; readonly defaultKey?: string }
  | { readonly layer: "inherited"; readonly parentId: GraphNodeId }
  | { readonly layer: "theme"; readonly defaultKey: string }
  | {
      readonly layer: "class";
      readonly className: string;
      readonly stylesheetIndex: number;
      readonly ruleIndex: number;
      readonly selector: string;
    }
  | { readonly layer: "style" };

export type ResolvedStyleProperty<TProperty extends StyleDeclarationKey = StyleDeclarationKey> = {
  readonly value: ResolvedStyleValue<TProperty>;
  readonly source: ResolvedStyleSource;
};

export type ResolvedStylePropertyTraceCandidate<
  TProperty extends StyleDeclarationKey = StyleDeclarationKey,
> = {
  readonly value: ResolvedStyleValue<TProperty>;
  readonly source: ResolvedStyleSource;
  readonly applied: boolean;
};

export type ResolvedStylePropertyTrace<
  TProperty extends StyleDeclarationKey = StyleDeclarationKey,
> = {
  readonly property: TProperty;
  readonly candidates: readonly ResolvedStylePropertyTraceCandidate<TProperty>[];
};

export type ResolvedStyle = {
  readonly style: Readonly<ResolvedStyleDeclaration>;
  readonly properties: Readonly<Record<string, ResolvedStyleProperty>>;
  readonly appliedClasses: readonly ResolvedStyleSource[];
  readonly propertyTraces: Readonly<Record<string, ResolvedStylePropertyTrace>>;
};

/** Property-aware access to a resolved declaration without repeating downstream casts. */
export function resolvedStyleProperty<TProperty extends StyleDeclarationKey>(
  resolved: ResolvedStyle,
  property: TProperty,
): ResolvedStyleProperty<TProperty> | undefined {
  const properties: Readonly<Record<string, unknown>> = resolved.properties;
  return properties[property] as ResolvedStyleProperty<TProperty> | undefined;
}

/** Property-aware access to a resolved declaration trace. */
export function resolvedStylePropertyTrace<TProperty extends StyleDeclarationKey>(
  resolved: ResolvedStyle,
  property: TProperty,
): ResolvedStylePropertyTrace<TProperty> | undefined {
  const traces: Readonly<Record<string, unknown>> = resolved.propertyTraces;
  return traces[property] as ResolvedStylePropertyTrace<TProperty> | undefined;
}

export type ResolvedStyleMap = ReadonlyMap<GraphNodeId, ResolvedStyle>;

export type StyleResolutionResult = {
  readonly resolvedStyles: ResolvedStyleMap;
  readonly diagnostics: Diagnostics;
};

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

function classesBySource(
  roots: readonly ComposedAuthorRoot[],
): ReadonlyMap<string, readonly StyleSheetValue[]> {
  const stylesheets = new Map<string, readonly StyleSheetValue[]>();

  roots.forEach((root) => {
    const key = sourceKeyFor(root.source);
    if (!stylesheets.has(key)) {
      stylesheets.set(key, root.stylesheets);
    }
  });

  return stylesheets;
}

function themesBySource(roots: readonly ComposedAuthorRoot[]): ReadonlyMap<string, unknown> {
  const themes = new Map<string, unknown>();

  roots.forEach((root) => {
    if (!Object.hasOwn(root, "theme")) {
      return;
    }

    themes.set(sourceKeyFor(root.source), (root as { readonly theme?: unknown }).theme);
  });

  return themes;
}

function applyProperties(
  style: ResolvedStyleDeclaration,
  source: ResolvedStyleSource,
  properties: Record<string, ResolvedStyleProperty>,
  traceCandidates: Record<string, ResolvedStyleProperty[]>,
): void {
  Object.entries<StyleDeclarationValue>(style).forEach(([key, value]) => {
    const property = { value, source };
    properties[key] = property;
    traceCandidates[key] = [...(traceCandidates[key] ?? []), property];
  });
}

const INHERITED_STYLE_KEYS = new Set<keyof StyleDeclaration>([
  "color",
  "direction",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "overflowWrap",
  "textAlign",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "writingMode",
]);

function applyInheritedProperties(
  parentId: GraphNodeId | undefined,
  parent: ResolvedStyle | undefined,
  properties: Record<string, ResolvedStyleProperty>,
  traceCandidates: Record<string, ResolvedStyleProperty[]>,
): void {
  if (parentId === undefined || parent === undefined) {
    return;
  }

  for (const key of INHERITED_STYLE_KEYS) {
    const property = parent.properties[key];
    if (property?.value !== undefined) {
      properties[key] = {
        value: property.value,
        source: { layer: "inherited", parentId },
      };
      traceCandidates[key] = [...(traceCandidates[key] ?? []), properties[key]];
    }
  }
}

function propertyTracesFor(
  traceCandidates: Record<string, ResolvedStyleProperty[]>,
): Record<string, ResolvedStylePropertyTrace> {
  return Object.fromEntries(
    Object.entries(traceCandidates).map(([property, candidates]) => [
      property,
      {
        property: property as StyleDeclarationKey,
        candidates: candidates.map((candidate, index) => ({
          value: candidate.value,
          source: candidate.source,
          applied: index === candidates.length - 1,
        })),
      },
    ]),
  );
}

function resolvedStyleFor(
  node: SemanticNode,
  entity: StyleEntity | undefined,
  registry: StyleClassRegistry,
  theme: unknown,
  context: SelectorContext,
  inherited: { parentId?: GraphNodeId; style?: ResolvedStyle },
  diagnostics: Diagnostic[],
): ResolvedStyle {
  const properties: Record<string, ResolvedStyleProperty> = {};
  const traceCandidates: Record<string, ResolvedStyleProperty[]> = {};
  const appliedClasses: ResolvedStyleSource[] = [];

  const defaults = elementDefaultsFor(node);
  if (defaults) {
    applyProperties(defaults, { layer: "default" }, properties, traceCandidates);
  }

  const userAgentDefaults = userAgentDefaultsFor(node);
  if (userAgentDefaults && node.authoredTag) {
    applyProperties(
      userAgentDefaults,
      { layer: "default", defaultKey: node.authoredTag },
      properties,
      traceCandidates,
    );
  }

  applyInheritedProperties(inherited.parentId, inherited.style, properties, traceCandidates);

  const themeDefaults = node.authoredTag && isTheme(theme) ? themeInput(theme).defaults : undefined;
  const themeDefault =
    node.authoredTag && isRecord(themeDefaults)
      ? (themeDefaults[node.authoredTag] as StyleDeclaration | undefined)
      : undefined;
  if (node.authoredTag && themeDefault) {
    applyProperties(
      themeDefault,
      {
        layer: "theme",
        defaultKey: node.authoredTag,
      },
      properties,
      traceCandidates,
    );
  }

  if (entity) {
    const matchedClasses = resolveClassMatches(node, entity, registry, context, diagnostics);
    matchedClasses.forEach((match) => {
      const source: ResolvedStyleSource = {
        layer: "class",
        className: match.registration.className,
        stylesheetIndex: match.registration.stylesheetIndex,
        ruleIndex: match.registration.ruleIndex,
        selector: match.selector,
      };
      appliedClasses.push(source);
      applyProperties(match.style, source, properties, traceCandidates);
    });
  }

  if (entity?.authored.style) {
    applyProperties(entity.authored.style, { layer: "style" }, properties, traceCandidates);
  }

  return {
    style: Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [key, property.value]),
    ),
    properties,
    appliedClasses,
    propertyTraces: propertyTracesFor(traceCandidates),
  };
}

function parentMapFor(graph: SemanticAuthorGraph): ReadonlyMap<GraphNodeId, GraphNodeId> {
  const parentById = new Map<GraphNodeId, GraphNodeId>();

  graph.nodes.forEach((node) => {
    const childIds =
      "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];

    childIds.forEach((childId) => {
      parentById.set(childId, node.id);
    });
  });

  return parentById;
}

function classNamesByNodeIdFor(
  graph: SemanticAuthorGraph,
): ReadonlyMap<GraphNodeId, ReadonlySet<string>> {
  const classNamesByNodeId = new Map<GraphNodeId, ReadonlySet<string>>();

  graph.nodes.forEach((node) => {
    const classRefs = node.styleRef
      ? graph.styles.get(node.styleRef)?.authored.classRefs
      : undefined;
    classNamesByNodeId.set(node.id, new Set(classRefs?.map((ref) => ref.name) ?? []));
  });

  return classNamesByNodeId;
}

function isStyleCapableNode(node: SemanticNode): boolean {
  return node.kind !== "document";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sourceThemeDiagnostics(sourceKey: string, theme: unknown): readonly Diagnostic[] {
  if (!isTheme(theme)) {
    return [
      diagnostic({
        severity: "error",
        code: "E_THEME_INVALID",
        title: "deck theme is not part of the public authoring API",
        message: "Deck theme must be a Theme object in the public authoring API.",
        labels: [
          {
            path: `source:${sourceKey} > theme`,
            message: "Deck theme must be a Theme object in the public authoring API.",
          },
        ],
        help: ["Pass theme: new Theme({ defaults: { ... } }) or omit theme."],
      }),
    ];
  }

  return themeDiagnostics(theme).map((item) => ({
    ...item,
    labels: item.labels.map((label) => ({
      ...label,
      path: `source:${sourceKey} > ${label.path}`,
    })),
  }));
}

export function resolveStyles(
  graph: SemanticAuthorGraph,
  roots: readonly ComposedAuthorRoot[],
): StyleResolutionResult {
  const diagnostics: Diagnostic[] = [];
  const stylesheets = classesBySource(roots);
  const themes = themesBySource(roots);
  const registries = new Map<string, StyleClassRegistry>();
  const parentById = parentMapFor(graph);
  const selectorContext: SelectorContext = {
    graph,
    parentById,
    classNamesByNodeId: classNamesByNodeIdFor(graph),
  };
  const resolvedStyles = new Map<GraphNodeId, ResolvedStyle>();
  const resolvingStyles = new Set<GraphNodeId>();
  const diagnosedStyleCycles = new Set<GraphNodeId>();

  stylesheets.forEach((sourceStylesheets, sourceKey) => {
    registries.set(sourceKey, registerStylesheets(sourceKey, sourceStylesheets, diagnostics));
  });

  themes.forEach((theme, sourceKey) => {
    diagnostics.push(...sourceThemeDiagnostics(sourceKey, theme));
  });

  const resolveNode = (node: SemanticNode): ResolvedStyle | undefined => {
    if (!isStyleCapableNode(node)) {
      return undefined;
    }

    const existing = resolvedStyles.get(node.id);
    if (existing) {
      return existing;
    }

    if (resolvingStyles.has(node.id)) {
      if (!diagnosedStyleCycles.has(node.id)) {
        diagnosedStyleCycles.add(node.id);
        diagnostics.push({
          severity: "error",
          code: "E_STYLE_INHERITANCE_CYCLE",
          title: "cyclic style inheritance",
          message:
            "Style inheritance follows graph parent relationships, but this node is already being resolved.",
          labels: [
            {
              path: node.origin.path,
              message: "This node participates in a cycle and cannot inherit parent styles.",
              severity: "primary",
              ...(node.origin.sourceSpan ? { sourceSpan: node.origin.sourceSpan } : {}),
            },
          ],
          help: ["Remove the cyclic child relationship from the Semantic Author Graph."],
        });
      }
      return undefined;
    }

    const sourceKey = sourceKeyFor(node.origin.source);
    const entity = node.styleRef ? graph.styles.get(node.styleRef) : undefined;
    let registry = registries.get(sourceKey);
    if (!registry) {
      registry = registerStylesheets(sourceKey, stylesheets.get(sourceKey), diagnostics);
      registries.set(sourceKey, registry);
    }

    const parentId = parentById.get(node.id);
    const parent = parentId ? graph.nodes.get(parentId) : undefined;
    resolvingStyles.add(node.id);
    const inherited = parent ? resolveNode(parent) : undefined;
    const resolved = resolvedStyleFor(
      node,
      entity,
      registry,
      themes.get(sourceKey),
      selectorContext,
      { parentId, style: inherited },
      diagnostics,
    );
    resolvingStyles.delete(node.id);
    resolvedStyles.set(node.id, resolved);
    return resolved;
  };

  graph.nodes.forEach((node) => {
    resolveNode(node);
  });

  return {
    resolvedStyles,
    diagnostics: createDiagnostics(diagnostics),
  };
}

export function classRefsToNames(
  classRefs: readonly StyleClassRef[] | undefined,
): readonly string[] {
  return classRefs?.map((ref) => ref.name) ?? [];
}

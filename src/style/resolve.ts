import { createDiagnostics, type Diagnostic, type Diagnostics } from "../diagnostics";
import type { ComposedAuthorRoot } from "../composition/types";
import type {
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SourceOrigin,
  StyleClassRef,
  StyleEntity,
} from "../graph";
import { elementDefaultsFor } from "./defaults";
import {
  registerStylesheets,
  resolveClassMatches,
  type StyleClassRegistry,
} from "./style-class-registry";
import type { SelectorContext } from "./selectors";
import type { StyleSheet } from "./stylesheet";
import { themeDiagnostics, themeInput, type Theme } from "./theme";
import type { StyleDeclaration, StyleDeclarationValue } from "./types";

export type ResolvedStyleDeclaration = StyleDeclaration;
export type ResolvedStyleValue = StyleDeclarationValue;

export type ResolvedStyleLayer = "default" | "inherited" | "theme" | "class" | "style";

export type ResolvedStyleSource =
  | { readonly layer: "default" }
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

export type ResolvedStyleProperty = {
  readonly value: ResolvedStyleValue | undefined;
  readonly source: ResolvedStyleSource;
};

export type ResolvedStyle = {
  readonly style: Readonly<ResolvedStyleDeclaration>;
  readonly properties: Readonly<Record<string, ResolvedStyleProperty>>;
  readonly appliedClasses: readonly ResolvedStyleSource[];
};

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
): ReadonlyMap<string, readonly StyleSheet[]> {
  const stylesheets = new Map<string, readonly StyleSheet[]>();

  roots.forEach((root) => {
    const key = sourceKeyFor(root.source);
    if (!stylesheets.has(key)) {
      stylesheets.set(key, root.stylesheets);
    }
  });

  return stylesheets;
}

function themesBySource(roots: readonly ComposedAuthorRoot[]): ReadonlyMap<string, Theme> {
  const themes = new Map<string, Theme>();

  roots.forEach((root) => {
    if (!root.theme) {
      return;
    }

    themes.set(sourceKeyFor(root.source), root.theme);
  });

  return themes;
}

function applyProperties(
  style: ResolvedStyleDeclaration,
  source: ResolvedStyleSource,
  properties: Record<string, ResolvedStyleProperty>,
): void {
  Object.entries<StyleDeclarationValue | undefined>(style).forEach(([key, value]) => {
    properties[key] = { value, source };
  });
}

const INHERITED_STYLE_KEYS = new Set<keyof StyleDeclaration>([
  "charSpacing",
  "color",
  "direction",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "italic",
  "letterSpacing",
  "lineHeight",
  "overflowWrap",
  "strike",
  "textAlign",
  "textTransform",
  "underline",
  "whiteSpace",
  "wordBreak",
  "writingMode",
]);

function applyInheritedProperties(
  parentId: GraphNodeId | undefined,
  parent: ResolvedStyle | undefined,
  properties: Record<string, ResolvedStyleProperty>,
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
    }
  }
}

function resolvedStyleFor(
  node: SemanticNode,
  entity: StyleEntity | undefined,
  registry: StyleClassRegistry,
  theme: Theme | undefined,
  context: SelectorContext,
  inherited: { parentId?: GraphNodeId; style?: ResolvedStyle },
  diagnostics: Diagnostic[],
): ResolvedStyle {
  const properties: Record<string, ResolvedStyleProperty> = {};
  const appliedClasses: ResolvedStyleSource[] = [];

  const defaults = elementDefaultsFor(node);
  if (defaults) {
    applyProperties(defaults, { layer: "default" }, properties);
  }

  applyInheritedProperties(inherited.parentId, inherited.style, properties);

  const themeDefaults = node.authoredTag && theme ? themeInput(theme).defaults : undefined;
  const themeDefault = node.authoredTag ? themeDefaults?.[node.authoredTag] : undefined;
  if (node.authoredTag && themeDefault) {
    applyProperties(
      themeDefault,
      {
        layer: "theme",
        defaultKey: node.authoredTag,
      },
      properties,
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
      applyProperties(match.style, source, properties);
    });
  }

  if (entity?.authored.style) {
    applyProperties(entity.authored.style, { layer: "style" }, properties);
  }

  return {
    style: Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [key, property.value]),
    ),
    properties,
    appliedClasses,
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

function sourceThemeDiagnostics(sourceKey: string, theme: Theme): readonly Diagnostic[] {
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

    const sourceKey = sourceKeyFor(node.origin.source);
    const entity = node.styleRef ? graph.styles.get(node.styleRef) : undefined;
    let registry = registries.get(sourceKey);
    if (!registry) {
      registry = registerStylesheets(sourceKey, stylesheets.get(sourceKey), diagnostics);
      registries.set(sourceKey, registry);
    }

    const parentId = parentById.get(node.id);
    const parent = parentId ? graph.nodes.get(parentId) : undefined;
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

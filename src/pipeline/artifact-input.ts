import type { Diagnostics } from "../diagnostics";
import { isAuthoredTag } from "../authoring/tags";
import { isAuthorTreeNode } from "../authoring/tree";
import type { ComposedAuthorRoot } from "../composition/types";
import type { SemanticAuthorGraph, SemanticNode } from "../graph";
import type { CompiledAuthorGraph } from "./results-public";
import type { ResolvedStyleMap, ResolvedStyleSource } from "../style/resolve";

export type DefinedGraphInput = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly diagnostics: Diagnostics;
  readonly compositionRevision?: string;
  readonly pluginSetRevision?: string;
};

export type DefinedProjectionInput = {
  readonly projection: unknown;
  readonly diagnostics: Diagnostics;
};

const SEMANTIC_NODE_KINDS = new Set([
  "container",
  "document",
  "image",
  "shape",
  "slide",
  "table",
  "tableCell",
  "tableRow",
  "tableSection",
  "text",
  "textRun",
  "video",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isSourceSpan(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptionalString(value.file) &&
    (value.line === undefined || (Number.isInteger(value.line) && (value.line as number) > 0)) &&
    (value.column === undefined || (Number.isInteger(value.column) && (value.column as number) > 0))
  );
}

function isSourceOrigin(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "root") {
    return true;
  }
  return (
    value.kind === "mounted" &&
    isNonEmptyString(value.sourceKey) &&
    isNonEmptyString(value.sourceIdentity)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isCompositionContext(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.sourceKey === undefined || isNonEmptyString(value.sourceKey)) &&
    isNonNegativeInteger(value.slideIndex) &&
    isNonNegativeInteger(value.totalSlides) &&
    isNonNegativeInteger(value.deckSlideIndex) &&
    isNonNegativeInteger(value.deckTotalSlides)
  );
}

/** Validates composed roots before graph construction consumes plugin updates. */
export function isComposedAuthorRootArray(value: unknown): value is readonly ComposedAuthorRoot[] {
  return (
    Array.isArray(value) &&
    value.every(
      (root) =>
        isRecord(root) &&
        isAuthorTreeNode(root.root) &&
        root.root.kind === "element" &&
        root.root.source.kind === "slide" &&
        isSourceOrigin(root.source) &&
        Array.isArray(root.sourceIdentityMaterial) &&
        root.sourceIdentityMaterial.every(isNonEmptyString) &&
        Array.isArray(root.stylesheets) &&
        isNonEmptyString(root.path) &&
        isCompositionContext(root.composition) &&
        root.slotOrigins instanceof WeakMap,
    )
  );
}

function isSemanticOrigin(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === "authored" || value.kind === "implicit") &&
    isNonEmptyString(value.path) &&
    (value.source === undefined || isSourceOrigin(value.source)) &&
    (value.sourceSpan === undefined || isSourceSpan(value.sourceSpan)) &&
    (value.reason === undefined ||
      value.reason === "primitive-text-in-container" ||
      value.reason === "table-row-shorthand")
  );
}

function isSemanticRole(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) {
    return false;
  }
  switch (value.kind) {
    case "document":
    case "slide":
    case "genericContainer":
    case "figure":
    case "paragraph":
    case "image":
    case "shape":
    case "table":
    case "tableRow":
    case "video":
      return true;
    case "sectioning":
      return (
        typeof value.tag === "string" &&
        ["article", "aside", "footer", "header", "main", "nav", "section"].includes(value.tag)
      );
    case "heading":
      return (
        Number.isInteger(value.level) &&
        (value.level as number) >= 1 &&
        (value.level as number) <= 6
      );
    case "tableSection":
      return (
        value.sectionKind === "head" || value.sectionKind === "body" || value.sectionKind === "foot"
      );
    case "tableCell":
      return value.cellKind === "header" || value.cellKind === "data";
    default:
      return false;
  }
}

function isSemanticNodeBase(value: Record<string, unknown>, key: string): boolean {
  return (
    value.id === key &&
    isNonEmptyString(value.id) &&
    typeof value.kind === "string" &&
    SEMANTIC_NODE_KINDS.has(value.kind) &&
    isSemanticOrigin(value.origin) &&
    (value.authoredTag === undefined ||
      (typeof value.authoredTag === "string" && isAuthoredTag(value.authoredTag))) &&
    (value.role === undefined || isSemanticRole(value.role)) &&
    (value.key === undefined ||
      typeof value.key === "string" ||
      typeof value.key === "bigint" ||
      (isFiniteNumber(value.key) && Number.isInteger(value.key))) &&
    (value.styleRef === undefined || isNonEmptyString(value.styleRef)) &&
    (value.templateAreaRef === undefined ||
      (isRecord(value.templateAreaRef) &&
        isNonEmptyString(value.templateAreaRef.template) &&
        isNonEmptyString(value.templateAreaRef.area)))
  );
}

function isSemanticNodeValue(value: unknown, key: string): value is SemanticNode {
  if (!isRecord(value) || !isSemanticNodeBase(value, key)) {
    return false;
  }
  switch (value.kind) {
    case "document":
    case "container":
    case "table":
    case "tableRow":
      return isStringArray(value.children);
    case "slide":
      return (
        isStringArray(value.children) &&
        isOptionalString(value.name) &&
        (value.templateRef === undefined ||
          (isRecord(value.templateRef) && isNonEmptyString(value.templateRef.name)))
      );
    case "text":
      return (
        isStringArray(value.inlineChildren) &&
        (value.implicit === undefined || typeof value.implicit === "boolean")
      );
    case "textRun":
      return typeof value.text === "string";
    case "image":
      return value.assetRef === undefined || isNonEmptyString(value.assetRef);
    case "video":
      return (
        (value.assetRef === undefined || isNonEmptyString(value.assetRef)) &&
        (value.posterAssetRef === undefined || isNonEmptyString(value.posterAssetRef))
      );
    case "shape":
      return (
        value.shape === "rect" ||
        value.shape === "ellipse" ||
        value.shape === "line" ||
        value.shape === "roundRect"
      );
    case "tableSection":
      return (
        isStringArray(value.children) &&
        (value.sectionKind === "head" ||
          value.sectionKind === "body" ||
          value.sectionKind === "foot")
      );
    case "tableCell":
      return (
        isStringArray(value.children) &&
        (value.cellKind === "header" || value.cellKind === "data") &&
        Number.isInteger(value.colSpan) &&
        (value.colSpan as number) > 0 &&
        Number.isInteger(value.rowSpan) &&
        (value.rowSpan as number) > 0
      );
    default:
      return false;
  }
}

function isStyleEntity(value: unknown, key: string): boolean {
  return (
    isRecord(value) &&
    value.id === key &&
    isNonEmptyString(value.id) &&
    typeof value.target === "string" &&
    SEMANTIC_NODE_KINDS.has(value.target) &&
    isRecord(value.authored) &&
    (value.authored.style === undefined || isRecord(value.authored.style)) &&
    (value.authored.classRefs === undefined ||
      (Array.isArray(value.authored.classRefs) &&
        value.authored.classRefs.every(
          (classRef) =>
            isRecord(classRef) &&
            isNonEmptyString(classRef.name) &&
            Number.isInteger(classRef.index) &&
            (classRef.index as number) >= 0,
        )))
  );
}

function isAssetSource(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "path":
      return isNonEmptyString(value.path);
    case "data":
      return isNonEmptyString(value.data);
    case "url":
      return isNonEmptyString(value.url);
    default:
      return false;
  }
}

function isAssetEntity(value: unknown, key: string): boolean {
  return (
    isRecord(value) &&
    value.id === key &&
    isNonEmptyString(value.id) &&
    (value.kind === "image" || value.kind === "video") &&
    (value.sourceField === "src" ||
      value.sourceField === "data" ||
      value.sourceField === "poster" ||
      value.sourceField === "posterData") &&
    isAssetSource(value.source) &&
    isRecord(value.metadata) &&
    (value.metadata.mediaType === undefined || isNonEmptyString(value.metadata.mediaType)) &&
    (value.metadata.byteLength === undefined ||
      (Number.isInteger(value.metadata.byteLength) &&
        (value.metadata.byteLength as number) >= 0)) &&
    (value.metadata.widthPx === undefined ||
      (isFiniteNumber(value.metadata.widthPx) && value.metadata.widthPx > 0)) &&
    (value.metadata.heightPx === undefined ||
      (isFiniteNumber(value.metadata.heightPx) && value.metadata.heightPx > 0)) &&
    (value.metadata.contentHash === undefined || isNonEmptyString(value.metadata.contentHash)) &&
    (value.resolution === "failed" ||
      value.resolution === "resolved" ||
      value.resolution === "unresolved")
  );
}

function referencedNodeIds(node: SemanticNode): readonly string[] {
  if ("children" in node) {
    return node.children;
  }
  return "inlineChildren" in node ? node.inlineChildren : [];
}

/** Validates a complete Semantic Author Graph at untyped integration boundaries. */
export function isSemanticAuthorGraph(value: unknown): value is SemanticAuthorGraph {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.documentId) ||
    !(value.nodes instanceof Map) ||
    !(value.styles instanceof Map) ||
    !(value.assets instanceof Map) ||
    !(value.templates instanceof Map)
  ) {
    return false;
  }

  const nodes = value.nodes;
  const styles = value.styles;
  const assets = value.assets;
  const templates = value.templates;

  if (
    ![...nodes.entries()].every(
      ([key, node]) => isNonEmptyString(key) && isSemanticNodeValue(node, key),
    ) ||
    ![...styles.entries()].every(
      ([key, style]) => isNonEmptyString(key) && isStyleEntity(style, key),
    ) ||
    ![...assets.entries()].every(
      ([key, asset]) => isNonEmptyString(key) && isAssetEntity(asset, key),
    ) ||
    ![...templates.keys()].every(isNonEmptyString)
  ) {
    return false;
  }

  const document = nodes.get(value.documentId);
  if (!isRecord(document) || document.kind !== "document") {
    return false;
  }

  return [...nodes.entries()].every(([key, node]) => {
    if (!isNonEmptyString(key) || !isSemanticNodeValue(node, key)) {
      return false;
    }
    if (!referencedNodeIds(node).every((id) => nodes.has(id))) {
      return false;
    }
    if (node.styleRef !== undefined && !styles.has(node.styleRef)) {
      return false;
    }
    if ("assetRef" in node && node.assetRef !== undefined && !assets.has(node.assetRef)) {
      return false;
    }
    return !(
      "posterAssetRef" in node &&
      node.posterAssetRef !== undefined &&
      !assets.has(node.posterAssetRef)
    );
  });
}

/** Exposes an internal graph through the lightweight public compile facade without copying it. */
export function publicCompiledAuthorGraph(graph: SemanticAuthorGraph): CompiledAuthorGraph {
  return graph as unknown as CompiledAuthorGraph;
}

/** Recovers an internal graph only after validating the complete public compile facade. */
export function semanticAuthorGraphFromCompiled(graph: CompiledAuthorGraph): SemanticAuthorGraph {
  if (!isSemanticAuthorGraph(graph)) {
    throw new TypeError(
      "Deck#defineGraph requires a complete valid compiled Semantic Author Graph.",
    );
  }
  return graph as unknown as SemanticAuthorGraph;
}

function isResolvedStyleSource(value: unknown): value is ResolvedStyleSource {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.layer) {
    case "default":
    case "style":
      return true;
    case "inherited":
      return isNonEmptyString(value.parentId);
    case "theme":
      return isNonEmptyString(value.defaultKey);
    case "class":
      return (
        isNonEmptyString(value.className) &&
        Number.isInteger(value.stylesheetIndex) &&
        (value.stylesheetIndex as number) >= 0 &&
        Number.isInteger(value.ruleIndex) &&
        (value.ruleIndex as number) >= 0 &&
        isNonEmptyString(value.selector)
      );
    default:
      return false;
  }
}

function isResolvedStyle(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isRecord(value.style) ||
    !isRecord(value.properties) ||
    !Array.isArray(value.appliedClasses) ||
    !value.appliedClasses.every(isResolvedStyleSource) ||
    !isRecord(value.propertyTraces)
  ) {
    return false;
  }

  const validProperties = Object.values(value.properties).every(
    (property) =>
      isRecord(property) && "value" in property && isResolvedStyleSource(property.source),
  );
  const validTraces = Object.entries(value.propertyTraces).every(
    ([propertyName, trace]) =>
      isRecord(trace) &&
      trace.property === propertyName &&
      Array.isArray(trace.candidates) &&
      trace.candidates.every(
        (candidate) =>
          isRecord(candidate) &&
          "value" in candidate &&
          isResolvedStyleSource(candidate.source) &&
          typeof candidate.applied === "boolean",
      ),
  );
  return validProperties && validTraces;
}

/** Validates nested resolved-style records and optionally correlates their ids to a graph. */
export function isResolvedStyleMap(
  value: unknown,
  graph?: SemanticAuthorGraph,
): value is ResolvedStyleMap {
  return (
    value instanceof Map &&
    [...value.entries()].every(
      ([key, style]) =>
        isNonEmptyString(key) &&
        (graph === undefined || graph.nodes.has(key as never)) &&
        isResolvedStyle(style),
    )
  );
}

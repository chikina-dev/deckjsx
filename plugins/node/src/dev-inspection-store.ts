export type NodeDevInspectionBoundary =
  | "source"
  | "bundle"
  | "entry"
  | "authoring"
  | "graph"
  | "style"
  | "layout"
  | "projection"
  | "output";

export type NodeDevInspectionSource = {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
};

export type NodeDevComponentKey = string | number | bigint;

export type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | { readonly kind: "undefined" }
  | { readonly kind: "function"; readonly name?: string }
  | { readonly kind: "array"; readonly length: number }
  | { readonly kind: "object"; readonly keys: readonly string[] }
  | { readonly kind: "circular"; readonly keys: readonly string[] }
  | { readonly kind: "instance"; readonly name: string; readonly keys: readonly string[] };

export type NodeDevComponentSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly key?: NodeDevComponentKey;
  readonly compilation?: number;
  readonly source?: NodeDevInspectionSource;
  readonly propsSummary: Readonly<Record<string, SanitizedValue>>;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly graphNodeIds: readonly string[];
};

export type NodeDevInspectionStore = {
  beginAttempt(input: { readonly compilation: number }): void;
  recordComponent(input: {
    readonly name: string;
    readonly key?: NodeDevComponentKey;
    readonly source?: NodeDevInspectionSource;
    readonly props?: unknown;
    readonly parentId?: string;
    readonly graphNodeId?: string;
  }): string;
  finishAttempt(input: {
    readonly devStatus: string;
    readonly boundary: NodeDevInspectionBoundary;
  }): void;
  componentTree(): {
    readonly status: "complete" | "partial" | "unavailable";
    readonly compilation?: number;
    readonly items: readonly NodeDevComponentSnapshot[];
  };
  inspectionStatus():
    | {
        readonly status: "complete" | "partial";
        readonly compilation: number;
        readonly devStatus: string;
        readonly boundary: NodeDevInspectionBoundary;
        readonly componentCount: number;
      }
    | {
        readonly status: "unavailable";
        readonly reason: string;
      };
  searchComponents(query: string): readonly NodeDevComponentSnapshot[];
  filterComponents(input: {
    readonly candidates: readonly NodeDevComponentSnapshot[];
    readonly query: string;
  }): readonly NodeDevComponentSnapshot[];
  inspectComponent(target: string): NodeDevComponentSnapshot | undefined;
  inspectProps(
    target: string,
    path?: string,
  ): { readonly target: string; readonly path?: string; readonly value: unknown } | undefined;
  diffComponents(target?: string): {
    readonly target?: string;
    readonly changes: readonly ComponentChange[];
  };
  inspectImpact(target: string):
    | {
        readonly target: string;
        readonly status: "unavailable";
        readonly reason: string;
      }
    | undefined;
  diffProps(
    target: string,
    path?: string,
  ): { readonly target: string; readonly path?: string; readonly changes: readonly PropsChange[] };
};

type ComponentChange = {
  readonly path: string;
  readonly before?: unknown;
  readonly after?: unknown;
};

type PropsChange = ComponentChange;

type AttemptSnapshot = {
  readonly compilation: number;
  readonly status: "complete" | "partial";
  readonly devStatus: string;
  readonly boundary: NodeDevInspectionBoundary;
  readonly components: readonly ComponentRecord[];
};

type ComponentRecord = {
  id: string;
  name: string;
  key?: NodeDevComponentKey;
  source?: NodeDevInspectionSource;
  propsSummary: Readonly<Record<string, SanitizedValue>>;
  parentId?: string;
  childIds: string[];
  graphNodeIds: string[];
  propsRaw: unknown;
};

type MutableAttempt = {
  readonly compilation: number;
  readonly components: ComponentRecord[];
};

export function createNodeDevInspectionStore(): NodeDevInspectionStore {
  let current: MutableAttempt | undefined;
  let latestAttempt: AttemptSnapshot | undefined;
  let latestInspectable: AttemptSnapshot | undefined;
  let previousInspectable: AttemptSnapshot | undefined;

  return {
    beginAttempt(input) {
      current = { compilation: input.compilation, components: [] };
    },
    recordComponent(input) {
      if (!current) {
        throw new Error("Node dev inspection attempt has not started.");
      }
      const id = componentInspectorId(input);
      const existing = current.components.find((component) => component.id === id);
      if (existing) {
        addGraphNodeId(existing, input.graphNodeId);
        linkParent(current, existing, input.parentId);
        return existing.id;
      }
      const propsRaw = input.props ?? {};
      const record: ComponentRecord = {
        id,
        name: input.name,
        ...(input.key !== undefined ? { key: input.key } : {}),
        ...(input.source ? { source: input.source } : {}),
        propsSummary: propsSummary(propsRaw),
        childIds: [],
        graphNodeIds: input.graphNodeId ? [input.graphNodeId] : [],
        propsRaw,
      };
      current.components.push(record);
      linkParent(current, record, input.parentId);
      return id;
    },
    finishAttempt(input) {
      if (!current) {
        return;
      }
      const snapshot: AttemptSnapshot = {
        compilation: current.compilation,
        status: input.devStatus === "artifactUpdated" ? "complete" : "partial",
        devStatus: input.devStatus,
        boundary: input.boundary,
        components: current.components,
      };
      latestAttempt = snapshot;
      if (snapshot.components.length > 0) {
        previousInspectable = latestInspectable;
        latestInspectable = snapshot;
      }
      current = undefined;
    },
    componentTree() {
      if (!latestInspectable) {
        return { status: "unavailable", items: [] };
      }
      return {
        status: latestInspectable.status,
        compilation: latestInspectable.compilation,
        items: latestInspectable.components.map((component) =>
          publicComponentSnapshot(latestInspectable, component),
        ),
      };
    },
    inspectionStatus() {
      if (!latestAttempt) {
        return {
          status: "unavailable",
          reason: "No dev inspection attempt has finished yet.",
        };
      }
      return {
        status: latestAttempt.status,
        compilation: latestAttempt.compilation,
        devStatus: latestAttempt.devStatus,
        boundary: latestAttempt.boundary,
        componentCount: latestAttempt.components.length,
      };
    },
    searchComponents(query) {
      return (latestInspectable?.components ?? [])
        .filter((component) => componentMatches(component, query))
        .map((component) => publicComponentSnapshot(latestInspectable, component));
    },
    filterComponents(input) {
      const candidateIds = new Set(input.candidates.map((candidate) => candidate.id));
      return (latestInspectable?.components ?? [])
        .filter(
          (component) => candidateIds.has(component.id) && componentMatches(component, input.query),
        )
        .map((component) => publicComponentSnapshot(latestInspectable, component));
    },
    inspectComponent(target) {
      const component = componentByTarget(latestInspectable, target);
      return component ? publicComponentSnapshot(latestInspectable, component) : undefined;
    },
    inspectProps(target, path) {
      const component = componentByTarget(latestInspectable, target);
      if (!component) {
        return undefined;
      }
      const value = path ? valueAtPath(component.propsRaw, path) : propsSummary(component.propsRaw);
      return {
        target: component.id,
        ...(path ? { path } : {}),
        value: sanitizeValueForPath(value, path),
      };
    },
    diffComponents(target) {
      if (target) {
        const latest = componentByTarget(latestInspectable, target);
        const previous = componentByTarget(previousInspectable, target);
        if (!latest || !previous) {
          return { target, changes: [] };
        }
        return {
          target: latest.id,
          changes: [
            ...componentRelationChanges(previous, latest),
            ...diffObjectProperties(previous.propsRaw, latest.propsRaw, "props"),
          ],
        };
      }
      return {
        changes: componentSnapshotChanges(previousInspectable, latestInspectable),
      };
    },
    inspectImpact(target) {
      const component = componentByTarget(latestInspectable, target);
      return component
        ? {
            target: component.id,
            status: "unavailable",
            reason: "No output impact mapping has been recorded for this component.",
          }
        : undefined;
    },
    diffProps(target, path) {
      const latest = componentByTarget(latestInspectable, target);
      const previous = componentByTarget(previousInspectable, target);
      if (!latest || !previous) {
        return { target, ...(path ? { path } : {}), changes: [] };
      }
      const before = path ? valueAtPath(previous.propsRaw, path) : previous.propsRaw;
      const after = path ? valueAtPath(latest.propsRaw, path) : latest.propsRaw;
      return {
        target: latest.id,
        ...(path ? { path } : {}),
        changes: diffValues(before, after, path),
      };
    },
  };
}

function linkParent(
  current: MutableAttempt,
  record: ComponentRecord,
  parentId: string | undefined,
): void {
  if (!parentId || record.parentId) {
    return;
  }
  const parent = current.components.find((item) => item.id === parentId);
  if (!parent || parent.childIds.includes(record.id)) {
    return;
  }
  record.parentId = parent.id;
  parent.childIds = [...parent.childIds, record.id];
}

function componentInspectorId(input: {
  readonly name: string;
  readonly key?: NodeDevComponentKey;
  readonly source?: NodeDevInspectionSource;
}): string {
  return [
    "component",
    input.name,
    ...(input.key === undefined ? [] : [`key:${String(input.key)}`]),
    input.source?.file ?? "unknown",
    input.source?.line ?? 0,
    input.source?.column ?? 0,
  ]
    .map((part) => String(part).replaceAll(/\W+/g, "_"))
    .join(":");
}

function propsSummary(value: unknown): Readonly<Record<string, SanitizedValue>> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 30)
      .map(([key, property]) => [key, sanitizePropValue(key, property)]),
  );
}

function sanitizePropValue(key: string, value: unknown): SanitizedValue {
  return isSecretKey(key) ? "[redacted]" : sanitizeValue(value);
}

function sanitizeValue(value: unknown): SanitizedValue {
  if (value === undefined) {
    return { kind: "undefined" };
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (typeof value === "function") {
    return { kind: "function", ...(value.name ? { name: value.name } : {}) };
  }
  if (Array.isArray(value)) {
    return { kind: "array", length: value.length };
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).slice(0, 30);
    if (hasCircularReference(value)) {
      return { kind: "circular", keys };
    }
    const instanceName = classInstanceName(value);
    if (instanceName) {
      return { kind: "instance", name: instanceName, keys };
    }
    return { kind: "object", keys };
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "symbol") {
    return value.description ? `Symbol(${value.description})` : "Symbol()";
  }
  return { kind: "undefined" };
}

function sanitizeValueForPath(value: unknown, path: string | undefined): SanitizedValue {
  const finalKey = path?.split(".").at(-1);
  return finalKey && isSecretKey(finalKey) ? "[redacted]" : sanitizeValue(value);
}

function classInstanceName(value: object): string | undefined {
  const prototype = Object.getPrototypeOf(value) as { readonly constructor?: unknown } | null;
  if (!prototype || prototype === Object.prototype) {
    return undefined;
  }
  const constructor = prototype.constructor;
  if (typeof constructor !== "function" || constructor.name === "Object") {
    return undefined;
  }
  return constructor.name;
}

function hasCircularReference(value: object): boolean {
  const seen = new WeakSet<object>();
  const stack = new WeakSet<object>();
  const visit = (current: object): boolean => {
    if (stack.has(current)) {
      return true;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    stack.add(current);
    for (const child of Object.values(current)) {
      if (typeof child === "object" && child !== null && visit(child)) {
        return true;
      }
    }
    stack.delete(current);
    return false;
  };
  return visit(value);
}

function isSecretKey(key: string): boolean {
  return /token|secret|password|api[-_]?key|authorization|cookie/i.test(key);
}

function componentMatches(component: ComponentRecord, query: string): boolean {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  return tokens.every((token) => componentMatchesToken(component, token));
}

function componentMatchesToken(component: ComponentRecord, token: string): boolean {
  if (token.startsWith("source:")) {
    return textIncludes(component.source?.file, token.slice("source:".length));
  }
  if (token.startsWith("has:")) {
    return false;
  }
  if (token.startsWith("impact:")) {
    return false;
  }
  const propsPredicate = propsQueryPredicate(token);
  if (propsPredicate) {
    return propValueMatches(component.propsRaw, propsPredicate);
  }
  const normalized = token.toLowerCase();
  return (
    component.name.toLowerCase().includes(normalized) ||
    component.source?.file?.toLowerCase().includes(normalized) ||
    Object.values(component.propsSummary).some((value) =>
      JSON.stringify(value).toLowerCase().includes(normalized),
    )
  );
}

function propsQueryPredicate(
  token: string,
): { readonly path: string; readonly expected: string; readonly operator: ":" | "~" } | undefined {
  const containsIndex = token.indexOf("~");
  const exactIndex = token.indexOf(":");
  const index =
    containsIndex >= 0 && (exactIndex < 0 || containsIndex < exactIndex)
      ? containsIndex
      : exactIndex;
  if (index < 0 || !token.startsWith("props.")) {
    return undefined;
  }
  const path = token.slice("props.".length, index);
  const expected = token.slice(index + 1);
  if (!path || !expected) {
    return undefined;
  }
  return {
    path,
    expected,
    operator: token[index] === "~" ? "~" : ":",
  };
}

function propValueMatches(
  props: unknown,
  predicate: { readonly path: string; readonly expected: string; readonly operator: ":" | "~" },
): boolean {
  const value = stringForSearch(valueAtPath(props, predicate.path));
  return predicate.operator === ":"
    ? textEquals(value, predicate.expected)
    : textIncludes(value, predicate.expected);
}

function stringForSearch(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(sanitizeValue(value));
}

function textIncludes(value: string | undefined, expected: string): boolean {
  return value?.toLowerCase().includes(expected.toLowerCase()) ?? false;
}

function textEquals(value: string | undefined, expected: string): boolean {
  return value?.toLowerCase() === expected.toLowerCase();
}

function componentByTarget(
  snapshot: AttemptSnapshot | undefined,
  target: string,
): ComponentRecord | undefined {
  return snapshot?.components.find(
    (component) => component.id === target || component.name === target,
  );
}

function publicComponentSnapshot(
  snapshot: AttemptSnapshot | undefined,
  component: ComponentRecord,
): NodeDevComponentSnapshot {
  return {
    id: component.id,
    name: component.name,
    ...(component.key !== undefined ? { key: component.key } : {}),
    ...(snapshot ? { compilation: snapshot.compilation } : {}),
    ...(component.source ? { source: component.source } : {}),
    propsSummary: component.propsSummary,
    ...(component.parentId ? { parentId: component.parentId } : {}),
    childIds: [...component.childIds],
    graphNodeIds: [...component.graphNodeIds],
  };
}

function addGraphNodeId(component: ComponentRecord, graphNodeId: string | undefined): void {
  if (graphNodeId && !component.graphNodeIds.includes(graphNodeId)) {
    component.graphNodeIds = [...component.graphNodeIds, graphNodeId];
  }
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      return current[Number(key)];
    }
    return isRecord(current) ? current[key] : undefined;
  }, value);
}

function diffValues(
  before: unknown,
  after: unknown,
  prefix: string | undefined,
): readonly PropsChange[] {
  if (!isRecord(before) || !isRecord(after) || prefix) {
    const sanitizedBefore = sanitizeValueForPath(before, prefix);
    const sanitizedAfter = sanitizeValueForPath(after, prefix);
    return JSON.stringify(sanitizedBefore) === JSON.stringify(sanitizedAfter)
      ? []
      : [{ path: prefix ?? "$", before: sanitizedBefore, after: sanitizedAfter }];
  }
  return diffObjectProperties(before, after, undefined);
}

function diffObjectProperties(
  before: unknown,
  after: unknown,
  prefix: string | undefined,
): readonly PropsChange[] {
  if (!isRecord(before) || !isRecord(after)) {
    return diffValues(before, after, prefix);
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.flatMap((key) => {
    const sanitizedBefore = sanitizePropValue(key, before[key]);
    const sanitizedAfter = sanitizePropValue(key, after[key]);
    return JSON.stringify(sanitizedBefore) === JSON.stringify(sanitizedAfter)
      ? []
      : [
          {
            path: prefix ? `${prefix}.${key}` : key,
            before: sanitizedBefore,
            after: sanitizedAfter,
          },
        ];
  });
}

function componentRelationChanges(
  before: ComponentRecord,
  after: ComponentRecord,
): readonly ComponentChange[] {
  return [
    ...arrayChange("childIds", before.childIds, after.childIds),
    ...arrayChange("graphNodeIds", before.graphNodeIds, after.graphNodeIds),
  ];
}

function arrayChange(
  path: string,
  before: readonly string[],
  after: readonly string[],
): readonly ComponentChange[] {
  return sameStringArray(before, after)
    ? []
    : [
        {
          path,
          before: [...before],
          after: [...after],
        },
      ];
}

function sameStringArray(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((value, index) => value === after[index]);
}

function componentSnapshotChanges(
  previous: AttemptSnapshot | undefined,
  latest: AttemptSnapshot | undefined,
): readonly ComponentChange[] {
  const previousById = new Map(
    (previous?.components ?? []).map((component) => [component.id, component]),
  );
  const latestById = new Map(
    (latest?.components ?? []).map((component) => [component.id, component]),
  );
  const ids = [...new Set([...previousById.keys(), ...latestById.keys()])];
  return ids.flatMap((id) => {
    const previousComponent = previousById.get(id);
    const latestComponent = latestById.get(id);
    if (!previousComponent && latestComponent) {
      return [{ path: `component.${id}`, after: publicComponentSnapshot(latest, latestComponent) }];
    }
    if (previousComponent && !latestComponent) {
      return [
        { path: `component.${id}`, before: publicComponentSnapshot(previous, previousComponent) },
      ];
    }
    if (previousComponent && latestComponent) {
      return diffObjectProperties(
        previousComponent.propsRaw,
        latestComponent.propsRaw,
        `component.${id}.props`,
      );
    }
    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

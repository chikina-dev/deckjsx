import type { AuthorElementNode, AuthorTreeNode } from "../authoring/tree";
import type { StyleSheetValue } from "../style/stylesheet/public";
import type { ComposedAuthorRoot, SourceSlotOrigin } from "./types";

function snapshotValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const previous = seen.get(value);
  if (previous !== undefined) {
    return previous;
  }

  if (value instanceof WeakMap || value instanceof WeakSet) {
    return value;
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value) as object | null);
  seen.set(value, clone);

  if (Array.isArray(value)) {
    value.forEach((item) => clone.push(snapshotValue(item, seen)));
    return clone;
  }

  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      return;
    }

    if ("value" in descriptor) {
      descriptor.value = snapshotValue(descriptor.value, seen);
    }
    Object.defineProperty(clone, key, descriptor);
  });

  return clone;
}

function snapshotAuthorTreeNode(node: AuthorTreeNode): AuthorTreeNode {
  if (node.kind === "text") {
    return {
      ...node,
      ...(node.sourceSpan ? { sourceSpan: { ...node.sourceSpan } } : {}),
    };
  }

  if (node.kind === "fragment") {
    return {
      ...node,
      children: node.children.map(snapshotAuthorTreeNode),
      ...(node.sourceSpan ? { sourceSpan: { ...node.sourceSpan } } : {}),
    };
  }

  return snapshotAuthorElementNode(node);
}

function snapshotAuthorElementNode(node: AuthorElementNode): AuthorElementNode {
  return {
    ...node,
    source: { ...node.source },
    props: snapshotValue(node.props) as typeof node.props,
    children: node.children.map(snapshotAuthorTreeNode),
    ...(node.sourceSpan ? { sourceSpan: { ...node.sourceSpan } } : {}),
    ...(node.mediaSourceOrigins
      ? {
          mediaSourceOrigins: snapshotValue(
            node.mediaSourceOrigins,
          ) as typeof node.mediaSourceOrigins,
        }
      : {}),
    ...(node.componentProvenance
      ? {
          componentProvenance: snapshotValue(
            node.componentProvenance,
          ) as typeof node.componentProvenance,
        }
      : {}),
  } as AuthorElementNode;
}

function snapshotSourceSlotOrigin(origin: SourceSlotOrigin): SourceSlotOrigin {
  return {
    source: { ...origin.source },
    field: origin.field,
    identityMaterial: [...origin.identityMaterial],
  };
}

function snapshotSlotOrigins(
  sourceRoot: AuthorTreeNode,
  snapshotRoot: AuthorTreeNode,
  sourceOrigins: WeakMap<AuthorTreeNode, SourceSlotOrigin>,
): WeakMap<AuthorTreeNode, SourceSlotOrigin> {
  const snapshotOrigins = new WeakMap<AuthorTreeNode, SourceSlotOrigin>();

  const visit = (sourceNode: AuthorTreeNode, snapshotNode: AuthorTreeNode): void => {
    const origin = sourceOrigins.get(sourceNode);
    if (origin) {
      snapshotOrigins.set(snapshotNode, snapshotSourceSlotOrigin(origin));
    }

    if (sourceNode.kind === "text" || snapshotNode.kind === "text") {
      return;
    }

    sourceNode.children.forEach((child, index) => {
      const snapshotChild = snapshotNode.children[index];
      if (snapshotChild) {
        visit(child, snapshotChild);
      }
    });
  };

  visit(sourceRoot, snapshotRoot);
  return snapshotOrigins;
}

export function snapshotComposedAuthorRoots(
  roots: readonly ComposedAuthorRoot[],
): readonly ComposedAuthorRoot[] {
  return roots.map((root) => {
    const snapshotRoot = snapshotAuthorElementNode(root.root);
    return {
      root: snapshotRoot,
      source: { ...root.source },
      sourceIdentityMaterial: [...root.sourceIdentityMaterial],
      stylesheets: root.stylesheets.map(
        (stylesheet) => snapshotValue(stylesheet) as StyleSheetValue,
      ),
      ...(root.theme !== undefined ? { theme: snapshotValue(root.theme) } : {}),
      ...(root.templates !== undefined ? { templates: snapshotValue(root.templates) } : {}),
      path: root.path,
      composition: { ...root.composition },
      slotOrigins: snapshotSlotOrigins(root.root, snapshotRoot, root.slotOrigins),
    };
  });
}

declare const deckJsxElementTag: unique symbol;

/**
 * Runtime-neutral element produced by deckjsx's JSX runtime.
 *
 * The generic tag parameter is used only by public TypeScript contracts. It is not a runtime field
 * and should not be inspected by integrations.
 */
export type DeckJsxElementValue = {
  readonly $$typeof: "deckjsx.author-tree";
};

export type DeckJsxElement<TTag extends string = string> = DeckJsxElementValue & {
  readonly [deckJsxElementTag]?: TTag;
};

/** Recursive low-level JSX node value used by the runtime. Prefer element-specific child types. */
export interface JsxNodeArray extends ReadonlyArray<JsxNode> {}

/** Low-level JSX runtime child value. Public authoring should use element-specific child contracts. */
export type JsxNode = DeckJsxElement | string | number | boolean | null | undefined | JsxNodeArray;

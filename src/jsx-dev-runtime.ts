import type { JsxKey, SourceSpan } from "./authoring/tree";
import { createElementWithMetadata } from "./jsx";
export { Fragment, jsx, jsxs } from "./jsx-runtime";
export type { JSX } from "./jsx-runtime";

type DevSource = {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
};

function sourceSpanFromDevSource(source: unknown): SourceSpan | undefined {
  if (typeof source !== "object" || source === null) {
    return undefined;
  }

  const devSource = source as DevSource;
  if (
    devSource.fileName === undefined &&
    devSource.lineNumber === undefined &&
    devSource.columnNumber === undefined
  ) {
    return undefined;
  }

  return {
    file: devSource.fileName,
    line: devSource.lineNumber,
    column: devSource.columnNumber,
  };
}

export function jsxDEV(
  type: unknown,
  props: unknown,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: unknown,
) {
  return createElementWithMetadata(type, props, key, sourceSpanFromDevSource(source));
}

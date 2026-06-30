import { jsx } from "deckjsx/jsx-runtime";
import type {
  DeckJsxElement,
  DeckJsxIntrinsicElements,
  IntrinsicPProps,
  IntrinsicSpanProps,
  IntrinsicTableCellProps,
  IntrinsicTableProps,
  IntrinsicTableRowProps,
  IntrinsicTableSectionProps,
} from "deckjsx";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const regressionTypeAssertions = {
  supportedSpan: true,
  supportedTable: true,
  supportedTableCellSpanProps: true,
  captionIsNotIntrinsic: true,
  colgroupIsNotIntrinsic: true,
  colIsNotIntrinsic: true,
  spanRejectsBoxStyle: true,
  imgRequiresSourceOrData: true,
  imgRejectsChildren: true,
  videoRejectsChildren: true,
  shapeRejectsChildren: true,
  viewRejectsImageOnlyStyle: true,
  textRejectsMediaOnlyStyle: true,
  tableRejectsFreeformChildren: true,
  viewRejectsPrimitiveText: true,
  viewRejectsInlineSpan: true,
} satisfies {
  supportedSpan: Assert<IsAssignable<"span", keyof DeckJsxIntrinsicElements>>;
  supportedTable: Assert<IsAssignable<"table", keyof DeckJsxIntrinsicElements>>;
  supportedTableCellSpanProps: Assert<
    IsAssignable<{ colspan: 2; rowspan: 2 }, DeckJsxIntrinsicElements["td"]>
  >;
  captionIsNotIntrinsic: Assert<
    IsAssignable<"caption", keyof DeckJsxIntrinsicElements> extends true ? false : true
  >;
  colgroupIsNotIntrinsic: Assert<
    IsAssignable<"colgroup", keyof DeckJsxIntrinsicElements> extends true ? false : true
  >;
  colIsNotIntrinsic: Assert<
    IsAssignable<"col", keyof DeckJsxIntrinsicElements> extends true ? false : true
  >;
  spanRejectsBoxStyle: Assert<
    IsAssignable<{ backgroundColor: "red" }, DeckJsxIntrinsicElements["span"]> extends true
      ? false
      : true
  >;
  imgRequiresSourceOrData: Assert<
    IsAssignable<{}, DeckJsxIntrinsicElements["img"]> extends true ? false : true
  >;
  imgRejectsChildren: Assert<
    IsAssignable<
      { src: "image.png"; children: "caption" },
      DeckJsxIntrinsicElements["img"]
    > extends true
      ? false
      : true
  >;
  videoRejectsChildren: Assert<
    IsAssignable<
      { src: "video.mp4"; children: "caption" },
      DeckJsxIntrinsicElements["video"]
    > extends true
      ? false
      : true
  >;
  shapeRejectsChildren: Assert<
    IsAssignable<
      { shape: "rect"; children: "caption" },
      DeckJsxIntrinsicElements["shape"]
    > extends true
      ? false
      : true
  >;
  viewRejectsImageOnlyStyle: Assert<
    IsAssignable<{ style: { objectFit: "cover" } }, DeckJsxIntrinsicElements["div"]> extends true
      ? false
      : true
  >;
  textRejectsMediaOnlyStyle: Assert<
    IsAssignable<{ style: { objectFit: "cover" } }, DeckJsxIntrinsicElements["p"]> extends true
      ? false
      : true
  >;
  tableRejectsFreeformChildren: Assert<
    IsAssignable<{ children: "raw text" }, DeckJsxIntrinsicElements["table"]> extends true
      ? false
      : true
  >;
  viewRejectsPrimitiveText: Assert<
    IsAssignable<{ children: "raw text" }, DeckJsxIntrinsicElements["div"]> extends true
      ? false
      : true
  >;
  viewRejectsInlineSpan: Assert<
    IsAssignable<{ children: DeckJsxElement<"span"> }, DeckJsxIntrinsicElements["div"]> extends true
      ? false
      : true
  >;
};
void regressionTypeAssertions;
const exportedSpanProps = {
  children: "inline",
  style: { color: "red" },
} satisfies IntrinsicSpanProps;
void exportedSpanProps;

const exportedTextAcceptsSpan = {
  children: jsx("span", { children: "inline" }),
} satisfies IntrinsicPProps;
void exportedTextAcceptsSpan;

const exportedTextRejectsViewChild = {
  // @ts-expect-error exported text props only accept primitive text and inline spans.
  children: jsx("div", { children: "bad" }),
} satisfies IntrinsicPProps;
void exportedTextRejectsViewChild;

const exportedViewRejectsPrimitiveText = {
  // @ts-expect-error exported view props only accept authored elements, not primitive text.
  children: "raw text",
} satisfies DeckJsxIntrinsicElements["div"];
void exportedViewRejectsPrimitiveText;

const exportedViewRejectsSpan = {
  // @ts-expect-error exported view props do not accept inline spans directly.
  children: jsx("span", { children: "inline" }),
} satisfies DeckJsxIntrinsicElements["div"];
void exportedViewRejectsSpan;

const exportedSpanRejectsTextBlockChild = {
  // @ts-expect-error exported span props only accept primitive text and nested spans.
  children: jsx("p", { children: "bad" }),
} satisfies IntrinsicSpanProps;
void exportedSpanRejectsTextBlockChild;

const exportedTableProps = {
  style: { tableLayout: "fixed" },
  children: jsx("tbody", { children: jsx("tr", { children: jsx("td", { children: "ok" }) }) }),
} satisfies IntrinsicTableProps;
void exportedTableProps;

const exportedTableRejectsParagraph = {
  // @ts-expect-error exported table props only accept table sections or rows as children.
  children: jsx("p", { children: "bad" }),
} satisfies IntrinsicTableProps;
void exportedTableRejectsParagraph;

const exportedTableSectionProps = {
  children: jsx("tr", { children: jsx("td", { children: "ok" }) }),
} satisfies IntrinsicTableSectionProps;
void exportedTableSectionProps;

const exportedTableSectionRejectsCell = {
  // @ts-expect-error exported table section props only accept rows as children.
  children: jsx("td", { children: "bad" }),
} satisfies IntrinsicTableSectionProps;
void exportedTableSectionRejectsCell;

const exportedTableRowProps = {
  children: jsx("td", { children: "ok" }),
} satisfies IntrinsicTableRowProps;
void exportedTableRowProps;

const exportedTableRowRejectsParagraph = {
  // @ts-expect-error exported table row props only accept cells as children.
  children: jsx("p", { children: "bad" }),
} satisfies IntrinsicTableRowProps;
void exportedTableRowRejectsParagraph;

const exportedTableCellProps = {
  colspan: 2,
  style: { fontWeight: 700 },
  children: "ok",
} satisfies IntrinsicTableCellProps;
void exportedTableCellProps;

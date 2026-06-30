import type {
  ClassNameValue,
  DiagnosticLabel,
  DiagnosticSourceSpan,
  ShapeName,
  StyleForAuthoredTag,
  TableCellSpan,
  TableCellStyle,
  TableRowStyle,
  TableSectionStyle,
  TableStyle,
} from "deckjsx";

const authoredTagTextStyle = {
  color: "red",
  fontSize: 24,
} satisfies StyleForAuthoredTag<"p">;
void authoredTagTextStyle;

const authoredTagImageStyle = {
  objectFit: "cover",
} satisfies StyleForAuthoredTag<"img">;
void authoredTagImageStyle;

const authoredTagShapeStyle = {
  fill: "#2563EB",
  stroke: "1pt solid #1D4ED8",
} satisfies StyleForAuthoredTag<"shape">;
void authoredTagShapeStyle;

const publicShapeName: ShapeName = "roundRect";
void publicShapeName;

// @ts-expect-error shape names are a closed public authoring vocabulary.
const invalidPublicShapeName: ShapeName = "triangle";
void invalidPublicShapeName;

const publicTableCellSpan: TableCellSpan = 64;
void publicTableCellSpan;

// @ts-expect-error table cell spans are capped at the public authoring boundary.
const invalidPublicTableCellSpan: TableCellSpan = 65;
void invalidPublicTableCellSpan;

const authoredTagSpanStyle = {
  color: "blue",
} satisfies StyleForAuthoredTag<"span">;
void authoredTagSpanStyle;

const authoredTagRejectsWrongStyle = {
  // @ts-expect-error image fit is not part of text tag style.
  objectFit: "cover",
} satisfies StyleForAuthoredTag<"p">;
void authoredTagRejectsWrongStyle;

const authoredTagRejectsUnknownTag = {
  padding: 1,
  // @ts-expect-error StyleForAuthoredTag only accepts deckjsx authored tags.
} satisfies StyleForAuthoredTag<"button">;
void authoredTagRejectsUnknownTag;

// @ts-expect-error StackAxis is internal layout vocabulary, not root public authoring API.
export type NoPublicStackAxis = import("deckjsx").StackAxis;

// @ts-expect-error StackAlignment is internal layout vocabulary, not root public authoring API.
export type NoPublicStackAlignment = import("deckjsx").StackAlignment;

// @ts-expect-error SourceSpan is author-tree/dev-runtime metadata, not root public authoring API.
export type NoPublicSourceSpan = import("deckjsx").SourceSpan;

const publicDiagnosticSourceSpan = {
  file: "/project/src/slides.tsx",
  line: 12,
  column: 5,
} satisfies DiagnosticSourceSpan;
void publicDiagnosticSourceSpan;

const publicDiagnosticLabel = {
  path: "slide[0]",
  message: "Invalid authoring input",
  sourceSpan: publicDiagnosticSourceSpan,
} satisfies DiagnosticLabel;
void publicDiagnosticLabel;

const exportedTableStyle = {
  tableLayout: "fixed",
  borderCollapse: "separate",
} satisfies TableStyle;
void exportedTableStyle;

const exportedTableSectionStyle = {
  display: "block",
} satisfies TableSectionStyle;
void exportedTableSectionStyle;

const exportedTableRowStyle = {
  height: 0.4,
} satisfies TableRowStyle;
void exportedTableRowStyle;

const exportedTableCellStyle = {
  fontWeight: 700,
} satisfies TableCellStyle;
void exportedTableCellStyle;

const clsxLikeClassName = [
  "card selected",
  false,
  null,
  undefined,
  ["nested", { active: true, disabled: false, muted: null }],
] as const satisfies ClassNameValue;
void clsxLikeClassName;

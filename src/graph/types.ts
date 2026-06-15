import type { AuthoredTag, SectioningTag } from "../authoring/tags";
import type { JsxKey, SourceSpan } from "../authoring/tree";
import type { StyleDeclaration } from "../style/types";

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type GraphNodeId = Brand<string, "GraphNodeId">;
export type StyleEntityId = Brand<string, "StyleEntityId">;
export type AssetEntityId = Brand<string, "AssetEntityId">;
export type SourceIdentity = Brand<string, "SourceIdentity">;

export type SemanticNodeKind =
  | "container"
  | "document"
  | "image"
  | "shape"
  | "slide"
  | "table"
  | "tableCell"
  | "tableRow"
  | "tableSection"
  | "text"
  | "textRun"
  | "video";

export type SemanticRole =
  | { readonly kind: "document" }
  | { readonly kind: "slide" }
  | { readonly kind: "genericContainer" }
  | { readonly kind: "sectioning"; readonly tag: SectioningTag }
  | { readonly kind: "figure" }
  | { readonly kind: "paragraph" }
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { readonly kind: "image" }
  | { readonly kind: "shape" }
  | { readonly kind: "table" }
  | { readonly kind: "tableSection"; readonly sectionKind: TableSectionKind }
  | { readonly kind: "tableRow" }
  | { readonly kind: "tableCell"; readonly cellKind: TableCellKind }
  | { readonly kind: "video" };

export type TableSectionKind = "head" | "body" | "foot";
export type TableCellKind = "header" | "data";

export type SourceOrigin =
  | { readonly kind: "root" }
  | {
      readonly kind: "mounted";
      readonly sourceKey: string;
      readonly sourceIdentity: SourceIdentity;
    };

export type SemanticOrigin = {
  readonly kind: "authored" | "implicit";
  readonly path: string;
  readonly source?: SourceOrigin;
  readonly sourceSpan?: SourceSpan;
  readonly reason?: "primitive-text-in-container" | "table-row-shorthand";
};

export type SemanticTemplateRef = {
  readonly name: string;
};

export type SemanticTemplateAreaRef = {
  readonly template: string;
  readonly area: string;
};

export type BaseSemanticNode = {
  readonly id: GraphNodeId;
  readonly kind: SemanticNodeKind;
  readonly origin: SemanticOrigin;
  readonly authoredTag?: AuthoredTag;
  readonly role?: SemanticRole;
  readonly key?: JsxKey;
  readonly styleRef?: StyleEntityId;
  readonly templateAreaRef?: SemanticTemplateAreaRef;
};

export type SemanticDocumentNode = BaseSemanticNode & {
  readonly kind: "document";
  readonly children: readonly GraphNodeId[];
};

export type SemanticSlideNode = BaseSemanticNode & {
  readonly kind: "slide";
  readonly name?: string;
  readonly templateRef?: SemanticTemplateRef;
  readonly children: readonly GraphNodeId[];
};

export type SemanticContainerNode = BaseSemanticNode & {
  readonly kind: "container";
  readonly children: readonly GraphNodeId[];
};

export type SemanticTextNode = BaseSemanticNode & {
  readonly kind: "text";
  readonly inlineChildren: readonly GraphNodeId[];
  readonly implicit?: boolean;
};

export type SemanticTextRunNode = BaseSemanticNode & {
  readonly kind: "textRun";
  readonly text: string;
};

export type SemanticImageNode = BaseSemanticNode & {
  readonly kind: "image";
  readonly assetRef?: AssetEntityId;
};

export type SemanticVideoNode = BaseSemanticNode & {
  readonly kind: "video";
  readonly assetRef?: AssetEntityId;
  readonly posterAssetRef?: AssetEntityId;
};

export type SemanticShapeNode = BaseSemanticNode & {
  readonly kind: "shape";
  readonly shape: "rect" | "ellipse" | "line";
};

export type SemanticTableNode = BaseSemanticNode & {
  readonly kind: "table";
  readonly children: readonly GraphNodeId[];
};

export type SemanticTableSectionNode = BaseSemanticNode & {
  readonly kind: "tableSection";
  readonly sectionKind: TableSectionKind;
  readonly children: readonly GraphNodeId[];
};

export type SemanticTableRowNode = BaseSemanticNode & {
  readonly kind: "tableRow";
  readonly children: readonly GraphNodeId[];
};

export type SemanticTableCellNode = BaseSemanticNode & {
  readonly kind: "tableCell";
  readonly cellKind: TableCellKind;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly children: readonly GraphNodeId[];
};

export type SemanticNode =
  | SemanticContainerNode
  | SemanticDocumentNode
  | SemanticImageNode
  | SemanticVideoNode
  | SemanticShapeNode
  | SemanticTableNode
  | SemanticTableSectionNode
  | SemanticTableRowNode
  | SemanticTableCellNode
  | SemanticSlideNode
  | SemanticTextNode
  | SemanticTextRunNode;

export type StyleClassRef = {
  readonly name: string;
  readonly index: number;
};

export type StyleEntity = {
  readonly id: StyleEntityId;
  readonly target: SemanticNodeKind;
  readonly authored: {
    readonly style?: StyleDeclaration;
    readonly classRefs?: readonly StyleClassRef[];
  };
};

export type AssetEntity = {
  readonly id: AssetEntityId;
  readonly kind: "image" | "video";
  readonly sourceField: "src" | "data" | "poster" | "posterData";
  readonly source:
    | { readonly kind: "path"; readonly path: string }
    | { readonly kind: "data"; readonly data: string }
    | { readonly kind: "url"; readonly url: string };
  readonly metadata: {
    readonly mediaType?: string;
    readonly byteLength?: number;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly contentHash?: string;
  };
  readonly resolution: "failed" | "resolved" | "unresolved";
};

export type SemanticAuthorGraph = {
  readonly documentId: GraphNodeId;
  readonly nodes: ReadonlyMap<GraphNodeId, SemanticNode>;
  readonly styles: ReadonlyMap<StyleEntityId, StyleEntity>;
  readonly assets: ReadonlyMap<AssetEntityId, AssetEntity>;
  readonly templates: ReadonlyMap<string, import("../templates").SlideTemplateSet>;
};

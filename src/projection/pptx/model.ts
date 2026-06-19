import type { DeckOptions } from "../../authoring/index";
import type {
  AssetProbeResult,
  AssetResolutionHashSource,
  AssetResolutionProvenanceKind,
  AssetSource,
} from "../../assets";
import type { Diagnostics } from "../../diagnostics";
import type { ComponentProvenance } from "../../authoring-metadata";
import type {
  AssetEntity,
  Brand,
  GraphNodeId,
  SemanticNode,
  SourceOrigin,
  StyleEntityId,
} from "../../graph";
import type {
  BackgroundImageLayerIR,
  EdgeStrokeIR,
  FillIR,
  FrameIR,
  HyperlinkIR,
  ImageCropIR,
  ImageSourceIR,
  ObjectPositionIR,
  ProjectedLayoutClip,
  ProjectedUnsupportedFallback,
  ProjectedUnsupportedFallbackStrategy,
  ProjectedUnsupportedSemantic,
  ProjectedUnsupportedSemanticFeature,
  ShadowIR,
  StrokeIR,
  TextRunIR,
  TextStyleIR,
  ProjectedLayoutTableSection,
} from "../../layout/projected";
import type { ProjectionFormat } from "../../pipeline";
import type { CssVisibility, StyleDeclarationValue } from "../../style/types";
import type { TemplateAreaKind } from "../../templates";

export type PackagePartId = Brand<string, "PackagePartId">;
export type PptxElementId = Brand<string, "PptxElementId">;
export type PptxSerializedIdentity = Brand<string, "PptxSerializedIdentity">;

export type PptxPackagePartCategory = "authored-content" | "manifest" | "support";

export type PptxPackagePartKind =
  | "content-types"
  | "document-properties"
  | "media"
  | "notes-master"
  | "notes-slide"
  | "presentation"
  | "presentation-properties"
  | "relationships"
  | "slide"
  | "slide-layout"
  | "slide-master"
  | "table-styles"
  | "theme"
  | "view-properties";

export type PptxElementKind = "group" | "image" | "shape" | "table" | "text" | "video";

export type PptxElementOrigin = {
  readonly graphNodeIds?: readonly GraphNodeId[];
  readonly styleEntityIds?: readonly StyleEntityId[];
  readonly assetEntityIds?: readonly AssetEntity["id"][];
  readonly source?: SourceOrigin;
  readonly componentProvenance?: ComponentProvenance;
};

export type PptxSerializedIdentities = {
  readonly hyperlinkRelationshipId?: PptxSerializedIdentity;
  readonly mediaRelationshipId?: PptxSerializedIdentity;
  readonly relationshipId?: PptxSerializedIdentity;
  readonly shapeObjectId?: PptxSerializedIdentity;
};

export type PptxMeasurement = {
  readonly frame?: FrameIR;
  readonly overflow?: "clip" | "fit" | "visible";
};

export type PptxVisibility = CssVisibility;

export type PptxShadow = ShadowIR & {
  readonly opacity: number;
};

export type PptxLayoutAnchor = {
  readonly template: string;
  readonly area: string;
  readonly kind: TemplateAreaKind;
  readonly frame: FrameIR;
};

export type PptxClip = ProjectedLayoutClip;

export type PptxTextBodyStyle = TextStyleIR & {
  readonly fit: NonNullable<TextStyleIR["fit"]>;
  readonly textDirection: NonNullable<TextStyleIR["textDirection"]>;
  readonly verticalAlign: NonNullable<TextStyleIR["verticalAlign"]>;
  readonly wrap: boolean;
};

export type PptxBackgroundImageLayer = Omit<BackgroundImageLayerIR, "objectPosition"> & {
  readonly objectPosition: ObjectPositionIR;
  readonly paintOrder: PptxPaintOrderInput;
  readonly serialized: PptxSerializedIdentities;
};

export type PptxBackgroundFillLayer = FillIR & {
  readonly paintOrder: PptxPaintOrderInput;
  readonly serialized: PptxSerializedIdentities;
};

export type PptxBackgroundLayer = PptxBackgroundImageLayer | PptxBackgroundFillLayer;

export type PptxUnsupportedSemanticFeature = ProjectedUnsupportedSemanticFeature;

export type PptxUnsupportedFallbackStrategy = ProjectedUnsupportedFallbackStrategy;

export type PptxUnsupportedFallback = ProjectedUnsupportedFallback;

export type PptxUnsupportedSemantic = ProjectedUnsupportedSemantic;

type PptxBaseElement = {
  readonly id: PptxElementId;
  readonly kind: PptxElementKind;
  readonly packagePartId: PackagePartId;
  readonly serialized: PptxSerializedIdentities;
  readonly origin: PptxElementOrigin;
  readonly frame: FrameIR;
  readonly opacity?: number;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly paintOrder: PptxPaintOrderInput;
  readonly visibility?: PptxVisibility;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly clip?: PptxClip;
  readonly measurement?: PptxMeasurement;
  readonly layoutAnchor?: PptxLayoutAnchor;
  readonly unsupportedSemantics?: readonly PptxUnsupportedSemantic[];
};

export type PptxGroupElement = PptxBaseElement & {
  readonly kind: "group";
  readonly children: readonly PptxElement[];
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly PptxBackgroundLayer[];
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly generatedStrokes?: readonly PptxGeneratedStrokeLayer[];
  readonly shadow?: PptxShadow;
  readonly radiusEmu?: number;
};

export type PptxTextElement = PptxBaseElement & {
  readonly kind: "text";
  readonly content: {
    readonly text: string;
    readonly runs?: readonly TextRunIR[];
  };
  readonly style: PptxTextBodyStyle;
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly PptxBackgroundLayer[];
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly generatedStrokes?: readonly PptxGeneratedStrokeLayer[];
  readonly shadow?: PptxShadow;
  readonly hyperlink?: HyperlinkIR;
  readonly radiusEmu?: number;
};

export type PptxPictureElement = PptxBaseElement & {
  readonly kind: "image";
  readonly mediaPartId?: PackagePartId;
  readonly sourceFrame: FrameIR;
  readonly source: ImageSourceIR;
  readonly fit: "contain" | "cover" | "stretch";
  readonly objectPosition: ObjectPositionIR;
  readonly crop?: ImageCropIR;
  readonly transparency?: number;
  readonly rounding?: boolean;
  readonly shadow?: PptxShadow;
  readonly hyperlink?: HyperlinkIR;
};

export type PptxVideoElement = PptxBaseElement & {
  readonly kind: "video";
  readonly mediaPartId?: PackagePartId;
  readonly posterMediaPartId?: PackagePartId;
  readonly sourceFrame: FrameIR;
  readonly source: ImageSourceIR;
  readonly posterSource?: ImageSourceIR;
  readonly fit: "contain" | "cover" | "stretch";
  readonly objectPosition: ObjectPositionIR;
  readonly transparency?: number;
  readonly rounding?: boolean;
  readonly shadow?: PptxShadow;
};

export type PptxShapeElement = PptxBaseElement & {
  readonly kind: "shape";
  readonly shape: "rect" | "ellipse" | "line";
  readonly fill?: FillIR;
  readonly backgroundLayers?: readonly PptxBackgroundLayer[];
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly generatedStrokes?: readonly PptxGeneratedStrokeLayer[];
  readonly shadow?: PptxShadow;
  readonly hyperlink?: HyperlinkIR;
  readonly radiusEmu?: number;
};

export type PptxTableElement = PptxBaseElement & {
  readonly kind: "table";
  readonly sections: readonly PptxTableSection[];
};

export type PptxTableSection = {
  readonly kind: "tableSection";
  readonly sectionKind: ProjectedLayoutTableSection["sectionKind"];
  readonly rows: readonly PptxTableRow[];
};

export type PptxTableRow = {
  readonly kind: "tableRow";
  readonly frame: FrameIR;
  readonly cells: readonly PptxTableCell[];
};

export type PptxTableCell = {
  readonly kind: "tableCell";
  readonly cellKind: "header" | "data";
  readonly gridColumnIndex: number;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly frame: FrameIR;
  readonly fill?: FillIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly style: TextStyleIR;
  readonly text: string;
  readonly children: readonly PptxElement[];
  readonly unsupportedSemantics?: readonly PptxUnsupportedSemantic[];
};

export type PptxElement =
  | PptxGroupElement
  | PptxPictureElement
  | PptxShapeElement
  | PptxTableElement
  | PptxTextElement
  | PptxVideoElement;

export type PptxEmissionTarget = "slide" | "slideLayout" | "slideMaster";

export type PptxPaintOrderInput = {
  readonly zIndex?: number;
  readonly siblingOrder: number;
  readonly generatedLayerRole?: "authored" | "background" | "border" | "outline" | "template";
};

export type PptxGeneratedStrokeLayer = {
  readonly kind: "stroke";
  readonly role: "border" | "outline";
  readonly edge?: "top" | "right" | "bottom" | "left";
  readonly id: PptxElementId;
  readonly serialized: PptxSerializedIdentities;
  readonly frame: FrameIR;
  readonly stroke: StrokeIR;
  readonly shape: "line" | "rect";
  readonly paintOrder: PptxPaintOrderInput;
};

export type PptxDrawingNode = PptxElement & {
  readonly emissionTarget: PptxEmissionTarget;
  readonly paintOrderIndex: number;
  readonly paintOrder: PptxPaintOrderInput;
};

export type PptxSlideDrawing = {
  readonly children: readonly PptxDrawingNode[];
};

export type PptxRelationship = {
  readonly id: PptxSerializedIdentity;
  readonly target: string;
  readonly targetMode?: "external";
  readonly targetPartId?: PackagePartId;
  readonly targetPath: string;
  readonly type: string;
};

export type PptxPackagePartBase<
  TCategory extends PptxPackagePartCategory = PptxPackagePartCategory,
  TKind extends PptxPackagePartKind = PptxPackagePartKind,
  TPayload extends PptxPackagePartPayload = PptxPackagePartPayload,
> = {
  readonly id: PackagePartId;
  readonly category: TCategory;
  readonly kind: TKind;
  readonly requirement?: PptxPackagePartRequirement;
  readonly orderKey?: PptxPackagePartOrderKey;
  readonly fingerprint?: string;
  readonly dependencyFingerprints?: readonly PptxPackagePartDependencyFingerprint[];
  readonly path: string;
  readonly relationships?: readonly PptxRelationship[];
  readonly origin?: {
    readonly graphNodeIds?: readonly GraphNodeId[];
    readonly source?: SourceOrigin;
  };
  readonly payload?: TPayload;
};

export type PptxPackagePartOrderGroup =
  | "contentTypes"
  | "documentProperties"
  | "media"
  | "other"
  | "presentation"
  | "presentationProperties"
  | "presentationRelationships"
  | "rootRelationships"
  | "slide"
  | "slideLayout"
  | "slideLayoutRelationships"
  | "slideMaster"
  | "slideMasterRelationships"
  | "slideRelationships"
  | "tableStyles"
  | "theme"
  | "viewProperties";

export type PptxPackagePartOrderKey = {
  readonly group: PptxPackagePartOrderGroup;
  readonly groupOrder: number;
  readonly sequence: number;
  readonly path: string;
  readonly value: string;
};

export type PptxPackagePartRequirementStatus = "conditional" | "optional" | "required";

export type PptxPackagePartRequirementCondition =
  | "explicit"
  | "hasRelationships"
  | "minimalPackage"
  | "referencedByRelationship";

export type PptxPackagePartRequirement = {
  readonly status: PptxPackagePartRequirementStatus;
  readonly required: boolean;
  readonly reason: string;
  readonly condition?: PptxPackagePartRequirementCondition;
  readonly dependencies?: readonly PackagePartId[];
};

export type PptxPackagePartDependencyFingerprint = {
  readonly packagePartId: PackagePartId;
  readonly fingerprint: string;
};

export type PptxMediaMetadata = {
  readonly mediaType?: string;
  readonly extension?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly byteLength?: number;
  readonly hash?: string;
};

export type PptxMediaPartPayload = {
  readonly mediaKind?: "image" | "video";
  readonly source: ImageSourceIR;
  readonly sources: readonly ImageSourceIR[];
  readonly elementId?: PptxElementId;
  readonly elementIds?: readonly PptxElementId[];
  readonly assetEntityId?: AssetEntity["id"];
  readonly assetEntityIds?: readonly AssetEntity["id"][];
  readonly allocationKey?: string;
  readonly metadata?: PptxMediaMetadata;
};

export type PptxMediaPart = PptxPackagePartBase<
  "authored-content",
  "media",
  PptxMediaPartPayload
> & {
  readonly payload: PptxMediaPartPayload;
};

export type PptxThemeProjectionPayload = {
  readonly id: string;
  readonly purpose: "default";
  readonly source: "deckjsx-default";
  readonly trace: PptxThemeProjectionTrace;
};

export type PptxThemeProjectionTrace = {
  readonly wholeThemeMappings: readonly PptxThemeWholeThemeMapping[];
  readonly valueGroupFingerprints: readonly PptxThemeValueGroupFingerprint[];
  readonly supportMappings: readonly PptxThemeSupportMapping[];
  readonly defaultStyleDecisions: readonly PptxThemeDefaultStyleDecision[];
  readonly concreteDrawingProperties: readonly PptxThemeConcreteDrawingPropertyMapping[];
  readonly unprojected: readonly PptxThemeUnprojectedMapping[];
  readonly effectiveInheritance: readonly PptxThemeEffectiveInheritanceTrace[];
  readonly referenceSerialization: readonly PptxThemeReferenceSerializationChoice[];
};

export type PptxThemeValueGroup = "colorScheme" | "fontScheme" | "formatScheme" | "themeDefaults";

export type PptxThemeWholeThemeMapping = {
  readonly source: "deckjsx-default";
  readonly projectedAs: "themePart";
  readonly purpose: "default";
  readonly themePartId?: PackagePartId;
  readonly groups: readonly PptxThemeValueGroup[];
  readonly fingerprint: string;
};

export type PptxThemeValueGroupFingerprint = {
  readonly group: PptxThemeValueGroup;
  readonly source: "deckjsx-default" | "themeDefault";
  readonly projectedAs: "themeSupport" | "themeProjectionTrace";
  readonly fingerprint: string;
  readonly itemCount: number;
};

export type PptxThemeSupportMapping = {
  readonly source: "deckjsx-default";
  readonly projectedAs: "themeSupport";
  readonly groups: readonly ("colorScheme" | "fontScheme" | "formatScheme")[];
};

export type PptxThemeDefaultStyleDecisionKind =
  | "projectConcreteDrawingProperty"
  | "projectDrawingMetadata"
  | "projectFilteredState"
  | "projectLayoutInput"
  | "preserveAsStyleInput"
  | "preserveUnsupportedSemantic";

export type PptxThemeDefaultStyleProjectionTarget =
  | "concreteDrawingProperty"
  | "drawingMetadata"
  | "filteredProjectionInput"
  | "layoutInput"
  | "styleInput"
  | "unsupportedSemanticFallback";

export type PptxThemeDefaultStyleDecision = {
  readonly source: "themeDefault";
  readonly graphNodeId: GraphNodeId;
  readonly authoredTag?: string;
  readonly origin?: SourceOrigin;
  readonly defaultKey: string;
  readonly property: string;
  readonly resolvedValue: StyleDeclarationValue;
  readonly decision: PptxThemeDefaultStyleDecisionKind;
  readonly projectedAs: PptxThemeDefaultStyleProjectionTarget;
  readonly reason: string;
};

export type PptxThemeConcreteDrawingPropertyMapping = {
  readonly graphNodeId: GraphNodeId;
  readonly authoredTag?: string;
  readonly source?: SourceOrigin;
  readonly defaultKey: string;
  readonly property: string;
  readonly projectedAs: "concreteDrawingProperty";
  readonly resolvedValue: StyleDeclarationValue;
};

export type PptxThemeUnprojectedMapping = {
  readonly source: "themeDefault";
  readonly graphNodeId: GraphNodeId;
  readonly authoredTag?: string;
  readonly origin?: SourceOrigin;
  readonly defaultKey: string;
  readonly property: string;
  readonly projectedAs: "unprojected";
  readonly resolvedValue: StyleDeclarationValue;
  readonly reason: string;
};

export type PptxThemeEffectiveInheritanceStep =
  | "themePart"
  | "slideMaster"
  | "slideLayout"
  | "slide"
  | "drawing";

export type PptxThemeEffectiveInheritanceTrace = {
  readonly source: "themeDefault";
  readonly graphNodeId: GraphNodeId;
  readonly authoredTag?: string;
  readonly origin?: SourceOrigin;
  readonly defaultKey: string;
  readonly property: string;
  readonly projectedAs: "concreteDrawingProperty" | "unprojected";
  readonly resolvedValue: StyleDeclarationValue;
  readonly themePartId?: PackagePartId;
  readonly slideMasterPartId?: PackagePartId;
  readonly slideLayoutPartId?: PackagePartId;
  readonly slidePartId?: PackagePartId;
  readonly inheritedThrough: readonly PptxThemeEffectiveInheritanceStep[];
  readonly reason: string;
};

export type PptxThemeReferenceSerializationDecision =
  | "deferThemeReferenceSerialization"
  | "emitConcreteValue"
  | "noThemeReferenceCandidate";

export type PptxThemeReferenceSerializationKind =
  | "concreteDrawingValue"
  | "latinTypeface"
  | "srgbClr";

export type PptxThemeReferenceCandidate =
  | {
      readonly kind: "schemeColor";
      readonly value: string;
      readonly themePartId?: PackagePartId;
    }
  | {
      readonly kind: "fontScheme";
      readonly value: "majorLatin" | "minorLatin";
      readonly themePartId?: PackagePartId;
    };

export type PptxThemeReferenceSerializationChoice = {
  readonly source: "themeDefault";
  readonly graphNodeId: GraphNodeId;
  readonly authoredTag?: string;
  readonly origin?: SourceOrigin;
  readonly defaultKey: string;
  readonly property: string;
  readonly resolvedValue: StyleDeclarationValue;
  readonly currentSerialization: PptxThemeReferenceSerializationKind;
  readonly decision: PptxThemeReferenceSerializationDecision;
  readonly candidate?: PptxThemeReferenceCandidate;
  readonly reason: string;
};

export type PptxThemePartPayload = {
  readonly kind: "theme";
  readonly name: string;
  readonly editable: true;
  readonly projection: PptxThemeProjectionPayload;
  readonly colorScheme: {
    readonly name: string;
    readonly colors: Readonly<Record<string, string>>;
  };
  readonly fontScheme: {
    readonly name: string;
    readonly majorLatin: string;
    readonly minorLatin: string;
  };
  readonly formatScheme: {
    readonly name: string;
  };
};

export type PptxPresentationSlideMasterId = {
  readonly slideMasterPartId: PackagePartId;
  readonly id: string;
};

export type PptxDefaultTextStyleLevelNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type PptxDefaultTextStyleLevel<
  Level extends PptxDefaultTextStyleLevelNumber = PptxDefaultTextStyleLevelNumber,
> = {
  readonly level: Level;
  readonly marginLeftEmu: number;
  readonly alignment: "l" | "ctr" | "r" | "just";
  readonly defaultTabSizeEmu: number;
  readonly fontSizePt: number;
  readonly colorThemeReference: string;
  readonly latinTypeface: string;
  readonly eastAsianTypeface: string;
  readonly complexScriptTypeface: string;
};

export type PptxDefaultTextStyleLevels = readonly [
  PptxDefaultTextStyleLevel<1>,
  PptxDefaultTextStyleLevel<2>,
  PptxDefaultTextStyleLevel<3>,
  PptxDefaultTextStyleLevel<4>,
  PptxDefaultTextStyleLevel<5>,
  PptxDefaultTextStyleLevel<6>,
  PptxDefaultTextStyleLevel<7>,
  PptxDefaultTextStyleLevel<8>,
  PptxDefaultTextStyleLevel<9>,
];

export type PptxDefaultTextStylePayload = {
  readonly source: "themeProjection";
  readonly levels: PptxDefaultTextStyleLevels;
};

export type PptxSlideMasterLayoutId = {
  readonly slideLayoutPartId: PackagePartId;
  readonly id: string;
};

export type PptxSlideMasterPartPayload = {
  readonly kind: "slide-master";
  readonly name: string;
  readonly editable: true;
  readonly themePartId: PackagePartId;
  readonly slideLayoutPartIds: readonly PackagePartId[];
  readonly slideLayoutIds: readonly PptxSlideMasterLayoutId[];
  readonly colorMap: Readonly<Record<string, string>>;
  readonly textStyles: {
    readonly title: "empty";
    readonly body: "empty";
    readonly other: "empty";
  };
};

export type PptxSlideLayoutPartPayload = {
  readonly kind: "slide-layout";
  readonly name: string;
  readonly editable: true;
  readonly layoutType: "blank";
  readonly preserve: true;
  readonly slideMasterPartId: PackagePartId;
  readonly placeholderStrategy: "none";
  readonly template?: {
    readonly sourceKey: string;
    readonly name: string;
  };
  readonly layoutAnchors?: readonly PptxSlideLayoutAnchor[];
};

export type PptxSlideLayoutAnchor = {
  readonly template: string;
  readonly area: string;
  readonly kind: TemplateAreaKind;
  readonly frame: FrameIR;
  readonly placeholderStrategy: "none";
};

export type PptxEmptySupportPartPayload =
  | {
      readonly kind: "presentation-properties";
      readonly editable: true;
      readonly settings: Record<string, never>;
    }
  | {
      readonly kind: "view-properties";
      readonly editable: true;
      readonly settings: Record<string, never>;
    };

export type PptxTableStylePaint = {
  readonly themeReference?: string;
  readonly color?: string;
};

export type PptxTableStyleText = {
  readonly themeReference?: string;
  readonly bold?: boolean;
};

export type PptxTableStyleBorder = {
  readonly themeReference: string;
  readonly widthPt?: number;
};

export type PptxTableStyleSupportedSlot = {
  readonly status: "supported";
  readonly fill?: PptxTableStylePaint;
  readonly text?: PptxTableStyleText;
  readonly border?: PptxTableStyleBorder;
};

export type PptxTableStylePlaceholderSlot = {
  readonly status: "placeholder";
  readonly reason: string;
};

export type PptxTableStyleSlot = PptxTableStyleSupportedSlot | PptxTableStylePlaceholderSlot;

export type PptxTableStylesPartPayload = {
  readonly kind: "table-styles";
  readonly editable: true;
  readonly defaultStyleId: string;
  readonly styleName: string;
  readonly slots: {
    readonly wholeTable: PptxTableStyleSlot;
    readonly headerRow: PptxTableStyleSlot;
    readonly firstColumn: PptxTableStyleSlot;
    readonly bandedRows: PptxTableStyleSlot;
  };
};

export type PptxNotesPlaceholderPayload =
  | {
      readonly kind: "notes-master";
      readonly status: "placeholder";
      readonly editable: true;
      readonly role: "notes-master";
      readonly source: "deckjsx-placeholder";
      readonly settings: Record<string, never>;
    }
  | {
      readonly kind: "notes-slide";
      readonly status: "placeholder";
      readonly editable: true;
      readonly role: "notes-slide";
      readonly source: "deckjsx-placeholder";
      readonly settings: Record<string, never>;
    };

export type PptxSupportPartPayload =
  | {
      readonly kind: "presentation";
      readonly size: PptxPackageModel["size"];
      readonly slideMasterIds: readonly PptxPresentationSlideMasterId[];
      readonly slidePartIds: readonly PackagePartId[];
      readonly defaultTextStyle: PptxDefaultTextStylePayload;
    }
  | {
      readonly kind: "document-properties";
      readonly propertyKind: "core";
      readonly editable: true;
      readonly source: "deckjsx-meta";
      readonly meta: NonNullable<DeckOptions["meta"]>;
    }
  | {
      readonly kind: "document-properties";
      readonly propertyKind: "extended";
      readonly editable: true;
      readonly source: "deckjsx-projection";
      readonly application: "deckjsx";
      readonly slideCount: number;
    }
  | PptxEmptySupportPartPayload
  | PptxNotesPlaceholderPayload
  | PptxSlideLayoutPartPayload
  | PptxSlideMasterPartPayload
  | PptxTableStylesPartPayload
  | PptxThemePartPayload;

type PptxSupportPartOf<TPayload extends PptxSupportPartPayload> = PptxPackagePartBase<
  "support",
  TPayload["kind"],
  TPayload
> & {
  readonly kind: TPayload["kind"];
  readonly payload: TPayload;
};

export type PptxPresentationPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "presentation" }>
>;
export type PptxCoreDocumentPropertiesPart = PptxSupportPartOf<
  Extract<
    PptxSupportPartPayload,
    { readonly kind: "document-properties"; readonly propertyKind: "core" }
  >
>;
export type PptxExtendedDocumentPropertiesPart = PptxSupportPartOf<
  Extract<
    PptxSupportPartPayload,
    { readonly kind: "document-properties"; readonly propertyKind: "extended" }
  >
>;
export type PptxPresentationPropertiesPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "presentation-properties" }>
>;
export type PptxViewPropertiesPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "view-properties" }>
>;
export type PptxTableStylesPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "table-styles" }>
>;
export type PptxNotesMasterPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "notes-master" }>
>;
export type PptxNotesSlidePart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "notes-slide" }>
>;
export type PptxSlideLayoutPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "slide-layout" }>
>;
export type PptxSlideMasterPart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "slide-master" }>
>;
export type PptxThemePart = PptxSupportPartOf<
  Extract<PptxSupportPartPayload, { readonly kind: "theme" }>
>;

export type PptxSupportPart =
  | PptxCoreDocumentPropertiesPart
  | PptxExtendedDocumentPropertiesPart
  | PptxNotesMasterPart
  | PptxNotesSlidePart
  | PptxPresentationPart
  | PptxPresentationPropertiesPart
  | PptxSlideLayoutPart
  | PptxSlideMasterPart
  | PptxTableStylesPart
  | PptxThemePart
  | PptxViewPropertiesPart;

export type PptxContentTypeDefault = {
  readonly extension: string;
  readonly contentType: string;
};

export type PptxContentTypeOverride = {
  readonly partName: string;
  readonly contentType: string;
};

export type PptxContentTypesPayload = {
  readonly defaults: readonly PptxContentTypeDefault[];
  readonly overrides: readonly PptxContentTypeOverride[];
};

export type PptxRelationshipsPayload = {
  readonly relationships: readonly PptxRelationship[];
};

export type PptxContentTypesPart = PptxPackagePartBase<
  PptxPackagePartCategory,
  "content-types",
  PptxContentTypesPayload
> & {
  readonly payload: PptxContentTypesPayload;
};

export type PptxRelationshipsPart = PptxPackagePartBase<
  PptxPackagePartCategory,
  "relationships",
  PptxRelationshipsPayload
> & {
  readonly payload: PptxRelationshipsPayload;
};

export type PptxSlidePartPayload = {
  readonly slideId: string;
  readonly name?: string;
  readonly background?: FillIR;
  readonly backgroundLayers?: readonly PptxBackgroundLayer[];
  readonly drawing: PptxSlideDrawing;
};

export type PptxSlidePart = PptxPackagePartBase<
  "authored-content",
  "slide",
  PptxSlidePartPayload
> & {
  readonly payload: PptxSlidePartPayload;
};

export type PptxPackagePartPayload = {
  readonly kind?: string;
  readonly defaults?: readonly PptxContentTypeDefault[];
  readonly overrides?: readonly PptxContentTypeOverride[];
  readonly relationships?: readonly PptxRelationship[];
  readonly source?: ImageSourceIR | string;
  readonly sources?: readonly ImageSourceIR[];
  readonly elementId?: PptxElementId;
  readonly elementIds?: readonly PptxElementId[];
  readonly assetEntityId?: AssetEntity["id"];
  readonly assetEntityIds?: readonly AssetEntity["id"][];
  readonly allocationKey?: string;
  readonly metadata?: PptxMediaMetadata;
  readonly slideId?: string;
  readonly name?: string;
  readonly background?: FillIR;
  readonly backgroundLayers?: readonly PptxBackgroundLayer[];
  readonly drawing?: PptxSlideDrawing;
  readonly size?: Partial<PptxPackageModel["size"]>;
  readonly slideMasterIds?: readonly PptxPresentationSlideMasterId[];
  readonly slidePartIds?: readonly PackagePartId[];
  readonly propertyKind?: "core" | "extended";
  readonly editable?: boolean;
  readonly meta?: NonNullable<DeckOptions["meta"]>;
  readonly application?: "deckjsx";
  readonly slideCount?: number;
  readonly settings?: Readonly<Record<string, boolean | number | string>>;
  readonly status?: string;
  readonly role?: string;
  readonly projection?: PptxThemeProjectionPayload;
  readonly colorScheme?: PptxThemePartPayload["colorScheme"];
  readonly fontScheme?: PptxThemePartPayload["fontScheme"];
  readonly formatScheme?: PptxThemePartPayload["formatScheme"];
  readonly themePartId?: PackagePartId;
  readonly slideLayoutPartIds?: readonly PackagePartId[];
  readonly slideLayoutIds?: readonly PptxSlideMasterLayoutId[];
  readonly colorMap?: Readonly<Record<string, string>>;
  readonly textStyles?: PptxSlideMasterPartPayload["textStyles"];
  readonly layoutType?: "blank";
  readonly preserve?: true;
  readonly slideMasterPartId?: PackagePartId;
  readonly placeholderStrategy?: "none";
  readonly template?: PptxSlideLayoutPartPayload["template"];
  readonly layoutAnchors?: readonly PptxSlideLayoutAnchor[];
};

export type PptxKnownPackagePart =
  | PptxContentTypesPart
  | PptxMediaPart
  | PptxRelationshipsPart
  | PptxSlidePart
  | PptxSupportPart;

export type PptxPackagePartCandidate = PptxPackagePartBase;

export type PptxPackagePart = PptxPackagePartBase & {
  readonly payload: PptxPackagePartPayload;
};

export function isPptxPackagePart<TPart extends PptxPackagePartCandidate>(
  part: TPart,
): part is TPart & PptxPackagePart {
  return part.payload !== undefined;
}

export function isPptxContentTypesPart<TPart extends PptxPackagePartCandidate>(
  part: TPart,
): part is TPart & PptxContentTypesPart {
  return (
    part.kind === "content-types" &&
    Array.isArray(part.payload?.defaults) &&
    Array.isArray(part.payload?.overrides)
  );
}

export function isPptxMediaPart<TPart extends PptxPackagePartCandidate>(
  part: TPart,
): part is TPart & PptxMediaPart {
  return (
    part.kind === "media" &&
    isImageSourceCandidate(part.payload?.source) &&
    Array.isArray(part.payload?.sources) &&
    part.payload.sources.length > 0 &&
    part.payload.sources.every(isImageSourceCandidate)
  );
}

export function isPptxRelationshipsPart<TPart extends PptxPackagePartCandidate>(
  part: TPart,
): part is TPart & PptxRelationshipsPart {
  return part.kind === "relationships" && Array.isArray(part.payload?.relationships);
}

export function isPptxSlidePart<TPart extends PptxPackagePartCandidate>(
  part: TPart,
): part is TPart & PptxSlidePart {
  return (
    part.kind === "slide" &&
    typeof part.payload?.slideId === "string" &&
    part.payload.drawing !== undefined
  );
}

export function isPptxSupportPart<TPart extends PptxPackagePartCandidate>(
  part: TPart,
): part is TPart & PptxSupportPart {
  return part.category === "support" && part.payload?.kind === part.kind;
}

function isImageSourceCandidate(
  value: PptxPackagePartPayload["source"] | undefined,
): value is ImageSourceIR {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  switch (value.kind) {
    case "data":
      return typeof value.data === "string";
    case "path":
      return typeof value.path === "string";
    case "url":
      return typeof value.url === "string";
  }
}

export type ProjectInspectionBackgroundLayerSummary =
  | {
      readonly kind: "solid";
      readonly frame?: FrameIR;
      readonly color: string;
      readonly transparency?: number;
    }
  | {
      readonly kind: "linear-gradient";
      readonly frame?: FrameIR;
      readonly angle: number;
      readonly stops: readonly {
        readonly color: string;
        readonly transparency?: number;
        readonly position: number;
      }[];
    }
  | {
      readonly kind: "radial-gradient";
      readonly frame?: FrameIR;
      readonly shape: "circle" | "ellipse";
      readonly center: {
        readonly x: number;
        readonly y: number;
      };
      readonly radius: {
        readonly x: number;
        readonly y: number;
      };
      readonly stops: readonly {
        readonly color: string;
        readonly transparency?: number;
        readonly position: number;
      }[];
    }
  | {
      readonly kind: "background-image";
      readonly frame: FrameIR;
      readonly sourceFrame: FrameIR;
      readonly sourceKind: ImageSourceIR["kind"];
      readonly fit: "contain" | "cover" | "size" | "stretch";
      readonly size?: {
        readonly widthEmu?: number;
        readonly heightEmu?: number;
      };
      readonly repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
      readonly objectPosition: ObjectPositionIR;
      readonly transparency?: number;
    };

export type ProjectInspectionElementSummary = {
  readonly id: PptxElementId;
  readonly kind: PptxElementKind;
  readonly packagePartId: PackagePartId;
  readonly frame?: FrameIR;
  readonly emissionTarget?: PptxEmissionTarget;
  readonly paintOrderIndex?: number;
  readonly paintOrder?: PptxPaintOrderInput;
  readonly zIndex?: number;
  readonly opacity?: number;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly visibility?: PptxVisibility;
  readonly measurement?: PptxMeasurement;
  readonly clip?: PptxClip;
  readonly backgroundLayers?: readonly ProjectInspectionBackgroundLayerSummary[];
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly generatedStrokes?: readonly PptxGeneratedStrokeLayer[];
  readonly textPreview?: string;
  readonly layoutAnchor?: PptxLayoutAnchor;
  readonly origin: PptxElementOrigin;
  readonly resolvedValues?: ProjectInspectionResolvedValues;
};

export type ProjectInspectionResolvedValues = {
  readonly frame?: FrameIR;
  readonly opacity?: number;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly zIndex?: number;
  readonly measurement?: PptxMeasurement;
  readonly clip?: PptxClip;
  readonly backgroundLayers?: readonly ProjectInspectionBackgroundLayerSummary[];
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly outline?: StrokeIR;
  readonly generatedStrokes?: readonly PptxGeneratedStrokeLayer[];
  readonly fill?: FillIR;
  readonly stroke?: StrokeIR;
  readonly textStyle?: TextStyleIR;
  readonly imageSource?: ImageSourceIR;
  readonly imageObjectPosition?: ObjectPositionIR;
  readonly videoSource?: ImageSourceIR;
  readonly videoPosterSource?: ImageSourceIR;
  readonly videoObjectPosition?: ObjectPositionIR;
  readonly unsupportedSemantics?: readonly PptxUnsupportedSemantic[];
};

export type ProjectInspectionPartSummary = {
  readonly id: PackagePartId;
  readonly category: PptxPackagePartCategory;
  readonly kind: PptxPackagePartKind;
  readonly path: string;
  readonly hasStructuredPayload?: boolean;
  readonly payloadKind?: string;
  readonly requirement?: PptxPackagePartRequirement;
  readonly orderKey?: PptxPackagePartOrderKey;
  readonly fingerprint?: string;
  readonly dependencyFingerprintCount?: number;
  readonly relationshipCount?: number;
  readonly contentTypeCount?: number;
};

export type ProjectInspectionRelationshipSummary = {
  readonly ownerPartId: PackagePartId;
  readonly ownerPath: string;
  readonly id: PptxSerializedIdentity;
  readonly type: string;
  readonly target: string;
  readonly targetPath: string;
  readonly targetMode?: "external";
  readonly targetPartId?: PackagePartId;
};

export type ProjectInspectionPackageDependencyReason =
  | "contentTypeOverride"
  | "dependencyFingerprint"
  | "requirementDependency"
  | "relationshipTarget";

export type ProjectInspectionPackageDependencySummary = {
  readonly ownerPartId: PackagePartId;
  readonly ownerPath: string;
  readonly targetPartId: PackagePartId;
  readonly targetPath?: string;
  readonly reason: ProjectInspectionPackageDependencyReason;
  readonly relationshipId?: PptxSerializedIdentity;
  readonly relationshipType?: string;
  readonly contentType?: string;
  readonly fingerprint?: string;
  readonly requirementStatus?: PptxPackagePartRequirementStatus;
  readonly requirementCondition?: PptxPackagePartRequirementCondition;
};

export type ProjectInspectionAssetResolutionSummary = {
  readonly assetEntityId: AssetEntity["id"];
  readonly sourceKind: AssetSource["kind"];
  readonly sourceField: AssetEntity["sourceField"];
  readonly resolverIdentity?: string;
  readonly provenanceKind: AssetResolutionProvenanceKind;
  readonly resolvedId?: string;
  readonly importer?: string;
  readonly sourceIdentity?: string;
  readonly hashSource?: AssetResolutionHashSource;
  readonly diagnosticCodes: readonly string[];
};

export type ProjectInspectionSummary = {
  readonly format: ProjectionFormat;
  readonly parts: readonly ProjectInspectionPartSummary[];
  readonly relationships: readonly ProjectInspectionRelationshipSummary[];
  readonly packageDependencies: readonly ProjectInspectionPackageDependencySummary[];
  readonly assetResolutions: readonly ProjectInspectionAssetResolutionSummary[];
  readonly media: readonly ProjectInspectionMediaSummary[];
  readonly filtered: readonly ProjectInspectionFilteredRecord[];
  readonly unsupportedSemantics: readonly ProjectInspectionUnsupportedSemanticRecord[];
  readonly slides: readonly {
    readonly partId: PackagePartId;
    readonly slideId: string;
    readonly name?: string;
    readonly backgroundLayers?: readonly ProjectInspectionBackgroundLayerSummary[];
    readonly elements: readonly ProjectInspectionElementSummary[];
  }[];
  readonly pptx: {
    readonly packageParts: readonly ProjectInspectionPartSummary[];
    readonly relationshipCount: number;
    readonly packageDependencyCount: number;
  };
  readonly diagnostics: readonly ProjectInspectionDiagnosticSummary[];
  readonly adapterLimitations: readonly ProjectInspectionAdapterLimitation[];
  readonly details?: ProjectInspectionDetails;
};

export type ProjectInspectionDiagnosticSummary = {
  readonly severity: Diagnostics["items"][number]["severity"];
  readonly code: string;
  readonly title: string;
};

export type ProjectInspectionAdapterLimitation = {
  readonly adapter: string;
  readonly code: string;
  readonly message: string;
};

export type ProjectInspectionMediaSummary = {
  readonly partId?: PackagePartId;
  readonly partPath?: string;
  readonly elementId?: PptxElementId;
  readonly sourceKind: ImageSourceIR["kind"];
  readonly metadata?: PptxMediaMetadata;
  readonly origin: PptxElementOrigin;
};

export type ProjectInspectionFilteredReason = "displayNone";

export type ProjectInspectionFilteredRecord = {
  readonly reason: ProjectInspectionFilteredReason;
  readonly kind: SemanticNode["kind"];
  readonly graphNodeId: GraphNodeId;
  readonly slidePartId?: PackagePartId;
  readonly slideId?: string;
  readonly textPreview?: string;
  readonly origin: PptxElementOrigin;
};

export type ProjectInspectionUnsupportedSemanticRecord = PptxUnsupportedSemantic & {
  readonly elementId: PptxElementId;
  readonly kind: PptxElementKind;
  readonly packagePartId: PackagePartId;
  readonly slidePartId: PackagePartId;
  readonly slideId: string;
  readonly origin: PptxElementOrigin;
  readonly emissionTarget?: PptxEmissionTarget;
  readonly paintOrderIndex?: number;
  readonly paintOrder?: PptxPaintOrderInput;
};

export type ProjectInspectionComposedPaintOrderEntry = {
  readonly source: "backgroundLayer" | "drawingNode" | "generatedStroke";
  readonly order: number;
  readonly slidePartId: PackagePartId;
  readonly slideId: string;
  readonly packagePartId?: PackagePartId;
  readonly elementId?: PptxElementId;
  readonly kind?: PptxElementKind;
  readonly generatedStroke?: PptxGeneratedStrokeLayer;
  readonly generatedLayerIndex?: number;
  readonly backgroundLayerIndex?: number;
  readonly parentElementId?: PptxElementId;
  readonly depth?: number;
  readonly siblingPath?: readonly number[];
  readonly frame?: FrameIR;
  readonly backgroundLayer?: ProjectInspectionBackgroundLayerSummary;
  readonly emissionTarget?: PptxEmissionTarget;
  readonly paintOrderIndex?: number;
  readonly paintOrder?: PptxPaintOrderInput;
  readonly visibility?: PptxVisibility;
  readonly layoutAnchor?: PptxLayoutAnchor;
  readonly origin?: PptxElementOrigin;
};

export type ProjectInspectionComposedPaintOrderSlideView = {
  readonly slidePartId: PackagePartId;
  readonly slideId: string;
  readonly name?: string;
  readonly entries: readonly ProjectInspectionComposedPaintOrderEntry[];
};

export type ProjectInspectionEffectiveProjectedStyleEntry = {
  readonly slidePartId: PackagePartId;
  readonly slideId: string;
  readonly packagePartId: PackagePartId;
  readonly elementId: PptxElementId;
  readonly kind: PptxElementKind;
  readonly parentElementId?: PptxElementId;
  readonly depth: number;
  readonly siblingPath: readonly number[];
  readonly emissionTarget?: PptxEmissionTarget;
  readonly paintOrderIndex?: number;
  readonly paintOrder?: PptxPaintOrderInput;
  readonly layoutAnchor?: PptxLayoutAnchor;
  readonly origin: PptxElementOrigin;
  readonly values: ProjectInspectionResolvedValues;
};

export type ProjectInspectionEffectiveProjectedStyleSlideView = {
  readonly slidePartId: PackagePartId;
  readonly slideId: string;
  readonly name?: string;
  readonly entries: readonly ProjectInspectionEffectiveProjectedStyleEntry[];
};

export type ProjectInspectionPackageDependencyInvalidationEntry = {
  readonly partId: PackagePartId;
  readonly path: string;
  readonly category: PptxPackagePartCategory;
  readonly kind: PptxPackagePartKind;
  readonly requirement?: PptxPackagePartRequirement;
  readonly orderKey?: PptxPackagePartOrderKey;
  readonly fingerprint?: string;
  readonly dependencyFingerprintCount?: number;
  readonly dependencies: readonly ProjectInspectionPackageDependencySummary[];
  readonly dependents: readonly ProjectInspectionPackageDependencySummary[];
  readonly dependencyReasons: readonly ProjectInspectionPackageDependencyReason[];
  readonly dependentReasons: readonly ProjectInspectionPackageDependencyReason[];
};

export type ProjectInspectionPackageDependencyInvalidationView = {
  readonly entries: readonly ProjectInspectionPackageDependencyInvalidationEntry[];
};

export type ProjectInspectionPaintFallbackAggregationEntry = {
  readonly feature: PptxUnsupportedSemanticFeature;
  readonly property: string;
  readonly fallbackStrategy?: PptxUnsupportedFallbackStrategy;
  readonly count: number;
  readonly slidePartIds: readonly PackagePartId[];
  readonly slideIds: readonly string[];
  readonly elementIds: readonly PptxElementId[];
  readonly kinds: readonly PptxElementKind[];
  readonly values: readonly string[];
  readonly preserves: readonly string[];
  readonly missing: readonly string[];
  readonly reasons: readonly string[];
  readonly recordIndexes: readonly number[];
};

export type ProjectInspectionPaintFallbackAggregationView = {
  readonly entries: readonly ProjectInspectionPaintFallbackAggregationEntry[];
};

export type ProjectInspectionThemeProjectionEntry = {
  readonly partId: PackagePartId;
  readonly path: string;
  readonly name: string;
  readonly projectionId: string;
  readonly purpose: PptxThemeProjectionPayload["purpose"];
  readonly source: PptxThemeProjectionPayload["source"];
  readonly colorSchemeName: string;
  readonly fontSchemeName: string;
  readonly formatSchemeName: string;
  readonly wholeThemeMappings: readonly PptxThemeWholeThemeMapping[];
  readonly valueGroupFingerprints: readonly PptxThemeValueGroupFingerprint[];
  readonly supportMappings: readonly PptxThemeSupportMapping[];
  readonly defaultStyleDecisionCount: number;
  readonly concreteDrawingPropertyCount: number;
  readonly unprojectedCount: number;
  readonly effectiveInheritanceCount: number;
  readonly referenceSerializationCount: number;
  readonly defaultStyleDecisions: readonly PptxThemeDefaultStyleDecision[];
  readonly concreteDrawingProperties: readonly PptxThemeConcreteDrawingPropertyMapping[];
  readonly unprojected: readonly PptxThemeUnprojectedMapping[];
  readonly effectiveInheritance: readonly PptxThemeEffectiveInheritanceTrace[];
  readonly referenceSerialization: readonly PptxThemeReferenceSerializationChoice[];
};

export type ProjectInspectionThemeProjectionView = {
  readonly entries: readonly ProjectInspectionThemeProjectionEntry[];
};

export type ProjectInspectionDetails = {
  readonly composedPaintOrder: readonly ProjectInspectionComposedPaintOrderSlideView[];
  readonly effectiveProjectedStyles: readonly ProjectInspectionEffectiveProjectedStyleSlideView[];
  readonly packageDependencyInvalidation: ProjectInspectionPackageDependencyInvalidationView;
  readonly paintFallbackAggregation: ProjectInspectionPaintFallbackAggregationView;
  readonly themeProjections: ProjectInspectionThemeProjectionView;
};

export type PptxPackageModel = {
  readonly format: "pptx";
  readonly size: {
    readonly widthEmu: number;
    readonly heightEmu: number;
  };
  readonly meta?: DeckOptions["meta"];
  readonly parts: readonly PptxPackagePart[];
  readonly slides: readonly PptxSlidePart[];
};

export type PptxPackageModelCandidate = Omit<PptxPackageModel, "parts" | "slides"> & {
  readonly parts: readonly PptxPackagePartCandidate[];
  readonly slides: readonly PptxPackagePartCandidate[];
};

export function isPptxPackageModel(
  projection: PptxPackageModelCandidate,
): projection is PptxPackageModel {
  return (
    projection.format === "pptx" &&
    Array.isArray(projection.parts) &&
    Array.isArray(projection.slides) &&
    projection.parts.every(isPptxPackagePart) &&
    projection.slides.every(isPptxSlidePart)
  );
}

export type PptxProjectionAssetArtifact = {
  readonly probe?: AssetProbeResult;
  readonly resolverIdentity?: string;
};

import { Deck } from "deckjsx";
import {
  isPptxContentTypesPart,
  isPptxMediaPart,
  isPptxPackageModel,
  isPptxPackagePart,
  isPptxRelationshipsPart,
  isPptxSlidePart,
  isPptxSupportPart,
} from "deckjsx/inspect";
import type {
  AssetEntityId,
  GraphNodeId,
  PackagePartId,
  ProjectInspectionFilteredReason,
  ProjectInspectionFilteredRecord,
  ProjectInspectionBackgroundLayerSummary,
  ProjectInspectionComposedPaintOrderEntry,
  ProjectInspectionComposedPaintOrderSlideView,
  ProjectInspectionDetails,
  ProjectInspectionEffectiveProjectedStyleEntry,
  ProjectInspectionEffectiveProjectedStyleSlideView,
  ProjectInspectionPaintFallbackAggregationEntry,
  ProjectInspectionPaintFallbackAggregationView,
  ProjectInspectionPackageDependencyInvalidationEntry,
  ProjectInspectionPackageDependencyInvalidationView,
  ProjectInspectionPackageDependencyReason,
  ProjectInspectionPackageDependencySummary,
  ProjectInspectionPartSummary,
  ProjectInspectionRelationshipSummary,
  ProjectInspectionResolvedValues,
  ProjectInspectionSummary,
  ProjectInspectionThemeProjectionEntry,
  ProjectInspectionThemeProjectionView,
  ProjectInspectionUnsupportedSemanticRecord,
  PptxClip,
  PptxBackgroundLayer,
  PptxContentTypesPayload,
  PptxDrawingNode,
  PptxEmptySupportPartPayload,
  PptxEmissionTarget,
  PptxElement,
  PptxGeneratedStrokeLayer,
  PptxGroupElement,
  PptxLayoutAnchor,
  PptxKnownPackagePart,
  PptxMediaMetadata,
  PptxMediaPart,
  PptxMediaPartPayload,
  PptxMeasurement,
  PptxNotesPlaceholderPayload,
  PptxPackageModel,
  PptxPackageModelCandidate,
  PptxPackagePart,
  PptxPackagePartCandidate,
  PptxPackagePartDependencyFingerprint,
  PptxPackagePartOrderKey,
  PptxPackagePartRequirement,
  PptxPaintOrderInput,
  PptxPictureElement,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSerializedIdentity,
  PptxShadow,
  PptxShapeElement,
  PptxSlideDrawing,
  PptxSlidePart,
  PptxSlideLayoutAnchor,
  PptxTextElement,
  PptxSupportPart,
  PptxThemeDefaultStyleDecision,
  PptxThemeDefaultStyleDecisionKind,
  PptxThemeDefaultStyleProjectionTarget,
  PptxThemeEffectiveInheritanceStep,
  PptxThemeEffectiveInheritanceTrace,
  PptxThemePartPayload,
  PptxUnsupportedFallback,
  PptxUnsupportedFallbackStrategy,
  PptxUnsupportedSemantic,
  PptxUnsupportedSemanticFeature,
  PptxVisibility,
  PptxThemeReferenceCandidate,
  PptxThemeReferenceSerializationChoice,
  PptxThemeReferenceSerializationDecision,
  PptxThemeReferenceSerializationKind,
  PptxThemeValueGroup,
  PptxThemeValueGroupFingerprint,
  PptxThemeWholeThemeMapping,
  ResolvedStyleMap,
  SemanticAuthorGraph,
  StyleClassRef,
  StyleEntity,
} from "deckjsx/inspect";
import type { CompileResult } from "deckjsx";

// @ts-expect-error Package Part identity construction is library-owned.
export type NoPublicPackagePartIdFactory = typeof import("deckjsx/inspect").packagePartId;

// @ts-expect-error Graph identity construction is library-owned.
export type NoPublicGraphNodeIdFactory = typeof import("deckjsx/inspect").graphNodeId;

// @ts-expect-error Style identity construction is library-owned.
export type NoPublicStyleEntityIdFactory = typeof import("deckjsx/inspect").styleEntityId;

// @ts-expect-error Asset identity construction is library-owned.
export type NoPublicAssetEntityIdFactory = typeof import("deckjsx/inspect").assetEntityId;

// @ts-expect-error Relationship identity construction is library-owned.
export type NoPublicSerializedIdFactory = typeof import("deckjsx/inspect").serializedId;

declare const styleTestId: StyleEntity["id"];
declare const styleResolvedId: StyleEntity["id"];
declare const chartMediaPartId: PackagePartId;
declare const defaultThemePartId: PackagePartId;
declare const presentationPartId: PackagePartId;
declare const defaultSupportSlideMasterPartId: PackagePartId;
declare const firstSlidePartId: PackagePartId;
declare const defaultSlideMasterPartId: PackagePartId;
declare const defaultSlideLayoutPartId: PackagePartId;
declare const oneSlidePartId: PackagePartId;
declare const relationshipId: PptxSerializedIdentity;
declare const chartAssetId: AssetEntityId;
declare const graphTextId: GraphNodeId;

const styleClassRef = { name: "card", index: 0 } satisfies StyleClassRef;
const styleEntityWithClassRefs = {
  id: styleTestId,
  target: "container",
  authored: { classRefs: [styleClassRef] },
} satisfies StyleEntity;
void styleEntityWithClassRefs;

const styleEntityWithResolved = {
  id: styleResolvedId,
  target: "text",
  authored: {},
  // @ts-expect-error StyleEntity does not carry resolved concrete style values.
  resolved: {},
} satisfies StyleEntity;
void styleEntityWithResolved;

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
deck.slide(() => (
  <>
    <div>
      <p>Inspect me</p>
    </div>
  </>
));

const graph = deck.compile().graph!;
graph satisfies SemanticAuthorGraph;
graph.documentId satisfies GraphNodeId;

const inspect = deck.compile();
inspect satisfies CompileResult;
inspect.graph satisfies SemanticAuthorGraph | undefined;
inspect.resolvedStyles satisfies ResolvedStyleMap | undefined;

const packagePartRequirement = {
  status: "conditional",
  required: true,
  reason: "media relationship exists",
  condition: "referencedByRelationship",
  dependencies: [chartMediaPartId],
} satisfies PptxPackagePartRequirement;
void packagePartRequirement;

const dependencyFingerprint = {
  packagePartId: defaultThemePartId,
  fingerprint: "fnv1a32:00000000",
} satisfies PptxPackagePartDependencyFingerprint;
void dependencyFingerprint;

const packagePartOrderKey = {
  group: "presentation",
  groupOrder: 30,
  sequence: 4,
  path: "ppt/presentation.xml",
  value: "030:000004:ppt/presentation.xml",
} satisfies PptxPackagePartOrderKey;
void packagePartOrderKey;

const paintOrder = {
  zIndex: 10,
  siblingOrder: 2,
  generatedLayerRole: "authored",
} satisfies PptxPaintOrderInput;
void paintOrder;

const projectedClip = {
  strategy: "intersectParentOverflow",
  originalFrame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
  clipFrame: { xEmu: 0, yEmu: 0, widthEmu: 457200, heightEmu: 914400 },
  visibleFrame: { xEmu: 0, yEmu: 0, widthEmu: 457200, heightEmu: 914400 },
} satisfies PptxClip;
void projectedClip;

const backgroundLayerSummary = {
  kind: "background-image",
  frame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
  sourceFrame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
  sourceKind: "data",
  fit: "cover",
  repeat: "no-repeat",
  objectPosition: { x: 0.5, y: 0.5 },
} satisfies ProjectInspectionBackgroundLayerSummary;
backgroundLayerSummary.sourceKind satisfies "data";
// @ts-expect-error Project inspection background summaries are byte-free and do not expose source payloads.
void backgroundLayerSummary.source;
void backgroundLayerSummary;

const emissionTarget = "slide" satisfies PptxEmissionTarget;
void emissionTarget;

const measurement = {
  frame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 457200 },
  overflow: "clip",
} satisfies PptxMeasurement;
void measurement;

const layoutAnchor = {
  template: "report",
  area: "title",
  kind: "title",
  frame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 457200 },
} satisfies PptxLayoutAnchor;
void layoutAnchor;

declare const drawingNode: PptxDrawingNode;
drawingNode.emissionTarget satisfies PptxEmissionTarget;
drawingNode.paintOrder satisfies PptxPaintOrderInput;
drawingNode.clip satisfies PptxClip | undefined;
if (drawingNode.kind === "group") {
  drawingNode.backgroundLayers satisfies readonly PptxBackgroundLayer[] | undefined;
}
drawingNode.layoutAnchor satisfies PptxLayoutAnchor | undefined;
drawingNode.layoutAnchor?.kind satisfies
  | "body"
  | "date"
  | "footer"
  | "generic"
  | "picture"
  | "slideNumber"
  | "title"
  | undefined;
drawingNode.unsupportedSemantics satisfies readonly PptxUnsupportedSemantic[] | undefined;

declare const textElement: PptxTextElement;
textElement.kind satisfies "text";
textElement.measurement satisfies PptxMeasurement | undefined;
textElement.backgroundLayers satisfies readonly PptxBackgroundLayer[] | undefined;
textElement.generatedStrokes satisfies readonly PptxGeneratedStrokeLayer[] | undefined;
textElement.shadow satisfies PptxShadow | undefined;

declare const groupElement: PptxGroupElement;
groupElement.kind satisfies "group";
groupElement.children satisfies readonly PptxElement[];
groupElement.backgroundLayers satisfies readonly PptxBackgroundLayer[] | undefined;
groupElement.generatedStrokes satisfies readonly PptxGeneratedStrokeLayer[] | undefined;
groupElement.shadow satisfies PptxShadow | undefined;

declare const pictureElement: PptxPictureElement;
pictureElement.kind satisfies "image";
pictureElement.mediaPartId satisfies PackagePartId | undefined;
pictureElement.shadow satisfies PptxShadow | undefined;

declare const shapeElement: PptxShapeElement;
shapeElement.kind satisfies "shape";
shapeElement.backgroundLayers satisfies readonly PptxBackgroundLayer[] | undefined;
shapeElement.generatedStrokes satisfies readonly PptxGeneratedStrokeLayer[] | undefined;
shapeElement.shadow satisfies PptxShadow | undefined;

declare const pptxShadow: PptxShadow;
pptxShadow.opacity satisfies number;
pptxShadow.blurPt satisfies number;
pptxShadow.offsetPt satisfies number;
pptxShadow.angle satisfies number;

const unsupportedSemantic = {
  feature: "background",
  property: "background",
  value: "radial-gradient(circle 10% 20% at center, #fff 0%, #000 100%)",
  reason: "unsupported descriptor",
  fallback: {
    strategy: "preserveAuthoredValueOnly",
    preserves: ["authoredBackground"],
    missing: ["nativePptxBackground"],
  },
} satisfies PptxUnsupportedSemantic;
unsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
unsupportedSemantic.fallback satisfies PptxUnsupportedFallback;
unsupportedSemantic.fallback.strategy satisfies PptxUnsupportedFallbackStrategy;
void unsupportedSemantic;

const opacityUnsupportedSemantic = {
  feature: "opacity",
  property: "opacity",
  value: "0.5",
  reason: "group opacity compositing fallback",
} satisfies PptxUnsupportedSemantic;
opacityUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void opacityUnsupportedSemantic;

const clippingUnsupportedSemantic = {
  feature: "clipping",
  property: "overflow",
  value: "hidden + transform:intersectParentOverflow",
  reason: "clipping transform fallback",
} satisfies PptxUnsupportedSemantic;
clippingUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void clippingUnsupportedSemantic;

const filterUnsupportedSemantic = {
  feature: "filter",
  property: "filter",
  value: "blur(2px)",
  reason: "filter fallback",
} satisfies PptxUnsupportedSemantic;
filterUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void filterUnsupportedSemantic;

const imageUnsupportedSemantic = {
  feature: "image",
  property: "objectPosition",
  value: "somewhere",
  reason: "image positioning fallback",
} satisfies PptxUnsupportedSemantic;
imageUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void imageUnsupportedSemantic;

const blendUnsupportedSemantic = {
  feature: "blend",
  property: "mixBlendMode",
  value: "multiply",
  reason: "blend fallback",
} satisfies PptxUnsupportedSemantic;
blendUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void blendUnsupportedSemantic;

const borderUnsupportedSemantic = {
  feature: "border",
  property: "border",
  value: "2pt groove #111111",
  reason: "border fallback",
} satisfies PptxUnsupportedSemantic;
borderUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void borderUnsupportedSemantic;

const outlineUnsupportedSemantic = {
  feature: "outline",
  property: "outline",
  value: "1pt groove #222222",
  reason: "outline fallback",
} satisfies PptxUnsupportedSemantic;
outlineUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void outlineUnsupportedSemantic;

const strokeUnsupportedSemantic = {
  feature: "stroke",
  property: "strokeDasharray",
  value: "4 var(--gap)",
  reason: "stroke fallback",
} satisfies PptxUnsupportedSemantic;
strokeUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void strokeUnsupportedSemantic;

const isolationUnsupportedSemantic = {
  feature: "isolation",
  property: "isolation",
  value: "isolate",
  reason: "isolation fallback",
} satisfies PptxUnsupportedSemantic;
isolationUnsupportedSemantic.feature satisfies PptxUnsupportedSemanticFeature;
void isolationUnsupportedSemantic;

const slideDrawing = { children: [drawingNode] } satisfies PptxSlideDrawing;
void slideDrawing;

const slideLayoutAnchor = {
  template: "report",
  area: "body",
  kind: "generic",
  frame: { xEmu: 0, yEmu: 914400, widthEmu: 9144000, heightEmu: 2743200 },
  placeholderStrategy: "none",
} satisfies PptxSlideLayoutAnchor;
void slideLayoutAnchor;

const notesPlaceholderPayload = {
  kind: "notes-slide",
  status: "placeholder",
  editable: true,
  role: "notes-slide",
  source: "deckjsx-placeholder",
  settings: {},
} satisfies PptxNotesPlaceholderPayload;
void notesPlaceholderPayload;

const relationship = {
  id: relationshipId,
  target: "ppt/slides/slide1.xml",
  targetPath: "ppt/slides/slide1.xml",
  type: "slide",
} satisfies PptxRelationship;
void relationship;

const mediaMetadata = {
  mediaType: "image/png",
  extension: "png",
  widthPx: 640,
  heightPx: 360,
  byteLength: 4096,
  hash: "sha256:stable-media",
} satisfies PptxMediaMetadata;
void mediaMetadata;

const mediaPayload = {
  source: { kind: "path", path: "/public/chart.png" },
  sources: [{ kind: "path", path: "/public/chart.png" }],
  assetEntityId: chartAssetId,
  assetEntityIds: [chartAssetId],
  allocationKey: "hash:sha256:stable-media:png",
  metadata: mediaMetadata,
} satisfies PptxMediaPartPayload;
void mediaPayload;

const mediaPart = {
  id: chartMediaPartId,
  category: "authored-content",
  kind: "media",
  path: "ppt/media/media1.png",
  payload: mediaPayload,
} satisfies PptxMediaPart;
mediaPart.payload.metadata satisfies PptxMediaMetadata | undefined;
void mediaPart;

const knownPackagePart = mediaPart satisfies PptxKnownPackagePart;
if (isPptxMediaPart(knownPackagePart)) {
  knownPackagePart.payload satisfies PptxMediaPartPayload;
  knownPackagePart.payload.metadata satisfies PptxMediaMetadata | undefined;
}

const broadMediaPart = mediaPart satisfies PptxPackagePart;
if (isPptxMediaPart(broadMediaPart)) {
  broadMediaPart.payload satisfies PptxMediaPartPayload;
  broadMediaPart.payload.sources[0]?.kind satisfies "data" | "path" | "url" | undefined;
}

const packagePart = {
  id: presentationPartId,
  category: "support",
  kind: "presentation",
  path: "ppt/presentation.xml",
  requirement: { status: "required", required: true, reason: "presentation root" },
  orderKey: packagePartOrderKey,
  fingerprint: "fnv1a32:11111111",
  dependencyFingerprints: [dependencyFingerprint],
  relationships: [relationship],
} satisfies PptxPackagePartCandidate;
const packagePartCandidate: PptxPackagePartCandidate = packagePart;
packagePartCandidate.payload satisfies PptxPackagePartCandidate["payload"];
void packagePart;

const supportPart = {
  id: presentationPartId,
  category: "support",
  kind: "presentation",
  path: "ppt/presentation.xml",
  payload: {
    kind: "presentation",
    size: { widthEmu: 9144000, heightEmu: 5143500 },
    slideMasterIds: [{ slideMasterPartId: defaultSupportSlideMasterPartId, id: "2147483648" }],
    slidePartIds: [firstSlidePartId],
  },
} satisfies PptxSupportPart;
supportPart.payload.kind satisfies "presentation";
void supportPart;

const broadSupportPart = supportPart satisfies PptxPackagePart;
if (isPptxSupportPart(broadSupportPart)) {
  broadSupportPart.payload satisfies PptxSupportPart["payload"];
  broadSupportPart.payload.kind satisfies "presentation";
}

const contentTypesPart = {
  id: "pptx:content-types" as PackagePartId,
  category: "manifest",
  kind: "content-types",
  path: "[Content_Types].xml",
  payload: {
    defaults: [
      {
        extension: "rels",
        contentType: "application/vnd.openxmlformats-package.relationships+xml",
      },
    ],
    overrides: [
      {
        partName: "/ppt/presentation.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
      },
    ],
  },
} satisfies PptxPackagePart;

if (isPptxContentTypesPart(contentTypesPart)) {
  contentTypesPart.payload satisfies PptxContentTypesPayload;
  contentTypesPart.payload.defaults[0]?.extension satisfies string | undefined;
}

const relationshipsPart = {
  id: "pptx:root-relationships" as PackagePartId,
  category: "manifest",
  kind: "relationships",
  path: "_rels/.rels",
  payload: { relationships: [relationship] },
} satisfies PptxPackagePart;

if (isPptxRelationshipsPart(relationshipsPart)) {
  relationshipsPart.payload satisfies PptxRelationshipsPayload;
  relationshipsPart.payload.relationships[0]?.id satisfies PptxRelationship["id"] | undefined;
}

declare const broadSlidePart: PptxPackagePart;
if (isPptxSlidePart(broadSlidePart)) {
  broadSlidePart satisfies PptxSlidePart;
  broadSlidePart.payload.drawing satisfies PptxSlideDrawing;
}

const themePayload = {
  kind: "theme",
  name: "deckjsx",
  editable: true,
  projection: {
    id: "pptx:theme-projection:default",
    purpose: "default",
    source: "deckjsx-default",
    trace: {
      supportMappings: [
        {
          source: "deckjsx-default",
          projectedAs: "themeSupport",
          groups: ["colorScheme", "fontScheme", "formatScheme"],
        },
      ],
      wholeThemeMappings: [
        {
          source: "deckjsx-default",
          projectedAs: "themePart",
          purpose: "default",
          themePartId: defaultThemePartId,
          groups: ["colorScheme", "fontScheme", "formatScheme", "themeDefaults"],
          fingerprint: "fnv1a32:22222222",
        },
      ],
      valueGroupFingerprints: [
        {
          group: "themeDefaults",
          source: "themeDefault",
          projectedAs: "themeProjectionTrace",
          fingerprint: "fnv1a32:33333333",
          itemCount: 1,
        },
      ],
      defaultStyleDecisions: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "zIndex",
          resolvedValue: 10,
          decision: "projectDrawingMetadata",
          projectedAs: "drawingMetadata",
          reason: "z-index is drawing metadata",
        },
      ],
      concreteDrawingProperties: [
        {
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "color",
          projectedAs: "concreteDrawingProperty",
          resolvedValue: "#111111",
        },
      ],
      unprojected: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "filter",
          projectedAs: "unprojected",
          resolvedValue: "blur(2px)",
          reason: "filter fallback is not a theme projection",
        },
      ],
      effectiveInheritance: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "color",
          projectedAs: "concreteDrawingProperty",
          resolvedValue: "#111111",
          themePartId: defaultThemePartId,
          slideMasterPartId: defaultSlideMasterPartId,
          slideLayoutPartId: defaultSlideLayoutPartId,
          slidePartId: oneSlidePartId,
          inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide", "drawing"],
          reason: "Theme Default won resolved style resolution.",
        },
      ],
      referenceSerialization: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "color",
          resolvedValue: "#2563EB",
          currentSerialization: "srgbClr",
          decision: "deferThemeReferenceSerialization",
          candidate: { kind: "schemeColor", value: "accent1", themePartId: defaultThemePartId },
          reason: "concrete color output with theme candidate",
        },
      ],
    },
  },
  colorScheme: { name: "deckjsx", colors: { accent1: "2563EB" } },
  fontScheme: { name: "deckjsx", majorLatin: "Aptos Display", minorLatin: "Aptos" },
  formatScheme: { name: "deckjsx" },
} satisfies PptxThemePartPayload;
themePayload.projection.trace.wholeThemeMappings[0] satisfies
  | PptxThemeWholeThemeMapping
  | undefined;
themePayload.projection.trace.valueGroupFingerprints[0] satisfies
  | PptxThemeValueGroupFingerprint
  | undefined;
themePayload.projection.trace.valueGroupFingerprints[0]?.group satisfies
  | PptxThemeValueGroup
  | undefined;
themePayload.projection.trace.defaultStyleDecisions[0] satisfies
  | PptxThemeDefaultStyleDecision
  | undefined;
themePayload.projection.trace.defaultStyleDecisions[0]?.decision satisfies
  | PptxThemeDefaultStyleDecisionKind
  | undefined;
themePayload.projection.trace.defaultStyleDecisions[0]?.projectedAs satisfies
  | PptxThemeDefaultStyleProjectionTarget
  | undefined;
themePayload.projection.trace.effectiveInheritance[0] satisfies
  | PptxThemeEffectiveInheritanceTrace
  | undefined;
themePayload.projection.trace.effectiveInheritance[0]?.inheritedThrough[0] satisfies
  | PptxThemeEffectiveInheritanceStep
  | undefined;
themePayload.projection.trace.referenceSerialization[0] satisfies
  | PptxThemeReferenceSerializationChoice
  | undefined;
themePayload.projection.trace.referenceSerialization[0]?.candidate satisfies
  | PptxThemeReferenceCandidate
  | undefined;
themePayload.projection.trace.referenceSerialization[0]?.currentSerialization satisfies
  | PptxThemeReferenceSerializationKind
  | undefined;
themePayload.projection.trace.referenceSerialization[0]?.decision satisfies
  | PptxThemeReferenceSerializationDecision
  | undefined;
void themePayload;

const emptySupportPayload = {
  kind: "view-properties",
  editable: true,
  settings: {},
} satisfies PptxEmptySupportPartPayload;
void emptySupportPayload;

const packageModel = {
  format: "pptx",
  size: { widthEmu: 9144000, heightEmu: 5143500 },
  parts: [supportPart],
  slides: [],
} satisfies PptxPackageModel;
packageModel.parts[0]?.payload satisfies PptxPackagePart["payload"] | undefined;
void packageModel;

const packageModelCandidate = {
  format: "pptx",
  size: { widthEmu: 9144000, heightEmu: 5143500 },
  parts: [packagePartCandidate],
  slides: [],
} satisfies PptxPackageModelCandidate;

if (isPptxPackagePart(packageModelCandidate.parts[0]!)) {
  packageModelCandidate.parts[0].payload satisfies PptxPackagePart["payload"];
}

if (isPptxPackageModel(packageModelCandidate)) {
  packageModelCandidate.parts[0]?.payload satisfies PptxPackagePart["payload"] | undefined;
}

declare const projectSummary: ProjectInspectionSummary;
projectSummary.pptx.packageParts satisfies readonly ProjectInspectionPartSummary[];
projectSummary.pptx.relationshipCount satisfies number;
projectSummary.pptx.packageDependencyCount satisfies number;
projectSummary.relationships satisfies readonly ProjectInspectionRelationshipSummary[];
projectSummary.relationships[0]?.ownerPartId satisfies PackagePartId | undefined;
projectSummary.relationships[0]?.ownerPath satisfies string | undefined;
projectSummary.relationships[0]?.target satisfies string | undefined;
projectSummary.relationships[0]?.targetPath satisfies string | undefined;
projectSummary.relationships[0]?.targetPartId satisfies PackagePartId | undefined;
projectSummary.relationships[0]?.targetMode satisfies "external" | undefined;
projectSummary.packageDependencies satisfies readonly ProjectInspectionPackageDependencySummary[];
projectSummary.packageDependencies[0]?.ownerPartId satisfies PackagePartId | undefined;
projectSummary.packageDependencies[0]?.ownerPath satisfies string | undefined;
projectSummary.packageDependencies[0]?.targetPartId satisfies PackagePartId | undefined;
projectSummary.packageDependencies[0]?.targetPath satisfies string | undefined;
projectSummary.packageDependencies[0]?.reason satisfies
  | ProjectInspectionPackageDependencyReason
  | undefined;
projectSummary.packageDependencies[0]?.relationshipId satisfies PptxSerializedIdentity | undefined;
projectSummary.packageDependencies[0]?.relationshipType satisfies string | undefined;
projectSummary.packageDependencies[0]?.contentType satisfies string | undefined;
projectSummary.packageDependencies[0]?.fingerprint satisfies string | undefined;
projectSummary.packageDependencies[0]?.requirementStatus satisfies
  | PptxPackagePartRequirement["status"]
  | undefined;
projectSummary.packageDependencies[0]?.requirementCondition satisfies
  | NonNullable<PptxPackagePartRequirement["condition"]>
  | undefined;
// @ts-expect-error package dependency summaries expose projected dependency facts, not bytes.
void projectSummary.packageDependencies[0]?.bytes;
// @ts-expect-error package dependency summaries do not expose writer build artifacts.
void projectSummary.packageDependencies[0]?.buildArtifact;
projectSummary.parts[0]?.hasStructuredPayload satisfies boolean | undefined;
projectSummary.parts[0]?.payloadKind satisfies string | undefined;
projectSummary.parts[0]?.requirement satisfies PptxPackagePartRequirement | undefined;
projectSummary.parts[0]?.orderKey satisfies PptxPackagePartOrderKey | undefined;
projectSummary.parts[0]?.fingerprint satisfies string | undefined;
projectSummary.parts[0]?.dependencyFingerprintCount satisfies number | undefined;
projectSummary.media[0]?.partPath satisfies string | undefined;
projectSummary.media[0]?.metadata satisfies PptxMediaMetadata | undefined;
// @ts-expect-error media inspection summaries expose metadata, not loaded bytes.
void projectSummary.media[0]?.bytes;
// @ts-expect-error media inspection summaries do not expose authored/resolved source payloads.
void projectSummary.media[0]?.source;
projectSummary.filtered satisfies readonly ProjectInspectionFilteredRecord[];
projectSummary.unsupportedSemantics satisfies readonly ProjectInspectionUnsupportedSemanticRecord[];
projectSummary.details satisfies ProjectInspectionDetails | undefined;
projectSummary.details?.composedPaintOrder satisfies
  | readonly ProjectInspectionComposedPaintOrderSlideView[]
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0] satisfies
  | ProjectInspectionComposedPaintOrderEntry
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.source satisfies
  | "backgroundLayer"
  | "drawingNode"
  | "generatedStroke"
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.order satisfies number | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.siblingPath satisfies
  | readonly number[]
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.generatedStroke satisfies
  | PptxGeneratedStrokeLayer
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.generatedLayerIndex satisfies
  | number
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.backgroundLayerIndex satisfies
  | number
  | undefined;
projectSummary.details?.effectiveProjectedStyles satisfies
  | readonly ProjectInspectionEffectiveProjectedStyleSlideView[]
  | undefined;
projectSummary.details?.effectiveProjectedStyles[0]?.entries[0] satisfies
  | ProjectInspectionEffectiveProjectedStyleEntry
  | undefined;
projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.values satisfies
  | ProjectInspectionResolvedValues
  | undefined;
projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.values.textStyle satisfies
  | NonNullable<ProjectInspectionResolvedValues["textStyle"]>
  | undefined;
projectSummary.details?.packageDependencyInvalidation satisfies
  | ProjectInspectionPackageDependencyInvalidationView
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0] satisfies
  | ProjectInspectionPackageDependencyInvalidationEntry
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependencies satisfies
  | readonly ProjectInspectionPackageDependencySummary[]
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependents satisfies
  | readonly ProjectInspectionPackageDependencySummary[]
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependencyReasons satisfies
  | readonly ProjectInspectionPackageDependencyReason[]
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependentReasons satisfies
  | readonly ProjectInspectionPackageDependencyReason[]
  | undefined;
projectSummary.details?.paintFallbackAggregation satisfies
  | ProjectInspectionPaintFallbackAggregationView
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0] satisfies
  | ProjectInspectionPaintFallbackAggregationEntry
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.feature satisfies
  | PptxUnsupportedSemanticFeature
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.fallbackStrategy satisfies
  | PptxUnsupportedFallbackStrategy
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.count satisfies number | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.recordIndexes satisfies
  | readonly number[]
  | undefined;
projectSummary.details?.themeProjections satisfies ProjectInspectionThemeProjectionView | undefined;
projectSummary.details?.themeProjections.entries[0] satisfies
  | ProjectInspectionThemeProjectionEntry
  | undefined;
projectSummary.details?.themeProjections.entries[0]?.valueGroupFingerprints[0] satisfies
  | PptxThemeValueGroupFingerprint
  | undefined;
projectSummary.details?.themeProjections.entries[0]?.defaultStyleDecisions[0] satisfies
  | PptxThemeDefaultStyleDecision
  | undefined;
projectSummary.details?.themeProjections.entries[0]?.referenceSerialization[0] satisfies
  | PptxThemeReferenceSerializationChoice
  | undefined;
// @ts-expect-error detailed composed paint order entries are byte-free inspection records.
void projectSummary.details?.composedPaintOrder[0]?.entries[0]?.bytes;
// @ts-expect-error detailed composed paint order entries do not expose writer build artifacts.
void projectSummary.details?.composedPaintOrder[0]?.entries[0]?.buildArtifact;
// @ts-expect-error effective projected style entries are derived inspection records, not media stores.
void projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.bytes;
// @ts-expect-error effective projected style entries do not expose writer build artifacts.
void projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.buildArtifact;
// @ts-expect-error package dependency invalidation entries are byte-free inspection records.
void projectSummary.details?.packageDependencyInvalidation.entries[0]?.bytes;
// @ts-expect-error package dependency invalidation entries do not expose writer build artifacts.
void projectSummary.details?.packageDependencyInvalidation.entries[0]?.buildArtifact;
// @ts-expect-error paint fallback aggregation entries are byte-free inspection records.
void projectSummary.details?.paintFallbackAggregation.entries[0]?.bytes;
// @ts-expect-error paint fallback aggregation entries do not expose writer build artifacts.
void projectSummary.details?.paintFallbackAggregation.entries[0]?.buildArtifact;
// @ts-expect-error theme projection detail entries are byte-free inspection records.
void projectSummary.details?.themeProjections.entries[0]?.bytes;
// @ts-expect-error theme projection detail entries do not expose writer build artifacts.
void projectSummary.details?.themeProjections.entries[0]?.buildArtifact;
projectSummary.slides[0]?.backgroundLayers satisfies
  | readonly ProjectInspectionBackgroundLayerSummary[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.emissionTarget satisfies PptxEmissionTarget | undefined;
projectSummary.slides[0]?.elements[0]?.paintOrderIndex satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.paintOrder satisfies PptxPaintOrderInput | undefined;
projectSummary.slides[0]?.elements[0]?.zIndex satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.opacity satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.rotation satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.flipH satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.flipV satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.visibility satisfies PptxVisibility | undefined;
projectSummary.slides[0]?.elements[0]?.measurement satisfies PptxMeasurement | undefined;
projectSummary.slides[0]?.elements[0]?.clip satisfies PptxClip | undefined;
projectSummary.slides[0]?.elements[0]?.backgroundLayers satisfies
  | readonly ProjectInspectionBackgroundLayerSummary[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.edgeStrokes satisfies
  | PptxTextElement["edgeStrokes"]
  | undefined;
projectSummary.slides[0]?.elements[0]?.outline satisfies PptxTextElement["outline"] | undefined;
projectSummary.slides[0]?.elements[0]?.generatedStrokes satisfies
  | readonly PptxGeneratedStrokeLayer[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.opacity satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.rotation satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.flipH satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.flipV satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.zIndex satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.measurement satisfies
  | PptxMeasurement
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.clip satisfies PptxClip | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.backgroundLayers satisfies
  | readonly ProjectInspectionBackgroundLayerSummary[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.edgeStrokes satisfies
  | PptxTextElement["edgeStrokes"]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.outline satisfies
  | PptxTextElement["outline"]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.generatedStrokes satisfies
  | readonly PptxGeneratedStrokeLayer[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.layoutAnchor satisfies PptxLayoutAnchor | undefined;

declare const filteredRecord: ProjectInspectionFilteredRecord;
filteredRecord.reason satisfies ProjectInspectionFilteredReason;
filteredRecord.reason satisfies "displayNone";
filteredRecord.graphNodeId satisfies GraphNodeId;
filteredRecord.slidePartId satisfies PackagePartId | undefined;
filteredRecord.textPreview satisfies string | undefined;

declare const unsupportedSemanticRecord: ProjectInspectionUnsupportedSemanticRecord;
unsupportedSemanticRecord.elementId satisfies string;
unsupportedSemanticRecord.slidePartId satisfies PackagePartId;
unsupportedSemanticRecord.feature satisfies PptxUnsupportedSemanticFeature;
unsupportedSemanticRecord.paintOrder satisfies PptxPaintOrderInput | undefined;

import type * as I from "deckjsx/inspect";

const paintOrder = {
  zIndex: 10,
  siblingOrder: 2,
  generatedLayerRole: "authored",
} satisfies I.PptxPaintOrderInput;
void paintOrder;

const projectedClip = {
  strategy: "intersectParentOverflow",
  originalFrame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
  clipFrame: { xEmu: 0, yEmu: 0, widthEmu: 457200, heightEmu: 914400 },
  visibleFrame: { xEmu: 0, yEmu: 0, widthEmu: 457200, heightEmu: 914400 },
} satisfies I.PptxClip;
void projectedClip;

const backgroundLayerSummary = {
  kind: "background-image",
  frame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
  sourceFrame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
  sourceKind: "data",
  fit: "cover",
  repeat: "no-repeat",
  objectPosition: { x: 0.5, y: 0.5 },
} satisfies I.ProjectInspectionBackgroundLayerSummary;
backgroundLayerSummary.sourceKind satisfies "data";
// @ts-expect-error Project inspection background summaries are byte-free and do not expose source payloads.
void backgroundLayerSummary.source;
void backgroundLayerSummary;

const emissionTarget = "slide" satisfies I.PptxEmissionTarget;
void emissionTarget;

const measurement = {
  frame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 457200 },
  overflow: "clip",
} satisfies I.PptxMeasurement;
void measurement;

const layoutAnchor = {
  template: "report",
  area: "title",
  kind: "title",
  frame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 457200 },
} satisfies I.PptxLayoutAnchor;
void layoutAnchor;

declare const drawingNode: I.PptxDrawingNode;
drawingNode.emissionTarget satisfies I.PptxEmissionTarget;
drawingNode.paintOrder satisfies I.PptxPaintOrderInput;
drawingNode.clip satisfies I.PptxClip | undefined;
if (drawingNode.kind === "group") {
  drawingNode.backgroundLayers satisfies readonly I.PptxBackgroundLayer[] | undefined;
}
drawingNode.layoutAnchor satisfies I.PptxLayoutAnchor | undefined;
drawingNode.layoutAnchor?.kind satisfies
  | "body"
  | "date"
  | "footer"
  | "generic"
  | "picture"
  | "slideNumber"
  | "title"
  | undefined;
drawingNode.unsupportedSemantics satisfies readonly I.PptxUnsupportedSemantic[] | undefined;

declare const textElement: I.PptxTextElement;
textElement.kind satisfies "text";
textElement.measurement satisfies I.PptxMeasurement | undefined;
textElement.backgroundLayers satisfies readonly I.PptxBackgroundLayer[] | undefined;
textElement.generatedStrokes satisfies readonly I.PptxGeneratedStrokeLayer[] | undefined;
textElement.shadow satisfies I.PptxShadow | undefined;

declare const groupElement: I.PptxGroupElement;
groupElement.kind satisfies "group";
groupElement.children satisfies readonly I.PptxElement[];
groupElement.backgroundLayers satisfies readonly I.PptxBackgroundLayer[] | undefined;
groupElement.generatedStrokes satisfies readonly I.PptxGeneratedStrokeLayer[] | undefined;
groupElement.shadow satisfies I.PptxShadow | undefined;

declare const pictureElement: I.PptxPictureElement;
pictureElement.kind satisfies "image";
pictureElement.mediaPartId satisfies I.PackagePartId | undefined;
pictureElement.shadow satisfies I.PptxShadow | undefined;

declare const shapeElement: I.PptxShapeElement;
shapeElement.kind satisfies "shape";
shapeElement.backgroundLayers satisfies readonly I.PptxBackgroundLayer[] | undefined;
shapeElement.generatedStrokes satisfies readonly I.PptxGeneratedStrokeLayer[] | undefined;
shapeElement.shadow satisfies I.PptxShadow | undefined;

declare const pptxShadow: I.PptxShadow;
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
} satisfies I.PptxUnsupportedSemantic;
unsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
unsupportedSemantic.fallback satisfies I.PptxUnsupportedFallback;
unsupportedSemantic.fallback.strategy satisfies I.PptxUnsupportedFallbackStrategy;
void unsupportedSemantic;

const opacityUnsupportedSemantic = {
  feature: "opacity",
  property: "opacity",
  value: "0.5",
  reason: "group opacity compositing fallback",
} satisfies I.PptxUnsupportedSemantic;
opacityUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void opacityUnsupportedSemantic;

const clippingUnsupportedSemantic = {
  feature: "clipping",
  property: "overflow",
  value: "hidden + transform:intersectParentOverflow",
  reason: "clipping transform fallback",
} satisfies I.PptxUnsupportedSemantic;
clippingUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void clippingUnsupportedSemantic;

const filterUnsupportedSemantic = {
  feature: "filter",
  property: "filter",
  value: "blur(2px)",
  reason: "filter fallback",
} satisfies I.PptxUnsupportedSemantic;
filterUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void filterUnsupportedSemantic;

const imageUnsupportedSemantic = {
  feature: "image",
  property: "objectPosition",
  value: "somewhere",
  reason: "image positioning fallback",
} satisfies I.PptxUnsupportedSemantic;
imageUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void imageUnsupportedSemantic;

const blendUnsupportedSemantic = {
  feature: "blend",
  property: "mixBlendMode",
  value: "multiply",
  reason: "blend fallback",
} satisfies I.PptxUnsupportedSemantic;
blendUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void blendUnsupportedSemantic;

const borderUnsupportedSemantic = {
  feature: "border",
  property: "border",
  value: "2pt groove #111111",
  reason: "border fallback",
} satisfies I.PptxUnsupportedSemantic;
borderUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void borderUnsupportedSemantic;

const outlineUnsupportedSemantic = {
  feature: "outline",
  property: "outline",
  value: "1pt groove #222222",
  reason: "outline fallback",
} satisfies I.PptxUnsupportedSemantic;
outlineUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void outlineUnsupportedSemantic;

const strokeUnsupportedSemantic = {
  feature: "stroke",
  property: "strokeDasharray",
  value: "4 var(--gap)",
  reason: "stroke fallback",
} satisfies I.PptxUnsupportedSemantic;
strokeUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void strokeUnsupportedSemantic;

const isolationUnsupportedSemantic = {
  feature: "isolation",
  property: "isolation",
  value: "isolate",
  reason: "isolation fallback",
} satisfies I.PptxUnsupportedSemantic;
isolationUnsupportedSemantic.feature satisfies I.PptxUnsupportedSemanticFeature;
void isolationUnsupportedSemantic;

const slideDrawing = { children: [drawingNode] } satisfies I.PptxSlideDrawing;
void slideDrawing;

const slideLayoutAnchor = {
  template: "report",
  area: "body",
  kind: "generic",
  frame: { xEmu: 0, yEmu: 914400, widthEmu: 9144000, heightEmu: 2743200 },
  placeholderStrategy: "none",
} satisfies I.PptxSlideLayoutAnchor;
void slideLayoutAnchor;

const notesPlaceholderPayload = {
  kind: "notes-slide",
  status: "placeholder",
  editable: true,
  role: "notes-slide",
  source: "deckjsx-placeholder",
  settings: {},
} satisfies I.PptxNotesPlaceholderPayload;
void notesPlaceholderPayload;

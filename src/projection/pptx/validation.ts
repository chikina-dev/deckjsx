import {
  createDiagnostics,
  diagnostic,
  type Diagnostic,
  type Diagnostics,
} from "../../diagnostics";
import type { FrameIR } from "../../layout/projected";
import { isTemplateAreaKind } from "../../templates";
import { isPptxSlidePart } from "./model";
import type {
  PackagePartId,
  PptxContentTypesPayload,
  PptxDrawingNode,
  PptxElement,
  PptxMediaPartPayload,
  PptxPackageModelCandidate,
  PptxPackagePartCandidate,
  PptxPackagePartOrderKey,
  PptxPackagePartRequirement,
  PptxRelationship,
  PptxSlideLayoutAnchor,
  PptxSlideLayoutPartPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxTableCell,
  PptxTableRow,
  PptxTableSection,
  PptxThemePartPayload,
  PptxUnsupportedSemantic,
} from "./model";
import { packagePartFingerprint, stableJson } from "./fingerprint";
import { projectedRelationshipTarget } from "./relationships";
import {
  isContentTypesPayload,
  isPresentationPayload,
  isRecord,
  isRelationshipsPayload,
  isSlideLayoutPayload,
  isSlideMasterPayload,
  isThemePayload,
} from "./package-candidates";

type PptxPackagePart = PptxPackagePartCandidate;

type PptxValidationDrawingElement = PptxElement &
  Partial<Pick<PptxDrawingNode, "emissionTarget" | "paintOrderIndex">>;

const REQUIRED_PACKAGE_PATHS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/app.xml",
  "docProps/core.xml",
  "ppt/presentation.xml",
  "ppt/_rels/presentation.xml.rels",
  "ppt/theme/theme1.xml",
  "ppt/slideMasters/slideMaster1.xml",
  "ppt/slideLayouts/slideLayout1.xml",
  "ppt/viewProps.xml",
  "ppt/presProps.xml",
] as const;

const UNSUPPORTED_SEMANTIC_FEATURES = [
  "background",
  "blend",
  "border",
  "clipping",
  "content",
  "filter",
  "image",
  "isolation",
  "layout",
  "outline",
  "opacity",
  "shadow",
  "stroke",
  "transform",
] as const;

const UNSUPPORTED_FALLBACK_STRATEGIES = [
  "axisAlignedClipWithoutTransformedMask",
  "cascadeOpacityToChildren",
  "dropBlendMode",
  "dropFilterEffect",
  "dropIsolationGroup",
  "preserveAuthoredValueOnly",
  "preserveOpacityWithoutCompositedSubtree",
  "preserveTransformWithoutStackingContext",
  "sourceRectBeforeTransform",
  "synthesizeFallbackFrame",
] as const;

const THEME_VALUE_GROUPS = ["colorScheme", "fontScheme", "formatScheme", "themeDefaults"] as const;

const THEME_REFERENCE_SERIALIZATION_KINDS = [
  "concreteDrawingValue",
  "latinTypeface",
  "srgbClr",
] as const;

const THEME_REFERENCE_SERIALIZATION_DECISIONS = [
  "deferThemeReferenceSerialization",
  "emitConcreteValue",
  "noThemeReferenceCandidate",
] as const;

const THEME_DEFAULT_STYLE_DECISIONS = [
  "projectConcreteDrawingProperty",
  "projectDrawingMetadata",
  "projectFilteredState",
  "projectLayoutInput",
  "preserveAsStyleInput",
  "preserveUnsupportedSemantic",
] as const;

const THEME_DEFAULT_STYLE_PROJECTION_TARGETS = [
  "concreteDrawingProperty",
  "drawingMetadata",
  "filteredProjectionInput",
  "layoutInput",
  "styleInput",
  "unsupportedSemanticFallback",
] as const;

const THEME_EFFECTIVE_INHERITANCE_STEPS = [
  "themePart",
  "slideMaster",
  "slideLayout",
  "slide",
  "drawing",
] as const;

const DRAWING_EMISSION_TARGETS = ["slide", "slideLayout", "slideMaster"] as const;

const DRAWING_GENERATED_LAYER_ROLES = [
  "authored",
  "background",
  "border",
  "outline",
  "template",
] as const;

const DRAWING_GENERATED_STROKE_ROLES = ["border", "outline"] as const;
const DRAWING_GENERATED_STROKE_EDGES = ["top", "right", "bottom", "left"] as const;
const DRAWING_GENERATED_STROKE_SHAPES = ["line", "rect"] as const;

const DRAWING_ELEMENT_KINDS = ["group", "image", "shape", "table", "text", "video"] as const;

const DRAWING_VISIBILITIES = ["hidden", "visible"] as const;

const DRAWING_CLIP_STRATEGIES = ["intersectParentOverflow"] as const;

const DRAWING_MEASUREMENT_OVERFLOWS = ["clip", "fit", "visible"] as const;

const TEXT_UNDERLINE_STYLES = ["dash", "dbl", "dotted", "none", "sng", "wavy"] as const;

const TEXT_DIRECTIONS = ["horz", "vert", "vert270"] as const;

const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;

const TEXT_VERTICAL_ALIGNMENTS = ["top", "middle", "bottom"] as const;

const TEXT_FIT_VALUES = ["none", "shrink", "resize"] as const;

const TEXT_TAB_STOP_ALIGNMENTS = ["l", "r", "ctr", "dec"] as const;

const TEXT_NUMBER_LIST_STYLES = [
  "arabicPeriod",
  "alphaLcPeriod",
  "alphaUcPeriod",
  "romanLcPeriod",
  "romanUcPeriod",
] as const;

const STROKE_STYLES = ["none", "solid", "dash"] as const;

const STROKE_DASH_TYPES = [
  "dash",
  "dashDot",
  "lgDash",
  "lgDashDot",
  "lgDashDotDot",
  "solid",
  "sysDash",
  "sysDot",
] as const;

const STROKE_LINE_CAPS = ["butt", "round", "square"] as const;

const STROKE_LINE_JOINS = ["bevel", "miter", "round"] as const;

const SHADOW_TYPES = ["inner", "outer"] as const;

const DRAWING_BACKGROUND_IMAGE_FITS = ["contain", "cover", "size", "stretch"] as const;

const DRAWING_BACKGROUND_IMAGE_REPEATS = ["no-repeat", "repeat", "repeat-x", "repeat-y"] as const;

const PACKAGE_PART_CATEGORIES = ["authored-content", "manifest", "support"] as const;

const MAX_WRITER_SHAPE_OBJECT_ID = Number.MAX_SAFE_INTEGER - 1;
const MIN_PRESENTATION_SLIDE_ID = 256;
const MAX_PRESENTATION_SLIDE_ID = 2147483647;
const MIN_PRESENTATION_SLIDE_MASTER_ID = 2147483648;
const MIN_SLIDE_MASTER_LAYOUT_ID = 2147483649;
const MAX_OOXML_UNSIGNED_INT_ID = 4294967295;

const PACKAGE_PART_KINDS = [
  "content-types",
  "document-properties",
  "media",
  "notes-master",
  "notes-slide",
  "presentation",
  "presentation-properties",
  "relationships",
  "slide",
  "slide-layout",
  "slide-master",
  "table-styles",
  "theme",
  "view-properties",
] as const;

const PACKAGE_PART_ORDER_GROUP_ORDERS = {
  contentTypes: 0,
  rootRelationships: 10,
  documentProperties: 20,
  presentation: 30,
  presentationRelationships: 40,
  theme: 50,
  slideMaster: 60,
  slideMasterRelationships: 61,
  slideLayout: 70,
  slideLayoutRelationships: 71,
  viewProperties: 75,
  presentationProperties: 76,
  tableStyles: 77,
  slide: 80,
  slideRelationships: 81,
  media: 90,
  other: 900,
} satisfies Record<PptxPackagePartOrderKey["group"], number>;

const SLIDE_MASTER_COLOR_MAP_KEYS = [
  "bg1",
  "tx1",
  "bg2",
  "tx2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;

const THEME_COLOR_KEYS = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;

const PROJECTED_RGB_COLOR_PATTERN = /^[0-9A-Fa-f]{6}$/;
const TEXT_BULLET_CHARACTER_CODE_PATTERN = /^[0-9A-Fa-f]+$/;
const CONTENT_TYPE_DEFAULT_EXTENSION_PATTERN = /^[A-Za-z0-9]+$/;
const RELATIONSHIP_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const PACKAGE_PART_ID_PATTERN = /^pptx:[^\s]+$/;
const CUSTOM_RELATIONSHIP_TYPE_PROTOCOLS = ["http:", "https:"] as const;
const EXTERNAL_RELATIONSHIP_TARGET_PROTOCOLS = ["http:", "https:", "mailto:"] as const;
const MEDIA_PART_PATH_PATTERN = /^ppt\/media\/[^/]+\.[^/.]+$/;
const NOTES_MASTER_PART_PATH_PATTERN = /^ppt\/notesMasters\/notesMaster[1-9]\d*\.xml$/;
const NOTES_SLIDE_PART_PATH_PATTERN = /^ppt\/notesSlides\/notesSlide[1-9]\d*\.xml$/;
const RELATIONSHIPS_PART_PATH_PATTERNS = [
  /^_rels\/\.rels$/,
  /^ppt\/_rels\/presentation\.xml\.rels$/,
  /^ppt\/slideMasters\/_rels\/slideMaster[1-9]\d*\.xml\.rels$/,
  /^ppt\/slideLayouts\/_rels\/slideLayout[1-9]\d*\.xml\.rels$/,
  /^ppt\/slides\/_rels\/slide[1-9]\d*\.xml\.rels$/,
] as const;
const SLIDE_LAYOUT_PART_PATH_PATTERN = /^ppt\/slideLayouts\/slideLayout[1-9]\d*\.xml$/;
const SLIDE_MASTER_PART_PATH_PATTERN = /^ppt\/slideMasters\/slideMaster[1-9]\d*\.xml$/;
const SLIDE_PART_PATH_PATTERN = /^ppt\/slides\/slide[1-9]\d*\.xml$/;
const THEME_PART_PATH_PATTERN = /^ppt\/theme\/theme[1-9]\d*\.xml$/;

const CONTENT_TYPE_RELATIONSHIPS = "application/vnd.openxmlformats-package.relationships+xml";
const CONTENT_TYPE_XML = "application/xml";
const CONTENT_TYPE_PRESENTATION =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const CONTENT_TYPE_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const CONTENT_TYPE_SLIDE_LAYOUT =
  "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml";
const CONTENT_TYPE_SLIDE_MASTER =
  "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml";
const CONTENT_TYPE_THEME = "application/vnd.openxmlformats-officedocument.theme+xml";
const CONTENT_TYPE_CORE_PROPERTIES = "application/vnd.openxmlformats-package.core-properties+xml";
const CONTENT_TYPE_EXTENDED_PROPERTIES =
  "application/vnd.openxmlformats-officedocument.extended-properties+xml";
const CONTENT_TYPE_VIEW_PROPERTIES =
  "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml";
const CONTENT_TYPE_PRESENTATION_PROPERTIES =
  "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml";
const CONTENT_TYPE_TABLE_STYLES =
  "application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml";
const CONTENT_TYPE_NOTES_MASTER =
  "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml";
const CONTENT_TYPE_NOTES_SLIDE =
  "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";

const INTERNAL_RELATIONSHIP_TARGET_KINDS = {
  coreProperties: ["document-properties"],
  extendedProperties: ["document-properties"],
  image: ["media"],
  media: ["media"],
  video: ["media"],
  officeDocument: ["presentation"],
  presentationProperties: ["presentation-properties"],
  slide: ["slide"],
  slideLayout: ["slide-layout"],
  slideMaster: ["slide-master"],
  tableStyles: ["table-styles"],
  theme: ["theme"],
  viewProperties: ["view-properties"],
} as const satisfies Record<string, readonly PptxPackagePart["kind"][]>;

const KNOWN_RELATIONSHIP_OWNER_TYPES = {
  presentation: [
    "presentationProperties",
    "slide",
    "slideMaster",
    "tableStyles",
    "theme",
    "viewProperties",
  ],
  root: ["coreProperties", "extendedProperties", "officeDocument"],
  slide: ["hyperlink", "image", "media", "slideLayout", "video"],
  slideLayout: ["slideMaster"],
  slideMaster: ["slideLayout", "theme"],
} as const satisfies Record<string, readonly string[]>;

function normalizedPartPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function isCanonicalPackagePartPath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/") || path.includes("\\")) {
    return false;
  }

  return path
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isCanonicalContentTypePartName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    value.length > 1 &&
    isCanonicalPackagePartPath(normalizedPartPath(value))
  );
}

function isCanonicalContentTypeDefaultExtension(value: unknown): value is string {
  return typeof value === "string" && CONTENT_TYPE_DEFAULT_EXTENSION_PATTERN.test(value);
}

function isSupportedExternalRelationshipTarget(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return EXTERNAL_RELATIONSHIP_TARGET_PROTOCOLS.some((protocol) => protocol === url.protocol);
  } catch {
    return false;
  }
}

function isValidRelationshipType(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  if (value === "hyperlink" || value in INTERNAL_RELATIONSHIP_TARGET_KINDS) {
    return true;
  }

  try {
    const url = new URL(value);
    return CUSTOM_RELATIONSHIP_TYPE_PROTOCOLS.some((protocol) => protocol === url.protocol);
  } catch {
    return false;
  }
}

function isKnownUnsupportedSemanticFeature(value: unknown): boolean {
  return UNSUPPORTED_SEMANTIC_FEATURES.some((feature) => feature === value);
}

function isKnownUnsupportedFallbackStrategy(value: unknown): boolean {
  return UNSUPPORTED_FALLBACK_STRATEGIES.some((strategy) => strategy === value);
}

function isKnownThemeValueGroup(value: unknown): boolean {
  return THEME_VALUE_GROUPS.some((group) => group === value);
}

function isKnownThemeReferenceSerializationKind(value: unknown): boolean {
  return THEME_REFERENCE_SERIALIZATION_KINDS.some((kind) => kind === value);
}

function isKnownThemeReferenceSerializationDecision(value: unknown): boolean {
  return THEME_REFERENCE_SERIALIZATION_DECISIONS.some((decision) => decision === value);
}

function isKnownThemeDefaultStyleDecision(value: unknown): boolean {
  return THEME_DEFAULT_STYLE_DECISIONS.some((decision) => decision === value);
}

function isKnownThemeDefaultStyleProjectionTarget(value: unknown): boolean {
  return THEME_DEFAULT_STYLE_PROJECTION_TARGETS.some((target) => target === value);
}

function isKnownThemeEffectiveInheritanceStep(value: unknown): boolean {
  return THEME_EFFECTIVE_INHERITANCE_STEPS.some((step) => step === value);
}

function themeTraceDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_THEME_PROJECTION_TRACE",
    title: input.title ?? "pptx theme projection trace is invalid",
    message: "Pptx Theme Projection trace must preserve structured theme projection decisions.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function drawingMetadataDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
    title: input.title ?? "pptx drawing metadata is invalid",
    message:
      "Pptx Drawing Nodes must preserve structured metadata needed by inspection and writer emission.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function drawingOriginDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_DRAWING_ORIGIN",
    title: input.title ?? "pptx drawing origin metadata is invalid",
    message:
      "Pptx Drawing Nodes must preserve structured graph, style, asset, and source origin metadata for inspection and incremental projection.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function drawingPayloadDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
    title: input.title ?? "pptx drawing payload is invalid",
    message:
      "Pptx Drawing Nodes must preserve structured kind-specific payloads needed by inspection and drawing XML emission.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function supportPayloadDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_SUPPORT_PAYLOAD",
    title: input.title ?? "pptx support payload is invalid",
    message:
      "Pptx support parts must preserve structured payloads needed by inspection and writer emission.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function manifestPayloadDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
    title: input.title ?? "pptx manifest payload is invalid",
    message:
      "Pptx manifest parts must preserve structured payloads needed by package topology XML emission.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function mediaPayloadDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
    title: input.title ?? "pptx media payload is invalid",
    message:
      "Pptx media parts must preserve source and metadata values needed by media byte emission and inspection.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function unsupportedVideoMediaDiagnostic(input: {
  path: string;
  message: string;
  mediaType?: string;
  extension?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PROJECT_VIDEO_FORMAT_UNSUPPORTED",
    title: "video format is not supported by the pptx projection",
    message: "The initial pptx video compatibility target only accepts MP4 video media.",
    labels: [{ path: input.path, message: input.message }],
    notes: [
      input.mediaType ? `mediaType=${input.mediaType}` : undefined,
      input.extension ? `extension=${input.extension}` : undefined,
    ].filter((note): note is string => note !== undefined),
    help: ["Use video/mp4 media or an .mp4 source for the video tag."],
  });
}

function partRelationshipDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
    title: input.title ?? "pptx package part relationship metadata is invalid",
    message:
      "Pptx Package Model part relationships must preserve structured relationship records needed by projection inspection and writer emission.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function partOriginDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_PART_ORIGIN",
    title: input.title ?? "pptx package part origin metadata is invalid",
    message:
      "Pptx Package Model part origins must preserve structured graph and source metadata for inspection and incremental package rebuilds.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function slidePayloadDiagnostic(input: {
  path: string;
  message: string;
  title?: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
    title: input.title ?? "pptx slide payload is invalid",
    message:
      "Pptx slide parts must preserve structured payloads needed by inspection and slide XML emission.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function isKnownDrawingEmissionTarget(value: unknown): boolean {
  return DRAWING_EMISSION_TARGETS.some((target) => target === value);
}

function isKnownDrawingGeneratedLayerRole(value: unknown): boolean {
  return DRAWING_GENERATED_LAYER_ROLES.some((role) => role === value);
}

function isKnownDrawingElementKind(value: unknown): boolean {
  return DRAWING_ELEMENT_KINDS.some((kind) => kind === value);
}

function isKnownDrawingVisibility(value: unknown): boolean {
  return DRAWING_VISIBILITIES.some((visibility) => visibility === value);
}

function isKnownDrawingClipStrategy(value: unknown): boolean {
  return DRAWING_CLIP_STRATEGIES.some((strategy) => strategy === value);
}

function isPptxTableElement(value: unknown): value is Extract<PptxElement, { kind: "table" }> {
  return isRecord(value) && value.kind === "table" && Array.isArray(value.sections);
}

function visitTableChildElements(
  element: unknown,
  path: string,
  visit: (child: PptxElement, path: string) => void,
): void {
  if (!isPptxTableElement(element)) {
    return;
  }

  element.sections.forEach((section, sectionIndex) => {
    section.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, cellIndex) => {
        cell.children.forEach((child, childIndex) => {
          visit(
            child,
            `${path}.sections.${sectionIndex}.rows.${rowIndex}.cells.${cellIndex}.children.${childIndex}`,
          );
        });
      });
    });
  });
}

function isKnownDrawingMeasurementOverflow(value: unknown): boolean {
  return DRAWING_MEASUREMENT_OVERFLOWS.some((overflow) => overflow === value);
}

function isKnownPackagePartCategory(value: unknown): boolean {
  return PACKAGE_PART_CATEGORIES.some((category) => category === value);
}

function isKnownPackagePartKind(value: unknown): boolean {
  return PACKAGE_PART_KINDS.some((kind) => kind === value);
}

function isCompatiblePackagePartCategoryKind(input: { category: unknown; kind: unknown }): boolean {
  if (!isKnownPackagePartCategory(input.category) || !isKnownPackagePartKind(input.kind)) {
    return true;
  }

  if (input.kind === "content-types") {
    return input.category === "manifest";
  }

  if (input.kind === "relationships") {
    return input.category === "manifest" || input.category === "authored-content";
  }

  if (input.kind === "media" || input.kind === "slide") {
    return input.category === "authored-content";
  }

  return input.category === "support";
}

function validateFrame(input: { path: string; frame: FrameIR }): Diagnostics["items"] {
  const issues: Diagnostic[] = [];
  const frame = input.frame;
  (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).forEach((key) => {
    const value = frame[key];
    const valid =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (key === "xEmu" || key === "yEmu" ? true : value > 0);
    if (!valid) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR",
          title: "pptx slide layout anchor frame is invalid",
          message: "Template Area layout anchors must carry finite EMU frame values.",
          labels: [
            {
              path: `${input.path}.${key}`,
              message: "invalid anchor frame value",
            },
          ],
        }),
      );
    }
  });

  return issues;
}

function validateDrawingFrame(input: { frame: unknown; path: string }): Diagnostics["items"] {
  if (typeof input.frame !== "object" || input.frame === null) {
    return [
      drawingMetadataDiagnostic({
        path: input.path,
        message: "invalid drawing frame",
        title: "pptx drawing frame is invalid",
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  const frame = input.frame as Partial<Record<"heightEmu" | "widthEmu" | "xEmu" | "yEmu", unknown>>;
  (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).forEach((key) => {
    const value = frame[key];
    const valid =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (key === "xEmu" || key === "yEmu" ? true : value >= 0);
    if (!valid) {
      issues.push(
        drawingMetadataDiagnostic({
          path: `${input.path}.${key}`,
          message: `invalid drawing frame ${key}`,
          title: "pptx drawing frame is invalid",
        }),
      );
    }
  });
  return issues;
}

function validateDrawingFrameExtent(input: {
  element: Record<string, unknown>;
  path: string;
}): Diagnostics["items"] {
  const frame = input.element.frame;
  if (typeof frame !== "object" || frame === null) {
    return [];
  }

  const { widthEmu, heightEmu } = frame as Partial<Record<"widthEmu" | "heightEmu", unknown>>;
  if (
    typeof widthEmu !== "number" ||
    typeof heightEmu !== "number" ||
    !Number.isFinite(widthEmu) ||
    !Number.isFinite(heightEmu)
  ) {
    return [];
  }

  const isLineShape = input.element.kind === "shape" && input.element.shape === "line";
  if (isLineShape) {
    return widthEmu === 0 && heightEmu === 0
      ? [
          drawingMetadataDiagnostic({
            path: `${input.path}.frame`,
            message: "line shape frame must have a non-zero axis",
            title: "pptx drawing frame is degenerate",
          }),
        ]
      : [];
  }

  const issues: Diagnostic[] = [];
  if (widthEmu === 0) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.frame.widthEmu`,
        message: "drawing frame width must be greater than zero",
        title: "pptx drawing frame is degenerate",
      }),
    );
  }
  if (heightEmu === 0) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.frame.heightEmu`,
        message: "drawing frame height must be greater than zero",
        title: "pptx drawing frame is degenerate",
      }),
    );
  }

  return issues;
}

function validateSlideLayoutAnchor(input: {
  part: PptxPackagePart;
  anchor: PptxSlideLayoutAnchor;
  path: string;
}): Diagnostics["items"] {
  const issues = [];

  if (typeof input.anchor.template !== "string" || input.anchor.template.length === 0) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR",
        title: "pptx slide layout anchor template is invalid",
        message: "Template Area layout anchors must preserve the owning Template name.",
        labels: [{ path: `${input.path}.template`, message: "invalid template name" }],
      }),
    );
  }

  if (typeof input.anchor.area !== "string" || input.anchor.area.length === 0) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR",
        title: "pptx slide layout anchor area is invalid",
        message: "Template Area layout anchors must preserve the Template Area name.",
        labels: [{ path: `${input.path}.area`, message: "invalid area name" }],
      }),
    );
  }

  if (!isTemplateAreaKind(input.anchor.kind)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR",
        title: "pptx slide layout anchor kind is invalid",
        message: "Template Area layout anchors must preserve a known authoring-level area kind.",
        labels: [{ path: `${input.path}.kind`, message: "invalid area kind" }],
      }),
    );
  }

  if (input.anchor.placeholderStrategy !== "none") {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR",
        title: "pptx slide layout anchor placeholder strategy is invalid",
        message:
          'v0.8 slide layout anchors must use placeholderStrategy "none" until richer PPTX placeholder projection exists.',
        labels: [
          {
            path: `${input.path}.placeholderStrategy`,
            message: "invalid placeholder strategy",
          },
        ],
      }),
    );
  }

  issues.push(...validateFrame({ path: `${input.path}.frame`, frame: input.anchor.frame }));

  return issues;
}

function validateSlideLayoutPayload(input: {
  part: PptxPackagePart;
  payload: PptxSlideLayoutPartPayload;
}): Diagnostics["items"] {
  const issues = [];

  if (input.payload.layoutAnchors !== undefined) {
    if (!Array.isArray(input.payload.layoutAnchors)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_LAYOUT_ANCHOR",
          title: "pptx slide layout anchors are invalid",
          message: "Slide layout payload layoutAnchors must be an array when present.",
          labels: [
            {
              path: `projection.parts.${input.part.id}.payload.layoutAnchors`,
              message: "invalid layout anchors",
            },
          ],
        }),
      );
    } else {
      input.payload.layoutAnchors.forEach((anchor, index) => {
        issues.push(
          ...validateSlideLayoutAnchor({
            part: input.part,
            anchor,
            path: `projection.parts.${input.part.id}.payload.layoutAnchors.${index}`,
          }),
        );
      });
    }
  }

  return issues;
}

function validateDocumentPropertiesPayload(input: {
  part: PptxPackagePart;
  expectedSlideCount?: number;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload) || payload.kind !== "document-properties") {
    return [supportPayloadDiagnostic({ path, message: "invalid document properties payload" })];
  }

  const expectedKind = input.part.path.endsWith("/app.xml") ? "extended" : "core";
  const issues: Diagnostic[] = [];

  if (payload.propertyKind !== expectedKind) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.propertyKind`,
        message: `expected ${expectedKind} document properties payload`,
      }),
    );
  }

  if (payload.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.editable`,
        message: "document properties payload must remain editable",
      }),
    );
  }

  const expectedSource = expectedKind === "core" ? "deckjsx-meta" : "deckjsx-projection";
  if (payload.source !== expectedSource) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.source`,
        message: `document properties payload source must be ${expectedSource}`,
      }),
    );
  }

  if (expectedKind === "core") {
    if (!isRecord(payload.meta)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.meta`,
          message: "invalid core document properties metadata",
        }),
      );
    }

    const meta = payload.meta;
    if (isRecord(meta)) {
      (["title", "subject", "author"] as const).forEach((key) => {
        const value = meta[key];
        if (value !== undefined && typeof value !== "string") {
          issues.push(
            supportPayloadDiagnostic({
              path: `${path}.meta.${key}`,
              message: `invalid ${key} metadata`,
            }),
          );
        }
      });
    }
  }

  if (expectedKind === "extended") {
    if (payload.application !== "deckjsx") {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.application`,
          message: "invalid extended document properties application",
        }),
      );
    }

    if (
      typeof payload.slideCount !== "number" ||
      !Number.isFinite(payload.slideCount) ||
      payload.slideCount < 0
    ) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideCount`,
          message: "invalid extended document properties slide count",
        }),
      );
    } else if (
      input.expectedSlideCount !== undefined &&
      payload.slideCount !== input.expectedSlideCount
    ) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideCount`,
          message: `expected extended document properties slide count ${input.expectedSlideCount}`,
        }),
      );
    }
  }

  return issues;
}

function validatePresentationPayload(input: {
  part: PptxPackagePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isPresentationPayload(payload)) {
    return [supportPayloadDiagnostic({ path, message: "invalid presentation payload" })];
  }

  const issues: Diagnostic[] = [];
  (["widthEmu", "heightEmu"] as const).forEach((key) => {
    const value = payload.size[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.size.${key}`,
          message: `invalid presentation size ${key}`,
        }),
      );
    }
  });

  if (
    !isRecord(payload.defaultTextStyle) ||
    payload.defaultTextStyle.source !== "themeProjection" ||
    !Array.isArray(payload.defaultTextStyle.levels) ||
    payload.defaultTextStyle.levels.length !== 9
  ) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.defaultTextStyle`,
        message: "presentation payload requires structured default text style projection",
      }),
    );
  } else {
    payload.defaultTextStyle.levels.forEach((level, index) => {
      if (
        !isRecord(level) ||
        level.level !== index + 1 ||
        typeof level.marginLeftEmu !== "number" ||
        !Number.isFinite(level.marginLeftEmu) ||
        typeof level.defaultTabSizeEmu !== "number" ||
        !Number.isFinite(level.defaultTabSizeEmu) ||
        typeof level.fontSizePt !== "number" ||
        !Number.isFinite(level.fontSizePt) ||
        typeof level.colorThemeReference !== "string" ||
        level.colorThemeReference.length === 0 ||
        typeof level.latinTypeface !== "string" ||
        level.latinTypeface.length === 0 ||
        typeof level.eastAsianTypeface !== "string" ||
        level.eastAsianTypeface.length === 0 ||
        typeof level.complexScriptTypeface !== "string" ||
        level.complexScriptTypeface.length === 0 ||
        !["l", "ctr", "r", "just"].includes(String(level.alignment))
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.defaultTextStyle.levels.${index}`,
            message: "invalid default text style level",
          }),
        );
      }
    });
  }

  const seenSlideMasterPartIds = new Set<string>();
  const seenSlideMasterIds = new Set<string>();
  if (payload.slideMasterIds.length === 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.slideMasterIds`,
        message: "invalid presentation slide master ids",
      }),
    );
  }
  payload.slideMasterIds.forEach((slideMasterId, index) => {
    if (!isRecord(slideMasterId)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideMasterIds.${index}`,
          message: "invalid presentation slide master id entry",
        }),
      );
      return;
    }

    const slideMasterPartId = slideMasterId.slideMasterPartId;
    const slideMasterPart =
      typeof slideMasterPartId === "string" ? input.partsById.get(slideMasterPartId) : undefined;
    if (
      typeof slideMasterPartId !== "string" ||
      slideMasterPartId.length === 0 ||
      !slideMasterPart
    ) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideMasterIds.${index}.slideMasterPartId`,
          message: "invalid presentation slide master part id",
        }),
      );
    } else if (slideMasterPart.kind !== "slide-master") {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideMasterIds.${index}.slideMasterPartId`,
          message: `presentation slide master part id targets ${slideMasterPart.kind}`,
        }),
      );
    } else if (seenSlideMasterPartIds.has(slideMasterPartId)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideMasterIds.${index}.slideMasterPartId`,
          message: `duplicate presentation slide master part ${slideMasterPartId}`,
        }),
      );
    } else {
      seenSlideMasterPartIds.add(slideMasterPartId);
    }

    const numericId = slideMasterId.id;
    if (
      !isPptxUnsignedNumericId(
        numericId,
        MIN_PRESENTATION_SLIDE_MASTER_ID,
        MAX_OOXML_UNSIGNED_INT_ID,
      )
    ) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideMasterIds.${index}.id`,
          message: "invalid presentation slide master numeric id",
        }),
      );
    } else if (seenSlideMasterIds.has(numericId)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideMasterIds.${index}.id`,
          message: `duplicate presentation slide master numeric id ${numericId}`,
        }),
      );
    } else {
      seenSlideMasterIds.add(numericId);
    }
  });

  const seenSlidePartIds = new Set<string>();
  const seenSlideIds = new Set<string>();
  payload.slidePartIds.forEach((slidePartId, index) => {
    if (typeof slidePartId !== "string" || slidePartId.length === 0) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slidePartIds.${index}`,
          message: "invalid presentation slide part id",
        }),
      );
      return;
    }

    if (seenSlidePartIds.has(slidePartId)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slidePartIds.${index}`,
          message: `duplicate presentation slide part ${slidePartId}`,
        }),
      );
      return;
    }
    seenSlidePartIds.add(slidePartId);

    const slidePart = input.partsById.get(slidePartId);
    if (!slidePart) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slidePartIds.${index}`,
          message: `missing presentation slide part ${slidePartId}`,
        }),
      );
    } else if (slidePart.kind !== "slide") {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slidePartIds.${index}`,
          message: `presentation slide part id targets ${slidePart.kind}`,
        }),
      );
    } else if (isRecord(slidePart.payload) && isPresentationSlideId(slidePart.payload.slideId)) {
      const slideId = slidePart.payload.slideId;
      if (seenSlideIds.has(slideId)) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slidePartIds.${index}`,
            message: `duplicate presentation slide id ${slideId}`,
          }),
        );
      } else {
        seenSlideIds.add(slideId);
      }
    }
  });

  return issues;
}

function validateEmptySupportPropertiesPayload(input: {
  part: PptxPackagePart;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload)) {
    return [supportPayloadDiagnostic({ path, message: "invalid support properties payload" })];
  }

  const expectedKind = input.part.kind;
  const issues: Diagnostic[] = [];

  if (payload.kind !== expectedKind) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.kind`,
        message: `expected ${expectedKind} payload`,
      }),
    );
  }

  if (payload.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.editable`,
        message: "support properties payload must remain editable",
      }),
    );
  }

  if (!isRecord(payload.settings)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.settings`,
        message: "invalid support properties settings",
      }),
    );
  } else if (Object.keys(payload.settings).length > 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.settings`,
        message: "support properties settings must stay empty until structured settings exist",
      }),
    );
  }

  return issues;
}

function validateTableStylesPayload(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload)) {
    return [supportPayloadDiagnostic({ path, message: "invalid table styles payload" })];
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const issues: Diagnostic[] = [];

  if (record.kind !== "table-styles") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.kind`,
        message: "expected table-styles payload",
      }),
    );
  }

  if (record.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.editable`,
        message: "table styles payload must remain editable",
      }),
    );
  }

  if (typeof record.defaultStyleId !== "string" || record.defaultStyleId.length === 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.defaultStyleId`,
        message: "table styles payload requires defaultStyleId",
      }),
    );
  }

  if (typeof record.styleName !== "string" || record.styleName.length === 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.styleName`,
        message: "table styles payload requires styleName",
      }),
    );
  }

  if (!isRecord(record.slots)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.slots`,
        message: "table styles payload requires structured slots",
      }),
    );
  } else {
    for (const key of ["wholeTable", "headerRow", "firstColumn", "bandedRows"] as const) {
      const slot = record.slots[key];
      if (!isRecord(slot)) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slots.${key}`,
            message: "table style slot must be structured",
          }),
        );
        continue;
      }
      if (slot.status !== "supported" && slot.status !== "placeholder") {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slots.${key}.status`,
            message: "table style slot requires supported or placeholder status",
          }),
        );
      }
      if (
        slot.status === "placeholder" &&
        (typeof slot.reason !== "string" || slot.reason.length === 0)
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slots.${key}.reason`,
            message: "placeholder table style slot requires a reason",
          }),
        );
      }
      if (slot.status === "supported" && isRecord(slot.border)) {
        if (
          typeof slot.border.themeReference !== "string" ||
          slot.border.themeReference.length === 0
        ) {
          issues.push(
            supportPayloadDiagnostic({
              path: `${path}.slots.${key}.border.themeReference`,
              message: "supported table style border requires themeReference",
            }),
          );
        }
        if (
          slot.border.widthPt !== undefined &&
          (typeof slot.border.widthPt !== "number" ||
            !Number.isFinite(slot.border.widthPt) ||
            slot.border.widthPt < 0)
        ) {
          issues.push(
            supportPayloadDiagnostic({
              path: `${path}.slots.${key}.border.widthPt`,
              message: "supported table style border width must be a non-negative number",
            }),
          );
        }
      }
    }
  }

  return issues;
}

function validateNotesPlaceholderPayload(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload)) {
    return [supportPayloadDiagnostic({ path, message: "invalid notes placeholder payload" })];
  }

  const issues: Diagnostic[] = [];
  if (payload.kind !== input.part.kind) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.kind`,
        message: `expected ${input.part.kind} payload`,
      }),
    );
  }
  if (payload.status !== "placeholder") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.status`,
        message: "notes support payload must remain a placeholder until notes projection exists",
      }),
    );
  }
  if (payload.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.editable`,
        message: "notes support payload must remain editable",
      }),
    );
  }
  if (payload.role !== input.part.kind) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.role`,
        message: `notes support payload role must match ${input.part.kind}`,
      }),
    );
  }
  if (payload.source !== "deckjsx-placeholder") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.source`,
        message: "notes support payload source must identify deckjsx placeholder projection",
      }),
    );
  }
  if (!isRecord(payload.settings)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.settings`,
        message: "invalid notes support settings",
      }),
    );
  } else if (Object.keys(payload.settings).length > 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.settings`,
        message: "notes support settings must stay empty until notes projection exists",
      }),
    );
  }

  return issues;
}

function validateSlideMasterPayload(input: {
  part: PptxPackagePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload) || payload.kind !== "slide-master") {
    return [supportPayloadDiagnostic({ path, message: "invalid slide master payload" })];
  }

  const issues: Diagnostic[] = [];

  if (typeof payload.name !== "string" || payload.name.length === 0) {
    issues.push(
      supportPayloadDiagnostic({ path: `${path}.name`, message: "invalid slide master name" }),
    );
  }

  if (payload.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.editable`,
        message: "slide master payload must remain editable",
      }),
    );
  }

  const themePartId = payload.themePartId;
  const themePart = typeof themePartId === "string" ? input.partsById.get(themePartId) : undefined;
  if (typeof themePartId !== "string" || !themePart) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.themePartId`,
        message: "invalid slide master theme part id",
      }),
    );
  } else if (themePart.kind !== "theme") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.themePartId`,
        message: `slide master theme part id targets ${themePart.kind}`,
      }),
    );
  }

  if (!Array.isArray(payload.slideLayoutPartIds) || payload.slideLayoutPartIds.length === 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.slideLayoutPartIds`,
        message: "invalid slide master layout part ids",
      }),
    );
  } else {
    payload.slideLayoutPartIds.forEach((slideLayoutPartId, index) => {
      const slideLayoutPart =
        typeof slideLayoutPartId === "string" ? input.partsById.get(slideLayoutPartId) : undefined;
      if (
        typeof slideLayoutPartId !== "string" ||
        slideLayoutPartId.length === 0 ||
        !slideLayoutPart
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutPartIds.${index}`,
            message: "invalid slide master layout part id",
          }),
        );
      } else if (slideLayoutPart.kind !== "slide-layout") {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutPartIds.${index}`,
            message: `slide master layout part id targets ${slideLayoutPart.kind}`,
          }),
        );
      }
    });
  }

  if (!Array.isArray(payload.slideLayoutIds) || payload.slideLayoutIds.length === 0) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.slideLayoutIds`,
        message: "invalid slide master layout numeric ids",
      }),
    );
  } else {
    const seenSlideLayoutIdPartIds = new Set<string>();
    const seenSlideLayoutNumericIds = new Set<string>();
    payload.slideLayoutIds.forEach((slideLayoutId, index) => {
      if (!isRecord(slideLayoutId)) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}`,
            message: "invalid slide master layout id entry",
          }),
        );
        return;
      }

      const slideLayoutPartId = slideLayoutId.slideLayoutPartId;
      const expectedSlideLayoutPartId = Array.isArray(payload.slideLayoutPartIds)
        ? payload.slideLayoutPartIds[index]
        : undefined;
      const slideLayoutPart =
        typeof slideLayoutPartId === "string" ? input.partsById.get(slideLayoutPartId) : undefined;
      if (
        typeof slideLayoutPartId !== "string" ||
        slideLayoutPartId.length === 0 ||
        !slideLayoutPart
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}.slideLayoutPartId`,
            message: "invalid slide master layout id part id",
          }),
        );
      } else if (slideLayoutPart.kind !== "slide-layout") {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}.slideLayoutPartId`,
            message: `slide master layout id part targets ${slideLayoutPart.kind}`,
          }),
        );
      } else if (seenSlideLayoutIdPartIds.has(slideLayoutPartId)) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}.slideLayoutPartId`,
            message: `duplicate slide master layout id part ${slideLayoutPartId}`,
          }),
        );
      } else {
        seenSlideLayoutIdPartIds.add(slideLayoutPartId);
      }

      if (
        expectedSlideLayoutPartId !== undefined &&
        typeof slideLayoutPartId === "string" &&
        slideLayoutPartId !== expectedSlideLayoutPartId
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}.slideLayoutPartId`,
            message: `slide master layout id diverges from slideLayoutPartIds.${index}`,
          }),
        );
      }

      const numericId = slideLayoutId.id;
      if (
        !isPptxUnsignedNumericId(numericId, MIN_SLIDE_MASTER_LAYOUT_ID, MAX_OOXML_UNSIGNED_INT_ID)
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}.id`,
            message: "invalid slide master layout numeric id",
          }),
        );
      } else if (seenSlideLayoutNumericIds.has(numericId)) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.slideLayoutIds.${index}.id`,
            message: `duplicate slide master layout numeric id ${numericId}`,
          }),
        );
      } else {
        seenSlideLayoutNumericIds.add(numericId);
      }
    });

    if (
      Array.isArray(payload.slideLayoutPartIds) &&
      payload.slideLayoutIds.length !== payload.slideLayoutPartIds.length
    ) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.slideLayoutIds`,
          message: "slide master layout numeric ids must match slide layout part ids",
        }),
      );
    }
  }

  const colorMap = payload.colorMap;
  if (!isRecord(colorMap)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.colorMap`,
        message: "invalid slide master color map",
      }),
    );
  } else {
    SLIDE_MASTER_COLOR_MAP_KEYS.forEach((key) => {
      const value = colorMap[key];
      if (typeof value !== "string" || value.length === 0) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.colorMap.${key}`,
            message: `invalid slide master color map ${key}`,
          }),
        );
      }
    });
  }

  const textStyles = payload.textStyles;
  if (!isRecord(textStyles)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.textStyles`,
        message: "invalid slide master text styles",
      }),
    );
  } else {
    (["title", "body", "other"] as const).forEach((key) => {
      if (textStyles[key] !== "empty") {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.textStyles.${key}`,
            message: `invalid slide master text style ${key}`,
          }),
        );
      }
    });
  }

  return issues;
}

function validateSlideLayoutSupportPayload(input: {
  part: PptxPackagePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload) || payload.kind !== "slide-layout") {
    return [supportPayloadDiagnostic({ path, message: "invalid slide layout payload" })];
  }

  const issues: Diagnostic[] = [];

  if (typeof payload.name !== "string" || payload.name.length === 0) {
    issues.push(
      supportPayloadDiagnostic({ path: `${path}.name`, message: "invalid slide layout name" }),
    );
  }

  if (payload.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.editable`,
        message: "slide layout payload must remain editable",
      }),
    );
  }

  if (payload.layoutType !== "blank") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.layoutType`,
        message: "invalid slide layout type",
      }),
    );
  }

  if (payload.preserve !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.preserve`,
        message: "slide layout payload must preserve the layout part",
      }),
    );
  }

  const slideMasterPartId = payload.slideMasterPartId;
  const slideMasterPart =
    typeof slideMasterPartId === "string" ? input.partsById.get(slideMasterPartId) : undefined;
  if (typeof slideMasterPartId !== "string" || !slideMasterPart) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.slideMasterPartId`,
        message: "invalid slide layout master part id",
      }),
    );
  } else if (slideMasterPart.kind !== "slide-master") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.slideMasterPartId`,
        message: `slide layout master part id targets ${slideMasterPart.kind}`,
      }),
    );
  }

  if (payload.placeholderStrategy !== "none") {
    issues.push(
      supportPayloadDiagnostic({
        path: `${path}.placeholderStrategy`,
        message: "invalid slide layout placeholder strategy",
      }),
    );
  }

  if (payload.template !== undefined) {
    if (!isRecord(payload.template)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${path}.template`,
          message: "invalid slide layout template metadata",
        }),
      );
    } else {
      if (
        typeof payload.template.sourceKey !== "string" ||
        payload.template.sourceKey.length === 0
      ) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.template.sourceKey`,
            message: "invalid slide layout template source key",
          }),
        );
      }
      if (typeof payload.template.name !== "string" || payload.template.name.length === 0) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${path}.template.name`,
            message: "invalid slide layout template name",
          }),
        );
      }
    }
  }

  return issues;
}

function validateStringArray(input: {
  path: string;
  value: unknown;
  label: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
        title: "pptx unsupported semantic fallback is invalid",
        message:
          "Unsupported semantic fallback metadata must describe preserved and missing values.",
        labels: [{ path: input.path, message: `invalid ${input.label}` }],
      }),
    ];
  }

  if (input.value.length === 0) {
    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
        title: "pptx unsupported semantic fallback list is invalid",
        message:
          "Unsupported semantic fallback preserved/missing lists must name at least one value.",
        labels: [{ path: input.path, message: `empty ${input.label}` }],
      }),
    ];
  }

  return input.value.flatMap((item, index) =>
    typeof item === "string" && item.length > 0
      ? []
      : [
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
            title: "pptx unsupported semantic fallback item is invalid",
            message:
              "Unsupported semantic fallback preserved/missing entries must be non-empty strings.",
            labels: [
              {
                path: `${input.path}.${index}`,
                message: `invalid ${input.label} entry`,
              },
            ],
          }),
        ],
  );
}

function validateUnsupportedSemantic(input: {
  semantic: PptxUnsupportedSemantic;
  path: string;
}): Diagnostics["items"] {
  const issues = [];
  if (typeof input.semantic !== "object" || input.semantic === null) {
    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
        title: "pptx unsupported semantic record is invalid",
        message:
          "Unsupported semantic records must be structured objects before Render can trust fallback metadata.",
        labels: [{ path: input.path, message: "invalid unsupported semantic record" }],
      }),
    ];
  }

  if (!isKnownUnsupportedSemanticFeature(input.semantic.feature)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
        title: "pptx unsupported semantic feature is invalid",
        message: "Unsupported semantic records must use a known projected feature.",
        labels: [{ path: `${input.path}.feature`, message: "invalid unsupported feature" }],
      }),
    );
  }

  (["property", "value", "reason"] as const).forEach((key) => {
    if (typeof input.semantic[key] !== "string" || input.semantic[key].length === 0) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          title: "pptx unsupported semantic field is invalid",
          message:
            "Unsupported semantic records must preserve non-empty property, value, and reason fields.",
          labels: [{ path: `${input.path}.${key}`, message: `invalid ${key}` }],
        }),
      );
    }
  });

  if (input.semantic.fallback !== undefined) {
    if (typeof input.semantic.fallback !== "object" || input.semantic.fallback === null) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          title: "pptx unsupported semantic fallback is invalid",
          message: "Unsupported semantic fallback metadata must be structured.",
          labels: [{ path: `${input.path}.fallback`, message: "invalid fallback metadata" }],
        }),
      );
    } else {
      if (!isKnownUnsupportedFallbackStrategy(input.semantic.fallback.strategy)) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
            title: "pptx unsupported semantic fallback strategy is invalid",
            message: "Unsupported semantic fallback metadata must use a known strategy.",
            labels: [
              {
                path: `${input.path}.fallback.strategy`,
                message: "invalid fallback strategy",
              },
            ],
          }),
        );
      }

      issues.push(
        ...validateStringArray({
          path: `${input.path}.fallback.preserves`,
          value: input.semantic.fallback.preserves,
          label: "fallback preserves",
        }),
        ...validateStringArray({
          path: `${input.path}.fallback.missing`,
          value: input.semantic.fallback.missing,
          label: "fallback missing",
        }),
      );
    }
  }

  return issues;
}

function validateDrawingUnsupportedSemantics(input: {
  part: PptxPackagePart;
  element: PptxElement;
  path: string;
}): Diagnostics["items"] {
  const issues = [];

  if (input.element.unsupportedSemantics !== undefined) {
    if (!Array.isArray(input.element.unsupportedSemantics)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          title: "pptx drawing unsupported semantics are invalid",
          message: "Pptx Drawing Nodes must carry unsupported semantics as an array.",
          labels: [
            {
              path: `${input.path}.unsupportedSemantics`,
              message: "invalid unsupported semantics",
            },
          ],
        }),
      );
    } else {
      input.element.unsupportedSemantics.forEach((semantic, index) => {
        issues.push(
          ...validateUnsupportedSemantic({
            semantic,
            path: `${input.path}.unsupportedSemantics.${index}`,
          }),
        );
      });
    }
  }

  if (input.element.kind === "group" && Array.isArray(input.element.children)) {
    input.element.children.forEach((child, index) => {
      issues.push(
        ...validateDrawingUnsupportedSemantics({
          part: input.part,
          element: child,
          path: `${input.path}.children.${index}`,
        }),
      );
    });
  }

  visitTableChildElements(input.element, input.path, (child, childPath) => {
    issues.push(
      ...validateDrawingUnsupportedSemantics({
        part: input.part,
        element: child,
        path: childPath,
      }),
    );
  });

  return issues;
}

function validateDrawingLayoutAnchor(input: {
  element: PptxElement;
  path: string;
}): Diagnostics["items"] {
  const anchor = input.element.layoutAnchor;
  if (anchor === undefined) {
    return [];
  }

  const issues = [];
  if (typeof anchor.template !== "string" || anchor.template.length === 0) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.layoutAnchor.template`,
        message: "invalid layout anchor template",
      }),
    );
  }
  if (typeof anchor.area !== "string" || anchor.area.length === 0) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.layoutAnchor.area`,
        message: "invalid layout anchor area",
      }),
    );
  }
  if (!isTemplateAreaKind(anchor.kind)) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.layoutAnchor.kind`,
        message: "invalid layout anchor kind",
      }),
    );
  }
  const frameIssues = validateFrame({
    path: `${input.path}.layoutAnchor.frame`,
    frame: anchor.frame,
  });
  issues.push(
    ...frameIssues.map((item) => ({
      ...item,
      code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
      title: "pptx drawing layout anchor frame is invalid",
    })),
  );
  return issues;
}

function validateDrawingPaintOrder(input: {
  element: PptxValidationDrawingElement;
  path: string;
  requireDrawingNodeMetadata: boolean;
  expectedEmissionTarget?: string;
  expectedPaintOrderIndex?: number;
}): Diagnostics["items"] {
  const issues = [];
  const element = input.element;

  if (input.requireDrawingNodeMetadata && !isKnownDrawingEmissionTarget(element.emissionTarget)) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.emissionTarget`,
        message: "invalid emission target",
      }),
    );
  } else if (
    input.expectedEmissionTarget !== undefined &&
    element.emissionTarget !== input.expectedEmissionTarget
  ) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.emissionTarget`,
        message: `emission target does not match ${input.expectedEmissionTarget}`,
      }),
    );
  }

  if (
    input.requireDrawingNodeMetadata &&
    (!Number.isInteger(element.paintOrderIndex) || (element.paintOrderIndex as number) < 0)
  ) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.paintOrderIndex`,
        message: "invalid paint order index",
      }),
    );
  } else if (
    input.expectedPaintOrderIndex !== undefined &&
    element.paintOrderIndex !== input.expectedPaintOrderIndex
  ) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.paintOrderIndex`,
        message: `paint order index does not match drawing order ${input.expectedPaintOrderIndex}`,
      }),
    );
  }

  if (!isRecord(element.paintOrder)) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.paintOrder`,
        message: "invalid paint order",
      }),
    );
  } else {
    if (
      !Number.isInteger(element.paintOrder.siblingOrder) ||
      (element.paintOrder.siblingOrder as number) < 0
    ) {
      issues.push(
        drawingMetadataDiagnostic({
          path: `${input.path}.paintOrder.siblingOrder`,
          message: "invalid sibling order",
        }),
      );
    }
    if (
      element.paintOrder.zIndex !== undefined &&
      (typeof element.paintOrder.zIndex !== "number" || !Number.isFinite(element.paintOrder.zIndex))
    ) {
      issues.push(
        drawingMetadataDiagnostic({
          path: `${input.path}.paintOrder.zIndex`,
          message: "invalid z-index",
        }),
      );
    }
    if (
      element.paintOrder.generatedLayerRole !== undefined &&
      !isKnownDrawingGeneratedLayerRole(element.paintOrder.generatedLayerRole)
    ) {
      issues.push(
        drawingMetadataDiagnostic({
          path: `${input.path}.paintOrder.generatedLayerRole`,
          message: "invalid generated layer role",
        }),
      );
    }
  }

  return issues;
}

function validateDrawingClip(input: { element: PptxElement; path: string }): Diagnostics["items"] {
  const clip = input.element.clip;
  if (clip === undefined) {
    return [];
  }

  if (!isRecord(clip)) {
    return [
      drawingMetadataDiagnostic({
        path: `${input.path}.clip`,
        message: "invalid clipping metadata",
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (!isKnownDrawingClipStrategy(clip.strategy)) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.clip.strategy`,
        message: "invalid clipping strategy",
      }),
    );
  }

  (["originalFrame", "clipFrame", "visibleFrame"] as const).forEach((key) => {
    issues.push(
      ...validateDrawingFrame({
        frame: clip[key],
        path: `${input.path}.clip.${key}`,
      }),
    );
  });

  return issues;
}

function validateDrawingMeasurement(input: {
  element: PptxElement;
  path: string;
}): Diagnostics["items"] {
  const measurement = input.element.measurement;
  if (measurement === undefined) {
    return [];
  }

  if (!isRecord(measurement)) {
    return [
      drawingMetadataDiagnostic({
        path: `${input.path}.measurement`,
        message: "invalid measurement metadata",
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (measurement.frame !== undefined) {
    issues.push(
      ...validateDrawingFrame({
        frame: measurement.frame,
        path: `${input.path}.measurement.frame`,
      }),
    );
  }
  if (
    measurement.overflow !== undefined &&
    !isKnownDrawingMeasurementOverflow(measurement.overflow)
  ) {
    issues.push(
      drawingMetadataDiagnostic({
        path: `${input.path}.measurement.overflow`,
        message: "invalid measurement overflow",
      }),
    );
  }

  return issues;
}

function validateDrawingSerializedIdentities(input: {
  element: PptxElement;
  path: string;
}): Diagnostics["items"] {
  if (!isRecord(input.element.serialized)) {
    return [
      drawingMetadataDiagnostic({
        path: `${input.path}.serialized`,
        message: "invalid serialized identity metadata",
      }),
    ];
  }

  const shapeObjectId = input.element.serialized.shapeObjectId;
  return isPositiveSerializedShapeObjectId(shapeObjectId)
    ? []
    : [
        drawingMetadataDiagnostic({
          path: `${input.path}.serialized.shapeObjectId`,
          message: "serialized shape object id must be a writer-safe positive numeric string",
        }),
      ];
}

function isPositiveSerializedShapeObjectId(value: unknown): value is string {
  return serializedShapeObjectIdNumber(value) !== undefined;
}

function serializedShapeObjectIdNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const numeric = Number.parseInt(value, 10);
  return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= MAX_WRITER_SHAPE_OBJECT_ID
    ? numeric
    : undefined;
}

function validateNonEmptyStringArray(input: {
  value: unknown;
  path: string;
  diagnosticFor: (input: { path: string; message: string }) => Diagnostic;
  label: string;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!Array.isArray(input.value)) {
    return [
      input.diagnosticFor({
        path: input.path,
        message: `invalid ${input.label}`,
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  const seen = new Set<string>();
  input.value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      issues.push(
        input.diagnosticFor({
          path: `${input.path}.${index}`,
          message: `invalid ${input.label} entry`,
        }),
      );
      return;
    }

    if (seen.has(item)) {
      issues.push(
        input.diagnosticFor({
          path: `${input.path}.${index}`,
          message: `duplicate ${input.label} entry ${item}`,
        }),
      );
      return;
    }
    seen.add(item);
  });

  return issues;
}

function validateSourceOrigin(input: {
  value: unknown;
  path: string;
  diagnosticFor: (input: { path: string; message: string }) => Diagnostic;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [input.diagnosticFor({ path: input.path, message: "invalid source origin" })];
  }

  if (input.value.kind === "root") {
    return [];
  }

  if (input.value.kind !== "mounted") {
    return [
      input.diagnosticFor({
        path: `${input.path}.kind`,
        message: "invalid source origin kind",
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (typeof input.value.sourceKey !== "string" || input.value.sourceKey.length === 0) {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.sourceKey`,
        message: "invalid source key",
      }),
    );
  }
  if (typeof input.value.sourceIdentity !== "string" || input.value.sourceIdentity.length === 0) {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.sourceIdentity`,
        message: "invalid source identity",
      }),
    );
  }

  return issues;
}

function validateDrawingOrigin(input: {
  element: PptxElement;
  path: string;
}): Diagnostics["items"] {
  const origin = input.element.origin as unknown;
  const path = `${input.path}.origin`;
  if (!isRecord(origin)) {
    return [drawingOriginDiagnostic({ path, message: "invalid drawing origin" })];
  }

  return [
    ...validateNonEmptyStringArray({
      value: origin.graphNodeIds,
      path: `${path}.graphNodeIds`,
      diagnosticFor: drawingOriginDiagnostic,
      label: "graph node ids",
    }),
    ...validateNonEmptyStringArray({
      value: origin.styleEntityIds,
      path: `${path}.styleEntityIds`,
      diagnosticFor: drawingOriginDiagnostic,
      label: "style entity ids",
    }),
    ...validateNonEmptyStringArray({
      value: origin.assetEntityIds,
      path: `${path}.assetEntityIds`,
      diagnosticFor: drawingOriginDiagnostic,
      label: "asset entity ids",
    }),
    ...validateSourceOrigin({
      value: origin.source,
      path: `${path}.source`,
      diagnosticFor: drawingOriginDiagnostic,
    }),
  ];
}

function validateDrawingHyperlink(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid hyperlink" })];
  }

  const issues: Diagnostic[] = [];
  if (!isSupportedExternalRelationshipTarget(input.value.url)) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.url`,
        message: "invalid hyperlink url",
      }),
    );
  }
  if (
    input.value.tooltip !== undefined &&
    (typeof input.value.tooltip !== "string" || input.value.tooltip.length === 0)
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.tooltip`,
        message: "invalid hyperlink tooltip",
      }),
    );
  }

  return issues;
}

function validateDrawingImageSource(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid image source" })];
  }

  if (input.value.kind === "path") {
    return typeof input.value.path === "string" && input.value.path.length > 0
      ? []
      : [drawingPayloadDiagnostic({ path: `${input.path}.path`, message: "invalid image path" })];
  }
  if (input.value.kind === "data") {
    return typeof input.value.data === "string" && input.value.data.length > 0
      ? []
      : [drawingPayloadDiagnostic({ path: `${input.path}.data`, message: "invalid image data" })];
  }
  if (input.value.kind === "url") {
    return typeof input.value.url === "string" && input.value.url.length > 0
      ? []
      : [drawingPayloadDiagnostic({ path: `${input.path}.url`, message: "invalid image url" })];
  }

  return [
    drawingPayloadDiagnostic({ path: `${input.path}.kind`, message: "invalid image source kind" }),
  ];
}

function validateFiniteNumberField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return typeof input.value === "number" && Number.isFinite(input.value)
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalFiniteNumberField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return input.value === undefined
    ? []
    : validateFiniteNumberField({ value: input.value, path: input.path, message: input.message });
}

function validateOptionalNonNegativeFiniteNumberField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }
  if (typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0) {
    return [];
  }
  return [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateNonNegativeFiniteNumberField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  if (typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0) {
    return [];
  }
  return [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalDrawingTransparencyField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }
  return typeof input.value === "number" &&
    Number.isFinite(input.value) &&
    input.value >= 0 &&
    input.value <= 100
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateRequiredDrawingOpacityField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return typeof input.value === "number" &&
    Number.isFinite(input.value) &&
    input.value >= 0 &&
    input.value <= 1
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateDrawingObjectPosition(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "missing object position" })];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid object position" })];
  }

  return [
    ...validateFiniteNumberField({
      value: input.value.x,
      path: `${input.path}.x`,
      message: "invalid object position x",
    }),
    ...validateFiniteNumberField({
      value: input.value.y,
      path: `${input.path}.y`,
      message: "invalid object position y",
    }),
  ];
}

function validateDrawingImageCrop(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid image crop" })];
  }

  const crop = input.value;
  const issues: Diagnostic[] = [];
  (["top", "right", "bottom", "left"] as const).forEach((key) => {
    const value = crop[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.${key}`,
          message: `invalid image crop ${key}`,
        }),
      );
    }
  });

  const left = crop.left;
  const right = crop.right;
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right) &&
    left + right >= 1
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: input.path,
        message: "image crop left and right must leave positive source width",
      }),
    );
  }

  const top = crop.top;
  const bottom = crop.bottom;
  if (
    typeof top === "number" &&
    Number.isFinite(top) &&
    typeof bottom === "number" &&
    Number.isFinite(bottom) &&
    top + bottom >= 1
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: input.path,
        message: "image crop top and bottom must leave positive source height",
      }),
    );
  }

  return issues;
}

function validateDrawingTextRuns(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!Array.isArray(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid text runs" })];
  }

  const issues: Diagnostic[] = [];
  input.value.forEach((run, index) => {
    const runPath = `${input.path}.${index}`;
    if (!isRecord(run)) {
      issues.push(drawingPayloadDiagnostic({ path: runPath, message: "invalid text run" }));
      return;
    }
    if (typeof run.text !== "string") {
      issues.push(
        drawingPayloadDiagnostic({ path: `${runPath}.text`, message: "invalid text run text" }),
      );
    }
    if (run.style !== undefined && !isRecord(run.style)) {
      issues.push(
        drawingPayloadDiagnostic({ path: `${runPath}.style`, message: "invalid text run style" }),
      );
    } else if (run.style !== undefined) {
      issues.push(...validateDrawingTextStyle({ value: run.style, path: `${runPath}.style` }));
    }
  });

  return issues;
}

function validateOptionalStringField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return input.value === undefined || (typeof input.value === "string" && input.value.length > 0)
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalDrawingColorField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return input.value === undefined ||
    (typeof input.value === "string" && PROJECTED_RGB_COLOR_PATTERN.test(input.value))
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateRequiredDrawingColorField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return typeof input.value === "string" && PROJECTED_RGB_COLOR_PATTERN.test(input.value)
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateRequiredSlideColorField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return typeof input.value === "string" && PROJECTED_RGB_COLOR_PATTERN.test(input.value)
    ? []
    : [slidePayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateRequiredStringField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return typeof input.value === "string" && input.value.length > 0
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalBooleanField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return input.value === undefined || typeof input.value === "boolean"
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalEnumField(input: {
  value: unknown;
  path: string;
  message: string;
  values: readonly string[];
}): Diagnostics["items"] {
  return input.value === undefined ||
    (typeof input.value === "string" && input.values.includes(input.value))
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateRequiredEnumField(input: {
  value: unknown;
  path: string;
  message: string;
  values: readonly string[];
}): Diagnostics["items"] {
  return typeof input.value === "string" && input.values.includes(input.value)
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalFiniteNonNegativeNumberField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return input.value === undefined ||
    (typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0)
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalFinitePositiveNumberField(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  return input.value === undefined ||
    (typeof input.value === "number" && Number.isFinite(input.value) && input.value > 0)
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
}

function validateOptionalTextFontWeight(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (
    input.value === undefined ||
    input.value === "normal" ||
    input.value === "bold" ||
    (typeof input.value === "number" &&
      Number.isFinite(input.value) &&
      input.value >= 1 &&
      input.value <= 1000)
  ) {
    return [];
  }

  return [drawingPayloadDiagnostic({ path: input.path, message: "invalid text font weight" })];
}

function validateTextBulletCharacterCode(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  const valid =
    typeof input.value === "string" &&
    TEXT_BULLET_CHARACTER_CODE_PATTERN.test(input.value) &&
    isXmlCharacterCodePoint(Number.parseInt(input.value, 16));

  return valid
    ? []
    : [drawingPayloadDiagnostic({ path: input.path, message: "invalid text bullet character" })];
}

function isXmlCharacterCodePoint(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0x20 &&
    value <= 0x10ffff &&
    (value < 0xd800 || value > 0xdfff)
  );
}

function validateOptionalTextPadding(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!Array.isArray(input.value) || input.value.length !== 4) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid text padding" })];
  }

  return input.value.flatMap((item, index) =>
    typeof item === "number" && Number.isFinite(item) && item >= 0
      ? []
      : [
          drawingPayloadDiagnostic({
            path: `${input.path}.${index}`,
            message: "invalid text padding value",
          }),
        ],
  );
}

function validateOptionalTextTabStops(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!Array.isArray(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid text tab stops" })];
  }

  return input.value.flatMap((tabStop, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(tabStop)) {
      return [drawingPayloadDiagnostic({ path, message: "invalid text tab stop" })];
    }

    return [
      ...validateFiniteNumberField({
        value: tabStop.positionIn,
        path: `${path}.positionIn`,
        message: "invalid text tab stop position",
      }),
      ...validateOptionalEnumField({
        value: tabStop.alignment,
        path: `${path}.alignment`,
        message: "invalid text tab stop alignment",
        values: TEXT_TAB_STOP_ALIGNMENTS,
      }),
    ];
  });
}

function validateOptionalTextList(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid text list" })];
  }

  if (input.value.type === "none") {
    return [];
  }

  const issues: Diagnostic[] = [];
  if (input.value.type === "bullet") {
    issues.push(
      ...validateTextBulletCharacterCode({
        value: input.value.characterCode,
        path: `${input.path}.characterCode`,
      }),
      ...validateOptionalFiniteNumberField({
        value: input.value.indentPt,
        path: `${input.path}.indentPt`,
        message: "invalid text bullet indent",
      }),
    );
    return issues;
  }

  if (input.value.type === "number") {
    issues.push(
      ...validateOptionalEnumField({
        value: input.value.style,
        path: `${input.path}.style`,
        message: "invalid text numbering style",
        values: TEXT_NUMBER_LIST_STYLES,
      }),
      ...validateOptionalFiniteNonNegativeNumberField({
        value: input.value.startAt,
        path: `${input.path}.startAt`,
        message: "invalid text numbering start",
      }),
      ...validateOptionalFiniteNumberField({
        value: input.value.indentPt,
        path: `${input.path}.indentPt`,
        message: "invalid text numbering indent",
      }),
    );
    return issues;
  }

  return [
    drawingPayloadDiagnostic({ path: `${input.path}.type`, message: "invalid text list type" }),
  ];
}

function validateDrawingPayloadFrame(input: {
  value: unknown;
  path: string;
  message: string;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: input.message })];
  }

  const frame = input.value;
  return (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).flatMap((key) => {
    const value = frame[key];
    const valid =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (key === "xEmu" || key === "yEmu" ? true : value > 0);

    return valid
      ? []
      : [
          drawingPayloadDiagnostic({
            path: `${input.path}.${key}`,
            message: `invalid drawing frame ${key}`,
          }),
        ];
  });
}

function validateDrawingGeneratedStrokeFrame(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [
      drawingPayloadDiagnostic({ path: input.path, message: "invalid generated stroke frame" }),
    ];
  }

  const frame = input.value;
  const issues: Diagnostic[] = [];
  (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).forEach((key) => {
    const value = frame[key];
    const valid =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (key === "xEmu" || key === "yEmu" ? true : value >= 0);
    if (!valid) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.${key}`,
          message: `invalid generated stroke frame ${key}`,
        }),
      );
    }
  });

  if (
    typeof frame.widthEmu === "number" &&
    typeof frame.heightEmu === "number" &&
    Number.isFinite(frame.widthEmu) &&
    Number.isFinite(frame.heightEmu) &&
    frame.widthEmu === 0 &&
    frame.heightEmu === 0
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: input.path,
        message: "generated stroke frame must have a non-zero axis",
      }),
    );
  }

  return issues;
}

function validateDrawingGradientStops(input: {
  path: string;
  value: unknown;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value) || input.value.length === 0) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid gradient stops" })];
  }

  return input.value.flatMap((stop, index) => {
    const stopPath = `${input.path}.${index}`;
    if (!isRecord(stop)) {
      return [drawingPayloadDiagnostic({ path: stopPath, message: "invalid gradient stop" })];
    }

    const issues: Diagnostic[] = [];
    issues.push(
      ...validateRequiredDrawingColorField({
        value: stop.color,
        path: `${stopPath}.color`,
        message: "invalid gradient color",
      }),
    );
    if (
      typeof stop.position !== "number" ||
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1
    ) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${stopPath}.position`,
          message: "invalid gradient position",
        }),
      );
    }
    issues.push(
      ...validateOptionalDrawingTransparencyField({
        path: `${stopPath}.transparency`,
        value: stop.transparency,
        message: "invalid gradient transparency",
      }),
    );
    return issues;
  });
}

function validateDrawingFill(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid drawing fill" })];
  }

  const issues: Diagnostic[] = [];
  if (input.value.frame !== undefined) {
    issues.push(
      ...validateDrawingPayloadFrame({
        path: `${input.path}.frame`,
        value: input.value.frame,
        message: "invalid drawing fill frame",
      }),
    );
  }

  if (input.value.kind === "solid") {
    issues.push(
      ...validateRequiredDrawingColorField({
        value: input.value.color,
        path: `${input.path}.color`,
        message: "invalid fill color",
      }),
    );
    issues.push(
      ...validateOptionalDrawingTransparencyField({
        value: input.value.transparency,
        path: `${input.path}.transparency`,
        message: "invalid fill transparency",
      }),
    );
    return issues;
  }

  if (input.value.kind === "linear-gradient") {
    if (typeof input.value.angle !== "number" || !Number.isFinite(input.value.angle)) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.angle`,
          message: "invalid linear gradient angle",
        }),
      );
    }
    issues.push(
      ...validateDrawingGradientStops({ path: `${input.path}.stops`, value: input.value.stops }),
    );
    return issues;
  }

  if (input.value.kind === "radial-gradient") {
    if (input.value.shape !== "circle" && input.value.shape !== "ellipse") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.shape`,
          message: "invalid radial gradient shape",
        }),
      );
    }
    const center = input.value.center;
    if (!isRecord(center)) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.center`,
          message: "invalid radial gradient center",
        }),
      );
    } else {
      (["x", "y"] as const).forEach((key) => {
        if (typeof center[key] !== "number" || !Number.isFinite(center[key])) {
          issues.push(
            drawingPayloadDiagnostic({
              path: `${input.path}.center.${key}`,
              message: `invalid radial gradient center ${key}`,
            }),
          );
        }
      });
    }
    const radius = input.value.radius;
    if (!isRecord(radius)) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.radius`,
          message: "invalid radial gradient radius",
        }),
      );
    } else {
      (["x", "y"] as const).forEach((key) => {
        if (typeof radius[key] !== "number" || !Number.isFinite(radius[key]) || radius[key] <= 0) {
          issues.push(
            drawingPayloadDiagnostic({
              path: `${input.path}.radius.${key}`,
              message: `invalid radial gradient radius ${key}`,
            }),
          );
        }
      });
    }
    issues.push(
      ...validateDrawingGradientStops({ path: `${input.path}.stops`, value: input.value.stops }),
    );
    return issues;
  }

  return [
    drawingPayloadDiagnostic({ path: `${input.path}.kind`, message: "invalid drawing fill kind" }),
  ];
}

function validateDrawingBackgroundImageLayer(input: {
  path: string;
  value: Record<string, unknown>;
}): Diagnostics["items"] {
  const issues: Diagnostic[] = [
    ...validateDrawingPayloadFrame({
      path: `${input.path}.frame`,
      value: input.value.frame,
      message: "invalid background image frame",
    }),
    ...validateDrawingPayloadFrame({
      path: `${input.path}.sourceFrame`,
      value: input.value.sourceFrame,
      message: "invalid background image source frame",
    }),
    ...validateDrawingImageSource({ value: input.value.source, path: `${input.path}.source` }),
    ...validateOptionalDrawingTransparencyField({
      path: `${input.path}.transparency`,
      value: input.value.transparency,
      message: "invalid background image transparency",
    }),
    ...validateRequiredEnumField({
      path: `${input.path}.fit`,
      value: input.value.fit,
      message: "invalid background image fit",
      values: DRAWING_BACKGROUND_IMAGE_FITS,
    }),
    ...validateRequiredEnumField({
      path: `${input.path}.repeat`,
      value: input.value.repeat,
      message: "invalid background image repeat",
      values: DRAWING_BACKGROUND_IMAGE_REPEATS,
    }),
    ...validateDrawingObjectPosition({
      value: input.value.objectPosition,
      path: `${input.path}.objectPosition`,
    }),
    ...validateDrawingBackgroundLayerSerializedIdentities({
      path: input.path,
      value: input.value,
    }),
  ];

  if (input.value.size !== undefined) {
    if (!isRecord(input.value.size)) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.size`,
          message: "invalid background image size",
        }),
      );
    } else {
      const size = input.value.size;
      (["widthEmu", "heightEmu"] as const).forEach((key) => {
        const value = size[key];
        if (
          value !== undefined &&
          (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        ) {
          issues.push(
            drawingPayloadDiagnostic({
              path: `${input.path}.size.${key}`,
              message: `invalid background image size ${key}`,
            }),
          );
        }
      });
    }
  }

  return issues;
}

function validateDrawingBackgroundLayer(input: {
  path: string;
  value: unknown;
  ownerPaintOrder?: unknown;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid background layer" })];
  }

  const paintOrderIssues = validateDrawingBackgroundLayerPaintOrder({
    value: input.value.paintOrder,
    path: `${input.path}.paintOrder`,
    ownerPaintOrder: input.ownerPaintOrder,
  });

  if (input.value.kind === "background-image") {
    return [
      ...paintOrderIssues,
      ...validateDrawingBackgroundImageLayer({ path: input.path, value: input.value }),
    ];
  }

  return [
    ...paintOrderIssues,
    ...validateDrawingPayloadFrame({
      path: `${input.path}.frame`,
      value: input.value.frame,
      message: "invalid background layer frame",
    }),
    ...validateDrawingFill({ path: input.path, value: input.value }),
    ...validateDrawingBackgroundLayerSerializedIdentities({
      path: input.path,
      value: input.value,
    }),
  ];
}

function validateDrawingBackgroundLayerPaintOrder(input: {
  value: unknown;
  path: string;
  ownerPaintOrder?: unknown;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [
      drawingPayloadDiagnostic({ path: input.path, message: "invalid background paint order" }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (!Number.isInteger(input.value.siblingOrder) || (input.value.siblingOrder as number) < 0) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.siblingOrder`,
        message: "invalid background sibling order",
      }),
    );
  }
  if (
    input.value.zIndex !== undefined &&
    (typeof input.value.zIndex !== "number" || !Number.isFinite(input.value.zIndex))
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.zIndex`,
        message: "invalid background z-index",
      }),
    );
  }
  if (isRecord(input.ownerPaintOrder)) {
    if (input.value.siblingOrder !== input.ownerPaintOrder.siblingOrder) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.siblingOrder`,
          message: "background sibling order does not match owner paint order",
        }),
      );
    }
    if (input.value.zIndex !== input.ownerPaintOrder.zIndex) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.zIndex`,
          message: "background z-index does not match owner paint order",
        }),
      );
    }
  }
  if (input.value.generatedLayerRole !== "background") {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.generatedLayerRole`,
        message: "background layer role must be background",
      }),
    );
  }

  return issues;
}

function validateDrawingBackgroundLayerSerializedIdentities(input: {
  path: string;
  value: Record<string, unknown>;
}): Diagnostics["items"] {
  if (!isRecord(input.value.serialized)) {
    return [
      drawingMetadataDiagnostic({
        path: `${input.path}.serialized`,
        message: "invalid background layer serialized identity metadata",
      }),
    ];
  }

  return isPositiveSerializedShapeObjectId(input.value.serialized.shapeObjectId)
    ? []
    : [
        drawingMetadataDiagnostic({
          path: `${input.path}.serialized.shapeObjectId`,
          message: "background layer shape object id must be a writer-safe positive numeric string",
        }),
      ];
}

function validateOptionalDrawingBackgroundLayers(input: {
  value: unknown;
  path: string;
  ownerPaintOrder?: unknown;
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!Array.isArray(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid background layers" })];
  }

  return input.value.flatMap((layer, index) =>
    validateDrawingBackgroundLayer({
      path: `${input.path}.${index}`,
      value: layer,
      ownerPaintOrder: input.ownerPaintOrder,
    }),
  );
}

function validateDrawingStroke(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid drawing stroke" })];
  }

  return [
    ...validateRequiredDrawingColorField({
      value: input.value.color,
      path: `${input.path}.color`,
      message: "invalid stroke color",
    }),
    ...validateNonNegativeFiniteNumberField({
      value: input.value.widthPt,
      path: `${input.path}.widthPt`,
      message: "invalid stroke width",
    }),
    ...validateOptionalEnumField({
      value: input.value.style,
      path: `${input.path}.style`,
      message: "invalid stroke style",
      values: STROKE_STYLES,
    }),
    ...validateOptionalEnumField({
      value: input.value.dashType,
      path: `${input.path}.dashType`,
      message: "invalid stroke dash type",
      values: STROKE_DASH_TYPES,
    }),
    ...(input.value.style === "dash" && input.value.dashType === undefined
      ? [
          drawingPayloadDiagnostic({
            path: `${input.path}.dashType`,
            message: "missing stroke dash type",
          }),
        ]
      : []),
    ...validateOptionalEnumField({
      value: input.value.lineCap,
      path: `${input.path}.lineCap`,
      message: "invalid stroke line cap",
      values: STROKE_LINE_CAPS,
    }),
    ...validateOptionalEnumField({
      value: input.value.lineJoin,
      path: `${input.path}.lineJoin`,
      message: "invalid stroke line join",
      values: STROKE_LINE_JOINS,
    }),
    ...validateOptionalDrawingTransparencyField({
      value: input.value.transparency,
      path: `${input.path}.transparency`,
      message: "invalid stroke transparency",
    }),
  ];
}

function validateDrawingEdgeStrokes(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid edge strokes" })];
  }

  const edgeStrokes = input.value;
  return (["top", "right", "bottom", "left"] as const).flatMap((key) =>
    validateDrawingStroke({ value: edgeStrokes[key], path: `${input.path}.${key}` }),
  );
}

function validateDrawingShadow(input: { value: unknown; path: string }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }

  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid drawing shadow" })];
  }

  return [
    ...validateRequiredEnumField({
      value: input.value.type,
      path: `${input.path}.type`,
      message: "invalid shadow type",
      values: SHADOW_TYPES,
    }),
    ...validateRequiredDrawingColorField({
      value: input.value.color,
      path: `${input.path}.color`,
      message: "invalid shadow color",
    }),
    ...validateRequiredDrawingOpacityField({
      value: input.value.opacity,
      path: `${input.path}.opacity`,
      message: "invalid shadow opacity",
    }),
    ...validateFiniteNumberField({
      value: input.value.blurPt,
      path: `${input.path}.blurPt`,
      message: "invalid shadow blur",
    }),
    ...validateFiniteNumberField({
      value: input.value.offsetPt,
      path: `${input.path}.offsetPt`,
      message: "invalid shadow offset",
    }),
    ...validateFiniteNumberField({
      value: input.value.angle,
      path: `${input.path}.angle`,
      message: "invalid shadow angle",
    }),
  ];
}

function validateDrawingGeneratedStrokePaintOrder(input: {
  value: unknown;
  path: string;
  expectedRole: unknown;
  ownerPaintOrder: unknown;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [
      drawingPayloadDiagnostic({ path: input.path, message: "invalid generated paint order" }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (!Number.isInteger(input.value.siblingOrder) || (input.value.siblingOrder as number) < 0) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.siblingOrder`,
        message: "invalid generated sibling order",
      }),
    );
  }
  if (
    input.value.zIndex !== undefined &&
    (typeof input.value.zIndex !== "number" || !Number.isFinite(input.value.zIndex))
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.zIndex`,
        message: "invalid generated z-index",
      }),
    );
  }
  if (isRecord(input.ownerPaintOrder)) {
    if (input.value.siblingOrder !== input.ownerPaintOrder.siblingOrder) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.siblingOrder`,
          message: "generated sibling order does not match owner paint order",
        }),
      );
    }
    if (input.value.zIndex !== input.ownerPaintOrder.zIndex) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.zIndex`,
          message: "generated z-index does not match owner paint order",
        }),
      );
    }
  }
  if (input.value.generatedLayerRole !== input.expectedRole) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.generatedLayerRole`,
        message: "generated layer role does not match generated stroke role",
      }),
    );
  }
  return issues;
}

function validateDrawingGeneratedStrokeLayer(input: {
  value: unknown;
  path: string;
  ownerPaintOrder: unknown;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [
      drawingPayloadDiagnostic({ path: input.path, message: "invalid generated stroke layer" }),
    ];
  }

  const issues: Diagnostic[] = [
    ...validateRequiredEnumField({
      value: input.value.kind,
      path: `${input.path}.kind`,
      message: "invalid generated stroke kind",
      values: ["stroke"],
    }),
    ...validateRequiredEnumField({
      value: input.value.role,
      path: `${input.path}.role`,
      message: "invalid generated stroke role",
      values: DRAWING_GENERATED_STROKE_ROLES,
    }),
    ...validateOptionalEnumField({
      value: input.value.edge,
      path: `${input.path}.edge`,
      message: "invalid generated stroke edge",
      values: DRAWING_GENERATED_STROKE_EDGES,
    }),
    ...validateRequiredStringField({
      value: input.value.id,
      path: `${input.path}.id`,
      message: "invalid generated stroke id",
    }),
    ...validateDrawingGeneratedStrokeFrame({
      value: input.value.frame,
      path: `${input.path}.frame`,
    }),
    ...validateDrawingStroke({
      value: input.value.stroke,
      path: `${input.path}.stroke`,
    }),
    ...validateRequiredEnumField({
      value: input.value.shape,
      path: `${input.path}.shape`,
      message: "invalid generated stroke shape",
      values: DRAWING_GENERATED_STROKE_SHAPES,
    }),
    ...validateDrawingGeneratedStrokePaintOrder({
      value: input.value.paintOrder,
      path: `${input.path}.paintOrder`,
      expectedRole: input.value.role,
      ownerPaintOrder: input.ownerPaintOrder,
    }),
  ];

  if (!isRecord(input.value.serialized)) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.serialized`,
        message: "invalid generated stroke serialized identity",
      }),
    );
  } else {
    if (!isPositiveSerializedShapeObjectId(input.value.serialized.shapeObjectId)) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.serialized.shapeObjectId`,
          message: "generated stroke shape object id must be a writer-safe positive numeric string",
        }),
      );
    }
  }

  if (input.value.role === "border" && input.value.edge === undefined) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.edge`,
        message: "generated border stroke must identify its edge",
      }),
    );
  }
  if (input.value.role === "outline" && input.value.edge !== undefined) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.edge`,
        message: "generated outline stroke must not identify an edge",
      }),
    );
  }

  return issues;
}

function validateDrawingGeneratedStrokeLayers(input: {
  value: unknown;
  path: string;
  ownerId: unknown;
  ownerFrame: unknown;
  ownerPaintOrder: unknown;
  ownerSerialized: unknown;
  edgeStrokes: unknown;
  outline: unknown;
}): Diagnostics["items"] {
  const requiredLayers = requiredGeneratedStrokeLayers({
    edgeStrokes: input.edgeStrokes,
    outline: input.outline,
  });

  if (input.value === undefined) {
    return requiredLayers.map((layer) => missingGeneratedStrokeLayerDiagnostic(input.path, layer));
  }

  if (!Array.isArray(input.value)) {
    return [
      drawingPayloadDiagnostic({ path: input.path, message: "invalid generated stroke layers" }),
    ];
  }

  const issues = input.value.flatMap((layer, index) => [
    ...validateDrawingGeneratedStrokeLayer({
      value: layer,
      path: `${input.path}.${index}`,
      ownerPaintOrder: input.ownerPaintOrder,
    }),
    ...validateGeneratedStrokeLayerOwnerConsistency({
      layer,
      path: `${input.path}.${index}`,
      index,
      ownerId: input.ownerId,
      ownerFrame: input.ownerFrame,
      ownerSerialized: input.ownerSerialized,
      edgeStrokes: input.edgeStrokes,
      outline: input.outline,
    }),
  ]);

  for (const requiredLayer of requiredLayers) {
    const matched = input.value.some((layer) => {
      if (!isRecord(layer) || layer.role !== requiredLayer.role) {
        return false;
      }

      return requiredLayer.role === "outline" || layer.edge === requiredLayer.edge;
    });

    if (!matched) {
      issues.push(missingGeneratedStrokeLayerDiagnostic(input.path, requiredLayer));
    }
  }

  return issues;
}

function validateGeneratedStrokeLayerOwnerConsistency(input: {
  layer: unknown;
  path: string;
  index: number;
  ownerId: unknown;
  ownerFrame: unknown;
  ownerSerialized: unknown;
  edgeStrokes: unknown;
  outline: unknown;
}): Diagnostics["items"] {
  if (!isRecord(input.layer)) {
    return [];
  }

  const issues: Diagnostic[] = [];
  const expectedId = expectedGeneratedStrokeId({
    ownerId: input.ownerId,
    role: input.layer.role,
    edge: input.layer.edge,
  });
  if (
    expectedId !== undefined &&
    typeof input.layer.id === "string" &&
    input.layer.id !== expectedId
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.id`,
        message: "generated stroke id must be derived from owner element id and layer role",
      }),
    );
  }

  const expectedShapeObjectId = expectedGeneratedShapeObjectId({
    ownerSerialized: input.ownerSerialized,
    index: input.index,
  });
  if (
    expectedShapeObjectId?.status === "overflow" &&
    isRecord(input.layer.serialized) &&
    typeof input.layer.serialized.shapeObjectId === "string"
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.serialized.shapeObjectId`,
        message:
          "generated stroke shape object id must be derived from owner shape object id within the writer-safe range",
      }),
    );
  }
  if (
    expectedShapeObjectId?.status === "available" &&
    isRecord(input.layer.serialized) &&
    typeof input.layer.serialized.shapeObjectId === "string" &&
    input.layer.serialized.shapeObjectId !== expectedShapeObjectId.value
  ) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.serialized.shapeObjectId`,
        message:
          "generated stroke shape object id must be derived from owner shape object id and layer index",
      }),
    );
  }

  if (input.layer.role === "border") {
    if (input.layer.shape !== "line") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.shape`,
          message: "generated border stroke shape must be line",
        }),
      );
    }

    if (isGeneratedStrokeEdge(input.layer.edge)) {
      const expectedFrame = expectedGeneratedStrokeFrame({
        ownerFrame: input.ownerFrame,
        role: "border",
        edge: input.layer.edge,
      });
      if (
        expectedFrame &&
        isGeneratedStrokeFrame(input.layer.frame) &&
        !generatedStrokeFramesMatch(input.layer.frame, expectedFrame)
      ) {
        issues.push(
          drawingPayloadDiagnostic({
            path: `${input.path}.frame`,
            message: `generated border stroke frame must match owner ${input.layer.edge} edge frame`,
          }),
        );
      }

      if (isRecord(input.edgeStrokes)) {
        const ownerStroke = input.edgeStrokes[input.layer.edge];
        if (
          ownerStroke !== undefined &&
          stableJson(input.layer.stroke) !== stableJson(ownerStroke)
        ) {
          issues.push(
            drawingPayloadDiagnostic({
              path: `${input.path}.stroke`,
              message: `generated border stroke must match owner ${input.layer.edge} edge stroke`,
            }),
          );
        }
      }
    }

    return issues;
  }

  if (input.layer.role === "outline") {
    if (input.layer.shape !== "rect") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.shape`,
          message: "generated outline stroke shape must be rect",
        }),
      );
    }

    const expectedFrame = expectedGeneratedStrokeFrame({
      ownerFrame: input.ownerFrame,
      role: "outline",
      edge: undefined,
    });
    if (
      expectedFrame &&
      isGeneratedStrokeFrame(input.layer.frame) &&
      !generatedStrokeFramesMatch(input.layer.frame, expectedFrame)
    ) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.frame`,
          message: "generated outline stroke frame must match owner frame",
        }),
      );
    }

    if (isRecord(input.outline) && stableJson(input.layer.stroke) !== stableJson(input.outline)) {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.stroke`,
          message: "generated outline stroke must match owner outline stroke",
        }),
      );
    }
  }

  return issues;
}

function isGeneratedStrokeEdge(value: unknown): value is GeneratedStrokeEdge {
  return (
    typeof value === "string" &&
    (DRAWING_GENERATED_STROKE_EDGES as readonly string[]).includes(value)
  );
}

type GeneratedStrokeEdge = (typeof DRAWING_GENERATED_STROKE_EDGES)[number];

function expectedGeneratedStrokeId(input: {
  ownerId: unknown;
  role: unknown;
  edge: unknown;
}): string | undefined {
  if (typeof input.ownerId !== "string" || input.ownerId.length === 0) {
    return undefined;
  }

  if (input.role === "outline") {
    return `${input.ownerId}:generated:outline:outline`;
  }

  if (input.role === "border" && isGeneratedStrokeEdge(input.edge)) {
    return `${input.ownerId}:generated:border:${input.edge}`;
  }

  return undefined;
}

type ExpectedGeneratedShapeObjectId =
  | { readonly status: "available"; readonly value: string }
  | { readonly status: "overflow" };

function expectedGeneratedShapeObjectId(input: {
  ownerSerialized: unknown;
  index: number;
}): ExpectedGeneratedShapeObjectId | undefined {
  if (!isRecord(input.ownerSerialized)) {
    return undefined;
  }

  const ownerShapeObjectId = serializedShapeObjectIdNumber(input.ownerSerialized.shapeObjectId);
  if (ownerShapeObjectId === undefined) {
    return undefined;
  }

  const generatedShapeObjectId = ownerShapeObjectId * 100 + input.index + 1;
  if (
    !Number.isSafeInteger(generatedShapeObjectId) ||
    generatedShapeObjectId > MAX_WRITER_SHAPE_OBJECT_ID
  ) {
    return { status: "overflow" };
  }

  return { status: "available", value: String(generatedShapeObjectId) };
}

type GeneratedStrokeFrame = {
  readonly xEmu: number;
  readonly yEmu: number;
  readonly widthEmu: number;
  readonly heightEmu: number;
};

function isGeneratedStrokeFrame(value: unknown): value is GeneratedStrokeFrame {
  if (!isRecord(value)) {
    return false;
  }

  return (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).every((key) => {
    const field = value[key];
    return typeof field === "number" && Number.isFinite(field);
  });
}

function expectedGeneratedStrokeFrame(input: {
  ownerFrame: unknown;
  role: unknown;
  edge: unknown;
}): GeneratedStrokeFrame | undefined {
  if (!isGeneratedStrokeFrame(input.ownerFrame)) {
    return undefined;
  }

  if (input.role === "outline") {
    return input.ownerFrame;
  }

  if (input.role !== "border" || !isGeneratedStrokeEdge(input.edge)) {
    return undefined;
  }

  switch (input.edge) {
    case "top":
      return { ...input.ownerFrame, heightEmu: 0 };
    case "right":
      return {
        ...input.ownerFrame,
        xEmu: input.ownerFrame.xEmu + input.ownerFrame.widthEmu,
        widthEmu: 0,
      };
    case "bottom":
      return {
        ...input.ownerFrame,
        yEmu: input.ownerFrame.yEmu + input.ownerFrame.heightEmu,
        heightEmu: 0,
      };
    case "left":
      return { ...input.ownerFrame, widthEmu: 0 };
  }
}

function generatedStrokeFramesMatch(
  actual: GeneratedStrokeFrame,
  expected: GeneratedStrokeFrame,
): boolean {
  return (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).every(
    (key) => actual[key] === expected[key],
  );
}

type RequiredGeneratedStrokeLayer =
  | { readonly role: "outline" }
  | { readonly role: "border"; readonly edge: GeneratedStrokeEdge };

function requiredGeneratedStrokeLayers(input: {
  edgeStrokes: unknown;
  outline: unknown;
}): readonly RequiredGeneratedStrokeLayer[] {
  const layers: RequiredGeneratedStrokeLayer[] = [];
  if (isRecord(input.edgeStrokes)) {
    const edgeStrokes = input.edgeStrokes;
    (["top", "right", "bottom", "left"] as const).forEach((edge) => {
      if (edgeStrokes[edge] !== undefined) {
        layers.push({ role: "border", edge });
      }
    });
  }
  if (isRecord(input.outline)) {
    layers.push({ role: "outline" });
  }
  return layers;
}

function missingGeneratedStrokeLayerDiagnostic(
  path: string,
  layer: RequiredGeneratedStrokeLayer,
): Diagnostic {
  return drawingPayloadDiagnostic({
    path,
    message:
      layer.role === "outline"
        ? "missing generated outline stroke layer"
        : `missing generated border stroke layer for ${layer.edge} edge`,
  });
}

type SerializedShapeObjectIdEntry = {
  readonly shapeObjectId: string;
  readonly path: string;
};

type DrawingElementIdEntry = {
  readonly elementId: string;
  readonly path: string;
};

type DrawingAssetEntityIdEntry = {
  readonly assetEntityId: string;
  readonly path: string;
};

function collectDrawingElementIds(input: {
  element: unknown;
  path: string;
  entries: DrawingElementIdEntry[];
}): void {
  if (!isRecord(input.element)) {
    return;
  }

  if (typeof input.element.id === "string" && input.element.id.length > 0) {
    input.entries.push({
      elementId: input.element.id,
      path: `${input.path}.id`,
    });
  }

  if (Array.isArray(input.element.generatedStrokes)) {
    input.element.generatedStrokes.forEach((layer, index) => {
      if (isRecord(layer) && typeof layer.id === "string" && layer.id.length > 0) {
        input.entries.push({
          elementId: layer.id,
          path: `${input.path}.generatedStrokes.${index}.id`,
        });
      }
    });
  }

  if (input.element.kind === "group" && Array.isArray(input.element.children)) {
    input.element.children.forEach((child, index) => {
      collectDrawingElementIds({
        element: child,
        path: `${input.path}.children.${index}`,
        entries: input.entries,
      });
    });
  }

  visitTableChildElements(input.element, input.path, (child, childPath) => {
    collectDrawingElementIds({
      element: child,
      path: childPath,
      entries: input.entries,
    });
  });
}

function collectDrawingAssetEntityIds(input: {
  element: unknown;
  path: string;
  entries: DrawingAssetEntityIdEntry[];
}): void {
  if (!isRecord(input.element)) {
    return;
  }

  if (isRecord(input.element.origin) && Array.isArray(input.element.origin.assetEntityIds)) {
    input.element.origin.assetEntityIds.forEach((assetEntityId, index) => {
      if (typeof assetEntityId === "string" && assetEntityId.length > 0) {
        input.entries.push({
          assetEntityId,
          path: `${input.path}.origin.assetEntityIds.${index}`,
        });
      }
    });
  }

  if (input.element.kind === "group" && Array.isArray(input.element.children)) {
    input.element.children.forEach((child, index) => {
      collectDrawingAssetEntityIds({
        element: child,
        path: `${input.path}.children.${index}`,
        entries: input.entries,
      });
    });
  }

  visitTableChildElements(input.element, input.path, (child, childPath) => {
    collectDrawingAssetEntityIds({
      element: child,
      path: childPath,
      entries: input.entries,
    });
  });
}

function collectDrawingShapeObjectIds(input: {
  element: unknown;
  path: string;
  entries: SerializedShapeObjectIdEntry[];
}): void {
  if (!isRecord(input.element)) {
    return;
  }

  if (
    isRecord(input.element.serialized) &&
    isPositiveSerializedShapeObjectId(input.element.serialized.shapeObjectId)
  ) {
    input.entries.push({
      shapeObjectId: input.element.serialized.shapeObjectId,
      path: `${input.path}.serialized.shapeObjectId`,
    });
  }

  if (Array.isArray(input.element.generatedStrokes)) {
    input.element.generatedStrokes.forEach((layer, index) => {
      if (
        isRecord(layer) &&
        isRecord(layer.serialized) &&
        isPositiveSerializedShapeObjectId(layer.serialized.shapeObjectId)
      ) {
        input.entries.push({
          shapeObjectId: layer.serialized.shapeObjectId,
          path: `${input.path}.generatedStrokes.${index}.serialized.shapeObjectId`,
        });
      }
    });
  }

  if (Array.isArray(input.element.backgroundLayers)) {
    input.element.backgroundLayers.forEach((layer, index) => {
      if (
        isRecord(layer) &&
        isRecord(layer.serialized) &&
        isPositiveSerializedShapeObjectId(layer.serialized.shapeObjectId)
      ) {
        input.entries.push({
          shapeObjectId: layer.serialized.shapeObjectId,
          path: `${input.path}.backgroundLayers.${index}.serialized.shapeObjectId`,
        });
      }
    });
  }

  if (input.element.kind === "group" && Array.isArray(input.element.children)) {
    input.element.children.forEach((child, index) => {
      collectDrawingShapeObjectIds({
        element: child,
        path: `${input.path}.children.${index}`,
        entries: input.entries,
      });
    });
  }

  visitTableChildElements(input.element, input.path, (child, childPath) => {
    collectDrawingShapeObjectIds({
      element: child,
      path: childPath,
      entries: input.entries,
    });
  });
}

function validateSlideElementIdUniqueness(input: {
  children: readonly unknown[];
  path: string;
}): Diagnostics["items"] {
  const entries: DrawingElementIdEntry[] = [];
  input.children.forEach((element, index) => {
    collectDrawingElementIds({
      element,
      path: `${input.path}.${index}`,
      entries,
    });
  });

  const firstPathById = new Map<string, string>();
  const issues: Diagnostic[] = [];
  for (const entry of entries) {
    const firstPath = firstPathById.get(entry.elementId);
    if (firstPath === undefined) {
      firstPathById.set(entry.elementId, entry.path);
      continue;
    }

    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        title: "pptx drawing element identity is duplicated",
        message:
          "Pptx Drawing Nodes and generated layers must use unique element ids within each slide part.",
        labels: [
          { path: entry.path, message: `duplicate drawing element id ${entry.elementId}` },
          { path: firstPath, message: "first drawing element id occurrence" },
        ],
      }),
    );
  }
  return issues;
}

function validateSlideShapeObjectIdUniqueness(input: {
  children: readonly unknown[];
  path: string;
  backgroundLayers?: readonly unknown[];
  backgroundLayersPath?: string;
}): Diagnostics["items"] {
  const entries: SerializedShapeObjectIdEntry[] = [];
  input.backgroundLayers?.forEach((layer, index) => {
    if (
      isRecord(layer) &&
      isRecord(layer.serialized) &&
      isPositiveSerializedShapeObjectId(layer.serialized.shapeObjectId)
    ) {
      entries.push({
        shapeObjectId: layer.serialized.shapeObjectId,
        path: `${input.backgroundLayersPath ?? "projection.backgroundLayers"}.${index}.serialized.shapeObjectId`,
      });
    }
  });
  input.children.forEach((element, index) => {
    collectDrawingShapeObjectIds({
      element,
      path: `${input.path}.${index}`,
      entries,
    });
  });

  const firstPathById = new Map<string, string>();
  const issues: Diagnostic[] = [];
  for (const entry of entries) {
    const firstPath = firstPathById.get(entry.shapeObjectId);
    if (firstPath === undefined) {
      firstPathById.set(entry.shapeObjectId, entry.path);
      continue;
    }

    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        title: "pptx drawing serialized identity is duplicated",
        message:
          "Pptx Drawing Nodes and generated layers must use unique serialized shape object ids within each slide part.",
        labels: [
          { path: entry.path, message: `duplicate shape object id ${entry.shapeObjectId}` },
          { path: firstPath, message: "first shape object id occurrence" },
        ],
      }),
    );
  }
  return issues;
}

function validateDrawingPaintPayload(input: {
  element: Record<string, unknown>;
  path: string;
}): Diagnostics["items"] {
  return [
    ...validateDrawingFill({ value: input.element.fill, path: `${input.path}.fill` }),
    ...validateOptionalDrawingBackgroundLayers({
      value: input.element.backgroundLayers,
      path: `${input.path}.backgroundLayers`,
      ownerPaintOrder: input.element.paintOrder,
    }),
    ...validateDrawingStroke({ value: input.element.stroke, path: `${input.path}.stroke` }),
    ...validateDrawingEdgeStrokes({
      value: input.element.edgeStrokes,
      path: `${input.path}.edgeStrokes`,
    }),
    ...validateDrawingStroke({ value: input.element.outline, path: `${input.path}.outline` }),
    ...validateDrawingGeneratedStrokeLayers({
      value: input.element.generatedStrokes,
      path: `${input.path}.generatedStrokes`,
      ownerId: input.element.id,
      ownerFrame: input.element.frame,
      ownerPaintOrder: input.element.paintOrder,
      ownerSerialized: input.element.serialized,
      edgeStrokes: input.element.edgeStrokes,
      outline: input.element.outline,
    }),
    ...validateDrawingShadow({ value: input.element.shadow, path: `${input.path}.shadow` }),
    ...validateOptionalNonNegativeFiniteNumberField({
      value: input.element.radiusEmu,
      path: `${input.path}.radiusEmu`,
      message: "invalid drawing radius",
    }),
  ];
}

function validateDrawingTextStyle(input: {
  value: unknown;
  path: string;
  requireTextBodyFields?: boolean;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [drawingPayloadDiagnostic({ path: input.path, message: "invalid text style" })];
  }

  const style = input.value;
  const issues: Diagnostic[] = [
    ...validateOptionalStringField({
      value: style.fontFamily,
      path: `${input.path}.fontFamily`,
      message: "invalid text font family",
    }),
    ...validateOptionalFiniteNonNegativeNumberField({
      value: style.fontSizePt,
      path: `${input.path}.fontSizePt`,
      message: "invalid text font size",
    }),
    ...validateOptionalTextFontWeight({
      value: style.fontWeight,
      path: `${input.path}.fontWeight`,
    }),
    ...validateOptionalBooleanField({
      value: style.italic,
      path: `${input.path}.italic`,
      message: "invalid text italic flag",
    }),
    ...validateOptionalBooleanField({
      value: style.underline,
      path: `${input.path}.underline`,
      message: "invalid text underline flag",
    }),
    ...validateOptionalEnumField({
      value: style.underlineStyle,
      path: `${input.path}.underlineStyle`,
      message: "invalid text underline style",
      values: TEXT_UNDERLINE_STYLES,
    }),
    ...validateOptionalDrawingColorField({
      value: style.underlineColor,
      path: `${input.path}.underlineColor`,
      message: "invalid text underline color",
    }),
    ...validateOptionalBooleanField({
      value: style.strike,
      path: `${input.path}.strike`,
      message: "invalid text strike flag",
    }),
    ...validateOptionalBooleanField({
      value: style.rtlMode,
      path: `${input.path}.rtlMode`,
      message: "invalid text rtl mode flag",
    }),
    ...(input.requireTextBodyFields && style.textDirection === undefined
      ? [
          drawingPayloadDiagnostic({
            path: `${input.path}.textDirection`,
            message: "missing text direction",
          }),
        ]
      : validateOptionalEnumField({
          value: style.textDirection,
          path: `${input.path}.textDirection`,
          message: "invalid text direction",
          values: TEXT_DIRECTIONS,
        })),
    ...validateOptionalBooleanField({
      value: style.superscript,
      path: `${input.path}.superscript`,
      message: "invalid text superscript flag",
    }),
    ...validateOptionalBooleanField({
      value: style.subscript,
      path: `${input.path}.subscript`,
      message: "invalid text subscript flag",
    }),
    ...validateOptionalDrawingColorField({
      value: style.color,
      path: `${input.path}.color`,
      message: "invalid text color",
    }),
    ...validateOptionalEnumField({
      value: style.textAlign,
      path: `${input.path}.textAlign`,
      message: "invalid text alignment",
      values: TEXT_ALIGNMENTS,
    }),
    ...(input.requireTextBodyFields && style.verticalAlign === undefined
      ? [
          drawingPayloadDiagnostic({
            path: `${input.path}.verticalAlign`,
            message: "missing text vertical alignment",
          }),
        ]
      : validateOptionalEnumField({
          value: style.verticalAlign,
          path: `${input.path}.verticalAlign`,
          message: "invalid text vertical alignment",
          values: TEXT_VERTICAL_ALIGNMENTS,
        })),
    ...validateOptionalTextPadding({
      value: style.paddingPt,
      path: `${input.path}.paddingPt`,
    }),
    ...validateOptionalFiniteNonNegativeNumberField({
      value: style.lineSpacing,
      path: `${input.path}.lineSpacing`,
      message: "invalid text line spacing",
    }),
    ...validateOptionalFinitePositiveNumberField({
      value: style.lineSpacingMultiple,
      path: `${input.path}.lineSpacingMultiple`,
      message: "invalid text line spacing multiple",
    }),
    ...validateOptionalFiniteNonNegativeNumberField({
      value: style.paragraphSpacingBefore,
      path: `${input.path}.paragraphSpacingBefore`,
      message: "invalid text paragraph spacing before",
    }),
    ...validateOptionalFiniteNonNegativeNumberField({
      value: style.paragraphSpacingAfter,
      path: `${input.path}.paragraphSpacingAfter`,
      message: "invalid text paragraph spacing after",
    }),
    ...validateOptionalFiniteNumberField({
      value: style.textIndentPt,
      path: `${input.path}.textIndentPt`,
      message: "invalid text indent",
    }),
    ...validateOptionalTextTabStops({
      value: style.tabStops,
      path: `${input.path}.tabStops`,
    }),
    ...validateOptionalFiniteNumberField({
      value: style.charSpacing,
      path: `${input.path}.charSpacing`,
      message: "invalid text character spacing",
    }),
    ...validateOptionalTextList({
      value: style.list,
      path: `${input.path}.list`,
    }),
    ...(input.requireTextBodyFields && style.fit === undefined
      ? [
          drawingPayloadDiagnostic({
            path: `${input.path}.fit`,
            message: "missing text fit",
          }),
        ]
      : validateOptionalEnumField({
          value: style.fit,
          path: `${input.path}.fit`,
          message: "invalid text fit",
          values: TEXT_FIT_VALUES,
        })),
    ...(input.requireTextBodyFields && style.wrap === undefined
      ? [
          drawingPayloadDiagnostic({
            path: `${input.path}.wrap`,
            message: "missing text wrap flag",
          }),
        ]
      : validateOptionalBooleanField({
          value: style.wrap,
          path: `${input.path}.wrap`,
          message: "invalid text wrap flag",
        })),
  ];

  if (style.underline === true && style.underlineStyle === undefined) {
    issues.push(
      drawingPayloadDiagnostic({
        path: `${input.path}.underlineStyle`,
        message: "missing projected text underline style",
      }),
    );
  }

  return issues;
}

function validateDrawingElementPayload(input: {
  element: PptxElement;
  path: string;
}): Diagnostics["items"] {
  const element = input.element;
  const issues: Diagnostic[] = [];

  if (element.kind === "group") {
    issues.push(...validateDrawingPaintPayload({ element, path: input.path }));
    if (!Array.isArray(element.children)) {
      return [
        drawingPayloadDiagnostic({
          path: `${input.path}.children`,
          message: "invalid group children",
        }),
      ];
    }
    element.children.forEach((child, index) => {
      issues.push(
        ...validateDrawingElementPayload({
          element: child,
          path: `${input.path}.children.${index}`,
        }),
      );
    });
    return issues;
  }

  if (element.kind === "text") {
    if (typeof element.content.text !== "string") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.content.text`,
          message: "invalid text content value",
        }),
      );
    }
    issues.push(
      ...validateDrawingTextRuns({
        value: element.content.runs,
        path: `${input.path}.content.runs`,
      }),
    );
    issues.push(
      ...validateDrawingTextStyle({
        value: element.style,
        path: `${input.path}.style`,
        requireTextBodyFields: true,
      }),
      ...validateDrawingPaintPayload({ element, path: input.path }),
    );
    issues.push(
      ...validateDrawingHyperlink({ value: element.hyperlink, path: `${input.path}.hyperlink` }),
    );
    return issues;
  }

  if (element.kind === "image") {
    if (element.mediaPartId !== undefined && typeof element.mediaPartId !== "string") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: "invalid media part id",
        }),
      );
    }
    issues.push(
      ...validateDrawingPayloadFrame({
        value: element.sourceFrame,
        path: `${input.path}.sourceFrame`,
        message: "invalid image source frame",
      }),
      ...validateDrawingImageSource({ value: element.source, path: `${input.path}.source` }),
      ...(element.fit === "contain" || element.fit === "cover" || element.fit === "stretch"
        ? []
        : [drawingPayloadDiagnostic({ path: `${input.path}.fit`, message: "invalid image fit" })]),
      ...validateDrawingObjectPosition({
        value: element.objectPosition,
        path: `${input.path}.objectPosition`,
      }),
      ...validateDrawingImageCrop({ value: element.crop, path: `${input.path}.crop` }),
      ...validateOptionalDrawingTransparencyField({
        value: element.transparency,
        path: `${input.path}.transparency`,
        message: "invalid image transparency",
      }),
      ...(element.rounding === undefined || typeof element.rounding === "boolean"
        ? []
        : [
            drawingPayloadDiagnostic({
              path: `${input.path}.rounding`,
              message: "invalid image rounding",
            }),
          ]),
      ...validateDrawingShadow({ value: element.shadow, path: `${input.path}.shadow` }),
      ...validateDrawingHyperlink({ value: element.hyperlink, path: `${input.path}.hyperlink` }),
    );
    return issues;
  }

  if (element.kind === "video") {
    if (element.mediaPartId !== undefined && typeof element.mediaPartId !== "string") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: "invalid media part id",
        }),
      );
    }
    if (element.posterMediaPartId !== undefined && typeof element.posterMediaPartId !== "string") {
      issues.push(
        drawingPayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: "invalid poster media part id",
        }),
      );
    }
    issues.push(
      ...validateDrawingPayloadFrame({
        value: element.sourceFrame,
        path: `${input.path}.sourceFrame`,
        message: "invalid video source frame",
      }),
      ...validateDrawingImageSource({ value: element.source, path: `${input.path}.source` }),
      ...(element.posterSource
        ? validateDrawingImageSource({
            value: element.posterSource,
            path: `${input.path}.posterSource`,
          })
        : []),
      ...(element.fit === "contain" || element.fit === "cover" || element.fit === "stretch"
        ? []
        : [drawingPayloadDiagnostic({ path: `${input.path}.fit`, message: "invalid video fit" })]),
      ...validateDrawingObjectPosition({
        value: element.objectPosition,
        path: `${input.path}.objectPosition`,
      }),
      ...validateOptionalDrawingTransparencyField({
        value: element.transparency,
        path: `${input.path}.transparency`,
        message: "invalid video transparency",
      }),
      ...(element.rounding === undefined || typeof element.rounding === "boolean"
        ? []
        : [
            drawingPayloadDiagnostic({
              path: `${input.path}.rounding`,
              message: "invalid video rounding",
            }),
          ]),
      ...validateDrawingShadow({ value: element.shadow, path: `${input.path}.shadow` }),
    );
    return issues;
  }

  if (element.kind === "table") {
    const tableElement = element as Extract<PptxElement, { kind: "table" }>;
    if (!Array.isArray(tableElement.sections)) {
      return [
        drawingPayloadDiagnostic({
          path: `${input.path}.sections`,
          message: "invalid table sections",
        }),
      ];
    }

    tableElement.sections.forEach((section: PptxTableSection, sectionIndex: number) => {
      if (
        section.kind !== "tableSection" ||
        (section.sectionKind !== "head" &&
          section.sectionKind !== "body" &&
          section.sectionKind !== "foot") ||
        !Array.isArray(section.rows)
      ) {
        issues.push(
          drawingPayloadDiagnostic({
            path: `${input.path}.sections.${sectionIndex}`,
            message: "invalid table section",
          }),
        );
        return;
      }

      section.rows.forEach((row: PptxTableRow, rowIndex: number) => {
        issues.push(
          ...validateDrawingPayloadFrame({
            value: row.frame,
            path: `${input.path}.sections.${sectionIndex}.rows.${rowIndex}.frame`,
            message: "invalid table row frame",
          }),
        );
        if (row.kind !== "tableRow" || !Array.isArray(row.cells)) {
          issues.push(
            drawingPayloadDiagnostic({
              path: `${input.path}.sections.${sectionIndex}.rows.${rowIndex}`,
              message: "invalid table row",
            }),
          );
          return;
        }

        row.cells.forEach((cell: PptxTableCell, cellIndex: number) => {
          const cellPath = `${input.path}.sections.${sectionIndex}.rows.${rowIndex}.cells.${cellIndex}`;
          issues.push(
            ...validateDrawingPayloadFrame({
              value: cell.frame,
              path: `${cellPath}.frame`,
              message: "invalid table cell frame",
            }),
          );
          if (
            cell.kind !== "tableCell" ||
            (cell.cellKind !== "header" && cell.cellKind !== "data") ||
            !Number.isInteger(cell.gridColumnIndex) ||
            cell.gridColumnIndex < 0 ||
            !Number.isInteger(cell.colSpan) ||
            cell.colSpan < 1 ||
            !Number.isInteger(cell.rowSpan) ||
            cell.rowSpan < 1 ||
            typeof cell.text !== "string" ||
            !Array.isArray(cell.children)
          ) {
            issues.push(
              drawingPayloadDiagnostic({
                path: cellPath,
                message: "invalid table cell",
              }),
            );
            return;
          }

          issues.push(
            ...validateDrawingFill({ value: cell.fill, path: `${cellPath}.fill` }),
            ...validateDrawingEdgeStrokes({
              value: cell.edgeStrokes,
              path: `${cellPath}.edgeStrokes`,
            }),
            ...validateDrawingTextStyle({
              value: cell.style,
              path: `${cellPath}.style`,
              requireTextBodyFields: false,
            }),
          );
          cell.children.forEach((child: PptxElement, childIndex: number) => {
            issues.push(
              ...validateDrawingElementPayload({
                element: child,
                path: `${cellPath}.children.${childIndex}`,
              }),
            );
          });
          if (cell.unsupportedSemantics !== undefined) {
            if (!Array.isArray(cell.unsupportedSemantics)) {
              issues.push(
                drawingPayloadDiagnostic({
                  path: `${cellPath}.unsupportedSemantics`,
                  message: "invalid table cell unsupported semantics",
                }),
              );
            } else {
              cell.unsupportedSemantics.forEach((semantic, semanticIndex) => {
                issues.push(
                  ...validateUnsupportedSemantic({
                    semantic,
                    path: `${cellPath}.unsupportedSemantics.${semanticIndex}`,
                  }),
                );
              });
            }
          }
        });
      });
    });
    return issues;
  }

  if (element.kind === "shape") {
    if (element.shape !== "rect" && element.shape !== "ellipse" && element.shape !== "line") {
      issues.push(
        drawingPayloadDiagnostic({ path: `${input.path}.shape`, message: "invalid shape kind" }),
      );
    }
    issues.push(
      ...validateDrawingPaintPayload({ element, path: input.path }),
      ...validateDrawingHyperlink({ value: element.hyperlink, path: `${input.path}.hyperlink` }),
    );
  }

  return issues;
}

function validateDrawingMetadata(input: {
  element: PptxValidationDrawingElement;
  path: string;
  requireDrawingNodeMetadata: boolean;
  ownerPartId?: PackagePartId;
  expectedEmissionTarget?: string;
  expectedPaintOrderIndex?: number;
}): Diagnostics["items"] {
  const element = input.element;
  const issues = [
    ...(typeof element.id === "string" && element.id.length > 0
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.id`,
            message: "invalid drawing element id",
          }),
        ]),
    ...(isKnownDrawingElementKind(element.kind)
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.kind`,
            message: "invalid drawing node kind",
          }),
        ]),
    ...validateDrawingFrame({
      frame: input.element.frame,
      path: `${input.path}.frame`,
    }),
    ...validateDrawingFrameExtent({
      element: input.element,
      path: input.path,
    }),
    ...(element.opacity === undefined ||
    (typeof element.opacity === "number" &&
      Number.isFinite(element.opacity) &&
      element.opacity >= 0 &&
      element.opacity <= 1)
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.opacity`,
            message: "invalid opacity",
          }),
        ]),
    ...(element.rotation === undefined ||
    (typeof element.rotation === "number" && Number.isFinite(element.rotation))
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.rotation`,
            message: "invalid rotation",
          }),
        ]),
    ...(element.zIndex === undefined ||
    (typeof element.zIndex === "number" && Number.isFinite(element.zIndex))
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.zIndex`,
            message: "invalid z-index",
          }),
        ]),
    ...(element.flipH === undefined || typeof element.flipH === "boolean"
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.flipH`,
            message: "invalid horizontal flip",
          }),
        ]),
    ...(element.flipV === undefined || typeof element.flipV === "boolean"
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.flipV`,
            message: "invalid vertical flip",
          }),
        ]),
    ...(element.visibility === undefined || isKnownDrawingVisibility(element.visibility)
      ? []
      : [
          drawingMetadataDiagnostic({
            path: `${input.path}.visibility`,
            message: "invalid visibility",
          }),
        ]),
    ...(input.ownerPartId === undefined
      ? []
      : typeof element.packagePartId === "string" && element.packagePartId === input.ownerPartId
        ? []
        : [
            drawingMetadataDiagnostic({
              path: `${input.path}.packagePartId`,
              message: `drawing node does not belong to ${input.ownerPartId}`,
            }),
          ]),
    ...validateDrawingSerializedIdentities(input),
    ...validateDrawingOrigin({
      element: input.element,
      path: input.path,
    }),
    ...validateDrawingPaintOrder({
      element: input.element,
      path: input.path,
      requireDrawingNodeMetadata: input.requireDrawingNodeMetadata,
      expectedEmissionTarget: input.expectedEmissionTarget,
      expectedPaintOrderIndex: input.expectedPaintOrderIndex,
    }),
    ...validateDrawingLayoutAnchor(input),
    ...validateDrawingClip(input),
    ...validateDrawingMeasurement(input),
  ];

  if (input.element.kind === "group" && Array.isArray(input.element.children)) {
    input.element.children.forEach((child, index) => {
      issues.push(
        ...validateDrawingMetadata({
          element: child,
          path: `${input.path}.children.${index}`,
          requireDrawingNodeMetadata: false,
          ownerPartId: input.ownerPartId,
        }),
      );
    });
  }

  visitTableChildElements(input.element, input.path, (child, childPath) => {
    issues.push(
      ...validateDrawingMetadata({
        element: child,
        path: childPath,
        requireDrawingNodeMetadata: false,
        ownerPartId: input.ownerPartId,
      }),
    );
  });

  return issues;
}

function validateSlideFrame(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [slidePayloadDiagnostic({ path: input.path, message: "invalid slide frame" })];
  }

  const issues: Diagnostic[] = [];
  const frame = input.value;
  (["xEmu", "yEmu", "widthEmu", "heightEmu"] as const).forEach((key) => {
    const value = frame[key];
    const valid =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (key === "xEmu" || key === "yEmu" ? true : value > 0);
    if (!valid) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.${key}`,
          message: `invalid slide frame ${key}`,
        }),
      );
    }
  });

  return issues;
}

function validateSlideTransparency(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }
  return typeof input.value === "number" &&
    Number.isFinite(input.value) &&
    input.value >= 0 &&
    input.value <= 100
    ? []
    : [slidePayloadDiagnostic({ path: input.path, message: "invalid transparency" })];
}

function validateSlideGradientStops(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (!Array.isArray(input.value) || input.value.length === 0) {
    return [slidePayloadDiagnostic({ path: input.path, message: "invalid gradient stops" })];
  }

  return input.value.flatMap((stop, index) => {
    const stopPath = `${input.path}.${index}`;
    if (!isRecord(stop)) {
      return [slidePayloadDiagnostic({ path: stopPath, message: "invalid gradient stop" })];
    }

    const issues: Diagnostic[] = [];
    issues.push(
      ...validateRequiredSlideColorField({
        value: stop.color,
        path: `${stopPath}.color`,
        message: "invalid gradient color",
      }),
    );
    if (
      typeof stop.position !== "number" ||
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1
    ) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${stopPath}.position`,
          message: "invalid gradient position",
        }),
      );
    }
    issues.push(
      ...validateSlideTransparency({
        path: `${stopPath}.transparency`,
        value: stop.transparency,
      }),
    );
    return issues;
  });
}

function validateSlideFill(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [slidePayloadDiagnostic({ path: input.path, message: "invalid slide fill" })];
  }

  const issues: Diagnostic[] = [];
  if (input.value.frame !== undefined) {
    issues.push(...validateSlideFrame({ path: `${input.path}.frame`, value: input.value.frame }));
  }

  if (input.value.kind === "solid") {
    issues.push(
      ...validateRequiredSlideColorField({
        value: input.value.color,
        path: `${input.path}.color`,
        message: "invalid fill color",
      }),
    );
    issues.push(
      ...validateSlideTransparency({
        path: `${input.path}.transparency`,
        value: input.value.transparency,
      }),
    );
    return issues;
  }

  if (input.value.kind === "linear-gradient") {
    if (typeof input.value.angle !== "number" || !Number.isFinite(input.value.angle)) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.angle`,
          message: "invalid linear gradient angle",
        }),
      );
    }
    issues.push(
      ...validateSlideGradientStops({ path: `${input.path}.stops`, value: input.value.stops }),
    );
    return issues;
  }

  if (input.value.kind === "radial-gradient") {
    if (input.value.shape !== "circle" && input.value.shape !== "ellipse") {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.shape`,
          message: "invalid radial gradient shape",
        }),
      );
    }
    const center = input.value.center;
    if (!isRecord(center)) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.center`,
          message: "invalid radial gradient center",
        }),
      );
    } else {
      (["x", "y"] as const).forEach((key) => {
        if (typeof center[key] !== "number" || !Number.isFinite(center[key])) {
          issues.push(
            slidePayloadDiagnostic({
              path: `${input.path}.center.${key}`,
              message: `invalid radial gradient center ${key}`,
            }),
          );
        }
      });
    }
    const radius = input.value.radius;
    if (!isRecord(radius)) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.radius`,
          message: "invalid radial gradient radius",
        }),
      );
    } else {
      (["x", "y"] as const).forEach((key) => {
        if (typeof radius[key] !== "number" || !Number.isFinite(radius[key]) || radius[key] <= 0) {
          issues.push(
            slidePayloadDiagnostic({
              path: `${input.path}.radius.${key}`,
              message: `invalid radial gradient radius ${key}`,
            }),
          );
        }
      });
    }
    issues.push(
      ...validateSlideGradientStops({ path: `${input.path}.stops`, value: input.value.stops }),
    );
    return issues;
  }

  return [
    slidePayloadDiagnostic({ path: `${input.path}.kind`, message: "invalid slide fill kind" }),
  ];
}

function validateSlideImageSource(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [
      slidePayloadDiagnostic({ path: input.path, message: "invalid background image source" }),
    ];
  }

  if (input.value.kind === "path") {
    return typeof input.value.path === "string" && input.value.path.length > 0
      ? []
      : [slidePayloadDiagnostic({ path: `${input.path}.path`, message: "invalid image path" })];
  }
  if (input.value.kind === "data") {
    return typeof input.value.data === "string" && input.value.data.length > 0
      ? []
      : [slidePayloadDiagnostic({ path: `${input.path}.data`, message: "invalid image data" })];
  }
  if (input.value.kind === "url") {
    return typeof input.value.url === "string" && input.value.url.length > 0
      ? []
      : [slidePayloadDiagnostic({ path: `${input.path}.url`, message: "invalid image url" })];
  }

  return [
    slidePayloadDiagnostic({ path: `${input.path}.kind`, message: "invalid image source kind" }),
  ];
}

function validateSlideBackgroundImageLayer(input: {
  path: string;
  value: Record<string, unknown>;
}): Diagnostics["items"] {
  const issues: Diagnostic[] = [
    ...validateSlideFrame({ path: `${input.path}.frame`, value: input.value.frame }),
    ...validateSlideFrame({ path: `${input.path}.sourceFrame`, value: input.value.sourceFrame }),
    ...validateSlideImageSource({ path: `${input.path}.source`, value: input.value.source }),
    ...validateSlideTransparency({
      path: `${input.path}.transparency`,
      value: input.value.transparency,
    }),
    ...validateSlideBackgroundLayerSerializedIdentities({
      path: input.path,
      value: input.value,
    }),
  ];

  if (
    input.value.fit !== "contain" &&
    input.value.fit !== "cover" &&
    input.value.fit !== "stretch" &&
    input.value.fit !== "size"
  ) {
    issues.push(
      slidePayloadDiagnostic({ path: `${input.path}.fit`, message: "invalid image fit" }),
    );
  }
  if (
    input.value.repeat !== "no-repeat" &&
    input.value.repeat !== "repeat-x" &&
    input.value.repeat !== "repeat-y" &&
    input.value.repeat !== "repeat"
  ) {
    issues.push(
      slidePayloadDiagnostic({ path: `${input.path}.repeat`, message: "invalid image repeat" }),
    );
  }
  if (input.value.size !== undefined) {
    if (!isRecord(input.value.size)) {
      issues.push(
        slidePayloadDiagnostic({ path: `${input.path}.size`, message: "invalid image size" }),
      );
    } else {
      const size = input.value.size;
      (["widthEmu", "heightEmu"] as const).forEach((key) => {
        const value = size[key];
        if (
          value !== undefined &&
          (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        ) {
          issues.push(
            slidePayloadDiagnostic({
              path: `${input.path}.size.${key}`,
              message: `invalid image size ${key}`,
            }),
          );
        }
      });
    }
  }

  return issues;
}

function validateSlideBackgroundLayer(input: {
  path: string;
  value: unknown;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [slidePayloadDiagnostic({ path: input.path, message: "invalid background layer" })];
  }
  const paintOrderIssues = validateSlideBackgroundLayerPaintOrder({
    value: input.value.paintOrder,
    path: `${input.path}.paintOrder`,
  });
  if (input.value.kind === "background-image") {
    return [
      ...paintOrderIssues,
      ...validateSlideBackgroundImageLayer({ path: input.path, value: input.value }),
    ];
  }

  return [
    ...paintOrderIssues,
    ...validateSlideFrame({ path: `${input.path}.frame`, value: input.value.frame }),
    ...validateSlideFill({ path: input.path, value: input.value }),
    ...validateSlideBackgroundLayerSerializedIdentities({
      path: input.path,
      value: input.value,
    }),
  ];
}

function validateSlideBackgroundLayerPaintOrder(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [
      slidePayloadDiagnostic({ path: input.path, message: "invalid background paint order" }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (!Number.isInteger(input.value.siblingOrder) || (input.value.siblingOrder as number) < 0) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.siblingOrder`,
        message: "invalid background sibling order",
      }),
    );
  }
  if (
    input.value.zIndex !== undefined &&
    (typeof input.value.zIndex !== "number" || !Number.isFinite(input.value.zIndex))
  ) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.zIndex`,
        message: "invalid background z-index",
      }),
    );
  }
  if (input.value.generatedLayerRole !== "background") {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.generatedLayerRole`,
        message: "background layer role must be background",
      }),
    );
  }

  return issues;
}

function validateSlideBackgroundLayerSerializedIdentities(input: {
  path: string;
  value: Record<string, unknown>;
}): Diagnostics["items"] {
  if (!isRecord(input.value.serialized)) {
    return [
      slidePayloadDiagnostic({
        path: `${input.path}.serialized`,
        message: "invalid background layer serialized identity metadata",
      }),
    ];
  }

  return isPositiveSerializedShapeObjectId(input.value.serialized.shapeObjectId)
    ? []
    : [
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.shapeObjectId`,
          message: "background layer shape object id must be a writer-safe positive numeric string",
        }),
      ];
}

function isPptxUnsignedNumericId(value: unknown, min: number, max: number): value is string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  const numeric = Number.parseInt(value, 10);
  return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max;
}

function isPresentationSlideId(value: unknown): value is string {
  return isPptxUnsignedNumericId(value, MIN_PRESENTATION_SLIDE_ID, MAX_PRESENTATION_SLIDE_ID);
}

function validateSlidePayload(input: {
  part: PptxSlidePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const { payload } = input.part;

  const issues: Diagnostic[] = [];
  if (!isPresentationSlideId(payload.slideId)) {
    issues.push(slidePayloadDiagnostic({ path: `${path}.slideId`, message: "invalid slide id" }));
  }
  if (
    payload.name !== undefined &&
    (typeof payload.name !== "string" || payload.name.length === 0)
  ) {
    issues.push(slidePayloadDiagnostic({ path: `${path}.name`, message: "invalid slide name" }));
  }
  if (payload.background !== undefined) {
    issues.push(...validateSlideFill({ path: `${path}.background`, value: payload.background }));
  }
  if (payload.backgroundLayers !== undefined) {
    payload.backgroundLayers.forEach((layer, index) => {
      issues.push(
        ...validateSlideBackgroundLayer({
          path: `${path}.backgroundLayers.${index}`,
          value: layer,
        }),
      );
    });
  }

  if (!isRecord(payload.drawing)) {
    issues.push(
      slidePayloadDiagnostic({ path: `${path}.drawing`, message: "invalid slide drawing" }),
    );
    return issues;
  }
  if (!Array.isArray(payload.drawing.children)) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${path}.drawing.children`,
        message: "invalid drawing children",
      }),
    );
    return issues;
  }

  payload.drawing.children.forEach((element, index) => {
    const path = `projection.parts.${input.part.id}.payload.drawing.children.${index}`;
    issues.push(
      ...validateDrawingElementPayload({
        element,
        path,
      }),
      ...validateDrawingMetadata({
        element,
        path,
        requireDrawingNodeMetadata: true,
        ownerPartId: input.part.id,
        expectedEmissionTarget: "slide",
        expectedPaintOrderIndex: index,
      }),
      ...validateDrawingUnsupportedSemantics({
        part: input.part,
        element,
        path,
      }),
      ...validateSlideImageRelationships({
        element,
        path,
        slidePart: input.part,
        partsById: input.partsById,
      }),
      ...validateSlideHyperlinkRelationships({
        element,
        path,
        slidePart: input.part,
      }),
    );
  });
  issues.push(
    ...validateSlideElementIdUniqueness({
      children: payload.drawing.children,
      path: `projection.parts.${input.part.id}.payload.drawing.children`,
    }),
  );
  issues.push(
    ...validateSlideShapeObjectIdUniqueness({
      children: payload.drawing.children,
      path: `projection.parts.${input.part.id}.payload.drawing.children`,
      backgroundLayers: Array.isArray(payload.backgroundLayers) ? payload.backgroundLayers : [],
      backgroundLayersPath: `projection.parts.${input.part.id}.payload.backgroundLayers`,
    }),
  );

  issues.push(
    ...validateSlideBackgroundImageRelationships({
      part: input.part,
      payload,
      partsById: input.partsById,
    }),
  );

  return issues;
}

function validateSlideHyperlinkRelationships(input: {
  element: PptxElement;
  path: string;
  slidePart: PptxPackagePart;
}): Diagnostics["items"] {
  const element = input.element;
  if (element.kind === "group") {
    if (!Array.isArray(element.children)) {
      return [];
    }
    return element.children.flatMap((child, index) =>
      validateSlideHyperlinkRelationships({
        element: child,
        path: `${input.path}.children.${index}`,
        slidePart: input.slidePart,
      }),
    );
  }

  if (element.kind === "table") {
    return element.sections.flatMap((section, sectionIndex) =>
      section.rows.flatMap((row, rowIndex) =>
        row.cells.flatMap((cell, cellIndex) =>
          cell.children.flatMap((child, childIndex) =>
            validateSlideHyperlinkRelationships({
              element: child,
              path: `${input.path}.sections.${sectionIndex}.rows.${rowIndex}.cells.${cellIndex}.children.${childIndex}`,
              slidePart: input.slidePart,
            }),
          ),
        ),
      ),
    );
  }

  if (!("hyperlink" in element) || !isRecord(element.hyperlink)) {
    return [];
  }

  const url = element.hyperlink.url;
  if (typeof url !== "string" || url.length === 0) {
    return [];
  }

  const relationshipId = isRecord(element.serialized)
    ? element.serialized.hyperlinkRelationshipId
    : undefined;
  if (typeof relationshipId !== "string" || relationshipId.length === 0) {
    return [
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.hyperlinkRelationshipId`,
        message: "missing hyperlink relationship id",
      }),
    ];
  }

  const relationship = relationshipRecords(input.slidePart).find(
    (item) => item.id === relationshipId,
  );
  if (!relationship) {
    return [
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.hyperlinkRelationshipId`,
        message: `missing hyperlink relationship ${relationshipId}`,
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (relationship.type !== "hyperlink") {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.hyperlinkRelationshipId`,
        message: `relationship ${relationshipId} is not a hyperlink relationship`,
      }),
    );
  }
  if (relationship.targetMode !== "external") {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.hyperlinkRelationshipId`,
        message: `hyperlink relationship ${relationshipId} is not external`,
      }),
    );
  }
  if (relationship.targetPath !== url) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.hyperlink.url`,
        message: `hyperlink url does not match relationship ${relationshipId}`,
      }),
    );
  }

  return issues;
}

function mediaPartsBySourceKey(
  partsById: ReadonlyMap<string, PptxPackagePart>,
): ReadonlyMap<string, readonly PptxPackagePart[]> {
  const partsBySource = new Map<string, PptxPackagePart[]>();

  for (const part of partsById.values()) {
    if (part.kind !== "media" || !isRecord(part.payload)) {
      continue;
    }

    const sources = Array.isArray(part.payload.sources)
      ? part.payload.sources
      : part.payload.source !== undefined
        ? [part.payload.source]
        : [];

    sources.forEach((source) => {
      const sourceKey = imageSourceKeyForValidation(source);
      if (!sourceKey) {
        return;
      }
      const parts = partsBySource.get(sourceKey) ?? [];
      if (!parts.some((item) => item.id === part.id)) {
        parts.push(part);
        partsBySource.set(sourceKey, parts);
      }
    });
  }

  return partsBySource;
}

function validateBackgroundImageLayerRelationship(input: {
  layer: unknown;
  path: string;
  slidePart: PptxPackagePart;
  mediaPartsBySource: ReadonlyMap<string, readonly PptxPackagePart[]>;
}): Diagnostics["items"] {
  if (!isRecord(input.layer) || input.layer.kind !== "background-image") {
    return [];
  }

  const sourceKey = imageSourceKeyForValidation(input.layer.source);
  if (!sourceKey) {
    return [];
  }

  const mediaParts = input.mediaPartsBySource.get(sourceKey) ?? [];
  if (mediaParts.length === 0) {
    return [
      slidePayloadDiagnostic({
        path: `${input.path}.source`,
        message: "missing background image media part",
      }),
    ];
  }
  if (mediaParts.length > 1) {
    return [
      slidePayloadDiagnostic({
        path: `${input.path}.source`,
        message: "ambiguous background image media part",
      }),
    ];
  }

  const mediaPart = mediaParts[0]!;
  const issues: Diagnostic[] = [
    ...validateBackgroundImageDimensions({
      layer: input.layer,
      path: input.path,
      mediaPart,
    }),
  ];
  const relationship = relationshipRecords(input.slidePart).find(
    (item) => item.type === "image" && item.targetPartId === mediaPart.id,
  );
  if (!relationship) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.source`,
        message: `missing background image relationship to ${mediaPart.id}`,
      }),
    );
    return issues;
  }

  if (
    typeof relationship.targetPath !== "string" ||
    normalizedPartPath(relationship.targetPath) === normalizedPartPath(mediaPart.path)
  ) {
    return issues;
  }

  issues.push(
    slidePayloadDiagnostic({
      path: `${input.path}.source`,
      message: `background image relationship ${relationship.id} target path does not match media part`,
    }),
  );
  return issues;
}

function mediaPartHasProjectedDimensions(mediaPart: PptxPackagePart): boolean {
  if (!isRecord(mediaPart.payload) || !isRecord(mediaPart.payload.metadata)) {
    return false;
  }

  const width = mediaPart.payload.metadata.widthPx;
  const height = mediaPart.payload.metadata.heightPx;
  return (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  );
}

function backgroundImageRequiresProjectedDimensions(layer: Record<string, unknown>): boolean {
  if (layer.fit === "contain" || layer.fit === "cover") {
    return true;
  }
  if (layer.fit !== "size") {
    return false;
  }

  const size = layer.size;
  if (!isRecord(size)) {
    return true;
  }

  return !(
    typeof size.widthEmu === "number" &&
    Number.isFinite(size.widthEmu) &&
    size.widthEmu > 0 &&
    typeof size.heightEmu === "number" &&
    Number.isFinite(size.heightEmu) &&
    size.heightEmu > 0
  );
}

function validateBackgroundImageDimensions(input: {
  layer: Record<string, unknown>;
  path: string;
  mediaPart: PptxPackagePart;
}): Diagnostics["items"] {
  if (
    !backgroundImageRequiresProjectedDimensions(input.layer) ||
    mediaPartHasProjectedDimensions(input.mediaPart)
  ) {
    return [];
  }

  return [
    slidePayloadDiagnostic({
      path: `${input.path}.source`,
      message: `background image ${String(input.layer.fit)} requires projected media metadata widthPx and heightPx`,
    }),
  ];
}

function validateElementBackgroundImageRelationships(input: {
  element: unknown;
  path: string;
  slidePart: PptxPackagePart;
  mediaPartsBySource: ReadonlyMap<string, readonly PptxPackagePart[]>;
}): Diagnostics["items"] {
  if (!isRecord(input.element)) {
    return [];
  }

  const issues: Diagnostic[] = [];
  if (Array.isArray(input.element.backgroundLayers)) {
    input.element.backgroundLayers.forEach((layer, layerIndex) => {
      issues.push(
        ...validateBackgroundImageLayerRelationship({
          layer,
          path: `${input.path}.backgroundLayers.${layerIndex}`,
          slidePart: input.slidePart,
          mediaPartsBySource: input.mediaPartsBySource,
        }),
      );
    });
  }

  if (input.element.kind === "group" && Array.isArray(input.element.children)) {
    input.element.children.forEach((child, childIndex) => {
      issues.push(
        ...validateElementBackgroundImageRelationships({
          element: child,
          path: `${input.path}.children.${childIndex}`,
          slidePart: input.slidePart,
          mediaPartsBySource: input.mediaPartsBySource,
        }),
      );
    });
  }

  visitTableChildElements(input.element, input.path, (child, childPath) => {
    issues.push(
      ...validateElementBackgroundImageRelationships({
        element: child,
        path: childPath,
        slidePart: input.slidePart,
        mediaPartsBySource: input.mediaPartsBySource,
      }),
    );
  });

  return issues;
}

function validateSlideBackgroundImageRelationships(input: {
  part: PptxPackagePart;
  payload: Record<string, unknown>;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const mediaParts = mediaPartsBySourceKey(input.partsById);
  const issues: Diagnostic[] = [];

  if (Array.isArray(input.payload.backgroundLayers)) {
    input.payload.backgroundLayers.forEach((layer, index) => {
      issues.push(
        ...validateBackgroundImageLayerRelationship({
          layer,
          path: `${path}.backgroundLayers.${index}`,
          slidePart: input.part,
          mediaPartsBySource: mediaParts,
        }),
      );
    });
  }

  const drawing = input.payload.drawing;
  if (isRecord(drawing) && Array.isArray(drawing.children)) {
    drawing.children.forEach((element, index) => {
      issues.push(
        ...validateElementBackgroundImageRelationships({
          element,
          path: `${path}.drawing.children.${index}`,
          slidePart: input.part,
          mediaPartsBySource: mediaParts,
        }),
      );
    });
  }

  return issues;
}

function validateSlideImageRelationships(input: {
  element: PptxElement;
  path: string;
  slidePart: PptxPackagePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const element = input.element;
  if (element.kind === "group") {
    if (!Array.isArray(element.children)) {
      return [];
    }
    return element.children.flatMap((child, index) =>
      validateSlideImageRelationships({
        element: child,
        path: `${input.path}.children.${index}`,
        slidePart: input.slidePart,
        partsById: input.partsById,
      }),
    );
  }

  if (element.kind === "table") {
    return element.sections.flatMap((section, sectionIndex) =>
      section.rows.flatMap((row, rowIndex) =>
        row.cells.flatMap((cell, cellIndex) =>
          cell.children.flatMap((child, childIndex) =>
            validateSlideImageRelationships({
              element: child,
              path: `${input.path}.sections.${sectionIndex}.rows.${rowIndex}.cells.${cellIndex}.children.${childIndex}`,
              slidePart: input.slidePart,
              partsById: input.partsById,
            }),
          ),
        ),
      ),
    );
  }

  if (element.kind === "video") {
    const issues: Diagnostic[] = [];
    if (typeof element.mediaPartId !== "string" || element.mediaPartId.length === 0) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: "missing video media part id",
        }),
      );
      return issues;
    }

    const relationshipId = isRecord(element.serialized)
      ? element.serialized.relationshipId
      : undefined;
    if (typeof relationshipId !== "string" || relationshipId.length === 0) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.relationshipId`,
          message: "missing video relationship id",
        }),
      );
      return issues;
    }

    const relationship = relationshipRecords(input.slidePart).find(
      (item) => item.id === relationshipId,
    );
    if (!relationship) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.relationshipId`,
          message: `missing video relationship ${relationshipId}`,
        }),
      );
      return issues;
    }

    if (relationship.type !== "video") {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.relationshipId`,
          message: `relationship ${relationshipId} is not a video relationship`,
        }),
      );
    }

    if (relationship.targetPartId !== element.mediaPartId) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: `video media part id does not match relationship ${relationshipId}`,
        }),
      );
    }

    const mediaPart = input.partsById.get(element.mediaPartId);
    if (!mediaPart) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: `missing media part ${element.mediaPartId}`,
        }),
      );
      return issues;
    }

    if (mediaPart.kind !== "media") {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: `video media part id targets ${mediaPart.kind}`,
        }),
      );
    }

    if (
      relationship.targetPath &&
      normalizedPartPath(relationship.targetPath) !== normalizedPartPath(mediaPart.path)
    ) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.relationshipId`,
          message: `video relationship ${relationshipId} target path does not match media part`,
        }),
      );
    }

    const mediaRelationshipId = isRecord(element.serialized)
      ? element.serialized.mediaRelationshipId
      : undefined;
    if (typeof mediaRelationshipId !== "string" || mediaRelationshipId.length === 0) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.mediaRelationshipId`,
          message: "missing embedded media relationship id",
        }),
      );
      return issues;
    }

    const mediaRelationship = relationshipRecords(input.slidePart).find(
      (item) => item.id === mediaRelationshipId,
    );
    if (!mediaRelationship) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.mediaRelationshipId`,
          message: `missing embedded media relationship ${mediaRelationshipId}`,
        }),
      );
      return issues;
    }

    if (mediaRelationship.type !== "media") {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.serialized.mediaRelationshipId`,
          message: `relationship ${mediaRelationshipId} is not an embedded media relationship`,
        }),
      );
    }

    if (mediaRelationship.targetPartId !== element.mediaPartId) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.mediaPartId`,
          message: `video media part id does not match embedded media relationship ${mediaRelationshipId}`,
        }),
      );
    }

    if (!element.posterSource) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterSource`,
          message: "missing video poster source",
        }),
      );
      return issues;
    }

    if (typeof element.posterMediaPartId !== "string" || element.posterMediaPartId.length === 0) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: "missing video poster media part id",
        }),
      );
      return issues;
    }

    const posterPart = input.partsById.get(element.posterMediaPartId);
    if (!posterPart) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: `missing video poster media part ${element.posterMediaPartId}`,
        }),
      );
      return issues;
    }

    if (posterPart.kind !== "media") {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: `video poster media part id targets ${posterPart.kind}`,
        }),
      );
    }

    const posterPayload = isRecord(posterPart.payload)
      ? (posterPart.payload as Readonly<Record<string, unknown>>)
      : undefined;
    if (posterPayload?.mediaKind !== undefined && posterPayload.mediaKind !== "image") {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: "video poster media part id must target image media",
        }),
      );
    }

    const posterSourceKey = imageSourceKeyForValidation(element.posterSource);
    const posterSourceParts = posterSourceKey
      ? (mediaPartsBySourceKey(input.partsById).get(posterSourceKey) ?? [])
      : [];
    if (!posterSourceParts.some((part) => part.id === element.posterMediaPartId)) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterSource`,
          message: `video poster source does not match media part ${element.posterMediaPartId}`,
        }),
      );
    }

    const posterRelationship = relationshipRecords(input.slidePart).find(
      (item) => item.type === "image" && item.targetPartId === element.posterMediaPartId,
    );
    if (!posterRelationship) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: `missing video poster image relationship to ${element.posterMediaPartId}`,
        }),
      );
      return issues;
    }

    if (
      posterRelationship.targetPath &&
      normalizedPartPath(posterRelationship.targetPath) !== normalizedPartPath(posterPart.path)
    ) {
      issues.push(
        slidePayloadDiagnostic({
          path: `${input.path}.posterMediaPartId`,
          message: `video poster image relationship ${posterRelationship.id} target path does not match media part`,
        }),
      );
    }

    return issues;
  }

  if (element.kind !== "image") {
    return [];
  }

  const issues: Diagnostic[] = [];
  if (typeof element.mediaPartId !== "string" || element.mediaPartId.length === 0) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.mediaPartId`,
        message: "missing image media part id",
      }),
    );
    return issues;
  }

  const relationshipId = isRecord(element.serialized)
    ? element.serialized.relationshipId
    : undefined;
  if (typeof relationshipId !== "string" || relationshipId.length === 0) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.relationshipId`,
        message: "missing image relationship id",
      }),
    );
    return issues;
  }

  const relationship = relationshipRecords(input.slidePart).find(
    (item) => item.id === relationshipId,
  );
  if (!relationship) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.relationshipId`,
        message: `missing image relationship ${relationshipId}`,
      }),
    );
    return issues;
  }

  if (relationship.type !== "image") {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.relationshipId`,
        message: `relationship ${relationshipId} is not an image relationship`,
      }),
    );
  }

  if (relationship.targetPartId !== element.mediaPartId) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.mediaPartId`,
        message: `image media part id does not match relationship ${relationshipId}`,
      }),
    );
  }

  const mediaPart = input.partsById.get(element.mediaPartId);
  if (!mediaPart) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.mediaPartId`,
        message: `missing media part ${element.mediaPartId}`,
      }),
    );
    return issues;
  }

  if (mediaPart.kind !== "media") {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.mediaPartId`,
        message: `image media part id targets ${mediaPart.kind}`,
      }),
    );
  }

  if (
    mediaPart.kind === "media" &&
    (element.fit === "contain" || element.fit === "cover") &&
    !mediaPartHasProjectedDimensions(mediaPart)
  ) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.mediaPartId`,
        message: `image ${element.fit} requires projected media metadata widthPx and heightPx`,
      }),
    );
  }

  if (
    relationship.targetPath &&
    normalizedPartPath(relationship.targetPath) !== normalizedPartPath(mediaPart.path)
  ) {
    issues.push(
      slidePayloadDiagnostic({
        path: `${input.path}.serialized.relationshipId`,
        message: `image relationship ${relationshipId} target path does not match media part`,
      }),
    );
  }

  return issues;
}

function validateRequiredString(input: {
  path: string;
  value: unknown;
  field: string;
}): Diagnostics["items"] {
  return typeof input.value === "string" && input.value.length > 0
    ? []
    : [
        themeTraceDiagnostic({
          path: input.path,
          message: `invalid ${input.field}`,
        }),
      ];
}

function validateOptionalPackagePartReference(input: {
  path: string;
  value: unknown;
  partsById: ReadonlyMap<string, PptxPackagePart>;
  expectedKind?: PptxPackagePart["kind"];
}): Diagnostics["items"] {
  if (input.value === undefined) {
    return [];
  }
  const part = typeof input.value === "string" ? input.partsById.get(input.value) : undefined;
  if (typeof input.value !== "string" || !part) {
    const value = typeof input.value === "string" ? input.value : "non-string package part id";
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: `missing package part ${value}`,
      }),
    ];
  }
  if (input.expectedKind && part.kind !== input.expectedKind) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: `expected ${input.expectedKind} package part but found ${part.kind}`,
      }),
    ];
  }
  return [];
}

function validateThemeProjectionBaseMapping(input: {
  value: Record<string, unknown>;
  path: string;
}): Diagnostics["items"] {
  return [
    ...validateRequiredString({
      path: `${input.path}.defaultKey`,
      value: input.value.defaultKey,
      field: "default key",
    }),
    ...validateRequiredString({
      path: `${input.path}.property`,
      value: input.value.property,
      field: "property",
    }),
    ...(typeof input.value.graphNodeId === "string" && input.value.graphNodeId.length > 0
      ? []
      : [
          themeTraceDiagnostic({
            path: `${input.path}.graphNodeId`,
            message: "invalid graph node id",
          }),
        ]),
  ];
}

function validateThemeWholeThemeMappings(input: {
  value: unknown;
  path: string;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid whole-theme mappings",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid whole-theme mapping" })];
    }

    const issues: Diagnostic[] = [];
    if (item.source !== "deckjsx-default") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (item.projectedAs !== "themePart") {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.projectedAs`, message: "invalid projection target" }),
      );
    }
    if (item.purpose !== "default") {
      issues.push(themeTraceDiagnostic({ path: `${path}.purpose`, message: "invalid purpose" }));
    }
    issues.push(
      ...validateOptionalPackagePartReference({
        path: `${path}.themePartId`,
        value: item.themePartId,
        partsById: input.partsById,
        expectedKind: "theme",
      }),
    );
    if (!Array.isArray(item.groups) || item.groups.length === 0) {
      issues.push(themeTraceDiagnostic({ path: `${path}.groups`, message: "invalid groups" }));
    } else {
      item.groups.forEach((group, groupIndex) => {
        if (!isKnownThemeValueGroup(group)) {
          issues.push(
            themeTraceDiagnostic({
              path: `${path}.groups.${groupIndex}`,
              message: "invalid theme value group",
            }),
          );
        }
      });
    }
    if (typeof item.fingerprint !== "string" || item.fingerprint.length === 0) {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.fingerprint`, message: "invalid fingerprint" }),
      );
    }
    return issues;
  });
}

function validateThemeSupportMappings(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid theme support mappings",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid theme support mapping" })];
    }

    const issues: Diagnostic[] = [];
    if (item.source !== "deckjsx-default") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (item.projectedAs !== "themeSupport") {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.projectedAs`, message: "invalid projection target" }),
      );
    }
    if (!Array.isArray(item.groups) || item.groups.length === 0) {
      issues.push(themeTraceDiagnostic({ path: `${path}.groups`, message: "invalid groups" }));
    } else {
      item.groups.forEach((group, groupIndex) => {
        if (group !== "colorScheme" && group !== "fontScheme" && group !== "formatScheme") {
          issues.push(
            themeTraceDiagnostic({
              path: `${path}.groups.${groupIndex}`,
              message: "invalid theme support group",
            }),
          );
        }
      });
    }
    return issues;
  });
}

function validateThemeValueGroupFingerprints(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid value group fingerprints",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid value group fingerprint" })];
    }

    const issues = [];
    if (!isKnownThemeValueGroup(item.group)) {
      issues.push(themeTraceDiagnostic({ path: `${path}.group`, message: "invalid value group" }));
    }
    if (item.source !== "deckjsx-default" && item.source !== "themeDefault") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (item.projectedAs !== "themeSupport" && item.projectedAs !== "themeProjectionTrace") {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.projectedAs`, message: "invalid projection target" }),
      );
    }
    if (
      item.source === "deckjsx-default" &&
      item.projectedAs !== undefined &&
      item.projectedAs !== "themeSupport"
    ) {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.projectedAs`,
          message: "deckjsx default value groups must project as theme support",
        }),
      );
    }
    if (
      item.source === "themeDefault" &&
      item.projectedAs !== undefined &&
      item.projectedAs !== "themeProjectionTrace"
    ) {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.projectedAs`,
          message: "theme default value groups must project as theme projection trace",
        }),
      );
    }
    if (typeof item.fingerprint !== "string" || item.fingerprint.length === 0) {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.fingerprint`, message: "invalid fingerprint" }),
      );
    }
    if (!Number.isInteger(item.itemCount) || (item.itemCount as number) < 0) {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.itemCount`, message: "invalid item count" }),
      );
    }
    return issues;
  });
}

function validateThemeDefaultStyleDecisions(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid default style decisions",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid default style decision" })];
    }

    const issues = [
      ...validateThemeProjectionBaseMapping({ value: item, path }),
      ...validateRequiredString({ path: `${path}.reason`, value: item.reason, field: "reason" }),
    ];
    if (item.source !== "themeDefault") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (!isKnownThemeDefaultStyleDecision(item.decision)) {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.decision`, message: "invalid style decision" }),
      );
    }
    if (!isKnownThemeDefaultStyleProjectionTarget(item.projectedAs)) {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.projectedAs`,
          message: "invalid style projection target",
        }),
      );
    }
    return issues;
  });
}

function validateThemeConcreteDrawingProperties(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid concrete drawing property mappings",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid concrete drawing property mapping" })];
    }

    const issues = [...validateThemeProjectionBaseMapping({ value: item, path })];
    if (item.projectedAs !== "concreteDrawingProperty") {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.projectedAs`,
          message: "invalid concrete drawing property projection target",
        }),
      );
    }
    if (!("resolvedValue" in item)) {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.resolvedValue`, message: "missing resolved value" }),
      );
    }
    return issues;
  });
}

function validateThemeUnprojectedMappings(input: {
  value: unknown;
  path: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid unprojected theme mappings",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid unprojected theme mapping" })];
    }

    const issues = [
      ...validateThemeProjectionBaseMapping({ value: item, path }),
      ...validateRequiredString({ path: `${path}.reason`, value: item.reason, field: "reason" }),
    ];
    if (item.source !== "themeDefault") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (item.projectedAs !== "unprojected") {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.projectedAs`,
          message: "invalid unprojected projection target",
        }),
      );
    }
    if (!("resolvedValue" in item)) {
      issues.push(
        themeTraceDiagnostic({ path: `${path}.resolvedValue`, message: "missing resolved value" }),
      );
    }
    return issues;
  });
}

function validateThemeEffectiveInheritance(input: {
  value: unknown;
  path: string;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid effective inheritance trace",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid effective inheritance record" })];
    }

    const issues = [
      ...validateThemeProjectionBaseMapping({ value: item, path }),
      ...validateOptionalPackagePartReference({
        path: `${path}.themePartId`,
        value: item.themePartId,
        partsById: input.partsById,
        expectedKind: "theme",
      }),
      ...validateOptionalPackagePartReference({
        path: `${path}.slideMasterPartId`,
        value: item.slideMasterPartId,
        partsById: input.partsById,
        expectedKind: "slide-master",
      }),
      ...validateOptionalPackagePartReference({
        path: `${path}.slideLayoutPartId`,
        value: item.slideLayoutPartId,
        partsById: input.partsById,
        expectedKind: "slide-layout",
      }),
      ...validateOptionalPackagePartReference({
        path: `${path}.slidePartId`,
        value: item.slidePartId,
        partsById: input.partsById,
        expectedKind: "slide",
      }),
    ];
    if (item.source !== "themeDefault") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (item.projectedAs !== "concreteDrawingProperty" && item.projectedAs !== "unprojected") {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.projectedAs`,
          message: "invalid projection decision",
        }),
      );
    }
    if (!Array.isArray(item.inheritedThrough)) {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.inheritedThrough`,
          message: "invalid inheritance steps",
        }),
      );
    } else {
      item.inheritedThrough.forEach((step, stepIndex) => {
        if (!isKnownThemeEffectiveInheritanceStep(step)) {
          issues.push(
            themeTraceDiagnostic({
              path: `${path}.inheritedThrough.${stepIndex}`,
              message: "invalid inheritance step",
            }),
          );
        }
      });
    }
    issues.push(
      ...validateRequiredString({ path: `${path}.reason`, value: item.reason, field: "reason" }),
    );
    return issues;
  });
}

function validateThemeReferenceSerialization(input: {
  value: unknown;
  path: string;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [
      themeTraceDiagnostic({
        path: input.path,
        message: "invalid reference serialization choices",
      }),
    ];
  }

  return input.value.flatMap((item, index) => {
    const path = `${input.path}.${index}`;
    if (!isRecord(item)) {
      return [themeTraceDiagnostic({ path, message: "invalid reference serialization choice" })];
    }

    const issues = [
      ...validateThemeProjectionBaseMapping({ value: item, path }),
      ...validateRequiredString({ path: `${path}.reason`, value: item.reason, field: "reason" }),
    ];
    if (item.source !== "themeDefault") {
      issues.push(themeTraceDiagnostic({ path: `${path}.source`, message: "invalid source" }));
    }
    if (!isKnownThemeReferenceSerializationKind(item.currentSerialization)) {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.currentSerialization`,
          message: "invalid current serialization",
        }),
      );
    }
    if (!isKnownThemeReferenceSerializationDecision(item.decision)) {
      issues.push(
        themeTraceDiagnostic({
          path: `${path}.decision`,
          message: "invalid serialization decision",
        }),
      );
    }
    if (item.candidate !== undefined) {
      if (!isRecord(item.candidate)) {
        issues.push(
          themeTraceDiagnostic({ path: `${path}.candidate`, message: "invalid theme candidate" }),
        );
      } else if (item.candidate.kind === "schemeColor") {
        issues.push(
          ...validateRequiredString({
            path: `${path}.candidate.value`,
            value: item.candidate.value,
            field: "scheme color candidate",
          }),
          ...validateOptionalPackagePartReference({
            path: `${path}.candidate.themePartId`,
            value: item.candidate.themePartId,
            partsById: input.partsById,
            expectedKind: "theme",
          }),
        );
      } else if (item.candidate.kind === "fontScheme") {
        if (item.candidate.value !== "majorLatin" && item.candidate.value !== "minorLatin") {
          issues.push(
            themeTraceDiagnostic({
              path: `${path}.candidate.value`,
              message: "invalid font scheme candidate",
            }),
          );
        }
        issues.push(
          ...validateOptionalPackagePartReference({
            path: `${path}.candidate.themePartId`,
            value: item.candidate.themePartId,
            partsById: input.partsById,
            expectedKind: "theme",
          }),
        );
      } else {
        issues.push(
          themeTraceDiagnostic({
            path: `${path}.candidate.kind`,
            message: "invalid candidate kind",
          }),
        );
      }
    }
    return issues;
  });
}

function validateThemePayload(input: {
  part: PptxPackagePart;
  payload: PptxThemePartPayload;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const payload = input.payload;
  const payloadPath = `projection.parts.${input.part.id}.payload`;
  const issues: Diagnostic[] = [];

  if (typeof payload.name !== "string" || payload.name.length === 0) {
    issues.push(
      supportPayloadDiagnostic({ path: `${payloadPath}.name`, message: "invalid theme name" }),
    );
  }

  if (payload.editable !== true) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${payloadPath}.editable`,
        message: "theme payload must remain editable",
      }),
    );
  }

  if (!isRecord(payload.colorScheme)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${payloadPath}.colorScheme`,
        message: "invalid theme color scheme",
      }),
    );
  } else {
    const colorScheme = payload.colorScheme;
    if (typeof colorScheme.name !== "string" || colorScheme.name.length === 0) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${payloadPath}.colorScheme.name`,
          message: "invalid theme color scheme name",
        }),
      );
    }

    if (!isRecord(colorScheme.colors)) {
      issues.push(
        supportPayloadDiagnostic({
          path: `${payloadPath}.colorScheme.colors`,
          message: "invalid theme colors",
        }),
      );
    } else {
      THEME_COLOR_KEYS.forEach((key) => {
        const value = colorScheme.colors[key];
        if (typeof value !== "string" || !PROJECTED_RGB_COLOR_PATTERN.test(value)) {
          issues.push(
            supportPayloadDiagnostic({
              path: `${payloadPath}.colorScheme.colors.${key}`,
              message: `invalid theme color ${key}`,
            }),
          );
        }
      });
    }
  }

  if (!isRecord(payload.fontScheme)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${payloadPath}.fontScheme`,
        message: "invalid theme font scheme",
      }),
    );
  } else {
    const fontScheme = payload.fontScheme;
    (["name", "majorLatin", "minorLatin"] as const).forEach((key) => {
      const value = fontScheme[key];
      if (typeof value !== "string" || value.length === 0) {
        issues.push(
          supportPayloadDiagnostic({
            path: `${payloadPath}.fontScheme.${key}`,
            message: `invalid theme font scheme ${key}`,
          }),
        );
      }
    });
  }

  if (!isRecord(payload.formatScheme)) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${payloadPath}.formatScheme`,
        message: "invalid theme format scheme",
      }),
    );
  } else if (
    typeof payload.formatScheme.name !== "string" ||
    payload.formatScheme.name.length === 0
  ) {
    issues.push(
      supportPayloadDiagnostic({
        path: `${payloadPath}.formatScheme.name`,
        message: "invalid theme format scheme name",
      }),
    );
  }

  const projection = payload.projection;
  const projectionPath = `${payloadPath}.projection`;
  if (!isRecord(projection)) {
    issues.push(
      themeTraceDiagnostic({ path: projectionPath, message: "invalid theme projection" }),
    );
    return issues;
  }

  issues.push(
    ...validateRequiredString({
      path: `${projectionPath}.id`,
      value: projection.id,
      field: "theme projection id",
    }),
  );
  if (projection.purpose !== "default") {
    issues.push(
      themeTraceDiagnostic({ path: `${projectionPath}.purpose`, message: "invalid purpose" }),
    );
  }
  if (projection.source !== "deckjsx-default") {
    issues.push(
      themeTraceDiagnostic({ path: `${projectionPath}.source`, message: "invalid source" }),
    );
  }

  const trace = projection.trace;
  const path = `${projectionPath}.trace`;
  if (!isRecord(trace)) {
    issues.push(themeTraceDiagnostic({ path, message: "invalid theme projection trace" }));
    return issues;
  }

  issues.push(
    ...validateThemeWholeThemeMappings({
      value: trace.wholeThemeMappings,
      path: `${path}.wholeThemeMappings`,
      partsById: input.partsById,
    }),
    ...validateThemeSupportMappings({
      value: trace.supportMappings,
      path: `${path}.supportMappings`,
    }),
    ...validateThemeValueGroupFingerprints({
      value: trace.valueGroupFingerprints,
      path: `${path}.valueGroupFingerprints`,
    }),
    ...validateThemeDefaultStyleDecisions({
      value: trace.defaultStyleDecisions,
      path: `${path}.defaultStyleDecisions`,
    }),
    ...validateThemeConcreteDrawingProperties({
      value: trace.concreteDrawingProperties,
      path: `${path}.concreteDrawingProperties`,
    }),
    ...validateThemeUnprojectedMappings({
      value: trace.unprojected,
      path: `${path}.unprojected`,
    }),
    ...validateThemeEffectiveInheritance({
      value: trace.effectiveInheritance,
      path: `${path}.effectiveInheritance`,
      partsById: input.partsById,
    }),
    ...validateThemeReferenceSerialization({
      value: trace.referenceSerialization,
      path: `${path}.referenceSerialization`,
      partsById: input.partsById,
    }),
  );

  return issues;
}

function packagePartsFor(projection: PptxPackageModelCandidate): readonly PptxPackagePart[] {
  return Array.isArray(projection.parts) ? projection.parts : [];
}

function validateProjectionSize(projection: PptxPackageModelCandidate): Diagnostics["items"] {
  const size = projection.size;
  const issues: Diagnostic[] = [];
  (["widthEmu", "heightEmu"] as const).forEach((key) => {
    const value = size[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_MODEL_SIZE",
          title: "pptx package model size is invalid",
          message: "Pptx Package Model size values must be finite positive EMU values.",
          labels: [{ path: `projection.size.${key}`, message: `invalid ${key}` }],
        }),
      );
    }
  });

  return issues;
}

function slidePartComparisonRecord(part: PptxSlidePart): Record<string, unknown> {
  return {
    id: part.id,
    category: part.category,
    kind: part.kind,
    requirement: part.requirement,
    orderKey: part.orderKey,
    fingerprint: part.fingerprint,
    dependencyFingerprints: part.dependencyFingerprints,
    path: part.path,
    relationships: part.relationships,
    origin: part.origin,
    payload: part.payload,
  };
}

function validateProjectionSlidesIndex(input: {
  projection: PptxPackageModelCandidate;
  parts: readonly PptxPackagePart[];
}): Diagnostics["items"] {
  const slides = Array.isArray(input.projection.slides) ? input.projection.slides : [];
  const issues: Diagnostic[] = [];
  const parts = Array.isArray(input.parts) ? input.parts : [];
  const slideParts = parts.filter(isPptxSlidePart);
  const slidePartsById = new Map(slideParts.map((part) => [part.id, part]));
  const indexedSlideIds = new Set<string>();

  slides.forEach((slide, index) => {
    const path = `projection.slides.${index}`;
    if (typeof slide.id !== "string" || slide.id.length === 0) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          title: "pptx package model slide index identity is invalid",
          message: "Projection slides must preserve slide package part identities.",
          labels: [{ path: `${path}.id`, message: "invalid slide package part id" }],
        }),
      );
      return;
    }

    const slideId = slide.id;
    if (indexedSlideIds.has(slideId)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          title: "pptx package model slide index is duplicated",
          message: "Projection slides must list each slide package part at most once.",
          labels: [{ path: `${path}.id`, message: `duplicate slide part ${slideId}` }],
        }),
      );
      return;
    }

    indexedSlideIds.add(slideId);
    const slidePart = slidePartsById.get(slideId);
    if (!slidePart) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          title: "pptx package model slide index target is missing",
          message: "Projection slides must point at slide package parts in projection.parts.",
          labels: [{ path: `${path}.id`, message: `missing slide part ${slideId}` }],
        }),
      );
      return;
    }

    const indexed = slidePartComparisonRecord(slide);
    const actual = slidePartComparisonRecord(slidePart);
    if (stableJson(indexed) !== stableJson(actual)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          title: "pptx package model slide index is out of sync",
          message:
            "Projection slides must stay aligned with the fingerprinted slide package parts in projection.parts.",
          labels: [{ path, message: `slide index diverges from part ${slideId}` }],
        }),
      );
    }
  });

  slideParts.forEach((part) => {
    if (!indexedSlideIds.has(part.id)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          title: "pptx package model slide part is missing from slides index",
          message: "Every slide package part must appear in projection.slides for inspection.",
          labels: [{ path: "projection.slides", message: `missing slide part ${part.id}` }],
        }),
      );
    }
  });

  return issues;
}

function relationshipRecords(part: PptxPackagePart): readonly PptxRelationship[] {
  if (isRelationshipsPayload(part.payload)) {
    return part.payload.relationships.filter((relationship): relationship is PptxRelationship =>
      isRecord(relationship),
    );
  }
  return Array.isArray(part.relationships)
    ? part.relationships.filter((relationship): relationship is PptxRelationship =>
        isRecord(relationship),
      )
    : [];
}

function relationshipOwnerPath(path: string): string | undefined {
  if (path === "_rels/.rels") {
    return "";
  }

  if (!path.endsWith(".rels")) {
    return undefined;
  }

  const marker = "/_rels/";
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const ownerDirectory = path.slice(0, markerIndex);
  const ownerFile = path.slice(markerIndex + marker.length, -".rels".length);
  return ownerDirectory ? `${ownerDirectory}/${ownerFile}` : ownerFile;
}

function relationshipExists(
  relationships: readonly PptxRelationship[],
  input: { readonly type: string; readonly targetPartId: PackagePartId },
): boolean {
  return relationships.some(
    (relationship) =>
      relationship.type === input.type && relationship.targetPartId === input.targetPartId,
  );
}

function missingRequiredRelationshipDiagnostic(input: {
  readonly ownerPart: PptxPackagePart;
  readonly message: string;
  readonly targetPartId: PackagePartId;
  readonly type: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
    title: "pptx package required relationship is missing",
    message: input.message,
    labels: [
      {
        path: `projection.parts.${input.ownerPart.id}.relationships`,
        message: `missing ${input.type} relationship to ${input.targetPartId}`,
      },
    ],
  });
}

function validateContentTypesPayload(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload)) {
    return [manifestPayloadDiagnostic({ path, message: "invalid content types payload" })];
  }

  const issues: Diagnostic[] = [];

  if (!Array.isArray(payload.defaults)) {
    issues.push(
      manifestPayloadDiagnostic({
        path: `${path}.defaults`,
        message: "invalid content type defaults",
      }),
    );
  } else {
    const seenDefaultExtensions = new Set<string>();
    payload.defaults.forEach((item, index) => {
      const itemPath = `${path}.defaults.${index}`;
      if (!isRecord(item)) {
        issues.push(
          manifestPayloadDiagnostic({
            path: itemPath,
            message: "invalid content type default",
          }),
        );
        return;
      }

      if (!isCanonicalContentTypeDefaultExtension(item.extension)) {
        issues.push(
          manifestPayloadDiagnostic({
            path: `${itemPath}.extension`,
            message: "invalid content type extension",
          }),
        );
      }
      if (isCanonicalContentTypeDefaultExtension(item.extension)) {
        const extension = item.extension.toLowerCase();
        if (seenDefaultExtensions.has(extension)) {
          issues.push(
            manifestPayloadDiagnostic({
              path: `${itemPath}.extension`,
              message: `duplicate content type default ${item.extension}`,
            }),
          );
        } else {
          seenDefaultExtensions.add(extension);
        }
      }
      if (typeof item.contentType !== "string" || item.contentType.length === 0) {
        issues.push(
          manifestPayloadDiagnostic({
            path: `${itemPath}.contentType`,
            message: "invalid content type value",
          }),
        );
      }
    });
  }

  if (!Array.isArray(payload.overrides)) {
    issues.push(
      manifestPayloadDiagnostic({
        path: `${path}.overrides`,
        message: "invalid content type overrides",
      }),
    );
  } else {
    const seenOverridePartNames = new Set<string>();
    payload.overrides.forEach((item, index) => {
      const itemPath = `${path}.overrides.${index}`;
      if (!isRecord(item)) {
        issues.push(
          manifestPayloadDiagnostic({
            path: itemPath,
            message: "invalid content type override",
          }),
        );
        return;
      }

      if (!isCanonicalContentTypePartName(item.partName)) {
        issues.push(
          manifestPayloadDiagnostic({
            path: `${itemPath}.partName`,
            message: "invalid content type part name",
          }),
        );
      }
      if (isCanonicalContentTypePartName(item.partName)) {
        const partName = normalizedPartPath(item.partName);
        if (seenOverridePartNames.has(partName)) {
          issues.push(
            manifestPayloadDiagnostic({
              path: `${itemPath}.partName`,
              message: `duplicate content type override ${item.partName}`,
            }),
          );
        } else {
          seenOverridePartNames.add(partName);
        }
      }
      if (typeof item.contentType !== "string" || item.contentType.length === 0) {
        issues.push(
          manifestPayloadDiagnostic({
            path: `${itemPath}.contentType`,
            message: "invalid content type value",
          }),
        );
      }
    });
  }

  return issues;
}

function contentTypeDefaultExtensions(payload: PptxContentTypesPayload): ReadonlySet<string> {
  return new Set(
    payload.defaults.flatMap((item) =>
      isCanonicalContentTypeDefaultExtension(item.extension) ? [item.extension.toLowerCase()] : [],
    ),
  );
}

function contentTypeDefaultMap(payload: PptxContentTypesPayload): ReadonlyMap<string, string> {
  return new Map(
    payload.defaults.flatMap((item) =>
      isCanonicalContentTypeDefaultExtension(item.extension) &&
      typeof item.contentType === "string" &&
      item.contentType.length > 0
        ? [[item.extension.toLowerCase(), item.contentType]]
        : [],
    ),
  );
}

function contentTypeOverridePartNames(payload: PptxContentTypesPayload): ReadonlySet<string> {
  return new Set(
    payload.overrides.flatMap((item) =>
      isCanonicalContentTypePartName(item.partName) ? [normalizedPartPath(item.partName)] : [],
    ),
  );
}

function contentTypeOverrideMap(payload: PptxContentTypesPayload): ReadonlyMap<string, string> {
  return new Map(
    payload.overrides.flatMap((item) =>
      isCanonicalContentTypePartName(item.partName) &&
      typeof item.contentType === "string" &&
      item.contentType.length > 0
        ? [[normalizedPartPath(item.partName), item.contentType]]
        : [],
    ),
  );
}

function packagePartExtension(part: PptxPackagePart): string | undefined {
  const fileName = normalizedPartPath(part.path).split("/").pop();
  const dotIndex = fileName?.lastIndexOf(".") ?? -1;
  return fileName && dotIndex >= 0 && dotIndex < fileName.length - 1
    ? fileName.slice(dotIndex + 1).toLowerCase()
    : undefined;
}

function missingContentTypeDiagnostic(input: { path: string; message: string }): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_MISSING_CONTENT_TYPE",
    title: "pptx package content type declaration is missing",
    message:
      "Pptx Package Model content type manifests must declare every emitted package part before Render builds the final ZIP.",
    labels: [{ path: input.path, message: input.message }],
  });
}

function invalidContentTypeDiagnostic(input: {
  path: string;
  message: string;
  expected: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_CONTENT_TYPE",
    title: "pptx package content type declaration is invalid",
    message:
      "Pptx Package Model content type manifests must use the expected OOXML content type for each projected package part.",
    labels: [{ path: input.path, message: `${input.message}; expected ${input.expected}` }],
  });
}

function mediaContentTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

function expectedOverrideContentType(part: PptxPackagePart): string | undefined {
  switch (part.kind) {
    case "document-properties": {
      const payload = part.payload as { propertyKind?: unknown } | undefined;
      if (
        payload?.propertyKind === "extended" ||
        normalizedPartPath(part.path) === "docProps/app.xml"
      ) {
        return CONTENT_TYPE_EXTENDED_PROPERTIES;
      }
      return CONTENT_TYPE_CORE_PROPERTIES;
    }
    case "notes-master":
      return CONTENT_TYPE_NOTES_MASTER;
    case "notes-slide":
      return CONTENT_TYPE_NOTES_SLIDE;
    case "presentation":
      return CONTENT_TYPE_PRESENTATION;
    case "presentation-properties":
      return CONTENT_TYPE_PRESENTATION_PROPERTIES;
    case "table-styles":
      return CONTENT_TYPE_TABLE_STYLES;
    case "slide":
      return CONTENT_TYPE_SLIDE;
    case "slide-layout":
      return CONTENT_TYPE_SLIDE_LAYOUT;
    case "slide-master":
      return CONTENT_TYPE_SLIDE_MASTER;
    case "theme":
      return CONTENT_TYPE_THEME;
    case "view-properties":
      return CONTENT_TYPE_VIEW_PROPERTIES;
    case "content-types":
    case "media":
    case "relationships":
      return undefined;
  }
}

function validateContentTypeCoverage(input: {
  part: PptxPackagePart;
  parts: readonly PptxPackagePart[];
}): Diagnostics["items"] {
  if (!isContentTypesPayload(input.part.payload)) {
    return [];
  }

  const defaults = contentTypeDefaultExtensions(input.part.payload);
  const defaultValues = contentTypeDefaultMap(input.part.payload);
  const overrides = contentTypeOverridePartNames(input.part.payload);
  const overrideValues = contentTypeOverrideMap(input.part.payload);
  const issues: Diagnostic[] = [];
  const missingDefaultExtensions = new Set<string>();
  const missingOverridePaths = new Set<string>();

  const relsContentType = defaultValues.get("rels");
  if (relsContentType !== undefined && relsContentType !== CONTENT_TYPE_RELATIONSHIPS) {
    issues.push(
      invalidContentTypeDiagnostic({
        path: `projection.parts.${input.part.id}.payload.defaults`,
        message: "invalid default content type for rels",
        expected: CONTENT_TYPE_RELATIONSHIPS,
      }),
    );
  }

  const xmlContentType = defaultValues.get("xml");
  if (xmlContentType !== undefined && xmlContentType !== CONTENT_TYPE_XML) {
    issues.push(
      invalidContentTypeDiagnostic({
        path: `projection.parts.${input.part.id}.payload.defaults`,
        message: "invalid default content type for xml",
        expected: CONTENT_TYPE_XML,
      }),
    );
  }

  input.parts.forEach((targetPart) => {
    const targetPath = normalizedPartPath(targetPart.path);
    if (targetPath === "[Content_Types].xml") {
      return;
    }

    if (targetPart.kind === "relationships") {
      if (!defaults.has("rels")) {
        missingDefaultExtensions.add("rels");
      }
      return;
    }

    if (targetPart.kind === "media") {
      const extension = packagePartExtension(targetPart);
      if (!extension || !defaults.has(extension)) {
        missingDefaultExtensions.add(extension ?? targetPath);
      } else {
        const expected = mediaContentTypeForExtension(extension);
        const actual = defaultValues.get(extension);
        if (actual !== undefined && actual !== expected) {
          issues.push(
            invalidContentTypeDiagnostic({
              path: `projection.parts.${input.part.id}.payload.defaults`,
              message: `invalid default content type for ${extension}`,
              expected,
            }),
          );
        }
      }
      return;
    }

    if (!overrides.has(targetPath)) {
      missingOverridePaths.add(targetPath);
      return;
    }

    const expected = expectedOverrideContentType(targetPart);
    const actual = overrideValues.get(targetPath);
    if (expected !== undefined && actual !== undefined && actual !== expected) {
      issues.push(
        invalidContentTypeDiagnostic({
          path: `projection.parts.${input.part.id}.payload.overrides`,
          message: `invalid override content type for /${targetPath}`,
          expected,
        }),
      );
    }
  });

  missingDefaultExtensions.forEach((extension) => {
    issues.push(
      missingContentTypeDiagnostic({
        path: `projection.parts.${input.part.id}.payload.defaults`,
        message: `missing default content type for ${extension}`,
      }),
    );
  });

  missingOverridePaths.forEach((path) => {
    issues.push(
      missingContentTypeDiagnostic({
        path: `projection.parts.${input.part.id}.payload.overrides`,
        message: `missing override content type for /${path}`,
      }),
    );
  });

  return issues;
}

function documentPropertiesKind(part: PptxPackagePart): "core" | "extended" | undefined {
  if (part.kind !== "document-properties") {
    return undefined;
  }

  const payload = part.payload as { propertyKind?: unknown } | undefined;
  if (payload?.propertyKind === "core" || payload?.propertyKind === "extended") {
    return payload.propertyKind;
  }

  const path = normalizedPartPath(part.path);
  if (path === "docProps/core.xml") {
    return "core";
  }
  if (path === "docProps/app.xml") {
    return "extended";
  }

  return undefined;
}

function documentPropertiesPart(
  parts: readonly PptxPackagePart[],
  kind: "core" | "extended",
): PptxPackagePart | undefined {
  return parts.find((part) => documentPropertiesKind(part) === kind);
}

function relationshipOwnerFamily(
  part: PptxPackagePart,
): keyof typeof KNOWN_RELATIONSHIP_OWNER_TYPES | undefined {
  const path = normalizedPartPath(part.path);
  if (path === "_rels/.rels") {
    return "root";
  }
  if (path === "ppt/presentation.xml" || path === "ppt/_rels/presentation.xml.rels") {
    return "presentation";
  }
  if (
    part.kind === "slide" ||
    (part.kind === "relationships" && path.startsWith("ppt/slides/_rels/"))
  ) {
    return "slide";
  }
  if (
    part.kind === "slide-layout" ||
    (part.kind === "relationships" && path.startsWith("ppt/slideLayouts/_rels/"))
  ) {
    return "slideLayout";
  }
  if (
    part.kind === "slide-master" ||
    (part.kind === "relationships" && path.startsWith("ppt/slideMasters/_rels/"))
  ) {
    return "slideMaster";
  }

  return undefined;
}

function validateRelationshipOwnerSemantics(input: {
  relationship: Record<string, unknown>;
  ownerFamily: keyof typeof KNOWN_RELATIONSHIP_OWNER_TYPES | undefined;
  path: string;
  diagnosticFor: (input: { path: string; message: string; title?: string }) => Diagnostic;
}): Diagnostics["items"] {
  const type = input.relationship.type;
  if (typeof type !== "string" || type.length === 0 || input.ownerFamily === undefined) {
    return [];
  }

  if (
    type !== "hyperlink" &&
    !(type in INTERNAL_RELATIONSHIP_TARGET_KINDS) &&
    input.relationship.targetMode === "external"
  ) {
    return [];
  }

  const allowedTypes = KNOWN_RELATIONSHIP_OWNER_TYPES[input.ownerFamily];
  if (allowedTypes.some((allowedType) => allowedType === type)) {
    return [];
  }

  return [
    input.diagnosticFor({
      path: `${input.path}.type`,
      message: `${type} relationship is not valid for ${input.ownerFamily} relationship owner`,
    }),
  ];
}

function validateRelationshipSemantics(input: {
  relationship: Record<string, unknown>;
  ownerFamily?: keyof typeof KNOWN_RELATIONSHIP_OWNER_TYPES;
  path: string;
  partsById: ReadonlyMap<string, PptxPackagePart>;
  diagnosticFor: (input: { path: string; message: string; title?: string }) => Diagnostic;
}): Diagnostics["items"] {
  const issues: Diagnostic[] = [];
  const type = input.relationship.type;

  if (typeof type !== "string" || type.length === 0) {
    return issues;
  }

  issues.push(
    ...validateRelationshipOwnerSemantics({
      relationship: input.relationship,
      ownerFamily: input.ownerFamily,
      path: input.path,
      diagnosticFor: input.diagnosticFor,
    }),
  );

  const expectedKinds =
    INTERNAL_RELATIONSHIP_TARGET_KINDS[type as keyof typeof INTERNAL_RELATIONSHIP_TARGET_KINDS];

  if (input.relationship.targetMode === "external") {
    if (expectedKinds) {
      issues.push(
        input.diagnosticFor({
          path: `${input.path}.targetMode`,
          message: `${type} relationships must target package parts`,
        }),
      );
    }
    return issues;
  }

  if (type === "hyperlink") {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.targetMode`,
        message: "hyperlink relationships must target external URLs",
      }),
    );
    return issues;
  }

  if (!expectedKinds) {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.type`,
        message: `unsupported internal relationship type ${type}`,
      }),
    );
    return issues;
  }

  const targetPartId = input.relationship.targetPartId;
  if (typeof targetPartId !== "string" || targetPartId.length === 0) {
    return issues;
  }

  const targetPart = input.partsById.get(targetPartId);
  if (!targetPart) {
    return issues;
  }

  if (!expectedKinds.some((kind) => kind === targetPart.kind)) {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.targetPartId`,
        message: `${type} relationship cannot target ${targetPart.kind}`,
      }),
    );
  }

  const documentKind = documentPropertiesKind(targetPart);
  if (type === "coreProperties" && documentKind !== undefined && documentKind !== "core") {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.targetPartId`,
        message: "coreProperties relationship must target core document properties",
      }),
    );
  }
  if (type === "extendedProperties" && documentKind !== undefined && documentKind !== "extended") {
    issues.push(
      input.diagnosticFor({
        path: `${input.path}.targetPartId`,
        message: "extendedProperties relationship must target extended document properties",
      }),
    );
  }

  return issues;
}

function isValidRelationshipId(value: unknown): value is string {
  return typeof value === "string" && RELATIONSHIP_ID_PATTERN.test(value);
}

function validateRelationshipsPayload(input: {
  part: PptxPackagePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload;

  if (!isRecord(payload) || !Array.isArray(payload.relationships)) {
    return [manifestPayloadDiagnostic({ path, message: "invalid relationships payload" })];
  }

  const issues: Diagnostic[] = [];
  const ownerFamily = relationshipOwnerFamily(input.part);
  const ownerPath = relationshipOwnerPath(normalizedPartPath(input.part.path));
  const seenIds = new Set<string>();
  payload.relationships.forEach((relationship, index) => {
    const relationshipPath = `${path}.relationships.${index}`;
    if (!isRecord(relationship)) {
      issues.push(
        manifestPayloadDiagnostic({
          path: relationshipPath,
          message: "invalid relationship record",
        }),
      );
      return;
    }

    if (!isValidRelationshipId(relationship.id)) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.id`,
          message: "invalid relationship id",
        }),
      );
    } else if (seenIds.has(relationship.id)) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.id`,
          message: `duplicate relationship id ${relationship.id}`,
        }),
      );
    } else {
      seenIds.add(relationship.id);
    }
    if (!isValidRelationshipType(relationship.type)) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.type`,
          message: "invalid relationship type",
        }),
      );
    }
    if (typeof relationship.target !== "string" || relationship.target.length === 0) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.target`,
          message: "invalid relationship target",
        }),
      );
    }
    if (
      typeof relationship.targetPath !== "string" ||
      (relationship.targetMode !== "external" &&
        !isCanonicalPackagePartPath(relationship.targetPath)) ||
      (relationship.targetMode === "external" &&
        !isSupportedExternalRelationshipTarget(relationship.targetPath))
    ) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.targetPath`,
          message: "invalid relationship target path",
        }),
      );
    }
    if (
      ownerPath !== undefined &&
      typeof relationship.target === "string" &&
      typeof relationship.targetPath === "string" &&
      relationship.targetPath.length > 0 &&
      (relationship.targetMode === "external" ||
        isCanonicalPackagePartPath(relationship.targetPath)) &&
      relationship.target !==
        projectedRelationshipTarget({
          ownerPath,
          targetMode: relationship.targetMode === "external" ? "external" : undefined,
          targetPath: relationship.targetPath,
        })
    ) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.target`,
          message: "relationship target must match projected relationship target path",
        }),
      );
    }
    if (relationship.targetMode !== undefined && relationship.targetMode !== "external") {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.targetMode`,
          message: "invalid relationship target mode",
        }),
      );
    }
    if (
      relationship.targetMode !== "external" &&
      (typeof relationship.targetPartId !== "string" ||
        !PACKAGE_PART_ID_PATTERN.test(relationship.targetPartId))
    ) {
      issues.push(
        manifestPayloadDiagnostic({
          path: `${relationshipPath}.targetPartId`,
          message: "invalid relationship target part id",
        }),
      );
    }

    issues.push(
      ...validateRelationshipSemantics({
        relationship,
        ownerFamily,
        path: relationshipPath,
        partsById: input.partsById,
        diagnosticFor: manifestPayloadDiagnostic,
      }),
    );
  });

  return issues;
}

function validateRelationshipPayloadConsistency(input: {
  part: PptxPackagePart;
}): Diagnostics["items"] {
  if (input.part.kind !== "relationships") {
    return [];
  }

  if (!Array.isArray(input.part.relationships) || !isRelationshipsPayload(input.part.payload)) {
    return [];
  }

  if (stableJson(input.part.relationships) === stableJson(input.part.payload.relationships)) {
    return [];
  }

  return [
    diagnostic({
      severity: "error",
      code: "E_PPTX_PACKAGE_RELATIONSHIP_PAYLOAD_MISMATCH",
      title: "pptx relationship metadata and payload disagree",
      message:
        "Relationship package parts must keep part.relationships and payload.relationships synchronized so inspection, fingerprints, support XML, and package XML consume the same relationship records.",
      labels: [
        {
          path: `projection.parts.${input.part.id}.relationships`,
          message: "relationship metadata does not match payload.relationships",
        },
        {
          path: `projection.parts.${input.part.id}.payload.relationships`,
          message: "relationship payload does not match part.relationships",
        },
      ],
    }),
  ];
}

function validateRootRelationships(input: {
  part: PptxPackagePart;
  parts: readonly PptxPackagePart[];
}): Diagnostics["items"] {
  if (normalizedPartPath(input.part.path) !== "_rels/.rels") {
    return [];
  }

  const issues: Diagnostic[] = [];
  const relationships = relationshipRecords(input.part);
  const requiredTargets = [
    {
      type: "officeDocument",
      targetPart: input.parts.find((part) => part.kind === "presentation"),
      message: "Root relationships require a projected officeDocument relationship.",
    },
    {
      type: "coreProperties",
      targetPart: documentPropertiesPart(input.parts, "core"),
      message: "Root relationships require a projected coreProperties relationship.",
    },
    {
      type: "extendedProperties",
      targetPart: documentPropertiesPart(input.parts, "extended"),
      message: "Root relationships require a projected extendedProperties relationship.",
    },
  ] as const;

  requiredTargets.forEach((target) => {
    if (
      target.targetPart &&
      !relationshipExists(relationships, {
        type: target.type,
        targetPartId: target.targetPart.id,
      })
    ) {
      issues.push(
        missingRequiredRelationshipDiagnostic({
          ownerPart: input.part,
          message: target.message,
          type: target.type,
          targetPartId: target.targetPart.id,
        }),
      );
    }
  });

  return issues;
}

function validatePresentationRelationships(input: {
  part: PptxPackagePart;
  parts: readonly PptxPackagePart[];
  relationships: readonly PptxRelationship[];
}): Diagnostics["items"] {
  const issues: Diagnostic[] = [];
  const slideMaster = input.parts.find((candidate) => candidate.kind === "slide-master");

  if (
    slideMaster &&
    !relationshipExists(input.relationships, { type: "slideMaster", targetPartId: slideMaster.id })
  ) {
    issues.push(
      missingRequiredRelationshipDiagnostic({
        ownerPart: input.part,
        message: "Presentation XML requires a projected slideMaster relationship id.",
        type: "slideMaster",
        targetPartId: slideMaster.id,
      }),
    );
  }

  const slideMasterThemeIds = new Set(
    input.parts.flatMap((candidate) =>
      candidate.kind === "slide-master" && isSlideMasterPayload(candidate.payload)
        ? [candidate.payload.themePartId]
        : [],
    ),
  );
  slideMasterThemeIds.forEach((themePartId) => {
    if (!relationshipExists(input.relationships, { type: "theme", targetPartId: themePartId })) {
      issues.push(
        missingRequiredRelationshipDiagnostic({
          ownerPart: input.part,
          message: "Presentation relationships require projected theme relationship ids.",
          type: "theme",
          targetPartId: themePartId,
        }),
      );
    }
  });

  input.parts.forEach((candidate) => {
    if (
      candidate.kind === "view-properties" &&
      !relationshipExists(input.relationships, {
        type: "viewProperties",
        targetPartId: candidate.id,
      })
    ) {
      issues.push(
        missingRequiredRelationshipDiagnostic({
          ownerPart: input.part,
          message: "Presentation relationships require a projected viewProperties relationship id.",
          type: "viewProperties",
          targetPartId: candidate.id,
        }),
      );
    }

    if (
      candidate.kind === "presentation-properties" &&
      !relationshipExists(input.relationships, {
        type: "presentationProperties",
        targetPartId: candidate.id,
      })
    ) {
      issues.push(
        missingRequiredRelationshipDiagnostic({
          ownerPart: input.part,
          message:
            "Presentation relationships require a projected presentationProperties relationship id.",
          type: "presentationProperties",
          targetPartId: candidate.id,
        }),
      );
    }

    if (
      candidate.kind === "table-styles" &&
      !relationshipExists(input.relationships, {
        type: "tableStyles",
        targetPartId: candidate.id,
      })
    ) {
      issues.push(
        missingRequiredRelationshipDiagnostic({
          ownerPart: input.part,
          message: "Presentation relationships require a projected tableStyles relationship id.",
          type: "tableStyles",
          targetPartId: candidate.id,
        }),
      );
    }
  });

  if (isPresentationPayload(input.part.payload)) {
    input.part.payload.slidePartIds.forEach((slidePartId) => {
      if (!relationshipExists(input.relationships, { type: "slide", targetPartId: slidePartId })) {
        issues.push(
          missingRequiredRelationshipDiagnostic({
            ownerPart: input.part,
            message: "Presentation XML requires a projected slide relationship id.",
            type: "slide",
            targetPartId: slidePartId,
          }),
        );
      }
    });
  }

  return issues;
}

function validateSlideMasterRelationships(input: {
  part: PptxPackagePart;
  payload: PptxSlideMasterPartPayload;
  relationships: readonly PptxRelationship[];
}): Diagnostics["items"] {
  const issues: Diagnostic[] = [];

  input.payload.slideLayoutPartIds.forEach((slideLayoutPartId) => {
    if (
      !relationshipExists(input.relationships, {
        type: "slideLayout",
        targetPartId: slideLayoutPartId,
      })
    ) {
      issues.push(
        missingRequiredRelationshipDiagnostic({
          ownerPart: input.part,
          message: "Slide master XML requires projected slideLayout relationship ids.",
          type: "slideLayout",
          targetPartId: slideLayoutPartId,
        }),
      );
    }
  });

  if (
    !relationshipExists(input.relationships, {
      type: "theme",
      targetPartId: input.payload.themePartId,
    })
  ) {
    issues.push(
      missingRequiredRelationshipDiagnostic({
        ownerPart: input.part,
        message: "Slide master XML requires a projected theme relationship id.",
        type: "theme",
        targetPartId: input.payload.themePartId,
      }),
    );
  }

  return issues;
}

function validateSlideLayoutRelationships(input: {
  part: PptxPackagePart;
  payload: PptxSlideLayoutPartPayload;
  relationships: readonly PptxRelationship[];
}): Diagnostics["items"] {
  if (
    relationshipExists(input.relationships, {
      type: "slideMaster",
      targetPartId: input.payload.slideMasterPartId,
    })
  ) {
    return [];
  }

  return [
    missingRequiredRelationshipDiagnostic({
      ownerPart: input.part,
      message: "Slide layout XML requires a projected slideMaster relationship id.",
      type: "slideMaster",
      targetPartId: input.payload.slideMasterPartId,
    }),
  ];
}

function validateOwnerRelationshipPartConsistency(input: {
  ownerPart: PptxPackagePart;
  relationshipPart: PptxPackagePart;
}): Diagnostics["items"] {
  const relationshipPartRelationships = relationshipRecords(input.relationshipPart);
  if (!Array.isArray(input.ownerPart.relationships)) {
    if (
      relationshipPartRelationships.length === 0 ||
      input.ownerPart.category !== "authored-content"
    ) {
      return [];
    }

    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH",
        title: "pptx owner relationships and relationship part disagree",
        message:
          "Owner package part relationship metadata and the corresponding .rels package part must stay synchronized so slide/support XML, package XML, inspection, and fingerprints consume the same relationship records.",
        labels: [
          {
            path: `projection.parts.${input.ownerPart.id}.relationships`,
            message: "owner relationship metadata is missing",
          },
          {
            path: `projection.parts.${input.relationshipPart.id}.payload.relationships`,
            message: "relationship package part payload does not match owner relationships",
          },
        ],
      }),
    ];
  }

  if (stableJson(input.ownerPart.relationships) === stableJson(relationshipPartRelationships)) {
    return [];
  }

  return [
    diagnostic({
      severity: "error",
      code: "E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH",
      title: "pptx owner relationships and relationship part disagree",
      message:
        "Owner package part relationship metadata and the corresponding .rels package part must stay synchronized so slide/support XML, package XML, inspection, and fingerprints consume the same relationship records.",
      labels: [
        {
          path: `projection.parts.${input.ownerPart.id}.relationships`,
          message: "owner relationship metadata does not match relationship package part",
        },
        {
          path: `projection.parts.${input.relationshipPart.id}.payload.relationships`,
          message: "relationship package part payload does not match owner relationships",
        },
      ],
    }),
  ];
}

function validateImageSource(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [mediaPayloadDiagnostic({ path: input.path, message: "invalid media source" })];
  }

  if (input.value.kind === "path") {
    return typeof input.value.path === "string" && input.value.path.length > 0
      ? []
      : [mediaPayloadDiagnostic({ path: `${input.path}.path`, message: "invalid media path" })];
  }

  if (input.value.kind === "data") {
    return typeof input.value.data === "string" && input.value.data.length > 0
      ? []
      : [mediaPayloadDiagnostic({ path: `${input.path}.data`, message: "invalid media data" })];
  }

  if (input.value.kind === "url") {
    return typeof input.value.url === "string" && input.value.url.length > 0
      ? []
      : [mediaPayloadDiagnostic({ path: `${input.path}.url`, message: "invalid media url" })];
  }

  return [
    mediaPayloadDiagnostic({ path: `${input.path}.kind`, message: "invalid media source kind" }),
  ];
}

function validateStringList(input: {
  path: string;
  value: unknown;
  label: string;
}): Diagnostics["items"] {
  if (!Array.isArray(input.value)) {
    return [mediaPayloadDiagnostic({ path: input.path, message: `invalid ${input.label}` })];
  }

  const seen = new Set<string>();
  const issues: Diagnostic[] = [];
  input.value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${input.path}.${index}`,
          message: `invalid ${input.label} entry`,
        }),
      );
      return;
    }

    if (seen.has(item)) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${input.path}.${index}`,
          message: `duplicate ${input.label} entry ${item}`,
        }),
      );
      return;
    }
    seen.add(item);
  });

  return issues;
}

function validateMediaMetadata(input: { path: string; value: unknown }): Diagnostics["items"] {
  if (!isRecord(input.value)) {
    return [mediaPayloadDiagnostic({ path: input.path, message: "invalid media metadata" })];
  }

  const issues: Diagnostic[] = [];
  const metadata = input.value;
  (["mediaType", "extension", "hash"] as const).forEach((key) => {
    const value = metadata[key];
    if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${input.path}.${key}`,
          message: `invalid media metadata ${key}`,
        }),
      );
    }
  });

  (["widthPx", "heightPx"] as const).forEach((key) => {
    const value = metadata[key];
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    ) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${input.path}.${key}`,
          message: `invalid media metadata ${key}`,
        }),
      );
    }
  });

  const byteLength = metadata.byteLength;
  if (
    byteLength !== undefined &&
    (typeof byteLength !== "number" || !Number.isFinite(byteLength) || byteLength < 0)
  ) {
    issues.push(
      mediaPayloadDiagnostic({
        path: `${input.path}.byteLength`,
        message: "invalid media metadata byteLength",
      }),
    );
  }

  return issues;
}

function imageSourceKeyForValidation(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.kind === "path" && typeof value.path === "string" && value.path.length > 0) {
    return `path:${value.path}`;
  }
  if (value.kind === "data" && typeof value.data === "string" && value.data.length > 0) {
    return `data:${value.data}`;
  }
  if (value.kind === "url" && typeof value.url === "string" && value.url.length > 0) {
    return `url:${value.url}`;
  }
  return undefined;
}

function validatePrimaryValueInList(input: {
  path: string;
  listPath: string;
  value: string | undefined;
  values: readonly string[] | undefined;
  label: string;
}): Diagnostics["items"] {
  if (!input.value || !input.values || input.values.includes(input.value)) {
    return [];
  }

  return [
    mediaPayloadDiagnostic({
      path: input.listPath,
      message: `${input.label} list does not include primary value ${input.value}`,
    }),
  ];
}

function validatePrimarySourceInSources(input: {
  path: string;
  source: unknown;
  sources: unknown;
}): Diagnostics["items"] {
  if (!Array.isArray(input.sources)) {
    return [];
  }

  const primaryKey = imageSourceKeyForValidation(input.source);
  if (!primaryKey) {
    return [];
  }

  const seen = new Set<string>();
  const issues: Diagnostic[] = [];
  let includesPrimary = false;
  input.sources.forEach((source, index) => {
    const key = imageSourceKeyForValidation(source);
    if (!key) {
      return;
    }
    if (key === primaryKey) {
      includesPrimary = true;
    }
    if (seen.has(key)) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${input.path}.${index}`,
          message: "duplicate media source entry",
        }),
      );
      return;
    }
    seen.add(key);
  });

  if (!includesPrimary) {
    issues.push(
      mediaPayloadDiagnostic({
        path: input.path,
        message: "media sources do not include primary source",
      }),
    );
  }

  return issues;
}

function mediaMetadataRecord(
  payload: Partial<PptxMediaPartPayload>,
): Record<string, unknown> | undefined {
  return isRecord(payload.metadata) ? payload.metadata : undefined;
}

function normalizedMetadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.toLowerCase() : undefined;
}

function validateVideoMediaCompatibility(input: {
  path: string;
  pathExtension: string | undefined;
  payload: Partial<PptxMediaPartPayload>;
  metadata: Record<string, unknown> | undefined;
}): Diagnostics["items"] {
  if (input.payload.mediaKind !== "video") {
    return [];
  }

  const mediaType = normalizedMetadataString(input.metadata?.mediaType)?.split(";")[0]?.trim();
  const extension = normalizedMetadataString(input.metadata?.extension ?? input.pathExtension);
  const issues: Diagnostic[] = [];

  if (mediaType !== undefined && mediaType !== "video/mp4") {
    issues.push(
      unsupportedVideoMediaDiagnostic({
        path: `${input.path}.metadata.mediaType`,
        message: "video media type is outside the initial pptx compatibility target",
        mediaType,
        ...(extension ? { extension } : {}),
      }),
    );
  }

  if (extension !== undefined && extension !== "mp4") {
    const extensionPath =
      input.metadata?.extension !== undefined
        ? `${input.path}.metadata.extension`
        : input.path.replace(/\.payload$/, ".path");
    issues.push(
      unsupportedVideoMediaDiagnostic({
        path: extensionPath,
        message: "video media extension is outside the initial pptx compatibility target",
        ...(mediaType ? { mediaType } : {}),
        extension,
      }),
    );
  }

  if (mediaType === undefined && extension === undefined) {
    issues.push(
      unsupportedVideoMediaDiagnostic({
        path: input.path,
        message: "video media type and extension could not be inferred",
      }),
    );
  }

  return issues;
}

function validateMediaPayloadConsistency(input: {
  part: PptxPackagePart;
  payload: Partial<PptxMediaPartPayload>;
  contentTypesPart?: PptxPackagePart;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const metadata = mediaMetadataRecord(input.payload);
  const issues: Diagnostic[] = [];
  const pathExtension = packagePartExtension(input.part);
  const metadataExtension = metadata?.extension;

  if (
    input.payload.mediaKind !== undefined &&
    input.payload.mediaKind !== "image" &&
    input.payload.mediaKind !== "video"
  ) {
    issues.push(
      mediaPayloadDiagnostic({
        path: `${path}.mediaKind`,
        message: "invalid media kind",
      }),
    );
  }

  if (
    pathExtension &&
    typeof metadataExtension === "string" &&
    metadataExtension.toLowerCase() !== pathExtension
  ) {
    issues.push(
      mediaPayloadDiagnostic({
        path: `${path}.metadata.extension`,
        message: `media metadata extension does not match package path extension ${pathExtension}`,
      }),
    );
  }

  if (
    pathExtension &&
    input.contentTypesPart &&
    isContentTypesPayload(input.contentTypesPart.payload)
  ) {
    const contentType = contentTypeDefaultMap(input.contentTypesPart.payload).get(pathExtension);
    if (
      contentType !== undefined &&
      typeof metadata?.mediaType === "string" &&
      metadata.mediaType !== contentType
    ) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${path}.metadata.mediaType`,
          message: `media metadata type does not match manifest default ${contentType}`,
        }),
      );
    }
  }

  if (typeof metadata?.hash === "string" && metadata.hash.length > 0) {
    const allocationKey = input.payload.allocationKey;
    if (
      typeof allocationKey === "string" &&
      allocationKey.length > 0 &&
      !allocationKey.startsWith(`hash:${metadata.hash}:`) &&
      !allocationKey.startsWith(`${input.payload.mediaKind ?? "image"}:hash:${metadata.hash}:`)
    ) {
      issues.push(
        mediaPayloadDiagnostic({
          path: `${path}.allocationKey`,
          message: "media allocation key does not include metadata hash",
        }),
      );
    }
  }

  issues.push(
    ...validatePrimarySourceInSources({
      path: `${path}.sources`,
      source: input.payload.source,
      sources: input.payload.sources,
    }),
  );

  issues.push(
    ...validatePrimaryValueInList({
      path: `${path}.elementId`,
      listPath: `${path}.elementIds`,
      value: input.payload.elementId,
      values: input.payload.elementIds,
      label: "media element id",
    }),
  );

  issues.push(
    ...validatePrimaryValueInList({
      path: `${path}.assetEntityId`,
      listPath: `${path}.assetEntityIds`,
      value: input.payload.assetEntityId,
      values: input.payload.assetEntityIds,
      label: "media asset id",
    }),
  );

  issues.push(
    ...validateVideoMediaCompatibility({
      path,
      pathExtension,
      payload: input.payload,
      metadata,
    }),
  );

  return issues;
}

function validateMediaPayload(input: {
  part: PptxPackagePart;
  contentTypesPart?: PptxPackagePart;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload as Partial<PptxMediaPartPayload> | undefined;

  if (!isRecord(payload)) {
    return [mediaPayloadDiagnostic({ path, message: "invalid media payload" })];
  }

  const issues: Diagnostic[] = [
    ...validateImageSource({ path: `${path}.source`, value: payload.source }),
  ];

  if (!Array.isArray(payload.sources) || payload.sources.length === 0) {
    issues.push(
      mediaPayloadDiagnostic({ path: `${path}.sources`, message: "invalid media sources" }),
    );
  } else {
    payload.sources.forEach((source, index) => {
      issues.push(...validateImageSource({ path: `${path}.sources.${index}`, value: source }));
    });
  }

  if (
    payload.elementId !== undefined &&
    (typeof payload.elementId !== "string" || payload.elementId.length === 0)
  ) {
    issues.push(
      mediaPayloadDiagnostic({ path: `${path}.elementId`, message: "invalid media element id" }),
    );
  }
  if (payload.elementIds !== undefined) {
    issues.push(
      ...validateStringList({
        path: `${path}.elementIds`,
        value: payload.elementIds,
        label: "media element ids",
      }),
    );
  }
  if (
    payload.assetEntityId !== undefined &&
    (typeof payload.assetEntityId !== "string" || payload.assetEntityId.length === 0)
  ) {
    issues.push(
      mediaPayloadDiagnostic({ path: `${path}.assetEntityId`, message: "invalid media asset id" }),
    );
  }
  if (payload.assetEntityIds !== undefined) {
    issues.push(
      ...validateStringList({
        path: `${path}.assetEntityIds`,
        value: payload.assetEntityIds,
        label: "media asset ids",
      }),
    );
  }
  if (
    payload.allocationKey !== undefined &&
    (typeof payload.allocationKey !== "string" || payload.allocationKey.length === 0)
  ) {
    issues.push(
      mediaPayloadDiagnostic({
        path: `${path}.allocationKey`,
        message: "invalid media allocation key",
      }),
    );
  }
  if (payload.metadata !== undefined) {
    issues.push(...validateMediaMetadata({ path: `${path}.metadata`, value: payload.metadata }));
  }
  issues.push(
    ...validateMediaPayloadConsistency({
      part: input.part,
      payload,
      contentTypesPart: input.contentTypesPart,
    }),
  );

  return issues;
}

function collectSlideDrawingElementIdSet(parts: readonly PptxPackagePart[]): ReadonlySet<string> {
  const entries: DrawingElementIdEntry[] = [];
  parts.forEach((part) => {
    if (part.kind !== "slide" || !isRecord(part.payload)) {
      return;
    }

    const drawing = part.payload.drawing;
    if (!isRecord(drawing) || !Array.isArray(drawing.children)) {
      return;
    }

    drawing.children.forEach((element, index) => {
      collectDrawingElementIds({
        element,
        path: `projection.parts.${part.id}.payload.drawing.children.${index}`,
        entries,
      });
    });
  });

  return new Set(entries.map((entry) => entry.elementId));
}

function collectSlideDrawingAssetEntityIdSet(
  parts: readonly PptxPackagePart[],
): ReadonlySet<string> {
  const entries: DrawingAssetEntityIdEntry[] = [];
  parts.forEach((part) => {
    if (part.kind !== "slide" || !isRecord(part.payload)) {
      return;
    }

    const drawing = part.payload.drawing;
    if (!isRecord(drawing) || !Array.isArray(drawing.children)) {
      return;
    }

    drawing.children.forEach((element, index) => {
      collectDrawingAssetEntityIds({
        element,
        path: `projection.parts.${part.id}.payload.drawing.children.${index}`,
        entries,
      });
    });
  });

  return new Set(entries.map((entry) => entry.assetEntityId));
}

function validateMediaPayloadElementReferences(input: {
  part: PptxPackagePart;
  drawingElementIds: ReadonlySet<string>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload as Partial<PptxMediaPartPayload> | undefined;
  if (!isRecord(payload)) {
    return [];
  }

  const issues: Diagnostic[] = [];
  if (
    typeof payload.elementId === "string" &&
    payload.elementId.length > 0 &&
    !input.drawingElementIds.has(payload.elementId)
  ) {
    issues.push(
      mediaPayloadDiagnostic({
        path: `${path}.elementId`,
        message: `media element id does not reference a projected drawing element ${payload.elementId}`,
      }),
    );
  }

  if (Array.isArray(payload.elementIds)) {
    payload.elementIds.forEach((elementId, index) => {
      if (
        typeof elementId === "string" &&
        elementId.length > 0 &&
        !input.drawingElementIds.has(elementId)
      ) {
        issues.push(
          mediaPayloadDiagnostic({
            path: `${path}.elementIds.${index}`,
            message: `media element id does not reference a projected drawing element ${elementId}`,
          }),
        );
      }
    });
  }

  return issues;
}

function validateMediaPayloadAssetReferences(input: {
  part: PptxPackagePart;
  drawingAssetEntityIds: ReadonlySet<string>;
}): Diagnostics["items"] {
  const path = `projection.parts.${input.part.id}.payload`;
  const payload = input.part.payload as Partial<PptxMediaPartPayload> | undefined;
  if (!isRecord(payload)) {
    return [];
  }

  const issues: Diagnostic[] = [];
  if (
    typeof payload.assetEntityId === "string" &&
    payload.assetEntityId.length > 0 &&
    !input.drawingAssetEntityIds.has(payload.assetEntityId)
  ) {
    issues.push(
      mediaPayloadDiagnostic({
        path: `${path}.assetEntityId`,
        message: `media asset id does not reference a projected drawing origin ${payload.assetEntityId}`,
      }),
    );
  }

  if (Array.isArray(payload.assetEntityIds)) {
    payload.assetEntityIds.forEach((assetEntityId, index) => {
      if (
        typeof assetEntityId === "string" &&
        assetEntityId.length > 0 &&
        !input.drawingAssetEntityIds.has(assetEntityId)
      ) {
        issues.push(
          mediaPayloadDiagnostic({
            path: `${path}.assetEntityIds.${index}`,
            message: `media asset id does not reference a projected drawing origin ${assetEntityId}`,
          }),
        );
      }
    });
  }

  return issues;
}

function isPackagePartRequirementStatus(value: unknown): boolean {
  return value === "conditional" || value === "optional" || value === "required";
}

function isPackagePartRequirementCondition(value: unknown): boolean {
  return (
    value === "explicit" ||
    value === "hasRelationships" ||
    value === "minimalPackage" ||
    value === "referencedByRelationship"
  );
}

function isPackagePartOrderGroup(value: unknown): boolean {
  return (
    value === "contentTypes" ||
    value === "documentProperties" ||
    value === "media" ||
    value === "other" ||
    value === "presentation" ||
    value === "presentationProperties" ||
    value === "presentationRelationships" ||
    value === "rootRelationships" ||
    value === "slide" ||
    value === "slideLayout" ||
    value === "slideLayoutRelationships" ||
    value === "slideMaster" ||
    value === "slideMasterRelationships" ||
    value === "slideRelationships" ||
    value === "tableStyles" ||
    value === "theme" ||
    value === "viewProperties"
  );
}

function expectedPackagePartOrderGroup(part: PptxPackagePart): PptxPackagePartOrderKey["group"] {
  const path = normalizedPartPath(part.path);
  if (path === "[Content_Types].xml") {
    return "contentTypes";
  }
  if (path === "_rels/.rels") {
    return "rootRelationships";
  }
  if (path.startsWith("docProps/")) {
    return "documentProperties";
  }
  if (part.kind === "presentation") {
    return "presentation";
  }
  if (path === "ppt/_rels/presentation.xml.rels") {
    return "presentationRelationships";
  }
  if (part.kind === "theme") {
    return "theme";
  }
  if (part.kind === "slide-master") {
    return "slideMaster";
  }
  if (part.kind === "relationships" && path.startsWith("ppt/slideMasters/_rels/")) {
    return "slideMasterRelationships";
  }
  if (part.kind === "slide-layout") {
    return "slideLayout";
  }
  if (part.kind === "relationships" && path.startsWith("ppt/slideLayouts/_rels/")) {
    return "slideLayoutRelationships";
  }
  if (part.kind === "view-properties") {
    return "viewProperties";
  }
  if (part.kind === "presentation-properties") {
    return "presentationProperties";
  }
  if (part.kind === "table-styles") {
    return "tableStyles";
  }
  if (part.kind === "slide") {
    return "slide";
  }
  if (part.kind === "relationships" && path.startsWith("ppt/slides/_rels/")) {
    return "slideRelationships";
  }
  if (part.kind === "media") {
    return "media";
  }
  return "other";
}

function expectedRelationshipsPartCategory(
  part: PptxPackagePart,
): PptxPackagePart["category"] | undefined {
  if (part.kind !== "relationships") {
    return undefined;
  }

  const group = expectedPackagePartOrderGroup(part);
  if (group === "slideRelationships") {
    return "authored-content";
  }
  if (
    group === "rootRelationships" ||
    group === "presentationRelationships" ||
    group === "slideMasterRelationships" ||
    group === "slideLayoutRelationships"
  ) {
    return "manifest";
  }

  return undefined;
}

function validateRelationshipsPartCategory(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const expectedCategory = expectedRelationshipsPartCategory(input.part);
  if (expectedCategory === undefined || input.part.category === expectedCategory) {
    return [];
  }

  return [
    diagnostic({
      severity: "error",
      code: "E_PPTX_PACKAGE_INVALID_RELATIONSHIPS_PART_CATEGORY",
      title: "pptx relationships part category is invalid",
      message:
        "Relationship package parts must use the category that matches their package owner family.",
      labels: [
        {
          path: `projection.parts.${input.part.id}.category`,
          message: `expected ${expectedCategory} for ${normalizedPartPath(input.part.path)}`,
        },
      ],
    }),
  ];
}

function validatePartOrderKey(input: {
  part: PptxPackagePart;
  orderKey: PptxPackagePartOrderKey;
}): Diagnostics["items"] {
  const issues = [];

  if (typeof input.orderKey !== "object" || input.orderKey === null) {
    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key is invalid",
        message: "Pptx Package Model part order keys must be structured projection metadata.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey`,
            message: "invalid order key",
          },
        ],
      }),
    ];
  }

  if (!isPackagePartOrderGroup(input.orderKey.group)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key group is invalid",
        message: "Pptx Package Model part order keys must use a known package order group.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.group`,
            message: "invalid order key group",
          },
        ],
      }),
    );
  }

  const expectedGroup = expectedPackagePartOrderGroup(input.part);
  const expectedGroupOrder = PACKAGE_PART_ORDER_GROUP_ORDERS[expectedGroup];
  if (isPackagePartOrderGroup(input.orderKey.group) && input.orderKey.group !== expectedGroup) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key group does not match part",
        message:
          "Pptx Package Model order key groups must match the package part kind and package path.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.group`,
            message: `expected ${expectedGroup}`,
          },
        ],
      }),
    );
  }

  if (!Number.isFinite(input.orderKey.groupOrder) || input.orderKey.groupOrder < 0) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key group order is invalid",
        message: "Pptx Package Model part order keys must include a non-negative group order.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.groupOrder`,
            message: "invalid order key group order",
          },
        ],
      }),
    );
  } else if (input.orderKey.groupOrder !== expectedGroupOrder) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key group order does not match group",
        message:
          "Pptx Package Model order key group orders must match the projected package order group.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.groupOrder`,
            message: `expected ${expectedGroupOrder}`,
          },
        ],
      }),
    );
  }

  if (!Number.isInteger(input.orderKey.sequence) || input.orderKey.sequence < 0) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key sequence is invalid",
        message: "Pptx Package Model part order keys must include a non-negative sequence.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.sequence`,
            message: "invalid order key sequence",
          },
        ],
      }),
    );
  }

  if (input.orderKey.path !== input.part.path) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key path does not match part path",
        message:
          "Pptx Package Model part order keys must record the package path they order for inspection.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.path`,
            message: `expected ${input.part.path}`,
          },
        ],
      }),
    );
  }

  if (typeof input.orderKey.value !== "string" || input.orderKey.value.length === 0) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
        title: "pptx package part order key value is missing",
        message: "Pptx Package Model part order keys must include a stable encoded value.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.orderKey.value`,
            message: "missing order key value",
          },
        ],
      }),
    );
  } else {
    const expectedValue =
      Number.isInteger(input.orderKey.sequence) && input.orderKey.sequence >= 0
        ? `${String(expectedGroupOrder).padStart(3, "0")}:${String(input.orderKey.sequence).padStart(6, "0")}:${input.part.path}`
        : undefined;
    if (expectedValue !== undefined && input.orderKey.value !== expectedValue) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY",
          title: "pptx package part order key value does not match fields",
          message:
            "Pptx Package Model order key values must encode the projected group order, sequence, and package path.",
          labels: [
            {
              path: `projection.parts.${input.part.id}.orderKey.value`,
              message: `expected ${expectedValue}`,
            },
          ],
        }),
      );
    }
  }

  return issues;
}

function validatePartRequirement(input: {
  part: PptxPackagePart;
  requirement: PptxPackagePartRequirement;
  partIds: ReadonlySet<string>;
}): Diagnostics["items"] {
  const issues = [];

  if (!isPackagePartRequirementStatus(input.requirement.status)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx package part requirement status is invalid",
        message:
          "Pptx Package Model part requirements must use required, optional, or conditional status.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.status`,
            message: "invalid requirement status",
          },
        ],
      }),
    );
  }

  if (typeof input.requirement.required !== "boolean") {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx package part requirement evaluation is invalid",
        message: "Pptx Package Model part requirements must include an evaluated required boolean.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.required`,
            message: "missing evaluated required boolean",
          },
        ],
      }),
    );
  } else {
    if (input.requirement.status === "required" && input.requirement.required !== true) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
          title: "pptx required package part evaluation is invalid",
          message: "Required package parts must evaluate required to true.",
          labels: [
            {
              path: `projection.parts.${input.part.id}.requirement.required`,
              message: "required status must evaluate to true",
            },
          ],
        }),
      );
    }
    if (input.requirement.status === "optional" && input.requirement.required !== false) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
          title: "pptx optional package part evaluation is invalid",
          message: "Optional package parts must evaluate required to false.",
          labels: [
            {
              path: `projection.parts.${input.part.id}.requirement.required`,
              message: "optional status must evaluate to false",
            },
          ],
        }),
      );
    }
  }

  if (typeof input.requirement.reason !== "string" || input.requirement.reason.length === 0) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx package part requirement reason is missing",
        message: "Pptx Package Model part requirements must include a stable reason.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.reason`,
            message: "missing requirement reason",
          },
        ],
      }),
    );
  }

  if (
    input.requirement.condition !== undefined &&
    !isPackagePartRequirementCondition(input.requirement.condition)
  ) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx package part requirement condition is invalid",
        message: "Pptx Package Model part requirement conditions must use a known condition key.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.condition`,
            message: "invalid requirement condition",
          },
        ],
      }),
    );
  }

  if (input.requirement.status === "conditional" && !input.requirement.condition) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx package conditional requirement condition is missing",
        message:
          "Conditional Pptx Package Model part requirements must explain the evaluated condition.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.condition`,
            message: "missing conditional requirement condition",
          },
        ],
      }),
    );
  }

  if (input.requirement.status === "conditional" && input.requirement.condition === "explicit") {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx conditional package part condition is invalid",
        message:
          "Conditional Pptx Package Model requirements must name the package condition that was evaluated.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.condition`,
            message: "conditional status cannot use explicit condition",
          },
        ],
      }),
    );
  }

  if (
    input.requirement.status === "conditional" &&
    input.requirement.required === true &&
    (!Array.isArray(input.requirement.dependencies) || input.requirement.dependencies.length === 0)
  ) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
        title: "pptx conditional package part dependencies are missing",
        message:
          "Required conditional package parts must preserve the package parts that caused the condition to evaluate true.",
        labels: [
          {
            path: `projection.parts.${input.part.id}.requirement.dependencies`,
            message: "missing conditional requirement dependencies",
          },
        ],
      }),
    );
  }

  if (input.requirement.dependencies !== undefined) {
    if (!Array.isArray(input.requirement.dependencies)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
          title: "pptx package part requirement dependencies are invalid",
          message: "Pptx Package Model part requirement dependencies must be an array.",
          labels: [
            {
              path: `projection.parts.${input.part.id}.requirement.dependencies`,
              message: "invalid requirement dependencies",
            },
          ],
        }),
      );
    } else {
      const seenDependencies = new Set<string>();
      input.requirement.dependencies.forEach((dependency, index) => {
        if (!input.partIds.has(dependency)) {
          issues.push(
            diagnostic({
              severity: "error",
              code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
              title: "pptx package part requirement dependency is missing",
              message:
                "Pptx Package Model part requirement dependencies must reference existing package parts.",
              labels: [
                {
                  path: `projection.parts.${input.part.id}.requirement.dependencies`,
                  message: `missing dependency ${dependency}`,
                },
              ],
            }),
          );
        }
        if (seenDependencies.has(dependency)) {
          issues.push(
            diagnostic({
              severity: "error",
              code: "E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT",
              title: "pptx package part requirement dependency is duplicated",
              message:
                "Pptx Package Model part requirement dependencies must preserve each causal package part once.",
              labels: [
                {
                  path: `projection.parts.${input.part.id}.requirement.dependencies.${index}`,
                  message: `duplicate dependency ${dependency}`,
                },
              ],
            }),
          );
        }
        seenDependencies.add(dependency);
      });
    }
  }

  return issues;
}

function validatePartDependencyFingerprints(input: {
  part: PptxPackagePart;
  partIds: ReadonlySet<string>;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const dependencyFingerprints = input.part.dependencyFingerprints;
  if (dependencyFingerprints === undefined) {
    return [];
  }

  const path = `projection.parts.${input.part.id}.dependencyFingerprints`;
  if (!Array.isArray(dependencyFingerprints)) {
    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT",
        title: "pptx package part dependency fingerprints are invalid",
        message:
          "Pptx Package Model dependency fingerprints must be structured arrays for render-stage reuse.",
        labels: [{ path, message: "invalid dependency fingerprints" }],
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  const seen = new Set<string>();
  dependencyFingerprints.forEach((dependency, index) => {
    const dependencyPath = `${path}.${index}`;
    if (!isRecord(dependency)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT",
          title: "pptx package part dependency fingerprint is invalid",
          message: "Dependency fingerprints must be structured records.",
          labels: [{ path: dependencyPath, message: "invalid dependency fingerprint" }],
        }),
      );
      return;
    }

    if (
      typeof dependency.packagePartId !== "string" ||
      dependency.packagePartId.length === 0 ||
      !input.partIds.has(dependency.packagePartId)
    ) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT",
          title: "pptx package part dependency target is invalid",
          message: "Dependency fingerprints must reference existing package parts.",
          labels: [
            {
              path: `${dependencyPath}.packagePartId`,
              message: "invalid dependency package part id",
            },
          ],
        }),
      );
    } else if (seen.has(dependency.packagePartId)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT",
          title: "pptx package part dependency target is duplicated",
          message:
            "Dependency fingerprints must contain at most one fingerprint per dependency package part.",
          labels: [
            {
              path: `${dependencyPath}.packagePartId`,
              message: `duplicate dependency ${dependency.packagePartId}`,
            },
          ],
        }),
      );
    } else {
      seen.add(dependency.packagePartId);
    }

    if (typeof dependency.fingerprint !== "string" || dependency.fingerprint.length === 0) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT",
          title: "pptx package part dependency fingerprint is missing",
          message: "Dependency fingerprint records must include a stable non-empty fingerprint.",
          labels: [
            {
              path: `${dependencyPath}.fingerprint`,
              message: "invalid dependency fingerprint",
            },
          ],
        }),
      );
    } else if (
      typeof dependency.packagePartId === "string" &&
      input.partIds.has(dependency.packagePartId)
    ) {
      const targetPart = input.partsById.get(dependency.packagePartId);
      if (targetPart?.fingerprint && dependency.fingerprint !== targetPart.fingerprint) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT",
            title: "pptx package part dependency fingerprint is stale",
            message:
              "Dependency fingerprints must match the current fingerprint of the package part they reference.",
            labels: [
              {
                path: `${dependencyPath}.fingerprint`,
                message: `expected ${targetPart.fingerprint}`,
              },
            ],
          }),
        );
      }
    }
  });

  return issues;
}

function packageSelfDependencyDiagnostic(input: {
  part: PptxPackagePart;
  path: string;
  reason:
    | "contentTypeOverride"
    | "dependencyFingerprint"
    | "relationshipTarget"
    | "requirementDependency";
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PPTX_PACKAGE_INVALID_PACKAGE_DEPENDENCY",
    title: "pptx package part dependency is invalid",
    message:
      "Pptx Package Model package dependencies must connect distinct package parts so inspection, artifact snapshots, and HMR invalidation can explain cross-part topology.",
    labels: [
      {
        path: input.path,
        message: `${input.reason} cannot reference the owner package part ${input.part.id}`,
      },
    ],
  });
}

function validatePackagePartSelfDependencies(input: {
  part: PptxPackagePart;
  partsByPath: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const issues: Diagnostic[] = [];

  relationshipRecords(input.part).forEach((relationship, index) => {
    if (relationship.targetMode !== "external" && relationship.targetPartId === input.part.id) {
      issues.push(
        packageSelfDependencyDiagnostic({
          part: input.part,
          path: `projection.parts.${input.part.id}.relationships.${index}.targetPartId`,
          reason: "relationshipTarget",
        }),
      );
    }
  });

  if (isContentTypesPayload(input.part.payload)) {
    input.part.payload.overrides.forEach((override, index) => {
      if (!isRecord(override) || !isCanonicalContentTypePartName(override.partName)) {
        return;
      }

      const targetPart = input.partsByPath.get(normalizedPartPath(override.partName));
      if (targetPart?.id === input.part.id) {
        issues.push(
          packageSelfDependencyDiagnostic({
            part: input.part,
            path: `projection.parts.${input.part.id}.payload.overrides.${index}.partName`,
            reason: "contentTypeOverride",
          }),
        );
      }
    });
  }

  if (Array.isArray(input.part.dependencyFingerprints)) {
    input.part.dependencyFingerprints.forEach((dependency, index) => {
      if (!isRecord(dependency) || dependency.packagePartId !== input.part.id) {
        return;
      }

      issues.push(
        packageSelfDependencyDiagnostic({
          part: input.part,
          path: `projection.parts.${input.part.id}.dependencyFingerprints.${index}.packagePartId`,
          reason: "dependencyFingerprint",
        }),
      );
    });
  }

  if (Array.isArray(input.part.requirement?.dependencies)) {
    input.part.requirement.dependencies.forEach((dependency, index) => {
      if (dependency !== input.part.id) {
        return;
      }

      issues.push(
        packageSelfDependencyDiagnostic({
          part: input.part,
          path: `projection.parts.${input.part.id}.requirement.dependencies.${index}`,
          reason: "requirementDependency",
        }),
      );
    });
  }

  return issues;
}

function validatePartFingerprint(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const fingerprint = input.part.fingerprint;
  if (typeof fingerprint !== "string" || fingerprint.length === 0) {
    return [];
  }

  const expectedFingerprint = packagePartFingerprint(input.part);
  if (fingerprint === expectedFingerprint) {
    return [];
  }

  return [
    diagnostic({
      severity: "error",
      code: "E_PPTX_PACKAGE_STALE_PART_FINGERPRINT",
      title: "pptx package part fingerprint is stale",
      message:
        "Pptx Package Model part fingerprints must match the current projected package part payload and metadata before render-stage reuse can trust them.",
      labels: [
        {
          path: `projection.parts.${input.part.id}.fingerprint`,
          message: `expected ${expectedFingerprint}`,
        },
      ],
    }),
  ];
}

function validatePartRelationshipsField(input: {
  part: PptxPackagePart;
  partsById: ReadonlyMap<string, PptxPackagePart>;
}): Diagnostics["items"] {
  const relationships = input.part.relationships;
  if (relationships === undefined) {
    return [];
  }

  const path = `projection.parts.${input.part.id}.relationships`;
  if (!Array.isArray(relationships)) {
    return [partRelationshipDiagnostic({ path, message: "invalid part relationships" })];
  }

  const issues: Diagnostic[] = [];
  const ownerFamily = relationshipOwnerFamily(input.part);
  const ownerPath = relationshipOwnerPath(normalizedPartPath(input.part.path));
  const seenIds = new Set<string>();
  relationships.forEach((relationship, index) => {
    const relationshipPath = `${path}.${index}`;
    if (!isRecord(relationship)) {
      issues.push(
        partRelationshipDiagnostic({
          path: relationshipPath,
          message: "invalid relationship record",
        }),
      );
      return;
    }

    if (!isValidRelationshipId(relationship.id)) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.id`,
          message: "invalid relationship id",
        }),
      );
    } else if (seenIds.has(relationship.id)) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.id`,
          message: `duplicate relationship id ${relationship.id}`,
        }),
      );
    } else {
      seenIds.add(relationship.id);
    }

    if (!isValidRelationshipType(relationship.type)) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.type`,
          message: "invalid relationship type",
        }),
      );
    }

    if (typeof relationship.target !== "string" || relationship.target.length === 0) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.target`,
          message: "invalid relationship target",
        }),
      );
    }

    if (
      typeof relationship.targetPath !== "string" ||
      (relationship.targetMode !== "external" &&
        !isCanonicalPackagePartPath(relationship.targetPath)) ||
      (relationship.targetMode === "external" &&
        !isSupportedExternalRelationshipTarget(relationship.targetPath))
    ) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.targetPath`,
          message: "invalid relationship target path",
        }),
      );
    }

    if (
      ownerPath !== undefined &&
      typeof relationship.target === "string" &&
      typeof relationship.targetPath === "string" &&
      relationship.targetPath.length > 0 &&
      (relationship.targetMode === "external" ||
        isCanonicalPackagePartPath(relationship.targetPath)) &&
      relationship.target !==
        projectedRelationshipTarget({
          ownerPath,
          targetMode: relationship.targetMode === "external" ? "external" : undefined,
          targetPath: relationship.targetPath,
        })
    ) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.target`,
          message: "relationship target must match projected relationship target path",
        }),
      );
    }

    if (relationship.targetMode !== undefined && relationship.targetMode !== "external") {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.targetMode`,
          message: "invalid relationship target mode",
        }),
      );
    }

    if (
      relationship.targetMode !== "external" &&
      (typeof relationship.targetPartId !== "string" ||
        !PACKAGE_PART_ID_PATTERN.test(relationship.targetPartId))
    ) {
      issues.push(
        partRelationshipDiagnostic({
          path: `${relationshipPath}.targetPartId`,
          message: "invalid relationship target part id",
        }),
      );
    }

    issues.push(
      ...validateRelationshipSemantics({
        relationship,
        ownerFamily,
        path: relationshipPath,
        partsById: input.partsById,
        diagnosticFor: partRelationshipDiagnostic,
      }),
    );
  });

  return issues;
}

function validatePackagePartOrigin(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const origin = input.part.origin;
  if (origin === undefined) {
    return [];
  }

  const path = `projection.parts.${input.part.id}.origin`;
  if (!isRecord(origin)) {
    return [partOriginDiagnostic({ path, message: "invalid package part origin" })];
  }

  return [
    ...validateNonEmptyStringArray({
      value: origin.graphNodeIds,
      path: `${path}.graphNodeIds`,
      diagnosticFor: partOriginDiagnostic,
      label: "graph node ids",
    }),
    ...validateSourceOrigin({
      value: origin.source,
      path: `${path}.source`,
      diagnosticFor: partOriginDiagnostic,
    }),
  ];
}

function expectedPackagePartPathFamily(part: PptxPackagePart): string | undefined {
  const path = normalizedPartPath(part.path);
  switch (part.kind) {
    case "content-types":
      return path === "[Content_Types].xml" ? undefined : "[Content_Types].xml";
    case "document-properties": {
      const propertyKind = (part.payload as { propertyKind?: unknown } | undefined)?.propertyKind;
      if (propertyKind === "extended") {
        return path === "docProps/app.xml" ? undefined : "docProps/app.xml";
      }
      if (propertyKind === "core") {
        return path === "docProps/core.xml" ? undefined : "docProps/core.xml";
      }
      return path === "docProps/core.xml" || path === "docProps/app.xml"
        ? undefined
        : "docProps/core.xml or docProps/app.xml";
    }
    case "media":
      return MEDIA_PART_PATH_PATTERN.test(path) ? undefined : "ppt/media/*.<extension>";
    case "notes-master":
      return NOTES_MASTER_PART_PATH_PATTERN.test(path)
        ? undefined
        : "ppt/notesMasters/notesMasterN.xml";
    case "notes-slide":
      return NOTES_SLIDE_PART_PATH_PATTERN.test(path)
        ? undefined
        : "ppt/notesSlides/notesSlideN.xml";
    case "presentation":
      return path === "ppt/presentation.xml" ? undefined : "ppt/presentation.xml";
    case "presentation-properties":
      return path === "ppt/presProps.xml" ? undefined : "ppt/presProps.xml";
    case "table-styles":
      return path === "ppt/tableStyles.xml" ? undefined : "ppt/tableStyles.xml";
    case "relationships":
      return RELATIONSHIPS_PART_PATH_PATTERNS.some((pattern) => pattern.test(path))
        ? undefined
        : "_rels/.rels or known ppt/*/_rels/*.xml.rels";
    case "slide":
      return SLIDE_PART_PATH_PATTERN.test(path) ? undefined : "ppt/slides/slideN.xml";
    case "slide-layout":
      return SLIDE_LAYOUT_PART_PATH_PATTERN.test(path)
        ? undefined
        : "ppt/slideLayouts/slideLayoutN.xml";
    case "slide-master":
      return SLIDE_MASTER_PART_PATH_PATTERN.test(path)
        ? undefined
        : "ppt/slideMasters/slideMasterN.xml";
    case "theme":
      return THEME_PART_PATH_PATTERN.test(path) ? undefined : "ppt/theme/themeN.xml";
    case "view-properties":
      return path === "ppt/viewProps.xml" ? undefined : "ppt/viewProps.xml";
  }
}

function validatePackagePartPathFamily(input: { part: PptxPackagePart }): Diagnostics["items"] {
  const expected = expectedPackagePartPathFamily(input.part);
  if (expected === undefined) {
    return [];
  }

  return [
    diagnostic({
      severity: "error",
      code: "E_PPTX_PACKAGE_INVALID_PART_PATH_FAMILY",
      title: "pptx package part path family is invalid",
      message:
        "Pptx Package Model part paths must match the OOXML package family described by their part kind.",
      labels: [
        {
          path: `projection.parts.${input.part.id}.path`,
          message: `expected ${expected}, received ${normalizedPartPath(input.part.path)}`,
        },
      ],
    }),
  ];
}

function partDiagnosticPath(part: unknown, index: number): string {
  return isRecord(part) && typeof part.id === "string" && part.id.length > 0
    ? `projection.parts.${part.id}`
    : `projection.parts.${index}`;
}

function validatePackagePartBase(input: { part: unknown; index: number }): Diagnostics["items"] {
  const path = partDiagnosticPath(input.part, input.index);

  if (!isRecord(input.part)) {
    return [
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART",
        title: "pptx package part is invalid",
        message: "Pptx Package Model parts must be structured package part records.",
        labels: [{ path, message: "invalid package part" }],
      }),
    ];
  }

  const issues: Diagnostic[] = [];
  if (
    typeof input.part.id !== "string" ||
    input.part.id.length === 0 ||
    !PACKAGE_PART_ID_PATTERN.test(input.part.id)
  ) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART",
        title: "pptx package part identity is invalid",
        message: "Pptx Package Model parts must carry non-empty Package Part Identity values.",
        labels: [{ path: `${path}.id`, message: "invalid package part id" }],
      }),
    );
  }
  if (!isKnownPackagePartCategory(input.part.category)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART",
        title: "pptx package part category is invalid",
        message: "Pptx Package Model parts must use a known package part category.",
        labels: [{ path: `${path}.category`, message: "invalid package part category" }],
      }),
    );
  }
  if (!isKnownPackagePartKind(input.part.kind)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART",
        title: "pptx package part kind is invalid",
        message: "Pptx Package Model parts must use a known package part kind.",
        labels: [{ path: `${path}.kind`, message: "invalid package part kind" }],
      }),
    );
  }
  if (
    !isCompatiblePackagePartCategoryKind({
      category: input.part.category,
      kind: input.part.kind,
    })
  ) {
    const category = typeof input.part.category === "string" ? input.part.category : "unknown";
    const kind = typeof input.part.kind === "string" ? input.part.kind : "unknown";
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART",
        title: "pptx package part category-kind pairing is invalid",
        message:
          "Pptx Package Model part categories must match the package part kind they describe.",
        labels: [
          {
            path: `${path}.category`,
            message: `category ${category} is not compatible with ${kind}`,
          },
        ],
      }),
    );
  }
  if (typeof input.part.path !== "string" || !isCanonicalPackagePartPath(input.part.path)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_PPTX_PACKAGE_INVALID_PART",
        title: "pptx package part path is invalid",
        message: "Pptx Package Model parts must carry non-empty package paths.",
        labels: [{ path: `${path}.path`, message: "invalid package part path" }],
      }),
    );
  }

  return issues;
}

export function validatePptxPackageConsistency(
  projection: PptxPackageModelCandidate,
): Diagnostics["items"] {
  const parts = packagePartsFor(projection);
  const issues = [
    ...validateProjectionSize(projection),
    ...validateProjectionSlidesIndex({ projection, parts }),
  ];
  const partsById = new Map<string, PptxPackagePart>();
  const partsByPath = new Map<string, PptxPackagePart>();
  const relationshipsByOwnerPath = new Map<string, readonly PptxRelationship[]>();
  const partIds = new Set<string>();

  for (const [index, part] of parts.entries()) {
    const baseIssues = validatePackagePartBase({ part, index });
    issues.push(...baseIssues);
    if (baseIssues.length > 0) {
      continue;
    }

    issues.push(...validatePackagePartOrigin({ part }));
    issues.push(...validatePackagePartPathFamily({ part }));

    const partPath = normalizedPartPath(part.path);

    if (partIds.has(part.id)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_DUPLICATE_PART_ID",
          title: "pptx package part identity is duplicated",
          message: "Pptx Package Model parts must have unique Package Part Identity values.",
          labels: [{ path: `projection.parts.${part.id}`, message: "duplicate part id" }],
        }),
      );
      continue;
    }

    partIds.add(part.id);
    partsById.set(part.id, part);

    if (!part.requirement) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_MISSING_PART_REQUIREMENT",
          title: "pptx package part requirement is missing",
          message:
            "Pptx Package Model parts must declare whether the package entry is required, optional, or conditional.",
          labels: [
            { path: `projection.parts.${part.id}.requirement`, message: "missing requirement" },
          ],
        }),
      );
    }

    if (!part.orderKey) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_MISSING_PART_ORDER_KEY",
          title: "pptx package part order key is missing",
          message:
            "Pptx Package Model parts must carry deterministic order keys for assembly planning.",
          labels: [{ path: `projection.parts.${part.id}.orderKey`, message: "missing order key" }],
        }),
      );
    } else {
      issues.push(...validatePartOrderKey({ part, orderKey: part.orderKey }));
    }

    if (!part.fingerprint) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_MISSING_PART_FINGERPRINT",
          title: "pptx package part fingerprint is missing",
          message:
            "Pptx Package Model parts must carry fingerprints for render-stage reuse and HMR invalidation.",
          labels: [
            { path: `projection.parts.${part.id}.fingerprint`, message: "missing fingerprint" },
          ],
        }),
      );
    } else {
      issues.push(...validatePartFingerprint({ part }));
    }

    if (partsByPath.has(partPath)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_DUPLICATE_PART_PATH",
          title: "pptx package part path is duplicated",
          message: "Pptx Package Model parts must have unique normalized package paths.",
          labels: [{ path: `projection.parts.${partPath}`, message: "duplicate part path" }],
        }),
      );
      continue;
    }

    partsByPath.set(partPath, part);

    const ownerPath = relationshipOwnerPath(partPath);
    if (ownerPath && part.kind === "relationships") {
      relationshipsByOwnerPath.set(ownerPath, relationshipRecords(part));
    }
  }

  for (const requiredPath of REQUIRED_PACKAGE_PATHS) {
    if (!partsByPath.has(requiredPath)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_MISSING_REQUIRED_PART",
          title: "pptx package is missing a required part",
          message: `Pptx Package Model is missing ${requiredPath}.`,
          labels: [{ path: "projection.parts", message: `missing ${requiredPath}` }],
        }),
      );
    }
  }

  const contentTypesPart = partsByPath.get("[Content_Types].xml");
  const presentationPart = parts.find((part) => part.kind === "presentation");
  const presentationSlideCount = isPresentationPayload(presentationPart?.payload)
    ? presentationPart.payload.slidePartIds.length
    : undefined;
  const drawingElementIds = collectSlideDrawingElementIdSet(parts);
  const drawingAssetEntityIds = collectSlideDrawingAssetEntityIdSet(parts);

  for (const part of parts) {
    if (part.requirement) {
      issues.push(...validatePartRequirement({ part, requirement: part.requirement, partIds }));
    }

    issues.push(...validatePartDependencyFingerprints({ part, partIds, partsById }));
    issues.push(...validatePackagePartSelfDependencies({ part, partsByPath }));
    issues.push(...validatePartRelationshipsField({ part, partsById }));

    if (part.kind === "content-types") {
      issues.push(...validateContentTypesPayload({ part }));
    }

    if (part.kind === "relationships") {
      issues.push(...validateRelationshipsPartCategory({ part }));
      issues.push(...validateRelationshipsPayload({ part, partsById }));
      issues.push(...validateRelationshipPayloadConsistency({ part }));
      issues.push(...validateRootRelationships({ part, parts }));
      const ownerPath = relationshipOwnerPath(normalizedPartPath(part.path));
      if (ownerPath && !partsByPath.has(ownerPath)) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_ORPHAN_RELATIONSHIPS_PART",
            title: "pptx relationships part owner is missing",
            message:
              "Relationship package parts must be attached to an existing owner package part.",
            labels: [
              {
                path: `projection.parts.${part.id}.path`,
                message: `missing relationship owner ${ownerPath}`,
              },
            ],
          }),
        );
      }
      const ownerPart = ownerPath ? partsByPath.get(ownerPath) : undefined;
      if (ownerPart) {
        issues.push(
          ...validateOwnerRelationshipPartConsistency({
            ownerPart,
            relationshipPart: part,
          }),
        );
      }
    }

    if (part.kind === "media") {
      issues.push(...validateMediaPayload({ part, contentTypesPart }));
      issues.push(...validateMediaPayloadElementReferences({ part, drawingElementIds }));
      issues.push(...validateMediaPayloadAssetReferences({ part, drawingAssetEntityIds }));
    }

    relationshipRecords(part).forEach((relationship) => {
      if (relationship.targetMode === "external") {
        return;
      }

      if (!relationship.targetPartId) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_BROKEN_RELATIONSHIP",
            title: "pptx package relationship target is missing",
            message: `Relationship ${relationship.id} points to a missing package part.`,
            labels: [
              {
                path: `projection.parts.${part.id}.relationships.${relationship.id}`,
                message: "missing target part identity",
              },
            ],
          }),
        );
        return;
      }

      if (!PACKAGE_PART_ID_PATTERN.test(relationship.targetPartId)) {
        return;
      }

      const targetPart = partsById.get(relationship.targetPartId);
      if (!targetPart) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_BROKEN_RELATIONSHIP",
            title: "pptx package relationship target is missing",
            message: `Relationship ${relationship.id} points to a missing package part.`,
            labels: [
              {
                path: `projection.parts.${part.id}.relationships.${relationship.id}`,
                message: `missing target ${relationship.targetPartId}`,
              },
            ],
          }),
        );
        return;
      }

      if (
        typeof relationship.targetPath !== "string" ||
        !isCanonicalPackagePartPath(relationship.targetPath)
      ) {
        return;
      }

      if (normalizedPartPath(relationship.targetPath) !== normalizedPartPath(targetPart.path)) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_RELATIONSHIP_TARGET_PATH_MISMATCH",
            title: "pptx package relationship target path does not match target part",
            message: `Relationship ${relationship.id} targetPath does not match its target package part path.`,
            labels: [
              {
                path: `projection.parts.${part.id}.relationships.${relationship.id}.targetPath`,
                message: `expected ${targetPart.path}, received ${relationship.targetPath}`,
              },
            ],
          }),
        );
      }
    });

    if (part.kind === "presentation") {
      issues.push(...validatePresentationPayload({ part, partsById }));
    }

    if (part.kind === "presentation" && isPresentationPayload(part.payload)) {
      const relationships = relationshipsByOwnerPath.get(part.path) ?? [];
      issues.push(...validatePresentationRelationships({ part, parts, relationships }));
    }

    if (part.kind === "slide-master") {
      issues.push(...validateSlideMasterPayload({ part, partsById }));
    }

    if (part.kind === "slide-master" && isSlideMasterPayload(part.payload)) {
      const relationships = relationshipsByOwnerPath.get(part.path) ?? [];
      issues.push(
        ...validateSlideMasterRelationships({
          part,
          payload: part.payload,
          relationships,
        }),
      );
    }

    if (part.kind === "slide-layout") {
      issues.push(...validateSlideLayoutSupportPayload({ part, partsById }));
    }

    if (part.kind === "slide-layout" && isSlideLayoutPayload(part.payload)) {
      const relationships = relationshipsByOwnerPath.get(part.path) ?? [];
      issues.push(...validateSlideLayoutPayload({ part, payload: part.payload }));
      issues.push(
        ...validateSlideLayoutRelationships({
          part,
          payload: part.payload,
          relationships,
        }),
      );
    }

    if (part.kind === "document-properties") {
      issues.push(
        ...validateDocumentPropertiesPayload({ part, expectedSlideCount: presentationSlideCount }),
      );
    }

    if (part.kind === "view-properties" || part.kind === "presentation-properties") {
      issues.push(...validateEmptySupportPropertiesPayload({ part }));
    }

    if (part.kind === "table-styles") {
      issues.push(...validateTableStylesPayload({ part }));
    }

    if (part.kind === "notes-master" || part.kind === "notes-slide") {
      issues.push(...validateNotesPlaceholderPayload({ part }));
    }

    if (part.kind === "theme" && isThemePayload(part.payload)) {
      issues.push(...validateThemePayload({ part, payload: part.payload, partsById }));
    }

    if (isPptxSlidePart(part)) {
      issues.push(...validateSlidePayload({ part, partsById }));
    }

    if (!isContentTypesPayload(part.payload)) {
      continue;
    }

    issues.push(...validateContentTypeCoverage({ part, parts }));

    part.payload.overrides.forEach((override) => {
      if (!isCanonicalContentTypePartName(override.partName)) {
        return;
      }
      const targetPath = normalizedPartPath(override.partName);
      if (!partsByPath.has(targetPath)) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_BROKEN_CONTENT_TYPE_OVERRIDE",
            title: "pptx content type override target is missing",
            message: `Content type override points to a missing package part: ${override.partName}.`,
            labels: [
              {
                path: `projection.parts.${part.id}.payload.overrides`,
                message: `missing ${override.partName}`,
              },
            ],
          }),
        );
      }
    });
  }

  return issues;
}

export function validatePptxPackageModel(projection: PptxPackageModelCandidate): Diagnostics {
  return createDiagnostics(validatePptxPackageConsistency(projection));
}

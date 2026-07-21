import {
  createDiagnostics,
  diagnostic,
  type Diagnostic,
  type Diagnostics,
} from "../../diagnostics";
import type {
  PdfContentOp,
  PdfFallback,
  PdfFontResource,
  PdfImageResource,
  PdfPageModel,
  PdfRectangle,
  PdfVisualElement,
} from "./model";
import { pdfMetadataDateStringIsValid } from "./date";
import { pdfCssColorFilterTransform } from "./filter-color";
import type { PdfResourceId, PdfResourceKind } from "./identity";
import { pdfEmbeddablePngImage } from "./png";
import { pdfTextEncodingIsSupported } from "./text-encoding";
import { parseTrueTypeCodeUnitGlyphIds, trueTypeFontHasCmap } from "../../font/truetype";

type GlobalResourceDictionary = {
  readonly valid: boolean;
  readonly fonts: readonly unknown[];
  readonly images: readonly unknown[];
  readonly gradients: readonly unknown[];
};

function resourceIdFromUnknown(value: unknown, kind: PdfResourceKind): PdfResourceId | undefined {
  return isRecord(value) && resourceIdStringIsValid(value.id, kind) ? value.id : undefined;
}

function resourceIds(resources: GlobalResourceDictionary): {
  readonly fonts: ReadonlySet<PdfResourceId>;
  readonly images: ReadonlySet<PdfResourceId>;
  readonly gradients: ReadonlySet<PdfResourceId>;
} {
  return {
    fonts: new Set(
      resources.fonts
        .map((font) => resourceIdFromUnknown(font, "font"))
        .filter((id) => id !== undefined),
    ),
    images: new Set(
      resources.images
        .map((image) => resourceIdFromUnknown(image, "image"))
        .filter((id) => id !== undefined),
    ),
    gradients: new Set(
      resources.gradients
        .map((gradient) => resourceIdFromUnknown(gradient, "gradient"))
        .filter((id) => id !== undefined),
    ),
  };
}

function pageBoxIsPositive(box: unknown): boolean {
  return (
    isRecord(box) &&
    typeof box.x === "number" &&
    typeof box.y === "number" &&
    typeof box.width === "number" &&
    typeof box.height === "number" &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

function pageIndexIsValid(page: PdfPageModel["pages"][number], pageIndex: number): boolean {
  return Number.isInteger(page.index) && page.index === pageIndex;
}

function stringHasAsciiWhitespaceOrControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function documentIdIsValid(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.startsWith("pdf:document:") &&
    value.length > "pdf:document:".length &&
    !stringHasAsciiWhitespaceOrControl(value)
  );
}

function pageIdIsValid(page: PdfPageModel["pages"][number]): boolean {
  if (
    typeof page.id !== "string" ||
    !page.id.startsWith("pdf:page:") ||
    stringHasAsciiWhitespaceOrControl(page.id)
  ) {
    return false;
  }

  const suffix = page.id.slice("pdf:page:".length);
  const separatorIndex = suffix.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex === suffix.length - 1) {
    return false;
  }

  const pageIndex = Number(suffix.slice(separatorIndex + 1));
  return Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex === page.index;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnosticValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function globalResourceDictionary(value: unknown): GlobalResourceDictionary {
  if (!isRecord(value)) {
    return { valid: false, fonts: [], images: [], gradients: [] };
  }

  const gradientsAreValid = value.gradients === undefined || Array.isArray(value.gradients);
  return {
    valid: Array.isArray(value.fonts) && Array.isArray(value.images) && gradientsAreValid,
    fonts: Array.isArray(value.fonts) ? value.fonts : [],
    images: Array.isArray(value.images) ? value.images : [],
    gradients: Array.isArray(value.gradients) ? value.gradients : [],
  };
}

function modelPages(value: unknown): {
  readonly valid: boolean;
  readonly pages: readonly PdfPageModel["pages"][number][];
} {
  return Array.isArray(value) && value.length > 0
    ? { valid: true, pages: value }
    : { valid: false, pages: Array.isArray(value) ? value : [] };
}

function modelFallbacks(value: unknown): {
  readonly valid: boolean;
  readonly fallbacks: readonly unknown[];
} {
  return Array.isArray(value) ? { valid: true, fallbacks: value } : { valid: false, fallbacks: [] };
}

type PageResourceReferences = {
  readonly valid: boolean;
  readonly fonts: readonly unknown[];
  readonly images: readonly unknown[];
  readonly gradients: readonly unknown[];
};

function rectangleIsPositive(value: unknown): value is PdfRectangle {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0
  );
}

function rectangleFitsInside(container: PdfRectangle, value: PdfRectangle): boolean {
  return (
    value.x >= container.x &&
    value.y >= container.y &&
    value.x + value.width <= container.x + container.width &&
    value.y + value.height <= container.y + container.height
  );
}

function rectangleFitsInsidePageBox(pageBox: PdfRectangle, value: PdfRectangle): boolean {
  return rectangleFitsInside({ x: 0, y: 0, width: pageBox.width, height: pageBox.height }, value);
}

function pointIsValid(value: unknown): boolean {
  return isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function pageResourceReferenceIsValid(
  value: unknown,
  kind: PdfResourceKind,
): value is PdfResourceId {
  return resourceIdStringIsValid(value, kind);
}

function resourceIdStringIsValid(value: unknown, kind: PdfResourceKind): value is PdfResourceId {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  const prefix = `pdf:resource:${kind}:`;
  if (!value.startsWith(prefix) || value.length === prefix.length) {
    return false;
  }

  if (stringHasAsciiWhitespaceOrControl(value)) {
    return false;
  }

  return true;
}

function pageResourceReferences(value: unknown): PageResourceReferences {
  if (!isRecord(value)) {
    return { valid: false, fonts: [], images: [], gradients: [] };
  }

  const gradientsAreValid = value.gradients === undefined || Array.isArray(value.gradients);
  return {
    valid: Array.isArray(value.fonts) && Array.isArray(value.images) && gradientsAreValid,
    fonts: Array.isArray(value.fonts) ? value.fonts : [],
    images: Array.isArray(value.images) ? value.images : [],
    gradients: Array.isArray(value.gradients) ? value.gradients : [],
  };
}

function pageContent(value: unknown): {
  readonly valid: boolean;
  readonly content: readonly unknown[];
} {
  return Array.isArray(value) ? { valid: true, content: value } : { valid: false, content: [] };
}

function pageAnnotations(value: unknown): {
  readonly valid: boolean;
  readonly annotations: readonly unknown[];
} {
  if (value === undefined) {
    return { valid: true, annotations: [] };
  }
  return Array.isArray(value)
    ? { valid: true, annotations: value }
    : { valid: false, annotations: [] };
}

function pageVisuals(value: unknown): {
  readonly valid: boolean;
  readonly visuals: readonly unknown[];
} {
  if (value === undefined) {
    return { valid: true, visuals: [] };
  }
  return Array.isArray(value) ? { valid: true, visuals: value } : { valid: false, visuals: [] };
}

function colorIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.r === "number" &&
    typeof value.g === "number" &&
    typeof value.b === "number" &&
    Number.isFinite(value.r) &&
    Number.isFinite(value.g) &&
    Number.isFinite(value.b) &&
    value.r >= 0 &&
    value.r <= 1 &&
    value.g >= 0 &&
    value.g <= 1 &&
    value.b >= 0 &&
    value.b <= 1
  );
}

function gradientStopIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    colorIsValid(value.color) &&
    typeof value.position === "number" &&
    Number.isFinite(value.position) &&
    value.position >= 0 &&
    value.position <= 1 &&
    opacityIsValid(value.opacity)
  );
}

function fontResourceIsValid(value: unknown): value is PdfFontResource {
  return (
    isRecord(value) &&
    resourceIdStringIsValid(value.id, "font") &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    (value.family === undefined || (typeof value.family === "string" && value.family.length > 0)) &&
    (value.weight === undefined ||
      (typeof value.weight === "number" && Number.isFinite(value.weight) && value.weight > 0)) &&
    (value.style === undefined || value.style === "normal" || value.style === "italic") &&
    (value.encoding === undefined ||
      value.encoding === "win-ansi" ||
      value.encoding === "identity-h") &&
    (value.fallback === undefined || typeof value.fallback === "boolean") &&
    (value.sourceKey === undefined ||
      (typeof value.sourceKey === "string" && value.sourceKey.length > 0)) &&
    (value.data === undefined || (value.data instanceof Uint8Array && value.data.byteLength > 0))
  );
}

function gradientFillIsValid(value: unknown): boolean {
  if (!isRecord(value) || typeof value.gradientId !== "string") {
    return false;
  }

  const common =
    Array.isArray(value.stops) &&
    value.stops.length >= 2 &&
    value.stops.every(gradientStopIsValid) &&
    opacityIsValid(value.opacity);
  if (!common) {
    return false;
  }

  if (value.kind === "linear-gradient") {
    return typeof value.angle === "number" && Number.isFinite(value.angle);
  }

  return (
    value.kind === "radial-gradient" &&
    (value.shape === "circle" || value.shape === "ellipse") &&
    isRecord(value.center) &&
    Number.isFinite(value.center.x) &&
    Number.isFinite(value.center.y) &&
    isRecord(value.radius) &&
    positiveNumberIsValid(value.radius.x) &&
    positiveNumberIsValid(value.radius.y)
  );
}

function gradientResourceIsValid(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !resourceIdStringIsValid(value.id, "gradient") ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !rectangleIsPositive(value.box) ||
    !Array.isArray(value.stops) ||
    value.stops.length < 2 ||
    !value.stops.every(gradientStopIsValid)
  ) {
    return false;
  }

  if (value.kind === "linear-gradient") {
    return typeof value.angle === "number" && Number.isFinite(value.angle);
  }

  return (
    value.kind === "radial-gradient" &&
    (value.shape === "circle" || value.shape === "ellipse") &&
    isRecord(value.center) &&
    Number.isFinite(value.center.x) &&
    Number.isFinite(value.center.y) &&
    isRecord(value.radius) &&
    positiveNumberIsValid(value.radius.x) &&
    positiveNumberIsValid(value.radius.y)
  );
}

function solidFillIsValid(value: unknown): boolean {
  return isRecord(value) && colorIsValid(value.color) && opacityIsValid(value.opacity);
}

function opacityIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function positiveNumberIsValid(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function blendModeIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    value === "multiply" ||
    value === "screen" ||
    value === "overlay" ||
    value === "darken" ||
    value === "lighten" ||
    value === "color-dodge" ||
    value === "color-burn" ||
    value === "hard-light" ||
    value === "soft-light" ||
    value === "difference" ||
    value === "exclusion" ||
    value === "hue" ||
    value === "saturation" ||
    value === "color" ||
    value === "luminosity"
  );
}

function unsupportedSemanticFeatureIsValid(value: unknown): boolean {
  return (
    value === "blend" ||
    value === "background" ||
    value === "border" ||
    value === "clipping" ||
    value === "content" ||
    value === "filter" ||
    value === "image" ||
    value === "isolation" ||
    value === "layout" ||
    value === "outline" ||
    value === "opacity" ||
    value === "shadow" ||
    value === "stroke" ||
    value === "transform"
  );
}

function unsupportedFallbackStrategyIsValid(value: unknown): boolean {
  return (
    value === "axisAlignedClipWithoutTransformedMask" ||
    value === "cascadeOpacityToChildren" ||
    value === "dropBlendMode" ||
    value === "dropFilterEffect" ||
    value === "dropIsolationGroup" ||
    value === "preserveAuthoredValueOnly" ||
    value === "preserveOpacityWithoutCompositedSubtree" ||
    value === "preserveTransformWithoutStackingContext" ||
    value === "sourceRectBeforeTransform" ||
    value === "synthesizeFallbackFrame"
  );
}

function stringArrayIsValid(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function unsupportedSemanticFallbackIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    unsupportedFallbackStrategyIsValid(value.strategy) &&
    stringArrayIsValid(value.preserves) &&
    stringArrayIsValid(value.missing)
  );
}

function unsupportedSemanticIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    unsupportedSemanticFeatureIsValid(value.feature) &&
    typeof value.property === "string" &&
    value.property.length > 0 &&
    typeof value.value === "string" &&
    typeof value.reason === "string" &&
    value.reason.length > 0 &&
    (value.fallback === undefined || unsupportedSemanticFallbackIsValid(value.fallback))
  );
}

function fallbackKindIsValid(value: unknown): value is NonNullable<PdfFallback["kind"]> {
  return (
    value === "group" ||
    value === "image" ||
    value === "shape" ||
    value === "table" ||
    value === "text" ||
    value === "video"
  );
}

function radiusIsValid(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function rotationIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function optionalBooleanIsValid(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function transformIsValid(value: Record<string, unknown>): boolean {
  return (
    rotationIsValid(value.rotation) &&
    (value.rotationBox === undefined || rectangleIsPositive(value.rotationBox)) &&
    optionalBooleanIsValid(value.flipH) &&
    optionalBooleanIsValid(value.flipV)
  );
}

function clipIsValid(value: Record<string, unknown>): boolean {
  return (
    (value.clipBox === undefined || rectangleIsPositive(value.clipBox)) &&
    (value.clipShape === undefined || value.clipShape === "ellipse") &&
    (value.clipRadius === undefined ||
      (value.clipBox !== undefined &&
        value.clipShape === undefined &&
        radiusIsValid(value.clipRadius))) &&
    (value.clipShape === undefined ||
      (value.clipBox !== undefined && value.clipRadius === undefined))
  );
}

function shapeRadiusIsValid(shape: unknown, radius: unknown): boolean {
  if (shape === "roundRect") {
    return radiusIsValid(radius);
  }
  return radius === undefined;
}

function textEncodingIsValid(value: unknown): boolean {
  return value === undefined || value === "win-ansi" || value === "utf16be";
}

function stringHasUnsafeUriAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function hyperlinkUrlIsValid(value: string): boolean {
  if (stringHasUnsafeUriAscii(value)) {
    return false;
  }

  if (value.startsWith("mailto:")) {
    return value.length > "mailto:".length;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function hyperlinkIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    hyperlinkUrlIsValid(value.url) &&
    (value.tooltip === undefined || typeof value.tooltip === "string")
  );
}

function dashIsValid(value: unknown): boolean {
  return value === undefined || value === "dash" || value === "sysDot";
}

function lineCapIsValid(value: unknown): boolean {
  return value === undefined || value === "butt" || value === "round" || value === "square";
}

function lineJoinIsValid(value: unknown): boolean {
  return value === undefined || value === "bevel" || value === "miter" || value === "round";
}

function contentOpIsValid(value: unknown): value is PdfContentOp {
  if (!isRecord(value)) {
    return false;
  }
  if (!blendModeIsValid(value.blendMode)) {
    return false;
  }

  switch (value.op) {
    case "setFillColor":
      return colorIsValid(value.color);
    case "setStrokeColor":
      return colorIsValid(value.color);
    case "setLineWidth":
      return typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0;
    case "fillRect":
    case "fillEllipse":
      return (
        rectangleIsPositive(value.box) &&
        clipIsValid(value) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity)
      );
    case "fillLinearGradientEllipse":
    case "fillLinearGradientRect":
    case "fillRadialGradientEllipse":
    case "fillRadialGradientRect":
      return (
        typeof value.gradientId === "string" &&
        rectangleIsPositive(value.box) &&
        clipIsValid(value) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity)
      );
    case "fillLinearGradientRoundRect":
    case "fillRadialGradientRoundRect":
      return (
        typeof value.gradientId === "string" &&
        rectangleIsPositive(value.box) &&
        radiusIsValid(value.radius) &&
        clipIsValid(value) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity)
      );
    case "fillRoundRect":
      return (
        rectangleIsPositive(value.box) &&
        radiusIsValid(value.radius) &&
        clipIsValid(value) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity)
      );
    case "strokeRect":
    case "strokeEllipse":
      return (
        rectangleIsPositive(value.box) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity) &&
        dashIsValid(value.dash) &&
        lineCapIsValid(value.lineCap) &&
        lineJoinIsValid(value.lineJoin) &&
        (value.lineWidth === undefined ||
          (typeof value.lineWidth === "number" &&
            Number.isFinite(value.lineWidth) &&
            value.lineWidth > 0))
      );
    case "strokeRoundRect":
      return (
        rectangleIsPositive(value.box) &&
        radiusIsValid(value.radius) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity) &&
        dashIsValid(value.dash) &&
        lineCapIsValid(value.lineCap) &&
        lineJoinIsValid(value.lineJoin) &&
        (value.lineWidth === undefined ||
          (typeof value.lineWidth === "number" &&
            Number.isFinite(value.lineWidth) &&
            value.lineWidth > 0))
      );
    case "strokeLine":
      return (
        pointIsValid(value.from) &&
        pointIsValid(value.to) &&
        colorIsValid(value.color) &&
        typeof value.lineWidth === "number" &&
        Number.isFinite(value.lineWidth) &&
        value.lineWidth > 0 &&
        transformIsValid(value) &&
        dashIsValid(value.dash) &&
        lineCapIsValid(value.lineCap) &&
        lineJoinIsValid(value.lineJoin) &&
        opacityIsValid(value.opacity)
      );
    case "text":
      return (
        typeof value.text === "string" &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        (value.box === undefined || rectangleIsPositive(value.box)) &&
        textEncodingIsValid(value.textEncoding) &&
        (value.fontId === undefined || typeof value.fontId === "string") &&
        (value.fontSize === undefined ||
          (typeof value.fontSize === "number" &&
            Number.isFinite(value.fontSize) &&
            value.fontSize > 0)) &&
        (value.charSpacing === undefined ||
          (typeof value.charSpacing === "number" && Number.isFinite(value.charSpacing))) &&
        (value.textRise === undefined ||
          (typeof value.textRise === "number" && Number.isFinite(value.textRise))) &&
        (value.color === undefined || colorIsValid(value.color)) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity)
      );
    case "image":
      return (
        typeof value.imageId === "string" &&
        rectangleIsPositive(value.box) &&
        (value.clipBox === undefined || rectangleIsPositive(value.clipBox)) &&
        (value.clipRadius === undefined ||
          (value.clipBox !== undefined &&
            typeof value.clipRadius === "number" &&
            Number.isFinite(value.clipRadius) &&
            value.clipRadius >= 0)) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity)
      );
    default:
      return false;
  }
}

function paintOrderIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isFinite(value.siblingOrder) &&
    (value.zIndex === undefined || Number.isFinite(value.zIndex)) &&
    (value.sequence === undefined ||
      (typeof value.sequence === "number" &&
        Number.isFinite(value.sequence) &&
        value.sequence >= 0)) &&
    (value.generatedLayerRole === undefined ||
      value.generatedLayerRole === "authored" ||
      value.generatedLayerRole === "background" ||
      value.generatedLayerRole === "border" ||
      value.generatedLayerRole === "filter" ||
      value.generatedLayerRole === "outline" ||
      value.generatedLayerRole === "shadow") &&
    (value.generatedLayerPlacement === undefined ||
      value.generatedLayerPlacement === "aboveAuthored" ||
      value.generatedLayerPlacement === "aboveBackground")
  );
}

function imageFitIsValid(value: unknown): boolean {
  return value === undefined || value === "contain" || value === "cover" || value === "stretch";
}

function textFitIsValid(value: unknown): boolean {
  return value === undefined || value === "none" || value === "shrink" || value === "resize";
}

function textDirectionIsValid(value: unknown): boolean {
  return value === undefined || value === "horz" || value === "vert" || value === "vert270";
}

function objectPositionIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      typeof value.x === "number" &&
      Number.isFinite(value.x) &&
      typeof value.y === "number" &&
      Number.isFinite(value.y))
  );
}

function visualStyleIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.fontFamily === undefined ||
      (typeof value.fontFamily === "string" && value.fontFamily.trim().length > 0)) &&
    (value.fontSize === undefined ||
      (typeof value.fontSize === "number" &&
        Number.isFinite(value.fontSize) &&
        value.fontSize > 0)) &&
    (value.charSpacing === undefined ||
      (typeof value.charSpacing === "number" && Number.isFinite(value.charSpacing))) &&
    (value.textRise === undefined ||
      (typeof value.textRise === "number" && Number.isFinite(value.textRise))) &&
    (value.color === undefined || colorIsValid(value.color)) &&
    textDirectionIsValid(value.textDirection) &&
    textFitIsValid(value.fit) &&
    (value.wrap === undefined || typeof value.wrap === "boolean")
  );
}

function optionalIdentifierArrayIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item) => typeof item === "string" && item.trim().length > 0))
  );
}

function visualOriginIsValid(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  return (
    isRecord(value) &&
    optionalIdentifierArrayIsValid(value.graphNodeIds) &&
    optionalIdentifierArrayIsValid(value.styleEntityIds) &&
    optionalIdentifierArrayIsValid(value.assetEntityIds) &&
    (value.source === undefined || isRecord(value.source)) &&
    (value.componentProvenance === undefined || isRecord(value.componentProvenance))
  );
}

function visualElementIsValid(value: unknown, pageMediaBox: unknown): value is PdfVisualElement {
  if (!isRecord(value)) {
    return false;
  }
  if (!blendModeIsValid(value.blendMode) || !visualOriginIsValid(value.origin)) {
    return false;
  }

  switch (value.kind) {
    case "image":
      return (
        typeof value.imageId === "string" &&
        rectangleIsPositive(value.box) &&
        (value.clipBox === undefined || rectangleIsPositive(value.clipBox)) &&
        (value.clipRadius === undefined ||
          (value.clipBox !== undefined &&
            typeof value.clipRadius === "number" &&
            Number.isFinite(value.clipRadius) &&
            value.clipRadius >= 0)) &&
        imageFitIsValid(value.fit) &&
        objectPositionIsValid(value.objectPosition) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity) &&
        paintOrderIsValid(value.paintOrder)
      );
    case "line":
      return (
        pointIsValid(value.from) &&
        pointIsValid(value.to) &&
        transformIsValid(value) &&
        isRecord(value.stroke) &&
        colorIsValid(value.stroke.color) &&
        typeof value.stroke.width === "number" &&
        Number.isFinite(value.stroke.width) &&
        value.stroke.width > 0 &&
        dashIsValid(value.stroke.dash) &&
        lineCapIsValid(value.stroke.lineCap) &&
        lineJoinIsValid(value.stroke.lineJoin) &&
        opacityIsValid(value.stroke.opacity) &&
        opacityIsValid(value.opacity) &&
        paintOrderIsValid(value.paintOrder)
      );
    case "shape":
      return (
        (value.shape === "rect" || value.shape === "ellipse" || value.shape === "roundRect") &&
        rectangleIsPositive(value.box) &&
        clipIsValid(value) &&
        shapeRadiusIsValid(value.shape, value.radius) &&
        transformIsValid(value) &&
        (value.fill === undefined ||
          solidFillIsValid(value.fill) ||
          gradientFillIsValid(value.fill)) &&
        (value.stroke === undefined ||
          (isRecord(value.stroke) &&
            colorIsValid(value.stroke.color) &&
            typeof value.stroke.width === "number" &&
            Number.isFinite(value.stroke.width) &&
            value.stroke.width > 0 &&
            dashIsValid(value.stroke.dash) &&
            lineCapIsValid(value.stroke.lineCap) &&
            lineJoinIsValid(value.stroke.lineJoin) &&
            opacityIsValid(value.stroke.opacity))) &&
        opacityIsValid(value.opacity) &&
        paintOrderIsValid(value.paintOrder)
      );
    case "text":
      return (
        typeof value.text === "string" &&
        rectangleIsPositive(value.box) &&
        textEncodingIsValid(value.textEncoding) &&
        (value.hyperlink === undefined || hyperlinkIsValid(value.hyperlink)) &&
        (value.hyperlinkBox === undefined ||
          (value.hyperlink !== undefined && rectangleIsPositive(value.hyperlinkBox))) &&
        (value.hyperlink === undefined ||
          (rectangleIsPositive(pageMediaBox) &&
            rectangleFitsInsidePageBox(
              pageMediaBox,
              value.hyperlinkBox === undefined ? value.box : value.hyperlinkBox,
            ))) &&
        typeof value.fontId === "string" &&
        visualStyleIsValid(value.style) &&
        transformIsValid(value) &&
        opacityIsValid(value.opacity) &&
        paintOrderIsValid(value.paintOrder)
      );
    default:
      return false;
  }
}

function annotationIsValid(value: unknown, pageMediaBox: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.kind) {
    case "link":
      return (
        rectangleIsPositive(value.box) &&
        rectangleIsPositive(pageMediaBox) &&
        rectangleFitsInsidePageBox(pageMediaBox, value.box) &&
        hyperlinkIsValid(value)
      );
    default:
      return false;
  }
}

function imageResourceHasLoadSource(value: Readonly<Record<string, unknown>>): boolean {
  return (
    resourceIdStringIsValid(value.id, "image") &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.assetEntityId === "string" &&
    isRecord(value.source) &&
    (value.source.kind === "path" || value.source.kind === "url") &&
    (value.sourceField === "src" ||
      value.sourceField === "poster" ||
      value.sourceField === "posterData")
  );
}

function embeddablePngImageForResource(image: Partial<PdfImageResource>) {
  const colorTransform =
    typeof image.pdfColorFilter === "string"
      ? pdfCssColorFilterTransform(image.pdfColorFilter)
      : undefined;
  return image.data instanceof Uint8Array
    ? pdfEmbeddablePngImage(image.data, { colorTransform })
    : undefined;
}

function imageResourceIsEmbeddable(
  value: unknown,
  options: { readonly requireImageData: boolean },
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const mediaType =
    typeof value.mediaType === "string"
      ? value.mediaType.split(";")[0]?.trim().toLowerCase()
      : undefined;
  const hasBasicImageFields =
    resourceIdStringIsValid(value.id, "image") &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0;
  if (!hasBasicImageFields) {
    return !options.requireImageData && imageResourceHasLoadSource(value);
  }

  const hasData = value.data instanceof Uint8Array && value.data.byteLength > 0;
  if (!hasData) {
    return !options.requireImageData && imageResourceHasLoadSource(value);
  }

  if (mediaType === "image/png") {
    if (!(value.data instanceof Uint8Array)) {
      return false;
    }
    const png = embeddablePngImageForResource(value);
    return png !== undefined && png.width === value.width && png.height === value.height;
  }

  return mediaType === "image/jpeg" && hasBasicImageFields;
}

function metadataIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.author === undefined || typeof value.author === "string") &&
    (value.subject === undefined || typeof value.subject === "string") &&
    (value.producer === undefined || typeof value.producer === "string") &&
    (value.creationDate === undefined || pdfMetadataDateStringIsValid(value.creationDate)) &&
    (value.modificationDate === undefined || pdfMetadataDateStringIsValid(value.modificationDate))
  );
}

function fallbackIsValid(value: unknown): value is {
  readonly code: string;
  readonly message: string;
  readonly pageId?: string;
  readonly nodeId?: string;
  readonly kind?: NonNullable<PdfFallback["kind"]>;
} {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.pageId === undefined || typeof value.pageId === "string") &&
    (value.nodeId === undefined || typeof value.nodeId === "string") &&
    (value.kind === undefined || fallbackKindIsValid(value.kind)) &&
    visualOriginIsValid(value.origin) &&
    (value.semantic === undefined || unsupportedSemanticIsValid(value.semantic))
  );
}

function documentHeaderIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.format === "pdf" &&
    value.version === "1.7" &&
    documentIdIsValid(value.documentId)
  );
}

function invalidDocumentDiagnostic(model: unknown): Diagnostic {
  const modelRecord: Readonly<Record<string, unknown>> = isRecord(model) ? model : {};
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_DOCUMENT",
    title: "PDF document model is invalid",
    message:
      'PDF document models must declare format "pdf", version "1.7", and a non-empty document id.',
    labels: [
      {
        path: "document",
        message: diagnosticValue({
          format: modelRecord.format,
          version: modelRecord.version,
          documentId: modelRecord.documentId,
        }),
        severity: "primary",
      },
    ],
  });
}

function invalidMetadataDiagnostic(metadata: unknown): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_METADATA",
    title: "PDF document metadata is invalid",
    message:
      "PDF document metadata must be an object whose title, author, subject, producer, creationDate, and modificationDate fields are strings when present.",
    labels: [
      {
        path: "metadata",
        message: diagnosticValue(metadata),
        severity: "primary",
      },
    ],
  });
}

function invalidResourcesDiagnostic(resources: unknown): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_RESOURCES",
    title: "PDF resource dictionary is invalid",
    message:
      "PDF resource dictionaries must include font and image resource arrays, with an optional gradient resource array.",
    labels: [
      {
        path: "resources",
        message: diagnosticValue(resources),
        severity: "primary",
      },
    ],
  });
}

function invalidPagesDiagnostic(pages: unknown): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGES",
    title: "PDF pages collection is invalid",
    message: "PDF document models must include a non-empty pages array.",
    labels: [
      {
        path: "pages",
        message: diagnosticValue(pages),
        severity: "primary",
      },
    ],
  });
}

function invalidPageDiagnostic(input: {
  readonly pageIndex: number;
  readonly page: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE",
    title: "PDF page entry is invalid",
    message: "PDF pages must be object entries with page model fields.",
    labels: [
      {
        path: `pages.${input.pageIndex}`,
        message: diagnosticValue(input.page),
        severity: "primary",
      },
    ],
  });
}

function invalidPageIndexDiagnostic(input: {
  readonly pageIndex: number;
  readonly page: PdfPageModel["pages"][number];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_INDEX",
    title: "PDF page index is invalid",
    message: "PDF page indexes must be integers matching their position in the pages array.",
    labels: [
      {
        path: `pages.${input.pageIndex}.index`,
        message: diagnosticValue(input.page.index),
        severity: "primary",
      },
    ],
  });
}

function invalidPageIdDiagnostic(input: {
  readonly pageIndex: number;
  readonly page: PdfPageModel["pages"][number];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_ID",
    title: "PDF page id is invalid",
    message: "PDF page ids must be non-empty strings.",
    labels: [
      {
        path: `pages.${input.pageIndex}.id`,
        message: diagnosticValue(input.page.id),
        severity: "primary",
      },
    ],
  });
}

function invalidPageContentDiagnostic(input: {
  readonly pageIndex: number;
  readonly content: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_CONTENT",
    title: "PDF page content collection is invalid",
    message: "PDF pages must include a content operation array.",
    labels: [
      {
        path: `pages.${input.pageIndex}.content`,
        message: diagnosticValue(input.content),
        severity: "primary",
      },
    ],
  });
}

function invalidContentOpDiagnostic(input: {
  readonly pageIndex: number;
  readonly opIndex: number;
  readonly op: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_CONTENT_OP",
    title: "PDF content operation is invalid",
    message:
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    labels: [
      {
        path: `pages.${input.pageIndex}.content.${input.opIndex}`,
        message: diagnosticValue(input.op),
        severity: "primary",
      },
    ],
  });
}

function invalidVisualElementDiagnostic(input: {
  readonly pageIndex: number;
  readonly visualIndex: number;
  readonly visual: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    title: "PDF visual element is invalid",
    message:
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    labels: [
      {
        path: `pages.${input.pageIndex}.visuals.${input.visualIndex}`,
        message: diagnosticValue(input.visual),
        severity: "primary",
      },
    ],
  });
}

function invalidPageVisualsDiagnostic(input: {
  readonly pageIndex: number;
  readonly visuals: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_VISUALS",
    title: "PDF page visual collection is invalid",
    message: "PDF page visuals must be an array when present.",
    labels: [
      {
        path: `pages.${input.pageIndex}.visuals`,
        message: diagnosticValue(input.visuals),
        severity: "primary",
      },
    ],
  });
}

function invalidPageAnnotationsDiagnostic(input: {
  readonly pageIndex: number;
  readonly annotations: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_ANNOTATIONS",
    title: "PDF page annotation collection is invalid",
    message: "PDF page annotations must be an array when present.",
    labels: [
      {
        path: `pages.${input.pageIndex}.annotations`,
        message: diagnosticValue(input.annotations),
        severity: "primary",
      },
    ],
  });
}

function invalidAnnotationDiagnostic(input: {
  readonly pageIndex: number;
  readonly annotationIndex: number;
  readonly annotation: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_ANNOTATION",
    title: "PDF annotation is invalid",
    message:
      "PDF annotations must be valid link annotations with a positive box and an external URL.",
    labels: [
      {
        path: `pages.${input.pageIndex}.annotations.${input.annotationIndex}`,
        message: diagnosticValue(input.annotation),
        severity: "primary",
      },
    ],
  });
}

function unknownResourceDiagnostic(input: {
  readonly code: string;
  readonly title: string;
  readonly pageIndex: number;
  readonly resourceId: PdfResourceId;
  readonly path: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: input.code,
    title: input.title,
    message: "The PDF page model references a resource id that is not declared globally.",
    labels: [
      {
        path: input.path,
        message: `page=${input.pageIndex}, resource=${input.resourceId}`,
        severity: "primary",
      },
    ],
  });
}

function invalidPageResourceReferenceDiagnostic(input: {
  readonly pageIndex: number;
  readonly path: string;
  readonly resourceId: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_RESOURCE_REFERENCE",
    title: "PDF page resource reference is invalid",
    message: "PDF page resource references must be non-empty resource id strings.",
    labels: [
      {
        path: input.path,
        message: diagnosticValue(input.resourceId),
        severity: "primary",
      },
    ],
  });
}

function invalidPageResourcesDiagnostic(input: {
  readonly pageIndex: number;
  readonly resources: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_PAGE_RESOURCES",
    title: "PDF page resource dictionary is invalid",
    message:
      "PDF page resource dictionaries must include font and image reference arrays, with an optional gradient reference array.",
    labels: [
      {
        path: `pages.${input.pageIndex}.resources`,
        message: diagnosticValue(input.resources),
        severity: "primary",
      },
    ],
  });
}

function duplicateResourceIdDiagnostic(input: {
  readonly path: string;
  readonly resourceId: PdfResourceId;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_DUPLICATE_RESOURCE_ID",
    title: "PDF resource id is duplicated",
    message: "Each PDF resource id must be unique across the global PDF resource dictionary.",
    labels: [
      {
        path: input.path,
        message: input.resourceId,
        severity: "primary",
      },
    ],
  });
}

function missingPageResourceDiagnostic(input: {
  readonly code: string;
  readonly title: string;
  readonly pageIndex: number;
  readonly resourceId?: PdfResourceId;
  readonly path: string;
}): Diagnostic {
  const resourceMessage = input.resourceId ? `, resource=${input.resourceId}` : "";

  return diagnostic({
    severity: "error",
    code: input.code,
    title: input.title,
    message: "The PDF content operation references a resource id that is not declared on the page.",
    labels: [
      {
        path: input.path,
        message: `page=${input.pageIndex}${resourceMessage}`,
        severity: "primary",
      },
    ],
  });
}

function duplicatePageFontResourceNameDiagnostic(input: {
  readonly pageIndex: number;
  readonly resourceIndex: number;
  readonly resourceName: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_DUPLICATE_PAGE_FONT_RESOURCE_NAME",
    title: "PDF page font resource name is duplicated",
    message: "Each font resource name in a PDF page resource dictionary must be unique.",
    labels: [
      {
        path: `pages.${input.pageIndex}.resources.fonts.${input.resourceIndex}`,
        message: input.resourceName,
        severity: "primary",
      },
    ],
  });
}

function invalidFontResourceDiagnostic(input: {
  readonly resourceIndex: number;
  readonly font: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_FONT_RESOURCE",
    title: "PDF font resource is invalid",
    message:
      "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
    labels: [
      {
        path: `resources.fonts.${input.resourceIndex}`,
        message: diagnosticValue(input.font),
        severity: "primary",
      },
    ],
  });
}

function duplicatePageImageResourceNameDiagnostic(input: {
  readonly pageIndex: number;
  readonly resourceIndex: number;
  readonly resourceName: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_DUPLICATE_PAGE_IMAGE_RESOURCE_NAME",
    title: "PDF page image resource name is duplicated",
    message: "Each image resource name in a PDF page resource dictionary must be unique.",
    labels: [
      {
        path: `pages.${input.pageIndex}.resources.images.${input.resourceIndex}`,
        message: input.resourceName,
        severity: "primary",
      },
    ],
  });
}

function duplicatePageGradientResourceNameDiagnostic(input: {
  readonly pageIndex: number;
  readonly resourceIndex: number;
  readonly resourceName: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_DUPLICATE_PAGE_GRADIENT_RESOURCE_NAME",
    title: "PDF page gradient resource name is duplicated",
    message: "Each gradient resource name in a PDF page resource dictionary must be unique.",
    labels: [
      {
        path: `pages.${input.pageIndex}.resources.gradients.${input.resourceIndex}`,
        message: input.resourceName,
        severity: "primary",
      },
    ],
  });
}

function invalidGradientResourceDiagnostic(input: {
  readonly resourceIndex: number;
  readonly gradient: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_GRADIENT_RESOURCE",
    title: "PDF gradient resource is invalid",
    message:
      "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
    labels: [
      {
        path: `resources.gradients.${input.resourceIndex}`,
        message: diagnosticValue(input.gradient),
        severity: "primary",
      },
    ],
  });
}

function unembeddableImageResourceDiagnostic(input: {
  readonly resourceIndex: number;
  readonly imageId: PdfResourceId | undefined;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
    title: "PDF image resource is not embeddable",
    message:
      "PDF image resources must include supported JPEG or RGB PNG bytes, a matching mediaType, positive width and height, and a resource name.",
    labels: [
      {
        path: `resources.images.${input.resourceIndex}`,
        message: input.imageId === undefined ? "resource=<invalid>" : `resource=${input.imageId}`,
        severity: "primary",
      },
    ],
  });
}

function unsupportedTextEncodingDiagnostic(input: {
  readonly pageIndex: number;
  readonly opIndex: number;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_UNSUPPORTED_TEXT_ENCODING",
    title: "PDF text encoding is unsupported",
    message:
      'PDF text outside WinAnsiEncoding must declare textEncoding "utf16be" and use an Identity-H font resource.',
    labels: [
      {
        path: `pages.${input.pageIndex}.content.${input.opIndex}.text`,
        message: "text contains characters outside WinAnsiEncoding",
        severity: "primary",
      },
    ],
  });
}

function unsupportedTextVisualEncodingDiagnostic(input: {
  readonly pageIndex: number;
  readonly visualIndex: number;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_UNSUPPORTED_TEXT_ENCODING",
    title: "PDF text encoding is unsupported",
    message:
      'PDF text outside WinAnsiEncoding must declare textEncoding "utf16be" and use an Identity-H font resource.',
    labels: [
      {
        path: `pages.${input.pageIndex}.visuals.${input.visualIndex}.text`,
        message: "text contains characters outside WinAnsiEncoding",
        severity: "primary",
      },
    ],
  });
}

function unsupportedTextSnippet(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized;
}

function unicodeCodePointsForText(text: string): readonly number[] {
  const codePoints = new Set<number>();
  for (const character of Array.from(text)) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      codePoints.add(codePoint);
    }
  }
  return [...codePoints].sort((left, right) => left - right);
}

function missingFontGlyphText(input: {
  readonly font: PdfFontResource | undefined;
  readonly text: string;
}): string | undefined {
  if (!(input.font?.data instanceof Uint8Array) || !trueTypeFontHasCmap(input.font.data)) {
    return undefined;
  }

  const codePoints = unicodeCodePointsForText(input.text);
  const glyphIds = parseTrueTypeCodeUnitGlyphIds(input.font.data, codePoints);
  const missingCodePoints = codePoints.filter((codePoint) => !glyphIds.has(codePoint));
  return missingCodePoints.length > 0 ? String.fromCodePoint(...missingCodePoints) : undefined;
}

function fontGlyphMissingDiagnostic(input: {
  readonly pageIndex: number;
  readonly opIndex: number;
  readonly font: PdfFontResource;
  readonly text: string;
  readonly missingText: string;
}): Diagnostic {
  const snippet = unsupportedTextSnippet(input.text);
  const missing = unsupportedTextSnippet(input.missingText);
  return diagnostic({
    severity: "error",
    code: "E_PDF_UNRESOLVED_FONT_GLYPH",
    title: "PDF font glyph cannot be resolved",
    message: `PDF embedded font "${input.font.sourceKey ?? input.font.name}" for text "${snippet}" does not map "${missing}".`,
    labels: [
      {
        path: `pages.${input.pageIndex}.content.${input.opIndex}.fontId`,
        message: `missing glyphs=${missing}`,
        severity: "primary",
      },
    ],
  });
}

function fontVisualGlyphMissingDiagnostic(input: {
  readonly pageIndex: number;
  readonly visualIndex: number;
  readonly font: PdfFontResource;
  readonly text: string;
  readonly missingText: string;
}): Diagnostic {
  const snippet = unsupportedTextSnippet(input.text);
  const missing = unsupportedTextSnippet(input.missingText);
  return diagnostic({
    severity: "error",
    code: "E_PDF_UNRESOLVED_FONT_GLYPH",
    title: "PDF font glyph cannot be resolved",
    message: `PDF embedded font "${input.font.sourceKey ?? input.font.name}" for text "${snippet}" does not map "${missing}".`,
    labels: [
      {
        path: `pages.${input.pageIndex}.visuals.${input.visualIndex}.fontId`,
        message: `missing glyphs=${missing}`,
        severity: "primary",
      },
    ],
  });
}

function fallbackDiagnostic(input: {
  readonly fallbackIndex: number;
  readonly code: string;
  readonly message: string;
}): Diagnostic {
  return diagnostic({
    severity: input.code.startsWith("E_") ? "error" : "warning",
    code: input.code,
    title: input.code.startsWith("E_")
      ? "PDF font glyph cannot be resolved"
      : "PDF projection used a fallback",
    message: input.message,
    labels: [
      {
        path: `fallbacks.${input.fallbackIndex}`,
        message: input.message,
        severity: "primary",
      },
    ],
  });
}

function invalidFallbackDiagnostic(input: {
  readonly fallbackIndex: number;
  readonly fallback: unknown;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_FALLBACK",
    title: "PDF fallback entry is invalid",
    message:
      "PDF fallback entries must include non-empty string code and message fields, with an optional string page id.",
    labels: [
      {
        path: `fallbacks.${input.fallbackIndex}`,
        message: diagnosticValue(input.fallback),
        severity: "primary",
      },
    ],
  });
}

function invalidFallbacksDiagnostic(fallbacks: unknown): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_INVALID_FALLBACKS",
    title: "PDF fallback collection is invalid",
    message: "PDF document models must include a fallbacks array.",
    labels: [
      {
        path: "fallbacks",
        message: diagnosticValue(fallbacks),
        severity: "primary",
      },
    ],
  });
}

export function validatePdfPageModel(
  model: PdfPageModel,
  options: { readonly requireEmbeddedImages?: boolean } = {},
): Diagnostics {
  const issues: Diagnostic[] = [];
  const seenPageIds = new Set<string>();
  const modelRecord: Readonly<Record<string, unknown>> = isRecord(model) ? model : {};
  const globalResources = globalResourceDictionary(modelRecord.resources);
  const pages = modelPages(modelRecord.pages);
  const fallbacks = modelFallbacks(modelRecord.fallbacks);
  const resources = resourceIds(globalResources);

  if (!documentHeaderIsValid(model)) {
    issues.push(invalidDocumentDiagnostic(model));
  }
  if (!metadataIsValid(modelRecord.metadata)) {
    issues.push(invalidMetadataDiagnostic(modelRecord.metadata));
  }
  if (!globalResources.valid) {
    issues.push(invalidResourcesDiagnostic(modelRecord.resources));
  }
  if (!pages.valid) {
    issues.push(invalidPagesDiagnostic(modelRecord.pages));
  }
  if (!fallbacks.valid) {
    issues.push(invalidFallbacksDiagnostic(modelRecord.fallbacks));
  }

  const seenResourceIds = new Set<PdfResourceId>();
  globalResources.fonts.forEach((font, resourceIndex) => {
    const fontId = resourceIdFromUnknown(font, "font");
    if (fontId !== undefined && seenResourceIds.has(fontId)) {
      issues.push(
        duplicateResourceIdDiagnostic({
          path: `resources.fonts.${resourceIndex}.id`,
          resourceId: fontId,
        }),
      );
    }
    if (fontId !== undefined) {
      seenResourceIds.add(fontId);
    }
  });
  globalResources.images.forEach((image, resourceIndex) => {
    const imageId = resourceIdFromUnknown(image, "image");
    if (imageId !== undefined && seenResourceIds.has(imageId)) {
      issues.push(
        duplicateResourceIdDiagnostic({
          path: `resources.images.${resourceIndex}.id`,
          resourceId: imageId,
        }),
      );
    }
    if (imageId !== undefined) {
      seenResourceIds.add(imageId);
    }
  });
  globalResources.gradients.forEach((gradient, resourceIndex) => {
    const gradientId = resourceIdFromUnknown(gradient, "gradient");
    if (gradientId !== undefined && seenResourceIds.has(gradientId)) {
      issues.push(
        duplicateResourceIdDiagnostic({
          path: `resources.gradients.${resourceIndex}.id`,
          resourceId: gradientId,
        }),
      );
    }
    if (gradientId !== undefined) {
      seenResourceIds.add(gradientId);
    }
  });

  globalResources.fonts.forEach((font, resourceIndex) => {
    if (!fontResourceIsValid(font)) {
      issues.push(invalidFontResourceDiagnostic({ resourceIndex, font }));
    }
  });

  globalResources.images.forEach((image, resourceIndex) => {
    if (
      !imageResourceIsEmbeddable(image, {
        requireImageData: options.requireEmbeddedImages ?? false,
      })
    ) {
      issues.push(
        unembeddableImageResourceDiagnostic({
          resourceIndex,
          imageId: resourceIdFromUnknown(image, "image"),
        }),
      );
    }
  });

  globalResources.gradients.forEach((gradient, resourceIndex) => {
    if (!gradientResourceIsValid(gradient)) {
      issues.push(invalidGradientResourceDiagnostic({ resourceIndex, gradient }));
    }
  });

  fallbacks.fallbacks.forEach((fallback, fallbackIndex) => {
    if (!fallbackIsValid(fallback)) {
      issues.push(invalidFallbackDiagnostic({ fallbackIndex, fallback }));
      return;
    }
    issues.push(
      fallbackDiagnostic({
        fallbackIndex,
        code: fallback.code,
        message: fallback.message,
      }),
    );
  });

  pages.pages.forEach((page, pageIndex) => {
    if (!isRecord(page)) {
      issues.push(invalidPageDiagnostic({ pageIndex, page }));
      return;
    }

    const pageFontResourceNames = new Map<string, number>();
    const pageImageResourceNames = new Map<string, number>();
    const pageGradientResourceNames = new Map<string, number>();

    if (seenPageIds.has(page.id)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PDF_MODEL_DUPLICATE_PAGE_ID",
          title: "PDF page id is duplicated",
          message: "Each PDF page must have a stable, unique id.",
          labels: [
            {
              path: `pages.${pageIndex}.id`,
              message: diagnosticValue(page.id),
              severity: "primary",
            },
          ],
        }),
      );
    }
    seenPageIds.add(page.id);

    if (!pageIdIsValid(page)) {
      issues.push(invalidPageIdDiagnostic({ pageIndex, page }));
    }

    if (!pageIndexIsValid(page, pageIndex)) {
      issues.push(invalidPageIndexDiagnostic({ pageIndex, page }));
    }

    if (!pageBoxIsPositive(page.mediaBox)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PDF_MODEL_INVALID_PAGE_BOX",
          title: "PDF page media box is invalid",
          message: "PDF page media boxes must have finite coordinates and positive dimensions.",
          labels: [
            {
              path: `pages.${pageIndex}.mediaBox`,
              message: diagnosticValue(page.mediaBox),
              severity: "primary",
            },
          ],
        }),
      );
    }

    const pageRefs = pageResourceReferences(page.resources);
    if (!pageRefs.valid) {
      issues.push(invalidPageResourcesDiagnostic({ pageIndex, resources: page.resources }));
    }
    const pageOps = pageContent(page.content);
    if (!pageOps.valid) {
      issues.push(invalidPageContentDiagnostic({ pageIndex, content: page.content }));
    }
    const pageNotes = pageAnnotations(page.annotations);
    if (!pageNotes.valid) {
      issues.push(invalidPageAnnotationsDiagnostic({ pageIndex, annotations: page.annotations }));
    }
    const pageDrawings = pageVisuals(page.visuals);
    if (!pageDrawings.valid) {
      issues.push(invalidPageVisualsDiagnostic({ pageIndex, visuals: page.visuals }));
    }

    pageRefs.fonts.forEach((fontId, resourceIndex) => {
      if (!pageResourceReferenceIsValid(fontId, "font")) {
        issues.push(
          invalidPageResourceReferenceDiagnostic({
            pageIndex,
            resourceId: fontId,
            path: `pages.${pageIndex}.resources.fonts.${resourceIndex}`,
          }),
        );
        return;
      }
      if (!resources.fonts.has(fontId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_FONT_RESOURCE",
            title: "PDF page references an unknown font resource",
            pageIndex,
            resourceId: fontId,
            path: `pages.${pageIndex}.resources.fonts.${resourceIndex}`,
          }),
        );
      }
      const font = globalResources.fonts.find(
        (resource) => resourceIdFromUnknown(resource, "font") === fontId,
      );
      const fontName = isRecord(font) && typeof font.name === "string" ? font.name : undefined;
      if (fontName) {
        if (pageFontResourceNames.has(fontName)) {
          issues.push(
            duplicatePageFontResourceNameDiagnostic({
              pageIndex,
              resourceIndex,
              resourceName: fontName,
            }),
          );
        } else {
          pageFontResourceNames.set(fontName, resourceIndex);
        }
      }
    });
    pageRefs.images.forEach((imageId, resourceIndex) => {
      if (!pageResourceReferenceIsValid(imageId, "image")) {
        issues.push(
          invalidPageResourceReferenceDiagnostic({
            pageIndex,
            resourceId: imageId,
            path: `pages.${pageIndex}.resources.images.${resourceIndex}`,
          }),
        );
        return;
      }
      if (!resources.images.has(imageId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_IMAGE_RESOURCE",
            title: "PDF page references an unknown image resource",
            pageIndex,
            resourceId: imageId,
            path: `pages.${pageIndex}.resources.images.${resourceIndex}`,
          }),
        );
      }
      const image = globalResources.images.find(
        (resource) => resourceIdFromUnknown(resource, "image") === imageId,
      );
      const imageName = isRecord(image) && typeof image.name === "string" ? image.name : undefined;
      if (imageName) {
        if (pageImageResourceNames.has(imageName)) {
          issues.push(
            duplicatePageImageResourceNameDiagnostic({
              pageIndex,
              resourceIndex,
              resourceName: imageName,
            }),
          );
        } else {
          pageImageResourceNames.set(imageName, resourceIndex);
        }
      }
    });
    pageRefs.gradients.forEach((gradientId, resourceIndex) => {
      if (!pageResourceReferenceIsValid(gradientId, "gradient")) {
        issues.push(
          invalidPageResourceReferenceDiagnostic({
            pageIndex,
            resourceId: gradientId,
            path: `pages.${pageIndex}.resources.gradients.${resourceIndex}`,
          }),
        );
        return;
      }
      if (!resources.gradients.has(gradientId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_GRADIENT_RESOURCE",
            title: "PDF page references an unknown gradient resource",
            pageIndex,
            resourceId: gradientId,
            path: `pages.${pageIndex}.resources.gradients.${resourceIndex}`,
          }),
        );
      }
      const gradient = globalResources.gradients.find(
        (resource) => resourceIdFromUnknown(resource, "gradient") === gradientId,
      );
      const gradientName =
        isRecord(gradient) && typeof gradient.name === "string" ? gradient.name : undefined;
      if (gradientName) {
        if (pageGradientResourceNames.has(gradientName)) {
          issues.push(
            duplicatePageGradientResourceNameDiagnostic({
              pageIndex,
              resourceIndex,
              resourceName: gradientName,
            }),
          );
        } else {
          pageGradientResourceNames.set(gradientName, resourceIndex);
        }
      }
    });
    const pageFonts = new Set(pageRefs.fonts);
    const pageImages = new Set(pageRefs.images);
    const pageGradients = new Set(pageRefs.gradients);

    pageNotes.annotations.forEach((annotation, annotationIndex) => {
      if (!annotationIsValid(annotation, page.mediaBox)) {
        issues.push(invalidAnnotationDiagnostic({ pageIndex, annotationIndex, annotation }));
      }
    });

    pageDrawings.visuals.forEach((visual, visualIndex) => {
      if (!visualElementIsValid(visual, page.mediaBox)) {
        issues.push(invalidVisualElementDiagnostic({ pageIndex, visualIndex, visual }));
        return;
      }
      if (visual.kind === "text" && !resources.fonts.has(visual.fontId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_FONT_RESOURCE",
            title: "PDF visual element references an unknown font resource",
            pageIndex,
            resourceId: visual.fontId,
            path: `pages.${pageIndex}.visuals.${visualIndex}.fontId`,
          }),
        );
      }
      if (visual.kind === "text" && !pageFonts.has(visual.fontId)) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_PAGE_MISSING_FONT_RESOURCE",
            title: "PDF visual element references a font resource missing from the page",
            pageIndex,
            resourceId: visual.fontId,
            path: `pages.${pageIndex}.visuals.${visualIndex}.fontId`,
          }),
        );
      }
      if (visual.kind === "image" && !resources.images.has(visual.imageId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_IMAGE_RESOURCE",
            title: "PDF visual element references an unknown image resource",
            pageIndex,
            resourceId: visual.imageId,
            path: `pages.${pageIndex}.visuals.${visualIndex}.imageId`,
          }),
        );
      }
      if (visual.kind === "image" && !pageImages.has(visual.imageId)) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_PAGE_MISSING_IMAGE_RESOURCE",
            title: "PDF visual element references an image resource missing from the page",
            pageIndex,
            resourceId: visual.imageId,
            path: `pages.${pageIndex}.visuals.${visualIndex}.imageId`,
          }),
        );
      }
      const gradientId =
        visual.kind === "shape" && visual.fill && "gradientId" in visual.fill
          ? visual.fill.gradientId
          : undefined;
      if (typeof gradientId === "string" && !resources.gradients.has(gradientId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_GRADIENT_RESOURCE",
            title: "PDF visual element references an unknown gradient resource",
            pageIndex,
            resourceId: gradientId,
            path: `pages.${pageIndex}.visuals.${visualIndex}.fill.gradientId`,
          }),
        );
      }
      if (typeof gradientId === "string" && !pageGradients.has(gradientId)) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_PAGE_MISSING_GRADIENT_RESOURCE",
            title: "PDF visual element references a gradient resource missing from the page",
            pageIndex,
            resourceId: gradientId,
            path: `pages.${pageIndex}.visuals.${visualIndex}.fill.gradientId`,
          }),
        );
      }
      if (visual.kind === "text") {
        const textFont = globalResources.fonts.find(
          (font) => resourceIdFromUnknown(font, "font") === visual.fontId,
        ) as PdfFontResource | undefined;
        const textHasSupportedEncoding =
          pdfTextEncodingIsSupported(visual.text) ||
          (visual.textEncoding === "utf16be" && textFont?.encoding === "identity-h");
        if (!textHasSupportedEncoding) {
          issues.push(unsupportedTextVisualEncodingDiagnostic({ pageIndex, visualIndex }));
        }
        const missingText = missingFontGlyphText({ font: textFont, text: visual.text });
        if (textFont && missingText) {
          issues.push(
            fontVisualGlyphMissingDiagnostic({
              pageIndex,
              visualIndex,
              font: textFont,
              text: visual.text,
              missingText,
            }),
          );
        }
      }
    });

    pageOps.content.forEach((op, opIndex) => {
      if (!contentOpIsValid(op)) {
        issues.push(invalidContentOpDiagnostic({ pageIndex, opIndex, op }));
        return;
      }
      if (op.op === "text" && !op.fontId && pageFonts.size === 0) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_TEXT_MISSING_FONT_RESOURCE",
            title: "PDF text operation has no page font resource",
            pageIndex,
            path: `pages.${pageIndex}.content.${opIndex}`,
          }),
        );
      }
      if (op.op === "text" && op.fontId && !resources.fonts.has(op.fontId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_FONT_RESOURCE",
            title: "PDF content references an unknown font resource",
            pageIndex,
            resourceId: op.fontId,
            path: `pages.${pageIndex}.content.${opIndex}.fontId`,
          }),
        );
      }
      if (op.op === "text" && op.fontId && !pageFonts.has(op.fontId)) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_PAGE_MISSING_FONT_RESOURCE",
            title: "PDF content references a font resource missing from the page",
            pageIndex,
            resourceId: op.fontId,
            path: `pages.${pageIndex}.content.${opIndex}.fontId`,
          }),
        );
      }
      const textFontId = op.op === "text" ? (op.fontId ?? pageRefs.fonts[0]) : undefined;
      const textFont = globalResources.fonts.find(
        (font) => resourceIdFromUnknown(font, "font") === textFontId,
      ) as PdfFontResource | undefined;
      const textHasSupportedEncoding =
        op.op !== "text" ||
        pdfTextEncodingIsSupported(op.text) ||
        (op.textEncoding === "utf16be" && textFont?.encoding === "identity-h");
      if (op.op === "text" && !textHasSupportedEncoding) {
        issues.push(unsupportedTextEncodingDiagnostic({ pageIndex, opIndex }));
      }
      const missingText =
        op.op === "text" ? missingFontGlyphText({ font: textFont, text: op.text }) : undefined;
      if (op.op === "text" && textFont && missingText) {
        issues.push(
          fontGlyphMissingDiagnostic({
            pageIndex,
            opIndex,
            font: textFont,
            text: op.text,
            missingText,
          }),
        );
      }
      if (op.op === "image" && !resources.images.has(op.imageId)) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_IMAGE_RESOURCE",
            title: "PDF content references an unknown image resource",
            pageIndex,
            resourceId: op.imageId,
            path: `pages.${pageIndex}.content.${opIndex}.imageId`,
          }),
        );
      }
      if (op.op === "image" && !pageImages.has(op.imageId)) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_PAGE_MISSING_IMAGE_RESOURCE",
            title: "PDF content references an image resource missing from the page",
            pageIndex,
            resourceId: op.imageId,
            path: `pages.${pageIndex}.content.${opIndex}.imageId`,
          }),
        );
      }
      if (
        (op.op === "fillLinearGradientEllipse" ||
          op.op === "fillLinearGradientRect" ||
          op.op === "fillLinearGradientRoundRect" ||
          op.op === "fillRadialGradientEllipse" ||
          op.op === "fillRadialGradientRect" ||
          op.op === "fillRadialGradientRoundRect") &&
        !resources.gradients.has(op.gradientId)
      ) {
        issues.push(
          unknownResourceDiagnostic({
            code: "E_PDF_MODEL_UNKNOWN_GRADIENT_RESOURCE",
            title: "PDF content references an unknown gradient resource",
            pageIndex,
            resourceId: op.gradientId,
            path: `pages.${pageIndex}.content.${opIndex}.gradientId`,
          }),
        );
      }
      if (
        (op.op === "fillLinearGradientEllipse" ||
          op.op === "fillLinearGradientRect" ||
          op.op === "fillLinearGradientRoundRect" ||
          op.op === "fillRadialGradientEllipse" ||
          op.op === "fillRadialGradientRect" ||
          op.op === "fillRadialGradientRoundRect") &&
        !pageGradients.has(op.gradientId)
      ) {
        issues.push(
          missingPageResourceDiagnostic({
            code: "E_PDF_MODEL_PAGE_MISSING_GRADIENT_RESOURCE",
            title: "PDF content references a gradient resource missing from the page",
            pageIndex,
            resourceId: op.gradientId,
            path: `pages.${pageIndex}.content.${opIndex}.gradientId`,
          }),
        );
      }
    });
  });

  return createDiagnostics(issues);
}

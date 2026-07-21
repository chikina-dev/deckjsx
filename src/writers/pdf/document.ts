import type {
  PdfBlendMode,
  PdfDocumentMetadata,
  PdfContentOp,
  PdfFontResource,
  PdfGradientResource,
  PdfImageResource,
  PdfLinearGradientResource,
  PdfPage,
  PdfPageModel,
  PdfResourceDictionary,
  PdfTextGlyph,
  PdfTextOp,
} from "../../projection/pdf/model";
import { normalizedPdfDateValue, pdfMetadataDateStringIsValid } from "../../projection/pdf/date";
import { pdfCssColorFilterTransform } from "../../projection/pdf/filter-color";
import { pdfEmbeddablePngImage, type PdfEmbeddablePngAlphaMask } from "../../projection/pdf/png";
import { pdfTextEncodingIsSupported } from "../../projection/pdf/text-encoding";
import {
  pdfGraphicsStateName,
  renderPdfContentStream,
  type PdfIdentityHTextEncoding,
} from "./content";
import {
  pdfLiteralString,
  pdfName,
  pdfNumber,
  pdfTextString,
  type PdfIndirectObject,
} from "./objects";
import {
  parseTrueTypeCodeUnitGlyphIds,
  parseTrueTypeCodeUnitWidths,
  parseTrueTypeGlyphWidths,
  parseTrueTypeFontMetrics,
} from "./truetype";

const PDF_HEADER = "%PDF-1.7\n%\u00ff\u00ff\u00ff\u00ff\n";
const MAX_TO_UNICODE_BFCHAR_ENTRIES = 100;
const TEXT_ENCODER = new TextEncoder();

type PdfIdentityHTextEncodingPlan = PdfIdentityHTextEncoding & {
  readonly codePointByCid: ReadonlyMap<number, number>;
  readonly glyphByCid: ReadonlyMap<number, PdfTextGlyph>;
};

function byteLength(value: string): number {
  return TEXT_ENCODER.encode(value).byteLength;
}

function bytesFromString(value: string): Uint8Array {
  return TEXT_ENCODER.encode(value);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

function pdfFileId(documentId: string): string {
  const bytes = TEXT_ENCODER.encode(documentId);
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => {
      let hash = seed;
      bytes.forEach((byte) => {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      });
      return hash.toString(16).toUpperCase().padStart(8, "0");
    })
    .join("");
}

function hasAsciiWhitespaceOrControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function pdfResourceIdIsValid(
  value: unknown,
  kind: "font" | "gradient" | "image",
): value is string {
  const prefix = `pdf:resource:${kind}:`;
  return (
    typeof value === "string" &&
    value.startsWith(prefix) &&
    value.length > prefix.length &&
    !hasAsciiWhitespaceOrControl(value)
  );
}

function assertPdfDocumentId(value: string): void {
  const prefix = "pdf:document:";
  if (!value.startsWith(prefix) || value.length === prefix.length) {
    throw new Error("PDF document ids must start with pdf:document:.");
  }
  if (hasAsciiWhitespaceOrControl(value)) {
    throw new Error("PDF document ids must not contain whitespace or control characters.");
  }
}

function assertPdfDocumentHeader(value: unknown): void {
  const model = value as Partial<PdfPageModel> | undefined;
  if (
    typeof model !== "object" ||
    model === null ||
    Array.isArray(model) ||
    model.format !== "pdf" ||
    model.version !== "1.7" ||
    typeof model.documentId !== "string"
  ) {
    throw new Error(
      'PDF document models must declare format "pdf", version "1.7", and a non-empty document id.',
    );
  }
}

function pageIndexFromPdfPageId(value: string): number | undefined {
  const suffix = value.slice("pdf:page:".length);
  const separatorIndex = suffix.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex === suffix.length - 1) {
    return undefined;
  }

  const pageIndex = Number(suffix.slice(separatorIndex + 1));
  return Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex : undefined;
}

function assertPdfPageIdentity(page: PdfPage, pageIndex: number): void {
  if (!Number.isInteger(page.index) || page.index !== pageIndex) {
    throw new Error("PDF page indexes must match their page order.");
  }

  const prefix = "pdf:page:";
  if (
    typeof page.id !== "string" ||
    !page.id.startsWith(prefix) ||
    page.id.length === prefix.length
  ) {
    throw new Error("PDF page ids must start with pdf:page:.");
  }
  if (hasAsciiWhitespaceOrControl(page.id)) {
    throw new Error("PDF page ids must not contain whitespace or control characters.");
  }
  if (pageIndexFromPdfPageId(page.id) !== page.index) {
    throw new Error("PDF page ids must encode their zero-based page index.");
  }
}

function assertPdfPageMediaBox(value: unknown): void {
  const box = value as Partial<PdfPage["mediaBox"]> | undefined;
  if (
    typeof box !== "object" ||
    box === null ||
    Array.isArray(box) ||
    typeof box.x !== "number" ||
    typeof box.y !== "number" ||
    typeof box.width !== "number" ||
    typeof box.height !== "number" ||
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    throw new Error("PDF page media boxes must have finite coordinates and positive dimensions.");
  }
}

function assertPdfDocumentMetadata(value: unknown): void {
  const metadata = value as Partial<PdfDocumentMetadata> | undefined;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata) ||
    (metadata.title !== undefined && typeof metadata.title !== "string") ||
    (metadata.author !== undefined && typeof metadata.author !== "string") ||
    (metadata.subject !== undefined && typeof metadata.subject !== "string") ||
    (metadata.producer !== undefined && typeof metadata.producer !== "string") ||
    (metadata.creationDate !== undefined && !pdfMetadataDateStringIsValid(metadata.creationDate)) ||
    (metadata.modificationDate !== undefined &&
      !pdfMetadataDateStringIsValid(metadata.modificationDate))
  ) {
    throw new Error(
      "PDF document metadata must be an object whose title, author, subject, producer, creationDate, and modificationDate fields are strings when present.",
    );
  }
}

function pdfFallbackKindIsValid(
  value: unknown,
): value is NonNullable<PdfPageModel["fallbacks"][number]["kind"]> {
  return (
    value === "group" ||
    value === "image" ||
    value === "shape" ||
    value === "table" ||
    value === "text" ||
    value === "video"
  );
}

function assertPdfFallbacks(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new Error("PDF document models must include a fallbacks array.");
  }

  value.forEach((fallback) => {
    const entry = fallback as Partial<PdfPageModel["fallbacks"][number]> | undefined;
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      typeof entry.code !== "string" ||
      entry.code.length === 0 ||
      typeof entry.message !== "string" ||
      entry.message.length === 0 ||
      (entry.pageId !== undefined && typeof entry.pageId !== "string") ||
      (entry.kind !== undefined && !pdfFallbackKindIsValid(entry.kind)) ||
      !pdfVisualOriginIsValid(entry.origin)
    ) {
      throw new Error(
        "PDF fallback entries must include non-empty string code and message fields, with an optional string page id.",
      );
    }
  });
}

function assertPdfPages(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("PDF document models must include a non-empty pages array.");
  }
}

function assertPdfPageEntry(value: unknown): asserts value is PdfPage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PDF pages must be object entries with page model fields.");
  }
}

function assertPdfPageIdsAreUnique(pages: readonly PdfPage[]): void {
  const ids = new Set<string>();
  pages.forEach((page) => {
    if (typeof page.id !== "string") {
      return;
    }
    if (ids.has(page.id)) {
      throw new Error("Each PDF page must have a stable, unique id.");
    }
    ids.add(page.id);
  });
}

function assertPdfResourceDictionary(value: unknown): void {
  const resources = value as Partial<PdfResourceDictionary> | undefined;
  if (
    typeof resources !== "object" ||
    resources === null ||
    Array.isArray(resources) ||
    !Array.isArray(resources.fonts) ||
    !Array.isArray(resources.images) ||
    (resources.gradients !== undefined && !Array.isArray(resources.gradients))
  ) {
    throw new Error(
      "PDF resource dictionaries must include font and image resource arrays, with an optional gradient resource array.",
    );
  }

  const assertResourceIds = (
    resourcesByKind: readonly unknown[],
    kind: "font" | "gradient" | "image",
  ): void => {
    resourcesByKind.forEach((resource) => {
      const id =
        typeof resource === "object" && resource !== null && !Array.isArray(resource)
          ? (resource as { readonly id?: unknown }).id
          : undefined;
      if (!pdfResourceIdIsValid(id, kind)) {
        if (kind === "font") {
          throw new Error(
            "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
          );
        }
        if (kind === "image") {
          throw new Error(
            "PDF image resources must include supported JPEG or RGB PNG bytes, a matching mediaType, positive width and height, and a resource name.",
          );
        }
        throw new Error(
          "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
        );
      }
    });
  };

  assertResourceIds(resources.fonts, "font");
  assertResourceIds(resources.images, "image");
  assertResourceIds(resources.gradients ?? [], "gradient");
  resources.fonts.forEach((font) => {
    if (!pdfFontResourceIsValid(font)) {
      throw new Error(
        "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
      );
    }
  });
  resources.images.forEach((image) => {
    if (!pdfImageResourceIsEmbeddable(image)) {
      throw new Error(
        "PDF image resources must include supported JPEG or RGB PNG bytes, a matching mediaType, positive width and height, and a resource name.",
      );
    }
  });
  (resources.gradients ?? []).forEach((gradient) => {
    if (!pdfGradientResourceIsValid(gradient)) {
      throw new Error(
        "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
      );
    }
  });

  const seenIds = new Set<string>();
  [...resources.fonts, ...resources.images, ...(resources.gradients ?? [])].forEach((resource) => {
    const id = (resource as Partial<PdfResourceDictionary["fonts"][number]> | undefined)?.id;
    if (typeof id !== "string") {
      return;
    }
    if (seenIds.has(id)) {
      throw new Error(
        "Each PDF resource id must be unique across the global PDF resource dictionary.",
      );
    }
    seenIds.add(id);
  });
}

function pdfFontResourceIsValid(value: unknown): boolean {
  const font = value as Partial<PdfFontResource> | undefined;
  return (
    typeof font === "object" &&
    font !== null &&
    pdfResourceIdIsValid(font.id, "font") &&
    typeof font.name === "string" &&
    font.name.length > 0 &&
    (font.family === undefined || (typeof font.family === "string" && font.family.length > 0)) &&
    (font.weight === undefined ||
      (typeof font.weight === "number" && Number.isFinite(font.weight) && font.weight > 0)) &&
    (font.style === undefined || font.style === "normal" || font.style === "italic") &&
    (font.encoding === undefined ||
      font.encoding === "win-ansi" ||
      font.encoding === "identity-h") &&
    (font.fallback === undefined || typeof font.fallback === "boolean") &&
    (font.sourceKey === undefined ||
      (typeof font.sourceKey === "string" && font.sourceKey.length > 0)) &&
    (font.data === undefined || (font.data instanceof Uint8Array && font.data.byteLength > 0))
  );
}

function pdfImageResourceIsEmbeddable(value: unknown): boolean {
  const image = value as Partial<PdfImageResource> | undefined;
  if (
    typeof image !== "object" ||
    image === null ||
    !pdfResourceIdIsValid(image.id, "image") ||
    typeof image.name !== "string" ||
    image.name.length === 0 ||
    typeof image.width !== "number" ||
    !Number.isFinite(image.width) ||
    image.width <= 0 ||
    typeof image.height !== "number" ||
    !Number.isFinite(image.height) ||
    image.height <= 0 ||
    !(image.data instanceof Uint8Array) ||
    image.data.byteLength === 0
  ) {
    return false;
  }

  const mediaType =
    typeof image.mediaType === "string"
      ? image.mediaType.split(";")[0]?.trim().toLowerCase()
      : undefined;
  if (mediaType === "image/jpeg") {
    return true;
  }
  if (mediaType !== "image/png") {
    return false;
  }

  const png = embeddablePngImageForResource(image as PdfImageResource);
  return png !== undefined && png.width === image.width && png.height === image.height;
}

function pdfGradientResourceIsValid(value: unknown): boolean {
  const gradient = value as Partial<PdfGradientResource> | undefined;
  if (
    typeof gradient !== "object" ||
    gradient === null ||
    !pdfResourceIdIsValid(gradient.id, "gradient") ||
    typeof gradient.name !== "string" ||
    gradient.name.length === 0 ||
    !pdfRectangleIsPositive(gradient.box) ||
    !Array.isArray(gradient.stops) ||
    gradient.stops.length < 2 ||
    !gradient.stops.every(pdfGradientStopIsValid)
  ) {
    return false;
  }

  if (gradient.kind === "linear-gradient") {
    return typeof gradient.angle === "number" && Number.isFinite(gradient.angle);
  }

  if (gradient.kind !== "radial-gradient") {
    return false;
  }

  const center = gradient.center as { readonly x?: unknown; readonly y?: unknown } | undefined;
  const radius = gradient.radius as { readonly x?: unknown; readonly y?: unknown } | undefined;
  return (
    (gradient.shape === "circle" || gradient.shape === "ellipse") &&
    typeof center === "object" &&
    center !== null &&
    !Array.isArray(center) &&
    typeof center.x === "number" &&
    typeof center.y === "number" &&
    Number.isFinite(center.x) &&
    Number.isFinite(center.y) &&
    typeof radius === "object" &&
    radius !== null &&
    !Array.isArray(radius) &&
    typeof radius.x === "number" &&
    typeof radius.y === "number" &&
    Number.isFinite(radius.x) &&
    Number.isFinite(radius.y) &&
    radius.x > 0 &&
    radius.y > 0
  );
}

function pdfGradientStopIsValid(value: unknown): boolean {
  const stop = value as Partial<PdfGradientResource["stops"][number]> | undefined;
  return (
    typeof stop === "object" &&
    stop !== null &&
    !Array.isArray(stop) &&
    typeof stop.position === "number" &&
    Number.isFinite(stop.position) &&
    stop.position >= 0 &&
    stop.position <= 1 &&
    pdfColorIsValid(stop.color) &&
    pdfOptionalOpacityIsValid(stop.opacity)
  );
}

function assertPdfPageResourceDictionary(value: unknown): void {
  const resources = value as Partial<PdfPage["resources"]> | undefined;
  if (
    typeof resources !== "object" ||
    resources === null ||
    Array.isArray(resources) ||
    !Array.isArray(resources.fonts) ||
    !Array.isArray(resources.images) ||
    (resources.gradients !== undefined && !Array.isArray(resources.gradients))
  ) {
    throw new Error(
      "PDF page resource dictionaries must include font and image reference arrays, with an optional gradient reference array.",
    );
  }
}

function assertPdfPageResourceReferences(page: PdfPage, resources: PdfResourceDictionary): void {
  const globalIds = {
    fonts: new Set(resources.fonts.map((font) => font.id)),
    images: new Set(resources.images.map((image) => image.id)),
    gradients: new Set((resources.gradients ?? []).map((gradient) => gradient.id)),
  };
  const assertReferences = (
    references: readonly unknown[],
    kind: "font" | "gradient" | "image",
    declaredIds: ReadonlySet<string>,
  ): void => {
    references.forEach((resourceId) => {
      if (!pdfResourceIdIsValid(resourceId, kind)) {
        throw new Error("PDF page resource references must be non-empty resource id strings.");
      }
      if (!declaredIds.has(resourceId)) {
        throw new Error(
          "The PDF page model references a resource id that is not declared globally.",
        );
      }
    });
  };

  assertReferences(page.resources.fonts, "font", globalIds.fonts);
  assertReferences(page.resources.images, "image", globalIds.images);
  assertReferences(page.resources.gradients ?? [], "gradient", globalIds.gradients);
}

function assertPdfPageResourceNames(page: PdfPage, resources: PdfResourceDictionary): void {
  const assertUniqueNames = <Resource extends { readonly id: string; readonly name?: unknown }>(
    ids: readonly string[],
    globalResources: readonly Resource[],
    message: string,
  ): void => {
    const names = new Set<string>();
    ids.forEach((id) => {
      const resource = globalResources.find((item) => item.id === id);
      if (resource === undefined) {
        return;
      }
      if (typeof resource.name !== "string") {
        return;
      }
      if (names.has(resource.name)) {
        throw new Error(message);
      }
      names.add(resource.name);
    });
  };

  assertUniqueNames(
    page.resources.fonts,
    resources.fonts,
    "Each font resource name in a PDF page resource dictionary must be unique.",
  );
  assertUniqueNames(
    page.resources.images,
    resources.images,
    "Each image resource name in a PDF page resource dictionary must be unique.",
  );
  assertUniqueNames(
    page.resources.gradients ?? [],
    resources.gradients ?? [],
    "Each gradient resource name in a PDF page resource dictionary must be unique.",
  );
}

function assertPdfPageCollections(page: PdfPage): void {
  if (!Array.isArray(page.content)) {
    throw new Error("PDF pages must include a content operation array.");
  }
  if (page.annotations !== undefined && !Array.isArray(page.annotations)) {
    throw new Error("PDF page annotations must be an array when present.");
  }
}

function assertPdfContentOperations(page: PdfPage): void {
  const invalidMessage =
    "PDF content operations must be valid setFillColor, text, or image operations with required fields.";
  page.content.forEach((operation) => {
    if (typeof operation !== "object" || operation === null || Array.isArray(operation)) {
      throw new Error(invalidMessage);
    }
    if (!pdfOptionalBlendModeIsValid((operation as { readonly blendMode?: unknown }).blendMode)) {
      throw new Error(invalidMessage);
    }
    const op = (operation as { readonly op?: unknown }).op;
    switch (op) {
      case "setFillColor":
      case "setStrokeColor": {
        if (!pdfColorIsValid((operation as { readonly color?: unknown }).color)) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "setLineWidth": {
        const line = operation as { readonly width?: unknown };
        if (typeof line.width !== "number" || !Number.isFinite(line.width) || line.width <= 0) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "fillRect":
      case "fillEllipse": {
        if (
          !pdfRectangleIsPositive((operation as { readonly box?: unknown }).box) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfClipIsValid(operation) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "fillRoundRect": {
        if (
          !pdfRectangleIsPositive((operation as { readonly box?: unknown }).box) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfRadiusIsValid((operation as { readonly radius?: unknown }).radius) ||
          !pdfClipIsValid(operation) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "strokeRect":
      case "strokeEllipse": {
        if (
          !pdfRectangleIsPositive((operation as { readonly box?: unknown }).box) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfStrokeStyleEnumsAreValid(operation) ||
          !pdfOptionalPositiveNumberIsValid(
            (operation as { readonly lineWidth?: unknown }).lineWidth,
          ) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "strokeRoundRect": {
        if (
          !pdfRectangleIsPositive((operation as { readonly box?: unknown }).box) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfStrokeStyleEnumsAreValid(operation) ||
          !pdfOptionalPositiveNumberIsValid(
            (operation as { readonly lineWidth?: unknown }).lineWidth,
          ) ||
          !pdfRadiusIsValid((operation as { readonly radius?: unknown }).radius) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "strokeLine": {
        const line = operation as {
          readonly color?: unknown;
          readonly from?: unknown;
          readonly to?: unknown;
          readonly lineWidth?: unknown;
        };
        if (
          !pdfPointIsFinite(line.from) ||
          !pdfPointIsFinite(line.to) ||
          !pdfColorIsValid(line.color) ||
          typeof line.lineWidth !== "number" ||
          !Number.isFinite(line.lineWidth) ||
          line.lineWidth <= 0 ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfStrokeStyleEnumsAreValid(operation) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "fillLinearGradientEllipse":
      case "fillLinearGradientRect":
      case "fillRadialGradientEllipse":
      case "fillRadialGradientRect":
        if (
          typeof (operation as { readonly gradientId?: unknown }).gradientId !== "string" ||
          !pdfRectangleIsPositive((operation as { readonly box?: unknown }).box) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      case "fillLinearGradientRoundRect":
      case "fillRadialGradientRoundRect":
        if (
          typeof (operation as { readonly gradientId?: unknown }).gradientId !== "string" ||
          !pdfRectangleIsPositive((operation as { readonly box?: unknown }).box) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfRadiusIsValid((operation as { readonly radius?: unknown }).radius) ||
          !pdfTransformIsValid(operation)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      case "text": {
        const text = operation as {
          readonly actualText?: unknown;
          readonly text?: unknown;
          readonly textEncoding?: unknown;
          readonly x?: unknown;
          readonly y?: unknown;
          readonly box?: unknown;
          readonly color?: unknown;
          readonly fontId?: unknown;
          readonly fontSize?: unknown;
          readonly charSpacing?: unknown;
          readonly textRise?: unknown;
          readonly glyphs?: unknown;
        };
        if (
          typeof text.text !== "string" ||
          !pdfTextEncodingIsValid(text.textEncoding) ||
          (text.actualText !== undefined && typeof text.actualText !== "string") ||
          !Number.isFinite(text.x) ||
          !Number.isFinite(text.y) ||
          (text.box !== undefined && !pdfRectangleIsPositive(text.box)) ||
          (text.fontId !== undefined && typeof text.fontId !== "string") ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfTransformIsValid(operation) ||
          (text.fontSize !== undefined &&
            (typeof text.fontSize !== "number" ||
              !Number.isFinite(text.fontSize) ||
              text.fontSize <= 0)) ||
          (text.color !== undefined && !pdfColorIsValid(text.color)) ||
          !pdfOptionalFiniteNumberIsValid(text.charSpacing) ||
          !pdfOptionalFiniteNumberIsValid(text.textRise) ||
          !pdfTextGlyphsIsValid(text.glyphs)
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      case "image": {
        const image = operation as {
          readonly imageId?: unknown;
          readonly box?: unknown;
          readonly clipBox?: unknown;
          readonly clipRadius?: unknown;
        };
        if (
          typeof image.imageId !== "string" ||
          !pdfRectangleIsPositive(image.box) ||
          (image.clipBox !== undefined && !pdfRectangleIsPositive(image.clipBox)) ||
          !pdfOptionalOpacityIsValid((operation as { readonly opacity?: unknown }).opacity) ||
          !pdfTransformIsValid(operation) ||
          (image.clipRadius !== undefined &&
            (image.clipBox === undefined ||
              typeof image.clipRadius !== "number" ||
              !Number.isFinite(image.clipRadius) ||
              image.clipRadius < 0))
        ) {
          throw new Error(invalidMessage);
        }
        return;
      }
      default:
        throw new Error(invalidMessage);
    }
  });
}

function pdfPointIsFinite(value: unknown): boolean {
  const point = value as { readonly x?: unknown; readonly y?: unknown } | undefined;
  return (
    typeof point === "object" &&
    point !== null &&
    !Array.isArray(point) &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

function pdfTextEncodingIsValid(value: unknown): boolean {
  return value === undefined || value === "win-ansi" || value === "utf16be";
}

function pdfTextGlyphsIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((glyph) => {
        const candidate = glyph as {
          readonly advanceAdjustment?: unknown;
          readonly advanceWidth?: unknown;
          readonly glyphId?: unknown;
          readonly unicode?: unknown;
          readonly xOffset?: unknown;
          readonly yOffset?: unknown;
        };
        const hasOffset = candidate.xOffset !== undefined || candidate.yOffset !== undefined;
        return (
          typeof candidate === "object" &&
          candidate !== null &&
          !Array.isArray(candidate) &&
          typeof candidate.glyphId === "number" &&
          Number.isInteger(candidate.glyphId) &&
          candidate.glyphId >= 0 &&
          candidate.glyphId <= 0xffff &&
          typeof candidate.unicode === "string" &&
          candidate.unicode.length > 0 &&
          (candidate.advanceWidth === undefined ||
            (typeof candidate.advanceWidth === "number" &&
              Number.isFinite(candidate.advanceWidth))) &&
          (candidate.advanceAdjustment === undefined ||
            (typeof candidate.advanceAdjustment === "number" &&
              Number.isFinite(candidate.advanceAdjustment))) &&
          (!hasOffset ||
            (typeof candidate.advanceWidth === "number" &&
              Number.isFinite(candidate.advanceWidth))) &&
          pdfOptionalFiniteNumberIsValid(candidate.xOffset) &&
          pdfOptionalFiniteNumberIsValid(candidate.yOffset)
        );
      }))
  );
}

function pdfOptionalIdentifierArrayIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item) => typeof item === "string" && item.trim().length > 0))
  );
}

function pdfVisualOriginIsValid(value: unknown): boolean {
  const origin = value as {
    readonly assetEntityIds?: unknown;
    readonly componentProvenance?: unknown;
    readonly graphNodeIds?: unknown;
    readonly source?: unknown;
    readonly styleEntityIds?: unknown;
  };
  return (
    value === undefined ||
    (typeof origin === "object" &&
      origin !== null &&
      !Array.isArray(origin) &&
      pdfOptionalIdentifierArrayIsValid(origin.graphNodeIds) &&
      pdfOptionalIdentifierArrayIsValid(origin.styleEntityIds) &&
      pdfOptionalIdentifierArrayIsValid(origin.assetEntityIds) &&
      (origin.source === undefined ||
        (typeof origin.source === "object" &&
          origin.source !== null &&
          !Array.isArray(origin.source))) &&
      (origin.componentProvenance === undefined ||
        (typeof origin.componentProvenance === "object" &&
          origin.componentProvenance !== null &&
          !Array.isArray(origin.componentProvenance))))
  );
}

function assertPdfContentOperationResourceReferences(page: PdfPage): void {
  const pageFontIds = new Set(page.resources.fonts);
  const pageImageIds = new Set(page.resources.images);
  const pageGradientIds = new Set(page.resources.gradients ?? []);

  page.content.forEach((operation) => {
    if (operation.op === "text") {
      if (!operation.fontId && pageFontIds.size === 0) {
        throw new Error(
          "The PDF content operation references a resource id that is not declared on the page.",
        );
      }
      if (operation.fontId && !pageFontIds.has(operation.fontId)) {
        throw new Error(
          "The PDF content operation references a resource id that is not declared on the page.",
        );
      }
      return;
    }

    if (operation.op === "image" && !pageImageIds.has(operation.imageId)) {
      throw new Error(
        "The PDF content operation references a resource id that is not declared on the page.",
      );
    }

    if ("gradientId" in operation && !pageGradientIds.has(operation.gradientId)) {
      throw new Error(
        "The PDF content operation references a resource id that is not declared on the page.",
      );
    }
  });
}

function pdfPageFontResource(input: {
  readonly fontId?: string;
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
}): PdfFontResource | undefined {
  const fontId = input.fontId ?? input.page.resources.fonts[0];
  if (!fontId) {
    return undefined;
  }
  return input.resources.fonts.find((font) => font.id === fontId);
}

function pdfTextOperationFontId(page: PdfPage, operation: PdfTextOp): string | undefined {
  return operation.fontId ?? page.resources.fonts[0];
}

function pdfTextEncodingIsRenderable(input: {
  readonly font?: PdfFontResource;
  readonly text: string;
  readonly textEncoding?: "utf16be" | "win-ansi";
}): boolean {
  return (
    pdfTextEncodingIsSupported(input.text) ||
    (input.textEncoding === "utf16be" && input.font?.encoding === "identity-h")
  );
}

function assertPdfTextEncodings(page: PdfPage, resources: PdfResourceDictionary): void {
  const invalidMessage = "PDF text must use WinAnsi text or utf16be text with an Identity-H font.";
  page.content.forEach((operation) => {
    if (operation.op !== "text") {
      return;
    }

    const font = pdfPageFontResource({ fontId: operation.fontId, page, resources });
    if (
      !pdfTextEncodingIsRenderable({
        font,
        text: operation.text,
        textEncoding: operation.textEncoding,
      })
    ) {
      throw new Error(invalidMessage);
    }
  });
}

function pdfColorIsValid(value: unknown): boolean {
  const color = value as { readonly r?: unknown; readonly g?: unknown; readonly b?: unknown };
  return (
    typeof color === "object" &&
    color !== null &&
    !Array.isArray(color) &&
    typeof color.r === "number" &&
    typeof color.g === "number" &&
    typeof color.b === "number" &&
    Number.isFinite(color.r) &&
    Number.isFinite(color.g) &&
    Number.isFinite(color.b) &&
    color.r >= 0 &&
    color.r <= 1 &&
    color.g >= 0 &&
    color.g <= 1 &&
    color.b >= 0 &&
    color.b <= 1
  );
}

function pdfOptionalFiniteNumberIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function pdfOptionalPositiveNumberIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function pdfOptionalOpacityIsValid(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function pdfTransformIsValid(value: unknown): boolean {
  const transform = value as {
    readonly rotation?: unknown;
    readonly rotationBox?: unknown;
    readonly flipH?: unknown;
    readonly flipV?: unknown;
  };
  return (
    (transform.rotation === undefined ||
      (typeof transform.rotation === "number" && Number.isFinite(transform.rotation))) &&
    (transform.rotationBox === undefined || pdfRectangleIsPositive(transform.rotationBox)) &&
    (transform.flipH === undefined || typeof transform.flipH === "boolean") &&
    (transform.flipV === undefined || typeof transform.flipV === "boolean")
  );
}

function pdfClipIsValid(value: unknown): boolean {
  const clip = value as {
    readonly clipBox?: unknown;
    readonly clipRadius?: unknown;
    readonly clipShape?: unknown;
  };
  return (
    (clip.clipBox === undefined || pdfRectangleIsPositive(clip.clipBox)) &&
    (clip.clipShape === undefined || clip.clipShape === "ellipse") &&
    (clip.clipRadius === undefined ||
      (clip.clipBox !== undefined &&
        clip.clipShape === undefined &&
        pdfRadiusIsValid(clip.clipRadius))) &&
    (clip.clipShape === undefined || (clip.clipBox !== undefined && clip.clipRadius === undefined))
  );
}

function pdfOptionalBlendModeIsValid(value: unknown): boolean {
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

function pdfRadiusIsValid(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function pdfStrokeStyleEnumsAreValid(value: unknown): boolean {
  const stroke = value as {
    readonly dash?: unknown;
    readonly lineCap?: unknown;
    readonly lineJoin?: unknown;
  };
  return (
    (stroke.dash === undefined || stroke.dash === "dash" || stroke.dash === "sysDot") &&
    (stroke.lineCap === undefined ||
      stroke.lineCap === "butt" ||
      stroke.lineCap === "round" ||
      stroke.lineCap === "square") &&
    (stroke.lineJoin === undefined ||
      stroke.lineJoin === "bevel" ||
      stroke.lineJoin === "miter" ||
      stroke.lineJoin === "round")
  );
}

function pdfRectangleIsPositive(value: unknown): value is PdfPage["mediaBox"] {
  const rectangle = value as Partial<PdfPage["mediaBox"]> | undefined;
  return (
    typeof rectangle === "object" &&
    rectangle !== null &&
    !Array.isArray(rectangle) &&
    typeof rectangle.x === "number" &&
    typeof rectangle.y === "number" &&
    typeof rectangle.width === "number" &&
    typeof rectangle.height === "number" &&
    Number.isFinite(rectangle.x) &&
    Number.isFinite(rectangle.y) &&
    Number.isFinite(rectangle.width) &&
    Number.isFinite(rectangle.height) &&
    rectangle.width > 0 &&
    rectangle.height > 0
  );
}

function pdfRectangleFitsInsidePageBox(
  pageBox: PdfPage["mediaBox"],
  value: PdfPage["mediaBox"],
): boolean {
  return (
    value.x >= 0 &&
    value.y >= 0 &&
    value.x + value.width <= pageBox.width &&
    value.y + value.height <= pageBox.height
  );
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

function pdfExternalUrlIsValid(value: string): boolean {
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

function assertPdfAnnotations(page: PdfPage): void {
  const invalidMessage =
    "PDF annotations must be valid link annotations with a positive box and an external URL.";
  (page.annotations ?? []).forEach((annotation) => {
    if (
      typeof annotation !== "object" ||
      annotation === null ||
      Array.isArray(annotation) ||
      annotation.kind !== "link" ||
      !pdfRectangleIsPositive(annotation.box) ||
      !pdfRectangleFitsInsidePageBox(page.mediaBox, annotation.box) ||
      typeof annotation.url !== "string" ||
      !pdfExternalUrlIsValid(annotation.url) ||
      (annotation.tooltip !== undefined && typeof annotation.tooltip !== "string")
    ) {
      throw new Error(invalidMessage);
    }
  });
}

function pageObjectId(pageIndex: number): number {
  return 4 + pageIndex * 2;
}

function contentObjectId(pageIndex: number): number {
  return pageObjectId(pageIndex) + 1;
}

function firstToUnicodeObjectId(model: PdfPageModel): number {
  return firstAnnotationObjectId(model) + annotationCount(model);
}

function firstFontFileObjectId(model: PdfPageModel): number {
  return firstCidSetObjectId(model) + cidSetFontIds(model).length;
}

function firstImageObjectId(model: PdfPageModel): number {
  return firstFontFileObjectId(model) + embeddedFontFileFontIds(model).length;
}

function firstCidSetObjectId(model: PdfPageModel): number {
  return firstCidToGidMapObjectId(model) + cidToGidMapFontIds(model).length;
}

function firstCidToGidMapObjectId(model: PdfPageModel): number {
  return firstToUnicodeObjectId(model) + toUnicodeFontIds(model).length;
}

function firstAnnotationObjectId(model: PdfPageModel): number {
  return 4 + model.pages.length * 2;
}

function annotationCount(model: PdfPageModel): number {
  return model.pages.reduce((count, page) => count + (page.annotations?.length ?? 0), 0);
}

function baseFontName(font: PdfFontResource): string {
  if (font.family === "Helvetica") {
    const bold = typeof font.weight === "number" && font.weight >= 600;
    const italic = font.style === "italic";
    if (bold && italic) {
      return "Helvetica-BoldOblique";
    }
    if (bold) {
      return "Helvetica-Bold";
    }
    if (italic) {
      return "Helvetica-Oblique";
    }
  }

  return font.family ?? font.name ?? "Helvetica";
}

function pageFonts(page: PdfPage, resources: PdfResourceDictionary): readonly PdfFontResource[] {
  const pageFontIds = new Set(page.resources.fonts);
  return resources.fonts.filter((font) => pageFontIds.has(font.id));
}

function pageImages(page: PdfPage, resources: PdfResourceDictionary): readonly PdfImageResource[] {
  const pageImageIds = new Set(page.resources.images);
  return resources.images.filter((image) => pageImageIds.has(image.id));
}

function pageGradients(
  page: PdfPage,
  resources: PdfResourceDictionary,
): readonly PdfGradientResource[] {
  const pageGradientIds = new Set(page.resources.gradients ?? []);
  return (resources.gradients ?? []).filter((gradient) => pageGradientIds.has(gradient.id));
}

function simpleFontWidthsDictionary(font?: PdfFontResource): string {
  const widths =
    (font?.data ? parseTrueTypeFontMetrics(font.data)?.winAnsiWidths : undefined) ??
    Array.from({ length: 224 }, () => 550);
  const widthList = widths.join(" ");
  return `/FirstChar 32 /LastChar 255 /Widths [${widthList}]`;
}

function fontDescriptorDictionary(input: {
  readonly font: PdfFontResource;
  readonly baseFont: string;
  readonly fontFileObjectId: number;
  readonly cidSetObjectId?: number;
}): string {
  const metrics = input.font.data
    ? parseTrueTypeFontMetrics(input.font.data)?.descriptor
    : undefined;
  const fontBBox = metrics?.fontBBox ?? [0, 0, 1000, 1000];
  const ascent = metrics?.ascent ?? 1000;
  const descent = metrics?.descent ?? 0;
  const capHeight = metrics?.capHeight ?? ascent;
  return `<< /Type /FontDescriptor /FontName ${input.baseFont} /Flags 32 /FontBBox [${fontBBox.join(" ")}] /ItalicAngle 0 /Ascent ${pdfNumber(ascent)} /Descent ${pdfNumber(descent)} /CapHeight ${pdfNumber(capHeight)} /StemV 80 /FontFile2 ${input.fontFileObjectId} 0 R${input.cidSetObjectId ? ` /CIDSet ${input.cidSetObjectId} 0 R` : ""} >>`;
}

function utf16CodeUnitsForPageFont(input: {
  readonly page: PdfPage;
  readonly fontId: PdfFontResource["id"];
}): readonly number[] {
  const codeUnits = new Set<number>();

  input.page.content.forEach((operation) => {
    const fontId =
      operation.op === "text" ? pdfTextOperationFontId(input.page, operation) : undefined;
    if (
      operation.op !== "text" ||
      fontId !== input.fontId ||
      operation.textEncoding !== "utf16be"
    ) {
      return;
    }

    for (let index = 0; index < operation.text.length; index += 1) {
      codeUnits.add(operation.text.charCodeAt(index));
    }
  });

  return [...codeUnits].sort((left, right) => left - right);
}

function unicodeCodePointHex(value: number): string {
  const text = String.fromCodePoint(value);
  let hex = "";
  for (let index = 0; index < text.length; index += 1) {
    hex += text.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0");
  }
  return hex;
}

function unicodeTextHex(value: string): string {
  let hex = "";
  for (const character of Array.from(value)) {
    hex += unicodeCodePointHex(character.codePointAt(0) ?? 0);
  }
  return hex;
}

function unicodeCodePointsForModelFont(input: {
  readonly model: PdfPageModel;
  readonly fontId: PdfFontResource["id"];
}): readonly number[] {
  const codePoints = new Set<number>();

  input.model.pages.forEach((page) => {
    page.content.forEach((operation) => {
      const fontId = operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
      if (
        operation.op !== "text" ||
        fontId !== input.fontId ||
        operation.textEncoding !== "utf16be" ||
        (operation.glyphs !== undefined && operation.glyphs.length > 0)
      ) {
        return;
      }

      for (const character of Array.from(operation.text)) {
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined) {
          codePoints.add(codePoint);
        }
      }
    });
  });

  return [...codePoints].sort((left, right) => left - right);
}

function shapedGlyphsForModelFont(input: {
  readonly model: PdfPageModel;
  readonly fontId: PdfFontResource["id"];
}): readonly PdfTextGlyph[] {
  const glyphs = new Map<string, PdfTextGlyph>();
  input.model.pages.forEach((page) => {
    page.content.forEach((operation) => {
      const fontId = operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
      if (operation.op !== "text" || fontId !== input.fontId || !operation.glyphs) {
        return;
      }
      operation.glyphs.forEach((glyph) => {
        glyphs.set(`${glyph.glyphId}:${glyph.unicode}`, glyph);
      });
    });
  });
  return [...glyphs.values()];
}

function identityHTextEncodingPlans(
  model: PdfPageModel,
): ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan> {
  const plans = new Map<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>();

  model.resources.fonts.forEach((font) => {
    if (!font.data || font.encoding !== "identity-h") {
      return;
    }

    const codePoints = unicodeCodePointsForModelFont({ model, fontId: font.id });
    const shapedGlyphs = shapedGlyphsForModelFont({ model, fontId: font.id });
    if (codePoints.length === 0 && shapedGlyphs.length === 0) {
      return;
    }

    const cidByCodePoint = new Map<number, number>();
    const codePointByCid = new Map<number, number>();
    codePoints.forEach((codePoint, index) => {
      const cid = index + 1;
      cidByCodePoint.set(codePoint, cid);
      codePointByCid.set(cid, codePoint);
    });
    const cidByGlyphKey = new Map<string, number>();
    const glyphByCid = new Map<number, PdfTextGlyph>();
    let nextCid = codePoints.length + 1;
    shapedGlyphs.forEach((glyph) => {
      const key = `${glyph.glyphId}:${glyph.unicode}`;
      if (cidByGlyphKey.has(key)) {
        return;
      }
      cidByGlyphKey.set(key, nextCid);
      glyphByCid.set(nextCid, glyph);
      nextCid += 1;
    });
    plans.set(font.id, {
      cidByCodePoint,
      codePointByCid,
      cidByGlyphKey,
      glyphByCid,
    });
  });

  return plans;
}

function cidFontWidthsDictionary(input: {
  readonly page: PdfPage;
  readonly font: PdfFontResource;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): string {
  if (!input.font.data) {
    return "";
  }

  const encoding = input.identityHTextEncodings.get(input.font.id);
  const codePoints = encoding
    ? [...encoding.codePointByCid.values()]
    : utf16CodeUnitsForPageFont({ page: input.page, fontId: input.font.id });
  const widths = parseTrueTypeCodeUnitWidths(input.font.data, codePoints);
  const glyphIds = encoding ? [...encoding.glyphByCid.values()].map((glyph) => glyph.glyphId) : [];
  const glyphWidths = parseTrueTypeGlyphWidths(input.font.data, glyphIds);
  const entries = (
    encoding
      ? [
          ...[...encoding.codePointByCid.entries()].flatMap(([cid, codePoint]) => {
            const width = widths.get(codePoint);
            return width === undefined ? [] : [[cid, width] as const];
          }),
          ...[...encoding.glyphByCid.entries()].flatMap(([cid, glyph]) => {
            const width = glyphWidths.get(glyph.glyphId);
            return width === undefined ? [] : [[cid, width] as const];
          }),
        ]
      : [...widths.entries()]
  )
    .sort(([left], [right]) => left - right)
    .map(([cid, width]) => `${pdfNumber(cid)} [${pdfNumber(width)}]`);

  return entries.length > 0 ? `/DW 550 /W [${entries.join(" ")}]` : "/DW 550";
}

function fontResourceDictionary(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
  readonly toUnicodeObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly cidToGidMapObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly cidSetObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly fontFileObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): string {
  const { page, resources } = input;
  const fonts = pageFonts(page, resources);
  if (fonts.length === 0) {
    return "";
  }

  const entries = fonts.map((font) => {
    if (font.encoding === "identity-h") {
      const baseFont = pdfName(baseFontName(font));
      const toUnicodeObjectId = input.toUnicodeObjectIds.get(font.id);
      const fontFileObjectId = input.fontFileObjectIds.get(font.id);
      const cidToGidMapObjectId = input.cidToGidMapObjectIds.get(font.id);
      const cidSetObjectId = input.cidSetObjectIds.get(font.id);
      const descendant = fontFileObjectId
        ? `<< /Type /Font /Subtype /CIDFontType2 /BaseFont ${baseFont} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fontDescriptorDictionary({ font, baseFont, fontFileObjectId, ...(cidSetObjectId ? { cidSetObjectId } : {}) })} /CIDToGIDMap ${cidToGidMapObjectId ? `${cidToGidMapObjectId} 0 R` : "/Identity"} ${cidFontWidthsDictionary({ page, font, identityHTextEncodings: input.identityHTextEncodings })} >>`
        : `<< /Type /Font /Subtype /CIDFontType0 /BaseFont ${baseFont} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>`;
      return `${pdfName(font.name)} << /Type /Font /Subtype /Type0 /BaseFont ${baseFont} /Encoding /Identity-H /DescendantFonts [${descendant}]${toUnicodeObjectId ? ` /ToUnicode ${toUnicodeObjectId} 0 R` : ""} >>`;
    }

    const fontFileObjectId = input.fontFileObjectIds.get(font.id);
    if (fontFileObjectId) {
      const baseFont = pdfName(baseFontName(font));
      return `${pdfName(font.name)} << /Type /Font /Subtype /TrueType /BaseFont ${baseFont} /Encoding /WinAnsiEncoding ${simpleFontWidthsDictionary(font)} /FontDescriptor ${fontDescriptorDictionary({ font, baseFont, fontFileObjectId })} >>`;
    }

    return `${pdfName(font.name)} << /Type /Font /Subtype /Type1 /BaseFont ${pdfName(
      baseFontName(font),
    )} /Encoding /WinAnsiEncoding >>`;
  });

  return `/Font << ${entries.join(" ")} >>`;
}

function imageResourceDictionary(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
  readonly imageObjectIds: ReadonlyMap<PdfImageResource["id"], number>;
}): string {
  const images = pageImages(input.page, input.resources);
  if (images.length === 0) {
    return "";
  }

  const entries = images.flatMap((image) => {
    const objectId = input.imageObjectIds.get(image.id);
    return objectId ? [`${pdfName(image.name ?? "Im")} ${objectId} 0 R`] : [];
  });
  return entries.length > 0 ? `/XObject << ${entries.join(" ")} >>` : "";
}

function pagePointX(page: PdfPage, x: number): number {
  return page.mediaBox.x + x;
}

function pagePointY(page: PdfPage, y: number): number {
  return page.mediaBox.y + page.mediaBox.height - y;
}

function gradientCoords(page: PdfPage, gradient: PdfLinearGradientResource): readonly number[] {
  const angle = (gradient.angle * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = Math.cos(angle);
  const box = gradient.box;
  const centerX = pagePointX(page, box.x + box.width / 2);
  const centerY = pagePointY(page, box.y + box.height / 2);
  const length = Math.abs(dx) * box.width + Math.abs(dy) * box.height;
  const halfLength = length / 2;

  return [
    centerX - dx * halfLength,
    centerY - dy * halfLength,
    centerX + dx * halfLength,
    centerY + dy * halfLength,
  ];
}

function radialGradientGeometry(
  page: PdfPage,
  gradient: Extract<PdfGradientResource, { readonly kind: "radial-gradient" }>,
): { readonly coords: readonly number[]; readonly matrix: readonly number[] } {
  const box = gradient.box;
  const centerX = pagePointX(page, box.x + box.width * gradient.center.x);
  const centerY = pagePointY(page, box.y + box.height * gradient.center.y);
  const radiusX = box.width * gradient.radius.x;
  const radiusY = box.height * gradient.radius.y;

  return {
    coords: [0, 0, 0, 0, 0, 1],
    matrix: [radiusX, 0, 0, radiusY, centerX, centerY],
  };
}

function pdfColorComponents(color: PdfGradientResource["stops"][number]["color"]): string {
  return [color.r, color.g, color.b].map((value) => pdfNumber(value)).join(" ");
}

function exponentialInterpolationFunction(input: {
  readonly from: PdfGradientResource["stops"][number];
  readonly to: PdfGradientResource["stops"][number];
}): string {
  return [
    "<<",
    "/FunctionType 2",
    "/Domain [0 1]",
    `/C0 [${pdfColorComponents(input.from.color)}]`,
    `/C1 [${pdfColorComponents(input.to.color)}]`,
    "/N 1",
    ">>",
  ].join(" ");
}

type PdfGradientStop = PdfGradientResource["stops"][number];

type PdfGradientStopGroup = {
  readonly position: number;
  readonly first: PdfGradientStop;
  readonly last: PdfGradientStop;
};

type PdfGradientFunctionSegment = {
  readonly start: number;
  readonly end: number;
  readonly from: PdfGradientStop;
  readonly to: PdfGradientStop;
};

function gradientStopGroups(stops: readonly PdfGradientStop[]): readonly PdfGradientStopGroup[] {
  const sortedStops = stops
    .map((stop, index) => ({ stop, index }))
    .sort((left, right) => left.stop.position - right.stop.position || left.index - right.index)
    .map(({ stop }) => stop);
  const groups: PdfGradientStopGroup[] = [];

  sortedStops.forEach((stop) => {
    const previous = groups.at(-1);
    if (previous?.position === stop.position) {
      groups[groups.length - 1] = { ...previous, last: stop };
      return;
    }
    groups.push({ position: stop.position, first: stop, last: stop });
  });

  return groups;
}

function gradientFunctionSegments(
  stops: readonly PdfGradientStop[],
): readonly PdfGradientFunctionSegment[] {
  const groups = gradientStopGroups(stops);
  const first = groups[0];
  const last = groups.at(-1);
  if (!first || !last) {
    return [];
  }

  const segments: PdfGradientFunctionSegment[] = [];
  if (first.position > 0) {
    segments.push({ start: 0, end: first.position, from: first.first, to: first.first });
  }

  for (let index = 0; index < groups.length - 1; index += 1) {
    const from = groups[index];
    const to = groups[index + 1];
    if (from && to && from.position < to.position) {
      segments.push({ start: from.position, end: to.position, from: from.last, to: to.first });
    }
  }

  if (last.position < 1) {
    segments.push({ start: last.position, end: 1, from: last.last, to: last.last });
  }

  return segments;
}

function gradientFunctionDictionary(
  stops: readonly PdfGradientResource["stops"][number][],
): string | undefined {
  const segments = gradientFunctionSegments(stops);
  if (segments.length === 0) {
    return undefined;
  }

  if (segments.length === 1) {
    const [segment] = segments;
    return segment ? exponentialInterpolationFunction(segment) : undefined;
  }

  const functions = segments.map((segment) => exponentialInterpolationFunction(segment));
  const bounds = segments.slice(0, -1).map((segment) => segment.end);
  const encode = segments.flatMap(() => [0, 1]);

  return [
    "<<",
    "/FunctionType 3",
    "/Domain [0 1]",
    `/Functions [${functions.join(" ")}]`,
    `/Bounds [${bounds.map((value) => pdfNumber(value)).join(" ")}]`,
    `/Encode [${encode.map((value) => pdfNumber(value)).join(" ")}]`,
    ">>",
  ].join(" ");
}

function gradientResourceDictionary(page: PdfPage, resources: PdfResourceDictionary): string {
  const gradients = pageGradients(page, resources);
  if (gradients.length === 0) {
    return "";
  }

  const entries = gradients.flatMap((gradient) => {
    const functionDictionary = gradientFunctionDictionary(gradient.stops);
    if (!functionDictionary) {
      return [];
    }
    const geometry =
      gradient.kind === "linear-gradient"
        ? { coords: gradientCoords(page, gradient), matrix: undefined }
        : radialGradientGeometry(page, gradient);
    const shadingType = gradient.kind === "linear-gradient" ? 2 : 3;

    return [
      [
        `${pdfName(gradient.name)} <<`,
        "/Type /Pattern",
        "/PatternType 2",
        ...(geometry.matrix
          ? [`/Matrix [${geometry.matrix.map((value) => pdfNumber(value)).join(" ")}]`]
          : []),
        "/Shading <<",
        `/ShadingType ${pdfNumber(shadingType)}`,
        "/ColorSpace /DeviceRGB",
        `/Coords [${geometry.coords.map((value) => pdfNumber(value)).join(" ")}]`,
        `/Function ${functionDictionary}`,
        "/Extend [true true]",
        ">>",
        ">>",
      ].join(" "),
    ];
  });

  return entries.length > 0 ? `/Pattern << ${entries.join(" ")} >>` : "";
}

function contentOpOpacity(op: PdfContentOp): number | undefined {
  return "opacity" in op ? op.opacity : undefined;
}

function contentOpBlendMode(op: PdfContentOp): PdfBlendMode | undefined {
  return "blendMode" in op ? op.blendMode : undefined;
}

type PdfGraphicsStateResource = {
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
};

function pdfBlendModeName(blendMode: PdfBlendMode): string {
  switch (blendMode) {
    case "multiply":
      return "Multiply";
    case "screen":
      return "Screen";
    case "overlay":
      return "Overlay";
    case "darken":
      return "Darken";
    case "lighten":
      return "Lighten";
    case "color-dodge":
      return "ColorDodge";
    case "color-burn":
      return "ColorBurn";
    case "hard-light":
      return "HardLight";
    case "soft-light":
      return "SoftLight";
    case "difference":
      return "Difference";
    case "exclusion":
      return "Exclusion";
    case "hue":
      return "Hue";
    case "saturation":
      return "Saturation";
    case "color":
      return "Color";
    case "luminosity":
      return "Luminosity";
  }
}

function contentOpGraphicsState(op: PdfContentOp): PdfGraphicsStateResource | undefined {
  const opacity = contentOpOpacity(op);
  const blendMode = contentOpBlendMode(op);
  const validOpacity =
    opacity !== undefined && Number.isFinite(opacity) && opacity >= 0 && opacity < 1
      ? opacity
      : undefined;
  if (validOpacity === undefined && blendMode === undefined) {
    return undefined;
  }

  return {
    ...(validOpacity !== undefined ? { opacity: validOpacity } : {}),
    ...(blendMode !== undefined ? { blendMode } : {}),
  };
}

function graphicsStateResourceKey(state: PdfGraphicsStateResource): string {
  return `${state.opacity ?? 1}:${state.blendMode ?? "normal"}`;
}

function graphicsStateResourceDictionary(page: PdfPage): string {
  const statesByKey = new Map<string, PdfGraphicsStateResource>();
  page.content.forEach((op) => {
    const state = contentOpGraphicsState(op);
    if (!state) {
      return;
    }

    statesByKey.set(graphicsStateResourceKey(state), state);
  });
  const states = [...statesByKey.values()].sort(
    (left, right) =>
      (left.opacity ?? 1) - (right.opacity ?? 1) ||
      (left.blendMode ?? "").localeCompare(right.blendMode ?? ""),
  );

  if (states.length === 0) {
    return "";
  }

  const entries = states.map((state) => {
    const name = pdfName(pdfGraphicsStateName(state.opacity, state.blendMode));
    const alphaEntries =
      state.opacity !== undefined
        ? [`/CA ${pdfNumber(state.opacity)}`, `/ca ${pdfNumber(state.opacity)}`]
        : [];
    const blendEntries =
      state.blendMode !== undefined ? [`/BM ${pdfName(pdfBlendModeName(state.blendMode))}`] : [];
    return `${name} << /Type /ExtGState ${[...alphaEntries, ...blendEntries].join(" ")} >>`;
  });
  return `/ExtGState << ${entries.join(" ")} >>`;
}

function pageMediaBox(page: PdfPage): string {
  const left = page.mediaBox.x;
  const bottom = page.mediaBox.y;
  const right = page.mediaBox.x + page.mediaBox.width;
  const top = page.mediaBox.y + page.mediaBox.height;

  return `[${pdfNumber(left)} ${pdfNumber(bottom)} ${pdfNumber(right)} ${pdfNumber(top)}]`;
}

function pdfAnnotationRect(page: PdfPage, box: PdfPage["mediaBox"]): string {
  const left = page.mediaBox.x + box.x;
  const bottom = page.mediaBox.y + page.mediaBox.height - box.y - box.height;
  const right = page.mediaBox.x + box.x + box.width;
  const top = page.mediaBox.y + page.mediaBox.height - box.y;
  return `[${pdfNumber(left)} ${pdfNumber(bottom)} ${pdfNumber(right)} ${pdfNumber(top)}]`;
}

function pdfAnnotationUri(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

function pdfDateString(value: string): string | undefined {
  const date = normalizedPdfDateValue(value);
  return date ? pdfLiteralString(date) : undefined;
}

function infoDictionary(metadata: PdfDocumentMetadata): string {
  const creationDate = metadata.creationDate ? pdfDateString(metadata.creationDate) : undefined;
  const modificationDate = metadata.modificationDate
    ? pdfDateString(metadata.modificationDate)
    : undefined;
  const entries = [
    `/Producer ${pdfTextString(metadata.producer ?? "deckjsx")}`,
    ...(metadata.title ? [`/Title ${pdfTextString(metadata.title)}`] : []),
    ...(metadata.author ? [`/Author ${pdfTextString(metadata.author)}`] : []),
    ...(metadata.subject ? [`/Subject ${pdfTextString(metadata.subject)}`] : []),
    ...(creationDate ? [`/CreationDate ${creationDate}`] : []),
    ...(modificationDate ? [`/ModDate ${modificationDate}`] : []),
  ];

  return `<< ${entries.join(" ")} >>`;
}

function assertPdfIndirectObjectId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("PDF indirect object ids must be positive integers.");
  }
}

export function contentStreamObject(id: number, stream: string): PdfIndirectObject {
  assertPdfIndirectObjectId(id);

  const streamBytes = /[\r\n]$/.test(stream) ? stream : `${stream}\n`;

  return {
    id,
    body: `<< /Length ${byteLength(streamBytes)} >>\nstream\n${streamBytes}endstream`,
  };
}

export function pdfXrefEntries(
  offsets: ReadonlyMap<number, number>,
  maxObjectId: number,
): string[] {
  if (!Number.isInteger(maxObjectId) || maxObjectId < 0) {
    throw new Error("PDF xref maximum object id must be a non-negative integer.");
  }

  offsets.forEach((_, objectId) => {
    if (!Number.isInteger(objectId) || objectId <= 0) {
      throw new Error("PDF xref offset object ids must be positive integers.");
    }
    if (objectId > maxObjectId) {
      throw new Error("PDF xref offset object ids must not exceed the maximum object id.");
    }
  });

  const entries = ["0000000000 65535 f "];
  for (let id = 1; id <= maxObjectId; id += 1) {
    const offset = offsets.get(id);
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
      throw new Error("PDF xref offsets must be non-negative integers.");
    }
    if (offset !== undefined && offset > 9_999_999_999) {
      throw new Error("PDF xref offsets must fit in 10 decimal digits.");
    }
    entries.push(
      offset === undefined
        ? "0000000000 00000 f "
        : `${offset.toString().padStart(10, "0")} 00000 n `,
    );
  }
  return entries;
}

function pageObject(input: {
  readonly id: number;
  readonly page: PdfPage;
  readonly contentObjectId: number;
  readonly resources: PdfResourceDictionary;
  readonly imageObjectIds: ReadonlyMap<PdfImageResource["id"], number>;
  readonly toUnicodeObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly cidToGidMapObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly cidSetObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly fontFileObjectIds: ReadonlyMap<PdfFontResource["id"], number>;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
  readonly annotationObjectIds: readonly number[];
}): PdfIndirectObject {
  const resourceEntries = [
    fontResourceDictionary({
      page: input.page,
      resources: input.resources,
      toUnicodeObjectIds: input.toUnicodeObjectIds,
      cidToGidMapObjectIds: input.cidToGidMapObjectIds,
      cidSetObjectIds: input.cidSetObjectIds,
      fontFileObjectIds: input.fontFileObjectIds,
      identityHTextEncodings: input.identityHTextEncodings,
    }),
    imageResourceDictionary({
      page: input.page,
      resources: input.resources,
      imageObjectIds: input.imageObjectIds,
    }),
    gradientResourceDictionary(input.page, input.resources),
    graphicsStateResourceDictionary(input.page),
  ].filter((entry) => entry.length > 0);

  return {
    id: input.id,
    body: [
      "<<",
      "/Type /Page",
      "/Parent 2 0 R",
      `/MediaBox ${pageMediaBox(input.page)}`,
      `/Resources << ${resourceEntries.join(" ")} >>`,
      `/Contents ${input.contentObjectId} 0 R`,
      ...(input.annotationObjectIds.length > 0
        ? [`/Annots [${input.annotationObjectIds.map((id) => `${id} 0 R`).join(" ")}]`]
        : []),
      ">>",
    ].join(" "),
  };
}

function annotationObject(input: {
  readonly id: number;
  readonly page: PdfPage;
  readonly annotation: NonNullable<PdfPage["annotations"]>[number];
}): PdfIndirectObject {
  switch (input.annotation.kind) {
    case "link":
      return {
        id: input.id,
        body: [
          "<<",
          "/Type /Annot",
          "/Subtype /Link",
          `/Rect ${pdfAnnotationRect(input.page, input.annotation.box)}`,
          "/Border [0 0 0]",
          ...(input.annotation.tooltip
            ? [`/Contents ${pdfTextString(input.annotation.tooltip)}`]
            : []),
          `/A << /S /URI /URI ${pdfLiteralString(pdfAnnotationUri(input.annotation.url))} >>`,
          ">>",
        ].join(" "),
      };
  }
}

function imageFilter(image: PdfImageResource): string | undefined {
  switch (image.mediaType?.split(";")[0]?.trim().toLowerCase()) {
    case "image/jpeg":
      return "DCTDecode";
    case "image/png":
      return "FlateDecode";
    default:
      return undefined;
  }
}

function embeddablePngImageForResource(image: PdfImageResource) {
  const colorTransform = image.pdfColorFilter
    ? pdfCssColorFilterTransform(image.pdfColorFilter)
    : undefined;
  return image.data ? pdfEmbeddablePngImage(image.data, { colorTransform }) : undefined;
}

function imageStreamData(image: PdfImageResource): Uint8Array {
  const data = image.data ?? new Uint8Array();
  if (image.mediaType?.split(";")[0]?.trim().toLowerCase() !== "image/png") {
    return data;
  }

  return embeddablePngImageForResource(image)?.data ?? data;
}

function imageDecodeParms(image: PdfImageResource): string | undefined {
  const png = embeddablePngImageForResource(image);
  if (!png) {
    return undefined;
  }

  return `/DecodeParms << /Predictor 15 /Colors ${pdfNumber(
    png.colors,
  )} /BitsPerComponent ${pdfNumber(png.bitDepth)} /Columns ${pdfNumber(png.width)} >>`;
}

function imageDecodeParmsFromFields(input: {
  readonly colors: number;
  readonly bitDepth: number;
  readonly width: number;
}): string {
  return `/DecodeParms << /Predictor 15 /Colors ${pdfNumber(
    input.colors,
  )} /BitsPerComponent ${pdfNumber(input.bitDepth)} /Columns ${pdfNumber(input.width)} >>`;
}

function imageColorSpace(image: PdfImageResource): string {
  const png = embeddablePngImageForResource(image);
  return png?.colorSpace ?? "DeviceRGB";
}

function softMaskObjectIds(input: {
  readonly model: PdfPageModel;
  readonly imageObjectIds: ReadonlyMap<PdfImageResource["id"], number>;
}): ReadonlyMap<PdfImageResource["id"], number> {
  const ids = new Map<PdfImageResource["id"], number>();
  let nextId = firstImageObjectId(input.model) + input.model.resources.images.length;
  input.model.resources.images.forEach((image) => {
    const png = embeddablePngImageForResource(image);
    if (png?.alphaMask && input.imageObjectIds.has(image.id)) {
      ids.set(image.id, nextId);
      nextId += 1;
    }
  });
  return ids;
}

function imageStreamObject(input: {
  readonly id: number;
  readonly image: PdfImageResource;
  readonly softMaskObjectId?: number;
}): PdfIndirectObject {
  const { image } = input;
  const data = imageStreamData(image);
  const filter = imageFilter(image);
  const decodeParms = imageDecodeParms(image);
  const header = [
    "<<",
    "/Type /XObject",
    "/Subtype /Image",
    `/Width ${pdfNumber(image.width ?? 1)}`,
    `/Height ${pdfNumber(image.height ?? 1)}`,
    `/ColorSpace ${pdfName(imageColorSpace(image))}`,
    "/BitsPerComponent 8",
    ...(filter ? [`/Filter ${pdfName(filter)}`] : []),
    ...(decodeParms ? [decodeParms] : []),
    ...(input.softMaskObjectId ? [`/SMask ${input.softMaskObjectId} 0 R`] : []),
    `/Length ${data.byteLength}`,
    ">>",
    "stream",
    "",
  ].join("\n");
  const footer = "\nendstream";

  return {
    id: input.id,
    body: concatBytes([bytesFromString(header), data, bytesFromString(footer)]),
  };
}

function softMaskStreamObject(input: {
  readonly id: number;
  readonly image: PdfImageResource;
  readonly alphaMask: PdfEmbeddablePngAlphaMask;
}): PdfIndirectObject {
  const header = [
    "<<",
    "/Type /XObject",
    "/Subtype /Image",
    `/Width ${pdfNumber(input.image.width ?? 1)}`,
    `/Height ${pdfNumber(input.image.height ?? 1)}`,
    `/ColorSpace ${pdfName(input.alphaMask.colorSpace)}`,
    `/BitsPerComponent ${pdfNumber(input.alphaMask.bitDepth)}`,
    "/Filter /FlateDecode",
    imageDecodeParmsFromFields({
      colors: input.alphaMask.colors,
      bitDepth: input.alphaMask.bitDepth,
      width: input.image.width ?? 1,
    }),
    `/Length ${input.alphaMask.data.byteLength}`,
    ">>",
    "stream",
    "",
  ].join("\n");
  const footer = "\nendstream";

  return {
    id: input.id,
    body: concatBytes([bytesFromString(header), input.alphaMask.data, bytesFromString(footer)]),
  };
}

function utf16CodeUnitHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

function toUnicodeCodeUnitsForFont(input: {
  readonly model: PdfPageModel;
  readonly fontId: PdfFontResource["id"];
}): readonly number[] {
  const codeUnits = new Set<number>();

  input.model.pages.forEach((page) => {
    page.content.forEach((operation) => {
      const fontId = operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
      if (
        operation.op !== "text" ||
        fontId !== input.fontId ||
        operation.textEncoding !== "utf16be"
      ) {
        return;
      }

      for (let index = 0; index < operation.text.length; index += 1) {
        codeUnits.add(operation.text.charCodeAt(index));
      }
    });
  });

  return [...codeUnits].sort((left, right) => left - right);
}

function toUnicodeCMap(input: {
  readonly font: PdfFontResource;
  readonly model: PdfPageModel;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): string {
  const encoding = input.identityHTextEncodings.get(input.font.id);
  const bfcharEntries = encoding
    ? [
        ...[...encoding.codePointByCid.entries()].map(
          ([cid, codePoint]) => `<${utf16CodeUnitHex(cid)}> <${unicodeCodePointHex(codePoint)}>`,
        ),
        ...[...encoding.glyphByCid.entries()].map(
          ([cid, glyph]) => `<${utf16CodeUnitHex(cid)}> <${unicodeTextHex(glyph.unicode)}>`,
        ),
      ].sort((left, right) => {
        const leftCid = Number.parseInt(left.slice(1, 5), 16);
        const rightCid = Number.parseInt(right.slice(1, 5), 16);
        return leftCid - rightCid;
      })
    : toUnicodeCodeUnitsForFont({ model: input.model, fontId: input.font.id }).map((codeUnit) => {
        const hex = utf16CodeUnitHex(codeUnit);
        return `<${hex}> <${hex}>`;
      });
  const bfcharBlocks = Array.from(
    { length: Math.ceil(bfcharEntries.length / MAX_TO_UNICODE_BFCHAR_ENTRIES) || 1 },
    (_, index) =>
      bfcharEntries.slice(
        index * MAX_TO_UNICODE_BFCHAR_ENTRIES,
        (index + 1) * MAX_TO_UNICODE_BFCHAR_ENTRIES,
      ),
  );

  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    ...bfcharBlocks.flatMap((entries) => [
      `${entries.length} beginbfchar`,
      ...entries,
      "endbfchar",
    ]),
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

function toUnicodeFontIds(model: PdfPageModel): readonly PdfFontResource["id"][] {
  const usedUnicodeFontIds = new Set(
    model.pages.flatMap((page) =>
      page.content.flatMap((operation) => {
        const fontId =
          operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
        return operation.op === "text" &&
          operation.text.length > 0 &&
          operation.textEncoding === "utf16be" &&
          fontId
          ? [fontId]
          : [];
      }),
    ),
  );

  return model.resources.fonts.flatMap((font) =>
    font.encoding === "identity-h" && usedUnicodeFontIds.has(font.id) ? [font.id] : [],
  );
}

function toUnicodeObjectIds(model: PdfPageModel): ReadonlyMap<PdfFontResource["id"], number> {
  const ids = new Map<PdfFontResource["id"], number>();
  const firstId = firstToUnicodeObjectId(model);
  toUnicodeFontIds(model).forEach((fontId, index) => {
    ids.set(fontId, firstId + index);
  });
  return ids;
}

function toUnicodeStreamObject(input: {
  readonly id: number;
  readonly font: PdfFontResource;
  readonly model: PdfPageModel;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): PdfIndirectObject {
  return contentStreamObject(
    input.id,
    toUnicodeCMap({
      font: input.font,
      model: input.model,
      identityHTextEncodings: input.identityHTextEncodings,
    }),
  );
}

function cidToGidMapFontIds(model: PdfPageModel): readonly PdfFontResource["id"][] {
  const usedFontIds = new Set(
    model.pages.flatMap((page) =>
      page.content.flatMap((operation) => {
        const fontId =
          operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
        return operation.op === "text" &&
          operation.text.length > 0 &&
          operation.textEncoding === "utf16be" &&
          fontId
          ? [fontId]
          : [];
      }),
    ),
  );

  return model.resources.fonts.flatMap((font) =>
    font.data && font.encoding === "identity-h" && usedFontIds.has(font.id) ? [font.id] : [],
  );
}

function cidToGidMapObjectIds(model: PdfPageModel): ReadonlyMap<PdfFontResource["id"], number> {
  const ids = new Map<PdfFontResource["id"], number>();
  const firstId = firstCidToGidMapObjectId(model);
  cidToGidMapFontIds(model).forEach((fontId, index) => {
    ids.set(fontId, firstId + index);
  });
  return ids;
}

function cidSetFontIds(model: PdfPageModel): readonly PdfFontResource["id"][] {
  return cidToGidMapFontIds(model);
}

function cidSetObjectIds(model: PdfPageModel): ReadonlyMap<PdfFontResource["id"], number> {
  const ids = new Map<PdfFontResource["id"], number>();
  const firstId = firstCidSetObjectId(model);
  cidSetFontIds(model).forEach((fontId, index) => {
    ids.set(fontId, firstId + index);
  });
  return ids;
}

function utf16CodeUnitsForModelFont(input: {
  readonly model: PdfPageModel;
  readonly fontId: PdfFontResource["id"];
}): readonly number[] {
  const codeUnits = new Set<number>();

  input.model.pages.forEach((page) => {
    page.content.forEach((operation) => {
      const fontId = operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
      if (
        operation.op !== "text" ||
        fontId !== input.fontId ||
        operation.textEncoding !== "utf16be"
      ) {
        return;
      }

      for (let index = 0; index < operation.text.length; index += 1) {
        codeUnits.add(operation.text.charCodeAt(index));
      }
    });
  });

  return [...codeUnits].sort((left, right) => left - right);
}

function cidToGidMapBytes(input: {
  readonly font: PdfFontResource;
  readonly model: PdfPageModel;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): Uint8Array {
  const data = input.font.data;
  const encoding = input.identityHTextEncodings.get(input.font.id);
  const codePoints = encoding
    ? [...encoding.codePointByCid.values()]
    : utf16CodeUnitsForModelFont({ model: input.model, fontId: input.font.id });
  if (!data || codePoints.length === 0) {
    return new Uint8Array();
  }

  const glyphIds = parseTrueTypeCodeUnitGlyphIds(data, codePoints);
  const maxCid = encoding
    ? Math.max(0, ...encoding.codePointByCid.keys(), ...encoding.glyphByCid.keys())
    : Math.max(0, ...codePoints);
  const bytes = new Uint8Array((maxCid + 1) * 2);
  if (encoding) {
    encoding.codePointByCid.forEach((codePoint, cid) => {
      const glyphId = glyphIds.get(codePoint);
      if (glyphId === undefined || cid < 0 || cid > maxCid) {
        return;
      }

      const offset = cid * 2;
      bytes[offset] = (glyphId >> 8) & 0xff;
      bytes[offset + 1] = glyphId & 0xff;
    });
    encoding.glyphByCid.forEach((glyph, cid) => {
      if (cid < 0 || cid > maxCid) {
        return;
      }
      const offset = cid * 2;
      bytes[offset] = (glyph.glyphId >> 8) & 0xff;
      bytes[offset + 1] = glyph.glyphId & 0xff;
    });
    return bytes;
  }

  glyphIds.forEach((glyphId, codePoint) => {
    if (codePoint < 0 || codePoint > maxCid) {
      return;
    }

    const offset = codePoint * 2;
    bytes[offset] = (glyphId >> 8) & 0xff;
    bytes[offset + 1] = glyphId & 0xff;
  });
  return bytes;
}

function cidToGidMapStreamObject(input: {
  readonly id: number;
  readonly font: PdfFontResource;
  readonly model: PdfPageModel;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): PdfIndirectObject {
  const data = cidToGidMapBytes({
    font: input.font,
    model: input.model,
    identityHTextEncodings: input.identityHTextEncodings,
  });
  const header = ["<<", `/Length ${data.byteLength}`, ">>", "stream", ""].join("\n");
  const footer = "\nendstream";

  return {
    id: input.id,
    body: concatBytes([bytesFromString(header), data, bytesFromString(footer)]),
  };
}

function cidSetBytes(input: {
  readonly font: PdfFontResource;
  readonly model: PdfPageModel;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): Uint8Array {
  const encoding = input.identityHTextEncodings.get(input.font.id);
  const cids = encoding
    ? [...new Set([...encoding.codePointByCid.keys(), ...encoding.glyphByCid.keys()])]
    : utf16CodeUnitsForModelFont({ model: input.model, fontId: input.font.id });
  if (cids.length === 0) {
    return new Uint8Array();
  }

  const maxCid = Math.max(0, ...cids);
  const bytes = new Uint8Array(Math.floor(maxCid / 8) + 1);
  cids.forEach((cid) => {
    if (cid < 0) {
      return;
    }
    bytes[Math.floor(cid / 8)] |= 1 << (7 - (cid % 8));
  });
  return bytes;
}

function cidSetStreamObject(input: {
  readonly id: number;
  readonly font: PdfFontResource;
  readonly model: PdfPageModel;
  readonly identityHTextEncodings: ReadonlyMap<PdfFontResource["id"], PdfIdentityHTextEncodingPlan>;
}): PdfIndirectObject {
  const data = cidSetBytes({
    font: input.font,
    model: input.model,
    identityHTextEncodings: input.identityHTextEncodings,
  });
  const header = ["<<", `/Length ${data.byteLength}`, ">>", "stream", ""].join("\n");
  const footer = "\nendstream";

  return {
    id: input.id,
    body: concatBytes([bytesFromString(header), data, bytesFromString(footer)]),
  };
}

function embeddedFontFileFontIds(model: PdfPageModel): readonly PdfFontResource["id"][] {
  const usedFontIds = new Set(
    model.pages.flatMap((page) =>
      page.content.flatMap((operation) => {
        const fontId =
          operation.op === "text" ? pdfTextOperationFontId(page, operation) : undefined;
        return operation.op === "text" && fontId ? [fontId] : [];
      }),
    ),
  );

  return model.resources.fonts.flatMap((font) =>
    font.data && usedFontIds.has(font.id) ? [font.id] : [],
  );
}

function fontFileObjectIds(model: PdfPageModel): ReadonlyMap<PdfFontResource["id"], number> {
  const ids = new Map<PdfFontResource["id"], number>();
  const firstId = firstFontFileObjectId(model);
  embeddedFontFileFontIds(model).forEach((fontId, index) => {
    ids.set(fontId, firstId + index);
  });
  return ids;
}

function fontFileStreamObject(input: {
  readonly id: number;
  readonly font: PdfFontResource;
}): PdfIndirectObject {
  const data = input.font.data ?? new Uint8Array();
  const header = [
    "<<",
    `/Length ${data.byteLength}`,
    `/Length1 ${data.byteLength}`,
    ">>",
    "stream",
    "",
  ].join("\n");
  const footer = "\nendstream";

  return {
    id: input.id,
    body: concatBytes([bytesFromString(header), data, bytesFromString(footer)]),
  };
}

function imageObjectIds(model: PdfPageModel): ReadonlyMap<PdfImageResource["id"], number> {
  const ids = new Map<PdfImageResource["id"], number>();
  const firstId = firstImageObjectId(model);
  model.resources.images.forEach((image, index) => {
    ids.set(image.id, firstId + index);
  });
  return ids;
}

function annotationObjectIds(model: PdfPageModel): readonly (readonly number[])[] {
  let nextId = firstAnnotationObjectId(model);
  return model.pages.map((page) => {
    return (page.annotations ?? []).map(() => {
      const id = nextId;
      nextId += 1;
      return id;
    });
  });
}

function buildObjects(model: PdfPageModel): readonly PdfIndirectObject[] {
  const pageRefs = model.pages.map((_, pageIndex) => `${pageObjectId(pageIndex)} 0 R`);
  const identityHTextEncodings = identityHTextEncodingPlans(model);
  const toUnicodeIds = toUnicodeObjectIds(model);
  const cidToGidMapIds = cidToGidMapObjectIds(model);
  const cidSetIds = cidSetObjectIds(model);
  const fontFileIds = fontFileObjectIds(model);
  const imageIds = imageObjectIds(model);
  const annotationIds = annotationObjectIds(model);
  const maskIds = softMaskObjectIds({ model, imageObjectIds: imageIds });
  const objects: PdfIndirectObject[] = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    {
      id: 2,
      body: `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${model.pages.length} >>`,
    },
    { id: 3, body: infoDictionary(model.metadata) },
  ];

  model.pages.forEach((page, pageIndex) => {
    const contentId = contentObjectId(pageIndex);
    objects.push(
      pageObject({
        id: pageObjectId(pageIndex),
        page,
        contentObjectId: contentId,
        resources: model.resources,
        imageObjectIds: imageIds,
        toUnicodeObjectIds: toUnicodeIds,
        cidToGidMapObjectIds: cidToGidMapIds,
        cidSetObjectIds: cidSetIds,
        fontFileObjectIds: fontFileIds,
        identityHTextEncodings,
        annotationObjectIds: annotationIds[pageIndex] ?? [],
      }),
      contentStreamObject(
        contentId,
        renderPdfContentStream(page, model.resources, { identityHTextEncodings }),
      ),
    );

    page.annotations?.forEach((annotation, annotationIndex) => {
      const id = annotationIds[pageIndex]?.[annotationIndex];
      if (id) {
        objects.push(annotationObject({ id, page, annotation }));
      }
    });
  });

  model.resources.fonts.forEach((font) => {
    const objectId = toUnicodeIds.get(font.id);
    if (objectId) {
      objects.push(toUnicodeStreamObject({ id: objectId, font, model, identityHTextEncodings }));
    }
  });

  model.resources.fonts.forEach((font) => {
    const objectId = cidToGidMapIds.get(font.id);
    if (objectId) {
      objects.push(cidToGidMapStreamObject({ id: objectId, font, model, identityHTextEncodings }));
    }
  });

  model.resources.fonts.forEach((font) => {
    const objectId = cidSetIds.get(font.id);
    if (objectId) {
      objects.push(cidSetStreamObject({ id: objectId, font, model, identityHTextEncodings }));
    }
  });

  model.resources.fonts.forEach((font) => {
    const objectId = fontFileIds.get(font.id);
    if (objectId) {
      objects.push(fontFileStreamObject({ id: objectId, font }));
    }
  });

  model.resources.images.forEach((image) => {
    const objectId = imageIds.get(image.id);
    if (objectId) {
      objects.push(
        imageStreamObject({
          id: objectId,
          image,
          ...(maskIds.has(image.id) ? { softMaskObjectId: maskIds.get(image.id) } : {}),
        }),
      );
      const maskObjectId = maskIds.get(image.id);
      const alphaMask = embeddablePngImageForResource(image)?.alphaMask;
      if (maskObjectId && alphaMask) {
        objects.push(softMaskStreamObject({ id: maskObjectId, image, alphaMask }));
      }
    }
  });

  return objects;
}

export function writePdfDocument(model: PdfPageModel): Uint8Array {
  assertPdfDocumentHeader(model);
  assertPdfDocumentId(model.documentId);
  assertPdfDocumentMetadata(model.metadata);
  assertPdfFallbacks(model.fallbacks);
  assertPdfResourceDictionary(model.resources);
  assertPdfPages(model.pages);

  model.pages.forEach(assertPdfPageEntry);
  assertPdfPageIdsAreUnique(model.pages);
  model.pages.forEach((page, pageIndex) => {
    assertPdfPageIdentity(page, pageIndex);
    assertPdfPageMediaBox(page.mediaBox);
    assertPdfPageResourceDictionary(page.resources);
    assertPdfPageResourceReferences(page, model.resources);
    assertPdfPageResourceNames(page, model.resources);
    assertPdfPageCollections(page);
    assertPdfContentOperations(page);
    assertPdfContentOperationResourceReferences(page);
    assertPdfTextEncodings(page, model.resources);
    assertPdfAnnotations(page);
  });

  const objects = buildObjects(model);
  const chunks: Uint8Array[] = [bytesFromString(PDF_HEADER)];
  let position = byteLength(PDF_HEADER);
  const offsets = new Map<number, number>();

  objects.forEach((object) => {
    offsets.set(object.id, position);
    const objectBytes = concatBytes([
      bytesFromString(`${object.id} 0 obj\n`),
      typeof object.body === "string" ? bytesFromString(object.body) : object.body,
      bytesFromString("\nendobj\n"),
    ]);
    chunks.push(objectBytes);
    position += objectBytes.byteLength;
  });

  const startxref = position;
  const maxObjectId = Math.max(0, ...objects.map((object) => object.id));
  const xrefEntries = pdfXrefEntries(offsets, maxObjectId);
  const fileId = pdfFileId(model.documentId);

  chunks.push(
    bytesFromString(
      [
        "xref",
        `0 ${maxObjectId + 1}`,
        ...xrefEntries,
        "trailer",
        `<< /Size ${maxObjectId + 1} /Root 1 0 R /Info 3 0 R /ID [<${fileId}> <${fileId}>] >>`,
        "startxref",
        String(startxref),
        "%%EOF",
        "",
      ].join("\n"),
    ),
  );

  return concatBytes(chunks);
}

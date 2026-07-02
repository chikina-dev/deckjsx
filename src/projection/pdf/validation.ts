import {
  createDiagnostics,
  diagnostic,
  type Diagnostic,
  type Diagnostics,
} from "../../diagnostics";
import type { PdfContentOp, PdfPageModel, PdfRectangle, PdfResourceDictionary } from "./model";
import type { PdfResourceId } from "./identity";

function resourceIds(resources: PdfResourceDictionary): {
  readonly fonts: ReadonlySet<PdfResourceId>;
  readonly images: ReadonlySet<PdfResourceId>;
} {
  return {
    fonts: new Set(resources.fonts.map((font) => font.id)),
    images: new Set(resources.images.map((image) => image.id)),
  };
}

function pageBoxIsPositive(box: PdfPageModel["pages"][number]["mediaBox"]): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function colorIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isFinite(value.r) &&
    Number.isFinite(value.g) &&
    Number.isFinite(value.b)
  );
}

function contentOpIsValid(value: unknown): value is PdfContentOp {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.op) {
    case "setFillColor":
      return colorIsValid(value.color);
    case "text":
      return (
        typeof value.text === "string" &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        (value.fontId === undefined || typeof value.fontId === "string") &&
        (value.fontSize === undefined ||
          (typeof value.fontSize === "number" &&
            Number.isFinite(value.fontSize) &&
            value.fontSize > 0)) &&
        (value.color === undefined || colorIsValid(value.color))
      );
    case "image":
      return typeof value.imageId === "string" && rectangleIsPositive(value.box);
    default:
      return false;
  }
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
        message: JSON.stringify(input.op),
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

function unsupportedImageOperationDiagnostic(input: {
  readonly pageIndex: number;
  readonly opIndex: number;
  readonly imageId: PdfResourceId;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_UNSUPPORTED_IMAGE_OPERATION",
    title: "PDF image operations are not supported",
    message: "The minimal PDF writer cannot emit image operations yet.",
    labels: [
      {
        path: `pages.${input.pageIndex}.content.${input.opIndex}`,
        message: `page=${input.pageIndex}, resource=${input.imageId}`,
        severity: "primary",
      },
    ],
  });
}

function hasNonAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) {
      return true;
    }
  }

  return false;
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
      "The minimal PDF writer currently supports ASCII text only until font encoding and ToUnicode support exist.",
    labels: [
      {
        path: `pages.${input.pageIndex}.content.${input.opIndex}.text`,
        message: "text contains non-ASCII characters",
        severity: "primary",
      },
    ],
  });
}

function unsupportedMetadataEncodingDiagnostic(input: { readonly field: string }): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_PDF_MODEL_UNSUPPORTED_METADATA_ENCODING",
    title: "PDF metadata encoding is unsupported",
    message:
      "The minimal PDF writer currently supports ASCII metadata only until PDF string encoding support exists.",
    labels: [
      {
        path: `metadata.${input.field}`,
        message: "metadata contains non-ASCII characters",
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
    severity: "warning",
    code: input.code,
    title: "PDF projection used a fallback font",
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

export function validatePdfPageModel(model: PdfPageModel): Diagnostics {
  const issues: Diagnostic[] = [];
  const seenPageIds = new Set<string>();
  const resources = resourceIds(model.resources);

  (["producer", "title", "author", "subject"] as const).forEach((field) => {
    const value = model.metadata[field];
    if (value && hasNonAscii(value)) {
      issues.push(unsupportedMetadataEncodingDiagnostic({ field }));
    }
  });

  model.fallbacks.forEach((fallback, fallbackIndex) => {
    issues.push(
      fallbackDiagnostic({
        fallbackIndex,
        code: fallback.code,
        message: fallback.message,
      }),
    );
  });

  model.pages.forEach((page, pageIndex) => {
    const pageFontResourceNames = new Map<string, number>();

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
              message: page.id,
              severity: "primary",
            },
          ],
        }),
      );
    }
    seenPageIds.add(page.id);

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
              message: JSON.stringify(page.mediaBox),
              severity: "primary",
            },
          ],
        }),
      );
    }

    page.resources.fonts.forEach((fontId, resourceIndex) => {
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
      const font = model.resources.fonts.find((resource) => resource.id === fontId);
      if (font) {
        if (pageFontResourceNames.has(font.name)) {
          issues.push(
            duplicatePageFontResourceNameDiagnostic({
              pageIndex,
              resourceIndex,
              resourceName: font.name,
            }),
          );
        } else {
          pageFontResourceNames.set(font.name, resourceIndex);
        }
      }
    });
    page.resources.images.forEach((imageId, resourceIndex) => {
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
    });
    const pageFonts = new Set(page.resources.fonts);
    const pageImages = new Set(page.resources.images);

    page.content.forEach((op, opIndex) => {
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
      if (op.op === "text" && hasNonAscii(op.text)) {
        issues.push(unsupportedTextEncodingDiagnostic({ pageIndex, opIndex }));
      }
      if (op.op === "image") {
        issues.push(
          unsupportedImageOperationDiagnostic({
            pageIndex,
            opIndex,
            imageId: op.imageId,
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
    });
  });

  return createDiagnostics(issues);
}

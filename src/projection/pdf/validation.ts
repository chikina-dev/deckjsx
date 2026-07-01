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

export function validatePdfPageModel(model: PdfPageModel): Diagnostics {
  const issues: Diagnostic[] = [];
  const seenPageIds = new Set<string>();
  const resources = resourceIds(model.resources);

  model.pages.forEach((page, pageIndex) => {
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
    page.content.forEach((op, opIndex) => {
      if (!contentOpIsValid(op)) {
        issues.push(invalidContentOpDiagnostic({ pageIndex, opIndex, op }));
        return;
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
    });
  });

  return createDiagnostics(issues);
}

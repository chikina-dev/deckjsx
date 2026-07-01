import {
  createDiagnostics,
  diagnostic,
  type Diagnostic,
  type Diagnostics,
} from "../../diagnostics";
import type { PdfPageModel, PdfResourceDictionary } from "./model";
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

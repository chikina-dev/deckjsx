import { createDiagnostics, diagnostic, type Diagnostic } from "../diagnostics";
import type { AssetArtifact } from "../pipeline/artifacts";
import type { RenderedArtifact, RenderInspectionSummary } from "../pipeline/public";
import type { PdfDocumentModel, PdfImageResource } from "../projection/pdf/model";
import { pdfEmbeddableJpegImage } from "../projection/pdf/jpeg";
import { validatePdfPageModel } from "../projection/pdf/validation";
import type { PdfRenderOptions } from "../adapter/public";
import { writePdfDocument } from "./pdf/document";

export type PdfWriterContext = {
  readonly assetsById?: ReadonlyMap<NonNullable<PdfImageResource["assetEntityId"]>, AssetArtifact>;
};

export type PdfWriterResult = {
  readonly diagnostics: ReturnType<typeof createDiagnostics>;
  readonly artifact?: RenderedArtifact<"pdf">;
  readonly summary?: RenderInspectionSummary;
};

export type PdfImageAssetLoadRequirement = {
  readonly assetEntityId: NonNullable<PdfImageResource["assetEntityId"]>;
  readonly packagePartPath: string;
  readonly source: NonNullable<PdfImageResource["source"]>;
  readonly sourceField: NonNullable<PdfImageResource["sourceField"]>;
};

export function pdfImageAssetLoadRequirements(input: {
  readonly projection: PdfDocumentModel;
  readonly assetsById?: ReadonlyMap<NonNullable<PdfImageResource["assetEntityId"]>, AssetArtifact>;
}): readonly PdfImageAssetLoadRequirement[] {
  return input.projection.resources.images.flatMap((image) => {
    if (!image.assetEntityId || !image.source || !image.sourceField || image.data) {
      return [];
    }

    const current = input.assetsById?.get(image.assetEntityId);
    if (current?.load) {
      return [];
    }

    return [
      {
        assetEntityId: image.assetEntityId,
        packagePartPath: `pdf/images/${image.name ?? image.id}`,
        source: image.source,
        sourceField: image.sourceField,
      },
    ];
  });
}

function imageResourceWithLoadedAsset(
  image: PdfImageResource,
  context: PdfWriterContext | undefined,
): PdfImageResource {
  if (image.data || !image.assetEntityId) {
    return image;
  }

  const load = context?.assetsById?.get(image.assetEntityId)?.load;
  if (!load) {
    return image;
  }

  return {
    ...image,
    mediaType: load.mediaType ?? image.mediaType,
    width: load.width ?? image.width,
    height: load.height ?? image.height,
    data: load.bytes,
  };
}

function pdfDocumentWithLoadedAssets(
  projection: PdfDocumentModel,
  context: PdfWriterContext | undefined,
): PdfDocumentModel {
  if (!context?.assetsById) {
    return projection;
  }

  return {
    ...projection,
    resources: {
      ...projection.resources,
      images: projection.resources.images.map((image) =>
        imageResourceWithLoadedAsset(image, context),
      ),
    },
  };
}

function invalidEmbeddedJpegDiagnostics(projection: PdfDocumentModel): readonly Diagnostic[] {
  return projection.resources.images.flatMap((image, resourceIndex) => {
    const mediaType = image.mediaType?.split(";")[0]?.trim().toLowerCase();
    if (
      mediaType !== "image/jpeg" ||
      !(image.data instanceof Uint8Array) ||
      image.data.byteLength === 0 ||
      typeof image.name !== "string" ||
      image.name.length === 0 ||
      typeof image.width !== "number" ||
      !Number.isFinite(image.width) ||
      image.width <= 0 ||
      typeof image.height !== "number" ||
      !Number.isFinite(image.height) ||
      image.height <= 0
    ) {
      return [];
    }

    const jpeg = pdfEmbeddableJpegImage(image.data);
    if (jpeg && jpeg.width === image.width && jpeg.height === image.height) {
      return [];
    }

    return [
      diagnostic({
        severity: "error",
        code: "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
        title: "PDF image resource is not embeddable",
        message:
          "PDF image resources must include structurally valid JPEG or PNG bytes whose dimensions match the resource metadata.",
        labels: [
          {
            path: `resources.images.${resourceIndex}`,
            message: `resource=${image.id}`,
            severity: "primary",
          },
        ],
      }),
    ];
  });
}

export async function renderPdfDocument(
  projection: PdfDocumentModel,
  options: PdfRenderOptions = {},
  context?: PdfWriterContext,
): Promise<PdfWriterResult> {
  const renderProjection = pdfDocumentWithLoadedAssets(projection, context);
  const modelDiagnostics = validatePdfPageModel(renderProjection, { requireEmbeddedImages: true });
  const diagnostics = createDiagnostics([
    ...modelDiagnostics.items,
    ...invalidEmbeddedJpegDiagnostics(renderProjection),
  ]);
  if (diagnostics.hasErrors) {
    return { diagnostics };
  }
  const bytes = writePdfDocument(renderProjection);
  const artifact: RenderedArtifact<"pdf"> = {
    format: "pdf",
    mediaType: "application/pdf",
    extension: "pdf",
    bytes,
  };

  return {
    diagnostics,
    artifact,
    ...(options.inspection === "none" ? {} : { summary: pdfRenderSummary(artifact) }),
  };
}

export const renderPdfPageModel = renderPdfDocument;

function pdfRenderSummary(artifact: RenderedArtifact<"pdf">): RenderInspectionSummary {
  const expected = {
    path: "document.pdf",
    requirement: "required" as const,
    required: true,
    requirementReason: "PDF render emits a single document artifact.",
  };
  const final = {
    status: "rebuilt" as const,
    byteLength: artifact.bytes.byteLength,
    reason: "contentChanged",
    reasonDetails: { kind: "custom" as const, reason: "pdfDocumentSerialized" },
  };

  return {
    assembly: {
      entries: [
        {
          ...expected,
          ...final,
          expected,
          final,
        },
      ],
      entryCount: 1,
      rebuiltCount: 1,
      reusedCount: 0,
      missingCount: 0,
      failedCount: 0,
    },
  };
}

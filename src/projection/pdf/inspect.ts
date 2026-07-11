import type {
  ProjectInspectionAdapterLimitation,
  ProjectInspectionAssetResolutionSummary,
  ProjectInspectionComposedPaintOrderEntry,
  ProjectInspectionDetails,
  ProjectInspectionEffectiveProjectedStyleEntry,
  ProjectInspectionElementSummary,
  ProjectInspectionMediaMetrics,
  ProjectInspectionMediaSummary,
  ProjectInspectionSummary,
  ProjectInspectionResolvedValues,
  ProjectInspectionTextMetrics,
  ProjectInspectionUnsupportedSemanticRecord,
  ProjectInspectionVisualCheck,
} from "../pptx/model";
import type { Diagnostics } from "../../diagnostics";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../../types";
import { ELEMENT_DEFAULTS } from "../../style/defaults";
import type {
  PdfContentOp,
  PdfFallback,
  PdfImageResource,
  PdfPage,
  PdfPageModel,
  PdfVisualElement,
} from "./model";
import { comparePdfVisualsByPaintOrder } from "./lower";

const SMALL_MEDIA_EDGE_PT = POINTS_PER_INCH / 2;
const DEFAULT_TEXT_FONT_SIZE_PT = 12;
const DEFAULT_TEXT_FONT_FAMILY = ELEMENT_DEFAULTS.text.fontFamily;
const DEFAULT_LINE_HEIGHT_MULTIPLE = 1.2;
const SMALL_TEXT_THRESHOLD_PT = 9;

function pointToEmu(value: number): number {
  return Math.round((value / POINTS_PER_INCH) * EMU_PER_INCH);
}

type PdfInspectionElement = {
  readonly element: PdfVisualElement | PdfContentOp;
  readonly sourceIndex: number;
};

function pdfInspectionElementId(
  page: PdfPage,
  sourceIndex: number,
): ProjectInspectionElementSummary["id"] {
  return `${page.id}:element:${sourceIndex}` as ProjectInspectionElementSummary["id"];
}

function pdfElementKind(
  element: PdfVisualElement | PdfContentOp,
): ProjectInspectionElementSummary["kind"] {
  if ("kind" in element) {
    return element.kind as ProjectInspectionElementSummary["kind"];
  }
  if (element.op === "image" || element.op === "text") {
    return element.op as ProjectInspectionElementSummary["kind"];
  }
  if (element.op === "strokeLine") {
    return "line" as ProjectInspectionElementSummary["kind"];
  }
  return "shape" as ProjectInspectionElementSummary["kind"];
}

function textPreview(element: PdfVisualElement | PdfContentOp): string | undefined {
  return (("text" in element ? element.text : undefined) ?? undefined) || undefined;
}

function summarizePdfElement(input: {
  readonly page: PdfPage;
  readonly element: PdfVisualElement | PdfContentOp;
  readonly paintOrderIndex: number;
  readonly sourceIndex: number;
  readonly resources: PdfPageModel["resources"];
}): ProjectInspectionElementSummary {
  const textElement = pdfTextElementInfo(input.element);
  const imageElement = pdfImageElementInfo(input.element);
  const image = imageElement?.imageId
    ? input.resources.images.find((candidate) => candidate.id === imageElement.imageId)
    : undefined;
  const mediaMetrics = imageElement && image ? pdfImageMetrics({ imageElement, image }) : undefined;
  const frame = pdfElementFrame(input.element);

  return {
    id: pdfInspectionElementId(input.page, input.sourceIndex),
    kind: pdfElementKind(input.element),
    packagePartId: input.page.id as ProjectInspectionElementSummary["packagePartId"],
    ...(frame ? { frame } : {}),
    paintOrderIndex: input.paintOrderIndex,
    ...("paintOrder" in input.element
      ? { paintOrder: input.element.paintOrder as ProjectInspectionElementSummary["paintOrder"] }
      : {}),
    ...(textPreview(input.element) ? { textPreview: textPreview(input.element) } : {}),
    ...(textElement ? { textMetrics: pdfTextMetrics(textElement) } : {}),
    ...(mediaMetrics ? { mediaMetrics } : {}),
    ...("opacity" in input.element && input.element.opacity !== undefined
      ? { opacity: input.element.opacity }
      : {}),
    ...("rotation" in input.element && input.element.rotation !== undefined
      ? { rotation: input.element.rotation }
      : {}),
    ...("flipH" in input.element && input.element.flipH !== undefined
      ? { flipH: input.element.flipH }
      : {}),
    ...("flipV" in input.element && input.element.flipV !== undefined
      ? { flipV: input.element.flipV }
      : {}),
    origin: "origin" in input.element && input.element.origin ? input.element.origin : {},
  };
}

function pageElements(page: PdfPage): readonly PdfInspectionElement[] {
  if (!page.visuals?.length) {
    return page.content.map((element, sourceIndex) => ({ element, sourceIndex }));
  }

  return page.visuals
    .map((element, sourceIndex) => ({ element, sourceIndex }))
    .sort(
      (left, right) =>
        comparePdfVisualsByPaintOrder(left.element, right.element) ||
        left.sourceIndex - right.sourceIndex,
    );
}

function pdfResolvedTextStyle(
  element: PdfVisualElement | PdfContentOp,
): ProjectInspectionResolvedValues["textStyle"] | undefined {
  if (!("kind" in element) || element.kind !== "text") {
    return undefined;
  }

  return {
    ...(element.style.fontFamily !== undefined ? { fontFamily: element.style.fontFamily } : {}),
    ...(element.style.fontSize !== undefined ? { fontSizePt: element.style.fontSize } : {}),
    ...(element.style.charSpacing !== undefined ? { charSpacing: element.style.charSpacing } : {}),
    ...(element.style.textDirection !== undefined
      ? { textDirection: element.style.textDirection }
      : {}),
    ...(element.style.fit !== undefined ? { fit: element.style.fit } : {}),
    ...(element.style.wrap !== undefined ? { wrap: element.style.wrap } : {}),
  };
}

function pdfResolvedValues(
  element: PdfVisualElement | PdfContentOp,
): ProjectInspectionResolvedValues {
  const frame = pdfElementFrame(element);
  const textStyle = pdfResolvedTextStyle(element);
  return {
    ...(frame ? { frame } : {}),
    ...("opacity" in element && element.opacity !== undefined ? { opacity: element.opacity } : {}),
    ...("rotation" in element && element.rotation !== undefined
      ? { rotation: element.rotation }
      : {}),
    ...("flipH" in element && element.flipH !== undefined ? { flipH: element.flipH } : {}),
    ...("flipV" in element && element.flipV !== undefined ? { flipV: element.flipV } : {}),
    ...("paintOrder" in element && element.paintOrder.zIndex !== undefined
      ? { zIndex: element.paintOrder.zIndex }
      : {}),
    ...(textStyle ? { textStyle } : {}),
  };
}

function appendUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function collectPdfPaintFallbackAggregation(
  records: readonly ProjectInspectionUnsupportedSemanticRecord[],
): ProjectInspectionDetails["paintFallbackAggregation"] {
  type MutableEntry = {
    feature: ProjectInspectionUnsupportedSemanticRecord["feature"];
    property: ProjectInspectionUnsupportedSemanticRecord["property"];
    fallbackStrategy?: NonNullable<
      ProjectInspectionUnsupportedSemanticRecord["fallback"]
    >["strategy"];
    count: number;
    slidePartIds: ProjectInspectionUnsupportedSemanticRecord["slidePartId"][];
    slideIds: string[];
    elementIds: ProjectInspectionUnsupportedSemanticRecord["elementId"][];
    kinds: ProjectInspectionUnsupportedSemanticRecord["kind"][];
    values: string[];
    preserves: string[];
    missing: string[];
    reasons: string[];
    recordIndexes: number[];
  };
  const entriesByKey = new Map<string, MutableEntry>();

  records.forEach((record, recordIndex) => {
    const key = [record.feature, record.property, record.fallback?.strategy ?? ""].join("\u0000");
    let entry = entriesByKey.get(key);
    if (!entry) {
      entry = {
        feature: record.feature,
        property: record.property,
        ...(record.fallback?.strategy ? { fallbackStrategy: record.fallback.strategy } : {}),
        count: 0,
        slidePartIds: [],
        slideIds: [],
        elementIds: [],
        kinds: [],
        values: [],
        preserves: [],
        missing: [],
        reasons: [],
        recordIndexes: [],
      };
      entriesByKey.set(key, entry);
    }

    entry.count += 1;
    appendUnique(entry.slidePartIds, record.slidePartId);
    appendUnique(entry.slideIds, record.slideId);
    appendUnique(entry.elementIds, record.elementId);
    appendUnique(entry.kinds, record.kind);
    appendUnique(entry.values, record.value);
    appendUnique(entry.reasons, record.reason);
    entry.recordIndexes.push(recordIndex);
    record.fallback?.preserves.forEach((value) => appendUnique(entry.preserves, value));
    record.fallback?.missing.forEach((value) => appendUnique(entry.missing, value));
  });

  return { entries: [...entriesByKey.values()] };
}

function collectPdfComposedPaintOrder(
  model: PdfPageModel,
  options: { unsupportedSemantics: readonly ProjectInspectionUnsupportedSemanticRecord[] },
): ProjectInspectionDetails {
  return {
    composedPaintOrder: model.pages.map((page) => ({
      slidePartId: page.id as ProjectInspectionComposedPaintOrderEntry["slidePartId"],
      slideId: page.id,
      ...(page.name ? { name: page.name } : {}),
      entries: pageElements(page).map(({ element, sourceIndex }, paintOrderIndex) => {
        const frame = pdfElementFrame(element);
        return {
          source: "visualElement",
          order: paintOrderIndex,
          slidePartId: page.id as ProjectInspectionComposedPaintOrderEntry["slidePartId"],
          slideId: page.id,
          packagePartId: page.id as ProjectInspectionComposedPaintOrderEntry["packagePartId"],
          elementId: pdfInspectionElementId(
            page,
            sourceIndex,
          ) as ProjectInspectionComposedPaintOrderEntry["elementId"],
          kind: pdfElementKind(element),
          ...(frame ? { frame } : {}),
          paintOrderIndex,
          ...("paintOrder" in element
            ? {
                paintOrder:
                  element.paintOrder as ProjectInspectionComposedPaintOrderEntry["paintOrder"],
              }
            : {}),
          siblingPath: [sourceIndex],
          origin: "origin" in element && element.origin ? element.origin : {},
        };
      }),
    })),
    effectiveProjectedStyles: model.pages.map((page) => ({
      slidePartId: page.id as ProjectInspectionEffectiveProjectedStyleEntry["slidePartId"],
      slideId: page.id,
      ...(page.name ? { name: page.name } : {}),
      entries: pageElements(page).map(({ element, sourceIndex }, paintOrderIndex) => ({
        slidePartId: page.id as ProjectInspectionEffectiveProjectedStyleEntry["slidePartId"],
        slideId: page.id,
        packagePartId: page.id as ProjectInspectionEffectiveProjectedStyleEntry["packagePartId"],
        elementId: pdfInspectionElementId(
          page,
          sourceIndex,
        ) as ProjectInspectionEffectiveProjectedStyleEntry["elementId"],
        kind: pdfElementKind(element),
        depth: 0,
        siblingPath: [sourceIndex],
        paintOrderIndex,
        ...("paintOrder" in element
          ? {
              paintOrder:
                element.paintOrder as ProjectInspectionEffectiveProjectedStyleEntry["paintOrder"],
            }
          : {}),
        origin: "origin" in element && element.origin ? element.origin : {},
        values: pdfResolvedValues(element),
      })),
    })),
    packageDependencyInvalidation: { entries: [] },
    paintFallbackAggregation: collectPdfPaintFallbackAggregation(options.unsupportedSemantics),
    themeProjections: { entries: [] },
  };
}

function pdfImageSourceKind(
  image: PdfImageResource | undefined,
): ProjectInspectionMediaSummary["sourceKind"] | undefined {
  return image?.source?.kind === "bytes"
    ? "data"
    : (image?.source?.kind ?? (image?.data ? "data" : undefined));
}

function summarizePdfMedia(image: PdfImageResource): ProjectInspectionMediaSummary | undefined {
  const sourceKind = pdfImageSourceKind(image);
  if (!sourceKind) {
    return undefined;
  }
  const origin: ProjectInspectionMediaSummary["origin"] = image.assetEntityId
    ? { assetEntityIds: [image.assetEntityId] }
    : {};

  return {
    partId: image.id as ProjectInspectionMediaSummary["partId"],
    partPath: `pdf/images/${image.name ?? image.id}`,
    sourceKind,
    metadata: {
      ...(image.mediaType ? { mediaType: image.mediaType } : {}),
      ...(image.width !== undefined ? { widthPx: image.width } : {}),
      ...(image.height !== undefined ? { heightPx: image.height } : {}),
      ...(image.data ? { byteLength: image.data.byteLength } : {}),
    },
    origin,
  };
}

function pdfImageElementInfo(
  element: PdfVisualElement | PdfContentOp,
):
  | Pick<
      Extract<PdfVisualElement, { kind: "image" }>,
      "box" | "clipBox" | "fit" | "imageId" | "objectPosition"
    >
  | undefined {
  if ("kind" in element) {
    return element.kind === "image"
      ? {
          box: element.box,
          clipBox: element.clipBox,
          fit: element.fit,
          imageId: element.imageId,
          objectPosition: element.objectPosition,
        }
      : undefined;
  }

  return element.op === "image"
    ? { box: element.box, clipBox: element.clipBox, imageId: element.imageId }
    : undefined;
}

function pdfFrameFromBox(box: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): ProjectInspectionMediaMetrics["frame"] {
  return {
    xEmu: pointToEmu(box.x),
    yEmu: pointToEmu(box.y),
    widthEmu: pointToEmu(box.width),
    heightEmu: pointToEmu(box.height),
  };
}

function pdfElementFrame(
  element: PdfVisualElement | PdfContentOp,
): ProjectInspectionElementSummary["frame"] | undefined {
  if ("box" in element && element.box) {
    return pdfFrameFromBox(element.box);
  }

  if ("from" in element && "to" in element) {
    return pdfFrameFromBox({
      x: Math.min(element.from.x, element.to.x),
      y: Math.min(element.from.y, element.to.y),
      width: Math.abs(element.to.x - element.from.x),
      height: Math.abs(element.to.y - element.from.y),
    });
  }

  return undefined;
}

function pdfImageMetrics(input: {
  readonly imageElement: Pick<
    Extract<PdfVisualElement, { kind: "image" }>,
    "box" | "clipBox" | "fit" | "imageId" | "objectPosition"
  >;
  readonly image: PdfImageResource;
}): ProjectInspectionMediaMetrics | undefined {
  const sourceKind = pdfImageSourceKind(input.image);
  if (!sourceKind) {
    return undefined;
  }

  return {
    sourceKind,
    frame: pdfFrameFromBox(input.imageElement.clipBox ?? input.imageElement.box),
    sourceFrame: pdfFrameFromBox(input.imageElement.box),
    fit: input.imageElement.fit ?? (input.imageElement.clipBox ? "cover" : "stretch"),
    objectPosition: input.imageElement.objectPosition ?? { x: 0.5, y: 0.5 },
    cropped: input.imageElement.clipBox !== undefined,
  };
}

function pdfTextElementInfo(element: PdfVisualElement | PdfContentOp):
  | {
      readonly box?: { readonly width: number; readonly height: number };
      readonly fit?: ProjectInspectionTextMetrics["fit"];
      readonly fontFamily?: string;
      readonly fontId?: string;
      readonly fontSize: number;
      readonly textDirection?: ProjectInspectionTextMetrics["textDirection"];
      readonly text: string;
      readonly wrap?: boolean;
    }
  | undefined {
  if ("kind" in element) {
    return element.kind === "text"
      ? {
          box: element.box,
          fit: element.style.fit,
          fontFamily: element.style.fontFamily,
          fontId: element.fontId,
          fontSize: element.style.fontSize ?? DEFAULT_TEXT_FONT_SIZE_PT,
          textDirection: element.style.textDirection,
          text: element.text,
          wrap: element.style.wrap,
        }
      : undefined;
  }

  return element.op === "text"
    ? {
        box: element.box,
        fontId: element.fontId,
        fontSize: element.fontSize ?? DEFAULT_TEXT_FONT_SIZE_PT,
        text: element.text,
      }
    : undefined;
}

function pdfImageVisualChecks(input: {
  readonly page: PdfPage;
  readonly element: PdfVisualElement | PdfContentOp;
  readonly elementIndex: number;
  readonly image: PdfImageResource | undefined;
}): readonly ProjectInspectionVisualCheck[] {
  const imageElement = pdfImageElementInfo(input.element);
  if (!imageElement || !input.image) {
    return [];
  }

  const metrics = pdfImageMetrics({ imageElement, image: input.image });
  if (!metrics) {
    return [];
  }

  const checks: ProjectInspectionVisualCheck[] = [];
  const box = imageElement.box;
  if (box.width < SMALL_MEDIA_EDGE_PT || box.height < SMALL_MEDIA_EDGE_PT) {
    checks.push({
      severity: "warning",
      code: "W_VISUAL_MEDIA_SMALL",
      message:
        "Media is projected smaller than 0.5in on at least one edge; embedded labels may be hard to read.",
      slidePartId: input.page.id as ProjectInspectionVisualCheck["slidePartId"],
      slideId: input.page.id,
      elementId:
        `${input.page.id}:element:${input.elementIndex}` as ProjectInspectionVisualCheck["elementId"],
      kind: "image",
      metrics,
    });
  }

  if (metrics.cropped) {
    checks.push({
      severity: "info",
      code: "I_VISUAL_MEDIA_CROPPED",
      message: "Media uses a cropped or cover-style source frame in the projected PDF model.",
      slidePartId: input.page.id as ProjectInspectionVisualCheck["slidePartId"],
      slideId: input.page.id,
      elementId:
        `${input.page.id}:element:${input.elementIndex}` as ProjectInspectionVisualCheck["elementId"],
      kind: "image",
      metrics,
    });
  }

  return checks;
}

function pdfTextMetrics(textElement: {
  readonly box?: { readonly width: number; readonly height: number };
  readonly fit?: ProjectInspectionTextMetrics["fit"];
  readonly fontFamily?: string;
  readonly fontId?: string;
  readonly fontSize: number;
  readonly projectedFontFamily?: string;
  readonly textDirection?: ProjectInspectionTextMetrics["textDirection"];
  readonly text: string;
  readonly wrap?: boolean;
}): ProjectInspectionTextMetrics {
  const characterCount = Array.from(textElement.text).length;
  const lineHeightPt = textElement.fontSize * DEFAULT_LINE_HEIGHT_MULTIPLE;
  const availableWidthPt = textElement.box?.width ?? 0;
  const availableHeightPt = textElement.box?.height ?? lineHeightPt;
  const estimatedTextWidthPt = characterCount * textElement.fontSize * 0.5;
  const wrap = textElement.wrap ?? true;
  return {
    characterCount,
    ...(textElement.fontFamily !== undefined
      ? { requestedFontFamily: textElement.fontFamily }
      : {}),
    ...(textElement.projectedFontFamily !== undefined
      ? { projectedFontFamily: textElement.projectedFontFamily }
      : {}),
    ...(textElement.fontId !== undefined ? { fontResourceId: textElement.fontId } : {}),
    ...(textElement.textDirection !== undefined
      ? { textDirection: textElement.textDirection }
      : {}),
    fontSizePt: textElement.fontSize,
    lineHeightPt,
    availableWidthPt,
    availableHeightPt,
    estimatedTextWidthPt,
    estimatedLineCount:
      wrap && availableWidthPt > 0
        ? Math.max(1, Math.ceil(estimatedTextWidthPt / availableWidthPt))
        : 1,
    estimatedLineCapacity:
      lineHeightPt > 0 ? Math.max(1, Math.floor(availableHeightPt / lineHeightPt)) : 1,
    fit: textElement.fit ?? "none",
    wrap,
  };
}

function pdfTextVisualChecks(input: {
  readonly page: PdfPage;
  readonly element: PdfVisualElement | PdfContentOp;
  readonly elementIndex: number;
  readonly resources: PdfPageModel["resources"];
}): readonly ProjectInspectionVisualCheck[] {
  const textElement = pdfTextElementInfo(input.element);
  if (!textElement) {
    return [];
  }

  const font = textElement.fontId
    ? input.resources.fonts.find((candidate) => candidate.id === textElement.fontId)
    : undefined;
  const requestedFontFamily = textElement.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY;
  const metrics = pdfTextMetrics({
    ...textElement,
    ...(requestedFontFamily !== undefined ? { fontFamily: requestedFontFamily } : {}),
    ...(font?.family !== undefined ? { projectedFontFamily: font.family } : {}),
  });
  const checks: ProjectInspectionVisualCheck[] = [];
  if (
    requestedFontFamily !== undefined &&
    font?.family !== undefined &&
    requestedFontFamily !== font.family
  ) {
    checks.push({
      severity: "info",
      code: "I_VISUAL_TEXT_FONT_SUBSTITUTED",
      message: `Text requested font family "${requestedFontFamily}" but PDF projected font family "${font.family}".`,
      slidePartId: input.page.id as ProjectInspectionVisualCheck["slidePartId"],
      slideId: input.page.id,
      elementId:
        `${input.page.id}:element:${input.elementIndex}` as ProjectInspectionVisualCheck["elementId"],
      kind: "text",
      textPreview: textElement.text.slice(0, 80),
      metrics,
    });
  }

  if (textElement.fontSize < SMALL_TEXT_THRESHOLD_PT) {
    checks.push({
      severity: "warning",
      code: "W_VISUAL_TEXT_SMALL",
      message: `Text uses ${textElement.fontSize}pt type, which may be hard to read in the generated PDF.`,
      slidePartId: input.page.id as ProjectInspectionVisualCheck["slidePartId"],
      slideId: input.page.id,
      elementId:
        `${input.page.id}:element:${input.elementIndex}` as ProjectInspectionVisualCheck["elementId"],
      kind: "text",
      textPreview: textElement.text.slice(0, 80),
      metrics,
    });
  }

  const textMayOverflow =
    metrics.estimatedLineCount > metrics.estimatedLineCapacity ||
    (!metrics.wrap &&
      metrics.availableWidthPt > 0 &&
      metrics.estimatedTextWidthPt > metrics.availableWidthPt) ||
    metrics.availableHeightPt < metrics.lineHeightPt;

  if (textMayOverflow) {
    const shrink = metrics.fit === "shrink";
    const resize = metrics.fit === "resize";
    checks.push({
      severity: "warning",
      code: shrink
        ? "W_VISUAL_TEXT_MAY_SHRINK"
        : resize
          ? "W_VISUAL_TEXT_MAY_RESIZE"
          : "W_VISUAL_TEXT_MAY_OVERFLOW",
      message: shrink
        ? "Text is estimated to need more lines than the box can hold, so PDF fit may shrink it."
        : resize
          ? "Text is estimated to need more lines than the resized PDF text box can hold."
          : "Text is estimated to need more lines than the box can hold and may overflow or clip.",
      slidePartId: input.page.id as ProjectInspectionVisualCheck["slidePartId"],
      slideId: input.page.id,
      elementId:
        `${input.page.id}:element:${input.elementIndex}` as ProjectInspectionVisualCheck["elementId"],
      kind: "text",
      textPreview: textElement.text.slice(0, 80),
      metrics,
    });
  }

  return checks;
}

function collectPdfVisualChecks(input: {
  readonly page: PdfPage;
  readonly resources: PdfPageModel["resources"];
}): readonly ProjectInspectionVisualCheck[] {
  return pageElements(input.page).flatMap(({ element, sourceIndex }) => {
    const imageId = pdfImageElementInfo(element)?.imageId;
    const image = imageId
      ? input.resources.images.find((candidate) => candidate.id === imageId)
      : undefined;
    return [
      ...pdfImageVisualChecks({ page: input.page, element, elementIndex: sourceIndex, image }),
      ...pdfTextVisualChecks({
        page: input.page,
        element,
        elementIndex: sourceIndex,
        resources: input.resources,
      }),
    ];
  });
}

type PdfUnsupportedSemanticSummary = ProjectInspectionUnsupportedSemanticRecord & {
  readonly code: string;
  readonly message: string;
};

function summarizePdfUnsupportedSemanticFallback(input: {
  readonly fallback: PdfFallback;
  readonly fallbackIndex: number;
  readonly model: PdfPageModel;
}): PdfUnsupportedSemanticSummary | undefined {
  if (input.fallback.code !== "W_PDF_UNSUPPORTED_SEMANTIC" || !input.fallback.semantic) {
    return undefined;
  }

  const page =
    input.model.pages.find((candidate) => candidate.id === input.fallback.pageId) ??
    input.model.pages[0];
  if (!page) {
    return undefined;
  }

  return {
    ...input.fallback.semantic,
    code: input.fallback.code,
    message: input.fallback.message,
    elementId: (input.fallback.nodeId ??
      `${page.id}:fallback:${input.fallbackIndex}`) as PdfUnsupportedSemanticSummary["elementId"],
    kind: input.fallback.kind ?? "shape",
    packagePartId: page.id as PdfUnsupportedSemanticSummary["packagePartId"],
    slidePartId: page.id as PdfUnsupportedSemanticSummary["slidePartId"],
    slideId: page.id,
    origin: input.fallback.origin ?? {},
  };
}

export function summarizePdfPageModel(
  model: PdfPageModel,
  options: {
    readonly diagnostics?: Diagnostics;
    readonly adapterLimitations?: readonly ProjectInspectionAdapterLimitation[];
    readonly assetResolutions?: readonly ProjectInspectionAssetResolutionSummary[];
    readonly includeDetails?: boolean;
  } = {},
): ProjectInspectionSummary {
  const unsupportedSemantics = model.fallbacks.flatMap(
    (fallback, fallbackIndex) =>
      summarizePdfUnsupportedSemanticFallback({ fallback, fallbackIndex, model }) ?? [],
  );

  return {
    format: "pdf",
    parts: [],
    relationships: [],
    packageDependencies: [],
    assetResolutions: options.assetResolutions ?? [],
    media: model.resources.images.flatMap((image) => summarizePdfMedia(image) ?? []),
    filtered: [],
    unsupportedSemantics,
    slides: model.pages.map((page) => ({
      partId: page.id as ProjectInspectionSummary["slides"][number]["partId"],
      slideId: page.id,
      name: page.name ?? `Page ${page.index + 1}`,
      elements: pageElements(page).map(({ element, sourceIndex }, paintOrderIndex) =>
        summarizePdfElement({
          page,
          element,
          paintOrderIndex,
          sourceIndex,
          resources: model.resources,
        }),
      ),
      visualChecks: collectPdfVisualChecks({ page, resources: model.resources }),
    })),
    pptx: {
      packageParts: [],
      relationshipCount: 0,
      packageDependencyCount: 0,
    },
    diagnostics:
      options.diagnostics?.items.map((item) => ({
        severity: item.severity,
        code: item.code,
        title: item.title,
      })) ?? [],
    adapterLimitations: options.adapterLimitations ?? [],
    ...(options.includeDetails
      ? { details: collectPdfComposedPaintOrder(model, { unsupportedSemantics }) }
      : {}),
  };
}

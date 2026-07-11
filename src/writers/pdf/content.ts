import type {
  PdfBlendMode,
  PdfFontResource,
  PdfGradientResource,
  PdfImageResource,
  PdfPage,
  PdfResourceDictionary,
  PdfStrokeDash,
  PdfStrokeLineCap,
  PdfStrokeLineJoin,
  PdfTextOp,
} from "../../projection/pdf/model";
import { pdfLiteralString, pdfName, pdfNumber, pdfTextString, pdfUtf16BeHex } from "./objects";

export type PdfIdentityHTextEncoding = {
  readonly cidByCodePoint: ReadonlyMap<number, number>;
  readonly cidByGlyphKey: ReadonlyMap<string, number>;
};

function fontById(
  resources: PdfResourceDictionary,
  id: string | undefined,
): PdfFontResource | undefined {
  if (!id) {
    return undefined;
  }

  return resources.fonts.find((font) => font.id === id);
}

function firstPageFont(
  page: PdfPage,
  resources: PdfResourceDictionary,
): PdfFontResource | undefined {
  const pageFontIds = new Set(page.resources.fonts);
  return resources.fonts.find((font) => pageFontIds.has(font.id));
}

function textFont(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
  readonly fontId?: string;
}): PdfFontResource | undefined {
  return fontById(input.resources, input.fontId) ?? firstPageFont(input.page, input.resources);
}

function imageById(
  resources: PdfResourceDictionary,
  id: string | undefined,
): PdfImageResource | undefined {
  if (!id) {
    return undefined;
  }

  return resources.images.find((image) => image.id === id);
}

function gradientById(
  resources: PdfResourceDictionary,
  id: string | undefined,
): PdfGradientResource | undefined {
  if (!id) {
    return undefined;
  }

  return resources.gradients?.find((gradient) => gradient.id === id);
}

function rgbColor(input: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `${pdfNumber(input.r)} ${pdfNumber(input.g)} ${pdfNumber(input.b)} rg`;
}

function strokeRgbColor(input: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): string {
  return `${pdfNumber(input.r)} ${pdfNumber(input.g)} ${pdfNumber(input.b)} RG`;
}

export function pdfGraphicsStateName(
  opacity: number | undefined,
  blendMode?: PdfBlendMode,
): string {
  const scaledOpacity = opacity === undefined ? undefined : opacity * 1000;
  const roundedOpacity = scaledOpacity === undefined ? undefined : Math.round(scaledOpacity);
  const hasThreeDigitOpacity =
    scaledOpacity !== undefined &&
    roundedOpacity !== undefined &&
    Math.abs(scaledOpacity - roundedOpacity) < 1e-9;
  const opacityPart =
    opacity !== undefined && opacity < 1
      ? hasThreeDigitOpacity
        ? roundedOpacity!.toString().padStart(3, "0")
        : `x${opacity.toString().replaceAll("-", "m").replaceAll("+", "p").replaceAll(".", "d")}`
      : "";
  return `GS${opacityPart}${blendMode ?? ""}`;
}

function pushWithGraphicsState(
  lines: string[],
  state: { readonly opacity?: number; readonly blendMode?: PdfBlendMode },
  emit: () => void,
): void {
  if ((state.opacity === undefined || state.opacity >= 1) && state.blendMode === undefined) {
    emit();
    return;
  }

  lines.push("q");
  lines.push(`${pdfName(pdfGraphicsStateName(state.opacity, state.blendMode))} gs`);
  emit();
  lines.push("Q");
}

function pointX(page: PdfPage, x: number): number {
  return page.mediaBox.x + x;
}

function pointY(page: PdfPage, y: number): number {
  return page.mediaBox.y + page.mediaBox.height - y;
}

function rectBottom(page: PdfPage, box: PdfBox): number {
  return pointY(page, box.y + box.height);
}

type PdfBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

function pushWithTransform(
  lines: string[],
  page: PdfPage,
  box: PdfBox,
  transform: {
    readonly rotation?: number;
    readonly flipH?: boolean;
    readonly flipV?: boolean;
  },
  emit: () => void,
): void {
  const rotation =
    transform.rotation !== undefined && Number.isFinite(transform.rotation)
      ? transform.rotation
      : 0;
  const hasRotation = rotation % 360 !== 0;
  const scaleX = transform.flipH ? -1 : 1;
  const scaleY = transform.flipV ? -1 : 1;
  if (!hasRotation && scaleX === 1 && scaleY === 1) {
    emit();
    return;
  }

  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const a = cos * scaleX;
  const b = sin * scaleX;
  const c = -sin * scaleY;
  const d = cos * scaleY;
  const centerX = pointX(page, box.x + box.width / 2);
  const centerY = pointY(page, box.y + box.height / 2);
  const translateX = centerX - a * centerX - c * centerY;
  const translateY = centerY - b * centerX - d * centerY;

  lines.push("q");
  lines.push(
    `${pdfNumber(a)} ${pdfNumber(b)} ${pdfNumber(c)} ${pdfNumber(d)} ${pdfNumber(
      translateX,
    )} ${pdfNumber(translateY)} cm`,
  );
  emit();
  lines.push("Q");
}

function rectPath(page: PdfPage, box: PdfBox): string {
  return `${pdfNumber(pointX(page, box.x))} ${pdfNumber(rectBottom(page, box))} ${pdfNumber(
    box.width,
  )} ${pdfNumber(box.height)} re`;
}

function ellipsePath(page: PdfPage, box: PdfBox): readonly string[] {
  const kappa = 0.5522847498307936;
  const radiusX = box.width / 2;
  const radiusY = box.height / 2;
  const centerX = pointX(page, box.x + radiusX);
  const centerY = pointY(page, box.y + radiusY);
  const controlX = radiusX * kappa;
  const controlY = radiusY * kappa;

  return [
    `${pdfNumber(centerX + radiusX)} ${pdfNumber(centerY)} m`,
    `${pdfNumber(centerX + radiusX)} ${pdfNumber(centerY + controlY)} ${pdfNumber(
      centerX + controlX,
    )} ${pdfNumber(centerY + radiusY)} ${pdfNumber(centerX)} ${pdfNumber(centerY + radiusY)} c`,
    `${pdfNumber(centerX - controlX)} ${pdfNumber(centerY + radiusY)} ${pdfNumber(
      centerX - radiusX,
    )} ${pdfNumber(centerY + controlY)} ${pdfNumber(centerX - radiusX)} ${pdfNumber(centerY)} c`,
    `${pdfNumber(centerX - radiusX)} ${pdfNumber(centerY - controlY)} ${pdfNumber(
      centerX - controlX,
    )} ${pdfNumber(centerY - radiusY)} ${pdfNumber(centerX)} ${pdfNumber(centerY - radiusY)} c`,
    `${pdfNumber(centerX + controlX)} ${pdfNumber(centerY - radiusY)} ${pdfNumber(
      centerX + radiusX,
    )} ${pdfNumber(centerY - controlY)} ${pdfNumber(centerX + radiusX)} ${pdfNumber(centerY)} c`,
  ];
}

function roundRectPath(page: PdfPage, box: PdfBox, radius: number): readonly string[] {
  const kappa = 0.5522847498307936;
  const left = pointX(page, box.x);
  const right = pointX(page, box.x + box.width);
  const bottom = rectBottom(page, box);
  const top = bottom + box.height;
  const cornerRadius = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  const control = cornerRadius * kappa;

  if (cornerRadius === 0) {
    return [rectPath(page, box)];
  }

  return [
    `${pdfNumber(left + cornerRadius)} ${pdfNumber(top)} m`,
    `${pdfNumber(right - cornerRadius)} ${pdfNumber(top)} l`,
    `${pdfNumber(right - cornerRadius + control)} ${pdfNumber(top)} ${pdfNumber(right)} ${pdfNumber(
      top - cornerRadius + control,
    )} ${pdfNumber(right)} ${pdfNumber(top - cornerRadius)} c`,
    `${pdfNumber(right)} ${pdfNumber(bottom + cornerRadius)} l`,
    `${pdfNumber(right)} ${pdfNumber(bottom + cornerRadius - control)} ${pdfNumber(
      right - cornerRadius + control,
    )} ${pdfNumber(bottom)} ${pdfNumber(right - cornerRadius)} ${pdfNumber(bottom)} c`,
    `${pdfNumber(left + cornerRadius)} ${pdfNumber(bottom)} l`,
    `${pdfNumber(left + cornerRadius - control)} ${pdfNumber(bottom)} ${pdfNumber(left)} ${pdfNumber(
      bottom + cornerRadius - control,
    )} ${pdfNumber(left)} ${pdfNumber(bottom + cornerRadius)} c`,
    `${pdfNumber(left)} ${pdfNumber(top - cornerRadius)} l`,
    `${pdfNumber(left)} ${pdfNumber(top - cornerRadius + control)} ${pdfNumber(
      left + cornerRadius - control,
    )} ${pdfNumber(top)} ${pdfNumber(left + cornerRadius)} ${pdfNumber(top)} c`,
    "h",
  ];
}

function pushWithClip(
  lines: string[],
  page: PdfPage,
  clip: {
    readonly clipBox?: PdfBox;
    readonly clipRadius?: number;
    readonly clipShape?: "ellipse";
  },
  emit: () => void,
): void {
  if (!clip.clipBox) {
    emit();
    return;
  }

  lines.push("q");
  lines.push(
    ...(clip.clipShape === "ellipse"
      ? ellipsePath(page, clip.clipBox)
      : clip.clipRadius !== undefined
        ? roundRectPath(page, clip.clipBox, clip.clipRadius)
        : [rectPath(page, clip.clipBox)]),
  );
  lines.push("W");
  lines.push("n");
  emit();
  lines.push("Q");
}

function pushWithClipAndTransform(
  lines: string[],
  page: PdfPage,
  transformBox: PdfBox,
  operation: {
    readonly clipBox?: PdfBox;
    readonly clipRadius?: number;
    readonly clipShape?: "ellipse";
    readonly rotation?: number;
    readonly flipH?: boolean;
    readonly flipV?: boolean;
  },
  emit: () => void,
): void {
  pushWithClip(lines, page, operation, () => {
    pushWithTransform(
      lines,
      page,
      transformBox,
      { rotation: operation.rotation, flipH: operation.flipH, flipV: operation.flipV },
      emit,
    );
  });
}

function strokeDashPattern(dash: PdfStrokeDash, lineWidth: number): string {
  switch (dash) {
    case "dash":
      return `[${pdfNumber(lineWidth * 3)} ${pdfNumber(lineWidth * 3)}] 0 d`;
    case "sysDot":
      return `[${pdfNumber(lineWidth)} ${pdfNumber(lineWidth * 2)}] 0 d`;
  }
}

function pushStrokeDash(lines: string[], dash: PdfStrokeDash | undefined, lineWidth: number): void {
  if (dash) {
    lines.push(strokeDashPattern(dash, lineWidth));
  }
}

function resetStrokeDash(lines: string[], dash: PdfStrokeDash | undefined): void {
  if (dash) {
    lines.push("[] 0 d");
  }
}

function strokeLineCapValue(lineCap: PdfStrokeLineCap): number {
  switch (lineCap) {
    case "butt":
      return 0;
    case "round":
      return 1;
    case "square":
      return 2;
  }
}

function strokeLineJoinValue(lineJoin: PdfStrokeLineJoin): number {
  switch (lineJoin) {
    case "miter":
      return 0;
    case "round":
      return 1;
    case "bevel":
      return 2;
  }
}

function pushStrokeLineStyle(
  lines: string[],
  input: {
    readonly lineCap?: PdfStrokeLineCap;
    readonly lineJoin?: PdfStrokeLineJoin;
  },
): void {
  if (input.lineCap) {
    lines.push(`${pdfNumber(strokeLineCapValue(input.lineCap))} J`);
  }
  if (input.lineJoin) {
    lines.push(`${pdfNumber(strokeLineJoinValue(input.lineJoin))} j`);
  }
}

function resetStrokeLineStyle(
  lines: string[],
  input: {
    readonly lineCap?: PdfStrokeLineCap;
    readonly lineJoin?: PdfStrokeLineJoin;
  },
): void {
  if (input.lineCap) {
    lines.push("0 J");
  }
  if (input.lineJoin) {
    lines.push("0 j");
  }
}

function pdfCidHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

function pdfIdentityHTextHex(
  text: string,
  encoding: PdfIdentityHTextEncoding | undefined,
  glyphs: PdfTextOp["glyphs"] | undefined,
): string | undefined {
  if (!encoding) {
    return undefined;
  }

  if (glyphs) {
    let encoded = "";
    for (const glyph of glyphs) {
      const cid = encoding.cidByGlyphKey.get(`${glyph.glyphId}:${glyph.unicode}`);
      if (cid === undefined) {
        return undefined;
      }
      encoded += pdfCidHex(cid);
    }
    return `<${encoded}>`;
  }

  let encoded = "";
  for (const character of Array.from(text)) {
    const codePoint = character.codePointAt(0);
    const cid = codePoint === undefined ? undefined : encoding.cidByCodePoint.get(codePoint);
    if (cid === undefined) {
      return undefined;
    }
    encoded += pdfCidHex(cid);
  }

  return `<${encoded}>`;
}

function pdfTextShowOperator(input: {
  readonly operation: PdfTextOp;
  readonly identityHTextEncoding?: PdfIdentityHTextEncoding;
}): string {
  const textToken = (text: string): string =>
    input.operation.textEncoding === "utf16be"
      ? (pdfIdentityHTextHex(text, input.identityHTextEncoding, undefined) ?? pdfUtf16BeHex(text))
      : pdfLiteralString(text);
  if (input.operation.glyphs && input.operation.textEncoding === "utf16be") {
    const operands = input.operation.glyphs.flatMap((glyph) => [
      pdfIdentityHTextHex(glyph.unicode, input.identityHTextEncoding, [glyph]) ??
        pdfUtf16BeHex(glyph.unicode),
      ...(glyph.advanceAdjustment ? [-glyph.advanceAdjustment] : []),
    ]);
    return `[${operands.join(" ")}] TJ`;
  }
  const adjustments = input.operation.kerningAdjustments;
  const characters = Array.from(input.operation.text);
  if (
    !adjustments ||
    adjustments.length !== Math.max(0, characters.length - 1) ||
    adjustments.every((adjustment) => adjustment === 0)
  ) {
    return `${textToken(input.operation.text)} Tj`;
  }

  const operands = characters.flatMap((character, index) => {
    const adjustment = adjustments[index];
    return adjustment === undefined || adjustment === 0
      ? [textToken(character)]
      : [textToken(character), pdfNumber(-adjustment)];
  });
  return `[${operands.join(" ")}] TJ`;
}

function pdfPositionedGlyphOperators(input: {
  readonly page: PdfPage;
  readonly operation: PdfTextOp;
  readonly fontSize: number;
  readonly baselineY: number;
  readonly identityHTextEncoding?: PdfIdentityHTextEncoding;
}): readonly string[] | undefined {
  const glyphs = input.operation.glyphs;
  if (
    input.operation.textEncoding !== "utf16be" ||
    !glyphs ||
    !glyphs.some((glyph) => glyph.xOffset !== undefined || glyph.yOffset !== undefined)
  ) {
    return undefined;
  }

  const charSpacingUnits = ((input.operation.charSpacing ?? 0) / input.fontSize) * 1000;
  let penOffset = 0;
  return glyphs.flatMap((glyph, index) => {
    const token =
      pdfIdentityHTextHex(glyph.unicode, input.identityHTextEncoding, [glyph]) ??
      pdfUtf16BeHex(glyph.unicode);
    const x =
      pointX(input.page, input.operation.x) +
      ((penOffset + (glyph.xOffset ?? 0)) * input.fontSize) / 1000;
    const y = input.baselineY + ((glyph.yOffset ?? 0) * input.fontSize) / 1000;
    penOffset += glyph.advanceWidth ?? 0;
    if (index < glyphs.length - 1) {
      penOffset += charSpacingUnits;
    }
    return [`1 0 0 1 ${pdfNumber(x)} ${pdfNumber(y)} Tm`, `${token} Tj`];
  });
}

export function renderPdfContentStream(
  page: PdfPage,
  resources: PdfResourceDictionary,
  options: {
    readonly identityHTextEncodings?: ReadonlyMap<string, PdfIdentityHTextEncoding>;
  } = {},
): string {
  const lines: string[] = [];

  page.content.forEach((operation) => {
    switch (operation.op) {
      case "setFillColor":
        lines.push(rgbColor(operation.color));
        break;
      case "setStrokeColor":
        lines.push(strokeRgbColor(operation.color));
        break;
      case "setLineWidth":
        lines.push(`${pdfNumber(operation.width)} w`);
        break;
      case "fillRect":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push(rectPath(page, operation.box));
                lines.push("f");
              },
            );
          },
        );
        break;
      case "fillEllipse":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push(...ellipsePath(page, operation.box));
                lines.push("f");
              },
            );
          },
        );
        break;
      case "fillRoundRect":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push(...roundRectPath(page, operation.box, operation.radius));
                lines.push("f");
              },
            );
          },
        );
        break;
      case "fillLinearGradientRect": {
        const gradient = gradientById(resources, operation.gradientId);
        const gradientName = pdfName(gradient?.name ?? "P");
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push("/Pattern cs");
                lines.push(`${gradientName} scn`);
                lines.push(rectPath(page, operation.box));
                lines.push("f");
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "fillLinearGradientEllipse": {
        const gradient = gradientById(resources, operation.gradientId);
        const gradientName = pdfName(gradient?.name ?? "P");
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push("/Pattern cs");
                lines.push(`${gradientName} scn`);
                lines.push(...ellipsePath(page, operation.box));
                lines.push("f");
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "fillLinearGradientRoundRect": {
        const gradient = gradientById(resources, operation.gradientId);
        const gradientName = pdfName(gradient?.name ?? "P");
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push("/Pattern cs");
                lines.push(`${gradientName} scn`);
                lines.push(...roundRectPath(page, operation.box, operation.radius));
                lines.push("f");
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "fillRadialGradientRect": {
        const gradient = gradientById(resources, operation.gradientId);
        const gradientName = pdfName(gradient?.name ?? "P");
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push("/Pattern cs");
                lines.push(`${gradientName} scn`);
                lines.push(rectPath(page, operation.box));
                lines.push("f");
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "fillRadialGradientEllipse": {
        const gradient = gradientById(resources, operation.gradientId);
        const gradientName = pdfName(gradient?.name ?? "P");
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push("/Pattern cs");
                lines.push(`${gradientName} scn`);
                lines.push(...ellipsePath(page, operation.box));
                lines.push("f");
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "fillRadialGradientRoundRect": {
        const gradient = gradientById(resources, operation.gradientId);
        const gradientName = pdfName(gradient?.name ?? "P");
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push("/Pattern cs");
                lines.push(`${gradientName} scn`);
                lines.push(...roundRectPath(page, operation.box, operation.radius));
                lines.push("f");
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "strokeRect":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                const lineWidth = operation.lineWidth ?? 1;
                lines.push(`${pdfNumber(lineWidth)} w`);
                pushStrokeDash(lines, operation.dash, lineWidth);
                pushStrokeLineStyle(lines, operation);
                lines.push(rectPath(page, operation.box));
                lines.push("S");
                resetStrokeLineStyle(lines, operation);
                resetStrokeDash(lines, operation.dash);
              },
            );
          },
        );
        break;
      case "strokeEllipse":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                const lineWidth = operation.lineWidth ?? 1;
                lines.push(`${pdfNumber(lineWidth)} w`);
                pushStrokeDash(lines, operation.dash, lineWidth);
                pushStrokeLineStyle(lines, operation);
                lines.push(...ellipsePath(page, operation.box));
                lines.push("S");
                resetStrokeLineStyle(lines, operation);
                resetStrokeDash(lines, operation.dash);
              },
            );
          },
        );
        break;
      case "strokeRoundRect":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                const lineWidth = operation.lineWidth ?? 1;
                lines.push(`${pdfNumber(lineWidth)} w`);
                pushStrokeDash(lines, operation.dash, lineWidth);
                pushStrokeLineStyle(lines, operation);
                lines.push(...roundRectPath(page, operation.box, operation.radius));
                lines.push("S");
                resetStrokeLineStyle(lines, operation);
                resetStrokeDash(lines, operation.dash);
              },
            );
          },
        );
        break;
      case "strokeLine":
        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            const emit = () => {
              lines.push(strokeRgbColor(operation.color));
              lines.push(`${pdfNumber(operation.lineWidth)} w`);
              pushStrokeDash(lines, operation.dash, operation.lineWidth);
              pushStrokeLineStyle(lines, operation);
              lines.push(
                `${pdfNumber(pointX(page, operation.from.x))} ${pdfNumber(pointY(page, operation.from.y))} m`,
              );
              lines.push(
                `${pdfNumber(pointX(page, operation.to.x))} ${pdfNumber(pointY(page, operation.to.y))} l`,
              );
              lines.push("S");
              resetStrokeLineStyle(lines, operation);
              resetStrokeDash(lines, operation.dash);
            };
            const emitWithTransform = () => {
              if (operation.rotationBox) {
                pushWithTransform(
                  lines,
                  page,
                  operation.rotationBox,
                  { rotation: operation.rotation, flipH: operation.flipH, flipV: operation.flipV },
                  emit,
                );
                return;
              }

              emit();
            };
            pushWithClip(lines, page, { clipBox: operation.clipBox }, emitWithTransform);
          },
        );
        break;
      case "image": {
        const image = imageById(resources, operation.imageId);
        const imageName = pdfName(image?.name ?? "Im");
        const imageY = rectBottom(page, operation.box);

        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? operation.box,
              operation,
              () => {
                lines.push("q");
                lines.push(
                  `${pdfNumber(operation.box.width)} 0 0 ${pdfNumber(operation.box.height)} ${pdfNumber(
                    pointX(page, operation.box.x),
                  )} ${pdfNumber(imageY)} cm`,
                );
                lines.push(`${imageName} Do`);
                lines.push("Q");
              },
            );
          },
        );
        break;
      }
      case "text": {
        const font = textFont({ page, resources, fontId: operation.fontId });
        const resourceName = pdfName(font?.name ?? "F1");
        const fontSize = operation.fontSize ?? 12;
        const baselineY = pointY(page, operation.y + fontSize);
        const textBox = operation.box ?? {
          x: operation.x,
          y: operation.y,
          width: 0,
          height: fontSize,
        };

        pushWithGraphicsState(
          lines,
          { opacity: operation.opacity, blendMode: operation.blendMode },
          () => {
            pushWithClipAndTransform(
              lines,
              page,
              operation.rotationBox ?? textBox,
              operation,
              () => {
                if (operation.actualText) {
                  lines.push(`/Span << /ActualText ${pdfTextString(operation.actualText)} >> BDC`);
                }
                lines.push("BT");
                lines.push(operation.color ? rgbColor(operation.color) : "0 0 0 rg");
                lines.push(`${resourceName} ${pdfNumber(fontSize)} Tf`);
                if (operation.charSpacing !== undefined) {
                  lines.push(`${pdfNumber(operation.charSpacing)} Tc`);
                }
                if (operation.textRise !== undefined) {
                  lines.push(`${pdfNumber(operation.textRise)} Ts`);
                }
                const identityHTextEncoding = font?.id
                  ? options.identityHTextEncodings?.get(font.id)
                  : undefined;
                const positionedGlyphOperators = pdfPositionedGlyphOperators({
                  page,
                  operation,
                  fontSize,
                  baselineY,
                  ...(identityHTextEncoding ? { identityHTextEncoding } : {}),
                });
                if (positionedGlyphOperators) {
                  lines.push(...positionedGlyphOperators);
                } else {
                  lines.push(
                    `1 0 0 1 ${pdfNumber(pointX(page, operation.x))} ${pdfNumber(baselineY)} Tm`,
                  );
                  lines.push(
                    pdfTextShowOperator({
                      operation,
                      ...(identityHTextEncoding ? { identityHTextEncoding } : {}),
                    }),
                  );
                }
                if (operation.textRise !== undefined) {
                  lines.push("0 Ts");
                }
                if (operation.charSpacing !== undefined) {
                  lines.push("0 Tc");
                }
                lines.push("ET");
                if (operation.actualText) {
                  lines.push("EMC");
                }
              },
            );
          },
        );
        break;
      }
    }
  });

  return `${lines.join("\n")}\n`;
}

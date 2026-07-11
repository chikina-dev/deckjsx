import { unzlibSync, zlibSync } from "fflate";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_MAX_DECODED_BYTES = 256 * 1024 * 1024;
const PNG_MAX_DIMENSION = 0x7fffffff;

export type PdfEmbeddablePngAlphaMask = {
  readonly bitDepth: 8;
  readonly colorSpace: "DeviceGray";
  readonly colors: 1;
  readonly data: Uint8Array;
};

export type PdfEmbeddablePngImage = {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 8;
  readonly colorType: 0 | 2 | 3 | 4 | 6;
  readonly colorSpace: "DeviceGray" | "DeviceRGB";
  readonly colors: 1 | 3;
  readonly data: Uint8Array;
  readonly alphaMask?: PdfEmbeddablePngAlphaMask;
};

export type PdfPngRgbColor = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type PdfEmbeddablePngImageOptions = {
  readonly colorTransform?: (color: PdfPngRgbColor) => PdfPngRgbColor;
};

function readUint32Be(bytes: Uint8Array, offset: number): number | undefined {
  return offset + 3 < bytes.byteLength
    ? ((bytes[offset]! << 24) |
        (bytes[offset + 1]! << 16) |
        (bytes[offset + 2]! << 8) |
        bytes[offset + 3]!) >>>
        0
    : undefined;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function pngChunkTypeIsValid(bytes: Uint8Array, offset: number): boolean {
  for (let index = 0; index < 4; index += 1) {
    const value = bytes[offset + index];
    if (
      value === undefined ||
      !((value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a))
    ) {
      return false;
    }
  }

  return bytes[offset + 2]! >= 0x41 && bytes[offset + 2]! <= 0x5a;
}

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngInflatedByteLength(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly components: number;
  readonly interlace: number;
}): number | undefined {
  const rowLength = (width: number): number | undefined => {
    const bits = width * input.bitDepth * input.components;
    if (!Number.isSafeInteger(bits)) {
      return undefined;
    }
    return Math.ceil(bits / 8);
  };
  const passLength = (width: number, height: number): number | undefined => {
    const rowBytes = rowLength(width);
    const byteLength = rowBytes === undefined ? Number.NaN : (rowBytes + 1) * height;
    return Number.isSafeInteger(byteLength) && byteLength <= PNG_MAX_DECODED_BYTES
      ? byteLength
      : undefined;
  };

  if (input.interlace === 0) {
    return passLength(input.width, input.height);
  }

  const passStartsX = [0, 4, 0, 2, 0, 1, 0] as const;
  const passStartsY = [0, 0, 4, 0, 2, 0, 1] as const;
  const passStepsX = [8, 8, 4, 4, 2, 2, 1] as const;
  const passStepsY = [8, 8, 8, 4, 4, 2, 2] as const;
  let total = 0;
  for (let pass = 0; pass < 7; pass += 1) {
    const width = adam7PassSize({
      size: input.width,
      start: passStartsX[pass]!,
      step: passStepsX[pass]!,
    });
    const height = adam7PassSize({
      size: input.height,
      start: passStartsY[pass]!,
      step: passStepsY[pass]!,
    });
    if (width === 0 || height === 0) {
      continue;
    }
    const length = passLength(width, height);
    if (length === undefined || total + length > PNG_MAX_DECODED_BYTES) {
      return undefined;
    }
    total += length;
  }
  return total;
}

function inflatePngData(data: Uint8Array, expectedLength: number): Uint8Array | undefined {
  if (data.byteLength < 6) {
    return undefined;
  }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(data, { out: new Uint8Array(expectedLength + 1) });
  } catch {
    return undefined;
  }
  if (raw.byteLength !== expectedLength) {
    return undefined;
  }

  let first = 1;
  let second = 0;
  raw.forEach((byte) => {
    first = (first + byte) % 65521;
    second = (second + first) % 65521;
  });
  const expectedChecksum = readUint32Be(data, data.byteLength - 4);
  return expectedChecksum === ((second << 16) | first) >>> 0 ? raw : undefined;
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

function pngColorTypeComponents(colorType: number): number | undefined {
  switch (colorType) {
    case 0:
    case 3:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      return undefined;
  }
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  if (aboveDistance <= upperLeftDistance) {
    return above;
  }

  return upperLeft;
}

function unfilterPngScanlines(input: {
  readonly rows: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly bytesPerPixel: number;
  readonly rowLength?: number;
}): Uint8Array | undefined {
  const rowLength = input.rowLength ?? input.width * input.bytesPerPixel;
  const sourceRowLength = 1 + rowLength;
  if (input.rows.byteLength !== sourceRowLength * input.height) {
    return undefined;
  }

  const output = new Uint8Array(rowLength * input.height);
  for (let row = 0; row < input.height; row += 1) {
    const sourceOffset = row * sourceRowLength;
    const outputOffset = row * rowLength;
    const previousOutputOffset = outputOffset - rowLength;
    const filterType = input.rows[sourceOffset];

    for (let column = 0; column < rowLength; column += 1) {
      const value = input.rows[sourceOffset + 1 + column]!;
      const left =
        column >= input.bytesPerPixel ? output[outputOffset + column - input.bytesPerPixel]! : 0;
      const above = row > 0 ? output[previousOutputOffset + column]! : 0;
      const upperLeft =
        row > 0 && column >= input.bytesPerPixel
          ? output[previousOutputOffset + column - input.bytesPerPixel]!
          : 0;

      switch (filterType) {
        case 0:
          output[outputOffset + column] = value;
          break;
        case 1:
          output[outputOffset + column] = (value + left) & 0xff;
          break;
        case 2:
          output[outputOffset + column] = (value + above) & 0xff;
          break;
        case 3:
          output[outputOffset + column] = (value + Math.floor((left + above) / 2)) & 0xff;
          break;
        case 4:
          output[outputOffset + column] = (value + paethPredictor(left, above, upperLeft)) & 0xff;
          break;
        default:
          return undefined;
      }
    }
  }

  return output;
}

function transformedPngColorByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function transformedRgbBytes(
  colorTransform: ((color: PdfPngRgbColor) => PdfPngRgbColor) | undefined,
  red: number,
  green: number,
  blue: number,
): readonly [number, number, number] {
  if (!colorTransform) {
    return [red, green, blue];
  }

  const color = colorTransform({ r: red / 255, g: green / 255, b: blue / 255 });
  return [
    transformedPngColorByte(color.r),
    transformedPngColorByte(color.g),
    transformedPngColorByte(color.b),
  ];
}

function transformRgbPngData(input: {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly colorTransform: (color: PdfPngRgbColor) => PdfPngRgbColor;
}): Uint8Array | undefined {
  const raw = inflatePngData(input.data, (1 + input.width * 3) * input.height);
  if (!raw) {
    return undefined;
  }

  const bytesPerPixel = 3;
  const pixels = unfilterPngScanlines({
    rows: raw,
    width: input.width,
    height: input.height,
    bytesPerPixel,
  });
  if (!pixels) {
    return undefined;
  }

  const rowLength = 1 + input.width * bytesPerPixel;
  const rows = new Uint8Array(rowLength * input.height);
  for (let row = 0; row < input.height; row += 1) {
    const rowOffset = row * rowLength;
    rows[rowOffset] = 0;

    for (let column = 0; column < input.width; column += 1) {
      const sourceOffset = row * input.width * bytesPerPixel + column * bytesPerPixel;
      const outputOffset = rowOffset + 1 + column * bytesPerPixel;
      const [red, green, blue] = transformedRgbBytes(
        input.colorTransform,
        pixels[sourceOffset]!,
        pixels[sourceOffset + 1]!,
        pixels[sourceOffset + 2]!,
      );
      rows[outputOffset] = red;
      rows[outputOffset + 1] = green;
      rows[outputOffset + 2] = blue;
    }
  }

  return zlibSync(rows);
}

function adam7PassSize(input: {
  readonly size: number;
  readonly start: number;
  readonly step: number;
}): number {
  return input.size > input.start
    ? Math.floor((input.size - input.start + input.step - 1) / input.step)
    : 0;
}

function deinterlaceAdam7PngData(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 1 | 2 | 4 | 8 | 16;
  readonly colorType: number;
  readonly data: Uint8Array;
}): Uint8Array | undefined {
  const components = pngColorTypeComponents(input.colorType);
  if (!components) {
    return undefined;
  }

  const inflatedByteLength = pngInflatedByteLength({
    width: input.width,
    height: input.height,
    bitDepth: input.bitDepth,
    components,
    interlace: 1,
  });
  const raw =
    inflatedByteLength === undefined ? undefined : inflatePngData(input.data, inflatedByteLength);
  if (!raw) {
    return undefined;
  }

  const packed = input.bitDepth < 8;
  const bytesPerPixel = packed ? 1 : components * (input.bitDepth === 16 ? 2 : 1);
  const targetRowLength = packed
    ? Math.ceil((input.width * input.bitDepth) / 8)
    : input.width * bytesPerPixel;
  const pixels = new Uint8Array(input.height * targetRowLength);
  const passStartsX = [0, 4, 0, 2, 0, 1, 0] as const;
  const passStartsY = [0, 0, 4, 0, 2, 0, 1] as const;
  const passStepsX = [8, 8, 4, 4, 2, 2, 1] as const;
  const passStepsY = [8, 8, 8, 4, 4, 2, 2] as const;
  let rawOffset = 0;

  for (let pass = 0; pass < 7; pass += 1) {
    const passWidth = adam7PassSize({
      size: input.width,
      start: passStartsX[pass]!,
      step: passStepsX[pass]!,
    });
    const passHeight = adam7PassSize({
      size: input.height,
      start: passStartsY[pass]!,
      step: passStepsY[pass]!,
    });
    if (passWidth === 0 || passHeight === 0) {
      continue;
    }

    const passRowLength = packed
      ? Math.ceil((passWidth * input.bitDepth) / 8)
      : passWidth * bytesPerPixel;
    const passByteLength = (1 + passRowLength) * passHeight;
    if (rawOffset + passByteLength > raw.byteLength) {
      return undefined;
    }

    const passPixels = unfilterPngScanlines({
      rows: raw.slice(rawOffset, rawOffset + passByteLength),
      width: passWidth,
      height: passHeight,
      bytesPerPixel,
      rowLength: passRowLength,
    });
    if (!passPixels) {
      return undefined;
    }

    for (let passY = 0; passY < passHeight; passY += 1) {
      const y = passStartsY[pass]! + passY * passStepsY[pass]!;
      for (let passX = 0; passX < passWidth; passX += 1) {
        const x = passStartsX[pass]! + passX * passStepsX[pass]!;
        if (packed) {
          const sourceByte =
            passPixels[passY * passRowLength + Math.floor((passX * input.bitDepth) / 8)]!;
          const sourceShift = 8 - input.bitDepth - ((passX * input.bitDepth) % 8);
          const sample = (sourceByte >> sourceShift) & ((1 << input.bitDepth) - 1);
          const targetOffset = y * targetRowLength + Math.floor((x * input.bitDepth) / 8);
          const targetShift = 8 - input.bitDepth - ((x * input.bitDepth) % 8);
          pixels[targetOffset] =
            (pixels[targetOffset]! & ~(((1 << input.bitDepth) - 1) << targetShift)) |
            (sample << targetShift);
        } else {
          const sourceOffset = passY * passRowLength + passX * bytesPerPixel;
          const targetOffset = y * targetRowLength + x * bytesPerPixel;
          pixels.set(passPixels.slice(sourceOffset, sourceOffset + bytesPerPixel), targetOffset);
        }
      }
    }

    rawOffset += passByteLength;
  }

  if (rawOffset !== raw.byteLength) {
    return undefined;
  }

  const rowLength = 1 + targetRowLength;
  const rows = new Uint8Array(rowLength * input.height);
  for (let row = 0; row < input.height; row += 1) {
    const rowOffset = row * rowLength;
    rows[rowOffset] = 0;
    rows.set(pixels.slice(row * targetRowLength, (row + 1) * targetRowLength), rowOffset + 1);
  }

  return zlibSync(rows);
}

function splitAlphaPngData(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 8 | 16;
  readonly colorComponents: 1 | 3;
  readonly data: Uint8Array;
  readonly colorTransform?: (color: PdfPngRgbColor) => PdfPngRgbColor;
}): { readonly colorData: Uint8Array; readonly alphaMask: PdfEmbeddablePngAlphaMask } | undefined {
  if (input.colorTransform && input.colorComponents !== 3) {
    return undefined;
  }

  const bytesPerSample = input.bitDepth === 16 ? 2 : 1;
  const bytesPerPixel = (input.colorComponents + 1) * bytesPerSample;
  const sourceRowLength = 1 + input.width * bytesPerPixel;
  const raw = inflatePngData(input.data, sourceRowLength * input.height);
  if (!raw) {
    return undefined;
  }
  const colorRowLength = 1 + input.width * input.colorComponents;
  const alphaRowLength = 1 + input.width;
  if (raw.byteLength !== sourceRowLength * input.height) {
    return undefined;
  }
  const pixels = unfilterPngScanlines({
    rows: raw,
    width: input.width,
    height: input.height,
    bytesPerPixel,
  });
  if (!pixels) {
    return undefined;
  }

  const colorRows = new Uint8Array(colorRowLength * input.height);
  const alphaRows = new Uint8Array(alphaRowLength * input.height);

  for (let row = 0; row < input.height; row += 1) {
    const colorOffset = row * colorRowLength;
    const alphaOffset = row * alphaRowLength;

    colorRows[colorOffset] = 0;
    alphaRows[alphaOffset] = 0;
    for (let column = 0; column < input.width; column += 1) {
      const sourcePixelOffset = row * input.width * bytesPerPixel + column * bytesPerPixel;
      const colorPixelOffset = colorOffset + 1 + column * input.colorComponents;
      const alphaPixelOffset = alphaOffset + 1 + column;
      if (input.colorComponents === 3) {
        const [red, green, blue] = transformedRgbBytes(
          input.colorTransform,
          pixels[sourcePixelOffset]!,
          pixels[sourcePixelOffset + bytesPerSample]!,
          pixels[sourcePixelOffset + 2 * bytesPerSample]!,
        );
        colorRows[colorPixelOffset] = red;
        colorRows[colorPixelOffset + 1] = green;
        colorRows[colorPixelOffset + 2] = blue;
      } else {
        colorRows[colorPixelOffset] = pixels[sourcePixelOffset]!;
      }
      alphaRows[alphaPixelOffset] =
        pixels[sourcePixelOffset + input.colorComponents * bytesPerSample]!;
    }
  }

  return {
    colorData: zlibSync(colorRows),
    alphaMask: {
      bitDepth: 8,
      colorSpace: "DeviceGray",
      colors: 1,
      data: zlibSync(alphaRows),
    },
  };
}

function expandIndexedPngData(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 1 | 2 | 4 | 8;
  readonly data: Uint8Array;
  readonly palette: Uint8Array;
  readonly transparency?: Uint8Array;
  readonly colorTransform?: (color: PdfPngRgbColor) => PdfPngRgbColor;
}): { readonly colorData: Uint8Array; readonly alphaMask?: PdfEmbeddablePngAlphaMask } | undefined {
  if (input.palette.byteLength === 0 || input.palette.byteLength % 3 !== 0) {
    return undefined;
  }

  const packedRowLength = Math.ceil((input.width * input.bitDepth) / 8);
  const raw = inflatePngData(input.data, (1 + packedRowLength) * input.height);
  if (!raw) {
    return undefined;
  }
  const pixels = unfilterPngScanlines({
    rows: raw,
    width: input.width,
    height: input.height,
    bytesPerPixel: 1,
    rowLength: packedRowLength,
  });
  if (!pixels) {
    return undefined;
  }

  const rgbRowLength = 1 + input.width * 3;
  const alphaRowLength = 1 + input.width;
  const rgbRows = new Uint8Array(rgbRowLength * input.height);
  const alphaRows = input.transparency ? new Uint8Array(alphaRowLength * input.height) : undefined;

  for (let row = 0; row < input.height; row += 1) {
    const rgbOffset = row * rgbRowLength;
    const alphaOffset = row * alphaRowLength;
    rgbRows[rgbOffset] = 0;
    if (alphaRows) {
      alphaRows[alphaOffset] = 0;
    }

    for (let column = 0; column < input.width; column += 1) {
      const packedByte = pixels[row * packedRowLength + Math.floor((column * input.bitDepth) / 8)]!;
      const shift = 8 - input.bitDepth - ((column * input.bitDepth) % 8);
      const paletteIndex = (packedByte >> shift) & ((1 << input.bitDepth) - 1);
      const paletteOffset = paletteIndex * 3;
      if (paletteOffset + 2 >= input.palette.byteLength) {
        return undefined;
      }

      const rgbPixelOffset = rgbOffset + 1 + column * 3;
      const [red, green, blue] = transformedRgbBytes(
        input.colorTransform,
        input.palette[paletteOffset]!,
        input.palette[paletteOffset + 1]!,
        input.palette[paletteOffset + 2]!,
      );
      rgbRows[rgbPixelOffset] = red;
      rgbRows[rgbPixelOffset + 1] = green;
      rgbRows[rgbPixelOffset + 2] = blue;
      if (alphaRows) {
        alphaRows[alphaOffset + 1 + column] = input.transparency?.[paletteIndex] ?? 0xff;
      }
    }
  }

  return {
    colorData: zlibSync(rgbRows),
    ...(alphaRows
      ? {
          alphaMask: {
            bitDepth: 8,
            colorSpace: "DeviceGray",
            colors: 1,
            data: zlibSync(alphaRows),
          },
        }
      : {}),
  };
}

function isIndexedBitDepth(bitDepth: number | undefined): bitDepth is 1 | 2 | 4 | 8 {
  return bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8;
}

function isGrayscaleBitDepth(bitDepth: number | undefined): bitDepth is 1 | 2 | 4 | 8 {
  return bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8;
}

function isRgbBitDepth(bitDepth: number | undefined): bitDepth is 8 | 16 {
  return bitDepth === 8 || bitDepth === 16;
}

function isAlphaColorBitDepth(bitDepth: number | undefined): bitDepth is 8 | 16 {
  return bitDepth === 8 || bitDepth === 16;
}

function pngColorTypeIsValid(colorType: number | undefined): colorType is 0 | 2 | 3 | 4 | 6 {
  return (
    colorType === 0 || colorType === 2 || colorType === 3 || colorType === 4 || colorType === 6
  );
}

function pngBitDepthIsValid(
  colorType: number | undefined,
  bitDepth: number | undefined,
): bitDepth is 1 | 2 | 4 | 8 | 16 {
  return (
    (colorType === 0 && (isGrayscaleBitDepth(bitDepth) || bitDepth === 16)) ||
    (colorType === 2 && isRgbBitDepth(bitDepth)) ||
    (colorType === 3 && isIndexedBitDepth(bitDepth)) ||
    ((colorType === 4 || colorType === 6) && isAlphaColorBitDepth(bitDepth))
  );
}

function expandGrayscalePngData(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 1 | 2 | 4 | 8;
  readonly data: Uint8Array;
}): Uint8Array | undefined {
  if (input.bitDepth === 8) {
    return input.data;
  }

  const packedRowLength = Math.ceil((input.width * input.bitDepth) / 8);
  const raw = inflatePngData(input.data, (1 + packedRowLength) * input.height);
  if (!raw) {
    return undefined;
  }
  const pixels = unfilterPngScanlines({
    rows: raw,
    width: input.width,
    height: input.height,
    bytesPerPixel: 1,
    rowLength: packedRowLength,
  });
  if (!pixels) {
    return undefined;
  }

  const grayRowLength = 1 + input.width;
  const grayRows = new Uint8Array(grayRowLength * input.height);
  const maxSample = (1 << input.bitDepth) - 1;

  for (let row = 0; row < input.height; row += 1) {
    const grayOffset = row * grayRowLength;
    grayRows[grayOffset] = 0;

    for (let column = 0; column < input.width; column += 1) {
      const packedByte = pixels[row * packedRowLength + Math.floor((column * input.bitDepth) / 8)]!;
      const shift = 8 - input.bitDepth - ((column * input.bitDepth) % 8);
      const sample = (packedByte >> shift) & maxSample;
      grayRows[grayOffset + 1 + column] = Math.round((sample * 255) / maxSample);
    }
  }

  return zlibSync(grayRows);
}

function downsample16BitPngData(input: {
  readonly width: number;
  readonly height: number;
  readonly colorComponents: 1 | 3;
  readonly data: Uint8Array;
  readonly colorTransform?: (color: PdfPngRgbColor) => PdfPngRgbColor;
}): Uint8Array | undefined {
  if (input.colorTransform && input.colorComponents !== 3) {
    return undefined;
  }

  const bytesPerPixel = input.colorComponents * 2;
  const raw = inflatePngData(input.data, (1 + input.width * bytesPerPixel) * input.height);
  if (!raw) {
    return undefined;
  }
  const pixels = unfilterPngScanlines({
    rows: raw,
    width: input.width,
    height: input.height,
    bytesPerPixel,
  });
  if (!pixels) {
    return undefined;
  }

  const outputRowLength = 1 + input.width * input.colorComponents;
  const outputRows = new Uint8Array(outputRowLength * input.height);

  for (let row = 0; row < input.height; row += 1) {
    const outputOffset = row * outputRowLength;
    outputRows[outputOffset] = 0;

    for (let column = 0; column < input.width; column += 1) {
      const sourcePixelOffset = row * input.width * bytesPerPixel + column * bytesPerPixel;
      const outputPixelOffset = outputOffset + 1 + column * input.colorComponents;
      if (input.colorComponents === 3) {
        const [red, green, blue] = transformedRgbBytes(
          input.colorTransform,
          pixels[sourcePixelOffset]!,
          pixels[sourcePixelOffset + 2]!,
          pixels[sourcePixelOffset + 4]!,
        );
        outputRows[outputPixelOffset] = red;
        outputRows[outputPixelOffset + 1] = green;
        outputRows[outputPixelOffset + 2] = blue;
      } else {
        outputRows[outputPixelOffset] = pixels[sourcePixelOffset]!;
      }
    }
  }

  return zlibSync(outputRows);
}

function transparentColorPngAlphaMask(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 1 | 2 | 4 | 8 | 16;
  readonly colorComponents: 1 | 3;
  readonly data: Uint8Array;
  readonly transparency: Uint8Array;
}): PdfEmbeddablePngAlphaMask | undefined {
  if (input.transparency.byteLength < input.colorComponents * 2) {
    return undefined;
  }

  const transparentSamples = Array.from({ length: input.colorComponents }, (_, index) => {
    const offset = index * 2;
    return (input.transparency[offset]! << 8) | input.transparency[offset + 1]!;
  });

  const bytesPerPixel = input.bitDepth === 16 ? input.colorComponents * 2 : input.colorComponents;
  const sourceRowLength =
    input.colorComponents === 1 && input.bitDepth < 8
      ? 1 + Math.ceil((input.width * input.bitDepth) / 8)
      : 1 + input.width * bytesPerPixel;
  const raw = inflatePngData(input.data, sourceRowLength * input.height);
  if (!raw) {
    return undefined;
  }
  const pixels = unfilterPngScanlines({
    rows: raw,
    width: input.width,
    height: input.height,
    bytesPerPixel,
    rowLength:
      input.colorComponents === 1 && input.bitDepth < 8
        ? Math.ceil((input.width * input.bitDepth) / 8)
        : undefined,
  });
  if (!pixels) {
    return undefined;
  }

  const alphaRowLength = 1 + input.width;
  const alphaRows = new Uint8Array(alphaRowLength * input.height);
  const packedRowLength = Math.ceil((input.width * input.bitDepth) / 8);

  for (let row = 0; row < input.height; row += 1) {
    const alphaOffset = row * alphaRowLength;
    alphaRows[alphaOffset] = 0;

    for (let column = 0; column < input.width; column += 1) {
      const transparent =
        input.colorComponents === 1 && input.bitDepth < 8
          ? (() => {
              const packedByte =
                pixels[row * packedRowLength + Math.floor((column * input.bitDepth) / 8)]!;
              const shift = 8 - input.bitDepth - ((column * input.bitDepth) % 8);
              const sample = (packedByte >> shift) & ((1 << input.bitDepth) - 1);
              return sample === transparentSamples[0];
            })()
          : input.bitDepth === 16
            ? (() => {
                const sourcePixelOffset =
                  row * input.width * bytesPerPixel + column * bytesPerPixel;
                return transparentSamples.every((sample, component) => {
                  const offset = sourcePixelOffset + component * 2;
                  return ((pixels[offset]! << 8) | pixels[offset + 1]!) === sample;
                });
              })()
            : (() => {
                const sourcePixelOffset =
                  row * input.width * bytesPerPixel + column * bytesPerPixel;
                return transparentSamples.every(
                  (sample, component) => pixels[sourcePixelOffset + component] === sample,
                );
              })();
      alphaRows[alphaOffset + 1 + column] = transparent ? 0x00 : 0xff;
    }
  }

  return {
    bitDepth: 8,
    colorSpace: "DeviceGray",
    colors: 1,
    data: zlibSync(alphaRows),
  };
}

export function pdfEmbeddablePngImage(
  bytes: Uint8Array,
  options: PdfEmbeddablePngImageOptions = {},
): PdfEmbeddablePngImage | undefined {
  if (bytes.byteLength < 33 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return undefined;
  }

  let offset: number = PNG_SIGNATURE.length;
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let colorType: number | undefined;
  let interlace: number | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const idatChunks: Uint8Array[] = [];
  let idatByteLength = 0;
  let seenHeader = false;
  let seenPalette = false;
  let seenTransparency = false;
  let seenImageData = false;
  let imageDataEnded = false;
  let seenEnd = false;

  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32Be(bytes, offset);
    if (length === undefined || offset + 12 + length > bytes.byteLength) {
      return undefined;
    }

    const typeOffset = offset + 4;
    if (!pngChunkTypeIsValid(bytes, typeOffset)) {
      return undefined;
    }
    const type = chunkType(bytes, offset + 4);
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const nextOffset = crcOffset + 4;
    const expectedCrc = readUint32Be(bytes, crcOffset);
    if (expectedCrc === undefined || pngCrc32(bytes, typeOffset, crcOffset) !== expectedCrc) {
      return undefined;
    }

    if (type === "IHDR") {
      if (seenHeader || offset !== PNG_SIGNATURE.length || length !== 13) {
        return undefined;
      }
      width = readUint32Be(bytes, dataOffset);
      height = readUint32Be(bytes, dataOffset + 4);
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      interlace = bytes[dataOffset + 12];
      if (
        !width ||
        width > PNG_MAX_DIMENSION ||
        !height ||
        height > PNG_MAX_DIMENSION ||
        !pngBitDepthIsValid(colorType, bitDepth) ||
        compression !== 0 ||
        filter !== 0 ||
        (interlace !== 0 && interlace !== 1)
      ) {
        return undefined;
      }
      seenHeader = true;
      offset = nextOffset;
      continue;
    }

    if (!seenHeader || type === "IHDR") {
      return undefined;
    }

    if (type === "PLTE") {
      const paletteEntries = length / 3;
      if (
        seenPalette ||
        seenImageData ||
        colorType === 0 ||
        colorType === 4 ||
        length === 0 ||
        length > 768 ||
        length % 3 !== 0 ||
        (colorType === 3 && bitDepth !== undefined && paletteEntries > 1 << bitDepth)
      ) {
        return undefined;
      }
      palette = bytes.slice(dataOffset, dataOffset + length);
      seenPalette = true;
    } else if (type === "tRNS") {
      const paletteEntries = palette ? palette.byteLength / 3 : 0;
      if (
        seenTransparency ||
        seenImageData ||
        length === 0 ||
        (colorType === 0 && length !== 2) ||
        (colorType === 2 && length !== 6) ||
        (colorType === 3 && (!seenPalette || length > paletteEntries)) ||
        colorType === 4 ||
        colorType === 6
      ) {
        return undefined;
      }
      transparency = bytes.slice(dataOffset, dataOffset + length);
      seenTransparency = true;
    } else if (type === "IDAT") {
      if (imageDataEnded || (colorType === 3 && !seenPalette)) {
        return undefined;
      }
      seenImageData = true;
      idatByteLength += length;
      if (!Number.isSafeInteger(idatByteLength) || idatByteLength > PNG_MAX_DECODED_BYTES) {
        return undefined;
      }
      if (length > 0) {
        idatChunks.push(bytes.slice(dataOffset, dataOffset + length));
      }
    } else if (type === "IEND") {
      if (!seenImageData || length !== 0 || nextOffset !== bytes.byteLength) {
        return undefined;
      }
      seenEnd = true;
      offset = nextOffset;
      break;
    } else {
      if (seenImageData) {
        imageDataEnded = true;
      }
      if (bytes[typeOffset]! >= 0x41 && bytes[typeOffset]! <= 0x5a) {
        return undefined;
      }
    }

    offset = nextOffset;
  }

  if (
    !seenEnd ||
    offset !== bytes.byteLength ||
    !width ||
    !height ||
    !pngColorTypeIsValid(colorType) ||
    !pngBitDepthIsValid(colorType, bitDepth) ||
    interlace === undefined ||
    idatChunks.length === 0 ||
    (colorType === 3 && !palette)
  ) {
    return undefined;
  }

  const rawImageData = concatBytes(idatChunks);
  const components = pngColorTypeComponents(colorType);
  if (!components) {
    return undefined;
  }
  const inflatedByteLength = pngInflatedByteLength({
    width,
    height,
    bitDepth,
    components,
    interlace,
  });
  if (inflatedByteLength === undefined) {
    return undefined;
  }
  if (interlace === 0) {
    const inflated = inflatePngData(rawImageData, inflatedByteLength);
    const bytesPerPixel = bitDepth < 8 ? 1 : components * (bitDepth === 16 ? 2 : 1);
    const rowLength = Math.ceil((width * bitDepth * components) / 8);
    if (
      !inflated ||
      !unfilterPngScanlines({
        rows: inflated,
        width,
        height,
        bytesPerPixel,
        rowLength,
      })
    ) {
      return undefined;
    }
  }
  const imageData =
    interlace === 1 &&
    ((colorType === 0 && isGrayscaleBitDepth(bitDepth)) ||
      (colorType === 3 && isIndexedBitDepth(bitDepth)) ||
      bitDepth === 8 ||
      bitDepth === 16)
      ? deinterlaceAdam7PngData({ width, height, bitDepth, colorType, data: rawImageData })
      : rawImageData;
  if (!imageData) {
    return undefined;
  }
  const indexedData =
    colorType === 3 && palette && isIndexedBitDepth(bitDepth)
      ? expandIndexedPngData({
          width,
          height,
          bitDepth,
          data: imageData,
          palette,
          transparency,
          colorTransform: options.colorTransform,
        })
      : undefined;
  const grayscaleData =
    colorType === 0 && isGrayscaleBitDepth(bitDepth) && !options.colorTransform
      ? expandGrayscalePngData({ width, height, bitDepth, data: imageData })
      : undefined;
  const transformedRgbData =
    colorType === 2 && bitDepth === 8 && options.colorTransform
      ? transformRgbPngData({
          width,
          height,
          data: imageData,
          colorTransform: options.colorTransform,
        })
      : undefined;
  const downsampledData =
    (colorType === 0 || colorType === 2) && bitDepth === 16
      ? downsample16BitPngData({
          width,
          height,
          colorComponents: colorType === 0 ? 1 : 3,
          data: imageData,
          colorTransform: options.colorTransform,
        })
      : undefined;
  const rgbaData =
    colorType === 6 && isAlphaColorBitDepth(bitDepth)
      ? splitAlphaPngData({
          width,
          height,
          bitDepth,
          colorComponents: 3,
          data: imageData,
          colorTransform: options.colorTransform,
        })
      : colorType === 4 && isAlphaColorBitDepth(bitDepth)
        ? splitAlphaPngData({
            width,
            height,
            bitDepth,
            colorComponents: 1,
            data: imageData,
            colorTransform: options.colorTransform,
          })
        : undefined;
  const transparentAlphaMask =
    (colorType === 0 || colorType === 2) && transparency
      ? transparentColorPngAlphaMask({
          width,
          height,
          bitDepth,
          colorComponents: colorType === 0 ? 1 : 3,
          data: imageData,
          transparency,
        })
      : undefined;
  if (colorType === 3 && !indexedData) {
    return undefined;
  }
  if (colorType === 0 && !grayscaleData && !downsampledData) {
    return undefined;
  }
  if (colorType === 2 && bitDepth === 8 && options.colorTransform && !transformedRgbData) {
    return undefined;
  }
  if ((colorType === 0 || colorType === 2) && bitDepth === 16 && !downsampledData) {
    return undefined;
  }
  if ((colorType === 4 || colorType === 6) && !rgbaData) {
    return undefined;
  }
  if ((colorType === 0 || colorType === 2) && transparency && !transparentAlphaMask) {
    return undefined;
  }
  const colors = colorType === 0 || colorType === 4 ? 1 : 3;
  const alphaMask = indexedData?.alphaMask ?? rgbaData?.alphaMask ?? transparentAlphaMask;

  return {
    width,
    height,
    bitDepth: 8,
    colorType,
    colorSpace: colorType === 0 || colorType === 4 ? "DeviceGray" : "DeviceRGB",
    colors,
    data:
      indexedData?.colorData ??
      grayscaleData ??
      transformedRgbData ??
      downsampledData ??
      rgbaData?.colorData ??
      imageData,
    ...(alphaMask ? { alphaMask } : {}),
  };
}

const JPEG_START_OF_IMAGE = 0xd8;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_DEFINE_QUANTIZATION_TABLE = 0xdb;
const JPEG_DEFINE_HUFFMAN_TABLE = 0xc4;
const JPEG_DEFINE_RESTART_INTERVAL = 0xdd;
const JPEG_TEMPORARY = 0x01;

const SUPPORTED_START_OF_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2]);
const START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export type PdfEmbeddableJpegImage = {
  readonly width: number;
  readonly height: number;
  readonly bitsPerComponent: 8;
  readonly colorSpace: "DeviceRGB";
  readonly components: 3;
};

type JpegFrame = {
  readonly marker: number;
  readonly width: number;
  readonly height: number;
  readonly componentQuantizationTables: ReadonlyMap<number, number>;
};

type JpegMarker = {
  readonly marker: number;
  readonly nextOffset: number;
  readonly hasEntropyData: boolean;
};

function readUint16Be(bytes: Uint8Array, offset: number): number | undefined {
  return offset + 1 < bytes.byteLength ? (bytes[offset]! << 8) | bytes[offset + 1]! : undefined;
}

function markerAt(input: {
  readonly bytes: Uint8Array;
  readonly offset: number;
  readonly scanData: boolean;
}): JpegMarker | undefined {
  let offset = input.offset;
  let hasEntropyData = false;

  if (input.scanData) {
    while (offset < input.bytes.byteLength) {
      if (input.bytes[offset] !== 0xff) {
        hasEntropyData = true;
        offset += 1;
        continue;
      }

      offset += 1;
      while (offset < input.bytes.byteLength && input.bytes[offset] === 0xff) {
        offset += 1;
      }
      if (offset >= input.bytes.byteLength) {
        return undefined;
      }

      const marker = input.bytes[offset]!;
      offset += 1;
      if (marker === 0x00) {
        hasEntropyData = true;
        continue;
      }
      if (marker >= 0xd0 && marker <= 0xd7) {
        continue;
      }
      return { marker, nextOffset: offset, hasEntropyData };
    }
    return undefined;
  }

  if (input.bytes[offset] !== 0xff) {
    return undefined;
  }
  offset += 1;
  while (offset < input.bytes.byteLength && input.bytes[offset] === 0xff) {
    offset += 1;
  }
  if (offset >= input.bytes.byteLength || input.bytes[offset] === 0x00) {
    return undefined;
  }

  return {
    marker: input.bytes[offset]!,
    nextOffset: offset + 1,
    hasEntropyData: false,
  };
}

function segmentRange(
  bytes: Uint8Array,
  offset: number,
): { readonly dataOffset: number; readonly endOffset: number } | undefined {
  const length = readUint16Be(bytes, offset);
  if (length === undefined || length < 2) {
    return undefined;
  }
  const endOffset = offset + length;
  return endOffset <= bytes.byteLength ? { dataOffset: offset + 2, endOffset } : undefined;
}

function parseQuantizationTables(
  bytes: Uint8Array,
  start: number,
  end: number,
  tables: Set<number>,
): boolean {
  let offset = start;
  while (offset < end) {
    const tableInfo = bytes[offset]!;
    offset += 1;
    const precision = tableInfo >> 4;
    const tableId = tableInfo & 0x0f;
    if ((precision !== 0 && precision !== 1) || tableId > 3) {
      return false;
    }
    const tableLength = precision === 0 ? 64 : 128;
    if (offset + tableLength > end) {
      return false;
    }
    tables.add(tableId);
    offset += tableLength;
  }
  return offset === end;
}

function parseHuffmanTables(
  bytes: Uint8Array,
  start: number,
  end: number,
  tables: Set<string>,
): boolean {
  let offset = start;
  while (offset < end) {
    if (offset + 17 > end) {
      return false;
    }
    const tableInfo = bytes[offset]!;
    const tableClass = tableInfo >> 4;
    const tableId = tableInfo & 0x0f;
    if ((tableClass !== 0 && tableClass !== 1) || tableId > 3) {
      return false;
    }
    let symbolCount = 0;
    for (let index = 1; index <= 16; index += 1) {
      symbolCount += bytes[offset + index]!;
    }
    offset += 17;
    if (symbolCount === 0 || offset + symbolCount > end) {
      return false;
    }
    tables.add(`${tableClass}:${tableId}`);
    offset += symbolCount;
  }
  return offset === end;
}

function parseFrame(
  bytes: Uint8Array,
  marker: number,
  start: number,
  end: number,
): JpegFrame | undefined {
  if (!SUPPORTED_START_OF_FRAME_MARKERS.has(marker) || end - start < 6) {
    return undefined;
  }
  const precision = bytes[start];
  const height = readUint16Be(bytes, start + 1);
  const width = readUint16Be(bytes, start + 3);
  const componentCount = bytes[start + 5];
  if (
    precision !== 8 ||
    !width ||
    !height ||
    componentCount !== 3 ||
    end - start !== 6 + componentCount * 3
  ) {
    return undefined;
  }

  const componentQuantizationTables = new Map<number, number>();
  for (let index = 0; index < componentCount; index += 1) {
    const offset = start + 6 + index * 3;
    const componentId = bytes[offset]!;
    const sampling = bytes[offset + 1]!;
    const horizontalSampling = sampling >> 4;
    const verticalSampling = sampling & 0x0f;
    const quantizationTable = bytes[offset + 2]!;
    if (
      componentQuantizationTables.has(componentId) ||
      horizontalSampling < 1 ||
      horizontalSampling > 4 ||
      verticalSampling < 1 ||
      verticalSampling > 4 ||
      quantizationTable > 3
    ) {
      return undefined;
    }
    componentQuantizationTables.set(componentId, quantizationTable);
  }

  return { marker, width, height, componentQuantizationTables };
}

function scanHeaderIsValid(input: {
  readonly bytes: Uint8Array;
  readonly start: number;
  readonly end: number;
  readonly frame: JpegFrame;
  readonly huffmanTables: ReadonlySet<string>;
}): boolean {
  const componentCount = input.bytes[input.start];
  if (!componentCount || input.end - input.start !== 4 + componentCount * 2) {
    return false;
  }

  const selectors = new Set<number>();
  const tableSelectors: Array<{ readonly dc: number; readonly ac: number }> = [];
  for (let index = 0; index < componentCount; index += 1) {
    const offset = input.start + 1 + index * 2;
    const componentId = input.bytes[offset]!;
    const tables = input.bytes[offset + 1]!;
    const dc = tables >> 4;
    const ac = tables & 0x0f;
    if (
      selectors.has(componentId) ||
      !input.frame.componentQuantizationTables.has(componentId) ||
      dc > 3 ||
      ac > 3
    ) {
      return false;
    }
    selectors.add(componentId);
    tableSelectors.push({ dc, ac });
  }

  const spectralStart = input.bytes[input.end - 3]!;
  const spectralEnd = input.bytes[input.end - 2]!;
  const approximation = input.bytes[input.end - 1]!;
  const successiveHigh = approximation >> 4;
  const successiveLow = approximation & 0x0f;
  if (input.frame.marker === 0xc0 || input.frame.marker === 0xc1) {
    if (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0) {
      return false;
    }
  } else if (
    spectralStart > spectralEnd ||
    spectralEnd > 63 ||
    (spectralStart === 0 && spectralEnd !== 0) ||
    (spectralStart > 0 && componentCount !== 1) ||
    successiveHigh > 13 ||
    successiveLow > 13 ||
    (successiveHigh !== 0 && successiveHigh !== successiveLow + 1)
  ) {
    return false;
  }

  return tableSelectors.every(
    ({ dc, ac }) =>
      (spectralStart > 0 || input.huffmanTables.has(`0:${dc}`)) &&
      (spectralEnd === 0 || input.huffmanTables.has(`1:${ac}`)),
  );
}

export function pdfEmbeddableJpegImage(bytes: Uint8Array): PdfEmbeddableJpegImage | undefined {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_START_OF_IMAGE) {
    return undefined;
  }

  let offset = 2;
  let scanData = false;
  let frame: JpegFrame | undefined;
  let scanCount = 0;
  const quantizationTables = new Set<number>();
  const huffmanTables = new Set<string>();

  while (offset < bytes.byteLength) {
    const marker = markerAt({ bytes, offset, scanData });
    if (!marker || (scanData && !marker.hasEntropyData)) {
      return undefined;
    }
    offset = marker.nextOffset;
    scanData = false;

    if (marker.marker === JPEG_END_OF_IMAGE) {
      if (!frame || scanCount === 0 || offset !== bytes.byteLength) {
        return undefined;
      }
      if (
        [...frame.componentQuantizationTables.values()].some(
          (tableId) => !quantizationTables.has(tableId),
        )
      ) {
        return undefined;
      }
      return {
        width: frame.width,
        height: frame.height,
        bitsPerComponent: 8,
        colorSpace: "DeviceRGB",
        components: 3,
      };
    }

    if (marker.marker === JPEG_START_OF_IMAGE || (marker.marker >= 0xd0 && marker.marker <= 0xd7)) {
      return undefined;
    }
    if (marker.marker === JPEG_TEMPORARY) {
      continue;
    }

    const segment = segmentRange(bytes, offset);
    if (!segment) {
      return undefined;
    }

    if (START_OF_FRAME_MARKERS.has(marker.marker)) {
      if (frame) {
        return undefined;
      }
      frame = parseFrame(bytes, marker.marker, segment.dataOffset, segment.endOffset);
      if (!frame) {
        return undefined;
      }
    } else if (marker.marker === JPEG_DEFINE_QUANTIZATION_TABLE) {
      if (
        !parseQuantizationTables(bytes, segment.dataOffset, segment.endOffset, quantizationTables)
      ) {
        return undefined;
      }
    } else if (marker.marker === JPEG_DEFINE_HUFFMAN_TABLE) {
      if (!parseHuffmanTables(bytes, segment.dataOffset, segment.endOffset, huffmanTables)) {
        return undefined;
      }
    } else if (marker.marker === JPEG_DEFINE_RESTART_INTERVAL) {
      if (segment.endOffset - segment.dataOffset !== 2) {
        return undefined;
      }
    } else if (marker.marker === JPEG_START_OF_SCAN) {
      if (
        !frame ||
        !scanHeaderIsValid({
          bytes,
          start: segment.dataOffset,
          end: segment.endOffset,
          frame,
          huffmanTables,
        })
      ) {
        return undefined;
      }
      scanCount += 1;
      scanData = true;
    }

    offset = segment.endOffset;
  }

  return undefined;
}

export type TrueTypeDescriptorMetrics = {
  readonly fontBBox: readonly [number, number, number, number];
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
};

export type TrueTypeFontMetrics = {
  readonly winAnsiWidths?: readonly number[];
  readonly descriptor?: TrueTypeDescriptorMetrics;
};

type TrueTypeTable = {
  readonly offset: number;
  readonly length: number;
};

function readUInt16(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    return undefined;
  }

  return (bytes[offset] ?? 0) * 0x100 + (bytes[offset + 1] ?? 0);
}

function readInt16(bytes: Uint8Array, offset: number): number | undefined {
  const value = readUInt16(bytes, offset);
  if (value === undefined) {
    return undefined;
  }

  return value >= 0x8000 ? value - 0x10000 : value;
}

function readUInt32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    return undefined;
  }

  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

function readTag(bytes: Uint8Array, offset: number): string | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    return undefined;
  }

  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function trueTypeTables(bytes: Uint8Array): ReadonlyMap<string, TrueTypeTable> {
  const numTables = readUInt16(bytes, 4) ?? 0;
  const tables = new Map<string, TrueTypeTable>();

  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16;
    const tag = readTag(bytes, recordOffset);
    const offset = readUInt32(bytes, recordOffset + 8);
    const length = readUInt32(bytes, recordOffset + 12);
    if (
      tag &&
      offset !== undefined &&
      length !== undefined &&
      offset >= 0 &&
      length >= 0 &&
      offset + length <= bytes.byteLength
    ) {
      tables.set(tag, { offset, length });
    }
  }

  return tables;
}

function trueTypeGlyphIdForCode(input: {
  readonly bytes: Uint8Array;
  readonly cmap: TrueTypeTable;
  readonly code: number;
}): number | undefined {
  const tableOffset = input.cmap.offset;
  const numSubtables = readUInt16(input.bytes, tableOffset + 2) ?? 0;

  for (let index = 0; index < numSubtables; index += 1) {
    const recordOffset = tableOffset + 4 + index * 8;
    const subtableRelativeOffset = readUInt32(input.bytes, recordOffset + 4);
    if (subtableRelativeOffset === undefined) {
      continue;
    }

    const subtableOffset = tableOffset + subtableRelativeOffset;
    const format = readUInt16(input.bytes, subtableOffset);
    if (format === 12) {
      const glyphId = trueTypeGlyphIdForFormat12(input.bytes, subtableOffset, input.code);
      if (glyphId !== undefined) {
        return glyphId;
      }

      continue;
    }

    if (format !== 4) {
      continue;
    }

    const segCount = (readUInt16(input.bytes, subtableOffset + 6) ?? 0) / 2;
    if (!Number.isInteger(segCount) || segCount <= 0) {
      continue;
    }

    const endCodeOffset = subtableOffset + 14;
    const startCodeOffset = endCodeOffset + segCount * 2 + 2;
    const idDeltaOffset = startCodeOffset + segCount * 2;
    const idRangeOffsetOffset = idDeltaOffset + segCount * 2;

    for (let segmentIndex = 0; segmentIndex < segCount; segmentIndex += 1) {
      const endCode = readUInt16(input.bytes, endCodeOffset + segmentIndex * 2);
      const startCode = readUInt16(input.bytes, startCodeOffset + segmentIndex * 2);
      const idDelta = readInt16(input.bytes, idDeltaOffset + segmentIndex * 2);
      const idRangeOffset = readUInt16(input.bytes, idRangeOffsetOffset + segmentIndex * 2);
      if (
        endCode === undefined ||
        startCode === undefined ||
        idDelta === undefined ||
        idRangeOffset === undefined ||
        input.code < startCode ||
        input.code > endCode
      ) {
        continue;
      }

      if (idRangeOffset === 0) {
        return (input.code + idDelta) & 0xffff;
      }

      const glyphOffset =
        idRangeOffsetOffset + segmentIndex * 2 + idRangeOffset + (input.code - startCode) * 2;
      const glyphId = readUInt16(input.bytes, glyphOffset);
      return glyphId === undefined || glyphId === 0 ? glyphId : (glyphId + idDelta) & 0xffff;
    }
  }

  return undefined;
}

function trueTypeGlyphIdForFormat12(
  bytes: Uint8Array,
  subtableOffset: number,
  code: number,
): number | undefined {
  const subtableLength = readUInt32(bytes, subtableOffset + 4);
  const groupCount = readUInt32(bytes, subtableOffset + 12);
  if (subtableLength === undefined || groupCount === undefined) {
    return undefined;
  }

  const groupsOffset = subtableOffset + 16;
  const groupsEnd = groupsOffset + groupCount * 12;
  if (
    groupCount < 1 ||
    groupsEnd > subtableOffset + subtableLength ||
    groupsEnd > bytes.byteLength
  ) {
    return undefined;
  }

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const groupOffset = groupsOffset + groupIndex * 12;
    const startCode = readUInt32(bytes, groupOffset);
    const endCode = readUInt32(bytes, groupOffset + 4);
    const startGlyphId = readUInt32(bytes, groupOffset + 8);
    if (
      startCode === undefined ||
      endCode === undefined ||
      startGlyphId === undefined ||
      code < startCode ||
      code > endCode
    ) {
      continue;
    }

    return startGlyphId + code - startCode;
  }

  return undefined;
}

function trueTypeAdvanceWidth(input: {
  readonly bytes: Uint8Array;
  readonly hmtx: TrueTypeTable;
  readonly glyphId: number;
  readonly numberOfHMetrics: number;
}): number | undefined {
  if (input.glyphId < 0 || input.numberOfHMetrics <= 0) {
    return undefined;
  }

  const metricIndex = Math.min(input.glyphId, input.numberOfHMetrics - 1);
  return readUInt16(input.bytes, input.hmtx.offset + metricIndex * 4);
}

function scaleTrueTypeMetric(value: number, unitsPerEm: number): number {
  return Math.round((value / unitsPerEm) * 1000);
}

function coverageIndexForGlyph(
  bytes: Uint8Array,
  coverageOffset: number,
  glyphId: number,
): number | undefined {
  const format = readUInt16(bytes, coverageOffset);
  if (format === 1) {
    const glyphCount = readUInt16(bytes, coverageOffset + 2);
    if (glyphCount === undefined) {
      return undefined;
    }

    for (let index = 0; index < glyphCount; index += 1) {
      if (readUInt16(bytes, coverageOffset + 4 + index * 2) === glyphId) {
        return index;
      }
    }
    return undefined;
  }

  if (format !== 2) {
    return undefined;
  }

  const rangeCount = readUInt16(bytes, coverageOffset + 2);
  if (rangeCount === undefined) {
    return undefined;
  }

  for (let index = 0; index < rangeCount; index += 1) {
    const rangeOffset = coverageOffset + 4 + index * 6;
    const startGlyphId = readUInt16(bytes, rangeOffset);
    const endGlyphId = readUInt16(bytes, rangeOffset + 2);
    const startCoverageIndex = readUInt16(bytes, rangeOffset + 4);
    if (
      startGlyphId === undefined ||
      endGlyphId === undefined ||
      startCoverageIndex === undefined ||
      glyphId < startGlyphId ||
      glyphId > endGlyphId
    ) {
      continue;
    }

    return startCoverageIndex + glyphId - startGlyphId;
  }

  return undefined;
}

function classValueForGlyph(
  bytes: Uint8Array,
  classDefinitionOffset: number,
  glyphId: number,
): number {
  const format = readUInt16(bytes, classDefinitionOffset);
  if (format === 1) {
    const startGlyphId = readUInt16(bytes, classDefinitionOffset + 2);
    const glyphCount = readUInt16(bytes, classDefinitionOffset + 4);
    if (
      startGlyphId === undefined ||
      glyphCount === undefined ||
      glyphId < startGlyphId ||
      glyphId >= startGlyphId + glyphCount
    ) {
      return 0;
    }

    return readUInt16(bytes, classDefinitionOffset + 6 + (glyphId - startGlyphId) * 2) ?? 0;
  }

  if (format !== 2) {
    return 0;
  }

  const rangeCount = readUInt16(bytes, classDefinitionOffset + 2) ?? 0;
  for (let index = 0; index < rangeCount; index += 1) {
    const rangeOffset = classDefinitionOffset + 4 + index * 6;
    const startGlyphId = readUInt16(bytes, rangeOffset);
    const endGlyphId = readUInt16(bytes, rangeOffset + 2);
    const classValue = readUInt16(bytes, rangeOffset + 4);
    if (
      startGlyphId !== undefined &&
      endGlyphId !== undefined &&
      classValue !== undefined &&
      glyphId >= startGlyphId &&
      glyphId <= endGlyphId
    ) {
      return classValue;
    }
  }

  return 0;
}

function valueRecordSize(valueFormat: number): number {
  let size = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    if ((valueFormat & (1 << bit)) !== 0) {
      size += 2;
    }
  }
  return size;
}

function valueRecordXAdvance(
  bytes: Uint8Array,
  offset: number,
  valueFormat: number,
): number | undefined {
  let cursor = offset;
  for (let bit = 0; bit < 8; bit += 1) {
    if ((valueFormat & (1 << bit)) === 0) {
      continue;
    }

    const value = readInt16(bytes, cursor);
    if (value === undefined) {
      return undefined;
    }
    if (bit === 2) {
      return value;
    }
    cursor += 2;
  }
  return 0;
}

function pairAdjustmentsFromPositioningSubtable(
  bytes: Uint8Array,
  subtableOffset: number,
  candidateGlyphIds: readonly number[],
): ReadonlyMap<string, number> {
  const format = readUInt16(bytes, subtableOffset);
  const valueFormat1 = readUInt16(bytes, subtableOffset + 4);
  const valueFormat2 = readUInt16(bytes, subtableOffset + 6);
  if (format === undefined || valueFormat1 === undefined || valueFormat2 === undefined) {
    return new Map();
  }

  const valueRecord1Size = valueRecordSize(valueFormat1);
  const valueRecord2Size = valueRecordSize(valueFormat2);
  const adjustments = new Map<string, number>();
  if (format === 1) {
    const coverageOffset = readUInt16(bytes, subtableOffset + 2);
    const pairSetCount = readUInt16(bytes, subtableOffset + 8);
    if (coverageOffset === undefined || pairSetCount === undefined) {
      return adjustments;
    }

    for (const leftGlyphId of candidateGlyphIds) {
      const coverageIndex = coverageIndexForGlyph(
        bytes,
        subtableOffset + coverageOffset,
        leftGlyphId,
      );
      if (coverageIndex === undefined || coverageIndex >= pairSetCount) {
        continue;
      }

      const pairSetOffset = readUInt16(bytes, subtableOffset + 10 + coverageIndex * 2);
      if (pairSetOffset === undefined) {
        continue;
      }
      const pairValueCount = readUInt16(bytes, subtableOffset + pairSetOffset);
      if (pairValueCount === undefined) {
        continue;
      }

      const recordSize = 2 + valueRecord1Size + valueRecord2Size;
      for (let pairIndex = 0; pairIndex < pairValueCount; pairIndex += 1) {
        const recordOffset = subtableOffset + pairSetOffset + 2 + pairIndex * recordSize;
        const rightGlyphId = readUInt16(bytes, recordOffset);
        const value = valueRecordXAdvance(bytes, recordOffset + 2, valueFormat1);
        if (rightGlyphId !== undefined && value !== undefined && value !== 0) {
          adjustments.set(`${leftGlyphId}:${rightGlyphId}`, value);
        }
      }
    }
    return adjustments;
  }

  if (format !== 2) {
    return adjustments;
  }

  const coverageOffset = readUInt16(bytes, subtableOffset + 2);
  const classDefinition1Offset = readUInt16(bytes, subtableOffset + 8);
  const classDefinition2Offset = readUInt16(bytes, subtableOffset + 10);
  const class1Count = readUInt16(bytes, subtableOffset + 12);
  const class2Count = readUInt16(bytes, subtableOffset + 14);
  if (
    coverageOffset === undefined ||
    classDefinition1Offset === undefined ||
    classDefinition2Offset === undefined ||
    class1Count === undefined ||
    class2Count === undefined
  ) {
    return adjustments;
  }

  for (const leftGlyphId of candidateGlyphIds) {
    if (coverageIndexForGlyph(bytes, subtableOffset + coverageOffset, leftGlyphId) === undefined) {
      continue;
    }
    const class1 = classValueForGlyph(bytes, subtableOffset + classDefinition1Offset, leftGlyphId);
    if (class1 >= class1Count) {
      continue;
    }

    for (const rightGlyphId of candidateGlyphIds) {
      const class2 = classValueForGlyph(
        bytes,
        subtableOffset + classDefinition2Offset,
        rightGlyphId,
      );
      if (class2 >= class2Count) {
        continue;
      }
      const recordOffset =
        subtableOffset +
        16 +
        (class1 * class2Count + class2) * (valueRecord1Size + valueRecord2Size);
      const value = valueRecordXAdvance(bytes, recordOffset, valueFormat1);
      if (value !== undefined && value !== 0) {
        adjustments.set(`${leftGlyphId}:${rightGlyphId}`, value);
      }
    }
  }
  return adjustments;
}

function parseGposGlyphPairAdjustments(
  bytes: Uint8Array,
  gpos: TrueTypeTable,
  candidateGlyphIds: readonly number[],
  unitsPerEm: number,
): ReadonlyMap<string, number> {
  const featureListOffset = readUInt16(bytes, gpos.offset + 6);
  const lookupListOffset = readUInt16(bytes, gpos.offset + 8);
  if (featureListOffset === undefined || lookupListOffset === undefined) {
    return new Map();
  }

  const featureList = gpos.offset + featureListOffset;
  const featureCount = readUInt16(bytes, featureList);
  if (featureCount === undefined) {
    return new Map();
  }

  const lookupIndices = new Set<number>();
  for (let index = 0; index < featureCount; index += 1) {
    const recordOffset = featureList + 2 + index * 6;
    if (readTag(bytes, recordOffset) !== "kern") {
      continue;
    }
    const featureOffset = readUInt16(bytes, recordOffset + 4);
    if (featureOffset === undefined) {
      continue;
    }
    const feature = featureList + featureOffset;
    const lookupCount = readUInt16(bytes, feature + 2) ?? 0;
    for (let lookupIndex = 0; lookupIndex < lookupCount; lookupIndex += 1) {
      const lookup = readUInt16(bytes, feature + 4 + lookupIndex * 2);
      if (lookup !== undefined) {
        lookupIndices.add(lookup);
      }
    }
  }

  const lookupList = gpos.offset + lookupListOffset;
  const lookupCount = readUInt16(bytes, lookupList) ?? 0;
  const adjustments = new Map<string, number>();
  lookupIndices.forEach((lookupIndex) => {
    if (lookupIndex < 0 || lookupIndex >= lookupCount) {
      return;
    }
    const lookupOffset = readUInt16(bytes, lookupList + 2 + lookupIndex * 2);
    if (lookupOffset === undefined) {
      return;
    }
    const lookup = lookupList + lookupOffset;
    const lookupType = readUInt16(bytes, lookup);
    const subtableCount = readUInt16(bytes, lookup + 4);
    if (lookupType === undefined || subtableCount === undefined) {
      return;
    }
    for (let subtableIndex = 0; subtableIndex < subtableCount; subtableIndex += 1) {
      const subtableOffset = readUInt16(bytes, lookup + 6 + subtableIndex * 2);
      if (subtableOffset === undefined) {
        continue;
      }
      let positioningOffset = lookup + subtableOffset;
      let positioningType = lookupType;
      if (lookupType === 9) {
        if (readUInt16(bytes, positioningOffset) !== 1) {
          continue;
        }
        positioningType = readUInt16(bytes, positioningOffset + 2) ?? 0;
        const extensionOffset = readUInt32(bytes, positioningOffset + 4);
        if (extensionOffset === undefined) {
          continue;
        }
        positioningOffset += extensionOffset;
      }
      if (positioningType !== 2) {
        continue;
      }
      pairAdjustmentsFromPositioningSubtable(bytes, positioningOffset, candidateGlyphIds).forEach(
        (value, key) => {
          const scaledValue = scaleTrueTypeMetric(value, unitsPerEm);
          adjustments.set(key, (adjustments.get(key) ?? 0) + scaledValue);
        },
      );
    }
  });

  return adjustments;
}

function parseWinAnsiWidths(input: {
  readonly bytes: Uint8Array;
  readonly tables: ReadonlyMap<string, TrueTypeTable>;
}): readonly number[] | undefined {
  const head = input.tables.get("head");
  const hhea = input.tables.get("hhea");
  const hmtx = input.tables.get("hmtx");
  const cmap = input.tables.get("cmap");
  if (!head || !hhea || !hmtx || !cmap) {
    return undefined;
  }

  const unitsPerEm = readUInt16(input.bytes, head.offset + 18);
  const numberOfHMetrics = readUInt16(input.bytes, hhea.offset + 34);
  if (!unitsPerEm || !numberOfHMetrics) {
    return undefined;
  }

  return Array.from({ length: 224 }, (_, index) => {
    const code = index + 32;
    const glyphId = trueTypeGlyphIdForCode({ bytes: input.bytes, cmap, code });
    const advanceWidth =
      glyphId === undefined
        ? undefined
        : trueTypeAdvanceWidth({
            bytes: input.bytes,
            hmtx,
            glyphId,
            numberOfHMetrics,
          });
    return advanceWidth === undefined ? 550 : scaleTrueTypeMetric(advanceWidth, unitsPerEm);
  });
}

function parseCodeUnitWidths(input: {
  readonly bytes: Uint8Array;
  readonly tables: ReadonlyMap<string, TrueTypeTable>;
  readonly codeUnits: readonly number[];
}): ReadonlyMap<number, number> | undefined {
  const head = input.tables.get("head");
  const hhea = input.tables.get("hhea");
  const hmtx = input.tables.get("hmtx");
  const cmap = input.tables.get("cmap");
  if (!head || !hhea || !hmtx || !cmap) {
    return undefined;
  }

  const unitsPerEm = readUInt16(input.bytes, head.offset + 18);
  const numberOfHMetrics = readUInt16(input.bytes, hhea.offset + 34);
  if (!unitsPerEm || !numberOfHMetrics) {
    return undefined;
  }

  const widths = new Map<number, number>();
  input.codeUnits.forEach((code) => {
    const glyphId = trueTypeGlyphIdForCode({ bytes: input.bytes, cmap, code });
    const advanceWidth =
      glyphId === undefined
        ? undefined
        : trueTypeAdvanceWidth({
            bytes: input.bytes,
            hmtx,
            glyphId,
            numberOfHMetrics,
          });
    if (advanceWidth !== undefined) {
      widths.set(code, scaleTrueTypeMetric(advanceWidth, unitsPerEm));
    }
  });

  return widths;
}

function parseGlyphWidths(input: {
  readonly bytes: Uint8Array;
  readonly tables: ReadonlyMap<string, TrueTypeTable>;
  readonly glyphIds: readonly number[];
}): ReadonlyMap<number, number> | undefined {
  const head = input.tables.get("head");
  const hhea = input.tables.get("hhea");
  const hmtx = input.tables.get("hmtx");
  if (!head || !hhea || !hmtx) {
    return undefined;
  }

  const unitsPerEm = readUInt16(input.bytes, head.offset + 18);
  const numberOfHMetrics = readUInt16(input.bytes, hhea.offset + 34);
  if (!unitsPerEm || !numberOfHMetrics) {
    return undefined;
  }

  const widths = new Map<number, number>();
  input.glyphIds.forEach((glyphId) => {
    const advanceWidth = trueTypeAdvanceWidth({
      bytes: input.bytes,
      hmtx,
      glyphId,
      numberOfHMetrics,
    });
    if (advanceWidth !== undefined) {
      widths.set(glyphId, scaleTrueTypeMetric(advanceWidth, unitsPerEm));
    }
  });
  return widths;
}

function parseCodeUnitGlyphIds(input: {
  readonly bytes: Uint8Array;
  readonly tables: ReadonlyMap<string, TrueTypeTable>;
  readonly codeUnits: readonly number[];
}): ReadonlyMap<number, number> | undefined {
  const cmap = input.tables.get("cmap");
  if (!cmap) {
    return undefined;
  }

  const glyphIds = new Map<number, number>();
  input.codeUnits.forEach((code) => {
    const glyphId = trueTypeGlyphIdForCode({ bytes: input.bytes, cmap, code });
    if (glyphId !== undefined) {
      glyphIds.set(code, glyphId);
    }
  });

  return glyphIds;
}

function parseDescriptor(input: {
  readonly bytes: Uint8Array;
  readonly tables: ReadonlyMap<string, TrueTypeTable>;
}): TrueTypeDescriptorMetrics | undefined {
  const head = input.tables.get("head");
  const hhea = input.tables.get("hhea");
  const os2 = input.tables.get("OS/2");
  if (!head || !hhea) {
    return undefined;
  }

  const unitsPerEm = readUInt16(input.bytes, head.offset + 18);
  const xMin = readInt16(input.bytes, head.offset + 36);
  const yMin = readInt16(input.bytes, head.offset + 38);
  const xMax = readInt16(input.bytes, head.offset + 40);
  const yMax = readInt16(input.bytes, head.offset + 42);
  const ascent = readInt16(input.bytes, hhea.offset + 4);
  const descent = readInt16(input.bytes, hhea.offset + 6);
  const os2Version = os2 ? readUInt16(input.bytes, os2.offset) : undefined;
  const os2CapHeight =
    os2 && os2Version !== undefined && os2Version >= 2 && os2.length >= 90
      ? readInt16(input.bytes, os2.offset + 88)
      : undefined;
  if (
    !unitsPerEm ||
    xMin === undefined ||
    yMin === undefined ||
    xMax === undefined ||
    yMax === undefined ||
    ascent === undefined ||
    descent === undefined
  ) {
    return undefined;
  }

  return {
    fontBBox: [
      scaleTrueTypeMetric(xMin, unitsPerEm),
      scaleTrueTypeMetric(yMin, unitsPerEm),
      scaleTrueTypeMetric(xMax, unitsPerEm),
      scaleTrueTypeMetric(yMax, unitsPerEm),
    ],
    ascent: scaleTrueTypeMetric(ascent, unitsPerEm),
    descent: scaleTrueTypeMetric(descent, unitsPerEm),
    capHeight: scaleTrueTypeMetric(os2CapHeight ?? ascent, unitsPerEm),
  };
}

export function parseTrueTypeFontMetrics(bytes: Uint8Array): TrueTypeFontMetrics | undefined {
  const tables = trueTypeTables(bytes);
  if (tables.size === 0) {
    return undefined;
  }

  const winAnsiWidths = parseWinAnsiWidths({ bytes, tables });
  const descriptor = parseDescriptor({ bytes, tables });

  if (!winAnsiWidths && !descriptor) {
    return undefined;
  }

  return {
    ...(winAnsiWidths ? { winAnsiWidths } : {}),
    ...(descriptor ? { descriptor } : {}),
  };
}

export function parseTrueTypeCodeUnitWidths(
  bytes: Uint8Array,
  codeUnits: readonly number[],
): ReadonlyMap<number, number> {
  const tables = trueTypeTables(bytes);
  if (tables.size === 0) {
    return new Map();
  }

  return parseCodeUnitWidths({ bytes, tables, codeUnits }) ?? new Map();
}

export function parseTrueTypeGlyphWidths(
  bytes: Uint8Array,
  glyphIds: readonly number[],
): ReadonlyMap<number, number> {
  const tables = trueTypeTables(bytes);
  if (tables.size === 0) {
    return new Map();
  }

  return parseGlyphWidths({ bytes, tables, glyphIds }) ?? new Map();
}

export function parseTrueTypeCodeUnitGlyphIds(
  bytes: Uint8Array,
  codeUnits: readonly number[],
): ReadonlyMap<number, number> {
  const tables = trueTypeTables(bytes);
  if (tables.size === 0) {
    return new Map();
  }

  return parseCodeUnitGlyphIds({ bytes, tables, codeUnits }) ?? new Map();
}

export function parseTrueTypeFontKerning(
  bytes: Uint8Array,
  codePoints: readonly number[],
): ReadonlyMap<string, number> {
  const tables = trueTypeTables(bytes);
  const head = tables.get("head");
  const cmap = tables.get("cmap");
  const kern = tables.get("kern");
  const gpos = tables.get("GPOS");
  if (
    !head ||
    !cmap ||
    (!kern && !gpos) ||
    (kern !== undefined && readUInt16(bytes, kern.offset) !== 0)
  ) {
    return new Map();
  }

  const unitsPerEm = readUInt16(bytes, head.offset + 18);
  if (!unitsPerEm) {
    return new Map();
  }

  const codePointsByGlyphId = new Map<number, number[]>();
  codePoints.forEach((codePoint) => {
    const glyphId = trueTypeGlyphIdForCode({ bytes, cmap, code: codePoint });
    if (glyphId === undefined) {
      return;
    }
    const values = codePointsByGlyphId.get(glyphId) ?? [];
    values.push(codePoint);
    codePointsByGlyphId.set(glyphId, values);
  });

  const mapGlyphPairAdjustments = (
    glyphPairAdjustments: ReadonlyMap<string, number>,
  ): ReadonlyMap<string, number> => {
    const adjustments = new Map<string, number>();
    glyphPairAdjustments.forEach((value, key) => {
      const separator = key.indexOf(":");
      if (separator < 0) {
        return;
      }
      const leftGlyphId = Number.parseInt(key.slice(0, separator), 10);
      const rightGlyphId = Number.parseInt(key.slice(separator + 1), 10);
      if (!Number.isInteger(leftGlyphId) || !Number.isInteger(rightGlyphId)) {
        return;
      }
      const leftCodePoints = codePointsByGlyphId.get(leftGlyphId) ?? [];
      const rightCodePoints = codePointsByGlyphId.get(rightGlyphId) ?? [];
      leftCodePoints.forEach((leftCodePoint) => {
        rightCodePoints.forEach((rightCodePoint) => {
          adjustments.set(`${leftCodePoint}:${rightCodePoint}`, value);
        });
      });
    });
    return adjustments;
  };

  if (gpos) {
    const gposAdjustments = mapGlyphPairAdjustments(
      parseGposGlyphPairAdjustments(bytes, gpos, [...codePointsByGlyphId.keys()], unitsPerEm),
    );
    if (gposAdjustments.size > 0) {
      return gposAdjustments;
    }
  }

  if (!kern) {
    return new Map();
  }

  const subtableCount = readUInt16(bytes, kern.offset + 2);
  if (subtableCount === undefined) {
    return new Map();
  }

  const adjustments = new Map<string, number>();
  let subtableOffset = kern.offset + 4;
  for (let index = 0; index < subtableCount; index += 1) {
    const length = readUInt16(bytes, subtableOffset + 2);
    const coverage = readUInt16(bytes, subtableOffset + 4);
    if (length === undefined || coverage === undefined || length < 14) {
      break;
    }

    const subtableEnd = subtableOffset + length;
    if (subtableEnd > kern.offset + kern.length || subtableEnd > bytes.byteLength) {
      break;
    }

    const format = coverage >> 8;
    const horizontal = (coverage & 1) === 1;
    const pairCount =
      format === 0 && horizontal ? readUInt16(bytes, subtableOffset + 6) : undefined;
    if (pairCount !== undefined && subtableOffset + 14 + pairCount * 6 <= subtableEnd) {
      for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
        const pairOffset = subtableOffset + 14 + pairIndex * 6;
        const leftGlyphId = readUInt16(bytes, pairOffset);
        const rightGlyphId = readUInt16(bytes, pairOffset + 2);
        const value = readInt16(bytes, pairOffset + 4);
        if (leftGlyphId === undefined || rightGlyphId === undefined || value === undefined) {
          continue;
        }

        const leftCodePoints = codePointsByGlyphId.get(leftGlyphId) ?? [];
        const rightCodePoints = codePointsByGlyphId.get(rightGlyphId) ?? [];
        leftCodePoints.forEach((leftCodePoint) => {
          rightCodePoints.forEach((rightCodePoint) => {
            const key = `${leftCodePoint}:${rightCodePoint}`;
            adjustments.set(
              key,
              (adjustments.get(key) ?? 0) + scaleTrueTypeMetric(value, unitsPerEm),
            );
          });
        });
      }
    }

    subtableOffset = subtableEnd;
  }

  return adjustments;
}

export function trueTypeFontHasCmap(bytes: Uint8Array): boolean {
  return trueTypeTables(bytes).has("cmap");
}

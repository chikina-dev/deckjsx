import type { GraphNodeId, SemanticSlideNode } from "@/src/graph";
import type { PackagePartId, PptxElementId, PptxSerializedIdentity } from "./model";

export const MAX_WRITER_SHAPE_OBJECT_ID = 4294967294;
const MAX_SHAPE_OBJECT_ID_PROBES = 65536;

export function packagePartId(value: string): PackagePartId {
  return value as PackagePartId;
}

export function pptxElementId(value: string): PptxElementId {
  return value as PptxElementId;
}

export function serializedId(value: string): PptxSerializedIdentity {
  return value as PptxSerializedIdentity;
}

export function identityToken(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function packageIdentity(kind: string, identity: string): PackagePartId {
  return packagePartId(`pptx:${kind}:${identityToken(identity)}`);
}

export function slidePartIdFor(slide: SemanticSlideNode): PackagePartId {
  return packageIdentity("slide", slide.id);
}

export function mediaPartIdForElement(elementId: PptxElementId): PackagePartId {
  return packageIdentity("media", elementId);
}

export function mediaRelationshipId(index: number): PptxSerializedIdentity {
  return serializedId(`rId${index}`);
}

function stableUint32(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function writerSafeShapeObjectId(input: string): PptxSerializedIdentity {
  return serializedId(String((stableUint32(input) % MAX_WRITER_SHAPE_OBJECT_ID) + 1));
}

function writerSafeShapeObjectIdNumber(input: string, maxBase: number): number {
  return (stableUint32(input) % maxBase) + 1;
}

type ReservedShapeObjectIdRange = {
  readonly start: number;
  readonly end: number;
};

export type ShapeObjectIdAllocationOptions = {
  readonly reservedIdHeadroom?: number;
};

export type ShapeObjectIdAllocator = {
  readonly shapeObjectId: (
    indexPath: readonly number[],
    options?: ShapeObjectIdAllocationOptions,
  ) => PptxSerializedIdentity;
  readonly generatedShapeObjectId: (
    ownerShapeObjectId: PptxSerializedIdentity,
    localIndex: number,
    options?: ShapeObjectIdAllocationOptions,
  ) => PptxSerializedIdentity;
};

function rangesOverlap(
  left: ReservedShapeObjectIdRange,
  right: ReservedShapeObjectIdRange,
): boolean {
  return left.start <= right.end && right.start <= left.end;
}

function legacyShapeObjectIdNumber(indexPath: readonly number[]): number | undefined {
  const value = indexPath.reduce((current, index) => current * 1000 + index + 1, 0);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function legacyGeneratedShapeObjectIdNumber(
  ownerShapeObjectId: PptxSerializedIdentity,
  localIndex: number,
): number | undefined {
  const parent = Number.parseInt(ownerShapeObjectId, 10);
  const value = parent * 100 + localIndex + 1;
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function createShapeObjectIdAllocator(): ShapeObjectIdAllocator {
  const ranges: ReservedShapeObjectIdRange[] = [];

  const canReserve = (start: number, headroom: number): boolean => {
    const range = { start, end: start + headroom };
    return (
      Number.isSafeInteger(start) &&
      start > 0 &&
      Number.isSafeInteger(range.end) &&
      range.end <= MAX_WRITER_SHAPE_OBJECT_ID &&
      !ranges.some((reserved) => rangesOverlap(reserved, range))
    );
  };

  const reserve = (start: number, headroom: number): PptxSerializedIdentity => {
    ranges.push({ start, end: start + headroom });
    return serializedId(String(start));
  };

  const allocate = (
    key: string,
    preferred: number | undefined,
    options: ShapeObjectIdAllocationOptions | undefined,
  ): PptxSerializedIdentity => {
    const headroom = Math.max(0, Math.floor(options?.reservedIdHeadroom ?? 0));
    const maxBase = MAX_WRITER_SHAPE_OBJECT_ID - headroom;
    if (maxBase < 1) {
      throw new Error("PPTX projection cannot allocate a writer-safe shape object id.");
    }

    if (preferred !== undefined && canReserve(preferred, headroom)) {
      return reserve(preferred, headroom);
    }

    for (let attempt = 0; attempt < MAX_SHAPE_OBJECT_ID_PROBES; attempt += 1) {
      const candidate = writerSafeShapeObjectIdNumber(`${key}:${attempt}`, maxBase);
      if (canReserve(candidate, headroom)) {
        return reserve(candidate, headroom);
      }
    }

    throw new Error("PPTX projection cannot allocate a unique writer-safe shape object id.");
  };

  return {
    shapeObjectId(indexPath, options) {
      return allocate(`path:${indexPath.join(".")}`, legacyShapeObjectIdNumber(indexPath), options);
    },
    generatedShapeObjectId(ownerShapeObjectId, localIndex, options) {
      return allocate(
        `generated:${ownerShapeObjectId}:${localIndex}`,
        legacyGeneratedShapeObjectIdNumber(ownerShapeObjectId, localIndex),
        options,
      );
    },
  };
}

export function elementIdentity(input: {
  packagePartId: PackagePartId;
  graphNodeId?: GraphNodeId;
  indexPath: readonly number[];
}): PptxElementId {
  const identity = input.graphNodeId
    ? `graph:${input.graphNodeId}`
    : `path:${input.indexPath.join(".")}`;
  return pptxElementId(`${input.packagePartId}:element:${identityToken(identity)}`);
}

export function shapeObjectId(indexPath: readonly number[]): PptxSerializedIdentity {
  const value = legacyShapeObjectIdNumber(indexPath);
  if (value !== undefined && value <= MAX_WRITER_SHAPE_OBJECT_ID) {
    return serializedId(String(value));
  }

  return writerSafeShapeObjectId(`path:${indexPath.join(".")}`);
}

export function generatedShapeObjectIdFromOwner(
  ownerShapeObjectId: PptxSerializedIdentity,
  localIndex: number,
): PptxSerializedIdentity {
  const value = legacyGeneratedShapeObjectIdNumber(ownerShapeObjectId, localIndex);
  if (value !== undefined && value <= MAX_WRITER_SHAPE_OBJECT_ID) {
    return serializedId(String(value));
  }

  return writerSafeShapeObjectId(`generated:${ownerShapeObjectId}:${localIndex}`);
}

export function generatedShapeObjectId(
  indexPath: readonly number[],
  localIndex: number,
): PptxSerializedIdentity {
  return generatedShapeObjectIdFromOwner(shapeObjectId(indexPath), localIndex);
}

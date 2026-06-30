import type { GraphNodeId, SemanticSlideNode } from "@/src/graph";
import type { PackagePartId, PptxElementId, PptxSerializedIdentity } from "./model";

const MAX_WRITER_SHAPE_OBJECT_ID = Number.MAX_SAFE_INTEGER - 1;

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
  const value = indexPath.reduce((current, index) => current * 1000 + index + 1, 0);
  if (!Number.isSafeInteger(value) || value > MAX_WRITER_SHAPE_OBJECT_ID) {
    throw new Error("PPTX projection cannot allocate a writer-safe shape object id.");
  }

  return serializedId(String(Math.max(1, value)));
}

export function generatedShapeObjectId(
  indexPath: readonly number[],
  localIndex: number,
): PptxSerializedIdentity {
  const parent = Number.parseInt(shapeObjectId(indexPath), 10);
  const value = parent * 100 + localIndex + 1;
  if (!Number.isSafeInteger(value) || value > MAX_WRITER_SHAPE_OBJECT_ID) {
    throw new Error("PPTX projection cannot allocate a writer-safe generated shape object id.");
  }

  return serializedId(String(value));
}

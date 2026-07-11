import type { AssetEntityId, GraphNodeId, StyleEntityId } from "./types";

function isReadableCodeUnit(codeUnit: number): boolean {
  return (
    (codeUnit >= 0x30 && codeUnit <= 0x39) ||
    (codeUnit >= 0x41 && codeUnit <= 0x5a) ||
    (codeUnit >= 0x61 && codeUnit <= 0x7a) ||
    codeUnit === 0x3a ||
    codeUnit === 0x2d
  );
}

function encodeSegment(value: string): string {
  let encoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    encoded += isReadableCodeUnit(codeUnit)
      ? value[index]
      : `_${codeUnit.toString(16).padStart(4, "0")}`;
  }
  return encoded;
}

function encodeMaterial(material: readonly string[]): string {
  return material.length === 0 ? "_empty" : material.map(encodeSegment).join("__");
}

export function graphNodeId(material: readonly string[]): GraphNodeId {
  return encodeMaterial(material) as GraphNodeId;
}

export function styleEntityId(material: readonly string[]): StyleEntityId {
  return encodeMaterial(["style", ...material]) as StyleEntityId;
}

export function assetEntityId(material: readonly string[]): AssetEntityId {
  return encodeMaterial(["asset", ...material]) as AssetEntityId;
}

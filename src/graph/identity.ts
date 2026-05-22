import type { AssetEntityId, GraphNodeId, StyleEntityId } from "./types";

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "_");
}

export function graphNodeId(material: readonly string[]): GraphNodeId {
  return slug(material.join("/")) as GraphNodeId;
}

export function styleEntityId(material: readonly string[]): StyleEntityId {
  return slug(`style/${material.join("/")}`) as StyleEntityId;
}

export function assetEntityId(material: readonly string[]): AssetEntityId {
  return slug(`asset/${material.join("/")}`) as AssetEntityId;
}

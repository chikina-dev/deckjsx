export function relationshipOwnerPath(path: string): string | undefined {
  if (path === "_rels/.rels") {
    return "";
  }

  if (!path.endsWith(".rels")) {
    return undefined;
  }

  const marker = "/_rels/";
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const ownerDirectory = path.slice(0, markerIndex);
  const ownerFile = path.slice(markerIndex + marker.length, -".rels".length);
  return ownerDirectory ? `${ownerDirectory}/${ownerFile}` : ownerFile;
}

function pathDir(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function relativeRelationshipTarget(fromPartPath: string, targetPath: string): string {
  const fromParts = pathDir(fromPartPath).split("/").filter(Boolean);
  const targetParts = targetPath.split("/").filter(Boolean);

  while (fromParts.length > 0 && targetParts.length > 0 && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }

  return [...fromParts.map(() => ".."), ...targetParts].join("/");
}

export function projectedRelationshipTarget(input: {
  readonly ownerPath: string;
  readonly targetMode?: "external";
  readonly targetPath: string;
}): string {
  return input.targetMode === "external"
    ? input.targetPath
    : relativeRelationshipTarget(input.ownerPath, input.targetPath);
}

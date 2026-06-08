import type { AuthoredTag } from "../authoring/tags";
import type { SemanticNodeKind, SemanticRole } from "./types";

export function semanticKindForTag(tag: AuthoredTag): SemanticNodeKind {
  if (tag === "img") {
    return "image";
  }

  if (tag === "shape") {
    return "shape";
  }

  if (tag === "p" || /^h[1-6]$/.test(tag) || tag === "span") {
    return tag === "span" ? "textRun" : "text";
  }

  return "container";
}

export function semanticRoleForTag(tag: AuthoredTag): SemanticRole | undefined {
  switch (tag) {
    case "article":
    case "aside":
    case "footer":
    case "header":
    case "main":
    case "nav":
    case "section":
      return { kind: "sectioning", tag };
    case "div":
      return { kind: "genericContainer" };
    case "figure":
      return { kind: "figure" };
    case "p":
      return { kind: "paragraph" };
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return { kind: "heading", level: Number(tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 };
    case "img":
      return { kind: "image" };
    case "shape":
      return { kind: "shape" };
    case "span":
      return undefined;
  }
}

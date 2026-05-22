import type { AuthoredComponent, AuthoredTag } from "../authoring/tags";
import type { SemanticNodeKind, SemanticRole } from "./types";

export function semanticKindForTag(tag: AuthoredTag): SemanticNodeKind {
  if (tag === "img") {
    return "image";
  }

  if (tag === "p" || tag.startsWith("h") || tag === "span") {
    return tag === "span" ? "textRun" : "text";
  }

  return "container";
}

export function semanticKindForComponent(component: AuthoredComponent): SemanticNodeKind {
  switch (component) {
    case "Slide":
      return "slide";
    case "View":
      return "container";
    case "Text":
      return "text";
    case "Image":
      return "image";
    case "Shape":
      return "shape";
  }
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
    case "span":
      return undefined;
  }
}

export function semanticRoleForComponent(component: AuthoredComponent): SemanticRole | undefined {
  switch (component) {
    case "Slide":
      return { kind: "slide" };
    case "Image":
      return { kind: "image" };
    case "Shape":
      return { kind: "shape" };
    case "Text":
    case "View":
      return undefined;
  }
}

export type AuthoredTag =
  | "article"
  | "aside"
  | "div"
  | "figure"
  | "footer"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "header"
  | "img"
  | "main"
  | "nav"
  | "p"
  | "section"
  | "shape"
  | "span"
  | "video";

export type SectioningTag = "article" | "aside" | "footer" | "header" | "main" | "nav" | "section";

export type IntrinsicViewTag =
  | "article"
  | "aside"
  | "div"
  | "figure"
  | "footer"
  | "header"
  | "main"
  | "nav"
  | "section";

export type IntrinsicTextTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p";

export const INTRINSIC_VIEW_TAGS = new Set<string>([
  "article",
  "aside",
  "div",
  "figure",
  "footer",
  "header",
  "main",
  "nav",
  "section",
]);

export const INTRINSIC_TEXT_TAGS = new Set<string>(["h1", "h2", "h3", "h4", "h5", "h6", "p"]);

export function isIntrinsicViewTag(value: string): value is IntrinsicViewTag {
  return INTRINSIC_VIEW_TAGS.has(value);
}

export function isIntrinsicTextTag(value: string): value is IntrinsicTextTag {
  return INTRINSIC_TEXT_TAGS.has(value);
}

export function isAuthoredTag(value: string): value is AuthoredTag {
  return (
    isIntrinsicViewTag(value) ||
    isIntrinsicTextTag(value) ||
    value === "img" ||
    value === "shape" ||
    value === "span" ||
    value === "video"
  );
}

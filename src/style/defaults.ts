import type { AuthoredTag } from "../authoring/tags";
import type { SemanticNode } from "../graph";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  StyleForAuthoredTag,
  TextRunStyle,
  TextStyle,
  VideoStyle,
  ViewStyle,
} from "./types";
import type { StyleDeclaration } from "./declaration";

/**
 * Public Theme defaults keyed by authored tag name.
 *
 * Each default object is checked against the same style type accepted by that TSX tag.
 */
export type ThemeDefaults = Partial<{
  readonly [Tag in AuthoredTag]: StyleForAuthoredTag<Tag>;
}>;

/**
 * Browser-inspired user-agent defaults for the supported HTML-like authoring tags.
 *
 * The typography ratios and block margins follow the HTML user-agent stylesheet while using
 * deckjsx's presentation-readable 18pt base size. Output-model defaults that cannot behave like
 * browser CSS (for example, inline replaced-element layout) remain in `ELEMENT_DEFAULTS`.
 */
export const USER_AGENT_DEFAULTS = {
  figure: { margin: "1em 40px" },
  h1: { fontSize: 36, fontWeight: "bold", margin: "0.67em 0" },
  h2: { fontSize: 27, fontWeight: "bold", margin: "0.83em 0" },
  h3: { fontSize: 21.06, fontWeight: "bold", margin: "1em 0" },
  h4: { fontSize: 18, fontWeight: "bold", margin: "1.33em 0" },
  h5: { fontSize: 14.94, fontWeight: "bold", margin: "1.67em 0" },
  h6: { fontSize: 12.06, fontWeight: "bold", margin: "2.33em 0" },
  p: { fontSize: 18, margin: "1em 0" },
  th: { fontWeight: "bold", textAlign: "center" },
} satisfies ThemeDefaults;

/** Cross-format presentation defaults used when no table or cell style overrides them. */
export const PRESENTATION_TABLE_DEFAULTS = {
  cellTextFontSize: 18,
  cellWhiteSpace: "nowrap",
  cellPadding: [0, 0.1, 0, 0.1] as const,
  headerCellBorder: { color: "2563EB", widthPt: 0.75 },
  bodyCellBorder: { color: "111111", widthPt: 0.75 },
} as const;

export const ELEMENT_DEFAULTS: {
  readonly slide: SlideStyle;
  readonly container: ViewStyle;
  readonly text: TextStyle;
  readonly textRun: TextRunStyle;
  readonly image: ImageStyle;
  readonly video: VideoStyle;
  readonly shape: ShapeStyle;
} = {
  slide: {
    backgroundColor: "#FFFFFF",
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
  },
  container: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    zIndex: 0,
    overflow: "visible",
    position: "static",
    boxSizing: "border-box",
    borderWidth: 0,
    borderStyle: "none",
    padding: 0,
    margin: 0,
  },
  text: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    zIndex: 0,
    overflow: "visible",
    position: "static",
    boxSizing: "border-box",
    borderWidth: 0,
    borderStyle: "none",
    padding: 0,
    margin: 0,
    fontFamily: "Aptos",
    fontSize: 18,
    fontWeight: "normal",
    fontStyle: "normal",
    textTransform: "none",
    direction: "ltr",
    writingMode: "horizontal-tb",
    color: "#000000",
    textAlign: "left",
    verticalAlign: "top",
    lineHeight: "normal",
    paragraphSpacingBefore: 0,
    paragraphSpacingAfter: 0,
    letterSpacing: 0,
    whiteSpace: "normal",
    wordBreak: "normal",
    overflowWrap: "normal",
    listStyleType: "none",
    superscript: false,
    subscript: false,
    fit: "none",
  },
  textRun: {
    fontFamily: "Aptos",
    fontSize: 18,
    fontWeight: "normal",
    fontStyle: "normal",
    textTransform: "none",
    direction: "ltr",
    writingMode: "horizontal-tb",
    color: "#000000",
    verticalAlign: "top",
    letterSpacing: 0,
    superscript: false,
    subscript: false,
  },
  image: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    zIndex: 0,
    overflow: "visible",
    position: "static",
    objectFit: "contain",
    objectPosition: "50% 50%",
    margin: 0,
  },
  video: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    zIndex: 0,
    overflow: "visible",
    position: "static",
    objectFit: "contain",
    objectPosition: "50% 50%",
    margin: 0,
  },
  shape: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    zIndex: 0,
    overflow: "visible",
    position: "static",
    boxSizing: "border-box",
    borderWidth: 0,
    borderStyle: "none",
    margin: 0,
    fill: "#FFFFFF",
    borderRadius: 0,
  },
};

export function elementDefaultsFor(node: SemanticNode): StyleDeclaration | undefined {
  switch (node.kind) {
    case "slide":
      return ELEMENT_DEFAULTS.slide;
    case "container":
      return ELEMENT_DEFAULTS.container;
    case "text":
      return ELEMENT_DEFAULTS.text;
    case "textRun":
      return ELEMENT_DEFAULTS.textRun;
    case "image":
      return ELEMENT_DEFAULTS.image;
    case "video":
      return ELEMENT_DEFAULTS.video;
    case "shape":
      return ELEMENT_DEFAULTS.shape;
    case "document":
      return undefined;
  }
}

export function userAgentDefaultsFor(node: SemanticNode): StyleDeclaration | undefined {
  if (!node.authoredTag) {
    return undefined;
  }

  return USER_AGENT_DEFAULTS[node.authoredTag as keyof typeof USER_AGENT_DEFAULTS];
}

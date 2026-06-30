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

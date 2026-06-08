import type { AuthoredTag } from "../authoring/tags";
import type { SemanticNode } from "../graph";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  StyleForAuthoredTag,
  StyleDeclaration,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "./types";

export type ThemeDefaults = Partial<{
  readonly [Tag in AuthoredTag]: StyleForAuthoredTag<Tag>;
}>;

export const ELEMENT_DEFAULTS: {
  readonly slide: SlideStyle;
  readonly container: ViewStyle;
  readonly text: TextStyle;
  readonly textRun: TextRunStyle;
  readonly image: ImageStyle;
  readonly shape: ShapeStyle;
} = {
  slide: {
    backgroundColor: "#FFFFFF",
    backgroundTransparency: 0,
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
  },
  container: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    overflow: "visible",
    position: "relative",
    boxSizing: "border-box",
    backgroundTransparency: 100,
    borderWidth: 0,
    borderStyle: "none",
    borderTransparency: 0,
    padding: 0,
    margin: 0,
    layout: "absolute",
  },
  text: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    overflow: "visible",
    position: "relative",
    boxSizing: "border-box",
    backgroundTransparency: 100,
    borderWidth: 0,
    borderStyle: "none",
    borderTransparency: 0,
    padding: 0,
    margin: 0,
    fontFamily: "Aptos",
    fontSize: 18,
    fontWeight: "normal",
    italic: false,
    fontStyle: "normal",
    underline: false,
    strike: false,
    textTransform: "none",
    direction: "ltr",
    writingMode: "horizontal-tb",
    color: "#000000",
    textAlign: "left",
    verticalAlign: "top",
    lineHeight: "normal",
    paragraphSpacingBefore: 0,
    paragraphSpacingAfter: 0,
    charSpacing: 0,
    letterSpacing: 0,
    whiteSpace: "normal",
    wordBreak: "normal",
    overflowWrap: "normal",
    listStyleType: "none",
    superscript: false,
    subscript: false,
    fit: "none",
    wrap: true,
  },
  textRun: {
    fontFamily: "Aptos",
    fontSize: 18,
    fontWeight: "normal",
    italic: false,
    fontStyle: "normal",
    underline: false,
    strike: false,
    textTransform: "none",
    direction: "ltr",
    writingMode: "horizontal-tb",
    color: "#000000",
    verticalAlign: "top",
    charSpacing: 0,
    letterSpacing: 0,
    superscript: false,
    subscript: false,
  },
  image: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    overflow: "visible",
    position: "relative",
    fit: "contain",
    objectFit: "contain",
    objectPosition: "50% 50%",
    transparency: 0,
    rounding: false,
    margin: 0,
  },
  shape: {
    display: "block",
    visibility: "visible",
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    overflow: "visible",
    position: "relative",
    boxSizing: "border-box",
    backgroundTransparency: 100,
    borderWidth: 0,
    borderStyle: "none",
    borderTransparency: 0,
    margin: 0,
    fill: "#FFFFFF",
    fillTransparency: 0,
    strokeWidth: 0,
    strokeOpacity: 1,
    borderRadius: 0,
    radius: 0,
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
    case "shape":
      return ELEMENT_DEFAULTS.shape;
    case "document":
      return undefined;
  }
}

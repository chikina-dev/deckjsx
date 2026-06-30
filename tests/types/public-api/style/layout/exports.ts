import type {
  CssAlignContent,
  CssGridTemplate,
  CssGridTemplateAreas,
  Spacing,
  ViewStyle,
} from "deckjsx";

const readonlySpacing = [1, "2pt", "3px", "4%"] as const;
readonlySpacing satisfies Spacing;

const readonlyGridColumns = ["1fr", "2in", "minmax(1in, 2in)"] as const;
readonlyGridColumns satisfies CssGridTemplate;

const readonlyAreas = ['"header header"', '"main side"'] as const;
readonlyAreas satisfies CssGridTemplateAreas;

const exportedStyleTypes = {
  alignContent: "space-between",
  padding: readonlySpacing,
  gridTemplateColumns: readonlyGridColumns,
  gridTemplateAreas: readonlyAreas,
  filter: "blur(2px)",
  mixBlendMode: "multiply",
  isolation: "isolate",
  transform: "rotate(15deg) translateX(10%) scale(2)",
  transformOrigin: "left top",
  backgroundImage: "url(./image.png)",
  backgroundRepeat: "repeat-x",
  backgroundClip: "content-box",
  backgroundOrigin: "padding-box, border-box",
  backgroundSize: "contain, 100% 100%",
  backgroundPosition: "right bottom, center",
  border: "2pt solid dodgerblue",
  borderWidth: "thin",
  borderTopWidth: "0.25pt",
  outline: "2pt dotted rgba(255, 0, 0, 0.5)",
  borderTop: "1pt solid #111111",
  boxShadow: "inset 4px 8px 12px rgba(15, 23, 42, 0.3)",
  placeSelf: "start center",
  placeItems: "end center",
  placeContent: "center end",
} satisfies ViewStyle & { alignContent?: CssAlignContent };
void exportedStyleTypes;

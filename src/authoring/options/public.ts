import type { ThemeValue } from "../../style/theme/public";
import type { ProjectionFormat } from "../../pipeline/public";
import type { EmptySlideTemplateSet, SlideTemplateSet } from "../../templates";

/**
 * Public Deck construction options for authoring, projection, and rendering.
 *
 * A Deck layout defines the slide coordinate space used by absolute positioning and PPTX
 * projection. Ordinary authored elements still use normal flow by default; fixed placement is
 * explicit through `position: "absolute"` plus CSS positioning style properties.
 *
 * Theme defaults, StyleSheets, and Slide Templates are checked against the public authoring API.
 * Internal normalized style maps and projection-only fields are intentionally not accepted here.
 *
 * @typeParam TTemplates - Deck-local Slide Template set used to type `slide({ template })` handles.
 */
export type DeckOptions<TTemplates extends SlideTemplateSet = EmptySlideTemplateSet> = {
  /** Slide size and authoring unit for numeric lengths. */
  layout: {
    /** Slide width in `layout.unit`. */
    width: number;
    /** Slide height in `layout.unit`. */
    height: number;
    /** Unit used by numeric authored geometry values. */
    unit: "in" | "pt";
  };
  /** Deck-local Slide Templates exposed as typed Template Area References in templated slides. */
  templates?: TTemplates;
  /** Presentation metadata written by supported renderers. */
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
  /** Theme defaults keyed by authored deckjsx tags and checked against tag-specific style types. */
  theme?: ThemeValue;
  /** Output artifact formats this Deck is expected to produce. */
  output?: {
    formats?: readonly ProjectionFormat[];
  };
};

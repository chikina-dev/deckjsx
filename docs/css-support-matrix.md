# deckjsx CSS Support Matrix

Version: `0.3-draft`

This document is the working source of truth for CSS-style authoring in `deckjsx`.
Its job is not only to list supported keys, but also to define:

- which API names are canonical today
- which names are temporary deck-specific names
- which future CSS aliases we intend to support
- what must be true before a checkbox is marked complete

The goal is a clean path from the current `style` object API toward richer CSS compatibility without collapsing backend independence or IR clarity.

## Scope

This document covers:

- JSX `style` object authoring
- normalization into compiler-internal values
- mapping into `Presentation IR`
- backend emission expectations
- testing expectations for claiming support

This document does not yet claim support for:

- external stylesheet parsing
- selector matching
- browser DOM layout parity
- general-purpose CSS engines

## Definition Of Done

Mark a property or feature as supported only when all of the following are true:

- [ ] authoring: it can be expressed through the public API
- [ ] normalization: it is validated and normalized in the compiler
- [ ] IR: its semantics survive in `Presentation IR` when relevant
- [ ] backend: at least one concrete backend emits it intentionally
- [ ] tests: behavior is covered by tests
- [ ] docs: differences from browser CSS are documented

If any one of these is missing, leave the feature unchecked and note the gap.

## Status Legend

- `[x]` supported now
- `[ ]` not supported yet

Notes:

- If a feature is only modeled in authoring or IR but not emitted reliably, it stays unchecked.
- If a feature exists under a deck-specific name rather than a CSS name, check the deck-specific entry and leave the CSS alias unchecked.

## Compatibility Policy

### Canonical authoring shape

- [x] styling is grouped under a `style` object
- [x] layout and visual props can be expressed in one object
- [ ] only `style` is accepted, with flat top-level visual props fully removed

Notes:

- Flat props are still read as a fallback for compatibility.
- The long-term direction is for `style` to be the only canonical styling surface.

### Naming policy

- [x] allow deck-specific names when there is no stable CSS mapping yet
- [ ] prefer CSS property names for newly added features
- [ ] define alias policy for deck-specific names versus CSS names
- [ ] define deprecation policy for renamed keys

### Semantic policy

- [x] prioritize IR clarity over pretending to be browser CSS
- [x] allow PowerPoint-oriented semantics when necessary
- [ ] classify every property as `css-like`, `deck-specific`, or `backend-specific`

## Current API Surface

### Component support

- [x] `Slide` accepts `style`
- [x] `View` accepts `style`
- [x] `Text` accepts `style`
- [x] `Image` accepts `style`
- [x] `Shape` accepts `style`
- [ ] `className`
- [ ] `id`
- [ ] style arrays
- [ ] style composition helpers

### Runtime and pipeline support

- [x] style object authoring
- [x] style normalization inside compiler
- [x] style information preserved in IR where needed
- [x] `PptxGenJS` backend consumes current style primitives
- [ ] OOXML direct backend parity
- [ ] backend parity suite shared across emitters

## Property Matrix

The entries below are grouped by intent.
Each property is listed once under its preferred future CSS-facing concept.
If the currently implemented key differs, it is noted explicitly.

## Support Horizon

Unchecked items are not all equally difficult.
Many more CSS-shaped features are realistic for `deckjsx` than the current checked set might suggest.

### Tier A: straightforward compiler work

- [x] CSS-facing aliases for current deck-native names
- [x] additional spacing shorthands
- [x] more unit syntaxes
- [x] per-side borders
- [x] typography aliases such as `fontStyle`, `letterSpacing`, `lineHeight`
- [x] image aliases such as `objectFit`
- [x] common flex alignment keywords and per-item cross-axis overrides

### Tier B: realistic with IR expansion

- [ ] rich text runs
- [x] gradients
- [x] shadows
- [x] crop and object positioning
- [ ] broader transform modeling
- [x] grid-like layout primitives

### Tier C: realistic with a style system layer

- [ ] `className`
- [ ] token and theme variable resolution
- [ ] style composition and merging
- [ ] selector matching
- [ ] simple cascade rules

### Tier D: expensive or intentionally limited

- [ ] full browser flexbox parity
- [ ] full browser grid parity
- [ ] pseudo-classes and pseudo-elements
- [ ] full inheritance parity
- [ ] browser layout parity in general

## 1. Sizing And Positioning

### Current supported properties

- [x] `x`
- [x] `y`
- [x] `width`
- [x] `height`
- [x] percentage lengths for these frame values
- [x] bare numbers for geometry
- [x] `"in"` values
- [x] `"pt"` values

### Planned CSS-facing aliases

- [x] `left`
- [x] `top`
- [ ] `width` as canonical CSS-facing name with same semantics
- [ ] `height` as canonical CSS-facing name with same semantics
- [x] `inset`
- [x] `aspectRatio`
- [x] `boxSizing`
- [x] `right`
- [x] `bottom`
- [x] `minWidth`
- [x] `minHeight`
- [x] `maxWidth`
- [x] `maxHeight`

Notes:

- `x` and `y` are currently deck-native positioning keys.
- `left` and `top` are now accepted as CSS-facing aliases for `x` and `y`.
- `right` and `bottom` are now accepted when `width` and `height` are known.
- `inset` is accepted as a shorthand for `top` / `right` / `bottom` / `left`, and explicit side props still win.
- `aspectRatio` currently derives the missing width or height when exactly one dimension is available.
- `boxSizing: "content-box"` currently makes explicit width and height represent the content box, with padding added to the emitted outer frame size.
- `minWidth`, `minHeight`, `maxWidth`, and `maxHeight` clamp resolved frame sizes after normal sizing or stretch placement is computed.
- The current default remains `border-box` for compatibility with the existing compiler behavior.
- When both `x/left` and `right` are provided, `x/left` currently win.

## 2. Layout

### Current supported properties

- [x] `layout: "absolute"`
- [x] `layout: "stack"`
- [x] `direction`
- [x] `gap`
- [x] `padding`
- [x] `alignItems`
- [x] `justifyContent`

### Planned CSS-facing aliases

- [x] `display`
- [x] `position`
- [x] `flexDirection`
- [x] `alignContent`
- [x] `justifySelf`
- [x] `placeSelf`
- [x] `order`
- [x] `rowGap`
- [x] `columnGap`
- [x] `paddingTop`
- [x] `paddingRight`
- [x] `paddingBottom`
- [x] `paddingLeft`
- [x] `margin`
- [x] `marginTop`
- [x] `marginRight`
- [x] `marginBottom`
- [x] `marginLeft`
- [x] `alignSelf`
- [x] `placeItems`
- [x] `placeContent`
- [x] `flexWrap`
- [x] `flexGrow`
- [x] `flexShrink`
- [x] `flexBasis`
- [x] `display: grid`
- [x] `gridTemplateColumns`
- [x] `gridTemplateRows`
- [x] `gridAutoColumns`
- [x] `gridAutoRows`
- [x] `gridAutoFlow`
- [x] `gridColumn`
- [x] `gridRow`
- [x] `gridColumnStart`
- [x] `gridColumnEnd`
- [x] `gridRowStart`
- [x] `gridRowEnd`
- [x] `gridTemplateAreas`
- [x] `gridArea`
- [x] `gridTemplate`
- [x] `grid`
- [x] `minmax()`
- [x] `repeat(auto-fill, ...)`
- [x] `repeat(auto-fit, ...)`

Notes:

- `layout: "stack"` is conceptually closer to a constrained flex-like layout than browser block layout.
- `direction` is the current deck-native name; `flexDirection` is the likely CSS-facing alias.
- `gap` is CSS-like and may remain the canonical name.
- Partial support exists today: `display: "flex"` maps to stack layout, `display: "block"` maps to absolute layout, and `flexDirection: "row" | "column"` maps to current stack direction.
- `margin` support is currently layout-oriented and most meaningful in stack layout.
- `justifyContent` currently supports `start`, `flex-start`, `center`, `end`, `flex-end`, `space-between`, `space-around`, and `space-evenly`.
- `alignItems` and `alignSelf` currently support `start`, `flex-start`, `center`, `end`, `flex-end`, and `stretch`.
- `alignContent` currently supports `start`, `flex-start`, `center`, `end`, `flex-end`, `space-between`, `space-around`, `space-evenly`, and `stretch`.
- `stretch` currently applies only when the child has no explicit cross-axis size.
- `order` currently reorders in-flow stack children only.
- `position: "absolute"` currently takes a child out of stack flow and positions it relative to the padded content box of the stack container.
- `flexWrap: "wrap"` currently packs stack children into multiple lines or columns and respects `rowGap` / `columnGap`.
- `flexBasis` currently overrides the main-axis base size used for line packing and sizing distribution.
- `flexGrow` distributes positive free space within each line.
- `flexShrink` distributes negative free space within each line using a simplified shrink-weight model based on `flexShrink * flexBasis-or-size`.
- `flexShrink` currently defaults to `1`, matching browser flexbox more closely than the previous fixed-size behavior.
- `display: "grid"` currently supports explicit `gridTemplateColumns` / `gridTemplateRows`, row-major auto placement, and explicit `gridColumn` / `gridRow`.
- `gridColumn` and `gridRow` currently support basic line ranges and `span N`.
- `gridColumnStart`, `gridColumnEnd`, `gridRowStart`, and `gridRowEnd` currently resolve through the same placement path as shorthand properties.
- `gridTemplateAreas` and item `gridArea: "name"` currently support named rectangular areas.
- `gridArea` currently also supports line-based shorthand such as `"1 / 2 / 3 / 4"`.
- `gridTemplate` currently supports a simplified shorthand that expands into named area rows plus explicit row and column track lists.
- `grid` currently acts as a container-level shorthand that implies `display: "grid"` and supports both template-style authoring and simplified `auto-flow` forms for implicit row or column tracks, including dense row and dense column flow.
- Explicit `gridTemplate*`, `gridAuto*`, and `gridAutoFlow` props currently override values derived from `grid` shorthand.
- Grid track sizing currently supports absolute deck lengths, percentages, and simple `fr` units.
- `repeat(N, ...)` is currently supported for simple track list expansion.
- `minmax(min, max)` is currently supported for fixed max track sizes and `fr` max track sizes, including implicit auto tracks.
- `minmax(auto, ...)` currently uses a simplified content-based minimum derived from grid item natural sizes.
- Multi-span items currently contribute by distributing remaining required size evenly across covered auto-min tracks.
- `repeat(auto-fill, ...)` currently expands to as many repeated tracks as fit within the padded content box, using the repeated track minimum size.
- `repeat(auto-fit, ...)` currently collapses trailing empty repeated tracks when the whole template is a single auto-repeat expression.
- `gridAutoColumns` and `gridAutoRows` currently size implicit tracks when placement extends beyond the explicit template.
- `gridAutoFlow` currently supports `row`, `column`, `row dense`, and `column dense`.
- `justifySelf` and `placeSelf` currently align grid items inside their resolved cells; default behavior remains stretch-like.
- `justifyItems` and `placeItems` currently provide container-level defaults for grid item alignment.
- `placeContent` currently aligns the resolved grid track area within the padded content box when explicit track sizes leave free space.
- `placeContent: stretch` currently redistributes remaining inline and block free space evenly across the resolved grid tracks.
- CSS Grid support is still compatible with the project shape if we choose to build the layout solver.

## 3. Backgrounds And Fills

### Current supported properties

- [x] `backgroundColor`
- [x] `backgroundTransparency`
- [x] `fill` for `Shape`
- [x] `fillTransparency` for `Shape`

### Planned CSS-facing aliases

- [x] `background`
- [x] `backgroundImage`
- [x] `backgroundSize`
- [x] `backgroundPosition`
- [x] `backgroundRepeat`
- [ ] `backgroundBlendMode`
- [x] `backgroundClip`
- [x] `backgroundOrigin`
- [ ] `backgroundAttachment`
- [x] gradients
- [ ] pattern fills
- [x] multiple backgrounds
- [x] alpha-enabled color parsing

Notes:

- `backgroundTransparency` is PowerPoint-oriented and not a browser CSS name.
- `background` now supports color-only shorthand, standalone gradient values, and a practical `url(...)` shorthand subset for slide, `View`, `Text`, and `Shape` backgrounds.
- `backgroundImage` is currently supported as a CSS-facing alias for fill-producing values, primarily `linear-gradient(...)`, `radial-gradient(...)`, and `url(...)` background image layers, on `Slide`, `View`, `Text`, and `Shape`.
- `fill` is shape-specific and probably remains deck-specific at the primitive level.
- `backgroundColor` and `fill` currently accept hex, alpha hex, `rgb()` / `rgba()`, and `hsl()` / `hsla()` color syntax.
- `linear-gradient(...)` currently supports direction or angle, at least two stops, and percentage or supported length stop positions.
- `repeating-linear-gradient(...)` is currently supported by expanding the repeated stop pattern across the emitted 0% to 100% gradient range.
- `radial-gradient(...)` currently supports `circle` and `ellipse`, optional `at` positions, CSS size keywords, explicit radii, at least two stops, and percentage or supported length stop positions.
- `radial-gradient(... at ...)` positions now accept keyword pairs, edge-offset syntax such as `right 25% bottom 10%`, and supported length offsets such as `right 0.5in bottom 0.25in`.
- `repeating-radial-gradient(...)` is currently supported by expanding the repeated stop pattern across the emitted 0% to 100% gradient range.
- Multi-position color stops are currently supported and expand to equivalent duplicated stops in IR.
- Color hints are currently approximated by inserting the midpoint color at the hinted position.
- Length stop positions currently normalize against the linear gradient span or the larger radial ending radius, which is close to CSS intent but not guaranteed to be browser-perfect in every edge case.
- Multiple backgrounds are now supported for fill-producing `background` / `backgroundImage` layer lists by keeping the first layer as the primary fill and emitting the remaining layers as stacked background shapes underneath.
- `backgroundSize` is currently supported for `url(...)` background image layers with `cover`, `contain`, `100% 100%`, and one/two-value explicit sizes using supported lengths, percentages, and `auto`.
- `backgroundPosition` is currently supported for `url(...)` background image layers using the same keyword, percentage, and edge-offset parsing as image `objectPosition`.
- `backgroundRepeat` is currently supported for `url(...)` background image layers with `no-repeat`, `repeat-x`, `repeat-y`, and `repeat`, by expanding image tiles during backend emission.
- `backgroundClip` is currently supported for solid colors, gradients, and `url(...)` background image layers with `border-box`, `padding-box`, and `content-box`, by shrinking the emitted background paint frame.
- `backgroundOrigin` is currently supported for gradients and `url(...)` background image layers with `border-box`, `padding-box`, and `content-box`, by separating the gradient or image positioning frame from the final paint frame.
- `backgroundOrigin` and `backgroundClip` now also accept comma-separated layer lists for multiple backgrounds, with each value applied to the matching layer index.
- `background` shorthand currently supports fill-producing layers and `url(...)` layers with inline visual-box values for `backgroundOrigin` / `backgroundClip`; `url(...)` layers also support inline `backgroundRepeat`, `backgroundPosition`, and `/ backgroundSize` values such as `url(...) no-repeat right bottom / contain`, `url(...) no-repeat padding-box content-box / 100% 100%`, `linear-gradient(...) padding-box content-box`, or `linear-gradient(...) #AAAAAA padding-box content-box` for a gradient plus same-layer color fallback.
- `backgroundOrigin` currently defaults to `border-box` for compatibility with the existing compiler behavior, rather than browser CSS's usual `padding-box`.
- This currently models layered painting order and works best for color, gradient, and image layers; blend modes, `backgroundAttachment`, and the broader `background-*` image positioning model are still unsupported.
- Explicit `backgroundColor` still wins over `backgroundImage` and `background`.

## 4. Borders And Stroke

### Current supported properties

- [x] `borderColor`
- [x] `borderWidth`
- [x] `borderStyle`
- [x] `borderTransparency`
- [x] `borderRadius`
- [x] `radius` for `Shape`

### Planned CSS-facing aliases

- [x] `border`
- [x] `outline`
- [x] `outlineColor`
- [x] `outlineWidth`
- [x] `outlineStyle`
- [x] `borderTop`
- [x] `borderRight`
- [x] `borderBottom`
- [x] `borderLeft`
- [x] `borderTopColor`
- [x] `borderRightColor`
- [x] `borderBottomColor`
- [x] `borderLeftColor`
- [x] `borderTopWidth`
- [x] `borderRightWidth`
- [x] `borderBottomWidth`
- [x] `borderLeftWidth`
- [x] `borderTopStyle`
- [x] `borderRightStyle`
- [x] `borderBottomStyle`
- [x] `borderLeftStyle`
- [ ] `borderRadius` shorthand expansion
- [ ] elliptical border radius syntax
- [x] line cap controls
- [x] line join controls
- [x] `boxShadow`

Notes:

- `borderStyle` is currently limited to `none | solid | dash`.
- `border` currently expands width, style, and color in any order, with `dashed` normalized to deckjsx `dash`.
- `outline` currently uses the same width, style, and color parsing rules as `border`.
- `outline` is currently modeled separately from `border` in IR and emitted by the `PptxGenJS` backend as an additional transparent shape around the node frame.
- Per-side borders are now modeled as `edgeStrokes` in IR and take precedence over uniform `stroke` emission for the same node.
- The current `PptxGenJS` backend emits per-side borders as four independent line shapes around the node frame, which is a rectangular approximation rather than a full rounded-corner border model.
- `strokeLinecap` currently supports `butt | round | square`, and `strokeLinejoin` currently supports `miter | round | bevel`; they flow through the current stroke model for border, outline, and shape stroke emission.
- `boxShadow` currently supports a single shadow layer with `offset-x offset-y blur color` and optional `inset`; a fourth CSS spread length is accepted but currently ignored by the backend model.
- `radius` for shapes is deck-specific and not the same concept as general CSS `border-radius`.

## 5. Typography

### Current supported properties

- [x] `fontFamily`
- [x] `fontSize`
- [x] `fontWeight`
- [x] `italic`
- [x] `underline`
- [x] `strike`
- [x] `color`
- [x] `textAlign`
- [x] `verticalAlign`
- [x] `padding` on text boxes
- [x] `lineSpacing`
- [x] `lineSpacingMultiple`
- [x] `paragraphSpacingBefore`
- [x] `paragraphSpacingAfter`
- [x] `charSpacing`
- [x] `wrap`
- [x] `fit`

### Planned CSS-facing aliases

- [x] `fontStyle`
- [ ] `fontStretch`
- [ ] `fontKerning`
- [ ] `fontVariantCaps`
- [x] `textDecoration`
- [x] `textDecorationLine`
- [x] `textDecorationStyle`
- [x] `textDecorationColor`
- [ ] `textDecorationThickness`
- [x] `lineHeight`
- [x] `letterSpacing`
- [x] `textIndent`
- [x] `whiteSpace`
- [x] `wordBreak`
- [x] `overflowWrap`
- [ ] `hyphens`
- [ ] `textOverflow`
- [x] `textTransform`
- [ ] `fontVariant`
- [x] `direction`
- [x] `writingMode`
- [ ] `unicodeBidi`

Notes:

- `italic`, `underline`, and `strike` are currently deck-specific booleans rather than CSS-style text decoration properties.
- `fontStyle: "italic"` is supported as an alias over the current italic flag.
- `charSpacing` is a deck-specific name, and `letterSpacing` is now supported as a CSS-facing alias.
- `lineSpacing` and `lineSpacingMultiple` are PowerPoint-oriented and need a policy before adding `lineHeight`.
- `lineHeight` currently treats numeric values as `lineSpacingMultiple` and absolute values as exact point-based line spacing.
- `textIndent` currently maps to paragraph first-line indentation and is emitted through backend XML patching; for lists it is applied relative to the existing hanging-indent paragraph model.
- `textDecoration` and `textDecorationLine` currently target `underline` and `line-through` only, with `none` supported as a reset.
- `textDecorationStyle` and `textDecorationColor` currently apply to underline emission only; line-through remains a backend approximation without separate style/color control.
- `whiteSpace` currently acts as a simplified alias over `wrap`, with `normal` enabling wrapping and `nowrap` disabling it.
- `wordBreak` and `overflowWrap` currently act as simplified aliases that enable wrapping for `break-all`, `break-word`, and `anywhere`.
- `textTransform` currently supports `uppercase`, `lowercase`, and `capitalize` through compiler-side text normalization before IR emission.
- `textShadow` is supported as a single-layer shadow shorthand and currently maps to backend text-object shadowing rather than full browser-accurate glyph shadow behavior.
- `direction: "rtl"` is currently supported for text and maps to backend right-to-left paragraph emission; `ltr` is treated as the default.
- `writingMode` currently supports `horizontal-tb`, `vertical-rl`, and `vertical-lr`, mapping to the backend text box direction model rather than full browser block-flow semantics.
- `fit` is intentionally deck-specific and may remain separate from CSS naming.

## 6. Text Content Structure

- [x] plain text node content
- [ ] inline rich text runs
- [ ] spans with nested style overrides
- [x] hyperlinks
- [x] bullets
- [x] numbered lists
- [x] tab stops
- [x] text shadows
- [ ] text outlines
- [x] superscript and subscript runs
- [ ] inline images or emoji asset fallback

Notes:

- Hyperlinks are currently supported as node-level `href` and optional `tooltip` on `Text`, `Image`, and `Shape`.
- Bullets and numbered lists are currently supported for plain text nodes through `listStyleType`, optional `listStart`, and optional `listIndent`.
- Tab stops are currently supported for plain text nodes through `tabStops`, with per-stop `position` and optional `alignment`.
- `superscript` and `subscript` are currently supported for plain text nodes, but not for nested rich text runs because inline run modeling does not exist yet.
- Rich text support likely requires a deeper IR model rather than only new style keys.

## 7. Images

### Current supported properties

- [x] `src`
- [x] `data`
- [x] `fit`
- [x] `transparency`
- [x] `rounding`
- [x] `rotation`
- [x] `flipH`
- [x] `flipV`

### Planned CSS-facing aliases

- [x] `objectFit`
- [x] `objectPosition`
- [ ] `aspectRatio`
- [x] crop controls
- [x] `borderRadius` on images
- [x] `opacity` backend parity for images
- [ ] image filters
- [ ] blend modes
- [ ] masks
- [ ] clip paths

Notes:

- `objectFit` is now accepted as a CSS-facing alias for image `fit`.
- `objectFit` is now emitted by the current `PptxGenJS` backend as `stretch`, `contain`, or cover-style source cropping.
- `objectPosition` is supported for image placement; `contain` currently positions the fitted image within the authored frame, while `cover` currently shifts the crop window within the source image.
- `objectPosition` now also accepts edge-offset syntax and supported length offsets, for example `right 25% bottom 10%` or `left 0.25in bottom 0.25in`.
- `rounding` is currently deck-specific.
- crop controls are currently supported through `crop: { top, right, bottom, left }`, with numeric values treated as `0..1` fractions and percentage strings also accepted.
- `borderRadius` on images is currently a coarse alias to `rounding`, so non-zero values become rounded images without preserving exact radius geometry.
- `boxShadow` is supported on images through the current backend shadow model.
- image `opacity` now combines with image `transparency` during backend emission.

## 8. Shapes

### Current supported properties

- [x] `shape`
- [x] `fill`
- [x] `fillTransparency`
- [x] `backgroundColor` alias for shape fill
- [x] `background` color alias for shape fill
- [x] `borderColor`
- [x] `borderWidth`
- [x] `borderStyle`
- [x] `borderTransparency`
- [x] `radius`
- [x] `rotation`
- [x] `flipH`
- [x] `flipV`

### Planned CSS-facing aliases

- [ ] arbitrary vector path data
- [x] gradient fill
- [x] shape shadows
- [x] stroke dash arrays
- [x] stroke cap and join controls
- [ ] `clipPath`
- [x] `stroke`
- [x] `strokeWidth`
- [x] `strokeOpacity`
- [ ] SVG path import

Notes:

- Primitive shape support is intentionally deck-native.
- `Shape` now accepts `backgroundColor`, `backgroundImage`, color-only `background`, and gradient `background` values as CSS-facing aliases for `fill`.
- `Shape` accepts `borderRadius` as a CSS-facing alias for deck-specific `radius`.
- `Shape` now accepts `stroke`, `strokeWidth`, and `strokeOpacity` as CSS/SVG-facing aliases over the current border stroke model.
- `Shape` now accepts `strokeDasharray` as a CSS/SVG-facing alias and maps common dash patterns to the nearest PowerPoint dash preset during backend emission.
- `Shape` now accepts `strokeLinecap` and `strokeLinejoin` as CSS/SVG-facing aliases and patches the emitted OOXML line settings when the backend does not expose them directly.
- `boxShadow` is supported on shapes through the current backend shadow model.
- Shapes are likely to remain a domain-specific extension even after CSS alignment improves elsewhere.

## 9. Shared Visual Controls

### Current supported properties

- [x] `rotation`
- [x] `flipH`
- [x] `flipV`
- [x] `opacity` modeled in authoring and IR
- [x] `zIndex` modeled in authoring and IR

### Gaps

- [x] `opacity` emitted reliably by backend
- [x] `zIndex` ordering guaranteed by backend
- [x] `visibility`
- [x] `display: none`
- [x] `overflow: hidden`
- [x] `transform`
- [x] `transformOrigin`
- [x] `scale`
- [x] `translate`
- [x] `skew`
- [x] `matrix`
- [ ] `filter`
- [ ] `backdropFilter`
- [ ] `mixBlendMode`
- [ ] `isolation`

Notes:

- `visibility: "hidden"` is preserved through layout and currently emitted by skipping the visual node while keeping resolved layout positions intact.
- sibling `zIndex` ordering is currently normalized before backend emission, and the current `PptxGenJS` backend emits nodes in that paint order.
- node `opacity` is currently combined into text, shape, image, border, outline, shadow, and descendant emission during backend output, approximating CSS-style inherited group opacity.
- `zIndex` currently sorts sibling nodes in compiled IR, and the `PptxGenJS` backend emits in that resolved order.
- `display: none` currently removes nodes before layout emission, so hidden nodes do not consume stack or grid space.
- `visibility: hidden` currently preserves layout and IR nodes, and the `PptxGenJS` backend skips visual emission for those nodes.
- `overflow: hidden` is currently supported on `View` as compile-time rectangular clipping against the container frame.
- The current clipping model drops fully clipped descendants and intersects partially clipped descendant frames; it is intentionally simpler than browser-accurate paint-time clipping.
- For partially clipped images, the `PptxGenJS` backend now also adjusts emitted `srcRect` values so the visible image portion stays aligned with the clipped frame instead of stretching the full source into the smaller box.
- `transform` is currently a compatibility alias over primitive `rotation`, `flipH`, and `flipV`.
- The current `transform` support is intentionally partial: `rotate(...)`, `rotateZ(...)`, `translate(...)`, `translateX(...)`, `translateY(...)`, `scale(...)`, `scaleX(...)`, `scaleY(...)`, `skew(...)`, `skewX(...)`, `skewY(...)`, and `matrix(...)` are supported.
- `transformOrigin` is currently supported for keyword, percentage, and supported length values, and affects the current compile-time `scale(...)` behavior plus emitted rotation positioning.
- Rotation and mirroring map to the existing PowerPoint-oriented transform model, while translate and positive scale are currently applied as compile-time frame changes.
- Scale currently resizes around the node's center by default, or the resolved `transformOrigin` when provided, and transform functions are applied left-to-right using the current resolved frame at each step.
- `transformOrigin` currently affects scale and rotate positioning, but translate remains the current compile-time offset model.
- `skew(...)`, `skewX(...)`, and `skewY(...)` are currently approximated as compile-time bounding-box changes around the resolved `transformOrigin`; the backend does not emit a true skew transform.
- `matrix(...)` is currently approximated as a compile-time affine bounding-box change around the resolved `transformOrigin`, with `tx` and `ty` interpreted as CSS px-equivalent offsets; the backend does not emit a true affine matrix transform.
- `matrix3d(...)` and perspective-style transforms are not supported.

## 10. Units And Value Syntax

### Current supported syntax

- [x] bare numbers for geometry
- [x] bare numbers for text size where applicable
- [x] `"in"`
- [x] `"pt"`
- [x] `"%"` where parent size is known

### Planned syntax

- [x] `"px"`
- [x] `"em"`
- [x] `"rem"`
- [x] `"vh"`
- [x] `"vw"`
- [x] `"ch"`
- [ ] viewport-relative units
- [ ] `calc()`
- [ ] CSS variables
- [x] color functions such as `rgb()` or `hsl()`
- [x] named colors
- [x] alpha hex such as `#RRGGBBAA`

Notes:

- Bare numbers are intentionally presentation-oriented, not browser-oriented.
- Geometry defaults and text defaults do not necessarily use the same implicit unit.
- `px` values are currently normalized using `96px = 1in`.
- `rem` currently uses a root size equivalent to browser-default `16px`.
- `em` currently uses the current text node `fontSize` when that context exists, and otherwise falls back to the same root size as `rem`.
- `ch` is currently an approximation based on `0.5em`, not a measured glyph width.
- `vw` and `vh` are currently resolved against the slide viewport.
- Color parsing currently supports hex, alpha hex, `rgb()` / `rgba()`, and `hsl()` / `hsla()`.
- CSS named colors are currently supported, including uncommon values such as `rebeccapurple`, with `transparent` mapped to zero alpha.

## 11. CSS Engine Features

- [ ] stylesheet parsing
- [ ] selector matching
- [ ] inline style plus class style merge
- [ ] cascade
- [ ] specificity
- [ ] inheritance
- [ ] descendant selectors
- [ ] child selectors
- [ ] attribute selectors
- [ ] pseudo-classes
- [ ] pseudo-elements
- [ ] media queries
- [ ] container queries
- [ ] theme token expansion

Notes:

- These are separate milestones from property support.
- We should not mark individual CSS property names as truly supported in the browser sense until this layer exists or an explicit no-cascade policy is adopted.

## 12. Backend Parity

- [x] `PptxGenJS` backend consumes current style primitives intentionally
- [ ] `PptxGenJS` backend parity for all modeled IR properties
- [ ] OOXML direct backend support
- [ ] parity fixture suite shared across backends
- [ ] compatibility policy for backend-only approximations

Notes:

- A property modeled in IR but silently ignored during emission is not complete support.

## 13. Testing Requirements

- [x] IR snapshot tests exist
- [x] end-to-end `.pptx` smoke test exists
- [ ] focused tests for each supported style key
- [ ] compatibility tests for deck-native key versus CSS alias
- [ ] backend parity fixture deck
- [ ] visual regression workflow
- [ ] failure tests for unsupported combinations
- [ ] golden layout fixture decks
- [ ] typography fixture decks for line-breaking differences
- [ ] image sizing fixture decks

## 14. Canonical Mapping Candidates

This section records likely future naming decisions.
It is intentionally conservative; entries stay unchecked until the project adopts them.

- [ ] `left` canonical alias for `x`
- [ ] `top` canonical alias for `y`
- [ ] `display: "flex"` canonical alias for `layout: "stack"`
- [ ] `display: "block"` or `position: "absolute"` canonical alias for `layout: "absolute"`
- [ ] `flexDirection` alias for `direction`
- [ ] `letterSpacing` alias for `charSpacing`
- [ ] `lineHeight` alias for `lineSpacing` / `lineSpacingMultiple`
- [x] `fontStyle: "italic"` alias for `italic`
- [ ] `textDecoration` alias for `underline` and `strike`
- [x] `objectFit` alias for image `fit`
- [ ] `opacity` canonical over backend-specific transparency names where semantics match

Notes:

- We should prefer aliases first, then deprecations, rather than abrupt renames.

## 15. Priority Roadmap

### Near-term

- [ ] define canonical CSS-facing aliases for layout primitives
- [ ] add `className`
- [ ] decide whether `display` and `flexDirection` become first-class aliases now
- [ ] add focused tests for every currently checked property
- [ ] add compatibility tests for deck-native key versus CSS alias
- [ ] add failure tests for unsupported combinations
- [x] add `margin`
- [x] add `left` and `top` aliases for `x` and `y`
- [x] add `fontStyle`, `letterSpacing`, and `lineHeight` aliases
- [x] add per-side borders
- [x] add `boxShadow`
- [x] add grid-style layout support
- [x] add `objectFit` alias

### Mid-term

- [ ] expand overflow and clipping semantics beyond basic rectangular `overflow: hidden`
- [x] add gradient fills
- [ ] add theme token support
- [ ] document alias/deprecation policy
- [ ] expand typography fidelity beyond current PowerPoint-oriented approximations
- [ ] tighten `PptxGenJS` parity for all modeled IR properties

### Long-term

- [ ] stylesheet parsing
- [ ] selector matching
- [ ] cascade and inheritance model
- [ ] OOXML backend parity
- [ ] richer transform pipeline
- [ ] broader CSS value parsing

## 16. Compatibility Claim

The public claim should remain:

- a compiler with CSS-shaped authoring
- not a CSS engine
- not yet selector-aware
- not yet alias-stable

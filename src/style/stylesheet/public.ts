import type { AuthoredTag } from "../../authoring/tags";
import type { StyleForAuthoredTag, UntargetedStyleClassStyle } from "../types";
import { STYLE_SHEET_VALUE } from "./marker";

/**
 * CSS-like selector used to bind a StyleSheet class to authored tags.
 *
 * Selectors are intentionally small: class selectors, tag/class compounds, and descendant
 * selectors. When the rightmost selector contains an authored tag, the class style is checked
 * against that tag's public style type. `StyleSheet` constructor inference performs the deeper
 * literal validation for class/target agreement, unsupported selector syntax, and per-tag style
 * keys.
 */
type StyleTargetClassName = string;
export type SimpleStyleTargetSelector =
  | `.${StyleTargetClassName}`
  | AuthoredTag
  | `${AuthoredTag}.${StyleTargetClassName}`;
export type StyleTargetSelector =
  | SimpleStyleTargetSelector
  | `${string} ${SimpleStyleTargetSelector}`;
/**
 * Non-empty list of public StyleSheet target selectors.
 *
 * Runtime diagnostics still validate JavaScript and casted inputs, but typed authoring should not
 * express an empty target list because it cannot bind a style declaration to any authored tag.
 */
export type NonEmptyStyleTargetSelectorList = readonly [
  StyleTargetSelector,
  ...StyleTargetSelector[],
];
/** Public target value accepted by a targeted StyleSheet class definition. */
export type StyleTargetInput = StyleTargetSelector | NonEmptyStyleTargetSelectorList;

/**
 * Public style accepted by targetless StyleSheet class definitions.
 *
 * Targetless class objects intentionally do not accept arbitrary style keys. Use a `target` that
 * names the authored tag, such as `p.title` or `div.card`, and put style declarations under
 * `style` so TypeScript can check them against the same public style contract used by TSX.
 */
export type StyleClassStyle = UntargetedStyleClassStyle;

/**
 * Style class definition with an explicit target selector and tag-checked public style object.
 *
 * The rightmost selector determines the authored tag. Descendant selectors are supported, but
 * pseudo selectors, combinators, ids, and arbitrary CSS selectors are outside the public authoring
 * API.
 *
 * Pass a literal target type, for example `TargetedStyleClassDefinition<"p.title">`, when using
 * this helper directly. `new StyleSheet(...)` infers that target from each class definition.
 */
export type TargetedStyleClassDefinition<TTarget extends StyleTargetInput> = {
  readonly target: TTarget;
  readonly style: Partial<StyleForStyleTarget<TTarget>>;
};

/**
 * Public StyleSheet class definition.
 *
 * A class may either be targetless with no authored style keys, or targeted to an authored tag with
 * `style` checked against that tag. This keeps internal normalization and broad style maps out of
 * the authoring API.
 *
 * Pass a literal target type, for example `StyleClassDefinition<"div.card">`, when using this
 * helper directly. The `StyleSheet` constructor remains the preferred authoring surface because it
 * infers and validates every class target from the object literal.
 */
export type StyleClassDefinition<TTarget extends StyleTargetInput> =
  | UntargetedStyleClassStyle
  | TargetedStyleClassDefinition<TTarget>;

/**
 * Public StyleSheet constructor input.
 *
 * Targeted classes are checked against their selected authored tags. Class names that are plain CSS
 * identifiers must appear in the rightmost selector so accidental selector/style mismatches fail at
 * the type boundary. Prefer `new StyleSheet({ classes })` for inference; use this helper with an
 * explicit class map type when naming an input shape.
 */
export interface StyleSheetInput<TClasses extends Readonly<Record<string, unknown>>> {
  readonly classes: StyleSheetClasses<TClasses>;
}

type RightmostSelectorPart<TSelector extends string> = TSelector extends `${string} ${infer TRight}`
  ? RightmostSelectorPart<TRight>
  : TSelector;

type HasUnescapedColon<TSelector extends string> = TSelector extends `${string}\\:${infer TRest}`
  ? HasUnescapedColon<TRest>
  : TSelector extends `${string}:${string}`
    ? true
    : false;

type HasUnsupportedSelectorSyntax<TSelector extends string> = TSelector extends ""
  ? true
  : HasUnescapedColon<TSelector> extends true
    ? true
    : TSelector extends `${string}.` | `${string}. ${string}`
      ? true
      : TSelector extends
            | `${string}>${string}`
            | `${string}+${string}`
            | `${string}~${string}`
            | `${string},${string}`
            | `${string}#${string}`
            | `${string}[${string}`
            | `${string}*${string}`
        ? true
        : false;

type SelectorTag<TSelector extends string> =
  RightmostSelectorPart<TSelector> extends `.${string}`
    ? never
    : RightmostSelectorPart<TSelector> extends `${infer TTag}.${string}`
      ? TTag
      : RightmostSelectorPart<TSelector>;

type StyleForSelectorTag<TTag extends string> = TTag extends AuthoredTag
  ? StyleForAuthoredTag<TTag>
  : never;

type CssIdentifierDelimiter =
  | CssWhitespace
  | "/"
  | "\\"
  | "."
  | ":"
  | "#"
  | "["
  | "]"
  | ">"
  | "+"
  | "~"
  | ","
  | "*";
type HasCssIdentifierDelimiter<TValue extends string> =
  TValue extends `${string}${CssIdentifierDelimiter}${string}` ? true : false;
type IsCssIdentifier<TValue extends string> = TValue extends ""
  ? false
  : HasCssIdentifierDelimiter<TValue> extends true
    ? false
    : true;
type RightmostSelectorIncludesClass<TSelector extends string, TClassName extends string> =
  RightmostSelectorPart<TSelector> extends `.${TClassName}`
    ? true
    : RightmostSelectorPart<TSelector> extends `${string}.${TClassName}`
      ? true
      : false;
type CssWhitespace = " " | "\n" | "\r" | "\t" | "\f";
type HasCssWhitespace<TValue extends string> = TValue extends `${string}${CssWhitespace}${string}`
  ? true
  : false;
type IsInvalidStyleClassName<TClassName extends string> = TClassName extends ""
  ? true
  : HasCssWhitespace<TClassName>;
type SelectorIncludesSelfClass<
  TTarget,
  TClassName extends string,
> = TTarget extends readonly string[]
  ? [TTarget[number]] extends [never]
    ? false
    : false extends (
          TTarget[number] extends infer TSelector
            ? TSelector extends string
              ? RightmostSelectorIncludesClass<TSelector, TClassName>
              : false
            : never
        )
      ? false
      : true
  : TTarget extends string
    ? RightmostSelectorIncludesClass<TTarget, TClassName>
    : false;

export type StyleForStyleTarget<TTarget> = TTarget extends readonly string[]
  ? [TTarget[number]] extends [never]
    ? never
    : StyleForStyleTarget<TTarget[number]>
  : TTarget extends string
    ? string extends TTarget
      ? never
      : HasUnsupportedSelectorSyntax<TTarget> extends true
        ? never
        : [SelectorTag<TTarget>] extends [never]
          ? never
          : StyleForSelectorTag<SelectorTag<TTarget>>
    : never;

type ExtraStyleKeys<TStyle, TTarget> = Exclude<keyof TStyle, keyof StyleForStyleTarget<TTarget>>;
type StyleHasOnlyTargetKeys<TStyle, TTarget> = [ExtraStyleKeys<TStyle, TTarget>] extends [never]
  ? true
  : false;

type StyleMatchesStyleTarget<TStyle, TTarget> = TTarget extends unknown
  ? StyleHasOnlyTargetKeys<TStyle, TTarget> extends true
    ? TStyle extends Partial<StyleForStyleTarget<TTarget>>
      ? true
      : false
    : false
  : never;

type StyleMatchesEveryStyleTarget<TStyle, TTarget> = TTarget extends readonly string[]
  ? [TTarget[number]] extends [never]
    ? false
    : false extends StyleMatchesStyleTarget<TStyle, TTarget[number]>
      ? false
      : true
  : StyleMatchesStyleTarget<TStyle, TTarget> extends true
    ? true
    : false;

/**
 * Type-level validator for one public StyleSheet class definition.
 *
 * Targeted definitions must name an authored tag and use style keys accepted by that tag. Plain CSS
 * identifier class names must also appear in the rightmost target selector so class/style drift is
 * caught at the authoring type boundary.
 */
export type StyleClassDefinitionFor<
  TDefinition,
  TClassName extends PropertyKey = string,
> = TDefinition extends {
  readonly target: infer TTarget;
  readonly style: infer TStyle;
}
  ? TTarget extends StyleTargetInput
    ? TClassName extends string
      ? IsInvalidStyleClassName<TClassName> extends true
        ? never
        : IsCssIdentifier<TClassName> extends true
          ? SelectorIncludesSelfClass<TTarget, TClassName> extends true
            ? StyleMatchesEveryStyleTarget<TStyle, TTarget> extends true
              ? TDefinition
              : never
            : never
          : StyleMatchesEveryStyleTarget<TStyle, TTarget> extends true
            ? TDefinition
            : never
      : StyleMatchesEveryStyleTarget<TStyle, TTarget> extends true
        ? TDefinition
        : never
    : never
  : TDefinition extends { readonly style: infer TStyle }
    ? TStyle extends UntargetedStyleClassStyle
      ? TDefinition
      : never
    : TDefinition extends UntargetedStyleClassStyle
      ? TDefinition
      : never;

export type StyleSheetClasses<TClasses extends Readonly<Record<string, unknown>>> = {
  readonly [ClassName in keyof TClasses]: StyleClassDefinitionFor<TClasses[ClassName], ClassName>;
};

/** Class names rejected by the public StyleSheet type contract. */
export type InvalidStyleClassNames<TClasses extends Readonly<Record<string, unknown>>> = {
  readonly [ClassName in keyof TClasses]: [
    StyleClassDefinitionFor<TClasses[ClassName], ClassName>,
  ] extends [never]
    ? ClassName
    : never;
}[keyof TClasses];

type StyleSheetInputValidation<TClasses extends Readonly<Record<string, unknown>>> = [
  InvalidStyleClassNames<TClasses>,
] extends [never]
  ? unknown
  : {
      readonly "StyleSheet invalid class names": InvalidStyleClassNames<TClasses>;
    };

class StyleSheetImpl<
  TClasses extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly [STYLE_SHEET_VALUE] = true;
  readonly classes: StyleSheetClasses<TClasses>;

  constructor(input: { readonly classes: TClasses }) {
    this.classes =
      typeof input === "object" && input !== null && "classes" in input
        ? (input.classes as StyleSheetClasses<TClasses>)
        : (undefined as unknown as StyleSheetClasses<TClasses>);
  }
}

/**
 * Public opaque StyleSheet value accepted by `Deck#useStyles(...)`.
 *
 * Construct this value with `new StyleSheet({ classes })` or `theme.defineStyles(...)`. The
 * registration surface intentionally uses this lightweight value contract so authoring with a
 * StyleSheet does not force TypeScript to re-evaluate the full class-definition validator.
 */
export interface StyleSheetValue {
  readonly [STYLE_SHEET_VALUE]: true;
  readonly classes: Readonly<Record<string, unknown>>;
}

/**
 * Public immutable StyleSheet value registered on a Deck or Theme.
 *
 * The value stores authored class definitions. It does not expose resolved cascade state,
 * normalized layout values, or projection-specific style shapes.
 */
export type StyleSheet<TClasses extends Readonly<Record<string, unknown>> = never> = [
  TClasses,
] extends [never]
  ? StyleSheetValue
  : StyleSheetValue & StyleSheetImpl<TClasses>;

/**
 * Construct a public StyleSheet for deckjsx authoring.
 *
 * Style declarations must use explicit targets such as `p.title`, `div.card`, or
 * `section.card p.caption` so TypeScript can check the style against the authored tag. Targetless
 * classes may still exist for class-name presence and descendant selector participation, but they
 * do not accept broad style declarations.
 */
export const StyleSheet: {
  new <const TClasses extends Readonly<Record<string, unknown>>>(
    input: { readonly classes: TClasses } & StyleSheetInputValidation<TClasses>,
  ): StyleSheet<TClasses>;
} = StyleSheetImpl as typeof StyleSheetImpl as {
  new <const TClasses extends Readonly<Record<string, unknown>>>(
    input: { readonly classes: TClasses } & StyleSheetInputValidation<TClasses>,
  ): StyleSheet<TClasses>;
};

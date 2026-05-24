import type { AuthoredTag } from "../authoring/tags";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  StyleForAuthoredTag,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "./types";

export type StyleTargetSelector = string;
export type StyleClassStyle =
  | SlideStyle
  | ViewStyle
  | TextStyle
  | TextRunStyle
  | ImageStyle
  | ShapeStyle;

export type TargetedStyleClassDefinition<TStyle extends StyleClassStyle = StyleClassStyle> = {
  readonly target?: StyleTargetSelector | readonly StyleTargetSelector[];
  readonly style: TStyle;
};

export type StyleClassDefinition<TStyle extends StyleClassStyle = StyleClassStyle> =
  | TStyle
  | TargetedStyleClassDefinition<TStyle>;

export type StyleSheetInput<
  TClasses extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, StyleClassDefinition>
  >,
> = {
  readonly classes: StyleSheetClasses<TClasses>;
};

type RightmostSelectorPart<TSelector extends string> = TSelector extends `${string} ${infer TRight}`
  ? RightmostSelectorPart<TRight>
  : TSelector;

type SelectorTag<TSelector extends string> =
  RightmostSelectorPart<TSelector> extends `.${string}`
    ? never
    : RightmostSelectorPart<TSelector> extends `${infer TTag}.${string}`
      ? TTag
      : RightmostSelectorPart<TSelector>;

type StyleForSelectorTag<TTag extends string> = TTag extends AuthoredTag
  ? StyleForAuthoredTag<TTag>
  : StyleClassStyle;

export type StyleForStyleTarget<TTarget> = TTarget extends readonly string[]
  ? [TTarget[number]] extends [never]
    ? StyleClassStyle
    : StyleForStyleTarget<TTarget[number]>
  : TTarget extends string
    ? [SelectorTag<TTarget>] extends [never]
      ? StyleClassStyle
      : StyleForSelectorTag<SelectorTag<TTarget>>
    : StyleClassStyle;

export type StyleClassDefinitionFor<TDefinition> = TDefinition extends {
  readonly target: infer TTarget;
  readonly style: infer TStyle;
}
  ? TTarget extends StyleTargetSelector | readonly StyleTargetSelector[]
    ? TStyle extends StyleForStyleTarget<TTarget>
      ? TDefinition
      : never
    : never
  : TDefinition extends { readonly style: infer TStyle }
    ? TStyle extends StyleClassStyle
      ? TDefinition
      : never
    : TDefinition extends StyleClassStyle
      ? TDefinition
      : never;

export type StyleSheetClasses<TClasses extends Readonly<Record<string, unknown>>> = {
  readonly [ClassName in keyof TClasses]: StyleClassDefinitionFor<TClasses[ClassName]>;
};

class StyleSheetImpl<
  TClasses extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, StyleClassDefinition>
  >,
> {
  readonly classes: StyleSheetClasses<TClasses>;

  constructor(input: StyleSheetInput<TClasses>) {
    this.classes = input.classes;
  }
}

export type StyleSheet<
  TClasses extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, StyleClassDefinition>
  >,
> = StyleSheetImpl<TClasses>;

export const StyleSheet: {
  new <
    const TClasses extends Readonly<Record<string, unknown>> = Readonly<
      Record<string, StyleClassDefinition>
    >,
  >(
    input: StyleSheetInput<TClasses>,
  ): StyleSheet<TClasses>;
} = StyleSheetImpl;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type ThemeObjectValue =
  | Primitive
  | readonly ThemeObjectValue[]
  | { readonly [key: string]: ThemeObjectValue };

export type DeepMerge<TBase, TExtension> = TExtension extends readonly (infer _ExtensionItem)[]
  ? TExtension
  : TBase extends readonly (infer _BaseItem)[]
    ? TExtension
    : TBase extends Primitive
      ? TExtension
      : TExtension extends Primitive
        ? TExtension
        : TBase extends object
          ? TExtension extends object
            ? {
                readonly [Key in keyof TBase | keyof TExtension]: Key extends keyof TExtension
                  ? Key extends keyof TBase
                    ? DeepMerge<TBase[Key], TExtension[Key]>
                    : TExtension[Key]
                  : Key extends keyof TBase
                    ? TBase[Key]
                    : never;
              }
            : TExtension
          : TExtension;

export type MergedTheme<TBase extends object, TExtension extends object> = DeepMerge<
  TBase,
  TExtension
> &
  object;

export function isRecord(value: unknown): value is Record<string, ThemeObjectValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPlainObject(value: unknown): value is Record<string, ThemeObjectValue> {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneThemeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneThemeValue(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneThemeValue(child)]),
    ) as T;
  }

  return value;
}

export function mergeThemeValues<TBase, TExtension>(
  base: TBase,
  extension: TExtension,
): DeepMerge<TBase, TExtension> {
  if (!isPlainObject(base) || !isPlainObject(extension)) {
    return cloneThemeValue(extension) as DeepMerge<TBase, TExtension>;
  }

  const merged: Record<string, ThemeObjectValue> = { ...cloneThemeValue(base) };
  Object.entries(extension).forEach(([key, value]) => {
    merged[key] =
      key in merged && isPlainObject(merged[key]) && isPlainObject(value)
        ? mergeThemeValues(merged[key], value)
        : cloneThemeValue(value);
  });

  return merged as DeepMerge<TBase, TExtension>;
}

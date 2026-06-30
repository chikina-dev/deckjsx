import { Deck, StyleSheet, Theme } from "deckjsx";
import type { DeckOptions, ThemeInput, ThemeValue } from "deckjsx";

const dynamicStyleTarget: string = "p.dynamic";

const reportTheme = new Theme({
  colors: { text: "#111111", accent: "#2563eb" },
  defaults: {
    p: { fontSize: 18, color: "#111111" },
    div: { padding: 0.2 },
    span: { color: "#2563eb" },
    img: { objectFit: "contain" },
    shape: { fill: "#DBEAFE", stroke: "1pt solid #2563EB" },
    video: { objectFit: "cover" },
    table: { tableLayout: "fixed" },
    td: { fontWeight: 700 },
  },
});
reportTheme.colors.text satisfies "#111111";

const publicThemeValue = new Theme({
  defaults: {
    p: { color: "red" },
  },
});
publicThemeValue satisfies ThemeValue;

const deckOptionsWithPublicTheme = {
  layout: { width: 10, height: 5.625, unit: "in" },
  theme: publicThemeValue,
} satisfies DeckOptions;
void deckOptionsWithPublicTheme;

const deckOptionsWithPlainTheme = {
  layout: { width: 10, height: 5.625, unit: "in" },
  // @ts-expect-error DeckOptions theme accepts Theme values, not plain authored objects.
  theme: { defaults: { p: { color: "red" } } },
} satisfies DeckOptions;
void deckOptionsWithPlainTheme;

const extendedTheme = reportTheme.extend({
  colors: { accent: "#dc2626" },
  defaults: { p: { color: "#0f172a" } },
});
extendedTheme.colors.accent satisfies "#dc2626";

const themedStyles = extendedTheme.defineStyles((theme) => ({
  classes: { title: { target: "p.title", style: { color: theme.colors.accent } } },
}));
themedStyles satisfies StyleSheet;

new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  theme: reportTheme,
});

new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  // @ts-expect-error Deck theme accepts constructed Theme values, not plain theme input objects.
  theme: { defaults: { p: { fontSize: 18 } } },
});

extendedTheme.defineStyles((_theme) => ({
  classes: {
    // @ts-expect-error Theme-defined styles also require a target with an authored tag.
    classOnly: { target: ".classOnly", style: { color: "red" } },
  },
}));

extendedTheme.defineStyles((_theme) => ({
  classes: {
    // @ts-expect-error Theme-defined styles reject unknown authored tags.
    unknownElement: { target: "button.unknownElement", style: { color: "red" } },
  },
}));

extendedTheme.defineStyles((_theme) => ({
  classes: {
    // @ts-expect-error Theme-defined StyleSheet targets must not contain empty class selectors.
    "report/title": { target: "p.", style: { color: "red" } },
  },
}));

extendedTheme.defineStyles((_theme) => ({
  classes: {
    // @ts-expect-error Theme-defined StyleSheet class names must not be empty.
    "": { target: "p.", style: { color: "red" } },
  },
}));

extendedTheme.defineStyles((_theme) => ({
  classes: {
    // @ts-expect-error Theme-defined StyleSheet style declarations require literal targets.
    dynamic: { target: dynamicStyleTarget, style: { color: "red" } },
  },
}));

type PublicThemeInput = ThemeInput<{
  readonly p: { readonly fontSize: 18 };
}>;
const rawThemeInput = { defaults: { p: { fontSize: 18 } } } satisfies PublicThemeInput;
void rawThemeInput;

// @ts-expect-error ThemeInput requires an explicit defaults map so it does not widen defaults.
type MissingThemeInputDefaults = ThemeInput; // eslint-disable-line no-unused-vars

// @ts-expect-error Theme defaults are authored tag keyed.
new Theme({
  defaults: {
    article: { fontSize: 18 },
  },
});

// @ts-expect-error span defaults use TextRunStyle and reject positioning.
new Theme({ defaults: { span: { left: 1 } } });

// @ts-expect-error valid span default keys must not hide extra positioning keys.
new Theme({ defaults: { span: { color: "red", left: 1 } } });

// @ts-expect-error table defaults reject text-only style keys.
new Theme({ defaults: { table: { fontSize: 18 } } });

// @ts-expect-error video defaults reject text-only style keys.
new Theme({ defaults: { video: { fontSize: 18 } } });

// @ts-expect-error shape defaults reject text-only style keys.
new Theme({ defaults: { shape: { fontSize: 18 } } });

const dynamicThemeDefaults: Record<string, { fontSize: number }> = {
  p: { fontSize: 18 },
};
// @ts-expect-error Theme defaults must be authored-tag keyed literal/defaults-typed objects.
new Theme({ defaults: dynamicThemeDefaults });

// @ts-expect-error object Theme extensions must also use authored-tag keyed literal/defaults-typed defaults.
reportTheme.extend({ defaults: dynamicThemeDefaults });

// @ts-expect-error function Theme extensions must also use authored tag defaults.
reportTheme.extend((_theme) => ({
  defaults: {
    button: { color: "red" },
  },
}));

// @ts-expect-error function Theme extensions must keep defaults valid for each authored tag.
reportTheme.extend((_theme) => ({
  defaults: {
    img: { fontSize: 18 },
  },
}));

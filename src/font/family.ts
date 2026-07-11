const GENERIC_FONT_FAMILY_VALUES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

function validFontFamilyName(value: string): boolean {
  if (GENERIC_FONT_FAMILY_VALUES.has(value.toLowerCase())) {
    return true;
  }
  return /^[A-Za-z_][A-Za-z0-9_-]*(?:\s+[A-Za-z_][A-Za-z0-9_-]*)*$/u.test(value);
}

/** Parses the supported CSS font-family subset without exposing CSS parser objects. */
export function fontFamilyList(value: string): readonly string[] | undefined {
  const families: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (const character of value) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      if (current.trim().length > 0) {
        return undefined;
      }
      quote = character;
      continue;
    }
    if (character === ",") {
      const family = current.trim();
      if (!validFontFamilyName(family)) {
        return undefined;
      }
      families.push(family);
      current = "";
      continue;
    }
    current += character;
  }

  if (quote) {
    return undefined;
  }
  const family = current.trim();
  if (!validFontFamilyName(family)) {
    return undefined;
  }
  families.push(family);
  return families;
}

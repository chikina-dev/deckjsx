import { describe, expect, test } from "vite-plus/test";
import {
  validateSupportedStyleDeclarationResult,
  validateSupportedStyleValueResult,
} from "@/src/style/authoring-validation";
import type { StyleDeclaration, StyleDeclarationValue } from "@/src/style/declaration";
import {
  resolvedStyleProperty,
  resolvedStylePropertyTrace,
  type ResolvedStyle,
} from "@/src/style/resolve";
import type { CssColor, NonNegativeDeckPointLength, TextStyle } from "@/src/style/types";

function assertResolvedStyleTypes(resolvedStyle: ResolvedStyle): void {
  resolvedStyle.style.fontSize satisfies NonNegativeDeckPointLength | undefined;
  resolvedStyle.style.color satisfies CssColor | undefined;
  resolvedStyleProperty(resolvedStyle, "fontSize")?.value satisfies
    | NonNegativeDeckPointLength
    | undefined;
  resolvedStylePropertyTrace(resolvedStyle, "color")?.candidates[0]?.value satisfies
    | CssColor
    | undefined;
}
void assertResolvedStyleTypes;

const validDeclarationValue: StyleDeclarationValue<"fontSize"> = 24;
void validDeclarationValue;

// @ts-expect-error validated fontSize values do not widen back to unknown.
const invalidDeclarationValue: StyleDeclarationValue<"fontSize"> = "initial";
void invalidDeclarationValue;

const validDeclaration: StyleDeclaration = { color: "#123456", fontSize: 24 };
void validDeclaration;

const invalidDeclaration: StyleDeclaration = {
  // @ts-expect-error property-aware declarations retain the fontSize value contract.
  fontSize: "initial",
};
void invalidDeclaration;

function assertTargetPropertyCorrelation(): void {
  validateSupportedStyleValueResult({
    path: "slide[0].div.style.fontSize",
    // @ts-expect-error div styles do not expose text-only fontSize authoring.
    property: "fontSize",
    tag: "div",
    value: 24,
  });
}
void assertTargetPropertyCorrelation;

describe("validated style type boundaries", () => {
  test("retains property-specific value types after validation", () => {
    const fontSize = validateSupportedStyleValueResult({
      path: "slide[0].p.style.fontSize",
      property: "fontSize",
      tag: "p",
      value: 24,
    });
    const color = validateSupportedStyleValueResult({
      path: "slide[0].p.style.color",
      property: "color",
      tag: "p",
      value: "#123456",
    });

    expect(fontSize).toEqual({ ok: true, property: "fontSize", value: 24 });
    expect(color).toEqual({ ok: true, property: "color", value: "#123456" });

    if (fontSize.ok) {
      fontSize.value satisfies NonNegativeDeckPointLength | undefined;
    }
    if (color.ok) {
      color.value satisfies CssColor | undefined;
    }
  });

  test("retains the target-specific declaration after validation", () => {
    const result = validateSupportedStyleDeclarationResult({
      path: "slide[0].p.style",
      tag: "p",
      style: { color: "#123456", fontSize: 24 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      result.style satisfies Readonly<TextStyle>;
      expect(result.style.fontSize).toBe(24);
    }
  });

  test("preserves CSS-wide and unsupported-property diagnostics", () => {
    const cssWide = validateSupportedStyleValueResult({
      path: "slide[0].p.style.fontSize",
      property: "fontSize",
      tag: "p",
      value: "initial",
    });
    const unsupported = validateSupportedStyleDeclarationResult({
      path: "slide[0].div.style",
      tag: "div",
      style: { fontSize: 24 },
    });

    expect(cssWide).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({ code: "E_COMPILE_INVALID_STYLE_VALUE" }),
    });
    expect(unsupported).toEqual({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "E_COMPILE_NON_PUBLIC_STYLE_PROP" }),
      ]),
    });
  });
});

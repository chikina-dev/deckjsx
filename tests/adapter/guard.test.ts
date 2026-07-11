import { describe, expect, test } from "vite-plus/test";

import { isWriterAdapter } from "@/src/adapter/guard";

function adapterWithFormat(format: string) {
  return {
    kind: "deckjsx.writerAdapter" as const,
    name: "custom",
    projectionFormat: "pptx" as const,
    format,
    options: {},
    async render() {
      return {
        diagnostics: { items: [], hasErrors: false, hasWarnings: false },
      };
    },
  };
}

describe("writer adapter guard", () => {
  test.each(["", " ", "\n\t"])("rejects an empty output format %#", (format: string) => {
    expect(isWriterAdapter(adapterWithFormat(format))).toBe(false);
  });

  test("accepts a non-empty custom output format", () => {
    expect(isWriterAdapter(adapterWithFormat("html"))).toBe(true);
  });
});

import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    alias: [
      {
        find: "deckjsx/jsx-dev-runtime",
        replacement: new URL("../../dist/jsx-dev-runtime.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx/jsx-runtime",
        replacement: new URL("../../dist/jsx-runtime.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx/inspect",
        replacement: new URL("../../dist/inspect.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx/integration",
        replacement: new URL("../../dist/integration.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx/adapter",
        replacement: new URL("../../dist/adapter.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx",
        replacement: new URL("../../dist/index.mjs", import.meta.url).pathname,
      },
    ],
  },
  pack: {
    entry: ["src/index.ts", "src/dev.ts", "src/cli.ts"],
    dts: true,
    exports: false,
  },
  lint: {
    ignorePatterns: ["dist/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["dist/**"],
  },
});

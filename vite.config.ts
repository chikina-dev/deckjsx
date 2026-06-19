import { defineConfig } from "vite-plus";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "deckjsx",
    },
  },
  resolve: {
    alias: [
      {
        find: "deckjsx/jsx-dev-runtime",
        replacement: new URL("./src/jsx-dev-runtime.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx/jsx-runtime",
        replacement: new URL("./src/jsx-runtime.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx/inspect",
        replacement: new URL("./src/inspect.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx/integration",
        replacement: new URL("./src/integration.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx/adapter",
        replacement: new URL("./src/adapter.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx",
        replacement: new URL("./src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  pack: {
    entry: [
      "src/index.ts",
      "src/adapter.ts",
      "src/inspect.ts",
      "src/integration.ts",
      "src/jsx-runtime.ts",
      "src/jsx-dev-runtime.ts",
    ],
    dts: {
      tsgo: true,
    },
    exports: false,
  },
  lint: {
    ignorePatterns: [".deckjsx/**", "plugins/**", "sample/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: [".deckjsx/**", "plugins/**", "sample/**"],
  },
});

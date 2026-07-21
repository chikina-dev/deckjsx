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
        find: /^@\//,
        replacement: new URL("./", import.meta.url).pathname,
      },
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
        find: "deckjsx/plugin-validation",
        replacement: new URL("./src/plugin-validation.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx/style",
        replacement: new URL("./src/style/public.ts", import.meta.url).pathname,
      },
      {
        find: "deckjsx/adapter",
        replacement: new URL("./src/adapter/index.ts", import.meta.url).pathname,
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
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["dist/**"],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        statements: 65,
        branches: 65,
        functions: 65,
        lines: 65,
      },
    },
  },
  pack: {
    entry: [
      "src/index.ts",
      "src/authoring/options/public.ts",
      "src/style/public.ts",
      "src/adapter/index.ts",
      "src/inspect.ts",
      "src/integration.ts",
      "src/plugin-validation.ts",
      "src/jsx-runtime.ts",
      "src/jsx-dev-runtime.ts",
    ],
    dts: {
      tsgo: true,
    },
    exports: false,
  },
  lint: {
    ignorePatterns: [
      ".deckjsx/**",
      "coverage/**",
      "plugins/**",
      "sample/**",
      "tests/types/perf/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: [
      ".deckjsx/**",
      "coverage/**",
      "plugins/**",
      "sample/**",
      "tests/types/perf/**",
    ],
  },
});

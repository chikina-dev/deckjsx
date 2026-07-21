import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    alias: [
      {
        find: /^@\/scripts\//,
        replacement: new URL("../../scripts/", import.meta.url).pathname,
      },
      {
        find: /^@\//,
        replacement: new URL("./", import.meta.url).pathname,
      },
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
        find: "deckjsx/plugin-validation",
        replacement: new URL("../../dist/plugin-validation.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx/adapter",
        replacement: new URL("../../dist/adapter/index.mjs", import.meta.url).pathname,
      },
      {
        find: "deckjsx",
        replacement: new URL("../../dist/index.mjs", import.meta.url).pathname,
      },
    ],
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
    entry: ["src/index.ts", "src/dev.ts", "src/cli.ts"],
    dts: {
      tsgo: true,
    },
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

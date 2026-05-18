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
        find: "deckjsx",
        replacement: new URL("./src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: ["src/index.ts", "src/jsx-runtime.ts", "src/jsx-dev-runtime.ts"],
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});

import { describe, expect, test } from "vite-plus/test";
import { classifyCiScope } from "../../scripts/ci-scope.mjs";

describe("CI scope classification", () => {
  test("keeps markdown-only changes on the lightweight documentation path", () => {
    expect(
      classifyCiScope(["README.md", "docs/adr/0006-required-pptx-generation-regression-oracle.md"]),
    ).toEqual({
      benchmark: false,
      core: false,
      docsOnly: true,
      node: false,
    });
  });

  test("runs core checks for root source, tests, and package changes", () => {
    expect(
      classifyCiScope(["src/deck.ts", "tests/authoring/deck.test.tsx", "package.json"]),
    ).toMatchObject({
      core: true,
      docsOnly: false,
    });
  });

  test("exercises all CI jobs when the main workflow changes", () => {
    expect(classifyCiScope([".github/workflows/ci.yml"])).toEqual({
      benchmark: true,
      core: true,
      docsOnly: false,
      node: true,
    });
  });

  test("runs node package checks when plugin code or root public surface changes", () => {
    expect(classifyCiScope(["plugins/node/src/index.ts"])).toMatchObject({
      node: true,
    });
    expect(classifyCiScope(["src/index.ts"])).toMatchObject({
      node: true,
    });
  });

  test("limits the direct writer benchmark to PPTX projection and writer changes", () => {
    expect(classifyCiScope(["src/writers/pptx/emit.ts"])).toMatchObject({
      benchmark: true,
      core: true,
    });
    expect(classifyCiScope(["src/style/color.ts"])).toMatchObject({
      benchmark: false,
      core: true,
    });
  });
});

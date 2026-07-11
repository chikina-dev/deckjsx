import { describe, expect, test } from "vite-plus/test";
import { buildLayoutInputSnapshot, type LayoutInputDocument } from "@/src/layout/input.ts";
import type { ProjectedLayoutDocument, ProjectedLayoutNode } from "@/src/layout/projected.ts";
import { resolveProjectedLayout } from "@/src/layout/resolve.ts";
import * as H from "./absolute/helpers.tsx";

const OPTIONS = { layout: { width: 10, height: 5.625, unit: "in" as const } };

function buildSnapshot(
  input: {
    readonly insertSibling?: boolean;
    readonly moveAlpha?: boolean;
    readonly hideInsertedSibling?: boolean;
    readonly collisionKeys?: boolean;
  } = {},
): LayoutInputDocument {
  const deck = new H.Deck(OPTIONS);
  deck.slide({ name: "Stable projected IDs" }, () => (
    <>
      {input.insertSibling ? (
        <p
          key="inserted"
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 1,
            height: 0.25,
            ...(input.hideInsertedSibling ? { display: "none" as const } : {}),
          }}
        >
          Inserted
        </p>
      ) : null}
      <p
        key="alpha"
        style={{
          position: "absolute",
          left: input.moveAlpha ? 2 : 1,
          top: 1,
          width: 2,
          height: 0.5,
        }}
      >
        Alpha
      </p>
      <p key="beta" style={{ position: "absolute", left: 1, top: 2, width: 2, height: 0.5 }}>
        Beta
      </p>
      {input.collisionKeys ? (
        <>
          <p key="a b" style={{ position: "absolute", left: 4, top: 1, width: 1, height: 0.5 }}>
            Spaced
          </p>
          <p key="a@b" style={{ position: "absolute", left: 5, top: 1, width: 1, height: 0.5 }}>
            At
          </p>
          <p key="a_b" style={{ position: "absolute", left: 6, top: 1, width: 1, height: 0.5 }}>
            Underscore
          </p>
        </>
      ) : null}
    </>
  ));

  const compiled = deck.compile();
  return buildLayoutInputSnapshot({
    graph: compiled.graph!,
    resolvedStyles: compiled.resolvedStyles!,
    deckSize: { widthEmu: 9144000, heightEmu: 5143500 },
  }).snapshot;
}

function project(snapshot: LayoutInputDocument): ProjectedLayoutDocument {
  return resolveProjectedLayout(OPTIONS, snapshot);
}

function flattenNodes(nodes: readonly ProjectedLayoutNode[]): ProjectedLayoutNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.kind === "group"
      ? flattenNodes(node.children)
      : node.kind === "table"
        ? node.sections.flatMap((section) =>
            section.rows.flatMap((row) => row.cells.flatMap((cell) => flattenNodes(cell.children))),
          )
        : []),
  ]);
}

function textIds(layout: ProjectedLayoutDocument): Map<string, string> {
  return new Map(
    flattenNodes(layout.slides.flatMap((slide) => slide.nodes)).flatMap((node) =>
      node.kind === "text" ? [[node.content.text, node.id] as const] : [],
    ),
  );
}

describe("projected layout identity", () => {
  test("reprojects the same input with identical collision-free IDs", () => {
    const snapshot = buildSnapshot({ collisionKeys: true });
    const first = project(snapshot);
    const second = project(snapshot);
    const firstIds = [
      ...first.slides.map((slide) => slide.id),
      ...flattenNodes(first.slides.flatMap((slide) => slide.nodes)).map((node) => node.id),
    ];
    const secondIds = [
      ...second.slides.map((slide) => slide.id),
      ...flattenNodes(second.slides.flatMap((slide) => slide.nodes)).map((node) => node.id),
    ];

    expect(secondIds).toEqual(firstIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  test("keeps keyed node IDs stable across sibling insertion and unrelated layout changes", () => {
    const baseline = project(buildSnapshot());
    const changed = project(buildSnapshot({ insertSibling: true, moveAlpha: true }));
    const hiddenInsertion = project(
      buildSnapshot({ insertSibling: true, hideInsertedSibling: true }),
    );
    const baselineIds = textIds(baseline);
    const changedIds = textIds(changed);
    const hiddenInsertionIds = textIds(hiddenInsertion);

    expect(changedIds.get("Alpha")).toBe(baselineIds.get("Alpha"));
    expect(changedIds.get("Beta")).toBe(baselineIds.get("Beta"));
    expect(hiddenInsertionIds.get("Alpha")).toBe(baselineIds.get("Alpha"));
    expect(hiddenInsertionIds.get("Beta")).toBe(baselineIds.get("Beta"));
    expect(
      changed.slides[0]?.nodes.map((node) => node.kind === "text" && node.content.text),
    ).toEqual(["Inserted", "Alpha", "Beta"]);
  });

  test("uses injective graph identity for authored keys that previously slug-collided", () => {
    const ids = textIds(project(buildSnapshot({ collisionKeys: true })));
    const collisionIds = [ids.get("Spaced"), ids.get("At"), ids.get("Underscore")];

    expect(collisionIds.every((id) => id !== undefined)).toBe(true);
    expect(new Set(collisionIds).size).toBe(3);
  });

  test("keeps IDs stable across fresh canonical snapshots used by incremental cycles", () => {
    const firstIds = textIds(project(buildSnapshot()));
    const nextCycleIds = textIds(project(buildSnapshot()));

    expect(nextCycleIds).toEqual(firstIds);
  });

  test("keeps origin-less snapshot IDs deterministic and collision-free", () => {
    const snapshot: LayoutInputDocument = {
      size: { widthEmu: 9144000, heightEmu: 5143500 },
      slides: [
        {
          kind: "slide",
          props: { name: "Anonymous" },
          children: [
            { kind: "text", props: {}, children: ["First"] },
            { kind: "text", props: {}, children: ["Second"] },
          ],
        },
      ],
    };
    const first = project(snapshot);
    const second = project(snapshot);
    const ids = flattenNodes(first.slides[0]?.nodes ?? []).map((node) => node.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(textIds(second)).toEqual(textIds(first));
  });
});

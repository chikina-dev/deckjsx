import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer media output", () => {
  test("media writer helper rejects malformed media payload sources", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Media payload validation" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = projection.parts.find((part) => part.kind === "media");
    expect(mediaPart).toBeDefined();

    const malformedPayloads = [
      undefined,
      { kind: "malformed-media-payload" },
      { source: { kind: "file", path: "asset.png" } },
      { source: { kind: "url", url: 123 } },
      { source: { kind: "data", data: null } },
    ] as const;

    malformedPayloads.forEach((payload) => {
      expect(() => H.mediaPartPayload({ ...mediaPart!, payload } as H.PptxPackagePart)).toThrow(
        "Media package parts must carry a structured media payload source.",
      );
    });
  });

  test("output serializes media bytes from structured media payload source", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const replacement = "replacement-media-bytes";

    deck.slide({ name: "Media payload" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = projection.parts.find((part) => part.kind === "media")!;
    const mediaPayload = mediaPart.payload as H.PptxMediaPartPayload;
    const replacementSource = {
      kind: "data",
      data: replacement,
    } satisfies H.PptxMediaPartPayload["source"];

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  source: replacementSource,
                  sources: [mediaPayload.source, replacementSource],
                } satisfies H.PptxMediaPartPayload,
              }
            : part,
        ),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);

    expect(H.strFromU8(zip[mediaPart.path]!)).toBe(replacement);
  });
});

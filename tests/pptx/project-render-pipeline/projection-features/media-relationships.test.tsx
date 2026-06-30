import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render media relationships", () => {
  test("projected media parts are connected through slide relationships", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Media" }, () => (
      <>
        <img
          data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            objectFit: "fill",
          }}
        />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const image = slide?.payload.drawing.children[0];
    const mediaRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "image",
    );
    const mediaPart = project.projection?.parts.find(
      (part) => part.kind === "media" && part.id === mediaRelationship?.targetPartId,
    );
    const slideRelationshipPart = project.projection?.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );

    expect(project.ok).toBe(true);
    expect(image?.kind).toBe("image");
    expect(image?.kind === "image" ? image.mediaPartId : undefined).toBeDefined();
    expect(mediaRelationship?.targetPartId).toBe(
      image?.kind === "image" ? image.mediaPartId : undefined,
    );
    expect(mediaRelationship?.id).toBe(image?.serialized.relationshipId);
    expect(
      project.projection?.parts.some((part) => part.kind === "media" && part.id === mediaPart?.id),
    ).toBe(true);
    expect(project.summary?.pptx.relationshipCount).toBeGreaterThan(1);
    expect(project.summary?.media[0]?.partId).toBe(mediaRelationship?.targetPartId);
    expect(project.summary?.media[0]?.partPath).toBe("ppt/media/media1.png");
    expect(project.summary?.media[0]?.metadata).toMatchObject({
      mediaType: "image/png",
      extension: "png",
    });
    expect(project.summary?.parts).toContainEqual(
      expect.objectContaining({ path: "ppt/media/media1.png", hasStructuredPayload: true }),
    );
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: mediaPart?.id,
        ownerPath: "ppt/media/media1.png",
        targetPartId: slideRelationshipPart?.id,
        targetPath: "ppt/slides/_rels/slide1.xml.rels",
        reason: "requirementDependency",
        requirementStatus: "conditional",
        requirementCondition: "referencedByRelationship",
      }),
    );
  });

  test("render emits playable video xml with poster and embedded media relationships", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={H.dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2.25 }}
        />
      </>
    ));

    const render = await deck.render();
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const slideXml = new TextDecoder().decode(zip["ppt/slides/slide1.xml"]);
    const relsXml = new TextDecoder().decode(zip["ppt/slides/_rels/slide1.xml.rels"]);

    expect(render.ok).toBe(true);
    expect(render.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_COMPILE_VIDEO_POSTER_MISSING",
      }),
    );
    expect(slideXml).toContain("<a:videoFile");
    expect(slideXml).toContain("<p14:media");
    expect(slideXml).toContain('r:embed="rId3"');
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"',
    );
    expect(relsXml).toContain(
      'Type="http://schemas.microsoft.com/office/2007/relationships/media"',
    );
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"',
    );
  });

  test("project reuses one media part for repeated authored media sources", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Repeated media" }, () => (
      <>
        <img
          data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 1,
            height: 1,
            objectFit: "fill",
          }}
        />
        <img
          data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{
            position: "absolute",
            left: 2,
            top: 1,
            width: 1,
            height: 1,
            objectFit: "fill",
          }}
        />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const images = slide?.payload.drawing.children.filter((element) => element.kind === "image");
    const mediaParts = project.projection?.parts.filter((part) => part.kind === "media") ?? [];
    const mediaRelationships =
      slide?.relationships?.filter((relationship) => relationship.type === "image") ?? [];

    expect(project.ok).toBe(true);
    expect(images).toHaveLength(2);
    expect(images?.[0]?.kind === "image" ? images[0].mediaPartId : undefined).toBe(
      images?.[1]?.kind === "image" ? images[1].mediaPartId : undefined,
    );
    expect(mediaParts).toHaveLength(1);
    expect(mediaParts[0]?.path).toBe("ppt/media/media1.png");
    expect(mediaRelationships).toHaveLength(1);
    expect(images?.[0]?.kind === "image" ? images[0].serialized.relationshipId : undefined).toBe(
      mediaRelationships[0]?.id,
    );
    expect(images?.[1]?.kind === "image" ? images[1].serialized.relationshipId : undefined).toBe(
      mediaRelationships[0]?.id,
    );
  });

  test("project assigns deterministic slide relationship ids across shared media and hyperlinks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Deterministic relationships" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 10,
            height: 5.625,
            background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        />
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image",
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 3,
            top: 1,
            width: 2,
            height: 0.5,
            href: "https://example.com/text",
          }}
        >
          Link
        </p>
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const relationships = slide?.relationships ?? [];
    const [background, image, text] = slide?.payload.drawing.children ?? [];
    const mediaRelationships = relationships.filter(
      (relationship) => relationship.type === "image",
    );
    const hyperlinkRelationships = relationships.filter(
      (relationship) => relationship.type === "hyperlink",
    );

    expect(project.ok).toBe(true);
    expect(relationships.map((relationship) => relationship.id)).toEqual([
      "rId1",
      "rId2",
      "rId3",
      "rId4",
    ]);
    expect(relationships.map((relationship) => relationship.type)).toEqual([
      "slideLayout",
      "image",
      "hyperlink",
      "hyperlink",
    ]);
    expect(background?.kind).toBe("group");
    expect(image?.kind).toBe("image");
    expect(text?.kind).toBe("text");
    expect(
      background?.kind === "group" && background.backgroundLayers?.[0]?.kind === "background-image"
        ? background.backgroundLayers[0].objectPosition
        : undefined,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(image?.kind === "image" ? image.objectPosition : undefined).toEqual({ x: 0.5, y: 0.5 });
    expect(mediaRelationships).toHaveLength(1);
    expect(project.projection?.parts.filter((part) => part.kind === "media")).toHaveLength(1);
    expect(image?.kind === "image" ? image.serialized.relationshipId : undefined).toBe(
      mediaRelationships[0]?.id,
    );
    expect(image?.kind === "image" ? image.serialized.hyperlinkRelationshipId : undefined).toBe(
      hyperlinkRelationships[0]?.id,
    );
    expect(text?.kind === "text" ? text.serialized.hyperlinkRelationshipId : undefined).toBe(
      hyperlinkRelationships[1]?.id,
    );
  });

  test("project reuses media parts by loader-provided content hash", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "hashed-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: 1,
              height: 1,
              hash: "sha256:same-content",
            }
          : undefined;
      },
    });
    deck.slide({ name: "Hashed media" }, () => (
      <>
        <img
          src="/public/a.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
        <img
          src="/public/b.png"
          style={{ position: "absolute", left: 2, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const slide = project.projection?.slides[0];
    const images = slide?.payload.drawing.children.filter((element) => element.kind === "image");
    const mediaParts = project.projection?.parts.filter((part) => part.kind === "media") ?? [];
    const payload = mediaParts[0]?.payload as H.PptxMediaPartPayload | undefined;

    expect(project.ok).toBe(true);
    expect(images).toHaveLength(2);
    expect(images?.[0]?.kind === "image" ? images[0].mediaPartId : undefined).toBe(
      images?.[1]?.kind === "image" ? images[1].mediaPartId : undefined,
    );
    expect(mediaParts).toHaveLength(1);
    expect(payload?.metadata?.hash).toBe("sha256:same-content");
    expect(project.summary?.media[0]?.metadata).toMatchObject({
      mediaType: "image/png",
      extension: "png",
      widthPx: 1,
      heightPx: 1,
      hash: "sha256:same-content",
    });
    expect(payload?.sources).toHaveLength(2);
    expect(payload?.assetEntityIds).toHaveLength(2);
  });
});

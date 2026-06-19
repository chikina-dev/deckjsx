import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render defined projection and package features", () => {
  test("render emits core and extended document properties", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Doc props", author: "deckjsx" },
    });
    deck.slide({ name: "First" }, () => <></>);
    deck.slide({ name: "Second" }, () => <></>);

    const render = await deck.render();
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const appProps = new TextDecoder().decode(zip["docProps/app.xml"]);
    const coreProps = new TextDecoder().decode(zip["docProps/core.xml"]);

    expect(render.ok).toBe(true);
    expect(appProps).toContain("<Application>deckjsx</Application>");
    expect(appProps).toContain("<Slides>2</Slides>");
    expect(coreProps).toContain("<dc:title>Doc props</dc:title>");
    expect(coreProps).toContain("<dc:creator>deckjsx</dc:creator>");
    expect(coreProps).not.toContain("<dcterms:created");
    expect(coreProps).not.toContain("<dcterms:modified");
  });

  test("explicit pptx adapter renders the current projection", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter" }, () => <></>);

    const result = await deck.render(H.pptx());

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
  });

  test("defineProjection supplies the next project/render source", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Original" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const renamedSlideParts = projection.slides.map((slide) => ({
      ...slide,
      payload: { ...slide.payload, name: "Defined projection" },
    }));
    const renamedProjection = H.withFreshPackageFingerprints({
      ...projection,
      slides: renamedSlideParts,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? (renamedSlideParts.find((slide) => slide.id === part.id) ?? part)
          : part,
      ),
    });

    deck.defineProjection(renamedProjection);

    const project = await deck.project();
    expect(project.projection?.slides[0]?.payload.name).toBe("Defined projection");
    expect(project.stages.project.artifact).toBe("available");
  });

  test("defineGraph supplies a graph-resolved package skeleton", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Graph source" }, () => <></>);

    const graph = deck.compile().graph!;
    deck.defineGraph(graph);

    const project = await deck.project();
    expect(project.ok).toBe(true);
    expect(project.projection?.slides).toHaveLength(1);
    expect(project.projection?.parts.some((part) => part.path === "ppt/slides/slide1.xml")).toBe(
      true,
    );
  });

  test("projected package identities remain distinct from package paths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Identity" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Stable</p>
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const text = slide?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(slide?.id).toMatch(/^pptx:slide:/);
    expect(slide?.id).not.toBe(slide?.path);
    expect(text?.id).toMatch(/^pptx:slide:.*:element:graph%3A/);
    expect(text?.id).not.toContain("slide1.xml");
  });

  test("projected package manifest carries content types and root relationships", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "#334155", fontSize: 20 } } }),
    });
    deck.slide({ name: "Manifest" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme default</p>
    ));

    const project = await deck.project();
    const parts = project.projection?.parts ?? [];
    const contentTypes = parts.find((part) => part.kind === "content-types");
    const rootRelationships = parts.find((part) => part.path === "_rels/.rels");
    const presentationRelationships = parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const presentationPart = parts.find((part) => part.kind === "presentation");
    const slide = project.projection?.slides[0];
    const themePayload = parts.find((part) => part.kind === "theme")?.payload as
      | H.PptxThemePartPayload
      | undefined;

    expect(project.ok).toBe(true);
    expect(contentTypes?.payload).toEqual(
      expect.objectContaining({
        defaults: expect.arrayContaining([expect.objectContaining({ extension: "rels" })]),
        overrides: expect.arrayContaining([
          expect.objectContaining({ partName: "/ppt/presentation.xml" }),
          expect.objectContaining({ partName: "/ppt/slides/slide1.xml" }),
        ]),
      }),
    );
    expect(rootRelationships?.relationships).toContainEqual(
      expect.objectContaining({ targetPath: "ppt/presentation.xml", type: "officeDocument" }),
    );
    expect(project.summary?.relationships).toContainEqual(
      expect.objectContaining({
        ownerPartId: rootRelationships?.id,
        ownerPath: "_rels/.rels",
        targetPath: "ppt/presentation.xml",
        type: "officeDocument",
      }),
    );
    expect(presentationRelationships?.relationships).toContainEqual(
      expect.objectContaining({ targetPartId: slide?.id, type: "slide" }),
    );
    expect(project.summary?.relationships).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentationRelationships?.id,
        ownerPath: "ppt/_rels/presentation.xml.rels",
        targetPartId: slide?.id,
        type: "slide",
      }),
    );
    expect(project.summary?.pptx.relationshipCount).toBe(project.summary?.relationships.length);
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: rootRelationships?.id,
        ownerPath: "_rels/.rels",
        targetPartId: presentationPart?.id,
        targetPath: "ppt/presentation.xml",
        reason: "relationshipTarget",
        relationshipType: "officeDocument",
      }),
    );
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: contentTypes?.id,
        ownerPath: "[Content_Types].xml",
        targetPartId: slide?.id,
        targetPath: "ppt/slides/slide1.xml",
        reason: "contentTypeOverride",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
      }),
    );
    expect(project.summary?.packageDependencies).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentationPart?.id,
        ownerPath: "ppt/presentation.xml",
        targetPartId: presentationRelationships?.id,
        targetPath: "ppt/_rels/presentation.xml.rels",
        reason: "dependencyFingerprint",
        fingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
    expect(project.summary?.pptx.packageDependencyCount).toBe(
      project.summary?.packageDependencies.length,
    );
    expect(project.summary?.pptx.packageDependencyCount).toBeGreaterThan(0);
    expect(project.summary?.parts).toContainEqual(
      expect.objectContaining({
        id: presentationPart?.id,
        path: "ppt/presentation.xml",
        fingerprint: presentationPart?.fingerprint,
      }),
    );
    expect(
      project.summary?.parts.find((part) => part.id === presentationPart?.id)?.fingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(parts.find((part) => part.kind === "presentation")?.payload).toEqual(
      expect.objectContaining({
        kind: "presentation",
        slidePartIds: expect.arrayContaining([slide?.id]),
      }),
    );
    expect(themePayload).toEqual(
      expect.objectContaining({
        kind: "theme",
        name: "deckjsx",
        editable: true,
        projection: expect.objectContaining({
          purpose: "default",
          trace: expect.objectContaining({
            wholeThemeMappings: expect.arrayContaining([
              expect.objectContaining({
                projectedAs: "themePart",
                purpose: "default",
                themePartId: parts.find((part) => part.kind === "theme")?.id,
                groups: ["colorScheme", "fontScheme", "formatScheme", "themeDefaults"],
                fingerprint: expect.stringMatching(/^fnv1a32:/),
              }),
            ]),
            valueGroupFingerprints: expect.arrayContaining([
              expect.objectContaining({
                group: "colorScheme",
                projectedAs: "themeSupport",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 12,
              }),
              expect.objectContaining({
                group: "fontScheme",
                projectedAs: "themeSupport",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 2,
              }),
              expect.objectContaining({
                group: "formatScheme",
                projectedAs: "themeSupport",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 1,
              }),
              expect.objectContaining({
                group: "themeDefaults",
                projectedAs: "themeProjectionTrace",
                fingerprint: expect.stringMatching(/^fnv1a32:/),
                itemCount: 2,
              }),
            ]),
            supportMappings: expect.arrayContaining([
              expect.objectContaining({ projectedAs: "themeSupport" }),
            ]),
            defaultStyleDecisions: expect.arrayContaining([
              expect.objectContaining({
                defaultKey: "p",
                property: "color",
                decision: "projectConcreteDrawingProperty",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: "#334155",
              }),
              expect.objectContaining({
                defaultKey: "p",
                property: "fontSize",
                decision: "projectConcreteDrawingProperty",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: 20,
              }),
            ]),
            effectiveInheritance: expect.arrayContaining([
              expect.objectContaining({
                source: "themeDefault",
                defaultKey: "p",
                property: "color",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: "#334155",
                themePartId: parts.find((part) => part.kind === "theme")?.id,
                slideMasterPartId: parts.find((part) => part.kind === "slide-master")?.id,
                slideLayoutPartId: parts.find((part) => part.kind === "slide-layout")?.id,
                slidePartId: slide?.id,
                inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide", "drawing"],
                reason: expect.stringContaining("Theme Default won"),
              }),
            ]),
            concreteDrawingProperties: expect.arrayContaining([
              expect.objectContaining({
                defaultKey: "p",
                property: "color",
                projectedAs: "concreteDrawingProperty",
                resolvedValue: "#334155",
              }),
              expect.objectContaining({ defaultKey: "p", property: "fontSize", resolvedValue: 20 }),
            ]),
          }),
        }),
        colorScheme: expect.objectContaining({
          colors: expect.objectContaining({ accent1: "2563EB" }),
        }),
      }),
    );
    const trace = themePayload?.kind === "theme" ? themePayload.projection.trace : undefined;
    const defaultGroup = trace?.valueGroupFingerprints.find(
      (fingerprint) => fingerprint.group === "themeDefaults",
    );
    const supportGroups = trace?.valueGroupFingerprints.filter(
      (fingerprint) => fingerprint.projectedAs === "themeSupport",
    );
    const controlDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "#0F172A", fontSize: 24 } } }),
    });
    controlDeck.slide({ name: "Manifest" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme default</p>
    ));
    const controlProject = await controlDeck.project();
    const controlThemePayload = controlProject.projection?.parts.find(
      (part) => part.kind === "theme",
    )?.payload as H.PptxThemePartPayload | undefined;
    const controlTrace =
      controlThemePayload?.kind === "theme" ? controlThemePayload.projection.trace : undefined;
    const controlDefaultGroup = controlTrace?.valueGroupFingerprints.find(
      (fingerprint) => fingerprint.group === "themeDefaults",
    );

    expect(defaultGroup?.fingerprint).not.toBe(controlDefaultGroup?.fingerprint);
    expect(supportGroups?.map((fingerprint) => fingerprint.fingerprint)).toEqual(
      controlTrace?.valueGroupFingerprints
        .filter((fingerprint) => fingerprint.projectedAs === "themeSupport")
        .map((fingerprint) => fingerprint.fingerprint),
    );
    expect(parts.find((part) => part.kind === "slide-master")?.payload).toEqual(
      expect.objectContaining({
        kind: "slide-master",
        themePartId: parts.find((part) => part.kind === "theme")?.id,
        slideLayoutPartIds: expect.arrayContaining([
          parts.find((part) => part.kind === "slide-layout")?.id,
        ]),
      }),
    );
    expect(parts.find((part) => part.kind === "slide-layout")?.payload).toEqual(
      expect.objectContaining({
        kind: "slide-layout",
        layoutType: "blank",
        slideMasterPartId: parts.find((part) => part.kind === "slide-master")?.id,
        placeholderStrategy: "none",
      }),
    );
    expect(project.summary?.parts.find((part) => part.kind === "content-types")).toEqual(
      expect.objectContaining({ contentTypeCount: expect.any(Number) }),
    );
    expect(project.summary?.parts.find((part) => part.path === "_rels/.rels")).toEqual(
      expect.objectContaining({ relationshipCount: 3 }),
    );
  });
});

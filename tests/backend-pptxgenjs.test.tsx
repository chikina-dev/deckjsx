import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { describe, expect, test } from "vite-plus/test";
import { Deck, Image, Shape, Slide, Text, View } from "../src/index.ts";
import { SAMPLE_SVG_DATA_URI, WIDE_SVG_DATA_URI } from "./helpers.ts";

describe("backend", () => {
  test("output writes a real pptx file through the backend", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "sample.pptx");

    deck.add(() => (
      <Slide name="File output">
        <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</Text>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const [content, fileStat] = await Promise.all([readFile(output), stat(output)]);

      expect(content.subarray(0, 2).toString("utf8")).toBe("PK");
      expect(fileStat.size).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits styled span as rich text runs", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "rich-text.pptx");

    deck.add(() => (
      <Slide name="Rich text">
        <p style={{ x: 1, y: 1, width: 6, height: 1, fontSize: 20 }}>
          Sales <span style={{ color: "#DC2626", fontWeight: 700 }}>grew</span> YoY
        </p>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toContain("<a:t>Sales </a:t>");
      expect(slideXml).toContain("<a:t>grew</a:t>");
      expect(slideXml).toContain("<a:t> YoY</a:t>");
      expect(slideXml).toContain('val="DC2626"');
      expect(slideXml).toContain('b="1"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits shadow markup through the pptxgenjs backend", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "shadow.pptx");

    deck.add(() => (
      <Slide name="Shadow output">
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            textShadow: "4px 4px 8px rgba(37, 99, 235, 0.5)",
          }}
        >
          Shadow text
        </Text>
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 2,
            width: 2,
            height: 1,
            fill: "#F97316",
            boxShadow: "6px 6px 10px rgba(15, 23, 42, 0.35)",
          }}
        />
        <Image
          data={SAMPLE_SVG_DATA_URI}
          style={{
            x: 4,
            y: 1,
            width: 1.5,
            height: 1.5,
            boxShadow: "3px 3px 6px rebeccapurple",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain("<a:outerShdw");
      expect(slideXml?.match(/<a:outerShdw/g)?.length).toBeGreaterThanOrEqual(3);
      expect(slideXml).toContain('val="2563EB"');
      expect(slideXml).toContain('val="0F172A"');
      expect(slideXml).toContain('val="663399"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits shape strokeDasharray markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "shape-stroke-dasharray.pptx");

    deck.add(() => (
      <Slide name="Shape stroke dasharray output">
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeDasharray: "1 4",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:prstDash val="sysDot"/>');
      expect(slideXml).toContain('<a:srgbClr val="1E90FF"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits strokeLinecap and strokeLinejoin markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "shape-stroke-cap-join.pptx");

    deck.add(() => (
      <Slide name="Shape stroke cap and join output">
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('cap="sq"');
      expect(slideXml).toContain("<a:bevel/>");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output keeps XML fill and line patches aligned when generated shapes are interleaved", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "xml-patch-order.pptx");

    deck.add(() => (
      <Slide name="Patch order output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            outline: "2pt solid #111111",
            borderTop: "3pt solid #222222",
            border: "2pt solid #1E90FF",
            backgroundImage: "linear-gradient(90deg, #EF4444 0%, #F59E0B 100%)",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        >
          <Shape
            shape="rect"
            style={{
              x: 0.5,
              y: 0.5,
              width: 1,
              height: 0.75,
              fill: "linear-gradient(180deg, #22C55E 0%, #0EA5E9 100%)",
              stroke: "#9333EA",
              strokeWidth: "2pt",
              strokeLinecap: "round",
            }}
          />
        </View>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");
      const shapeBlocks = slideXml?.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
      const backgroundLayerBlock = shapeBlocks.find(
        (block) => block.includes('val="EF4444"') && block.includes('val="F59E0B"'),
      );
      const mainShapeBlock = shapeBlocks.find(
        (block) => block.includes('val="22C55E"') && block.includes('val="0EA5E9"'),
      );
      const outlineBlock = shapeBlocks.find((block) => block.includes('val="111111"'));
      const topEdgeBlock = shapeBlocks.find((block) => block.includes('val="222222"'));
      const viewStrokeBlock = shapeBlocks.find((block) => block.includes('val="1E90FF"'));

      expect(slideXml).toBeDefined();
      expect(backgroundLayerBlock).toBeDefined();
      expect(mainShapeBlock).toBeDefined();
      expect(outlineBlock).toBeDefined();
      expect(topEdgeBlock).toBeDefined();
      expect(viewStrokeBlock).toBeDefined();
      expect(backgroundLayerBlock).toContain("<a:gradFill");
      expect(backgroundLayerBlock).not.toContain('cap="sq"');
      expect(mainShapeBlock).toContain("<a:gradFill");
      expect(mainShapeBlock).toContain('cap="rnd"');
      expect(viewStrokeBlock).toContain('cap="sq"');
      expect(viewStrokeBlock).toContain("<a:bevel/>");
      expect(outlineBlock).not.toContain('val="EF4444"');
      expect(topEdgeBlock).not.toContain('val="22C55E"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output preserves zIndex order, skips visibility hidden, and applies image opacity", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "visual-controls.pptx");

    deck.add(() => (
      <Slide name="Visual controls">
        <Text style={{ x: 1, y: 1, width: 2, height: 0.5, zIndex: 10 }}>Front</Text>
        <Text style={{ x: 1, y: 1.6, width: 2, height: 0.5, zIndex: -1 }}>Back</Text>
        <Text style={{ x: 1, y: 2.2, width: 2, height: 0.5, zIndex: 1 }}>Middle</Text>
        <Text style={{ x: 1, y: 2.8, width: 2, height: 0.5, visibility: "hidden", zIndex: 100 }}>
          Hidden
        </Text>
        <Image
          data={SAMPLE_SVG_DATA_URI}
          style={{
            x: 4,
            y: 1,
            width: 1.5,
            height: 1.5,
            opacity: 0.25,
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();

      const backIndex = slideXml!.indexOf(">Back<");
      const middleIndex = slideXml!.indexOf(">Middle<");
      const frontIndex = slideXml!.indexOf(">Front<");

      expect(backIndex).toBeGreaterThanOrEqual(0);
      expect(middleIndex).toBeGreaterThan(backIndex);
      expect(frontIndex).toBeGreaterThan(middleIndex);
      expect(slideXml).not.toContain(">Hidden<");
      expect(slideXml).toContain('<a:alphaModFix amt="25000"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output omits fully clipped children for overflow hidden containers", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "overflow-hidden.pptx");

    deck.add(() => (
      <Slide name="Overflow hidden output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <Text style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Clip me</Text>
          <Text style={{ x: 3.5, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Drop me</Text>
        </View>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain(">Clip me<");
      expect(slideXml).not.toContain(">Drop me<");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output adjusts clipped image source rects for overflow hidden containers", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "overflow-hidden-image.pptx");

    deck.add(() => (
      <Slide name="Overflow hidden image output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <Image
            data={WIDE_SVG_DATA_URI}
            style={{
              x: -0.5,
              y: 0.5,
              width: 3,
              height: 1,
              fit: "stretch",
            }}
          />
        </View>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:srcRect l="16667" r="16667" t="0" b="0"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output cascades group opacity to descendant text, image, and shape nodes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "opacity-cascade.pptx");

    deck.add(() => (
      <Slide name="Opacity cascade">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 3,
            opacity: 0.5,
            backgroundColor: "#E5E7EB",
          }}
        >
          <Text style={{ x: 0.5, y: 0.5, width: 2, height: 0.75, color: "#FF0000" }}>
            Half text
          </Text>
          <Image
            data={SAMPLE_SVG_DATA_URI}
            style={{
              x: 3,
              y: 0.5,
              width: 1.5,
              height: 1.5,
              opacity: 0.5,
            }}
          />
          <Shape
            shape="rect"
            style={{
              x: 0.5,
              y: 1.75,
              width: 1.5,
              height: 0.75,
              fill: "#2563EB",
            }}
          />
        </View>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:alpha val="50000"/>');
      expect(slideXml).toContain('<a:alphaModFix amt="25000"/>');
      expect(slideXml).toContain('<a:srgbClr val="2563EB"><a:alpha val="50000"/></a:srgbClr>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output applies image fit, objectPosition, and crop controls", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "image-controls.pptx");

    deck.add(() => (
      <Slide name="Image controls output">
        <Image
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            objectFit: "contain",
            objectPosition: "right bottom",
          }}
        />
        <Image
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 4,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right center",
          }}
        />
        <Image
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 6,
            y: 1,
            width: 2,
            height: 1,
            crop: {
              left: "10%",
              right: "20%",
              bottom: "40%",
            },
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-100000" b="0"/>');
      expect(slideXml).toContain('<a:srcRect l="75000" r="0" t="0" b="0"/>');
      expect(slideXml).toContain('<a:srcRect l="10000" r="20000" t="0" b="40000"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output applies edge-offset and length-based objectPosition controls", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "image-position-offsets.pptx");

    deck.add(() => (
      <Slide name="Image position offsets output">
        <Image
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right 25% bottom 10%",
          }}
        />
        <Image
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 3,
            y: 1,
            width: 2,
            height: 2,
            objectFit: "contain",
            objectPosition: "left 25% bottom 0.25in",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:srcRect l="56250" r="18750" t="0" b="0"/>');
      expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-87500" b="-12500"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits gradient fill markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "gradient-fill.pptx");

    deck.add(() => (
      <Slide
        name="Gradient output"
        style={{
          background: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1.5,
            background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
          }}
        />
        <Text
          style={{
            x: 1,
            y: 3,
            width: 3,
            height: 0.75,
            fontSize: 18,
            background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
          }}
        >
          Gradient text
        </Text>
        <Shape
          shape="rect"
          style={{
            x: 5,
            y: 1,
            width: 2,
            height: 2,
            fill: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain("<a:gradFill");
      expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
      expect(slideXml).toContain('ang="5400000"');
      expect(slideXml).toContain('ang="10800000"');
      expect(slideXml).toContain('ang="2700000"');
      expect(slideXml).toContain('val="2563EB"');
      expect(slideXml).toContain('val="F97316"');
      expect(slideXml).toContain('val="22C55E"');
      expect(slideXml).toContain('val="0EA5E9"');
      expect(slideXml).toContain('val="EF4444"');
      expect(slideXml).toContain('val="F59E0B"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits backgroundImage gradient markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-image-gradient.pptx");

    deck.add(() => (
      <Slide
        name="Background image output"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1.5,
            backgroundImage: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
          }}
        />
        <Text
          style={{
            x: 1,
            y: 3,
            width: 3,
            height: 0.75,
            fontSize: 18,
            backgroundImage: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
          }}
        >
          Background image text
        </Text>
        <Shape
          shape="rect"
          style={{
            x: 5,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain("<a:gradFill");
      expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
      expect(slideXml).toContain('val="2563EB"');
      expect(slideXml).toContain('val="22C55E"');
      expect(slideXml).toContain('val="0F172A"');
      expect(slideXml).toContain('val="EF4444"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits background image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-image-layers.pptx");

    deck.add(() => (
      <Slide
        name="Background image layer output"
        style={{
          backgroundImage: `url("${WIDE_SVG_DATA_URI}"), linear-gradient(180deg, #111111 0%, #333333 100%)`,
          backgroundSize: "contain, 100% 100%",
          backgroundPosition: "right bottom, center",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "cover",
            backgroundPosition: "right center",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(2);
      expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-12500" b="0"/>');
      expect(slideXml).toContain('<a:srcRect l="50000" r="0" t="0" b="0"/>');
      expect(slideXml).toContain('val="111111"');
      expect(slideXml).toContain('val="333333"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits repeated background image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-repeat-layers.pptx");

    deck.add(() => (
      <Slide name="Background repeat output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
          }}
        />
        <View
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            backgroundImage: `url("${SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-x",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(4);
      expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
      expect(slideXml).toContain('<a:off x="914400" y="1828800"/>');
      expect(slideXml).toContain('<a:off x="3657600" y="914400"/>');
      expect(slideXml).toContain('<a:off x="4572000" y="914400"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits background shorthand image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-shorthand-image-layers.pptx");

    deck.add(() => (
      <Slide
        name="Background shorthand image layer output"
        style={{
          background: `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, linear-gradient(180deg, #111111 0%, #333333 100%)`,
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(3);
      expect(slideXml).toContain('val="111111"');
      expect(slideXml).toContain('val="333333"');
      expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-12500" b="0"/>');
      expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
      expect(slideXml).toContain('<a:off x="1828800" y="914400"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits explicit backgroundSize image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-explicit-size.pptx");

    deck.add(() => (
      <Slide name="Explicit background size output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "50% auto",
            backgroundPosition: "right bottom",
          }}
        />
        <View
          style={{
            x: 1,
            y: 3.5,
            width: 4,
            height: 1.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto 50%",
            backgroundPosition: "left top",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="2743200" y="1828800"/>');
      expect(slideXml).toContain('<a:ext cx="1828800" cy="914400"/>');
      expect(slideXml).toContain('<a:off x="914400" y="3200400"/>');
      expect(slideXml).toContain('<a:ext cx="1371600" cy="685800"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits intrinsic auto backgroundSize image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-auto-size.pptx");

    deck.add(() => (
      <Slide name="Auto background size output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto auto",
            backgroundPosition: "right bottom",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="3619500" y="2266950"/>');
      expect(slideXml).toContain('<a:ext cx="952500" cy="476250"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits backgroundClip image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-clip-image.pptx");

    deck.add(() => (
      <Slide name="Background clip output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain(
        '<a:srcRect l="12587" r="12587" t="25174" b="25174"/><a:stretch/>',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits backgroundOrigin image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-origin-image.pptx");

    deck.add(() => (
      <Slide name="Background origin output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain(
        '<a:srcRect l="12522" r="12522" t="25087" b="25087"/><a:stretch/>',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits background shorthand visual-box image layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-shorthand-boxes-image.pptx");

    deck.add(() => (
      <Slide name="Background shorthand boxes output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}") no-repeat padding-box content-box / 100% 100%`,
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain(
        '<a:srcRect l="12522" r="12522" t="25087" b="25087"/><a:stretch/>',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits backgroundClip gradient fill markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-clip-gradient-fill.pptx");

    deck.add(() => (
      <Slide name="Background clip gradient output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: "linear-gradient(180deg, #111111 0%, #333333 100%)",
            backgroundClip: "content-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain('val="111111"');
      expect(slideXml).toContain('val="333333"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits backgroundOrigin gradient fill markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-origin-gradient-fill.pptx");

    deck.add(() => (
      <Slide name="Background origin gradient output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: "linear-gradient(180deg, #111111 0in, #333333 1in)",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain('<a:gs pos="50174">');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits background shorthand visual-box gradient fill markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-shorthand-gradient-boxes.pptx");

    deck.add(() => (
      <Slide name="Background shorthand gradient boxes output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0in, #333333 1in) padding-box content-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain('<a:gs pos="50174">');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits background shorthand gradient layer color fallback markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-shorthand-gradient-fallback.pptx");

    deck.add(() => (
      <Slide name="Background shorthand gradient fallback output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in) #AAAAAA padding-box content-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain('val="AAAAAA"');
      expect(slideXml).toContain('<a:gs pos="50174">');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits per-layer backgroundOrigin and backgroundClip list markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "background-layer-boxes.pptx");

    deck.add(() => (
      <Slide name="Background layer boxes output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage:
              "linear-gradient(180deg, #111111 0in, #333333 1in), linear-gradient(180deg, #AAAAAA 0in, #CCCCCC 1in)",
            backgroundOrigin: "padding-box, border-box",
            backgroundClip: "content-box, padding-box",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(2);
      expect(slideXml).toContain('<a:off x="917575" y="917575"/>');
      expect(slideXml).toContain('<a:ext cx="3651250" cy="1822450"/>');
      expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
      expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
      expect(slideXml).toContain('<a:gs pos="50000">');
      expect(slideXml).toContain('<a:gs pos="50174">');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits transformOrigin-adjusted markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "transform-origin.pptx");

    deck.add(() => (
      <Slide name="Transform origin output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "scale(2, 0.5)",
          }}
        />
        <Shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "rotate(90deg)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
      expect(slideXml).toContain('<a:ext cx="3657600" cy="457200"/>');
      expect(slideXml).toContain('<a:off x="3200400" y="-457200"/>');
      expect(slideXml).toContain('<a:ext cx="1828800" cy="914400"/>');
      expect(slideXml).toContain('rot="5400000"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits skew-adjusted bounding box markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "transform-skew.pptx");

    deck.add(() => (
      <Slide name="Skew output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "skewX(45deg)",
          }}
        />
        <Shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 1,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "skewY(45deg)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
      expect(slideXml).toContain('<a:ext cx="2743200" cy="914400"/>');
      expect(slideXml).toContain('<a:off x="3657600" y="914400"/>');
      expect(slideXml).toContain('<a:ext cx="914400" cy="1828800"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits matrix-adjusted bounding box markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "transform-matrix.pptx");

    deck.add(() => (
      <Slide name="Matrix output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "matrix(1, 0.5, 0.25, 1, 96, 48)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:off x="1828800" y="1371600"/>');
      expect(slideXml).toContain('<a:ext cx="2057400" cy="1828800"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits radial-gradient fill markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "radial-gradient-fill.pptx");

    deck.add(() => (
      <Slide
        name="Radial output"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            background:
              "radial-gradient(circle closest-side at 75% 25%, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
          }}
        />
        <Text
          style={{
            x: 1,
            y: 3,
            width: 3,
            height: 0.75,
            fontSize: 18,
            backgroundImage:
              "radial-gradient(ellipse farthest-side at center, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
          }}
        >
          Radial text
        </Text>
        <Shape
          shape="rect"
          style={{
            x: 5,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage: "radial-gradient(circle 40% at 20% 30%, #EF4444 0%, #F59E0B 100%)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain("<a:gradFill");
      expect(slideXml).toContain('<a:path path="circle">');
      expect(slideXml?.match(/<a:path path="circle">/g)?.length).toBeGreaterThanOrEqual(4);
      expect(slideXml).toContain('fillToRect l="5000" t="45000" r="55000" b="-5000"');
      expect(slideXml).toContain('fillToRect l="50000" t="0" r="0" b="50000"');
      expect(slideXml).toContain('fillToRect l="0" t="0" r="0" b="0"');
      expect(slideXml).toContain('fillToRect l="-20000" t="-10000" r="40000" b="30000"');
      expect(slideXml).toContain('val="2563EB"');
      expect(slideXml).toContain('val="0EA5E9"');
      expect(slideXml).toContain('val="0F172A"');
      expect(slideXml).toContain('val="EF4444"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits repeating gradient fill markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "repeating-gradient-fill.pptx");

    deck.add(() => (
      <Slide
        name="Repeating output"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, #111111 0%, #EEEEEE 25%, #111111 50%)",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage:
              "repeating-radial-gradient(circle 40% at center, #EF4444 0%, #F59E0B 20%, #EF4444 40%)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml?.match(/<a:gs pos="/g)?.length).toBeGreaterThanOrEqual(10);
      expect(slideXml).toContain('pos="75000"');
      expect(slideXml).toContain('val="EEEEEE"');
      expect(slideXml).toContain('val="F59E0B"');
      expect(slideXml).toContain('<a:path path="circle">');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits length-based gradient stop positions", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "gradient-length-stops.pptx");

    deck.add(() => (
      <Slide name="Length stop output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundImage: "linear-gradient(90deg, #111111 0in, #777777 1in, #EEEEEE 2in)",
          }}
        />
        <View
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage:
              "radial-gradient(circle 40% at center, #EF4444 0in, #F59E0B 0.4in, #FDE68A 0.8in)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('pos="50000"');
      expect(slideXml).toContain('val="777777"');
      expect(slideXml).toContain('val="F59E0B"');
      expect(slideXml).toContain('val="FDE68A"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits multi-position stops and color hints", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "gradient-hints.pptx");

    deck.add(() => (
      <Slide name="Gradient hints output">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundImage: "linear-gradient(90deg, #FF0000 0 50%, 75%, #0000FF 100%)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('pos="50000"');
      expect(slideXml).toContain('pos="75000"');
      expect(slideXml).toContain('val="800080"');
      expect(slideXml?.match(/val="FF0000"/g)?.length).toBeGreaterThanOrEqual(2);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits multiple background layer markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "multiple-background-layers.pptx");

    deck.add(() => (
      <Slide
        name="Multiple background output"
        style={{
          backgroundImage:
            "linear-gradient(90deg, #FF0000 0%, #00FF00 100%), linear-gradient(180deg, #0000FF 0%, #FFFFFF 100%)",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1.25,
            backgroundImage:
              "linear-gradient(45deg, #123456 0%, #654321 100%), linear-gradient(180deg, #ABCDEF 0%, #FEDCBA 100%)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
      expect(slideXml).toContain('ang="5400000"');
      expect(slideXml).toContain('ang="10800000"');
      expect(slideXml).toContain('ang="2700000"');
      expect(slideXml).toContain('val="FF0000"');
      expect(slideXml).toContain('val="00FF00"');
      expect(slideXml).toContain('val="0000FF"');
      expect(slideXml).toContain('val="123456"');
      expect(slideXml).toContain('val="ABCDEF"');
      expect(slideXml).toContain('val="FEDCBA"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits transform translation, scale, rotation, and flip markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "transform-aliases.pptx");

    deck.add(() => (
      <Slide name="Transform output">
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transform: "translate(1in, 0.5in) rotate(15deg) scale(2, 1.5) scale(-1, -1)",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('rot="900000"');
      expect(slideXml).toContain('flipH="1"');
      expect(slideXml).toContain('flipV="1"');
      expect(slideXml).toContain('<a:off x="914400" y="1143000"/>');
      expect(slideXml).toContain('<a:ext cx="3657600" cy="1371600"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits text direction, hyperlinks, and baseline variants", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "text-semantics.pptx");

    deck.add(() => (
      <Slide name="Text semantics output">
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            direction: "rtl",
            href: "https://example.com/docs",
            tooltip: "Open docs",
          }}
        >
          RTL link
        </Text>
        <Text style={{ x: 1, y: 2, width: 3, height: 0.75, superscript: true }}>Super</Text>
        <Text style={{ x: 1, y: 3, width: 3, height: 0.75, subscript: true }}>Sub</Text>
        <Image
          data={SAMPLE_SVG_DATA_URI}
          style={{
            x: 5,
            y: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image link",
          }}
        />
        <Shape
          shape="rect"
          style={{
            x: 5,
            y: 3,
            width: 2,
            height: 1,
            fill: "#2563EB",
            href: "https://example.com/shape",
          }}
        />
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const [slideXml, relsXml] = await Promise.all([
        zip.file("ppt/slides/slide1.xml")?.async("string"),
        zip.file("ppt/slides/_rels/slide1.xml.rels")?.async("string"),
      ]);

      expect(slideXml).toBeDefined();
      expect(relsXml).toBeDefined();
      expect(slideXml).toContain('rtl="1"');
      expect(slideXml).toContain('baseline="30000"');
      expect(slideXml).toContain('baseline="-40000"');
      expect(slideXml).toContain('tooltip="Open docs"');
      expect(slideXml).toContain('tooltip="Open image link"');
      expect(relsXml).toContain('Target="https://example.com/docs"');
      expect(relsXml).toContain('Target="https://example.com/image"');
      expect(relsXml).toContain('Target="https://example.com/shape"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits bullet and numbered list markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "lists.pptx");

    deck.add(() => (
      <Slide name="List output">
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            listStyleType: "circle",
            listIndent: "18pt",
          }}
        >
          Bullet item
        </Text>
        <Text
          style={{
            x: 1,
            y: 2,
            width: 3,
            height: 0.75,
            listStyleType: "upper-roman",
            listStart: 3,
          }}
        >
          Number item
        </Text>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('<a:buChar char="&#x25E6;"/>');
      expect(slideXml).toContain('marL="228600" indent="-228600"');
      expect(slideXml).toContain('<a:buAutoNum type="romanUcPeriod" startAt="3"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits writingMode and underline style/color markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "typography-aliases.pptx");

    deck.add(() => (
      <Slide name="Typography aliases output">
        <Text
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            writingMode: "vertical-rl",
            textDecorationLine: "underline",
            textDecorationStyle: "wavy",
            textDecorationColor: "tomato",
          }}
        >
          Decorated
        </Text>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('vert="vert270"');
      expect(slideXml).toContain('u="wavy"');
      expect(slideXml).toContain(
        '<a:uFill><a:solidFill><a:srgbClr val="FF6347"/></a:solidFill></a:uFill>',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits tab stop markup", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "tab-stops.pptx");

    deck.add(() => (
      <Slide name="Tab stops output">
        <Text
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 1,
            tabStops: [
              { position: "36pt", alignment: "left" },
              { position: "1.5in", alignment: "center" },
              { position: "144px", alignment: "decimal" },
            ],
          }}
        >
          Alpha\tBeta\tGamma
        </Text>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain("<a:tabLst>");
      expect(slideXml).toContain('<a:tab pos="457200" algn="l"/>');
      expect(slideXml).toContain('<a:tab pos="1371600" algn="ctr"/>');
      expect(slideXml).toContain('<a:tab pos="1371600" algn="dec"/>');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("output emits textIndent markup for plain and list paragraphs", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-"));
    const output = join(tempDir, "text-indent.pptx");

    deck.add(() => (
      <Slide name="Text indent output">
        <Text
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 1,
            textIndent: "36pt",
          }}
        >
          Plain indent
        </Text>
        <Text
          style={{
            x: 1,
            y: 2.25,
            width: 4,
            height: 1,
            listStyleType: "circle",
            listIndent: "18pt",
            textIndent: "18pt",
          }}
        >
          List indent
        </Text>
      </Slide>
    ));

    try {
      await deck.output({
        backend: "pptxgenjs",
        output,
      });

      const content = await readFile(output);
      const zip = await JSZip.loadAsync(content);
      const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

      expect(slideXml).toBeDefined();
      expect(slideXml).toContain('indent="457200" marL="0"');
      expect(slideXml).toContain('<a:buChar char="&#x25E6;"/>');
      expect(slideXml).toContain('marL="228600" indent="0"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

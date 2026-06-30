import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import pptxgen from "pptxgenjs";
import { Deck } from "deckjsx";
import { jsx } from "deckjsx/jsx-runtime";

const here = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(here, "artifacts");
const directPath = join(artifactsDir, "deckjsx-direct.pptx");
const oraclePath = join(artifactsDir, "pptxgenjs-oracle.pptx");
const reportPath = join(artifactsDir, "comparison-report.json");

const pngData =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const wideSvgData = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#2563EB"/></svg>',
).toString("base64")}`;

function element(type, props, children) {
  const nextProps = normalizeDeckjsxProps(children === undefined ? props : { ...props, children });
  return jsx(type, nextProps);
}

function normalizeDeckjsxProps(props) {
  const style = props?.style;
  if (!style || typeof style !== "object" || style.position !== undefined) {
    return props;
  }

  const usesPositioning =
    style.left !== undefined ||
    style.top !== undefined ||
    style.right !== undefined ||
    style.bottom !== undefined ||
    style.inset !== undefined;
  return usesPositioning ? { ...props, style: { position: "absolute", ...style } } : props;
}

function view(props, children) {
  return element("div", props, children);
}

function text(props, children) {
  return element("p", props, children);
}

function image(props) {
  return element("img", props);
}

function shape(props) {
  return element("shape", props);
}

function stripHash(color) {
  return color.replace(/^#/, "");
}

function entry(zip, path) {
  const entry = zip[path];
  if (!entry) {
    throw new Error(`Missing PPTX entry: ${path}`);
  }
  return strFromU8(entry);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function slidePaths(zip) {
  return Object.keys(zip)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort();
}

function relationshipPaths(zip) {
  return Object.keys(zip)
    .filter((path) => path.endsWith(".rels"))
    .sort();
}

function requiredPackageAssertions(name, zip) {
  const requiredEntries = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
    "ppt/slides/slide1.xml",
    "ppt/slides/_rels/slide1.xml.rels",
  ];

  for (const entry of requiredEntries) {
    assert(zip[entry], `${name} package is missing ${entry}`);
  }

  const contentTypes = entry(zip, "[Content_Types].xml");
  assert(
    contentTypes.includes("presentationml.presentation.main+xml"),
    `${name} content types do not declare a presentation part`,
  );
  assert(
    contentTypes.includes("presentationml.slide+xml"),
    `${name} content types do not declare slide parts`,
  );
}

function semanticAssertions(name, zip) {
  const slides = slidePaths(zip);
  assert(slides.length === 11, `${name} expected eleven slides, found ${slides.length}`);

  const slideXml = entry(zip, "ppt/slides/slide1.xml");
  const slideRels = entry(zip, "ppt/slides/_rels/slide1.xml.rels");
  const slide2Xml = entry(zip, "ppt/slides/slide2.xml");
  const slide2Rels = entry(zip, "ppt/slides/_rels/slide2.xml.rels");
  const slide3Xml = entry(zip, "ppt/slides/slide3.xml");
  const slide4Xml = entry(zip, "ppt/slides/slide4.xml");
  const slide5Xml = entry(zip, "ppt/slides/slide5.xml");
  const slide6Xml = entry(zip, "ppt/slides/slide6.xml");
  const slide6Rels = entry(zip, "ppt/slides/_rels/slide6.xml.rels");
  const slide7Xml = entry(zip, "ppt/slides/slide7.xml");
  const slide8Xml = entry(zip, "ppt/slides/slide8.xml");
  const slide9Xml = entry(zip, "ppt/slides/slide9.xml");
  const slide10Xml = entry(zip, "ppt/slides/slide10.xml");
  const slide10Rels = entry(zip, "ppt/slides/_rels/slide10.xml.rels");
  const slide11Xml = entry(zip, "ppt/slides/slide11.xml");
  const slide11Rels = entry(zip, "ppt/slides/_rels/slide11.xml.rels");

  assert(slideXml.includes("Migration oracle"), `${name} slide lost the title text`);
  assert(slideXml.includes("direct writer regression"), `${name} slide lost body text`);
  assert(slideXml.includes("914400"), `${name} slide does not include the expected 1in EMU offset`);
  assert(
    slideXml.includes(stripHash("F97316")) || slideXml.includes(stripHash("f97316")),
    `${name} slide does not include the expected accent fill color`,
  );
  assert(slideRels.includes("/image"), `${name} slide does not contain an image relationship`);
  assert(slide2Xml.includes("Linked docs"), `${name} second slide lost hyperlink text`);
  assert(
    slide2Rels.includes("https://example.com/deckjsx") &&
      slide2Rels.includes('TargetMode="External"') &&
      slide2Rels.includes("/hyperlink"),
    `${name} second slide does not contain an external hyperlink relationship`,
  );

  const backIndex = slide3Xml.indexOf("Back layer");
  const middleIndex = slide3Xml.indexOf("Middle layer");
  const frontIndex = slide3Xml.indexOf("Front layer");
  assert(backIndex >= 0, `${name} paint-order slide lost the back layer text`);
  assert(middleIndex > backIndex, `${name} paint-order slide has middle before back`);
  assert(frontIndex > middleIndex, `${name} paint-order slide has front before middle`);
  assert(
    slide3Xml.includes(stripHash("16A34A")) || slide3Xml.includes(stripHash("16a34a")),
    `${name} paint-order slide does not include the expected green fill`,
  );

  assert(slide4Xml.includes("Rich text oracle"), `${name} rich-text slide lost heading text`);
  assert(slide4Xml.includes("Migration "), `${name} rich-text slide lost leading run text`);
  assert(slide4Xml.includes("bold red"), `${name} rich-text slide lost styled run text`);
  assert(slide4Xml.includes(" signal"), `${name} rich-text slide lost trailing run text`);
  assert(
    slide4Xml.includes(stripHash("DC2626")) || slide4Xml.includes(stripHash("dc2626")),
    `${name} rich-text slide does not include the expected run color`,
  );
  assert(
    slide4Xml.includes('b="1"') || slide4Xml.includes('b="true"'),
    `${name} rich-text slide does not include the expected bold run signal`,
  );

  assert(slide5Xml.includes("Effects oracle"), `${name} effects slide lost heading text`);
  assert(
    slide5Xml.includes(stripHash("7C3AED")) || slide5Xml.includes(stripHash("7c3aed")),
    `${name} effects slide does not include the expected transparent fill color`,
  );
  assert(
    slide5Xml.includes(stripHash("0F172A")) || slide5Xml.includes(stripHash("0f172a")),
    `${name} effects slide does not include the expected stroke color`,
  );
  assert(slide5Xml.includes('rot="900000"'), `${name} effects slide lost rotation signal`);
  assert(slide5Xml.includes("<a:alpha"), `${name} effects slide lost transparency signal`);
  assert(slide5Xml.includes("a:prstDash"), `${name} effects slide lost dashed stroke signal`);

  assert(slide6Xml.includes("Image crop oracle"), `${name} crop slide lost heading text`);
  assert(
    slide6Rels.includes("/image"),
    `${name} crop slide does not contain an image relationship`,
  );
  assert(slide6Xml.includes("a:srcRect"), `${name} crop slide lost image source-rect signal`);

  assert(slide7Xml.includes("Shadow oracle"), `${name} shadow slide lost heading text`);
  assert(slide7Xml.includes("<a:outerShdw"), `${name} shadow slide lost outer shadow signal`);
  assert(
    slide7Xml.includes(stripHash("2563EB")) || slide7Xml.includes(stripHash("2563eb")),
    `${name} shadow slide does not include the expected shadow color`,
  );

  assert(slide8Xml.includes("Text body oracle"), `${name} text-body slide lost heading text`);
  assert(slide8Xml.includes("RTL text"), `${name} text-body slide lost RTL text`);
  assert(slide8Xml.includes('rtl="1"'), `${name} text-body slide lost RTL mode signal`);
  assert(slide8Xml.includes("Super"), `${name} text-body slide lost superscript text`);
  assert(slide8Xml.includes("Sub"), `${name} text-body slide lost subscript text`);
  assert(
    slide8Xml.includes('baseline="30000"'),
    `${name} text-body slide lost superscript baseline signal`,
  );
  assert(
    slide8Xml.includes('baseline="-40000"'),
    `${name} text-body slide lost subscript baseline signal`,
  );
  assert(slide8Xml.includes("Decorated"), `${name} text-body slide lost decorated text`);
  assert(slide8Xml.includes('u="wavy"'), `${name} text-body slide lost wavy underline signal`);
  assert(
    slide8Xml.includes(stripHash("FF6347")) || slide8Xml.includes(stripHash("ff6347")),
    `${name} text-body slide does not include the expected underline color`,
  );
  assert(slide8Xml.includes("<a:buChar"), `${name} text-body slide lost bullet character signal`);
  assert(slide8Xml.includes("<a:buAutoNum"), `${name} text-body slide lost numbering signal`);

  assert(slide9Xml.includes("Paragraph oracle"), `${name} paragraph slide lost heading text`);
  assert(slide9Xml.includes("Vertical text"), `${name} paragraph slide lost vertical text`);
  assert(slide9Xml.includes('vert="vert270"'), `${name} paragraph slide lost vertical text signal`);
  assert(slide9Xml.includes("Alpha"), `${name} paragraph slide lost tab-stop text`);
  assert(slide9Xml.includes("<a:tabLst>"), `${name} paragraph slide lost tab stop list`);
  assert(
    slide9Xml.includes('<a:tab pos="457200" algn="l"/>'),
    `${name} paragraph slide lost left tab stop signal`,
  );
  assert(
    slide9Xml.includes('<a:tab pos="1371600" algn="ctr"/>'),
    `${name} paragraph slide lost center tab stop signal`,
  );
  assert(
    slide9Xml.includes('<a:tab pos="1371600" algn="dec"/>'),
    `${name} paragraph slide lost decimal tab stop signal`,
  );
  assert(
    slide9Xml.includes('<a:lnSpc><a:spcPts val="2800"/></a:lnSpc>'),
    `${name} paragraph slide lost point line-spacing signal`,
  );
  assert(
    slide9Xml.includes('<a:lnSpc><a:spcPct val="150000"/></a:lnSpc>'),
    `${name} paragraph slide lost multiple line-spacing signal`,
  );
  assert(
    slide9Xml.includes('<a:spcBef><a:spcPts val="1200"/></a:spcBef>'),
    `${name} paragraph slide lost paragraph spacing-before signal`,
  );
  assert(
    slide9Xml.includes('<a:spcAft><a:spcPts val="1800"/></a:spcAft>'),
    `${name} paragraph slide lost paragraph spacing-after signal`,
  );
  assert(slide9Xml.includes("Spaced text"), `${name} paragraph slide lost spaced text`);
  assert(slide9Xml.includes('spc="150"'), `${name} paragraph slide lost character spacing signal`);
  assert(slide9Xml.includes("<a:normAutofit/>"), `${name} paragraph slide lost shrink-fit signal`);
  assert(slide9Xml.includes("<a:spAutoFit/>"), `${name} paragraph slide lost resize-fit signal`);
  assert(slide9Xml.includes('anchor="ctr"'), `${name} paragraph slide lost middle anchor signal`);
  assert(slide9Xml.includes('anchor="b"'), `${name} paragraph slide lost bottom anchor signal`);
  assert(slide9Xml.includes("Padded text"), `${name} paragraph slide lost padded text`);
  assert(slide9Xml.includes('lIns="76200"'), `${name} paragraph slide lost left inset signal`);
  assert(slide9Xml.includes('tIns="152400"'), `${name} paragraph slide lost top inset signal`);
  assert(slide9Xml.includes('rIns="152400"'), `${name} paragraph slide lost right inset signal`);
  assert(slide9Xml.includes('bIns="76200"'), `${name} paragraph slide lost bottom inset signal`);
  assert(slide9Xml.includes('algn="ctr"'), `${name} paragraph slide lost center alignment signal`);
  assert(slide9Xml.includes('algn="r"'), `${name} paragraph slide lost right alignment signal`);
  assert(
    slide9Xml.includes('algn="just"'),
    `${name} paragraph slide lost justify alignment signal`,
  );
  assert(
    !slide9Xml.includes('algn="center"') &&
      !slide9Xml.includes('algn="right"') &&
      !slide9Xml.includes('algn="justify"'),
    `${name} paragraph slide contains CSS textAlign values instead of PPTX alignment values`,
  );

  assert(
    slide10Xml.includes("Image effects oracle"),
    `${name} image-effects slide lost heading text`,
  );
  assert(
    slide10Rels.includes("/image"),
    `${name} image-effects slide does not contain an image relationship`,
  );
  assert(slide10Xml.includes('rot="720000"'), `${name} image-effects slide lost rotation signal`);
  assert(
    slide10Xml.includes('flipH="1"'),
    `${name} image-effects slide lost horizontal flip signal`,
  );
  assert(slide10Xml.includes('flipV="1"'), `${name} image-effects slide lost vertical flip signal`);
  assert(slide10Xml.includes("alpha"), `${name} image-effects slide lost transparency signal`);

  assert(
    slide11Xml.includes("Image underlay oracle"),
    `${name} image-underlay slide lost heading text`,
  );
  assert(
    slide11Xml.includes("Foreground copy"),
    `${name} image-underlay slide lost foreground text`,
  );
  assert(
    slide11Rels.includes("/image"),
    `${name} image-underlay slide does not contain an image relationship`,
  );
  const underlayImageIndex = slide11Xml.indexOf("<p:pic");
  const foregroundTextIndex = slide11Xml.indexOf("Foreground copy");
  assert(underlayImageIndex >= 0, `${name} image-underlay slide lost picture XML`);
  assert(
    foregroundTextIndex > underlayImageIndex,
    `${name} image-underlay slide does not keep foreground text after the image underlay`,
  );
}

async function writeDirectDeck() {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    meta: { title: "PPTX generation regression oracle", author: "deckjsx" },
  });

  deck.slide({ name: "Migration oracle", style: { backgroundColor: "#F8FAFC" } }, () =>
    view({ style: { left: 0.5, top: 0.35, width: 9, height: 4.9 } }, [
      text(
        {
          style: { left: 0.5, top: 0.45, width: 4.8, height: 0.6, fontSize: 28, color: "#111827" },
        },
        "Migration oracle",
      ),
      text(
        {
          style: { left: 0.5, top: 1.2, width: 5.8, height: 0.55, fontSize: 16, color: "#334155" },
        },
        "direct writer regression fixture",
      ),
      shape({
        shape: "rect",
        style: {
          left: 1,
          top: 2,
          width: 2.2,
          height: 1.1,
          fill: "#F97316",
          stroke: "1.5pt solid #1D4ED8",
          borderRadius: 8,
        },
      }),
      image({
        data: pngData,
        style: { left: 6.4, top: 1.1, width: 1.2, height: 1.2, objectFit: "fill" },
      }),
    ]),
  );
  deck.slide({ name: "Hyperlink oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      {
        style: {
          left: 0.9,
          top: 0.9,
          width: 3.6,
          height: 0.55,
          fontSize: 20,
          color: "#2563EB",
          href: "https://example.com/deckjsx",
        },
      },
      "Linked docs",
    ),
    shape({
      shape: "rect",
      style: {
        left: 0.9,
        top: 1.8,
        width: 2.5,
        height: 0.8,
        fill: "#DBEAFE",
        stroke: "1pt solid #2563EB",
      },
    }),
  ]);
  deck.slide({ name: "Paint order oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      {
        style: {
          left: 1,
          top: 0.8,
          width: 3,
          height: 0.45,
          fontSize: 18,
          color: "#111827",
          zIndex: 10,
        },
      },
      "Front layer",
    ),
    shape({
      shape: "rect",
      style: { left: 0.8, top: 1.55, width: 2.4, height: 0.7, fill: "#16A34A", zIndex: 0 },
    }),
    text(
      {
        style: {
          left: 1,
          top: 1.65,
          width: 3,
          height: 0.45,
          fontSize: 18,
          color: "#111827",
          zIndex: 1,
        },
      },
      "Middle layer",
    ),
    text(
      {
        style: {
          left: 1,
          top: 2.5,
          width: 3,
          height: 0.45,
          fontSize: 18,
          color: "#111827",
          zIndex: -1,
        },
      },
      "Back layer",
    ),
  ]);
  deck.slide({ name: "Rich text oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.75, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Rich text oracle",
    ),
    text(
      { style: { left: 0.9, top: 1.55, width: 6.8, height: 0.8, fontSize: 20, color: "#334155" } },
      [
        "Migration ",
        element("span", { style: { color: "#DC2626", fontWeight: 700 } }, "bold red"),
        " signal",
      ],
    ),
  ]);
  deck.slide({ name: "Effects oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.75, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Effects oracle",
    ),
    shape({
      shape: "rect",
      style: {
        left: 1.2,
        top: 1.65,
        width: 2.8,
        height: 1.1,
        fill: "rgba(124, 58, 237, 0.65)",
        stroke: "2pt solid rgba(15, 23, 42, 0.8)",
        strokeDasharray: "1 4",
        transform: "rotate(15deg)",
      },
    }),
  ]);
  deck.slide({ name: "Image crop oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.75, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Image crop oracle",
    ),
    image({
      data: wideSvgData,
      style: {
        left: 1.2,
        top: 1.6,
        width: 2.4,
        height: 1.2,
        crop: { left: "10%", right: "20%", bottom: "30%" },
      },
    }),
  ]);
  deck.slide({ name: "Shadow oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.75, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Shadow oracle",
    ),
    shape({
      shape: "rect",
      style: {
        left: 1.2,
        top: 1.65,
        width: 2.8,
        height: 1.1,
        fill: "#DBEAFE",
        stroke: "1pt solid #1D4ED8",
        boxShadow: "6px 6px 10px rgba(37, 99, 235, 0.45)",
      },
    }),
  ]);
  deck.slide({ name: "Text body oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.55, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Text body oracle",
    ),
    text(
      {
        style: {
          left: 0.9,
          top: 1.2,
          width: 2.8,
          height: 0.5,
          fontSize: 18,
          direction: "rtl",
          color: "#334155",
        },
      },
      "RTL text",
    ),
    text(
      { style: { left: 0.9, top: 1.9, width: 2.8, height: 0.5, fontSize: 18, superscript: true } },
      "Super",
    ),
    text(
      { style: { left: 0.9, top: 2.6, width: 2.8, height: 0.5, fontSize: 18, subscript: true } },
      "Sub",
    ),
    text(
      {
        style: {
          left: 4.2,
          top: 1.2,
          width: 2.8,
          height: 0.5,
          fontSize: 18,
          textDecorationLine: "underline",
          textDecorationStyle: "wavy",
          textDecorationColor: "tomato",
        },
      },
      "Decorated",
    ),
    text(
      {
        style: {
          left: 4.2,
          top: 1.9,
          width: 3,
          height: 0.5,
          fontSize: 18,
          listStyleType: "circle",
        },
      },
      "Bullet item",
    ),
    text(
      {
        style: {
          left: 4.2,
          top: 2.6,
          width: 3,
          height: 0.5,
          fontSize: 18,
          listStyleType: "upper-roman",
          listStart: 3,
        },
      },
      "Number item",
    ),
  ]);
  deck.slide({ name: "Paragraph oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.55, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Paragraph oracle",
    ),
    text(
      {
        style: {
          left: 0.9,
          top: 1.25,
          width: 1,
          height: 2,
          fontSize: 18,
          writingMode: "vertical-rl",
        },
      },
      "Vertical text",
    ),
    text(
      {
        style: {
          left: 2.4,
          top: 1.25,
          width: 5,
          height: 1,
          fontSize: 18,
          tabStops: [
            { position: "36pt", alignment: "left" },
            { position: "1.5in", alignment: "center" },
            { position: "144px", alignment: "decimal" },
          ],
        },
      },
      "Alpha\tBeta\tGamma",
    ),
    text(
      {
        style: { left: 0.9, top: 3.6, width: 2.4, height: 0.45, fontSize: 16, lineHeight: "28pt" },
      },
      "Line spacing points",
    ),
    text(
      { style: { left: 3.4, top: 3.6, width: 2.6, height: 0.45, fontSize: 16, lineHeight: 1.5 } },
      "Line spacing multiple",
    ),
    text(
      {
        style: {
          left: 6.2,
          top: 3.6,
          width: 2.6,
          height: 0.45,
          fontSize: 16,
          paragraphSpacingBefore: 12,
          paragraphSpacingAfter: 18,
        },
      },
      "Paragraph spacing",
    ),
    text(
      {
        style: { left: 0.9, top: 4.25, width: 2.6, height: 0.45, fontSize: 16, letterSpacing: 1.5 },
      },
      "Spaced text",
    ),
    text(
      { style: { left: 3.6, top: 4.25, width: 1.6, height: 0.45, fontSize: 16, fit: "shrink" } },
      "Fit shrink",
    ),
    text(
      { style: { left: 5.3, top: 4.25, width: 1.6, height: 0.45, fontSize: 16, fit: "resize" } },
      "Fit resize",
    ),
    text(
      {
        style: {
          left: 7,
          top: 4.05,
          width: 1.4,
          height: 0.8,
          fontSize: 16,
          verticalAlign: "middle",
        },
      },
      "Middle",
    ),
    text(
      {
        style: {
          left: 8.5,
          top: 4.05,
          width: 1.2,
          height: 0.8,
          fontSize: 16,
          verticalAlign: "bottom",
        },
      },
      "Bottom",
    ),
    text(
      {
        style: {
          left: 6.7,
          top: 3.05,
          width: 2.4,
          height: 0.45,
          fontSize: 16,
          padding: ["12pt", "12pt", "6pt", "6pt"],
        },
      },
      "Padded text",
    ),
    text(
      {
        style: {
          left: 3.6,
          top: 3.05,
          width: 1.5,
          height: 0.45,
          fontSize: 16,
          textAlign: "center",
        },
      },
      "Center",
    ),
    text(
      {
        style: { left: 5.2, top: 3.05, width: 1.3, height: 0.45, fontSize: 16, textAlign: "right" },
      },
      "Right",
    ),
    text(
      {
        style: {
          left: 9.05,
          top: 3.05,
          width: 0.9,
          height: 0.45,
          fontSize: 16,
          textAlign: "justify",
        },
      },
      "Just",
    ),
  ]);
  deck.slide({ name: "Image effects oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    text(
      { style: { left: 0.9, top: 0.75, width: 4.8, height: 0.55, fontSize: 22, color: "#111827" } },
      "Image effects oracle",
    ),
    image({
      data: wideSvgData,
      style: {
        left: 1.2,
        top: 1.75,
        width: 2.6,
        height: 1.3,
        opacity: 0.6,
        transform: "rotate(12deg) scale(-1, -1)",
      },
    }),
  ]);
  deck.slide({ name: "Image underlay oracle", style: { backgroundColor: "#FFFFFF" } }, () => [
    image({
      data: wideSvgData,
      style: {
        left: 0.6,
        top: 0.7,
        width: 5.2,
        height: 2.6,
        objectFit: "cover",
        objectPosition: "center",
        zIndex: -1,
      },
    }),
    text(
      {
        style: {
          left: 0.9,
          top: 0.75,
          width: 4.8,
          height: 0.55,
          fontSize: 22,
          color: "#111827",
          zIndex: 1,
        },
      },
      "Image underlay oracle",
    ),
    text(
      {
        style: {
          left: 0.9,
          top: 1.55,
          width: 4.8,
          height: 0.65,
          fontSize: 18,
          color: "#FFFFFF",
          backgroundColor: "rgba(15, 23, 42, 0.85)",
          zIndex: 2,
        },
      },
      "Foreground copy",
    ),
  ]);

  const render = await deck.render();
  const renderDiagnostics = render.diagnostics.items
    .map((item) => {
      const labels = item.labels?.map((label) => `${label.path}: ${label.message}`).join("; ");
      const notes = item.notes?.join("; ");
      return [item.code, labels, notes].filter(Boolean).join(" | ");
    })
    .join("\n");
  assert(
    render.ok,
    `deckjsx render failed: ${render.diagnostics.items
      .map((item) => item.code)
      .join(", ")}${renderDiagnostics ? `\n${renderDiagnostics}` : ""}`,
  );
  assert(render.artifact?.bytes.byteLength > 0, "deckjsx render did not return artifact bytes");
  await writeFile(directPath, render.artifact.bytes);
}

async function writePptxGenJsOracle() {
  const pptx = new pptxgen();
  pptx.author = "deckjsx";
  pptx.subject = "PPTX generation regression oracle";
  pptx.title = "PPTX generation regression oracle";
  pptx.company = "deckjsx";
  pptx.lang = "en-US";
  pptx.defineLayout({ name: "DECKJSX_ORACLE", width: 10, height: 5.625 });
  pptx.layout = "DECKJSX_ORACLE";

  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addText("Migration oracle", {
    x: 1,
    y: 0.8,
    w: 4.8,
    h: 0.6,
    fontSize: 28,
    color: "111827",
    margin: 0,
  });
  slide.addText("direct writer regression fixture", {
    x: 1,
    y: 1.55,
    w: 5.8,
    h: 0.55,
    fontSize: 16,
    color: "334155",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 1.5,
    y: 2.35,
    w: 2.2,
    h: 1.1,
    fill: { color: "F97316" },
    line: { color: "1D4ED8", width: 1.5 },
    radius: 0.1,
  });
  slide.addImage({ data: pngData, x: 6.9, y: 1.45, w: 1.2, h: 1.2 });

  const linkedSlide = pptx.addSlide();
  linkedSlide.background = { color: "FFFFFF" };
  linkedSlide.addText("Linked docs", {
    x: 0.9,
    y: 0.9,
    w: 3.6,
    h: 0.55,
    fontSize: 20,
    color: "2563EB",
    margin: 0,
    hyperlink: { url: "https://example.com/deckjsx" },
  });
  linkedSlide.addShape(pptx.ShapeType.rect, {
    x: 0.9,
    y: 1.8,
    w: 2.5,
    h: 0.8,
    fill: { color: "DBEAFE" },
    line: { color: "2563EB", width: 1 },
  });

  const paintOrderSlide = pptx.addSlide();
  paintOrderSlide.background = { color: "FFFFFF" };
  paintOrderSlide.addText("Back layer", {
    x: 1,
    y: 2.5,
    w: 3,
    h: 0.45,
    fontSize: 18,
    color: "111827",
    margin: 0,
  });
  paintOrderSlide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 1.55,
    w: 2.4,
    h: 0.7,
    fill: { color: "16A34A" },
    line: { color: "16A34A", transparency: 100 },
  });
  paintOrderSlide.addText("Middle layer", {
    x: 1,
    y: 1.65,
    w: 3,
    h: 0.45,
    fontSize: 18,
    color: "111827",
    margin: 0,
  });
  paintOrderSlide.addText("Front layer", {
    x: 1,
    y: 0.8,
    w: 3,
    h: 0.45,
    fontSize: 18,
    color: "111827",
    margin: 0,
  });

  const richTextSlide = pptx.addSlide();
  richTextSlide.background = { color: "FFFFFF" };
  richTextSlide.addText("Rich text oracle", {
    x: 0.9,
    y: 0.75,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  richTextSlide.addText(
    [
      { text: "Migration ", options: { color: "334155" } },
      { text: "bold red", options: { color: "DC2626", bold: true } },
      { text: " signal", options: { color: "334155" } },
    ],
    { x: 0.9, y: 1.55, w: 6.8, h: 0.8, fontSize: 20, margin: 0 },
  );

  const effectsSlide = pptx.addSlide();
  effectsSlide.background = { color: "FFFFFF" };
  effectsSlide.addText("Effects oracle", {
    x: 0.9,
    y: 0.75,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  effectsSlide.addShape(pptx.ShapeType.rect, {
    x: 1.2,
    y: 1.65,
    w: 2.8,
    h: 1.1,
    rotate: 15,
    fill: { color: "7C3AED", transparency: 35 },
    line: { color: "0F172A", width: 2, transparency: 20, dashType: "sysDot" },
  });

  const cropSlide = pptx.addSlide();
  cropSlide.background = { color: "FFFFFF" };
  cropSlide.addText("Image crop oracle", {
    x: 0.9,
    y: 0.75,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  cropSlide.addImage({
    data: wideSvgData,
    x: 1.2,
    y: 1.6,
    w: 2.4,
    h: 1.2,
    sizing: { type: "crop", x: 0.1, y: 0, w: 1.7, h: 0.7 },
  });

  const shadowSlide = pptx.addSlide();
  shadowSlide.background = { color: "FFFFFF" };
  shadowSlide.addText("Shadow oracle", {
    x: 0.9,
    y: 0.75,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  shadowSlide.addShape(pptx.ShapeType.rect, {
    x: 1.2,
    y: 1.65,
    w: 2.8,
    h: 1.1,
    fill: { color: "DBEAFE" },
    line: { color: "1D4ED8", width: 1 },
    shadow: { type: "outer", color: "2563EB", opacity: 0.45, blur: 7.5, angle: 45, offset: 6.4 },
  });

  const textBodySlide = pptx.addSlide();
  textBodySlide.background = { color: "FFFFFF" };
  textBodySlide.addText("Text body oracle", {
    x: 0.9,
    y: 0.55,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  textBodySlide.addText("RTL text", {
    x: 0.9,
    y: 1.2,
    w: 2.8,
    h: 0.5,
    fontSize: 18,
    color: "334155",
    rtlMode: true,
    margin: 0,
  });
  textBodySlide.addText("Super", {
    x: 0.9,
    y: 1.9,
    w: 2.8,
    h: 0.5,
    fontSize: 18,
    superscript: true,
    margin: 0,
  });
  textBodySlide.addText("Sub", {
    x: 0.9,
    y: 2.6,
    w: 2.8,
    h: 0.5,
    fontSize: 18,
    subscript: true,
    margin: 0,
  });
  textBodySlide.addText("Decorated", {
    x: 4.2,
    y: 1.2,
    w: 2.8,
    h: 0.5,
    fontSize: 18,
    underline: { style: "wavy", color: "FF6347" },
    margin: 0,
  });
  textBodySlide.addText("Bullet item", {
    x: 4.2,
    y: 1.9,
    w: 3,
    h: 0.5,
    fontSize: 18,
    bullet: { characterCode: "25E6" },
    margin: 0,
  });
  textBodySlide.addText("Number item", {
    x: 4.2,
    y: 2.6,
    w: 3,
    h: 0.5,
    fontSize: 18,
    bullet: { type: "number", style: "romanUcPeriod", startAt: 3 },
    margin: 0,
  });

  const paragraphSlide = pptx.addSlide();
  paragraphSlide.background = { color: "FFFFFF" };
  paragraphSlide.addText("Paragraph oracle", {
    x: 0.9,
    y: 0.55,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  paragraphSlide.addText("Vertical text", {
    x: 0.9,
    y: 1.25,
    w: 1,
    h: 2,
    fontSize: 18,
    vert: "vert270",
    margin: 0,
  });
  paragraphSlide.addText("Alpha\tBeta\tGamma", {
    x: 2.4,
    y: 1.25,
    w: 5,
    h: 1,
    fontSize: 18,
    tabStops: [
      { position: 0.5, alignment: "l" },
      { position: 1.5, alignment: "ctr" },
      { position: 1.5, alignment: "dec" },
    ],
    margin: 0,
  });
  paragraphSlide.addText("Line spacing points", {
    x: 0.9,
    y: 3.6,
    w: 2.4,
    h: 0.45,
    fontSize: 16,
    lineSpacing: 28,
    margin: 0,
  });
  paragraphSlide.addText("Line spacing multiple", {
    x: 3.4,
    y: 3.6,
    w: 2.6,
    h: 0.45,
    fontSize: 16,
    lineSpacingMultiple: 1.5,
    margin: 0,
  });
  paragraphSlide.addText("Paragraph spacing", {
    x: 6.2,
    y: 3.6,
    w: 2.6,
    h: 0.45,
    fontSize: 16,
    paraSpaceBefore: 12,
    paraSpaceAfter: 18,
    margin: 0,
  });
  paragraphSlide.addText("Spaced text", {
    x: 0.9,
    y: 4.25,
    w: 2.6,
    h: 0.45,
    fontSize: 16,
    charSpacing: 1.5,
    margin: 0,
  });
  paragraphSlide.addText("Fit shrink", {
    x: 3.6,
    y: 4.25,
    w: 1.6,
    h: 0.45,
    fontSize: 16,
    fit: "shrink",
    margin: 0,
  });
  paragraphSlide.addText("Fit resize", {
    x: 5.3,
    y: 4.25,
    w: 1.6,
    h: 0.45,
    fontSize: 16,
    fit: "resize",
    margin: 0,
  });
  paragraphSlide.addText("Middle", {
    x: 7,
    y: 4.05,
    w: 1.4,
    h: 0.8,
    fontSize: 16,
    valign: "middle",
    margin: 0,
  });
  paragraphSlide.addText("Bottom", {
    x: 8.5,
    y: 4.05,
    w: 1.2,
    h: 0.8,
    fontSize: 16,
    valign: "bottom",
    margin: 0,
  });
  paragraphSlide.addText("Padded text", {
    x: 6.7,
    y: 3.05,
    w: 2.4,
    h: 0.45,
    fontSize: 16,
    margin: [6, 12, 6, 12],
  });
  paragraphSlide.addText("Center", {
    x: 3.6,
    y: 3.05,
    w: 1.5,
    h: 0.45,
    fontSize: 16,
    align: "center",
    margin: 0,
  });
  paragraphSlide.addText("Right", {
    x: 5.2,
    y: 3.05,
    w: 1.3,
    h: 0.45,
    fontSize: 16,
    align: "right",
    margin: 0,
  });
  paragraphSlide.addText("Just", {
    x: 9.05,
    y: 3.05,
    w: 0.9,
    h: 0.45,
    fontSize: 16,
    align: "justify",
    margin: 0,
  });

  const imageEffectsSlide = pptx.addSlide();
  imageEffectsSlide.background = { color: "FFFFFF" };
  imageEffectsSlide.addText("Image effects oracle", {
    x: 0.9,
    y: 0.75,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  imageEffectsSlide.addImage({
    data: wideSvgData,
    x: 1.2,
    y: 1.75,
    w: 2.6,
    h: 1.3,
    rotate: 12,
    flipH: true,
    flipV: true,
    transparency: 40,
  });

  const imageUnderlaySlide = pptx.addSlide();
  imageUnderlaySlide.background = { color: "FFFFFF" };
  imageUnderlaySlide.addImage({
    data: wideSvgData,
    x: 0.6,
    y: 0.7,
    w: 5.2,
    h: 2.6,
    sizing: { type: "crop", x: 0, y: 0, w: 5.2, h: 2.6 },
  });
  imageUnderlaySlide.addText("Image underlay oracle", {
    x: 0.9,
    y: 0.75,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    color: "111827",
    margin: 0,
  });
  imageUnderlaySlide.addText("Foreground copy", {
    x: 0.9,
    y: 1.55,
    w: 4.8,
    h: 0.65,
    fontSize: 18,
    color: "FFFFFF",
    fill: { color: "0F172A", transparency: 15 },
    margin: 0,
  });

  await pptx.writeFile({ fileName: oraclePath });
}

async function loadZip(path) {
  return unzipSync(new Uint8Array(await readFile(path)));
}

async function main() {
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all([writeDirectDeck(), writePptxGenJsOracle()]);

  const [directZip, oracleZip] = await Promise.all([loadZip(directPath), loadZip(oraclePath)]);

  requiredPackageAssertions("deckjsx direct writer", directZip);
  requiredPackageAssertions("pptxgenjs oracle", oracleZip);
  semanticAssertions("deckjsx direct writer", directZip);
  semanticAssertions("pptxgenjs oracle", oracleZip);

  const report = {
    status: "passed",
    direct: {
      path: directPath,
      entries: Object.keys(directZip).length,
      slides: slidePaths(directZip).length,
      relationships: relationshipPaths(directZip).length,
    },
    oracle: {
      path: oraclePath,
      entries: Object.keys(oracleZip).length,
      slides: slidePaths(oracleZip).length,
      relationships: relationshipPaths(oracleZip).length,
    },
    assertions: [
      "required package entries",
      "presentation and slide content types",
      "slide count",
      "title/body text",
      "1in EMU geometry signal",
      "accent fill color",
      "image relationship",
      "external hyperlink relationship",
      "paint-order z-index signal",
      "rich text run color and bold signal",
      "rotation transparency and dashed stroke signals",
      "image crop source-rect signal",
      "outer shadow signal",
      "text body semantics signal",
      "paragraph text layout signal",
      "paragraph spacing signal",
      "character spacing signal",
      "text fit and vertical alignment signal",
      "text body inset signal",
      "paragraph alignment signal",
      "image rotation flip and transparency signals",
      "image underlay relationship and foreground drawing order",
    ],
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PPTX generation regression oracle passed. Report: ${reportPath}`);
}

await main();

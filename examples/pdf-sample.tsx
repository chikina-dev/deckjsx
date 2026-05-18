import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { Deck, Shape, Slide, Text, View, createElement } from "../src/index.ts";

void createElement;

type Metric = {
  label: string;
  value: string;
  note: string;
  color: string;
};

const slideSize = { width: 13.333, height: 7.5, unit: "in" as const };

const metrics: Metric[] = [
  { label: "Revenue", value: "$12.4M", note: "+18% YoY", color: "#2563EB" },
  { label: "Retention", value: "94%", note: "+3 pts", color: "#16A34A" },
  { label: "Pipeline", value: "$31M", note: "2.5x coverage", color: "#F59E0B" },
];

export async function writeSampleDeck(output = "examples/output/deckjsx-sample.pptx") {
  const deck = new Deck({
    layout: slideSize,
    meta: { title: "deckjsx Sample Report", author: "deckjsx" },
  });

  deck.add(({ slideIndex, totalSlides }) => (
    <Slide name="Title" style={{ backgroundColor: "#F8FAFC" }}>
      <Shape shape="rect" style={{ x: 0.7, y: 0.65, width: 0.12, height: 5.8, fill: "#2563EB" }} />
      <Text
        style={{
          x: 1,
          y: 0.85,
          width: 10.5,
          height: 0.8,
          fontFamily: "Aptos Display",
          fontSize: 36,
          fontWeight: 700,
          color: "#0F172A",
        }}
      >
        deckjsx Sample Report
      </Text>
      <Text style={{ x: 1.03, y: 1.8, width: 8.7, height: 0.5, fontSize: 18, color: "#475569" }}>
        JSX authoring, compiler IR, and PPTX output in one small example.
      </Text>
      <View
        style={{
          x: 1,
          y: 3.1,
          width: 10.8,
          height: 2,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          columnGap: 0.25,
        }}
      >
        {metrics.map((metric) => (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              border: "1pt solid #CBD5E1",
              borderRadius: 0.1,
              padding: 0.28,
            }}
          >
            <Text
              style={{ x: 0.28, y: 0.25, width: 2.8, height: 0.25, fontSize: 11, color: "#64748B" }}
            >
              {metric.label}
            </Text>
            <Text
              style={{ x: 0.28, y: 0.65, width: 2.8, height: 0.45, fontSize: 25, fontWeight: 700 }}
            >
              {metric.value}
            </Text>
            <Text
              style={{
                x: 0.28,
                y: 1.25,
                width: 2.8,
                height: 0.28,
                fontSize: 13,
                color: metric.color,
              }}
            >
              {metric.note}
            </Text>
          </View>
        ))}
      </View>
      <Text
        style={{
          x: 11.2,
          y: 7,
          width: 1.4,
          height: 0.25,
          fontSize: 9,
          color: "#64748B",
          textAlign: "right",
        }}
      >
        {slideIndex + 1} / {totalSlides}
      </Text>
    </Slide>
  ));

  deck.add(({ slideIndex, totalSlides }) => (
    <Slide name="Takeaways" style={{ backgroundColor: "#FFFFFF" }}>
      <Text
        style={{
          x: 0.75,
          y: 0.6,
          width: 8.5,
          height: 0.55,
          fontSize: 26,
          fontWeight: 700,
          color: "#0F172A",
        }}
      >
        Takeaways
      </Text>
      <View
        style={{
          x: 0.75,
          y: 1.45,
          width: 11.8,
          height: 4.9,
          display: "flex",
          flexDirection: "column",
          rowGap: 0.28,
        }}
      >
        {[
          "Write slides as typed TSX instead of imperative drawing calls.",
          "Use View, Text, Shape, and CSS-like style objects for layout.",
          "Emit PPTX through the pptxgenjs backend, then convert externally when PDF fidelity is required.",
        ].map((item, index) => (
          <View
            style={{
              backgroundColor: "#F8FAFC",
              border: "1pt solid #E2E8F0",
              padding: 0.22,
              height: 1.15,
            }}
          >
            <Text
              style={{
                x: 0.2,
                y: 0.18,
                width: 0.35,
                height: 0.35,
                fontSize: 16,
                fontWeight: 700,
                color: "#2563EB",
              }}
            >
              {index + 1}
            </Text>
            <Text
              style={{ x: 0.75, y: 0.2, width: 9.8, height: 0.55, fontSize: 17, color: "#334155" }}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>
      <Text
        style={{
          x: 11.2,
          y: 7,
          width: 1.4,
          height: 0.25,
          fontSize: 9,
          color: "#64748B",
          textAlign: "right",
        }}
      >
        {slideIndex + 1} / {totalSlides}
      </Text>
    </Slide>
  ));

  await deck.output({ backend: "pptxgenjs", output });
}

type PdfPage = {
  title: string;
  commands: string[];
};

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function hexToRgb(color: string) {
  const value = color.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function pdfColor(color: string) {
  return hexToRgb(color)
    .map((part) => part.toFixed(3))
    .join(" ");
}

function rect(x: number, y: number, width: number, height: number, fill: string, stroke?: string) {
  const draw = stroke ? "B" : "f";
  const strokeColor = stroke ? `${pdfColor(stroke)} RG\n` : "";
  return `q\n${pdfColor(fill)} rg\n${strokeColor}${x} ${y} ${width} ${height} re ${draw}\nQ`;
}

function text(x: number, y: number, value: string, size: number, color = "#0F172A", bold = false) {
  const font = bold ? "F2" : "F1";
  return `BT\n/${font} ${size} Tf\n${pdfColor(color)} rg\n${x} ${y} Td\n(${escapePdfText(value)}) Tj\nET`;
}

function buildSamplePdfPages(): PdfPage[] {
  const width = Math.round(slideSize.width * 72);
  const height = Math.round(slideSize.height * 72);
  const top = (inches: number) => height - inches * 72;

  const metricCommands = metrics.flatMap((metric, index) => {
    const x = 72 + index * 258;
    const y = top(5.05);
    return [
      rect(x, y, 230, 118, "#FFFFFF", "#CBD5E1"),
      text(x + 20, y + 88, metric.label, 11, "#64748B"),
      text(x + 20, y + 48, metric.value, 26, "#0F172A", true),
      text(x + 20, y + 22, metric.note, 13, metric.color),
    ];
  });

  return [
    {
      title: "Title",
      commands: [
        rect(0, 0, width, height, "#F8FAFC"),
        rect(50, top(6.45), 9, 418, "#2563EB"),
        text(72, top(1.45), "deckjsx Sample Report", 36, "#0F172A", true),
        text(
          74,
          top(2.18),
          "JSX authoring, compiler IR, and PPTX output in one small example.",
          18,
          "#475569",
        ),
        ...metricCommands,
        text(830, 28, "1 / 2", 9, "#64748B"),
      ],
    },
    {
      title: "Takeaways",
      commands: [
        rect(0, 0, width, height, "#FFFFFF"),
        text(54, top(1.15), "Takeaways", 26, "#0F172A", true),
        ...[
          "Write slides as typed TSX instead of imperative drawing calls.",
          "Use View, Text, Shape, and CSS-like style objects for layout.",
          "Emit PPTX through the pptxgenjs backend, then convert externally when PDF fidelity is required.",
        ].flatMap((item, index) => {
          const y = top(2.5 + index * 1.35);
          return [
            rect(54, y, 850, 83, "#F8FAFC", "#E2E8F0"),
            text(76, y + 49, String(index + 1), 16, "#2563EB", true),
            text(122, y + 50, item, 17, "#334155"),
          ];
        }),
        text(830, 28, "2 / 2", 9, "#64748B"),
      ],
    },
  ];
}

function createPdf(pages: PdfPage[]) {
  const width = Math.round(slideSize.width * 72);
  const height = Math.round(slideSize.height * 72);
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  for (const page of pages) {
    const content = [`% ${page.title}`, ...page.commands].join("\n");
    const contentId = objects.length + 1;
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    );
    const pageId = objects.length + 1;
    pageObjectIds.push(pageId);
    objects.push(
      [
        "<< /Type /Page",
        "/Parent 2 0 R",
        `/MediaBox [0 0 ${width} ${height}]`,
        "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>",
        `/Contents ${contentId} 0 R`,
        ">>",
      ].join(" "),
    );
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.from(chunks.join(""), "utf8");
}

export async function writeSamplePdf(output = "examples/output/deckjsx-sample.pdf") {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, createPdf(buildSamplePdfPages()));
}

export async function writeSampleOutputs() {
  await writeSampleDeck();
  await writeSamplePdf();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeSampleOutputs();
}

//#region profile:authoring-root-import
import { Deck, StyleSheet, Theme } from "deckjsx";

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
deck.useStyles(new StyleSheet({ classes: {} }));

const theme = new Theme({ defaults: {} });
void theme;
void deck;
//#endregion profile:authoring-root-import

//#region profile:authoring-surface
import { Deck, StyleSheet, Theme } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const theme = new Theme({
  colors: {
    accent: "#2563EB",
    text: "#0F172A",
  },
  defaults: {
    div: { display: "flex", flexDirection: "column", gap: 0.18 },
    h1: { fontSize: 30, fontWeight: 700, color: "#0F172A" },
    p: { fontSize: 16, lineHeight: 1.25, color: "#334155" },
    span: { color: "#2563EB", fontWeight: 700 },
    img: { objectFit: "contain" },
    table: { tableLayout: "fixed", borderCollapse: "collapse" },
    td: { padding: 0.08, verticalAlign: "middle" },
  },
});

const styles = theme.defineStyles((currentTheme) => ({
  classes: {
    title: {
      target: "h1.title",
      style: { color: currentTheme.colors.text },
    },
    value: {
      target: "span.value",
      style: { color: currentTheme.colors.accent },
    },
  },
}));

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  theme,
}).useStyles(new StyleSheet({
  classes: {
    slide: {
      target: "div.slide",
      style: { backgroundColor: "#F8FAFC", padding: 0.35 },
    },
    copy: {
      target: "section.copy",
      style: { backgroundColor: "#FFFFFF", padding: 0.16 },
    },
    chart: {
      target: "figure.chart",
      style: { borderRadius: 0.08, padding: 0.16 },
    },
    table: {
      target: "table.table",
      style: { tableLayout: "fixed" },
    },
  },
})).useStyles(styles);

deck.slide({ name: "Authoring Perf", className: "slide" }, () => (
  <div
    className="slide"
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "auto 1fr auto",
      gap: 0.24,
    }}
  >
    <h1 className="title" style={{ gridColumn: "1 / span 2" }}>
      Quarterly revenue <span className="value">+12%</span>
    </h1>
    <section className="copy" style={{ display: "flex", flexDirection: "column", gap: 0.16 }}>
      <p>
        Enterprise expansion improved with <span className="value">higher retention</span>.
      </p>
      <p style={{ textAlign: "left", marginTop: 0.08 }}>
        Normal flow remains the default; absolute positioning is explicit.
      </p>
      <shape shape="roundRect" className="badge" style={{ fill: "#DBEAFE" }} />
    </section>
    <figure className="chart">
      <img className="logo" src="chart.png" style={{ width: 1.1, height: 0.35 }} />
    </figure>
    <table className="table" style={{ gridColumn: "1 / span 2" }}>
      <tbody>
        <tr>
          <th>Segment</th>
          <th>ARR</th>
          <th>Growth</th>
        </tr>
        <tr>
          <td>Enterprise</td>
          <td>$12.4M</td>
          <td>
            <span className="value">18%</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
));

const result = deck.render(pptx());
void result;
//#endregion profile:authoring-surface

//#region profile:node-authoring-consumer
import { write } from "@deckjsx/node";
import { Deck, StyleSheet, Theme } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const theme = new Theme({
  colors: {
    accent: "#2563EB",
    text: "#0F172A",
  },
  defaults: {
    div: { display: "flex", flexDirection: "column", gap: 0.18 },
    h1: { color: "#0F172A", fontSize: 28 },
    p: { color: "#334155", fontSize: 15 },
    img: { objectFit: "contain" },
  },
});

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  theme,
}).useStyles(new StyleSheet({
  classes: {
    slide: {
      target: "div.slide",
      style: { backgroundColor: "#F8FAFC", padding: 0.35 },
    },
    metric: {
      target: "section.metric",
      style: { display: "flex", flexDirection: "column", gap: 0.08 },
    },
  },
}));

deck.slide({ name: "Node Authoring Consumer" }, () => (
  <div
    className="slide"
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 0.24,
    }}
  >
    <h1 style={{ gridColumn: "1 / span 2" }}>
      Node writer authoring fixture
    </h1>
    <section className="metric">
      <p>Pipeline uses normal flow by default.</p>
      <img src="./logo.png" style={{ width: 1.2, height: 0.4 }} />
    </section>
    <section className="metric">
      <p>File output is handled by @deckjsx/node.</p>
      <shape shape="roundRect" style={{ fill: "#DBEAFE" }} />
    </section>
  </div>
));

const result = write(await deck.render(pptx()), "out.pptx");
void result;
//#endregion profile:node-authoring-consumer

//#region profile:published-deck-import
import { Deck } from "deckjsx";

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
void deck;
//#endregion profile:published-deck-import

//#region profile:published-root-import
import { Deck, StyleSheet, Theme } from "deckjsx";

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
deck.useStyles(new StyleSheet({ classes: {} }));

const theme = new Theme({ defaults: {} });

void deck;
void theme;
//#endregion profile:published-root-import

//#region profile:published-style-subpath
import type {
  CssGridTemplate,
  ImageStyle,
  ShapeStyle,
  TableStyle,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "deckjsx/style";
import { StyleSheet, Theme } from "deckjsx/style";

const gridTemplate = "auto 1fr auto" satisfies CssGridTemplate;
void gridTemplate;

const viewStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gridTemplateRows: gridTemplate,
  gap: 0.24,
  padding: "0.25in 0.35in",
} satisfies ViewStyle;
void viewStyle;

const textStyle = {
  fontSize: 24,
  lineHeight: 1.2,
  textAlign: "left",
} satisfies TextStyle;
void textStyle;

const textRunStyle = {
  color: "#2563EB",
  fontWeight: 700,
} satisfies TextRunStyle;
void textRunStyle;

const imageStyle = {
  objectFit: "cover",
  objectPosition: "right 25% bottom 10%",
} satisfies ImageStyle;
void imageStyle;

const shapeStyle = {
  fill: "linear-gradient(180deg, #DBEAFE 0%, #BFDBFE 100%)",
  stroke: "1pt solid #2563EB",
} satisfies ShapeStyle;
void shapeStyle;

const tableStyle = {
  tableLayout: "fixed",
} satisfies TableStyle;
void tableStyle;

const theme = new Theme({ defaults: { p: { fontSize: 18 } } });
const sheet = new StyleSheet({ classes: {} });
void theme;
void sheet;
//#endregion profile:published-style-subpath

//#region profile:source-style-subpath
import type {
  CssGridTemplate,
  ImageStyle,
  ShapeStyle,
  TableStyle,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "deckjsx/style";
import { StyleSheet, Theme } from "deckjsx/style";

const gridTemplate = "auto 1fr auto" satisfies CssGridTemplate;
void gridTemplate;

const viewStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gridTemplateRows: gridTemplate,
  gap: 0.24,
  padding: "0.25in 0.35in",
} satisfies ViewStyle;
void viewStyle;

const textStyle = {
  fontSize: 24,
  lineHeight: 1.2,
  textAlign: "left",
} satisfies TextStyle;
void textStyle;

const textRunStyle = {
  color: "#2563EB",
  fontWeight: 700,
} satisfies TextRunStyle;
void textRunStyle;

const imageStyle = {
  objectFit: "cover",
  objectPosition: "right 25% bottom 10%",
} satisfies ImageStyle;
void imageStyle;

const shapeStyle = {
  fill: "linear-gradient(180deg, #DBEAFE 0%, #BFDBFE 100%)",
  stroke: "1pt solid #2563EB",
} satisfies ShapeStyle;
void shapeStyle;

const tableStyle = {
  tableLayout: "fixed",
} satisfies TableStyle;
void tableStyle;

const theme = new Theme({ defaults: { p: { fontSize: 18 } } });
const sheet = new StyleSheet({ classes: {} });
void theme;
void sheet;
//#endregion profile:source-style-subpath

//#region profile:source-style-types-only
import type {
  CssGridTemplate,
  ImageStyle,
  ShapeStyle,
  TableStyle,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "deckjsx/style";

const gridTemplate = "auto 1fr auto" satisfies CssGridTemplate;
void gridTemplate;

const viewStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gridTemplateRows: gridTemplate,
  gap: 0.24,
  padding: "0.25in 0.35in",
} satisfies ViewStyle;
void viewStyle;

const textStyle = {
  fontSize: 24,
  lineHeight: 1.2,
  textAlign: "left",
} satisfies TextStyle;
void textStyle;

const textRunStyle = {
  color: "#2563EB",
  fontWeight: 700,
} satisfies TextRunStyle;
void textRunStyle;

const imageStyle = {
  objectFit: "cover",
  objectPosition: "right 25% bottom 10%",
} satisfies ImageStyle;
void imageStyle;

const shapeStyle = {
  fill: "linear-gradient(180deg, #DBEAFE 0%, #BFDBFE 100%)",
  stroke: "1pt solid #2563EB",
} satisfies ShapeStyle;
void shapeStyle;

const tableStyle = {
  tableLayout: "fixed",
} satisfies TableStyle;
void tableStyle;
//#endregion profile:source-style-types-only

//#region profile:source-style-values-only
import { StyleSheet, Theme } from "deckjsx/style";

const theme = new Theme({ defaults: { p: { fontSize: 18 } } });
const sheet = new StyleSheet({ classes: {} });
void theme;
void sheet;
//#endregion profile:source-style-values-only

//#region profile:source-stylesheet
import { StyleSheet, Theme } from "deckjsx/style";

const sheet = new StyleSheet({
  classes: {
    card: {
      target: "div.card",
      style: { backgroundColor: "#FFFFFF", border: "1pt solid #CBD5E1", padding: 0.2 },
    },
    title: {
      target: ["h1.title", "p.title"],
      style: { color: "#0F172A", fontSize: 28 },
    },
    value: {
      target: "span.value",
      style: { color: "#2563EB", fontWeight: 700 },
    },
    logo: {
      target: "img.logo",
      style: { width: 1.1, height: 0.35, objectFit: "contain" },
    },
    metrics: {
      target: "table.metrics",
      style: { tableLayout: "fixed", borderCollapse: "collapse" },
    },
  },
});
void sheet;

const theme = new Theme({
  colors: {
    accent: "#2563EB",
    text: "#0F172A",
  },
  defaults: {
    h1: { color: "#0F172A", fontSize: 30 },
    p: { color: "#334155", fontSize: 16 },
    span: { color: "#2563EB" },
    img: { objectFit: "contain" },
    table: { tableLayout: "fixed" },
    td: { padding: 0.08 },
  },
});

const themedSheet = theme.defineStyles((currentTheme) => ({
  classes: {
    title: { target: "h1.title", style: { color: currentTheme.colors.text } },
    value: { target: "span.value", style: { color: currentTheme.colors.accent } },
  },
}));
void themedSheet;
//#endregion profile:source-stylesheet

//#region profile:published-stylesheet
import { StyleSheet, Theme } from "deckjsx";

const sheet = new StyleSheet({
  classes: {
    card: {
      target: "div.card",
      style: { backgroundColor: "#FFFFFF", border: "1pt solid #CBD5E1", padding: 0.2 },
    },
    title: {
      target: ["h1.title", "p.title"],
      style: { color: "#0F172A", fontSize: 28 },
    },
    value: {
      target: "span.value",
      style: { color: "#2563EB", fontWeight: 700 },
    },
    logo: {
      target: "img.logo",
      style: { width: 1.1, height: 0.35, objectFit: "contain" },
    },
    metrics: {
      target: "table.metrics",
      style: { tableLayout: "fixed", borderCollapse: "collapse" },
    },
  },
});
void sheet;

const theme = new Theme({
  colors: {
    accent: "#2563EB",
    text: "#0F172A",
  },
  defaults: {
    h1: { color: "#0F172A", fontSize: 30 },
    p: { color: "#334155", fontSize: 16 },
    span: { color: "#2563EB" },
    img: { objectFit: "contain" },
    table: { tableLayout: "fixed" },
    td: { padding: 0.08 },
  },
});

const themedSheet = theme.defineStyles((currentTheme) => ({
  classes: {
    title: { target: "h1.title", style: { color: currentTheme.colors.text } },
    value: { target: "span.value", style: { color: currentTheme.colors.accent } },
  },
}));
void themedSheet;
//#endregion profile:published-stylesheet

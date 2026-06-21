import { write } from "@deckjsx/node";
import { Deck, StyleSheet } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "deckjsx interactive dev sample", author: "deckjsx" },
});

deck.useStyles(
  new StyleSheet({
    classes: {
      slide: {
        backgroundColor: "#F8FAFC",
        color: "#111827",
        fontSize: 18,
      },
      title: {
        target: "p.title",
        style: { color: "#0F172A", fontSize: 34, fontWeight: 700 },
      },
      eyebrow: {
        target: "p.eyebrow",
        style: { color: "#0F766E", fontSize: 11, fontWeight: 700, letterSpacing: 0 },
      },
      card: {
        target: "div.card",
        style: {
          backgroundColor: "#FFFFFF",
          border: "1pt solid #CBD5E1",
          borderRadius: 8,
        },
      },
      selected: {
        target: ".selected",
        style: {
          backgroundColor: "#ECFDF5",
          border: "1.5pt solid #0F766E",
        },
      },
      metricLabel: {
        target: ".metricLabel",
        style: { color: "#475569", fontSize: 12 },
      },
      metricValue: {
        target: ".metricValue",
        style: { color: "#0F172A", fontSize: 30, fontWeight: 700 },
      },
      positive: {
        target: ".positive",
        style: { color: "#047857", fontWeight: 700 },
      },
      warning: {
        target: ".warning",
        style: { color: "#B45309", fontWeight: 700 },
      },
      muted: {
        target: ".muted",
        style: { color: "#64748B", fontSize: 12 },
      },
      pill: {
        target: ".pill",
        style: {
          backgroundColor: "#E0F2FE",
          color: "#075985",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 6,
        },
      },
    },
  }),
);

type MetricCardProps = {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly tone: "positive" | "warning";
  readonly selected?: boolean;
};

type CommandChipProps = {
  readonly command: string;
  readonly note: string;
};

function MetricCard({ label, value, delta, tone, selected = false }: MetricCardProps) {
  return (
    <div className={["card", { selected }]} style={{ width: 2.45, height: 1.35, padding: 0.18 }}>
      <p className="metricLabel" style={{ x: 0.18, y: 0.16, width: 2.05, height: 0.22 }}>
        {label}
      </p>
      <p className="metricValue" style={{ x: 0.18, y: 0.43, width: 2.05, height: 0.48 }}>
        {value}
      </p>
      <p className={tone} style={{ x: 0.18, y: 0.98, width: 2.05, height: 0.24, fontSize: 12 }}>
        {delta}
      </p>
    </div>
  );
}

function CommandChip({ command, note }: CommandChipProps) {
  return (
    <div className="card" style={{ width: 2.05, height: 0.58, padding: 0.12 }}>
      <p style={{ x: 0.12, y: 0.08, width: 1.8, height: 0.2, fontSize: 13, color: "#0369A1" }}>
        {command}
      </p>
      <p className="muted" style={{ x: 0.12, y: 0.31, width: 1.8, height: 0.18 }}>
        {note}
      </p>
    </div>
  );
}

function Header({ title, section }: { readonly title: string; readonly section: string }) {
  return (
    <>
      <p className="eyebrow" style={{ x: 0.58, y: 0.38, width: 3.5, height: 0.22 }}>
        {section}
      </p>
      <p className="title" style={{ x: 0.58, y: 0.66, width: 7.8, height: 0.5 }}>
        {title}
      </p>
    </>
  );
}

function StatusPanel() {
  return (
    <div className="card" style={{ x: 6.35, y: 1.28, width: 2.95, height: 2.48, padding: 0.22 }}>
      <p className="pill" style={{ x: 0.22, y: 0.2, width: 1.1, height: 0.28 }}>
        LIVE DEV
      </p>
      <p style={{ x: 0.22, y: 0.66, width: 2.42, height: 0.34, fontSize: 20, fontWeight: 700 }}>
        Update this file
      </p>
      <p className="muted" style={{ x: 0.22, y: 1.06, width: 2.36, height: 0.78 }}>
        Change a metric, className, or command chip and watch the dev console redraw without losing
        the prompt.
      </p>
      <p style={{ x: 0.22, y: 2.06, width: 2.36, height: 0.22, fontSize: 12, color: "#0F766E" }}>
        sample revision 2026-06-21
      </p>
    </div>
  );
}

deck.slide({ name: "Interactive Console", className: "slide" }, () => (
  <>
    <Header section="NODE DEV SAMPLE" title="Interactive console playground" />
    <div style={{ x: 0.58, y: 1.42, width: 2.45, height: 1.35 }}>
      <MetricCard
        label="Compilation"
        value="1.4s"
        delta="+ prompt survives reload"
        tone="positive"
        selected
      />
    </div>
    <div style={{ x: 3.18, y: 1.42, width: 2.45, height: 1.35 }}>
      <MetricCard label="Outputs" value="1 pptx" delta="patched in place" tone="positive" />
    </div>
    <div style={{ x: 0.58, y: 3.0, width: 2.05, height: 0.58 }}>
      <CommandChip command="status" note="compiler state" />
    </div>
    <div style={{ x: 2.78, y: 3.0, width: 2.05, height: 0.58 }}>
      <CommandChip command="component tree" note="component map" />
    </div>
    <div style={{ x: 4.98, y: 3.0, width: 2.05, height: 0.58 }}>
      <CommandChip command="style $0 color" note="cascade trace" />
    </div>
    <div style={{ x: 0.58, y: 3.82, width: 2.05, height: 0.58 }}>
      <CommandChip command="props inspect $0" note="component props" />
    </div>
    <div style={{ x: 2.78, y: 3.82, width: 2.05, height: 0.58 }}>
      <CommandChip command="projection" note="retained output" />
    </div>
    <div style={{ x: 4.98, y: 3.82, width: 2.05, height: 0.58 }}>
      <CommandChip command="history changes" note="last patch" />
    </div>
    <StatusPanel />
  </>
));

deck.slide({ name: "Cascade And Components", className: "slide" }, () => (
  <>
    <Header section="INSPECTOR TARGETS" title="Cascade and component signals" />
    <div
      className="card selected"
      style={{ x: 0.58, y: 1.4, width: 4.05, height: 2.95, padding: 0.28 }}
    >
      <p className="eyebrow" style={{ x: 0.28, y: 0.22, width: 2.1, height: 0.22 }}>
        SELECTABLE CARD
      </p>
      <p style={{ x: 0.28, y: 0.62, width: 3.35, height: 0.44, fontSize: 24, fontWeight: 700 }}>
        Style trace target
      </p>
      <p className="muted" style={{ x: 0.28, y: 1.22, width: 3.35, height: 0.66 }}>
        The selected class overrides the base card background and border. The nested text inherits
        defaults, then applies class and inline values.
      </p>
      <p className="positive" style={{ x: 0.28, y: 2.32, width: 3.35, height: 0.28, fontSize: 14 }}>
        Try selection, style, and props commands here.
      </p>
    </div>
    <div className="card" style={{ x: 5.05, y: 1.4, width: 4.05, height: 2.95, padding: 0.28 }}>
      <p className="eyebrow" style={{ x: 0.28, y: 0.22, width: 2.1, height: 0.22 }}>
        DIAGNOSTIC SURFACE
      </p>
      <p style={{ x: 0.28, y: 0.62, width: 3.35, height: 0.44, fontSize: 24, fontWeight: 700 }}>
        Reload target
      </p>
      <p className="muted" style={{ x: 0.28, y: 1.22, width: 3.35, height: 0.66 }}>
        Editing this text should show a concise Vite-like dev line and keep interactive input on the
        prompt row.
      </p>
      <p className="warning" style={{ x: 0.28, y: 2.32, width: 3.35, height: 0.28, fontSize: 14 }}>
        Change this line to test reload.
      </p>
    </div>
  </>
));

const output = await write(await deck.render(pptx()), "output-tsx.pptx");

console.log(`Wrote ${output.path} (${output.status})`);

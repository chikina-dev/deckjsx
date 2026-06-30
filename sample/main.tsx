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
      shell: {
        target: "main.shell",
        style: {
          width: "100%",
          height: "100%",
          padding: 0.58,
          display: "grid",
          gridTemplateRows: "0.78in 1fr",
          rowGap: 0.32,
        },
      },
      header: {
        target: "header.header",
        style: {
          display: "grid",
          gridTemplateRows: "0.18in 0.48in",
          rowGap: 0.06,
        },
      },
      title: {
        target: "h1.title",
        style: { color: "#0F172A", fontSize: 34, fontWeight: 700, height: 0.48 },
      },
      eyebrow: {
        target: "p.eyebrow",
        style: { color: "#0F766E", fontSize: 11, fontWeight: 700, letterSpacing: 0, height: 0.18 },
      },
      dashboard: {
        target: "section.dashboard",
        style: {
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          columnGap: 0.36,
        },
      },
      stack: {
        target: "section.stack",
        style: {
          display: "grid",
          gridTemplateRows: "1.3in 1.38in",
          rowGap: 0.3,
        },
      },
      metricGrid: {
        target: "section.metricGrid",
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 0.28,
        },
      },
      commandGrid: {
        target: "section.commandGrid",
        style: {
          display: "grid",
          gridTemplateColumns: ["1fr", "1fr", "1fr"],
          columnGap: 0.22,
          rowGap: 0.22,
        },
      },
      cardRow: {
        target: "section.cardRow",
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 0.42,
        },
      },
      card: {
        target: ["div.card", "aside.card"],
        style: {
          backgroundColor: "#FFFFFF",
          border: "1pt solid #CBD5E1",
          borderRadius: 8,
          padding: 0.22,
          display: "grid",
          rowGap: 0.12,
        },
      },
      selected: {
        target: "div.selected",
        style: {
          backgroundColor: "#ECFDF5",
          border: "1.5pt solid #0F766E",
        },
      },
      metricCard: {
        target: "div.metricCard",
        style: {
          height: 1.3,
          gridTemplateRows: ["0.2in", "0.44in", "0.24in"],
        },
      },
      metricLabel: {
        target: "p.metricLabel",
        style: { color: "#475569", fontSize: 12, height: 0.2 },
      },
      metricValue: {
        target: "p.metricValue",
        style: { color: "#0F172A", fontSize: 30, fontWeight: 700, height: 0.44 },
      },
      positive: {
        target: "p.positive",
        style: { color: "#047857", fontWeight: 700 },
      },
      warning: {
        target: "p.warning",
        style: { color: "#B45309", fontWeight: 700 },
      },
      muted: {
        target: "p.muted",
        style: { color: "#64748B", fontSize: 12 },
      },
      command: {
        target: "div.command",
        style: {
          height: 0.58,
          gridTemplateRows: "0.2in 0.18in",
          rowGap: 0.05,
        },
      },
      commandName: {
        target: "p.commandName",
        style: { color: "#0369A1", fontSize: 13, height: 0.2 },
      },
      pill: {
        target: "p.pill",
        style: {
          backgroundColor: "#E0F2FE",
          color: "#075985",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 6,
          padding: "0.05in 0.1in",
        },
      },
      statusPanel: {
        target: "aside.statusPanel",
        style: {
          gridTemplateRows: ["0.28in", "0.34in", "1fr", "0.22in"],
          height: 2.8,
        },
      },
      inspectorCard: {
        target: "div.inspectorCard",
        style: {
          height: 2.95,
          gridTemplateRows: ["0.18in", "0.44in", "1fr", "0.28in"],
        },
      },
    },
  }),
);

const slideStyle = {
  backgroundColor: "#F8FAFC",
} as const;

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
    <div className={["card", "metricCard", { selected }]}>
      <p className="metricLabel">{label}</p>
      <p className="metricValue">{value}</p>
      <p className={tone} style={{ fontSize: 12, height: 0.24 }}>
        {delta}
      </p>
    </div>
  );
}

function CommandChip({ command, note }: CommandChipProps) {
  return (
    <div className="card command">
      <p className="commandName">{command}</p>
      <p className="muted">{note}</p>
    </div>
  );
}

function Header({ title, section }: { readonly title: string; readonly section: string }) {
  return (
    <header className="header">
      <p className="eyebrow">{section}</p>
      <h1 className="title">{title}</h1>
    </header>
  );
}

function StatusPanel() {
  return (
    <aside className="card statusPanel">
      <p className="pill">LIVE DEV</p>
      <h2 style={{ height: 0.34, fontSize: 20, fontWeight: 700 }}>Update this file</h2>
      <p className="muted">
        Change a metric, className, or command chip and watch the dev console redraw without losing
        the prompt.
      </p>
      <p style={{ height: 0.22, fontSize: 12, color: "#0F766E" }}>
        sample revision 2026-06-28
      </p>
    </aside>
  );
}

function InspectorCard({
  eyebrow,
  title,
  body,
  footer,
  tone,
  selected = false,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly footer: string;
  readonly tone: "positive" | "warning";
  readonly selected?: boolean;
}) {
  return (
    <div className={["card", "inspectorCard", { selected }]}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 style={{ height: 0.44, fontSize: 24, fontWeight: 700 }}>{title}</h2>
      <p className="muted">{body}</p>
      <p className={tone} style={{ height: 0.28, fontSize: 14 }}>
        {footer}
      </p>
    </div>
  );
}

deck.slide({ name: "Interactive Console", style: slideStyle }, () => (
  <main className="shell">
    <Header section="NODE DEV SAMPLE" title="Interactive console playground" />
    <section className="dashboard">
      <section className="stack">
        <section className="metricGrid">
          <MetricCard
            label="Compilation"
            value="1.4s"
            delta="+ prompt survives reload"
            tone="positive"
            selected
          />
          <MetricCard label="Outputs" value="1 pptx" delta="patched in place" tone="positive" />
        </section>
        <section className="commandGrid">
          <CommandChip command="status" note="compiler state" />
          <CommandChip command="component tree" note="component map" />
          <CommandChip command="style $0 color" note="cascade trace" />
          <CommandChip command="props inspect $0" note="component props" />
          <CommandChip command="projection" note="retained output" />
          <CommandChip command="history changes" note="last patch" />
        </section>
      </section>
      <StatusPanel />
    </section>
  </main>
));

deck.slide({ name: "Cascade And Components", style: slideStyle }, () => (
  <main className="shell">
    <Header section="INSPECTOR TARGETS" title="Cascade and component signals" />
    <section className="cardRow">
      <InspectorCard
        eyebrow="SELECTABLE CARD"
        title="Style trace target"
        body="The selected class overrides the base card background and border. The nested text inherits defaults, then applies class and inline values."
        footer="Try selection, style, and props commands here."
        tone="positive"
        selected
      />
      <InspectorCard
        eyebrow="DIAGNOSTIC SURFACE"
        title="Reload target"
        body="Editing this text should show a concise Vite-like dev line and keep interactive input on the prompt row."
        footer="Change this line to test reload."
        tone="warning"
      />
    </section>
  </main>
));

const rendered = await deck.render(pptx());

if (!rendered.ok) {
  throw new Error(rendered.diagnostics.items.map((item) => item.message).join("\n"));
}

const output = await write(rendered, "output-tsx.pptx");

if (!output.ok) {
  throw new Error(output.diagnostics.map((item) => item.message).join("\n"));
}

console.log(`Wrote ${output.path} (${output.status})`);

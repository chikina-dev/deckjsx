import type { ClassNameValue, TextTabStopAuthoring } from "deckjsx";

const readonlyTabStops = [{ position: "1in", alignment: "right" }] as const;
readonlyTabStops satisfies readonly TextTabStopAuthoring[];

const clsxLikeClassName = [
  "card selected",
  false,
  null,
  undefined,
  ["nested", { active: true, disabled: false, muted: null }],
] as const satisfies ClassNameValue;
void clsxLikeClassName;

void (
  <>
    <div
      className={clsxLikeClassName}
      style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2 }}
    >
      <p className={{ title: true }}>Hello</p>
      <p style={{ tabStops: readonlyTabStops }}>Tabs</p>
      <img src="image.png" className="image" />
      <shape shape="rect" className={["shape", { active: true }]} />
    </div>
  </>
);

void (
  <div
    // @ts-expect-error x is not part of the public authoring style API.
    style={{ x: 1 }}
  />
);

void (
  <div
    // @ts-expect-error y is not part of the public authoring style API.
    style={{ y: 1 }}
  />
);

void (<p style={{ position: "relative", left: 1 }}>Relative offset</p>);
void (<p style={{ position: "absolute", left: 1, top: 1 }}>Absolute offset</p>);

void (
  <p
    // @ts-expect-error direct style props are not public authoring props.
    x={1}
  >
    Bad direct prop
  </p>
);

void (
  <img
    src="image.png"
    // @ts-expect-error typography does not apply to image elements.
    style={{ fontSize: 18 }}
  />
);

void (
  <p
    // @ts-expect-error media fitting does not apply to text elements.
    style={{ objectFit: "cover" }}
  >
    Bad media style
  </p>
);

void (
  <table
  // @ts-expect-error table children must be table sections or rows.
  >
    raw table text
  </table>
);

void (
  <table>
    <tbody>
      <tr>
        <td colspan={2} rowspan={1}>
          ok
        </td>
      </tr>
    </tbody>
  </table>
);

void (
  <table>
    <tbody>
      <tr>
        {/* @ts-expect-error table cell colspan must be a supported positive integer literal. */}
        <td colspan={0}>bad</td>
        {/* @ts-expect-error table cell rowspan must be a supported positive integer literal. */}
        <td rowspan={-1}>bad</td>
        {/* @ts-expect-error table cell colspan does not accept fractional spans. */}
        <td colspan={1.5}>bad</td>
        {/* @ts-expect-error table cell rowspan is capped to keep authoring output predictable. */}
        <td rowspan={65}>bad</td>
      </tr>
    </tbody>
  </table>
);

void (
  <p
    // @ts-expect-error className does not accept numeric class tokens.
    className={1}
  >
    Bad class
  </p>
);

void (
  <div
    // @ts-expect-error className object maps accept boolean, null, or undefined values only.
    className={{ selected: 1 }}
  />
);

void (
  <p>
    <span style={{ color: "red" }}>Inline</span>
  </p>
);

void (
  <>
    <div style={{ position: "absolute", left: 1, top: 1, width: 6, height: 3 }}>
      <p style={{ position: "absolute", left: "10%", top: "20%", width: "50%", height: "25%" }}>
        percent child
      </p>
      {[
        <div style={{ position: "absolute", left: 0.5, top: 0.5, width: 2, height: 1 }}>
          <shape shape="rect" />
        </div>,
        <p>array child</p>,
      ]}
    </div>
  </>
);

void (
  <div>
    <>
      <p>Inside fragment</p>
      <shape shape="ellipse" />
    </>
  </div>
);

const keyedItems = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
] as const;

function KeyedLabel(props: { label: string }) {
  return <p>{props.label}</p>;
}

void (
  <div>
    {keyedItems.map((item, index) => (
      <div key={item.id} style={{ position: "absolute", left: index, top: 1, width: 2, height: 1 }}>
        <KeyedLabel key={index} label={item.label} />
      </div>
    ))}
    <shape key={1n} shape="rect" />
  </div>
);

void (<p>{["a", 1, false, null, undefined]}</p>);

void (
  <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2 }}>
    <p>Wrapped text</p>
    <p
      style={{
        fontSize: 18,
        letterSpacing: "0.1em",
        paragraphSpacingBefore: "12px",
        paragraphSpacingAfter: "0.25in",
      }}
    >
      Paragraph
    </p>
    <img src="image.png" />
  </div>
);

void (
  <main style={{ position: "absolute", left: 0, top: 0, width: 10, height: 5 }}>
    <header>
      <h1>Title</h1>
    </header>
    <section>
      <h2>Section</h2>
      <p>Body</p>
      <figure>
        <img src="chart.png" />
      </figure>
    </section>
    <aside>
      <p>Note</p>
    </aside>
    <nav>
      <p>Navigation</p>
    </nav>
    <footer>
      <p>Footer</p>
    </footer>
  </main>
);

void (
  <div
  // @ts-expect-error view-like elements accept authored elements, not primitive text.
  >
    raw view text
  </div>
);

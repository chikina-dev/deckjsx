import { jsx } from "deckjsx/jsx-runtime";
import type { InspectionDetailLevel, JsxKey, ProjectOptions } from "deckjsx";

const runtime = jsx("p", { children: "Runtime text" });
runtime satisfies import("deckjsx").DeckJsxElement;

const subpathStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
} satisfies import("deckjsx/style").ViewStyle;
void subpathStyle;

// @ts-expect-error DeckJsxElement tag metadata is a type-only marker, not a public runtime field.
void runtime.__deckjsxTag;

const runtimeSpan = jsx("span", { style: { color: "red" }, children: "Run" });
runtimeSpan satisfies import("deckjsx").DeckJsxElement;

// @ts-expect-error Runtime span uses TextRunStyle and rejects positioning.
jsx("span", { style: { left: 1 }, children: "Run" });

// @ts-expect-error x is not a public CSS-like style property.
jsx("div", { style: { x: 1 }, children: "Run" });

// @ts-expect-error layout is an internal layout mode, not a public CSS-like style property.
jsx("div", { style: { layout: "stack" }, children: "Run" });

// @ts-expect-error LayoutMode is not part of the public Authoring Interface.
export type NoPublicLayoutMode = import("deckjsx").LayoutMode;

const runtimeKey = 1n satisfies JsxKey;
const runtimeKeyed = jsx("p", { children: "Runtime text" }, runtimeKey);
runtimeKeyed satisfies import("deckjsx").DeckJsxElement;
// @ts-expect-error NodeProps names are not root public authoring types; use IntrinsicVideoProps.
export type NoRootVideoNodeProps = import("deckjsx").VideoNodeProps;

jsx("table", {
  children: jsx("tbody", { children: jsx("tr", { children: jsx("td", { children: "ok" }) }) }),
});

// @ts-expect-error direct jsx table children must be table sections or rows.
jsx("table", { children: jsx("p", { children: "bad" }) });

// @ts-expect-error direct jsx table section children must be rows.
jsx("tbody", { children: jsx("td", { children: "bad" }) });

// @ts-expect-error direct jsx table row children must be cells.
jsx("tr", { children: jsx("p", { children: "bad" }) });

jsx("p", { children: jsx("span", { children: "ok" }) });

// @ts-expect-error direct jsx text children must be primitive text or inline spans.
jsx("p", { children: jsx("div", { children: "bad" }) });

// @ts-expect-error direct jsx span children must be primitive text or nested spans.
jsx("span", { children: jsx("p", { children: "bad" }) });

const inspectionDetail = "details" satisfies InspectionDetailLevel;
void inspectionDetail;

const projectOptions = { inspection: "details" } satisfies ProjectOptions;
void projectOptions;

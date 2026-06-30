import { createElement } from "@/src/jsx.ts";

createElement(
  "table",
  null,
  createElement("tbody", null, createElement("tr", null, createElement("td", null, "ok"))),
);

// @ts-expect-error createElement table children must be table sections or rows.
createElement("table", null, createElement("p", null, "bad"));

// @ts-expect-error createElement table section children must be rows.
createElement("tbody", null, createElement("td", null, "bad"));

// @ts-expect-error createElement table row children must be cells.
createElement("tr", null, createElement("p", null, "bad"));

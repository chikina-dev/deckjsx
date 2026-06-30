import type { TextRunStyle, TooltipText } from "deckjsx";

const textRunStyle = {
  color: "red",
  fontSize: 18,
  href: "https://example.com",
} satisfies TextRunStyle;
void textRunStyle;

const mailtoTextRunStyle = {
  href: "mailto:deckjsx@example.com",
} satisfies TextRunStyle;
void mailtoTextRunStyle;

const tooltipText = "Open docs" satisfies TooltipText;
const tooltipTextRunStyle = {
  href: "https://example.com",
  tooltip: tooltipText,
} satisfies TextRunStyle;
void tooltipTextRunStyle;

const emptyHttpsTextRunLinkStyleIsRuntimeValidated = {
  href: "https://",
} satisfies TextRunStyle;
void emptyHttpsTextRunLinkStyleIsRuntimeValidated;

const emptyHttpTextRunLinkStyleIsRuntimeValidated = {
  href: "http://",
} satisfies TextRunStyle;
void emptyHttpTextRunLinkStyleIsRuntimeValidated;

const emptyMailtoTextRunLinkStyleIsRuntimeValidated = {
  href: "mailto:",
} satisfies TextRunStyle;
void emptyMailtoTextRunLinkStyleIsRuntimeValidated;

const whitespaceHttpsTextRunLinkStyleIsRuntimeValidated = {
  href: "https://   ",
} satisfies TextRunStyle;
void whitespaceHttpsTextRunLinkStyleIsRuntimeValidated;

const invalidLeadingWhitespaceHttpsTextRunLinkStyle = {
  // @ts-expect-error href must not start with whitespace.
  href: " https://example.com",
} satisfies TextRunStyle;
void invalidLeadingWhitespaceHttpsTextRunLinkStyle;

const whitespaceMailtoTextRunLinkStyleIsRuntimeValidated = {
  href: "mailto:   ",
} satisfies TextRunStyle;
void whitespaceMailtoTextRunLinkStyleIsRuntimeValidated;

const leadingWhitespaceMailtoTextRunLinkStyleIsRuntimeValidated = {
  href: "mailto: deckjsx@example.com",
} satisfies TextRunStyle;
void leadingWhitespaceMailtoTextRunLinkStyleIsRuntimeValidated;

const invalidTextRunLinkStyle = {
  // @ts-expect-error href is closed to supported external hyperlink URL schemes.
  href: "javascript:alert(1)",
} satisfies TextRunStyle;
void invalidTextRunLinkStyle;

const invalidRelativeTextRunLinkStyle = {
  // @ts-expect-error href must be an absolute external hyperlink URL.
  href: "/docs",
} satisfies TextRunStyle;
void invalidRelativeTextRunLinkStyle;

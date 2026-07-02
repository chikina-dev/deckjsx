import { Theme } from "deckjsx";

export const theme = new Theme({
  colors: {
    ink: "#0F172A",
    muted: "#64748B",
    paper: "#F8FAFC",
    panel: "#FFFFFF",
    accent: "#0F766E",
    risk: "#B45309",
    line: "#CBD5E1",
  },
  fonts: {
    display: "Aptos Display",
    body: "Aptos",
  },
  defaults: {
    h1: { fontFamily: "Aptos Display", fontSize: 30, fontWeight: 700, color: "#0F172A" },
    h2: { fontFamily: "Aptos", fontSize: 16, fontWeight: 700, color: "#0F172A" },
    p: { fontFamily: "Aptos", fontSize: 13, lineHeight: 1.18, color: "#334155", fit: "shrink" },
  },
});

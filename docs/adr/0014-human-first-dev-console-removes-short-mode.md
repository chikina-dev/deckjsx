# Human-first dev console removes short mode

`deckjsx dev` is a resident development console for humans debugging generated artifacts, not a production logging or machine-summary command. v0.1.4 should remove `--short`/`-s` from the dev command and supersede the ADR 0012 short-summary behavior; compact or machine-oriented diagnostic summaries should live in a future non-resident command or export surface instead of weakening the human-first dev console.

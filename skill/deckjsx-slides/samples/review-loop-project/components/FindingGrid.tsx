import type { Finding } from "../data/slides";
import { FindingCard } from "./FindingCard";

export function FindingGrid({ findings }: { readonly findings: readonly Finding[] }) {
  return (
    <section className="findingGrid">
      {findings.map((finding) => (
        <FindingCard key={finding.title} finding={finding} />
      ))}
    </section>
  );
}

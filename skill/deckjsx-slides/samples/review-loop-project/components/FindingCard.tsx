import type { Finding } from "../data/slides";

export function FindingCard({ finding }: { readonly finding: Finding }) {
  return (
    <article className={["findingCard", finding.tone]}>
      <h2 className="cardTitle">{finding.title}</h2>
      <p className="cardBody">{finding.body}</p>
    </article>
  );
}

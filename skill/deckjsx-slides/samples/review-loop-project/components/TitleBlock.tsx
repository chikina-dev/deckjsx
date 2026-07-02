import type { TemplateAreaRef } from "deckjsx";

export function TitleBlock({
  area,
  kicker,
  headline,
  lead,
}: {
  readonly area: TemplateAreaRef;
  readonly kicker: string;
  readonly headline: string;
  readonly lead: string;
}) {
  return (
    <header area={area} className="titleBlock">
      <p className="kicker">{kicker}</p>
      <h1>{headline}</h1>
      <p className="lead">{lead}</p>
    </header>
  );
}

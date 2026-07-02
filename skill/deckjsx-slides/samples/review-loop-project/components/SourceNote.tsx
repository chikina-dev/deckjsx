import type { TemplateAreaRef } from "deckjsx";

export function SourceNote({
  area,
  children,
}: {
  readonly area: TemplateAreaRef;
  readonly children: string;
}) {
  return (
    <p area={area} className="sourceNote">
      {children}
    </p>
  );
}

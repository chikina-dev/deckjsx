import type { Deck } from "deckjsx";
import { FindingGrid } from "../components/FindingGrid";
import { SourceNote } from "../components/SourceNote";
import { TitleBlock } from "../components/TitleBlock";
import { reviewSnapshot } from "../data/slides";
import type { ReviewLoopTemplates } from "../templates";

export function addReviewFindingsSlide(deck: Deck<void, ReviewLoopTemplates>) {
  deck.slide({ name: "Review findings", template: "report" }, ({ template }) => (
    <main className="slide">
      <TitleBlock
        area={template.title}
        kicker={reviewSnapshot.title.kicker}
        headline={reviewSnapshot.title.headline}
        lead={reviewSnapshot.title.lead}
      />
      <section area={template.body}>
        <FindingGrid findings={reviewSnapshot.findings} />
      </section>
      <SourceNote area={template.footer}>{reviewSnapshot.source}</SourceNote>
    </main>
  ));
}

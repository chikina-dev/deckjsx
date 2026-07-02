import { Deck } from "deckjsx";
import { addReviewFindingsSlide } from "./slides/review-findings";
import { reviewAndWrite } from "./review";
import { styles } from "./styles";
import { templates } from "./templates";
import { theme } from "./theme";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "Review loop project" },
  theme,
  templates,
});

deck.useStyles(styles);
addReviewFindingsSlide(deck);

await reviewAndWrite(deck);

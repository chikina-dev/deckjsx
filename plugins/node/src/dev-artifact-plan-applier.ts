import type { IncrementalArtifactSession } from "deckjsx/integration";
import type { DeckjsxDevArtifactPlan } from "./tracked-output-coordinator";

export type DevArtifactPlanApplier = {
  apply(artifactPlan: DeckjsxDevArtifactPlan): void;
};

export function createDevArtifactPlanApplier(input: {
  readonly session: IncrementalArtifactSession;
}): DevArtifactPlanApplier {
  return {
    apply(artifactPlan) {
      if (artifactPlan.status !== "ready") {
        input.session.retainArtifactSlots([]);
        return;
      }
      input.session.retainArtifactSlots(artifactPlan.retainedSlots);
    },
  };
}

import { featureMediaTableFixtures } from "./fixtures/feature/media-table";
import { featureTextLayoutFixtures } from "./fixtures/feature/text-layout";
import { businessScenarioFixtures } from "./fixtures/scenario/business";
import { heavyScenarioFixtures } from "./fixtures/scenario/heavy";
import { technicalScenarioFixtures } from "./fixtures/scenario/technical";
import type { RenderConfidenceFixture } from "./types";

export const renderConfidenceFixtures: readonly RenderConfidenceFixture[] = [
  ...featureTextLayoutFixtures,
  ...featureMediaTableFixtures,
  ...businessScenarioFixtures,
  ...technicalScenarioFixtures,
  ...heavyScenarioFixtures,
];

export const renderConfidenceGroups: ReadonlyMap<string, readonly string[]> = new Map([
  ["feature-text-layout", featureTextLayoutFixtures.map((fixture) => fixture.name)],
  ["feature-media-table", featureMediaTableFixtures.map((fixture) => fixture.name)],
  ["scenario-business", businessScenarioFixtures.map((fixture) => fixture.name)],
  ["scenario-technical", technicalScenarioFixtures.map((fixture) => fixture.name)],
  ["scenario-heavy", heavyScenarioFixtures.map((fixture) => fixture.name)],
  ["pr", renderConfidenceFixtures.map((fixture) => fixture.name)],
]);

export function listRenderConfidenceFixtures(): readonly RenderConfidenceFixture[] {
  return renderConfidenceFixtures;
}

export function selectRenderConfidenceFixtures(input: {
  readonly fixtureGroups: readonly string[];
  readonly fixtureNames: readonly string[];
}): readonly RenderConfidenceFixture[] {
  const selectedNames = new Set<string>();

  for (const group of input.fixtureGroups) {
    const names = renderConfidenceGroups.get(group);
    if (!names) {
      throw new Error(`Unknown render confidence fixture group: ${group}`);
    }
    for (const name of names) {
      selectedNames.add(name);
    }
  }

  for (const name of input.fixtureNames) {
    selectedNames.add(name);
  }

  if (selectedNames.size === 0) {
    for (const fixture of renderConfidenceFixtures) {
      selectedNames.add(fixture.name);
    }
  }

  const selected = renderConfidenceFixtures.filter((fixture) => selectedNames.has(fixture.name));
  const missing = [...selectedNames].filter(
    (name) => !renderConfidenceFixtures.some((fixture) => fixture.name === name),
  );
  if (missing.length > 0) {
    throw new Error(`Unknown render confidence fixture: ${missing.join(", ")}`);
  }
  if (selected.length === 0) {
    throw new Error("No render confidence fixtures selected.");
  }

  return selected;
}

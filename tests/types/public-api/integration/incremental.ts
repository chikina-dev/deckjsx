import type { RenderResult } from "deckjsx";
import type {
  ArtifactWriteRecord,
  ArtifactWriteToken,
  IncrementalArtifactCycleResult,
  IncrementalArtifactInspection,
  IncrementalArtifactSession,
  IncrementalArtifactSessionSnapshot,
  IncrementalArtifactWriteRecord,
  MediaSourceOrigin,
  RenderExecutionContext,
  SourceInvalidation,
} from "deckjsx/integration";
import {
  createIncrementalArtifactSession,
  getArtifactWriteToken,
  mediaSourceOrigins,
  recordArtifactWrite,
  runIncrementalArtifactCycle,
} from "deckjsx/integration";

const sourceInvalidation = {
  changedSourceIds: ["/project/src/deck.tsx"],
} satisfies SourceInvalidation;

const renderExecutionContext = {
  sourceInvalidation,
} satisfies RenderExecutionContext;

const mediaOrigin = {
  importer: "/project/src/deck.tsx",
  source: "/project/src/deck.tsx",
} satisfies MediaSourceOrigin;

const incrementalSession = createIncrementalArtifactSession();
incrementalSession satisfies IncrementalArtifactSession;
// @ts-expect-error Incremental Artifact Session must not expose private Pipeline Artifacts.
incrementalSession.slotArtifacts(0);
const incrementalSnapshot = incrementalSession.snapshot();
incrementalSnapshot satisfies IncrementalArtifactSessionSnapshot;
// @ts-expect-error Retained Pipeline Artifact collections stay behind inspectArtifacts().
void incrementalSnapshot.artifactSlots;
const incrementalInspection = incrementalSession.inspectArtifacts();
incrementalInspection satisfies IncrementalArtifactInspection;
incrementalInspection.retainedSlots() satisfies readonly number[];
incrementalInspection.graphNode("node-id");
incrementalInspection.firstProjection();
const cyclePromise = runIncrementalArtifactCycle(
  incrementalSession,
  { sourceInvalidation, renderExecutionContext },
  () => {
    const token = undefined satisfies ArtifactWriteToken | undefined;
    const writeRecord = {
      path: "/project/output.pptx",
      result: { status: "created" },
    } satisfies ArtifactWriteRecord<{ readonly status: "created" }>;
    const recorded = recordArtifactWrite(token, writeRecord);
    recorded satisfies IncrementalArtifactWriteRecord<{ readonly status: "created" }> | undefined;
    return recorded;
  },
);
void (cyclePromise satisfies Promise<
  IncrementalArtifactWriteRecord<{ readonly status: "created" }> | undefined
>);
declare const renderResult: RenderResult;
const artifactWriteToken = getArtifactWriteToken(renderResult);
artifactWriteToken satisfies ArtifactWriteToken | undefined;
declare const cycleResult: IncrementalArtifactCycleResult;
cycleResult.renderCount satisfies number;

const mediaOriginProps = mediaSourceOrigins({ src: mediaOrigin, poster: mediaOrigin });
mediaOriginProps satisfies object;
void mediaOriginProps;

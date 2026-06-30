export type * from "./results-public";
export type * from "./compile-result";
import type { ProjectResultWithoutProjection, ProjectResultWithProjection } from "./results-public";
import type {
  ProjectInspectionSummary as DetailedProjectInspectionSummary,
  PptxPackageModel,
} from "../projection/pptx/model";

export type InternalProjectResult =
  | InternalProjectResultWithProjection
  | ProjectResultWithoutProjection;

export type InternalProjectResultWithProjection = Omit<
  ProjectResultWithProjection,
  "projection" | "summary"
> & {
  readonly projection: PptxPackageModel;
  readonly summary?: DetailedProjectInspectionSummary;
};

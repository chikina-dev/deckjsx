export type * from "./results-public";
export type * from "./compile-result";
import type { ProjectResultWithoutProjection, ProjectResultWithProjection } from "./results-public";
import type { ProjectedDocumentModel } from "../projection/registry";
import type {
  ProjectInspectionSummary as DetailedProjectInspectionSummary,
  PptxPackageModel,
} from "../projection/pptx/model";

export type InternalProjectResult<TProjection extends ProjectedDocumentModel = PptxPackageModel> =
  | InternalProjectResultWithProjection<TProjection>
  | ProjectResultWithoutProjection;

export type InternalProjectResultWithProjection<
  TProjection extends ProjectedDocumentModel = PptxPackageModel,
> = Omit<ProjectResultWithProjection, "projection" | "summary"> & {
  readonly projection: TProjection;
  readonly summary?: DetailedProjectInspectionSummary;
};

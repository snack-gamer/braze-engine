import type {
  RafOpportunityId,
  RenderSubmissionId,
} from "../../../runtime/telemetry/render-timing-identities";

export const THREE_AGGREGATE_GPU_TIMING_PASS_ID = "three-render-aggregate-window";

/** The latest real surface submission included when an aggregate resolve begins. */
export type ThreeAggregateGpuTimingAnchor = Readonly<{
  submissionId: RenderSubmissionId;
  opportunityId: RafOpportunityId;
  submittedAtMilliseconds: number;
}>;

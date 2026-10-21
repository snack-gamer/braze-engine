declare const renderTimingIdBrand: unique symbol;

type RenderTimingId<Kind extends string> = number & {
  readonly [renderTimingIdBrand]: Kind;
};

export type RafOpportunityId = RenderTimingId<"raf-opportunity">;
export type SimulationRevisionId = RenderTimingId<"simulation-revision">;
export type RenderAttemptId = RenderTimingId<"render-attempt">;
export type RenderSubmissionId = RenderTimingId<"render-submission">;
export type QueueEpochId = RenderTimingId<"queue-epoch">;
export type GpuPassSampleId = RenderTimingId<"gpu-pass-sample">;

/** Issues identities that are unique for the lifetime of one GPU device scope. */
export class DeviceRenderTimingIdentities {
  private rafOpportunitySequence = 0;
  private simulationRevisionSequence = 0;
  private renderAttemptSequence = 0;
  private renderSubmissionSequence = 0;
  private queueEpochSequence = 0;
  private gpuPassSampleSequence = 0;

  constructor(readonly deviceScopeId: string) {
    if (deviceScopeId.trim().length === 0) {
      throw new Error("A render timing identity source requires a device scope id.");
    }
  }

  nextRafOpportunity(): RafOpportunityId {
    return this.next("RAF opportunity", "rafOpportunitySequence") as RafOpportunityId;
  }

  nextSimulationRevision(): SimulationRevisionId {
    return this.next("simulation revision", "simulationRevisionSequence") as SimulationRevisionId;
  }

  nextRenderAttempt(): RenderAttemptId {
    return this.next("render attempt", "renderAttemptSequence") as RenderAttemptId;
  }

  nextRenderSubmission(): RenderSubmissionId {
    return this.next("render submission", "renderSubmissionSequence") as RenderSubmissionId;
  }

  nextQueueEpoch(): QueueEpochId {
    return this.next("queue epoch", "queueEpochSequence") as QueueEpochId;
  }

  nextGpuPassSample(): GpuPassSampleId {
    return this.next("GPU pass sample", "gpuPassSampleSequence") as GpuPassSampleId;
  }

  private next(
    label: string,
    key:
      | "rafOpportunitySequence"
      | "simulationRevisionSequence"
      | "renderAttemptSequence"
      | "renderSubmissionSequence"
      | "queueEpochSequence"
      | "gpuPassSampleSequence",
  ): number {
    const value = this[key] + 1;
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} identity space was exhausted for device ${this.deviceScopeId}.`);
    }
    this[key] = value;
    return value;
  }
}

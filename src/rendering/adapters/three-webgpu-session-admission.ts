import {
  FairSurfaceAdmissionCoordinator,
  type SurfaceAdmissionDisposition,
} from "../runtime/submission/fair-surface-admission-coordinator";
import {
  GpuQueueEpochGovernor,
  type GpuQueueEpochLease,
  type GpuQueueEpochRetirement,
  type GpuQueueEpochSubmitted,
} from "../runtime/submission/gpu-queue-epoch-governor";
import { FrameTelemetryAggregator, type FrameTelemetrySummary } from "../runtime/telemetry/frame-telemetry-aggregator";
import {
  FrameTelemetryDiagnosticProjector,
  type FrameTelemetryDiagnosticProjection,
} from "../runtime/telemetry/frame-telemetry-diagnostic-projection";
import { FrameTelemetryStore } from "../runtime/telemetry/frame-telemetry-store";
import { DeviceRenderTimingIdentities } from "../runtime/telemetry/render-timing-identities";
import type { RafOpportunityId, RenderAttemptId } from "../runtime/telemetry/render-timing-identities";
import type {
  ThreeWebGpuAdmissionLaneState as LaneState,
  ThreeWebGpuPendingWork as PendingWork,
} from "./three-webgpu-admission-state";
import type { ThreeWebGpuRenderSubmission } from "./three-webgpu-render-host";
import { createThreeWebGpuRetirementSignal } from "./three-webgpu-retirement-signal";
import type {
  ThreeWebGpuSessionAdmissionLane,
  ThreeWebGpuSessionAdmissionOptions,
  ThreeWebGpuSurfaceSubmissionObserver,
  ThreeWebGpuTimingTelemetryAccess,
} from "./three-webgpu-session-admission-contract";

/** Shares one fair admission queue, queue governor, and telemetry timeline across named lanes. */
export class ThreeWebGpuSessionAdmission {
  private readonly identities: DeviceRenderTimingIdentities;
  private readonly telemetry: FrameTelemetryStore;
  private readonly aggregator: FrameTelemetryAggregator;
  private readonly projector: FrameTelemetryDiagnosticProjector;
  private readonly governor: GpuQueueEpochGovernor;
  private readonly coordinator: FairSurfaceAdmissionCoordinator<PendingWork>;
  private readonly lanes = new Map<string, LaneState>();
  private submittingWork: PendingWork | null = null;
  private activeSubmission = false;
  private readonly submissionIdleWaiters = new Set<() => void>();
  private disposed = false;
  private ownershipDisposed = false;

  constructor(private readonly options: ThreeWebGpuSessionAdmissionOptions) {
    this.identities = new DeviceRenderTimingIdentities(options.deviceScopeId);
    this.telemetry = new FrameTelemetryStore(this.identities.deviceScopeId, options.telemetry);
    this.aggregator = new FrameTelemetryAggregator(this.telemetry);
    this.projector = new FrameTelemetryDiagnosticProjector(this.telemetry);
    this.governor = new GpuQueueEpochGovernor(
      { onSubmittedWorkDone: () => options.device.queue.onSubmittedWorkDone() },
      this.identities,
      {
        maxEpochsInFlight: options.maxEpochsInFlight,
        clockMilliseconds: options.clockMilliseconds,
        reportObserverError: options.onError,
        events: {
          onEpochSubmitted: (event) => {
            this.telemetry.recordRenderSubmission(event);
            this.notifySurfaceSubmission(event);
          },
          onEpochRetired: (event) => {
            this.telemetry.recordQueueRetirement(event);
            this.coordinator.notifyCapacityAvailable();
          },
          onPendingAttemptDiscarded: (attemptId, reason) => {
            this.rejectAttempt(attemptId, `governor-${reason}`);
          },
        },
      },
    );
    this.coordinator = new FairSurfaceAdmissionCoordinator<PendingWork>({
      hasCapacity: () => this.governor.epochsInFlight < this.governor.maxEpochsInFlight,
      admit: (work) => this.submit(work),
      discard: (work, reason) => this.rejectAttempt(work.attemptId, reason),
      reportError: options.onError,
    });
  }

  recordOpportunity(timestampMilliseconds: number): RafOpportunityId {
    if (this.disposed) throw new Error("Cannot record an opportunity on disposed device admission.");
    const opportunityId = this.identities.nextRafOpportunity();
    this.telemetry.recordRafOpportunity({ opportunityId, timestampMilliseconds });
    return opportunityId;
  }

  registerLane(
    name: string,
    execute: LaneState["execute"],
    observeSurfaceSubmission: ThreeWebGpuSurfaceSubmissionObserver | null = null,
  ): ThreeWebGpuSessionAdmissionLane {
    if (this.disposed) throw new Error("Cannot register a lane on disposed device admission.");
    const normalizedName = name.trim();
    if (normalizedName.length === 0) throw new Error("A device admission lane requires a name.");
    const coordinatorLane = this.coordinator.registerSurface(normalizedName);
    const state: LaneState = {
      name: normalizedName,
      execute,
      observeSurfaceSubmission,
      coordinatorLane,
      disposed: false,
    };
    this.lanes.set(normalizedName, state);
    return {
      name: normalizedName,
      request: (opportunity, submission) => this.request(state, opportunity, submission),
      dispose: () => this.releaseLane(state),
    };
  }

  discardPending(): void {
    this.coordinator.discardPending("admission-disabled");
  }

  gpuTimingTelemetryAccess(): ThreeWebGpuTimingTelemetryAccess {
    return Object.freeze({ identities: this.identities, telemetry: this.telemetry });
  }

  diagnostics(): FrameTelemetryDiagnosticProjection {
    return this.projector.project();
  }

  summarize(): FrameTelemetrySummary {
    return this.aggregator.summarize();
  }

  dispose(): void {
    this.quiesce();
    if (!this.activeSubmission) {
      this.releaseOwnership();
      return;
    }
    void this.whenSubmissionIdle().then(() => this.releaseOwnership());
  }
  quiesce(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.coordinator.dispose();
    for (const lane of this.lanes.values()) lane.disposed = true;
    this.lanes.clear();
  }

  releaseOwnership(): void {
    if (this.activeSubmission) {
      throw new Error("Cannot release device ownership during an active submission callback.");
    }
    this.disposeOwnership();
  }

  /** Resolves only after the current synchronous encode-and-submit section exits. */
  whenSubmissionIdle(): Promise<void> {
    if (!this.activeSubmission) return Promise.resolve();
    return new Promise((resolve) => this.submissionIdleWaiters.add(resolve));
  }

  private request(
    lane: LaneState,
    opportunityId: RafOpportunityId,
    submission: ThreeWebGpuRenderSubmission,
  ): SurfaceAdmissionDisposition {
    if (this.disposed || lane.disposed || this.lanes.get(lane.name) !== lane) return "rejected";
    const attemptId = this.identities.nextRenderAttempt();
    this.telemetry.recordRenderAttempt({
      attemptId,
      opportunityId,
      simulationRevisionId: null,
      attemptedAtMilliseconds: this.options.clockMilliseconds(),
    });
    if (!this.options.rendererAvailable()) {
      this.rejectAttempt(attemptId, "renderer-unavailable");
      return "rejected";
    }
    return lane.coordinatorLane.request({ attemptId, opportunityId, lane, submission });
  }

  private submit(work: PendingWork): "submitted" | "rejected" {
    if (this.disposed || work.lane.disposed || !this.options.rendererAvailable()) {
      this.rejectAttempt(work.attemptId, "renderer-unavailable");
      return "rejected";
    }
    const offer = this.governor.offerRenderAttempt(work.attemptId);
    if (offer.disposition !== "admitted") {
      this.rejectAttempt(work.attemptId, `governor-${offer.disposition}`);
      return "rejected";
    }
    this.activeSubmission = true;
    const retirement = createThreeWebGpuRetirementSignal();
    let leaseSettled = false;
    try {
      const encodeStartedAtMilliseconds = this.options.clockMilliseconds();
      let executed = false;
      try {
        executed = work.lane.execute(work.submission, retirement.context);
      } finally {
        this.telemetry.recordRenderEncodeTiming({
          attemptId: work.attemptId,
          encodeStartedAtMilliseconds,
          encodeCompletedAtMilliseconds: this.options.clockMilliseconds(),
        });
      }
      if (!executed) {
        offer.lease.cancel();
        retirement.settle("cancelled");
        leaseSettled = true;
        this.rejectAttempt(work.attemptId, "renderer-unavailable");
        return "rejected";
      }
      const completion = this.submitReservedEpoch(work, offer.lease);
      leaseSettled = true;
      void completion.then(retirement.settle);
      return "submitted";
    } catch (error) {
      if (!leaseSettled) {
        try {
          // The callback may already have submitted queue work before throwing. Conservatively
          // retain its epoch until the post-callback fence, but expose the callback failure to
          // consumers even when the queue itself completes successfully.
          const completion = this.submitReservedEpoch(work, offer.lease);
          leaseSettled = true;
          void completion.then(() => retirement.settle("failed"));
        } catch (retirementError) {
          // Reaching this branch means no queue fence could be established. Release the still-
          // reserved lease so an invariant failure cannot permanently strand admission capacity.
          try { offer.lease.cancel(); } catch { /* The governor already settled it. */ }
          retirement.settle("failed");
          try { this.rejectAttempt(work.attemptId, "submission-failed"); } catch { /* Already submitted. */ }
          this.reportError(retirementError);
        }
      }
      this.reportError(error);
      return "rejected";
    } finally {
      this.activeSubmission = false;
      for (const resolve of this.submissionIdleWaiters) resolve();
      this.submissionIdleWaiters.clear();
    }
  }

  private rejectAttempt(attemptId: RenderAttemptId, reason: string): void {
    this.telemetry.recordRenderRejection({ attemptId, reason });
  }

  private submitReservedEpoch(
    work: PendingWork,
    lease: GpuQueueEpochLease,
  ): Promise<GpuQueueEpochRetirement> {
    this.submittingWork = work;
    try {
      return lease.submit(this.identities.nextRenderSubmission());
    } finally {
      this.submittingWork = null;
    }
  }

  private reportError(error: unknown): void {
    try { this.options.onError?.(error); } catch { /* Diagnostic observers cannot interrupt admission. */ }
  }

  private notifySurfaceSubmission(event: GpuQueueEpochSubmitted): void {
    const work = this.submittingWork;
    const observer = work?.lane.observeSurfaceSubmission;
    if (!work || !observer || work.attemptId !== event.attemptId) return;
    try {
      observer({
        submissionId: event.submissionId,
        opportunityId: work.opportunityId,
        submittedAtMilliseconds: event.submittedAtMilliseconds,
      });
    } catch (error) {
      try { this.options.onError?.(error); } catch { /* Observers cannot interrupt admission. */ }
    }
  }

  private releaseLane(state: LaneState): void {
    if (state.disposed) return;
    state.disposed = true;
    state.coordinatorLane.dispose();
    if (this.lanes.get(state.name) === state) this.lanes.delete(state.name);
  }

  private disposeOwnership(): void {
    if (this.ownershipDisposed) return;
    this.ownershipDisposed = true;
    try { this.governor.dispose(); } catch (error) {
      try { this.options.onError?.(error); } catch { /* Teardown observers are contained. */ }
    }
    try { this.options.onOwnershipDispose(); } catch (error) {
      try { this.options.onError?.(error); } catch { /* Teardown observers are contained. */ }
    }
  }
}

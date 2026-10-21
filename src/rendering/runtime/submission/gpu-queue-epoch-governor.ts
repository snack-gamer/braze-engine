import {
  DeviceRenderTimingIdentities,
  type QueueEpochId,
  type RenderAttemptId,
  type RenderSubmissionId,
} from "../telemetry/render-timing-identities";
import type {
  GpuQueueEpochGovernorOptions,
  GpuQueueEpochLease,
  GpuQueueEpochRetirement,
  GpuQueueRetirementPort,
  RenderAdmissionOffer,
} from "./gpu-queue-epoch-contracts";
import {
  GpuQueueEpochEventDispatcher,
  type GpuQueueEpochRetired,
} from "./gpu-queue-epoch-events";
import {
  createGpuQueueEpochState,
  gpuQueueEpochSubmittedEvent,
  type GpuQueueEpochState,
} from "./gpu-queue-epoch-state";

export type {
  GpuQueueEpochGovernorOptions,
  GpuQueueEpochLease,
  GpuQueueEpochRetirement,
  GpuQueueRetirementPort,
  RenderAdmissionOffer,
} from "./gpu-queue-epoch-contracts";
export type {
  GpuQueueEpochAbandoned,
  GpuQueueEpochGovernorEvents,
  GpuQueueEpochRetired,
  GpuQueueEpochSubmitted,
} from "./gpu-queue-epoch-events";

const DEFAULT_MAX_EPOCHS_IN_FLIGHT = 2;
const MAX_EPOCH_LIMIT = 64;

/** Bounds queue epochs and retains only the newest render attempt under pressure. */
export class GpuQueueEpochGovernor {
  readonly maxEpochsInFlight: number;
  private readonly clockMilliseconds: () => number;
  private readonly dispatcher: GpuQueueEpochEventDispatcher;
  private readonly activeEpochs = new Map<QueueEpochId, GpuQueueEpochState>();
  private pendingAttempt: RenderAttemptId | null = null;
  private generation = 1;
  private disposed = false;

  constructor(
    private readonly retirement: GpuQueueRetirementPort,
    private readonly identities: DeviceRenderTimingIdentities,
    options: GpuQueueEpochGovernorOptions = {},
  ) {
    const maximum = options.maxEpochsInFlight ?? DEFAULT_MAX_EPOCHS_IN_FLIGHT;
    if (!Number.isInteger(maximum) || maximum <= 0 || maximum > MAX_EPOCH_LIMIT) {
      throw new Error(`maxEpochsInFlight must be an integer from 1 to ${MAX_EPOCH_LIMIT}.`);
    }
    this.maxEpochsInFlight = maximum;
    this.clockMilliseconds = options.clockMilliseconds ?? (() => performance.now());
    this.dispatcher = new GpuQueueEpochEventDispatcher(
      options.events ?? {},
      options.reportObserverError ?? (() => undefined),
    );
  }

  get deviceScopeId(): string {
    return this.identities.deviceScopeId;
  }

  get epochsInFlight(): number {
    return this.activeEpochs.size;
  }

  get pendingRenderAttemptId(): RenderAttemptId | null {
    return this.pendingAttempt;
  }

  offerRenderAttempt(attemptId: RenderAttemptId): RenderAdmissionOffer {
    if (this.disposed) return { disposition: "rejected", reason: "disposed" };
    this.requireNewAttempt(attemptId);
    if (this.activeEpochs.size >= this.maxEpochsInFlight) {
      const superseded = this.replacePendingAttempt(attemptId);
      return { disposition: "pending", supersededPendingAttemptId: superseded };
    }

    const superseded = this.discardPendingAttempt("superseded");
    return {
      disposition: "admitted",
      lease: this.reserve(attemptId),
      supersededPendingAttemptId: superseded,
    };
  }

  takePendingRenderAttempt(): GpuQueueEpochLease | null {
    if (this.disposed || this.pendingAttempt === null) return null;
    if (this.activeEpochs.size >= this.maxEpochsInFlight) return null;
    const attemptId = this.pendingAttempt;
    this.pendingAttempt = null;
    return this.reserve(attemptId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.discardPendingAttempt("disposed");
    for (const state of this.activeEpochs.values()) {
      this.dispatcher.epochAbandoned({
        attemptId: state.attemptId,
        submissionId: state.submissionId,
        queueEpochId: state.queueEpochId,
        reason: "disposed",
      });
    }
    this.activeEpochs.clear();
  }

  private reserve(attemptId: RenderAttemptId): GpuQueueEpochLease {
    const state = createGpuQueueEpochState(
      attemptId,
      this.identities.nextQueueEpoch(),
      this.generation,
    );
    this.activeEpochs.set(state.queueEpochId, state);
    return {
      attemptId,
      queueEpochId: state.queueEpochId,
      submit: (submissionId) => this.submit(state, submissionId),
      cancel: () => this.cancel(state),
    };
  }

  private submit(
    state: GpuQueueEpochState,
    submissionId: RenderSubmissionId,
  ): Promise<GpuQueueEpochRetirement> {
    this.requireCurrent(state);
    if (state.status !== "reserved") throw new Error(`Queue epoch ${state.queueEpochId} was already submitted.`);
    state.status = "submitted";
    state.submissionId = submissionId;
    state.submittedAtMilliseconds = this.clockMilliseconds();
    this.dispatcher.epochSubmitted(gpuQueueEpochSubmittedEvent(state));

    let completion: PromiseLike<void>;
    try {
      completion = this.retirement.onSubmittedWorkDone();
    } catch {
      this.retire(state, "failed");
      return Promise.resolve("failed");
    }
    return Promise.resolve(completion).then(
      () => {
        this.retire(state, "completed");
        return "completed" as const;
      },
      () => {
        this.retire(state, "failed");
        return "failed" as const;
      },
    );
  }

  private cancel(state: GpuQueueEpochState): void {
    this.requireCurrent(state);
    if (state.status !== "reserved") throw new Error(`Submitted queue epoch ${state.queueEpochId} cannot be cancelled.`);
    this.activeEpochs.delete(state.queueEpochId);
    this.dispatcher.epochAbandoned({
      attemptId: state.attemptId,
      submissionId: null,
      queueEpochId: state.queueEpochId,
      reason: "cancelled",
    });
  }

  private retire(state: GpuQueueEpochState, completion: GpuQueueEpochRetired["completion"]): void {
    if (!this.isCurrent(state) || state.status !== "submitted") return;
    this.activeEpochs.delete(state.queueEpochId);
    this.dispatcher.epochRetired({
      ...gpuQueueEpochSubmittedEvent(state),
      completion,
      retiredAtMilliseconds: this.clockMilliseconds(),
    });
  }

  private replacePendingAttempt(attemptId: RenderAttemptId): RenderAttemptId | null {
    const superseded = this.discardPendingAttempt("superseded");
    this.pendingAttempt = attemptId;
    return superseded;
  }

  private discardPendingAttempt(reason: "superseded" | "disposed"): RenderAttemptId | null {
    const attemptId = this.pendingAttempt;
    this.pendingAttempt = null;
    if (attemptId !== null) this.dispatcher.pendingAttemptDiscarded(attemptId, reason);
    return attemptId;
  }

  private requireNewAttempt(attemptId: RenderAttemptId): void {
    if (this.pendingAttempt === attemptId) throw new Error(`Render attempt ${attemptId} is already pending.`);
    for (const state of this.activeEpochs.values()) {
      if (state.attemptId === attemptId) throw new Error(`Render attempt ${attemptId} already owns a queue epoch.`);
    }
  }

  private requireCurrent(state: GpuQueueEpochState): void {
    if (!this.isCurrent(state)) throw new Error(`Queue epoch ${state.queueEpochId} is stale or disposed.`);
  }

  private isCurrent(state: GpuQueueEpochState): boolean {
    return !this.disposed
      && state.generation === this.generation
      && this.activeEpochs.get(state.queueEpochId) === state;
  }
}

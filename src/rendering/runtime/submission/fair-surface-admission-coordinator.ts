export type SurfaceAdmissionDisposition = "submitted" | "queued" | "rejected";

export type SurfaceAdmissionDiscardReason =
  | "superseded"
  | "surface-released"
  | "admission-disabled"
  | "coordinator-disposed"
  | "admission-failed";

export type SurfaceAdmissionLane<Work> = Readonly<{
  request: (work: Work) => SurfaceAdmissionDisposition;
  dispose: () => void;
}>;

export type FairSurfaceAdmissionCoordinatorOptions<Work> = Readonly<{
  hasCapacity: () => boolean;
  admit: (work: Work) => "submitted" | "rejected";
  discard: (work: Work, reason: SurfaceAdmissionDiscardReason) => void;
  reportError?: (error: unknown) => void;
}>;

type PendingWork<Work> = {
  work: Work;
  disposition: SurfaceAdmissionDisposition;
};

type SurfaceLaneState<Work> = {
  name: string;
  active: boolean;
  queued: boolean;
  pending: PendingWork<Work> | null;
};

/** Coalesces each named surface independently while admitting lanes in FIFO order. */
export class FairSurfaceAdmissionCoordinator<Work> {
  private readonly lanes = new Map<string, SurfaceLaneState<Work>>();
  private readonly readyLanes: SurfaceLaneState<Work>[] = [];
  private readyReadIndex = 0;
  private draining = false;
  private disposed = false;

  constructor(private readonly options: FairSurfaceAdmissionCoordinatorOptions<Work>) {}

  registerSurface(name: string): SurfaceAdmissionLane<Work> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) throw new Error("An admission surface requires a name.");
    if (this.disposed) throw new Error("Cannot register a surface with a disposed coordinator.");
    if (this.lanes.has(normalizedName)) {
      throw new Error(`Admission surface '${normalizedName}' is already registered.`);
    }
    const lane: SurfaceLaneState<Work> = {
      name: normalizedName,
      active: true,
      queued: false,
      pending: null,
    };
    this.lanes.set(normalizedName, lane);
    return {
      request: (work) => this.enqueue(lane, work),
      dispose: () => this.release(lane),
    };
  }

  notifyCapacityAvailable(): void {
    this.drain();
  }

  discardPending(reason: Extract<SurfaceAdmissionDiscardReason, "admission-disabled">): void {
    this.readyLanes.length = 0;
    this.readyReadIndex = 0;
    for (const lane of this.lanes.values()) {
      lane.queued = false;
      this.discardLanePending(lane, reason);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.readyLanes.length = 0;
    this.readyReadIndex = 0;
    for (const lane of this.lanes.values()) {
      lane.active = false;
      lane.queued = false;
      this.discardLanePending(lane, "coordinator-disposed");
    }
    this.lanes.clear();
  }

  private enqueue(lane: SurfaceLaneState<Work>, work: Work): SurfaceAdmissionDisposition {
    if (this.disposed || !lane.active || this.lanes.get(lane.name) !== lane) {
      this.notifyDiscard(
        work,
        this.disposed ? "coordinator-disposed" : "surface-released",
      );
      return "rejected";
    }
    if (lane.pending) this.discardPendingWork(lane.pending, "superseded");
    const pending: PendingWork<Work> = { work, disposition: "queued" };
    lane.pending = pending;
    if (!lane.queued) {
      lane.queued = true;
      this.readyLanes.push(lane);
    }
    this.drain();
    return pending.disposition;
  }

  private drain(): void {
    if (this.disposed || this.draining) return;
    this.draining = true;
    try {
      while (!this.disposed && this.options.hasCapacity()) {
        const lane = this.takeReadyLane();
        if (!lane) break;
        const pending = lane.pending;
        lane.pending = null;
        if (!pending) continue;
        try {
          pending.disposition = this.options.admit(pending.work);
        } catch (error) {
          pending.disposition = "rejected";
          this.notifyDiscard(pending.work, "admission-failed");
          this.notifyError(error);
        }
      }
    } finally {
      this.draining = false;
      this.compactReadyLanes();
    }
  }

  private takeReadyLane(): SurfaceLaneState<Work> | null {
    while (this.readyReadIndex < this.readyLanes.length) {
      const lane = this.readyLanes[this.readyReadIndex++];
      lane.queued = false;
      if (lane.active && lane.pending && this.lanes.get(lane.name) === lane) return lane;
    }
    return null;
  }

  private compactReadyLanes(): void {
    if (this.readyReadIndex === 0) return;
    if (this.readyReadIndex >= this.readyLanes.length) {
      this.readyLanes.length = 0;
      this.readyReadIndex = 0;
      return;
    }
    this.readyLanes.splice(0, this.readyReadIndex);
    this.readyReadIndex = 0;
  }

  private release(lane: SurfaceLaneState<Work>): void {
    if (!lane.active) return;
    lane.active = false;
    lane.queued = false;
    if (this.lanes.get(lane.name) === lane) this.lanes.delete(lane.name);
    this.discardLanePending(lane, "surface-released");
  }

  private discardLanePending(
    lane: SurfaceLaneState<Work>,
    reason: SurfaceAdmissionDiscardReason,
  ): void {
    const pending = lane.pending;
    lane.pending = null;
    if (pending) this.discardPendingWork(pending, reason);
  }

  private discardPendingWork(
    pending: PendingWork<Work>,
    reason: SurfaceAdmissionDiscardReason,
  ): void {
    pending.disposition = "rejected";
    this.notifyDiscard(pending.work, reason);
  }

  private notifyDiscard(work: Work, reason: SurfaceAdmissionDiscardReason): void {
    try {
      this.options.discard(work, reason);
    } catch (error) {
      this.notifyError(error);
    }
  }

  private notifyError(error: unknown): void {
    try {
      this.options.reportError?.(error);
    } catch {
      // Diagnostic observers cannot interrupt admission ownership.
    }
  }
}

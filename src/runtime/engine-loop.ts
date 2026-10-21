export const ENGINE_LOOP_PHASES = ["gameplay", "timeline", "simulation", "render", "afterRender"] as const;

export type EngineLoopPhase = (typeof ENGINE_LOOP_PHASES)[number];

export type EngineFrame = Readonly<{
  index: number;
  nowMilliseconds: number;
  deltaSeconds: number;
  unscaledDeltaSeconds: number;
  timeScale: number;
  elapsedSeconds: number;
  unscaledElapsedSeconds: number;
}>;

export type EngineLoopCallbacks = Partial<Record<EngineLoopPhase, (frame: EngineFrame) => void>>;

export type EngineLoopParticipant = {
  requestFrame: () => void;
  cancelFrame: () => void;
  dispose: () => void;
};

export type EngineLoopDriver = {
  requestFrame: (callback: (nowMilliseconds: number) => void) => number;
  cancelFrame: (frameId: number) => void;
  reportError: (error: unknown, phase: EngineLoopPhase) => void;
};

type ParticipantRecord = {
  callbacks: EngineLoopCallbacks;
  requested: boolean;
  activeFrame: number;
};

/**
 * Orders all browser-frame work around one timestamp and one active-time delta.
 *
 * Participants are demand-driven: requesting a frame activates every callback
 * they registered for that frame. A callback may request its next frame while
 * it runs. Time is reset across idle and paused periods so neither simulation
 * nor animation receives a hidden-tab or inactive-editor backlog.
 */
export class EngineLoop {
  private readonly participants = new Map<number, ParticipantRecord>();
  private nextParticipantId = 1;
  private scheduledFrame: number | null = null;
  private frameIndex = 0;
  private lastFrameTime: number | null = null;
  private elapsedSeconds = 0;
  private unscaledElapsedSeconds = 0;
  private timeScale = 1;
  private runningFrame = false;
  private paused = false;
  private disposed = false;

  constructor(private readonly driver: EngineLoopDriver) {}

  createParticipant(callbacks: EngineLoopCallbacks): EngineLoopParticipant {
    if (this.disposed) return inactiveParticipant();
    const participantId = this.nextParticipantId;
    this.nextParticipantId += 1;
    const record: ParticipantRecord = { callbacks: { ...callbacks }, requested: false, activeFrame: 0 };
    this.participants.set(participantId, record);

    let participantDisposed = false;
    return {
      requestFrame: () => {
        if (participantDisposed || this.disposed) return;
        record.requested = true;
        this.scheduleFrameIfNeeded();
      },
      cancelFrame: () => {
        if (participantDisposed || this.disposed) return;
        record.requested = false;
        this.cancelFrameIfIdle();
      },
      dispose: () => {
        if (participantDisposed) return;
        participantDisposed = true;
        this.participants.delete(participantId);
        this.cancelFrameIfIdle();
      },
    };
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    this.lastFrameTime = null;
    if (paused) {
      this.cancelScheduledFrame();
      return;
    }
    this.scheduleFrameIfNeeded();
  }

  /** Owns the one app-wide gameplay time scale consumed by every simulation participant. */
  setTimeScale(value: number): void {
    if (this.disposed || !Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, value));
    if (next === this.timeScale) return;
    this.timeScale = next;
    // A scaled participant may stop requesting frames at zero. Invalidate the
    // live participants once so resuming time cannot leave it permanently idle.
    for (const record of this.participants.values()) record.requested = true;
    this.scheduleFrameIfNeeded();
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelScheduledFrame();
    this.participants.clear();
    this.lastFrameTime = null;
  }

  private readonly runFrame = (nowMilliseconds: number): void => {
    this.scheduledFrame = null;
    if (this.disposed || this.paused) return;

    const safeNow = Number.isFinite(nowMilliseconds) ? nowMilliseconds : 0;
    const deltaMilliseconds = this.lastFrameTime === null
      ? 0
      : Math.max(0, safeNow - this.lastFrameTime);
    this.lastFrameTime = safeNow;
    const unscaledDeltaSeconds = deltaMilliseconds * 0.001;
    const deltaSeconds = unscaledDeltaSeconds * this.timeScale;
    this.unscaledElapsedSeconds += unscaledDeltaSeconds;
    this.elapsedSeconds += deltaSeconds;
    this.frameIndex += 1;
    const frame: EngineFrame = Object.freeze({
      index: this.frameIndex,
      nowMilliseconds: safeNow,
      deltaSeconds,
      unscaledDeltaSeconds,
      timeScale: this.timeScale,
      elapsedSeconds: this.elapsedSeconds,
      unscaledElapsedSeconds: this.unscaledElapsedSeconds,
    });

    this.runningFrame = true;
    this.activateRequestedParticipants();
    for (const phase of ENGINE_LOOP_PHASES) {
      // An earlier phase may wake an idle participant for a later phase in
      // this same frame, so activation is checked at every phase boundary.
      this.activateRequestedParticipants();
      for (const record of this.participants.values()) {
        if (record.activeFrame !== this.frameIndex) continue;
        const callback = record.callbacks[phase];
        if (!callback) continue;
        try {
          callback(frame);
        } catch (error) {
          this.driver.reportError(error, phase);
        }
      }
    }
    this.runningFrame = false;

    if (this.hasPendingParticipant()) {
      this.scheduleFrameIfNeeded();
    } else {
      this.lastFrameTime = null;
    }
  };

  private activateRequestedParticipants(): void {
    for (const record of this.participants.values()) {
      if (!record.requested || record.activeFrame === this.frameIndex) continue;
      record.requested = false;
      record.activeFrame = this.frameIndex;
    }
  }

  private hasPendingParticipant(): boolean {
    for (const record of this.participants.values()) {
      if (record.requested) return true;
    }
    return false;
  }

  private scheduleFrameIfNeeded(): void {
    if (
      this.disposed
      || this.paused
      || this.runningFrame
      || this.scheduledFrame !== null
      || !this.hasPendingParticipant()
    ) return;
    this.scheduledFrame = this.driver.requestFrame(this.runFrame);
  }

  private cancelFrameIfIdle(): void {
    if (!this.hasPendingParticipant()) {
      this.cancelScheduledFrame();
      this.lastFrameTime = null;
    }
  }

  private cancelScheduledFrame(): void {
    if (this.scheduledFrame === null) return;
    this.driver.cancelFrame(this.scheduledFrame);
    this.scheduledFrame = null;
  }
}

function inactiveParticipant(): EngineLoopParticipant {
  return {
    requestFrame: () => undefined,
    cancelFrame: () => undefined,
    dispose: () => undefined,
  };
}

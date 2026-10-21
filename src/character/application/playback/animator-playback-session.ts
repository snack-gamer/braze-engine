import {
  advanceAnimatorRuntime,
  createAnimatorRuntimeState,
  withAnimatorParameter,
  type AnimatorRuntimeState,
  type RuntimeAnimatorControllerDefinition,
  type RuntimeAnimatorParameterValue,
} from "../../runtime/animator-runtime";
import {
  assetRefKey,
  compileAnimatorController,
} from "../../runtime/animator-controller-compiler";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import {
  buildLayerBlendPlan,
  type LayerBlendPlan,
  type RuntimeAvatarMaskBinding,
} from "../../runtime/layer-blend-plan";
import { AnimatorPlaybackCadence } from "./animator-playback-cadence";
import type {
  AnimatorPlaybackAssets,
  AnimatorPlaybackClip,
  AnimatorPlaybackEvent,
  AnimatorPlaybackFrame,
  AnimatorPlaybackSessionInput,
  AnimatorPlaybackStep,
} from "./animator-playback-contracts";
import { AnimatorPlaybackEventTracker } from "./animator-playback-events";
import { AnimatorPlaybackPoseDriver } from "./animator-playback-pose-driver";

const DEFAULT_MAX_EVENTS_PER_FRAME = 128;

/** One disposable gameplay Animator instance. The shared EngineLoop calls `advance`. */
export class AnimatorPlaybackSession<TClip> {
  private runtimeState: AnimatorRuntimeState;
  private readonly cadence: AnimatorPlaybackCadence;
  private readonly eventTracker = new AnimatorPlaybackEventTracker<TClip>();
  private readonly clipsById: ReadonlyMap<string, AnimatorPlaybackClip<TClip>>;
  private readonly masksById: ReadonlyMap<string, AnimatorPlaybackAssets<TClip>["masks"][number]>;
  private readonly maxEventsPerFrame: number;
  private readonly poseDriver: AnimatorPlaybackPoseDriver<TClip>;
  private disposed = false;

  constructor(
    private readonly input: AnimatorPlaybackSessionInput<TClip>,
    private readonly controller: RuntimeAnimatorControllerDefinition,
    initialState: AnimatorRuntimeState,
    private readonly runtimeMasks: readonly RuntimeAvatarMaskBinding[],
  ) {
    this.runtimeState = initialState;
    this.clipsById = new Map(input.assets.clips.map((clip) => [clip.id, clip]));
    this.masksById = new Map(input.assets.masks.map((mask) => [`${mask.id}:main`, mask]));
    this.maxEventsPerFrame = boundedPlaybackEventLimit(input.maxEventsPerFrame);
    this.cadence = new AnimatorPlaybackCadence({
      fixedStepSeconds: input.fixedStepSeconds ?? 1 / 60,
      maxFixedStepsPerFrame: input.maxFixedStepsPerFrame ?? 5,
    });
    this.poseDriver = new AnimatorPlaybackPoseDriver({
      characterId: input.characterId,
      policy: input.component.rootMotion,
      avatar: input.assets.avatar,
      pose: input.pose,
      rootMotionSink: input.rootMotionSink,
      rootMotionObserver: input.rootMotionObserver,
      clipsById: this.clipsById,
      masksById: this.masksById,
      ikGoals: input.ikGoals,
    });
  }

  get usesUnscaledTime(): boolean {
    return this.input.component.updateMode === "unscaledTime";
  }

  /** Immutable runtime sample exposed for editor telemetry; callers cannot drive playback through it. */
  runtimeStateSnapshot(): AnimatorRuntimeState {
    return this.runtimeState;
  }

  /** Exact compiled definition used by this session, including resolved Clip durations. */
  runtimeControllerDefinition(): RuntimeAnimatorControllerDefinition {
    return this.controller;
  }

  advance(frame: AnimatorPlaybackFrame): AnimatorPlaybackStep {
    if (this.disposed) return failedStep("disposed-animator-session", "Animator session is already disposed.");
    if (!this.input.component.enabled) return emptyStep();
    if (
      this.input.component.cullingMode === "basedOnRenderVisibility"
      && !this.input.pose.isVisible()
    ) return emptyStep();

    const batch = this.cadence.steps(
      this.input.component.updateMode,
      frame.deltaSeconds,
      frame.unscaledDeltaSeconds,
    );
    const diagnostics: CharacterRuntimeDiagnostic[] = [];
    const events: AnimatorPlaybackEvent[] = [];
    const rootMotion = [];
    let changed = false;
    if (batch.droppedSeconds > 0) diagnostics.push({
      code: "animator-time-dropped",
      severity: "warning",
      message: "Animator catch-up time was discarded to keep frame work bounded.",
      details: { droppedSeconds: batch.droppedSeconds },
    });

    let finalPlan: LayerBlendPlan | null = null;
    let eventCallbackFailed = false;
    for (const deltaSeconds of batch.stepDeltas) {
      const eventCapacity = Math.max(0, this.maxEventsPerFrame - events.length);
      const advanced = advanceAnimatorRuntime(
        this.controller,
        this.runtimeState,
        deltaSeconds,
        { maxStateEvents: eventCapacity },
      );
      diagnostics.push(...advanced.diagnostics);
      if (!advanced.value) break;
      this.runtimeState = advanced.value.state;
      const stateEvents: AnimatorPlaybackEvent[] = advanced.value.firedStateEvents.map((event) => ({
        kind: "state",
        characterId: this.input.characterId,
        layerId: event.layerId,
        stateId: event.stateId,
        event: {
          id: event.eventId,
          name: event.name,
          timeSeconds: event.occurrenceTimeSeconds,
          payload: { ...event.payload },
        },
      }));
      events.push(...stateEvents);
      eventCallbackFailed = this.deliverEvents(
        stateEvents,
        diagnostics,
        eventCallbackFailed,
      );
      if (advanced.value.eventsTruncated) diagnostics.push({
        code: "animation-events-truncated",
        severity: "warning",
        message: "Animation event delivery reached its per-frame safety limit.",
      });
      const planned = buildLayerBlendPlan(this.controller, this.runtimeState, this.runtimeMasks);
      diagnostics.push(...planned.diagnostics);
      if (!planned.value) break;
      finalPlan = planned.value;

      const eventStep = this.eventTracker.collect(
        this.input.characterId,
        finalPlan,
        this.clipsById,
        Math.max(0, this.maxEventsPerFrame - events.length),
      );
      events.push(...eventStep.events);
      eventCallbackFailed = this.deliverEvents(
        eventStep.events,
        diagnostics,
        eventCallbackFailed,
      );
      if (eventStep.truncated) diagnostics.push({
        code: "animation-events-truncated",
        severity: "warning",
        message: "Animation event delivery reached its per-frame safety limit.",
      });

      if (this.poseDriver.extractsRootMotion) {
        const applied = this.poseDriver.applyPoseAndRootMotion(finalPlan, deltaSeconds);
        diagnostics.push(...applied.diagnostics);
        changed ||= applied.changed;
        if (applied.rootMotion) rootMotion.push(applied.rootMotion);
      }
    }

    if (finalPlan && !this.poseDriver.extractsRootMotion) {
      const applied = this.poseDriver.applyPoseWithoutRootMotion(finalPlan);
      diagnostics.push(...applied.diagnostics);
      changed ||= applied.value?.changed ?? false;
    }
    return { changed, events, rootMotion, diagnostics };
  }

  setParameter(
    name: string,
    value: RuntimeAnimatorParameterValue,
    expectedType?: "float" | "int" | "bool" | "trigger",
  ): CharacterRuntimeResult<void> {
    if (this.disposed) return characterRuntimeFailure(
      "disposed-animator-session",
      "Cannot change a parameter on a disposed Animator session.",
    );
    const definition = this.controller.parameters.find((parameter) => parameter.name === name);
    if (expectedType && definition?.type !== expectedType) return characterRuntimeFailure({
      code: "animator-parameter-command-type-mismatch",
      severity: "error",
      message: `Animator parameter ${JSON.stringify(name)} is not a ${expectedType} parameter.`,
      path: `parameters.${name}`,
    });
    const next = withAnimatorParameter(this.controller, this.runtimeState, name, value);
    if (!next.value) return { value: null, diagnostics: next.diagnostics };
    const plan = buildLayerBlendPlan(this.controller, next.value, this.runtimeMasks);
    if (!plan.value) return { value: null, diagnostics: [...next.diagnostics, ...plan.diagnostics] };
    const applied = this.initialize(plan.value);
    const diagnostics = [...next.diagnostics, ...plan.diagnostics, ...applied.diagnostics];
    if (applied.value === null) return { value: null, diagnostics };
    this.runtimeState = next.value;
    return characterRuntimeSuccess(undefined, diagnostics);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cadence.reset();
    this.eventTracker.reset();
    this.poseDriver.reset();
    try {
      this.input.pose.restoreAuthoredPose();
    } finally {
      this.input.pose.dispose();
    }
  }

  private deliverEvents(
    events: readonly AnimatorPlaybackEvent[],
    diagnostics: CharacterRuntimeDiagnostic[],
    failureAlreadyReported: boolean,
  ): boolean {
    if (!this.input.onEvent) return failureAlreadyReported;
    let failed = failureAlreadyReported;
    for (const event of events) {
      try {
        this.input.onEvent(event);
      } catch (error) {
        if (!failed) diagnostics.push({
          code: "animation-event-callback-failed",
          severity: "warning",
          message: `An animation event listener failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        failed = true;
      }
    }
    return failed;
  }

  /** Reapplies current-time weights and rebases root motion without a clock tick. */
  initialize(plan: LayerBlendPlan): CharacterRuntimeResult<void> {
    if (this.disposed) return characterRuntimeFailure(
      "disposed-animator-session",
      "Cannot initialize a disposed Animator session.",
    );
    const applied = this.input.component.enabled
      ? this.poseDriver.initialize(plan)
      : characterRuntimeSuccess(undefined);
    if (applied.value !== null) this.eventTracker.prime(plan);
    return applied;
  }
}

export function createAnimatorPlaybackSession<TClip>(
  input: AnimatorPlaybackSessionInput<TClip>,
): CharacterRuntimeResult<AnimatorPlaybackSession<TClip>> {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const clipsById = new Map<string, AnimatorPlaybackClip<TClip>>();
  for (const clip of input.assets.clips) {
    if (clipsById.has(clip.id)) diagnostics.push({
      code: "duplicate-playback-clip",
      severity: "error",
      message: `More than one resolved clip uses ${clip.id}.`,
    });
    clipsById.set(clip.id, clip);
  }
  const expectedController = input.component.controllerRef
    ? assetRefKey(input.component.controllerRef)
    : input.component.controller ? `${input.component.controller.id}:main` : undefined;
  if (!expectedController) diagnostics.push({
    code: "missing-animator-controller",
    severity: "error",
    message: "Animator Controller has no embedded state machine.",
  });
  else if (expectedController !== `${input.assets.controller.id}:main`) diagnostics.push({
    code: "mismatched-animator-controller",
    severity: "error",
    message: "The resolved state machine does not match the Animator Controller component.",
  });
  const compiled = compileAnimatorController(input.assets.controller, (clipRef) => {
    const clip = clipsById.get(assetRefKey(clipRef) ?? "");
    return clip && {
      durationSeconds: clip.metadata.durationSeconds,
      looping: clip.metadata.looping,
    };
  });
  diagnostics.push(...compiled.diagnostics);
  if (!compiled.value || hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const overrides = Object.fromEntries(
    input.component.parameterOverrides.map((override) => [override.parameterId, override.value]),
  );
  const initial = createAnimatorRuntimeState(compiled.value, {
    ...overrides,
    ...input.launchValues,
  });
  diagnostics.push(...initial.diagnostics);
  if (!initial.value || hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const runtimeMasks = input.assets.masks.map((mask, gpuMaskIndex) => ({
    id: `${mask.id}:main`,
    revision: mask.revision ?? "unversioned",
    gpuMaskIndex,
  }));
  const initialPlan = buildLayerBlendPlan(compiled.value, initial.value, runtimeMasks);
  diagnostics.push(...initialPlan.diagnostics);
  if (!initialPlan.value || hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const session = new AnimatorPlaybackSession(input, compiled.value, initial.value, runtimeMasks);
  const initialized = session.initialize(initialPlan.value);
  diagnostics.push(...initialized.diagnostics);
  if (initialized.value === null || hasCharacterRuntimeErrors(diagnostics)) {
    return { value: null, diagnostics };
  }
  return characterRuntimeSuccess(session, diagnostics);
}

function emptyStep(): AnimatorPlaybackStep {
  return { changed: false, events: [], rootMotion: [], diagnostics: [] };
}

function failedStep(code: string, message: string): AnimatorPlaybackStep {
  return {
    ...emptyStep(),
    diagnostics: [{ code, severity: "error", message }],
  };
}

function boundedPlaybackEventLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_EVENTS_PER_FRAME;
  return Math.min(DEFAULT_MAX_EVENTS_PER_FRAME, Math.max(0, Math.floor(value!)));
}

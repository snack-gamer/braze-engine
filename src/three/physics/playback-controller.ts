import type { Object3D } from "three";
import type { WorldEntity } from "../../world/domain/entity-world";
import { characterMotorState } from "./physics-character-commands";
import { rigidPlaybackBackend } from "./rigid-playback-backend";
import type { PhysicsPlaybackBackend, PhysicsPlaybackFactory, PhysicsPlaybackSolver } from "./playback-backend";
import type { CompiledPhysicsScene } from "../../physics/runtime/contracts";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { FixedStepClock } from "../../runtime/fixed-step-clock";
import { createPhysicsPlaybackSignatureCache } from "../../physics/runtime/playback-signature";
import type { PhysicsPlaybackInput } from "../../physics/runtime/playback-input";
import type { PhysicsFixedStepDriver } from "../../physics/runtime/fixed-step-driver";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { Runtime } from "../runtime";
import { webGpuDeviceFor, type ViewportRenderer } from "../renderer";
import {
  createPhysicsPlaybackDeviceLane,
  type PhysicsPlaybackDeviceWorkSelector,
} from "./physics-playback-device-lane";
import {
  bindPhysicsPoseTargets,
  createPhysicsPlaybackState,
  releasePhysicsPlaybackState,
  type PhysicsPlaybackState,
} from "./physics-playback-state";
import {
  diagnosticsForPhysicsPlayback,
  EMPTY_PHYSICS_PLAYBACK_DIAGNOSTICS,
  type PhysicsPlaybackDiagnostics,
} from "./physics-playback-diagnostics";
import { createPhysicsPlaybackMotorBuffer } from "./physics-playback-motor-buffer";
import type { EntityLifecycleBackend } from "../../world/runtime/entity-world";
import { createPhysicsPlaybackCommands, type PhysicsPlaybackCommandPorts } from "./physics-playback-commands";

export type { PhysicsPlaybackDiagnostics } from "./physics-playback-diagnostics";

type UpdateArgs = PhysicsPlaybackInput & {
  renderer: ViewportRenderer;
  frameDeltaSeconds: number;
  opportunity: DeviceRenderOpportunity;
};

type PendingInitialization = Readonly<{
  serial: number;
  signature: string;
  build: CompiledPhysicsScene;
  args: UpdateArgs;
}>;

export type PhysicsPlaybackController = PhysicsPlaybackCommandPorts & {
  bindRuntimeModel: (node: Object3D, entity: WorldEntity) => () => void;
  entityBackend: () => EntityLifecycleBackend;
  /** Requests immutable pipeline preparation on the next device opportunity. */
  prepare: (renderer: ViewportRenderer) => void;
  /** Attaches one view to the shared poses without advancing the world. */
  present: (runtime: Runtime) => boolean;
  detach: (runtime: Runtime) => void;
  reset: (stepToken: number) => void;
  /** Schedules bounded solver work after the scene has been rendered. */
  schedule: (args: UpdateArgs) => boolean;
  hasPendingAdmission: () => boolean;
  hasPendingDeviceWork: () => boolean;
  diagnostics: () => PhysicsPlaybackDiagnostics;
  attachFixedStepDriver: (driver: PhysicsFixedStepDriver) => () => void;
  subscribeFixedStep: (listener: PhysicsFixedStepDriver["beforeStep"]) => () => void;
  fixedStepsReady: () => boolean;
  interpolationAlpha: () => number;
  refreshTransport: (input: PhysicsPlaybackInput) => void;
  dispose: () => void;
};

/** Owns one GPU-resident physics playback run and its shared-session task lane. */
export function createPhysicsPlaybackController(
  taskLane: ThreeWebGpuDeviceTaskLane,
  onChanged: () => void = () => undefined,
  backend: PhysicsPlaybackBackend = rigidPlaybackBackend,
  retireResources?: () => Promise<void>,
): PhysicsPlaybackController {
  let state: PhysicsPlaybackState | null = null;
  let latestSchedule: UpdateArgs | null = null;
  let lastStepToken = 0;
  let warnedDevice = false;
  let warnedRuntime = false;
  let serial = 0;
  let initializationSignature: string | null = null;
  let pendingInitialization: PendingInitialization | null = null;
  let emptySceneSignature: string | null = null;
  let controllerActive = false;
  let disposed = false;
  let preparation: "idle" | "requested" | "running" | "ready" | "failed" = "idle";
  let runtimeFactory: PhysicsPlaybackFactory | null = null;
  let diagnosticState = { ...EMPTY_PHYSICS_PLAYBACK_DIAGNOSTICS };
  let clock = new FixedStepClock();
  let driver: PhysicsFixedStepDriver | null = null;
  const fixedStepListeners = new Set<PhysicsFixedStepDriver["beforeStep"]>();
  const fixedStepsReady = () => !driver || driver.ready();
  const deviceTasks = createPhysicsPlaybackDeviceLane(taskLane);
  const signatureCache = createPhysicsPlaybackSignatureCache();
  const motors = createPhysicsPlaybackMotorBuffer(onChanged);
  const commands = createPhysicsPlaybackCommands({ state: () => state, motors, onChanged,
    ready: () => latestSchedule?.mode !== "edit" && diagnosticState.status === "running" });

  const setError = (error: unknown) => {
    diagnosticState = {
      ...diagnosticState,
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    };
  };

  const disposeState = () => {
    if (!controllerActive && !state && !initializationSignature && !pendingInitialization) return;
    controllerActive = false;
    if (state || initializationSignature) {
      serial += 1;
    }
    initializationSignature = null;
    pendingInitialization = null;
    emptySceneSignature = null;
    if (state) {
      const previous = state;
      state = null;
      // Give the authored materials and matrices back before the runtime goes
      // away: Stop must leave the scene exactly as it was authored.
      releasePhysicsPlaybackState(previous);
    }
    clock.reset();
    diagnosticState = { ...EMPTY_PHYSICS_PLAYBACK_DIAGNOSTICS };
  };

  const ensureState = (args: UpdateArgs): PhysicsPlaybackState | null => {
    controllerActive = true;
    const signature = signatureCache.get(args.objects, args.worldSettings);
    if (state?.signature === signature) return state;
    if (initializationSignature === signature) return null;
    if (emptySceneSignature === signature) return null;
    if (diagnosticState.status === "error" && initializationSignature === null) return null;
    if (preparation === "failed") return null;

    disposeState();
    controllerActive = true;
    if (!webGpuDeviceFor(args.renderer)) {
      diagnosticState = { ...EMPTY_PHYSICS_PLAYBACK_DIAGNOSTICS, status: "waiting-for-device" };
      if (!warnedDevice) {
        warnedDevice = true;
        console.warn("[physics] Play Mode is waiting for a WebGPU device.");
      }
      return null;
    }
    warnedDevice = false;

    const build = compileAuthoredPhysicsScene(args.objects, "play-mode", args.worldSettings);
    for (const diagnostic of build.diagnostics) {
      console.warn(`[physics:${diagnostic.code}] ${diagnostic.objectId}: ${diagnostic.message}`);
    }
    if (build.bodies.length === 0 && !driver?.runtimeBodyCapacity) {
      if (build.diagnostics.some((issue) => issue.severity === "error")) {
        setError(new Error(build.diagnostics.map((issue) => issue.message).join("\n")));
      } else {
        emptySceneSignature = signature;
      }
      return null;
    }

    clock = new FixedStepClock({
      fixedTimestep: args.worldSettings.fixedTimestep,
      maxSubsteps: args.worldSettings.maxSubsteps,
    });
    const initializationSerial = serial;
    initializationSignature = signature;
    pendingInitialization = {
      serial: initializationSerial,
      signature,
      build,
      args,
    };
    if (preparation === "idle") {
      preparation = "requested";
    }
    diagnosticState = {
      ...EMPTY_PHYSICS_PLAYBACK_DIAGNOSTICS,
      status: "initializing",
      backend: backend.id,
      bodyCount: build.bodies.length,
    };
    return null;
  };

  const startPreparation = (renderer: ViewportRenderer): void => {
    const device = webGpuDeviceFor(renderer);
    if (!device) {
      preparation = "requested";
      diagnosticState = { ...diagnosticState, status: "waiting-for-device" };
      return;
    }
    void backend.prepare(device)
      .then((factory) => {
        if (disposed) return;
        runtimeFactory = factory;
        preparation = "ready";
        onChanged();
      })
      .catch((error) => {
        if (disposed) return;
        preparation = "failed";
        pendingInitialization = null;
        initializationSignature = null;
        setError(error);
        if (!warnedRuntime) {
          warnedRuntime = true;
          console.error("[physics] WebGPU pipeline preparation failed", error);
        }
      });
  };

  const flushKinematicMotorDeltas = (current: PhysicsPlaybackState): void => {
    motors.flush(characterMotorState(current), onChanged);
  };

  const initializePlayback = (pending: PendingInitialization): void => {
    const factory = runtimeFactory;
    if (
      !factory
      || pending !== pendingInitialization
      || pending.serial !== serial
      || latestSchedule?.mode === "edit"
    ) return;

    let runtime: PhysicsPlaybackSolver | null = null;
    try {
      const world = factory.createWorld(pending.build, driver?.runtimeBodyCapacity ?? 0);
      runtime = world.runtime;
      const nextState = createPhysicsPlaybackState({
        signature: pending.signature,
        runtime,
        bodyBindings: world.bodyBindings,
        renderer: pending.args.renderer,
        objects: pending.args.objects,
        worldSettings: pending.args.worldSettings,
        retireResources,
        onBodyRetired: motors.forget,
      });
      state = nextState;
      pendingInitialization = null;
      initializationSignature = null;
      flushKinematicMotorDeltas(nextState);
      diagnosticState = diagnosticsForPhysicsPlayback(nextState, clock, 0);
      console.info(`[physics] Impulse solver active (${runtime.capacity.bodyCount} bodies).`);
      warnedRuntime = false;
      onChanged();
    } catch (error) {
      runtime?.dispose();
      if (pending.serial !== serial) return;
      pendingInitialization = null;
      initializationSignature = null;
      setError(error);
      if (!warnedRuntime) {
        warnedRuntime = true;
        console.error("[physics] Play Mode physics failed to start", error);
      }
      throw error;
    }
  };

  const selectDeviceWork: PhysicsPlaybackDeviceWorkSelector = (renderer) => {
    if (diagnosticState.status === "error") return null;
    if (preparation === "requested") {
      preparation = "running";
      return {
        kind: "operation",
        execute: () => startPreparation(renderer),
      };
    }

    const initialization = pendingInitialization;
    if (initialization && runtimeFactory) {
      return {
        kind: "operation",
        execute: () => initializePlayback(initialization),
      };
    }

    const args = latestSchedule;
    const current = state;
    if (!args || !current || args.mode === "edit") return null;
    if (!fixedStepsReady()) return null;
    const playingSteps = args.mode === "playing" ? clock.availableSteps : 0;
    const explicitStep = args.mode === "paused" && args.stepToken !== lastStepToken;
    const stepCount = explicitStep ? 1 : playingSteps;
    const newPoseTargets = bindPhysicsPoseTargets(current);
    if (stepCount <= 0) {
      if (!motors.hasPending() && !newPoseTargets) return null;
      return {
        kind: "operation",
        execute: (_renderer, context) => {
          flushKinematicMotorDeltas(current);
          current.runtime.publishPoseTargets();
          current.runtime.retainUntil?.(context.retirement);
          current.poseRevision += 1;
          onChanged();
        },
      };
    }

    const batchSerial = serial;
    const batchDriver = driver;
    const firstStepId = current.submittedStepId + 1;
    let submittedCount = 0;
    let submittedStepId = current.submittedStepId;
    return {
      kind: "solver-batch",
      runtime: current.runtime,
      stepCount,
      beforeSubmit: () => flushKinematicMotorDeltas(current),
      beforeStep: (offset) => {
        if (driver !== batchDriver || (batchDriver && !batchDriver.ready()) || state !== current) return false;
        const index = firstStepId + offset;
        const tick = { index, deltaSeconds: clock.fixedTimestep, elapsedSeconds: index * clock.fixedTimestep };
        if (batchDriver && !batchDriver.beforeStep(tick)) return false;
        for (const listener of fixedStepListeners) if (!listener(tick)) return false;
        flushKinematicMotorDeltas(current);
        return state === current;
      },
      onSubmitted: (count) => {
        submittedCount = count;
        const batch = explicitStep ? clock.stepOnce() : clock.consume(count);
        submittedStepId = batch.lastStepId;
        current.submittedStepId = submittedStepId;
        current.poseRevision += 1;
        current.inFlightBatches += 1;
        if (explicitStep) lastStepToken = args.stepToken;
        // Pixels change through GPU-resident pose buffers; no CPU pose is applied.
        onChanged();
      },
      onCompleted: (durationMilliseconds) => {
        if (batchSerial !== serial || state !== current) return;
        current.stepDuration.recordBatch(durationMilliseconds, submittedCount);
        current.completedStepId = Math.max(current.completedStepId, submittedStepId);
        current.appliedStepId = current.completedStepId;
      },
      onSettled: () => {
        if (batchSerial === serial && state === current) current.inFlightBatches -= 1;
      },
      onError: (error) => {
        if (batchSerial !== serial || state !== current) return;
        setError(error);
        console.error("[physics] Play Mode physics batch failed", error);
      },
    };
  };

  const hasDeviceWork = (): boolean => {
    if (diagnosticState.status === "error") return false;
    if (preparation === "requested") return true;
    if (pendingInitialization && runtimeFactory) return true;
    const args = latestSchedule;
    if (!args || !state || args.mode === "edit") return false;
    if (!fixedStepsReady()) return false;
    return (
      motors.hasPending()
      || (!state.poseTargetsBound && state.poseBuffers.gpuTargets(state.renderer) !== null)
      || (args.mode === "playing" && clock.availableSteps > 0)
      || (args.mode === "paused" && args.stepToken !== lastStepToken)
    );
  };

  const requestDeviceWork = (opportunity: DeviceRenderOpportunity): boolean => {
    if (deviceTasks.hasPendingAdmission()) return true;
    if (!hasDeviceWork()) return false;
    try {
      return deviceTasks.request(opportunity, selectDeviceWork) !== "rejected";
    } catch (error) {
      setError(error);
      console.error("[physics] Device task admission failed", error);
      return false;
    }
  };

  return {
    bindRuntimeModel(node, entity) {
      if (!state) throw new Error("Runtime model binding requires a running physics world.");
      return state.entities.bindModel(node, entity);
    },
    entityBackend() {
      if (!state || diagnosticState.status !== "running") throw new Error("Runtime entities require a running physics world.");
      return state.entities.backend;
    },
    attachFixedStepDriver(next) {
      if (driver) throw new Error("The physics world already has a fixed-step driver.");
      driver = next;
      onChanged();
      return () => { if (driver === next) { driver = null; onChanged(); } };
    },
    subscribeFixedStep(listener) {
      if (fixedStepListeners.size >= 16) throw new Error("Physics fixed-step observer capacity exceeded (16).");
      fixedStepListeners.add(listener);
      return () => { fixedStepListeners.delete(listener); };
    },
    fixedStepsReady,
    interpolationAlpha: () => clock.interpolationAlpha,
    refreshTransport(input) {
      if (latestSchedule) latestSchedule = { ...latestSchedule, ...input };
    },
    prepare(_renderer) {
      if (disposed) return;
      if (preparation === "idle") preparation = "requested";
      onChanged();
    },
    present(runtime) {
      state?.entities.present(runtime);
      return state?.views.present(runtime, state.poseRevision) ?? false;
    },
    detach(runtime) {
      state?.entities.detach(runtime);
      state?.views.detach(runtime);
    },
    reset(stepToken) {
      motors.reset();
      lastStepToken = stepToken;
      latestSchedule = null;
      disposeState();
    },
    schedule(args) {
      if (disposed) return false;
      latestSchedule = args;
      if (args.mode === "edit") {
        motors.reset();
        lastStepToken = args.stepToken;
        disposeState();
        return requestDeviceWork(args.opportunity);
      }

      const current = ensureState(args);
      if (!current) {
        return requestDeviceWork(args.opportunity);
      }

      if (args.mode === "playing" && fixedStepsReady()) {
        const accumulation = clock.accumulate(args.frameDeltaSeconds);
        if (accumulation.droppedSeconds > 0) {
          diagnosticState = { ...diagnosticState, droppedSeconds: accumulation.totalDroppedSeconds };
        }
      }
      const scheduled = requestDeviceWork(args.opportunity);

      if (diagnosticState.status !== "error") {
        diagnosticState = diagnosticsForPhysicsPlayback(
          current,
          clock,
          diagnosticState.droppedSeconds,
          deviceTasks.hasPendingAdmission(),
        );
      }
      return scheduled;
    },
    hasPendingAdmission: deviceTasks.hasPendingAdmission,
    hasPendingDeviceWork: () => (
      !disposed && diagnosticState.status !== "error" && (
        deviceTasks.hasPendingAdmission()
        || preparation === "requested"
        || preparation === "running"
        || pendingInitialization !== null
        || hasDeviceWork()
      )
    ),
    diagnostics() {
      // Queue retirement can finish while all views are suspended. Report its
      // current counters without requiring another render/simulation schedule.
      if (state && diagnosticState.status === "running") {
        diagnosticState = diagnosticsForPhysicsPlayback(state, clock, diagnosticState.droppedSeconds, deviceTasks.hasPendingAdmission());
      }
      return diagnosticState;
    },
    ...commands,
    dispose() {
      if (disposed) return;
      disposed = true;
      driver = null;
      fixedStepListeners.clear();
      motors.reset();
      disposeState();
      latestSchedule = null;
      deviceTasks.dispose();
    },
  };
}

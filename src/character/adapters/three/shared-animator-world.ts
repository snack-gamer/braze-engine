import type { BrowserThreeWebGpuRenderSession } from "../../../rendering/adapters/browser-three-webgpu-session";
import type { PhysicsPlaybackInput } from "../../../physics/runtime/playback-input";
import type { Runtime } from "../../../three/runtime";
import { sharedBrowserEngineLoop } from "../../../runtime/browser-engine-loop";
import type { EngineLoop } from "../../../runtime/engine-loop";
import { physicsWorldForSession } from "../../../three/physics/shared-physics-world";
import { playSceneLifetimeFor } from "../../../gameplay/adapters/play-scene-lifetime";
import { createAnimatorPlaybackCommandProxy } from "../../application/playback/animator-playback-commands";
import { createAnimatorPlaybackEventPublisher } from "../../application/playback/animator-playback-event-port";
import { createAnimatorIkGoalStore, createAnimatorIkCommandProxy } from "../../application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../../application/playback/animator-root-motion-port";
import type { AnimatorPlaybackBinding } from "../../application/playback/animator-playback-binding";
import type { CharacterPlaybackAssetCatalog } from "../../application/CharacterPlaybackAssetProvider";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import { ThreeAnimatorPlaybackSnapshotLatch } from "./three-animator-playback-snapshot";
import { ThreeAnimatorWorldCoordinator } from "./three-animator-world-coordinator";
import type { Group, Object3D } from "three";
import type { EntityHandle } from "../../../world/domain/entity-world";
import type { RuntimeAnimatorCreation } from "./three-animator-runtime-contracts";
import { runtimePhysicsCapacity } from "virtual:braze-game-module";

type Source = () => PhysicsPlaybackInput;
const EMPTY_CATALOG: CharacterPlaybackAssetCatalog = { ready: false, importedAssets: [], library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} } };
type World = ReturnType<typeof createSharedAnimatorWorld>;
const worlds = new WeakMap<BrowserThreeWebGpuRenderSession, { world: World; references: number }>();

export function animatorWorldForSession(session: BrowserThreeWebGpuRenderSession) { return worlds.get(session)?.world ?? null; }
export function retainAnimatorWorld(session: BrowserThreeWebGpuRenderSession) {
  let record = worlds.get(session);
  if (!record) { record = { world: createSharedAnimatorWorld(session), references: 0 }; worlds.set(session, record); }
  record.references++;
  let released = false;
  return { world: record.world, release() {
    if (released) return;
    released = true;
    if (--record.references === 0) { worlds.delete(session); record.world.dispose(); }
  } };
}

/** Transport owns Play; viewport leases only attach clockless pose targets. */
export function createSharedAnimatorWorld(renderSession: BrowserThreeWebGpuRenderSession, loop: EngineLoop = sharedBrowserEngineLoop(), createCoordinator = (input: ConstructorParameters<typeof ThreeAnimatorWorldCoordinator>[0]) => new ThreeAnimatorWorldCoordinator(input)) {
  const latch = new ThreeAnimatorPlaybackSnapshotLatch();
  const views = new Map<Runtime, () => void>();
  const diagnosticsListeners = new Set<(diagnostics: readonly CharacterRuntimeDiagnostic[]) => void>();
  const traceListeners = new Map<string, Set<() => void>>();
  let captured: PhysicsPlaybackInput | null = null;
  let publishedCatalog = EMPTY_CATALOG;
  let source: Source | null = null, coordinator: ThreeAnimatorWorldCoordinator | null = null;
  let disposed = false, lastStepToken = 0, stepRequested = false, suspended = true;
  let fixedSeconds = 1 / 60, needsPhysics = false, physicsUnsubscribe: (() => void) | null = null;
  let events = createAnimatorPlaybackEventPublisher(), ik = createAnimatorIkGoalStore(), motion = createAnimatorRootMotionStore();
  const notify = (id: string) => { for (const listener of traceListeners.get(id) ?? []) { try { listener(); } catch { /* Observers cannot stop simulation. */ } } };
  const report = (diagnostics: readonly CharacterRuntimeDiagnostic[]) => {
    for (const listener of diagnosticsListeners) { try { listener(diagnostics); } catch { /* Observer isolation. */ } }
  };
  const participant = loop.createParticipant({ simulation(frame) {
    if (disposed || !coordinator || !source) return;
    const input = source();
    if (!coordinator.hasViews()) { suspended = true; return; }
    const justResumed = suspended; suspended = false;
    if (!needsPhysics && stepRequested && input.mode === "paused") {
      stepRequested = false; coordinator.advance({ deltaSeconds: fixedSeconds, unscaledDeltaSeconds: fixedSeconds });
    } else if (input.mode === "playing" && !justResumed) coordinator.advance({ deltaSeconds: frame.deltaSeconds, unscaledDeltaSeconds: frame.unscaledDeltaSeconds }, needsPhysics ? "frame" : "all");
    if (input.mode === "playing" && coordinator.requiresContinuousFrames(frame.timeScale)) participant.requestFrame();
  } });
  const stop = () => {
    physicsUnsubscribe?.(); physicsUnsubscribe = null;
    const previous = coordinator; coordinator = null; captured = null; latch.reset();
    for (const [runtime, detach] of views) { detach(); views.set(runtime, () => undefined); }
    previous?.dispose();
    events.dispose(); ik.dispose(); motion.dispose();
    events = createAnimatorPlaybackEventPublisher(undefined, (diagnostic) => report([diagnostic]));
    ik = createAnimatorIkGoalStore(); motion = createAnimatorRootMotionStore((diagnostic) => report([diagnostic]));
    stepRequested = false; suspended = true; participant.cancelFrame();
    for (const id of traceListeners.keys()) notify(id);
  };
  const lifetime = playSceneLifetimeFor(renderSession);
  const detachLifetime = lifetime.subscribe(() => {
    for (const id of lifetime.snapshot()) coordinator?.remove(id);
  });
  const refresh = () => {
    if (disposed) return;
    const input = source?.();
    if (!input || input.mode === "edit") {
      stop(); lastStepToken = input?.stepToken ?? 0;
      if (input) latch.resolve("edit", publishedCatalog.ready, publishedCatalog, input.objects);
      return;
    }
    captured ??= { ...input, objects: structuredClone(input.objects), worldSettings: { ...input.worldSettings } };
    const catalog = latch.resolve(input.mode, publishedCatalog.ready, publishedCatalog, captured.objects);
    if (catalog && !coordinator) {
      fixedSeconds = captured.worldSettings.fixedTimestep;
      needsPhysics = runtimePhysicsCapacity > 0 || captured.objects.some((object) => object.rigidbody?.enabled || object.characterController?.enabled || object.colliders?.some((collider) => collider.enabled));
      coordinator = createCoordinator({ objects: captured.objects, catalog, fixedStepSeconds: fixedSeconds,
        ikStore: ik, rootMotionStore: motion, onEvent: events.publish, onChange: notify, onDiagnostics: report,
        wake: () => participant.requestFrame(),
        physicsMotorFor: (id) => physicsWorldForSession(renderSession)?.characterMotorFor(id),
      });
      for (const runtime of views.keys()) views.set(runtime, coordinator.attachView(runtime));
      for (const id of lifetime.snapshot()) coordinator.remove(id);
    }
    if (coordinator && needsPhysics && !physicsUnsubscribe) {
      physicsUnsubscribe = physicsWorldForSession(renderSession)?.subscribeFixedStep((tick) => {
        const mode = source?.().mode;
        if (coordinator?.hasViews() && mode && mode !== "edit") coordinator.advance({ deltaSeconds: tick.deltaSeconds, unscaledDeltaSeconds: tick.deltaSeconds }, mode === "paused" ? "all" : "fixed");
        return true;
      }) ?? null;
    }
    if (input.mode === "paused" && input.stepToken !== lastStepToken) stepRequested = true;
    if (input.mode === "playing") stepRequested = false;
    lastStepToken = input.stepToken;
    participant.requestFrame();
  };
  const binding: AnimatorPlaybackBinding = {
    commands: createAnimatorPlaybackCommandProxy(() => coordinator?.commands),
    events: { subscribe: (listener) => events.port.subscribe(listener) },
    ik: createAnimatorIkCommandProxy(() => disposed ? undefined : ik.commands),
    rootMotion: { registerMotor: (...args) => motion.port.registerMotor(...args), subscribe: (...args) => motion.port.subscribe(...args) },
    trace: {
      state: (id) => coordinator?.runtimeState(id) ?? null,
      controller: (id) => coordinator?.runtimeController(id) ?? null,
      subscribe(id, listener) {
        const listeners = traceListeners.get(id) ?? new Set(); listeners.add(listener); traceListeners.set(id, listeners);
        return () => { listeners.delete(listener); if (!listeners.size) traceListeners.delete(id); };
      },
    },
    diagnostics: () => coordinator?.diagnostics() ?? [],
  };
  return {
    binding, refresh,
    prepareRuntimeChange(created: readonly RuntimeAnimatorCreation[], removedIds: readonly string[]) {
      const releaseTransferred = () => {
        for (const rig of new Set(created.map((item) => item.rig))) { try { rig.dispose(); } catch { /* All transferred rigs must be released. */ } }
      };
      try { refresh(); } catch (error) { releaseTransferred(); throw error; }
      if (!coordinator || disposed) {
        releaseTransferred();
        throw new Error("The animation world is not ready for runtime prefabs.");
      }
      return coordinator.prepareRuntimeChange(created, removedIds);
    },
    attachRuntimeView(id: string, runtime: Runtime, node: Group, body: Object3D) {
      if (!coordinator || disposed) throw new Error("The animation world is not ready for runtime views.");
      return coordinator.attachRuntimeView(id, runtime, node, body);
    },
    runtimeAnimatorId: (entity: EntityHandle) => coordinator?.runtimeAnimatorId(entity),
    runtimeEntity: (id: string) => coordinator?.runtimeEntity(id),
    publishCatalog(catalog: CharacterPlaybackAssetCatalog) { publishedCatalog = catalog; refresh(); },
    liveSessionCount: () => coordinator?.liveSessionCount() ?? 0,
    addSource(next: Source) {
      if (source) throw new Error("An animation world already has a Play transport owner.");
      source = next; lastStepToken = next().stepToken; refresh();
      return () => { if (source === next) { source = null; stop(); } };
    },
    attachView(runtime: Runtime) {
      if (views.size >= 16 || views.has(runtime)) throw new Error("Animator view is duplicate or exceeds capacity (16).");
      views.set(runtime, coordinator?.attachView(runtime) ?? (() => undefined)); refresh();
      return () => { views.get(runtime)?.(); views.delete(runtime); if (!views.size) { suspended = true; participant.cancelFrame(); } };
    },
    subscribeDiagnostics(listener: (diagnostics: readonly CharacterRuntimeDiagnostic[]) => void) {
      diagnosticsListeners.add(listener); listener(binding.diagnostics()); return () => { diagnosticsListeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true; stop(); detachLifetime(); participant.dispose(); events.dispose(); ik.dispose(); motion.dispose();
      views.clear(); diagnosticsListeners.clear(); traceListeners.clear(); source = null;
    },
  };
}

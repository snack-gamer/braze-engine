import { captureCollisionMesh } from "./capture-collision-mesh";
import type { PhysicsPlaybackInput } from "../../physics/runtime/playback-input";
import type { ThreeWebGpuRenderSession } from "../../rendering/adapters/three-webgpu-render-session-contract";
import { sharedBrowserEngineLoop } from "../../runtime/browser-engine-loop";
import type { ViewportRenderer } from "../renderer";
import { markSceneDirty, type Runtime } from "../runtime";
import { createPhysicsPlaybackController } from "./playback-controller";
import type { PhysicsViewportPlayback } from "./physics-viewport-playback";

type WorldSource = () => PhysicsPlaybackInput;
type View = { runtime: Runtime | null; input: PhysicsPlaybackInput | null };
type SharedWorld = ReturnType<typeof createSharedPhysicsWorld>;
type WorldRecord = { world: SharedWorld; references: number };
const worlds = new WeakMap<ThreeWebGpuRenderSession, WorldRecord>();

/** Read the existing session; automation never creates a second simulation. */
export function physicsWorldForSession(session: ThreeWebGpuRenderSession) {
  return worlds.get(session)?.world ?? null;
}

/** The editor transport retains the world even when every viewport is closed. */
export function retainPhysicsWorld(session: ThreeWebGpuRenderSession) {
  let record = worlds.get(session);
  if (!record) {
    record = { world: createSharedPhysicsWorld(session), references: 0 };
    worlds.set(session, record);
  }
  record.references += 1;
  let released = false;
  return {
    world: record.world,
    release() {
      if (released) return;
      released = true;
      record.references -= 1;
      if (record.references > 0) return;
      worlds.delete(session);
      record.world.dispose();
    },
  };
}

export function createPhysicsViewportPlayback(session: ThreeWebGpuRenderSession): PhysicsViewportPlayback {
  const lease = retainPhysicsWorld(session);
  const view = lease.world.attachView();
  return { ...view, dispose: () => { view.dispose(); lease.release(); } };
}

/**
 * One main-scene world per device session. Clock, transport, view leases,
 * and command ownership live here.
 */
function createSharedPhysicsWorld(session: ThreeWebGpuRenderSession) {
  const views = new Set<View>();
  const sources = new Set<WorldSource>();
  const motorOwners = new Map<string, View>();
  let renderer: ViewportRenderer | null = null;
  let disposed = false;

  const input = (): PhysicsPlaybackInput | null => {
    const source = sources.values().next().value;
    if (source) return source();
    for (const view of views) if (view.input) return view.input;
    return null;
  };
  const wake = () => {
    if (disposed) return;
    participant.requestFrame();
    for (const view of views) if (view.runtime) markSceneDirty(view.runtime);
  };
  const controller = createPhysicsPlaybackController(
    session.registerDeviceTaskLane("physics:main-world"), wake, undefined, session.retireResources,
  );
  const participant = sharedBrowserEngineLoop().createParticipant({
    afterRender(frame) {
      if (disposed || views.size === 0 || session.getStatus() !== "ready" || !renderer) return;
      const current = input();
      if (!current) return;
      controller.schedule({
        ...current,
        renderer,
        frameDeltaSeconds: frame.deltaSeconds,
        opportunity: session.opportunityForFrame(frame.index, frame.nowMilliseconds),
      });
      const diagnostics = controller.diagnostics();
      if (
        (current.mode === "playing" && diagnostics.bodyCount > 0 && controller.fixedStepsReady())
        || controller.hasPendingDeviceWork()
        || diagnostics.simulationPending
      ) participant.requestFrame();
    },
  });
  const refresh = () => {
    const current = input();
    if (current) controller.refreshTransport(current);
    if (current?.mode === "edit") {
      // Stop is synchronous with the transport update, before reconciliation
      // can replace meshes whose original materials are still held by a view.
      controller.reset(current.stepToken);
      motorOwners.clear();
    }
    wake();
  };

  return {
    refresh,
    diagnostics: controller.diagnostics,
    entityBackend: controller.entityBackend,
    bindRuntimeModel: controller.bindRuntimeModel,
    attachFixedStepDriver: controller.attachFixedStepDriver,
    subscribeFixedStep: controller.subscribeFixedStep,
    characterMotorFor: controller.characterMotorFor,
    runtimeCharacterMotorFor: controller.runtimeCharacterMotorFor,
    moveRuntimeCharacter: controller.moveRuntimeCharacter,
    snapshotRuntimeCharacter: controller.snapshotRuntimeCharacter,
    snapshotCharacter: controller.snapshotCharacter,
    sweepStaticSphere: controller.sweepStaticSphere,
    interpolationAlpha: controller.interpolationAlpha,
    queueBodyCommand: controller.queueBodyCommand,
    moveCharacter: controller.moveCharacter,
    readEvents: controller.readEvents,
    captureCollisionMesh(objectId: string) {
      if (input()?.mode !== "edit") throw new Error("Stop Play Mode before baking collision geometry.");
      const runtime = [...views].find((view) => view.runtime?.objectMap.has(objectId))?.runtime;
      if (!runtime) throw new Error("Open a scene viewport before baking collision geometry.");
      return captureCollisionMesh(runtime, objectId);
    },
    addSource(source: WorldSource) {
      sources.add(source);
      refresh();
      return () => { sources.delete(source); };
    },
    attachView(): PhysicsViewportPlayback {
      const view: View = { runtime: null, input: null };
      views.add(view);
      let detached = false;
      const observeRuntime = (runtime: Runtime) => {
        if (detached || view.runtime === runtime) return;
        if (view.runtime) controller.detach(view.runtime);
        view.runtime = runtime;
        renderer = runtime.renderer;
      };
      return {
        prepare(runtime) {
          observeRuntime(runtime);
          controller.prepare(runtime.renderer);
        },
        present(args) {
          if (detached) return false;
          observeRuntime(args.runtime);
          if (args.mode === "edit" || input()?.mode === "edit") {
            controller.detach(args.runtime);
            return false;
          }
          return controller.present(args.runtime);
        },
        schedule(args) {
          if (detached) return false;
          observeRuntime(args.runtime);
          view.input = args;
          participant.requestFrame();
          return controller.hasPendingAdmission();
        },
        hasPendingAdmission: controller.hasPendingAdmission,
        hasPendingDeviceWork: controller.hasPendingDeviceWork,
        diagnostics: controller.diagnostics,
        characterMotorFor(objectId) {
          return {
            applyRootMotion(application) {
              if (detached || input()?.mode === "edit") return;
              // Both views animate, but only one may produce commands for a
              // character. Ownership remains stable until that view detaches.
              const owner = motorOwners.get(objectId);
              if (owner && owner !== view) return;
              motorOwners.set(objectId, view);
              controller.characterMotorFor(objectId).applyRootMotion(application);
            },
          };
        },
        dispose() {
          if (detached) return;
          detached = true;
          if (view.runtime) controller.detach(view.runtime);
          views.delete(view);
          for (const [objectId, owner] of motorOwners) {
            if (owner === view) motorOwners.delete(objectId);
          }
          view.runtime = null;
          view.input = null;
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      participant.dispose();
      controller.dispose();
      motorOwners.clear();
      views.clear();
      sources.clear();
      renderer = null;
    },
  };
}

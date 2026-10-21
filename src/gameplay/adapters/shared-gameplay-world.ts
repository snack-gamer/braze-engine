import { captureRuntimePrefabResourceCatalog } from "../../prefabs/adapters/runtime-prefab-resource-catalog";
import { createRuntimeModelBackend, type RuntimeModelBackend } from "../../prefabs/adapters/three/runtime-model-backend";
import { createRuntimeModelAnimation } from "../../prefabs/adapters/three/runtime-model-animation";
import { createRuntimeModelAssets } from "../../prefabs/adapters/three/runtime-model-assets";
import { loadGameModule, loadRuntimePrefabs, loadEntityTagCatalog, loadProjectInput, runtimePhysicsCapacity, hasGameModule } from "virtual:braze-game-module";
import type { PhysicsPlaybackInput } from "../../physics/runtime/playback-input";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { sharedBrowserEngineLoop } from "../../runtime/browser-engine-loop";
import { physicsWorldForSession, retainPhysicsWorld } from "../../three/physics/shared-physics-world";
import type { Runtime } from "../../three/runtime";
import type { GameplayDiagnostic } from "../domain/game-module";
import { createGameWorldSession } from "./game-world-session";
import { createGameEntityBackend } from "./game-entity-backend";

type Input = PhysicsPlaybackInput & { uiAssets?: readonly import("../../lib/asset-api").LibraryAsset[] };
type View = Readonly<{ runtime: Runtime; surface: HTMLElement | null }>;
type Run = {
  session: ReturnType<typeof createGameWorldSession> | null;
  models?: RuntimeModelBackend;
  started: boolean;
  needsPhysics: boolean;
  abort: AbortController;
  releasePhysics?: () => void;
};
type World = ReturnType<typeof createSharedGameplayWorld>;
const worlds = new WeakMap<BrowserThreeWebGpuRenderSession, { world: World; references: number }>();
export const gameplayWorldForSession = (session: BrowserThreeWebGpuRenderSession) => worlds.get(session)?.world;

/** Hosts retain Play; views retain only their attachments to the same world. */
export function retainGameplayWorld(renderSession: BrowserThreeWebGpuRenderSession) {
  let record = worlds.get(renderSession);
  if (!record) {
    record = { world: createSharedGameplayWorld(renderSession), references: 0 };
    worlds.set(renderSession, record);
  }
  record.references += 1;
  let released = false;
  return {
    world: record.world,
    release() {
      if (released) return;
      released = true;
      if (--record.references > 0) return;
      worlds.delete(renderSession); record.world.dispose();
    },
  };
}

/** Transport, startup and view attachment for one main-scene gameplay world. */
function createSharedGameplayWorld(renderSession: BrowserThreeWebGpuRenderSession) {
  const loop = sharedBrowserEngineLoop();
  const views = new Set<View>(), listeners = new Set<() => void>();
  let source: (() => Input) | null = null;
  let run: Run | null = null, failure: GameplayDiagnostic | null = null;
  let selected: View | null = null, detachSurface: (() => void) | null = null;
  let lastStepToken = 0, stepRequested = false, disposed = false;
  const notify = () => { for (const listener of listeners) listener(); };
  const report = (diagnostic: GameplayDiagnostic) => {
    const log = diagnostic.code === "gameplay-time-dropped" ? console.warn : console.error;
    log(`[${diagnostic.code}] ${diagnostic.message}`);
    if (diagnostic.code !== "gameplay-time-dropped" && diagnostic.code !== "entity-behavior-failed") { failure = diagnostic; notify(); }
  };
  const hasView = (ready: boolean) => {
    for (const view of views) if (!view.runtime.disposed && (!ready || view.runtime.pendingAssetLoads.size === 0)) return true;
    return false;
  };
  const refreshSurface = () => {
    let next: View | null = null;
    for (const view of views) if (!view.runtime.disposed && view.surface) { next = view; break; }
    if (selected === next) return;
    detachSurface?.(); detachSurface = null; selected = next;
    if (next?.surface && run?.session) detachSurface = run.session.attachSurface(next.runtime, next.surface);
  };
  const stop = () => {
    const previous = run; run = null;
    previous?.abort.abort();
    detachSurface?.(); detachSurface = null; selected = null;
    previous?.session?.dispose();
    if (!previous?.session) void previous?.models?.backend.dispose();
    stepRequested = false;
    previous?.releasePhysics?.();
    participant.cancelFrame();
  };
  const participant = loop.createParticipant({
    gameplay(frame) {
      const current = run, input = source?.();
      if (disposed || !current?.session || !input || input.mode === "edit" || failure) return;
      const available = hasView(true);
      current.session.setInputEnabled(available && input.mode === "playing" && frame.timeScale > 0);
      if (!available) {
        // Pending visible assets need opportunities; an absent surface does not.
        if (hasView(false)) participant.requestFrame();
        return;
      }
      const physics = current.needsPhysics ? physicsWorldForSession(renderSession)?.diagnostics() : null;
      if (physics?.status === "error") {
        report({ code: current.started ? "gameplay-update-failed" : "gameplay-start-failed",
          message: physics.lastError ?? "Physics failed; Stop and restart Play Mode." });
        current.session.dispose(); return;
      }
      if (!current.started) {
        if (renderSession.getStatus() !== "ready" || (current.needsPhysics && physics?.status !== "running")) {
          participant.requestFrame(); return;
        }
        current.started = true;
        void current.session.start().then(() => { if (run === current) participant.requestFrame(); });
      }
      if (current.session.status() !== "running") return;
      if (current.needsPhysics) {
        if (input.mode === "playing" && frame.deltaSeconds > 0) current.session.updateFrame({
          deltaSeconds: frame.deltaSeconds,
          interpolationAlpha: physicsWorldForSession(renderSession)?.interpolationAlpha() ?? 0,
        });
      } else if (stepRequested && input.mode === "paused") { stepRequested = false; current.session.step(); }
      else if (input.mode === "playing" && frame.deltaSeconds > 0) current.session.advance(frame.deltaSeconds);
      if (input.mode === "playing" && frame.timeScale > 0 && current.session.status() === "running") participant.requestFrame();
    },
  });
  const refresh = () => {
    if (disposed) return;
    const input = source?.();
    if (!input || input.mode === "edit") {
      stop(); lastStepToken = input?.stepToken ?? 0;
      if (failure) { failure = null; notify(); }
      return;
    }
    if (!run) {
      // Capture before deferred project import, once per Play lifetime.
      const objects = structuredClone(input.objects), settings = { ...input.worldSettings }, uiAssets = structuredClone(input.uiAssets ?? []);
      const current: Run = { session: null, started: false, abort: new AbortController(), needsPhysics: runtimePhysicsCapacity > 0 || objects.some((object) =>
        object.rigidbody?.enabled || object.characterController?.enabled || object.colliders?.some((collider) => collider.enabled)) };
      run = current;
      if (current.needsPhysics) {
        // Hold physics before the deferred import. The player may not yet have
        // attached a viewport; this lease also establishes its shared world.
        const lease = retainPhysicsWorld(renderSession);
        const ready = () => run === current && !failure && hasView(true)
          && current.session?.status() === "running"
          && (source?.().mode === "paused" || (source?.().mode === "playing" && loop.getTimeScale() > 0));
        const detach = lease.world.attachFixedStepDriver({
          runtimeBodyCapacity: runtimePhysicsCapacity,
          ready,
          beforeStep: (tick) => ready() && current.session!.fixedTick(tick),
        });
        current.releasePhysics = () => { detach(); lease.release(); };
      }
      void Promise.all([loadGameModule(), loadRuntimePrefabs(current.abort.signal), loadEntityTagCatalog(current.abort.signal), loadProjectInput(current.abort.signal)]).then(([module, prefabs, tagCatalog, projectInput]) => {
        if (run !== current || disposed) return;
        if (hasGameModule && !module) throw new Error("The configured gameplay entry has no default GameModule export.");
        const resources = captureRuntimePrefabResourceCatalog(prefabs);
        // Runtime prefab catalogs require a project entry. Stock-only authored
        // controls need the world host, but not runtime model asset preparation.
        if (hasGameModule && resources.models.size) {
          current.models = createRuntimeModelBackend(resources, (node, entity) => {
            const physics = physicsWorldForSession(renderSession);
            if (!physics) throw new Error("Runtime model physics world is unavailable.");
            return physics.bindRuntimeModel(node, entity);
          }, renderSession.retireResources, createRuntimeModelAssets(resources), createRuntimeModelAnimation(resources, prefabs, renderSession));
          for (const view of views) current.models.attach(view.runtime);
        }
        current.session = createGameWorldSession({ module, renderSession, objects, prefabs, tagCatalog, projectInput, uiAssets, worldSettings: settings,
          entityBackend: createGameEntityBackend(renderSession, current.needsPhysics, objects, current.models?.backend),
          timing: { fixedTimestep: settings.fixedTimestep, maxSubsteps: settings.maxSubsteps },
          report: (diagnostic) => { if (run === current) report(diagnostic); },
        });
        selected = null; refreshSurface(); participant.requestFrame();
      }).catch((error: unknown) => {
        if (run === current) {
          current.session?.dispose();
          if (!current.session) void current.models?.backend.dispose();
          report({ code: "gameplay-start-failed", message: String(error) });
        }
      });
    }
    if (input.mode === "paused" && input.stepToken !== lastStepToken) stepRequested = true;
    if (input.mode === "playing") stepRequested = false;
    lastStepToken = input.stepToken;
    run.session?.setInputEnabled(input.mode === "playing" && loop.getTimeScale() > 0);
    participant.requestFrame();
  };
  return {
    refresh,
    inspectUi(screenId?: string, offset?: number, limit?: number) {
      if (!run?.session || run.session.status() !== "running") throw new Error("Enter Play and wait for gameplay readiness before inspecting UI.");
      return run.session.inspectUi(screenId, offset, limit);
    },
    failure: () => failure,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    addSource(next: () => Input) {
      if (source) throw new Error("A gameplay world already has a Play transport owner.");
      source = next; lastStepToken = next().stepToken; refresh();
      return () => { if (source === next) { source = null; refresh(); } };
    },
    attachView(view: View) {
      if (views.size >= 16) throw new Error("Gameplay view capacity exceeded (16).");
      run?.models?.attach(view.runtime);
      views.add(view); refreshSurface(); participant.requestFrame();
      return () => {
        void run?.models?.detach(view.runtime)?.catch((error) => console.error("[runtime-models] View retirement failed", error));
        views.delete(view); refreshSurface();
        if (!views.size) { run?.session?.setInputEnabled(false); participant.cancelFrame(); }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; stop(); participant.dispose(); views.clear(); listeners.clear(); source = null;
    },
  };
}

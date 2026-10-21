import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadGameModule, loadRuntimePrefabs, loadProjectInput } from "virtual:braze-game-module";
import { EngineLoop } from "../../runtime/engine-loop";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import type { PhysicsPlaybackInput } from "../../physics/runtime/playback-input";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { Runtime } from "../../three/runtime";
import type { GameContext, GameModule } from "../domain/game-module";
import { makeObject } from "../../lib/payload";
import { retainGameplayWorld } from "./shared-gameplay-world";
import type { PhysicsFixedStepDriver } from "../../physics/runtime/fixed-step-driver";
import { defaultColliderForObject } from "../../physics/authoring/component-defaults";

let loop: EngineLoop;
let driver: PhysicsFixedStepDriver | null = null;
let physicsError = false;
const physics = {
  diagnostics: () => ({ status: physicsError ? "error" : "running", lastError: physicsError ? "GPU submission failed" : undefined }), interpolationAlpha: () => 0,
  attachFixedStepDriver(next: PhysicsFixedStepDriver) { driver = next; return () => { driver = null; }; },
};
vi.mock("../../runtime/browser-engine-loop", () => ({ sharedBrowserEngineLoop: () => loop }));
const moduleFlags = vi.hoisted(() => ({ configured: true }));
vi.mock("virtual:braze-game-module", () => ({ loadGameModule: vi.fn(), loadRuntimePrefabs: vi.fn(async () => []), loadEntityTagCatalog: vi.fn(async () => undefined), loadProjectInput: vi.fn(async () => undefined), runtimePhysicsCapacity: 0, get hasGameModule() { return moduleFlags.configured; } }));
vi.mock("../../three/physics/shared-physics-world", () => ({
  physicsWorldForSession: () => physics,
  retainPhysicsWorld: () => ({ world: physics, release() {} }),
}));

beforeEach(() => { vi.clearAllMocks(); physicsError = false; moduleFlags.configured = true; });
afterEach(() => { loop.dispose(); vi.restoreAllMocks(); });

function harness(module: GameModule | null, physical = false) {
  let callback: ((now: number) => void) | null = null, now = 0;
  loop = new EngineLoop({ requestFrame(next) { callback = next; return 1; }, cancelFrame() { callback = null; }, reportError(error) { throw error; } });
  vi.mocked(loadGameModule).mockResolvedValue(module);
  const render = { getStatus: () => "ready" } as BrowserThreeWebGpuRenderSession;
  const host = retainGameplayWorld(render);
  let input: PhysicsPlaybackInput = { objects: [makeObject("cube", 0, { id: "original" })], worldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS, mode: "edit", stepToken: 0 };
  if (physical) input.objects[0].colliders = [defaultColliderForObject(input.objects[0])];
  const removeSource = host.world.addSource(() => input);
  const transport = (mode: PhysicsPlaybackInput["mode"], stepToken = input.stepToken) => {
    input = { ...input, mode, stepToken }; host.world.refresh();
  };
  const frame = () => { now += 1000 / 60; const next = callback; callback = null; next?.(now); };
  return {
    host, input, frame, transport, pending: () => callback !== null,
    async settle() { for (let i = 0; i < 8; i += 1) { await Promise.resolve(); frame(); } },
    attach() {
      const view = retainGameplayWorld(render);
      const detach = view.world.attachView({ runtime: { disposed: false, pendingAssetLoads: new Map() } as unknown as Runtime, surface: null });
      return () => { detach(); view.release(); };
    },
    dispose() { removeSource(); host.release(); },
  };
}

it("holds physics during import/create and advances gameplay only from admitted solver ticks", async () => {
  let complete!: (instance: { fixedUpdate: () => void; dispose: () => void }) => void;
  const fixedUpdate = vi.fn(), dispose = vi.fn();
  const h = harness({ version: 1, create: () => new Promise((resolve) => { complete = resolve; }) }, true);
  const detach = h.attach(); h.transport("playing");
  const attached = driver!;
  expect(attached.ready()).toBe(false);
  await h.settle(); expect(attached.ready()).toBe(false);
  complete({ fixedUpdate, dispose }); await h.settle();
  expect(attached.ready()).toBe(true); expect(fixedUpdate).not.toHaveBeenCalled();
  const tick = { index: 1, deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60 };
  expect(attached.beforeStep(tick)).toBe(true); expect(fixedUpdate).toHaveBeenCalledOnce();
  h.transport("paused", 1); await h.settle(); expect(fixedUpdate).toHaveBeenCalledOnce();
  attached.beforeStep({ ...tick, index: 2 }); expect(fixedUpdate).toHaveBeenCalledTimes(2);
  detach(); expect(attached.ready()).toBe(false);
  expect(attached.beforeStep({ ...tick, index: 3 })).toBe(false);
  h.transport("edit"); expect(driver).toBeNull(); expect(dispose).toHaveBeenCalledOnce();
  h.dispose();
});

it.each([false, true])("starts stock-only worlds only when a missing export belongs to an absent entry (configured=%s)", async (configured) => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  moduleFlags.configured = configured;
  const h = harness(null), detach = h.attach();
  h.transport("playing"); await h.settle();
  if (configured) {
    expect(h.host.world.failure()?.message).toContain("configured gameplay entry has no default GameModule export");
    expect(h.pending()).toBe(false);
  } else {
    expect(h.host.world.failure()).toBeNull(); expect(h.pending()).toBe(true);
    h.transport("paused"); await h.settle(); expect(h.host.world.failure()).toBeNull();
  }
  detach(); h.dispose();
});

it("stops gameplay when physics fails after startup", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dispose = vi.fn();
  const h = harness({ version: 1, create: () => ({ dispose }) }, true);
  const detach = h.attach(); h.transport("playing"); await h.settle();
  expect(driver!.ready()).toBe(true);
  physicsError = true; h.frame();
  expect(h.host.world.failure()?.message).toBe("GPU submission failed");
  expect(driver!.ready()).toBe(false); expect(dispose).toHaveBeenCalledOnce();
  detach(); h.dispose();
});

it("reports a failed entity behavior without suspending the shared world", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const healthy = vi.fn(), broken = vi.fn(() => { throw Error("controlled entity behavior fault"); });
  const h = harness({ version: 1, create(context) {
    context.behaviors.attach(context.world.findByAuthoredId("original")!, {
      name: "Fail once", create: () => ({ fixedUpdate: broken, dispose() {} }),
    });
    return { fixedUpdate: healthy, dispose() {} };
  } });
  const detach = h.attach(); h.transport("playing"); await h.settle();
  expect(broken).toHaveBeenCalledOnce(); expect(healthy.mock.calls.length).toBeGreaterThan(1);
  expect(error).toHaveBeenCalledOnce(); expect(h.host.world.failure()).toBeNull();
  detach(); h.dispose();
});

it("retains one Play instance across view changes and suspends without a view", async () => {
  let creates = 0, disposes = 0, ticks = 0;
  let context!: GameContext;
  const h = harness({ version: 1, create(value) { context = value; creates += 1; return { fixedUpdate() { ticks += 1; }, dispose() { disposes += 1; } }; } });
  const detach = h.attach(); h.transport("playing"); await h.settle();
  expect(creates).toBe(1); expect(ticks).toBeGreaterThan(0);
  detach(); const stoppedAt = ticks;
  for (let i = 0; i < 30; i += 1) h.frame();
  expect(ticks).toBe(stoppedAt); expect(h.pending()).toBe(false);
  expect(context.signal.aborted).toBe(false);
  const detachAgain = h.attach(); await h.settle();
  expect(creates).toBe(1); expect(ticks).toBeGreaterThan(stoppedAt);
  h.transport("paused"); const paused = ticks;
  await h.settle(); expect(ticks).toBe(paused);
  h.transport("paused", 1); await h.settle(); expect(ticks).toBe(paused + 1);
  detachAgain(); h.transport("edit");
  expect(disposes).toBe(1); expect(context.signal.aborted).toBe(true);
  const detachNew = h.attach(); h.transport("playing"); await h.settle();
  expect(creates).toBe(2);
  detachNew(); h.dispose(); expect(disposes).toBe(2);
});

it("two views do not duplicate ticks and losing one does not dispose the world", async () => {
  const update = vi.fn(), dispose = vi.fn(), create = vi.fn(() => ({ fixedUpdate: update, dispose }));
  const h = harness({ version: 1, create });
  const detachA = h.attach(), detachB = h.attach();
  h.transport("paused"); await h.settle();
  h.transport("paused", 1); await h.settle();
  expect(create).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledTimes(1);
  detachA(); expect(dispose).not.toHaveBeenCalled();
  h.transport("paused", 2); await h.settle(); expect(update).toHaveBeenCalledTimes(2);
  detachB(); h.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
});

it("captures before import and ignores an import resolved after Stop", async () => {
  const create = vi.fn(() => ({ dispose() {} }));
  const h = harness({ version: 1, create });
  let resolve!: (module: GameModule) => void;
  vi.mocked(loadGameModule).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const detach = h.attach(); h.transport("playing"); h.transport("edit");
  resolve({ version: 1, create }); await h.settle();
  expect(create).not.toHaveBeenCalled();
  let context!: GameContext;
  vi.mocked(loadGameModule).mockResolvedValue({ version: 1, create(value) { context = value; return { dispose() {} }; } });
  h.transport("playing"); h.input.objects[0].position[0] = 99;
  await h.settle(); expect(context.entities[0].authoredPosition[0]).not.toBe(99);
  detach(); h.dispose();
});

it("disposes stale asynchronous creation without disturbing the next Play", async () => {
  let resolve!: (instance: { dispose: () => void }) => void;
  const staleDispose = vi.fn(), freshDispose = vi.fn();
  const h = harness({ version: 1, create: () => new Promise((done) => { resolve = done; }) });
  const detach = h.attach(); h.transport("playing"); await h.settle();
  h.transport("edit");
  vi.mocked(loadGameModule).mockResolvedValue({ version: 1, create: () => ({ dispose: freshDispose }) });
  h.transport("playing"); await h.settle();
  resolve({ dispose: staleDispose }); await h.settle();
  expect(staleDispose).toHaveBeenCalledTimes(1); expect(freshDispose).not.toHaveBeenCalled();
  detach(); h.dispose(); expect(freshDispose).toHaveBeenCalledTimes(1);
});

it("preserves failure across view changes and only retries after Stop", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const create = vi.fn(() => { throw new Error("controlled failure"); });
  const h = harness({ version: 1, create });
  const detach = h.attach(); h.transport("playing"); await h.settle(); detach();
  expect(h.host.world.failure()?.message).toContain("controlled failure");
  const detachAgain = h.attach(); await h.settle(); expect(create).toHaveBeenCalledTimes(1);
  h.transport("edit"); expect(h.host.world.failure()).toBeNull();
  h.transport("playing"); await h.settle(); expect(create).toHaveBeenCalledTimes(2);
  detachAgain(); h.dispose();
});

it("aborts a pending prefab snapshot on Stop and ignores its late result", async () => {
  const create = vi.fn(() => ({ dispose() {} }));
  const h = harness({ version: 1, create });
  let resolve!: (value: []) => void, signal!: AbortSignal;
  vi.mocked(loadRuntimePrefabs).mockImplementationOnce((next) => {
    signal = next!;
    return new Promise((done) => { resolve = done; });
  });
  const detach = h.attach(); h.transport("playing"); await h.settle();
  expect(create).not.toHaveBeenCalled(); expect(signal.aborted).toBe(false);
  h.transport("edit"); expect(signal.aborted).toBe(true);
  h.transport("playing"); await h.settle(); expect(create).toHaveBeenCalledOnce();
  resolve([]); await h.settle(); expect(create).toHaveBeenCalledOnce();
  expect(h.host.world.failure()).toBeNull(); detach(); h.dispose();
});

it("captures selected input once per Play and isolates runtime rebinding from saved controls", async () => {
  const captured = { asset: { guid: "ab000000000000000000000000000001", localId: "main" }, revision: "a".repeat(64),
    document: { version: "braze/input-action-map-v1", name: "Controls", map: { version: 1, actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "KeyJ" }] }] } } };
  vi.mocked(loadProjectInput).mockResolvedValueOnce(captured as Awaited<ReturnType<typeof loadProjectInput>>);
  const contexts: GameContext[] = [];
  const h = harness({ version: 1, create(context) { contexts.push(context); return { dispose() {} }; } });
  const detach = h.attach(); h.transport("playing"); await h.settle();
  expect(contexts[0].input.bindings().actions[0].bindings[0]).toMatchObject({ code: "KeyJ" });
  captured.document.map.actions[0].bindings[0].code = "KeyK";
  contexts[0].input.rebind("fire", [{ device: "keyboard", code: "KeyR" }]);
  expect(contexts[0].input.bindings().actions[0].bindings[0]).toMatchObject({ code: "KeyR" });
  expect(captured.document.map.actions[0].bindings[0].code).toBe("KeyK");
  h.transport("edit");
  vi.mocked(loadProjectInput).mockResolvedValueOnce(captured as Awaited<ReturnType<typeof loadProjectInput>>);
  h.transport("playing"); await h.settle();
  expect(contexts[1].input.bindings().actions[0].bindings[0]).toMatchObject({ code: "KeyK" });
  expect(loadProjectInput).toHaveBeenCalledTimes(2); detach(); h.dispose();
});

it("aborts pending input capture on Stop and rejects malformed selection without invoking game create", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  let resolve!: (value: undefined) => void, signal!: AbortSignal;
  const create = vi.fn(() => ({ dispose() {} })), h = harness({ version: 1, create });
  vi.mocked(loadProjectInput).mockImplementationOnce((next) => { signal = next!; return new Promise((done) => { resolve = done; }); });
  const detach = h.attach(); h.transport("playing"); await h.settle();
  expect(create).not.toHaveBeenCalled(); expect(signal.aborted).toBe(false);
  h.transport("edit"); expect(signal.aborted).toBe(true);
  vi.mocked(loadProjectInput).mockRejectedValueOnce(new Error("Selected Input Action Map is missing"));
  h.transport("playing"); await h.settle();
  expect(h.host.world.failure()?.message).toContain("Selected Input Action Map is missing");
  resolve(undefined); await h.settle(); expect(create).not.toHaveBeenCalled();
  detach(); h.dispose();
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EngineLoop } from "../../../runtime/engine-loop";
import type { Runtime } from "../../../three/runtime";
import type { BrowserThreeWebGpuRenderSession } from "../../../rendering/adapters/browser-three-webgpu-session";
import type { PhysicsPlaybackInput } from "../../../physics/runtime/playback-input";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../../physics/domain/world-settings";
import type { CharacterPlaybackAssetCatalog } from "../../application/CharacterPlaybackAssetProvider";
import type { ThreeAnimatorWorldCoordinator } from "./three-animator-world-coordinator";
import { createSharedAnimatorWorld } from "./shared-animator-world";
import { playSceneLifetimeFor } from "../../../gameplay/adapters/play-scene-lifetime";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { ThreeAnimatorWorldRig } from "./three-animator-world-assets";

const physics = vi.hoisted(() => ({ current: null as null | { subscribeFixedStep: ReturnType<typeof vi.fn> } }));
const configuration = vi.hoisted(() => ({ runtimePhysicsCapacity: 0 }));
vi.mock("../../../three/physics/shared-physics-world", () => ({ physicsWorldForSession: () => physics.current }));
vi.mock("virtual:braze-game-module", () => ({ get runtimePhysicsCapacity() { return configuration.runtimePhysicsCapacity; } }));
beforeEach(() => { configuration.runtimePhysicsCapacity = 0; physics.current = null; });

function setup() {
  let callback: ((time: number) => void) | null = null;
  const loop = new EngineLoop({ requestFrame: (next) => { callback = next; return 1; }, cancelFrame: () => { callback = null; }, reportError: (error) => { throw error; } });
  const made: ReturnType<typeof coordinator>[] = [];
  const renderSession = {} as BrowserThreeWebGpuRenderSession;
  const create = vi.fn((_input: ConstructorParameters<typeof ThreeAnimatorWorldCoordinator>[0]) => { const next = coordinator(); made.push(next); return next as unknown as ThreeAnimatorWorldCoordinator; });
  const world = createSharedAnimatorWorld(renderSession, loop, create);
  const input: { -readonly [K in keyof PhysicsPlaybackInput]: PhysicsPlaybackInput[K] } & { catalog: CharacterPlaybackAssetCatalog } = {
    mode: "edit", stepToken: 0, objects: [], worldSettings: { ...DEFAULT_PHYSICS_WORLD_SETTINGS, fixedTimestep: 1 / 30 },
    catalog: { ready: true, library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} }, importedAssets: [] },
  };
  world.addSource(() => input);
  world.publishCatalog(input.catalog);
  const frame = (time: number) => { const next = callback; callback = null; next?.(time); };
  return { world, input, made, create, frame, loop, renderSession };
}
function coordinator() {
  let views = 0;
  return { attachView: vi.fn(() => { views++; return () => { views--; }; }), hasViews: () => views > 0,
    advance: vi.fn(), dispose: vi.fn(), remove: vi.fn(), diagnostics: () => [], liveSessionCount: () => 1,
    requiresContinuousFrames: () => true, runtimeState: () => null, runtimeController: () => null, commands: {},
  };
}
function view() { return { disposed: false } as Runtime; }

describe("shared animation world transport", () => {
  it("one clock advances two views; closing and reopening them retains the same session without hidden backlog", () => {
    physics.current = null;
    const { world, input, made, create, frame } = setup();
    input.mode = "playing"; world.refresh();
    const detachA = world.attachView(view()), detachB = world.attachView(view());
    frame(0); frame(20);
    expect(create).toHaveBeenCalledOnce(); expect(made[0]!.advance).toHaveBeenCalledOnce();
    detachA(); detachB(); frame(10000);
    expect(made[0]!.dispose).not.toHaveBeenCalled();
    world.attachView(view()); frame(20000); frame(20020);
    expect(create).toHaveBeenCalledOnce(); expect(made[0]!.advance).toHaveBeenCalledTimes(2);
    expect(made[0]!.advance.mock.lastCall?.[0]).toEqual({ deltaSeconds: 0.02, unscaledDeltaSeconds: 0.02 });
    world.dispose(); expect(made[0]!.dispose).toHaveBeenCalledOnce();
  });

  it("Pause freezes all modes and each Step token advances once at the captured world timestep", () => {
    const { world, input, made, frame } = setup(); input.mode = "paused"; world.refresh();
    world.attachView(view()); world.attachView(view()); frame(0); frame(500);
    expect(made[0]!.advance).not.toHaveBeenCalled();
    input.stepToken++; world.refresh(); world.refresh(); frame(600);
    expect(made[0]!.advance).toHaveBeenCalledExactlyOnceWith({ deltaSeconds: 1 / 30, unscaledDeltaSeconds: 1 / 30 });
    frame(900); expect(made[0]!.advance).toHaveBeenCalledOnce();
    input.mode = "edit"; world.refresh(); expect(made[0]!.dispose).toHaveBeenCalledOnce();
    input.mode = "playing"; world.refresh(); expect(made).toHaveLength(2); world.dispose();
  });

  it("physics owns fixed animation ticks and paused Step, independent of rendering", () => {
    let tick!: (value: { index: number; deltaSeconds: number; elapsedSeconds: number }) => boolean;
    const unsubscribe = vi.fn();
    physics.current = { subscribeFixedStep: vi.fn((listener) => { tick = listener; return unsubscribe; }) };
    const { world, input, made, frame } = setup();
    input.objects = [{ id: "body", colliders: [{ enabled: true }] }] as unknown as PhysicsPlaybackInput["objects"];
    input.mode = "playing"; world.refresh(); world.attachView(view()); frame(0); frame(20);
    expect(made[0]!.advance.mock.lastCall?.[1]).toBe("frame");
    tick({ index: 1, deltaSeconds: 1 / 30, elapsedSeconds: 1 / 30 });
    expect(made[0]!.advance.mock.lastCall?.[1]).toBe("fixed");
    input.mode = "paused"; input.stepToken++; world.refresh(); frame(40);
    const count = made[0]!.advance.mock.calls.length;
    tick({ index: 2, deltaSeconds: 1 / 30, elapsedSeconds: 2 / 30 });
    expect(made[0]!.advance).toHaveBeenCalledTimes(count + 1);
    expect(made[0]!.advance.mock.lastCall?.[1]).toBe("all");
    world.dispose(); expect(unsubscribe).toHaveBeenCalledOnce(); physics.current = null;
  });

  it("destruction is delivered synchronously even while paused or without views", () => {
    const { world, input, made, renderSession } = setup(); input.mode = "paused"; world.refresh();
    playSceneLifetimeFor(renderSession).prepare(["hero"]).publish();
    expect(made[0]!.remove).toHaveBeenCalledWith("hero"); world.dispose();
  });

  it("reserved runtime bodies own fixed Animator ticks even without authored physics", () => {
    configuration.runtimePhysicsCapacity = 4;
    let tick!: (value: { index: number; deltaSeconds: number; elapsedSeconds: number }) => boolean;
    physics.current = { subscribeFixedStep: vi.fn((listener) => { tick = listener; return () => undefined; }) };
    const { world, input, made, frame } = setup();
    input.mode = "playing"; world.refresh(); world.attachView(view()); frame(0); frame(20);
    expect(made[0]!.advance.mock.lastCall?.[1]).toBe("frame");
    tick({ index: 1, deltaSeconds: 1 / 30, elapsedSeconds: 1 / 30 });
    expect(made[0]!.advance.mock.lastCall?.[1]).toBe("fixed");
    expect(made[0]!.advance.mock.calls.filter((call) => call[1] === "fixed")).toHaveLength(1);
    input.mode = "paused"; input.stepToken++; world.refresh(); frame(40);
    const count = made[0]!.advance.mock.calls.length;
    tick({ index: 2, deltaSeconds: 1 / 30, elapsedSeconds: 2 / 30 });
    expect(made[0]!.advance).toHaveBeenCalledTimes(count + 1);
    expect(made[0]!.advance.mock.lastCall?.[1]).toBe("all"); world.dispose();
  });

  it("captures source objects before catalog readiness", () => {
    const { world, input, create } = setup(); input.catalog = { ...input.catalog, ready: false }; world.publishCatalog(input.catalog); input.mode = "playing"; world.refresh();
    input.objects = [{ id: "late" }] as PhysicsPlaybackInput["objects"];
    input.catalog = { ...input.catalog, ready: true }; world.publishCatalog(input.catalog); world.refresh();
    expect(create.mock.calls[0]![0].objects).toEqual([]);
    world.dispose();
  });

  it("releases transferred runtime rigs if world preparation fails before a coordinator exists", () => {
    const { world, input, create } = setup(), dispose = vi.fn();
    input.mode = "playing"; create.mockImplementationOnce(() => { throw Error("coordinator preparation failed"); });
    const creation = { object: { id: "runtime:a" } as SceneObject, rig: { dispose } as unknown as ThreeAnimatorWorldRig };
    expect(() => world.prepareRuntimeChange([creation], [])).toThrow("coordinator preparation failed");
    expect(dispose).toHaveBeenCalledOnce(); world.dispose();
  });
});

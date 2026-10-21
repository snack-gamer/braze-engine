import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import type { ViewportRenderer } from "../renderer";
import { createPhysicsPlaybackState, releasePhysicsPlaybackState } from "./physics-playback-state";

describe("physics pose buffer retirement", () => {
  it.each(["solver", "session"] as const)("requires both retirement fences when %s finishes first", async (first) => {
    const fixture = createFixture();
    const state = fixture.createState();
    expect(state.poseBuffers.gpuTargets(fixture.renderer)).not.toBeNull();
    expect(fixture.buffers.size).toBe(2);
    const detach = vi.spyOn(state.views, "dispose");
    releasePhysicsPlaybackState(state);

    expect(detach).toHaveBeenCalledOnce();
    expect(fixture.clearTargets).toHaveBeenCalledWith(null);
    expect(detach.mock.invocationCallOrder[0]).toBeLessThan(fixture.clearTargets.mock.invocationCallOrder[0]);
    expect(fixture.clearTargets.mock.invocationCallOrder[0]).toBeLessThan(fixture.retire.mock.invocationCallOrder[0]);
    fixture.fences[first].resolve();
    await settlePromises();
    for (const buffer of fixture.buffers.values()) expect(buffer.destroy).not.toHaveBeenCalled();

    fixture.fences[first === "solver" ? "session" : "solver"].resolve();
    await settlePromises();
    for (const buffer of fixture.buffers.values()) expect(buffer.destroy).toHaveBeenCalledOnce();
  });

  it("retiring the previous run cannot destroy a replacement run's pose buffers", async () => {
    const fixture = createFixture();
    const previous = fixture.createState();
    const replacement = fixture.createState();
    const previousTargets = previous.poseBuffers.gpuTargets(fixture.renderer)!;
    const replacementTargets = replacement.poseBuffers.gpuTargets(fixture.renderer)!;
    expect(previousTargets.position).not.toBe(replacementTargets.position);
    expect(previousTargets.orientation).not.toBe(replacementTargets.orientation);

    releasePhysicsPlaybackState(previous);
    fixture.fences.solver.resolve();
    fixture.fences.session.resolve();
    await settlePromises();
    expect(previousTargets.position.destroy).toHaveBeenCalledOnce();
    expect(previousTargets.orientation.destroy).toHaveBeenCalledOnce();
    expect(replacementTargets.position.destroy).not.toHaveBeenCalled();
    expect(replacementTargets.orientation.destroy).not.toHaveBeenCalled();

    releasePhysicsPlaybackState(replacement);
    await settlePromises();
    expect(replacementTargets.position.destroy).toHaveBeenCalledOnce();
    expect(replacementTargets.orientation.destroy).toHaveBeenCalledOnce();
  });
});

function createFixture() {
  const fences = { solver: deferred(), session: deferred() };
  const buffers = new Map<unknown, { size: number; destroy: ReturnType<typeof vi.fn> }>();
  const renderer = { backend: { get(attribute: unknown) {
    let buffer = buffers.get(attribute);
    if (!buffer) { buffer = { size: 16, destroy: vi.fn() }; buffers.set(attribute, buffer); }
    return { buffer };
  } } } as unknown as ViewportRenderer;
  const clearTargets = vi.fn();
  const retire = vi.fn(() => fences.session.promise);
  return {
    fences, buffers, renderer, clearTargets, retire,
    createState: () => createPhysicsPlaybackState({
      signature: "test-world", renderer, objects: [], bodyBindings: [], worldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS,
      retireResources: retire,
      runtime: {
        initialPositions: new Float32Array(), initialOrientations: new Float32Array(),
        capacity: { bodyCount: 0, maxPairs: 0, maxManifolds: 0 },
        setPoseTargets: clearTargets, runRigidSolverBatch: vi.fn(), publishPoseTargets: vi.fn(),
        writeKinematicBodyPose: vi.fn(), dispose: vi.fn(), disposeWhenIdle: () => fences.solver.promise,
      },
    }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function settlePromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

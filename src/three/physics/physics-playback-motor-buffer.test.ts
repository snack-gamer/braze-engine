import { describe, expect, it, vi } from "vitest";
import type { Renderer } from "three/webgpu";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { ThreeWebGpuRenderSubmission } from "../../rendering/adapters/three-webgpu-render-host";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { createPhysicsPlaybackDeviceLane } from "./physics-playback-device-lane";
import { createPhysicsPlaybackMotorBuffer } from "./physics-playback-motor-buffer";
import { initialKinematicObjectPoses } from "./kinematic-character-motor";

describe("physics playback motor buffer", () => {
  it("retires sparse motor cursors and pending motion without reviving a retained old sink", () => {
    const changed = vi.fn(), motors = createPhysicsPlaybackMotorBuffer(changed);
    const motion = { characterId: "runtime", delta: { translation: [1, 0, 0] as const, rotation: [0, 0, 0, 1] as const }, fixedDeltaSeconds: 1 / 60 };
    const stale = motors.sinkFor("runtime"); stale.applyRootMotion(motion);
    motors.forget("runtime"); expect(motors.diagnostics()).toEqual({ sinks: 0, pending: 0 });
    stale.applyRootMotion(motion); expect(motors.hasPending()).toBe(false);
    const fresh = motors.sinkFor("runtime"); fresh.applyRootMotion(motion);
    expect(changed).toHaveBeenCalledTimes(2); expect(motors.diagnostics()).toEqual({ sinks: 1, pending: 1 });
    motors.forget("runtime");
    for (let i = 0; i < 1000; i++) {
      const id = `runtime:${i}`; motors.sinkFor(id).applyRootMotion(motion); motors.forget(id);
    }
    expect(motors.diagnostics()).toEqual({ sinks: 0, pending: 0 });
  });
  it("admits more than 32 sparse motor targets and invalidates old sinks on reset", () => {
    const changed = vi.fn(), motors = createPhysicsPlaybackMotorBuffer(changed);
    const delta = { translation: [1, 0, 0] as const, rotation: [0, 0, 0, 1] as const };
    const stale = motors.sinkFor("old");
    for (let i = 0; i < 80; i++) motors.sinkFor(String(i)).applyRootMotion({ characterId: String(i), delta, fixedDeltaSeconds: 1 / 60 });
    expect(changed).toHaveBeenCalledTimes(80);
    motors.reset(); stale.applyRootMotion({ characterId: "old", delta, fixedDeltaSeconds: 1 / 60 });
    expect(motors.hasPending()).toBe(false);
  });
  it("does not write a kinematic pose until its device task is admitted", () => {
    let queued: ThreeWebGpuRenderSubmission | null = null;
    const taskLane: ThreeWebGpuDeviceTaskLane = {
      name: "scene:physics",
      request: vi.fn((_opportunity, submission) => {
        queued = submission;
        return "queued" as const;
      }),
      dispose: vi.fn(),
    };
    const deviceLane = createPhysicsPlaybackDeviceLane(taskLane);
    const writeKinematicBodyPose = vi.fn();
    const onQueued = vi.fn();
    const onChanged = vi.fn();
    const binding = kinematicBinding();
    const state = {
      runtime: { writeKinematicBodyPose },
      bodyBindings: [binding],
      objectPoses: initialKinematicObjectPoses([binding]),
    };
    const motors = createPhysicsPlaybackMotorBuffer(onQueued);

    motors.sinkFor("hero").applyRootMotion({
      characterId: "hero",
      delta: { translation: [2, 0, 0], rotation: [0, 0, 0, 1] },
      fixedDeltaSeconds: 1 / 60,
    });
    expect(onQueued).toHaveBeenCalledOnce();
    expect(writeKinematicBodyPose).not.toHaveBeenCalled();

    deviceLane.request(1 as DeviceRenderOpportunity, () => ({
      kind: "operation",
      execute: () => motors.flush(state, onChanged),
    }));
    expect(writeKinematicBodyPose).not.toHaveBeenCalled();
    const executeQueued = queued as ThreeWebGpuRenderSubmission | null;
    if (!executeQueued) throw new Error("Expected queued motor work.");
    executeQueued({} as Renderer, {
      retirement: Promise.resolve<"completed">("completed"),
    });

    expect(writeKinematicBodyPose).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledOnce();
    expect(motors.hasPending()).toBe(false);
  });
});

function kinematicBinding(): PhysicsBodyBinding {
  return {
    objectId: "hero",
    colliderId: "capsule",
    objectLocalOffset: [0, 0, 0],
    objectLocalOrientation: [0, 0, 0, 1],
    writesObjectPose: true,
    interpolation: "none",
    bodyType: "kinematic",
    objectPosition: [0, 0, 0],
    objectOrientation: [0, 0, 0, 1],
  };
}

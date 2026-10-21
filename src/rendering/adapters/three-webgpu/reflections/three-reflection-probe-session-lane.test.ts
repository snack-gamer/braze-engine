import { Scene, type CubeTexture, type Renderer } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
  ThreeWebGpuRenderRequestDisposition,
} from "../../three-webgpu-render-session-contract";
import {
  createThreeReflectionProbeController,
  type ThreeReflectionProbeAdmissionPort,
  type ThreeReflectionProbeControllerOptions,
} from "./three-reflection-probe-controller";
import type { ThreeReflectionProbeCaptureTarget } from "./three-reflection-probe-capture-target";
import { createThreeReflectionProbeSessionLane } from "./three-reflection-probe-session-lane";

const OPPORTUNITY = 1 as DeviceRenderOpportunity;

describe("Three reflection probe session lane", () => {
  it("coalesces invalidations and submits one retained callback to the device lane", () => {
    const fixture = createFixture(["queued"]);
    const firstScene = new Scene();
    const latestScene = new Scene();

    expect(fixture.session.invalidate({
      scene: firstScene,
      position: { x: 1, y: 2, z: 3 },
    })).toBe("queued");
    expect(fixture.session.invalidate({
      scene: latestScene,
      position: { x: 7, y: 8, z: 9 },
    })).toBe("queued");
    expect(fixture.session.flush(OPPORTUNITY)).toBe("queued");
    expect(fixture.session.flush(OPPORTUNITY)).toBe("queued");
    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.session.hasPendingAdmission()).toBe(true);

    fixture.tasks[0](fixture.renderer);

    expect(fixture.capture).toHaveBeenCalledOnce();
    expect(fixture.capture).toHaveBeenCalledWith(
      fixture.renderer,
      latestScene,
      { x: 7, y: 8, z: 9 },
    );
    expect(fixture.session.hasPendingAdmission()).toBe(false);
    expect(fixture.onCaptureCompleted).toHaveBeenCalledWith({
      generation: 2,
      texture: fixture.texture,
    });
  });

  it("retains rejected admission for the next render opportunity", () => {
    const fixture = createFixture(["rejected", "submitted"]);
    fixture.session.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 0, z: 0 },
    });

    expect(fixture.session.flush(OPPORTUNITY)).toBe("rejected");
    expect(fixture.session.hasPendingAdmission()).toBe(true);
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.session.flush(2 as DeviceRenderOpportunity)).toBe("submitted");

    expect(fixture.capture).toHaveBeenCalledOnce();
    expect(fixture.session.hasPendingAdmission()).toBe(false);
    expect(fixture.onCaptureCompleted).toHaveBeenCalledOnce();
  });

  it("clears the active callback before capture so reentrant invalidation survives", () => {
    const fixture = createFixture(["submitted", "submitted"]);
    const latestScene = new Scene();
    fixture.capture.mockImplementationOnce(() => {
      fixture.session.invalidate({
        scene: latestScene,
        position: { x: 4, y: 5, z: 6 },
      });
    });
    fixture.session.invalidate({
      scene: new Scene(),
      position: { x: 1, y: 2, z: 3 },
    });

    expect(fixture.session.flush(OPPORTUNITY)).toBe("submitted");
    expect(fixture.session.getGeneration()).toBe(1);
    expect(fixture.session.hasPendingAdmission()).toBe(true);
    expect(fixture.session.flush(2 as DeviceRenderOpportunity)).toBe("submitted");

    expect(fixture.capture).toHaveBeenCalledTimes(2);
    expect(fixture.capture).toHaveBeenLastCalledWith(
      fixture.renderer,
      latestScene,
      { x: 4, y: 5, z: 6 },
    );
    expect(fixture.session.getGeneration()).toBe(2);
  });

  it("reports a failed capture and keeps the controller retry admission pending", () => {
    const failure = new Error("cube capture failed");
    const fixture = createFixture(["submitted", "submitted"]);
    fixture.capture.mockImplementationOnce(() => { throw failure; });
    fixture.session.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 1, z: 2 },
    });

    expect(fixture.session.flush(OPPORTUNITY)).toBe("rejected");
    expect(fixture.onError).toHaveBeenCalledWith(failure);
    expect(fixture.session.getGeneration()).toBe(0);
    expect(fixture.session.hasPendingAdmission()).toBe(true);
    expect(fixture.session.flush(2 as DeviceRenderOpportunity)).toBe("submitted");

    expect(fixture.session.getGeneration()).toBe(1);
    expect(fixture.onCaptureCompleted).toHaveBeenCalledOnce();
  });

  it("contains lane and completion-observer errors without losing owned work", () => {
    const laneFailure = new Error("lane failed");
    const observerFailure = new Error("observer failed");
    const fixture = createFixture([laneFailure, "submitted"], {
      onCaptureCompleted: () => { throw observerFailure; },
    });
    fixture.session.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 0, z: 0 },
    });

    expect(fixture.session.flush(OPPORTUNITY)).toBe("rejected");
    expect(fixture.session.hasPendingAdmission()).toBe(true);
    expect(fixture.session.flush(2 as DeviceRenderOpportunity)).toBe("submitted");

    expect(fixture.onError).toHaveBeenNthCalledWith(1, laneFailure);
    expect(fixture.onError).toHaveBeenNthCalledWith(2, observerFailure);
    expect(fixture.session.getGeneration()).toBe(1);
  });

  it("disposes controller before lane exactly once and makes queued work stale", () => {
    const events: string[] = [];
    const fixture = createFixture(["queued"], {}, events);
    fixture.session.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 0, z: 0 },
    });
    fixture.session.flush(OPPORTUNITY);

    fixture.session.dispose();
    fixture.session.dispose();
    fixture.tasks[0](fixture.renderer);

    expect(events).toEqual(["controller", "lane"]);
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.session.hasPendingAdmission()).toBe(false);
    expect(fixture.session.flush(OPPORTUNITY)).toBe("rejected");
  });

  it("releases the transferred lane when controller construction fails", () => {
    const failure = new Error("controller construction failed");
    const dispose = vi.fn();
    const lane: ThreeWebGpuDeviceTaskLane = {
      name: "scene:reflection-probe",
      request: () => "rejected",
      dispose,
    };

    expect(() => createThreeReflectionProbeSessionLane({ lane }, {
      createController: () => { throw failure; },
    })).toThrow(failure);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

type LaneResult = ThreeWebGpuRenderRequestDisposition | Error;

function createFixture(
  laneResults: LaneResult[],
  eventOverrides: { onCaptureCompleted?: () => void } = {},
  disposalEvents: string[] = [],
) {
  const renderer = {} as Renderer;
  const texture = { name: "reflection" } as CubeTexture;
  const capture = vi.fn();
  const target: ThreeReflectionProbeCaptureTarget = {
    capture,
    getTexture: () => texture,
    dispose: vi.fn(() => { disposalEvents.push("controller"); }),
  };
  const tasks: Array<(renderer: Renderer) => void> = [];
  const request = vi.fn<ThreeWebGpuDeviceTaskLane["request"]>((_opportunity, task) => {
    const result = laneResults.shift() ?? "queued";
    if (result instanceof Error) throw result;
    tasks.push(task);
    if (result === "submitted") {
      try {
        task(renderer);
      } catch {
        return "rejected";
      }
    }
    return result;
  });
  const lane: ThreeWebGpuDeviceTaskLane = {
    name: "scene:reflection-probe",
    request,
    dispose: vi.fn(() => { disposalEvents.push("lane"); }),
  };
  const onCaptureCompleted = vi.fn(eventOverrides.onCaptureCompleted);
  const onError = vi.fn();
  const session = createThreeReflectionProbeSessionLane({
    lane,
    events: { onCaptureCompleted, onError },
  }, {
    createController: (
      admission: ThreeReflectionProbeAdmissionPort,
      options: ThreeReflectionProbeControllerOptions,
    ) => createThreeReflectionProbeController(admission, options, {
      createCaptureTarget: () => target,
    }),
  });
  return {
    capture,
    onCaptureCompleted,
    onError,
    renderer,
    request,
    session,
    tasks,
    texture,
  };
}

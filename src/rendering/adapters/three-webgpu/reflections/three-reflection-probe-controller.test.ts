import { Scene, type CubeTexture, type Renderer } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import type {
  ThreeReflectionProbeCaptureTarget,
  ThreeReflectionProbePosition,
} from "./three-reflection-probe-capture-target";
import {
  createThreeReflectionProbeController,
  type ThreeReflectionProbeAdmissionPort,
  type ThreeReflectionProbeController,
} from "./three-reflection-probe-controller";

describe("Three reflection probe controller", () => {
  it("coalesces queued invalidations to the latest scene, position, and generation", () => {
    const callbacks: Array<(renderer: Renderer) => void> = [];
    const request = vi.fn<ThreeReflectionProbeAdmissionPort["request"]>((capture) => {
        callbacks.push(capture);
        return "queued";
      });
    const admission: ThreeReflectionProbeAdmissionPort = { request };
    const fixture = controllerFixture(admission);
    const firstScene = new Scene();
    const latestScene = new Scene();
    const firstPosition = { x: 1, y: 2, z: 3 };

    expect(fixture.controller.invalidate({ scene: firstScene, position: firstPosition })).toBe("queued");
    expect(fixture.controller.invalidate({
      scene: latestScene,
      position: { x: 7, y: 8, z: 9 },
    })).toBe("queued");
    firstPosition.x = 99;

    expect(admission.request).toHaveBeenCalledOnce();
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.controller.getStatus()).toEqual({
      phase: "scheduled",
      requestedGeneration: 2,
      textureGeneration: 0,
      pending: true,
    });
    callbacks[0](fixture.renderer);

    expect(fixture.capture).toHaveBeenCalledWith(
      fixture.renderer,
      latestScene,
      { x: 7, y: 8, z: 9 },
    );
    expect(fixture.controller.getGeneration()).toBe(2);
    expect(fixture.controller.getStatus()).toMatchObject({
      phase: "captured",
      textureGeneration: 2,
      pending: false,
    });
    expect(fixture.controller.getTexture()).toBe(fixture.texture);
  });

  it("captures synchronously only while the caller's admitted callback is active", () => {
    let insideAdmission = false;
    const renderer = {} as Renderer;
    const capture = vi.fn(() => {
      expect(insideAdmission).toBe(true);
    });
    const admission: ThreeReflectionProbeAdmissionPort = {
      request: (callback) => {
        insideAdmission = true;
        callback(renderer);
        insideAdmission = false;
        return "submitted";
      },
    };
    const fixture = controllerFixture(admission, capture);

    expect(fixture.controller.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 1, z: 2 },
    })).toBe("submitted");
    expect(capture).toHaveBeenCalledOnce();
    expect(fixture.controller.getStatus()).toMatchObject({ phase: "captured", pending: false });
  });

  it("keeps rejected work pending for an explicit admission retry", () => {
    const callbacks: Array<(renderer: Renderer) => void> = [];
    let accept = false;
    const admission: ThreeReflectionProbeAdmissionPort = {
      request: (callback) => {
        if (!accept) return "rejected";
        callbacks.push(callback);
        return "queued";
      },
    };
    const fixture = controllerFixture(admission);

    expect(fixture.controller.invalidate({
      scene: new Scene(),
      position: { x: 1, y: 1, z: 1 },
    })).toBe("rejected");
    expect(fixture.controller.getStatus()).toMatchObject({ phase: "pending", pending: true });
    accept = true;
    expect(fixture.controller.retryPendingAdmission()).toBe("queued");
    callbacks[0](fixture.renderer);
    expect(fixture.controller.getGeneration()).toBe(1);
  });

  it("schedules a new capture when invalidated reentrantly during capture", () => {
    const callbacks: Array<(renderer: Renderer) => void> = [];
    const admission: ThreeReflectionProbeAdmissionPort = {
      request: (callback) => {
        callbacks.push(callback);
        return "queued";
      },
    };
    let controller!: ThreeReflectionProbeController;
    const latestScene = new Scene();
    const capture = vi.fn(() => {
      if (capture.mock.calls.length !== 1) return;
      controller.invalidate({ scene: latestScene, position: { x: 4, y: 5, z: 6 } });
    });
    const fixture = controllerFixture(admission, capture);
    controller = fixture.controller;
    controller.invalidate({ scene: new Scene(), position: { x: 1, y: 2, z: 3 } });

    callbacks[0](fixture.renderer);
    expect(callbacks).toHaveLength(2);
    expect(controller.getStatus()).toMatchObject({
      phase: "scheduled",
      requestedGeneration: 2,
      textureGeneration: 1,
    });
    callbacks[1](fixture.renderer);
    expect(capture).toHaveBeenLastCalledWith(
      fixture.renderer,
      latestScene,
      { x: 4, y: 5, z: 6 },
    );
    expect(controller.getGeneration()).toBe(2);
  });

  it("disposes queued work before stale admission can touch the target", () => {
    let admitted!: (renderer: Renderer) => void;
    const fixture = controllerFixture({
      request: (callback) => {
        admitted = callback;
        return "queued";
      },
    });
    fixture.controller.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 0, z: 0 },
    });

    fixture.controller.dispose();
    fixture.controller.dispose();
    admitted(fixture.renderer);

    expect(fixture.dispose).toHaveBeenCalledOnce();
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.controller.getStatus()).toEqual({
      phase: "disposed",
      requestedGeneration: 1,
      textureGeneration: 0,
      pending: false,
    });
    expect(fixture.controller.invalidate({
      scene: new Scene(),
      position: { x: 1, y: 1, z: 1 },
    })).toBe("rejected");
  });

  it("defers target disposal through an active synchronous capture", () => {
    const events: string[] = [];
    let controller!: ThreeReflectionProbeController;
    const dispose = vi.fn(() => events.push("dispose"));
    const capture = vi.fn(() => {
      events.push("capture-start");
      controller.dispose();
      events.push("capture-end");
    });
    const fixture = controllerFixture({
      request: (callback) => {
        callback({} as Renderer);
        return "submitted";
      },
    }, capture, dispose);
    controller = fixture.controller;

    controller.invalidate({ scene: new Scene(), position: { x: 0, y: 0, z: 0 } });
    expect(events).toEqual(["capture-start", "capture-end", "dispose"]);
    expect(controller.getStatus().phase).toBe("disposed");
    expect(controller.getGeneration()).toBe(1);
  });

  it("reports failed synchronous capture without claiming a new texture generation", () => {
    const failure = new Error("capture failed");
    let shouldFail = true;
    const capture = vi.fn(() => {
      if (shouldFail) throw failure;
    });
    const fixture = controllerFixture({
      request: (callback) => {
        callback({} as Renderer);
        return "submitted";
      },
    }, capture);

    expect(() => fixture.controller.invalidate({
      scene: new Scene(),
      position: { x: 0, y: 0, z: 0 },
    })).toThrow(failure);
    expect(fixture.controller.getStatus()).toMatchObject({
      phase: "failed",
      textureGeneration: 0,
      pending: true,
    });
    shouldFail = false;
    expect(fixture.controller.retryPendingAdmission()).toBe("submitted");
    expect(fixture.controller.getGeneration()).toBe(1);
  });
});

function controllerFixture(
  admission: ThreeReflectionProbeAdmissionPort,
  capture = vi.fn(),
  dispose = vi.fn(),
) {
  const texture = { name: "probe-texture" } as CubeTexture;
  const target: ThreeReflectionProbeCaptureTarget = {
    capture,
    dispose,
    getTexture: () => texture,
  };
  const controller = createThreeReflectionProbeController(admission, {}, {
    createCaptureTarget: () => target,
  });
  return {
    capture: capture as ReturnType<typeof vi.fn<(
      renderer: Renderer,
      scene: Scene,
      position: ThreeReflectionProbePosition,
    ) => void>>,
    controller,
    dispose,
    renderer: {} as Renderer,
    texture,
  };
}

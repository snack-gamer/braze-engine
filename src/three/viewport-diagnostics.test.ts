import { describe, expect, it } from "vitest";
import type { PhysicsPlaybackDiagnostics } from "./physics/playback-controller";
import { createViewportDiagnostics } from "./viewport-diagnostics";

const idlePhysics: PhysicsPlaybackDiagnostics = {
  status: "idle",
  bodyCount: 0,
  maxPairs: 0,
  maxManifolds: 0,
  completedStepId: 0,
  submittedStepId: 0,
  appliedStepId: 0,
  readbackLag: 0,
  droppedSeconds: 0,
  simulationPending: false,
  queuedSteps: 0,
  estimatedStepMilliseconds: 0,
  inFlightBatches: 0,
  instancedBodies: 0,
};

describe("viewport diagnostics", () => {
  it("counts only submitted renders and exposes demand-loop state", () => {
    const dataset = {} as DOMStringMap;
    const diagnostics = createViewportDiagnostics({ dataset });
    expect(dataset.renderCount).toBe("0");

    diagnostics.markRenderSubmitted();
    diagnostics.markRenderSubmitted();
    diagnostics.setRenderLoopActive(false);

    expect(dataset.renderCount).toBe("2");
    expect(dataset.renderLoop).toBe("idle");
  });

  it("throttles physics publication and clears every owned attribute", () => {
    const dataset = {} as DOMStringMap;
    const diagnostics = createViewportDiagnostics({ dataset });
    diagnostics.publishPhysics(0, idlePhysics);
    diagnostics.publishPhysics(100, { ...idlePhysics, bodyCount: 2, instancedBodies: 2 });
    expect(dataset.physicsBodies).toBe("0");

    diagnostics.publishPhysics(250, { ...idlePhysics, bodyCount: 2, instancedBodies: 2 });
    diagnostics.setRendererStatus("ready");
    expect(dataset.physicsBodies).toBe("2");
    expect(dataset.physicsInstanced).toBe("2");

    diagnostics.dispose();
    expect(Object.keys(dataset)).toEqual([]);
  });
});

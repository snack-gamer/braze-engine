import { describe, expect, it, vi } from "vitest";
import type { Renderer } from "three/webgpu";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { ThreeWebGpuRenderSubmission } from "../../rendering/adapters/three-webgpu-render-host";
import { createPhysicsPlaybackDeviceLane } from "./physics-playback-device-lane";

const OPPORTUNITY = 1 as DeviceRenderOpportunity;
const RENDERER = {} as Renderer;

describe("physics playback device lane", () => {
  it.each(["complete", "veto", "throw"])("interleaves commands and submissions, retaining partial batches on %s", async (ending) => {
    const events: string[] = [], completed = vi.fn(), settled = vi.fn(), onError = vi.fn();
    let retire!: (status: "completed") => void;
    const retirement = new Promise<"completed">((resolve) => { retire = resolve; });
    const runtime = { runRigidSolverBatch: vi.fn((count: number) => { events.push(`submit:${count}`); }), retainUntil: vi.fn() };
    const lane = createPhysicsPlaybackDeviceLane(fakeLane((_opportunity, submit) => {
      submit(RENDERER, { retirement }); return "submitted";
    }));
    const request = () => lane.request(OPPORTUNITY, () => ({
      kind: "solver-batch", runtime, stepCount: 3, beforeSubmit() {},
      beforeStep(offset) {
        if (offset === 2 && ending === "throw") throw new Error("command failure");
        if (offset === 2 && ending === "veto") return false;
        events.push(`command:${offset + 1}`); return true;
      },
      onSubmitted(count) { events.push(`commit:${count}`); },
      onCompleted: completed, onSettled: settled, onError,
    }));
    if (ending === "throw") expect(request).toThrow("command failure"); else request();
    const expected = ["command:1", "submit:1", "command:2", "submit:1"];
    if (ending === "complete") expected.push("command:3", "submit:1");
    expected.push(`commit:${ending === "complete" ? 3 : 2}`);
    expect(events).toEqual(expected); expect(completed).not.toHaveBeenCalled();
    expect(runtime.retainUntil).toHaveBeenCalledWith(retirement);
    retire("completed"); await flushPromises();
    expect(completed).toHaveBeenCalledOnce(); expect(settled).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledTimes(ending === "throw" ? 1 : 0);
    lane.dispose();
  });
  it("does not consume a tick or create completion bookkeeping when the first tick is vetoed", async () => {
    const commit = vi.fn(), completed = vi.fn(), settled = vi.fn(), runRigidSolverBatch = vi.fn();
    const lane = createPhysicsPlaybackDeviceLane(fakeLane((_opportunity, submit) => {
      submit(RENDERER, completedContext()); return "submitted";
    }));
    lane.request(OPPORTUNITY, () => ({
      kind: "solver-batch", stepCount: 5, runtime: { runRigidSolverBatch }, beforeSubmit() {}, beforeStep: () => false,
      onSubmitted: commit, onCompleted: completed, onSettled: settled, onError() {},
    }));
    await flushPromises();
    for (const observer of [commit, completed, settled, runRigidSolverBatch]) expect(observer).not.toHaveBeenCalled();
    lane.dispose();
  });
  it("keeps one pending admission and executes the latest work selector", () => {
    let queued: ThreeWebGpuRenderSubmission | null = null;
    const lane = fakeLane((_opportunity, submission) => {
      queued = submission;
      return "queued";
    });
    const deviceLane = createPhysicsPlaybackDeviceLane(lane);
    const executed: string[] = [];

    expect(deviceLane.request(OPPORTUNITY, () => ({
      kind: "operation",
      execute: () => { executed.push("old"); },
    }))).toBe("queued");
    expect(deviceLane.request(2 as DeviceRenderOpportunity, () => ({
      kind: "operation",
      execute: () => { executed.push("latest"); },
    }))).toBe("queued");

    expect(lane.request).toHaveBeenCalledOnce();
    expect(deviceLane.hasPendingAdmission()).toBe(true);
    const executeQueued = queued as ThreeWebGpuRenderSubmission | null;
    if (!executeQueued) throw new Error("Expected queued physics work.");
    executeQueued(RENDERER, completedContext());
    expect(executed).toEqual(["latest"]);
    expect(deviceLane.hasPendingAdmission()).toBe(false);
  });

  it("leaves rejected admission retryable without consuming work", () => {
    let attempts = 0;
    const execute = vi.fn();
    const lane = fakeLane((_opportunity, submission) => {
      attempts += 1;
      if (attempts === 1) return "rejected";
      submission(RENDERER, completedContext());
      return "submitted";
    });
    const deviceLane = createPhysicsPlaybackDeviceLane(lane);
    const select = () => ({ kind: "operation" as const, execute });

    expect(deviceLane.request(OPPORTUNITY, select)).toBe("rejected");
    expect(execute).not.toHaveBeenCalled();
    expect(deviceLane.hasPendingAdmission()).toBe(false);
    expect(deviceLane.request(2 as DeviceRenderOpportunity, select)).toBe("submitted");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("submits a solver batch only inside admission and treats completion as bookkeeping", async () => {
    let resolveCompletion!: (status: "completed") => void;
    const completion = new Promise<"completed">((resolve) => { resolveCompletion = resolve; });
    const events: string[] = [];
    const runtime = {
      runRigidSolverBatch: vi.fn(() => { events.push("encoded"); }),
    };
    let now = 10;
    const lane = fakeLane((_opportunity, submission) => {
      events.push("admitted");
      submission(RENDERER, { retirement: completion });
      return "submitted";
    });
    const deviceLane = createPhysicsPlaybackDeviceLane(lane, () => now);

    expect(deviceLane.request(OPPORTUNITY, () => ({
      kind: "solver-batch",
      runtime,
      stepCount: 3,
      beforeSubmit: () => { events.push("motor-flush"); },
      onSubmitted: () => { events.push("committed"); },
      onCompleted: (duration) => { events.push(`completed:${duration}`); },
      onSettled: () => { events.push("settled"); },
      onError: () => { events.push("error"); },
    }))).toBe("submitted");

    expect(events).toEqual(["admitted", "motor-flush", "encoded", "committed"]);
    expect(runtime.runRigidSolverBatch).toHaveBeenCalledWith(3);
    now = 18;
    resolveCompletion("completed");
    await flushPromises();
    expect(events).toEqual([
      "admitted",
      "motor-flush",
      "encoded",
      "committed",
      "completed:8",
      "settled",
    ]);
  });

  it("disposes pending admission before releasing its owned lane", () => {
    let queued: ThreeWebGpuRenderSubmission | null = null;
    const lane = fakeLane((_opportunity, submission) => {
      queued = submission;
      return "queued";
    });
    const execute = vi.fn();
    const deviceLane = createPhysicsPlaybackDeviceLane(lane);
    deviceLane.request(OPPORTUNITY, () => ({ kind: "operation", execute }));

    deviceLane.dispose();
    const executeQueued = queued as ThreeWebGpuRenderSubmission | null;
    executeQueued?.(RENDERER, completedContext());
    expect(execute).not.toHaveBeenCalled();
    expect(lane.dispose).toHaveBeenCalledOnce();
    expect(deviceLane.hasPendingAdmission()).toBe(false);
  });
});

function fakeLane(
  request: ThreeWebGpuDeviceTaskLane["request"],
): ThreeWebGpuDeviceTaskLane {
  return {
    name: "scene:physics",
    request: vi.fn(request),
    dispose: vi.fn(),
  };
}

function completedContext() {
  return { retirement: Promise.resolve<"completed">("completed") };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

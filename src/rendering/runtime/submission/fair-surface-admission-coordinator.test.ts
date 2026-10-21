import { describe, expect, it, vi } from "vitest";
import { FairSurfaceAdmissionCoordinator } from "./fair-surface-admission-coordinator";

describe("fair surface admission coordinator", () => {
  it("coalesces each surface independently and preserves FIFO lane fairness", () => {
    let inFlight = 0;
    const admitted: string[] = [];
    const discard = vi.fn();
    const coordinator = new FairSurfaceAdmissionCoordinator<string>({
      hasCapacity: () => inFlight < 1,
      admit: (work) => {
        admitted.push(work);
        inFlight += 1;
        return "submitted";
      },
      discard,
    });
    const scene = coordinator.registerSurface("scene");
    const game = coordinator.registerSurface("game");

    expect(scene.request("scene-first")).toBe("submitted");
    expect(scene.request("scene-old")).toBe("queued");
    expect(game.request("game-first")).toBe("queued");
    expect(scene.request("scene-latest")).toBe("queued");
    expect(discard).toHaveBeenCalledWith("scene-old", "superseded");

    inFlight = 0;
    coordinator.notifyCapacityAvailable();
    expect(admitted).toEqual(["scene-first", "scene-latest"]);
    expect(scene.request("scene-after")).toBe("queued");

    inFlight = 0;
    coordinator.notifyCapacityAvailable();
    expect(admitted).toEqual(["scene-first", "scene-latest", "game-first"]);
    inFlight = 0;
    coordinator.notifyCapacityAvailable();
    expect(admitted).toEqual([
      "scene-first",
      "scene-latest",
      "game-first",
      "scene-after",
    ]);
  });

  it("isolates a released lane from a replacement using the same name", () => {
    let capacity = false;
    const admitted: string[] = [];
    const discard = vi.fn();
    const coordinator = new FairSurfaceAdmissionCoordinator<string>({
      hasCapacity: () => capacity,
      admit: (work) => {
        admitted.push(work);
        return "submitted";
      },
      discard,
    });
    const stale = coordinator.registerSurface("scene");
    stale.request("stale-pending");
    stale.dispose();
    const replacement = coordinator.registerSurface("scene");
    replacement.request("replacement");

    expect(stale.request("stale-late")).toBe("rejected");
    capacity = true;
    coordinator.notifyCapacityAvailable();

    expect(admitted).toEqual(["replacement"]);
    expect(discard.mock.calls).toEqual([
      ["stale-pending", "surface-released"],
      ["stale-late", "surface-released"],
    ]);
  });

  it("settles pending ownership when admission is disabled or disposed", () => {
    const discard = vi.fn();
    const coordinator = new FairSurfaceAdmissionCoordinator<string>({
      hasCapacity: () => false,
      admit: () => "submitted",
      discard,
    });
    const scene = coordinator.registerSurface("scene");
    const game = coordinator.registerSurface("game");
    scene.request("scene-pending");
    game.request("game-pending");

    coordinator.discardPending("admission-disabled");
    expect(discard).toHaveBeenCalledWith("scene-pending", "admission-disabled");
    expect(discard).toHaveBeenCalledWith("game-pending", "admission-disabled");
    scene.request("scene-after-disable");
    coordinator.dispose();

    expect(discard).toHaveBeenCalledWith("scene-after-disable", "coordinator-disposed");
    expect(game.request("game-after-dispose")).toBe("rejected");
    expect(discard).toHaveBeenCalledWith("game-after-dispose", "coordinator-disposed");
  });

  it("contains admission callback failures without leaking queued ownership", () => {
    const discard = vi.fn();
    const reportError = vi.fn();
    const failure = new Error("render failed");
    const coordinator = new FairSurfaceAdmissionCoordinator<string>({
      hasCapacity: () => true,
      admit: () => { throw failure; },
      discard,
      reportError,
    });

    expect(coordinator.registerSurface("scene").request("work")).toBe("rejected");
    expect(discard).toHaveBeenCalledWith("work", "admission-failed");
    expect(reportError).toHaveBeenCalledWith(failure);
  });
});

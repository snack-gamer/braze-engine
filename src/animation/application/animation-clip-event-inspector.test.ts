import { describe, expect, it, vi } from "vitest";
import {
  clearAnimationClipEventInspectorBinding,
  syncAnimationClipEventInspectorBinding,
  type AnimationClipEventInspectorBinding,
  type AnimationClipEventInspectorOwner,
} from "./animation-clip-event-inspector";

function binding(
  owner: AnimationClipEventInspectorOwner,
  eventId: string,
  name = "Event",
): AnimationClipEventInspectorBinding {
  return {
    owner,
    event: { id: eventId, name, timeSeconds: 0.5, payload: {} },
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
}

describe("animation Clip event Inspector binding", () => {
  it("syncs only the currently selected event owned by the mounted Clip editor", () => {
    const owner = { filename: "Hero.fbx", localId: "clip:idle" };
    const current = binding(owner, "step");
    const synced = binding(owner, "step", "Footstep");

    expect(syncAnimationClipEventInspectorBinding(current, synced)).toBe(synced);
    expect(syncAnimationClipEventInspectorBinding(current, binding(owner, "land"))).toBe(current);
    expect(syncAnimationClipEventInspectorBinding(
      current,
      binding({ ...owner }, "step", "Stale editor"),
    )).toBe(current);
  });

  it("prevents a stale editor cleanup from clearing a newer owner lease", () => {
    const owner = { filename: "Hero.fbx", localId: "clip:idle" };
    const staleOwner = { ...owner };
    const current = binding(owner, "step");

    expect(clearAnimationClipEventInspectorBinding(current, staleOwner)).toBe(current);
    expect(clearAnimationClipEventInspectorBinding(current, owner)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { defaultModelImportSettings } from "../../lib/model-import-settings";
import {
  addAnimationClipEvent,
  animationClipEvents,
  patchAnimationClipEvent,
  removeAnimationClipEvent,
} from "./animation-clip-event-authoring";

const target = {
  localId: "clip:idle",
  durationSeconds: 2,
  looping: true,
  sourceEvents: [{ id: "source", name: "Source", timeSeconds: 0.25, payload: {} }],
} as const;

describe("animation clip event authoring", () => {
  it("copies source events into a stable clip override when the first event is added", () => {
    const added = addAnimationClipEvent(defaultModelImportSettings, target, 5, {
      id: "added",
      name: "Footstep",
    });

    expect(added.eventId).toBe("added");
    expect(added.settings.clipSettings["clip:idle"]).toEqual({
      looping: true,
      events: [
        { id: "source", name: "Source", timeSeconds: 0.25, payload: {} },
        { id: "added", name: "Footstep", timeSeconds: 2, payload: {} },
      ],
    });
  });

  it("edits the event name and timeline time through the importer-owned clip entry", () => {
    const added = addAnimationClipEvent(defaultModelImportSettings, target, 1, { id: "step" });
    const moved = patchAnimationClipEvent(added.settings, target, "step", {
      name: "Right Foot",
      timeSeconds: -1,
    });

    expect(animationClipEvents(moved, target).find((event) => event.id === "step"))
      .toEqual({ id: "step", name: "Right Foot", timeSeconds: 0, payload: {} });
  });

  it("keeps an explicit empty event list when the last event is removed", () => {
    const added = addAnimationClipEvent(defaultModelImportSettings, target, 1, { id: "step" });
    const withoutAdded = removeAnimationClipEvent(added.settings, target, "step");
    const empty = removeAnimationClipEvent(withoutAdded, target, "source");

    expect(empty.clipSettings["clip:idle"]?.events).toEqual([]);
    expect(animationClipEvents(empty, target)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { activeSceneInstance, createSceneSession, replaceSceneInstance, setSceneInstancePhase } from "./scene-session";

describe("loaded scene session", () => {
  it("separates a persistent document identity from each opened lifetime", () => {
    const initial = createSceneSession("a");
    const ready = setSceneInstancePhase(initial, 0, "ready");
    const other = replaceSceneInstance(ready, "b");
    const reopened = replaceSceneInstance(other, "a");
    expect(reopened.instances).toEqual([{ sceneId: "a", instanceId: 2, phase: "loading" }]);
    expect(activeSceneInstance(initial)).toEqual({ sceneId: "a", instanceId: 0, phase: "loading" });
    expect(setSceneInstancePhase(reopened, 0, "failed")).toBe(reopened);
    expect(setSceneInstancePhase(reopened, 2, "loading")).toBe(reopened);
  });
});

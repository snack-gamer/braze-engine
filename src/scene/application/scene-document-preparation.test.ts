import { describe, expect, it } from "vitest";
import { prepareSceneDocument } from "./scene-document-preparation";
import { createSceneTemplate } from "./scene-templates";

describe("scene preparation boundary", () => {
  it("only permits a missing document for the first default scene", () => {
    const missing = { scene: null, revision: null };
    expect(prepareSceneDocument("current", missing, true).hydration).toBeNull();
    expect(() => prepareSceneDocument("current", missing)).toThrow("does not exist");
    expect(() => prepareSceneDocument("named", missing, true)).toThrow("does not exist");
  });
  it("hydrates Basic sky and Empty neutral defaults without sharing live values", () => {
    const scene = createSceneTemplate("Sky");
    const first = prepareSceneDocument("sky", { scene, revision: "exact-revision" });
    const second = prepareSceneDocument("copy", { scene: { ...scene, name: "Copy" }, revision: "copy-revision" });
    expect(first.hydration!.state.environment.worldSource).toBe("sky");
    expect(second.hydration!.state.environment.worldSource).toBe("sky");
    expect(first.hydration!.state.environment).not.toBe(second.hydration!.state.environment);
    expect(first.hydration!.state.objects).not.toBe(second.hydration!.state.objects);
    expect(first.revision).toBe("exact-revision");
    const empty = prepareSceneDocument("empty", { scene: createSceneTemplate("Empty", "empty"), revision: "empty" });
    expect(empty.hydration!.state.objects).toEqual([]);
    expect(empty.hydration!.state.environment.worldSource).toBe("hdri");
  });
  it("preserves explicitly authored HDRI settings instead of applying a template on open", () => {
    const basic = createSceneTemplate("Custom");
    const scene = { ...basic, environment: { ...(basic.environment as Record<string, unknown>), worldSource: "hdri", hdriUrl: "/assets/studio.hdr" } };
    const opened = prepareSceneDocument("custom", { scene, revision: "custom" });
    expect(opened.hydration!.state.environment).toMatchObject({ worldSource: "hdri", hdriUrl: "/assets/studio.hdr" });
  });
});

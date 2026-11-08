import { describe, expect, it } from "vitest";
import { Color, Scene } from "three";
import { createEditorSceneBackground } from "./editor-scene-background";

describe("Scene view background", () => {
  it("applies editor chrome only during an empty Scene render, including failure cleanup", () => {
    const scene = new Scene(), render = createEditorSceneBackground("scene");
    expect(() => render(scene, () => { expect(scene.background).toBeInstanceOf(Color); throw new Error("draw failed"); })).toThrow("draw failed");
    expect(scene.background).toBeNull();
  });
  it("preserves authored environments and the Game surface", () => {
    const scene = new Scene(), authored = new Color("red");
    scene.background = authored;
    createEditorSceneBackground("scene")(scene, () => expect(scene.background).toBe(authored));
    scene.background = null;
    createEditorSceneBackground("game")(scene, () => expect(scene.background).toBeNull());
  });
});

import { DEFAULT_SKY_SETTINGS, DEFAULT_SKY_SUN } from "../../rendering/authoring/sky-presets";
import { defaultCamera, defaultEnvironment } from "../../constants";
import { makeObject } from "../../lib/payload";
import { buildSavedScene } from "../../lib/scene-persistence";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import { validateSceneName } from "../domain/scene-identity";

/** Fresh Basic authoring values; loading a saved scene never reapplies this preset. */
export function basicSceneEnvironment() {
  return { ...defaultEnvironment, worldSource: "sky" as const, sky: { ...DEFAULT_SKY_SETTINGS } };
}

export type SceneTemplate = "basic" | "empty";
export function createSceneTemplate(name: string, template: SceneTemplate = "basic") {
  if (template !== "basic" && template !== "empty") throw new Error("Unknown scene template.");
  const objects = template === "empty" ? [] : [
    makeObject("camera", 0, { id: "main-camera", name: "Main Camera", position: [0, 2, 6] }),
    makeObject("directionalLight", 1, { id: "sun", name: "Directional Light", position: [0, 4, 0],
      rotation: [...DEFAULT_SKY_SUN.rotation], color: DEFAULT_SKY_SUN.light.color, directionalLight: { ...DEFAULT_SKY_SUN.light } }),
  ];
  return { ...buildSavedScene({ objects, camera: template === "basic" ? { ...defaultCamera, position: [8, 3.5, 8], target: [0, 1, 0] } : defaultCamera, environment: template === "basic" ? basicSceneEnvironment() : defaultEnvironment,
    activeObjectId: objects[0]?.id ?? "", activeCameraId: objects[0]?.id ?? "", physicsWorldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS }), name: validateSceneName(name) };
}

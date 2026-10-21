import type { PrimitiveKind } from "../domain/scene-values";
import type { EditorTone } from "../../ui/tones";

/** Each object kind wears its group's tone; only empties and groups stay neutral. */
const kindTones: Record<PrimitiveKind, EditorTone> = {
  transform: "neutral",
  cube: "mesh",
  sphere: "mesh",
  plane: "mesh",
  image: "rendering",
  fbx: "prefab",
  usdz: "prefab",
  usd: "prefab",
  gltf: "prefab",
  water: "rendering",
  camera: "rendering",
  directionalLight: "lighting",
  particle: "effects",
  cloner: "modifiers",
  effector: "modifiers",
};

/** Shared by the Hierarchy glyph and the Inspector title block so an object reads the same everywhere. */
export function objectKindTone(primitive: PrimitiveKind): EditorTone {
  return kindTones[primitive];
}

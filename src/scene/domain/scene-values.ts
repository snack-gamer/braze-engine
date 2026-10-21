export type Vec3 = [number, number, number];

export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";
export type ScenePlaybackMode = "edit" | "playing" | "paused";

export type PrimitiveKind =
  | "transform"
  | "cube"
  | "sphere"
  | "plane"
  | "water"
  | "cloner"
  | "effector"
  | "particle"
  | "image"
  | "fbx"
  | "usdz"
  | "usd"
  | "gltf"
  | "camera"
  | "directionalLight";

export const DEFAULT_OBJECT_COLOR = "#9da3a6";

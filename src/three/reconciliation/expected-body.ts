import type { SceneObject } from "../../types";
import { BOT_ASSET_PREP_VERSION, isAvatarBotObject } from "../../lib/bots";
import { PLACEHOLDER, type BodyKind } from "../runtime";
import { waterBodyKey } from "../water/water-body";

export function expectedBody(object: SceneObject): { kind: BodyKind; key: string } {
  if (object.meshFilter?.empty || object.meshFilter?.enabled === false || object.removedComponents?.includes("meshFilter")) return { kind: "none", key: "mesh:none" };
  if (object.assetRef?.localId && object.assetRef.localId !== "main" && !object.assetMeshBinding) return { kind: "none", key: "mesh:unresolved" };
  // Camera glyphs provide a compact Scene selection target without solid geometry.
  if (object.primitive === "cloner") return { kind: "none", key: "cloner:none" };
  if (object.primitive === "effector") return { kind: "none", key: "effector:none" };
  if (object.primitive === "camera") return { kind: "camera-body", key: "camera-glyph" };
  if (object.primitive === "directionalLight") {
    return { kind: "directional-light-body", key: "directional-light-body" };
  }
  if (object.water || object.primitive === "water") return { kind: "water", key: waterBodyKey(object) };
  if (object.primitive === "transform") return { kind: "none", key: "transform:none" };
  if (object.primitive === "particle") return { kind: "particle", key: "particle:emitter-marker" };
  if (object.primitive === "image") return { kind: "image", key: `image:${object.assetUrl ?? ""}` };
  if (object.primitive === "fbx" || object.primitive === "usdz" || object.primitive === "usd" || object.primitive === "gltf") {
    if (!object.assetUrl) return { kind: "placeholder", key: PLACEHOLDER };
    const prepVersion = isAvatarBotObject(object) ? `:${BOT_ASSET_PREP_VERSION}` : "";
    return { kind: "asset", key: `${object.primitive}:${object.assetUrl}${prepVersion}${object.assetMeshBinding ? `:${JSON.stringify(object.assetMeshBinding)}` : ""}` };
  }
  return { kind: "primitive", key: `primitive:${object.primitive}` };
}


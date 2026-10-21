import { REVISION, type Camera, type Object3D } from "three";
import type { LightsNode, Renderer } from "three/webgpu";

type LightingRenderer = {
  lighting: Pick<Renderer["lighting"], "getNode" | "createNode">;
};

/**
 * Backports the per-camera lighting scope fixed by three.js#33737 in r185.
 * r184 RenderList already supplies a camera, but Lighting ignores it. Sharing
 * a LightsNode lets shadow draws replace both the main-view lights and cached
 * shader nodes. Restoring only getLights() cannot restore those compiled nodes.
 * Keep one node per scene/camera through the exposed creation/lookup methods.
 */
export function installThreeR184NestedLighting(renderer: LightingRenderer): void {
  if (REVISION !== "184") {
    throw new Error("Re-audit the r184 nested-lighting adapter before changing Three revisions.");
  }
  const lighting = renderer.lighting, getNode = lighting.getNode;
  const scenes = new WeakMap<Object3D, WeakMap<Camera, LightsNode>>();
  lighting.getNode = (scene: Object3D, camera?: Camera) => {
    if (!camera || (scene as Object3D & { isQuadMesh?: boolean }).isQuadMesh) return getNode.call(lighting, scene);
    let cameras = scenes.get(scene);
    if (!cameras) { cameras = new WeakMap(); scenes.set(scene, cameras); }
    let node = cameras.get(camera);
    if (!node) { node = lighting.createNode(); cameras.set(camera, node); }
    return node;
  };
}

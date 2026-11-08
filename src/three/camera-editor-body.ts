import * as THREE from "three";
import { createCameraGlyphTexture } from "../camera/adapters/editor-camera-glyph";
import { readEditorColorToken } from "../ui/theme-tokens";
import { retainObjectResource } from "./dispose";

export const CAMERA_GLYPH_PIXELS = 28;

/** A screen-facing editor glyph. It has no solid housing or lens in the scene. */
export function buildCameraEditorBody(texture: THREE.Texture = createCameraGlyphTexture()): THREE.Group {
  const root = new THREE.Group();
  root.name = "Camera Editor Glyph";
  root.userData.editorChrome = true;
  root.userData.cameraEditorBody = true;
  const material = new THREE.SpriteMaterial({ map: texture,
    color: readEditorColorToken("--scene-camera-selected", "#afb4ba"),
    sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false });
  const glyph = new THREE.Sprite(material);
  glyph.name = "Camera Glyph";
  glyph.userData.editorChrome = true;
  glyph.userData.cameraGlyph = true;
  // Three sprites share one geometry; only this material and texture are owned.
  glyph.userData.sharedGeometry = true;
  glyph.renderOrder = 1000;
  glyph.frustumCulled = false;
  const parentScale = new THREE.Vector3();
  glyph.onBeforeRender = (renderer, _scene, camera) => {
    const height = Math.max(1, renderer.domElement.clientHeight);
    const size = CAMERA_GLYPH_PIXELS * 2 / (height * Math.abs(camera.projectionMatrix.elements[5]));
    root.getWorldScale(parentScale);
    glyph.scale.set(size / Math.max(1e-8, Math.abs(parentScale.x)), size / Math.max(1e-8, Math.abs(parentScale.y)), 1);
    glyph.updateMatrixWorld();
  };
  const raycast = glyph.raycast.bind(glyph);
  glyph.raycast = (raycaster, hits) => {
    for (let node: THREE.Object3D | null = glyph; node; node = node.parent) if (!node.visible) return;
    raycast(raycaster, hits);
  };
  root.add(glyph);
  retainObjectResource(root, () => texture.dispose());
  return root;
}

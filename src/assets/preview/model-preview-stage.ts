import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createEditorGrid, type EditorGrid } from "../../three/editor-grid";
import { createPreviewResourceLifetime } from "./preview-resource-lifetime";
import { DEFAULT_EDITOR_GRID_STYLE } from "../../editor/domain/editor-grid-style";

export const MODEL_PREVIEW_FIELD_OF_VIEW = 32;

export type ModelPreviewStage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grid: EditorGrid;
  dispose: () => void;
};

/** Constructs the neutral Three.js content owned by one preview session. */
export function createModelPreviewStage(canvas: HTMLCanvasElement): ModelPreviewStage {
  const lifetime = createPreviewResourceLifetime("model preview stage resource");
  const scene = new THREE.Scene();
  lifetime.defer(() => scene.clear());
  scene.background = new THREE.Color(0x20242a);
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x343943, 1.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.35);
  key.position.set(3.5, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9dbfff, 1.1);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  try {
    const grid = createEditorGrid({
      color: DEFAULT_EDITOR_GRID_STYLE.color,
      size: 10,
      cellSize: 0.5,
      opacity: DEFAULT_EDITOR_GRID_STYLE.opacity,
      groundHeight: -0.001,
    });
    lifetime.defer(() => grid.dispose());
    scene.add(grid.object);

    const camera = new THREE.PerspectiveCamera(MODEL_PREVIEW_FIELD_OF_VIEW, 1, 0.01, 100);
    const controls = new OrbitControls(camera, canvas);
    lifetime.defer(() => controls.dispose());
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = false;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 0.85;
    return { scene, camera, controls, grid, dispose: lifetime.dispose };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

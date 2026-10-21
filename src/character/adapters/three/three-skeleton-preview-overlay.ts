import * as THREE from "three";
import type { BoneId, SkeletonDefinition } from "../../domain/skeleton";
import {
  createThreeSkeletonHelperOverlay,
  type ThreeSkeletonHelperOverlay,
} from "./three-skeleton-extractor";
import type { ThreeSkeletonEditorBinding } from "./three-skeleton-editor-binding";

export type ThreeSkeletonPreviewOverlay = Readonly<{
  frameObjects: readonly THREE.Object3D[];
  update: () => void;
  setVisible: (visible: boolean) => void;
  setSelectedBone: (boneId: BoneId | null) => void;
  dispose: () => void;
}>;

/** One-draw-call bone handles plus a modern accent marker for editor selection. */
export function createThreeSkeletonPreviewOverlay(input: Readonly<{
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  root: THREE.Object3D;
  definition: SkeletonDefinition;
  binding: ThreeSkeletonEditorBinding;
  onSelect: (boneId: BoneId) => void;
}>): ThreeSkeletonPreviewOverlay {
  const bones = input.definition.bones.flatMap((definition) => {
    const bone = input.binding.boneById.get(definition.id);
    return bone ? [{ id: definition.id, bone }] : [];
  });
  const boneObjects = bones.map(({ bone }) => bone);
  const radius = previewHandleRadius(boneObjects);
  const geometry = new THREE.SphereGeometry(radius, 8, 6);
  const material = new THREE.MeshBasicMaterial({
    color: 0x9bd5ff,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.82,
  });
  const handles = new THREE.InstancedMesh(geometry, material, bones.length);
  handles.name = "Braze Bone Handles";
  handles.frustumCulled = false;
  handles.renderOrder = 1000;
  handles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const selectionGeometry = new THREE.SphereGeometry(radius * 1.7, 14, 10);
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0x48a9ff,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.88,
    wireframe: true,
  });
  const selection = new THREE.Mesh(selectionGeometry, selectionMaterial);
  selection.name = "Braze Selected Bone";
  selection.frustumCulled = false;
  selection.renderOrder = 1001;
  selection.visible = false;

  const helper: ThreeSkeletonHelperOverlay = createThreeSkeletonHelperOverlay(
    input.root,
    boneObjects,
  );
  input.scene.add(helper.object, handles, selection);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedBoneId: BoneId | null = null;
  let visible = true;
  let pointerStart: { x: number; y: number } | null = null;
  let disposed = false;

  const update = () => {
    if (disposed || !visible) return;
    bones.forEach(({ bone }, index) => {
      bone.getWorldPosition(position);
      matrix.makeTranslation(position.x, position.y, position.z);
      handles.setMatrixAt(index, matrix);
    });
    handles.instanceMatrix.needsUpdate = true;
    helper.object.updateMatrixWorld(true);
    const selectedBone = selectedBoneId ? input.binding.boneById.get(selectedBoneId) : null;
    selection.visible = Boolean(selectedBone);
    if (selectedBone) selectedBone.getWorldPosition(selection.position);
  };

  const handlePointerDown = (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const handlePointerUp = (event: PointerEvent) => {
    const start = pointerStart;
    pointerStart = null;
    if (!start || disposed || !visible || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const bounds = input.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, input.camera);
    const hit = raycaster.intersectObject(handles, false)[0];
    if (hit?.instanceId === undefined) return;
    const selected = bones[hit.instanceId];
    if (selected) input.onSelect(selected.id);
  };
  input.canvas.addEventListener("pointerdown", handlePointerDown);
  input.canvas.addEventListener("pointerup", handlePointerUp);
  update();

  return {
    frameObjects: [helper.object, handles],
    update,
    setVisible: (nextVisible) => {
      visible = nextVisible;
      helper.object.visible = nextVisible;
      handles.visible = nextVisible;
      selection.visible = nextVisible && selectedBoneId !== null;
    },
    setSelectedBone: (boneId) => {
      selectedBoneId = boneId;
      update();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      input.canvas.removeEventListener("pointerdown", handlePointerDown);
      input.canvas.removeEventListener("pointerup", handlePointerUp);
      helper.dispose();
      handles.removeFromParent();
      selection.removeFromParent();
      geometry.dispose();
      material.dispose();
      selectionGeometry.dispose();
      selectionMaterial.dispose();
    },
  };
}

function previewHandleRadius(bones: readonly THREE.Bone[]): number {
  const box = new THREE.Box3();
  const position = new THREE.Vector3();
  bones.forEach((bone) => box.expandByPoint(bone.getWorldPosition(position)));
  const bounds = box.getBoundingSphere(new THREE.Sphere());
  return Math.max(0.0005, Number.isFinite(bounds.radius) ? bounds.radius * 0.009 : 0.01);
}

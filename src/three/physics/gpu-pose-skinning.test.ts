import * as THREE from "three";
import { TSL, WebGPURenderer, type MeshPhysicalNodeMaterial, type NodeBuilder, type Renderer } from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, expect, it, vi } from "vitest";
// @ts-expect-error -- The browser's real glTF fixture is authored as an ESM test utility.
import { runtimeAnimationModelDocument } from "../../../tests/gameplay/runtime-animation-project.mjs";
import { bindObjectToGpuPose, PhysicsPoseBuffers } from "./gpu-pose";
import { captureGpuPoseHierarchy } from "./gpu-pose-hierarchy";

afterEach(() => vi.unstubAllGlobals());

async function runtimeSkin() {
  vi.stubGlobal("ProgressEvent", class ProgressEvent {});
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(runtimeAnimationModelDocument()), "");
  const node = new THREE.Group(); node.position.set(-1.5, 0.15, 0); node.add(gltf.scene);
  const mesh = gltf.scene.getObjectByName("Skin") as THREE.SkinnedMesh;
  const mixer = new THREE.AnimationMixer(gltf.scene); mixer.clipAction(gltf.animations[0]!).play();
  return { node, mesh, mixer };
}

function bindSkin(node: THREE.Group) {
  return bindObjectToGpuPose(node, {
    objectId: "skin", colliderId: "skin-box", objectLocalOffset: [0, -0.9, 0], objectLocalOrientation: [0, 0, 0, 1],
    writesObjectPose: true, interpolation: "none", bodyType: "dynamic", objectPosition: [-1.5, 0.15, 0], objectOrientation: [0, 0, 0, 1],
  }, 0, new PhysicsPoseBuffers(1), "#ffffff");
}

/** Public r184 backend builds WGSL without requesting a GPU device or rendering. */
function vertexShader(mesh: THREE.Mesh, renderer: Renderer) {
  // The r184 source accepts Object3D; its published types still say RenderObject.
  const backend = renderer.backend as unknown as {
    createNodeBuilder(object: THREE.Mesh, renderer: Renderer): NodeBuilder & { camera: THREE.Camera; scene: THREE.Scene };
  };
  const builder = backend.createNodeBuilder(mesh, renderer);
  builder.camera = new THREE.PerspectiveCamera(); builder.scene = new THREE.Scene();
  builder.build(); return builder.vertexShader;
}

function shaderRenderer() {
  const renderer = new WebGPURenderer({ canvas: {
    width: 1, height: 1, style: {}, addEventListener() {}, setAttribute() {},
  } as unknown as HTMLCanvasElement });
  // Shader construction needs the capability decision, not a device allocation.
  vi.spyOn(renderer, "hasFeature").mockReturnValue(false);
  return renderer;
}

function expectLocalSkinBeforeGpuPlacement(shader: string) {
  const assignments = shader.split("\n").filter((line) => /^\s*positionLocal\s*=/.test(line));
  expect(assignments).toHaveLength(3);
  expect(assignments[0]).toMatch(/= position;/);
  expect(assignments[1]).toContain("skinWeight.x");
  expect(assignments[2]).toMatch(/NodeBuffer_\d+\.value\[ 0u \]\.xyz/);
  expect(shader.indexOf(assignments[2]!)).toBeLessThan(shader.indexOf("v_positionView ="));
  expect(shader.match(/positionLocal = .*skinWeight\.x/g)).toHaveLength(1);
  expect(shader.indexOf("normalLocal = normalize(")).toBeLessThan(shader.indexOf(assignments[2]!));
}

it("keeps the real two-bone fixture's deformed vertices local until GPU world placement", async () => {
  const { node, mesh, mixer } = await runtimeSkin();
  mixer.setTime(0.25); node.updateMatrixWorld(true); mesh.skeleton.update();
  const hierarchy = captureGpuPoseHierarchy(node);
  const upper = Array.from({ length: mesh.geometry.attributes.position.count }, (_, index) => index)
    .find((index) => mesh.geometry.attributes.position.getY(index) > 0.9)!;
  const original = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, upper);
  const before = mesh.applyBoneTransform(upper, original.clone()).applyMatrix4(mesh.matrixWorld);
  expect(before.distanceTo(original.clone().applyMatrix4(mesh.matrixWorld))).toBeGreaterThan(0.5);
  const originalMaterial = mesh.material;
  const binding = bindSkin(node);
  node.updateMatrixWorld(true); mesh.skeleton.update();
  const after = mesh.applyBoneTransform(upper, original.clone()).applyMatrix4(hierarchy.meshes.get(mesh)!).applyMatrix4(hierarchy.rootWorld);
  expect(after.distanceTo(before)).toBeLessThan(0.000001);
  binding.restore();
  expect(mesh.material).toBe(originalMaterial);
  expect(mesh.matrixWorldAutoUpdate).toBe(true);
  expect(node.matrixWorld.equals(hierarchy.rootWorld)).toBe(true);
  mesh.geometry.dispose();
});

it("generates skin -> GPU placement -> projection for real main and shadow materials", async () => {
  const { node, mesh } = await runtimeSkin();
  const binding = bindSkin(node), renderer = shaderRenderer();
  const material = mesh.material as MeshPhysicalNodeMaterial;
  expectLocalSkinBeforeGpuPlacement(vertexShader(mesh, renderer));
  const light = new THREE.DirectionalLight();
  const shadow = TSL.getShadowMaterial(light);
  shadow.positionNode = material.castShadowPositionNode;
  mesh.material = shadow;
  expectLocalSkinBeforeGpuPlacement(vertexShader(mesh, renderer));
  mesh.material = material; binding.restore();
  TSL.disposeShadowMaterial(light); mesh.geometry.dispose();
});

it("preserves morph-before-skin order before GPU placement", async () => {
  const { node, mesh } = await runtimeSkin();
  const positions = mesh.geometry.attributes.position;
  mesh.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3).fill(0.1), 3)];
  mesh.geometry.morphTargetsRelative = true; mesh.updateMorphTargets(); mesh.morphTargetInfluences![0] = 0.5;
  const binding = bindSkin(node);
  const shader = vertexShader(mesh, shaderRenderer());
  const morph = shader.indexOf("positionLocal = ( positionLocal *");
  const skin = shader.indexOf("skinWeight.x");
  const placement = shader.lastIndexOf("positionLocal =");
  expect(morph).toBeGreaterThan(-1); expect(morph).toBeLessThan(skin);
  expect(skin).toBeLessThan(placement); expect(placement).toBeLessThan(shader.indexOf("v_positionView ="));
  binding.restore(); mesh.geometry.dispose();
});

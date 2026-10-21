import * as THREE from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import { assignThreeShadowCasterLayer } from "../../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import { attribute, int, normalLocal, positionLocal, transformNormalToView } from "../tsl";
import { asNodeMaterial } from "../materials";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import {
  PhysicsPoseBuffers,
  multiplyQuaternions,
  rotateByQuaternion,
} from "./gpu-pose";

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL nodes are untyped chains. */
type TslNode = any;

/**
 * One draw call for N bodies.
 *
 * This is the sparse-flip PhysParticleRenderer pattern applied to rigid bodies:
 * a single InstancedBufferGeometry whose per-instance data selects a pose from
 * the solver-written buffers. Three walks ONE object per group instead of one
 * per body, which removes the last O(bodies) CPU cost in the frame — culling,
 * render-list building, and draw-call submission. See docs/CODING_RULEBOOK.md.
 *
 * Unlike the particles, bodies rotate: each instance carries its body index and
 * the vertex shader composes collider pose x local offset x authored scale —
 * the exact math bindObjectToGpuPose uses, so the two paths render identically.
 */

export type InstancedBodyCandidate = {
  bodyIndex: number;
  binding: PhysicsBodyBinding;
  node: THREE.Object3D;
};

export type InstancedBodyGroups = {
  /** Body indices that were instanced; the rest need the per-object path. */
  instancedBodyIndices: Set<number>;
  meshes: THREE.Mesh[];
  restore: () => void;
};

type Candidate = InstancedBodyCandidate & {
  mesh: THREE.Mesh;
  material: THREE.Material;
};

const IDENTITY_EPSILON = 1.0e-6;

/**
 * The body surface, ignoring editor visuals that share the object's node.
 *
 * Scene nodes are Groups holding the body plus collider gizmo handles and
 * modifier pins, so "exactly one mesh in the subtree" rejects every real
 * object. Mirror reconcile's findBody rule instead: the body is the first
 * child that is not an editor visual, and it qualifies for instancing when it
 * is itself a plain mesh.
 */
function singleMeshOf(node: THREE.Object3D): THREE.Mesh | null {
  if ((node as THREE.Mesh).isMesh) return node as THREE.Mesh;
  const children = node.children.filter((child) => {
    const flags = child.userData as Record<string, unknown>;
    return !(flags.modifierHandle || flags.colliderEditVisual || flags.editorChrome || flags.colliderSignature);
  });
  if (children.length !== 1) return null;
  for (const child of children) {
    if (!(child as THREE.Mesh).isMesh) return null;
    // A body mesh with its own mesh children (imported hierarchies) renders
    // more than one surface; those stay on the per-object path.
    let nested = false;
    (child as THREE.Mesh).traverse((grandChild) => {
      if (grandChild !== child && (grandChild as THREE.Mesh).isMesh) nested = true;
    });
    return nested ? null : (child as THREE.Mesh);
  }
  return null;
}

function isIdentityLocal(mesh: THREE.Mesh, node: THREE.Object3D): boolean {
  if (mesh === node) return true;
  if (mesh.parent !== node) return false;
  const elements = mesh.matrix.elements;
  const identity = new THREE.Matrix4().elements;
  for (let index = 0; index < 16; index += 1) {
    if (Math.abs(elements[index] - identity[index]) > IDENTITY_EPSILON) return false;
  }
  return true;
}

/**
 * Bodies can only share a draw if their geometry is the same shape. Geometry
 * instances in this app are per-object, so group by parametric signature; a
 * geometry without parameters (imported meshes) is not shareable this way and
 * falls back to the per-object path.
 */
function groupSignature(mesh: THREE.Mesh, material: THREE.Material): string | null {
  const geometry = mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, unknown> };
  if (!geometry.parameters) return null;
  const materialLike = material as THREE.MeshStandardMaterial;
  return [
    geometry.type,
    JSON.stringify(geometry.parameters),
    material.type,
    materialLike.map?.uuid ?? "no-map",
    materialLike.normalMap?.uuid ?? "no-normal",
    materialLike.roughness ?? "",
    materialLike.metalness ?? "",
    material.transparent ? "t" : "o",
  ].join("|");
}

export function poseMaterialFor(source: THREE.Material, buffers: PhysicsPoseBuffers): THREE.Material {
  const bodyIndex = int(attribute("bodyPoseIndex") as TslNode);

  const colliderOrientation = buffers.worldOrientation(bodyIndex);
  const colliderPosition = buffers.worldPosition(bodyIndex);
  const localOrientation = attribute("bodyLocalOrientation") as TslNode;
  const localOffset = (attribute("bodyLocalOffset") as TslNode).xyz;
  const scale = (attribute("bodyScale") as TslNode).xyz;

  const orientation = multiplyQuaternions(colliderOrientation, localOrientation);
  const position = colliderPosition.add(rotateByQuaternion(localOffset, colliderOrientation));
  const worldPosition = rotateByQuaternion(positionLocal.mul(scale), orientation).add(position);
  const viewNormal = transformNormalToView(rotateByQuaternion(normalLocal, orientation));

  const material = asNodeMaterial(source, "#ffffff") as MeshPhysicalNodeMaterial & {
    positionNode: TslNode;
    castShadowPositionNode: TslNode;
    normalNode: TslNode;
    colorNode: TslNode;
  };
  material.positionNode = worldPosition;
  material.castShadowPositionNode = worldPosition;
  material.normalNode = viewNormal;
  material.colorNode = attribute("bodyColor");
  material.needsUpdate = true;
  return material;
}

function buildGroupMesh(members: Candidate[], buffers: PhysicsPoseBuffers): THREE.Mesh {
  const representative = members[0];
  const base = representative.mesh.geometry;

  const geometry = new THREE.InstancedBufferGeometry();
  // The wrapper must own its GPU attributes. WebGPURenderer deletes an
  // attribute's cached GPUBuffer when *any* geometry that references it is
  // disposed. Sharing the source identities here made Stop dispose the hidden
  // authored mesh's buffers as a side effect; its already-cached render object
  // could then try to bind an undefined index buffer on the next frame.
  geometry.index = base.index?.clone() ?? null;
  for (const [name, attributeValue] of Object.entries(base.attributes)) {
    geometry.setAttribute(name, (attributeValue as THREE.BufferAttribute).clone());
  }
  geometry.instanceCount = members.length;

  const count = members.length;
  const poseIndex = new Float32Array(count);
  const localOffset = new Float32Array(count * 3);
  const localOrientation = new Float32Array(count * 4);
  const bodyScale = new Float32Array(count * 3);
  const bodyColor = new Float32Array(count * 3);
  const worldScale = new THREE.Vector3();

  for (let slot = 0; slot < count; slot += 1) {
    const { bodyIndex, binding, node, material } = members[slot];
    poseIndex[slot] = bodyIndex;
    localOffset.set(binding.objectLocalOffset, slot * 3);
    localOrientation.set(binding.objectLocalOrientation, slot * 4);
    node.updateWorldMatrix(true, false);
    node.getWorldScale(worldScale);
    worldScale.toArray(bodyScale, slot * 3);
    const color = (material as THREE.MeshStandardMaterial).color ?? new THREE.Color("#ffffff");
    color.toArray(bodyColor, slot * 3);
  }

  geometry.setAttribute("bodyPoseIndex", new THREE.InstancedBufferAttribute(poseIndex, 1));
  geometry.setAttribute("bodyLocalOffset", new THREE.InstancedBufferAttribute(localOffset, 3));
  geometry.setAttribute("bodyLocalOrientation", new THREE.InstancedBufferAttribute(localOrientation, 4));
  geometry.setAttribute("bodyScale", new THREE.InstancedBufferAttribute(bodyScale, 3));
  geometry.setAttribute("bodyColor", new THREE.InstancedBufferAttribute(bodyColor, 3));

  const mesh = new THREE.Mesh(geometry, poseMaterialFor(representative.material, buffers));
  mesh.name = "physics.instancedBodies";
  // Instance world positions are unknown to the CPU, so neither culling nor
  // raycasting against this mesh can be correct. Culling is disabled; picking
  // must go through the GPU ID path, never through this proxy.
  mesh.frustumCulled = false;
  mesh.raycast = () => undefined;
  mesh.castShadow = representative.mesh.castShadow;
  mesh.receiveShadow = representative.mesh.receiveShadow;
  assignThreeShadowCasterLayer(mesh, "dynamic");
  return mesh;
}

/**
 * Replaces eligible per-body meshes with one instanced draw per shape group.
 *
 * A body qualifies when it is a single mesh at identity local transform with a
 * single material and parametric geometry. Anything else keeps the per-object
 * GPU-pose path — same math, just one draw per body — so unusual content is
 * never wrong, only slower.
 */
export function buildInstancedBodyGroups(
  candidates: InstancedBodyCandidate[],
  buffers: PhysicsPoseBuffers,
  parent: THREE.Object3D,
): InstancedBodyGroups {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const mesh = singleMeshOf(candidate.node);
    if (!mesh || Array.isArray(mesh.material)) continue;
    if (!isIdentityLocal(mesh, candidate.node)) continue;
    const signature = groupSignature(mesh, mesh.material);
    if (!signature) continue;
    const list = groups.get(signature) ?? [];
    list.push({ ...candidate, mesh, material: mesh.material });
    groups.set(signature, list);
  }

  const meshes: THREE.Mesh[] = [];
  const instancedBodyIndices = new Set<number>();
  const hidden: { node: THREE.Object3D; visible: boolean }[] = [];

  for (const members of groups.values()) {
    const groupMesh = buildGroupMesh(members, buffers);
    parent.add(groupMesh);
    meshes.push(groupMesh);
    for (const member of members) {
      instancedBodyIndices.add(member.bodyIndex);
      hidden.push({ node: member.node, visible: member.node.visible });
      member.node.visible = false;
    }
  }

  return {
    instancedBodyIndices,
    meshes,
    restore() {
      for (const mesh of meshes) {
        mesh.removeFromParent();
        (mesh.material as THREE.Material).dispose();
        // Attributes are wrapper-owned clones, so this cannot invalidate the
        // authored meshes that become visible again below.
        mesh.geometry.dispose();
      }
      meshes.length = 0;
      for (const { node, visible } of hidden) node.visible = visible;
      hidden.length = 0;
      instancedBodyIndices.clear();
    },
  };
}

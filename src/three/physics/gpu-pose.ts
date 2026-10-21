import * as THREE from "three";
import { MeshPhysicalNodeMaterial, StorageBufferAttribute } from "three/webgpu";
import {
  float,
  normalLocal,
  positionLocal,
  storage,
  transformNormalToView,
  uniform,
  vec4,
} from "../tsl";
import type { Vec3 } from "../../types";
import type { Quat4 } from "../../physics/authoring/coordinates";
import { asNodeMaterial } from "../materials";
import type { ViewportRenderer } from "../renderer";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { captureGpuPoseHierarchy, pinGpuPoseTransforms } from "./gpu-pose-hierarchy";
import { gpuPosePositionAfterDeformation } from "./gpu-pose-deformation-order";

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL nodes are untyped chains. */
type TslNode = any;

/**
 * GPU-resident body poses.
 *
 * The solver's position/orientation buffers are copied — GPU to GPU, inside the
 * solver's own command buffer — into two storage attributes that the vertex
 * shader reads. No body state is mapped to the CPU and no transform is written
 * into a scene-graph node, so a Play frame costs the CPU nothing per body.
 * See `docs/CODING_RULEBOOK.md`.
 */
export class PhysicsPoseBuffers {
  /** Backend-space position (xyz); w is not used by presentation. */
  readonly positionAttribute: StorageBufferAttribute;
  /** Backend-space orientation quaternion (xyzw). */
  readonly orientationAttribute: StorageBufferAttribute;
  readonly positionNode: TslNode;
  readonly orientationNode: TslNode;

  constructor(readonly bodyCount: number) {
    const count = Math.max(1, bodyCount);
    this.positionAttribute = new StorageBufferAttribute(count, 4);
    this.orientationAttribute = new StorageBufferAttribute(count, 4);
    this.positionAttribute.name = "physics.pose.position";
    this.orientationAttribute.name = "physics.pose.orientation";
    // A body that has not been simulated yet must not render at a garbage
    // orientation: seed identity quaternions.
    const orientations = this.orientationAttribute.array as Float32Array;
    for (let index = 0; index < count; index += 1) orientations[index * 4 + 3] = 1;

    this.positionNode = storage(this.positionAttribute as TslNode, "vec4", count);
    this.orientationNode = storage(this.orientationAttribute as TslNode, "vec4", count);
  }

  worldPosition(index: TslNode): TslNode {
    const value = this.positionNode.element(index).xyz;
    return value;
  }

  worldOrientation(index: TslNode): TslNode {
    const value = this.orientationNode.element(index);
    return value;
  }

  /**
   * The GPUBuffers Three allocated for the storage attributes.
   *
   * Three creates them lazily on first use, so this returns null until a frame
   * that references the nodes has been rendered.
   */
  gpuTargets(renderer: ViewportRenderer): { position: GPUBuffer; orientation: GPUBuffer } | null {
    const backend = renderer.backend as unknown as { get?: (value: unknown) => { buffer?: GPUBuffer } | undefined };
    if (typeof backend?.get !== "function") return null;
    const position = backend.get(this.positionAttribute)?.buffer;
    const orientation = backend.get(this.orientationAttribute)?.buffer;
    if (!position || !orientation) return null;
    return { position, orientation };
  }

  /** Called only after all view bindings and outstanding solver work retire. */
  dispose(renderer: ViewportRenderer): void {
    const targets = this.gpuTargets(renderer);
    targets?.position.destroy();
    targets?.orientation.destroy();
  }
}

export function rotateByQuaternion(vector: TslNode, quaternion: TslNode): TslNode {
  const axis = quaternion.xyz;
  const scalar = quaternion.w;
  return axis
    .mul(float(2).mul(axis.dot(vector)))
    .add(vector.mul(scalar.mul(scalar).sub(axis.dot(axis))))
    .add(axis.cross(vector).mul(float(2).mul(scalar)));
}

export function multiplyQuaternions(left: TslNode, right: TslNode): TslNode {
  const [ax, ay, az, aw] = [left.x, left.y, left.z, left.w];
  const [bx, by, bz, bw] = [right.x, right.y, right.z, right.w];
  return vec4(
    aw.mul(bx).add(ax.mul(bw)).add(ay.mul(bz)).sub(az.mul(by)),
    aw.mul(by).sub(ax.mul(bz)).add(ay.mul(bw)).add(az.mul(bx)),
    aw.mul(bz).add(ax.mul(by)).sub(ay.mul(bx)).add(az.mul(bw)),
    aw.mul(bw).sub(ax.mul(bx)).sub(ay.mul(by)).sub(az.mul(bz)),
  ).normalize();
}

type BoundMesh = {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  poseMaterial: THREE.Material | THREE.Material[];
};

export type GpuPoseBinding = { restore: () => void };

/**
 * Points an object's meshes at the GPU pose buffer and takes its transform away
 * from the CPU.
 *
 * The model matrix is pinned to identity and the vertex shader produces world
 * space directly, so nothing on the CPU has to know where the body is. The
 * returned restore() puts the authored materials and matrices back, which is
 * what Stop relies on.
 */
export function bindObjectToGpuPose(
  node: THREE.Object3D,
  binding: PhysicsBodyBinding,
  bodyIndex: number,
  buffers: PhysicsPoseBuffers,
  objectColor: string,
  hierarchy = captureGpuPoseHierarchy(node),
): GpuPoseBinding {

  // The collider the solver simulates may sit at an offset inside the object,
  // so the body's pose is the collider's pose composed with that fixed local
  // transform. This mirrors the arithmetic the CPU writeback used to do.
  const colliderOrientation = buffers.worldOrientation(bodyIndex);
  const colliderPosition = buffers.worldPosition(bodyIndex);
  const localOrientation = uniform(
    new THREE.Vector4(...(binding.objectLocalOrientation as Quat4)),
  ) as TslNode;
  const localOffset = uniform(new THREE.Vector3(...(binding.objectLocalOffset as Vec3))) as TslNode;

  const orientation = multiplyQuaternions(colliderOrientation, localOrientation);
  const position = colliderPosition.add(rotateByQuaternion(localOffset, colliderOrientation));

  // The authored scale stays on the CPU: it is not simulated and never changes
  // during a step. Resolve it before the model matrix is pinned to identity,
  // and force the world matrix up to date first — a node added to the scene
  // this frame still has a stale identity matrixWorld, which would silently
  // read back a scale of 1.
  const worldScale = new THREE.Vector3();
  hierarchy.rootWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale);
  const scale = uniform(worldScale.clone()) as TslNode;

  // `normalNode` is consumed in view space, not world space. The model matrix is
  // identity here, so rotating the geometry normal by the body orientation gives
  // the world normal, and transformNormalToView then takes it the rest of the
  // way. Handing this node a world normal silently wrecks all the lighting.

  const bound: BoundMesh[] = [];
  for (const [mesh, relative] of hierarchy.meshes) {
    const localPosition = (uniform(relative) as TslNode).mul(vec4(positionLocal, 1)).xyz;
    const localNormal = (uniform(new THREE.Matrix3().getNormalMatrix(relative)) as TslNode).mul(normalLocal).div(scale);
    const worldPosition = gpuPosePositionAfterDeformation(
      rotateByQuaternion(localPosition.mul(scale), orientation).add(position),
    );
    const viewNormal = transformNormalToView(rotateByQuaternion(localNormal, orientation).normalize());
    const originalMaterial = mesh.material;
    const convert = (material: THREE.Material): THREE.Material => {
      // asNodeMaterial always returns a fresh material, so pointing it at this
      // body cannot disturb a material shared with another object.
      const owned = asNodeMaterial(material, objectColor) as MeshPhysicalNodeMaterial & {
        positionNode: TslNode;
        castShadowPositionNode: TslNode;
        normalNode: TslNode;
      };
      owned.positionNode = worldPosition;
      owned.castShadowPositionNode = worldPosition;
      owned.normalNode = viewNormal;
      owned.needsUpdate = true;
      return owned;
    };
    const poseMaterial = Array.isArray(originalMaterial)
      ? originalMaterial.map(convert)
      : convert(originalMaterial);
    mesh.material = poseMaterial;
    bound.push({ mesh, originalMaterial, poseMaterial });
  }
  const restoreTransforms = pinGpuPoseTransforms([node, ...hierarchy.meshes.keys()]);

  return {
    restore() {
      for (const { mesh, originalMaterial, poseMaterial } of bound) {
        mesh.material = originalMaterial;
        for (const material of Array.isArray(poseMaterial) ? poseMaterial : [poseMaterial]) {
          if (material !== originalMaterial) material.dispose();
        }
      }
      restoreTransforms();
      node.updateMatrixWorld(true);
    },
  };
}

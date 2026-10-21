import * as THREE from "three";
import type { RuntimePrimitive } from "../../world/domain/runtime-primitive";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { assignThreeShadowCasterLayer } from "../../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import { markSceneDirty, type Runtime } from "../runtime";
import type { PhysicsPoseBuffers } from "./gpu-pose";
import { poseMaterialFor } from "./instanced-bodies";

/** Three clears ranges after upload. Coalesce repeated changes while a view is hidden. */
function markSlot(attribute: THREE.InstancedBufferAttribute, dirty: Set<number>, slot: number) {
  if (!attribute.updateRanges.length) dirty.clear();
  if (!dirty.has(slot)) { dirty.add(slot); attribute.addUpdateRange(slot * 3, 3); }
  attribute.needsUpdate = true;
}

function createGroup(kind: "box" | "sphere", start: number, capacity: number, poses: PhysicsPoseBuffers) {
  const base = kind === "box" ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(0.5, 20, 12);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index?.clone() ?? null;
  for (const [name, value] of Object.entries(base.attributes)) geometry.setAttribute(name, (value as THREE.BufferAttribute).clone());
  base.dispose();
  geometry.instanceCount = capacity;
  const attribute = (name: string, size: number, values = new Float32Array(capacity * size)) => {
    const value = new THREE.InstancedBufferAttribute(values, size).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, value); return value;
  };
  attribute("bodyPoseIndex", 1, Float32Array.from({ length: capacity }, (_, i) => start + i));
  const offset = attribute("bodyLocalOffset", 3);
  const orientations = new Float32Array(capacity * 4);
  for (let i = 0; i < capacity; i++) orientations[i * 4 + 3] = 1;
  attribute("bodyLocalOrientation", 4, orientations);
  const scale = attribute("bodyScale", 3), color = attribute("bodyColor", 3);
  const dirtyScale = new Set<number>(), dirtyColor = new Set<number>();
  const dirtyOffset = new Set<number>();
  const source = new THREE.MeshStandardMaterial({ roughness: 0.65 });
  const material = poseMaterialFor(source, poses); source.dispose();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `physics.runtime.${kind}`; mesh.frustumCulled = false; mesh.raycast = () => undefined;
  mesh.castShadow = true; mesh.receiveShadow = true; assignThreeShadowCasterLayer(mesh, "dynamic");
  return {
    mesh,
    change(index: number, primitive: RuntimePrimitive | null, binding?: PhysicsBodyBinding) {
      const slot = index - start;
      const size = !primitive || primitive.shape.kind !== kind ? [0, 0, 0]
        : primitive.shape.kind === "box" ? primitive.shape.size : Array(3).fill(primitive.shape.radius * 2);
      scale.setXYZ(slot, size[0], size[1], size[2]); markSlot(scale, dirtyScale, slot);
      const translation = binding?.objectLocalOffset ?? [0, 0, 0];
      offset.setXYZ(slot, ...translation as [number, number, number]); markSlot(offset, dirtyOffset, slot);
      if (primitive) {
        const value = new THREE.Color(primitive.color);
        color.setXYZ(slot, value.r, value.g, value.b); markSlot(color, dirtyColor, slot);
      }
    },
    dispose() { mesh.removeFromParent(); material.dispose(); geometry.dispose(); },
  };
}

/** Two draw groups per view, sparse attributes on changes, no per-instance frame walk. */
export function createRuntimePrimitiveViews(poses: PhysicsPoseBuffers, start: number, capacity: number, retire: () => Promise<void>) {
  const records = new Map<number, { primitive: RuntimePrimitive; binding?: PhysicsBodyBinding }>();
  const views = new Map<Runtime, ReturnType<typeof createGroup>[]>();
  let disposed = false;
  const detach = (runtime: Runtime) => {
    const groups = views.get(runtime); if (!groups) return;
    views.delete(runtime); groups.forEach((group) => group.mesh.removeFromParent());
    runtime.invalidateShadowCasterMaterials?.(); markSceneDirty(runtime);
    // Already submitted draws may still use these attributes/materials.
    void retire().catch(() => undefined).then(() => groups.forEach((group) => group.dispose()));
  };
  return {
    present(runtime: Runtime) {
      if (disposed || !capacity || runtime.disposed || views.has(runtime)) return;
      const groups: ReturnType<typeof createGroup>[] = [];
      try {
        groups.push(createGroup("box", start, capacity, poses)); groups.push(createGroup("sphere", start, capacity, poses));
        for (const [index, value] of records) groups.forEach((group) => group.change(index, value.primitive, value.binding));
        groups.forEach((group) => runtime.scene.add(group.mesh)); views.set(runtime, groups); markSceneDirty(runtime);
      } catch (error) { groups.forEach((group) => group.dispose()); throw error; }
    },
    change(index: number, primitive: RuntimePrimitive | null, binding?: PhysicsBodyBinding) {
      if (primitive) records.set(index, { primitive, binding }); else records.delete(index);
      for (const [runtime, groups] of views) { groups.forEach((group) => group.change(index, primitive, binding)); markSceneDirty(runtime); }
    },
    detach,
    dispose() { if (disposed) return; disposed = true; for (const runtime of views.keys()) detach(runtime); records.clear(); },
  };
}

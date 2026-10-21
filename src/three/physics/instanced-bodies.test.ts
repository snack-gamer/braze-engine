import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { THREE_DYNAMIC_SHADOW_CASTER_LAYER } from "../../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import { PhysicsPoseBuffers } from "./gpu-pose";
import { buildInstancedBodyGroups } from "./instanced-bodies";

describe("buildInstancedBodyGroups", () => {
  it("owns its geometry attributes so restoring Play Mode cannot invalidate the source mesh", () => {
    const sourceGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sourceMaterial = new THREE.MeshStandardMaterial();
    const sourceMesh = new THREE.Mesh(sourceGeometry, sourceMaterial);
    sourceMesh.castShadow = true;
    const parent = new THREE.Group();
    parent.add(sourceMesh);
    const binding = {
      objectLocalOffset: [0, 0, 0],
      objectLocalOrientation: [0, 0, 0, 1],
    } as unknown as PhysicsBodyBinding;

    const groups = buildInstancedBodyGroups(
      [{ bodyIndex: 0, binding, node: sourceMesh }],
      new PhysicsPoseBuffers(1),
      parent,
    );
    const runtimeGeometry = groups.meshes[0]?.geometry;

    expect(runtimeGeometry).toBeDefined();
    expect(runtimeGeometry?.index).not.toBe(sourceGeometry.index);
    for (const [name, sourceAttribute] of Object.entries(sourceGeometry.attributes)) {
      expect(runtimeGeometry?.getAttribute(name)).not.toBe(sourceAttribute);
    }
    expect(sourceMesh.visible).toBe(false);
    expect(groups.meshes[0]?.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(true);
    expect(groups.meshes[0]?.layers.isEnabled(0)).toBe(true);

    groups.restore();

    expect(sourceMesh.visible).toBe(true);
    expect(sourceGeometry.index).not.toBeNull();
    expect(sourceGeometry.getAttribute("position")).toBeDefined();
    sourceGeometry.dispose();
    sourceMaterial.dispose();
  });
});

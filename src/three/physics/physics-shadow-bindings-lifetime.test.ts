import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { Runtime } from "../runtime";
import { PhysicsPoseBuffers } from "./gpu-pose";
import { createRuntimePrimitiveViews } from "./runtime-primitive-views";

it("evicts reserve-only runtime shadow bindings before their detached groups retire", async () => {
  const runtime = createRuntime(), events: string[] = [];
  expect(runtime.objectMap.size).toBe(0);
  runtime.invalidateShadowCasterMaterials = vi.fn(() => { events.push("invalidate"); });
  let finishRetirement!: () => void;
  const retirement = new Promise<void>((resolve) => { finishRetirement = resolve; });
  const views = createRuntimePrimitiveViews(new PhysicsPoseBuffers(1), 0, 1, () => {
    events.push("retire"); return retirement;
  });
  views.present(runtime);
  const groups = runtime.scene.children.filter((node) => (node as THREE.Mesh).isMesh) as THREE.Mesh[];
  expect(groups).toHaveLength(2);
  const disposeMaterial = vi.fn();
  for (const group of groups) (group.material as THREE.Material).addEventListener("dispose", disposeMaterial);

  views.detach(runtime);
  expect(groups.every((group) => group.parent === null)).toBe(true);
  expect(events).toEqual(["invalidate", "retire"]);
  expect(disposeMaterial).not.toHaveBeenCalled();
  finishRetirement();
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  expect(disposeMaterial).toHaveBeenCalledTimes(2);
  views.dispose();
  expect(events).toEqual(["invalidate", "retire"]);
});

function createRuntime(): Runtime {
  const scene = new THREE.Scene(), objectRoot = new THREE.Group();
  scene.add(objectRoot);
  return {
    scene, objectRoot, objectMap: new Map(), pendingAssetLoads: new Set(), disposed: false,
    framesSinceSceneChange: 3, requestFrame: vi.fn(),
  } as unknown as Runtime;
}

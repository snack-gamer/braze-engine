import type { SceneObject } from "../../types";
import { markSceneDirty, type Runtime } from "../runtime";
import { subscribeRuntimeBodyLifecycle } from "../reconciliation/body-lifecycle";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { bindObjectToGpuPose, type GpuPoseBinding, type PhysicsPoseBuffers } from "./gpu-pose";
import { buildInstancedBodyGroups, type InstancedBodyCandidate } from "./instanced-bodies";
import { captureGpuPoseHierarchy } from "./gpu-pose-hierarchy";
import { invalidateReceiverMaterials } from "../invalidate-receiver-materials";

type PoseView = { restore: () => void; instancedBodies: number; revision: number };

/** View-owned render bindings over a single world's shared GPU pose buffers. */
export function createPhysicsPoseViews(
  bindings: readonly PhysicsBodyBinding[],
  buffers: PhysicsPoseBuffers,
  objects: readonly SceneObject[],
) {
  const colors = new Map(objects.map((object) => [object.id, object.color]));
  const objectIds = new Set(bindings.filter((binding) => binding.writesObjectPose).map((binding) => binding.objectId));
  const views = new Map<Runtime, PoseView>();

  const detach = (runtime: Runtime) => {
    const view = views.get(runtime);
    if (!view) return;
    views.delete(runtime);
    view.restore();
    runtime.invalidateShadowCasterMaterials?.();
    invalidateReceiverMaterials(runtime.scene);
    markSceneDirty(runtime);
  };

  return {
    present(runtime: Runtime, revision: number): boolean {
      if (runtime.disposed) return false;
      let view = views.get(runtime);
      if (!view) {
        // Bind once the view's authored meshes exist; imported assets wake the
        // view again on completion. Never scan body geometry every frame.
        if (runtime.pendingAssetLoads.size > 0 || runtime.objectMap.size === 0) return false;
        view = bindView(runtime, bindings, buffers, colors);
        const restore = view.restore;
        const unsubscribe = subscribeRuntimeBodyLifecycle(runtime, (event) => {
          if (event.phase === "willChange" && objectIds.has(event.objectId)) detach(runtime);
        });
        view.restore = () => { unsubscribe(); restore(); };
        views.set(runtime, view);
      }
      if (view.revision === revision) return false;
      view.revision = revision;
      return true;
    },
    detach,
    instancedBodies(): number {
      let count = 0;
      for (const view of views.values()) count = Math.max(count, view.instancedBodies);
      return count;
    },
    dispose() {
      for (const runtime of views.keys()) detach(runtime);
    },
  };
}

function bindView(
  runtime: Runtime,
  bindings: readonly PhysicsBodyBinding[],
  buffers: PhysicsPoseBuffers,
  colors: ReadonlyMap<string, string>,
): PoseView {
  const candidates: InstancedBodyCandidate[] = [];
  for (let bodyIndex = 0; bodyIndex < bindings.length; bodyIndex += 1) {
    const binding = bindings[bodyIndex];
    if (!binding.writesObjectPose) continue;
    const node = runtime.objectMap.get(binding.objectId);
    if (node) candidates.push({ bodyIndex, binding, node });
  }
  const individual: GpuPoseBinding[] = [];
  const roots = new Set(candidates.map((candidate) => candidate.node));
  const hierarchies = new Map(candidates.map((candidate) => [candidate.bodyIndex, captureGpuPoseHierarchy(candidate.node, roots)]));
  const instanced = buildInstancedBodyGroups(candidates, buffers, runtime.objectRoot);
  const restore = () => {
    instanced.restore();
    for (const binding of individual) binding.restore();
    individual.length = 0;
  };
  try {
    for (const candidate of candidates) {
      if (instanced.instancedBodyIndices.has(candidate.bodyIndex)) continue;
      individual.push(bindObjectToGpuPose(
        candidate.node, candidate.binding, candidate.bodyIndex, buffers,
        colors.get(candidate.binding.objectId) ?? "#ffffff",
        hierarchies.get(candidate.bodyIndex),
      ));
    }
    runtime.invalidateShadowCasterMaterials?.();
    markSceneDirty(runtime);
    return { restore, instancedBodies: instanced.instancedBodyIndices.size, revision: -1 };
  } catch (error) {
    restore();
    throw error;
  }
}

import { useMemo } from "react";
import { createSceneMutationScope } from "../application/scene-mutation-scope";
import { useSceneWorkspaceState } from "../components/SceneWorkspaceContext";

/** Captured scene callbacks expire when another document becomes active. */
export function useSceneMutationScope() {
  const { controller, activeScene } = useSceneWorkspaceState();
  const generation = activeScene?.instanceId ?? 0;
  return useMemo(() => createSceneMutationScope(generation,
    () => controller ? { generation: controller.getSnapshot().session.activeInstanceId, busy: controller.getSnapshot().busy } : { generation, busy: false }), [controller, generation]);
}

import { normalizeHierarchy } from "../../lib/hierarchy";
import type { HydratedSceneState } from "../application/scene-hydration";
import { useCallback, useMemo, useState } from "react";
import { defaultCamera, defaultEnvironment, seedCameraId, seedObjects } from "../../constants";
import { useHistory } from "../../hooks/useHistory";
import type { CameraState, EnvironmentSettings, SceneObject } from "../../types";
import { defaultActiveSceneObjectId } from "../application/active-object-selection";
import { useSceneMutationScope } from "./useSceneMutationScope";

/** Scene-owned values stay separate from the persistent editor/project workspace. */
export function useSceneAuthoringState() {
  const scope = useSceneMutationScope();
  const history = useHistory<SceneObject[]>(seedObjects);
  const [activeObjectId, updateActiveObjectId] = useState(defaultActiveSceneObjectId(seedObjects));
  const [activeCameraId, updateActiveCameraId] = useState(seedCameraId);
  const [camera, updateCamera] = useState<CameraState>(defaultCamera);
  const [environment, updateEnvironment] = useState<EnvironmentSettings>(defaultEnvironment);
  // Canonical hydration is authorized by the sync lifetime, including while switching is busy.
  const hydrate = useCallback((next: HydratedSceneState) => {
    const objects = normalizeHierarchy(next.objects);
    history.reset(objects);
    updateActiveObjectId(next.activeObjectId ?? objects[0]?.id ?? "");
    updateActiveCameraId(next.activeCameraId ?? objects.find((object) => object.primitive === "camera")?.id ?? "");
    updateCamera(next.camera);
    updateEnvironment(next.environment);
  }, [history.reset]);
  const mutations = useMemo(() => ({
    set: scope.bind(history.set),
    setActiveObjectId: scope.bind(updateActiveObjectId), setActiveCameraId: scope.bind(updateActiveCameraId),
    setCamera: scope.bind(updateCamera), setEnvironment: scope.bind(updateEnvironment),
  }), [scope, history.set]);
  return { scope, hydrate, objectsHistory: { ...history, set: mutations.set }, activeObjectId, activeCameraId, camera, environment, ...mutations };
}

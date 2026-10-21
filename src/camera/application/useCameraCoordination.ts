import { useSceneMutationScope } from "../../scene/hooks/useSceneMutationScope";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultCamera } from "../../constants";
import { resolveEffectiveDepthOfField } from "../../lib/depth-of-field";
import { cameraLocalFromWorld, cameraStateForObject } from "../../lib/hierarchy";
import type { CameraState, SceneObject } from "../../types";

type CameraCoordinationInput = {
  camera: CameraState;
  setCamera: (camera: CameraState) => void;
  sceneObjects: SceneObject[];
  stageObjects: SceneObject[];
  activeCameraId: string;
  setActiveCameraId: (id: string) => void;
  updateSceneObject: (id: string, patch: Partial<SceneObject>) => void;
  prefabObjects: SceneObject[];
  prefabActiveCameraId: string;
  updatePrefabObject: (id: string, patch: Partial<SceneObject>) => void;
  prefabModeActive: boolean;
  prefabSessionKey?: string;
};

/** Coordinates editor navigation with authored scene and prefab cameras. */
export function useCameraCoordination(input: CameraCoordinationInput) {
  const {
    camera,
    setCamera,
    sceneObjects,
    stageObjects,
    activeCameraId,
    setActiveCameraId,
    updateSceneObject,
    prefabObjects,
    prefabActiveCameraId,
    updatePrefabObject,
    prefabModeActive,
    prefabSessionKey,
  } = input;
  const { generation } = useSceneMutationScope();
  const [sceneViewThroughCameraId, setSceneViewThroughCameraId] = useState<string | null>(null);
  const [prefabViewThroughCameraId, setPrefabViewThroughCameraId] = useState<string | null>(null);
  const suppressClearUntilRef = useRef(0);

  const activeCamera = useMemo(
    () => sceneObjects.find((object) => object.id === activeCameraId && object.primitive === "camera") ?? null,
    [activeCameraId, sceneObjects],
  );
  const gameCameras = useMemo(
    () => sceneObjects.filter((object) => object.primitive === "camera").map(({ id, name }) => ({ id, name })),
    [sceneObjects],
  );
  const gameActiveCamera = useMemo(
    () => stageObjects.find((object) => object.id === activeCameraId && object.primitive === "camera") ?? null,
    [activeCameraId, stageObjects],
  );
  const gameCamera = useMemo(
    () => gameActiveCamera ? cameraStateForObject(stageObjects, gameActiveCamera) ?? defaultCamera : defaultCamera,
    [gameActiveCamera, stageObjects],
  );
  const gameDepthOfField = useMemo(
    () => resolveEffectiveDepthOfField(gameActiveCamera?.depthOfField ?? null, gameCamera, stageObjects),
    [gameActiveCamera, gameCamera, stageObjects],
  );
  const editorActiveCameraId = prefabModeActive ? prefabActiveCameraId || activeCameraId : activeCameraId;
  const editorCameraObject = prefabModeActive
    ? prefabObjects.find((object) => object.id === editorActiveCameraId && object.primitive === "camera") ?? null
    : activeCamera;
  const editorDepthOfField = useMemo(
    () => resolveEffectiveDepthOfField(editorCameraObject?.depthOfField ?? null, camera, stageObjects),
    [camera, editorCameraObject?.depthOfField, stageObjects],
  );

  useEffect(() => {
    setSceneViewThroughCameraId(null); setPrefabViewThroughCameraId(null);
    suppressClearUntilRef.current = 0;
  }, [generation]);

  const markViewThroughSnap = useCallback(() => {
    suppressClearUntilRef.current = performance.now() + 250;
  }, []);
  const handleEditorCameraChange = useCallback((next: CameraState) => {
    setCamera(next);
    if (performance.now() < suppressClearUntilRef.current) return;
    setSceneViewThroughCameraId(null);
    setPrefabViewThroughCameraId(null);
  }, [setCamera]);

  const lookThrough = useCallback((objects: SceneObject[], cameraId: string, prefab: boolean) => {
    const target = objects.find((object) => object.id === cameraId && object.primitive === "camera");
    if (!target?.camera) return;
    markViewThroughSnap();
    if (prefab) setPrefabViewThroughCameraId(cameraId);
    else setSceneViewThroughCameraId(cameraId);
    setCamera(cameraStateForObject(objects, target) ?? {
      position: [...target.position],
      target: [...target.camera.target],
      fov: target.camera.fov,
    });
  }, [markViewThroughSnap, setCamera]);
  const alignToView = useCallback((
    objects: SceneObject[],
    cameraId: string,
    updateObject: (id: string, patch: Partial<SceneObject>) => void,
  ) => {
    const target = objects.find((object) => object.id === cameraId && object.primitive === "camera");
    if (!target?.camera) return;
    const local = cameraLocalFromWorld(objects, target, camera);
    updateObject(cameraId, {
      position: local.position,
      camera: { ...target.camera, target: local.target, fov: camera.fov },
    });
  }, [camera]);

  const lookThroughSceneCamera = useCallback(
    (id: string) => lookThrough(sceneObjects, id, false),
    [lookThrough, sceneObjects],
  );
  const lookThroughPrefabCamera = useCallback(
    (id: string) => lookThrough(prefabObjects, id, true),
    [lookThrough, prefabObjects],
  );
  const alignSceneCameraToView = useCallback(
    (id: string) => alignToView(sceneObjects, id, updateSceneObject),
    [alignToView, sceneObjects, updateSceneObject],
  );
  const alignPrefabCameraToView = useCallback(
    (id: string) => alignToView(prefabObjects, id, updatePrefabObject),
    [alignToView, prefabObjects, updatePrefabObject],
  );

  useEffect(() => {
    if (activeCamera) return;
    const fallback = sceneObjects.find((object) => object.primitive === "camera");
    if (fallback) setActiveCameraId(fallback.id);
  }, [activeCamera, sceneObjects, setActiveCameraId]);
  useEffect(() => {
    setPrefabViewThroughCameraId(null);
  }, [prefabSessionKey]);
  useEffect(() => {
    if (sceneViewThroughCameraId && !sceneObjects.some((object) => object.id === sceneViewThroughCameraId)) {
      setSceneViewThroughCameraId(null);
    }
    if (prefabViewThroughCameraId && !prefabObjects.some((object) => object.id === prefabViewThroughCameraId)) {
      setPrefabViewThroughCameraId(null);
    }
  }, [prefabObjects, prefabViewThroughCameraId, sceneObjects, sceneViewThroughCameraId]);

  return {
    activeCamera,
    alignPrefabCameraToView,
    alignSceneCameraToView,
    editorActiveCameraId,
    editorDepthOfField,
    editorViewThroughCameraId: prefabModeActive ? prefabViewThroughCameraId : sceneViewThroughCameraId,
    gameActiveCamera,
    gameCamera,
    gameCameras,
    gameDepthOfField,
    handleEditorCameraChange,
    lookThroughPrefabCamera,
    lookThroughSceneCamera,
  };
}

export type CameraCoordinationController = ReturnType<typeof useCameraCoordination>;

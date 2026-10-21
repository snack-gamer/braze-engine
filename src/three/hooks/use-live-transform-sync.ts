import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type {
  LiveObjectTransform,
  LiveTransformSubscription,
} from "../../scene/authoring/live-transform";
import type { SceneObject } from "../../types";
import { markSceneDirty, type Runtime } from "../runtime";
import { applyTransform } from "../transform";

const worldCameraPosition = new THREE.Vector3();
const worldCameraTarget = new THREE.Vector3();

export function applyLiveObjectTransform(
  runtime: Runtime,
  objects: SceneObject[],
  activeCameraId: string,
  sample: LiveObjectTransform,
): void {
  const source = objects.find((object) => object.id === sample.objectId);
  const node = runtime.objectMap.get(sample.objectId);
  if (!source || !node) return;

  const liveSource = source.primitive === "camera" && source.camera && sample.transform.cameraTarget
    ? {
        ...source,
        ...sample.transform,
        camera: { ...source.camera, target: sample.transform.cameraTarget },
      }
    : { ...source, ...sample.transform };
  applyTransform(node, liveSource);
  runtime.objectRoot.updateWorldMatrix(true, true);
  runtime.clonersDirty = true;
  runtime.labelsDirty = true;
  runtime.invalidateShadowCasterTransform(sample.objectId);

  const activeCamera = objects.find(
    (object) => object.id === activeCameraId && object.primitive === "camera" && object.camera,
  );
  const cameraNode = activeCamera ? runtime.objectMap.get(activeCamera.id) : null;
  if (activeCamera?.camera && cameraNode) {
    cameraNode.getWorldPosition(worldCameraPosition);
    const localTarget = sample.objectId === activeCamera.id && sample.transform.cameraTarget
      ? sample.transform.cameraTarget
      : activeCamera.camera.target;
    worldCameraTarget.set(...localTarget);
    cameraNode.parent?.localToWorld(worldCameraTarget);
    runtime.camera.position.copy(worldCameraPosition);
    runtime.controls.target.copy(worldCameraTarget);
    runtime.camera.updateProjectionMatrix();
    runtime.controls.update();
  }

  markSceneDirty(runtime);
}

type Args = {
  activeCameraId: string;
  objects: SceneObject[];
  runtimeRef: MutableRefObject<Runtime | null>;
  subscribe?: LiveTransformSubscription;
};

/** Applies ephemeral Scene-view gizmo motion directly to another viewport. */
export function useLiveTransformSync({ activeCameraId, objects, runtimeRef, subscribe }: Args): void {
  const stateRef = useRef({ activeCameraId, objects });
  stateRef.current = { activeCameraId, objects };

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe((sample) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const state = stateRef.current;
      applyLiveObjectTransform(runtime, state.objects, state.activeCameraId, sample);
    });
  }, [runtimeRef, subscribe]);
}

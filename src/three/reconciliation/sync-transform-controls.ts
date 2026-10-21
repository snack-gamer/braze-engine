import type { SceneObject, TransformMode, TransformSpace } from "../../types";
import { transformControlPolicy, type TransformTargetKind } from "../controls/transform-policy";
import { selectedModifierHandle } from "../modifiers/handles";
import { selectedColliderHandle } from "../physics/collider-gizmos";
import type { Runtime } from "../runtime";

export type TransformControlPresentation = {
  mode: TransformMode;
  visible: boolean;
  space: TransformSpace;
  snapEnabled: boolean;
  translationSnap: number;
  rotationSnapDegrees: number;
  scaleSnap: number;
  gizmoSize: number;
};

export function syncTransformControls(
  runtime: Runtime,
  selectedObject: SceneObject | undefined,
  hasSolo: boolean,
  presentation: TransformControlPresentation,
): void {
  const allowed = Boolean(
    selectedObject
    && presentation.visible
    && !selectedObject.locked
    && !selectedObject.transformLocked
    && (!hasSolo || selectedObject.solo),
  );
  const modifierHandle = allowed ? selectedModifierHandle(runtime) : undefined;
  const colliderHandle = allowed ? selectedColliderHandle(runtime) : undefined;
  const target = modifierHandle?.visible && modifierHandle.userData.objectId === selectedObject?.id
    ? modifierHandle
    : colliderHandle?.visible && colliderHandle.userData.objectId === selectedObject?.id
      ? colliderHandle
      : allowed && selectedObject
        ? runtime.objectMap.get(selectedObject.id)
        : undefined;
  const colliderKind = target?.userData.colliderHandleKind;
  const colliderFaceAxis = target?.userData.colliderHandleAxis;
  const targetKind: TransformTargetKind = target === modifierHandle
    ? "modifier"
    : colliderKind === "center"
      ? "collider-center"
      : colliderKind === "face"
        ? "collider-face"
        : "object";
  const policy = transformControlPolicy({
    requestedMode: presentation.mode,
    requestedSpace: presentation.space,
    targetKind,
    snapEnabled: presentation.snapEnabled,
    translationSnap: presentation.translationSnap,
    rotationSnapDegrees: presentation.rotationSnapDegrees,
    scaleSnap: presentation.scaleSnap,
    gizmoSize: presentation.gizmoSize,
  });
  runtime.transformControls.setMode(policy.mode);
  runtime.transformControls.setSpace(policy.space);
  runtime.transformControls.showX = colliderKind !== "face" || colliderFaceAxis === 0;
  runtime.transformControls.showY = colliderKind !== "face" || colliderFaceAxis === 1;
  runtime.transformControls.showZ = colliderKind !== "face" || colliderFaceAxis === 2;
  runtime.transformControls.size = policy.size;
  runtime.transformControls.translationSnap = policy.translationSnap;
  runtime.transformControls.rotationSnap = policy.rotationSnap;
  runtime.transformControls.scaleSnap = policy.scaleSnap;
  if (target) {
    runtime.transformControls.attach(target);
    runtime.transformControls.enabled = true;
    runtime.transformControls.getHelper().visible = true;
  } else {
    runtime.transformControls.detach();
    runtime.transformControls.enabled = false;
    runtime.transformControls.getHelper().visible = false;
  }
}

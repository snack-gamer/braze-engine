import type { MutableRefObject } from "react";
import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { CameraState, ColliderComponent, ModifierPinSelection, SceneObject } from "../../types";
import type { ObjectTransformPatch, Runtime } from "../runtime";
import type { CameraEmitter } from "./camera-emitter";
import { createFocus } from "./focus";
import { installKeyboard } from "./keyboard";
import { installPointer } from "./pointer";
import { installTransformBinding } from "./transform-binding";

type Callbacks = {
  onSelectObject: (id: string) => void;
  onCameraChange: (camera: CameraState) => void;
  onTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onPreviewTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onUpdateModifierPin: (objectId: string, modifierId: string, pinId: string, localOffset: [number, number, number]) => void;
  onUpdateCollider: (objectId: string, colliderId: string, patch: Partial<ColliderComponent>) => void;
  onSelectModifierPin: (selection: ModifierPinSelection | null) => void;
};

type InputArgs = {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transformControls: TransformControls;
  objectRoot: THREE.Group;
  pointer: THREE.Vector2;
  raycaster: THREE.Raycaster;
  emitter: CameraEmitter;
  runtimeRef: MutableRefObject<Runtime | null>;
  objectsRef: MutableRefObject<SceneObject[]>;
  callbacksRef: MutableRefObject<Callbacks>;
  activeObjectIdRef: MutableRefObject<string>;
};

type InputController = {
  dispose: () => void;
  // The animate loop calls this each frame to advance the F-to-focus tween.
  tickFocus: () => boolean;
  focusSelection: () => void;
  cancelFocus: () => void;
};

// Wires together the four viewport-input subsystems (focus, pointer drags,
// keyboard, transform-controls). Each subsystem owns one concern and
// communicates with the others through narrow callbacks (e.g. pointer.ts
// calls focus.cancel() on pointerdown).
export function installInputs(args: InputArgs): InputController {
  const focus = createFocus({
    camera: args.camera,
    controls: args.controls,
    emitter: args.emitter,
    runtimeRef: args.runtimeRef,
    activeObjectIdRef: args.activeObjectIdRef,
  });
  const pointer = installPointer({
    canvas: args.canvas,
    camera: args.camera,
    controls: args.controls,
    transformControls: args.transformControls,
    objectRoot: args.objectRoot,
    pointer: args.pointer,
    raycaster: args.raycaster,
    emitter: args.emitter,
    focus,
    runtimeRef: args.runtimeRef,
    objectsRef: args.objectsRef,
    callbacksRef: args.callbacksRef,
  });
  const keyboard = installKeyboard({
    controls: args.controls,
    transformControls: args.transformControls,
    focus,
  });
  const transformBinding = installTransformBinding({
    controls: args.controls,
    transformControls: args.transformControls,
    runtimeRef: args.runtimeRef,
    objectsRef: args.objectsRef,
    callbacksRef: args.callbacksRef,
  });

  return {
    tickFocus: focus.tick,
    focusSelection: focus.start,
    cancelFocus: focus.cancel,
    dispose: () => {
      pointer.dispose();
      keyboard.dispose();
      transformBinding.dispose();
    },
  };
}

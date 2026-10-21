import type * as THREE from "three";
import type { EngineFrame } from "../../runtime/engine-loop";

/**
 * Adds editor-only behavior to the shared model preview without creating a
 * renderer, owning imported resources, or scheduling a second frame loop.
 */
export type ModelPreviewExtensionContext = Readonly<{
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
  requestRender: () => void;
}>;

/** Lets an extension define the exact content that owns preview framing. */
export type ModelPreviewAttachment = Readonly<{
  frameObjects: readonly THREE.Object3D[];
}>;

export type ModelPreviewExtension = {
  attach: (context: ModelPreviewExtensionContext) => ModelPreviewAttachment | void;
  detach: () => void;
  /** Return true only when another frame is needed (for example, playback). */
  render?: (frame: EngineFrame) => boolean | void;
  dispose: () => void;
};

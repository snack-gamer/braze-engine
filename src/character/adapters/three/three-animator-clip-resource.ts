import type * as THREE from "three";

export type ThreeAnimatorClipBinding = Readonly<{
  root: THREE.Object3D;
  clip: THREE.AnimationClip;
}>;

export type ThreeAnimatorClipResource = Readonly<{
  bindings: readonly ThreeAnimatorClipBinding[];
}>;

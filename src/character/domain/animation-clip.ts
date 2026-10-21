import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterDocumentExtensions } from "./character-document";
import type { RigKind } from "./rig";
import type { BoneId } from "./skeleton";
import type { CharacterVector3 } from "./character-values";

export type AnimationEventPayload = Record<string, string | number | boolean | null>;

export type AnimationEvent = {
  id: string;
  name: string;
  timeSeconds: number;
  payload: AnimationEventPayload;
};

export type AnimationClipBinding =
  | {
      kind: "bone";
      boneId: BoneId;
      channels: Array<"translation" | "rotation" | "scale">;
    }
  | {
      kind: "blendShape";
      nodePath: string;
      blendShapeName: string;
    }
  | {
      kind: "property";
      nodePath: string;
      property: string;
    };

export type AnimationClipSourceRig = {
  kind: RigKind;
  skeletonRef?: AssetRef;
  avatarRef?: AssetRef;
  compatibilitySignature?: string;
};

export type ClipRootMotionMetadata = {
  sourceBoneId?: BoneId;
  hasTranslation: boolean;
  hasRotation: boolean;
  averageVelocity: CharacterVector3;
  averageAngularSpeedDegrees: number;
};

/** Immutable metadata for a clip subasset; sampled curves remain in its artifact. */
export type AnimationClipAsset = {
  version: 1;
  id: string;
  name: string;
  assetRef: AssetRef;
  sourceModelRef: AssetRef;
  sourceRig: AnimationClipSourceRig;
  durationSeconds: number;
  sampleRateHz: number;
  looping: boolean;
  bindings: AnimationClipBinding[];
  events: AnimationEvent[];
  rootMotion: ClipRootMotionMetadata;
  extensions?: CharacterDocumentExtensions;
};

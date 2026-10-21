import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterVector2 } from "./character-values";

export type AnimatorClipMotion = {
  kind: "clip";
  clipRef: AssetRef;
  speed: number;
  timeScaleParameterId?: string;
  /** Undefined inherits the imported source clip setting. */
  loopMode?: "loop" | "once";
};

export type AnimatorBlendTreeMotion = {
  kind: "blendTree";
  tree: AnimatorBlendTree;
};

export type AnimatorMotion = AnimatorClipMotion | AnimatorBlendTreeMotion;

type SharedBlendTreeChild = {
  id: string;
  motion: AnimatorMotion;
  timeScale: number;
  mirror: boolean;
};

export type BlendTree1D = {
  kind: "1d";
  parameterId: string;
  children: Array<SharedBlendTreeChild & { threshold: number }>;
};

export type BlendTree2D = {
  kind: "2dSimpleDirectional" | "2dFreeformDirectional" | "2dFreeformCartesian";
  parameterXId: string;
  parameterYId: string;
  children: Array<SharedBlendTreeChild & { position: CharacterVector2 }>;
};

export type BlendTreeDirect = {
  kind: "direct";
  normalizeWeights: boolean;
  children: Array<SharedBlendTreeChild & { weightParameterId: string }>;
};

export type AnimatorBlendTree = BlendTree1D | BlendTree2D | BlendTreeDirect;

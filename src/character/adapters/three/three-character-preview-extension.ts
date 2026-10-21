import * as THREE from "three";
import type { ModelPreviewExtension, ModelPreviewExtensionContext } from "../../../assets/preview/model-preview-extension";
import type { EngineFrame } from "../../../runtime/engine-loop";
import type { BoneId } from "../../domain/skeleton";
import {
  bindExtractedThreeSkeleton,
  extractThreeSkeletonDefinition,
  matchesThreeSkeletonExtractionTarget,
  type ThreeSkeletonAssetIdentity,
  type ThreeSkeletonExtraction,
} from "./three-skeleton-extractor";
import {
  createThreeAnimationPreviewSession,
  type ThreeAnimationPreviewSession,
} from "./three-animation-preview-session";
import {
  createThreeSkeletonPreviewOverlay,
  type ThreeSkeletonPreviewOverlay,
} from "./three-skeleton-preview-overlay";
import { isolatePreviewMeshes } from "../../../assets/preview/three/preview-object-visibility";
import { applyAnimationClipLoopPose } from "../../../three/animation-clip-loop-pose";
import { trimAnimationClipToFrames } from "../../../three/animation-clip-range";

export type CharacterPreviewClip = Readonly<{ index: number; name: string }>;
export type CharacterPreviewAnalysis = Readonly<{
  extraction: ThreeSkeletonExtraction;
  clips: readonly CharacterPreviewClip[];
}>;
export type CharacterPreviewPlayback = Readonly<{
  clipIndex: number | null;
  timeSeconds: number;
  durationSeconds: number;
  playing: boolean;
}>;

export type ThreeCharacterPreviewDraftClip = Readonly<{
  sourceIndex: number;
  firstFrame?: number;
  lastFrame?: number;
  looping: boolean;
  loopPose: boolean;
}>;

export type ThreeCharacterPreviewController = ModelPreviewExtension & Readonly<{
  setSkeletonVisible: (visible: boolean) => void;
  setSelectedBone: (boneId: BoneId | null) => void;
  setClip: (clipIndex: number | null) => void;
  setDraftClip: (draftClip: ThreeCharacterPreviewDraftClip | null) => void;
  setPlaying: (playing: boolean) => void;
  setTime: (timeSeconds: number) => void;
  resetPose: () => void;
}>;

type PreviewCallbacks = Readonly<{
  onAnalysis: (analysis: CharacterPreviewAnalysis | null) => void;
  onBoneSelected: (boneId: BoneId) => void;
  onPlayback: (state: CharacterPreviewPlayback) => void;
}>;

export type ThreeCharacterPreviewOptions = Readonly<{
  requiredClipIndex?: number;
  loopingByClipIndex?: Readonly<Record<number, boolean>>;
  draftClip?: ThreeCharacterPreviewDraftClip;
  skinNodePaths?: readonly string[];
  skinSourceNodeIndices?: readonly number[];
}>;

type RestTransform = Readonly<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;

/** Character tools layered onto ModelPreviewSession's renderer and demand-driven clock. */
export function createThreeCharacterPreviewController(
  identity: ThreeSkeletonAssetIdentity,
  callbacks: PreviewCallbacks,
  options: ThreeCharacterPreviewOptions = {},
): ThreeCharacterPreviewController {
  let context: ModelPreviewExtensionContext | null = null;
  let overlay: ThreeSkeletonPreviewOverlay | null = null;
  let previewSession: ThreeAnimationPreviewSession | null = null;
  let restPose = new Map<THREE.Object3D, RestTransform>();
  let restoreVisibility: (() => void) | null = null;
  let selectedBoneId: BoneId | null = null;
  let skeletonVisible = true;
  let clipIndex: number | null = null;
  let draftClip: ThreeCharacterPreviewDraftClip | null = options.draftClip ?? null;
  let preparedDraftClip: THREE.AnimationClip | null = null;
  let timeSeconds = 0;
  let playing = false;
  let lastPlaybackNotification = -Infinity;
  let disposed = false;

  const activeClip = () => preparedDraftClip
    ?? (clipIndex === null ? null : context?.animations[clipIndex])
    ?? null;
  const prepareDraftClip = () => {
    preparedDraftClip = null;
    if (!context || !draftClip || clipIndex !== draftClip.sourceIndex) return;
    const source = context.animations[draftClip.sourceIndex];
    if (!source) return;
    const firstFrame = draftClip.firstFrame;
    const lastFrame = draftClip.lastFrame;
    const range = typeof firstFrame === "number"
      && Number.isFinite(firstFrame)
      && typeof lastFrame === "number"
      && Number.isFinite(lastFrame)
      && lastFrame > firstFrame
      ? { firstFrame, lastFrame }
      : null;
    const rangedClip = (range ? trimAnimationClipToFrames(source, range) : null)?.clip ?? source;
    if (!draftClip.looping || !draftClip.loopPose) {
      preparedDraftClip = rangedClip;
      return;
    }
    preparedDraftClip = rangedClip === source ? source.clone() : rangedClip;
    applyAnimationClipLoopPose(preparedDraftClip);
  };
  const duration = () => {
    const clip = activeClip();
    return clip && Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0;
  };
  const notifyPlayback = (force = false) => {
    if (!force && Math.abs(timeSeconds - lastPlaybackNotification) < 0.08) return;
    lastPlaybackNotification = timeSeconds;
    callbacks.onPlayback({ clipIndex, timeSeconds, durationSeconds: duration(), playing });
  };
  const requestRender = () => context?.requestRender();
  const restorePose = () => {
    restPose.forEach((transform, object) => {
      object.position.copy(transform.position);
      object.quaternion.copy(transform.quaternion);
      object.scale.copy(transform.scale);
    });
    context?.root.updateMatrixWorld(true);
  };
  const clearPreviewSession = () => {
    previewSession?.dispose();
    previewSession = null;
  };
  const ensurePreviewSession = (): ThreeAnimationPreviewSession | null => {
    if (previewSession) return previewSession;
    const clip = activeClip();
    if (!context || !clip) return null;
    restorePose();
    previewSession = createThreeAnimationPreviewSession([{ root: context.root, clip }]).value;
    return previewSession;
  };
  const sample = () => {
    ensurePreviewSession()?.sample(timeSeconds);
    overlay?.update();
    requestRender();
  };
  const detach = () => {
    if (!context && !overlay && restPose.size === 0) return;
    playing = false;
    clearPreviewSession();
    restorePose();
    overlay?.dispose();
    overlay = null;
    restoreVisibility?.();
    restoreVisibility = null;
    restPose.clear();
    context = null;
    clipIndex = null;
    preparedDraftClip = null;
    timeSeconds = 0;
    callbacks.onAnalysis(null);
    notifyPlayback(true);
  };

  return {
    attach: (nextContext) => {
      if (disposed) return;
      if (context) detach();
      if (options.requiredClipIndex !== undefined
          && !nextContext.animations[options.requiredClipIndex]) {
        throw new Error(`Imported clip ${options.requiredClipIndex} is unavailable`);
      }
      context = nextContext;
      nextContext.root.traverse((object) => {
        if (!(object as THREE.Bone).isBone) return;
        restPose.set(object, {
          position: object.position.clone(),
          quaternion: object.quaternion.clone(),
          scale: object.scale.clone(),
        });
      });
      const extraction = extractThreeSkeletonDefinition(nextContext.root, identity, {
        skinNodePaths: options.skinNodePaths,
        skinSourceNodeIndices: options.skinSourceNodeIndices,
      });
      if (extraction.definition) {
        const binding = bindExtractedThreeSkeleton(nextContext.root, extraction.definition);
        overlay = createThreeSkeletonPreviewOverlay({
          canvas: nextContext.canvas,
          camera: nextContext.camera,
          scene: nextContext.scene,
          root: nextContext.root,
          definition: extraction.definition,
          binding,
          onSelect: (boneId) => {
            selectedBoneId = boneId;
            overlay?.setSelectedBone(boneId);
            callbacks.onBoneSelected(boneId);
            requestRender();
          },
        });
        overlay.setVisible(skeletonVisible);
        overlay.setSelectedBone(selectedBoneId);
      }
      callbacks.onAnalysis({
        extraction,
        clips: nextContext.animations.map((clip, index) => ({
          index,
          name: clip.name.trim() || `Clip ${index + 1}`,
        })),
      });
      clipIndex = options.requiredClipIndex ?? (nextContext.animations.length > 0 ? 0 : null);
      prepareDraftClip();
      timeSeconds = 0;
      notifyPlayback(true);
      requestRender();
      if (options.skinNodePaths !== undefined || options.skinSourceNodeIndices !== undefined) {
        const frameObjects: THREE.SkinnedMesh[] = [];
        nextContext.root.traverse((object) => {
          const mesh = object as THREE.SkinnedMesh;
          if (mesh.isSkinnedMesh && matchesThreeSkeletonExtractionTarget(nextContext.root, mesh, options)) {
            frameObjects.push(mesh);
          }
        });
        if (!overlay || frameObjects.length === 0) throw new Error(`Imported rig ${identity.id ?? identity.name ?? ""} is unavailable`);
        restoreVisibility = isolatePreviewMeshes(nextContext.root, frameObjects);
        return { frameObjects: [...frameObjects, ...overlay.frameObjects] };
      }
      return undefined;
    },
    detach,
    render: (frame: EngineFrame) => {
      if (!context) return false;
      if (playing) {
        const clipDuration = duration();
        if (clipDuration <= 0) playing = false;
        else {
          const nextTime = timeSeconds + Math.max(0, frame.deltaSeconds);
          const looping = draftClip && clipIndex === draftClip.sourceIndex
            ? draftClip.looping
            : clipIndex === null || options.loopingByClipIndex?.[clipIndex] !== false;
          if (!looping) {
            timeSeconds = Math.min(clipDuration, nextTime);
            if (timeSeconds >= clipDuration) playing = false;
          } else {
            timeSeconds = nextTime % clipDuration;
          }
          ensurePreviewSession()?.sample(timeSeconds);
          notifyPlayback();
        }
      }
      overlay?.update();
      return playing;
    },
    setSkeletonVisible: (visible) => {
      skeletonVisible = visible;
      overlay?.setVisible(visible);
      requestRender();
    },
    setSelectedBone: (boneId) => {
      selectedBoneId = boneId;
      overlay?.setSelectedBone(boneId);
      requestRender();
    },
    setClip: (nextClipIndex) => {
      clearPreviewSession();
      restorePose();
      const valid = nextClipIndex !== null && context?.animations[nextClipIndex] ? nextClipIndex : null;
      clipIndex = valid;
      prepareDraftClip();
      timeSeconds = 0;
      playing = false;
      if (clipIndex !== null) sample();
      notifyPlayback(true);
    },
    setDraftClip: (nextDraftClip) => {
      clearPreviewSession();
      restorePose();
      draftClip = nextDraftClip;
      if (draftClip && context?.animations[draftClip.sourceIndex]) clipIndex = draftClip.sourceIndex;
      prepareDraftClip();
      timeSeconds = 0;
      playing = false;
      if (clipIndex !== null) sample();
      notifyPlayback(true);
    },
    setPlaying: (nextPlaying) => {
      playing = nextPlaying && clipIndex !== null && duration() > 0;
      if (playing) ensurePreviewSession();
      notifyPlayback(true);
      requestRender();
    },
    setTime: (nextTimeSeconds) => {
      const clipDuration = duration();
      timeSeconds = Math.min(clipDuration, Math.max(0, Number.isFinite(nextTimeSeconds) ? nextTimeSeconds : 0));
      sample();
      notifyPlayback(true);
    },
    resetPose: () => {
      playing = false;
      clearPreviewSession();
      timeSeconds = 0;
      restorePose();
      overlay?.update();
      notifyPlayback(true);
      requestRender();
    },
    dispose: () => {
      if (disposed) return;
      detach();
      disposed = true;
    },
  };
}

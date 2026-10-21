import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import type { LibraryAsset } from "../../lib/api";
import { EditorIcon } from "../../ui/EditorIcon";
import { useModelPreviewSession } from "../../assets/preview/useModelPreviewSession";
import type { BoneId } from "../domain/skeleton";
import {
  createThreeCharacterPreviewController,
  type CharacterPreviewAnalysis,
  type CharacterPreviewPlayback,
  type ThreeCharacterPreviewOptions,
  type ThreeCharacterPreviewController,
} from "../adapters/three/three-character-preview-extension";
import "./CharacterPreviewCanvas.css";

export type CharacterPreviewCanvasHandle = Readonly<{
  resetView: () => void;
  setGridVisible: (visible: boolean) => void;
  setGridOpacity: (opacity: number) => void;
  setSkeletonVisible: (visible: boolean) => void;
  setSelectedBone: (boneId: BoneId | null) => void;
  setClip: (clipIndex: number | null) => void;
  setPlaying: (playing: boolean) => void;
  setTime: (timeSeconds: number) => void;
  resetPose: () => void;
}>;

export type CharacterPreviewTarget = ThreeCharacterPreviewOptions & Readonly<{
  localId: string;
}>;

type CharacterPreviewCanvasProps = Readonly<{
  asset: LibraryAsset;
  previewTarget?: CharacterPreviewTarget;
  onAnalysis?: (analysis: CharacterPreviewAnalysis | null) => void;
  onBoneSelected?: (boneId: BoneId) => void;
  onPlayback: (playback: CharacterPreviewPlayback) => void;
}>;

export const CharacterPreviewCanvas = memo(forwardRef<CharacterPreviewCanvasHandle, CharacterPreviewCanvasProps>(
  function CharacterPreviewCanvas({ asset, previewTarget, onAnalysis, onBoneSelected, onPlayback }, forwardedRef) {
    const callbacksRef = useRef({ onAnalysis, onBoneSelected, onPlayback });
    callbacksRef.current = { onAnalysis, onBoneSelected, onPlayback };
    const loopingByClipIndex = Object.fromEntries((asset.subAssets ?? []).flatMap((subAsset) => (
      subAsset.kind === "clip"
      && Number.isInteger(subAsset.runtimeClipIndex ?? subAsset.sourceIndex)
      && Number(subAsset.runtimeClipIndex ?? subAsset.sourceIndex) >= 0
        ? [[Number(subAsset.runtimeClipIndex ?? subAsset.sourceIndex), subAsset.looping !== false]]
        : []
    )));
    const controllerOptions = { ...previewTarget, loopingByClipIndex };
    const stableControllerOptions = {
      requiredClipIndex: controllerOptions.requiredClipIndex,
      loopingByClipIndex,
      skinNodePaths: controllerOptions.skinNodePaths,
      skinSourceNodeIndices: controllerOptions.skinSourceNodeIndices,
    };
    const { canvasRef, sessionRef, extensionRef: controllerRef, status } = useModelPreviewSession<ThreeCharacterPreviewController>({
      asset,
      extensionIdentity: JSON.stringify([asset.guid ?? asset.filename, asset.name, stableControllerOptions]),
      createExtension: (lifecycle) => createThreeCharacterPreviewController(
        {
          id: `${asset.guid ?? asset.filename}:${previewTarget?.localId ?? "main"}`,
          name: asset.name,
        },
        {
          onAnalysis: (analysis) => {
            if (lifecycle.isActive()) callbacksRef.current.onAnalysis?.(analysis);
          },
          onBoneSelected: (boneId) => {
            if (lifecycle.isActive()) callbacksRef.current.onBoneSelected?.(boneId);
          },
          onPlayback: (playback) => {
            if (lifecycle.isActive()) callbacksRef.current.onPlayback(playback);
          },
        },
        controllerOptions,
      ),
    });

    useEffect(() => {
      controllerRef.current?.setDraftClip(previewTarget?.draftClip ?? null);
    }, [controllerRef, previewTarget?.draftClip]);

    useImperativeHandle(forwardedRef, () => ({
      resetView: () => sessionRef.current?.resetView(),
      setGridVisible: (visible) => sessionRef.current?.setGridVisible(visible),
      setGridOpacity: (opacity) => sessionRef.current?.setGridOpacity(opacity),
      setSkeletonVisible: (visible) => controllerRef.current?.setSkeletonVisible(visible),
      setSelectedBone: (boneId) => controllerRef.current?.setSelectedBone(boneId),
      setClip: (clipIndex) => controllerRef.current?.setClip(clipIndex),
      setPlaying: (playing) => controllerRef.current?.setPlaying(playing),
      setTime: (timeSeconds) => controllerRef.current?.setTime(timeSeconds),
      resetPose: () => controllerRef.current?.resetPose(),
    }), []);

    return (
      <div className={`character-preview character-preview--${status}`} data-preview-status={status}>
        <canvas
          ref={canvasRef}
          className="character-preview__canvas"
          tabIndex={0}
          aria-label={`Character preview of ${asset.name}. Drag to orbit and click a bone handle to select it.`}
        />
        {status !== "ready" && (
          <div className="character-preview__status" role="status">
            <EditorIcon name={status === "failed" ? "warning" : "object"} size="preview" />
            <span>{status === "failed" ? "Character preview unavailable" : "Loading character…"}</span>
          </div>
        )}
      </div>
    );
  },
));

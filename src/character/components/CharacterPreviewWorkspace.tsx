import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { LibraryAsset } from "../../lib/api";
import type { BoneId } from "../domain/skeleton";
import type { CharacterPreviewAnalysis, CharacterPreviewPlayback } from "../adapters/three/three-character-preview-extension";
import {
  CharacterPreviewCanvas,
  type CharacterPreviewCanvasHandle,
  type CharacterPreviewTarget,
} from "./CharacterPreviewCanvas";
import { CharacterPreviewToolbar } from "./CharacterPreviewToolbar";
import "./CharacterPreviewWorkspace.css";

const EMPTY_PLAYBACK: CharacterPreviewPlayback = {
  clipIndex: null,
  timeSeconds: 0,
  durationSeconds: 0,
  playing: false,
};

type CharacterPreviewWorkspaceProps = Readonly<{
  asset: LibraryAsset;
  ariaLabel?: string;
  clips: CharacterPreviewAnalysis["clips"];
  clipIndex?: number | null;
  previewTarget?: CharacterPreviewTarget;
  showAnimationControls?: boolean;
  previewKind?: "clip" | "skeleton" | "avatar";
  hidden: boolean;
  resizable?: boolean;
  onAnalysis?: (analysis: CharacterPreviewAnalysis | null) => void;
  onBoneSelected?: (boneId: BoneId) => void;
}>;

/** Shared character canvas, playback transport, and display preferences. */
export const CharacterPreviewWorkspace = forwardRef<CharacterPreviewCanvasHandle, CharacterPreviewWorkspaceProps>(
  function CharacterPreviewWorkspace(props, forwardedRef) {
    const previewRef = useRef<CharacterPreviewCanvasHandle>(null);
    const [playback, setPlayback] = useState<CharacterPreviewPlayback>(EMPTY_PLAYBACK);
    const [skeletonVisible, setSkeletonVisible] = useState(true);
    const [gridVisible, setGridVisible] = useState(true);
    const [gridOpacity, setGridOpacity] = useState(0.25);

    useImperativeHandle(forwardedRef, () => ({
      resetView: () => previewRef.current?.resetView(),
      setGridVisible: (visible) => previewRef.current?.setGridVisible(visible),
      setGridOpacity: (opacity) => previewRef.current?.setGridOpacity(opacity),
      setSkeletonVisible: (visible) => previewRef.current?.setSkeletonVisible(visible),
      setSelectedBone: (boneId) => previewRef.current?.setSelectedBone(boneId),
      setClip: (clipIndex) => previewRef.current?.setClip(clipIndex),
      setPlaying: (playing) => previewRef.current?.setPlaying(playing),
      setTime: (timeSeconds) => previewRef.current?.setTime(timeSeconds),
      resetPose: () => previewRef.current?.resetPose(),
    }), []);

    useEffect(() => {
      if (!props.hidden) return;
      previewRef.current?.setPlaying(false);
      setPlayback((current) => current.playing ? { ...current, playing: false } : current);
    }, [props.hidden]);

    useEffect(() => {
      if (props.clipIndex === undefined || playback.clipIndex === props.clipIndex) return;
      previewRef.current?.setClip(props.clipIndex);
    }, [props.clipIndex, playback.clipIndex]);

    return (
      <section
        className={`character-preview-workspace${props.resizable ? " is-resizable" : ""}`}
        data-subasset-preview-kind={props.previewKind}
        aria-label={props.ariaLabel}
        hidden={props.hidden}
      >
        <CharacterPreviewCanvas
          ref={previewRef}
          asset={props.asset}
          previewTarget={props.previewTarget}
          onAnalysis={props.onAnalysis}
          onBoneSelected={props.onBoneSelected}
          onPlayback={setPlayback}
        />
        <CharacterPreviewToolbar
          clips={props.clips}
          playback={playback}
          skeletonVisible={skeletonVisible}
          gridVisible={gridVisible}
          gridOpacity={gridOpacity}
          showAnimationControls={props.showAnimationControls}
          onClipChange={(index) => previewRef.current?.setClip(index)}
          onPlayingChange={(playing) => previewRef.current?.setPlaying(playing)}
          onTimeChange={(time) => previewRef.current?.setTime(time)}
          onSkeletonVisibleChange={(visible) => {
            setSkeletonVisible(visible);
            previewRef.current?.setSkeletonVisible(visible);
          }}
          onGridVisibleChange={(visible) => {
            setGridVisible(visible);
            previewRef.current?.setGridVisible(visible);
          }}
          onGridOpacityChange={(opacity) => {
            setGridOpacity(opacity);
            previewRef.current?.setGridOpacity(opacity);
          }}
          onResetPose={() => previewRef.current?.resetPose()}
          onResetView={() => previewRef.current?.resetView()}
        />
      </section>
    );
  },
);

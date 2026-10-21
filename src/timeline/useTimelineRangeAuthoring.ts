import { useCallback, useMemo } from "react";
import { timeToFrame } from "./document";
import {
  resizeTimelinePatch,
  retimeTimelinePatch,
} from "./timeline-document-operations";
import { normalizeTimelineFrame } from "./track-authoring";
import type { PrimeTimelineFrameMode, PrimeTimelinePlayMode } from "./types";
import type { TimelineDocumentSession } from "./useTimelineDocumentSession";

/** Authored timeline range, rate, and play-mode commands. */
export function useTimelineRangeAuthoring(session: TimelineDocumentSession) {
  const setFrame = useCallback((frame: number) => {
    session.incrementResetToken();
    session.commitDocument(
      (current) => ({ currentFrame: normalizeTimelineFrame(frame, current) }),
      { scrubbing: true, persist: true },
    );
  }, [session.commitDocument, session.incrementResetToken]);
  const setTime = useCallback((time: number) => {
    const current = session.currentDocument();
    setFrame(timeToFrame(time, current.fps));
  }, [session.currentDocument, setFrame]);
  const setFps = useCallback((fps: number) => {
    session.incrementResetToken();
    session.commitDocument((current) => retimeTimelinePatch(current, fps), { persist: true });
  }, [session.commitDocument, session.incrementResetToken]);
  const setDuration = useCallback((duration: number) => {
    session.incrementResetToken();
    session.commitDocument((current) => resizeTimelinePatch(current, duration), { persist: true });
  }, [session.commitDocument, session.incrementResetToken]);
  const setRange = useCallback((minFrame: number, maxFrame: number) => {
    session.incrementResetToken();
    session.commitDocument(() => ({
      minFrame,
      maxFrame,
      previewStartFrame: minFrame,
      previewEndFrame: maxFrame,
      currentFrame: minFrame,
    }), { persist: true, scrubbing: true });
  }, [session.commitDocument, session.incrementResetToken]);
  const setPreviewRange = useCallback((startFrame: number, endFrame: number) => {
    session.incrementResetToken();
    session.commitDocument(() => ({
      previewStartFrame: Math.min(startFrame, endFrame),
      previewEndFrame: Math.max(startFrame, endFrame),
    }), { persist: true });
  }, [session.commitDocument, session.incrementResetToken]);
  const setPlayMode = useCallback((playMode: PrimeTimelinePlayMode) => {
    session.commitDocument(() => ({ playMode }), { persist: true });
  }, [session.commitDocument]);
  const setFrameMode = useCallback((frameMode: PrimeTimelineFrameMode) => {
    session.commitDocument(() => ({ frameMode }), { persist: true });
  }, [session.commitDocument]);
  const toggleLoop = useCallback(() => {
    const current = session.currentDocument();
    setPlayMode(current.playMode === "once" ? "loop" : "once");
  }, [session.currentDocument, setPlayMode]);

  return useMemo(() => ({
    setDuration,
    setFps,
    setFrame,
    setFrameMode,
    setPlayMode,
    setPreviewRange,
    setRange,
    setTime,
    toggleLoop,
  }), [
    setDuration, setFps, setFrame, setFrameMode, setPlayMode, setPreviewRange, setRange, setTime, toggleLoop,
  ]);
}

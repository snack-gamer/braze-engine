import { useSceneMutationScope } from "../../scene/hooks/useSceneMutationScope";
import { useCallback, useMemo, useRef, useState } from "react";
import type { PrimeTimelineController } from "../../timeline/usePrimeTimeline";
import { createAnimationDocument, setAnimationDuration } from "../animation-document";
import { clampTime, snapTime } from "../time";
import { animationDocumentAtTimeline } from "../timeline-document";
import type { AnimationDocument } from "../types";
import type { PlaybackFrameListener } from "./scene-animation-controller";

type AnimationDocumentSessionOptions = {
  timeline: PrimeTimelineController;
};

/** Coordinates authored animation state with the shared external playback clock. */
export function useAnimationDocumentSession({
  timeline,
}: AnimationDocumentSessionOptions) {
  const scope = useSceneMutationScope();
  const [trackDocument, updateDocument] = useState<AnimationDocument>(createAnimationDocument);
  const setDocument = useMemo(() => scope.bind(updateDocument), [scope]);
  const [recording, setRecording] = useState(false);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const document = useMemo(
    () => animationDocumentAtTimeline(trackDocument, timeline.document),
    [timeline.document, trackDocument],
  );
  const serializedDocument = useMemo(
    () => animationDocumentAtTimeline(document, timeline.serializedDocument),
    [document, timeline.serializedDocument],
  );

  const snappedPlayhead = useCallback((time: number) => snapTime(
    clampTime(time, timelineRef.current.duration),
    timelineRef.current.fps,
  ), []);
  const setPlayhead = useCallback((time: number) => {
    timelineRef.current.setTime(snappedPlayhead(time));
  }, [snappedPlayhead]);
  const subscribePlaybackFrame = useCallback((listener: PlaybackFrameListener) => (
    timelineRef.current.subscribeFrame((sample) => listener(sample.time))
  ), []);
  const currentPlaybackTime = useCallback(
    () => timelineRef.current.playback.getSnapshot().time,
    [],
  );
  const withTimelineDocument = useCallback((current: AnimationDocument): AnimationDocument => {
    const currentTimeline = timelineRef.current;
    return animationDocumentAtTimeline(
      current,
      currentTimeline.document,
      currentTimeline.playback.getSnapshot().time,
    );
  }, []);

  const setDuration = useCallback((duration: number) => {
    timelineRef.current.setDuration(duration);
    setDocument((current) => setAnimationDuration(current, duration));
  }, [setDocument]);
  const loadDocument = useCallback((nextDocument: AnimationDocument | undefined) => {
    updateDocument(nextDocument ?? createAnimationDocument());
    setRecording(false);
  }, []);
  const toggleLoop = useCallback(() => timelineRef.current.toggleLoop(), []);
  const pausePlayback = useCallback(() => timelineRef.current.pause(), []);
  const togglePlayback = useCallback(() => timelineRef.current.togglePlayback(), []);
  const toggleRecording = useCallback(() => setRecording((current) => !current), []);
  const stopRecording = useCallback(() => setRecording(false), []);
  const disable = useCallback(() => {
    timelineRef.current.pause();
    setRecording(false);
  }, []);

  return {
    document,
    serializedDocument,
    playback: timeline.playback,
    displayPlayhead: timeline.currentTime,
    playing: timeline.playing,
    recording,
    setDocument,
    setPlayhead,
    setDuration,
    toggleLoop,
    pausePlayback,
    togglePlayback,
    toggleRecording,
    stopRecording,
    disable,
    loadDocument,
    subscribePlaybackFrame,
    currentPlaybackTime,
    withTimelineDocument,
  };
}

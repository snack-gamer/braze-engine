import { useCallback, useMemo, useRef, useState } from "react";
import { normalizePrimeTimelineDocument } from "./document";
import {
  createTimelinePlaybackSample,
  TimelinePlaybackStore,
  type TimelinePlaybackIntent,
  type TimelinePlaybackSource,
} from "./playback-state";
import { sameTimelineDocument } from "./track-authoring";
import type {
  PrimeTimelineDocument,
  PrimeTimelineFrameListener,
} from "./types";

export type TimelineCommitIntent = TimelinePlaybackIntent & { persist: boolean };

const defaultIntent: TimelineCommitIntent = {
  playing: false,
  scrubbing: false,
  direction: 1,
  persist: true,
};

export type TimelineDocumentSession = ReturnType<typeof useTimelineDocumentSession>;

/** Owns authored documents, runtime refs, and the external playback store. */
export function useTimelineDocumentSession(initialDocument?: PrimeTimelineDocument) {
  const [document, setDocumentState] = useState(() => normalizePrimeTimelineDocument(initialDocument));
  const [serializedDocument, setSerializedDocument] = useState(() => normalizePrimeTimelineDocument(initialDocument));
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const documentRef = useRef(document);
  const playingRef = useRef(playing);
  const directionRef = useRef(direction);
  const listenersRef = useRef(new Set<PrimeTimelineFrameListener>());
  const lastEmittedRef = useRef(document);
  const resetTokenRef = useRef(0);
  const playbackStoreRef = useRef<TimelinePlaybackStore | null>(null);
  if (!playbackStoreRef.current) {
    playbackStoreRef.current = new TimelinePlaybackStore(
      createTimelinePlaybackSample(document, document.currentFrame, 0, defaultIntent),
    );
  }
  const playback: TimelinePlaybackSource = playbackStoreRef.current;

  const emitSample = useCallback((next: PrimeTimelineDocument, intent: TimelinePlaybackIntent) => {
    const sample = createTimelinePlaybackSample(
      next,
      lastEmittedRef.current.currentFrame,
      resetTokenRef.current,
      intent,
    );
    lastEmittedRef.current = next;
    playbackStoreRef.current?.publish(sample);
    for (const listener of listenersRef.current) listener(sample);
  }, []);
  const setPlaybackActive = useCallback((active: boolean) => {
    playingRef.current = active;
    setPlaying(active);
  }, []);
  const setPlaybackDirection = useCallback((next: 1 | -1) => {
    directionRef.current = next;
    setDirection(next);
  }, []);
  const incrementResetToken = useCallback(() => {
    resetTokenRef.current += 1;
  }, []);
  const commitDocument = useCallback((
    update: (current: PrimeTimelineDocument) => Partial<PrimeTimelineDocument>,
    intent: Partial<TimelineCommitIntent>,
  ) => {
    const resolvedIntent: TimelineCommitIntent = {
      playing: playingRef.current,
      scrubbing: false,
      direction: directionRef.current,
      persist: false,
      ...intent,
    };
    const current = documentRef.current;
    const patch = update(current);
    const next = normalizePrimeTimelineDocument({ ...current, ...patch });
    const affectsTrackFrames = "tracks" in patch || "fps" in patch || "minFrame" in patch || "maxFrame" in patch;
    if (!affectsTrackFrames) next.tracks = current.tracks;
    if (sameTimelineDocument(current, next)) return current;
    documentRef.current = next;
    setDocumentState(next);
    if (resolvedIntent.persist) setSerializedDocument(next);
    emitSample(next, resolvedIntent);
    return next;
  }, [emitSample]);
  const settlePlaybackDocument = useCallback((next: PrimeTimelineDocument) => {
    documentRef.current = next;
    setDocumentState(next);
    setSerializedDocument(next);
  }, []);
  const setRuntimeDocument = useCallback((next: PrimeTimelineDocument) => {
    documentRef.current = next;
  }, []);
  const loadDocument = useCallback((source: PrimeTimelineDocument | undefined) => {
    const next = normalizePrimeTimelineDocument(source);
    resetTokenRef.current += 1;
    setPlaybackActive(false);
    documentRef.current = next;
    lastEmittedRef.current = next;
    setSerializedDocument(next);
    setDocumentState(next);
    emitSample(next, { ...defaultIntent, scrubbing: true });
  }, [emitSample, setPlaybackActive]);
  const subscribeFrame = useCallback((listener: PrimeTimelineFrameListener) => {
    listenersRef.current.add(listener);
    const sample = playbackStoreRef.current?.getSnapshot();
    if (sample) listener(sample);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);
  const currentDocument = useCallback(() => documentRef.current, []);
  const currentDirection = useCallback(() => directionRef.current, []);
  const isPlaying = useCallback(() => playingRef.current, []);

  return useMemo(() => ({
    document,
    serializedDocument,
    playback,
    playing,
    direction,
    commitDocument,
    currentDirection,
    currentDocument,
    emitSample,
    incrementResetToken,
    isPlaying,
    loadDocument,
    setPlaybackActive,
    setPlaybackDirection,
    setRuntimeDocument,
    settlePlaybackDocument,
    subscribeFrame,
  }), [
    commitDocument, currentDirection, currentDocument, direction, document, emitSample, incrementResetToken,
    isPlaying, loadDocument, playback, playing, serializedDocument, setPlaybackActive, setPlaybackDirection,
    setRuntimeDocument, settlePlaybackDocument, subscribeFrame,
  ]);
}

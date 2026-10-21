import { useCallback, useEffect, useMemo } from "react";
import { sharedBrowserEngineLoop } from "../runtime/browser-engine-loop";
import { TimelinePlaybackSession } from "./playback-session";
import { normalizeTimelineFrame } from "./track-authoring";
import type { TimelineDocumentSession } from "./useTimelineDocumentSession";

/** Transport commands and the engine-loop-owned runtime playback session. */
export function useTimelineTransport(
  session: TimelineDocumentSession,
  setFrame: (frame: number) => void,
) {
  const pause = useCallback(() => {
    const wasPlaying = session.isPlaying();
    const finalDocument = session.currentDocument();
    session.setPlaybackActive(false);
    session.settlePlaybackDocument(finalDocument);
    if (wasPlaying) {
      session.emitSample(finalDocument, {
        playing: false,
        scrubbing: false,
        direction: session.currentDirection(),
      });
    }
  }, [
    session.currentDirection, session.currentDocument, session.emitSample, session.isPlaying,
    session.setPlaybackActive, session.settlePlaybackDocument,
  ]);
  const startPlayback = useCallback((direction: 1 | -1) => {
    session.setPlaybackDirection(direction);
    session.setPlaybackActive(true);
    session.emitSample(session.currentDocument(), { playing: true, scrubbing: false, direction });
  }, [
    session.currentDocument, session.emitSample, session.setPlaybackActive, session.setPlaybackDirection,
  ]);
  const playForward = useCallback(() => {
    const current = session.currentDocument();
    if (current.currentFrame >= current.previewEndFrame) setFrame(current.previewStartFrame);
    startPlayback(1);
  }, [session.currentDocument, setFrame, startPlayback]);
  const playBackward = useCallback(() => {
    const current = session.currentDocument();
    if (current.currentFrame <= current.previewStartFrame) setFrame(current.previewEndFrame);
    startPlayback(-1);
  }, [session.currentDocument, setFrame, startPlayback]);
  const togglePlayback = useCallback(() => {
    if (session.isPlaying()) pause();
    else playForward();
  }, [pause, playForward, session.isPlaying]);
  const stepFrame = useCallback((delta: number) => {
    const current = session.currentDocument();
    setFrame(normalizeTimelineFrame(current.currentFrame + delta, current));
  }, [session.currentDocument, setFrame]);
  const jumpToStart = useCallback(() => {
    setFrame(session.currentDocument().previewStartFrame);
  }, [session.currentDocument, setFrame]);
  const jumpToEnd = useCallback(() => {
    setFrame(session.currentDocument().previewEndFrame);
  }, [session.currentDocument, setFrame]);

  useEffect(() => {
    if (!session.playing) return undefined;
    const playback = new TimelinePlaybackSession(
      session.currentDocument(),
      session.currentDirection(),
      {
        emitFrame: (step) => {
          session.setRuntimeDocument(step.document);
          if (step.direction !== session.currentDirection()) session.setPlaybackDirection(step.direction);
          session.emitSample(step.document, {
            playing: !step.stopped,
            scrubbing: false,
            direction: step.direction,
          });
        },
        commitFinalFrame: (finalDocument) => {
          session.setPlaybackActive(false);
          session.settlePlaybackDocument(finalDocument);
        },
      },
    );
    const participant = sharedBrowserEngineLoop().createParticipant({
      timeline: ({ deltaSeconds }) => {
        const continuing = playback.advance(
          session.currentDocument(),
          session.currentDirection(),
          deltaSeconds,
        );
        if (continuing) participant.requestFrame();
      },
    });
    participant.requestFrame();
    return participant.dispose;
  }, [
    session.currentDirection, session.currentDocument, session.emitSample, session.playing,
    session.setPlaybackActive, session.setPlaybackDirection, session.setRuntimeDocument,
    session.settlePlaybackDocument,
  ]);

  return useMemo(() => ({
    jumpToEnd,
    jumpToStart,
    pause,
    playBackward,
    playForward,
    stepFrame,
    togglePlayback,
  }), [jumpToEnd, jumpToStart, pause, playBackward, playForward, stepFrame, togglePlayback]);
}

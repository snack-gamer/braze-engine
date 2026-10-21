import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sharedBrowserEngineLoop } from "../../runtime/browser-engine-loop";
import {
  advanceImportedClipPlayback,
  startImportedClipPlayback,
} from "../application/imported-clip-playback";
import { clampTime, snapTime } from "../time";

type ImportedClipPlayheadOptions = Readonly<{
  durationSeconds: number;
  frameRate: number;
  keyTimesSeconds: readonly number[];
  initialLooping: boolean;
  active: boolean;
}>;

export function useImportedClipPlayhead({
  durationSeconds,
  frameRate,
  keyTimesSeconds,
  initialLooping,
  active,
}: ImportedClipPlayheadOptions) {
  const duration = Math.max(0.001, durationSeconds);
  const fps = Math.max(1, Math.round(frameRate));
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(initialLooping);
  const timeRef = useRef(0);
  const keyTimes = useMemo(
    () => orderedTimelineTimes(keyTimesSeconds, duration),
    [duration, keyTimesSeconds],
  );
  const setTime = useCallback((time: number) => {
    const next = clampTime(snapTime(time, fps), duration);
    timeRef.current = next;
    setTimeSeconds(next);
  }, [duration, fps]);

  useEffect(() => {
    const next = clampTime(snapTime(timeRef.current, fps), duration);
    timeRef.current = next;
    setTimeSeconds(next);
  }, [duration, fps]);

  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    if (!active || !playing) return;
    const participant = sharedBrowserEngineLoop().createParticipant({
      timeline: ({ deltaSeconds }) => {
        const next = advanceImportedClipPlayback(
          timeRef.current,
          Math.min(0.1, deltaSeconds),
          duration,
          looping,
        );
        timeRef.current = next.timeSeconds;
        setTimeSeconds(next.timeSeconds);
        if (!next.playing) {
          setPlaying(false);
          return;
        }
        participant.requestFrame();
      },
    });
    participant.requestFrame();
    return participant.dispose;
  }, [active, duration, looping, playing]);

  const moveToPreviousKey = useCallback(() => {
    const previous = [...keyTimes].reverse().find((time) => time < timeSeconds - (0.5 / fps));
    setTime(previous ?? 0);
  }, [fps, keyTimes, setTime, timeSeconds]);
  const moveToNextKey = useCallback(() => {
    const next = keyTimes.find((time) => time > timeSeconds + (0.5 / fps));
    setTime(next ?? duration);
  }, [duration, fps, keyTimes, setTime, timeSeconds]);
  const togglePlayback = useCallback(() => {
    if (!active) return;
    setPlaying((current) => {
      if (current) return false;
      const next = startImportedClipPlayback(active);
      timeRef.current = next.timeSeconds;
      setTimeSeconds(next.timeSeconds);
      return next.playing;
    });
  }, [active]);

  return {
    timeSeconds,
    playing,
    looping,
    setTime,
    pause: () => setPlaying(false),
    togglePlayback,
    toggleLooping: () => setLooping((current) => !current),
    moveToStart: () => setTime(0),
    moveToEnd: () => setTime(duration),
    moveToPreviousKey,
    moveToNextKey,
  };
}

export function orderedTimelineTimes(
  times: readonly number[],
  durationSeconds: number,
): readonly number[] {
  return [...new Set(times
    .filter((time) => Number.isFinite(time))
    .map((time) => clampTime(time, durationSeconds)))]
    .sort((left, right) => left - right);
}

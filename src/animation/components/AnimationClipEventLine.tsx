import { useEffect, useRef, useState } from "react";
import type { ModelAnimationEventSettings } from "../../lib/model-import-settings";
import { useWindowPointerSession, type CapturedPointerSession } from "../hooks/useWindowPointerSession";
import { clampTime, snapTime } from "../time";
import { formatClipTime } from "./AnimationClipTimelineTransport";

type AnimationClipEventLineProps = Readonly<{
  durationSeconds: number;
  frameRate: number;
  playheadSeconds: number;
  events: readonly ModelAnimationEventSettings[];
  selectedEventId: string | null;
  onPause: () => void;
  onSetPlayhead: (timeSeconds: number) => void;
  onSelectEvent: (eventId: string) => void;
  onAddEvent: (timeSeconds: number) => void;
  onMoveEvent: (eventId: string, timeSeconds: number) => void;
  onDeleteEvent: (eventId: string) => void;
}>;

type EventMenu = Readonly<{
  x: number;
  y: number;
  timeSeconds: number;
  eventId?: string;
}>;

type EventDragSession = CapturedPointerSession & Readonly<{
  eventId: string;
  originalTimeSeconds: number;
}>;

export function AnimationClipEventLine({
  durationSeconds,
  frameRate,
  playheadSeconds,
  events,
  selectedEventId,
  onPause,
  onSetPlayhead,
  onSelectEvent,
  onAddEvent,
  onMoveEvent,
  onDeleteEvent,
}: AnimationClipEventLineProps) {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<EventMenu | null>(null);
  const timeAt = (clientX: number) => {
    const bounds = lineRef.current?.getBoundingClientRect();
    if (!bounds?.width) return 0;
    const raw = ((clientX - bounds.left) / bounds.width) * durationSeconds;
    return clampTime(snapTime(raw, frameRate), durationSeconds);
  };
  const eventDrag = useWindowPointerSession<EventDragSession>(
    (_session, event) => onSetPlayhead(timeAt(event.clientX)),
    (session, event) => {
      const nextTime = timeAt(event.clientX);
      onSetPlayhead(nextTime);
      onMoveEvent(session.eventId, nextTime);
    },
    (session) => onSetPlayhead(session.originalTimeSeconds),
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);

  return <>
    <div className="animation-clip-event-row">
      <div className="animation-clip-event-row__label"><strong>Events</strong><span>Right-click the line to add</span></div>
      <div
        ref={lineRef}
        className="animation-clip-event-line"
        aria-label="Animation Event line"
        tabIndex={0}
        onContextMenu={(event) => {
          event.preventDefault();
          const timeSeconds = timeAt(event.clientX);
          onPause();
          onSetPlayhead(timeSeconds);
          setMenu({ x: event.clientX, y: event.clientY, timeSeconds });
        }}
        onKeyDown={(event) => {
          if ((event.key === "Delete" || event.key === "Backspace") && selectedEventId) {
            event.preventDefault();
            onDeleteEvent(selectedEventId);
          }
        }}
      >
        {Array.from({ length: 11 }, (_, index) => <i
          className="animation-clip-timeline__grid-line"
          key={index}
          style={{ left: `${index * 10}%` }}
        />)}
        <i
          className="animation-clip-timeline__playhead-line"
          style={{ left: `${(playheadSeconds / durationSeconds) * 100}%` }}
        />
        {events.map((animationEvent) => <button
          type="button"
          key={animationEvent.id}
          className="animation-clip-event-marker"
          data-selected={animationEvent.id === selectedEventId || undefined}
          style={{ left: `${(animationEvent.timeSeconds / durationSeconds) * 100}%` }}
          title={`${animationEvent.name} · ${formatClipTime(animationEvent.timeSeconds, frameRate)}`}
          aria-label={`${animationEvent.name} at ${formatClipTime(animationEvent.timeSeconds, frameRate)}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelectEvent(animationEvent.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectEvent(animationEvent.id);
            setMenu({ x: event.clientX, y: event.clientY, timeSeconds: animationEvent.timeSeconds, eventId: animationEvent.id });
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onPause();
            onSelectEvent(animationEvent.id);
            eventDrag.start({
              pointerId: event.pointerId,
              captureElement: event.currentTarget,
              eventId: animationEvent.id,
              originalTimeSeconds: animationEvent.timeSeconds,
            });
          }}
        ><span className="animation-clip-event-marker__flag" /></button>)}
      </div>
    </div>
    {menu && <div
      className="animation-clip-event-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!menu.eventId && <button type="button" role="menuitem" onClick={() => {
        onAddEvent(menu.timeSeconds);
        setMenu(null);
      }}>Add Animation Event</button>}
      {menu.eventId && <button type="button" role="menuitem" onClick={() => {
        onDeleteEvent(menu.eventId!);
        setMenu(null);
      }}>Delete Animation Event</button>}
    </div>}
  </>;
}

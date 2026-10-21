import { useCallback, useEffect, useRef } from "react";

export type CapturedPointerSession = {
  pointerId: number;
  captureElement: HTMLElement;
};

/** Owns capture and window listeners for a drag that may leave its source element. */
export function useWindowPointerSession<TSession extends CapturedPointerSession>(
  onMove: (session: TSession, event: PointerEvent) => void,
  onFinish: (session: TSession, event: PointerEvent) => void,
  onCancel?: (session: TSession) => void,
) {
  const sessionRef = useRef<TSession | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  const onFinishRef = useRef(onFinish);
  const onCancelRef = useRef(onCancel);
  onMoveRef.current = onMove;
  onFinishRef.current = onFinish;
  onCancelRef.current = onCancel;

  const clear = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    clear();
    if (session?.captureElement.hasPointerCapture(session.pointerId)) {
      session.captureElement.releasePointerCapture(session.pointerId);
    }
    if (session) onCancelRef.current?.(session);
  }, [clear]);

  const start = useCallback((session: TSession) => {
    cancel();
    sessionRef.current = session;
    session.captureElement.setPointerCapture(session.pointerId);
    const onPointerMove = (event: PointerEvent) => {
      const current = sessionRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      onMoveRef.current(current, event);
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    const onPointerStop = (event: PointerEvent) => {
      const current = sessionRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      sessionRef.current = null;
      clear();
      if (current.captureElement.hasPointerCapture(event.pointerId)) {
        current.captureElement.releasePointerCapture(event.pointerId);
      }
      onFinishRef.current(current, event);
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerStop, { passive: false });
    window.addEventListener("pointercancel", onPointerStop, { passive: false });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerStop);
      window.removeEventListener("pointercancel", onPointerStop);
    };
  }, [cancel, clear]);

  useEffect(() => cancel, [cancel]);
  return { sessionRef, start, cancel };
}

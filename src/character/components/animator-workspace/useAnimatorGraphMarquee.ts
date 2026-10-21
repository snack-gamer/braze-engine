import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type AnimatorGraphMarqueeBox = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  additive: boolean;
}>;

type MarqueeGesture = Readonly<{
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
}>;

const MARQUEE_THRESHOLD = 3;

/** Owns left-button marquee interaction independently from viewport navigation. */
export function useAnimatorGraphMarquee(
  onComplete: (box: AnimatorGraphMarqueeBox) => void,
) {
  const gestureRef = useRef<MarqueeGesture | null>(null);
  const suppressClickRef = useRef(false);
  const [box, setBox] = useState<AnimatorGraphMarqueeBox | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isGraphInteraction(event.target)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX - bounds.left;
    const startY = event.clientY - bounds.top;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = false;
    gestureRef.current = { pointerId: event.pointerId, startX, startY, additive: event.shiftKey };
    setBox({ left: startX, top: startY, width: 0, height: 0, additive: event.shiftKey });
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setBox(marqueeBox(gesture, event));
  }, []);

  const finish = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const completed = marqueeBox(gesture, event);
    const moved = completed.width >= MARQUEE_THRESHOLD || completed.height >= MARQUEE_THRESHOLD;
    gestureRef.current = null;
    suppressClickRef.current = moved;
    setBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (moved) onComplete(completed);
  }, [onComplete]);

  const consumeClick = useCallback(() => {
    const suppress = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppress;
  }, []);

  return { box, onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, consumeClick };
}

function marqueeBox(
  gesture: MarqueeGesture,
  event: ReactPointerEvent<HTMLDivElement>,
): AnimatorGraphMarqueeBox {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  return {
    left: Math.min(gesture.startX, x),
    top: Math.min(gesture.startY, y),
    width: Math.abs(x - gesture.startX),
    height: Math.abs(y - gesture.startY),
    additive: gesture.additive,
  };
}

function isGraphInteraction(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest(
    ".animator-graph-node, .animator-graph-edge[data-kind='transition'], .animator-graph-viewport-controls, .animator-connection-mode",
  ));
}

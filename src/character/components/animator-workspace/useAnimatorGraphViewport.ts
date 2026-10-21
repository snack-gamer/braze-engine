import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  ANIMATOR_GRAPH_VIEWPORT_DEFAULT,
  fitAnimatorGraphViewport,
  zoomAnimatorGraphViewport,
  type AnimatorGraphBounds,
  type AnimatorGraphPoint,
  type AnimatorGraphViewport,
} from "./animator-graph-viewport";

type PanGesture = {
  pointerId: number;
  clientX: number;
  clientY: number;
  origin: AnimatorGraphPoint;
  moved: boolean;
};

const PAN_THRESHOLD = 3;
const ZOOM_STEP = 1.15;
const FRAME_PADDING = 48;

export function useAnimatorGraphViewport() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<PanGesture | null>(null);
  const suppressClickRef = useRef(false);
  const [view, setView] = useState<AnimatorGraphViewport>(ANIMATOR_GRAPH_VIEWPORT_DEFAULT);
  const [panning, setPanning] = useState(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      origin: { x: view.x, y: view.y },
      moved: false,
    };
    setPanning(true);
  }, [view.x, view.y]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = { x: event.clientX - gesture.clientX, y: event.clientY - gesture.clientY };
    if (Math.hypot(delta.x, delta.y) >= PAN_THRESHOLD) gesture.moved = true;
    setView((current) => ({ ...current, x: gesture.origin.x + delta.x, y: gesture.origin.y + delta.y }));
  }, []);

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    suppressClickRef.current = gesture.moved;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPanning(false);
  }, []);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const factor = Math.exp(-event.deltaY * 0.0015);
    setView((current) => zoomAnimatorGraphViewport(current, current.scale * factor, anchor));
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const element = viewportRef.current;
    if (!element) return;
    const anchor = { x: element.clientWidth / 2, y: element.clientHeight / 2 };
    setView((current) => zoomAnimatorGraphViewport(current, current.scale * factor, anchor));
  }, []);

  const frame = useCallback((bounds: AnimatorGraphBounds) => {
    const element = viewportRef.current;
    if (!element) return;
    setView(fitAnimatorGraphViewport(bounds, {
      width: element.clientWidth,
      height: element.clientHeight,
    }, FRAME_PADDING));
  }, []);

  const reset = useCallback(() => setView(ANIMATOR_GRAPH_VIEWPORT_DEFAULT), []);
  const consumePanClick = useCallback(() => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  }, []);

  return {
    viewportRef,
    view,
    panning,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPan,
    onPointerCancel: endPan,
    onWheel,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    frame,
    reset,
    consumePanClick,
  };
}

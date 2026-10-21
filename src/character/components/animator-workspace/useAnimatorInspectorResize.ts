import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const DEFAULT_WIDTH = 330;
const MIN_WIDTH = 260;
const MAX_WIDTH = 640;
const MIN_GRAPH_WIDTH = 320;
const SPLITTER_WIDTH = 5;

/** Owns the local, non-authored width of the Behavior Map Inspector. */
export function useAnimatorInspectorResize() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<() => void>(() => undefined);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);

  const availableMaximum = () => {
    const body = bodyRef.current;
    if (!body) return MAX_WIDTH;
    const railWidth = body.querySelector<HTMLElement>(".animator-workspace__rail")
      ?.getBoundingClientRect().width ?? 0;
    return Math.max(MIN_WIDTH, Math.min(
      MAX_WIDTH,
      body.getBoundingClientRect().width - railWidth - MIN_GRAPH_WIDTH - SPLITTER_WIDTH,
    ));
  };
  const bounded = (next: number) => Math.min(availableMaximum(), Math.max(MIN_WIDTH, next));

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const inspectorWidth = bodyRef.current
      ?.querySelector<HTMLElement>(".animator-workspace__inspector")
      ?.getBoundingClientRect().width ?? width;
    event.preventDefault();
    cleanupRef.current();
    const pointerId = event.pointerId;
    const startClientX = event.clientX;
    setResizing(true);
    const update = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      setWidth(bounded(inspectorWidth - (pointerEvent.clientX - startClientX)));
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanupRef.current();
      setResizing(false);
    };
    const cancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanupRef.current();
      setResizing(false);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cleanupRef.current = () => undefined;
    };
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    cleanupRef.current = cleanup;
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.shiftKey ? 40 : 10;
    setWidth((current) => bounded(current + (event.key === "ArrowLeft" ? delta : -delta)));
  };

  useEffect(() => () => cleanupRef.current(), []);

  return {
    bodyRef,
    width,
    resizing,
    minimum: MIN_WIDTH,
    maximum: availableMaximum(),
    beginResize,
    resizeWithKeyboard,
  };
}

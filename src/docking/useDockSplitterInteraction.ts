import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  dockRatioFromArrowKey,
  dockRatioFromClientPoint,
} from "./dock-geometry";
import type { DockPath, DockSplitterFrame } from "./layout";

type DockSplitterInteractionInput = {
  frame: DockSplitterFrame;
  setSplitRatio: (path: DockPath, ratio: number) => void;
};

/** Owns pointer capture-by-window, body styles, Escape rollback, and cleanup. */
export function useDockSplitterInteraction({
  frame,
  setSplitRatio,
}: DockSplitterInteractionInput) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);
  const [resizing, setResizing] = useState(false);
  const horizontal = frame.split.axis === "horizontal";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRef.current?.();
    };
  }, []);

  const setRatioFromPoint = (clientX: number, clientY: number) => {
    const workspace = window.document.querySelector<HTMLElement>(".editor-dock-workspace");
    if (!workspace) return;
    setSplitRatio(
      frame.path,
      dockRatioFromClientPoint(frame, workspace.getBoundingClientRect(), clientX, clientY),
    );
  };

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();
    const originalRatio = frame.split.ratio;
    const body = window.document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = horizontal ? "col-resize" : "row-resize";
    body.style.userSelect = "none";
    setResizing(true);

    const onMove = (moveEvent: PointerEvent) => setRatioFromPoint(moveEvent.clientX, moveEvent.clientY);
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      window.removeEventListener("keydown", onKeyDown);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      if (mountedRef.current) setResizing(false);
      cleanupRef.current = null;
    };
    const finish = () => cleanup();
    const onKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      setSplitRatio(frame.path, originalRatio);
      cleanup();
    };
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    window.addEventListener("keydown", onKeyDown);
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const ratio = dockRatioFromArrowKey(frame, event.key, event.shiftKey);
    if (ratio === null) return;
    event.preventDefault();
    setSplitRatio(frame.path, ratio);
  };

  return { beginResize, resizeWithKeyboard, resizing };
}

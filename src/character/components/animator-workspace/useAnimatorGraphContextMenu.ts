import { useCallback, useEffect, useRef, useState } from "react";
import type { AnimatorGraphPoint } from "./animator-graph-viewport";

export type AnimatorGraphContextMenuLocation = Readonly<{
  screen: AnimatorGraphPoint;
  world: AnimatorGraphPoint;
}>;

/** Owns the disposable location and dismissal lifecycle for one graph context menu. */
export function useAnimatorGraphContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [location, setLocation] = useState<AnimatorGraphContextMenuLocation | null>(null);
  const close = useCallback(() => {
    setLocation(null);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    queueMicrotask(() => target?.isConnected && target.focus({ preventScroll: true }));
  }, []);
  const dismiss = useCallback(() => {
    setLocation(null);
    returnFocusRef.current = null;
  }, []);
  const openAt = useCallback((
    screen: AnimatorGraphPoint,
    world: AnimatorGraphPoint,
    returnFocus?: HTMLElement,
  ) => {
    returnFocusRef.current = returnFocus ?? null;
    setLocation({
      screen: { x: screen.x, y: screen.y },
      world: { x: world.x, y: world.y },
    });
  }, []);

  useEffect(() => {
    if (!location) return undefined;
    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) dismiss();
    };
    const dismissOnKeyboardExit = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        setTimeout(dismiss, 0);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnKeyboardExit);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnKeyboardExit);
    };
  }, [close, dismiss, location]);

  return { location, menuRef, openAt, close };
}

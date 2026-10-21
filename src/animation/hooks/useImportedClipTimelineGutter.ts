import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Keeps fixed timeline lanes aligned with the scrollable key-row viewport. */
export function useImportedClipTimelineGutter() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const keyRowsRef = useRef<HTMLDivElement | null>(null);
  const synchronize = useCallback(() => {
    const shell = shellRef.current;
    const keyRows = keyRowsRef.current;
    if (!shell || !keyRows) return;
    const scrollbarWidth = Math.max(0, keyRows.offsetWidth - keyRows.clientWidth);
    shell.style.setProperty("--animation-clip-scrollbar-width", `${scrollbarWidth}px`);
  }, []);

  useLayoutEffect(synchronize);
  useEffect(() => {
    const keyRows = keyRowsRef.current;
    if (!keyRows) return;
    const observer = new ResizeObserver(synchronize);
    observer.observe(keyRows);
    return () => observer.disconnect();
  }, [synchronize]);

  return { shellRef, keyRowsRef };
}

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type OverflowState = {
  backward: boolean;
  forward: boolean;
};

const NO_OVERFLOW: OverflowState = { backward: false, forward: false };

/** Measures and navigates one tab strip without leaking scroll state into the dock document. */
export function useDockTabOverflow(itemKey: string) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(NO_OVERFLOW);

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const next = {
      backward: strip.scrollLeft > 1,
      forward: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
    };
    setOverflow((current) => (
      current.backward === next.backward && current.forward === next.forward ? current : next
    ));
  }, []);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    for (const child of strip.children) observer.observe(child);
    strip.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", measure);
    };
  }, [itemKey, measure]);

  const scroll = useCallback((direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(96, strip.clientWidth * 0.65), behavior: "smooth" });
  }, []);

  return { stripRef, overflow, scroll, measure };
}

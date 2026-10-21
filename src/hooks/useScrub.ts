import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useHistoryInteraction } from "../history/useHistoryInteraction";

type ScrubOptions = {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  disabled?: boolean;
  onScrubStart?: () => void;
};

type ScrubHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void;
};

// Shared horizontal-drag-to-scrub behavior for numeric inputs. Used by
// InspectorNumberInput (drag on the input wrapper) and VectorField (drag on
// the X/Y/Z axis letter) — both call this hook so scrubbing feels identical
// regardless of which handle the user grabs.
//
// Modifiers: Shift = 10×, Alt/Ctrl/Meta = 0.1×.
// A 3 px dead-zone keeps simple clicks from registering as scrubs.
export function useScrub({
  value,
  onChange,
  step,
  min,
  max,
  decimals = 2,
  disabled = false,
  onScrubStart,
}: ScrubOptions): { isScrubbing: boolean; scrubProps: ScrubHandlers } {
  const [isScrubbing, setScrubbing] = useState(false);
  const historyInteraction = useHistoryInteraction();
  const scrubRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startValue: number;
  } | null>(null);

  const baseStep =
    typeof step === "number" && Number.isFinite(step) && step > 0
      ? step
      : decimals === 0
        ? 1
        : 1 / 10 ** decimals;

  useEffect(() => {
    document.body.classList.toggle("inspector-scrubbing", isScrubbing);
    return () => document.body.classList.remove("inspector-scrubbing");
  }, [isScrubbing]);

  const clamp = (n: number) => {
    let x = n;
    if (typeof min === "number") x = Math.max(min, x);
    if (typeof max === "number") x = Math.min(max, x);
    return x;
  };

  const multiplier = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.shiftKey) return 10;
    if (e.altKey || e.ctrlKey || e.metaKey) return 0.1;
    return 1;
  };

  return {
    isScrubbing,
    scrubProps: {
      onPointerDown(e) {
        if (disabled || e.button !== 0) return;
        scrubRef.current = {
          active: false,
          pointerId: e.pointerId,
          startX: e.clientX,
          startValue: clamp(value),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e) {
        const s = scrubRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        const dx = e.clientX - s.startX;
        if (!s.active && Math.abs(dx) < 3) return;
        if (!s.active) {
          s.active = true;
          setScrubbing(true);
          historyInteraction.begin();
          onScrubStart?.();
        }
        onChange(clamp(s.startValue + (dx / 4) * baseStep * multiplier(e)));
        e.preventDefault();
      },
      onPointerUp(e) {
        const s = scrubRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (s.active) e.preventDefault();
        scrubRef.current = null;
        setScrubbing(false);
        historyInteraction.end();
      },
      onPointerCancel(e) {
        const s = scrubRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        scrubRef.current = null;
        setScrubbing(false);
        historyInteraction.end();
      },
      onLostPointerCapture(e) {
        const s = scrubRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        scrubRef.current = null;
        setScrubbing(false);
        historyInteraction.end();
      },
    },
  };
}

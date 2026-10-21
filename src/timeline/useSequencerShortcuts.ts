import { useEffect, useRef } from "react";
import type { PrimeTimelineController } from "./usePrimeTimeline";

/** Active-pane transport shortcuts without resubscribing on controller updates. */
export function useSequencerShortcuts(controller: PrimeTimelineController, active: boolean): void {
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (target?.closest(".shortcuts-modal, .confirm-modal, .drawer, .grid-popover, .asset-menu")) return;
      if (event.key === " ") {
        event.preventDefault();
        controllerRef.current.togglePlayback();
      } else if (event.key === "ArrowLeft" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        controllerRef.current.stepFrame(event.shiftKey ? -10 : -1);
      } else if (event.key === "ArrowRight" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        controllerRef.current.stepFrame(event.shiftKey ? 10 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AnimatorTransition } from "../../domain/animator-controller";
import type { AnimatorTransitionPatch } from "../../application/animator-transition-authoring";
import {
  animatorCrossfadeDragPatch,
  type AnimatorCrossfadeDragTarget,
} from "./animator-crossfade-presentation";

type CrossfadeDragSession = Readonly<{
  pointerId: number;
  target: AnimatorCrossfadeDragTarget;
  startClientX: number;
  width: number;
  transition: AnimatorTransition;
}>;

type AnimatorCrossfadeDragInput = Readonly<{
  transition: AnimatorTransition;
  sourceDurationSeconds?: number;
  timelineEndNormalized: number;
  onChange: (patch: AnimatorTransitionPatch) => void;
}>;

/** Owns pointer and keyboard authoring gestures for the Inspector crossfade gizmo. */
export function useAnimatorCrossfadeDrag({
  transition,
  sourceDurationSeconds,
  timelineEndNormalized,
  onChange,
}: AnimatorCrossfadeDragInput) {
  const previewRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<AnimatorTransitionPatch | null>(null);
  const cleanupDragRef = useRef<() => void>(() => undefined);
  const [draft, setDraft] = useState<AnimatorTransitionPatch | null>(null);

  const beginDrag = (
    target: AnimatorCrossfadeDragTarget,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0
      || (target !== "destination" && !transition.hasExitTime)) return;
    const width = previewRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupDragRef.current();
    const drag: CrossfadeDragSession = {
      pointerId: event.pointerId,
      target,
      startClientX: event.clientX,
      width,
      transition,
    };
    draftRef.current = null;
    setDraft(null);
    const updateDrag = (pointerEvent: PointerEvent) => {
      if (drag.pointerId !== pointerEvent.pointerId) return;
      const delta = (pointerEvent.clientX - drag.startClientX)
        / drag.width * timelineEndNormalized;
      const next = animatorCrossfadeDragPatch(
        drag.transition,
        drag.target,
        delta,
        sourceDurationSeconds,
      );
      draftRef.current = next;
      setDraft(next);
    };
    const finishDrag = (pointerEvent: PointerEvent) => {
      if (drag.pointerId !== pointerEvent.pointerId) return;
      const next = draftRef.current;
      cleanupDragRef.current();
      draftRef.current = null;
      setDraft(null);
      if (next && Object.keys(next).length > 0) onChange(next);
    };
    const cancelDrag = (pointerEvent: PointerEvent) => {
      if (drag.pointerId !== pointerEvent.pointerId) return;
      cleanupDragRef.current();
      draftRef.current = null;
      setDraft(null);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", updateDrag);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
      cleanupDragRef.current = () => undefined;
    };
    window.addEventListener("pointermove", updateDrag);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
    cleanupDragRef.current = cleanup;
  };

  useEffect(() => () => cleanupDragRef.current(), []);

  const nudge = (
    target: AnimatorCrossfadeDragTarget,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onChange(animatorCrossfadeDragPatch(
      transition,
      target,
      direction * (event.shiftKey ? 0.1 : 0.01),
      sourceDurationSeconds,
    ));
  };

  return {
    previewRef,
    displayedTransition: draft ? { ...transition, ...draft } : transition,
    dragHandlers: (target: AnimatorCrossfadeDragTarget) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => beginDrag(target, event),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => nudge(target, event),
    }),
  };
}

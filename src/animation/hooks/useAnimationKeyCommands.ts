import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  copyTimelineKeys,
  pasteTimelineKeys,
  pastedKeySelection,
  type TimelineKeyClipboardItem,
} from "../timeline/key-clipboard";
import { pastedKeyId } from "../timeline/keyframes";
import { keyIdsForMarkers } from "../timeline/selection";
import type { TimelineKeyEntry, TimelineKeyMarker, TimelineRow } from "../timeline/types";
import type { TransformAxis } from "../types";
import type { SceneAnimationController } from "./useSceneAnimation";

type AnimationKeyCommandsOptions = {
  active: boolean;
  controller: SceneAnimationController;
  selectedRow?: TimelineRow;
  selectedKeyEntries: TimelineKeyEntry[];
  visibleKeyMarkers: TimelineKeyMarker[];
  setSelectedKeyIds: Dispatch<SetStateAction<Set<string>>>;
  snapTimelineTime: (time: number) => number;
};

export function useAnimationKeyCommands({
  active,
  controller,
  selectedRow,
  selectedKeyEntries,
  visibleKeyMarkers,
  setSelectedKeyIds,
  snapTimelineTime,
}: AnimationKeyCommandsOptions) {
  const clipboardRef = useRef<TimelineKeyClipboardItem[] | null>(null);
  const shortcutsActiveRef = useRef(false);

  const keySelected = useCallback(() => {
    if (!selectedRow) return;
    if (selectedRow.kind === "object") {
      controller.addObjectTransformKeyframe(selectedRow.objectId);
      return;
    }
    if (selectedRow.kind === "property" && selectedRow.property) {
      const property = selectedRow.property;
      ([0, 1, 2] as TransformAxis[]).forEach((axis) => {
        controller.addChannelKeyframe({ objectId: selectedRow.objectId, property, axis });
      });
      return;
    }
    if (selectedRow.kind === "channel" && selectedRow.property !== undefined && selectedRow.axis !== undefined) {
      controller.addChannelKeyframe({
        objectId: selectedRow.objectId,
        property: selectedRow.property,
        axis: selectedRow.axis,
      });
    }
  }, [controller, selectedRow]);

  const selectAllVisibleKeys = useCallback(() => {
    setSelectedKeyIds(keyIdsForMarkers(visibleKeyMarkers));
  }, [setSelectedKeyIds, visibleKeyMarkers]);

  const copySelectedKeys = useCallback(() => {
    const clipboard = copyTimelineKeys(selectedKeyEntries);
    if (clipboard.length === 0) return false;
    clipboardRef.current = clipboard;
    return true;
  }, [selectedKeyEntries]);

  const deleteSelectedKeys = useCallback(() => {
    if (selectedKeyEntries.length === 0) return false;
    controller.removeChannelKeyframes(selectedKeyEntries.map((entry) => entry.ref));
    setSelectedKeyIds(new Set());
    return true;
  }, [controller, selectedKeyEntries, setSelectedKeyIds]);

  const pasteCopiedKeys = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard || clipboard.length === 0) return false;
    const anchorTime = snapTimelineTime(controller.playback.getSnapshot().time);
    const inserts = pasteTimelineKeys(clipboard, anchorTime, pastedKeyId);
    controller.insertChannelKeyframes(inserts);
    setSelectedKeyIds(pastedKeySelection(inserts));
    return true;
  }, [controller, setSelectedKeyIds, snapTimelineTime]);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const eventInsideAnimation = target ? Boolean(target.closest(".animation-panel")) : false;
      const shouldClaim = eventInsideAnimation || shortcutsActiveRef.current || selectedKeyEntries.length > 0;
      if (!shouldClaim) return;
      const claim = () => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "a") {
        claim();
        selectAllVisibleKeys();
      } else if (mod && key === "c") {
        if (copySelectedKeys()) claim();
      } else if (mod && key === "x") {
        if (copySelectedKeys()) {
          deleteSelectedKeys();
          claim();
        }
      } else if (mod && key === "v") {
        if (pasteCopiedKeys()) claim();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (deleteSelectedKeys() || eventInsideAnimation) claim();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [active, copySelectedKeys, deleteSelectedKeys, pasteCopiedKeys, selectAllVisibleKeys, selectedKeyEntries.length]);

  useEffect(() => {
    if (!active) {
      shortcutsActiveRef.current = false;
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      shortcutsActiveRef.current = Boolean(target?.closest(".animation-panel"));
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [active]);

  return { keySelected };
}

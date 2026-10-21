import {
  useCallback,
  useEffect,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { DOCK_MIME } from "./dock-drag-transfer";
import type { DockEdge, DockPaneId, DockTabPlacement } from "./layout";

type PaneDragInteractionInput = {
  dockPane: (
    source: DockPaneId,
    target: DockPaneId,
    edge: DockEdge,
    tabPlacement?: DockTabPlacement,
  ) => void;
};

/** Owns one native pane drag session and all global cancellation listeners. */
export function usePaneDragInteraction({ dockPane }: PaneDragInteractionInput) {
  const [draggingPane, setDraggingPane] = useState<DockPaneId | null>(null);
  const cancel = useCallback(() => setDraggingPane(null), []);

  useEffect(() => {
    if (!draggingPane) return;
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("dragend", cancel, true);
    window.addEventListener("drop", cancel);
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("dragend", cancel, true);
      window.removeEventListener("drop", cancel);
      window.removeEventListener("keydown", cancelOnEscape);
    };
  }, [cancel, draggingPane]);

  const begin = useCallback((pane: DockPaneId, event: ReactDragEvent<HTMLElement>) => {
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DOCK_MIME, pane);
      setDraggingPane(pane);
    } catch {
      event.preventDefault();
      setDraggingPane(null);
    }
  }, []);

  const drop = useCallback((
    source: DockPaneId,
    target: DockPaneId,
    edge: DockEdge,
    tabPlacement?: DockTabPlacement,
  ) => {
    dockPane(source, target, edge, tabPlacement);
    setDraggingPane(null);
  }, [dockPane]);

  return { draggingPane, begin, cancel, drop };
}

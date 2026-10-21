import { useEffect, useState, type DragEvent as ReactDragEvent } from "react";
import { hasDockTransfer, paneFromDockTransfer } from "./dock-drag-transfer";
import type { DockPaneId, DockWorkspaceEdge } from "./layout";

type DockWorkspaceEdgeTargetProps = {
  draggingPane: DockPaneId | null;
  edge: DockWorkspaceEdge;
  onCancelDrag: () => void;
  onDropPane: (source: DockPaneId, edge: DockWorkspaceEdge) => void;
};

/** Owns the outer workspace target used for full-row or full-column docking. */
export function DockWorkspaceEdgeTarget({
  draggingPane,
  edge,
  onCancelDrag,
  onDropPane,
}: DockWorkspaceEdgeTargetProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!draggingPane) setActive(false);
  }, [draggingPane]);

  if (!draggingPane) return null;

  const acceptDrag = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDockTransfer(event.dataTransfer)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    return true;
  };

  return (
    <div
      className="editor-dock-workspace-edge-target"
      data-workspace-dock-edge={edge}
      data-active={active || undefined}
      aria-hidden="true"
    >
      <div className="editor-dock-workspace-edge-target__preview" />
      <div
        className="editor-dock-workspace-edge-target__hit-area"
        onDragEnter={(event) => {
          if (acceptDrag(event)) setActive(true);
        }}
        onDragOver={(event) => {
          if (acceptDrag(event)) setActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(false);
        }}
        onDrop={(event) => {
          if (!acceptDrag(event)) return;
          const source = paneFromDockTransfer(event.dataTransfer);
          setActive(false);
          if (source && source === draggingPane) {
            onDropPane(source, edge);
          } else {
            onCancelDrag();
          }
        }}
      />
    </div>
  );
}

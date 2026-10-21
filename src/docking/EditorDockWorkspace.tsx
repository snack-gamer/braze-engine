import { useEffect, useMemo, useRef } from "react";
import { DockGroupChrome } from "./DockGroupChrome";
import { DockSplitter } from "./DockSplitter";
import { DockWorkspaceEdgeTarget } from "./DockWorkspaceEdgeTarget";
import { hasDockTransfer } from "./dock-drag-transfer";
import { dockFrameStyle } from "./dock-frame-style";
import type { EditorDockWorkspaceProps } from "./dock-workspace-types";
import { DOCK_PANE_IDS, type DockPaneId } from "./layout";
import { usePaneDragInteraction } from "./usePaneDragInteraction";
import { useWorkspaceFrames } from "./useWorkspaceFrames";

export { useEditorDockController } from "./useEditorDockController";
export type {
  DockPaneDefinition,
  EditorDockController,
} from "./dock-workspace-types";

/** Presents a measured dock document; state and interactions live in feature modules. */
export function EditorDockWorkspace({ panes, controller }: EditorDockWorkspaceProps) {
  const workspaceRef = useRef<HTMLElement | null>(null);
  const frames = useWorkspaceFrames(
    controller.document.root,
    workspaceRef,
    controller.maximizedGroupId,
  );
  const drag = usePaneDragInteraction({ dockPane: controller.dockPane });

  useEffect(() => {
    if (!controller.maximizedGroupId) return;
    const restoreOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (window.document.querySelector('[aria-modal="true"]')) return;
      controller.restoreMaximizedGroup();
    };
    window.addEventListener("keydown", restoreOnEscape);
    return () => window.removeEventListener("keydown", restoreOnEscape);
  }, [controller.maximizedGroupId, controller.restoreMaximizedGroup]);

  const groupByPane = useMemo(() => {
    const result = new Map<DockPaneId, (typeof frames.groups)[number]>();
    for (const frame of frames.groups) {
      for (const pane of frame.group.panes) result.set(pane, frame);
    }
    return result;
  }, [frames.groups]);

  return (
    <main
      ref={workspaceRef}
      className={`workspace editor-dock-workspace ${drag.draggingPane ? "is-dragging-pane" : ""}`}
      data-dragging-pane={drag.draggingPane ?? undefined}
      data-maximized-group={controller.maximizedGroupId ?? undefined}
      onDragOver={(event) => {
        if (!hasDockTransfer(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!hasDockTransfer(event.dataTransfer)) return;
        event.preventDefault();
        drag.cancel();
      }}
    >
      {DOCK_PANE_IDS.map((pane) => {
        const frame = groupByPane.get(pane);
        const active = Boolean(frame && frame.group.active === pane);
        return (
          <section
            key={pane}
            id={`editor-dock-surface-${pane}`}
            className={`editor-dock-surface ${active ? "is-active" : "is-inactive"} ${frame ? "is-open" : "is-closed"}`}
            style={frame ? dockFrameStyle(frame.rect) : undefined}
            data-pane-id={pane}
            role="tabpanel"
            aria-label={panes[pane].title}
            aria-hidden={!active}
          >
            <div className="editor-dock-surface__content">{panes[pane].content}</div>
          </section>
        );
      })}

      {frames.groups.map(({ group, rect }) => (
        <DockGroupChrome
          key={group.id}
          group={group}
          rect={rect}
          panes={panes}
          controller={controller}
          draggingPane={drag.draggingPane}
          onDragStart={drag.begin}
          onCancelDrag={drag.cancel}
          onDropPane={drag.drop}
        />
      ))}

      {frames.splitters.map((frame) => (
        <DockSplitter
          key={frame.path.length > 0 ? frame.path.join(".") : "root"}
          frame={frame}
          controller={controller}
        />
      ))}

      <DockWorkspaceEdgeTarget
        draggingPane={drag.draggingPane}
        edge="bottom"
        onCancelDrag={drag.cancel}
        onDropPane={(source, edge) => {
          controller.dockPaneAtWorkspaceEdge(source, edge);
          drag.cancel();
        }}
      />
    </main>
  );
}

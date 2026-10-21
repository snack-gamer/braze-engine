import { useEffect, useState, type DragEvent as ReactDragEvent } from "react";
import { EditorIcon } from "../ui/EditorIcon";
import { DockTabContextMenu } from "./DockTabContextMenu";
import { LayoutMenu } from "./LayoutMenu";
import { resolveDockSplitEdge, resolveDockTabPlacement } from "./dock-drop-intent";
import { hasDockTransfer, paneFromDockTransfer } from "./dock-drag-transfer";
import { dockFrameStyle } from "./dock-frame-style";
import type { DockPaneDefinition, EditorDockController } from "./dock-workspace-types";
import {
  CLOSABLE_DOCK_PANES,
  type DockEdge,
  type DockPaneId,
  type DockRect,
  type DockTabPlacement,
  type DockTabsNode,
} from "./layout";
import { useDockTabOverflow } from "./useDockTabOverflow";

type DockGroupChromeProps = {
  group: DockTabsNode;
  rect: DockRect;
  panes: Record<DockPaneId, DockPaneDefinition>;
  controller: EditorDockController;
  draggingPane: DockPaneId | null;
  onDragStart: (pane: DockPaneId, event: ReactDragEvent<HTMLElement>) => void;
  onCancelDrag: () => void;
  onDropPane: (
    source: DockPaneId,
    target: DockPaneId,
    edge: DockEdge,
    tabPlacement?: DockTabPlacement,
  ) => void;
};

type TabDropIntent = {
  target: DockPaneId;
  placement: DockTabPlacement;
};

type TabMenuRequest = {
  pane: DockPaneId;
  x: number;
  y: number;
};

/** Presents tabs and one contextual docking preview for a measured dock group. */
export function DockGroupChrome({
  group,
  rect,
  panes,
  controller,
  draggingPane,
  onDragStart,
  onCancelDrag,
  onDropPane,
}: DockGroupChromeProps) {
  const [splitEdge, setSplitEdge] = useState<Exclude<DockEdge, "center"> | null>(null);
  const [tabIntent, setTabIntent] = useState<TabDropIntent | null>(null);
  const [menu, setMenu] = useState<TabMenuRequest | null>(null);
  const tabOverflow = useDockTabOverflow(group.panes.join("|"));
  const maximized = controller.maximizedGroupId === group.id;
  const splitTarget = group.active === draggingPane
    ? group.panes.find((pane) => pane !== draggingPane) ?? group.active
    : group.active;
  const canReceive = draggingPane !== null && splitTarget !== draggingPane;
  const hasToolbar = Boolean(panes[group.active].toolbar) || group.panes.includes("scene");

  useEffect(() => {
    if (draggingPane) return;
    setSplitEdge(null);
    setTabIntent(null);
  }, [draggingPane]);

  const acceptDrag = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasDockTransfer(event.dataTransfer)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    return true;
  };

  const sourceFrom = (event: ReactDragEvent<HTMLElement>) => {
    const source = paneFromDockTransfer(event.dataTransfer);
    return source === draggingPane ? source : null;
  };

  const clearPreview = () => {
    setSplitEdge(null);
    setTabIntent(null);
  };

  const showTabIntent = (pane: DockPaneId, event: ReactDragEvent<HTMLElement>) => {
    if (!acceptDrag(event) || pane === draggingPane) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setSplitEdge(null);
    setTabIntent({
      target: pane,
      placement: resolveDockTabPlacement(event.clientX, bounds.left, bounds.width),
    });
  };

  const dropOnTab = (event: ReactDragEvent<HTMLElement>) => {
    if (!acceptDrag(event)) return;
    const source = sourceFrom(event);
    if (source && tabIntent && source !== tabIntent.target) {
      onDropPane(source, tabIntent.target, "center", tabIntent.placement);
    } else {
      onCancelDrag();
    }
    clearPreview();
  };

  const showAtTabStripEnd = (event: ReactDragEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest(".editor-dock-tab-shell")) return;
    if (!acceptDrag(event)) return;
    const target = [...group.panes].reverse().find((pane) => pane !== draggingPane);
    setSplitEdge(null);
    setTabIntent(target ? { target, placement: "after" } : null);
  };

  return (
    <section
      className={`editor-dock-group ${tabIntent ? "is-tab-drop-preview" : ""}`}
      style={dockFrameStyle(rect)}
      data-dock-group-id={group.id}
      aria-label={`${panes[group.active].title} dock group`}
    >
      <div
        className="editor-dock-group__tabbar"
        role="tablist"
        aria-label="Docked editor windows"
        onDragOver={showAtTabStripEnd}
        onDrop={dropOnTab}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTabIntent(null);
        }}
      >
        <div className="editor-dock-group__tabstrip">
          {(tabOverflow.overflow.backward || tabOverflow.overflow.forward) && (
            <button
              type="button"
              className="editor-dock-tab-nav editor-dock-tab-nav--back"
              aria-label="Show previous dock tabs"
              disabled={!tabOverflow.overflow.backward}
              onClick={() => tabOverflow.scroll(-1)}
            >
              <EditorIcon name="disclosureClosed" size="compact" />
            </button>
          )}
          <div ref={tabOverflow.stripRef} className="editor-dock-group__tabs">
            {group.panes.map((pane) => {
              const definition = panes[pane];
              const active = pane === group.active;
              const closable = (CLOSABLE_DOCK_PANES as readonly DockPaneId[]).includes(pane);
              const dropClass = tabIntent?.target === pane ? `is-drop-${tabIntent.placement}` : "";
              return (
                <div
                  key={pane}
                  className={`editor-dock-tab-shell ${active ? "is-active" : ""} ${draggingPane === pane ? "is-dragging" : ""} ${dropClass}`}
                  onDragOver={(event) => showTabIntent(pane, event)}
                  onDrop={dropOnTab}
                >
                  <button
                    type="button"
                    id={`editor-dock-tab-${pane}`}
                    className="editor-dock-tab"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`editor-dock-surface-${pane}`}
                    data-dock-tab={pane}
                    draggable={!maximized}
                    title={maximized
                      ? `Double-click to restore ${definition.title}`
                      : `Drag ${definition.title} to rearrange · Double-click to maximize`}
                    onClick={() => controller.activatePane(pane)}
                    onDoubleClick={() => controller.toggleMaximizeGroup(group.id)}
                    onMouseDown={(event) => {
                      if (event.button === 1) event.preventDefault();
                    }}
                    onAuxClick={(event) => {
                      if (event.button !== 1 || !closable) return;
                      event.preventDefault();
                      controller.closePane(pane);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      controller.activatePane(pane);
                      setMenu({ pane, x: event.clientX, y: event.clientY });
                    }}
                    onDragStart={(event) => {
                      setMenu(null);
                      onDragStart(pane, event);
                    }}
                    onDragEnd={onCancelDrag}
                  >
                    <EditorIcon name={definition.icon} size="control" />
                    <span>{definition.title}</span>
                  </button>
                </div>
              );
            })}
          </div>
          {(tabOverflow.overflow.backward || tabOverflow.overflow.forward) && (
            <button
              type="button"
              className="editor-dock-tab-nav"
              aria-label="Show next dock tabs"
              disabled={!tabOverflow.overflow.forward}
              onClick={() => tabOverflow.scroll(1)}
            >
              <EditorIcon name="disclosureClosed" size="compact" />
            </button>
          )}
        </div>

        {hasToolbar && (
          <div className="editor-dock-group__toolbar">
            {panes[group.active].toolbar}
            {group.panes.includes("scene") && (
              <LayoutMenu
                document={controller.document}
                onApply={controller.applyLayout}
                onReset={controller.resetLayout}
              />
            )}
          </div>
        )}
      </div>

      {canReceive && (
        <div
          className="editor-dock-drop-target"
          data-dock-edge={splitEdge ?? undefined}
          onDragOver={(event) => {
            if (!acceptDrag(event)) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setTabIntent(null);
            setSplitEdge(resolveDockSplitEdge(
              { width: bounds.width, height: bounds.height },
              { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
            ));
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSplitEdge(null);
          }}
          onDrop={(event) => {
            if (!acceptDrag(event)) return;
            const source = sourceFrom(event);
            if (source && splitEdge && source !== splitTarget) {
              onDropPane(source, splitTarget, splitEdge);
            } else {
              onCancelDrag();
            }
            clearPreview();
          }}
        >
          {splitEdge && <div className="editor-dock-drop-preview" aria-hidden="true" />}
        </div>
      )}

      {menu && (
        <DockTabContextMenu
          x={menu.x}
          y={menu.y}
          pane={menu.pane}
          groupId={group.id}
          panes={panes}
          controller={controller}
          closable={(CLOSABLE_DOCK_PANES as readonly DockPaneId[]).includes(menu.pane)}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

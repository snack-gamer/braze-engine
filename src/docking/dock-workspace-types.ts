import type { ReactNode } from "react";
import type { EditorIconName } from "../ui/icons";
import type {
  DockEdge,
  DockLayoutDocument,
  DockPaneId,
  DockPath,
  DockTabPlacement,
  DockWorkspaceEdge,
} from "./layout";

export type DockPaneDefinition = {
  title: string;
  icon: EditorIconName;
  content: ReactNode;
  toolbar?: ReactNode;
};

export type EditorDockController = {
  document: DockLayoutDocument;
  maximizedGroupId: string | null;
  resetLayout: () => void;
  applyLayout: (document: DockLayoutDocument) => void;
  activatePane: (pane: DockPaneId) => void;
  dockPane: (
    source: DockPaneId,
    target: DockPaneId,
    edge: DockEdge,
    tabPlacement?: DockTabPlacement,
  ) => void;
  dockPaneAtWorkspaceEdge: (source: DockPaneId, edge: DockWorkspaceEdge) => void;
  closePane: (pane: DockPaneId) => void;
  openPane: (pane: DockPaneId) => void;
  isPaneOpen: (pane: DockPaneId) => boolean;
  isPaneActive: (pane: DockPaneId) => boolean;
  togglePane: (pane: DockPaneId) => void;
  toggleMaximizeGroup: (groupId: string) => void;
  restoreMaximizedGroup: () => void;
  setSplitRatio: (path: DockPath, ratio: number) => void;
};

export type EditorDockWorkspaceProps = {
  panes: Record<DockPaneId, DockPaneDefinition>;
  controller: EditorDockController;
};

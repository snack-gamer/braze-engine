import type { EditorDockController } from "../../docking/EditorDockWorkspace";
import type { DockPaneId } from "../../docking/layout";

export function isDockPaneActive(controller: EditorDockController, pane: DockPaneId): boolean {
  return controller.isPaneActive(pane);
}

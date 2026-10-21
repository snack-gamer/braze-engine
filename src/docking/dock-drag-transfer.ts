import { DOCK_PANE_IDS, type DockPaneId } from "./layout";

export const DOCK_MIME = "application/x-braze-editor-pane";

export function hasDockTransfer(transfer: DataTransfer): boolean {
  return Array.from(transfer.types ?? []).some((type) => type.toLowerCase() === DOCK_MIME);
}

export function paneFromDockTransfer(transfer: DataTransfer): DockPaneId | null {
  if (!hasDockTransfer(transfer)) return null;
  try {
    const value = transfer.getData(DOCK_MIME);
    return (DOCK_PANE_IDS as readonly string[]).includes(value) ? value as DockPaneId : null;
  } catch {
    return null;
  }
}

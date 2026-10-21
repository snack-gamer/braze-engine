import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLOSABLE_DOCK_PANES,
  DEFAULT_DOCK_DOCUMENT,
  activateDockPane,
  closeDockPane,
  dockPane,
  dockPaneAtWorkspaceEdge,
  findDockGroup,
  findPaneGroup,
  isDockPaneEffectivelyActive,
  openDockPane,
  parseDockDocument,
  setDockSplitRatio,
  type DockPaneId,
} from "./layout";
import type { EditorDockController } from "./dock-workspace-types";
import {
  persistDockDocument,
  readInitialDockDocument,
} from "./dock-persistence";

const PERSIST_DELAY_MS = 220;

/** Owns dock-document commands and delayed browser persistence. */
export function useEditorDockController(): EditorDockController {
  const [document, setDocument] = useState(readInitialDockDocument);
  const [maximizedGroupId, setMaximizedGroupId] = useState<string | null>(null);
  const pendingDocumentRef = useRef(document);
  const persistTimerRef = useRef<number | null>(null);

  const flushPersistence = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    persistDockDocument(pendingDocumentRef.current);
  }, []);

  useEffect(() => {
    pendingDocumentRef.current = document;
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      persistDockDocument(pendingDocumentRef.current);
    }, PERSIST_DELAY_MS);
  }, [document]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (window.document.visibilityState === "hidden") flushPersistence();
    };
    window.addEventListener("pagehide", flushPersistence);
    window.document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushPersistence);
      window.document.removeEventListener("visibilitychange", flushWhenHidden);
      flushPersistence();
    };
  }, [flushPersistence]);

  useEffect(() => {
    if (maximizedGroupId && !findDockGroup(document.root, maximizedGroupId)) {
      setMaximizedGroupId(null);
    }
  }, [document.root, maximizedGroupId]);

  const resetLayout = useCallback(() => {
    setMaximizedGroupId(null);
    setDocument(DEFAULT_DOCK_DOCUMENT);
  }, []);
  const applyLayout = useCallback((next: Parameters<EditorDockController["applyLayout"]>[0]) => {
    const parsed = parseDockDocument(next);
    if (parsed) {
      setMaximizedGroupId(null);
      setDocument(parsed);
    }
  }, []);
  const activatePane = useCallback((pane: DockPaneId) => {
    setDocument((current) => activateDockPane(current, pane));
  }, []);
  const movePane = useCallback<EditorDockController["dockPane"]>((source, target, edge, tabPlacement) => {
    setMaximizedGroupId(null);
    setDocument((current) => dockPane(current, source, target, edge, tabPlacement));
  }, []);
  const movePaneToWorkspaceEdge = useCallback<EditorDockController["dockPaneAtWorkspaceEdge"]>((source, edge) => {
    setMaximizedGroupId(null);
    setDocument((current) => dockPaneAtWorkspaceEdge(current, source, edge));
  }, []);
  const closePane = useCallback((pane: DockPaneId) => {
    setMaximizedGroupId(null);
    setDocument((current) => closeDockPane(current, pane));
  }, []);
  const openPane = useCallback((pane: DockPaneId) => {
    setMaximizedGroupId(null);
    setDocument((current) => openDockPane(current, pane));
  }, []);
  const isPaneOpen = useCallback(
    (pane: DockPaneId) => Boolean(findPaneGroup(document.root, pane)) && !document.closed.includes(pane),
    [document],
  );
  const isPaneActive = useCallback((pane: DockPaneId) => {
    return isDockPaneEffectivelyActive(document, pane, maximizedGroupId);
  }, [document, maximizedGroupId]);
  const togglePane = useCallback((pane: DockPaneId) => {
    setMaximizedGroupId(null);
    setDocument((current) => {
      const open = Boolean(findPaneGroup(current.root, pane)) && !current.closed.includes(pane);
      if (!open) return openDockPane(current, pane);
      return (CLOSABLE_DOCK_PANES as readonly DockPaneId[]).includes(pane)
        ? closeDockPane(current, pane)
        : activateDockPane(current, pane);
    });
  }, []);
  const setSplitRatio = useCallback<EditorDockController["setSplitRatio"]>((path, ratio) => {
    setDocument((current) => ({ ...current, root: setDockSplitRatio(current.root, path, ratio) }));
  }, []);
  const toggleMaximizeGroup = useCallback((groupId: string) => {
    setMaximizedGroupId((current) => {
      if (current === groupId) return null;
      return findDockGroup(document.root, groupId) ? groupId : current;
    });
  }, [document.root]);
  const restoreMaximizedGroup = useCallback(() => setMaximizedGroupId(null), []);

  return useMemo(() => ({
    document,
    maximizedGroupId,
    resetLayout,
    applyLayout,
    activatePane,
    dockPane: movePane,
    dockPaneAtWorkspaceEdge: movePaneToWorkspaceEdge,
    closePane,
    openPane,
    isPaneActive,
    isPaneOpen,
    togglePane,
    toggleMaximizeGroup,
    restoreMaximizedGroup,
    setSplitRatio,
  }), [
    activatePane,
    applyLayout,
    closePane,
    document,
    isPaneOpen,
    isPaneActive,
    maximizedGroupId,
    movePane,
    movePaneToWorkspaceEdge,
    openPane,
    resetLayout,
    restoreMaximizedGroup,
    setSplitRatio,
    toggleMaximizeGroup,
    togglePane,
  ]);
}

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { HierarchyRow } from "../hierarchy-model";
import {
  hierarchyNavigationAction,
  reconcileHierarchySelection,
  selectHierarchyRow,
} from "../hierarchy-selection";
import type { SceneObject } from "../../types";

type UseHierarchySelectionInput = {
  objects: SceneObject[];
  rows: HierarchyRow[];
  activeObjectId: string;
  lockedRootId: string | null;
  collapsed: ReadonlySet<string>;
  setObjectCollapsed: (id: string, collapsed: boolean) => void;
  setActiveObjectId: (id: string) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  duplicateObjects: (ids: string[]) => void;
  deleteObjects: (ids: string[]) => void;
  frameObject: (id: string) => void;
};

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && Array.from(left).every((id) => right.has(id));
}

export function useHierarchySelection(input: UseHierarchySelectionInput) {
  const {
    objects,
    rows,
    activeObjectId,
    lockedRootId,
    collapsed,
    setObjectCollapsed,
    setActiveObjectId,
    updateObject,
    duplicateObjects,
    deleteObjects,
    frameObject,
  } = input;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set([activeObjectId]));
  const [anchorId, setAnchorId] = useState(activeObjectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [keyboardFocusId, setKeyboardFocusId] = useState<string | null>(null);
  const skipRenameCommitRef = useRef(false);
  const visibleIds = useMemo(() => rows.map((row) => row.object.id), [rows]);
  const validIds = useMemo(() => new Set(objects.map((object) => object.id)), [objects]);
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);

  useEffect(() => {
    const result = reconcileHierarchySelection(validIds, selectedIds, activeObjectId, anchorId);
    if (!sameIds(result.selectedIds, selectedIds)) setSelectedIds(result.selectedIds);
    if (result.anchorId !== anchorId) setAnchorId(result.anchorId);
    if (editingId && !validIds.has(editingId)) setEditingId(null);
  }, [activeObjectId, anchorId, editingId, selectedIds, validIds]);

  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const idsForRowAction = useCallback(
    (objectId: string) => selectedIds.has(objectId) ? selectedList : [objectId],
    [selectedIds, selectedList],
  );

  const selectRow = useCallback((event: MouseEvent, objectId: string) => {
    const result = selectHierarchyRow(visibleIds, selectedIds, anchorId, objectId, {
      extend: event.shiftKey,
      toggle: event.metaKey || event.ctrlKey,
    });
    const resultIds = Array.from(result.selectedIds);
    const nextActiveId = result.selectedIds.has(objectId)
      ? objectId
      : resultIds[resultIds.length - 1] ?? objectId;
    setActiveObjectId(nextActiveId);
    setSelectedIds(result.selectedIds);
    setAnchorId(result.anchorId);
  }, [anchorId, selectedIds, setActiveObjectId, visibleIds]);

  const selectForContextMenu = useCallback((objectId: string) => {
    if (!selectedIds.has(objectId)) {
      setSelectedIds(new Set([objectId]));
      setAnchorId(objectId);
    }
    setActiveObjectId(objectId);
  }, [selectedIds, setActiveObjectId]);

  const startRename = useCallback((objectId: string) => {
    if (objectId === lockedRootId) return;
    const object = objectById.get(objectId);
    if (!object) return;
    skipRenameCommitRef.current = false;
    setEditingId(object.id);
    setRenameDraft(object.name || "");
  }, [lockedRootId, objectById]);

  const commitRename = useCallback(() => {
    if (skipRenameCommitRef.current) {
      skipRenameCommitRef.current = false;
      return;
    }
    if (!editingId) return;
    if (editingId !== lockedRootId) updateObject(editingId, { name: renameDraft.trim() || "Untitled" });
    setEditingId(null);
    setRenameDraft("");
  }, [editingId, lockedRootId, renameDraft, updateObject]);

  const cancelRename = useCallback(() => {
    skipRenameCommitRef.current = true;
    setEditingId(null);
    setRenameDraft("");
  }, []);

  const focusFromKeyboard = useCallback((objectId: string, extend: boolean) => {
    setActiveObjectId(objectId);
    setKeyboardFocusId(objectId);
    const result = selectHierarchyRow(visibleIds, selectedIds, anchorId, objectId, {
      extend,
      toggle: false,
    });
    setSelectedIds(result.selectedIds);
    setAnchorId(result.anchorId);
  }, [anchorId, selectedIds, setActiveObjectId, visibleIds]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;
    const modifier = event.metaKey || event.ctrlKey;
    const actionIds = selectedList.length > 0 ? selectedList : [activeObjectId];
    if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      startRename(actionIds[0]);
      return;
    }
    if (!modifier && event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      frameObject(activeObjectId);
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      event.stopPropagation();
      duplicateObjects(actionIds.filter((id) => id !== lockedRootId));
      return;
    }
    if (!modifier && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      event.stopPropagation();
      deleteObjects(actionIds.filter((id) => id !== lockedRootId));
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const action = hierarchyNavigationAction(
      rows,
      activeObjectId,
      collapsed,
      event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End",
    );
    if (action.collapseId) setObjectCollapsed(action.collapseId, true);
    if (action.expandId) setObjectCollapsed(action.expandId, false);
    if (action.focusId) focusFromKeyboard(action.focusId, event.shiftKey);
  }, [
    activeObjectId,
    collapsed,
    deleteObjects,
    duplicateObjects,
    focusFromKeyboard,
    frameObject,
    lockedRootId,
    rows,
    selectedList,
    setObjectCollapsed,
    startRename,
  ]);

  return {
    anchorId,
    cancelRename,
    commitRename,
    editingId,
    handleKeyDown,
    idsForRowAction,
    keyboardFocusId,
    renameDraft,
    selectForContextMenu,
    selectedIds,
    selectedList,
    selectRow,
    setRenameDraft,
    startRename,
  };
}

export type HierarchySelectionController = ReturnType<typeof useHierarchySelection>;

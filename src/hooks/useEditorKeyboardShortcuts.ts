import { useEffect } from "react";
import type { TransformMode } from "../types";

type EditorKeyboardShortcutOptions = {
  onTransformModeChange: (mode: TransformMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

const EDITOR_MODAL_SELECTOR = [
  ".animation-panel",
  ".shortcuts-modal",
  ".confirm-modal",
  ".drawer",
  ".gizmos-menu",
  ".scene-snap-menu",
  ".asset-menu",
].join(", ");

function receivesTextInput(target: HTMLElement | null): boolean {
  return Boolean(target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable));
}

function belongsToRuntimeInput(target: HTMLElement | null): boolean {
  return Boolean(target?.closest('[data-runtime-input-surface="true"]'));
}

/** Owns editor-global shortcuts while respecting focused inputs and modal surfaces. */
export function useEditorKeyboardShortcuts({
  onTransformModeChange,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
}: EditorKeyboardShortcutOptions): void {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (receivesTextInput(target)) return;
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (belongsToRuntimeInput(target) || belongsToRuntimeInput(focused)) return;
      if (target?.closest(EDITOR_MODAL_SELECTOR)) return;

      const modified = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (!modified && !event.altKey && (key === "t" || key === "r" || key === "s")) {
        event.preventDefault();
        onTransformModeChange(key === "t" ? "translate" : key === "r" ? "rotate" : "scale");
        return;
      }
      if (modified && key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }
      if (modified && ((key === "z" && event.shiftKey) || key === "y")) {
        event.preventDefault();
        onRedo();
        return;
      }
      if (modified && key === "d" && onDuplicate) {
        event.preventDefault();
        onDuplicate();
        return;
      }
      if (!modified && (event.key === "Delete" || event.key === "Backspace") && onDelete) {
        event.preventDefault();
        onDelete();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onDelete, onDuplicate, onRedo, onTransformModeChange, onUndo]);
}

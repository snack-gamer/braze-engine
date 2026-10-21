import { useEffect, useRef } from "react";
import { EditorIcon } from "../../ui/EditorIcon";

type ConfirmModalProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// In-app confirmation dialog. Replaces window.confirm so the visual matches
// the rest of the editor instead of the browser's native chrome.
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Capture phase + stopImmediatePropagation so other listeners (e.g. the
      // AssetBrowser's own Delete/Escape handlers) don't fire underneath the
      // modal.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="confirm-modal__backdrop" onClick={onCancel} />
      <div className="confirm-modal__panel" onContextMenu={(e) => e.preventDefault()}>
        <div className="confirm-modal__head">
          {danger && <EditorIcon name="warning" size="control" className="confirm-modal__icon" />}
          <strong id="confirm-modal-title">{title}</strong>
        </div>
        <p className="confirm-modal__message">{message}</p>
        <div className="confirm-modal__actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`ghost-button ${danger ? "confirm-modal__danger" : "confirm-modal__primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

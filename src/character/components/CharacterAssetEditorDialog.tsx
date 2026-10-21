import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "../../ui/EditorIcon";
import { useCharacterAssetAuthoring } from "../application/CharacterAssetLibraryProvider";
import type { AvatarMaskAsset } from "../domain/avatar-mask";
import { AvatarMaskEditor } from "./AvatarMaskEditor";
import { characterAssetHistoryCommand } from "./character-assets-keyboard";
import "./CharacterAssetEditorDialog.css";

const DIALOG_BUTTON_CLASS = "ghost-button compact";

export type CharacterAssetEditorSelection = Readonly<{
  id: string;
}>;

type CharacterAssetEditorDialogProps = Readonly<{
  selection: CharacterAssetEditorSelection;
  onClose: () => void;
}>;

/** Edits a reusable Project Avatar Mask in a focused modal workspace. */
export function CharacterAssetEditorDialog({ selection, onClose }: CharacterAssetEditorDialogProps) {
  const authoring = useCharacterAssetAuthoring();
  const panelRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
  const mask = authoring.avatarMasks.find((asset) => asset.id === selection.id);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      }, 0);
    };
  }, []);
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const perform = (operation: () => void) => {
    try {
      operation();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const commitMask = (next: AvatarMaskAsset) => perform(() => {
    if (!mask) return;
    authoring.updateMask(mask.id, mask.revision, {
      name: next.name,
      sourceRef: next.sourceRef,
      humanoidBodyParts: next.humanoidBodyParts,
      transforms: next.transforms,
      extensions: next.extensions,
    });
  });
  const handleHistoryKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const command = characterAssetHistoryCommand(event.nativeEvent);
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    if (command === "undo") authoring.undo();
    else authoring.redo();
  };
  const deleteCurrent = () => perform(() => {
    if (!mask || !window.confirm(`Delete '${mask.name}'?`)) return;
    authoring.removeMask(mask.id, mask.revision);
    onClose();
  });
  const assetName = mask?.name ?? "Missing asset";

  return createPortal(
    <div className="character-asset-dialog" role="dialog" aria-modal="true" aria-labelledby="character-asset-dialog-title">
      <section
        ref={panelRef}
        className="character-asset-dialog__panel"
        tabIndex={-1}
        onKeyDown={handleHistoryKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        <header className="character-asset-dialog__header">
          <span className="character-asset-dialog__icon">
            <EditorIcon name="avatar" size="control" />
          </span>
          <div>
            <small>ANIMATION / AVATAR MASK</small>
            <strong id="character-asset-dialog-title">{assetName}</strong>
          </div>
          <span className="character-asset-dialog__sync" data-phase={authoring.hydrationPhase}>
            {authoring.hydrationPhase === "ready" ? "Project synced" : `Project ${authoring.hydrationPhase}`}
          </span>
          <button type="button" className={DIALOG_BUTTON_CLASS} disabled={!authoring.canUndo} onClick={authoring.undo}>Undo</button>
          <button type="button" className={DIALOG_BUTTON_CLASS} disabled={!authoring.canRedo} onClick={authoring.redo}>Redo</button>
          <button type="button" className={DIALOG_BUTTON_CLASS} onClick={onClose}>
            <EditorIcon name="close" size="control" /> Close
          </button>
        </header>
        {error && <div className="character-asset-dialog__error" role="alert">{error}</div>}
        <main className="character-asset-dialog__body">
          {mask && <AvatarMaskEditor mask={mask} onChange={commitMask} onDelete={deleteCurrent} />}
          {!mask && (
            <div className="character-asset-dialog__empty" role="status">
              <h3>Asset no longer exists</h3>
              <p>Close this workspace and choose another Project asset.</p>
            </div>
          )}
        </main>
      </section>
    </div>,
    document.body,
  );
}

export default CharacterAssetEditorDialog;

import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { hasExternalFiles } from "./drag";

type ModelFolderImportModalProps = {
  busy: boolean;
  dropActive: boolean;
  onDropActive: (active: boolean) => void;
  onChooseFiles: () => void;
  onDrop: (dataTransfer: DataTransfer) => void;
  onClose: () => void;
};

export function ModelFolderImportModal({
  busy,
  dropActive,
  onDropActive,
  onChooseFiles,
  onDrop,
  onClose,
}: ModelFolderImportModalProps) {
  return (
    <div className="confirm-modal folder-import-modal" role="dialog" aria-modal="true" aria-labelledby="folder-import-title">
      <div className="confirm-modal__backdrop" onClick={onClose} />
      <div className="confirm-modal__panel folder-import-modal__panel" onContextMenu={(event) => event.preventDefault()}>
        <div className="confirm-modal__head">
          <EditorIcon name={assetIconNames.folder} size="control" className="confirm-modal__icon" />
          <strong id="folder-import-title">Import model folder</strong>
        </div>
        <div
          className={`folder-import-modal__drop ${dropActive ? "active" : ""}`}
          onDragOver={(event) => {
            if (!hasExternalFiles(event.dataTransfer)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            onDropActive(true);
          }}
          onDragLeave={() => onDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDrop(event.dataTransfer);
          }}
        >
          <EditorIcon name="upload" size="hero" />
          <strong>{busy ? "Importing..." : "Drop a model folder here"}</strong>
          <span>Folders are read locally and imported into the project library.</span>
        </div>
        <div className="confirm-modal__actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="ghost-button confirm-modal__primary" onClick={onChooseFiles} disabled={busy}>
            Choose files...
          </button>
        </div>
      </div>
    </div>
  );
}

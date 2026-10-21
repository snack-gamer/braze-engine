import type { RefObject } from "react";
import type { SceneObject } from "../types";
import { EditorIcon } from "../ui/EditorIcon";

type SequencerTrackMenuProps = Readonly<{
  menuRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  selectedObject: SceneObject | null;
  onToggle: () => void;
  onAddObjectTrack: (kind: "animation" | "activation") => void;
}>;

/** Object-aware track creation menu. */
export function SequencerTrackMenu({
  menuRef,
  open,
  selectedObject,
  onToggle,
  onAddObjectTrack,
}: SequencerTrackMenuProps) {
  return (
    <div className="prime-sequencer__side prime-sequencer__side--toolbar" ref={menuRef}>
      <button
        type="button"
        className="ghost-button prime-sequencer__track-menu-button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <EditorIcon name="add" size="control" />
        Track
        <EditorIcon name="disclosureOpen" size="compact" />
      </button>
      {open && (
        <div className="prime-sequencer__track-menu" role="menu">
          <button type="button" role="menuitem" disabled={!selectedObject} onClick={() => onAddObjectTrack("animation")}>
            <strong>{selectedObject?.primitive === "camera" ? "Selected Camera" : "Selected Object"}</strong>
            <span>{selectedObject?.name ?? "Select an object first"}</span>
          </button>
          <button type="button" role="menuitem" disabled={!selectedObject} onClick={() => onAddObjectTrack("activation")}>
            <strong>Visibility Track</strong>
            <span>{selectedObject ? `Enable/disable ${selectedObject.name}` : "Select an object first"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

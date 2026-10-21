import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EditorPrefs, TransformMode } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";

type SceneViewToolbarProps = {
  transformMode: TransformMode;
  disabled: boolean;
  onTransformModeChange: (mode: TransformMode) => void;
  onFrameSelection: () => void;
};

type SceneViewSettingsToolbarProps = Pick<EditorPrefs,
  | "transformSpace"
  | "transformSnapping"
  | "translationSnap"
  | "rotationSnapDegrees"
  | "scaleSnap"
> & {
  transformMode: TransformMode;
  disabled: boolean;
  forceLocalSpace: boolean;
  onPrefsChange: (patch: Partial<EditorPrefs>) => void;
  trailingControls?: ReactNode;
};

const TOOLS = [
  { mode: "translate", label: "Move", shortcut: "T", icon: "transformMove" },
  { mode: "rotate", label: "Rotate", shortcut: "R", icon: "transformRotate" },
  { mode: "scale", label: "Scale", shortcut: "S", icon: "transformScale" },
] as const;

/** Viewport-local tools stay near the canvas because they operate on its
 * selection. View settings live in SceneViewSettingsToolbar in the pane bar. */
export function SceneViewToolbar({
  transformMode,
  disabled,
  onTransformModeChange,
  onFrameSelection,
}: SceneViewToolbarProps) {
  return (
    <div className="scene-tool-rail" role="toolbar" aria-label="Scene transform tools">
      {TOOLS.map(({ mode, label, shortcut, icon }) => (
        <button
          key={mode}
          type="button"
          className={transformMode === mode ? "icon-button active" : "icon-button"}
          aria-label={`${label} tool`}
          aria-pressed={transformMode === mode}
          title={`${label} tool (${shortcut})`}
          disabled={disabled}
          onClick={() => onTransformModeChange(mode)}
        >
          <EditorIcon name={icon} size="toolbar" />
        </button>
      ))}
      <span className="scene-tool-rail__divider" aria-hidden="true" />
      <button
        type="button"
        className="icon-button"
        aria-label="Frame selected object"
        title="Frame selected object (F)"
        disabled={disabled}
        onClick={onFrameSelection}
      >
        <EditorIcon name="frameSelection" size="toolbar" />
      </button>
    </div>
  );
}
/** Scene-wide view settings belong in the pane header, not over authored
 * pixels. Dock chrome owns their placement without moving the canvas. */
export function SceneViewSettingsToolbar({
  transformMode,
  transformSpace,
  transformSnapping,
  translationSnap,
  rotationSnapDegrees,
  scaleSnap,
  disabled,
  forceLocalSpace,
  onPrefsChange,
  trailingControls,
}: SceneViewSettingsToolbarProps) {
  const snapRootRef = useRef<HTMLDivElement | null>(null);
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);

  useEffect(() => {
    if (!snapMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!snapRootRef.current?.contains(event.target as Node)) setSnapMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSnapMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [snapMenuOpen]);

  const updatePositiveNumber = (
    key: "translationSnap" | "rotationSnapDegrees" | "scaleSnap",
    raw: string,
  ) => {
    const value = Number(raw);
    const maximum = key === "rotationSnapDegrees" ? 180 : key === "scaleSnap" ? 10 : 100;
    if (Number.isFinite(value) && value > 0) onPrefsChange({ [key]: Math.min(value, maximum) });
  };
  const activeSnap = transformMode === "translate"
    ? `${translationSnap} m`
    : transformMode === "rotate"
      ? `${rotationSnapDegrees}°`
      : `${scaleSnap}`;
  const spaceLocked = transformMode === "scale" || forceLocalSpace;
  const effectiveSpace = spaceLocked ? "local" : transformSpace;

  return (
    <div className="scene-view-settings-toolbar" role="toolbar" aria-label="Scene view settings">
      <button
        type="button"
        className="ghost-button scene-view-settings-toolbar__space"
        aria-label={`Transform handle space: ${effectiveSpace === "world" ? "Global" : "Local"}`}
        title={spaceLocked ? "Scale and component handles use Local space" : "Toggle Global / Local transform handles"}
        disabled={disabled || spaceLocked}
        onClick={() => onPrefsChange({ transformSpace: transformSpace === "world" ? "local" : "world" })}
      >
        <EditorIcon name="transformSpace" size="control" />
        <span>{effectiveSpace === "world" ? "Global" : "Local"}</span>
      </button>

      <span className="scene-view-settings-toolbar__divider" aria-hidden="true" />

      <div ref={snapRootRef} className="scene-snap-control">
        <button
          type="button"
          className={transformSnapping ? "ghost-button active scene-snap-control__toggle" : "ghost-button scene-snap-control__toggle"}
          aria-label="Transform snapping"
          aria-pressed={transformSnapping}
          title={`Transform snapping (${activeSnap})`}
          disabled={disabled}
          onClick={() => onPrefsChange({ transformSnapping: !transformSnapping })}
        >
          <EditorIcon name="snapping" size="control" />
          <span>{activeSnap}</span>
        </button>
        <button
          type="button"
          className={snapMenuOpen ? "icon-button narrow active scene-snap-control__menu-button" : "icon-button narrow scene-snap-control__menu-button"}
          aria-label="Transform snap settings"
          aria-haspopup="dialog"
          aria-expanded={snapMenuOpen}
          title="Transform snap settings"
          disabled={disabled}
          onClick={() => setSnapMenuOpen((open) => !open)}
        >
          <EditorIcon name="disclosureOpen" size="compact" />
        </button>

        {snapMenuOpen && (
          <div className="scene-snap-menu" role="dialog" aria-label="Transform snap settings">
            <header>Snap increments</header>
            <label>
              <span>Move</span>
              <input
                className="editor-input"
                type="number"
                aria-label="Move snap increment"
                min={0.001}
                step={0.1}
                value={translationSnap}
                onChange={(event) => updatePositiveNumber("translationSnap", event.target.value)}
              />
              <em>m</em>
            </label>
            <label>
              <span>Rotate</span>
              <input
                className="editor-input"
                type="number"
                aria-label="Rotation snap increment"
                min={1}
                max={180}
                step={1}
                value={rotationSnapDegrees}
                onChange={(event) => updatePositiveNumber("rotationSnapDegrees", event.target.value)}
              />
              <em>°</em>
            </label>
            <label>
              <span>Scale</span>
              <input
                className="editor-input"
                type="number"
                aria-label="Scale snap increment"
                min={0.001}
                step={0.05}
                value={scaleSnap}
                onChange={(event) => updatePositiveNumber("scaleSnap", event.target.value)}
              />
              <em>×</em>
            </label>
            <small>Component edit handles stay unsnapped for precision.</small>
          </div>
        )}
      </div>

      {trailingControls && (
        <>
          <span className="scene-view-settings-toolbar__divider" aria-hidden="true" />
          {trailingControls}
        </>
      )}
    </div>
  );
}

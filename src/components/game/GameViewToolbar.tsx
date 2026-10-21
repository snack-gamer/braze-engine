import { useEffect, useRef, useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { EditorRange } from "../../ui/controls/EditorRange";
import type { ScenePlaybackMode } from "../../types";
import type { GameViewAspectPreset } from "./game-view-aspect";
import {
  customGameViewResolutionError,
  MAX_CUSTOM_RESOLUTION_DIMENSION,
} from "./game-view-aspect";

type GameViewToolbarProps = {
  cameras: Array<{ id: string; name: string }>;
  activeCameraId: string;
  aspectPresets: GameViewAspectPreset[];
  activeAspectPresetId: string;
  lowResolution: boolean;
  scale: number;
  showStats: boolean;
  scenePlaybackMode: ScenePlaybackMode;
  onActiveCameraChange: (cameraId: string) => void;
  onAspectPresetChange: (presetId: string) => void;
  onLowResolutionChange: (enabled: boolean) => void;
  onAddCustomResolution: (width: number, height: number) => void;
  onScaleChange: (scale: number) => void;
  onToggleStats: () => void;
};

/** Unity-style Game-view controls belong to the dock header so every pixel
 * below remains part of the final output/input surface. */
export function GameViewToolbar({
  cameras,
  activeCameraId,
  aspectPresets,
  activeAspectPresetId,
  lowResolution,
  scale,
  showStats,
  scenePlaybackMode,
  onActiveCameraChange,
  onAspectPresetChange,
  onLowResolutionChange,
  onAddCustomResolution,
  onScaleChange,
  onToggleStats,
}: GameViewToolbarProps) {
  const aspectRootRef = useRef<HTMLDivElement | null>(null);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [addingResolution, setAddingResolution] = useState(false);
  const [customWidth, setCustomWidth] = useState("1920");
  const [customHeight, setCustomHeight] = useState("1080");
  const [customResolutionError, setCustomResolutionError] = useState("");
  const activePreset = aspectPresets.find((preset) => preset.id === activeAspectPresetId) ?? aspectPresets[0];

  useEffect(() => {
    if (!aspectMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!aspectRootRef.current?.contains(event.target as Node)) setAspectMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAspectMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [aspectMenuOpen]);

  const addResolution = () => {
    const width = Number(customWidth);
    const height = Number(customHeight);
    const error = customGameViewResolutionError(width, height);
    if (error) {
      setCustomResolutionError(error);
      return;
    }
    onAddCustomResolution(width, height);
    setCustomResolutionError("");
    setAddingResolution(false);
  };

  return (
    <div className="game-view-toolbar" role="toolbar" aria-label="Game view controls">
      <label className="game-view-toolbar__camera" title="Camera rendered by the Game view">
        <EditorIcon name="display" size="control" />
        <select
          className="editor-select"
          aria-label="Game view camera"
          value={activeCameraId}
          disabled={cameras.length === 0}
          onChange={(event) => onActiveCameraChange(event.target.value)}
        >
          {cameras.length === 0
            ? <option value="">No Camera</option>
            : cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
        </select>
      </label>

      <div ref={aspectRootRef} className="game-view-aspect">
        <button
          type="button"
          className={aspectMenuOpen ? "ghost-button active game-view-aspect__trigger" : "ghost-button game-view-aspect__trigger"}
          aria-label="Game view aspect ratio and resolution"
          aria-haspopup="menu"
          aria-expanded={aspectMenuOpen}
          title="Game view aspect ratio and resolution"
          onClick={() => setAspectMenuOpen((open) => !open)}
        >
          <span>{activePreset?.label ?? "Free Aspect"}</span>
          <EditorIcon name="disclosureOpen" size="compact" />
        </button>

        {aspectMenuOpen && (
          <div className="game-view-aspect__menu" role="menu" aria-label="Game view aspect ratios and resolutions">
            <button
              type="button"
              className="game-view-aspect__item game-view-aspect__setting"
              role="menuitemcheckbox"
              aria-checked={lowResolution}
              onClick={() => onLowResolutionChange(!lowResolution)}
            >
              <span className="game-view-aspect__check">
                {lowResolution && <EditorIcon name="check" size="compact" />}
              </span>
              <span>Low Resolution Aspect Ratios</span>
            </button>
            <button
              type="button"
              className="game-view-aspect__item game-view-aspect__setting"
              role="menuitemcheckbox"
              aria-checked="true"
              disabled
              title="Browser Game view rendering is synchronized by requestAnimationFrame"
            >
              <span className="game-view-aspect__check"><EditorIcon name="check" size="compact" /></span>
              <span>VSync (Game view only)</span>
            </button>

            <div className="game-view-aspect__separator" role="separator" />

            <div className="game-view-aspect__presets">
              {aspectPresets.map((preset) => (
                <div key={preset.id} className={preset.id === "portrait-1080-1920" ? "game-view-aspect__preset-break" : undefined}>
                  <button
                    type="button"
                    className="game-view-aspect__item"
                    role="menuitemradio"
                    aria-checked={preset.id === activeAspectPresetId}
                    onClick={() => {
                      onAspectPresetChange(preset.id);
                      setAspectMenuOpen(false);
                    }}
                  >
                    <span className="game-view-aspect__check">
                      {preset.id === activeAspectPresetId && <EditorIcon name="check" size="compact" />}
                    </span>
                    <span>{preset.label}</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="game-view-aspect__separator" role="separator" />

            {addingResolution ? (
              <div className="game-view-aspect__add-form">
                <input
                  className="editor-input"
                  type="number"
                  min={32}
                  max={MAX_CUSTOM_RESOLUTION_DIMENSION}
                  aria-label="Custom resolution width"
                  value={customWidth}
                  onChange={(event) => {
                    setCustomWidth(event.target.value);
                    setCustomResolutionError("");
                  }}
                  onKeyDown={(event) => { if (event.key === "Enter") addResolution(); }}
                />
                <span>×</span>
                <input
                  className="editor-input"
                  type="number"
                  min={32}
                  max={MAX_CUSTOM_RESOLUTION_DIMENSION}
                  aria-label="Custom resolution height"
                  value={customHeight}
                  onChange={(event) => {
                    setCustomHeight(event.target.value);
                    setCustomResolutionError("");
                  }}
                  onKeyDown={(event) => { if (event.key === "Enter") addResolution(); }}
                />
                <button type="button" className="ghost-button compact accent" onClick={addResolution}>Add</button>
                {customResolutionError && <small role="alert">{customResolutionError}</small>}
              </div>
            ) : (
              <button
                type="button"
                className="icon-button compact game-view-aspect__add"
                aria-label="Add custom resolution"
                title="Add custom resolution"
                onClick={() => setAddingResolution(true)}
              >
                <EditorIcon name="add" size="control" />
              </button>
            )}
          </div>
        )}
      </div>

      <label className="game-view-toolbar__scale" title={`Preview scale ${scale.toFixed(1)}×`}>
        <span>Scale</span>
        <EditorRange
          aria-label="Game preview scale"
          min={0.5}
          max={1.5}
          step={0.1}
          value={scale}
          onChange={(event) => onScaleChange(Number(event.target.value))}
        />
        <output>{scale.toFixed(1)}×</output>
      </label>

      <span
        className={`game-view-toolbar__runtime is-${scenePlaybackMode}`}
        role="status"
        aria-label={`Game view mode: ${scenePlaybackMode}`}
      >
        {scenePlaybackMode}
      </span>

      <button
        type="button"
        className={showStats ? "ghost-button active game-view-toolbar__stats" : "ghost-button game-view-toolbar__stats"}
        aria-label="Toggle Game view statistics"
        aria-pressed={showStats}
        title="Toggle Game view statistics"
        onClick={onToggleStats}
      >
        <EditorIcon name="statistics" size="control" />
        <span>Stats</span>
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { GRID_HORIZON_MAX, GRID_HORIZON_MIN, type EditorPrefs } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { GridSettingsFields } from "../../ui/GridSettingsControls";
import { EditorCheckbox, EditorRange } from "../../ui/controls";

type GizmosMenuProps = Pick<EditorPrefs,
  | "showGrid"
  | "showGizmos"
  | "showObjectLabels"
  | "showCameraGizmos"
  | "transformGizmoSize"
  | "gridOpacity"
  | "gridColor"
  | "gridHorizon"
> & {
  onChange: (patch: Partial<EditorPrefs>) => void;
};

export function GizmosMenu({
  showGrid,
  showGizmos,
  showObjectLabels,
  showCameraGizmos,
  transformGizmoSize,
  gridOpacity,
  gridColor,
  gridHorizon,
  onChange,
}: GizmosMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="gizmos-menu">
      <button
        type="button"
        className={`ghost-button gizmos-menu__trigger ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Gizmo and grid settings"
      >
        <EditorIcon name="gizmos" size="control" />
        <span>Gizmos</span>
        <EditorIcon name="disclosureOpen" size="compact" />
      </button>

      {open && (
        <div className="gizmos-menu__panel" role="dialog" aria-label="Gizmo and grid settings">
          <header>Scene Gizmos</header>

          <label className="gizmos-menu__toggle">
            <EditorCheckbox
              checked={showGizmos}
              onChange={(event) => onChange({ showGizmos: event.target.checked })}
            />
            <span>Show scene handles</span>
          </label>

          <div className="gizmos-menu__suboptions">
            <label className="gizmos-menu__toggle">
              <EditorCheckbox
                checked={showObjectLabels}
                disabled={!showGizmos}
                onChange={(event) => onChange({ showObjectLabels: event.target.checked })}
              />
              <span>Object labels</span>
            </label>

            <label className="gizmos-menu__toggle">
              <EditorCheckbox
                checked={showCameraGizmos}
                disabled={!showGizmos}
                onChange={(event) => onChange({ showCameraGizmos: event.target.checked })}
              />
              <span>Camera guides</span>
            </label>

            <label className="gizmos-menu__row">
              <span>Size</span>
              <EditorRange
                aria-label="Transform gizmo size"
                min={0.45}
                max={1.4}
                step={0.05}
                value={transformGizmoSize}
                disabled={!showGizmos}
                onChange={(event) => onChange({ transformGizmoSize: Number(event.target.value) })}
              />
              <output>{transformGizmoSize.toFixed(2)}</output>
            </label>
          </div>

          <GridSettingsFields
            visible={showGrid}
            opacity={gridOpacity}
            onVisibleChange={(visible) => onChange({ showGrid: visible })}
            onOpacityChange={(opacity) => onChange({ gridOpacity: opacity })}
          >
            <label className="grid-settings-fields__row">
              <span>Color</span>
              <input
                type="color"
                aria-label="Grid color"
                value={gridColor}
                disabled={!showGrid}
                onChange={(event) => onChange({ gridColor: event.target.value })}
              />
              <output>{gridColor}</output>
            </label>

            <label className="grid-settings-fields__row">
              <span>Horizon</span>
              <EditorRange
                aria-label="Grid horizon"
                min={GRID_HORIZON_MIN}
                max={GRID_HORIZON_MAX}
                step={2}
                value={gridHorizon}
                disabled={!showGrid}
                onChange={(event) => onChange({ gridHorizon: Number(event.target.value) })}
              />
              <output>{Math.round(gridHorizon)}</output>
            </label>
          </GridSettingsFields>
        </div>
      )}
    </div>
  );
}
